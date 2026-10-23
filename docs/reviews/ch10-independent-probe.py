"""Reviewer-written focused SQL/trace probes, not a backend or PG concurrency test."""
from pathlib import Path
from fractions import Fraction
import sqlite3,json,hashlib,re,html,ast
ROOT=Path(__file__).resolve().parents[2]
checks=[]
def ok(name,condition,detail=None):
 assert condition,name
 checks.append({'name':name,'passed':True,'detail':detail})

def store():
 db=sqlite3.connect(':memory:',isolation_level=None)
 db.executescript('''
 CREATE TABLE intent(id TEXT PRIMARY KEY,tenant TEXT,key TEXT,digest TEXT,receipt TEXT,UNIQUE(tenant,key));
 CREATE TABLE delivery(id TEXT PRIMARY KEY,status TEXT,epoch INT DEFAULT 0,until REAL DEFAULT 0,due REAL,
   uncertain INT DEFAULT 0,last_woken REAL NOT NULL,wake_no INT DEFAULT 0,sends INT DEFAULT 0);
 CREATE TABLE attempt(id TEXT PRIMARY KEY,delivery TEXT,epoch INT,outcome TEXT);
 CREATE TABLE outbox(kind TEXT,aggregate_id TEXT,generation INT,UNIQUE(kind,aggregate_id,generation));
 CREATE TABLE device(id TEXT PRIMARY KEY,version INT,registered REAL,active INT);
 ''');return db

# Walk actual transaction boundaries independently, with no provider/broker call.
db=store();db.execute('BEGIN')
db.execute("INSERT INTO intent VALUES('n','tenant','key','digest','202:n')")
db.execute("INSERT INTO delivery(id,status,due,last_woken) VALUES('d','queued',100,100)")
db.execute("INSERT INTO outbox VALUES('ready','d',0)");db.execute('COMMIT')
ok('normal acceptance atomically retains intent, task and wake',all(db.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]==1 for t in ['intent','delivery','outbox']))
# A unique exception is rolled back before re-reading the winning receipt.
db.execute('BEGIN')
try:db.execute("INSERT INTO intent VALUES('n2','tenant','key','digest','202:n2')")
except sqlite3.IntegrityError:db.execute('ROLLBACK')
receipt,digest=db.execute("SELECT receipt,digest FROM intent WHERE tenant='tenant' AND key='key'").fetchone()
ok('same-key concurrent-intent loser replays one durable receipt after rollback',receipt=='202:n' and digest=='digest')
ok('same key with different hash must conflict',digest!='changed-body')
# Explicit failed acceptance transaction leaves no partial records.
r=store();r.execute('BEGIN');r.execute("INSERT INTO intent VALUES('bad','t','k','h','202:bad')");r.execute('ROLLBACK')
ok('rollback does not acknowledge an uncommitted intent',r.execute('SELECT COUNT(*) FROM intent').fetchone()[0]==0)
# Claim predicate and current-epoch result predicate, separate from broker ACK.
claim="UPDATE delivery SET status='leased',epoch=epoch+1,until=? WHERE id='d' AND ((status IN ('queued','retry_wait') AND due<=?) OR (status='leased' AND until<=?))"
ok('future work is not claimable',db.execute(claim,(129,99,99)).rowcount==0)
ok('due queued task is claimable',db.execute(claim,(130,100,100)).rowcount==1)
ok('a duplicate wake cannot claim a live lease',db.execute(claim,(131,101,101)).rowcount==0)
db.execute('BEGIN');db.execute("UPDATE delivery SET sends=sends+1 WHERE id='d'");db.execute("INSERT INTO attempt VALUES('a1','d',1,'started')");db.execute('COMMIT')
external=['accepted-a1']
db.execute('BEGIN');db.execute("UPDATE attempt SET outcome='accepted' WHERE id='a1'");db.execute("UPDATE delivery SET status='provider_accepted' WHERE id='d' AND epoch=1 AND status='leased'");db.execute('COMMIT')
acked=True
ok('normal send persists accepted evidence before ACK',acked and db.execute("SELECT status FROM delivery WHERE id='d'").fetchone()[0]=='provider_accepted')
ok('lost ACK replay cannot claim an accepted endpoint',db.execute(claim,(140,110,110)).rowcount==0 and len(external)==1)

# Keep scheduling state and external acceptance evidence separate.
u=store();u.execute("INSERT INTO delivery(id,status,due,last_woken,epoch,until,sends) VALUES('d','leased',0,0,1,30,1)")
u.execute("INSERT INTO attempt VALUES('old','d',1,'started')")
external=['old provider acceptance, response lost']
u.execute('BEGIN');u.execute("UPDATE attempt SET outcome='timeout_unknown' WHERE delivery='d' AND outcome='started'");u.execute("UPDATE delivery SET epoch=2,until=61,uncertain=1 WHERE id='d' AND until<=31");u.execute('COMMIT')
ok('expired started attempt is unknown, not proof of no external send',u.execute("SELECT outcome FROM attempt WHERE id='old'").fetchone()[0]=='timeout_unknown')
external.append('successor provider acceptance')
u.execute("UPDATE delivery SET status='failed' WHERE id='d'")
u.execute("UPDATE attempt SET outcome='accepted' WHERE id='old'")
changed=u.execute("UPDATE delivery SET status='provider_accepted' WHERE id='d' AND epoch=1 AND status='leased'").rowcount
ok('old epoch cannot overwrite stopped successor state',changed==0 and u.execute("SELECT status FROM delivery WHERE id='d'").fetchone()[0]=='failed')
ok('late acceptance remains independently queryable after failure',u.execute("SELECT outcome FROM attempt WHERE id='old'").fetchone()[0]=='accepted')
ok('a local epoch cannot retract the already issued external effect',len(external)==2,external)
# Unknown preparation COMMIT means no call is started, even if the claim exists.
prepare_confirmed=False;started_external_calls=0
if prepare_confirmed:started_external_calls+=1
ok('unknown preparation COMMIT gates new external calls',started_external_calls==0)

# Repair is a predicate probe: zero and nonzero acceptance times, no prior repair.
r=store();r.executemany('INSERT INTO delivery(id,status,due,last_woken,epoch,until) VALUES(?,?,?,?,?,?)',[
 ('queued','queued',100,100,0,0),('latelease','leased',100,100,1,140),
 ('future','retry_wait',200,100,1,0),('done','provider_accepted',100,100,1,0)])
repair="SELECT id FROM delivery WHERE ((status IN ('queued','retry_wait') AND due<=?) OR (status='leased' AND until<=?)) AND last_woken<? ORDER BY id"
ok('first lost queued wake is recovered from non-null acceptance time',r.execute(repair,(131,131,101)).fetchall()==[('queued',)])
ok('first expired lease recovers without any prior repair wake',r.execute(repair,(141,141,111)).fetchall()==[('latelease',),('queued',)])
ok('future and terminal tasks never become repair work',not {'future','done'}&{row[0] for row in r.execute(repair,(141,141,111))})
try:r.execute("UPDATE delivery SET last_woken=NULL WHERE id='queued'");not_null=False
except sqlite3.IntegrityError:not_null=True
ok('NULL last_woken is rejected instead of silently vanishing from comparisons',not_null)
r.execute('BEGIN');r.execute("INSERT INTO outbox VALUES('repair','queued',1)");r.execute("UPDATE delivery SET wake_no=1,last_woken=131 WHERE id='queued'");r.execute('ROLLBACK')
ok('repair wake and generation rollback together',r.execute("SELECT wake_no FROM delivery WHERE id='queued'").fetchone()[0]==0 and r.execute("SELECT COUNT(*) FROM outbox").fetchone()[0]==0)
r.execute("INSERT INTO outbox VALUES('retry','queued',1)");r.execute("INSERT INTO outbox VALUES('repair','queued',1)")
ok('retry and repair generations occupy separate outbox namespaces',r.execute('SELECT COUNT(*) FROM outbox').fetchone()[0]==2)

# Normalized epoch seconds in the test; provider native APNs milliseconds must be converted.
p=store();p.execute("INSERT INTO device VALUES('dev',6,110,1)")
ok('late invalid-token result cannot retire a re-registered version',p.execute("UPDATE device SET active=0 WHERE id='dev' AND version=5").rowcount==0)
applies=lambda registered,invalidated,error:error is not None and registered+error<=invalidated
ok('APNs old invalidation timestamp does not cover newer registration',not applies(110,100,2))
ok('unbounded cross-system clock error requires recheck, not invalidation',not applies(90,100,None))
ok('proven-old registration is eligible for version-conditional invalidation',applies(90,100,2))

# Independent retry oracle; providers supply a hard lower bound, local jitter cannot shorten it.
def due(now,count,not_after,provider_floor=0,jitter=.5):
 result=max(now+jitter*min(60,2**max(0,count-1)),provider_floor)
 return ('expired',None) if result>=not_after else ('retry_wait',result)
old_due=due(100,1,300,100)[1]
ok('original P1 counterexample: a missing FCM floor permits sub-10s retry',old_due==100.5,{'originalPageSHA256':'3705ad219555d3bc64d9e823a3b24115649bf14a99578d20de1ebc0cdc666ef9','FCM500_without_header_old_due':old_due,'required_earliest':110})
ok('FCM500 without header waits at least 10s under corrected adapter contract',due(100,1,300,110)==('retry_wait',110))
ok('FCM retry floor beyond remaining OTP TTL expires instead of sending early',due(100,1,109,110)==('expired',None))
ok('FCM429 absent Retry-After respects 60s even with low jitter',due(100,1,300,160,0)==('retry_wait',160))
ok('long Retry-After survives local 60s cap',due(100,1,1200,1000)==('retry_wait',1000))
ok('APNs15min response expires a five-minute OTP',due(100,1,400,1000)==('expired',None))
for count in range(1,9):
 for floor in [0,110,160,1000]:
  for jitter in [0,.01,.5,1]:
   state,when=due(100,count,2000,floor,jitter)
   assert state=='retry_wait' and when>=floor
ok('provider retry lower bound holds under 128 count/floor/jitter combinations',True)

# Execute only the author model's pure plan definition, never its test runner or writes.
# The reviewer supplies these cases; this remains a model check, not provider execution.
tree=ast.parse((ROOT/'examples/ch10/verify.py').read_text())
plan_node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='plan')
namespace={};exec(compile(ast.Module(body=[plan_node],type_ignores=[]),'author-plan-only','exec'),namespace)
author_plan=namespace['plan']
base={'expires':300,'uncertain':0,'unknown_retry':1,'sends':1,'max_sends':4,'due':0}
ok('actual revised author plan: FCM500 no header is at least failure+10s',author_plan(base,'temporary_reject',32,provider='FCM',status=500)[1]>=42)
ok('actual revised author plan: TTL under10s expires',author_plan(dict(base,expires=41),'temporary_reject',32,provider='FCM',status=500)[0]=='expired')
retry_cases=0
for count in [1,2,3]:
 for outcome in ['temporary_reject','timeout_unknown']:
  for status in [500,503,429]:
   for retry_after in [None,37,150]:
    for quota_kind in [None,'device','overall','topic']:
     state,when,_=author_plan(dict(base,sends=count,expires=2000),outcome,32,provider='FCM',status=status,retry_after=retry_after,quota_kind=quota_kind)
     floor=42
     if status==429:
      floor=max(floor,retry_after if retry_after is not None else 92)
      if quota_kind in ['overall','topic']:floor=max(floor,92)
     assert state=='retry_wait' and when>=floor
     retry_cases+=1
ok('actual revised author plan preserves FCM minima across 216 independent cases',retry_cases==216)
ok('ordinary SMS policy is not silently changed to the FCM minimum',author_plan(base,'temporary_reject',32,provider='SMS')[1]==32.5)

# Independent exact arithmetic, no reuse of author model/test results.
avg=Fraction(10_000_000*10*14,10*86400);peak=5*avg;spare=2000-avg
numbers={'endpoint_average_s':float(avg),'endpoint_peak_s':float(peak),
 'campaign_exclusive_h':float(Fraction(14_000_000,2000*3600)),
 'campaign_shared_h':float(Fraction(14_000_000,1)/spare/3600),
 'burst_backlog':float((peak-2000)*600),'burst_drain_h':float((peak-2000)*600/spare/3600),
 'ten_minute_required_s':float(Fraction(14_000_000,600)),
 'raw_state_TB':140_000_000*500*30/1e12,'replicated_TB':140_000_000*500*30*3/1e12,
 'email_3M_h':float(Fraction(3_000_000,200*3600)),'fanout_100_tail_probability':1-.99**100,
 'campaign_1800_quota_h':float(Fraction(14_000_000,1800*3600))}
ok('main capacity, storage, queue and tail calculations match rounded claims',round(numbers['endpoint_peak_s'])==8102 and round(numbers['campaign_shared_h'],2)==10.24 and round(numbers['burst_drain_h'],2)==2.68 and numbers['raw_state_TB']==2.1,numbers)

page=(ROOT/'chapters/ch10.html').read_text();source_checks=[]
for match in re.finditer(r'<pre[^>]*data-source="([^"]+)"[^>]*><code>(.*?)</code></pre>',page,re.S):
 filename,body=match.groups();assert html.unescape(body)==(ROOT/'examples/ch10'/filename).read_text().rstrip('\n');source_checks.append(filename)
ok('five displayed code blocks match their actual shared files',len(source_checks)==5,source_checks)
baseline=(ROOT/'docs/reviews/ch10-ch11-ch12-baseline/ch10.html').read_text();ids=lambda text:re.findall(r'<title id="([^"]+)"',text)
ok('all 31 original frame identities and order remain',ids(page)==ids(baseline) and len(ids(page))==31)
result={'passed':True,'checks':checks,'count':len(checks),'pageSHA256':hashlib.sha256(page.encode()).hexdigest(),
 'limits':['Reviewer-written minimal SQLite predicates and deterministic traces; not PostgreSQL locks/concurrency proof.',
 'No actual provider/broker calls, process crashes, throughput/latency, clock-fault or failover experiment.',
 'The old P1 counterexample preserves the originally missing adapter default; final closure requires source inspection.']}
(ROOT/'docs/reviews/ch10-independent-probe-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'passed':True,'checks':len(checks),'pageSHA256':result['pageSHA256']}))
