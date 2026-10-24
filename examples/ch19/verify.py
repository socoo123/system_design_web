from pathlib import Path
import concurrent.futures, hashlib, json, math, os, shutil, subprocess, sys, tempfile
sys.dont_write_bytecode = True
from model import *
root = Path(__file__).resolve().parents[2]
checks=[]
def check(ok,name):
    if not ok: raise AssertionError(name)
    checks.append(name)
def reject(action,name):
    try: action()
    except Reject: checks.append(name); return
    raise AssertionError(name)
with tempfile.TemporaryDirectory(prefix='ch19-') as tmp:
    database=Path(tmp)/'locations.db';create(database);db=connect(database)
    db.execute('INSERT INTO entity VALUES(1,7,?,0,0,?,0,1)',('session-a','[40, 116]'))
    intent={'entity':1,'session':'session-a','seq':1,'point':[40.001,116.002],'observed':1000}
    check(report(db,7,'r1',intent,1000)=={'version':1,'index':'pending'},'report normal durable pending')
    check(report(db,7,'r1',intent,1000000)['version']==1,'retry receipt precedes age and quota')
    reject(lambda:report(db,7,'r1',dict(intent,point=[0,0]),1000),'same key changed coordinates rejected')
    reject(lambda:report(db,8,'r1',intent,1000),'owner checked before receipt replay')
    for seq in [2,3,4]:report(db,7,'r'+str(seq),dict(intent,seq=seq),1000)
    check(db.execute('SELECT count(*) FROM accepted').fetchone()[0]==4,'four accepted charges')
    reject(lambda:report(db,7,'r5',dict(intent,seq=5),1000),'fifth report rejected')
    check(db.execute('SELECT version FROM entity').fetchone()[0]==4,'quota refusal preserves version')
    check(report(db,7,'r4',dict(intent,seq=4),1000)['version']==4,'full quota retry still replays')
    reject(lambda:report(db,7,'stale',dict(intent,seq=5),100000),'old sample refused')
    reject(lambda:report(db,7,'future',dict(intent,seq=5,observed=103001),100000,3000),'future clock bound refused')
    reject(lambda:report(db,7,'rollback',dict(intent,seq=5,observed=100000),100000,fail_before_commit=True),'injected outbox transaction rollback')
    check(db.execute('SELECT version FROM entity').fetchone()[0]==4 and db.execute('SELECT count(*) FROM outbox').fetchone()[0]==4
          and db.execute('SELECT count(*) FROM receipt').fetchone()[0]==4,'row quota outbox receipt roll back together')
    intent2=dict(intent,seq=5,observed=100000)
    def concurrent_report(_):
        c=connect(database)
        try:return report(c,7,'concurrent',intent2,100000)
        finally:c.close()
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        replies=list(pool.map(concurrent_report,range(24)))
    check(all(r['version']==5 for r in replies),'24 same-key requests recover one version')
    check(db.execute('SELECT count(*) FROM outbox').fetchone()[0]==5 and db.execute('SELECT count(*) FROM accepted').fetchone()[0]==5,
          'concurrent replay charges and publishes once')
    reject(lambda:report(db,7,'late-seq',dict(intent2,seq=4),100000),'delayed device sequence refused')
    reject(lambda:report(db,7,'old-session',dict(intent2,seq=6,session='old'),100000),'inactive session refused')
    db.execute('UPDATE entity SET sharing=0 WHERE id=1')
    reject(lambda:report(db,7,'revoked',dict(intent2,seq=6),100000),'sharing checked before new report')
    check(report(db,7,'concurrent',intent2,100000)['version']==5,'old committed receipt has no renewed side effects')
    db.execute('INSERT INTO entity VALUES(2,7,?,0,0,?,0,1)',('session-a','[0, 0]'))
    second=dict(intent,entity=2,observed=200000)
    db.execute("CREATE TRIGGER reject_outbox BEFORE INSERT ON outbox WHEN NEW.entity=2 BEGIN SELECT RAISE(ABORT,'injected storage failure'); END")
    try: report(db,7,'engine-fail',second,200000)
    except sqlite3.IntegrityError: checks.append('actual SQL outbox insert error propagated')
    else: raise AssertionError('storage failure not raised')
    check(db.execute('SELECT version FROM entity WHERE id=2').fetchone()[0]==0
          and db.execute('SELECT count(*) FROM accepted WHERE entity=2').fetchone()[0]==0,
          'actual SQL outbox failure rolls back earlier row and quota writes')
    db.execute('DROP TRIGGER reject_outbox')
    for seq in [1,2,3]: report(db,7,'second-'+str(seq),dict(second,seq=seq),200000)
    def last_slot(seq):
        c=connect(database)
        try:
            try:return report(c,7,'last-'+str(seq),dict(second,seq=seq),200000)
            except Reject:return None
        finally:c.close()
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        last=list(pool.map(last_slot,[4,5]))
    check(sum(r is not None for r in last)==1,'distinct concurrent reports compete for final quota slot')
    check(db.execute('SELECT version FROM entity WHERE id=2').fetchone()[0]==4
          and db.execute('SELECT count(*) FROM accepted WHERE entity=2').fetchone()[0]==4,
          'final quota slot commits exactly once')
    put(db,'A',9,41,'LIVE',{'point':[0,0],'observed':100})
    reject(lambda:apply(db,9,42,'A','B',{'point':[0,1],'observed':100},True),'crash between cells leaves retry obligation')
    check(snapshot(db,'A')[1][0][2]=='LIVE' and snapshot(db,'B')[1][0][2]=='LIVE','add-first retains recall during apply crash')
    check(apply(db,9,42,'A','B',{'point':[0,1],'observed':100})=='ACK','restart completes conditional remove')
    check(snapshot(db,'A')[1][0][2]=='TOMBSTONE','old cell tombstone retained')
    rev=snapshot(db,'B')[0];apply(db,9,42,'A','B',{'point':[0,1],'observed':100})
    check(snapshot(db,'B')[0]==rev,'duplicate does not increment cell revision')
    apply(db,9,43,'B','A',{'point':[0,0],'observed':101})
    apply(db,9,42,'A','B',{'point':[0,1],'observed':100})
    check(snapshot(db,'A')[1][0][1:3]==(43,'LIVE'),'v42 remove cannot delete v43 re-entry')
    check(snapshot(db,'B')[1][0][1:3]==(43,'TOMBSTONE'),'v42 add cannot revive v43 tombstone')
    apply(db,9,44,'A','A',{'point':[0,.001],'observed':102})
    check(snapshot(db,'A')[1][0][1:3]==(44,'LIVE'),'same-cell movement never self-deletes')
    apply(db,9,45,'A',None,None)
    check(put(db,'A',9,40,'LIVE',{'point':[0,0]})=='STALE','delete tombstone blocks old snapshot')
    reject(lambda:put(db,'A',9,45,'LIVE',{}),'same version incompatible payload signals corruption')
    before=snapshot(db,'A')
    reject(lambda:put(db,'A',10,1,'LIVE',{'point':[0,0]},True),'injected revision update failure')
    check(snapshot(db,'A')==before,'membership and revision transaction rolls back together')
    for child in ['00','01','10','11']:put(db,child,9,45,'TOMBSTONE',None)
    check(all(put(db,c,9,40,'LIVE',{'point':[0,0]})=='STALE' for c in ['00','01','10','11']),
          'unknown-child parent tombstone copied to all children')
    put(db,'00',10,3,'LIVE',{'point':[0,0]})
    check(put(db,'00',10,2,'LIVE',{'point':[0,1]})=='STALE','late snapshot copy cannot override replay')
    for c in ['00','01','10','11']:put(db,c,10,2,'TOMBSTONE',None)
    check(snapshot(db,'00')[1][-1][1:3]==(3,'LIVE'),'broad tombstone copy preserves newer live replay')
    m=Migration({0:9,1:19});m.effect_complete(0,11);m.effect_complete(1,20)
    reject(lambda:m.cutover({0:11,1:20},5000),'maximum-seen offset with a gap cannot cut over')
    check(m.applied=={0:9,1:20},'contiguous prefix stays behind incomplete offset')
    m.effect_complete(0,10)
    check(m.applied[0]==11,'completion of missing offset advances contiguous prefix')
    reject(lambda:m.cutover({0:11},5000),'missing source partition cannot cut over')
    m.cutover({0:11,1:20},5000)
    check(m.phase=='CHILDREN' and m.targets=={'parent','children'},'cutover keeps dual projection for old readers')
    reject(lambda:m.retire(4999,0),'no readers does not waive old route lifetime')
    reject(lambda:m.retire(5001,1),'route expiry does not waive old in-flight reader')
    m.retire(5001,0)
    check(m.phase=='RETIRED' and m.targets=={'children'},'retirement requires both conditions')
    reject(lambda:m.cutover({0:11,1:20},5000),'duplicate epoch transition refused')
    db.close()
    java_home=os.environ.get('JAVA_HOME_19','/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home')
    javac=str(Path(java_home)/'bin/javac') if Path(java_home,'bin/javac').exists() else shutil.which('javac')
    java=str(Path(java_home)/'bin/java') if Path(java_home,'bin/java').exists() else shutil.which('java')
    compiled=Path(tmp)/'classes';compiled.mkdir()
    subprocess.run([javac,'--release','17','-d',str(compiled),str(root/'examples/ch19/Nearby.java'),str(root/'examples/ch19/NearbyTest.java')],check=True)
    javaversion=subprocess.run([java,'-version'],capture_output=True,text=True,check=True).stderr.splitlines()[0]
    javaresult=json.loads(subprocess.run([java,'-ea','-cp',str(compiled),'NearbyTest'],capture_output=True,text=True,check=True).stdout)
    check(javaresult['passed'],'actual Java17 compile and tests')
# Decimal arithmetic and geometric illustration use the stated 111 km/degree approximation.
w=360/32768*111*math.cos(math.radians(40));h=180/32768*111
numeric={'widthKm':w,'heightKm':h,'northSecondBeginsKm':1.5*h,'cornerDistanceKm':math.hypot(w/2,1.5*h),
 'bbox1':(math.ceil(2/h)+1)*(math.ceil(2/w)+1),'bbox2':(math.ceil(4/h)+1)*(math.ceil(4/w)+1),
 'bbox5':(math.ceil(10/h)+1)*(math.ceil(10/w)+1),'bbox50':(math.ceil(100/h)+1)*(math.ceil(100/w)+1),
 'editsPerSecond':2e6*2/365/86400,'queryPeak':8e6/86400*12,'egressMBps':8e6/86400*12*4000/1e6,
 'hotSnapshotMBps':8e6/86400*12*.2*10000*64/1e6,'moverWritesPerSecond':80000*4/60,
 'historyGBPerDay':80000*4/60*96*86400/1e9,'history3sGBPerDay':80000*20/60*96*86400/1e9}
check([numeric[k] for k in ['bbox1','bbox2','bbox5','bbox50']]==[20,48,216,18094],'local geometry fanout recomputed')
result={'passed':True,'checks':checks,'sqliteChecks':len(checks)-2,'javaVersion':javaversion,'java':javaresult,'numeric':numeric,
 'files':{str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [root/'chapters/ch19.html',*sorted((root/'examples/ch19').glob('*'))] if p.is_file()},
 'limits':['SQLite writer serialization is coarser than PostgreSQL row locks.','Migration checks are a protocol model, not real CDC/leases/queue/failover.','Java uses one chosen sphere, not ellipsoid/GPS accuracy.','No load or SLO measurement.']}
(root/'docs/reviews/ch19-code-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'passed':True,'checks':len(checks),'java':javaresult,'javaVersion':javaversion}))
