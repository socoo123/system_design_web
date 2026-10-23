"""Independent Ch14 contract witnesses, written from the displayed guarantees.
SQLite is used for atomic metadata transitions, not as proof of PostgreSQL locks.
Object bytes and playlist closure are real local bytes, not a live S3/CDN test.
"""
from pathlib import Path
from fractions import Fraction as F
from hashlib import sha256
from urllib.parse import quote, urlsplit, parse_qs, unquote
from contextlib import contextmanager
import base64
import json
import math
import re
import sqlite3
import zlib

checks = []


def check(value, label):
    assert value, label
    checks.append(label)


def rejects(action, label):
    try:
        action()
    except (AssertionError, KeyError, sqlite3.IntegrityError):
        checks.append(label)
        return
    raise AssertionError('not rejected: ' + label)


def checksum(data, kind='FULL_OBJECT'):
    encoded = base64.b64encode(zlib.crc32(data).to_bytes(4, 'big')).decode()
    return ('CRC32', kind, encoded)


class Witness:
    def __init__(self):
        self.now = 10
        self.objects = {('source', 's-original'): b'fixed source'}
        self.current_source = 's-original'
        self.capabilities = []
        self.db = sqlite3.connect(':memory:', isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.db.executescript('''
          CREATE TABLE Video(id TEXT PRIMARY KEY, target TEXT, ready TEXT, removed INT);
          CREATE TABLE Upload(id TEXT PRIMARY KEY, owner TEXT, bound TEXT);
          CREATE TABLE SourceBinding(video TEXT, source INT, physical TEXT,
                                    PRIMARY KEY(video,source));
          CREATE TABLE Job(id TEXT PRIMARY KEY, state TEXT, epoch INT,
                           lease INT, attempts INT, result TEXT);
          CREATE TABLE Build(job TEXT, epoch INT, state TEXT, hold INT DEFAULT 0,
                             session_until INT DEFAULT 0, PRIMARY KEY(job,epoch));
          CREATE TABLE GrantReceipt(id TEXT PRIMARY KEY, epoch INT, expires INT,
                                    intent TEXT, protected INT);
          INSERT INTO Video VALUES ('v','v/s1/r1',NULL,0);
          INSERT INTO Upload VALUES ('u','alice',NULL);
        ''')

    @contextmanager
    def tx(self):
        self.db.execute('BEGIN IMMEDIATE')
        try:
            yield
            self.db.execute('COMMIT')
        except BaseException:
            self.db.execute('ROLLBACK')
            raise

    def row(self, table, condition='', args=()):
        return self.db.execute(f'SELECT * FROM {table} {condition}', args).fetchone()

    def complete(self, physical='s-original', owner='alice', expected_type='FULL_OBJECT', fail=False):
        u = self.row('Upload')
        assert u['owner'] == owner and physical not in ('null', None)
        if u['bound']:
            assert u['bound'] == physical
            return physical
        data = self.objects['source', physical]
        assert len(data) == len(b'fixed source')
        assert checksum(data, expected_type) == checksum(b'fixed source')
        with self.tx():
            assert not self.row('Video')['removed']
            self.db.execute('INSERT INTO SourceBinding VALUES (?,?,?)', ('v', 1, physical))
            self.db.execute('UPDATE Upload SET bound=?', (physical,))
            if fail:
                raise AssertionError('between source binding and durable Job')
            self.db.execute("INSERT INTO Job VALUES ('v/s1/r1','QUEUED',0,0,0,NULL)")
        return physical

    def claim(self):
        with self.tx():
            j = self.row('Job')
            assert j is not None
            if j['state'] in ('DONE', 'FAILED', 'OBSOLETE'):
                return None
            if j['state'] == 'RUNNING' and j['lease'] > self.now:
                return None
            assert self.row('Video')['target'] == j['id']
            epoch = j['epoch'] + 1
            self.db.execute("UPDATE Job SET state='RUNNING',epoch=?,lease=?,attempts=attempts+1",
                            (epoch, self.now + 120))
            self.db.execute("INSERT INTO Build(job,epoch,state) VALUES (?,?,'BUILDING')",
                            (j['id'], epoch))
            return epoch

    def make_bundle(self, epoch, corrupt_uri=False):
        prefix = f'outputs/v-s1-r1/{epoch}/'
        refs = {}

        def put(name, data):
            key, version = prefix + name, f'v+/{len(self.objects)}'
            assert (key, version) not in self.objects
            self.objects[key, version] = data
            refs[key, version] = (len(data), sha256(data).hexdigest())
            return 'https://media.example/' + quote(key, safe='/') + '?versionId=' + quote(version, safe='')

        uri = put('seg.m4s', f'encoded epoch {epoch}'.encode())
        if corrupt_uri:
            uri = uri.split('?')[0]
        leaf = put('leaf.m3u8', f'#EXTM3U\n#EXTINF:4,\n{uri}\n#EXT-X-ENDLIST\n'.encode())
        root = put('root.m3u8', f'#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\n{leaf}\n'.encode())
        return dict(epoch=epoch, root=root, refs=refs, prefix=prefix)

    def validate(self, bundle):
        visited = {}

        def walk(uri):
            url = urlsplit(uri)
            assert url.scheme == 'https' and url.netloc == 'media.example'
            key = unquote(url.path.lstrip('/'))
            assert '..' not in key.split('/') and key.startswith(bundle['prefix'])
            versions = parse_qs(url.query).get('versionId', [])
            assert len(versions) == 1 and versions[0] not in ('null', '')
            identity = key, versions[0]
            data = self.objects[identity]
            visited[identity] = len(data), sha256(data).hexdigest()
            if key.endswith('.m3u8'):
                text = data.decode()
                for line in text.splitlines():
                    if line and not line.startswith('#'):
                        walk(line)

        walk(bundle['root'])
        assert visited == bundle['refs']
        return visited

    def publish(self, bundle, before_commit=None, fail=False):
        self.validate(bundle)
        if before_commit:
            before_commit()
        with self.tx():
            v, j = self.row('Video'), self.row('Job')
            b = self.row('Build', 'WHERE epoch=?', (bundle['epoch'],))
            if j['state'] == 'DONE':
                return j['result']
            assert v['target'] == j['id'] and not v['removed']
            assert j['state'] == 'RUNNING' and j['epoch'] == bundle['epoch']
            assert j['lease'] > self.now and b['state'] == 'BUILDING'
            receipt = f'{j["id"]}/{bundle["epoch"]}'
            self.db.execute("UPDATE Build SET state='PUBLISHED',hold=? WHERE epoch=?",
                            (self.now + 86400, bundle['epoch']))
            self.db.execute('UPDATE Video SET ready=?', (receipt,))
            if fail:
                raise AssertionError('between ready and DONE')
            self.db.execute("UPDATE Job SET state='DONE',result=?", (receipt,))
        return receipt

    def gc_mark(self, epoch):
        with self.tx():
            v, j = self.row('Video'), self.row('Job')
            b = self.row('Build', 'WHERE epoch=?', (epoch,))
            assert v['ready'] != f'{j["id"]}/{epoch}'
            assert b['hold'] <= self.now and b['session_until'] <= self.now
            assert not (j['state'] == 'RUNNING' and j['epoch'] == epoch and j['lease'] > self.now)
            self.db.execute("UPDATE Build SET state='DELETING' WHERE epoch=?", (epoch,))

    def grant(self, epoch, key, *, renew_key=None, unknown_commit=False, fail_before_commit=False):
        # Same metadata authority/serialization boundary as publication and GC.
        intent = json.dumps(['alice', 'v', renew_key])
        with self.tx():
            assert not self.row('Video')['removed']
            receipt = self.row('GrantReceipt', 'WHERE id=?', (key,))
            if receipt is not None:
                assert receipt['intent'] == intent
                epoch = receipt['epoch']
            elif renew_key is not None:
                old = self.row('GrantReceipt', 'WHERE id=?', (renew_key,))
                assert old is not None and old['expires'] > self.now
                epoch = old['epoch']
            else:
                assert self.row('Video')['ready'] == f'{self.row("Job")["id"]}/{epoch}'
            b = self.row('Build', 'WHERE epoch=?', (epoch,))
            assert b['state'] == 'PUBLISHED'
            if receipt is None:
                expires = self.now + 300
                protected = expires + 5 + 20 + 60  # explicit skew/drain/manifest bounds
                self.db.execute('INSERT INTO GrantReceipt VALUES (?,?,?,?,?)',
                                (key, epoch, expires, intent, protected))
                self.db.execute('UPDATE Build SET session_until=max(session_until,?) WHERE epoch=?',
                                (protected, epoch))
                if fail_before_commit:
                    raise AssertionError('grant and retention update roll back together')
            else:
                assert receipt['epoch'] == epoch and receipt['expires'] > self.now
                expires = receipt['expires']
        if unknown_commit:
            raise TimeoutError('commit succeeded but reply was lost; no capability emitted')
        return self.recover_grant(key, intent)

    def recover_grant(self, key, intent):
        # A fresh primary read can observe a different winner after our rollback.
        receipt = self.row('GrantReceipt', 'WHERE id=?', (key,))
        assert receipt is not None and receipt['intent'] == intent
        assert receipt['expires'] > self.now
        capability = (receipt['epoch'], receipt['expires'])
        self.capabilities.append(capability)
        return capability


w = Witness()
rejects(lambda: w.complete(owner='bob'), 'wrong owner cannot bind source')
rejects(lambda: w.complete(physical='null'), 'null physical source identity rejected')
rejects(lambda: w.complete(expected_type='COMPOSITE'), 'CRC32 type mismatch is not wildcard equality')
w.objects['source', 'bad'] = b'other source'
rejects(lambda: w.complete(physical='bad'), 'same-length corrupt source checksum rejected')
rejects(lambda: w.complete(fail=True), 'injected source/job mid-transaction error rolls back')
check(w.row('SourceBinding') is None and w.row('Job') is None, 'binding rollback leaves no durable half-work')
w.complete()
w.objects['source', 's-new'] = b'replay new!!'
w.current_source = 's-new'
check(w.complete() == 's-original' and w.objects['source', w.row('Upload')['bound']] == b'fixed source',
      'lost complete reply recovers original exact bytes after current key moves')
rejects(lambda: w.complete('s-new'), 'replayed upload cannot replace an immutable binding')
epoch1 = w.claim()
check(w.claim() is None, 'duplicate wake ACK is safe while one durable live claim remains')
bundle1 = w.make_bundle(epoch1)
check(len(w.validate(bundle1)) == 3, 'actual root/leaf/media byte closure matches exact inventory')
bad_inventory = dict(bundle1, refs=dict(list(bundle1['refs'].items())[:-1]))
rejects(lambda: w.validate(bad_inventory), 'actual manifest reference omitted from inventory rejects publication')
rejects(lambda: w.validate(w.make_bundle(99, corrupt_uri=True)), 'parent version query cannot substitute missing child versionId')
foreign = dict(bundle1, root=bundle1['root'].replace('media.example', 'foreign.example'))
rejects(lambda: w.validate(foreign), 'unapproved reference host rejected')
rejects(lambda: w.publish(bundle1, fail=True), 'ready/DONE transaction rolls back as one unit')
check(w.row('Video')['ready'] is None and w.row('Job')['state'] == 'RUNNING', 'rollback does not expose an uncompleted build')
w.now += 120
check(w.row('Job')['lease'] <= w.now, 'lease expires without canceling old output bytes')
epoch2 = w.claim()
bundle2 = w.make_bundle(epoch2)
check(not (set(bundle1['refs']) & set(bundle2['refs'])), 'successor epoch uses disjoint physical identities')
rejects(lambda: w.publish(bundle1), 'expired old epoch cannot publish over successor')
published = w.publish(bundle2)
check(published.endswith('/2') and w.row('Job')['state'] == 'DONE', 'normal successor publishes ready and DONE')
w.db.execute("UPDATE Video SET target='v/s2/r2',ready='new-source-pointer'")
check(w.publish(bundle1) == published and w.row('Video')['ready'] == 'new-source-pointer',
      'old DONE confirms stored receipt and never restores a previous pointer')

for winner in ['gc', 'publish']:
    w = Witness(); w.complete(); e = w.claim(); bundle = w.make_bundle(e)
    if winner == 'gc':
        w.now += 120
        rejects(lambda: w.publish(bundle, before_commit=lambda: w.gc_mark(e)),
                'GC-first DELETING marker closes validate/publish race')
        check(w.row('Build')['state'] == 'DELETING' and w.row('Video')['ready'] is None,
              'GC-first leaves no live pointer to a retiring build')
    else:
        w.publish(bundle)
        rejects(lambda: w.gc_mark(e), 'publish-first ready reference blocks GC')
        w.db.execute("UPDATE Video SET ready='newer'")
        w.now += 86401
        w.db.execute('UPDATE Build SET session_until=?', (w.now + 1,))
        rejects(lambda: w.gc_mark(e), 'valid old session protects bytes after minimum retention')
        w.now += 2
        w.gc_mark(e)
        check(w.row('Build')['state'] == 'DELETING', 'unreferenced post-retention build may retire')

# Additional review finding: session admission must intersect the same GC fence.
for winner in ['gc', 'grant']:
    w = Witness(); w.complete(); e = w.claim(); bundle = w.make_bundle(e); w.publish(bundle)
    stale_read_epoch = e
    w.now += 86401
    if winner == 'gc':
        w.db.execute("UPDATE Video SET ready='newer'")
        w.gc_mark(e)
        rejects(lambda: w.grant(stale_read_epoch, 'play-1'),
                'GC-first blocks a delayed playback grant from a stale ready read')
        check(not w.capabilities and w.row('GrantReceipt') is None,
              'retiring build cannot produce a durable grant or signed capability')
    else:
        cap = w.grant(stale_read_epoch, 'play-1')
        w.db.execute("UPDATE Video SET ready='newer'")
        rejects(lambda: w.gc_mark(e), 'grant-first durable reference blocks GC after old ready moves')
        check(cap[1] + 85 == w.row('Build')['session_until'],
              'grant expiry plus skew/drain/manifest bounds and reference co-commit')
w = Witness(); w.complete(); e = w.claim(); bundle = w.make_bundle(e); w.publish(bundle)
try:
    w.grant(e, 'retryable-play', unknown_commit=True)
except TimeoutError:
    pass
check(not w.capabilities and w.row('GrantReceipt') is not None,
      'unknown grant commit does not issue an unconfirmed capability')
stored_expiry = w.row('GrantReceipt')['expires']
w.now += 5
check(w.grant(e, 'retryable-play')[1] == stored_expiry,
      'grant retry recovers fixed expiry without extending authorization')
w.now = stored_expiry + 1
rejects(lambda: w.grant(e, 'retryable-play'), 'expired fixed grant cannot be replayed into a new expiry')
w = Witness(); w.complete(); e = w.claim(); bundle = w.make_bundle(e); w.publish(bundle)
rejects(lambda: w.grant(e, 'failed-play', fail_before_commit=True),
        'grant/reference mid-transaction failure aborts before signing')
check(w.row('GrantReceipt') is None and w.row('Build')['session_until'] == 0 and not w.capabilities,
      'failed grant leaves no mismatched receipt/reference or emitted capability')
w.grant(e, 'old-a'); w.grant(e, 'old-b')
rejects(lambda: w.grant(e, 'shared', renew_key='old-a', fail_before_commit=True),
        'unknown request A can have rolled back before a same-key competing intent wins')
w.grant(e, 'shared', renew_key='old-b')
before_sign_count = len(w.capabilities)
rejects(lambda: w.recover_grant('shared', json.dumps(['alice', 'v', 'old-a'])),
        'fresh recovery rejects different-intent same-key winner before signing')
check(len(w.capabilities) == before_sign_count, 'wrong-intent recovery emits no capability')
w = Witness(); w.complete(); e = w.claim(); bundle = w.make_bundle(e); w.publish(bundle)
w.grant(e, 'original')
old_expiry = w.row('GrantReceipt')['expires']
w.now = old_expiry - 10
try:
    w.grant(e, 'renewal', renew_key='original', unknown_commit=True)
except TimeoutError:
    pass
renewal = w.row('GrantReceipt', 'WHERE id=?', ('renewal',))
w.now = old_expiry + 1
check(w.grant(e, 'renewal', renew_key='original')[1] == renewal['expires'],
      'committed renewal replays while old grant has expired but prior new grant remains valid')
# A separate near-retirement grant ensures the minimum 24-hour hold no longer dominates.
w = Witness(); w.complete(); e = w.claim(); bundle = w.make_bundle(e); w.publish(bundle)
w.now = 86412
late = w.grant(e, 'near-retirement')
late_record = w.row('GrantReceipt', 'WHERE id=?', ('near-retirement',))
w.db.execute("UPDATE Video SET ready='newer'")
w.now = late[1] + 1
rejects(lambda: w.gc_mark(e), 'token expiry still retains bounded in-flight reads and manifest reuse')
w.now = late_record['protected'] + 1
w.gc_mark(e)
check(w.row('Build')['state'] == 'DELETING', 'GC may retire only after the full stored protection upper bound')

numbers = {
    'upload_peak_Gbps': F(500000 * 300000000 * 8 * 5, 86400 * 10**9),
    'media_peak_QPS': F(25000000 * (600 // 4) * 5, 86400),
    'viewer_peak_Gbps': F(25000000 * 300000000 * 8 * 5, 86400 * 10**9),
    'year_total_PB': F(500000 * (300 + 60 + 150 + 300) * 365, 10**9),
    'workers': math.ceil(F(500000 * 10 * 10, 1440 * 7)),
    'AV1_views': F(6) / (F(3, 10) * F(1, 4) * F(1, 100)),
    'next_buffer': F(8) - F(8, 10) * 4 + 4,
    'cold_average_MB': F(8, 10) * 210 + F(2, 10) * 510,
}
numbers['required_hit'] = 1 - F(100) / numbers['viewer_peak_Gbps']
check(numbers['workers'] == 4961 and numbers['year_total_PB'] == F(5913, 40)
      and numbers['AV1_views'] == 8000 and numbers['next_buffer'] == F(44, 5)
      and numbers['required_hit'] == F(607, 625) and numbers['cold_average_MB'] == 270,
      'independent exact-rational sizing and ABR/ROI recomputation')
root = Path(__file__).resolve().parents[2]
result = dict(passed=True, count=len(checks), checks=checks,
              numbers={k: {'exact': str(v), 'decimal': float(v)} for k, v in numbers.items()},
              pageSha256=sha256((root / 'chapters/ch14.html').read_bytes()).hexdigest(),
              limits=['Independent SQLite serial contract witnesses, not PostgreSQL lock/failover tests',
                      'Real local CRC32/SHA256 and simple HLS closure, not S3/CDN/media decoder integration'])
(root / 'docs/reviews/ch14-independent-probe-results.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'passed': True, 'checks': len(checks), 'pageSha256': result['pageSha256']}))
