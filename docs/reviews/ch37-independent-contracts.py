"""Independent new fixtures against Ch37's unchanged SQLite adapter."""
import sys
sys.dont_write_bytecode = True
from pathlib import Path
import concurrent.futures as futures
import importlib.util, json, os, sqlite3, subprocess, tempfile, threading, time

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('reviewed_storage', ROOT / 'examples/ch37/storage.py')
store = importlib.util.module_from_spec(spec); spec.loader.exec_module(store)
checks = []
def check(label, condition, actual=None):
    checks.append({'label': label, 'passed': bool(condition), 'actual': actual})
    assert condition, (label, actual)
def rejected(label, fn, kind=ValueError):
    try: fn()
    except kind as e: check(label, True, type(e).__name__)
    else: check(label, False, 'accepted')
def req(*items, delivery='locker/独立-Q'):
    return {'lines': list(items), 'delivery_ref': delivery}
def rows(path, sql, args=()):
    db=store.connect(path)
    try: return [tuple(r) for r in db.execute(sql,args)]
    finally: db.close()
def scalar(path, sql): return rows(path,sql)[0][0]
def parallel(n, fn):
    barrier=threading.Barrier(n)
    def one(i): barrier.wait(3); return fn(i)
    with futures.ThreadPoolExecutor(max_workers=n) as pool: return list(pool.map(one,range(n)))

result = {'scope': 'Independent local SQLite files, separate connections and process exit. No object/network/replication service.'}
try:
 with tempfile.TemporaryDirectory(prefix='ch37-independent-') as directory:
    home=Path(directory)
    db=home/'full.db'; store.initialize(db,{'red:west':9,'blue/east':2})
    original=req(('red:west',2),('blue/east',1),('red:west',3))
    answer=store.checkout(db,'tenant-Q/u6','checkout-17',original)
    check('new multi-SKU request commits',answer['outcome']=='CREATED',answer)
    check('duplicates merge to one line per SKU',rows(db,'SELECT sku,qty FROM order_line ORDER BY sku')==[('blue/east',1),('red:west',5)])
    check('exact quantities remain',rows(db,'SELECT sku,on_hand FROM inventory ORDER BY sku')==[('blue/east',1),('red:west',4)])
    check('reordering/merged duplicate retry is same canonical intent',store.checkout(db,'tenant-Q/u6','checkout-17',req(('blue/east',1),('red:west',5)))==answer)
    rejected('delivery change conflicts',lambda:store.checkout(db,'tenant-Q/u6','checkout-17',req(('red:west',5),('blue/east',1),delivery='locker/other')),store.KeyConflict)
    rejected('quantity change conflicts',lambda:store.checkout(db,'tenant-Q/u6','checkout-17',req(('red:west',4),('blue/east',1))),store.KeyConflict)
    check('conflicts do not create second order',scalar(db,'SELECT count(*) FROM orders')==1)
    for label,quantity in [('zero',0),('negative',-2),('boolean',False),('float',1.0),('text','1'),('too-large',1_000_001)]:
        rejected('invalid quantity '+label,lambda q=quantity:store.checkout(db,'tenant-Q/u6','bad-'+label,req(('red:west',q))))
    for label,request in [('empty-lines',req()),('empty-delivery',req(('red:west',1),delivery='')),('extra-semantic-field',{**req(('red:west',1)),'currency':'USD'}),('bad-line',{'lines':[('red:west',1,'x')],'delivery_ref':'d'}),('too-many-lines',req(*[('red:west',1)]*33)),('merged-quantity-overflow',req(('red:west',600_000),('red:west',500_000)))]:
        rejected('request validation '+label,lambda r=request:store.checkout(db,'tenant-Q/u6','bad-'+label,r))
    check('validation creates no idempotency entry',scalar(db,"SELECT count(*) FROM idempotency WHERE key LIKE 'bad-%'")==0)
    other=store.checkout(db,'tenant-Q/u7','checkout-17',req(('red:west',1)))
    check('trusted caller scopes idempotency',other['outcome']=='CREATED' and other['order_id']!=answer['order_id'])

    partial=home/'partial.db';store.initialize(partial,{'a/first':4,'z/short':0})
    short=req(('z/short',1),('a/first',3))
    refusal=store.checkout(partial,'tenant-R/u1','refuse',short)
    check('later sorted SKU shortage persists refusal',refusal=={'outcome':'OUT_OF_STOCK','order_id':None})
    check('savepoint restores earlier stock',rows(partial,'SELECT on_hand FROM inventory ORDER BY sku')==[(4,),(0,)])
    check('savepoint removes order and all lines',scalar(partial,'SELECT count(*) FROM orders')==0 and scalar(partial,'SELECT count(*) FROM order_line')==0)
    c=store.connect(partial);c.execute("UPDATE inventory SET on_hand=2 WHERE sku='z/short'");c.close()
    check('restock cannot rewrite a refusal under same key',store.checkout(partial,'tenant-R/u1','refuse',short)==refusal)
    check('new intent after restock can commit',store.checkout(partial,'tenant-R/u1','new-intent',short)['outcome']=='CREATED')
    rejected('missing SKU is known refusal only after canonical validation',lambda:store.canonical(req(('red',True))))
    check('unknown SKU leaves no effect',store.checkout(partial,'tenant-R/u1','missing',req(('not-a-sku',1)))['outcome']=='OUT_OF_STOCK')
    check('no PENDING receipt is ever committed',scalar(partial,"SELECT count(*) FROM idempotency WHERE outcome='PENDING'")==0)

    last=home/'race-last.db';store.initialize(last,{'rare':1,'common':10})
    raced=parallel(6,lambda i:store.checkout(last,'tenant-S/u'+str(i),'one',req(('rare',1),('common',2))))
    check('six independent connections last-unit race has one success',sum(r['outcome']=='CREATED' for r in raced)==1,[r['outcome'] for r in raced])
    check('last-unit losers fully roll back other SKU',rows(last,'SELECT sku,on_hand FROM inventory ORDER BY sku')==[('common',8),('rare',0)])
    check('one order plus durable refusals for all contenders',scalar(last,'SELECT count(*) FROM orders')==1 and scalar(last,'SELECT count(*) FROM idempotency')==6)
    same=home/'same.db';store.initialize(same,{'sku':30})
    raced=parallel(5,lambda _:store.checkout(same,'tenant-T/u9','repeat',req(('sku',3))))
    check('five simultaneous same-key requests share original result',len({r['order_id'] for r in raced})==1 and all(r['outcome']=='CREATED' for r in raced))
    check('concurrent same key decrements exactly once',scalar(same,'SELECT on_hand FROM inventory')==27)
    def variant(i):
        try:return store.checkout(same,'tenant-T/u9','contested',req(('sku',2),delivery=f'locker/{i}'))
        except store.KeyConflict:return 'CONFLICT'
    contested=parallel(4,variant)
    check('concurrent parameter variants commit only one binding',contested.count('CONFLICT')==3 and sum(isinstance(r,dict) for r in contested)==1)

    snap=home/'snapshot.db';store.initialize(snap,{'sku':2})
    reader=store.connect(snap);reader.execute('BEGIN');before=reader.execute('SELECT count(*) FROM orders').fetchone()[0]
    store.checkout(snap,'tenant-U/u1','snapshot',req(('sku',1)))
    held=reader.execute('SELECT count(*) FROM orders').fetchone()[0];reader.rollback()
    fresh=reader.execute('SELECT count(*) FROM orders').fetchone()[0];reader.close()
    check('same primary file still returns held old snapshot', (before,held,fresh)==(0,0,1),[before,held,fresh])
    lost=home/'lost.db';store.initialize(lost,{'sku':1})
    rejected('commit with dropped reply is not reported as nonexecution',lambda:store.checkout(lost,'tenant-V/u5','lost',req(('sku',1)),failpoint='lost_reply'),store.LostReply)
    existing=rows(lost,'SELECT order_id FROM orders')[0][0]
    check('same-key recovery reads committed original',store.checkout(lost,'tenant-V/u5','lost',req(('sku',1)))['order_id']==existing)
    check('lost-reply recovery does not decrement twice',scalar(lost,'SELECT count(*) FROM orders')==1 and scalar(lost,'SELECT on_hand FROM inventory')==0)
    for failpoint,code,committed in [('exit_before_commit',23,False),('exit_after_commit',24,True)]:
        path=home/(failpoint+'.db');store.initialize(path,{'process-sku':1})
        program="import sys,json;sys.dont_write_bytecode=True;sys.path.insert(0,sys.argv[1]);from storage import checkout;checkout(sys.argv[2],'tenant-W/u2','recover',json.loads(sys.argv[3]),sys.argv[4])"
        proc=subprocess.run([sys.executable,'-c',program,str(ROOT/'examples/ch37'),str(path),json.dumps(req(('process-sku',1))),failpoint],env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'},capture_output=True,text=True,timeout=10)
        check('actual subprocess '+failpoint,proc.returncode==code,proc.returncode)
        check('reopen reflects correct '+failpoint+' boundary',scalar(path,'SELECT count(*) FROM orders')==int(committed) and scalar(path,'SELECT on_hand FROM inventory')==int(not committed))
        receipt=store.checkout(path,'tenant-W/u2','recover',req(('process-sku',1)))
        check('same-key recovery after '+failpoint,receipt['outcome']=='CREATED' and scalar(path,'SELECT count(*) FROM orders')==1)

    upload=home/'proof.db';store.initialize(upload,{})
    owner='tenant-X/actor-91'
    def seed(uid,expires=None):
        c=store.connect(upload);c.execute("INSERT INTO upload VALUES (?,?,'PENDING',?,37,'sha256:new-same-content',?,NULL)",(owner,uid,'s3://bucket-eu/'+owner+'/'+uid,int(time.time())+1000 if expires is None else expires));c.close()
    def proof(uid,**delta):
        return {'caller':owner,'upload_id':uid,'object_key':'s3://bucket-eu/'+owner+'/'+uid,'version':'v13-opaque','size':37,'checksum':'sha256:new-same-content',**delta}
    for uid in ['alpha','beta','future','expired','locked']:seed(uid,int(time.time())-10 if uid=='expired' else None)
    rejected('original three-field root proof now rejected',lambda:store.publication(upload,owner,'alpha',{'version':'v13-opaque','size':37,'checksum':'sha256:new-same-content'}))
    rejected('same-content proof for other upload ID rejected',lambda:store.publication(upload,owner,'alpha',proof('beta')),store.KeyConflict)
    rejected('foreign-caller proof rejected',lambda:store.publication(upload,owner,'alpha',proof('alpha',caller='tenant-Y/actor-91')),store.KeyConflict)
    for label,delta in [('object-key',{'object_key':proof('beta')['object_key']}),('namespace',{'object_key':proof('alpha')['object_key'].replace('bucket-eu','bucket-us')}),('size',{'size':38}),('checksum',{'checksum':'sha256:different'})]:
        check('PENDING rejects changed '+label,store.publication(upload,owner,'alpha',proof('alpha',**delta)) is None)
    rejected('missing exact version rejected',lambda:store.publication(upload,owner,'alpha',proof('alpha',version='')))
    rejected('extra proof field rejected',lambda:store.publication(upload,owner,'alpha',{**proof('alpha'),'untrusted':True}))
    check('wrong authenticated caller finds no session',store.publication(upload,'tenant-Y/actor-91','alpha',proof('alpha',caller='tenant-Y/actor-91')) is None)
    committed=store.publication(upload,owner,'alpha',proof('alpha'))
    check('complete exact proof commits',committed=={'upload_id':'alpha','state':'COMMITTED','object_version':'v13-opaque'})
    check('complete duplicate proof returns original committed result',store.publication(upload,owner,'alpha',proof('alpha'))==committed)
    for label,delta in [('version',{'version':'v14'}),('namespace',{'object_key':proof('alpha')['object_key'].replace('bucket-eu','bucket-us')}),('size',{'size':38}),('checksum',{'checksum':'sha256:different'})]:
        rejected('COMMITTED retry rejects changed '+label,lambda d=delta:store.publication(upload,owner,'alpha',proof('alpha',**d)),store.KeyConflict)
    check('cleaner never claims COMMITTED',store.publication(upload,owner,'alpha') is None)
    check('expired publisher cannot win before cleaner',store.publication(upload,owner,'expired',proof('expired')) is None)
    competed=parallel(6,lambda i:store.publication(upload,owner,'expired',proof('expired') if i%2 else None))
    check('expired CAS race grants exactly one cleanup ownership',sum(r is not None for r in competed)==1 and next(r for r in competed if r)['state']=='ABORTED')
    check('cleanup retry grants no second deletion ownership',store.publication(upload,owner,'expired') is None)
    check('ABORTED upload cannot publish late',store.publication(upload,owner,'expired',proof('expired')) is None)
    competed=parallel(4,lambda _:store.publication(upload,owner,'beta',proof('beta')))
    check('concurrent exact publication retries all return one identity',all(r==competed[0] for r in competed) and competed[0]['state']=='COMMITTED')
    deadline=int(time.time())+1;c=store.connect(upload);c.execute("UPDATE upload SET expires_at=? WHERE upload_id='locked'",(deadline,));c.execute('BEGIN IMMEDIATE')
    entered=threading.Event()
    def waiting_publish(): entered.set();return store.publication(upload,owner,'locked',proof('locked'))
    with futures.ThreadPoolExecutor(max_workers=1) as pool:
        pending=pool.submit(waiting_publish);entered.wait(2);time.sleep(.05)
        check('publisher really blocks behind another SQLite writer',not pending.done())
        while time.time()<deadline+.02:time.sleep(.01)
        c.commit();c.close()
        check('SQL clock after lock crossing rejects expired publication',pending.result(5) is None)
    check('after crossed deadline cleaner alone owns transition',store.publication(upload,owner,'locked')['state']=='ABORTED')
    check('no late publication resurrects aborted lock waiter',store.publication(upload,owner,'locked',proof('locked')) is None)
    result['passed']=True
except BaseException as error:
 result['passed']=False;result['failure']=repr(error);raise
finally:
 result.update({'checks':checks,'python':sys.version.split()[0],'sqlite':sqlite3.sqlite_version})
 (ROOT/'docs/reviews/ch37-independent-contract-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'passed':result.get('passed'),'checks':len(checks),'failure':result.get('failure')}))
