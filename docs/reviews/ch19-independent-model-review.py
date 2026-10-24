"""New inputs against the author's actual SQLite model; no writes to author evidence."""
import sys
sys.dont_write_bytecode=True
from pathlib import Path
import importlib.util, tempfile, threading, concurrent.futures, json, math
root=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('ch19_model',root/'examples/ch19/model.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
checks=[]
def ck(ok,name):
    checks.append({'name':name,'passed':bool(ok)})
    if not ok:raise AssertionError(name)
def reject(fn,name):
    try:fn()
    except m.Reject:ck(True,name)
    else:ck(False,name)
def entity(db,id,owner):
    db.execute('INSERT INTO entity VALUES(?,?,?,0,8,?,0,1)',(id,owner,'session-review','[12.34,179.999]'))
def counts(db,id):
    return tuple(db.execute('SELECT count(*) FROM '+table+' WHERE entity=?',(id,)).fetchone()[0]
                 for table in ['accepted','outbox','receipt'])
result={'checks':checks}
try:
 with tempfile.TemporaryDirectory(prefix='ch19-independent-model-') as temp:
    path=Path(temp)/'locations.db';m.create(path);db=m.connect(path)
    entity(db,84,302)
    base={'entity':84,'session':'session-review','seq':10,'point':[12.3402,-179.999],'observed':2_000_000}
    reply=m.report(db,302,'review-k',base,2_000_100,100)
    ck(reply=={'version':9,'index':'pending'} and counts(db,84)==(1,1,1),'normal durable pending and one charge/event/receipt')
    ck(m.report(db,302,'review-k',base,9_000_000)==reply,'old sample replay returns original before fresh checks')
    reject(lambda:m.report(db,303,'review-k',base,2_000_100),'owner cannot read another receipt')
    reject(lambda:m.report(db,302,'review-k',dict(base,point=[12.34,178]),2_000_100),'same identity changed intent conflicts')
    reject(lambda:m.report(db,302,'new-oldseq',dict(base,seq=9),2_000_100),'new key cannot reuse older device sequence')
    for seq in [11,12]:m.report(db,302,'review-'+str(seq),dict(base,seq=seq),2_000_100)
    ready=threading.Barrier(2)
    def race(seq):
      c=m.connect(path)
      try:
       ready.wait()
       try:return m.report(c,302,'last-review-'+str(seq),dict(base,seq=seq),2_000_100)
       except m.Reject:return None
      finally:c.close()
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
      replies=list(pool.map(race,[13,14]))
    ck(sum(r is not None for r in replies)==1 and counts(db,84)==(4,4,4),'two real SQLite writers compete for fourth rolling-window slot')
    reject(lambda:m.report(db,302,'full',dict(base,seq=20),2_000_101),'fifth accepted report rejected')
    ck(counts(db,84)==(4,4,4),'quota rejection has no event or charged side effect')
    entity(db,85,302)
    b=dict(base,entity=85,seq=1,observed=3_000_000)
    barrier=threading.Barrier(10)
    def same(_):
      c=m.connect(path)
      try:barrier.wait();return m.report(c,302,'ack-lost-review',b,3_000_000)
      finally:c.close()
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:copies=list(pool.map(same,range(10)))
    ck(all(r==copies[0] for r in copies) and counts(db,85)==(1,1,1),'ten same-identity retries create one version/event')
    db.execute('UPDATE entity SET sharing=0 WHERE id=85')
    ck(m.report(db,302,'ack-lost-review',b,9_000_000)==copies[0] and counts(db,85)==(1,1,1),'revoked sharing can replay old receipt without renewed effects')
    reject(lambda:m.report(db,302,'revoked-new',dict(b,seq=2),3_000_000),'revocation blocks new report')
    entity(db,86,302)
    c=dict(base,entity=86,seq=1,observed=4_000_000)
    db.execute("CREATE TRIGGER review_abort BEFORE INSERT ON outbox WHEN NEW.entity=86 BEGIN SELECT RAISE(ABORT,'review outbox fault'); END")
    try:m.report(db,302,'sql-fault',c,4_000_000)
    except m.sqlite3.IntegrityError:ck(True,'real engine outbox exception propagated')
    else:ck(False,'real engine outbox exception propagated')
    ck(counts(db,86)==(0,0,0) and db.execute('SELECT version FROM entity WHERE id=86').fetchone()[0]==8,'engine fault undoes row/quota/receipt atomically')
    db.execute('DROP TRIGGER review_abort')
    m.report(db,302,'sql-fault',c,4_000_000)
    ck(counts(db,86)==(1,1,1),'known rollback permits original identity retry')
    entity(db,87,302);d=dict(base,entity=87,seq=1,observed=5_000_000)
    m.report(db,302,'first',d,5_000_000)
    for seq in [2,3,4]:m.report(db,302,str(seq),dict(d,seq=seq,observed=5_059_999),5_059_999)
    reject(lambda:m.report(db,302,'before-edge',dict(d,seq=5,observed=5_059_999),5_059_999),'rolling minute excludes no report one millisecond early')
    ck(m.report(db,302,'at-edge',dict(d,seq=5,observed=5_060_000),5_060_000)['version']==13,'exact minute removes oldest accepted timestamp')
    # A->B, then delete/re-enter, with deliberate inter-cell crash and old replays.
    m.put(db,'north-parent',701,8,'LIVE',{'point':[1,2],'observed':500})
    reject(lambda:m.apply(db,701,9,'north-parent','east-parent',{'point':[1,3],'observed':501},True),'actual crash after new-cell add leaves retry pending')
    ck(m.snapshot(db,'north-parent')[1][0][2]=='LIVE' and m.snapshot(db,'east-parent')[1][0][2]=='LIVE','add-first crash preserves duplicate recall rather than remove-first hole')
    m.apply(db,701,9,'north-parent','east-parent',{'point':[1,3],'observed':501})
    ck(m.snapshot(db,'north-parent')[1][0][1:3]==(9,'TOMBSTONE'),'retry writes old-cell tombstone')
    m.apply(db,701,11,'east-parent','north-parent',{'point':[1,2],'observed':503})
    m.apply(db,701,10,'east-parent',None,None)
    m.apply(db,701,9,'north-parent','east-parent',{'point':[1,3],'observed':501})
    ck(m.snapshot(db,'north-parent')[1][0][1:3]==(11,'LIVE') and m.snapshot(db,'east-parent')[1][0][1:3]==(11,'TOMBSTONE'),'late delete/add cannot remove newer re-entry or revive old cell')
    rev=m.snapshot(db,'north-parent')[0]
    m.apply(db,701,12,'north-parent','north-parent',{'point':[1,2.0001],'observed':504})
    ck(m.snapshot(db,'north-parent')[1][0][1:3]==(12,'LIVE') and m.snapshot(db,'north-parent')[0]==rev+1,'same-cell move increments revision once without self-tombstone')
    reject(lambda:m.put(db,'north-parent',701,12,'LIVE',{'point':[8,9]}),'equal-version different payload is corruption')
    before=m.snapshot(db,'north-parent')
    reject(lambda:m.put(db,'north-parent',702,1,'LIVE',{'point':[1,2]},True),'revision fault aborts local transaction')
    ck(m.snapshot(db,'north-parent')==before,'local revision and members remain one committed snapshot')
    m.apply(db,701,13,'north-parent',None,None)
    ck(m.put(db,'north-parent',701,12,'LIVE',{})=='STALE','delete tombstone prevents old copy resurrection')
    for child in ['NW','NE','SW','SE']:m.put(db,child,701,13,'TOMBSTONE',None)
    ck(all(m.put(db,child,701,12,'LIVE',{})=='STALE' for child in ['NW','NE','SW','SE']),'unknown-child tombstone guards every child')
    m.put(db,'NE',703,20,'LIVE',{'point':[4,5]})
    for child in ['NW','NE','SW','SE']:m.put(db,child,703,19,'TOMBSTONE',None)
    ck([r for r in m.snapshot(db,'NE')[1] if r[0]==703][0][1:3]==(20,'LIVE'),'broad tombstone copy does not override newer replay')
    # Vector barriers are protocol probes, not actual CDC or leases.
    migration=m.Migration({'p-A':99,'p-B':239,'p-C':579})
    migration.effect_complete('p-A',102);migration.effect_complete('p-A',101)
    migration.effect_complete('p-B',240);migration.effect_complete('p-C',580)
    reject(lambda:migration.cutover({'p-A':102,'p-B':240,'p-C':580},9000),'max-seen A102 cannot cover missing A100')
    ck(migration.applied=={'p-A':99,'p-B':240,'p-C':580},'one hole holds that partition despite other progress')
    migration.effect_complete('p-A',100)
    reject(lambda:migration.cutover({'p-A':102,'p-B':240},9000),'cutover cannot omit relevant partition C')
    migration.cutover({'p-A':102,'p-B':240,'p-C':580},9000)
    ck(migration.targets=={'parent','children'},'after cutover parent still receives dual projection')
    reject(lambda:migration.retire(8999,0),'no readers alone does not permit retirement')
    reject(lambda:migration.retire(9001,2),'expired routes alone do not permit retirement')
    migration.retire(9001,0)
    ck(migration.phase=='RETIRED' and migration.targets=={'children'},'AND retirement leaves only children')
    reject(lambda:migration.cutover({'p-A':102,'p-B':240,'p-C':580},9000),'stale repeated directory CAS refused')
    db.close()
 # Static contract trace: no cache implementation was provided or claimed.
 start=1000;not_after=start+2000;late_fill=2999
 ck(not_after==3000 and late_fill<not_after and 4000>=not_after,'absolute cache trace: late fill leaves 1ms, never renews to4999')
 ck(4000<late_fill+2000,'negative trace: refill-relative TTL would wrongly serve at4000')
 width=360/(2**15)*111*math.cos(math.radians(40));height=180/(2**15)*111
 numbers={'widthKm':width,'heightKm':height,'bboxCounts':[int((math.ceil(2*r/height)+1)*(math.ceil(2*r/width)+1)) for r in [1,2,5,50]],
  'fiveCharBox':(math.ceil(10/(height*8))+1)*(math.ceil(10/(width*4))+1),
  'editsPerSecond':2_000_000*2/365/86400,'queryPeak':8_000_000/86400*12,
  'hotIdMBps':8_000_000/86400*12*.2*10_000*16/1e6,'hotFullMBps':8_000_000/86400*12*.2*10_000*64/1e6,
  'writerPerSecond':80_000*4/60,'historyGBday':80_000*4/60*96*86400/1e9,
  'threeSecondHistoryGBday':80_000*20/60*96*86400/1e9,'distance2sec':60_000/3600*2,'distance30sec':60_000/3600*30,
  'fanoutSteady':20-1+4,'fanoutMigrating':20+4}
 ck(numbers['bboxCounts']==[20,48,216,18094] and numbers['fiveCharBox']==16,'independent local box arithmetic')
 ck(abs(numbers['hotIdMBps']-35.55555555555556)<1e-10 and abs(numbers['hotFullMBps']-142.22222222222223)<1e-10,'independent hot-cell byte rates')
 ck(abs(numbers['historyGBday']-44.2368)<1e-9 and abs(numbers['threeSecondHistoryGBday']-221.184)<1e-9,'independent append history arithmetic')
 result.update(passed=True,numeric=numbers)
except BaseException as error:
 result.update(passed=False,failure=repr(error));raise
finally:
 result['count']=len(checks)
 result['limits']=['Actual SQLite writer lock is coarser than PG row locks.','Migration is a protocol condition probe, not real CDC/leases/projectors.',
   'Cache timing is a contract/negative trace, not an implemented cache test.','Model now/clock_error are trusted test inputs; no production clock, auth, load or network experiment.']
 (root/'docs/reviews/ch19-independent-model-results.json').write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps({'passed':result.get('passed'),'checks':len(checks),'failure':result.get('failure')}))
