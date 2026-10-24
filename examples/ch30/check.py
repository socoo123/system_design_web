"""Deterministic SQLite + Java17 chapter checks, using no external packages."""
from pathlib import Path
import hashlib
import json
import math
import subprocess
import sys
import tempfile
import threading
from model import Catalog, Denied

ROOT = Path(__file__).resolve().parents[2]
checks=[]

def check(name, ok):
    if not ok: raise AssertionError(name)
    checks.append(name)

def denied(name, fn, error=(Denied,ValueError)):
    try: fn()
    except error: checks.append(name); return
    raise AssertionError(name+' unexpectedly succeeded')

def receipts(expected, pool='g1'):
    return dict(text=dict(expected['text']),bm25=dict(expected['children']),dense=dict(expected['children']),pool=pool,splitter='s1')

with tempfile.TemporaryDirectory(prefix='ch30-') as temp:
    db=str(Path(temp)/'catalog.db'); a=Catalog(db); b=Catalog(db)
    a.membership('t','u',['staff']); a.membership('other','u',['staff'])
    def stage(doc,rev=1,seq=1,pool='g1',text='public'):
        event=f't/{doc}/{seq}/{pool}'
        job=a.accept(event,'t',doc,seq,rev,text,(pool,))[0]
        epoch=a.claim(job,'worker')
        key=f't/{doc}/{rev}/{pool}/s1/0:100'
        digest=a.put_chunk(key,'t',doc,rev,pool,0,100,text)
        manifest={'children':{key:digest},'text':{key:digest}}
        if doc=='d1':
            parent=f't/{doc}/{rev}/{pool}/s1/0:200'
            parent_hash=a.put_chunk(parent,'t',doc,rev,pool,0,200,'public + secret')
            manifest['text'][parent]=parent_hash
        a.freeze_manifest(job,manifest['children'],manifest['text'])
        a.policy('t',doc,['staff'],[(0,100,['staff'])],rev)
        return job,epoch,key,manifest
    job,epoch,key,m=stage('d1')
    check('durable accept has no published state',a.db.execute('SELECT count(*) FROM published').fetchone()[0]==0)
    check('duplicate event returns original job',a.accept('t/d1/1/g1','t','d1',1,1,'public',('g1',))==[job])
    denied('duplicate event changed text conflicts',lambda:a.accept('t/d1/1/g1','t','d1',1,1,'different',('g1',)))
    denied('partial dense receipt cannot publish',lambda:a.publish(job,'worker',epoch,{**receipts(m),'dense':{}}))
    denied('wrong pool receipt cannot publish',lambda:a.publish(job,'worker',epoch,receipts(m,'g2')))
    denied('wrong hash receipt cannot publish',lambda:a.publish(job,'worker',epoch,{**receipts(m),'bm25':{key:'wrong'}}))
    denied('manifest cannot silently shrink',lambda:a.freeze_manifest(job,{}))
    denied('immutable chunk cannot change bytes',lambda:a.put_chunk(key,'t','d1',1,'g1',0,100,'changed'))
    denied('transaction rollback between publication/job completion',lambda:a.publish(job,'worker',epoch,receipts(m),True),(RuntimeError,))
    check('rollback leaves old current absent',a.db.execute('SELECT count(*) FROM published').fetchone()[0]==0)
    result=a.publish(job,'worker',epoch,receipts(m))
    check('publish stores saved result',a.db.execute('SELECT state,result FROM job WHERE id=?',(job,)).fetchone()[:]==('done',result))
    check('lost ACK duplicate publication returns same result',b.publish(job,'new-owner',-1,{})==result)
    pack=a.pin('t','u','g1',[key]); check('normal full pack recheck',a.check_pack('t','u','g1',pack))
    denied('cross tenant candidate rejected before text use',lambda:a.pin('other','u','g1',[key]))
    denied('wrong bundle pool is rejected',lambda:a.pin('t','u','g2',[key]))
    denied('authority timeout fails closed',lambda:a.check_pack('t','u','g1',pack,False))
    # Parent contains an authorized child plus a denied range.
    parent='t/d1/1/g1/s1/0:200'
    check('parent persisted only in text manifest',parent in json.loads(result)['text'] and parent not in json.loads(result)['children'])
    a.policy('t','d1',['staff'],[(0,100,['staff']),(100,200,['executive'])])
    check('child remains accessible',len(a.pin('t','u','g1',[key]))==1)
    denied('whole parent requires every covered range',lambda:a.pin('t','u','g1',[parent],indexed=False))
    a.policy('t','d1',['staff'],[(0,99,['staff'])])
    denied('ACL coverage gap does not default allow',lambda:a.pin('t','u','g1',[key]))
    a.policy('t','d1',['staff'],[(0,200,['staff'])])
    check('fully authorized published parent readable',len(a.pin('t','u','g1',[parent],indexed=False))==1)
    denied('parent cannot masquerade as indexed child',lambda:a.pin('t','u','g1',[parent]))
    extra='staging-extra'
    a.put_chunk(extra,'t','d1',1,'g1',0,100,'same rev staging')
    denied('same tenant/rev/pool staging excluded by published manifest',lambda:a.pin('t','u','g1',[extra]))
    denied('same staging excluded as parent text too',lambda:a.pin('t','u','g1',[extra],indexed=False))
    pack=a.pin('t','u','g1',[key])
    denied('invalid citation0',lambda:a.release('t','u','g1',pack,[0],lambda:'SUPPORTED',lambda:None))
    denied('unpacked citation2',lambda:a.release('t','u','g1',pack,[2],lambda:'SUPPORTED',lambda:None))
    denied('bool is not an integer citation',lambda:a.release('t','u','g1',pack,[True],lambda:'SUPPORTED',lambda:None))
    denied('support UNKNOWN blocks release',lambda:a.release('t','u','g1',pack,[1],lambda:'UNKNOWN',lambda:None))
    denied('unsupported claim blocks release',lambda:a.release('t','u','g1',pack,[1],lambda:'UNSUPPORTED',lambda:None))
    sent=[]; a.release('t','u','g1',pack,[1],lambda:'SUPPORTED',lambda:sent.append('ok'))
    check('normal supported sentence emitted',sent==['ok'])
    # Slow support judge: B is in prompt, but sentence cites only A. Revoke B.
    j2,e2,key2,m2=stage('private');a.publish(j2,'worker',e2,receipts(m2))
    full=a.pin('t','u','g1',[key,key2]); judge_started=threading.Event();revoked=threading.Event(); outcome=[]
    def worker():
        c=Catalog(db)
        def slow_judge():
            judge_started.set();revoked.wait(3);return 'SUPPORTED'
        try:c.release('t','u','g1',full,[1],slow_judge,lambda:outcome.append('LEAK'))
        except Denied:outcome.append('blocked')
        finally:c.db.close()
    thread=threading.Thread(target=worker);thread.start();check('slow judge starts',judge_started.wait(3))
    b.policy('t','private',['executive'],[(0,100,['executive'])]);revoked.set();thread.join(4)
    check('uncited B revoked during judge discards entire draft',not thread.is_alive() and outcome==['blocked'])
    # Membership changes also invalidate packs even if the remaining group still allows.
    b.membership('t','u',['staff','extra'])
    denied('membership epoch change invalidates old pack',lambda:a.check_pack('t','u','g1',pack))
    pack=a.pin('t','u','g1',[key]);b.membership('t','u',[],False)
    denied('subject deactivation invalidates pack',lambda:a.check_pack('t','u','g1',pack))
    b.membership('t','u',['staff'])
    # Approval before revoke may still send later: this is the declared check/send gap.
    pack=a.pin('t','u','g1',[key]);a.check_pack('t','u','g1',pack);b.delete('t','d1')
    sent.append('already-approved-in-flight')
    check('check/send gap is represented rather than denied',sent[-1]=='already-approved-in-flight')
    denied('check after tombstone rejects entire pack',lambda:a.check_pack('t','u','g1',pack))
    denied('delete cannot be revived by a later content event',lambda:a.accept('revive','t','d1',3,3,'new'))
    # Actual SQLite transactions preserve source/job receipt atomicity.
    denied('failed accept transaction rolls back',lambda:a.accept('fail','t','rollback',1,1,'x',fail=True),(RuntimeError,))
    check('rolled-back document absent',a.db.execute('SELECT count(*) FROM doc WHERE id="rollback"').fetchone()[0]==0)
    check('rolled-back event receipt absent',a.db.execute('SELECT count(*) FROM receipt WHERE event="fail"').fetchone()[0]==0)
    # Lease takeover, lock-time samples, and target-revision fencing.
    j,e,k,mm=stage('lease');a.time(100);new_epoch=b.claim(j,'replacement')
    check('lease equality expires and increments epoch',new_epoch==e+1)
    denied('stale owner cannot publish',lambda:a.publish(j,'worker',e,receipts(mm)))
    check('replacement can publish',bool(b.publish(j,'replacement',new_epoch,receipts(mm))))
    j,e,k,mm=stage('expired');a.time(200)
    denied('expired claim cannot publish',lambda:a.publish(j,'worker',e,receipts(mm)))
    j,e,k,mm=stage('updated');a.accept('newtarget','t','updated',2,2,'new')
    denied('old revision cannot publish after target advances',lambda:a.publish(j,'worker',e,receipts(mm)))
    denied('stale source cursor rejected',lambda:a.accept('older','t','updated',1,1,'old'))
    j,e,k,mm=stage('deleted');b.delete('t','deleted')
    denied('old worker cannot publish after delete',lambda:a.publish(j,'worker',e,receipts(mm)))
    # current is per pool; global deny applies to both. Fixture insert models ready g2.
    j,e,k,mm=stage('dual');a.publish(j,'worker',e,receipts(mm))
    jg=a.accept('dual2','t','dual',2,2,'new',('g2',))[0];eg=a.claim(jg,'w2')
    kg='t/dual/2/g2/s1/0:100';hg=a.put_chunk(kg,'t','dual',2,'g2',0,100,'new')
    a.freeze_manifest(jg,{kg:hg});a.policy('t','dual',['staff'],[(0,100,['staff'])],rev=2)
    a.publish(jg,'w2',eg,receipts({'children':{kg:hg},'text':{kg:hg}},'g2'))
    check('pool g1 keeps independent old current',a.pin('t','u','g1',[k])[0].rev==1)
    check('pool g2 has its own new current',a.pin('t','u','g2',[kg])[0].rev==2)
    b.delete('t','dual')
    denied('global tombstone blocks g1 rollback visibility',lambda:a.pin('t','u','g1',[k]))
    denied('global tombstone blocks g2',lambda:a.pin('t','u','g2',[kg]))
    a.db.close();b.db.close()

# Independent arithmetic checks; all numbers are teaching assumptions.
nums=[('chunks',1+math.ceil((2000-512)/448),5),('tail',2000-4*448,208),
 ('embedded/doc',4*512+208,2256),('full chunks',100000*5,500000),
 ('full tokens',100000*2256,225600000),('daily chunks',1000*5,5000),
 ('daily tokens',1000*2256,2256000),('vector bytes',500000*768*4,1536000000),
 ('two copies',2*1536000000,3072000000),('two pools/two copies',4*1536000000,6144000000),
 ('rerank/s',40*80,3200),('full corpus pairs/s',40*500000,20000000),
 ('work factor',20000000/3200,6250),('input tokens/s',40*5120,204800),
 ('output tokens/s',40*512,20480),('context',4096+1024+512,5632),
 ('path ms',30+60+max(80,100)+40+250+20,500),('remaining ms',700-500,200),
 ('double rerank',40*160,6400)]
for name,value,want in nums:check(name,value==want)
check('overlap fraction',64/512==0.125);check('corpus growth',abs(2256/2000-1-0.128)<1e-12)
java='/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin/java'
run=subprocess.run([java,str(ROOT/'examples/ch30/RagCore.java')],capture_output=True,text=True,check=True)
check('Java17 actual execution', '20 assertions passed' in run.stdout)
files=[ROOT/'chapters/ch30.html',*(ROOT/'examples/ch30').glob('*')]
result=dict(passed=True,sqlite_assertions=len(checks)-len(nums)-3,numeric_assertions=len(nums)+2,
 java_stdout=run.stdout.strip(),checks=checks,
 sha256={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files if p.is_file()},
 limits=['SQLite BEGIN IMMEDIATE is coarser than PostgreSQL row locks',
 'Index receipts, encoder, source snapshot/change stream, authn, tokenizer and support verdicts are trusted fixtures',
 'No actual ANN/BM25/embedding/LLM/PG vendor semantics, physical erase, cluster failover, throughput or production reliability verified'])
out=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'docs/reviews/ch30-code-results.json'
out.write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ('checks','sha256')},ensure_ascii=False))
