"""Actual SQLite connections/process exits. Evidence is metadata, not GPU safety."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
from ledger import *

ROOT = Path(__file__).resolve().parents[2]
checks = []

def check(ok, name):
    if not ok:
        raise AssertionError(name)
    checks.append(name)


def refused(fn, name):
    try:
        fn()
    except Refused:
        check(True, name)
    else:
        check(False, name)


def fixture(path, slots=2, kv=8):
    db = connect(path)
    init(db)
    manifest = dict(weights='sha:w1', tokenizer='sha:t1', prompt='sha:p1',
                    image='sha:i1', config='sha:c1', api='chat-v1', state='s1')
    b1 = register(db, manifest)
    b2 = register(db, manifest | {'weights': 'sha:w2'})
    bad = register(db, manifest | {'state': 's2'})
    db.execute("INSERT INTO tenant(id,tier,slots,kv) VALUES('t','shared',?,?)", (slots, kv))
    db.execute("INSERT INTO tenant(id,tier,slots,kv) VALUES('private','private:t',?,?)", (slots, kv))
    for name, bundle, tier in [('w1', b1, 'shared'), ('w2', b2, 'shared'),
                                ('bad', bad, 'shared'), ('private', b1, 'private:t')]:
        db.execute('''INSERT INTO replica(id,epoch,bundle,profile,tier,ready,draining,slots,kv)
                      VALUES(?,7,?,'p80',?,1,0,?,?)''', (name, bundle, tier, slots, kv))
    e1 = [['w1', 7, b1, 'p80']]
    e2 = [['w2', 7, b2, 'p80']]
    publish(db, 'initial', 0, {b1: 1}, e1, 5000, 'reviewer')
    return db, b1, b2, bad, e1, e2


def query(bundle, rid='r', kv=4, rev=1, worker='w1'):
    return dict(tenant='t', rid=rid, body='sha:normalized-input-and-limits',
                bundle=bundle, profile='p80', epoch=7, replica=worker,
                kv=kv, rev=rev, deadline=200)


def usage(db):
    return [tuple(r) for r in db.execute('SELECT id,used_slots,used_kv FROM tenant ORDER BY id')], \
           [tuple(r) for r in db.execute('SELECT id,used_slots,used_kv FROM replica ORDER BY id')]


def race(path, functions):
    barrier = threading.Barrier(len(functions))
    def call(fn):
        db = connect(path)
        try:
            barrier.wait()
            return fn(db)
        except Refused:
            return 'refused'
        finally:
            db.close()
    with ThreadPoolExecutor(max_workers=len(functions)) as pool:
        return list(pool.map(call, functions))


def run():
  with tempfile.TemporaryDirectory(prefix='ch35-') as tmp:
    def fresh(name, slots=2, kv=8):
        path = str(Path(tmp) / (name + '.db'))
        return path, fixture(path, slots, kv)

    path, (db, b1, b2, bad, e1, e2) = fresh('normal')
    q = query(b1)
    p = reserve(db, q, lambda: 0)
    check(p['created'] and p['state'] == 'HELD', 'normal hold committed')
    check(not reserve(db, q, lambda: 1)['created'], 'same request replays one hold')
    refused(lambda: reserve(db, q | {'kv': 5}, lambda: 1), 'same key cannot enlarge demand')
    check(begin_dispatch(db, 't', 'r', lambda: 1), 'first dispatcher wins')
    check(not begin_dispatch(db, 't', 'r', lambda: 2), 'lost dispatch ACK never authorizes another send')
    check(not expire(db, 't', 'r', lambda: 201), 'DISPATCHING cannot TTL-release')
    check(not consume(db, 't', 'r', 'w1', 6, b1, lambda: 2), 'old worker epoch refused')
    check(not consume(db, 't', 'r', 'w1', 7, b2, lambda: 2), 'wrong bundle refused')
    check(consume(db, 't', 'r', 'w1', 7, b1, lambda: 2), 'first worker launch permission')
    check(not consume(db, 't', 'r', 'w1', 7, b1, lambda: 3), 'duplicate consume cannot launch')
    check(not release(db, 't', 'r', 'w1', 7), 'running cannot release without retirement')
    check(retire(db, 't', 'r'), 'cancel begins retirement')
    check(one(db, "SELECT used_slots FROM replica WHERE id='w1'")['used_slots'] == 1,
          'cancel retains physical credit')
    check(not release(db, 't', 'r', 'w1', 6), 'wrong completion incarnation refused')
    check(release(db, 't', 'r', 'w1', 7), 'trusted completion releases')
    check(not release(db, 't', 'r', 'w1', 7), 'duplicate completion does not refund twice')
    check(not reserve(db, q, lambda: 10)['created'], 'terminal same key does not reopen')
    check(all(r[1:] == (0, 0) for rows in usage(db) for r in rows), 'normal counters return zero')
    db.close()

    path, (db, b1, *_rest) = fresh('last-slot', slots=1)
    got = race(path, [lambda d, i=i: reserve(d, query(b1, f'r{i}'), lambda: 0)['created'] for i in range(8)])
    check(got.count(True) == 1 and got.count('refused') == 7, '8 connections compete for final slot')
    check(one(db, 'SELECT COUNT(*) n FROM permit')['n'] == 1, 'losing slot requests leave no permit')
    db.close()

    path, (db, b1, *_rest) = fresh('last-kv', slots=8, kv=8)
    got = race(path, [lambda d, i=i: reserve(d, query(b1, f'r{i}', 5), lambda: 0)['created'] for i in range(8)])
    check(got.count(True) == 1, 'KV dimension rejects while sequence slots remain')
    check(one(db, "SELECT used_kv FROM replica WHERE id='w1'")['used_kv'] == 5, 'KV never oversold')
    db.close()

    path, (db, b1, *_rest) = fresh('same-key', slots=1)
    got = race(path, [lambda d: reserve(d, query(b1), lambda: 0)['created']] * 8)
    check(got.count(True) == 1 and got.count(False) == 7, '8 same-key callers receive one durable identity')
    check(one(db, "SELECT used_slots FROM tenant WHERE id='t'")['used_slots'] == 1, 'same key charged once')
    db.close()

    path, (db, b1, *_rest) = fresh('rollback')
    before = usage(db)
    try:
        reserve(db, query(b1), lambda: 0, fail_after_tenant=True)
    except RuntimeError:
        pass
    check(usage(db) == before, 'failure between tenant and replica rolls back both')
    check(one(db, 'SELECT COUNT(*) n FROM permit')['n'] == 0, 'failed reservation leaves no intent')
    db.execute("UPDATE replica SET kv=2 WHERE id='w1'")
    refused(lambda: reserve(db, query(b1), lambda: 0), 'replica KV full after tenant check')
    check(usage(db) == before, 'replica refusal rolls back tenant debit')
    for change, label in [({'profile': 'p40'}, 'heterogeneous profile mismatch'),
                          ({'epoch': 6}, 'stale epoch'), ({'kv': 0}, 'invalid credit')]:
        refused(lambda change=change: reserve(db, query(b1) | change, lambda: 0), label)
    refused(lambda: reserve(db, query(b1) | {'tenant': 'private'}, lambda: 0), 'private cannot enter shared pool')
    refused(lambda: reserve(db, query(b1), lambda: 200), 'deadline equality fails closed')
    db.close()

    for i in range(20):
        path, (db, b1, *_rest) = fresh('expiry-' + str(i), slots=1)
        reserve(db, query(b1), lambda: 0)
        got = race(path, [lambda d: begin_dispatch(d, 't', 'r', lambda: 199),
                          lambda d: expire(d, 't', 'r', lambda: 200)])
        state = permit(db, 't', 'r')['state']
        check(sum(x is True for x in got) == 1, f'expire/dispatch one winner {i}')
        expected = 1 if state == 'DISPATCHING' else 0
        check(one(db, "SELECT used_slots FROM replica WHERE id='w1'")['used_slots'] == expected,
              f'no TTL release after dispatch {i}')
        db.close()

    path, (db, b1, *_rest) = fresh('process')
    code = "import os,sys;from ledger import connect;d=connect(sys.argv[1]);d.execute('BEGIN IMMEDIATE');d.execute(\"UPDATE tenant SET used_slots=1 WHERE id='t'\");os._exit(17)"
    done = subprocess.run([sys.executable, '-c', code, path], cwd=Path(__file__).parent)
    check(done.returncode == 17, 'actual process exit before commit')
    check(one(db, "SELECT used_slots FROM tenant WHERE id='t'")['used_slots'] == 0,
          'SQLite rolls back process-death partial transaction')
    q = query(b1)
    code = 'import os,sys,json;from ledger import *;d=connect(sys.argv[1]);reserve(d,json.loads(sys.argv[2]),lambda:0);os._exit(18)'
    done = subprocess.run([sys.executable, '-c', code, path, json.dumps(q)], cwd=Path(__file__).parent)
    check(done.returncode == 18, 'actual process exit after committed hold before reply')
    check(not reserve(db, q, lambda: 1)['created'], 'reopened connection recovers committed hold without recharge')
    db.close()

    path, (db, b1, *_rest) = fresh('clock-wait')
    locker = connect(path)
    locker.execute('BEGIN IMMEDIATE')
    started = threading.Event()
    logical = {'now': 199, 'calls': 0}
    def clock():
        logical['calls'] += 1
        return logical['now']
    def delayed_hold():
        other = connect(path)
        started.set()
        try:
            reserve(other, query(b1), clock)
            return 'accepted'
        except Refused:
            return 'refused'
        finally:
            other.close()
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(delayed_hold)
        started.wait()
        time.sleep(0.05)
        check(not future.done() and logical['calls'] == 0, 'clock not sampled while waiting for DB writer')
        logical['now'] = 201
        locker.execute('COMMIT')
        check(future.result() == 'refused', 'writer wait crossing admission deadline rejects')
    check(logical['calls'] == 1, 'authority clock sampled inside acquired transaction')
    check(one(db, 'SELECT COUNT(*) n FROM permit')['n'] == 0, 'late lock acquisition consumes no credit')
    locker.close()
    db.close()

    path, (db, b1, b2, bad, e1, e2) = fresh('publish')
    try:
        publish(db, 'broken', 1, {b2: 1}, e2, 5000, 'reviewer', fail_before_audit=True)
    except RuntimeError:
        pass
    check(one(db, 'SELECT rev FROM control')['rev'] == 1, 'publish rollback retains previous revision')
    check(one(db, 'SELECT COUNT(*) n FROM snapshot')['n'] == 1, 'snapshot and publication rolled back')
    check(one(db, 'SELECT COUNT(*) n FROM audit')['n'] == 1, 'audit shares the publication transaction')
    got = race(path, [lambda d, i=i: publish(d, f'p{i}', 1, {b2: 1}, e2, 5000, 'reviewer')
                      for i in range(2)])
    check(got.count(2) == 1 and got.count('refused') == 1, 'two publishers CAS one expected revision')
    key = one(db, 'SELECT key FROM publication WHERE rev=2')['key']
    check(publish(db, key, 1, {b2: 1}, e2, 5000, 'reviewer') == 2, 'lost publish ACK replays same revision')
    refused(lambda: publish(db, key, 1, {b1: 1}, e1, 5000, 'reviewer'), 'same publication key conflicts')
    refused(lambda: publish(db, 'schema', 2, {bad: 1}, [['bad', 7, bad, 'p80']], 5000, 'reviewer'),
            'incompatible persisted state blocks promotion/rollback')
    try:
        db.execute('UPDATE bundle SET manifest=? WHERE hash=?', ('{}', b1))
    except sqlite3.IntegrityError:
        check(True, 'immutable bundle cannot patch old content')
    else:
        check(False, 'immutable bundle cannot patch old content')
    check(publish(db, 'back', 2, {b1: 1}, e1, 5000, 'reviewer') == 3,
          'rollback selects old content at a higher revision')
    refused(lambda: reserve(db, query(b2, rev=2, worker='w2'), lambda: 0), 'stale cached revision cannot mint hold')
    db.close()

    path, (db, b1, b2, bad, e1, e2) = fresh('drain', slots=4, kv=32)
    reserve(db, query(b1, 'run'), lambda: 0)
    begin_dispatch(db, 't', 'run', lambda: 1)
    consume(db, 't', 'run', 'w1', 7, b1, lambda: 2)
    reserve(db, query(b1, 'held'), lambda: 0)
    reserve(db, query(b1, 'unknown'), lambda: 0)
    begin_dispatch(db, 't', 'unknown', lambda: 1)
    refused(lambda: begin_drain(db, 'w1'), 'cannot drain a currently routed worker')
    publish(db, 'new', 1, {b2: 1}, e2, 5000, 'reviewer')
    check(permit(db, 't', 'run')['bundle'] == b1, 'promotion never repins active v1 stream')
    begin_drain(db, 'w1')
    check(permit(db, 't', 'held')['state'] == 'EXPIRED', 'drain atomically revokes undispatched holds')
    check(not unload(db, 'w1'), 'RUNNING and UNKNOWN credit block unload')
    check(consume(db, 't', 'unknown', 'w1', 7, b1, lambda: 2),
          'already granted dispatch may start old bundle inside deadline')
    refused(lambda: publish(db, 'back', 2, {b1: 1}, e1, 5000, 'reviewer'), 'draining old worker cannot receive rollback')
    for rid in ['run', 'unknown']:
        check(retire(db, 't', rid), 'retire before drain release ' + rid)
        check(release(db, 't', rid, 'w1', 7), 'trusted physical release ' + rid)
    check(unload(db, 'w1'), 'unload only at zero held/running/unknown credit')
    check(not consume(db, 't', 'unknown', 'w1', 7, b1, lambda: 3), 'late duplicate cannot revive unloaded work')
    refused(lambda: publish(db, 'cold-back', 2, {b1: 1}, e1, 5000, 'reviewer'), 'retained artifact is not warm readiness')
    check(all(r[1:] == (0, 0) for rows in usage(db) for r in rows), 'drain ends with zero credits')
    db.close()

  files = [p for p in (ROOT / 'examples/ch35').iterdir() if p.is_file()]
  result = dict(sqlite=sqlite3.sqlite_version, python=sys.version, assertions=len(checks),
                checks=checks, source_sha256={str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files},
                boundary='SQLite metadata transactions and actual process exits only; no GPU/network/performance test')
  (ROOT / 'docs/reviews/ch35-code-results.json').write_text(json.dumps(result, indent=2) + '\n')
  print(f'{len(checks)} actual SQLite assertions passed')

if __name__ == '__main__':
    run()
