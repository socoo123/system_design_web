"""Independent new inputs against actual SQLite contract model; not PostgreSQL/Redis proof."""
from pathlib import Path
import importlib.util
import sys
sys.dont_write_bytecode = True
import tempfile
import sqlite3
import hashlib
import json

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('c6_inventory', ROOT/'examples/ch21/model.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
Model,Rejected,UnknownCommit=module.Model,module.Rejected,module.UnknownCommit
checks=[]
def check(name,ok):
    checks.append({'name':name,'passed':bool(ok)})
    if not ok:raise AssertionError(name)
def rejects(name,fn,reason):
    try:fn()
    except Rejected as error:check(name,str(error)==reason)
    else:check(name,False)
def intent(scope,items,order):
    return {'scope':scope,'items':items,'order_id':order,'policy_version':'independent-policy'}
def scalar(m,sql,args=()):
    with m.connect() as c:return c.execute(sql,args).fetchone()[0]
class Clock:
    value=2000
    def __call__(self):return self.value
with tempfile.TemporaryDirectory(prefix='sd-c6-root-inventory-') as temp:
    clock=Clock();m=Model(Path(temp)/'contract.db',clock);m.initialize()
    for scope in ['east','west']:m.seed(scope,{'A':3,'B':1})
    a=intent('east',[['B',1],['A',1]],'alice-order')
    original=m.create('alice','same-text-key',a)
    check('unsorted nights normalized with full ownership',m.counts('east')==[('A',2,1,0),('B',0,1,0)])
    denied=m.create('bob','same-text-key',intent('east',[['A',1],['B',1]],'bob-order'))
    check('another principal has independent identity but cannot oversell',denied['result']=='REJECTED')
    check('failed middle night undoes its earlier row',m.counts('east')==[('A',2,1,0),('B',0,1,0)])
    rejects('same owner/key cannot silently change scope',lambda:m.create('alice','same-text-key',intent('west',[['A',1],['B',1]],'alice-order')),'identity_conflict')
    check('scope conflict leaves both scopes intact',m.counts('west')==[('A',3,0,0),('B',1,0,0)])
    clock.value=original['deadline']
    check('deadline equality rejects confirmation',m.finish(original['hold_id'],'CONFIRM','alice','alice-order')=='EXPIRED_NOT_CONFIRMED')
    check('rejected confirmation does not free ownership',m.counts('east')[1]==('B',0,1,0))
    check('expiry releases exactly owned nights',m.finish(original['hold_id'],'EXPIRE','alice','alice-order')=='RELEASED')
    check('rejected old key remains rejected after availability returns',m.create('bob','same-text-key',intent('east',[['A',1],['B',1]],'bob-order'))==denied)
    bob=m.create('bob','fresh-key',intent('east',[['A',1],['B',1]],'bob-order'))
    before=m.counts('east')
    check('duplicate old release returns its terminal state',m.finish(original['hold_id'],'EXPIRE','alice','alice-order')=='RELEASED')
    check('duplicate release cannot return Bob ownership',m.counts('east')==before)
    check('late paid command cannot revive old hold',m.finish(original['hold_id'],'CONFIRM','alice','alice-order')=='RELEASED')
    check('original create receipt remains the original HELD',m.create('alice','same-text-key',a)==original and m.query('alice','same-text-key')['current']['state']=='RELEASED')
    c=intent('west',[['A',1],['B',1]],'carol-order')
    try:m.create('carol','unknown',c,ack_lost=True)
    except UnknownCommit:pass
    else:raise AssertionError('ACK loss was not injected')
    resolved=m.resolve_or_cancel('carol','unknown',c)
    check('unknown commit resolves original durable ownership',resolved['current']['state']=='HELD' and resolved['original_receipt']['http']==201)
    check('unknown resolution never allocates a second hold',scalar(m,'SELECT count(*) FROM holds WHERE owner=?',('carol',))==1)
    tomb=intent('east',[['A',1]],'cancelled-order')
    closed=m.resolve_or_cancel('dana','cancel-before-create',tomb)
    check('cancel installs durable tombstone before delayed create',closed['current']=='CANCELLED')
    check('delayed create returns original cancellation',m.create('dana','cancel-before-create',tomb)==closed['original_receipt'])
    m.seed('rollback',{'C':4,'D':3})
    i=intent('rollback',[['C',2],['D',2]],'rollback-order');h=m.create('erin','r',i)
    state=m.counts('rollback')
    rejects('partial finalization aborts state and every counter',lambda:m.finish(h['hold_id'],'CONFIRM','erin','rollback-order',fail_after=1),'injected_abort')
    check('failed terminal transaction preserves HELD',m.counts('rollback')==state and m.query('erin','r')['current']['state']=='HELD')
    for scope in ['north','south']:m.seed(scope,{'slot':5})
    owned=m.create('frank','f',intent('north',[['slot',2]],'frank-order'));state=m.counts('north')
    with m.transaction() as conn:conn.execute('UPDATE hold_items SET scope=? WHERE hold_id=?',('south',owned['hold_id']))
    rejects('wrong-scope ownership refuses otherwise sufficient counters',lambda:m.finish(owned['hold_id'],'CONFIRM','frank','frank-order'),'ownership_mismatch')
    check('ownership mismatch leaves both stock scopes unchanged',m.counts('north')==state and m.counts('south')==[('slot',5,0,0)])
    event={'kind':'HOLD_STATE','id':'independent-v2','hold_id':bob['hold_id'],'v':2,'state':'RELEASED'}
    check('newer terminal full-state event applies',m.consume(event)=='APPLIED')
    check('older event is recorded but cannot overwrite terminal state',m.consume(dict(event,id='independent-v1',v=1,state='HELD'))=='APPLIED' and scalar(m,'SELECT state FROM projections WHERE hold_id=?',(bob['hold_id'],))=='RELEASED')
    rejects('same event id with different complete effect conflicts',lambda:m.consume(dict(event,state='CONFIRMED')),'event_identity_conflict')
    fail={'kind':'HOLD_STATE','id':'independent-fail','hold_id':'another-hold','v':1,'state':'HELD'}
    rejects('consumer failure rolls back inbox and effect',lambda:m.consume(fail,fail=True),'consumer_abort')
    check('failed event can be retried and then deduplicated',m.consume(fail)=='APPLIED' and m.consume(fail)=='REPLAY')
    m.seed('sale',{'sku':10},gated=True)
    paid=intent('sale',[['sku',3]],'sale-order');sale=m.create('gina','g',paid,epoch=7)
    clock.value=sale['deadline']+1
    epoch,recovery=m.pause('sale');snap=m.snapshot('sale',epoch,recovery)
    check('past-deadline HELD remains occupied in frozen snapshot',snap['free']==7 and list(snap['tokens'].values())[0]['state']=='HELD')
    rejects('old epoch cannot enter after pause',lambda:m.create('harry','h',intent('sale',[['sku',1]],'harry-order'),epoch=7),'paused')
    rejects('reopen requires matching installed snapshot evidence',lambda:m.resume('sale',epoch,recovery,[str(epoch),'wrong','1']),'install_not_verified')
    next_epoch,next_recovery=m.pause('sale')
    rejects('obsolete recovery owner cannot snapshot a later epoch',lambda:m.snapshot('sale',epoch,recovery),'recovery_owner')
    # New event-type/routing regression uses different owners and an actual exhausted scope.
    m.seed('gated-term',{'sku':1},gated=True)
    m.create('issuer','occupied',intent('gated-term',[['sku',1]],'occupied-order'),epoch=7)
    for who in ['independent-jane','independent-kai']:
        reply=m.create(who,'unavailable',intent('gated-term',[['sku',1]],who+'-order'),epoch=7)
        check(who+' rejection remains queryable by request identity',reply['result']=='REJECTED' and m.query(who,'unavailable')['current']=='REJECTED')
    with m.connect() as conn:
        routed=conn.execute('SELECT o.kind,o.payload,d.destination FROM outbox o LEFT JOIN deliveries d USING(event_id)').fetchall()
        requests=[r for r in routed if r['kind']=='REQUEST_TERMINAL']
        check('no request-terminal event goes to a hold-state receiver',all(r['destination']!='orders' for r in requests))
        gated=[r for r in requests if json.loads(r['payload'])['principal'] in ['independent-jane','independent-kai']]
        check('distinct failed owners retain distinct Redis-only terminal deliveries',len(gated)==2 and all(r['destination']=='redis_gate' for r in gated) and len({json.loads(r['payload'])['token'] for r in gated})==2)
    before=scalar(m,'SELECT count(*) FROM consumer_inbox')
    invalid={'kind':'REQUEST_TERMINAL','id':'must-not-ack','hold_id':None,'v':1,'state':'REJECTED'}
    rejects('hold receiver rejects request-terminal kind before inbox/ACK',lambda:m.consume(invalid),'invalid_hold_event')
    rejects('hold receiver rejects missing hold even with valid kind',lambda:m.consume(dict(invalid,kind='HOLD_STATE',state='HELD')),'invalid_hold_event')
    check('invalid hold events leave no inbox or anonymous projection',scalar(m,'SELECT count(*) FROM consumer_inbox')==before and scalar(m,'SELECT count(*) FROM projections WHERE hold_id IS NULL')==0)
    try:
        with m.connect() as conn:conn.execute('INSERT INTO projections VALUES(NULL,1,?)',('HELD',))
    except sqlite3.IntegrityError:check('actual SQLite primary identity explicitly rejects NULL',True)
    else:check('actual SQLite primary identity explicitly rejects NULL',False)
paths=['examples/ch21/model.py','examples/ch21/schema.sql']
result={'passed':all(r['passed'] for r in checks),'checks':checks,'sourceHashes':{p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in paths},'limitation':'Actual SQLite BEGIN IMMEDIATE model only; no PostgreSQL row-lock, Redis recovery, auth or payment integration claim.'}
(ROOT/'docs/reviews/ch19-ch20-ch21-root-inventory-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'passed':result['passed'],'checks':len(checks)}))
