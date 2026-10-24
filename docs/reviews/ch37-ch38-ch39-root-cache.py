"""New inputs against the actual Ch38 cache adapter, independent of its author runner."""
from pathlib import Path
import concurrent.futures
import hashlib
import importlib.util
import json
import sqlite3
import sys
import tempfile
import threading
import time

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'examples/ch38/cache.py'
before = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
spec = importlib.util.spec_from_file_location('root_ch38_cache', SOURCE)
mod = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = mod
spec.loader.exec_module(mod)
checks = []


def check(label, ok):
    checks.append({'label': label, 'passed': bool(ok)})
    if not ok:
        raise AssertionError(label)


with tempfile.TemporaryDirectory() as directory:
    file = str(Path(directory) / 'cache.db')
    now = [70000]
    a = mod.Cache(file, lambda: now[0])
    status, ticket = a.claim('tenant-a|sku-91|en|gzip')
    check('initial miss becomes leader', status == 'LEADER')
    check('second caller waits on same live ticket', a.claim('tenant-a|sku-91|en|gzip')[0] == 'WAIT')
    evidence = mod.Evidence.primary(7, 70000, body='old')
    a.invalidate('tenant-a|sku-91|en|gzip', 9)
    check('old fill after invalidation rejected', not a.fill('tenant-a|sku-91|en|gzip', ticket, evidence))
    status, fresh = a.claim('tenant-a|sku-91|en|gzip')
    check('invalidation revoked lease', status == 'LEADER' and fresh != ticket)
    check('new token still rejects old row version', not a.fill('tenant-a|sku-91|en|gzip', fresh, evidence))
    current = mod.Evidence.primary(9, 70000, body='new')
    check('fresh row accepted under same new ticket', a.fill('tenant-a|sku-91|en|gzip', fresh, current))
    hit, stored = a.claim('tenant-a|sku-91|en|gzip')
    check('hit preserves original timestamp and body', hit == 'HIT' and stored == current)
    check('used fill ticket cannot write twice', not a.fill('tenant-a|sku-91|en|gzip', fresh, current))
    check('different language does not reuse selected representation', a.claim('tenant-a|sku-91|fr|gzip')[0] == 'LEADER')
    check('different tenant does not reuse entry', a.claim('tenant-b|sku-91|en|gzip')[0] == 'LEADER')
    a.invalidate('tenant-a|sku-91|en|gzip', 11)
    a.invalidate('tenant-a|sku-91|en|gzip', 3)
    floor = a.db.execute('SELECT floor FROM metadata WHERE key=?', ('tenant-a|sku-91|en|gzip',)).fetchone()[0]
    check('out-of-order invalidation never lowers floor', floor == 11)
    _, token = a.claim('tenant-a|sku-91|en|gzip')
    a.restart()
    check('old epoch rejects outstanding fill', not a.fill('tenant-a|sku-91|en|gzip', token, mod.Evidence.primary(11, 70000)))
    check('restart drops values', a.value('tenant-a|sku-91|en|gzip') is None)
    _, token = a.claim('evicted-metadata')
    a.db.execute('DELETE FROM metadata WHERE key=?', ('evicted-metadata',))
    check('missing metadata fails old ticket closed', not a.fill('evicted-metadata', token, mod.Evidence.primary(1, 70000)))
    _, token = a.claim('lease-boundary')
    now[0] = 71000
    check('lease equality rejects late fill', not a.fill('lease-boundary', token, mod.Evidence.primary(1, 70000)))
    _, newer = a.claim('lease-boundary')
    check('replacement token is distinct', newer != token)
    check('old holder cannot overwrite new lease', not a.fill('lease-boundary', token, mod.Evidence.primary(1, 71000)))
    check('new lease can fill', a.fill('lease-boundary', newer, mod.Evidence.primary(1, 71000)))
    _, missing = a.claim('negative')
    wrong = mod.Evidence(0, 71000, 91000, True, '')
    check('negative entry cannot claim positive twenty-second life', not a.fill('negative', missing, wrong))
    absent = mod.Evidence.primary(0, 71000, absent=True)
    check('confirmed absence uses five-second life', a.fill('negative', missing, absent))
    now[0] = 74000
    check('negative hit unavailable at clock safety boundary', a.claim('negative')[0] == 'LEADER')
    _, future = a.claim('future')
    check('future evidence beyond allowed skew rejected', not a.fill('future', future, mod.Evidence.primary(1, 76001)))
    a.close()

    # Eight separate SQLite connections contend for one lease. The barrier only
    # releases callers; serialization is provided by the actual file transaction.
    ready = threading.Barrier(8)

    def contend(index):
        cache = mod.Cache(file, lambda: 80000)
        ready.wait(timeout=10)
        result = cache.claim('contended-key')[0]
        cache.close()
        return result

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        outcomes = list(pool.map(contend, range(8)))
    check('eight connections produce exactly one lease leader', outcomes.count('LEADER') == 1)
    check('remaining connections wait', outcomes.count('WAIT') == 7)

    # Force a real SQLite lock wait. The injected clock changes while blocked;
    # fill must sample it after the wait and reject at the lease boundary.
    a = mod.Cache(file, lambda: 90000)
    _, ticket = a.claim('lock-wait')
    holder = sqlite3.connect(file, isolation_level=None)
    initialized, go, entered, sampled = (threading.Event() for _ in range(4))
    time_now = [90000]
    calls = []
    outcome = []

    def blocked_fill():
        def clock():
            calls.append(time_now[0]); sampled.set(); return time_now[0]
        cache = mod.Cache(file, clock)
        initialized.set(); go.wait(10); entered.set()
        outcome.append(cache.fill('lock-wait', ticket, mod.Evidence.primary(1, 90000)))
        cache.close()

    thread = threading.Thread(target=blocked_fill)
    thread.start(); check('lock-wait worker initialized', initialized.wait(10))
    holder.execute('BEGIN IMMEDIATE'); go.set(); check('worker entered fill', entered.wait(10))
    check('clock not sampled before held write lock', not sampled.wait(0.05))
    time_now[0] = 91000
    holder.execute('COMMIT'); thread.join(10)
    check('worker finished after lock release', not thread.is_alive())
    check('lock wait observes new deadline and rejects', outcome == [False] and calls == [91000])
    holder.close(); a.close()

after = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
result = {'sourceHashes': {'examples/ch38/cache.py': after}, 'sourcesUnchangedDuringRun': before == after,
          'checks': checks, 'passed': before == after and all(c['passed'] for c in checks),
          'limits': 'Real SQLite file and independent thread-owned connections; controlled clocks for exact boundaries. No Redis replication, CDN, live HTTP, physical cancellation or clock synchronization experiment.'}
(ROOT / 'docs/reviews/ch37-ch38-ch39-root-cache-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'passed': result['passed'], 'checks': len(checks)}))
raise SystemExit(0 if result['passed'] else 1)
