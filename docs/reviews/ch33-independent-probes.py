"""Independent new inputs/interleavings against the author's actual two-file adapter."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from dataclasses import replace
from pathlib import Path
from fractions import Fraction as F
import hashlib,importlib.util,json,sqlite3,sys,tempfile,threading

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('ch33_review_model',ROOT/'examples/ch33/model.py')
M=importlib.util.module_from_spec(spec);sys.modules[spec.name]=M;spec.loader.exec_module(M)
checks=[]
def check(name,condition,detail=None):
    checks.append({'name':name,'passed':bool(condition),'detail':detail})
    assert condition,(name,detail)
def rejected(fn):
    try: fn()
    except (M.Denied,UnicodeError): return True
    return False
class Clock:
    def __init__(self):self.now=7800;self.observed=[]
    def __call__(self):self.observed.append(self.now);return self.now
CTX=M.Context('acme','bob','review-helper')
RAW=M.encode({'reason':'Verified ✓','ticket_id':'T-77','expected_version':23}).encode()
@contextmanager
def fixture():
    with tempfile.TemporaryDirectory(prefix='ch33-independent-') as tmp:
        clock=Clock();g=M.Gateway(Path(tmp)/'gateway.sqlite',clock);b=M.Business(Path(tmp)/'business.sqlite')
        with M.write(g.path) as db:
            db.execute("INSERT INTO Principal VALUES('acme','bob','review-helper',1,1)")
            db.execute("INSERT INTO Resource VALUES('T-77','acme',23)")
        with M.write(b.path) as db:
            db.execute("INSERT INTO Principal VALUES('acme','bob','review-helper',1,1)")
            db.execute("INSERT INTO Ticket VALUES('acme','T-77',23,'OPEN')")
        yield g,b,clock
def prepared(g,intent):
    a,_=g.submit(CTX,intent,RAW);g.approve(a.key,a.binding);return a
def parallel(calls):
    barrier=threading.Barrier(len(calls))
    def run(fn):barrier.wait(timeout=5);return fn()
    with ThreadPoolExecutor(max_workers=len(calls)) as pool:return list(pool.map(run,calls))

with fixture() as (g,b,clock):
    a,state=g.submit(CTX,'independent-normal',RAW)
    check('nondefault subject/resource/version admitted pending',state=='PENDING')
    clock.now+=17
    replay,_=g.submit(CTX,a.intent,b'{"expected_version":23,"ticket_id":"T-77","reason":"Verified \\u2713"}')
    check('same canonical request preserves original approval expiry and grant',replay==a)
    alterations={'tenant':'other','actor':'alice','agent':'another-agent','intent':'different-intent',
        'tool':'ticket.erase','revision':'r99','route':'unregistered-v2','policy':'p10',
        'args':a.args.replace('Verified','Altered'),'resource':'T-2','version':24,
        'grant':'another-grant','expires':a.expires+1,'replay_until':a.replay_until+1}
    for field,value in alterations.items():
        check('approval rejects changed '+field,rejected(lambda field=field,value=value:g.approve(a.key,replace(a,**{field:value}).binding)))
    check('invalid approval attempts leave grant unconsumed',M.read(g.path,'SELECT consumed FROM GrantToken WHERE grant_id=?',(a.grant,))['consumed']==0)
    check('approver for another tenant rejected',rejected(lambda:g.approve(a.key,a.binding,'other-reviewer')))
    claims=parallel([lambda:g.approve(a.key,a.binding) for _ in range(9)])
    check('nine approvals give one durable approval event',claims==['APPROVED']*9 and M.read(g.path,"SELECT count(*) n FROM Audit WHERE kind='approved'")['n']==1)
    winners=parallel([lambda:g.claim(CTX,a.key) for _ in range(9)])
    check('nine fresh DB connections grant one dispatch',sum(x is not None for x in winners)==1)
    issued,epoch=next(x for x in winners if x)
    receipt=b.apply(CTX,issued)
    check('actual backend condition changes v23 to v24',receipt['outcome']=='SUCCEEDED' and M.read(b.path,"SELECT version,state FROM Ticket WHERE id='T-77'")=={'version':24,'state':'CLOSED'})
    check('local terminal persists once',g.record(a.key,epoch,receipt) and not g.record(a.key,epoch,receipt))
    clock.now=a.expires+7
    check('original receipt replay precedes changed version and expired approval',b.apply(CTX,a)['outcome']=='SUCCEEDED')
    b.compact(a.key)
    with M.write(b.path) as db:db.execute("UPDATE Ticket SET version=23,state='OPEN' WHERE id='T-77'")
    old=b.apply(CTX,a)
    check('retained tombstone prevents old key acting on restored matching row',old['outcome']=='SUCCEEDED' and old['retired']==1 and old['body'] is None and M.read(b.path,"SELECT version,state FROM Ticket WHERE id='T-77'")=={'version':23,'state':'OPEN'})
    check('same key changed subject never reuses grant',rejected(lambda:g.submit(replace(CTX,agent='another-agent'),a.intent,RAW)))

for raw in [RAW.replace(b':23',b':23.0'),RAW.replace(b':23',b':true'),
            RAW[:-1]+b',"ticket_id":"T-2"}',RAW[:-1]+b',"endpoint":"http://other"}',
            RAW.replace(b'T-77',b'T-\xff'),b'{"expected_version":23,"reason":"x","ticket_id":"T-77","x":[[[[[[[[[0]]]]]]]]]}']:
    check('closed bounded schema rejects alternate invalid input',rejected(lambda raw=raw:M.canonical_args(raw)),repr(raw)[:150])

with fixture() as (g,b,clock):
    check('well-typed foreign resource fails ownership',rejected(lambda:g.submit(CTX,'foreign',RAW.replace(b'T-77',b'T-2'))))
    a=prepared(g,'independent-backend-revoke');_,epoch=g.claim(CTX,a.key)
    with M.write(b.path) as db:db.execute("UPDATE Principal SET user_allow=0 WHERE actor='bob'")
    check('postclaim backend revocation blocks new effect',rejected(lambda:b.apply(CTX,a)) and b.lookup(a.key) is None)
    g.unknown(a.key,epoch)
    check('absent receipt leaves unknown after denial evidence is not supplied',g.recover(a.key,b)=='UNKNOWN')

with fixture() as (g,b,clock):
    a=prepared(g,'changed-policy')
    with M.write(g.path) as db:db.execute("UPDATE Tool SET policy='p10'")
    check('policy revision change after approval blocks claim',g.claim(CTX,a.key) is None and b.lookup(a.key) is None)

with fixture() as (g,b,clock):
    a,_=g.submit(CTX,'expiry-while-locked',RAW)
    before=len(clock.observed);started=threading.Event()
    with ThreadPoolExecutor(max_workers=1) as pool:
        with M.write(g.path):
            def approve_waiting():started.set();return g.approve(a.key,a.binding)
            future=pool.submit(approve_waiting);started.wait(timeout=2)
            threading.Event().wait(.05)
            check('blocked approval does not sample clock before DB lock',len(clock.observed)==before and not future.done())
            clock.now=a.expires
        check('approval samples exact expiry after acquiring lock',future.result(timeout=5)=='DENIED' and M.read(g.path,'SELECT consumed FROM GrantToken')['consumed']==0)

with fixture() as (g,b,clock):
    actions=[prepared(g,'version-race-'+str(i)) for i in range(2)]
    issued=[g.claim(CTX,a.key) for a in actions]
    receipts=parallel([lambda a=a:b.apply(CTX,a) for a in actions])
    check('two independent approved intents race one resource: one success one known failure',sorted(x['outcome'] for x in receipts)==['FAILED_KNOWN','SUCCEEDED'])
    check('one business version increment and two retained outcomes',M.read(b.path,"SELECT version FROM Ticket WHERE id='T-77'")['version']==24 and M.read(b.path,'SELECT count(*) n FROM Receipt')['n']==2)
    for (a,epoch),receipt in zip(issued,receipts):g.record(a.key,epoch,receipt)

with fixture() as (g,b,clock):
    a,_=g.submit(CTX,'approval-audit-fault',RAW)
    with M.write(g.path) as db:db.execute("CREATE TRIGGER review_fault BEFORE INSERT ON Audit WHEN NEW.kind='approved' BEGIN SELECT RAISE(ABORT,'review audit failed'); END")
    try:g.approve(a.key,a.binding);check('approval fault raised',False)
    except sqlite3.DatabaseError:pass
    check('audit insertion failure rolls back grant consumption and approval together',g.status(a.key)['state']=='PENDING' and M.read(g.path,'SELECT consumed FROM GrantToken')['consumed']==0)
    with M.write(g.path) as db:db.execute('DROP TRIGGER review_fault')
    check('same approval can proceed after whole local rollback',g.approve(a.key,a.binding)=='APPROVED')

with fixture() as (g,b,clock):
    a=prepared(g,'receipt-insert-fault');_,epoch=g.claim(CTX,a.key)
    with M.write(b.path) as db:db.execute("CREATE TRIGGER receipt_fault BEFORE INSERT ON Receipt WHEN NEW.intent='receipt-insert-fault' BEGIN SELECT RAISE(ABORT,'no receipt storage'); END")
    try:b.apply(CTX,a);check('receipt fault raised',False)
    except sqlite3.DatabaseError:pass
    check('receipt failure rolls back effect in the actual separate business file',M.read(b.path,"SELECT version,state FROM Ticket WHERE id='T-77'")=={'version':23,'state':'OPEN'} and b.lookup(a.key) is None)
    g.unknown(a.key,epoch)
    with M.write(b.path) as db:db.execute('DROP TRIGGER receipt_fault')
    check('authorized same-key replay recovers initial nondelivery/failure window',g.replay_unknown(CTX,a.key,b)=='SUCCEEDED')

with fixture() as (g,b,clock):
    a=prepared(g,'late-cancelled');_,old_epoch=g.claim(CTX,a.key)
    g.unknown(a.key,old_epoch)
    check('query absence does not clear action identity',g.recover(a.key,b)=='UNKNOWN')
    check('cancel after claim remains unknown',g.cancel(CTX,a.key)=='UNKNOWN')
    g.takeover(a.key);clock.now=a.replay_until+10
    check('expiry/cancellation forbid another send despite missing receipt',rejected(lambda:g.replay_unknown(CTX,a.key,b)))
    late=b.apply(CTX,a)
    check('already-issued delayed call can still commit after expiry/cancel',late['outcome']=='SUCCEEDED')
    check('epoch only fences old local result writer',not g.record(a.key,old_epoch,late) and b.lookup(a.key)['outcome']=='SUCCEEDED')
    with M.write(g.path) as db:db.execute("CREATE TRIGGER outcome_audit_fault BEFORE INSERT ON Audit WHEN NEW.kind='outcome' BEGIN SELECT RAISE(ABORT,'local audit failed'); END")
    try:g.recover(a.key,b);check('outcome audit fault raised',False)
    except sqlite3.DatabaseError:pass
    check('local result plus event rollback leaves remote receipt intact',g.status(a.key)['state']=='UNKNOWN' and b.lookup(a.key)['outcome']=='SUCCEEDED')
    with M.write(g.path) as db:db.execute('DROP TRIGGER outcome_audit_fault')
    check('new epoch recovers authoritative late receipt while retaining cancel flag',g.recover(a.key,b)=='SUCCEEDED' and g.status(a.key)['cancel']==1)

numeric={
    'logical_calls_s':(20*3,60),'mean_inflight':(60*F(3,10),18),
    'retry_calls_s':(60*F(11,10),66),'retry_inflight':(66*F(3,10),F(99,5)),
    'execution_budget_s':(F(35,10)*2+F(2,10)+F(8,10),8),
    'approval_arrivals_s':(60*F(1,5),12),'steady_pending':(12*30,360),
    'audit_bytes_day':(2000*60*86400,10368000000),'audit_GB_day':(F(10368000000,10**9),F(10368,1000)),
    'audit_GiB_day':(F(10368000000,2**30),F(6328125,655360)),
    'hot_GB':(F(10368,1000)*7*2,F(145152,1000)),
    'archive_GB':(F(10368,1000)*30*2,F(62208,100)),
    'result_buffers_MiB':(F(64*64*1024,2**20),4)}
for name,(actual,expected) in numeric.items():check('independent arithmetic '+name,actual==expected,{'actual':str(actual),'expected':str(expected)})

result={'passed':True,'count':len(checks),'checks':checks,'source_sha256':hashlib.sha256((ROOT/'examples/ch33/model.py').read_bytes()).hexdigest(),
        'scope':'Independent inputs/interleavings against actual local two-file SQLite model; trusted identity/envelope fixtures, no production authentication, RPC, remote cancellation or distributed quotas'}
(ROOT/'docs/reviews/ch33-independent-probe-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'passed':True,'checks':len(checks)}))
