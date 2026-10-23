"""Executable contract model, not a server or a distributed-storage proof.

SQLite BEGIN IMMEDIATE substitutes a coarser lock for PG's tenant guard.
Objects use a separate SQLite file, so metadata rollback cannot undo byte PUTs.
Local object storage simulates exact immutable keys/versions, not S3 itself.
"""
import hashlib
import json
import math
import sqlite3
import tempfile
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BLOCK = 4 * 1024 * 1024
DATA = [b'A' * BLOCK, b'B' * BLOCK, b'C' * BLOCK]
checks = []


class Rejected(Exception):
    pass


def require(value, reason):
    if not value:
        raise Rejected(reason)


def check(value, name):
    assert value, name
    checks.append(name)


def reject(call, reason, name):
    try:
        call()
    except Rejected as e:
        check(str(e) == reason, name)
    else:
        raise AssertionError(f'{name}: was accepted')


def digest(value):
    return hashlib.sha256(value).hexdigest()


def canonical(value):
    return json.dumps(value, separators=(',', ':'), sort_keys=True)


def manifest(chunks):
    rows = [[digest(b), len(b)] for b in chunks]
    validate(rows, sum(len(b) for b in chunks))
    return rows


def validate(rows, size):
    require(len(rows) <= 1024, 'SHAPE')
    require(size == sum(r[1] for r in rows), 'SHAPE')
    require(all(len(h) == 64 and all(c in '0123456789abcdef' for c in h)
                and 0 < n <= BLOCK for h, n in rows), 'SHAPE')
    require(all(n == BLOCK for _, n in rows[:-1]), 'SHAPE')
    require(bool(rows) or size == 0, 'SHAPE')


def connect(file):
    db = sqlite3.connect(file, isolation_level=None, timeout=15)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    return db


@contextmanager
def tx(db):
    db.execute('BEGIN IMMEDIATE')
    try:
        yield
        db.execute('COMMIT')
    except BaseException:
        db.execute('ROLLBACK')
        raise


class Model:
    def __init__(self, directory):
        self.file = str(Path(directory) / 'metadata.sqlite')
        self.objects = str(Path(directory) / 'objects.sqlite')
        with connect(self.file) as db:
            db.executescript('''
            CREATE TABLE guard(tenant TEXT PRIMARY KEY, head INTEGER, used INTEGER,
                               quota INTEGER, epoch INTEGER, floor INTEGER);
            INSERT INTO guard VALUES('t',101,0,1073741824,1,101);
            CREATE TABLE file(id TEXT PRIMARY KEY, head INTEGER, deleted INTEGER);
            INSERT INTO file VALUES('f1',7,0),('f2',0,0);
            CREATE TABLE acl(file TEXT, actor TEXT, r INTEGER, w INTEGER,
                             PRIMARY KEY(file,actor));
            INSERT INTO acl VALUES('f1','A',1,1),('f1','B',1,1),('f2','A',1,1);
            CREATE TABLE session(id TEXT PRIMARY KEY, owner TEXT, file TEXT, base INTEGER,
                manifest TEXT, digest TEXT, size INTEGER, expires INTEGER, state TEXT,
                result_version INTEGER, result_seq INTEGER);
            CREATE TABLE block(g TEXT PRIMARY KEY, h TEXT, n INTEGER, key TEXT UNIQUE,
                               state TEXT, created INTEGER);
            CREATE UNIQUE INDEX ready ON block(h,n) WHERE state='READY';
            CREATE TABLE attempt(sid TEXT, ordinal INTEGER, g TEXT, staging TEXT,
                                 expires INTEGER, PRIMARY KEY(sid,ordinal,g));
            CREATE TABLE pin(sid TEXT, ordinal INTEGER, g TEXT, kind TEXT,
                             source_file TEXT, source_version INTEGER,
                             PRIMARY KEY(sid,ordinal));
            CREATE TABLE version(file TEXT, v INTEGER, manifest TEXT, size INTEGER,
                                 PRIMARY KEY(file,v));
            CREATE TABLE ref(file TEXT,v INTEGER,ordinal INTEGER,g TEXT,
                             PRIMARY KEY(file,v,ordinal));
            CREATE TABLE receipt(owner TEXT,k TEXT,intent TEXT,file TEXT,v INTEGER,seq INTEGER,
                                 PRIMARY KEY(owner,k));
            CREATE TABLE change(seq INTEGER PRIMARY KEY,file TEXT,v INTEGER);
            CREATE TABLE outbox(seq INTEGER PRIMARY KEY,sent INTEGER DEFAULT 0);
            CREATE TABLE job(g TEXT PRIMARY KEY,key TEXT,done INTEGER DEFAULT 0);
            CREATE TABLE read_pin(g TEXT PRIMARY KEY,active INTEGER);
            ''')
        with connect(self.objects) as db:
            db.execute('CREATE TABLE object(key TEXT PRIMARY KEY, body BLOB)')

    def scalar(self, sql, values=()):
        with connect(self.file) as db:
            return db.execute(sql, values).fetchone()[0]

    def write(self, sql, values=()):
        with connect(self.file) as db, tx(db):
            db.execute(sql, values)

    @staticmethod
    def acl(db, file, user, column):
        row = db.execute(f'SELECT {column} FROM acl WHERE file=? AND actor=?', (file, user)).fetchone()
        return row is not None and row[0] == 1

    @staticmethod
    def owned(db, sid, user):
        s = db.execute('SELECT * FROM session WHERE id=?', (sid,)).fetchone()
        require(s and s['owner'] == user, 'OWNER')
        return s

    def init(self, sid, user='A', chunks=DATA, target='f1', base=7, rows=None):
        rows = manifest(chunks) if rows is None else rows
        size = sum(r[1] for r in rows)
        validate(rows, size)
        body = canonical([target, base, rows, size])
        with connect(self.file) as db, tx(db):
            require(self.acl(db, target, user, 'w'), 'ACL')
            db.execute('INSERT INTO session VALUES(?,?,?,?,?,?,?,?,?,?,?)',
                       (sid, user, target, base, canonical(rows), digest(body.encode()),
                        size, 100, 'OPEN', None, None))
        return digest(body.encode())

    def stage(self, sid, i, data, gen=None):
        gen = gen or f'{sid}-{i}'
        key = f't/final/{gen}'
        staging = f't/staging/{sid}/{i}/{gen}/v1'
        with connect(self.file) as db, tx(db):
            s = self.owned(db, sid, self.scalar('SELECT owner FROM session WHERE id=?', (sid,)))
            rows = json.loads(s['manifest'])
            db.execute('INSERT INTO block VALUES(?,?,?,?,?,?)',
                       (gen, rows[i][0], rows[i][1], key, 'UPLOADING', 0))
            db.execute('INSERT INTO attempt VALUES(?,?,?,?,?)', (sid, i, gen, staging, 100))
        with connect(self.objects) as db:
            db.execute('INSERT INTO object VALUES(?,?)', (staging, data))
        return gen

    def upload_pin(self, sid, i, user='A', now=1, unknown=False, gen=None):
        gen = gen or f'{sid}-{i}'
        with connect(self.file) as db:
            s = self.owned(db, sid, user)
            expected = json.loads(s['manifest'])[i]
            a = db.execute('SELECT a.*,b.key FROM attempt a JOIN block b ON a.g=b.g '
                           'WHERE a.sid=? AND a.ordinal=? AND a.g=?', (sid, i, gen)).fetchone()
            require(a is not None, 'ATTEMPT')
        with connect(self.objects) as objects:
            data = objects.execute('SELECT body FROM object WHERE key=?', (a['staging'],)).fetchone()[0]
            require([digest(data), len(data)] == expected, 'INTEGRITY')
            objects.execute('INSERT INTO object VALUES(?,?) ON CONFLICT DO NOTHING', (a['key'], data))
            final = objects.execute('SELECT body FROM object WHERE key=?', (a['key'],)).fetchone()[0]
            require(not unknown, 'PUT_UNKNOWN')
            require([digest(final), len(final)] == expected, 'INTEGRITY')
        with connect(self.file) as db, tx(db):
            s = self.owned(db, sid, user)
            require(s['state'] == 'OPEN' and s['expires'] > now, 'EXPIRED')
            require(self.acl(db, s['file'], user, 'w'), 'ACL')
            candidate = db.execute('SELECT * FROM block WHERE g=?', (gen,)).fetchone()
            require(candidate['state'] == 'UPLOADING' and a['expires'] > now, 'ATTEMPT')
            g = db.execute("SELECT g FROM block WHERE h=? AND n=? AND state='READY'", expected).fetchone()
            if g:
                db.execute("UPDATE block SET state='ORPHAN' WHERE g=?", (gen,))
                gen = g[0]
            else:
                db.execute("UPDATE block SET state='READY' WHERE g=?", (gen,))
            db.execute('INSERT OR REPLACE INTO pin VALUES(?,?,?,?,?,?)', (sid, i, gen, 'UPLOAD', None, None))
        return gen

    def reuse_pin(self, sid, i, source, version, source_i, user='A', now=1):
        with connect(self.file) as db, tx(db):
            s = self.owned(db, sid, user)
            require(s['state'] == 'OPEN' and s['expires'] > now, 'EXPIRED')
            require(self.acl(db, s['file'], user, 'w'), 'ACL')
            require(self.acl(db, source, user, 'r'), 'SOURCE_ACL')
            g = db.execute('SELECT b.* FROM ref r JOIN block b ON r.g=b.g '
                           'WHERE r.file=? AND r.v=? AND r.ordinal=?', (source, version, source_i)).fetchone()
            require(g and g['state'] == 'READY', 'NOT_READY')
            require([g['h'], g['n']] == json.loads(s['manifest'])[i], 'INTEGRITY')
            db.execute('INSERT OR REPLACE INTO pin VALUES(?,?,?,?,?,?)', (sid, i, g['g'], 'REUSE', source, version))

    def complete(self, sid, key='key', user='A', supplied_digest=None, now=1, fail=False):
        with connect(self.file) as db, tx(db):
            s = self.owned(db, sid, user)
            request_digest = s['digest'] if supplied_digest is None else supplied_digest
            intent = digest(canonical(['t', user, sid, request_digest]).encode())
            prior = db.execute('SELECT * FROM receipt WHERE owner=? AND k=?', (user, key)).fetchone()
            if prior:
                require(prior['intent'] == intent, 'KEY_REUSED')
                return prior['v'], prior['seq']
            require(request_digest == s['digest'], 'INTENT_CHANGED')
            if s['result_version'] is not None:
                result = (s['result_version'], s['result_seq'])
            else:
                require(s['state'] == 'OPEN' and s['expires'] > now, 'EXPIRED')
                f = db.execute('SELECT * FROM file WHERE id=?', (s['file'],)).fetchone()
                require(self.acl(db, s['file'], user, 'w') and not f['deleted'], 'ACL_OR_DELETED')
                rows = json.loads(s['manifest'])
                pins = db.execute('SELECT p.*,b.h,b.n,b.state FROM pin p JOIN block b ON p.g=b.g '
                                  'WHERE sid=? ORDER BY ordinal', (sid,)).fetchall()
                require(len(pins) == len(rows) and all(p['ordinal'] == i and
                        [p['h'], p['n']] == rows[i] and p['state'] == 'READY'
                        for i, p in enumerate(pins)), 'INCOMPLETE')
                require(all(p['kind'] != 'REUSE' or (self.acl(db, p['source_file'], user, 'r')
                            and db.execute('SELECT 1 FROM version WHERE file=? AND v=?',
                                           (p['source_file'],p['source_version'])).fetchone())
                            for p in pins), 'SOURCE_ACL')
                require(f['head'] == s['base'], '412')
                guard = db.execute('SELECT * FROM guard').fetchone()
                require(guard['used'] + s['size'] <= guard['quota'], 'QUOTA')
                v, seq = s['base'] + 1, guard['head'] + 1
                db.execute('INSERT INTO version VALUES(?,?,?,?)', (s['file'], v, s['manifest'], s['size']))
                for pin in pins:
                    db.execute('INSERT INTO ref VALUES(?,?,?,?)', (s['file'], v, pin['ordinal'], pin['g']))
                require(not fail, 'INJECTED_ABORT')
                count = db.execute('UPDATE file SET head=? WHERE id=? AND head=?', (v, s['file'], s['base'])).rowcount
                require(count == 1, '412')
                db.execute('UPDATE guard SET head=?,used=used+?', (seq, s['size']))
                db.execute('INSERT INTO change VALUES(?,?,?)', (seq, s['file'], v))
                db.execute('INSERT INTO outbox(seq) VALUES(?)', (seq,))
                db.execute("UPDATE session SET state='COMMITTED',result_version=?,result_seq=? WHERE id=?", (v, seq, sid))
                db.execute('DELETE FROM pin WHERE sid=?', (sid,))
                result = (v, seq)
            db.execute('INSERT INTO receipt VALUES(?,?,?,?,?,?)', (user, key, intent, s['file'], *result))
            return result

    def prepared(self, sid='u', user='A', chunks=DATA, target='f1', base=7):
        self.init(sid, user, chunks, target, base)
        for i, data in enumerate(chunks):
            self.stage(sid, i, data)
            self.upload_pin(sid, i, user)

    def fence(self, gen, now=200):
        with connect(self.file) as db, tx(db):
            g = db.execute('SELECT * FROM block WHERE g=?', (gen,)).fetchone()
            require(g['state'] in ('READY', 'ORPHAN', 'UPLOADING'), 'STATE')
            require(now - g['created'] >= 48, 'GRACE')  # compressed clock units
            require(not db.execute("SELECT 1 FROM attempt a JOIN block b ON a.g=b.g "
                    "WHERE a.g=? AND a.expires>? AND b.state='UPLOADING'", (gen, now)).fetchone(), 'PROTECTED')
            require(not db.execute('SELECT 1 FROM ref WHERE g=?', (gen,)).fetchone(), 'PROTECTED')
            require(not db.execute("SELECT 1 FROM pin p JOIN session s ON p.sid=s.id "
                    "WHERE p.g=? AND s.state='OPEN' AND s.expires>?", (gen, now)).fetchone(), 'PROTECTED')
            require(not db.execute('SELECT 1 FROM read_pin WHERE g=? AND active=1', (gen,)).fetchone(), 'PROTECTED')
            db.execute("UPDATE block SET state='DELETING' WHERE g=?", (gen,))
            db.execute('INSERT INTO job(g,key) VALUES(?,?)', (gen, g['key']))
        return g['key']

    def sweep(self, gen, unknown=False):
        key = self.scalar('SELECT key FROM job WHERE g=?', (gen,))
        with connect(self.objects) as db:
            db.execute('DELETE FROM object WHERE key=?', (key,))
        if unknown:
            return 'RETRY'
        with connect(self.file) as db, tx(db):
            require(db.execute('SELECT state FROM block WHERE g=?', (gen,)).fetchone()[0] == 'DELETING', 'STATE')
            db.execute("UPDATE block SET state='DELETED' WHERE g=?", (gen,))
            db.execute('UPDATE job SET done=1 WHERE g=?', (gen,))
        return 'DONE'

    def changes(self, cursor, H=None, user='A', epoch=1, limit=100):
        with connect(self.file) as db, tx(db):
            g = db.execute('SELECT * FROM guard').fetchone()
            require(g['epoch'] == epoch and g['floor'] <= cursor <= g['head'], 'RESET')
            H = g['head'] if H is None else H
            require(cursor <= H <= g['head'], 'BOUND')
            rows = db.execute('SELECT * FROM change WHERE seq>? AND seq<=? ORDER BY seq LIMIT ?', (cursor, H, limit)).fetchall()
            visible = [r['seq'] for r in rows if self.acl(db, r['file'], user, 'r')]
            return visible, rows[-1]['seq'] if rows else H, H


with sqlite3.connect(':memory:') as schema_db:
    schema_db.executescript((ROOT / 'examples/ch15/schema.sql').read_text())
    schema_db.execute("INSERT INTO block_generation VALUES('t','g1','hash',4,'key1','READY')")
    try:
        schema_db.execute("INSERT INTO block_generation VALUES('t','g2','hash',4,'key2','READY')")
    except sqlite3.IntegrityError:
        check(True, 'unchanged schema SQL enforces one READY generation')
    else:
        raise AssertionError('READY uniqueness failed')
    schema_db.execute("INSERT INTO block_generation VALUES('t','g2','hash',4,'key2','DELETING')")
    check(schema_db.execute('SELECT COUNT(*) FROM block_generation').fetchone()[0] == 2,
          'DELETING old generation can coexist with fresh READY generation')

with tempfile.TemporaryDirectory(prefix='ch15-contract-') as temporary:
    count = 0

    def model():
        global count
        count += 1
        directory = Path(temporary) / str(count)
        directory.mkdir()
        return Model(directory)

    # Shape, exact content and frozen intent.
    check(manifest([]) == [], 'empty file manifest')
    reject(lambda: validate([[digest(b'a'), 1], [digest(b'b'), 1]], 2), 'SHAPE', 'short nonfinal block rejected')
    reject(lambda: validate([[digest(b'a'), 1]], 2), 'SHAPE', 'wrong total rejected')
    a = model(); a.init('u'); a.stage('u', 0, b'wrong')
    reject(lambda: a.upload_pin('u', 0), 'INTEGRITY', 'actual wrong bytes rejected')
    check(a.scalar('SELECT COUNT(*) FROM pin') == 0, 'bad bytes produce no pin')
    b = model(); b.init('u'); b.stage('u', 0, DATA[0])
    reject(lambda: b.upload_pin('u', 0, unknown=True), 'PUT_UNKNOWN', 'unknown PUT cannot become READY')
    check(b.scalar("SELECT COUNT(*) FROM block WHERE state='READY'") == 0, 'no READY after unknown PUT')
    check(b.upload_pin('u', 0) == 'u-0', 'same exact generation recovers lost ACK')
    with connect(b.objects) as objects:
        objects.execute("UPDATE object SET body=? WHERE key LIKE '%/staging/%'", (b'new staging bytes',))
        check(digest(objects.execute("SELECT body FROM object WHERE key='t/final/u-0'").fetchone()[0]) == digest(DATA[0]),
              'later staging replacement cannot change frozen final bytes')
    reject(lambda: b.complete('u'), 'INCOMPLETE', 'partial upload cannot publish')
    reject(lambda: b.upload_pin('u', 0, user='B'), 'OWNER', 'other principal cannot use session')
    c = model(); c.prepared()
    reject(lambda: c.complete('u', supplied_digest=digest(b'changed order')), 'INTENT_CHANGED', 'frozen manifest/order cannot change')
    reject(lambda: c.complete('u', fail=True), 'INJECTED_ABORT', 'injected mid-transaction failure')
    for table in ('version', 'ref', 'receipt', 'change', 'outbox'):
        check(c.scalar(f'SELECT COUNT(*) FROM {table}') == 0, f'abort rolls back {table}')
    check(c.scalar('SELECT head FROM guard') == 101, 'ordinary change counter rolls back')
    check(c.scalar('SELECT head FROM file WHERE id="f1"') == 7, 'head unchanged after abort')
    check(c.complete('u') == (8, 102), 'normal full commit')
    check(c.scalar('SELECT used FROM guard') == 3 * BLOCK, 'retained logical version charges full length')
    check(c.scalar('SELECT COUNT(*) FROM ref') == 3 and c.scalar('SELECT COUNT(*) FROM pin') == 0, 'pins convert to version references atomically')
    check(c.complete('u') == (8, 102), 'lost commit ACK replays original before parent check')
    check(c.complete('u', key='alias') == (8, 102), 'another key on same session has one result')
    c.write('UPDATE acl SET r=0,w=0 WHERE actor="A" AND file="f1"')
    check(c.complete('u', now=1000) == (8, 102), 'minimal owner receipt survives revocation and expiry')
    reject(lambda: c.complete('u', supplied_digest=digest(b'changed')), 'KEY_REUSED', 'same key changed intent rejected')
    check(c.scalar('SELECT COUNT(*) FROM version') == 1, 'replays never duplicate version')

    # Real SQLite transaction competition, coarser than PG tenant row locking.
    d = model(); d.prepared()
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: d.complete('u'), range(16)))
    check(set(results) == {(8, 102)} and d.scalar('SELECT COUNT(*) FROM version') == 1, '16 concurrent same-key completes publish once')
    d.init('second', chunks=[DATA[0]], base=8)
    reject(lambda: d.complete('second'), 'KEY_REUSED', 'same completed key cannot move to another session')
    reject(lambda: d.complete('second', key='empty', supplied_digest=''), 'INTENT_CHANGED', 'empty digest is not missing input')
    e = model(); e.prepared('a', 'A'); e.prepared('b', 'B')
    check(e.complete('a', key='a') == (8, 102), 'first parent=7 writer commits v8')
    reject(lambda: e.complete('b', key='b', user='B'), '412', 'second parent=7 writer cannot overwrite')
    check(e.scalar('SELECT COUNT(*) FROM pin WHERE sid="b"') == 3, 'conflict keeps candidate pins for resolution')
    race = model(); race.prepared('a', 'A'); race.prepared('b', 'B')
    def competing(user):
        try:
            return race.complete(user.lower(), key=user, user=user)
        except Rejected as error:
            return str(error)
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(competing, ['A', 'B']))
    check(outcomes.count((8,102)) == 1 and outcomes.count('412') == 1,
          'two concurrent distinct sessions from parent 7 have exactly one winner')
    f = model(); f.prepared(); f.write('UPDATE acl SET w=0 WHERE actor="A" AND file="f1"')
    reject(lambda: f.complete('u'), 'ACL_OR_DELETED', 'revocation before new commit wins')
    f = model(); f.prepared(); f.write('UPDATE file SET deleted=1 WHERE id="f1"')
    reject(lambda: f.complete('u'), 'ACL_OR_DELETED', 'deleted target cannot be resurrected')
    f = model(); f.prepared(); f.write('UPDATE guard SET quota=1')
    reject(lambda: f.complete('u'), 'QUOTA', 'logical quota checked at commit')
    f = model(); f.prepared()
    reject(lambda: f.complete('u', now=100), 'EXPIRED', 'expiry closes new completion at exact deadline')

    # Same tenant and same hash do not imply a readable source.
    g = model(); g.prepared('src', target='f2', base=0); g.complete('src', 'src')
    g.init('dst', 'B')
    reject(lambda: g.reuse_pin('dst', 0, 'f2', 1, 0, user='B'), 'SOURCE_ACL', 'same-tenant private content adoption denied')
    g.write("INSERT INTO acl VALUES('f2','B',1,0)")
    for i in range(3):
        g.reuse_pin('dst', i, 'f2', 1, i, user='B')
    g.write("UPDATE acl SET r=0 WHERE file='f2' AND actor='B'")
    reject(lambda: g.complete('dst', key='dst', user='B'), 'SOURCE_ACL', 'reuse read authority rechecked at commit')
    g.write("UPDATE acl SET r=1 WHERE file='f2' AND actor='B'")
    check(g.complete('dst', key='dst', user='B') == (8, 103), 'authorized reuse publishes shared immutable generations')
    reject(lambda: g.fence('src-0'), 'PROTECTED', 'retained references prevent GC')

    # GC/adopt in either order, active attempts/readers, delayed DELETE.
    h = model(); h.prepared()
    reject(lambda: h.fence('u-0', now=60), 'PROTECTED', 'pin-before-GC protects generation')
    key = h.fence('u-0', now=200)
    check(h.scalar("SELECT state FROM block WHERE g='u-0'") == 'DELETING', 'GC-before-reuse fences exact generation')
    h.init('new', chunks=[DATA[0]], base=7); h.stage('new', 0, DATA[0], 'fresh')
    check(h.upload_pin('new', 0, gen='fresh') == 'fresh', 'same content uses fresh generation after fence')
    check(h.sweep('u-0', unknown=True) == 'RETRY', 'lost DELETE ACK stays retryable')
    check(h.scalar("SELECT state FROM block WHERE g='u-0'") == 'DELETING', 'unknown DELETE cannot fall through to DELETED')
    check(h.sweep('u-0') == 'DONE', 'exact old deletion retry confirms terminal state')
    with connect(h.objects) as objects:
        objects.execute('DELETE FROM object WHERE key=?', (key,))  # delayed duplicate old DELETE
        check(objects.execute("SELECT COUNT(*) FROM object WHERE key='t/final/fresh'").fetchone()[0] == 1, 'delayed old DELETE cannot delete new physical generation')
    check(h.complete('new', key='fresh') == (8, 102), 'fresh generation remains publishable')
    j = model(); j.init('u', chunks=[DATA[0]]); j.stage('u', 0, DATA[0])
    reject(lambda: j.fence('u-0', now=60), 'PROTECTED', 'registered live UPLOADING attempt protected')
    j.fence('u-0', now=200)
    reject(lambda: j.upload_pin('u', 0, now=200), 'EXPIRED', 'late verified upload cannot revive dead generation')
    k = model(); k.prepared(); k.write("INSERT INTO read_pin VALUES('u-0',1)")
    reject(lambda: k.fence('u-0', now=200), 'PROTECTED', 'active reader protects expired upload pin')

    # Cursor pages scan raw rows; horizons, visibility epochs and retention are explicit.
    n = model(); n.prepared(); n.complete('u')
    n.prepared('hidden', target='f2', base=0); n.complete('hidden', 'hidden')
    check(n.changes(101, user='B', limit=1) == ([102], 102, 103), 'page obtains committed fixed horizon')
    check(n.changes(102, H=103, user='B', limit=1) == ([], 103, 103), 'filtered empty page advances raw scan cursor')
    n.write('UPDATE guard SET epoch=2')
    reject(lambda: n.changes(103, epoch=1), 'RESET', 'ACL epoch invalidates old visibility view')
    n.write('UPDATE guard SET floor=103')
    reject(lambda: n.changes(102, epoch=2), 'RESET', 'expired log requires reset instead of cursor jump')
    z = model(); z.write('UPDATE guard SET head=0,floor=0')
    check(z.changes(0, H=0) == ([], 0, 0), 'zero horizon is an explicit valid bound')
    z.prepared(); z.complete('u')
    check(z.changes(0, H=0) == ([], 0, 0), 'zero horizon stays fixed after a later commit')
    # Deliberately unsafe physical-key reuse reproduces the motivating bug.
    with connect(z.objects) as objects:
        objects.execute("INSERT INTO object VALUES('unsafe-key',?)", (b'old',))
        objects.execute("DELETE FROM object WHERE key='unsafe-key'")
        objects.execute("INSERT INTO object VALUES('unsafe-key',?)", (b'new',))
        objects.execute("DELETE FROM object WHERE key='unsafe-key'")
        check(objects.execute("SELECT COUNT(*) FROM object WHERE key='unsafe-key'").fetchone()[0] == 0, 'negative control: reused physical key loses new bytes to delayed DELETE')

numbers = {
    'file_saves_day': 10_000_000 * 2,
    'file_saves_average_s': 20_000_000 / 86400,
    'file_saves_peak_s': 20_000_000 / 86400 * 5,
    'inbound_PB_day': 10_000_000 * 100_000_000 / 10**15,
    'inbound_peak_Gbit_s': 10**15 / 86400 * 8 * 5 / 10**9,
    'blocks_per_exact_50MB': math.ceil(50_000_000 / BLOCK),
    'exact_file_distribution_peak_PUT_s': 20_000_000 * 12 / 86400 * 5,
    'block_upper_bound_peak_PUT_s': (10**15 / BLOCK + 20_000_000) / 86400 * 5,
    'quota_ceiling_PB': 50_000_000 * 10 * 10**9 / 10**15,
    'thirty_day_new_unique_PB': 30,
    'three_copies_of_new_unique_PB': 30 * 3,
    'resume_seconds': 64 * BLOCK * 8 / 20_000_000,
    'whole_file_seconds': 2**30 * 8 / 20_000_000,
    'small_delta_seconds': BLOCK * 8 / 20_000_000,
    'manifest_digest_bytes': 256 * 32,
    'smaller_chunk_digest_bytes': (2**30 // 65536) * 32,
    'COW_unique_MiB': 12 + 4,
    'COW_saved_fraction': (24 - 16) / 24,
    'abandoned_48h_TB': 10**15 * .01 * 2 / 10**12,
}
check(round(numbers['block_upper_bound_peak_PUT_s'], 2) == 14954.78, 'block PUT upper bound independently recomputed')
check(round(numbers['resume_seconds'], 2) == 107.37 and round(numbers['whole_file_seconds'], 2) == 429.5, 'binary bytes and decimal bit rate independently recomputed')
result = {'passed': True, 'checks': checks, 'count': len(checks), 'numbers': numbers,
          'limitations': ['SQLite locks whole write database instead of PG tenant rows',
                         'Object contract is a separate local SQLite model, not S3 or a durable distributed object service',
                         'No production traffic, device fsync, IAM, token signing, failover or reader-drain implementation']}
(ROOT / 'docs/reviews/ch15-code-results.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'passed': True, 'assertions': len(checks), 'numeric_results': numbers}, indent=2))
