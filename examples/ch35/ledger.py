"""Runnable SQLite metadata authority; no network, GPU, tokenizer or signatures.
All parameters come from trusted adapters. `clock` is called only after taking
the write transaction; tests inject a logical authority clock, not wall time.
"""
from contextlib import contextmanager
import hashlib
import json
import sqlite3

class Refused(Exception):
    pass


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'))


def connect(path):
    db = sqlite3.connect(path, isolation_level=None, timeout=15)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    return db


@contextmanager
def write_tx(db):
    db.execute('BEGIN IMMEDIATE')
    try:
        yield
        db.execute('COMMIT')
    except BaseException:
        if db.in_transaction:
            db.execute('ROLLBACK')
        raise


def one(db, sql, args=()):
    row = db.execute(sql, args).fetchone()
    if row is None:
        raise Refused('missing identity')
    return row


def init(db):
    db.executescript('''
    CREATE TABLE bundle(hash TEXT PRIMARY KEY, manifest TEXT NOT NULL);
    CREATE TRIGGER immutable_bundle_update BEFORE UPDATE ON bundle
      BEGIN SELECT RAISE(ABORT,'immutable bundle'); END;
    CREATE TRIGGER immutable_bundle_delete BEFORE DELETE ON bundle
      BEGIN SELECT RAISE(ABORT,'immutable bundle'); END;
    CREATE TABLE control(id INTEGER PRIMARY KEY CHECK(id=1), rev INTEGER NOT NULL,
      api TEXT NOT NULL, state_schema TEXT NOT NULL);
    INSERT INTO control VALUES(1,0,'chat-v1','s1');
    CREATE TABLE tenant(id TEXT PRIMARY KEY, tier TEXT NOT NULL,
      slots INTEGER NOT NULL, kv INTEGER NOT NULL,
      used_slots INTEGER NOT NULL DEFAULT 0 CHECK(used_slots>=0 AND used_slots<=slots),
      used_kv INTEGER NOT NULL DEFAULT 0 CHECK(used_kv>=0 AND used_kv<=kv));
    CREATE TABLE replica(id TEXT PRIMARY KEY, epoch INTEGER NOT NULL,
      bundle TEXT NOT NULL REFERENCES bundle(hash), profile TEXT NOT NULL,
      tier TEXT NOT NULL, ready INTEGER NOT NULL, draining INTEGER NOT NULL,
      slots INTEGER NOT NULL, kv INTEGER NOT NULL,
      used_slots INTEGER NOT NULL DEFAULT 0 CHECK(used_slots>=0 AND used_slots<=slots),
      used_kv INTEGER NOT NULL DEFAULT 0 CHECK(used_kv>=0 AND used_kv<=kv));
    CREATE TABLE snapshot(rev INTEGER PRIMARY KEY, payload TEXT NOT NULL,
      expires INTEGER NOT NULL);
    CREATE TABLE publication(key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL,
      rev INTEGER NOT NULL UNIQUE REFERENCES snapshot(rev));
    CREATE TABLE audit(rev INTEGER PRIMARY KEY REFERENCES snapshot(rev), actor TEXT NOT NULL);
    CREATE TABLE permit(tenant TEXT NOT NULL REFERENCES tenant(id), rid TEXT NOT NULL,
      fingerprint TEXT NOT NULL, bundle TEXT NOT NULL REFERENCES bundle(hash),
      replica TEXT NOT NULL REFERENCES replica(id), epoch INTEGER NOT NULL,
      profile TEXT NOT NULL, kv INTEGER NOT NULL CHECK(kv>0),
      rev INTEGER NOT NULL REFERENCES snapshot(rev), deadline INTEGER NOT NULL,
      state TEXT NOT NULL CHECK(state IN
        ('HELD','DISPATCHING','RUNNING','RETIRING','RELEASED','EXPIRED')),
      PRIMARY KEY(tenant,rid));
    ''')


def register(db, manifest):
    # File-byte verification / actual warmup are external adapter obligations.
    text = encoded(manifest)
    key = hashlib.sha256(text.encode()).hexdigest()
    with write_tx(db):
        db.execute('INSERT OR IGNORE INTO bundle VALUES(?,?)', (key, text))
    return key


def permit(db, tenant, rid):
    return one(db, 'SELECT * FROM permit WHERE tenant=? AND rid=?', (tenant, rid))


# BEGIN reserve
def take(db, table, identity, kv):
    # table is an internal constant: tenant or replica, never client SQL.
    sql = f'''UPDATE {table} SET used_slots=used_slots+1, used_kv=used_kv+?
              WHERE id=? AND used_slots+1<=slots AND used_kv+?<=kv'''
    if db.execute(sql, (kv, identity, kv)).rowcount != 1:
        raise Refused(table + ' capacity')


def reserve(db, q, clock, fail_after_tenant=False):
    fp = encoded([q['body'], q['bundle'], q['profile'], q['kv']])
    with write_tx(db):
        now = clock()
        old = db.execute('SELECT * FROM permit WHERE tenant=? AND rid=?',
                         (q['tenant'], q['rid'])).fetchone()
        if old:
            if old['fingerprint'] != fp:
                raise Refused('same key, different request')
            return dict(old) | {'created': False}
        r = one(db, 'SELECT * FROM replica WHERE id=?', (q['replica'],))
        t = one(db, 'SELECT * FROM tenant WHERE id=?', (q['tenant'],))
        s = one(db, 'SELECT * FROM snapshot WHERE rev=?', (q['rev'],))
        rev = one(db, 'SELECT rev FROM control WHERE id=1')['rev']
        endpoints = json.loads(s['payload'])['endpoints']
        exact = [r['id'], r['epoch'], r['bundle'], r['profile']]
        if (q['kv'] <= 0 or q['rev'] != rev or now >= s['expires']
            or exact not in endpoints or not r['ready'] or r['draining']
            or (r['bundle'], r['epoch'], r['profile'], r['tier']) !=
               (q['bundle'], q['epoch'], q['profile'], t['tier'])):
            raise Refused('ineligible or stale')
        deadline = min(q['deadline'], s['expires'])
        if now >= deadline:
            raise Refused('deadline')
        take(db, 'tenant', q['tenant'], q['kv'])
        if fail_after_tenant:
            raise RuntimeError('injected before replica charge')
        take(db, 'replica', q['replica'], q['kv'])
        values = (q['tenant'], q['rid'], fp, q['bundle'], q['replica'],
                  q['epoch'], q['profile'], q['kv'], q['rev'], deadline)
        db.execute("INSERT INTO permit VALUES(?,?,?,?,?,?,?,?,?,?,'HELD')", values)
        return dict(permit(db, q['tenant'], q['rid'])) | {'created': True}
# END reserve


def close_credit(db, p, terminal):
    # Caller holds the writer transaction; terminal permit and both debits commit together.
    for table, key in [('tenant', p['tenant']), ('replica', p['replica'])]:
        if table == 'replica':
            r = one(db, 'SELECT epoch FROM replica WHERE id=?', (key,))
            if r['epoch'] != p['epoch']:
                raise Refused('old incarnation cannot debit a new one')
        db.execute(f'''UPDATE {table} SET used_slots=used_slots-1,
                       used_kv=used_kv-? WHERE id=?''', (p['kv'], key))
    db.execute('UPDATE permit SET state=? WHERE tenant=? AND rid=?',
               (terminal, p['tenant'], p['rid']))


def expire(db, tenant, rid, clock):
    with write_tx(db):
        now = clock()
        p = permit(db, tenant, rid)
        if p['state'] != 'HELD' or now < p['deadline']:
            return False
        close_credit(db, p, 'EXPIRED')
        return True


# BEGIN launch
def begin_dispatch(db, tenant, rid, clock):
    with write_tx(db):
        now = clock()
        p = permit(db, tenant, rid)
        if p['state'] != 'HELD':
            return False
        r = one(db, 'SELECT * FROM replica WHERE id=?', (p['replica'],))
        rev = one(db, 'SELECT rev FROM control WHERE id=1')['rev']
        if (now >= p['deadline'] or p['rev'] != rev or not r['ready']
            or r['draining'] or r['epoch'] != p['epoch']):
            close_credit(db, p, 'EXPIRED')
            return False
        db.execute("UPDATE permit SET state='DISPATCHING' WHERE tenant=? AND rid=?",
                   (tenant, rid))
        return True  # Only this successful caller may send once.


def consume(db, tenant, rid, worker, epoch, bundle, clock):
    with write_tx(db):
        now = clock()
        p = permit(db, tenant, rid)
        r = one(db, 'SELECT * FROM replica WHERE id=?', (worker,))
        if (p['state'] != 'DISPATCHING' or now >= p['deadline']
            or (worker, epoch, bundle) != (p['replica'], p['epoch'], p['bundle'])
            or r['epoch'] != epoch or r['bundle'] != bundle or not r['ready']):
            return False
        db.execute("UPDATE permit SET state='RUNNING' WHERE tenant=? AND rid=?",
                   (tenant, rid))
        return True  # Only this successful caller may enqueue GPU work once.
# END launch


def retire(db, tenant, rid):
    with write_tx(db):
        return db.execute('''UPDATE permit SET state='RETIRING'
          WHERE tenant=? AND rid=? AND state IN ('DISPATCHING','RUNNING')''',
          (tenant, rid)).rowcount == 1


def release(db, tenant, rid, worker, epoch):
    # Trusted adapter invokes only after ALL work is ended or device reset/fenced.
    # Tests inject that evidence; this function does not observe a CUDA event.
    with write_tx(db):
        p = permit(db, tenant, rid)
        if p['state'] != 'RETIRING' or (worker, epoch) != (p['replica'], p['epoch']):
            return False
        close_credit(db, p, 'RELEASED')
        return True


# BEGIN publish
def publish(db, key, expected_rev, weights, endpoints, expires, actor,
            fail_before_audit=False):
    payload = encoded({'weights': weights, 'endpoints': endpoints})
    fp = encoded([expected_rev, payload, expires, actor])
    with write_tx(db):
        old = db.execute('SELECT * FROM publication WHERE key=?', (key,)).fetchone()
        if old:
            if old['fingerprint'] != fp:
                raise Refused('publication key conflict')
            return old['rev']
        c = one(db, 'SELECT * FROM control WHERE id=1')
        if c['rev'] != expected_rev or not weights or any(type(w) is not int or w <= 0 for w in weights.values()):
            raise Refused('revision or weights')
        seen = set()
        for identity, epoch, bundle, profile in endpoints:
            r = one(db, 'SELECT * FROM replica WHERE id=?', (identity,))
            m = json.loads(one(db, 'SELECT manifest FROM bundle WHERE hash=?',
                               (bundle,))['manifest'])
            if (not r['ready'] or r['draining'] or bundle not in weights
                or (r['epoch'], r['bundle'], r['profile']) != (epoch, bundle, profile)
                or (m['api'], m['state']) != (c['api'], c['state_schema'])):
                raise Refused('unready or incompatible bundle')
            seen.add(bundle)
        if seen != set(weights):
            raise Refused('missing endpoint')
        rev = expected_rev + 1
        db.execute('INSERT INTO snapshot VALUES(?,?,?)', (rev, payload, expires))
        db.execute('UPDATE control SET rev=? WHERE id=1 AND rev=?', (rev, expected_rev))
        db.execute('INSERT INTO publication VALUES(?,?,?)', (key, fp, rev))
        if fail_before_audit:
            raise RuntimeError('injected before audit')
        db.execute('INSERT INTO audit VALUES(?,?)', (rev, actor))
        return rev
# END publish


def begin_drain(db, worker):
    with write_tx(db):
        rev = one(db, 'SELECT rev FROM control WHERE id=1')['rev']
        s = one(db, 'SELECT payload FROM snapshot WHERE rev=?', (rev,))
        if any(e[0] == worker for e in json.loads(s['payload'])['endpoints']):
            raise Refused('still routed')
        db.execute('UPDATE replica SET draining=1 WHERE id=?', (worker,))
        held = db.execute("SELECT * FROM permit WHERE replica=? AND state='HELD'",
                          (worker,)).fetchall()
        for p in held:
            close_credit(db, p, 'EXPIRED')


def unload(db, worker):
    with write_tx(db):
        return db.execute('''UPDATE replica SET ready=0 WHERE id=? AND draining=1
          AND used_slots=0 AND used_kv=0''', (worker,)).rowcount == 1
