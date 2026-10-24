"""Fresh multi-connection metadata inputs against Ch35, without author fixtures."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import datetime
import hashlib
import importlib.util
import json
import sys
import tempfile
import threading
import time

ROOT = Path(__file__).resolve().parents[2]
sys.dont_write_bytecode = True
path = ROOT / 'examples/ch35/ledger.py'
spec = importlib.util.spec_from_file_location('root_fleet', path)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
checks = []


def check(name, condition):
    checks.append({'name': name, 'passed': bool(condition)})
    assert condition, name


def refused(name, fn):
    try:
        fn()
    except m.Refused:
        check(name, True)
    else:
        check(name, False)


with tempfile.TemporaryDirectory() as tmp:
    dbpath = Path(tmp) / 'fleet.db'
    db = m.connect(dbpath)
    m.init(db)
    manifest = {'weights': 'root-weights-v1', 'tokenizer': 'root-tokenizer-v3',
                'prompt': 'root-template-v5', 'image': 'root-image-v4',
                'config': 'root-config-v8', 'api': 'chat-v1', 'state': 's1'}
    b1 = m.register(db, manifest)
    b2 = m.register(db, manifest | {'weights': 'root-weights-v2'})
    incompatible = m.register(db, manifest | {'state': 'next-schema'})
    for tenant in ['root-a', 'root-b']:
        db.execute("INSERT INTO tenant(id,tier,slots,kv) VALUES(?,'shared',3,13)", (tenant,))
    for worker, bundle in [('root-old', b1), ('root-new', b2), ('root-incompatible', incompatible)]:
        db.execute("INSERT INTO replica(id,epoch,bundle,profile,tier,ready,draining,slots,kv) VALUES(?,23,?,'profile-96','shared',1,0,3,13)", (worker, bundle))
    e1, e2 = [['root-old', 23, b1, 'profile-96']], [['root-new', 23, b2, 'profile-96']]
    m.publish(db, 'root-initial', 0, {b1: 9}, e1, 500, 'root-authorized-publisher')

    def q(rid, tenant='root-a', **more):
        return {'tenant': tenant, 'rid': rid, 'body': 'root-normalized-request-71',
                'bundle': b1, 'profile': 'profile-96', 'epoch': 23,
                'replica': 'root-old', 'kv': 3, 'rev': 1, 'deadline': 450, **more}

    first = m.reserve(db, q('same'), lambda: 100)
    check('fresh hold pins exact worker generation and bundle', first['created'] and first['epoch'] == 23 and first['bundle'] == b1)
    repeated = m.reserve(db, q('same', deadline=499), lambda: 101)
    check('retry cannot extend the original dispatch deadline', not repeated['created'] and repeated['deadline'] == 450)
    refused('same rid cannot switch the request payload', lambda: m.reserve(db, q('same', body='different-digest'), lambda: 101))
    other = m.reserve(db, q('same', tenant='root-b'), lambda: 101)
    check('same rid in another tenant is a different durable hold', other['created'])
    check('two tenant holds debit a shared replica twice', m.one(db, "SELECT used_slots FROM replica WHERE id='root-old'")['used_slots'] == 2)
    before = [tuple(x) for x in db.execute('SELECT * FROM tenant ORDER BY id')]
    try:
        m.reserve(db, q('partial-fail'), lambda: 102, fail_after_tenant=True)
    except RuntimeError:
        pass
    check('injected partial hold leaves both tenant rows unchanged', before == [tuple(x) for x in db.execute('SELECT * FROM tenant ORDER BY id')])
    check('no durable permit escaped a rolled-back hold', db.execute("SELECT count(*) FROM permit WHERE rid='partial-fail'").fetchone()[0] == 0)
    check('undispatched holds can expire at their deadline', m.expire(db, 'root-a', 'same', lambda: 450) and m.expire(db, 'root-b', 'same', lambda: 450))
    check('expired key does not reopen even before a new caller deadline', not m.reserve(db, q('same', deadline=499), lambda: 451)['created'])

    # Last KV credit is the limiting dimension even though three slots are free.
    start = threading.Barrier(5)

    def compete(i):
        d = m.connect(dbpath)
        try:
            start.wait()
            try:
                return m.reserve(d, q('kv-' + str(i), kv=7), lambda: 200)['created']
            except m.Refused:
                return False
        finally:
            d.close()

    with ThreadPoolExecutor(max_workers=5) as pool:
        winners = list(pool.map(compete, range(5)))
    check('five real writers cannot oversell thirteen KV credits with seven each', sum(winners) == 1)
    check('losers do not debit sequence or KV capacity', tuple(db.execute("SELECT used_slots,used_kv FROM replica WHERE id='root-old'").fetchone()) == (1, 7))
    winner = 'kv-' + str(winners.index(True))
    m.expire(db, 'root-a', winner, lambda: 450)

    # Clock must not be read until BEGIN IMMEDIATE has obtained the writer lock.
    locker = m.connect(dbpath)
    locker.execute('BEGIN IMMEDIATE')
    entered = threading.Event()
    clock_state = {'value': 449, 'reads': 0}

    def clock():
        clock_state['reads'] += 1
        return clock_state['value']

    def blocked_request():
        d = m.connect(dbpath)
        entered.set()
        try:
            try:
                m.reserve(d, q('crosses-deadline'), clock)
                return 'accepted'
            except m.Refused:
                return 'refused'
        finally:
            d.close()

    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(blocked_request)
        entered.wait(2)
        time.sleep(.08)
        check('blocked operation has not sampled the authority clock', not future.done() and clock_state['reads'] == 0)
        clock_state['value'] = 451
        locker.execute('COMMIT')
        check('operation rejects after lock wait crosses its deadline', future.result(timeout=3) == 'refused' and clock_state['reads'] == 1)
    locker.close()
    check('late lock acquisition leaves no new credit', tuple(db.execute("SELECT used_slots,used_kv FROM replica WHERE id='root-old'").fetchone()) == (0, 0))

    live = m.reserve(db, q('live'), lambda: 300)
    check('first dispatcher wins a persistent transition', m.begin_dispatch(db, 'root-a', 'live', lambda: 301))
    check('dispatch ACK loss does not authorize another send', not m.begin_dispatch(db, 'root-a', 'live', lambda: 302))
    check('unknown dispatch is not released by TTL', not m.expire(db, 'root-a', 'live', lambda: 900))
    check('worker launches the fixed tuple once', m.consume(db, 'root-a', 'live', 'root-old', 23, b1, lambda: 303))
    rev = m.publish(db, 'root-promote', 1, {b2: 7}, e2, 800, 'root-authorized-publisher')
    check('publication retry returns the same durable revision', rev == 2 and m.publish(db, 'root-promote', 1, {b2: 7}, e2, 800, 'root-authorized-publisher') == 2)
    check('promotion leaves running work pinned to the former bundle', m.permit(db, 'root-a', 'live')['bundle'] == b1)
    refused('stale route cannot mint a new hold', lambda: m.reserve(db, q('stale-route'), lambda: 304))
    m.begin_drain(db, 'root-old')
    check('a live old stream prevents unloading', not m.unload(db, 'root-old'))
    refused('rollback cannot route to a draining old worker', lambda: m.publish(db, 'root-draining-back', 2, {b1: 1}, e1, 800, 'root-authorized-publisher'))
    refused('rollback cannot switch persisted-state schema', lambda: m.publish(db, 'root-incompatible', 2, {incompatible: 1}, [['root-incompatible', 23, incompatible, 'profile-96']], 800, 'root-authorized-publisher'))
    check('retirement retains capacity until physical evidence', m.retire(db, 'root-a', 'live') and m.one(db, "SELECT used_slots FROM replica WHERE id='root-old'")['used_slots'] == 1)
    check('old generation cannot release the current permit', not m.release(db, 'root-a', 'live', 'root-old', 22))
    check('trusted completion releases both budgets exactly once', m.release(db, 'root-a', 'live', 'root-old', 23) and not m.release(db, 'root-a', 'live', 'root-old', 23))
    check('zero physical credit permits the old worker to unload', m.unload(db, 'root-old'))
    check('late duplicate cannot launch after retirement', not m.consume(db, 'root-a', 'live', 'root-old', 23, b1, lambda: 304))
    db.close()

result = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'files': {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest()},
          'checks': checks, 'passed': all(c['passed'] for c in checks),
          'limits': 'Actual SQLite multi-connection contention and metadata transitions. Physical GPU retirement, signatures, routing, workload goodput and real serving are trusted adapters or untested assumptions.'}
(ROOT / 'docs/reviews/ch34-ch35-ch36-root-fleet-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'passed': result['passed'], 'checks': len(checks)}))
