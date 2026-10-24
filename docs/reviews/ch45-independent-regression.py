#!/usr/bin/env python3
"""Independently recheck the two findings; preserves initial failing evidence."""
from pathlib import Path
from contextlib import closing
import importlib.util
import hashlib
import json
import sqlite3
import tempfile
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('postfix_verify',ROOT/'examples/ch45/verify.py');v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
checks=[]
def ok(c,label):
 if not c:raise AssertionError(label)
 checks.append(label)
def reject(kind,fn):
 try:fn()
 except kind:return
 raise AssertionError('expected '+str(kind))
with tempfile.TemporaryDirectory(prefix='ch45-independent-regression-') as tmp:
 p=Path(tmp)/'version.db';v.fixture(p)
 with closing(v.connect(p)) as c:c.execute('UPDATE orders SET version=?',(2**63-2,))
 receipt=v.edit(p,'last-permitted-edit',2**63-2,3)
 ok(receipt['version']==2**63-1,'max-1 increments exactly once to signed64 max')
 ok(v.edit(p,'last-permitted-edit',2**63-2,3)==receipt,'same key replay remains valid at exhausted current version')
 before=v.snapshot(p);reject(OverflowError,lambda:v.edit(p,'next-invalid-edit',2**63-1,4))
 ok(v.snapshot(p)==before,'edit at max rejects and rolls back root lines command receipt')
 with closing(v.connect(p)) as c:
  ok(c.execute('SELECT typeof(version) FROM orders').fetchone()[0]=='integer','version never promoted to REAL')
  reject(sqlite3.IntegrityError,lambda:c.execute('UPDATE orders SET version=?',(float(2**63),)))
 ok(v.snapshot(p)==before,'schema rejects REAL version without mutation')
 for bad in [True,False,1.0,-1,2**63-1,2**63]:reject(OverflowError,lambda bad=bad:v.next_version(bad))
 ok(v.next_version(0)==1,'typed version validation accepts normal zero')
 p=Path(tmp)/'capture-max.db';v.fixture(p,True)
 with closing(v.connect(p)) as c:c.execute('UPDATE orders SET version=?',(2**63-1,))
 before=v.snapshot(p);reject(OverflowError,lambda:v.consume(p,v.event('new-max-capture')))
 ok(v.snapshot(p)==before,'max capture rolls back inbox result state outbox quarantine')
 p=Path(tmp)/'zero.db';v.fixture(p,True);before=v.snapshot(p)
 original=v.connect
 class Zero:rowcount=0
 class Proxy:
  def __init__(self,conn):self.conn=conn
  def __getattr__(self,k):return getattr(self.conn,k)
  def execute(self,sql,params=()):
   if sql.startswith("UPDATE orders SET state='paid',version=version+1"):return Zero()
   return self.conn.execute(sql,params)
 v.connect=lambda path:Proxy(original(path))
 try:reject(v.RetryableConflict,lambda:v.consume(p,v.event('independent-zero-cas')))
 finally:v.connect=original
 ok(v.snapshot(p)==before,'CAS=0 raises retryable conflict with every table unchanged, no quarantine/ACK result')
 ok(v.consume(p,v.event('independent-zero-cas'))=='ACCEPTED','same event can re-enter after transient CAS branch')
 after=v.snapshot(p)
 ok(len(after['inbox'])==len(after['capture_result'])==len(after['outbox'])==1 and not after['quarantine'],'retry commits one full decision and no conflict quarantine')
 ok(v.consume(p,v.event('independent-zero-cas'))=='ACCEPTED' and v.snapshot(p)==after,'post-retry replay does not duplicate effect')
 p=Path(tmp)/'closed-after-zero.db';v.fixture(p,True);before=v.snapshot(p)
 v.connect=lambda path:Proxy(original(path))
 try:reject(v.RetryableConflict,lambda:v.consume(p,v.event('retry-after-expiry')))
 finally:v.connect=original
 with closing(v.connect(p)) as c:c.execute("UPDATE orders SET state='closed',version=10")
 ok(v.consume(p,v.event('retry-after-expiry'))=='REFUND_REQUIRED','after CAS conflict actual later closed state is reloaded into refund decision')
 after=v.snapshot(p)
 ok(after['orders'][0]['state']=='closed' and len(after['refund_work'])==len(after['outbox'])==1,'reload preserves close winner and one durable refund obligation')
r={'passed':True,'closedFindings':['P1 version exhausted/REAL promotion','P1 CAS=0 quarantined instead of retryable rollback'],
   'checks':checks,'checkCount':len(checks),'method':'Real SQLite files, one explicit rowcount=0 branch injection. No actual PostgreSQL race or ACK network was simulated.',
   'sourceHashes':{str(f.relative_to(ROOT)):hashlib.sha256(f.read_bytes()).hexdigest() for f in [ROOT/'chapters/ch45.html',*sorted((ROOT/'examples/ch45').glob('*'))] if f.is_file()}}
(ROOT/'docs/reviews/ch45-independent-regression-results.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'passed':True,'checkCount':len(checks),'closedFindings':r['closedFindings']}))
