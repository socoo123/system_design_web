"""Independent Ch35 inputs. Does not import or copy the author's test fixtures."""
from pathlib import Path
import concurrent.futures as futures
from decimal import Decimal as D
import hashlib
import json
import math
import os
import subprocess
import sys
import tempfile
import threading
import time

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'examples/ch35'))
import ledger as L
report={'checks':[],'newInputScope':'Direct independent ledger calls, not author tests/root probes.'}


def check(value,label,observed=None):
    report['checks'].append({'label':label,'passed':bool(value),'observed':observed})
    if not value:raise AssertionError(label)


def rejected(fn,label):
    try:fn()
    except L.Refused as error:check(True,label,str(error))
    else:check(False,label)


def fixture(path,slots=3,tkv=13,rkv=11):
    db=L.connect(path);L.init(db)
    m={'weights':'sha:independent-weight','tokenizer':'sha:tok2','prompt':'sha:prompt2',
       'image':'sha:img2','config':'sha:context16k','api':'chat-v1','state':'s1'}
    bundles=[L.register(db,m|change) for change in [{},{'weights':'sha:weight3'},{'state':'s2'},{'api':'chat-v2'}]]
    db.execute("INSERT INTO tenant(id,tier,slots,kv) VALUES('team','shared',?,?)",(slots,tkv))
    for identity,bundle in zip(['blue','green','bad-state','bad-api'],bundles):
        db.execute("INSERT INTO replica VALUES(?,41,?,'ctx16k','shared',1,0,?,?,0,0)",(identity,bundle,slots,rkv))
    endpoints=[['blue',41,bundles[0],'ctx16k']]
    L.publish(db,'seed-independent',0,{bundles[0]:100},endpoints,10000,'independent-reviewer')
    return db,bundles


def request(bundle,rid='ind-1',kv=5,deadline=700,rev=1,worker='blue'):
    return {'tenant':'team','rid':rid,'body':'sha:input-123-outputcap1024','bundle':bundle,
            'profile':'ctx16k','epoch':41,'replica':worker,'kv':kv,'rev':rev,'deadline':deadline}


def counters(db):
    return [tuple(r) for r in db.execute('SELECT used_slots,used_kv FROM tenant')], [tuple(r) for r in db.execute('SELECT used_slots,used_kv FROM replica ORDER BY id')]


def race(path,n,fn):
    barrier=threading.Barrier(n)
    def work(i):
        db=L.connect(path)
        try:
            barrier.wait()
            try:return fn(db,i)
            except L.Refused:return 'refused'
        finally:db.close()
    with futures.ThreadPoolExecutor(n) as pool:return list(pool.map(work,range(n)))


def probes():
  with tempfile.TemporaryDirectory(prefix='ch35-independent-') as folder:
    def fresh(name,**kw):
        p=str(Path(folder)/(name+'.db'));return p,*fixture(p,**kw)
    path,db,b=fresh('normal')
    q=request(b[0]);held=L.reserve(db,q,lambda:20)
    check(held['state']=='HELD' and held['deadline']==700,'normal exact bundle hold')
    check(not L.reserve(db,q,lambda:30)['created'],'same key reads hold without a second debit')
    rejected(lambda:L.reserve(db,q|{'body':'sha:changed'},lambda:30),'same request key with changed body fails')
    rejected(lambda:L.reserve(db,q|{'kv':6},lambda:30),'same request key cannot enlarge KV hold')
    check(L.begin_dispatch(db,'team','ind-1',lambda:21),'first dispatch intent wins')
    check(not L.begin_dispatch(db,'team','ind-1',lambda:22),'observed DISPATCHING never authorizes resend')
    check(L.consume(db,'team','ind-1','blue',41,b[0],lambda:23),'one exact worker launch permit')
    check(not L.consume(db,'team','ind-1','blue',41,b[0],lambda:24),'observed RUNNING never authorizes relaunch')
    check(not L.expire(db,'team','ind-1',lambda:900),'late TTL cannot release running resources')
    check(not L.release(db,'team','ind-1','blue',41),'release is forbidden before retirement')
    check(L.retire(db,'team','ind-1'),'retirement begins without refund')
    check(L.one(db,"SELECT used_kv FROM replica WHERE id='blue'")['used_kv']==5,'retirement retains KV credit')
    check(not L.release(db,'team','ind-1','blue',40),'stale incarnation completion refused')
    check(L.release(db,'team','ind-1','blue',41),'injected trusted all-work completion releases')
    check(not L.release(db,'team','ind-1','blue',41),'duplicate completion cannot double refund')
    check(all(value==(0,0) for group in counters(db) for value in group),'normal two ledgers end zero')
    db.close()

    path,db,b=fresh('kv-race',slots=5,tkv=30,rkv=9)
    got=race(path,5,lambda conn,i:L.reserve(conn,request(b[0],f'kv-{i}',5),lambda:10)['created'])
    check(got.count(True)==1,'independent five-connection KV race has one winner',got)
    check(L.one(db,"SELECT used_slots,used_kv FROM replica WHERE id='blue'")['used_kv']==5,'KV constrained while four sequence slots remain')
    check(L.one(db,"SELECT used_kv FROM tenant WHERE id='team'")['used_kv']==5,'replica rejection rolls back tenant debit')
    db.close()
    path,db,b=fresh('sequence-race',slots=1,tkv=90,rkv=90)
    got=race(path,5,lambda conn,i:L.reserve(conn,request(b[0],f'seq-{i}',3),lambda:10)['created'])
    check(got.count(True)==1,'independent five-connection sequence race has one winner',got)
    check(L.one(db,'SELECT count(*) n FROM permit')['n']==1,'losing sequence contenders create no permit')
    db.close()
    path,db,b=fresh('partial')
    old=counters(db)
    try:L.reserve(db,request(b[0]),lambda:10,fail_after_tenant=True)
    except RuntimeError:pass
    check(counters(db)==old,'partial debit exception rolls back both dimensions')
    check(L.one(db,'SELECT count(*) n FROM permit')['n']==0,'partial debit creates no identity')
    db.close()

    # Different from the author's logical dictionary test: actual monotonic time
    # advances beyond an 80ms deadline while a separate writer holds the DB.
    timing=[]
    for operation in ['reserve','begin_dispatch','consume','expire']:
        path,db,b=fresh('clock-'+operation)
        q=request(b[0],deadline=80)
        if operation!='reserve':L.reserve(db,q,lambda:0)
        if operation=='consume':L.begin_dispatch(db,'team','ind-1',lambda:1)
        locker=L.connect(path);locker.execute('BEGIN IMMEDIATE')
        started=threading.Event();samples=[];zero=time.monotonic()
        def clock():
            value=int((time.monotonic()-zero)*1000);samples.append(value);return value
        def blocked():
            conn=L.connect(path);started.set()
            try:
                if operation=='reserve':return L.reserve(conn,q,clock)
                if operation=='begin_dispatch':return L.begin_dispatch(conn,'team','ind-1',clock)
                if operation=='consume':return L.consume(conn,'team','ind-1','blue',41,b[0],clock)
                return L.expire(conn,'team','ind-1',clock)
            except L.Refused:return 'refused'
            finally:conn.close()
        with futures.ThreadPoolExecutor(1) as pool:
            pending=pool.submit(blocked);started.wait(2);time.sleep(.13)
            check(not samples and not pending.done(),operation+' does not sample time before lock acquisition')
            locker.execute('COMMIT');outcome=pending.result(5)
        check(len(samples)==1 and samples[0]>=80,operation+' samples elapsed clock after deadline',samples)
        if operation=='reserve':
            check(outcome=='refused' and L.one(db,'SELECT count(*) n FROM permit')['n']==0,'lock-delayed reserve rejects without debit')
        elif operation=='expire':
            check(outcome is True and L.permit(db,'team','ind-1')['state']=='EXPIRED','lock-delayed unissued hold expires')
        else:
            check(outcome is False,operation+' cannot grant work after waiting past deadline')
        if operation=='consume':
            check(L.permit(db,'team','ind-1')['state']=='DISPATCHING','late consume leaves uncertain dispatch credit held')
        timing.append({'operation':operation,'clockSamplesMs':samples,'outcome':str(outcome)})
        locker.close();db.close()
    report['realLockWaits']=timing

    path,db,b=fresh('publication-drain',slots=4,tkv=40,rkv=32)
    for rid in ['active','held','uncertain']:L.reserve(db,request(b[0],rid,4),lambda:10)
    L.begin_dispatch(db,'team','active',lambda:11);L.consume(db,'team','active','blue',41,b[0],lambda:12)
    L.begin_dispatch(db,'team','uncertain',lambda:11)
    rejected(lambda:L.begin_drain(db,'blue'),'routed worker cannot drain')
    candidate=[['green',41,b[1],'ctx16k']]
    got=race(path,3,lambda conn,i:L.publish(conn,f'new-{i}',1,{b[1]:7},candidate,9000,'independent'))
    check(got.count(2)==1 and got.count('refused')==2,'three publishers CAS one expected revision',got)
    check(L.permit(db,'team','active')['bundle']==b[0],'new publication preserves active old bundle')
    rejected(lambda:L.reserve(db,request(b[0],'stale'),lambda:20),'old cached revision cannot create a new hold')
    for worker,bundle in [('bad-state',b[2]),('bad-api',b[3])]:
        rejected(lambda w=worker,k=bundle:L.publish(db,w,2,{k:1},[[w,41,k,'ctx16k']],9000,'independent'),worker+' incompatible schema blocks publication')
    check(L.one(db,'SELECT rev FROM control')['rev']==2,'failed compatibility does not advance revision')
    L.begin_drain(db,'blue')
    check(L.permit(db,'team','held')['state']=='EXPIRED','drain expires only unissued held reservation')
    check(not L.unload(db,'blue'),'active and uncertain credit blocks unload')
    check(L.consume(db,'team','uncertain','blue',41,b[0],lambda:20),'already granted old dispatch may start inside original deadline')
    rejected(lambda:L.publish(db,'rollback',2,{b[0]:1},[['blue',41,b[0],'ctx16k']],9000,'independent'),'draining old worker cannot be hot rollback target')
    for rid in ['active','uncertain']:
        check(L.retire(db,'team',rid),'retire original '+rid)
        check(L.release(db,'team',rid,'blue',41),'trusted completion for original '+rid)
    check(L.unload(db,'blue'),'unload succeeds after all physical-completion fixtures release')
    check(not L.consume(db,'team','active','blue',41,b[0],lambda:21),'unloaded/terminal work cannot restart')
    db.close()

  numbers={'active':D(20)*8,'slots':math.ceil(D(160)/32),'normal':math.ceil(D(20)/(D(4)*D('.8'))),
      'nine_survivors':6*D('3.2'),'lost_fraction':D('.8')/20,'eleven_survivors':7*D('3.2'),
      'ten_survivors':6*D('3.2'),'overlap':9+9+2,'startup':9+1+2,'ready_seconds':D(40)/2+100,
      'nine_shared_download_lower_bound':D(9)*40/2,'queue_mean':D(20)*D('.2'),
      'canary_requests':D(20)*D('.1')*300,'aggregate_errors':D('.05')*D('.1'),
      'kv_MiB':(80-40-8-8)*1024,'long_short_work_ratio':D(16)*32000/(16*4000)}
  expected=[160,5,7,D('19.2'),D('.04'),D('22.4'),D('19.2'),20,12,120,180,4,600,D('.005'),24576,8]
  for (label,value),want in zip(numbers.items(),expected):check(value==want,'independent numeric '+label,str(value))
  # Enumerate every smaller balanced deployment, rather than assuming eleven is minimal.
  check(all((n-math.ceil(n/3))*D('3.2')<20 for n in range(1,11)) and (11-4)*D('3.2')>=20,
        'eleven is minimal balanced three-domain count at the same 80 percent budget')
  report['numbers']={k:str(v) for k,v in numbers.items()}
  jdk=subprocess.run(['/usr/libexec/java_home','-v','17'],capture_output=True,text=True,check=True).stdout.strip()
  with tempfile.TemporaryDirectory(prefix='ch35-independent-java-') as folder:
    compiled=subprocess.run([jdk+'/bin/javac','--release','17','-d',folder,str(ROOT/'examples/ch35/Capacity.java')],capture_output=True,text=True)
    check(compiled.returncode==0,'actual Java17 compilation',compiled.stderr)
    executed=subprocess.run([jdk+'/bin/java','-cp',folder,'Capacity'],capture_output=True,text=True)
    check(executed.returncode==0 and 'normal=7' in executed.stdout and 'nodes: 11' in executed.stdout,'actual Java17 output recomputes 160/5/7/11',executed.stdout)
    report['java']={'jdk':jdk,'version':subprocess.run([jdk+'/bin/java','-version'],capture_output=True,text=True).stderr,'stdout':executed.stdout}


try:probes();report['passed']=True
except BaseException as error:
    import traceback
    report['passed']=False;report['failure']=str(error);report['traceback']=traceback.format_exc()
report['count']=len(report['checks'])
report['sourceHashes']={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [ROOT/'chapters/ch35.html',*sorted((ROOT/'examples/ch35').glob('*'))] if p.is_file()}
(ROOT/'docs/reviews/ch35-independent-probe-results.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:report.get(k) for k in ['passed','count','failure']}))
if not report['passed']:raise SystemExit(1)
