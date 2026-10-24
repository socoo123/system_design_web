"""Independent inputs invoking the actual Ch25 SQLite adapter read-only."""
import sys
sys.dont_write_bytecode=True
from pathlib import Path
import concurrent.futures
import hashlib
import importlib.util
import json
import math
from fractions import Fraction
import tempfile
import threading
import time

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('ch25_review_model',ROOT/'examples/ch25/model.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
Scheduler,OrderStore,Sink=mod.Scheduler,mod.OrderStore,mod.Sink
result=dict(source=hashlib.sha256((ROOT/'examples/ch25/model.py').read_bytes()).hexdigest(),checks=[],findings=[],trace={})
def check(name, value):
    result['checks'].append(dict(name=name,passed=bool(value)))
    if not value:raise AssertionError(name)
def raises(name,fn):
    try:fn()
    except RuntimeError:check(name,True)
    else:check(name,False)

with tempfile.TemporaryDirectory(prefix='ch25-independent-') as folder:
    folder=Path(folder)
    serial=0
    def fresh(**kwargs):
        global serial
        serial+=1;p=folder/f's-{serial}.db';s=Scheduler(p);s.initialize();s.add(**kwargs);return p,s
    p,s=fresh(fire=100,interval=None,key='close:own-order',payload={'order_id':'own-order'})
    s.set_time(100);ids=s.materialize(hint=('j7',1,100));token=s.claim(ids[0],'review-normal')
    o=OrderStore(folder/'order.db');o.initialize();o.add(order='own-order',deadline=100);o.set_time(100)
    business=o.close_order('t1','close:own-order',order='own-order')
    check('T1 -> claim -> Order T2 -> complete',business=='CLOSED' and s.transition(ids[0],'complete','review-normal',token['generation'],business)=='OK')
    check('one-shot cursor is exhausted',s.db.execute('SELECT next_at FROM job').fetchone()[0] is None)
    check('repeated business result leaves one journaled event',o.close_order('t1','close:own-order',order='own-order')=='CLOSED' and o.db.execute('SELECT count(*) FROM outbox').fetchone()[0]==1)
    sink=Sink(folder/'sink.db');sink.initialize()
    raises('send before checkpoint loses ACK',lambda:o.relay(sink,lose_ack=True))
    o.relay(sink)
    check('real receiving DB has one effect after replay',sink.db.execute('SELECT count(*) FROM effect').fetchone()[0]==1)

    p,a=fresh(interval=None,key='close:unknown',payload={'order_id':'unknown'});rid=a.materialize()[0];ta=a.claim(rid,'old-worker');a.set_time(30000)
    tb=a.claim(rid,'new-worker')
    check('takeover at equality increments generation',tb['generation']==ta['generation']+1 and tb['attempts']==2)
    check('old completion is rejected',a.transition(rid,'complete','old-worker',ta['generation'],'CLOSED')=='STALE')
    check('old timeout is rejected',a.transition(rid,'timeout','old-worker',ta['generation'])=='STALE')
    check('unknown outcome retained by new owner',a.run(rid)['effect_unknown']==1)
    a.transition(rid,'timeout','new-worker',tb['generation']);after=a.run(rid)
    check('timeout retains original business identity',after['state']=='retry_wait' and after['effect_key']==ta['effect_key'] and after['effect_unknown']==1)
    a.set_time(after['retry_at']);tc=a.claim(rid,'recovered-worker')
    # Independent Order T2 has already committed: ignore that reply, then query it.
    o.add(order='unknown',deadline=0);reply=o.close_order('t1','close:unknown',order='unknown')
    replay=o.close_order('t1','close:unknown',order='unknown')
    check('unknown T2 reply resolves to original committed result',reply==replay=='CLOSED')
    check('only current scheduler generation completes',a.transition(rid,'complete','recovered-worker',tc['generation'],replay)=='OK')
    check('late timeout cannot regress succeeded',a.transition(rid,'timeout','recovered-worker',tc['generation'])=='STALE' and a.run(rid)['state']=='succeeded')

    # Prove an actual connection waits, then samples the advanced persisted clock.
    p,w=fresh(interval=None);rid=w.materialize()[0];tw=w.claim(rid,'waiter')
    w.db.execute('BEGIN IMMEDIATE');w.db.execute('UPDATE fixture_clock SET ms=30001')
    started=threading.Event()
    def waiter():
        z=Scheduler(p);started.set()
        try:return z.transition(rid,'complete','waiter',tw['generation'],'CLOSED')
        finally:z.close()
    with concurrent.futures.ThreadPoolExecutor(1) as pool:
        f=pool.submit(waiter);started.wait(2);time.sleep(.03)
        check('completion connection is actually blocked',not f.done());w.db.execute('COMMIT')
        check('post-lock clock rejects expired completion',f.result()=='STALE')

    p,c=fresh(interval=None);rid=c.materialize()[0];t=c.claim(rid,'cancelled-owner')
    c.transition(rid,'cancel');c.set_time(30001);c.transition(rid,'reap')
    check('cancelled running unknown remains review rather than unstarted',c.run(rid)['state']=='review' and c.run(rid)['effect_unknown']==1)
    p,r=fresh(interval=None);rid=r.materialize()[0]
    for i in range(5):
        if i:r.set_time(r.run(rid)['retry_at'])
        t=r.claim(rid,'attempt-'+str(i));r.transition(rid,'timeout',t['owner'],t['generation'])
    check('five claims exhaust one persistent run',r.run(rid)['attempts']==5 and r.run(rid)['state']=='review' and r.claim(rid,'sixth') is None)

    # New arbitrary phase, paged tail, moving clock, and all three policies.
    phase=17000;step=45000;now=phase+101*step
    for policy in ['skip','coalesce','catch_up']:
        p,m=fresh(fire=phase,interval=step,policy=policy,lateness_ms=0);m.set_time(now)
        first=m.recover('j7')
        if policy=='catch_up':
            check('new 45s-phase first page has 100 stable identities',len(first)==100 and m.db.execute('SELECT cutoff FROM job').fetchone()[0]==now)
            m.set_time(now+1234);tail=m.recover('j7')
            check('101st pinned occurrence completes despite later now',len(tail)==1)
        got=[row['fire'] for row in m.runs()]
        expected=[] if policy=='skip' else [now-step] if policy=='coalesce' else list(range(phase,now,step))
        check('original 17s/45s phase '+policy,got==expected)
        check('live cursor retained '+policy,m.db.execute('SELECT next_at,cutoff FROM job').fetchone()[:]==(now,None))

    # This is a correctness comparison, not a copied author check: materialize
    # explicitly uses a 60s tolerance but initial recover currently ignores it.
    p,m=fresh(policy='skip');m.set_time(90000);m.recover('j7')
    recovery=dict(m.db.execute('SELECT next_at,cutoff FROM job').fetchone())
    p,n=fresh(policy='skip');n.set_time(90000)
    with n.tx():n.db.execute('UPDATE job SET next_at=60000')
    normal=[n.run(rid)['fire'] for rid in n.materialize()]
    result['trace']['misfireTolerance']=dict(recovery=recovery,normalMaterializes=normal,
        audit=[dict(x) for x in m.db.execute('SELECT * FROM audit')])
    if recovery['next_at']>60000 and normal==[60000]:
        result['findings'].append(dict(level='P1',location='examples/ch25/model.py:124,142',
            issue='materialize uses 60s lateness tolerance, recovery skips a 30s-late live fire',
            counterexample='fire0, interval60s, policy skip, now90s => skip[0,120s); normal path can materialize60s'))
    else:
        check('original P1 leaves 60s live cursor after skip',recovery['next_at']==60000)
        check('original P1 live fire can run after recovery',[m.run(rid)['fire'] for rid in m.materialize()]==[60000])

    # Same published threshold on both paths: one millisecond before, equal,
    # and one millisecond after. Include a shifted, non-minute phase.
    for policy in ['skip','coalesce','catch_up']:
        for delta in [-1,0,1]:
            p,m=fresh(fire=17000,interval=45000,policy=policy,lateness_ms=60000)
            m.set_time(17000+60000+delta);recovered=m.recover('j7')
            expected=[] if delta<=0 or policy=='skip' else [17000]
            check(f'60s tolerance missed boundary {policy}/{delta}',[m.run(x)['fire'] for x in recovered]==expected)
            cursor=m.db.execute('SELECT next_at FROM job').fetchone()[0]
            check(f'60s tolerance live cursor {policy}/{delta}',cursor==(17000 if delta<=0 else 62000))
            check(f'normal and recovery share 60s boundary {policy}/{delta}',[m.run(x)['fire'] for x in m.materialize()]==[cursor])
    p,m=fresh(fire=30000,interval=60000,policy='coalesce',lateness_ms=60000)
    m.set_time(180000);m.recover('j7')
    check('nonzero tolerance preserves shifted live150/coalesce90',m.db.execute('SELECT next_at FROM job').fetchone()[0]==150000 and [x['fire'] for x in m.runs()]==[90000])
    p,m=fresh(fire=17000,interval=45000,policy='catch_up',lateness_ms=60000)
    cutoff=17000+101*45000;m.set_time(cutoff+60000);m.recover('j7')
    m.set_time(cutoff+60000+10*45000)
    tail=m.recover('j7')
    check('pinned tail remains one occurrence under moving now',len(tail)==1 and m.db.execute('SELECT next_at,cutoff FROM job').fetchone()[:]==(cutoff,None))
    more=m.recover('j7')
    check('next recovery pass processes subsequent missed fires',len(more)==10)

    p,b=fresh(fire=1000,interval=None);b.set_time(1000)
    raises('new T1 crash probe aborts run and cursor',lambda:b.materialize(fail=True))
    check('T1 rollback leaves original due cursor',not b.runs() and b.db.execute('SELECT next_at FROM job').fetchone()[0]==1000)
    e=OrderStore(folder/'early.db');e.initialize();e.add(order='early',deadline=1000)
    check('early wake does not save a terminal receipt',e.close_order('t1','close:early',order='early')=='RETRY_AT' and e.db.execute('SELECT count(*) FROM inbox').fetchone()[0]==0)
    e.set_time(1000)
    raises('new T2 crash input rolls back event and receipt',lambda:e.close_order('t1','close:early',order='early',fail=True))
    check('T2 rollback has no closed order',e.db.execute('SELECT state FROM orders').fetchone()[0]=='UNPAID' and e.db.execute('SELECT count(*) FROM inbox').fetchone()[0]==0)
    check('deadline closes after uncached early retry',e.close_order('t1','close:early',order='early')=='CLOSED')
    check('changed canonical payload conflicts',e.close_order('t1','close:early',order='early',payload={'action':'close','order_id':'other'})=='CONFLICT')

numeric={
 'average_per_second':Fraction(10000,60),'occupied_slots':Fraction(10000,60)*Fraction(1,5),
 'planned_slots':math.ceil(Fraction(10000,60)*Fraction(1,5)/Fraction(3,5)),
 'rounds':math.ceil(Fraction(10000,56)),'seconds':math.ceil(Fraction(10000,56))*Fraction(1,5),
 'five_second_ideal_slots':400,'five_second_planned_slots':math.ceil(Fraction(400,1)/Fraction(3,5)),
 'raw_run_bytes':10000*1440*200*7,'replica_run_bytes':10000*1440*200*7*3,
 'definition_bytes':10000*1000,'missed':10*120,'spare_rate':100-80,'ideal_drain':Fraction(10*120,100-80),
 'wheel_rounds':1800//60,'wheel_slot':1800%60}
check('discrete burst recomputed',numeric['planned_slots']==56 and numeric['rounds']==179 and numeric['seconds']==Fraction(179,5))
check('storage/recovery recomputed',numeric['raw_run_bytes']==20160000000 and numeric['replica_run_bytes']==60480000000 and numeric['ideal_drain']==60)
result['numeric']={k:str(v) for k,v in numeric.items()}
result['passed']=all(c['passed'] for c in result['checks']) and not result['findings']
output=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'docs/reviews/ch25-independent-probe-results.json'
output.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(dict(passed=result['passed'],checks=len(result['checks']),findings=result['findings'])))
