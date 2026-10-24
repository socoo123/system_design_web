from pathlib import Path
import hashlib,json,math,sqlite3,subprocess,tempfile,threading
R=Path(__file__).resolve().parents[2];checks=[]
def ok(name,condition):
 if not condition:raise AssertionError(name)
 checks.append(name)
with tempfile.TemporaryDirectory(prefix='ch29-independent-') as temp:
 java='/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin'
 subprocess.run([java+'/javac','-d',temp,str(R/'examples/ch29/KvLedger.java'),str(R/'docs/reviews/ch29-independent-KvProbe.java')],check=True,capture_output=True,text=True)
 p=subprocess.run([java+'/java','-cp',temp,'Ch29IndependentKvProbe'],capture_output=True,text=True)
 if p.returncode:raise AssertionError(p.stdout+p.stderr)
 j=json.loads(p.stdout);ok('actual Java17 independent new inputs passed',j['passed'])
 db=str(Path(temp)/'attempt.sqlite');c=sqlite3.connect(db,isolation_level=None)
 c.execute('''CREATE TABLE attempt(principal TEXT NOT NULL,k TEXT NOT NULL,body_hash TEXT NOT NULL,
 state TEXT NOT NULL,expires INTEGER NOT NULL,boot TEXT,gen INTEGER,metadata TEXT,
 PRIMARY KEY(principal,k))''')
 def claim(principal,key,digest,now):
  x=sqlite3.connect(db,isolation_level=None,timeout=5)
  try:
   x.execute('BEGIN IMMEDIATE')
   x.execute('INSERT INTO attempt(principal,k,body_hash,state,expires) VALUES(?,?,?,"CLAIMED",?) ON CONFLICT DO NOTHING',(principal,key,digest,now+86400))
   row=x.execute('SELECT * FROM attempt WHERE principal=? AND k=?',(principal,key)).fetchone()
   if row[2]!=digest:x.rollback();return 'CONFLICT'
   if row[4]<=now:x.rollback();return 'EXPIRED'
   x.commit();return row
  finally:x.close()
 row=claim('tenant:u','key','h1',0)
 ok('normal claim persists identity',row[3]=='CLAIMED')
 ok('same key returns saved identity',claim('tenant:u','key','h1',1)==row)
 ok('different canonical payload conflicts',claim('tenant:u','key','h2',1)=='CONFLICT')
 ok('another principal owns separate same string key',claim('other:u','key','h2',1)[0]=='other:u')
 gate=threading.Barrier(2);results=[]
 def binder(boot):
  x=sqlite3.connect(db,isolation_level=None,timeout=5)
  gate.wait();changed=x.execute('UPDATE attempt SET state="ASSIGNED",boot=?,gen=7 WHERE principal=? AND k=? AND state="CLAIMED" AND boot IS NULL',(boot,'tenant:u','key')).rowcount
  results.append((boot,changed));x.close()
 a=threading.Thread(target=binder,args=('a',));b=threading.Thread(target=binder,args=('b',));a.start();b.start();a.join();b.join()
 ok('two connection bind race yields one owner',sum(n for _,n in results)==1)
 owner=c.execute('SELECT boot,gen FROM attempt WHERE principal="tenant:u" AND k="key"').fetchone()
 ok('unknown bind commit recovered by original key',owner[0] in ('a','b') and owner[1]==7)
 ok('same-owner redispatch cannot create second binding',c.execute('UPDATE attempt SET boot="other" WHERE principal="tenant:u" AND k="key" AND state="CLAIMED" AND boot IS NULL').rowcount==0)
 finish='UPDATE attempt SET state="TERMINAL",metadata=? WHERE principal=? AND k=? AND boot=? AND gen=? AND state IN ("ASSIGNED","RUN_GRANTED")'
 ok('first grant predicate changes assigned once',c.execute('UPDATE attempt SET state="RUN_GRANTED" WHERE principal="tenant:u" AND k="key" AND state="ASSIGNED"').rowcount==1)
 ok('same-key granted retry reads existing grant',claim('tenant:u','key','h1',2)[3]=='RUN_GRANTED')
 ok('wrong owner terminal rejected',c.execute(finish,('wrong','tenant:u','key','stale',7)).rowcount==0)
 ok('wrong generation terminal rejected',c.execute(finish,('wrong','tenant:u','key',owner[0],6)).rowcount==0)
 ok('matching owner finishes once',c.execute(finish,('DONE','tenant:u','key',*owner)).rowcount==1)
 ok('lost terminal ACK returns saved metadata',claim('tenant:u','key','h1',10)[7]=='DONE')
 ok('duplicate terminal cannot overwrite metadata',c.execute(finish,('CANCEL','tenant:u','key',*owner)).rowcount==0)
 ok('terminal metadata unchanged',c.execute('SELECT metadata FROM attempt WHERE principal="tenant:u" AND k="key"').fetchone()[0]=='DONE')
 ok('retry window expiry does not reopen old key',claim('tenant:u','key','h1',86400)=='EXPIRED')
 active=claim('tenant:u','active','ha',0)
 c.execute('UPDATE attempt SET state="ASSIGNED",boot="live",gen=9 WHERE k="active"')
 c.execute('DELETE FROM attempt WHERE state="TERMINAL" AND expires<=86400')
 ok('terminal-only expiry never deletes active row',c.execute('SELECT count(*) FROM attempt WHERE k="active"').fetchone()[0]==1)
 ok('expired active same key cannot silently reopen',claim('tenant:u','active','ha',86400)=='EXPIRED')
 # Simulate acknowledged local commit with response discarded; no second row appears.
 fresh=claim('tenant:u','unknown-commit','hh',20);again=claim('tenant:u','unknown-commit','hh',21)
 ok('claim COMMIT response loss rereads original row',fresh==again and c.execute('SELECT count(*) FROM attempt WHERE k="unknown-commit"').fetchone()[0]==1)
 try:c.execute('INSERT INTO attempt(principal,k,body_hash,state,expires) VALUES("x","bad",NULL,"CLAIMED",0)');raise AssertionError('null accepted')
 except sqlite3.IntegrityError:checks.append('NOT NULL rejects missing canonical hash')
 c.close()
nums=[('KV bytes/token',2*32*8*128*2,131072),('block bytes',16*131072,2097152),
 ('credit pages/request',math.ceil((2048+512)/16),160),('MiB/request',160*2,320),
 ('pool MiB',40*1024,40960),('pool pages',40960//2,20480),('128 credits',128*160,20480),
 ('129 overflow MiB',129*320-40960,320),('stable in-flight mean',10*6,60),
 ('mean credits GiB',60*320/1024,18.75),('conditional peak resident',30*6,180),
 ('conditional peak credits GiB',180*320/1024,56.25),('planned rate',12*0.7,8.4),
 ('normal replicas',math.ceil(30/8.4),4),('N-1 replicas',math.ceil(30/8.4)+1,5),
 ('N-1 remaining planned rate',4*8.4,33.6),('nominal queued work sec',100/12,25/3),
 ('promptKV bytes',2048*131072,268435456),('ideal transfer ms',268435456/1e10*1000,26.8435456),
 ('peak KV GB/s',30*268435456/1e9,8.05306368),('peak KV Gb/s',30*268435456*8/1e9,64.42450944),
 ('link fraction',30*268435456/1e10,0.805306368),('long context MiB',(8192+512)*131072/2**20,1088),
 ('long context credits',40960//1088,37),('token gaps',256-1,255),('fixed gap duration sec',255*0.02,5.1),
 ('fixed ideal full duration sec',0.2+255*0.02,5.3),('max stream buffers MiB',128*64/1024,8)]
for name,x,y in nums:ok(name,math.isclose(x,y,rel_tol=1e-12))
# Independent input metrics counterexample: both marginals99%, joint98%.
traces=[dict(ttft=900 if i==0 else 700,max_itl=60 if i==1 else 40) for i in range(100)]
mt=sum(x['ttft']<=800 for x in traces)/100;mi=sum(x['max_itl']<=50 for x in traces)/100
joint=sum(x['ttft']<=800 and x['max_itl']<=50 for x in traces)/100
ok('marginal99% cannot prove joint99%',mt==mi==0.99 and joint==0.98)
worker_ready=[0,20,40,60];client_chunks=[0,60]
ok('workerITL20 and clientchunk60 differ',max(b-a for a,b in zip(worker_ready,worker_ready[1:]))==20 and client_chunks[1]-client_chunks[0]==60)
ok('TPOT excludes first token and has N-1 denominator',(worker_ready[-1]-worker_ready[0])/(len(worker_ready)-1)==20)
files=[R/'chapters/ch29.html',*(R/'examples/ch29').glob('*')]
out=dict(passed=True,totalAssertions=len(checks),independentJava=j,checks=checks,
 numericalCases=len(nums)+3,sqlModel='actual SQLite multi-connection translation of authored SQL predicates; no PostgreSQL execution',
 sourceHashes={str(p.relative_to(R)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files if p.is_file()},
 limits=['CPU ledger only, no CUDA work or payloads','Independent SQL translation tests predicates and local transactions, not PG isolation/replication','Queue/iteration pseudocode reviewed by source trace, not a running production scheduler'])
(R/'docs/reviews/ch29-independent-probe-results.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({k:v for k,v in out.items() if k not in ('checks','sourceHashes')},ensure_ascii=False))
