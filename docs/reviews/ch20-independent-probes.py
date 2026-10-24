"""Read-only author-source probes; writes only ch20-independent-* evidence."""
from pathlib import Path
import concurrent.futures, hashlib, html, json, re, sqlite3, subprocess, tempfile
from fractions import Fraction
root=Path(__file__).resolve().parents[2]
checks=[]
def ok(test,name):
    if not test:raise AssertionError(name)
    checks.append(name)
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
source=(root/'examples/ch20/apply-event.pseudo').read_text()
insert=re.search(r'inserted = (INSERT[\s\S]*?RETURNING event_id)',source)[1]
select=re.search(r'old = (SELECT[\s\S]*?event_id=:event_id)',source)[1]
update=re.search(r'result = (UPDATE[\s\S]*?RETURNING balance_cents)',source)[1]
receipt=re.search(r'^  (UPDATE inbox[^\n]+)',source,re.M)[1]
class Rejected(Exception):pass
class Unknown(Exception):pass

def apply(path,handler,event,account,delta,crash=None):
    db=sqlite3.connect(path,timeout=15,isolation_level=None)
    args={'handler':handler,'event_id':event,'account_id':account,'delta_cents':delta}
    try:
        db.execute('BEGIN IMMEDIATE')
        if db.execute(insert,args).fetchone() is None:
            row=db.execute(select,args).fetchone()
            if not row or row[2] is None:raise Rejected('incomplete receipt')
            if row[:2]!=(account,delta):raise Rejected('different intent')
            db.commit();return ('REPLAY',row[2])
        if crash=='insert':raise Rejected('injected insert crash')
        row=db.execute(update,args).fetchone()
        if not row:raise Rejected('unknown account')
        if crash=='effect':raise Rejected('injected effect crash')
        args['result']=row[0];db.execute(receipt,args)
        db.commit()
        if crash=='commit':raise Unknown()
        return ('APPLIED',row[0])
    finally:
        if db.in_transaction:db.rollback()
        db.close()

def rejects(fn,name,kind=Rejected):
    try:fn()
    except kind:checks.append(name);return
    raise AssertionError(name)
with tempfile.TemporaryDirectory(prefix='ch20-independent-') as tmp:
    tmp=Path(tmp);database=tmp/'ledger.sqlite'
    with sqlite3.connect(database) as db:
        db.executescript((root/'examples/ch20/schema.sql').read_text())
        db.executemany('INSERT INTO ledger VALUES(?,?)',[('zephyr',900),('tao',-20)])
    ok(apply(database,'settlement-v1','evt-z-9','zephyr',-175)==('APPLIED',725),'negative-cent normal effect and original receipt')
    ok(apply(database,'settlement-v1','evt-z-10','zephyr',12)==('APPLIED',737),'new event mutates balance')
    ok(apply(database,'settlement-v1','evt-z-9','zephyr',-175)==('REPLAY',725),'replay returns original result after later mutation')
    rejects(lambda:apply(database,'settlement-v1','evt-z-9','tao',-175),'same event different account rejected')
    rejects(lambda:apply(database,'settlement-v1','evt-z-9','zephyr',0),'same event different delta rejected')
    for where in ['insert','effect']:
        rejects(lambda:apply(database,'settlement-v1','crash-'+where,'zephyr',999,where),'rollback '+where)
        with sqlite3.connect(database) as db:
            ok(db.execute('SELECT count(*) FROM inbox WHERE event_id=?',('crash-'+where,)).fetchone()[0]==0,'rollback removes incomplete receipt '+where)
            ok(db.execute("SELECT balance_cents FROM ledger WHERE account_id='zephyr'").fetchone()[0]==737,'rollback restores ledger '+where)
    rejects(lambda:apply(database,'settlement-v1','commit-reply-lost','zephyr',5,'commit'),'unknown commit injected',Unknown)
    ok(apply(database,'settlement-v1','commit-reply-lost','zephyr',5)==('REPLAY',742),'unknown commit recovered using same identity and intent')
    rejects(lambda:apply(database,'settlement-v1','missing','nobody',5),'unknown account rolls back')
    with sqlite3.connect(database) as db:
        ok(db.execute("SELECT count(*) FROM inbox WHERE event_id='missing'").fetchone()[0]==0,'unknown account leaves no dedupe receipt')
        db.execute("CREATE TRIGGER fail_receipt BEFORE UPDATE ON inbox WHEN NEW.event_id='receipt-write-fails' BEGIN SELECT RAISE(ABORT,'storage error');END")
    rejects(lambda:apply(database,'settlement-v1','receipt-write-fails','zephyr',777),'actual SQL receipt update error propagated',sqlite3.IntegrityError)
    with sqlite3.connect(database) as db:
        ok(db.execute("SELECT balance_cents FROM ledger WHERE account_id='zephyr'").fetchone()[0]==742,'SQL receipt failure rolls back prior ledger update')
        ok(db.execute("SELECT count(*) FROM inbox WHERE event_id='receipt-write-fails'").fetchone()[0]==0,'SQL receipt failure rolls back inbox insert')
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        results=list(pool.map(lambda _:apply(database,'settlement-v1','simultaneous','zephyr',15),range(32)))
    ok(sum(x[0]=='APPLIED' for x in results)==1,'32 concurrent duplicate deliveries apply exactly one local delta')
    ok(all(x[1]==757 for x in results),'32 duplicate deliveries share original receipt')
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        results=list(pool.map(lambda n:apply(database,'settlement-v1','different-'+str(n),'tao',3),range(24)))
    with sqlite3.connect(database) as db:
        ok(db.execute("SELECT balance_cents FROM ledger WHERE account_id='tao'").fetchone()[0]==52,'24 distinct concurrent deltas have no lost updates in SQLite')
    ok(apply(database,'different-handler','evt-z-9','zephyr',-175)==('APPLIED',582),'namespace negative control: changing handler executes effect again')
    with sqlite3.connect(database) as db:
        db.execute("DELETE FROM inbox WHERE handler='settlement-v1' AND event_id='evt-z-9'")
    ok(apply(database,'settlement-v1','evt-z-9','zephyr',-175)==('APPLIED',407),'retention negative control: premature receipt deletion ends dedupe guarantee')
    with sqlite3.connect(database) as db:
        db.execute("INSERT INTO inbox VALUES('broken','separate-commit','tao',7,NULL)")
    rejects(lambda:apply(database,'broken','separate-commit','tao',7),'split inbox negative control refuses incomplete receipt')
    with sqlite3.connect(database) as db:
        ok(db.execute("SELECT balance_cents FROM ledger WHERE account_id='tao'").fetchone()[0]==52,'split inbox negative control cannot repair omitted effect')
    jdk=Path('/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin')
    subprocess.run([str(jdk/'javac'),'--release','17','-d',str(tmp),str(root/'examples/ch20/PartitionProgress.java'),str(root/'docs/reviews/ch20-independent-ProgressReview.java'),str(root/'examples/ch20/PartitionProgressTest.java')],check=True,capture_output=True,text=True)
    oracle=json.loads(subprocess.run([str(jdk/'java'),'-ea','-cp',str(tmp),'ProgressReview'],check=True,capture_output=True,text=True).stdout)
    author_suite=subprocess.run([str(jdk/'java'),'-ea','-cp',str(tmp),'PartitionProgressTest'],check=True,capture_output=True,text=True).stdout.strip()
    ok(oracle['passed'],'independent Java oracle and lifecycle probes execute actual core')
    ok('123' in author_suite,'author Java suite rerun with isolated output only')
# Independent exact recomputation of author inputs.
peak=Fraction(100_000_000,86400)*10; rate=peak*1024
numbers={'average':float(peak/10),'peak':float(peak),'RF3RetentionTB':100_000_000*1024*7*3/1e12,
 'rawDiskEachGB':100_000_000*1024*7/1e9,'diskUsagePercent':float(Fraction(100_000_000*1024*7,2_000_000_000_000)*100),
 'ingressMBps':float(rate/1e6),'baseEgressMBps':float(rate*4/1e6),'mixedEgressMBps':float((rate*4+40_000_000)/1e6),
 'mixedEgressMbps':float((rate*4+40_000_000)*8/1e6),'mixedWritesMBps':float((rate*3+20_000_000)/1e6),
 'effectiveMembers':(peak+799)//800,'hotKeyPerSec':float(peak/5),'hotKeyBudgetRatio':float(peak/5/800),
 'backlogOneMinute':float((peak-8000)*60),'netDrainPerSec':float(16000-peak),'drainSeconds':float((peak-8000)*60/(16000-peak)),
 'monthTB':100_000_000*1024*30*3/1e12,'yearTB':100_000_000*1024*365*3/1e12,
 'mod48to96':str(Fraction(sum(i%48!=i%96 for i in range(96)),96)),
 'mod48to49':str(Fraction(sum(i%48!=i%49 for i in range(48*49)),48*49))}
ok(numbers['effectiveMembers']==15 and numbers['mod48to96']=='1/2' and numbers['mod48to49']=='48/49','independent count and hash remap arithmetic')
page=(root/'chapters/ch20.html').read_text();sync=[]
for attrs,content in re.findall(r'<pre\b([^>]*)><code[^>]*>(.*?)</code></pre>',page,re.S):
    ref=re.search(r'data-source="([^"]+)"',attrs)[1];value=(root/'examples/ch20'/ref).read_text()
    if ref.endswith('.java'):
        value=value.split('// BEGIN page-progress\n',1)[1].split('    // END page-progress',1)[0]
        value='\n'.join(x[4:] if x.startswith('    ') else x for x in value.splitlines()).rstrip()+'\n'
    ok(html.unescape(content)==value,'independent page/source sync '+ref);sync.append(ref)
result={'passed':True,'checks':checks,'count':len(checks),'java':oracle,'authorJavaSuiteIsolated':author_suite,'sqliteVersion':sqlite3.sqlite_version,
 'numeric':numbers,'pageCodeSources':sync,'files':{str(p.relative_to(root)):digest(p) for p in [root/'chapters/ch20.html',*sorted((root/'examples/ch20').glob('*'))] if p.is_file()},
 'limits':['No Kafka or PostgreSQL server used.','SQLite BEGIN IMMEDIATE uses a coarser writer lock.','Empty-poll adapter test demonstrates the required traversal; pseudocode is checked separately.']}
(root/'docs/reviews/ch20-independent-probe-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'passed':True,'checks':len(checks),'java':oracle,'numeric':numbers}))
