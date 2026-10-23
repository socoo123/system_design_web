#!/usr/bin/env python3
"""Disposable Unix-socket Redis + SQL predicate checks. No production service used."""
from pathlib import Path
import concurrent.futures, hashlib, html, json, re, socket, sqlite3, subprocess, sys, tempfile, time
ROOT=Path(__file__).resolve().parents[2];EX=ROOT/'examples/ch08'
PAGE=(ROOT/'chapters/ch08.html').read_text(); tests=[]
def record(name, **data):tests.append({'name':name,'passed':True,**data})
for source,code in re.findall(r'<pre[^>]*data-source="../examples/ch08/([^\"]+)"[^>]*><code>(.*?)</code></pre>',PAGE,re.S):
 expected=(EX/source).read_text()
 if source=='LeaseBudget.java':expected=expected.split('    // BEGIN PAGE\n')[1].split('    // END PAGE')[0]
 assert html.unescape(code)==expected,source
record('page_source_sync',blocks=7)
release=(EX/'release.lua').read_text();renew=(EX/'renew.lua').read_text()
class RedisError(Exception):pass
def encode(args):
 p=[str(x).encode() for x in args]
 return b'*%d\r\n'%len(p)+b''.join(b'$%d\r\n'%len(x)+x+b'\r\n' for x in p)
def read(f):
 line=f.readline();kind,data=line[:1],line[1:-2]
 if kind==b'-':raise RedisError(data.decode())
 if kind==b'+':return data.decode()
 if kind==b':':return int(data)
 if kind==b'$':
  if int(data)==-1:return None
  v=f.read(int(data));f.read(2);return v.decode()
 if kind==b'*':return [read(f) for _ in range(int(data))]
 raise RuntimeError(line)
with tempfile.TemporaryDirectory(prefix='ch08-redis-') as folder:
 sock=folder+'/r.sock';log=open(folder+'/redis.log','w')
 proc=subprocess.Popen([sys.argv[1],'--port','0','--unixsocket',sock,'--save','','--appendonly','no','--dir',folder],stdout=log,stderr=log)
 def call(*args):
  with socket.socket(socket.AF_UNIX) as c:
   c.settimeout(5);c.connect(sock);f=c.makefile('rb');c.sendall(encode(args));return read(f)
 def lua(script,key,owner,*extra):return call('EVAL',script,1,key,owner,*extra)
 try:
  for _ in range(100):
   if Path(sock).exists():break
   time.sleep(.02)
  version=call('INFO','server').split('redis_version:')[1].split('\r')[0]
  assert call('SET','normal','a','NX','PX',10000)=='OK'
  assert call('SET','normal','b','NX','PX',10000) is None
  assert lua(renew,'normal','a',20000)==1
  assert 19000<call('PTTL','normal')<=20000
  assert lua(release,'normal','b')==0 and call('GET','normal')=='a'
  assert lua(release,'normal','a')==1 and call('GET','normal') is None
  record('acquire_busy_matching_renew_release')
  assert call('SET','expired','a','NX','PX',30)=='OK'
  time.sleep(.06)
  assert call('SET','expired','b','NX','PX',20000)=='OK'
  before=call('PTTL','expired')
  assert lua(renew,'expired','a',100000)==0
  assert lua(release,'expired','a')==0
  after=call('PTTL','expired');assert 0<after<=before and call('GET','expired')=='b'
  record('expired_owner_cannot_renew_or_release_successor',ttl_before=before,ttl_after=after)
  for v in [0,-1,1.5,'bad',86400001]:
   try:lua(renew,'expired','b',v);raise AssertionError('bad TTL accepted')
   except RedisError:pass
  assert call('GET','expired')=='b';record('invalid_ttl_no_mutation')
  with concurrent.futures.ThreadPoolExecutor(max_workers=20) as pool:
   replies=list(pool.map(lambda i:call('SET','race',f'owner-{i}','NX','PX',10000),range(20)))
  assert replies.count('OK')==1 and replies.count(None)==19
  winner=call('GET','race')
  with concurrent.futures.ThreadPoolExecutor(max_workers=20) as pool:
   replies=list(pool.map(lambda i:lua(release,'race',f'wrong-{i}'),range(20)))
  assert replies==[0]*20 and call('GET','race')==winner
  record('20_competitors_one_acquire_wrong_owners_cannot_release',winners=1)
  with socket.socket(socket.AF_UNIX) as c:
   c.connect(sock);c.sendall(encode(['SET','lost','a','NX','PX',10000]));c.recv(4096)
  assert call('GET','lost')=='a'
  assert call('SET','lost','b','NX','PX',10000) is None
  assert lua(release,'lost','a')==1
  record('acquisition_reply_discarded_owner_still_exists_safe_cleanup')
  # Deliberately reproduce the unsafe GET / DEL interleaving.
  call('SET','bad','a','PX',30);assert call('GET','bad')=='a';time.sleep(.06)
  assert call('SET','bad','b','NX','PX',10000)=='OK'
  assert call('DEL','bad')==1 and call('GET','bad') is None
  record('counterexample_get_then_del_deletes_successor')
 finally:proc.terminate();proc.wait(timeout=5);log.close()
# Execute the exact bound-parameter predicates in SQLite to check the algebra.
# This is NOT a PostgreSQL concurrency, durability, or failover experiment.
db=sqlite3.connect(':memory:');db.execute('CREATE TABLE inventory(sku TEXT PRIMARY KEY, qty INTEGER NOT NULL CHECK(qty>=0),last_fence INTEGER NOT NULL,version INTEGER NOT NULL)')
db.execute("INSERT INTO inventory VALUES ('sku7',2,32,12)")
fence=(EX/'fence.sql').read_text();version_sql=(EX/'version.sql').read_text()
def write(f,amount=1):return db.execute(fence,{'sku':'sku7','f':f,'amount':amount}).rowcount
def state():return db.execute('SELECT qty,last_fence,version FROM inventory').fetchone()
assert write(34)==1 and state()==(1,34,12)
assert write(33)==0 and write(34)==0 and state()==(1,34,12)
assert write(35,-1)==0 and write(0)==0 and state()==(1,34,12)
assert write(35,2)==0 and state()==(1,34,12)
record('SQL_normal_stale_duplicate_invalid_and_insufficient',state=list(state()))
# Higher epoch issued but not installed: the older write is still accepted.
db.execute('UPDATE inventory SET qty=2,last_fence=32,version=13')
issued=34;assert write(33)==1 and state()==(1,33,13)
assert db.execute(version_sql,{'sku':'sku7','amount':1,'expected_version':12}).rowcount==0
assert db.execute(version_sql,{'sku':'sku7','amount':1,'expected_version':13}).rowcount==1
record('issued_not_installed_boundary_and_version_12_vs_13')
# Transaction contract traces in SQLite: co-located claim/debit/receipt commit or roll back.
tx=sqlite3.connect(':memory:',isolation_level=None)
tx.executescript("CREATE TABLE stock(sku TEXT PRIMARY KEY,qty INTEGER NOT NULL CHECK(qty>=0)); CREATE TABLE operation(op_id TEXT PRIMARY KEY,sku TEXT,amount INTEGER,result TEXT); INSERT INTO stock VALUES('sku7',2);")
def transact(op,amount,crash=False):
 tx.execute('BEGIN')
 try:
  claimed=tx.execute("INSERT INTO operation(op_id,sku,amount) VALUES(?,'sku7',?) ON CONFLICT(op_id) DO NOTHING",(op,amount)).rowcount
  if not claimed:
   prior=tx.execute('SELECT amount,result FROM operation WHERE op_id=?',(op,)).fetchone()
   if prior[0]!=amount:tx.execute('ROLLBACK');return 'PAYLOAD_MISMATCH'
   tx.execute('COMMIT');return prior[1]
  rows=tx.execute("UPDATE stock SET qty=qty-? WHERE sku='sku7' AND ?>0 AND qty>=?",(amount,amount,amount)).rowcount
  result='SUCCESS' if rows==1 else 'UNAVAILABLE'
  tx.execute('UPDATE operation SET result=? WHERE op_id=?',(result,op))
  if crash:raise RuntimeError('injected before commit')
  tx.execute('COMMIT');return result
 except RuntimeError:tx.execute('ROLLBACK');return 'ROLLED_BACK'
assert transact('op7',1)=='SUCCESS'
# Discarded first result: same-id retry resolves its committed receipt, no new debit.
assert transact('op7',1)=='SUCCESS' and tx.execute('SELECT qty FROM stock').fetchone()==(1,)
assert transact('op7',2)=='PAYLOAD_MISMATCH'
assert transact('op8',1,True)=='ROLLED_BACK'
assert tx.execute("SELECT COUNT(*) FROM operation WHERE op_id='op8'").fetchone()==(0,)
assert tx.execute('SELECT qty FROM stock').fetchone()==(1,)
assert transact('op8',1)=='SUCCESS' and transact('op9',1)=='UNAVAILABLE'
record('single_database_transaction_contract_traces',replay_no_debit=True,payload_mismatch=True,rollback_all=True,last_item_guard=True)

# Model the split acquisition / issuance counterexample, not a live coordinator.
events=[('A acquire',None),('A expires',None),('B acquire+INCR',100),('A late INCR',101)]
assert events[-1][1]>events[-2][1];record('split_acquisition_INCR_counterexample',events=events)
assert 10000*.1==1000 and 1000+800==1800 and 1800+200*3==2400
assert 60/10==6 and 1/.020==50 and 100*.020==2
assert abs(10-.1-.2-9.7)<1e-9 and abs(9.7-8-1.7)<1e-9 and 45-11==34 and 40-11==29
record('capacity_time_arithmetic',base_commands=1800,busy_retries_commands=2400,hot_key_ceiling=50,lease_remaining=9.7,pause=34,remaining_before_pause=29)
report={'redis_version':version,'tests':tests,'limits':['Redis is one isolated instance with no persistence; no failover, clock-shift or throughput experiment.','SQL predicates executed in SQLite, not PostgreSQL; transaction pseudocode checked against official PostgreSQL semantics and traces.','Dropped reply is deliberately discarded by client, not a network fault.','INCR counterexample is a deterministic trace, not a live coordinator test.']}
(ROOT/'docs/reviews/ch08-code-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
