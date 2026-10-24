"""Independent inputs against the actual SQLite checkout/publication adapter."""
from pathlib import Path
import concurrent.futures
import hashlib
import importlib.util
import json
import subprocess
import sys
import tempfile
import threading
import time

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
FILES = ['examples/ch37/storage.py', 'examples/ch37/schema.sql', 'examples/ch37/publication.sql']
before = {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in FILES}
spec = importlib.util.spec_from_file_location('root_ch37_storage', ROOT / FILES[0])
mod = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = mod
spec.loader.exec_module(mod)
checks = []


def check(label, ok):
    checks.append({'label': label, 'passed': bool(ok)})
    if not ok:
        raise AssertionError(label)


def raises(error, action):
    try:
        action()
    except error:
        return True
    return False


def rows(file, sql, params=()):
    db = mod.connect(file)
    try:
        return [tuple(row) for row in db.execute(sql, params).fetchall()]
    finally:
        db.close()


def request(*lines, delivery='address-v1'):
    return {'lines': list(lines), 'delivery_ref': delivery}


with tempfile.TemporaryDirectory() as directory:
    file = str(Path(directory) / 'store.db')
    mod.initialize(file, {'a': 30, 'b': 3, 'c': 0, 'last': 1, 'same': 5, 'crash': 5})
    original = request(('a', 2), ('b', 1))
    made = mod.checkout(file, 'tenant-a/user-7', 'key-7', original)
    check('normal multi-SKU transaction created', made['outcome'] == 'CREATED' and bool(made['order_id']))
    equivalent = request(('b', 1), ('a', 1), ('a', 1))
    check('canonical equivalent duplicate returns exact stored outcome', mod.checkout(file, 'tenant-a/user-7', 'key-7', equivalent) == made)
    check('duplicate does not decrement twice', rows(file, 'SELECT on_hand FROM inventory WHERE sku IN (?,?) ORDER BY sku', ('a', 'b')) == [(28,), (2,)])
    check('changed delivery conflicts on same key', raises(mod.KeyConflict, lambda: mod.checkout(file, 'tenant-a/user-7', 'key-7', request(('a', 2), ('b', 1), delivery='address-v2'))))
    check('changed quantity conflicts on same key', raises(mod.KeyConflict, lambda: mod.checkout(file, 'tenant-a/user-7', 'key-7', request(('a', 1), ('b', 1)))))
    other = mod.checkout(file, 'tenant-b/user-7', 'key-7', request(('a', 1)))
    check('globally scoped caller separates same key', other['outcome'] == 'CREATED' and other['order_id'] != made['order_id'])
    stock_before = rows(file, 'SELECT sku,on_hand FROM inventory ORDER BY sku')
    count_before = rows(file, 'SELECT COUNT(*) FROM orders')[0][0]
    denied = mod.checkout(file, 'tenant-a/user-7', 'no-stock', request(('a', 3), ('c', 1)))
    check('later missing SKU stores OUT_OF_STOCK', denied == {'outcome': 'OUT_OF_STOCK', 'order_id': None})
    check('earlier successful decrement rolled back', rows(file, 'SELECT sku,on_hand FROM inventory ORDER BY sku') == stock_before)
    check('failed order row rolled back', rows(file, 'SELECT COUNT(*) FROM orders')[0][0] == count_before)
    db = mod.connect(file); db.execute("UPDATE inventory SET on_hand=2 WHERE sku='c'"); db.close()
    check('stored rejected result remains idempotent after replenishment', mod.checkout(file, 'tenant-a/user-7', 'no-stock', request(('a', 3), ('c', 1))) == denied)
    check('new key permits a new logical attempt', mod.checkout(file, 'tenant-a/user-7', 'after-restock', request(('a', 3), ('c', 1)))['outcome'] == 'CREATED')
    for label, bad in [('negative', request(('a', -1))), ('zero', request(('a', 0))), ('bool', request(('a', True))), ('huge', request(('a', 1000001))), ('merged-overflow', request(('a', 600000), ('a', 600000)))]:
        check(f'{label} quantity rejected before effects', raises(ValueError, lambda bad=bad: mod.checkout(file, 'tenant-a/user-7', 'bad-' + label, bad)))
    check('unknown request field not silently omitted from binding', raises(ValueError, lambda: mod.checkout(file, 'tenant-a/user-7', 'extra', dict(request(('a', 1)), coupon='different'))))
    before_lost = rows(file, "SELECT on_hand FROM inventory WHERE sku='a'")[0][0]
    check('committed lost reply is surfaced as unknown transport outcome', raises(mod.LostReply, lambda: mod.checkout(file, 'tenant-a/user-7', 'lost', request(('a', 1)), failpoint='lost_reply')))
    found = mod.checkout(file, 'tenant-a/user-7', 'lost', request(('a', 1)))
    check('same-key recovery finds committed order', found['outcome'] == 'CREATED')
    check('recovery did not decrement again', rows(file, "SELECT on_hand FROM inventory WHERE sku='a'")[0][0] == before_lost - 1)

    barrier = threading.Barrier(8)
    def last(index):
        barrier.wait(10)
        return mod.checkout(file, 'racing', f'last-{index}', request(('last', 1)))
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        outcomes = list(pool.map(last, range(8)))
    check('eight connections cannot oversell final unit', sum(r['outcome'] == 'CREATED' for r in outcomes) == 1)
    check('other last-unit attempts retain failed outcomes', sum(r['outcome'] == 'OUT_OF_STOCK' for r in outcomes) == 7)
    check('stock ends at zero', rows(file, "SELECT on_hand FROM inventory WHERE sku='last'") == [(0,)])
    same_barrier = threading.Barrier(6)
    def same(index):
        same_barrier.wait(10)
        return mod.checkout(file, 'racing', 'same-identity', request(('same', 2)))
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        outcomes = list(pool.map(same, range(6)))
    check('concurrent retries return one exact outcome', all(result == outcomes[0] for result in outcomes) and outcomes[0]['outcome'] == 'CREATED')
    check('same identity deducts once', rows(file, "SELECT on_hand FROM inventory WHERE sku='same'") == [(3,)])

    child = "import json,sys; sys.dont_write_bytecode=True; sys.path.insert(0,sys.argv[1]); import storage; storage.checkout(sys.argv[2], 'process-exit', sys.argv[3], json.loads(sys.argv[4]), failpoint=sys.argv[5])"
    for failpoint, code in [('exit_before_commit', 23), ('exit_after_commit', 24)]:
        key = 'fresh-' + failpoint
        prior = rows(file, "SELECT on_hand FROM inventory WHERE sku='crash'")[0][0]
        exited = subprocess.run([sys.executable, '-c', child, str(ROOT / 'examples/ch37'), file, key,
                                 json.dumps(request(('crash', 1))), failpoint], capture_output=True, text=True)
        check(f'{failpoint} child actually exited at failpoint', exited.returncode == code)
        committed = failpoint == 'exit_after_commit'
        check(f'{failpoint} stock matches transaction outcome', rows(file, "SELECT on_hand FROM inventory WHERE sku='crash'")[0][0] == prior - int(committed))
        check(f'{failpoint} durable idempotency matches transaction', bool(rows(file, 'SELECT 1 FROM idempotency WHERE caller=? AND key=?', ('process-exit', key))) == committed)
        recovered = mod.checkout(file, 'process-exit', key, request(('crash', 1)))
        check(f'{failpoint} retry converges to one order', recovered['outcome'] == 'CREATED' and rows(file, "SELECT on_hand FROM inventory WHERE sku='crash'")[0][0] == prior - 1)

    db = mod.connect(file)
    for caller, upload, key, expiry in [
        ('owner-a', 'up-a', 'store/bucket-a/object-a', int(time.time()) + 1000),
        ('owner-a', 'up-b', 'store/bucket-a/object-b', int(time.time()) + 1000),
        ('owner-b', 'up-a', 'store/bucket-b/object-a', int(time.time()) + 1000),
        ('owner-a', 'expired', 'store/bucket-a/expired', int(time.time()) - 1000)]:
        db.execute("INSERT INTO upload(caller,upload_id,state,object_key,expected_size,checksum,expires_at) VALUES (?,?,'PENDING',?,10,'same-content',?)",
                   (caller, upload, key, expiry))
    db.close()
    proof_a = {'caller': 'owner-a', 'upload_id': 'up-a', 'object_key': 'store/bucket-a/object-a',
               'version': 'opaque-version-a', 'size': 10, 'checksum': 'same-content'}
    proof_b = dict(proof_a, upload_id='up-b', object_key='store/bucket-a/object-b', version='opaque-version-b')
    check('original unbound proof shape rejected', raises(ValueError, lambda: mod.publication(file, 'owner-a', 'up-a', {'version': 'opaque-version-b', 'size': 10, 'checksum': 'same-content'})))
    check('other session proof rejected even with identical content', raises(mod.KeyConflict, lambda: mod.publication(file, 'owner-a', 'up-a', proof_b)))
    check('other caller proof rejected', raises(mod.KeyConflict, lambda: mod.publication(file, 'owner-b', 'up-a', proof_a)))
    check('proof retagged with wrong object key cannot publish', mod.publication(file, 'owner-a', 'up-a', dict(proof_b, upload_id='up-a')) is None)
    check('full storage namespace is bound', mod.publication(file, 'owner-a', 'up-a', dict(proof_a, object_key='other-store/bucket-a/object-a')) is None)
    check('wrong size cannot publish', mod.publication(file, 'owner-a', 'up-a', dict(proof_a, size=11)) is None)
    check('failed proof leaves PENDING metadata', rows(file, "SELECT state FROM upload WHERE caller='owner-a' AND upload_id='up-a'") == [('PENDING',)])
    published = mod.publication(file, 'owner-a', 'up-a', proof_a)
    check('bound verified proof commits metadata', published == {'upload_id': 'up-a', 'state': 'COMMITTED', 'object_version': 'opaque-version-a'})
    check('publication retry returns stored result', mod.publication(file, 'owner-a', 'up-a', proof_a) == published)
    check('committed publication rejects different exact version', raises(mod.KeyConflict, lambda: mod.publication(file, 'owner-a', 'up-a', dict(proof_a, version='other-version'))))
    check('cleaner cannot acquire COMMITTED object', mod.publication(file, 'owner-a', 'up-a') is None)
    expired_proof = dict(proof_a, upload_id='expired', object_key='store/bucket-a/expired')
    check('expired pending upload cannot publish', mod.publication(file, 'owner-a', 'expired', expired_proof) is None)
    aborted = mod.publication(file, 'owner-a', 'expired')
    check('expiry cleaner acquires abort transition once', aborted is not None and aborted['state'] == 'ABORTED')
    check('duplicate cleaner gains no new deletion ownership', mod.publication(file, 'owner-a', 'expired') is None)
    check('late publication cannot resurrect ABORTED', mod.publication(file, 'owner-a', 'expired', expired_proof) is None)

after = {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in FILES}
result = {'sourceHashes': after, 'sourcesUnchangedDuringRun': before == after,
          'checks': checks, 'passed': before == after and all(c['passed'] for c in checks),
          'limits': 'SQLite WAL/FULL single-file transactions, independent thread-owned connections and real child-process exits. No PostgreSQL run, replica promotion, power-cut durability, live S3 verification or production benchmark.'}
(ROOT / 'docs/reviews/ch37-ch38-ch39-root-storage-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'passed': result['passed'], 'checks': len(checks)}))
raise SystemExit(0 if result['passed'] else 1)
