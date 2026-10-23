from pathlib import Path
from fractions import Fraction as F
import hashlib,html,json,re,sqlite3,tempfile
ROOT=Path(__file__).resolve().parents[2]
checks=[]
def ok(v,name):
 if not v:raise AssertionError(name)
 checks.append(name)
page=(ROOT/'chapters/ch11.html').read_text()
for source,body in re.findall(r'<pre[^>]*data-source="([^"]+)"[^>]*><code>(.*?)</code></pre>',page,re.S):
 text=(ROOT/'examples/ch11'/source).read_text()
 if source.endswith('.java'):text=text.split('  // BEGIN PAGE SNIPPET\n')[1].split('  // END PAGE SNIPPET')[0]
 ok(html.unescape(body)==text,'same source: '+source)
old=(ROOT/'docs/reviews/ch10-ch11-ch12-baseline/ch11.html').read_text()
svgs=lambda t:re.findall(r'<svg\b.*?</svg>',t,re.S)
a,b=svgs(old),svgs(page);ok(len(a)==len(b)==32,'all 32 baseline frames retained')
ids=lambda vs:[re.search(r'<title id="([^"]+)"',v).group(1) for v in vs]
ok(ids(a)==ids(b),'all frame IDs/order unchanged')
changed=[id for id,x,y in zip(ids(a),a,b) if x!=y]
ok(changed==['d2s1t','d2s2t','d2s3t','d2s4t','d2s5t','d2s6t','d4s5t','d5s2t','d5s3t','d5s4t','d5s5t'],'only explained 11 SVG frames changed')

# Use actual durable SQLite files to demonstrate the *ordering* of external output/checkpoint.
# This does not emulate PostgreSQL isolation, Kafka or fan-out throughput.
with tempfile.TemporaryDirectory(prefix='ch11-independent-') as tmp:
 out=sqlite3.connect(Path(tmp)/'out.sqlite');task=sqlite3.connect(Path(tmp)/'task.sqlite')
 for db in [out,task]:db.execute('PRAGMA synchronous=FULL')
 out.execute('CREATE TABLE timeline(reader INTEGER,post INTEGER,time INTEGER,PRIMARY KEY(reader,post))')
 task.execute('CREATE TABLE task(event TEXT PRIMARY KEY,cursor INTEGER)');task.execute("INSERT INTO task VALUES ('e',0)");task.commit()
 def write(reader,post,time):
  out.execute('INSERT INTO timeline VALUES (?,?,?) ON CONFLICT(reader,post) DO NOTHING',(reader,post,time));out.commit()
 for reader in [1,2]:write(reader,9,1000)
 out.close();task.close() # process stops after durable output, before checkpoint
 out=sqlite3.connect(Path(tmp)/'out.sqlite');task=sqlite3.connect(Path(tmp)/'task.sqlite')
 ok(task.execute("SELECT cursor FROM task WHERE event='e'").fetchone()[0]==0,'crash before checkpoint retains old cursor')
 for reader in [1,2,3]:write(reader,9,1000)
 changed_cp=task.execute("UPDATE task SET cursor=3 WHERE event='e' AND cursor=0").rowcount;task.commit()
 ok(changed_cp==1 and task.execute("UPDATE task SET cursor=3 WHERE event='e' AND cursor=0").rowcount==0,'checkpoint CAS rejects stale duplicate runner')
 ok(out.execute('SELECT count(*) FROM timeline WHERE post=9').fetchone()[0]==3,'replay fills partial outputs with durable unique keys')
 write(1,9,9999)
 ok(out.execute('SELECT time FROM timeline WHERE reader=1 AND post=9').fetchone()[0]==1000,'duplicate output preserves original event time')
 # Deliberately wrong ordering: checkpoint done while only one target was written.
 write(1,10,1001);task.execute("INSERT INTO task VALUES ('bad',3)");task.commit()
 for reader in [1,2,3][task.execute("SELECT cursor FROM task WHERE event='bad'").fetchone()[0]:]:write(reader,10,1001)
 ok(out.execute('SELECT count(*) FROM timeline WHERE post=10').fetchone()[0]==1,'negative checkpoint-first crash permanently misses recipients')
 out.close();task.close()

# Stable audience and pending-follow traces are protocol checks, not Graph integration.
snapshot=[1,2,3,4];first=snapshot[:2];live=[2,3,4]
ok(first+live[2:]==[1,2,4],'negative moving OFFSET audience loses reader 3')
ok(first+snapshot[2:]==[1,2,3,4],'pinned audience snapshot closes all targets')
log=[1];inbox={1};edge=False
log.append(2) # old-style backfill finished before the new edge was made visible
if edge:inbox.add(2)
edge=True
ok(inbox!={1,2},'negative late follow registration misses concurrent post')
pending=True;log=[1];inbox=set(log);log.append(2)
if pending:inbox.add(2)
S=2;inbox.update(p for p in log if p<=S)
ok(inbox=={1,2},'pending edge then history/catchup before activation covers race')
# Mode handoff: a post commits during initial backfill; final barrier must include it.
author=[1,2];new_log=set(author);author.append(3);final_old_commit=3
new_log.update(p for p in author if p<=final_old_commit);author.append(4);new_log.add(4)
ok(new_log=={1,2,3,4},'final old-generation cut plus new-generation routing has no lost post')

# Hard deletion age, independently reasoned using rational times around delete t=0.
for g in [F(-1),F(-1,10),F(-1,1000)]:
 install=g+2;expiry=install+25;response=expiry+2
 ok(response<29,'old primary read stays below 29s bound for grant '+str(g))
# A remote SET at t=100 ignores an API timeout; the cache deadline is necessary.
grant=F(-1,1000);queued=F(100)
ok(queued>grant+2,'queued remote SET is rejected by cache install deadline')
ok(queued+25>29,'negative timeout-only SET can violate the deletion bound')
old_token=(1,7);after_invalidation=(1,8);after_restart=(2,0)
ok(old_token!=after_invalidation and old_token!=after_restart,'generation and restart epoch reject stale token')

# All capacities recomputed from source assumptions with exact fractions.
posts=10_000_000/F(10);reads=10_000_000*20/F(86400);peak_reads=reads*5
fanout=posts*200/F(86400);peak_fanout=fanout*5
numbers={
 'posts_per_day':posts,'mean_post_qps':posts/86400,'peak_post_qps':posts/86400*5,
 'daily_pointers':posts*200,'mean_pointer_qps':fanout,'peak_pointer_qps':peak_fanout,
 'million_fanout_seconds':F(1,2)+1_000_000/F(10_000),'exclusive_tier_seconds':F(1,2)+1_000_000/F(30_000),
 'threshold_stage_seconds':F(1,2)+25_000/F(10_000)+1+1,
 'tier_utilization':peak_fanout/30_000,'net_drain_qps':30_000-peak_fanout,
 'backlog60k_seconds':60_000/(30_000-peak_fanout),'mean_pull_probes':reads*200,
 'K8_mean_tail_probes':reads*8,'K8_peak_tail_probes':peak_reads*8,
 'pointer_GB':F(2_000_000*1000*64,10**9),'body_copy_TB':F(2_000_000*1000*1000,10**12),
 'body_pointer_ratio':F(1000,64),'annual_replicated_body_TB':posts*1000*365*3/10**12,
 'normal_body_qps':peak_reads*20/F(100)+58*20,'hit95_body_qps':peak_reads*20*F(5,100),
 'outage_body_qps':peak_reads*20,'outage_factor':peak_reads*20/4000,
 'full20_pages_per_second':F(4000,20),'full50_pages_per_second':F(4000,50),
 'daily_error_budget':F(10_000_000*20,1000),'error_budget_seconds':F(200000)/(peak_reads-200),
 'post_cache_residence_seconds':F(2+25),'delete_response_seconds':F(2+25+2),'timeline_age_seconds':F(1,2)+F(1,2)}
ok(numbers['threshold_stage_seconds']==5,'push threshold stage budget sums to 5s')
ok(numbers['normal_body_qps']<4000<numbers['hit95_body_qps'],'99% miss budget fits while 95% does not')
ok(numbers['pointer_GB']==128 and numbers['annual_replicated_body_TB']==F(1095,1000),'decimal working set and retention bytes')
result={'hash':hashlib.sha256(page.encode()).hexdigest(),'passed':True,'checks':checks,'check_count':len(checks),'changed_svg_ids':changed,'numbers':{k:{'exact':str(v),'decimal':float(v)} for k,v in numbers.items()},'limits':'SQLite output/checkpoint ordering plus protocol/event traces and exact arithmetic; no real PG/Kafka/cache/Graph race or load test.'}
(ROOT/'docs/reviews/ch11-independent-check-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'passed':True,'checks':len(checks),'numbers':{k:float(v) for k,v in numbers.items()}},ensure_ascii=False,indent=2))
