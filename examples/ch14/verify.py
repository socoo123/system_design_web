"""Executable contract model: SQLite + versioned toy objects, not cloud/codec tests."""
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from fractions import Fraction as F
from hashlib import sha256
from pathlib import Path
import json
import math
import re
import sqlite3
from urllib.parse import parse_qs, quote, unquote, urlparse
import zlib

ROOT = Path(__file__).resolve().parents[2]
checks = []


def check(name, condition):
    assert condition, name
    checks.append(name)


def rejects(name, call):
    try:
        call()
    except (AssertionError, KeyError, sqlite3.IntegrityError):
        checks.append(name)
    else:
        raise AssertionError(f'expected rejection: {name}')


def crc(data):
    return ('CRC32', 'FULL_OBJECT', f'{zlib.crc32(data):08x}')


@dataclass(frozen=True)
class Ref:
    bucket: str
    key: str
    version: str
    size: int
    digest: str

    @property
    def uri(self):
        return f'https://media.example/{quote(self.key, safe="/")}?versionId={quote(self.version, safe="")}'


class Store:
    def __init__(self):
        self.objects = {}
        self.current = {}
        self.serial = 0

    def put(self, bucket, key, data, conditional=True, lose_reply=False):
        current = self.current.get((bucket, key))
        if conditional and current:
            assert self.objects[(bucket, key, current)] == data, '412 is not byte equality'
            version = current
        else:
            self.serial += 1
            version = f'opaque+version/{self.serial}'
            self.objects[(bucket, key, version)] = data
            self.current[(bucket, key)] = version
        if lose_reply:
            version = self.current[(bucket, key)]
        actual = self.get(bucket, key, version)
        assert actual == data
        return Ref(bucket, key, version, len(data), sha256(data).hexdigest())

    def get(self, bucket, key, version):
        assert version not in (None, '', 'null')
        return self.objects[(bucket, key, version)]

    def from_uri(self, uri):
        u = urlparse(uri)
        assert u.scheme == 'https' and u.netloc == 'media.example'
        versions = parse_qs(u.query).get('versionId', [])
        assert len(versions) == 1 and versions[0] != 'null'
        key = unquote(u.path.lstrip('/'))
        assert '..' not in key.split('/')
        data = self.get('out', key, versions[0])
        return Ref('out', key, versions[0], len(data), sha256(data).hexdigest())


class Model:
    def __init__(self):
        self.now = 0
        self.store = Store()
        self.source = self.store.put('src', 'upload/u1', b'original source', conditional=False)
        self.db = sqlite3.connect(':memory:', isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.db.executescript('''
          CREATE TABLE video(id TEXT PRIMARY KEY, target TEXT, ready TEXT, removed INT DEFAULT 0);
          CREATE TABLE upload(id TEXT PRIMARY KEY, owner TEXT, state TEXT, version TEXT,
                              size INT, checksum TEXT, expires INT);
          CREATE TABLE source_binding(video TEXT, logical INT, version TEXT, PRIMARY KEY(video,logical));
          CREATE TABLE job(j TEXT PRIMARY KEY, state TEXT, epoch INT, attempts INT,
                           next_at INT, lease INT, result TEXT);
          CREATE TABLE build(j TEXT, epoch INT, state TEXT, root TEXT, inventory TEXT,
                             hold_until INT DEFAULT 0, session_until INT DEFAULT 0,
                             PRIMARY KEY(j,epoch));
          CREATE TABLE playback_grant(viewer TEXT, request_key TEXT, intent TEXT, j TEXT, epoch INT,
                                      root TEXT, expires INT, protected_until INT,
                                      PRIMARY KEY(viewer,request_key));
          INSERT INTO video VALUES('v1','v1_s1_r1',NULL,0);
        ''')
        self.db.execute('INSERT INTO upload VALUES(?,?,?,?,?,?,?)',
                        ('u1', 'alice', 'UPLOADING', None, self.source.size,
                         json.dumps(crc(b'original source')), 100))

    @contextmanager
    def tx(self):
        self.db.execute('BEGIN IMMEDIATE')
        try:
            yield
            self.db.execute('COMMIT')
        except BaseException:
            self.db.execute('ROLLBACK')
            raise

    def row(self, table, where='', args=()):
        return self.db.execute(f'SELECT * FROM {table} {where}', args).fetchone()

    def complete(self, owner='alice', version=None, fail=False):
        version = version or self.source.version
        u = self.row('upload')
        assert u['owner'] == owner
        if u['version']:
            assert u['version'] == version
            return version
        data = self.store.get('src', 'upload/u1', version)
        assert len(data) == u['size'] and crc(data) == tuple(json.loads(u['checksum']))
        with self.tx():
            u = self.row('upload')
            assert u['state'] == 'UPLOADING' and u['expires'] > self.now
            assert not self.row('video')['removed']
            self.db.execute('INSERT INTO source_binding VALUES(?,?,?)', ('v1', 1, version))
            self.db.execute("UPDATE upload SET state='UPLOADED',version=?", (version,))
            if fail:
                raise AssertionError('injected DB failure before Job insertion')
            self.db.execute("INSERT OR IGNORE INTO job VALUES(?,'QUEUED',0,0,?,0,NULL)",
                            ('v1_s1_r1', self.now))
        return version

    def claim(self, j='v1_s1_r1'):
        with self.tx():
            v = self.row('video')
            r = self.row('job', 'WHERE j=?', (j,))
            if r['state'] in ('DONE', 'FAILED', 'OBSOLETE'):
                return 'TERMINAL'
            if v['target'] != j or v['removed']:
                self.db.execute("UPDATE job SET state='OBSOLETE' WHERE j=?", (j,))
                return 'TERMINAL'
            due = ((r['state'] in ('QUEUED', 'RETRY_WAIT') and r['next_at'] <= self.now)
                   or (r['state'] == 'RUNNING' and r['lease'] <= self.now))
            if not due:
                return 'NO_CLAIM'
            if r['attempts'] >= 3:
                self.db.execute("UPDATE job SET state='FAILED' WHERE j=?", (j,))
                return 'TERMINAL'
            e = r['epoch'] + 1
            self.db.execute("UPDATE job SET state='RUNNING',epoch=?,attempts=attempts+1,lease=? WHERE j=?",
                            (e, self.now + 120, j))
            self.db.execute("INSERT INTO build(j,epoch,state) VALUES(?,?,'BUILDING')", (j, e))
            return (j, e)

    def renew(self, claim):
        j, e = claim
        with self.tx():
            return self.db.execute("UPDATE job SET lease=? WHERE j=? AND epoch=? AND state='RUNNING' AND lease>?",
                                   (self.now + 120, j, e, self.now)).rowcount == 1

    def build(self, claim, missing_rung=False, decode_ok=True):
        j, e = claim
        bound = self.row('source_binding')['version']
        data = self.store.get('src', 'upload/u1', bound)
        assert crc(data) == tuple(json.loads(self.row('upload')['checksum']))
        prefix = f'outputs/{j}/{e}/'
        refs, playlists = [], []
        for rung in ('360p', '720p', '1080p')[:2 if missing_rung else 3]:
            init = self.store.put('out', prefix + rung + '/init.mp4', f'init {rung}'.encode())
            segs = [self.store.put('out', prefix + rung + f'/{i}.m4s',
                                   f'epoch {e} source {bound} rung {rung} segment {i}'.encode()) for i in range(2)]
            # Eight-second toy payload, two four-second segments per rung.
            body = '#EXTM3U\n#EXT-X-MAP:URI="' + init.uri + '"\n'
            body += ''.join('#EXTINF:4,\n' + r.uri + '\n' for r in segs) + '#EXT-X-ENDLIST\n'
            playlist = self.store.put('out', prefix + rung + '/index.m3u8', body.encode())
            refs += [init, *segs, playlist]
            playlists.append(playlist)
        master = '#EXTM3U\n' + ''.join('#EXT-X-STREAM-INF:BANDWIDTH=1\n' + p.uri + '\n' for p in playlists)
        root = self.store.put('out', prefix + 'master.m3u8', master.encode(), lose_reply=True)
        return {'j': j, 'epoch': e, 'root': root, 'refs': set(refs + [root]), 'decode_ok': decode_ok}

    def validate(self, bundle):
        prefix = f'outputs/{bundle["j"]}/{bundle["epoch"]}/'
        seen = set()
        durations = []

        def walk(ref):
            assert ref.bucket == 'out' and ref.key.startswith(prefix)
            raw = self.store.get(ref.bucket, ref.key, ref.version)
            assert len(raw) == ref.size and sha256(raw).hexdigest() == ref.digest
            if ref in seen:
                return
            seen.add(ref)
            if ref.key.endswith('.m3u8'):
                body = raw.decode()
                urls = re.findall(r'URI="([^"]+)"', body)
                urls += [line for line in body.splitlines() if line and not line.startswith('#')]
                if '#EXTINF:' in body:
                    durations.append(sum(F(x) for x in re.findall(r'#EXTINF:([^,]+),', body)))
                for uri in urls:
                    walk(self.store.from_uri(uri))

        walk(bundle['root'])
        assert seen == bundle['refs'], 'actual manifest closure differs from inventory'
        rungs = {r.key.split('/')[-2] for r in seen if r.key.endswith('/index.m3u8')}
        assert rungs == {'360p', '720p', '1080p'}, 'required rung set'
        assert durations == [F(8)] * 3
        assert bundle['decode_ok'], 'injected decoder rejection'
        return seen

    def publish(self, bundle, between=None, fail=False):
        self.validate(bundle)
        if between:
            between()
        j, e = bundle['j'], bundle['epoch']
        with self.tx():
            v, r = self.row('video'), self.row('job', 'WHERE j=?', (j,))
            b = self.row('build', 'WHERE j=? AND epoch=?', (j, e))
            if r['state'] == 'DONE':
                return 'ALREADY_DONE'
            assert v['target'] == j and not v['removed']
            assert r['state'] == 'RUNNING' and r['epoch'] == e and r['lease'] > self.now
            assert b['state'] == 'BUILDING'
            self.db.execute("UPDATE build SET state='PUBLISHED',root=?,inventory=?,hold_until=? WHERE j=? AND epoch=?",
                            (bundle['root'].uri, json.dumps([asdict(x) for x in bundle['refs']]), self.now + 86400, j, e))
            self.db.execute('UPDATE video SET ready=?', (f'{j}:{e}',))
            if fail:
                raise AssertionError('injected failure between ready and DONE')
            self.db.execute("UPDATE job SET state='DONE',result=? WHERE j=?", (f'{j}:{e}', j))
        return 'PUBLISHED'

    def failure(self, claim, permanent=False):
        j, e = claim
        with self.tx():
            r = self.row('job', 'WHERE j=?', (j,))
            if r['state'] != 'RUNNING' or r['epoch'] != e:
                return False
            state = 'FAILED' if permanent or r['attempts'] >= 3 else 'RETRY_WAIT'
            self.db.execute('UPDATE job SET state=?,next_at=? WHERE j=?', (state, self.now + 10, j))
            return True

    def repair(self):
        return [r['j'] for r in self.db.execute('''SELECT * FROM job WHERE
          (state IN ('QUEUED','RETRY_WAIT') AND next_at<=?) OR (state='RUNNING' AND lease<=?)''',
                                              (self.now, self.now))]

    def gc_mark(self, claim):
        j, e = claim
        with self.tx():
            v, r = self.row('video'), self.row('job', 'WHERE j=?', (j,))
            b = self.row('build', 'WHERE j=? AND epoch=?', (j, e))
            assert v['ready'] != f'{j}:{e}'
            assert b['hold_until'] <= self.now and b['session_until'] <= self.now
            assert not (r['state'] == 'RUNNING' and r['epoch'] == e and r['lease'] > self.now)
            self.db.execute("UPDATE build SET state='DELETING' WHERE j=? AND epoch=?", (j, e))

    def grant(self, claim, viewer='alice', key='play-1', unknown_commit=False, fail=False, intent='v1/new', renew_key=None):
        # The protected Build gate, with candidate selection supplied by the test.
        # Production new-session selection is re-read under the Video lock.
        j, e = claim
        with self.tx():
            assert not self.row('video')['removed']
            prior = self.row('playback_grant', 'WHERE viewer=? AND request_key=?', (viewer, key))
            b = self.row('build', 'WHERE j=? AND epoch=?', (j, e))
            assert b['state'] == 'PUBLISHED'
            if prior:
                assert prior['intent'] == intent
                assert prior['j'] == j and prior['epoch'] == e
                assert prior['expires'] > self.now
            else:
                if renew_key is not None:
                    old = self.row('playback_grant', 'WHERE viewer=? AND request_key=?', (viewer, renew_key))
                    assert old is not None and old['expires'] > self.now
                    assert (old['j'], old['epoch']) == (j, e)
                expiry, protected = self.now + 300, self.now + 300 + 30 + 120 + 60
                self.db.execute('INSERT INTO playback_grant VALUES(?,?,?,?,?,?,?,?)',
                                (viewer, key, intent, j, e, b['root'], expiry, protected))
                self.db.execute('UPDATE build SET session_until=max(session_until,?) WHERE j=? AND epoch=?',
                                (protected, j, e))
                if fail:
                    raise AssertionError('injected grant transaction failure')
        if unknown_commit:
            return 'UNKNOWN_NO_CAPABILITY'
        return self.sign_grant(viewer, key, intent)

    def sign_grant(self, viewer='alice', key='play-1', intent='v1/new'):
        g = self.row('playback_grant', 'WHERE viewer=? AND request_key=?', (viewer, key))
        assert g is not None and g['intent'] == intent and g['expires'] > self.now
        return (g['root'], g['expires'])


def fresh():
    m = Model()
    m.complete()
    return m


m = Model()
rejects('wrong owner cannot complete or recover a receipt', lambda: m.complete('bob'))
rejects('source and durable job roll back together', lambda: m.complete(fail=True))
check('failed completion leaves no source binding or job', m.row('job') is None and m.row('source_binding') is None)
m.complete()
check('normal completion co-commits source and queued job', m.row('upload')['state'] == 'UPLOADED' and m.row('job')['state'] == 'QUEUED')
check('lost completion reply recovers the same binding', m.complete() == m.source.version)
rejects('primary key rejects a duplicate logical job', lambda: m.db.execute("INSERT INTO job VALUES('v1_s1_r1','QUEUED',0,0,0,0,NULL)"))
new_source = m.store.put('src', 'upload/u1', b'replayed upload bytes', conditional=False)
rejects('replayed PUT cannot rebind completed upload', lambda: m.complete(version=new_source.version))
check('exact source GET remains original after current-key rewrite', m.store.get('src', 'upload/u1', m.source.version) == b'original source')
m2 = Model()
bad = m2.store.put('src', 'upload/u1', b'wrong checksum!', conditional=False)
rejects('wrong size/checksum cannot create work', lambda: m2.complete(version=bad.version))
m2.db.execute("UPDATE upload SET checksum=?", (json.dumps(('SHA256', 'COMPOSITE', 'fake')),))
rejects('composite checksum cannot masquerade as full CRC32', lambda: m2.complete())
m2.db.execute("UPDATE upload SET checksum=?", (json.dumps(crc(b'original source')),))
m2.now = 101
rejects('expired upload cannot become bound', lambda: m2.complete())

m = fresh()
check('scanner finds queued work even without a queue event', m.repair() == ['v1_s1_r1'])
c1 = m.claim()
check('duplicate live wake does not start another execution', m.claim() == 'NO_CLAIM')
b1 = m.build(c1)
check('normal manifest closure has 13 exact physical objects', len(m.validate(b1)) == 13)
check('normal publication commits ready, inventory and DONE', m.publish(b1) == 'PUBLISHED' and m.row('job')['state'] == 'DONE' and m.row('video')['ready'] == f'{c1[0]}:1')
check('lost ACK/commit reply replays as terminal work', m.claim() == 'TERMINAL' and m.publish(b1) == 'ALREADY_DONE')
rejects('live ready reference prevents GC', lambda: m.gc_mark(c1))
root = b1['root']
m.store.put('out', root.key, b'new current version outside writer policy', conditional=False)
check('published physical manifest survives later current-key overwrite', m.store.get('out', root.key, root.version).startswith(b'#EXTM3U'))
rejects('create-only writer refuses non-equivalent existing bytes', lambda: m.store.put('out', root.key, b'different output'))
check('versionId URL encoding survives opaque plus and slash', m.store.from_uri(root.uri) == root)
rejects('child URI without its own versionId is rejected', lambda: m.store.from_uri(root.uri.split('?')[0]))
rejects('unapproved manifest host is rejected', lambda: m.store.from_uri(root.uri.replace('media.example', 'attacker.example')))

m = fresh()
c1 = m.claim()
b1 = m.build(c1)
bad_inventory = dict(b1, refs=set(list(b1['refs'])[1:]))
rejects('manifest closure mismatch cannot publish', lambda: m.publish(bad_inventory))
short = fresh()
short_claim = short.claim()
short_bundle = short.build(short_claim, missing_rung=True)
try:
    short.publish(short_bundle)
except AssertionError as error:
    check('required rung omission fails the rung gate after valid closure', str(error) == 'required rung set')
else:
    raise AssertionError('missing rung was published')
rejects('decoder validation failure cannot publish', lambda: m.publish(dict(b1, decode_ok=False)))
rejects('ready update rolls back when DONE update fails', lambda: m.publish(b1, fail=True))
check('transaction failure leaves pointer absent and work recoverable', m.row('video')['ready'] is None and m.row('job')['state'] == 'RUNNING')
check('same validated bundle can recover a rolled-back publish', m.publish(b1) == 'PUBLISHED')

m = fresh()
c1 = m.claim()
b1 = m.build(c1)
m.now = 120
check('expired RUNNING is found by repair', m.repair() == ['v1_s1_r1'])
check('an expired lease cannot renew itself', not m.renew(c1))
rejects('expired claim cannot publish before a successor exists', lambda: m.publish(b1))
c2 = m.claim()
b2 = m.build(c2)
check('successor uses a larger epoch and disjoint output keys', c2[1] == 2 and not ({r.key for r in b1['refs']} & {r.key for r in b2['refs']}))
check('old heartbeat cannot renew successor lease', not m.renew(c1))
check('old failure handler cannot overwrite successor', not m.failure(c1))
rejects('old validated attempt cannot publish over live successor', lambda: m.publish(b1))
check('successor can publish', m.publish(b2) == 'PUBLISHED')
check('late completed replay cannot restore old epoch pointer', m.publish(b1) == 'ALREADY_DONE' and m.row('video')['ready'].endswith(':2'))

m = fresh()
c1 = m.claim()
b1 = m.build(c1)
rejects('live claim protects build against GC', lambda: m.gc_mark(c1))
m.now = 120
rejects('GC winning after verification blocks publication', lambda: m.publish(b1, between=lambda: m.gc_mark(c1)))
check('GC mark is durable and pointer stays absent', m.row('build')['state'] == 'DELETING' and m.row('video')['ready'] is None)

m = fresh()
c1 = m.claim()
b1 = m.build(c1)
rejects('new target rejects a late old-recipe publish', lambda: m.publish(b1, between=lambda: m.db.execute("UPDATE video SET target='v1_s1_r2'")))
check('superseded job is retired rather than re-claimed', m.claim() == 'TERMINAL' and m.row('job')['state'] == 'OBSOLETE')
m = fresh()
c1 = m.claim()
b1 = m.build(c1)
rejects('removal prevents an already-encoded result from publishing', lambda: m.publish(b1, between=lambda: m.db.execute('UPDATE video SET removed=1')))

m = fresh()
for i in range(3):
    c = m.claim()
    m.failure(c)
    m.now += 10
check('three claims exhaust budget without reviving terminal state', m.row('job')['state'] == 'FAILED' and m.claim() == 'TERMINAL' and m.repair() == [])
m = fresh()
c = m.claim()
m.failure(c, permanent=True)
check('deterministic corrupt input terminates before budget exhaustion', m.row('job')['attempts'] == 1 and m.claim() == 'TERMINAL')

m = fresh()
c = m.claim()
b = m.build(c)
m.publish(b)
m.db.execute("UPDATE video SET ready='newer-generation'")
m.now = 100
rejects('old publication retains its minimum 24-hour protection', lambda: m.gc_mark(c))
m.now = 86401
m.db.execute('UPDATE build SET session_until=90000')
rejects('valid old sessions extend retention beyond 24 hours', lambda: m.gc_mark(c))
m.now = 90001
m.gc_mark(c)
check('unreferenced old generation can retire after all bounds', m.row('build')['state'] == 'DELETING')

# Playback issuance/renewal is part of the same generation/GC contract.
m = fresh(); c = m.claim(); bundle = m.build(c); m.publish(bundle)
m.db.execute("UPDATE video SET ready='newer-generation'"); m.now = 86401
m.gc_mark(c)
rejects('GC-first rejects a stale ordinary-read root before signing', lambda: m.grant(c))
check('GC-first creates no grant or capability', m.row('playback_grant') is None)
m = fresh(); c = m.claim(); bundle = m.build(c); m.publish(bundle)
m.db.execute("UPDATE video SET ready='newer-generation'"); m.now = 86401
first_cap = m.grant(c)
rejects('grant-first durable protection prevents old-generation GC', lambda: m.gc_mark(c))
m.now += 100
check('lost response replay keeps exact root and original absolute expiry', m.grant(c) == first_cap)
second_cap = m.grant(c, key='renew-1', intent='v1/renew-play-1', renew_key='play-1')
check('explicit renewal uses a new grant and extends protection atomically', second_cap[1] == m.now + 300 and second_cap[0] == first_cap[0])
m.now = first_cap[1] + 1
check('committed renewal replays after its old grant expired', m.grant(c, key='renew-1', intent='v1/renew-play-1', renew_key='play-1') == second_cap)
rejects('a new renewal cannot start from an already expired old grant', lambda: m.grant(c, key='late-renew', intent='late', renew_key='play-1'))
m.now = second_cap[1] + 1
rejects('signer cannot restart TTL after committed grant expires', lambda: m.sign_grant(key='renew-1', intent='v1/renew-play-1'))
rejects('read drain and clock/manifest tail still prevent GC after token expiry', lambda: m.gc_mark(c))
m.now = second_cap[1] + 211
m.gc_mark(c)
check('generation may retire only after the full grant tail drains', m.row('build')['state'] == 'DELETING')
m = fresh(); c = m.claim(); bundle = m.build(c); m.publish(bundle)
rejects('grant transaction abort issues no capability', lambda: m.grant(c, fail=True))
check('grant abort rolls back grant and retention extension together', m.row('playback_grant') is None and m.row('build')['session_until'] == 0)
check('unknown grant commit issues no capability before recovery', m.grant(c, unknown_commit=True) == 'UNKNOWN_NO_CAPABILITY')
stored = m.row('playback_grant')
check('fresh committed-grant lookup recovers fixed root and expiry', m.sign_grant() == (stored['root'], stored['expires']))
rejects('missing/unconfirmed grant cannot be signed', lambda: m.sign_grant(key='never-committed'))
rejects('unknown rolled-back grant A leaves its key free', lambda: m.grant(c, key='racing', intent='A', fail=True))
m.grant(c, key='racing', intent='B')
rejects('recovery cannot sign another intent that later won the same key', lambda: m.sign_grant(key='racing', intent='A'))
rejects('same playback key with a changed intent is rejected before signing', lambda: m.grant(c, key='racing', intent='A'))

# Independent exact-rational sizing, not values copied from the HTML.
uploads, views, seconds, segment = 500_000, 25_000_000, 600, 4
numbers = {
    'upload_qps': F(uploads, 86400),
    'upload_peak_gbps': F(uploads * 300_000_000 * 8 * 5, 86400 * 10**9),
    'play_start_peak': F(views * 5, 86400),
    'media_get_average': F(views * seconds, segment * 86400),
    'media_get_peak': F(views * seconds * 5, segment * 86400),
    'viewer_peak_gbps': F(views * 300_000_000 * 8 * 5, 86400 * 10**9),
    'viewers_average': F(views * seconds, 86400),
    'rung_total_MB': sum(F(r * seconds, 8) for r in [F(8, 10), F(2), F(4)]),
    'year_logical_PB': F(uploads * (300 + 510) * 365, 10**9),
    'workers_at_70_percent': F(uploads * 10 * 10, 1440 * 7),
    'edge_cost_per_day': F(views * 3, 10) * F(1, 100),
    'av1_break_even_views': F(6) / (F(3, 10) * F(1, 4) * F(1, 100)),
    'next_low_buffer_seconds': F(8) - F(8, 10) * 4 / F(1) + F(4),
}
numbers['origin_peak_at_95_percent_gbps'] = numbers['viewer_peak_gbps'] / 20
numbers['required_hit_fraction'] = 1 - F(100) / numbers['viewer_peak_gbps']
check('upload peak recomputes to 69.4444 Gb/s', numbers['upload_peak_gbps'] == F(625, 9))
check('media peak recomputes independently', round(numbers['media_get_peak']) == 217014)
check('viewer peak recomputes to 3472.2222 Gb/s', numbers['viewer_peak_gbps'] == F(31250, 9))
check('95-percent byte hits exceed the origin cap', numbers['origin_peak_at_95_percent_gbps'] == F(3125, 18) > 100)
check('required hit threshold is exactly 97.12 percent', numbers['required_hit_fraction'] == F(607, 625))
check('retained logical bytes recompute to 147.825 PB', numbers['year_logical_PB'] == F(5913, 40))
check('total rung bytes recompute to 510 MB', numbers['rung_total_MB'] == 510)
check('70-percent worker budget rounds upward to 4961', math.ceil(numbers['workers_at_70_percent']) == 4961)
check('edge cost recomputes to 75000 per day', numbers['edge_cost_per_day'] == 75000)
check('AV1 break-even recomputes to 8000 eligible views', numbers['av1_break_even_views'] == 8000)
check('weak-link next-segment buffer is 8.8 seconds', numbers['next_low_buffer_seconds'] == F(44, 5))
result = {'passed': True, 'checks': checks, 'count': len(checks),
          'numbers': {k: {'exact': str(v), 'decimal': float(v)} for k, v in numbers.items()},
          'limits': ['SQLite serial transaction model, not PostgreSQL row-lock execution',
                     'In-memory object versions, not S3 policy/condition integration',
                     'Two-segment eight-second toy media; decoder outcome injected, no real codec',
                     'No load, process crash, broker/CDN, replication or network partition experiment']}
out = ROOT / 'docs/reviews/ch14-code-results.json'
out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'passed': True, 'checks': len(checks), 'result': str(out)}))
