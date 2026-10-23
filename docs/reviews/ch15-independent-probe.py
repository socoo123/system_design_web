"""Independent review probes. Never executes the author's top-level test runner.

Loads only its model definitions as the SUT, then uses new inputs/assertions.
Separately executes old and repaired SQL scope on the original schema, adapting
only pseudocode parameters, enum literals and table names, never its predicates.
"""
import ast
from concurrent.futures import ThreadPoolExecutor
from fractions import Fraction as F
import hashlib
import json
import math
from pathlib import Path
import re
import sqlite3
import tempfile

ROOT = Path(__file__).resolve().parents[2]
checks, traces = [], {}


def check(name, value):
    assert value, name
    checks.append(name)


source_file = ROOT / 'examples/ch15/check.py'
tree = ast.parse(source_file.read_text())
prefix = []
for node in tree.body:
    if isinstance(node, ast.With):
        break
    prefix.append(node)
scope = {'__file__': str(source_file), '__name__': 'ch15_review_sut'}
exec(compile(ast.Module(body=prefix, type_ignores=[]), str(source_file), 'exec'), scope)
Model, Rejected = scope['Model'], scope['Rejected']


def rejects(name, fn, reason):
    try:
        fn()
    except Rejected as error:
        check(name, str(error) == reason)
    else:
        raise AssertionError(name + ': unexpectedly accepted')


with tempfile.TemporaryDirectory(prefix='ch15-independent-') as tmp:
    counter = 0

    def fresh():
        global counter
        counter += 1
        folder = Path(tmp) / str(counter)
        folder.mkdir()
        return Model(folder)

    payload = [b'X' * scope['BLOCK'], b'new independent tail of 31 bytes']
    size = sum(map(len, payload))
    m = fresh(); m.prepared('save', chunks=payload)
    rejects('live ordinal pin wins before GC', lambda: m.fence('save-0', now=60), 'PROTECTED')
    answer = m.complete('save', key='request-A')
    check('normal full block plus short tail commits v8/102', answer == (8, 102))
    check('version references and logical quota commit together', m.scalar('SELECT COUNT(*) FROM ref') == 2 and m.scalar('SELECT used FROM guard') == size)
    m.init('different-intent', chunks=payload, base=8)
    rejects('same key cannot move to a different session/intent', lambda: m.complete('different-intent', key='request-A'), 'KEY_REUSED')
    m.write("UPDATE acl SET r=0,w=0 WHERE file='f1' AND actor='A'")
    check('lost reply can recover own minimal prior result after revocation', m.complete('save', key='request-A', now=500) == answer)
    rejects('a new completion still checks current ACL', lambda: m.complete('different-intent', key='new-key'), 'ACL_OR_DELETED')
    m.write("UPDATE acl SET r=1,w=1 WHERE file='f1' AND actor='A'")
    for i in range(2):
        m.reuse_pin('different-intent', i, 'f1', 8, i)
    check('second retained version charges full logical size despite byte reuse', m.complete('different-intent', key='new-key') == (9, 103) and m.scalar('SELECT used FROM guard') == size * 2)

    a = fresh(); a.init('partial', chunks=payload); a.stage('partial', 0, payload[0])
    rejects('unknown final PUT cannot become READY or pinned', lambda: a.upload_pin('partial', 0, unknown=True), 'PUT_UNKNOWN')
    check('unknown PUT leaves durable candidate without a trusted pin', a.scalar('SELECT COUNT(*) FROM pin') == 0 and a.scalar("SELECT COUNT(*) FROM block WHERE state='READY'") == 0)
    a.upload_pin('partial', 0)
    rejects('one missing ordinal still blocks file publication', lambda: a.complete('partial'), 'INCOMPLETE')
    a.stage('partial', 1, payload[1]); a.upload_pin('partial', 1)
    check('retry after missing block completes one immutable manifest', a.complete('partial') == (8, 102))

    race = fresh(); race.prepared('left', chunks=payload); race.prepared('right', user='B', chunks=payload)
    def write(who):
        try:
            return race.complete('left' if who == 'A' else 'right', key=who, user=who)
        except Rejected as error:
            return str(error)
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(write, ['A', 'B']))
    check('two actual SQLite writers from parent 7 have one winner and one 412', outcomes.count((8, 102)) == 1 and outcomes.count('412') == 1)
    traces['parent_race'] = outcomes

    rollback = fresh()
    try:
        with scope['connect'](rollback.file) as db, scope['tx'](db):
            db.execute('UPDATE guard SET head=head+1')
            db.execute("INSERT INTO change VALUES(102,'f1',8)")
            raise RuntimeError('abort after counter update and event insertion')
    except RuntimeError:
        pass
    check('counter and inserted event roll back after actual counter increment', rollback.scalar('SELECT head FROM guard') == 101 and rollback.scalar('SELECT COUNT(*) FROM change') == 0)
    rollback.prepared(chunks=payload)
    check('next committed operation reuses rolled-back 102 without a hidden event', rollback.complete('u') == (8, 102))

    reuse = fresh(); reuse.prepared('source', chunks=payload, target='f2', base=0); reuse.complete('source', key='source')
    reuse.init('reuse', user='B', chunks=payload)
    rejects('same tenant hash never substitutes for source read permission', lambda: reuse.reuse_pin('reuse', 0, 'f2', 1, 0, user='B'), 'SOURCE_ACL')
    reuse.write("INSERT INTO acl VALUES('f2','B',1,0)")
    for i in range(2):
        reuse.reuse_pin('reuse', i, 'f2', 1, i, user='B')
    reuse.write("UPDATE acl SET r=0 WHERE file='f2' AND actor='B'")
    rejects('source ACL revoked after pin still blocks commit', lambda: reuse.complete('reuse', key='reuse', user='B'), 'SOURCE_ACL')

    gc = fresh(); gc.prepared('old', chunks=payload)
    old_key = gc.fence('old-0', now=200)
    gc.init('new', chunks=[payload[0]])
    gc.write("UPDATE session SET expires=400 WHERE id='new'")
    gc.stage('new', 0, payload[0], gen='fresh-generation')
    gc.write("UPDATE attempt SET expires=400 WHERE g='fresh-generation'")
    check('GC-first allows identical bytes only through a fresh generation', gc.upload_pin('new', 0, now=201, gen='fresh-generation') == 'fresh-generation')
    check('unknown DELETE cannot be marked terminal', gc.sweep('old-0', unknown=True) == 'RETRY' and gc.scalar("SELECT state FROM block WHERE g='old-0'") == 'DELETING')
    gc.sweep('old-0')
    with scope['connect'](gc.objects) as objects:
        objects.execute('DELETE FROM object WHERE key=?', (old_key,))
        check('late duplicate old DELETE cannot touch new physical key', objects.execute("SELECT COUNT(*) FROM object WHERE key='t/final/fresh-generation'").fetchone()[0] == 1)
    check('fresh generation remains committable after old DELETE retry', gc.complete('new', key='new', now=202) == (8, 102))

    horizon = fresh(); horizon.write('UPDATE guard SET head=0,floor=0')
    check('H=0 is a valid fixed empty horizon', horizon.changes(0, H=0) == ([], 0, 0))
    horizon.prepared(chunks=payload); horizon.complete('u')
    check('later commits do not turn H=0 into an unbounded request', horizon.changes(0, H=0) == ([], 0, 0))
    pages = fresh(); pages.prepared('visible', chunks=payload); pages.complete('visible', key='visible')
    pages.prepared('private', chunks=payload, target='f2', base=0); pages.complete('private', key='private')
    check('raw first page captures committed H', pages.changes(101, user='B', limit=1) == ([102], 102, 103))
    check('empty authorized page advances over scanned private raw row', pages.changes(102, H=103, user='B', limit=1) == ([], 103, 103))
    pages.write('UPDATE guard SET epoch=2')
    rejects('ACL visibility epoch change invalidates old page', lambda: pages.changes(103, epoch=1), 'RESET')

# Reproduce the exact P1 on the original schema, then execute fixed source SQL.
schema = (ROOT / 'examples/ch15/schema.sql').read_text()
complete = (ROOT / 'examples/ch15/complete.pseudo').read_text()
gc_source = (ROOT / 'examples/ch15/gc.pseudo').read_text()
guard_sql = re.search(r'UPDATE tenant_guard SET.*?WHERE tenant_id=auth\.tenant', complete, re.S)[0]
generation_sql = re.search(r'UPDATE BlockGeneration SET state=DELETED\s+WHERE[^\n]+', gc_source)[0]

def adapt(q):
    return (q.replace('auth.tenant', ':tenant').replace('job.tenant', ':tenant')
             .replace('job.generation', ':generation').replace('s.size', ':size')
             .replace('UPDATE BlockGeneration', 'UPDATE block_generation')
             .replace('state=DELETED', "state='DELETED'"))

db = sqlite3.connect(':memory:')
db.create_function('checked_add', 2, lambda a, b: a + b)
db.executescript(schema)
db.executemany('INSERT INTO tenant_guard VALUES(?,?,?,?)', [('A', 101, 0, 1000), ('B', 501, 70, 2000)])
db.executemany('INSERT INTO block_generation VALUES(?,?,?,?,?,?)', [('A', 'g1', 'ha', 4, 'key-A', 'DELETING'), ('B', 'g1', 'hb', 4, 'key-B', 'READY')])
params = {'tenant': 'A', 'generation': 'g1', 'size': 8}
db.execute('SAVEPOINT legacy')
legacy_guard = 'UPDATE tenant_guard SET used_bytes=used_bytes+:size, change_head=change_head+1'
legacy_gc = "UPDATE block_generation SET state='DELETED' WHERE generation=:generation"
db.execute(legacy_guard, params); db.execute(legacy_gc, params)
traces['old_sql'] = {'statements': [legacy_guard, legacy_gc],
                     'guards': db.execute('SELECT tenant_id,change_head,used_bytes FROM tenant_guard ORDER BY tenant_id').fetchall(),
                     'generations': db.execute('SELECT tenant_id,generation,state FROM block_generation ORDER BY tenant_id').fetchall()}
check('old guard statement visibly changes the unrelated tenant', traces['old_sql']['guards'] == [('A', 102, 8), ('B', 502, 78)])
check('old generation-only statement visibly deletes unrelated READY state', traces['old_sql']['generations'] == [('A', 'g1', 'DELETED'), ('B', 'g1', 'DELETED')])
db.execute('ROLLBACK TO legacy'); db.execute('RELEASE legacy')
db.execute(adapt(guard_sql), params); db.execute(adapt(generation_sql), params)
traces['fixed_sql'] = {'extracted_statements': [guard_sql, generation_sql],
                       'adapted_statements': [adapt(guard_sql), adapt(generation_sql)],
                       'guards': db.execute('SELECT tenant_id,change_head,used_bytes FROM tenant_guard ORDER BY tenant_id').fetchall(),
                       'generations': db.execute('SELECT tenant_id,generation,state FROM block_generation ORDER BY tenant_id').fetchall()}
check('fixed source guard predicate preserves B counts and head', traces['fixed_sql']['guards'] == [('A', 102, 8), ('B', 501, 70)])
check('fixed source generation predicate preserves B READY state', traces['fixed_sql']['generations'] == [('A', 'g1', 'DELETED'), ('B', 'g1', 'READY')])
db.close()
for text, expected, label in [
    (complete, 'WHERE tenant_id=auth.tenant AND id=s.file_id', 'File update'),
    (complete, 'WHERE tenant_id=auth.tenant AND id=s.id', 'Session update'),
    (complete, 'DELETE SessionBlock WHERE tenant_id=auth.tenant', 'Pin release'),
    (gc_source, 'require_durable_job(job.tenant, job.generation)', 'durable GC identity'),
    (gc_source, 'WHERE tenant_id=job.tenant AND generation=job.generation', 'GC terminal update'),
    ((ROOT/'examples/ch15/pin.pseudo').read_text(), 'SessionBlock(auth.tenant, s.id', 'Pin adoption'),
    ((ROOT/'examples/ch15/changes.pseudo').read_text(), 'Change WHERE tenant_id=auth.tenant', 'Change query')]:
    check(label + ' is explicitly tenant scoped after repair', expected in text)

numbers = {
 'saves_daily': F(10_000_000*2),
 'peak_file_qps': F(20_000_000*5,86400),
 'peak_inbound_gbps': F(10**15*8*5,86400*10**9),
 'exact_50MB_block_peak': F(20_000_000*math.ceil(F(50_000_000,2**22))*5,86400),
 'aggregate_block_peak_upper_bound': (F(10**15,2**22)+20_000_000)*5/86400,
 'quota_ceiling_PB': F(50_000_000*10*10**9,10**15),
 'resume_seconds': F(64*2**22*8,20_000_000),
 'whole_file_seconds': F(2**30*8,20_000_000),
 'digest_bytes_4MiB': F((2**30//2**22)*32),
 'digest_bytes_64KiB': F((2**30//2**16)*32),
 'cow_saved_fraction': F(24-16,24),
 'abandoned_48h_TB': F(10**15,100)*2/10**12,
}
check('independent binary/decimal transfer arithmetic', numbers['resume_seconds'] == F(33554432,312500) and round(numbers['whole_file_seconds'],3) == F(429497,1000))
check('independent block-rounding upper bound', round(numbers['aggregate_block_peak_upper_bound'],3) == F(14954779,1000))
check('independent quota and orphan sizing', numbers['quota_ceiling_PB'] == 500 and numbers['abandoned_48h_TB'] == 20)
check('independent manifest and COW sizing', numbers['digest_bytes_4MiB'] == 8192 and numbers['digest_bytes_64KiB'] == 524288 and numbers['cow_saved_fraction'] == F(1,3))
result = {'passed':True,'count':len(checks),'checks':checks,'traces':traces,
          'htmlSha256':hashlib.sha256((ROOT/'chapters/ch15.html').read_bytes()).hexdigest(),
          'schemaSha256':hashlib.sha256(schema.encode()).hexdigest(),
          'numbers':{k:{'exact':str(v),'decimal':float(v)} for k,v in numbers.items()},
          'limits':['Model definitions reused as SUT, new independent scenarios; author top-level runner not executed',
                    'SQLite writer serialization is coarser than PostgreSQL tenant row locks',
                    'Original schema executed unchanged; pseudocode parameter/enum/table spelling adapted, predicates preserved',
                    'Objects are a separate SQLite model, not S3/CDN/IAM or device persistence experiments']}
(ROOT/'docs/reviews/ch15-independent-probe-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'passed':True,'checks':len(checks),'htmlSha256':result['htmlSha256']}))
