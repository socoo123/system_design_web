"""Executable SQLite teaching adapter, not PostgreSQL or a production scheduler.

BEGIN IMMEDIATE uses a real, coarser single-writer lock. fixture_clock is a
controlled database row read AFTER that lock, not a claim about real clock drift.
The calendar fixture supports UTC fixed intervals and one-shot jobs only.
"""
import json
import sqlite3
import uuid
from contextlib import contextmanager


SCHEDULER_SCHEMA = """
CREATE TABLE fixture_clock(id INTEGER PRIMARY KEY CHECK(id=1), ms INTEGER NOT NULL);
INSERT INTO fixture_clock VALUES(1,0);
CREATE TABLE job(id TEXT PRIMARY KEY NOT NULL, version INTEGER NOT NULL CHECK(version>0),
 shard INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1,
 next_at INTEGER, interval_ms INTEGER, payload TEXT NOT NULL, effect_key TEXT NOT NULL,
 policy TEXT NOT NULL DEFAULT 'catch_up', cutoff INTEGER);
CREATE INDEX due ON job(shard,next_at,id) WHERE enabled=1;
CREATE TABLE run(id TEXT PRIMARY KEY NOT NULL, job_id TEXT NOT NULL REFERENCES job(id),
 version INTEGER NOT NULL, fire INTEGER NOT NULL, payload TEXT NOT NULL,
 effect_key TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'ready'
 CHECK(state IN ('ready','running','retry_wait','succeeded','cancelled','review')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 generation INTEGER NOT NULL DEFAULT 0 CHECK(generation>=0), owner TEXT, lease_until INTEGER,
 retry_at INTEGER, cancel_requested INTEGER NOT NULL DEFAULT 0,
 effect_unknown INTEGER NOT NULL DEFAULT 0, result TEXT,
 UNIQUE(job_id,version,fire),
 CHECK((state='running' AND owner IS NOT NULL AND lease_until IS NOT NULL) OR
       (state<>'running' AND owner IS NULL AND lease_until IS NULL)));
CREATE TABLE audit(job_id TEXT NOT NULL, version INTEGER NOT NULL,
 from_at INTEGER NOT NULL, to_at INTEGER NOT NULL, policy TEXT NOT NULL);
"""
ORDER_SCHEMA = """
CREATE TABLE fixture_clock(id INTEGER PRIMARY KEY CHECK(id=1), ms INTEGER NOT NULL);
INSERT INTO fixture_clock VALUES(1,0);
CREATE TABLE orders(tenant TEXT NOT NULL, id TEXT NOT NULL, state TEXT NOT NULL
 CHECK(state IN ('UNPAID','PAID','CLOSED')), close_at INTEGER NOT NULL, PRIMARY KEY(tenant,id));
CREATE TABLE inbox(tenant TEXT NOT NULL, op_key TEXT NOT NULL, payload TEXT NOT NULL,
 result TEXT NOT NULL, PRIMARY KEY(tenant,op_key));
CREATE TABLE outbox(tenant TEXT NOT NULL, event_id TEXT NOT NULL, payload TEXT NOT NULL,
 delivered INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(tenant,event_id));
"""
SINK_SCHEMA = """
CREATE TABLE inbox(tenant TEXT NOT NULL, event_id TEXT NOT NULL, payload TEXT NOT NULL,
 PRIMARY KEY(tenant,event_id));
CREATE TABLE effect(tenant TEXT NOT NULL, event_id TEXT NOT NULL, PRIMARY KEY(tenant,event_id));
"""


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'))


class Database:
    def __init__(self, path):
        self.db = sqlite3.connect(path, timeout=5, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA foreign_keys=ON')

    @contextmanager
    def tx(self):
        self.db.execute('BEGIN IMMEDIATE')
        try:
            yield
            self.db.execute('COMMIT')
        except BaseException:
            if self.db.in_transaction:
                self.db.execute('ROLLBACK')
            raise

    def now(self):
        return self.db.execute('SELECT ms FROM fixture_clock WHERE id=1').fetchone()[0]

    def set_time(self, ms):
        with self.tx():
            self.db.execute('UPDATE fixture_clock SET ms=? WHERE id=1', (ms,))

    def close(self):
        self.db.close()


class Scheduler(Database):
    def initialize(self):
        self.db.executescript(SCHEDULER_SCHEMA)

    def add(self, job_id='j7', fire=0, interval=60000, payload=None,
            key='close:o7', policy='catch_up'):
        # Fixture for an already authenticated, validated and durable definition.
        with self.tx():
            self.db.execute('INSERT INTO job(id,version,next_at,interval_ms,payload,effect_key,policy)'
                            ' VALUES(?,1,?,?,?,?,?)',
                            (job_id, fire, interval, canonical(payload or {'order_id': 'o7'}), key, policy))

    def run(self, run_id):
        row = self.db.execute('SELECT * FROM run WHERE id=?', (run_id,)).fetchone()
        return dict(row) if row else None

    def runs(self):
        return [dict(r) for r in self.db.execute('SELECT * FROM run ORDER BY fire,id')]

    def _insert(self, j, fire, window=None):
        payload = canonical({'input': json.loads(j['payload']), 'window': window})
        self.db.execute('INSERT INTO run(id,job_id,version,fire,payload,effect_key) VALUES(?,?,?,?,?,?)'
                        ' ON CONFLICT(job_id,version,fire) DO NOTHING',
                        (str(uuid.uuid4()), j['id'], j['version'], fire, payload, j['effect_key']))
        old = self.db.execute('SELECT * FROM run WHERE job_id=? AND version=? AND fire=?',
                              (j['id'], j['version'], fire)).fetchone()
        if old['payload'] != payload or old['effect_key'] != j['effect_key']:
            raise ValueError('occurrence input changed')
        return old['id']

    def materialize(self, hint=None, fail=False):
        with self.tx():
            t = self.now()  # Actual SQLite lock is acquired before this read.
            jobs = self.db.execute('SELECT * FROM job WHERE enabled=1 AND next_at<=?'
                                   ' ORDER BY next_at,id LIMIT 100', (t,)).fetchall()
            ids = []
            for j in jobs:
                if hint and hint != (j['id'], j['version'], j['next_at']):
                    continue
                # Fixture has no calendar parser: old cron fires go to recovery.
                if j['cutoff'] is not None or (j['interval_ms'] and j['next_at'] < t-60000):
                    continue
                ids.append(self._insert(j, j['next_at']))
                if fail:
                    raise RuntimeError('crash after INSERT before cursor')
                next_at = j['next_at'] + j['interval_ms'] if j['interval_ms'] else None
                self.db.execute('UPDATE job SET next_at=? WHERE id=?', (next_at, j['id']))
        return ids

    def recover(self, job_id, fail=False):
        with self.tx():
            j = self.db.execute('SELECT * FROM job WHERE id=?', (job_id,)).fetchone()
            t = self.now()
            if not j or not j['enabled'] or not j['interval_ms'] or j['next_at'] is None:
                return []
            step = j['interval_ms']
            cutoff = j['cutoff'] if j['cutoff'] is not None else t - t % step
            start = j['next_at']
            if start >= cutoff:
                return []
            ids = []
            if j['policy'] == 'catch_up':
                fires = range(start, min(cutoff, start + 100*step), step)
                ids = [self._insert(j, fire) for fire in fires]
                next_at = start + len(ids)*step
            elif j['policy'] == 'coalesce':
                ids = [self._insert(j, cutoff-step, [start, cutoff])]
                next_at = cutoff
            elif j['policy'] == 'skip':
                next_at = cutoff
            else:
                raise ValueError('bad policy')
            self.db.execute('INSERT INTO audit VALUES(?,?,?,?,?)',
                            (job_id, j['version'], start, next_at, j['policy']))
            if fail:
                raise RuntimeError('crash in recovery page')
            self.db.execute('UPDATE job SET next_at=?,cutoff=? WHERE id=?',
                            (next_at, cutoff if next_at < cutoff else None, job_id))
        return ids

    def claim(self, run_id, owner):
        with self.tx():
            r = self.run(run_id)
            t = self.now()
            if not r or r['cancel_requested']:
                return None
            eligible = (r['state'] == 'ready' or
                        (r['state'] == 'retry_wait' and r['retry_at'] <= t) or
                        (r['state'] == 'running' and r['lease_until'] <= t))
            if not eligible:
                return None
            if r['attempts'] == 5:
                self.db.execute("UPDATE run SET state='review',owner=NULL,lease_until=NULL,"
                                'effect_unknown=1 WHERE id=?', (run_id,))
                return None
            self.db.execute("UPDATE run SET state='running',attempts=attempts+1,"
                            'generation=generation+1,owner=?,lease_until=?,retry_at=NULL,'
                            'effect_unknown=1 WHERE id=?', (owner, t+30000, run_id))
            token = self.run(run_id)
        return token

    def transition(self, run_id, action, owner=None, gen=None, result=None):
        with self.tx():
            r = self.run(run_id)
            t = self.now()
            if not r:
                return 'NOT_FOUND'
            if action == 'cancel':
                r['cancel_requested'] = 1
                if r['state'] == 'ready' and r['attempts'] == 0:
                    r['state'] = 'cancelled'
                if r['state'] == 'retry_wait':
                    r['state'] = 'review'
            elif action == 'reap':
                if r['state'] != 'running' or r['lease_until'] > t:
                    return 'NO_CHANGE'
                self._retry(r, t)
            else:
                if (r['state'] != 'running' or r['owner'] != owner or
                        r['generation'] != gen or r['lease_until'] <= t):
                    return 'STALE'
                if action == 'heartbeat':
                    r['lease_until'] = t + 30000
                elif action == 'complete':
                    # Trusted fixture result; real adapter must verify scope/input.
                    if result not in ('CLOSED', 'NOOP_TERMINAL'):
                        raise ValueError('not a confirmed business result')
                    r.update(state='succeeded', result=result, effect_unknown=0)
                elif action == 'timeout':
                    self._retry(r, t)
                else:
                    raise ValueError('bad action')
            if r['state'] != 'running':
                r.update(owner=None, lease_until=None)
            self.db.execute('UPDATE run SET state=:state,owner=:owner,lease_until=:lease_until,'
                            'retry_at=:retry_at,cancel_requested=:cancel_requested,'
                            'effect_unknown=:effect_unknown,result=:result WHERE id=:id', r)
        return 'OK'

    @staticmethod
    def _retry(r, t):
        r['effect_unknown'] = 1
        r['state'] = 'review' if r['cancel_requested'] or r['attempts'] == 5 else 'retry_wait'
        # Deterministic fixture; production adds bounded jitter under a shared budget.
        r['retry_at'] = t + min(60000, 1000*2**(r['attempts']-1)) if r['state'] == 'retry_wait' else None


class OrderStore(Database):
    def initialize(self):
        self.db.executescript(ORDER_SCHEMA)

    def add(self, tenant='t1', order='o7', deadline=1800000, state='UNPAID'):
        self.db.execute('INSERT INTO orders VALUES(?,?,?,?)', (tenant, order, state, deadline))

    def close_order(self, tenant, key, order='o7', payload=None, fail=False):
        # Authenticated/authorized tenant is a trusted fixture input, not raw HTTP.
        if key != 'close:' + order:
            raise ValueError('wrong operation key')
        payload = canonical(payload or {'action': 'close', 'order_id': order})
        with self.tx():
            o = self.db.execute('SELECT * FROM orders WHERE tenant=? AND id=?', (tenant, order)).fetchone()
            if not o:
                return 'NOT_FOUND'
            old = self.db.execute('SELECT * FROM inbox WHERE tenant=? AND op_key=?', (tenant, key)).fetchone()
            if old:
                if old['payload'] != payload:
                    return 'CONFLICT'
                return old['result']
            t = self.now()
            if o['state'] == 'UNPAID' and o['close_at'] > t:
                return 'RETRY_AT'  # transaction has no writes and saves no receipt
            if o['state'] == 'UNPAID':
                changed = self.db.execute("UPDATE orders SET state='CLOSED' WHERE tenant=? AND id=?"
                                          " AND state='UNPAID' AND close_at<=?", (tenant, order, t)).rowcount
                assert changed == 1
                result = 'CLOSED'
                self.db.execute('INSERT INTO outbox(tenant,event_id,payload) VALUES(?,?,?)',
                                (tenant, 'closed:'+order, payload))
            else:
                result = 'NOOP_TERMINAL'
            self.db.execute('INSERT INTO inbox VALUES(?,?,?,?)', (tenant, key, payload, result))
            if fail:
                raise RuntimeError('crash after business update and receipt')
        return result

    def relay(self, sink, lose_ack=False):
        for e in self.db.execute('SELECT * FROM outbox WHERE delivered=0').fetchall():
            sink.receive(e['tenant'], e['event_id'], e['payload'])
            if lose_ack:
                raise RuntimeError('event applied, relay ACK lost')
            with self.tx():
                self.db.execute('UPDATE outbox SET delivered=1 WHERE tenant=? AND event_id=?',
                                (e['tenant'], e['event_id']))


class Sink(Database):
    def initialize(self):
        self.db.executescript(SINK_SCHEMA)

    def receive(self, tenant, event_id, payload, fail=False):
        with self.tx():
            old = self.db.execute('SELECT payload FROM inbox WHERE tenant=? AND event_id=?',
                                  (tenant, event_id)).fetchone()
            if old:
                if old[0] != payload:
                    raise ValueError('event identity changed payload')
                return
            self.db.execute('INSERT INTO inbox VALUES(?,?,?)', (tenant, event_id, payload))
            self.db.execute('INSERT INTO effect VALUES(?,?)', (tenant, event_id))
            if fail:
                raise RuntimeError('sink crash before commit')
