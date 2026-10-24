"""Real SQLite publish transaction; authentication is an explicit trusted fixture.

No etcd, PostgreSQL, replication, HTTP, file durability or distributed watch is run.
BEGIN IMMEDIATE serializes all SQLite writers, more coarsely than a namespace row.
"""
from contextlib import contextmanager
import hashlib
import json
from pathlib import Path
import sqlite3


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def checksum(payload):
    return hashlib.sha256(canonical(payload).encode()).hexdigest()


class Conflict(Exception):
    pass


class Stale(Exception):
    pass


class Store:
    def __init__(self, path, initialize=False):
        self.db = sqlite3.connect(str(path), timeout=10, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA foreign_keys=ON')
        if initialize:
            self.db.executescript(Path(__file__).with_name('schema.sql').read_text())

    def close(self):
        self.db.close()

    @contextmanager
    def transaction(self, write=False):
        self.db.execute('BEGIN IMMEDIATE' if write else 'BEGIN')
        try:
            yield
            self.db.execute('COMMIT')
        except BaseException:
            if self.db.in_transaction:
                self.db.execute('ROLLBACK')
            raise

    def seed(self, namespace='app/prod/main', generation=41):
        with self.transaction(write=True):
            for rid, payload in [('R17', {'timeout_ms': 100, 'allow': True}),
                                 ('R18', {'timeout_ms': 200, 'allow': True})]:
                self.db.execute('INSERT INTO release VALUES(?,?,?,?)',
                                (namespace, rid, canonical(payload), checksum(payload)))
            self.db.execute('INSERT INTO current VALUES(?,?,?,?,?,?,?,?)',
                            (namespace, generation, 'R17', None, 0, 's1', 'approved', generation))
            self.db.execute('INSERT INTO history_floor VALUES(?,?)', (namespace, generation))

    def publish(self, principal, key, draft, authorized=True, fail_at=None):
        # Authorization is checked even when replaying a historic successful receipt.
        if not authorized:
            raise PermissionError('fixture authentication/authorization denied')
        draft = json.loads(canonical(draft))  # frozen request; caller mutation cannot change writes
        if not isinstance(principal, str) or not principal or not isinstance(key, str) or not key:
            raise ValueError('identity and key required')
        required = {'namespace', 'expected_generation', 'stable', 'canary',
                    'percent', 'salt', 'cluster', 'reason'}
        if not required <= draft.keys() or draft.keys() - required - {'new_content'}:
            raise ValueError('incomplete or unknown intent fields')
        if type(draft['percent']) is not int or not 0 <= draft['percent'] <= 100:
            raise ValueError('percent')
        if type(draft['expected_generation']) is not int or draft['expected_generation'] < 0:
            raise ValueError('generation')
        if not draft['reason'] or not draft['namespace'] or not draft['salt']:
            raise ValueError('required namespace, salt, reason')
        if draft['canary'] is None and draft['percent'] != 0:
            raise ValueError('missing canary')
        new = draft.get('new_content')
        if new is not None:
            if set(new) != {'release', 'payload'} or not new['release']:
                raise ValueError('content identity')
            p = new['payload']
            if not isinstance(p, dict) or type(p.get('timeout_ms')) is not int or not 1 <= p['timeout_ms'] <= 60_000:
                raise ValueError('timeout schema/range')
            if 'allow' in p and type(p['allow']) is not bool:
                raise ValueError('critical allow schema')
            if len(canonical(p).encode()) > 1_000_000:
                raise ValueError('bundle too large')
            if any(len(canonical(v).encode()) > 256_000 for v in p.values()):
                raise ValueError('key too large')
        ns = draft['namespace']
        intent_hash = checksum(draft)
        with self.transaction(write=True):
            # This BEGIN IMMEDIATE is the SQLite equivalent of the teaching lock.
            current = self.db.execute('SELECT * FROM current WHERE namespace=?', (ns,)).fetchone()
            if current is None:
                raise ValueError('unprovisioned namespace')
            prior = self.db.execute('SELECT * FROM receipt WHERE principal=? AND namespace=? AND request_key=?',
                                    (principal, ns, key)).fetchone()
            if prior:
                if prior['request_hash'] != intent_hash:
                    raise Conflict('same key, changed semantic intent')
                return prior['result_generation']
            if current['generation'] != draft['expected_generation']:
                raise Stale('expected generation changed')
            if new:
                existing = self.db.execute('SELECT * FROM release WHERE namespace=? AND release_id=?',
                                           (ns, new['release'])).fetchone()
                if existing and existing['payload'] != canonical(new['payload']):
                    raise Conflict('immutable release identity changed')
                if not existing:
                    self.db.execute('INSERT INTO release VALUES(?,?,?,?)',
                                    (ns, new['release'], canonical(new['payload']), checksum(new['payload'])))
            if fail_at == 'release':
                raise RuntimeError('injected after release')
            g = current['generation'] + 1
            changed = self.db.execute('''UPDATE current SET generation=?,stable=?,canary=?,percent=?,salt=?,cluster=?,rule_revision=?
                WHERE namespace=? AND generation=?''', (g, draft['stable'], draft['canary'], draft['percent'],
                    draft['salt'], draft['cluster'], g, ns, draft['expected_generation'])).rowcount
            if changed != 1:
                raise Stale('conditional update lost')
            if fail_at == 'current':
                raise RuntimeError('injected after Current')
            next_view = dict(self.db.execute('SELECT * FROM current WHERE namespace=?', (ns,)).fetchone())
            self.db.execute('INSERT INTO publication VALUES(?,?,?,?,?,?,?,?)',
                            (ns, g, principal, key, draft['reason'], current['generation'],
                             canonical(dict(current)), canonical(next_view)))
            self.db.execute('INSERT INTO receipt VALUES(?,?,?,?,?)', (principal, ns, key, intent_hash, g))
            if fail_at == 'receipt':
                raise RuntimeError('injected after receipt')
            self.db.execute('INSERT INTO change_log VALUES(?,?)', (ns, g))
            if fail_at == 'change':
                raise RuntimeError('injected before COMMIT')
        return g  # simulate reply loss by discarding this value at the call site

    def snapshot(self, namespace):
        with self.transaction():
            current = self.db.execute('SELECT * FROM current WHERE namespace=?', (namespace,)).fetchone()
            if current is None:
                raise ValueError('unknown namespace')
            result = dict(current)
            result['releases'] = {row['release_id']: dict(row) for row in self.db.execute(
                'SELECT * FROM release WHERE namespace=? AND release_id IN (?,?)',
                (namespace, current['stable'], current['canary']))}
            return result

    def changes_after(self, namespace, cursor):
        with self.transaction():
            floor = self.db.execute('SELECT compacted_through FROM history_floor WHERE namespace=?',
                                    (namespace,)).fetchone()[0]
            current = self.db.execute('SELECT generation FROM current WHERE namespace=?', (namespace,)).fetchone()[0]
            if cursor > current:
                return ('SYNC_REQUIRED', current)
            if cursor < floor:
                return ('RESET', current)
            return ('CHANGED' if cursor < current else 'IDLE', [r[0] for r in self.db.execute(
                'SELECT generation FROM change_log WHERE namespace=? AND generation>? ORDER BY generation',
                (namespace, cursor))])

    def compact(self, namespace, through):
        with self.transaction(write=True):
            current = self.db.execute('SELECT generation FROM current WHERE namespace=?', (namespace,)).fetchone()[0]
            previous = self.db.execute('SELECT compacted_through FROM history_floor WHERE namespace=?', (namespace,)).fetchone()[0]
            if not previous <= through <= current:
                raise ValueError('compaction range')
            self.db.execute('DELETE FROM change_log WHERE namespace=? AND generation<=?', (namespace, through))
            self.db.execute('UPDATE history_floor SET compacted_through=? WHERE namespace=?', (through, namespace))

    def counts(self):
        return {table: self.db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]
                for table in ('release', 'current', 'publication', 'receipt', 'change_log')}
