"""Run directly with Python 3; writes one chapter-specific evidence JSON."""
import concurrent.futures
import hashlib
import json
import math
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import threading
import time

sys.dont_write_bytecode = True
from model import Scheduler, OrderStore, Sink

ROOT = Path(__file__).resolve().parents[2]
checks = []


def ok(condition, name):
    assert condition, name
    checks.append(name)


def raises(kind, fn, name):
    try:
        fn()
    except kind:
        checks.append(name)
    else:
        raise AssertionError(name)


def parallel(path, fn):
    barrier = threading.Barrier(2)
    def call(i):
        s = Scheduler(path)
        try:
            barrier.wait()
            return fn(s, i)
        finally:
            s.close()
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        return list(pool.map(call, range(2)))


report = {'checks': checks, 'adapter': 'real SQLite transactions; controlled DB fixture clock'}
try:
    with tempfile.TemporaryDirectory(prefix='ch25-check-') as tmp:
        seq = 0
        def scheduler(**kw):
            global seq
            seq += 1
            path = os.path.join(tmp, f's{seq}.db')
            s = Scheduler(path); s.initialize(); s.add(**kw)
            return path, s

        path, s = scheduler()
        raises(RuntimeError, lambda: s.materialize(fail=True), 'T1 crash rolls back')
        ok(s.runs() == [] and s.db.execute('SELECT next_at FROM job').fetchone()[0] == 0,
           'run insert and cursor both roll back')
        outcomes = parallel(path, lambda x, i: x.materialize())
        ok(sum(map(len, outcomes)) == 1 and len(s.runs()) == 1, 'two schedulers materialize one occurrence')
        rid = s.runs()[0]['id']
        ok(s.run(rid)['state'] == 'ready', 'commit before dispatch crash leaves recoverable ready')
        ok(s.db.execute('SELECT next_at FROM job').fetchone()[0] == 60000, 'cursor advances without waiting for success')
        before = s.run(rid)['payload']
        with s.tx():
            s.db.execute("UPDATE job SET version=2,payload='{}' WHERE id='j7'")
        token = s.claim(rid, 'A')
        ok(token['payload'] == before and token['version'] == 1, 'claim uses frozen run input after job edit')
        ok(s.claim(rid, 'B') is None, 'duplicate active claim rejected')
        ok(s.transition(rid, 'heartbeat', 'B', token['generation']) == 'STALE', 'wrong owner heartbeat rejected')
        ok(s.transition(rid, 'heartbeat', 'A', token['generation']+1) == 'STALE', 'wrong generation heartbeat rejected')
        s.set_time(10000)
        ok(s.transition(rid, 'heartbeat', 'A', token['generation']) == 'OK' and
           s.run(rid)['lease_until'] == 40000, 'valid heartbeat extends from lock-time clock')
        s.set_time(40000)
        ok(s.transition(rid, 'heartbeat', 'A', token['generation']) == 'STALE', 'equal expiry cannot renew')
        token2 = s.claim(rid, 'B')
        ok(token2['generation'] == token['generation']+1 and token2['attempts'] == 2,
           'expired takeover increments attempt and generation of same run')
        ok(s.transition(rid, 'complete', 'A', token['generation'], 'CLOSED') == 'STALE',
           'old worker completion rejected after takeover')
        raises(ValueError, lambda: s.transition(rid, 'complete', 'B', token2['generation'], 'ACCEPTED'),
               'accepted is not confirmed business success')
        ok(s.transition(rid, 'complete', 'B', token2['generation'], 'CLOSED') == 'OK', 'current worker can complete')
        ok(s.transition(rid, 'timeout', 'B', token2['generation']) == 'STALE' and
           s.run(rid)['state'] == 'succeeded', 'late timeout cannot regress committed success')
        ok(s.claim(rid, 'C') is None, 'terminal run cannot be reclaimed')

        path, s2 = scheduler()
        rid2 = s2.materialize()[0]
        claims = parallel(path, lambda x, i: x.claim(rid2, f'W{i}'))
        ok(sum(t is not None for t in claims) == 1, 'two workers race through actual SQLite writer lock')
        winner = next(t for t in claims if t)
        ok(s2.run(rid2)['owner'] == winner['owner'], 'lost claim ACK recoverable by persisted owner/generation')
        s2.set_time(31000)
        ok(s2.transition(rid2, 'reap') == 'OK' and s2.run(rid2)['effect_unknown'] == 1,
           'reaping expired lease retains unknown effect')
        ok(s2.claim(rid2, 'early') is None, 'retry backoff prevents immediate claim')
        for attempt in range(2, 6):
            s2.set_time(s2.run(rid2)['retry_at'])
            tok = s2.claim(rid2, 'R'+str(attempt))
            ok(tok['attempts'] == attempt, f'attempt {attempt} counts against the same five-attempt budget')
            s2.transition(rid2, 'timeout', tok['owner'], tok['generation'])
        ok(s2.run(rid2)['state'] == 'review' and s2.claim(rid2, 'sixth') is None,
           'fifth timeout enters review and no sixth attempt starts')

        path, sw = scheduler()
        rw = sw.materialize()[0]; tw = sw.claim(rw, 'waiting')
        # Block the heartbeat at BEGIN IMMEDIATE, advance stored time while holding
        # that lock, then release. It must read time after the wait, not before it.
        sw.db.execute('BEGIN IMMEDIATE')
        sw.db.execute('UPDATE fixture_clock SET ms=31000')
        entered = threading.Event()
        def waiting_heartbeat():
            x = Scheduler(path)
            entered.set()
            try: return x.transition(rw, 'heartbeat', 'waiting', tw['generation'])
            finally: x.close()
        with concurrent.futures.ThreadPoolExecutor(1) as pool:
            future = pool.submit(waiting_heartbeat)
            entered.wait(2); time.sleep(0.05)
            ok(not future.done(), 'heartbeat waits behind actual database writer')
            sw.db.execute('COMMIT')
            ok(future.result() == 'STALE', 'lock waiter reads advanced DB fixture clock and rejects expired heartbeat')

        _, sc = scheduler(); rc = sc.materialize()[0]
        sc.transition(rc, 'cancel')
        ok(sc.run(rc)['state'] == 'cancelled' and sc.claim(rc, 'A') is None, 'cancel before first attempt is terminal unstarted')
        _, sc2 = scheduler(); rc2 = sc2.materialize()[0]; tc = sc2.claim(rc2, 'A')
        sc2.transition(rc2, 'cancel')
        ok(sc2.run(rc2)['state'] == 'running' and sc2.run(rc2)['cancel_requested'], 'running cancellation is only a request')
        ok(sc2.transition(rc2, 'complete', 'A', tc['generation'], 'CLOSED') == 'OK', 'confirmed effect can complete after cancel request')
        _, sc3 = scheduler(); rc3 = sc3.materialize()[0]; tc3 = sc3.claim(rc3, 'A')
        sc3.transition(rc3, 'timeout', 'A', tc3['generation']); sc3.transition(rc3, 'cancel')
        ok(sc3.run(rc3)['state'] == 'review' and sc3.run(rc3)['effect_unknown'] == 1,
           'cancel after unknown attempt preserves unresolved effect for review')

        for policy, expected in [('skip', 0), ('coalesce', 1), ('catch_up', 120)]:
            _, sm = scheduler(policy=policy); sm.set_time(7200000)
            raises(RuntimeError, lambda: sm.recover('j7', fail=True), f'{policy} page crash rolls back')
            ok(sm.runs() == [] and sm.db.execute('SELECT next_at FROM job').fetchone()[0] == 0,
               f'{policy} leaves cursor and runs unchanged after crash')
            first = sm.recover('j7')
            if policy == 'catch_up':
                ok(len(first) == 100 and sm.db.execute('SELECT cutoff FROM job').fetchone()[0] == 7200000,
                   'catch-up first page pins cutoff and limits transaction to 100 occurrences')
                sm.set_time(7260000)  # clock moves while finishing the same recovery pass
                ok(len(sm.recover('j7')) == 20, 'pinned recovery finishes remaining 20 despite moving now')
            ok(len(sm.runs()) == expected, f'{policy} yields {expected} missed runs')
            ok(sm.db.execute('SELECT next_at,cutoff FROM job').fetchone()[:] == (7200000, None),
               f'{policy} leaves live cutoff separate and clears recovery cursor')
            if policy == 'coalesce':
                ok(json.loads(sm.runs()[0]['payload'])['window'] == [0,7200000] and
                   sm.runs()[0]['fire'] == 7140000, 'coalesce freezes entire range under last missed identity')

        _, so = scheduler(interval=None, fire=1800000); so.set_time(9000000)
        ok(so.materialize(hint=('j7', 2, 1800000)) == [], 'stale timer version does not materialize')
        ro = so.materialize(hint=('j7', 1, 1800000))[0]
        ok(so.run(ro)['fire'] == 1800000 and so.db.execute('SELECT next_at FROM job').fetchone()[0] is None,
           'overdue one-shot retains original deadline and has null next cursor')
        ok(so.materialize() == [], 'duplicate timer hint cannot create a second one-shot run')
        raises(sqlite3.IntegrityError, lambda: so.db.execute(
            'INSERT INTO run(id,job_id,version,fire,payload,effect_key) VALUES(?,?,?,?,?,?)',
            ('duplicate','j7',1,1800000,'{}','close:o7')), 'real UNIQUE rejects duplicate occurrence')
        raises(sqlite3.IntegrityError, lambda: so.db.execute(
            'INSERT INTO run(id,job_id,version,fire,payload,effect_key) VALUES(?,?,?,?,?,?)',
            ('null-fire','j7',1,None,'{}','close:o7')), 'real NOT NULL rejects null occurrence fire')

        for policy, expected in [('skip', []), ('coalesce', [150000]),
                                 ('catch_up', [30000,90000,150000])]:
            _, phase = scheduler(fire=30000, interval=60000, policy=policy)
            phase.set_time(180000); phase.recover('j7')
            ok([r['fire'] for r in phase.runs()] == expected, f'{policy} preserves the original 30s phase')
            ok(phase.db.execute('SELECT next_at FROM job').fetchone()[0] == 210000,
               f'{policy} first live fire is 210s rather than epoch-aligned 180s')

        _, near = scheduler(); near.set_time(101*60000)
        ok(len(near.recover('j7')) == 100, '101-slot recovery persists first bounded page')
        ok(near.db.execute('SELECT next_at FROM job').fetchone()[0] == near.now()-60000,
           'remaining pinned cursor is inside the fresh misfire tolerance boundary')
        ok(near.materialize() == [] and len(near.recover('j7')) == 1,
           'pinned last page completes instead of blocking behind a fresh threshold check')

        _, paused = scheduler(); paused_id = paused.materialize()[0]
        with paused.tx():
            paused.db.execute('UPDATE job SET enabled=0')
        paused.set_time(60000)
        ok(paused.materialize() == [], 'paused definition stops subsequent materialization')
        ok(paused.claim(paused_id, 'existing') is not None, 'pause does not silently cancel an existing ready run')

        orders = OrderStore(os.path.join(tmp, 'orders.db')); orders.initialize(); orders.add()
        sink = Sink(os.path.join(tmp, 'sink.db')); sink.initialize()
        ok(orders.close_order('t1','close:o7') == 'RETRY_AT' and
           orders.db.execute('SELECT count(*) FROM inbox').fetchone()[0] == 0,
           'early business invocation saves no terminal no-op receipt')
        orders.set_time(1800000)
        raises(RuntimeError, lambda: orders.close_order('t1','close:o7',fail=True), 'T2 failure after effects and receipt rolls back')
        ok(orders.db.execute('SELECT state FROM orders').fetchone()[0] == 'UNPAID' and
           orders.db.execute('SELECT count(*) FROM inbox').fetchone()[0] == 0 and
           orders.db.execute('SELECT count(*) FROM outbox').fetchone()[0] == 0,
           'order, inbox and outbox all roll back together')
        ok(orders.close_order('t1','close:o7') == 'CLOSED', 'Order DB closes at authoritative deadline')
        ok(orders.close_order('t1','close:o7') == 'CLOSED' and
           orders.db.execute('SELECT count(*) FROM outbox').fetchone()[0] == 1,
           'lost business response same-key retry returns stored result with one event')
        ok(orders.close_order('t1','close:o7',payload={'changed':True}) == 'CONFLICT', 'same business key changed input conflicts')
        orders.add(tenant='t2',state='PAID')
        ok(orders.close_order('t2','close:o7') == 'NOOP_TERMINAL' and
           orders.db.execute('SELECT count(*) FROM inbox').fetchone()[0] == 2,
           'tenant scopes business key; terminal paid order is a successful no-op')
        raises(ValueError, lambda: orders.close_order('t1','fresh-attempt'), 'attempt UUID cannot replace stable operation key')
        raises(RuntimeError, lambda: sink.receive('t1','x','{}',fail=True), 'sink failure rolls back inbox and effect')
        ok(sink.db.execute('SELECT count(*) FROM effect').fetchone()[0] == 0 and
           sink.db.execute('SELECT count(*) FROM inbox').fetchone()[0] == 0, 'sink effect cannot commit without deduplication')
        raises(RuntimeError, lambda: orders.relay(sink, lose_ack=True), 'relay send before delivery bookkeeping may lose ACK')
        orders.relay(sink)
        ok(sink.db.execute('SELECT count(*) FROM effect').fetchone()[0] == 1 and
           orders.db.execute('SELECT delivered FROM outbox').fetchone()[0] == 1,
           'outbox replay into real second DB applies one sink effect')
        raises(ValueError, lambda: sink.receive('t1','closed:o7','changed'), 'same event identity with changed payload rejected')

        # Cross-store recovery, deliberately without a transaction spanning RPC.
        _, sr = scheduler(interval=None, fire=0); rr = sr.materialize()[0]; tr = sr.claim(rr, 'old')
        result = orders.close_order('t1','close:o7')  # business already committed
        sr.transition(rr, 'timeout', 'old', tr['generation'])
        sr.set_time(sr.run(rr)['retry_at']); tr2 = sr.claim(rr, 'new')
        replay = orders.close_order('t1','close:o7')
        ok(result == replay == 'CLOSED' and sr.transition(rr, 'complete', 'new', tr2['generation'], replay) == 'OK',
           'lost T2 reply recovers same key then completes current-generation run')

        race_path = os.path.join(tmp, 'order-race.db')
        race = OrderStore(race_path); race.initialize(); race.add(deadline=0)
        barrier = threading.Barrier(2)
        def close_race(i):
            x = OrderStore(race_path)
            try:
                barrier.wait()
                return x.close_order('t1', 'close:o7')
            finally: x.close()
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            results = list(pool.map(close_race, range(2)))
        ok(results == ['CLOSED','CLOSED'], 'concurrent old and new business attempts return the same committed result')
        ok(race.db.execute('SELECT count(*) FROM inbox').fetchone()[0] == 1 and
           race.db.execute('SELECT count(*) FROM outbox').fetchone()[0] == 1,
           'two real Order DB connections commit only one receipt and close event')

        ok(math.ceil((10000/60)*0.2/0.6) == 56, 'capacity: 56 steady-state pool slots')
        ok(math.ceil(10000/56)*2 == 358, 'capacity: 179 fixed-duration rounds = 35.8s')
        ok(10000*1440*200*7 == 20160000000, 'capacity: seven-day raw run rows 20.16GB')
        ok(10*120/(100-80) == 60, 'capacity: 1200 missed runs / spare 20/s = 60s ideal')
        ok(1800 % 60 == 0 and 1800//60 == 30, 'wheel: same slot after thirty revolutions')
    report['passed'] = True
except BaseException as error:
    report.update(passed=False, failure=repr(error))
    raise
finally:
    report['count'] = len(checks)
    report['sqlite_version'] = sqlite3.sqlite_version
    report['files'] = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                       for p in Path(__file__).parent.glob('*') if p.is_file()}
    output = Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'docs/reviews/ch25-code-results.json'
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False)+'\n')
    print(json.dumps({'passed': report.get('passed'), 'count':len(checks), 'output':str(output)}))
