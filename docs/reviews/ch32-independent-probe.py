"""Independent new-input probes against the actual Ch32 SQLite adapter."""
import importlib.util,json,hashlib,pathlib,sys,tempfile,threading
from concurrent.futures import ThreadPoolExecutor
sys.dont_write_bytecode=True
root=pathlib.Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('reviewed_ledger',root/'examples/ch32/ledger.py')
L=importlib.util.module_from_spec(spec);spec.loader.exec_module(L)
checks=[]
def ok(name,value):
    if not value: raise AssertionError(name)
    checks.append(dict(name=name,passed=True))
def denied(name,f,kind=L.Denied):
    try: f()
    except kind: ok(name,True);return
    raise AssertionError(name+' unexpectedly accepted')
def first(db,rid='r',owner='owner-a',bound=137,extra=True,digest='canonical-r'):
    return L.reserve_first(db,'t',rid,digest,'p1','plan-frozen','deployment-A',bound,owner,extra,price='price-17',model='actual-A:r19')
def final(db,n,i,o,e):
    return L.settle(db,'t','r',n,i,o,e,upstream_id=f'provider-call-{n}',served_model='actual-A:r19' if n==1 else 'actual-B:r23')
def parallel(path,functions):
    gate=threading.Barrier(len(functions))
    def call(f):
        db=L.connect(path);gate.wait()
        try:return f(db)
        except (L.Denied,L.Conflict) as e:return type(e).__name__
        finally:db.close()
    with ThreadPoolExecutor(max_workers=len(functions)) as pool:return list(pool.map(call,functions))
with tempfile.TemporaryDirectory(prefix='ch32-independent-') as directory:
    base=pathlib.Path(directory)
    path=base/'normal.db';L.initialize(path,cap=411);db=L.connect(path)
    ok('normal created call owns one intent',first(db)['created'])
    ok('normal commit succeeds once',L.claim_commit(db,'t','r',1,'owner-a'))
    ok('commit observation cannot authorize another flush',not L.claim_commit(db,'t','r',1,'owner-a'))
    L.bind_upstream(db,'t','r',1,'owner-a','provider-call-1','actual-A:r19')
    ok('final usage converts only its hold',final(db,1,79,12,'signed-final-a') and (L.balance(db)['held'],L.balance(db)['settled'])==(0,91))
    ok('net available released by 46',L.balance(db)['cap']-L.balance(db)['held']-L.balance(db)['settled']==320)
    ok('same final duplicate no debit',final(db,1,79,12,'signed-final-a') is False)
    denied('conflicting final evidence cannot debit again',lambda:final(db,1,79,13,'different-final'),L.Conflict)
    denied('wrong served model cannot settle',lambda:L.settle(db,'t','r',1,79,12,'signed-final-a',upstream_id='provider-call-1',served_model='actual-A:r20'),L.Conflict)
    denied('wrong upstream call cannot settle',lambda:L.settle(db,'t','r',1,79,12,'signed-final-a',upstream_id='other-call',served_model='actual-A:r19'),L.Conflict)
    db.close();db=L.connect(path)
    ok('lost receipt replay after reopening cannot dispatch',not first(db,owner='new-worker')['created'])
    denied('same rid changed request conflicts',lambda:first(db,digest='changed-request'),L.Conflict)
    db.close()

    path=base/'last.db';L.initialize(path,cap=1999)
    answers=parallel(path,[lambda db,j=j:first(db,rid=f'last-{j}',owner=f'w{j}',bound=1999,digest=f'd{j}')['created'] for j in range(3)])
    db=L.connect(path)
    ok('three connections last budget only one winner',answers.count(True)==1 and answers.count('Denied')==2)
    ok('denied insert rolls back request and hold',L.balance(db)['held']==1999 and db.execute('SELECT count(*) FROM requests').fetchone()[0]==1)
    db.close()

    path=base/'body-race.db';L.initialize(path,cap=777)
    answers=parallel(path,[lambda db,j=j:first(db,bound=241,owner=f'w{j}',digest=f'different-{j}')['created'] for j in range(2)])
    db=L.connect(path)
    ok('same rid concurrent different bodies conflict rather than reuse result',answers.count(True)==1 and answers.count('Conflict')==1 and L.balance(db)['held']==241)
    db.close()

    path=base/'unknown.db';L.initialize(path,cap=3000);db=L.connect(path)
    first(db,bound=1700);L.mark_failure(db,'t','r',1,'owner-a','UNKNOWN')
    ok('a1 unknown retains all held cost',L.balance(db)['held']==1700)
    L.reserve_fallback(db,'t','r','owner-a','deployment-B',900,'owner-b',price='price-23',model='actual-B:r23')
    ok('a2 needs a separate hold; a1 is not transferred',L.balance(db)['held']==2600 and L.request(db,'t','r')['selected']==2)
    ok('old owner cannot commit a1 or masquerade as a2',not L.claim_commit(db,'t','r',1,'owner-a') and not L.claim_commit(db,'t','r',2,'owner-a'))
    ok('old owner cannot close alternate stream',not L.close_if_selected(db,'t','r',1,'owner-a') and not L.close_if_selected(db,'t','r',2,'owner-a'))
    ok('selected alternate commits only its owner',L.claim_commit(db,'t','r',2,'owner-b'))
    L.bind_upstream(db,'t','r',1,'owner-a','provider-call-1','actual-A:r19')
    L.bind_upstream(db,'t','r',2,'owner-b','provider-call-2','actual-B:r23')
    denied('a1 final cannot be assigned to a2',lambda:L.settle(db,'t','r',2,800,100,'a1-evidence',upstream_id='provider-call-1',served_model='actual-A:r19'),L.Conflict)
    L.close_if_selected(db,'t','r',2,'owner-b')
    db.execute("INSERT INTO budgets(tenant,period,cap) VALUES('t','p2',9999)")
    final(db,2,350,125,'b-final');final(db,1,800,100,'late-a-final')
    ok('late usage after alternate closes charges each original attempt',L.balance(db)['held']==0 and L.balance(db)['settled']==1375)
    ok('late final stays in original budget period',L.balance(db,period='p2')['settled']==0 and L.balance(db,period='p2')['held']==0)
    denied('closed committed request cannot start third call',lambda:L.reserve_fallback(db,'t','r','owner-a','deployment-C',1,'owner-c'))
    db.close()

    path=base/'short-extra.db';L.initialize(path,cap=2599);db=L.connect(path)
    first(db,bound=1700);L.mark_failure(db,'t','r',1,'owner-a','UNKNOWN')
    denied('one token short prevents fallback without refunding a1',lambda:L.reserve_fallback(db,'t','r','owner-a','deployment-B',900,'owner-b',model='actual-B:r23'))
    ok('fallback denial leaves original hold and selection intact',L.balance(db)['held']==1700 and L.request(db,'t','r')['selected']==1)
    db.close()

    # Use three real SQLite connections to race commitment, failure/fallback and
    # closing. Commit and close may both legitimately win in that order.
    for iteration in range(6):
        path=base/f'close-race-{iteration}.db';L.initialize(path,cap=1200);db=L.connect(path);first(db,bound=500);db.close()
        def fallback(db):
            L.mark_failure(db,'t','r',1,'owner-a','TRANSIENT')
            return L.reserve_fallback(db,'t','r','owner-a','deployment-B',500,'owner-b',model='actual-B:r23')['created']
        answer=parallel(path,[lambda db:L.claim_commit(db,'t','r',1,'owner-a'),fallback,lambda db:L.close_if_selected(db,'t','r',1,'owner-a')])
        db=L.connect(path);q=L.request(db,'t','r');count=db.execute('SELECT count(*) FROM attempts').fetchone()[0]
        valid=(not(answer[0] is True and answer[1] is True)) and (q['selected']!=2 or (not q['committed'] and count==2))
        if answer[1] is True:valid=valid and not q['closed'] and not L.claim_commit(db,'t','r',2,'owner-a')
        ok(f'three-way commit/fallback/close race {iteration} preserves selected owner',valid)
        db.close()

    path=base/'unbound.db';L.initialize(path,cap=1000);db=L.connect(path)
    first(db,rid='r',bound=300);first(db,rid='another',bound=300,digest='other')
    denied('unbound usage cannot turn unknown into zero',lambda:L.settle(db,'t','r',1,0,0,'zero',upstream_id='unbound',served_model='actual-A:r19'),L.Conflict)
    L.bind_upstream(db,'t','r',1,'owner-a','one-remote-call','actual-A:r19')
    denied('same remote call cannot charge two intents in same pool',lambda:L.bind_upstream(db,'t','another',1,'owner-a','one-remote-call','actual-A:r19'),L.Conflict)
    ok('unbound conflicts preserve all budget holds',L.balance(db)['held']==600 and L.balance(db)['settled']==0)
    db.close()

payload=dict(passed=True,count=len(checks),checks=checks,source_sha256=hashlib.sha256(pathlib.Path(L.__file__).read_bytes()).hexdigest(),scope='Independent new inputs; actual SQLite files/connections. No provider, parser, SSE network or distributed DB execution.')
(root/'docs/reviews/ch32-independent-probe-results.json').write_text(json.dumps(payload,indent=2)+'\n')
print(json.dumps(dict(passed=True,count=len(checks),source_sha256=payload['source_sha256'])))
