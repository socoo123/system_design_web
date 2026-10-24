#!/usr/bin/env python3
"""New inputs directly exercise actual Ch21 Model/SQL, without author check.py outputs."""
import sys
sys.dont_write_bytecode=True
from pathlib import Path
import importlib.util
import hashlib
import json
import sqlite3
import subprocess
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from fractions import Fraction

ROOT=Path(__file__).resolve().parents[2]
SRC=ROOT/'examples/ch21'
spec=importlib.util.spec_from_file_location('review_ch21_actual',SRC/'model.py')
actual=importlib.util.module_from_spec(spec);spec.loader.exec_module(actual)
checks=[]
def check(ok,name):
    if not ok: raise AssertionError(name)
    checks.append(name)
def rejects(action,name,reason=None):
    try:action()
    except actual.Rejected as error:check(reason is None or reason==str(error),name)
    else:raise AssertionError(name+' did not reject')
def scalar(model,sql,args=()):
    with model.connect() as con:return con.execute(sql,args).fetchone()[0]
class Clock:
    value=7300
    def __call__(self):return self.value
clock=Clock()
nights=['2027-05-04','2027-05-05','2027-05-06']
def intent(scope='hotel-review',q=1,order='order-review',dates=None):
    return dict(scope=scope,items=[[d,q] for d in (nights if dates is None else dates)],order_id=order,policy_version='review-policy-3')
with tempfile.TemporaryDirectory(prefix='ch21-independent-model-') as temp:
    def model(name,stock,scope='hotel-review',gated=False):
        m=actual.Model(Path(temp)/(name+'.sqlite'),clock);m.initialize();m.seed(scope,stock,gated=gated);return m
    m=model('normal',dict(zip(nights,[4,2,3])))
    original=m.create('reader-normal','stay-17',intent(q=2))
    check(m.counts('hotel-review')==[(nights[0],2,2,0),(nights[1],0,2,0),(nights[2],1,2,0)],'new q2 three-night normal allocation')
    check(scalar(m,'SELECT count(*) FROM hold_items')==3,'normal writes complete ownership')
    check(m.create('reader-normal','stay-17',intent(q=2,dates=list(reversed(nights))))==original,'canonical resource order preserves same original receipt')
    for changed,label in [(intent(q=1),'quantity'),(intent(q=2,order='other-order'),'order'),(dict(intent(q=2),policy_version='other'),'policy'),(intent(q=2,dates=nights[:2]),'dates')]:
        rejects(lambda changed=changed:m.create('reader-normal','stay-17',changed),'changed '+label+' conflicts','identity_conflict')
    check(m.finish(original['hold_id'],'CONFIRM','reader-normal','order-review')=='CONFIRMED','new q2 confirm consumes own reservation')
    check(m.create('reader-normal','stay-17',intent(q=2))==original and m.query('reader-normal','stay-17')['current']['state']=='CONFIRMED','original HELD receipt immutable after terminal confirm')
    check(m.query('another-owner','stay-17') is None,'query identity does not cross owners')

    failed=model('all-or-none',dict(zip(nights,[4,2,3])))
    rejected=failed.create('reader-rejected','q3',intent(q=3))
    check(rejected['result']=='REJECTED' and failed.counts('hotel-review')==[(nights[0],4,0,0),(nights[1],2,0,0),(nights[2],3,0,0)],'q3 middle-night failure rolls back earlier night')
    check(scalar(failed,'SELECT count(*) FROM holds')==0 and scalar(failed,'SELECT count(*) FROM hold_items')==0,'rejection leaves no partial hold/items')
    check(failed.query('reader-rejected','q3')=={'original_receipt':rejected,'current':'REJECTED'},'ungated request rejection remains owner-queryable in authority')
    check(scalar(failed,'SELECT count(*) FROM deliveries d JOIN outbox o USING(event_id)')==0,'ungated holdless rejection has no fabricated asynchronous hold receiver')
    rejects(lambda:failed.create('reader-crash','fail-two',intent(),fail_after=2),'unexpected second-night failure aborts identity too','injected_abort')
    check(failed.query('reader-crash','fail-two') is None and failed.counts('hotel-review')[1][1]==2,'unexpected failure leaves no committed CLAIMED row or decrement')
    missing=failed.create('reader-missing','missing-last',intent(dates=nights[:2]+['2027-05-07']))
    check(missing['result']=='REJECTED' and scalar(failed,'SELECT count(*) FROM holds')==0,'missing last night rolls back complete interval')

    raced=model('race',dict(zip(nights,[3,2,4])))
    barrier=threading.Barrier(13)
    def reserve(i):barrier.wait();return raced.create('competitor-'+str(i),'attempt',intent(order='race-'+str(i)))
    with ThreadPoolExecutor(max_workers=13) as pool:receipts=list(pool.map(reserve,range(13)))
    check(sum(r['http']==201 for r in receipts)==2,'13 SQLite writers: middle-night cap2 permits exactly2 stays')
    check(raced.counts('hotel-review')==[(nights[0],1,2,0),(nights[1],0,2,0),(nights[2],2,2,0)],'competing three-night inventory conserved')

    owned=model('owned',dict(zip(nights,[2,2,2])))
    clock.value=9000;a=owned.create('owner-a','one',intent(order='o-a'))
    b=owned.create('owner-b','two',intent(order='o-b'))
    before=owned.counts('hotel-review')
    for owner,order,kind,label in [('owner-x','o-a','CONFIRM','owner'),('owner-a','o-x','CONFIRM','order'),('owner-a','o-a','CANCEL','kind')]:
        rejects(lambda owner=owner,order=order,kind=kind:owned.finish(a['hold_id'],kind,owner,order),'finish wrong '+label+' rejects')
    clock.value=9900
    check(owned.finish(a['hold_id'],'EXPIRE','owner-a','o-a')=='RELEASED','deadline equality permits expiry')
    c=owned.create('owner-c','three',intent(order='o-c'))
    reallocated=owned.counts('hotel-review')
    check(owned.finish(a['hold_id'],'CONFIRM','owner-a','o-a')=='RELEASED' and owned.counts('hotel-review')==reallocated,'late payment cannot seize reallocated other hold')
    check(owned.finish(a['hold_id'],'EXPIRE','owner-a','o-a')=='RELEASED' and owned.counts('hotel-review')==reallocated,'repeat release cannot restore other owners stock')
    rejects(lambda:owned.finish(b['hold_id'],'EXPIRE','owner-b','o-b',fail_after=2),'finish failure after second night rolls back whole terminal event','injected_abort')
    check(owned.counts('hotel-review')==reallocated and owned.query('owner-b','two')['current']['state']=='HELD','terminal failure keeps all allocations and HELD')
    owned.seed('foreign-review',dict(zip(nights,[2,2,2])))
    with owned.transaction() as con:con.execute('UPDATE hold_items SET scope=? WHERE hold_id=? AND resource=?',('foreign-review',b['hold_id'],nights[0]))
    rejects(lambda:owned.finish(b['hold_id'],'EXPIRE','owner-b','o-b'),'matching aggregate reserved cannot authorize foreign-scope item','ownership_mismatch')
    check(owned.counts('hotel-review')==reallocated and owned.query('owner-b','two')['current']['state']=='HELD','scope mismatch leaves state and counters unchanged')
    with owned.transaction() as con:con.execute('UPDATE hold_items SET scope=? WHERE hold_id=? AND resource=?',('hotel-review',b['hold_id'],nights[0]))

    # The thread really waits on SQLite's write lock; advance time while it waits.
    timed=model('lock-time',{'unit':1},scope='time-review')
    clock.value=12000;t=timed.create('time-owner','clock',intent('time-review',dates=['unit']))
    blocker=timed.connect();blocker.execute('BEGIN IMMEDIATE');clock.value=12899
    started=threading.Event()
    def timed_confirm():started.set();return timed.finish(t['hold_id'],'CONFIRM','time-owner','order-review')
    with ThreadPoolExecutor(max_workers=1) as pool:
        future=pool.submit(timed_confirm);check(started.wait(2),'confirm thread starts while lock held')
        time.sleep(.04);check(not future.done(),'confirm is blocked before authoritative clock sample')
        clock.value=12900;blocker.commit();blocker.close()
        check(future.result()=='EXPIRED_NOT_CONFIRMED','post-lock current time rejects equality deadline')
    check(timed.counts('time-review')==[('unit',0,1,0)],'refused expired confirmation leaves HELD until expiry')

    # An old CREATE rolls back its claimed identity; waiting cancellation then wins.
    cancelled=model('cancel-rollback',{'unit':3},scope='cancel-review')
    entered=threading.Event();release=threading.Event();cancel_started=threading.Event()
    ci=intent('cancel-review',q=2,dates=['unit'])
    def claim():entered.set();release.wait(3)
    def old_create():
        try:cancelled.create('cancel-owner','same',ci,after_claim=claim,fail_after=1)
        except actual.Rejected:return 'ROLLED_BACK'
    def cancel():cancel_started.set();return cancelled.resolve_or_cancel('cancel-owner','same',ci)
    with ThreadPoolExecutor(max_workers=2) as pool:
        old=pool.submit(old_create);check(entered.wait(2),'old create really claims identity')
        future=pool.submit(cancel);check(cancel_started.wait(2),'cancel contender starts')
        time.sleep(.04);check(not future.done(),'cancellation cannot bypass uncommitted identity')
        release.set();check(old.result()=='ROLLED_BACK' and future.result()['current']=='CANCELLED','rollback lets same-identity tombstone win')
    check(cancelled.create('cancel-owner','same',ci)['result']=='CANCELLED' and cancelled.counts('cancel-review')==[('unit',3,0,0)],'late create replays cancellation and never allocates')
    unknown=model('unknown-commit',{'unit':4},scope='unknown-review')
    ui=intent('unknown-review',2,'unknown-order',['unit'])
    try:unknown.create('unknown-owner','original-key',ui,ack_lost=True)
    except actual.UnknownCommit:check(True,'actual model commits then reports UNKNOWN response loss')
    else:raise AssertionError('unknown commit was not injected')
    known=unknown.query('unknown-owner','original-key')
    check(known['current']['state']=='HELD' and unknown.create('unknown-owner','original-key',ui)==known['original_receipt'],'same-identity retry recovers original committed receipt')
    check(unknown.resolve_or_cancel('unknown-owner','original-key',ui)['current']['state']=='HELD' and unknown.counts('unknown-review')==[('unit',2,2,0)],'resolve after unknown commit cannot cancel or restock existing hold')

    # New P1 route/receiver probes: both no-hold states and valid independent destinations.
    routed=model('routed',{'sku':1},scope='route-review',gated=True)
    receiver=actual.Model(Path(temp)/'receiver.sqlite',clock);receiver.initialize()
    for who in ['route-user-one','route-user-two']:
        routed.create(who,'too-many',intent('route-review',2,'order-'+who,['sku']),epoch=7)
    routed.resolve_or_cancel('route-orphan','empty',intent('route-review',1,'orphan-order',['sku']),epoch=7)
    with routed.connect() as con:
        request_events=[dict(row) for row in con.execute("SELECT * FROM outbox WHERE kind='REQUEST_TERMINAL'")]
        destinations=[tuple(row) for row in con.execute('SELECT d.event_id,d.destination FROM deliveries d JOIN outbox o USING(event_id)')]
    check(len(request_events)==3 and len(destinations)==3 and all(dest=='redis_gate' for _,dest in destinations),'two rejected requests plus cancelled orphan route only to Redis')
    for row in request_events:
        event=dict(json.loads(row['payload']),id=row['event_id'])
        rejects(lambda event=event:receiver.consume(event),'hold receiver rejects holdless request terminal before ACK','invalid_hold_event')
    check(scalar(receiver,'SELECT count(*) FROM consumer_inbox')==0 and scalar(receiver,'SELECT count(*) FROM projections')==0,'invalid request events create no false receiver inbox/projection')
    rejects(lambda:routed.relay(request_events[0]['event_id'],'orders',lambda e:True),'no fabricated orders route for holdless event','missing_delivery')
    hold=routed.create('valid-route','one',intent('route-review',1,'valid-order',['sku']),epoch=7)
    held_event=hold['hold_id']+':1'
    sent=[]
    def ack(event):sent.append(event['id']);receiver.consume(event);return True
    rejects(lambda:routed.relay(held_event,'orders',ack,crash_before_mark=True),'receiver ACK then sender crash preserves retry task','relay_abort')
    check(scalar(routed,'SELECT SUM(sent) FROM deliveries WHERE event_id=?',(held_event,))==0,'both destinations still pending after pre-mark crash')
    check(routed.relay(held_event,'orders',ack)=='SENT' and sent==[held_event,held_event],'same valid hold event safely redelivers then marks only orders')
    check(scalar(receiver,'SELECT count(*) FROM projections')==1 and scalar(routed,"SELECT sent FROM deliveries WHERE event_id=? AND destination='redis_gate'",(held_event,))==0,'orders ACK does not consume Redis obligation')
    check(routed.relay(held_event,'redis_gate',lambda e:False)=='PENDING','Redis missing ACK leaves separate pending row')
    valid=dict(kind='HOLD_STATE',id='review-full:2',hold_id='review-h',v=2,state='RELEASED')
    rejects(lambda:receiver.consume(valid,fail=True),'receiver own effect failure rolls back inbox','consumer_abort')
    check(scalar(receiver,"SELECT count(*) FROM consumer_inbox WHERE event_id='review-full:2'")==0,'failed receiver does not falsely dedup')
    check(receiver.consume(valid)=='APPLIED' and receiver.consume(valid)=='REPLAY','receiver stable identity APPLIED then REPLAY')
    check(receiver.consume(dict(valid,id='review-full:1',v=1,state='HELD'))=='APPLIED' and scalar(receiver,"SELECT state FROM projections WHERE hold_id='review-h'")=='RELEASED','older full-state event cannot regress released projection')
    rejects(lambda:receiver.consume(dict(valid,state='CONFIRMED')),'same event ID different full body conflicts','event_identity_conflict')
    for bad in [dict(valid,hold_id=None),dict(valid,hold_id=''),dict(valid,hold_id='  '),dict(valid,kind='REQUEST_TERMINAL'),dict(valid,v=True)]:
        rejects(lambda bad=bad:receiver.consume(bad),'invalid hold identity/type/version is not ACKed','invalid_hold_event')
    try:
        with receiver.transaction() as con:con.execute("INSERT INTO projections VALUES(NULL,1,'HELD')")
    except sqlite3.IntegrityError:check(True,'schema explicitly rejects NULL projection primary key')
    else:raise AssertionError('NULL primary key accepted')

    # Fixed-cutoff continuous pages over actual holds: a failed row is found next pass.
    scan=model('scan',{'night':11},scope='scan-review');clock.value=20000
    for i in range(11):scan.create('scan-user'+str(i),'one',intent('scan-review',1,'scan-order'+str(i),['night']))
    clock.value=20900;failed_id=None;seen=[];cursor=None
    while True:
        with scan.connect() as con:
            rows=con.execute('SELECT * FROM holds WHERE state=? AND deadline<=? '+('AND (deadline,hold_id)>(?,?) ' if cursor else '')+'ORDER BY deadline,hold_id LIMIT 3',('HELD',20900,*cursor) if cursor else ('HELD',20900)).fetchall()
        if not rows:break
        for row in rows:
            if failed_id is None:
                failed_id=row['hold_id'];rejects(lambda row=row:scan.finish(row['hold_id'],'EXPIRE',row['owner'],row['order_id'],fail_after=1),'scan injected row failure stays due','injected_abort')
            else:scan.finish(row['hold_id'],'EXPIRE',row['owner'],row['order_id'])
            seen.append(row['hold_id'])
        cursor=(rows[-1]['deadline'],rows[-1]['hold_id'])
    check(len(seen)==11 and len(set(seen))==11,'four continuous3-row pages visit all11 despite first failure')
    with scan.connect() as con:remaining=con.execute("SELECT * FROM holds WHERE state='HELD' AND deadline<=20900 ORDER BY deadline,hold_id").fetchall()
    check(len(remaining)==1 and remaining[0]['hold_id']==failed_id,'next oldest-first pass rediscovers failed due HELD')
    row=remaining[0];scan.finish(row['hold_id'],'EXPIRE',row['owner'],row['order_id'])
    check(scan.counts('scan-review')==[('night',11,0,0)],'recovered scan restores precisely11 owned units')

    # Actual model snapshot -> actual Redis installer -> metadata ACK -> model resume.
    clock.value=30000
    recover=model('recover',{'sku':17},scope='recovery-review',gated=True)
    active=recover.create('recover-active','h',intent('recovery-review',4,'r-active',['sku']),epoch=7)
    paid=recover.create('recover-paid','p',intent('recovery-review',3,'r-paid',['sku']),epoch=7)
    recover.finish(paid['hold_id'],'CONFIRM','recover-paid','r-paid')
    old=recover.create('recover-old','old',intent('recovery-review',2,'r-old',['sku']),epoch=7)
    clock.value=30900;recover.finish(old['hold_id'],'EXPIRE','recover-old','r-old')
    recover.create('recover-reject','no',intent('recovery-review',20,'r-no',['sku']),epoch=7)
    recover.resolve_or_cancel('recover-orphan','no',intent('recovery-review',1,'r-orphan',['sku']),epoch=7)
    epoch,rid=recover.pause('recovery-review')
    for action,label in [(lambda:recover.create('paused','no',intent('recovery-review',1,dates=['sku']),epoch=8),'create'),(lambda:recover.finish(active['hold_id'],'CONFIRM','recover-active','r-active'),'confirm'),(lambda:recover.finish(active['hold_id'],'EXPIRE','recover-active','r-active'),'expire')]:
        rejects(action,'paused fence blocks '+label,'paused')
    snap=recover.snapshot('recovery-review',epoch,rid)
    check(snap['free']==10 and {v['state'] for v in snap['tokens'].values()}=={'HELD','CONFIRMED','RELEASED','REJECTED','CANCELLED'},'snapshot includes ALL expired HELD/confirmed and retained terminal identities')
    rejects(lambda:recover.resume('recovery-review',epoch,rid,[str(epoch),snap['snapshot'],'0']),'unconfirmed installation cannot reopen DB','install_not_verified')
    sock=str(Path(temp)/'recovery.sock')
    server=subprocess.Popen(['/tmp/redis-7.2.5/src/redis-server','--port','0','--unixsocket',sock,'--save','','--appendonly','no','--dir',temp],stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
    try:
        for _ in range(100):
            if Path(sock).exists():break
            time.sleep(.02)
        def redis(*args):
            result=subprocess.run(['/tmp/redis-7.2.5/src/redis-cli','--json','-s',sock,*map(str,args)],capture_output=True,text=True,check=True)
            return json.loads(result.stdout)
        key='gate:{recovery-review}:8'
        installed=redis('EVAL',(SRC/'install.lua').read_text(),1,key,actual.canonical(snap))
        check(installed==['INSTALLED','5'],'actual Lua installs authoritative five-identity snapshot')
        # Deliberately lose the application response after the successful call.
        check(redis('EVAL',(SRC/'install.lua').read_text(),1,key,actual.canonical(snap))==['REPLAY'],'unknown installation ACK resolves by read-only same snapshot retry')
        metadata=redis('HMGET',key,'epoch','snapshot','ready')
        recover.resume('recovery-review',epoch,rid,metadata)
        rejects(lambda:recover.create('stale','request',intent('recovery-review',1,dates=['sku']),epoch=7),'old epoch create cannot allocate after resume','epoch')
        check(recover.finish(active['hold_id'],'EXPIRE','recover-active','r-active')=='RELEASED','imported expired HELD later releases under current epoch')
        with recover.connect() as con:
            event=json.loads(con.execute('SELECT payload FROM outbox WHERE event_id=?',(active['hold_id']+':2',)).fetchone()[0])
        check(event['epoch']==8 and event['q']==4,'old hold final event uses current e8 binding')
        argv=[event[k] for k in ['epoch','token','principal','digest','q','v','state']]
        check(redis('EVAL',(SRC/'receipt.lua').read_text(),1,key,*argv)==['APPLIED','RELEASED'] and redis('HGET',key,'free')=='14','actual current receipt restores exactly owned4 to snapshot free10')
        check(redis('EVAL',(SRC/'receipt.lua').read_text(),1,key,*argv)==['REPLAY'] and redis('HGET',key,'free')=='14','same current release receipt never restores twice')
        argv[0]=7
        check(redis('EVAL',(SRC/'receipt.lua').read_text(),1,key,*argv)==['STALE_OR_CLOSED'],'old epoch receipt cannot double-apply baseline effect')
        next_epoch,next_rid=recover.pause('recovery-review')
        rejects(lambda:recover.resume('recovery-review',epoch,rid,metadata),'old recovery controller cannot reopen a newer pause','recovery_owner')
        snap2=recover.snapshot('recovery-review',next_epoch,next_rid)
        check(snap2['free']==14 and all(v['state']!='HELD' for v in snap2['tokens'].values()),'next complete snapshot includes finished release once')
    finally:
        server.terminate();server.wait(timeout=5)

    # Math independently uses Fraction; no peak-to-day integration confusion.
    numbers={'hotelMean':str(Fraction(5000*200*7,10*3*86400)),'rows':5000*10*365,'ingressRatio':str(Fraction(2000,800)),'allocatedBudget':500+200+50,'averageInflight':str(Fraction(500*20,1000)),'nominalSeconds':str(Fraction(10000,500)),'maximumConflictAttempts':100*3}
    check(numbers['hotelMean']=='875/324' and numbers['rows']==18250000,'independent hotel mean and inventory rows')
    check(numbers['ingressRatio']=='5/2' and numbers['allocatedBudget']==750 and numbers['averageInflight']=='10','independent ingress/TX/inflight budgets')
    check(numbers['nominalSeconds']=='20' and numbers['maximumConflictAttempts']==300,'nominal time and bounded retry math')

hashes={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [ROOT/'chapters/ch21.html',*sorted(f for f in SRC.rglob('*') if f.is_file())]}
result={'passed':True,'checks':checks,'checkCount':len(checks),'numbers':numbers,'sourceHashes':hashes,'limits':['Actual SQLite Model invoked; BEGIN IMMEDIATE is not PostgreSQL row locking.','Scan is an independent contract probe against real model rows, not a production scheduler.','No payment/auth/network/cross-process failover proof.']}
(ROOT/'docs/reviews/ch21-independent-model-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'passed':True,'checkCount':len(checks),'modelSha256':hashes['examples/ch21/model.py']}))
