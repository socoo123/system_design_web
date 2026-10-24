#!/usr/bin/env python3
"""Independent new local inputs. Never writes author evidence or source files."""
from pathlib import Path
import hashlib
import importlib.util
import json
import sqlite3
import tempfile
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('ch45_author_verify',ROOT/'examples/ch45/verify.py')
v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
r={'sourceHashes':{str(f.relative_to(ROOT)):hashlib.sha256(f.read_bytes()).hexdigest() for f in [ROOT/'chapters/ch45.html',*sorted((ROOT/'examples/ch45').glob('*'))] if f.is_file()},'observations':[]}
with tempfile.TemporaryDirectory(prefix='ch45-independent-') as tmp:
 db=Path(tmp)/'overflow.db';v.fixture(db)
 with v.connect(db) as c:c.execute("UPDATE orders SET version=? WHERE tenant='t1' AND id='o42'",(2**63-1,))
 before=v.snapshot(db)
 try: receipt=v.edit(db,'independent-max-version',2**63-1,3);outcome={'receipt':receipt}
 except Exception as e:outcome={'error':type(e).__name__,'message':str(e)}
 with v.connect(db) as c:row=dict(c.execute('SELECT version,typeof(version) AS storage,total FROM orders').fetchone())
 r['observations'].append({'case':'signed64 version exhaustion before edit','expected':'reject and roll back root/lines/receipt','actual':outcome,'row':row,'unchanged':before==v.snapshot(db)})
 db2=Path(tmp)/'cas-zero.db';v.fixture(db2,True)
 original=v.connect
 class ZeroCursor:
  rowcount=0
 class ForcedCasZero:
  def __init__(self,conn):self.conn=conn
  def __getattr__(self,name):return getattr(self.conn,name)
  def execute(self,sql,args=()):
   if sql.startswith("UPDATE orders SET state='paid',version=version+1"):
    return ZeroCursor() # explicit branch injection, not a real concurrent DB edit
   return self.conn.execute(sql,args)
 v.connect=lambda path:ForcedCasZero(original(path))
 try:outcome=v.consume(db2,v.event('independent-zero-cas'))
 finally:v.connect=original
 snap=v.snapshot(db2)
 r['observations'].append({'case':'consume CAS=0 handling','method':'controlled rowcount=0 injection into unchanged adapter, not a real PG race','expected':'whole-TX rollback and bounded reload/no ACK on exhaustion; do not classify as invalid capture','actual':outcome,'counts':{k:len(snap[k]) for k in ['inbox','capture_result','refund_work','outbox','quarantine']},'quarantine':snap['quarantine']})
(ROOT/'docs/reviews/ch45-independent-initial-probes.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(r['observations'],ensure_ascii=False))
