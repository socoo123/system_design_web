"""Execute SQL shapes extracted from pseudocode against colliding tenant IDs.

This complements check.py's 65 single-tenant contracts. No source is modified.
Only pseudocode spelling is adapted (parameters, enum literals, table aliases,
tuple result serialization and DELETE FROM). Tenant predicates are unchanged.
"""
from pathlib import Path
import hashlib,json,re,sqlite3
ROOT=Path(__file__).resolve().parents[2]
complete=(ROOT/'examples/ch15/complete.pseudo').read_text()
gc=(ROOT/'examples/ch15/gc.pseudo').read_text()
checks=[]
def check(ok,name):
    assert ok,name
    checks.append(name)
def capture(pattern,source):
    m=re.search(pattern,source,re.S)
    assert m,pattern
    return m.group(0).strip()
def sql(statement):
    for a,b in [('auth.tenant',':tenant'),('job.tenant',':tenant'),('job.generation',':generation'),
                ('s.size',':size'),('s.file_id',':file'),('s.base_version',':base'),('s.id',':session')]:
        statement=statement.replace(a,b)
    return (statement.replace('state=DELETED',"state='DELETED'")
            .replace('state=COMMITTED',"state='COMMITTED'")
            .replace('result=(v,seq)','result=:result').replace('head=v','head=:version')
            .replace('UPDATE BlockGeneration','UPDATE block_generation')
            .replace('DELETE SessionBlock','DELETE FROM SessionBlock'))
guard_statement=capture(r'UPDATE tenant_guard SET .*?WHERE tenant_id=auth\.tenant',complete)
file_statement=capture(r'UPDATE File SET head=v\s+WHERE[^\n]+',complete)
session_statement=capture(r'UPDATE Session SET state=COMMITTED, result=\(v,seq\)\s+WHERE[^\n]+',complete)
pin_statement=capture(r'DELETE SessionBlock WHERE[^\n]+',complete)
generation_statement=capture(r'UPDATE BlockGeneration SET state=DELETED\s+WHERE[^\n]+',gc)
job_statement=capture(r'UPDATE DeleteJob SET complete=true\s+WHERE[^\n]+',gc)
for name,statement in [('guard',guard_statement),('file',file_statement),('session',session_statement),
                       ('pins',pin_statement),('generation',generation_statement),('job',job_statement)]:
    check('WHERE tenant_id=' in statement,name+' source has explicit tenant predicate')
for fragment in ['INSERT Version(auth.tenant,','INSERT VersionBlock(auth.tenant,',
                 'SessionBlock[auth.tenant,s.id]','INSERT Change(auth.tenant,',
                 'INSERT Outbox(auth.tenant,','Receipt[auth.tenant, auth.user, request_key]',
                 'File[auth.tenant,s.file_id]']:
    check(fragment in complete,'scoped insert/read: '+fragment)
check('require_durable_job(job.tenant, job.generation)' in gc,'durable delete job lookup uses composite identity')
check('INSERT DeleteJob(tenant, g.generation,' in gc,'delete job insertion includes tenant')
check('SessionBlock(auth.tenant, s.id,' in (ROOT/'examples/ch15/pin.pseudo').read_text(),'pin insertion scoped to tenant')
check('Change WHERE tenant_id=auth.tenant' in (ROOT/'examples/ch15/changes.pseudo').read_text(),'change scan scoped to tenant')

db=sqlite3.connect(':memory:');db.row_factory=sqlite3.Row
db.create_function('checked_add',2,lambda a,b:a+b)
db.executescript((ROOT/'examples/ch15/schema.sql').read_text())
db.executescript('''
CREATE TABLE File(tenant_id TEXT,id TEXT,head INTEGER,PRIMARY KEY(tenant_id,id));
CREATE TABLE Session(tenant_id TEXT,id TEXT,state TEXT,result TEXT,PRIMARY KEY(tenant_id,id));
CREATE TABLE SessionBlock(tenant_id TEXT,session TEXT,ordinal INTEGER,generation TEXT,
                         PRIMARY KEY(tenant_id,session,ordinal));
CREATE TABLE DeleteJob(tenant_id TEXT,generation TEXT,complete INTEGER,
                      PRIMARY KEY(tenant_id,generation));
INSERT INTO tenant_guard VALUES('A',101,10,1000),('B',201,20,2000);
INSERT INTO File VALUES('A','f1',7),('B','f1',7);
INSERT INTO Session VALUES('A','u','OPEN',NULL),('B','u','OPEN',NULL);
INSERT INTO SessionBlock VALUES('A','u',0,'same-g'),('B','u',0,'same-g');
INSERT INTO block_generation VALUES('A','same-g','hash',4,'A/final/same-g','DELETING'),
                                   ('B','same-g','hash',4,'B/final/same-g','READY');
INSERT INTO DeleteJob VALUES('A','same-g',0),('B','same-g',0);
''')
params={'tenant':'A','size':7,'file':'f1','base':7,'version':8,'session':'u',
        'result':'8,102','generation':'same-g'}
def values(table,columns):return [tuple(r) for r in db.execute('SELECT '+columns+' FROM '+table+' ORDER BY tenant_id')]
original_guard=values('tenant_guard','tenant_id,change_head,used_bytes')
db.execute('SAVEPOINT unsafe_guard')
db.execute(re.sub(r'\s+WHERE .*','',sql(guard_statement),flags=re.S),params)
check(values('tenant_guard','tenant_id,change_head,used_bytes')[1]!=original_guard[1],
      'negative witness: locking A without tenant WHERE also increments B')
db.execute('ROLLBACK TO unsafe_guard');db.execute('RELEASE unsafe_guard')
db.execute(sql(guard_statement),params)
check(values('tenant_guard','tenant_id,change_head,used_bytes')==[('A',102,17),('B',201,20)],
      'source guard UPDATE changes only A counts and head')
check(db.execute(sql(file_statement),params).rowcount==1,'same file ID updates exactly one tenant row')
check(values('File','tenant_id,head')==[('A',8),('B',7)],'B file remains at prior head')
db.execute(sql(session_statement),params)
check(values('Session','tenant_id,state,result')==[('A','COMMITTED','8,102'),('B','OPEN',None)],
      'same session ID closes only A')
db.execute(sql(pin_statement),params)
check(values('SessionBlock','tenant_id,generation')==[('B','same-g')],'same session ID releases only A pins')
db.execute('SAVEPOINT unsafe_generation')
old=sql(generation_statement).replace('tenant_id=:tenant AND ','')
db.execute(old,params)
check(values('block_generation','tenant_id,state')[1]==('B','DELETED'),
      'negative witness: generation-only DELETE status corrupts B READY state')
db.execute('ROLLBACK TO unsafe_generation');db.execute('RELEASE unsafe_generation')
db.execute(sql(generation_statement),params)
check(values('block_generation','tenant_id,state')==[('A','DELETED'),('B','READY')],
      'source terminal transition preserves B with colliding generation')
db.execute(sql(job_statement),params)
check(values('DeleteJob','tenant_id,complete')==[('A',1),('B',0)],'delete job completion uses full tenant/generation key')
for tenant in ['A','B']:
    db.execute('INSERT INTO commit_receipt VALUES(?,?,?,?,?,?,?)',(tenant,'owner','same-key','intent','f1',8,102))
check(db.execute('SELECT COUNT(*) FROM commit_receipt').fetchone()[0]==2,
      'same owner/key receipts are independent across tenants')
db.close()
result={'passed':True,'count':len(checks),'checks':checks,
        'source_hashes':{f:hashlib.sha256((ROOT/'examples/ch15'/f).read_bytes()).hexdigest()
                         for f in ['complete.pseudo','gc.pseudo','pin.pseudo','changes.pseudo']},
        'extracted_statements':{'guard':guard_statement,'file':file_statement,'session':session_statement,
                               'pins':pin_statement,'generation':generation_statement,'job':job_statement},
        'limitations':['SQLite execution validates source predicate scope, not PG replication/row-lock deployment',
                       'Pseudocode parameter and enum/table spelling adapted as documented; tenant predicates unchanged']}
(ROOT/'docs/reviews/ch15-tenant-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'passed':True,'assertions':len(checks),'source_hashes':result['source_hashes']},indent=2))
