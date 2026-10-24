import sys
sys.dont_write_bytecode=True
from pathlib import Path
import importlib.util, tempfile, json, hashlib, subprocess, struct
from threading import Barrier
from concurrent.futures import ThreadPoolExecutor
from fractions import Fraction
from math import ceil

root=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('ch28_author_model',root/'examples/ch28/model.py')
model=importlib.util.module_from_spec(spec);spec.loader.exec_module(model)
checks=[];numeric=[]
def check(ok,label):
    if not ok:raise AssertionError(label)
    checks.append(label)
def expect(kind,fn,label):
    try:fn()
    except kind:checks.append(label)
    else:raise AssertionError(label)
def intent(g,ns='finance/prod/risk',**kw):
    d=dict(namespace=ns,expected_generation=g,stable='R17',canary='R18',percent=5,
           salt='fixed-review-盐',cluster='cluster-C',reason='independent rollout')
    d.update(kw);return d
def bucket(*fields):
    d=hashlib.sha256()
    for field in fields:
        data=field.encode();d.update(struct.pack('>I',len(data)));d.update(data)
    return int.from_bytes(d.digest()[:8],'big')%100
def number(label,actual,expected):
    assert actual==expected,(label,actual,expected)
    numeric.append({'name':label,'value':float(actual)})
result={'passed':False,'checks':checks,'numeric':numeric,'scope':'Actual local SQLite and actual Java17 classes; no PG/etcd/cluster/OS suspend or network experiment'}
try:
    with tempfile.TemporaryDirectory(prefix='ch28-independent-') as temp:
        db=Path(temp)/'authority.sqlite';store=model.Store(db,initialize=True)
        ns='finance/prod/risk';other='finance/staging/risk'
        store.seed(ns,generation=700);store.seed(other,generation=700)
        original=intent(700)
        check(store.publish('review-admin','reply-lost',original)==701,'normal publication 700 to 701')
        check(store.publish('review-admin','another-edit',intent(701,percent=20))==702,'separate expansion advances g to 702')
        check(store.publish('review-admin','reply-lost',dict(reversed(list(original.items()))))==701,'lost 201 replay returns original 701 even after another editor reaches 702')
        check(store.snapshot(ns)['generation']==702,'historic replay cannot rewind Current')
        for field,value in [('percent',21),('reason','changed reason'),('salt','other-salt'),('expected_generation',702),('cluster','cluster-D')]:
            changed=dict(original);changed[field]=value
            expect(model.Conflict,lambda d=changed:store.publish('review-admin','reply-lost',d),'same key changed semantic field '+field)
        expect(PermissionError,lambda:store.publish('review-admin','reply-lost',original,authorized=False),'historic replay rechecks authorization')
        barrier=Barrier(2)
        def race(key,draft):
            s=model.Store(db)
            try:
                barrier.wait()
                try:return ('ok',s.publish('review-admin',key,draft))
                except (model.Stale,model.Conflict) as e:return(type(e).__name__,None)
            finally:s.close()
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures=[pool.submit(race,'different-A',intent(702,percent=22)),pool.submit(race,'different-B',intent(702,percent=23))]
            distinct=[f.result() for f in futures]
        check(sorted(x[0] for x in distinct)==['Stale','ok'],'two expected-g writers serialize to one winner')
        check(store.snapshot(ns)['generation']==703,'concurrent edits advance generation once')
        barrier=Barrier(2)
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures=[pool.submit(race,'same-key',intent(703)) for _ in range(2)]
            duplicate=[f.result() for f in futures]
        check(duplicate==[('ok',704),('ok',704)],'concurrent identical keys recover one committed generation')
        barrier=Barrier(2)
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures=[pool.submit(race,'same-key-different',intent(704,percent=24)),pool.submit(race,'same-key-different',intent(704,percent=25))]
            changed_key=[f.result() for f in futures]
        check(sorted(x[0] for x in changed_key)==['Conflict','ok'],'same-key semantic race is conflict rather than second publication')
        check(store.snapshot(ns)['generation']==705,'semantic duplicate never publishes twice')
        for fail in ['release','current','receipt','change']:
            old=store.snapshot(ns);counts=store.counts()
            n={'release':'independent-new-'+fail,'payload':{'timeout_ms':907,'allow':False}}
            expect(RuntimeError,lambda f=fail,new=n:store.publish('review-admin','abort-'+f,intent(705,stable=new['release'],new_content=new),fail_at=f),'actual rollback after '+fail)
            check(store.snapshot(ns)==old and store.counts()==counts,'all records rollback after '+fail)
        check(store.publish('review-admin','rollback',intent(705,canary=None,percent=0,reason='rollback old bytes'))==706,'rollback advances g while retaining R17 bytes')
        snap=store.snapshot(ns)
        check(snap['stable']=='R17' and snap['canary'] is None and set(snap['releases'])=={'R17'},'rollback snapshot carries one whole selected bundle')
        store.publish('review-admin','after-snapshot',intent(706))
        check(store.changes_after(ns,snap['generation'])==('CHANGED',[707]),'publication between full snapshot and subscribe remains discoverable')
        store.compact(ns,707)
        check(store.changes_after(ns,snap['generation'])==('RESET',707),'compaction across refetch-resubscribe gap requests another full snapshot')
        fresh=store.snapshot(ns)
        check(store.changes_after(ns,fresh['generation'])==('IDLE',[]),'current snapshot then subscribe parks at exact current/floor')
        check(store.changes_after(ns,708)==('SYNC_REQUIRED',707),'ahead durable cursor requests synchronization')
        check(store.publish('review-admin','reply-lost',intent(700,ns=other))==701,'same key is namespace scoped')
        expect(model.Conflict,lambda:store.publish('review-admin','rewrite',intent(707,new_content={'release':'R17','payload':{'timeout_ms':908,'allow':True}})),'immutable release ID cannot accept different bundle')
        check(store.snapshot(ns)['generation']==707,'invalid release edit leaves Current unchanged')
        result['sqlite_races']={'different_keys':distinct,'same_key':duplicate,'same_key_changed':changed_key}
        store.close()

        java=Path('/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin')
        sources=[root/'examples/ch28'/p for p in ['ConfigClient.java','WatchHub.java','Cohort.java']]
        sources += [root/'docs/reviews/ch28-independent-Probe.java',root/'docs/reviews/ch28-independent-ReviewProbe.java']
        subprocess.run([str(java/'javac'),'--release','17','-d',temp,*map(str,sources)],check=True,capture_output=True,text=True)
        result['clock']=json.loads(subprocess.check_output([str(java/'java'),'-cp',temp,'Ch28IndependentProbe'],text=True))
        check(all(p['passed'] for p in result['clock']['probes']),'both independent original clock counterexamples are closed')
        result['java']=json.loads(subprocess.check_output([str(java/'java'),'-cp',temp,'Ch28IndependentReviewProbe'],text=True))
        check(result['java']['unicode_bucket']==bucket('finance/prod/risk','固定盐','欧区-prod-17'),'independent Python UTF8 length-prefix SHA256 vector matches Java')
        check(result['java']['prefix_left']==bucket('a','bc','x') and result['java']['prefix_right']==bucket('ab','c','x'),'independent two concatenation tuples use stated encoding without assuming different modulo buckets')

    number('local business reads per second',10000*1000,10000000)
    number('idle watch renewals',Fraction(10000,60),Fraction(500,3))
    number('per-node planned connections',5000*Fraction(7,10),3500)
    number('normal connection nodes',ceil(Fraction(10000,3500)),3)
    number('N-1 nodes',ceil(Fraction(10000,3500))+1,4)
    number('N-1 survivor connections',3*3500,10500)
    number('batch payload bytes',10*10*4000,400000)
    number('cold payload bytes',10000*400000,4000000000)
    number('batch requests per second',Fraction(10000,30),Fraction(1000,3))
    number('namespace payloads per second',Fraction(10000*10,30),Fraction(10000,3))
    number('500 batches bytes per second',500*400000,200000000)
    number('cold bits per second',Fraction(4000000000*8,30),Fraction(3200000000,3))
    number('cold byte floor at 200MB/s',Fraction(4000000000,200000000),20)
    number('connection bytes',10000*64000,640000000)
    number('namespace polling QPS',Fraction(10000*10,5),20000)
    number('poll versus watch ratio',Fraction(20000)/(Fraction(10000,60)),120)
    number('ordinary reconcile batch RPS',Fraction(10000,300),Fraction(100,3))
    number('one broad publish bytes',10000*40000,400000000)
    number('broad admission recipients per second',Fraction(500)/Fraction(1,4),2000)
    number('conservative broad schedule',Fraction(10000,500)*Fraction(1,4),5)
    number('50 broad publications bits per second',50*10000*40000*8,160000000000)
    number('three content copies bytes',2000*4000*30*3,720000000)
    number('critical authority reads',Fraction(1000,10),100)
    result['passed']=True
except BaseException as e:
    result['failure']=repr(e)
    raise
finally:
    result['chapter_sha256']=hashlib.sha256((root/'chapters/ch28.html').read_bytes()).hexdigest()
    result['source_sha256']={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [root/'chapters/ch28.html',*sorted((root/'examples/ch28').rglob('*'))] if p.is_file()}
    out=Path(sys.argv[1]) if len(sys.argv)>1 else root/'docs/reviews/ch28-independent-probe-results.json'
    out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'passed':result['passed'],'sqlite_and_cross_checks':len(checks),'java':result.get('java',{}).get('count'),'clock':len(result.get('clock',{}).get('probes',[])),'numbers':len(numeric),'failure':result.get('failure')}))
