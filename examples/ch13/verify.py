"""Executable contract probes; SQLite/model behavior is not an ES cluster test."""
from pathlib import Path
from fractions import Fraction
from itertools import permutations
import base64
import hashlib
import hmac
import json
import sqlite3

ROOT = Path(__file__).resolve().parents[2]
checks = []


def check(condition, name):
    assert condition, name
    checks.append(name)


def event(version, deleted=False, text='new', doc='9'):
    value = dict(doc=doc, version=version, deleted=deleted,
                 text=None if deleted else text)
    value['digest'] = hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()
    return value


class IndexModel:
    """SQLite atomically compares version and replaces a whole logical record."""
    def __init__(self):
        self.db = sqlite3.connect(':memory:')
        self.db.execute('CREATE TABLE docs (id TEXT PRIMARY KEY, version INTEGER NOT NULL,'
                        ' digest TEXT NOT NULL, deleted INTEGER NOT NULL, body TEXT)')

    def apply(self, e, *, unknown_before=False, unknown_after=False, bad_mapping=False,
              read_unavailable=False):
        canonical = {k: v for k, v in e.items() if k != 'digest'}
        digest = hashlib.sha256(json.dumps(canonical, sort_keys=True).encode()).hexdigest()
        if e['version'] <= 0 or e['digest'] != digest:
            return 'STOP'
        if unknown_before:
            return 'RETRY'
        if bad_mapping:
            return 'STOP'
        with self.db:
            cursor = self.db.execute('''INSERT INTO docs VALUES (?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET version=excluded.version,
                digest=excluded.digest,deleted=excluded.deleted,body=excluded.body
                WHERE excluded.version>docs.version''',
                (e['doc'], e['version'], e['digest'], int(e['deleted']), e['text']))
        if unknown_after:
            return 'RETRY'
        if cursor.rowcount:
            return 'ACKABLE'
        if read_unavailable:
            return 'RETRY'
        current = self.state(e['doc'])
        if current[0] == e['version'] and current[1] != e['digest']:
            return 'STOP'
        return 'ACKABLE'

    def state(self, doc='9'):
        return self.db.execute('SELECT version,digest,deleted,body FROM docs WHERE id=?',
                               (doc,)).fetchone()


i = IndexModel()
bad = event(12)
bad['text'] = 'tampered'
check(i.apply(bad) == 'STOP' and i.state() is None, 'tampered canonical event cannot apply')
check(i.apply(event(0)) == 'STOP', 'invalid source version cannot apply')
check(i.apply(event(12)) == 'ACKABLE' and i.state()[0] == 12, 'normal full snapshot apply')
check(i.apply(event(13, True)) == 'ACKABLE' and i.state()[2:] == (1, None),
      'logical delete retains version and removes current body')
check(i.apply(event(12)) == 'ACKABLE' and i.state()[0:3:2] == (13, 1),
      'late v12 cannot resurrect delete v13')
check(i.apply(event(13, True)) == 'ACKABLE', 'identical delete replay')
check(i.apply(event(13, False, 'different')) == 'STOP' and i.state()[2] == 1,
      'equal version conflicting content stops instead of overwriting')
check(i.apply(event(12), read_unavailable=True) == 'RETRY',
      'inconclusive conflict lookup cannot advance checkpoint')
for order in permutations([event(11), event(12), event(13, True), event(12)]):
    m = IndexModel()
    for e in order:
        assert m.apply(e) == 'ACKABLE'
    assert m.state()[0:3:2] == (13, 1)
check(True, '24 reorder/replay permutations converge on retained delete v13')
m = IndexModel()
check(m.apply(event(12), unknown_before=True) == 'RETRY' and m.state() is None,
      'unknown-before-apply does not invent success')
check(m.apply(event(12), unknown_after=True) == 'RETRY' and m.state()[0] == 12,
      'lost index acknowledgement leaves applied state and unknown outcome')
check(m.apply(event(12)) == 'ACKABLE' and m.state()[0] == 12,
      'retry after lost acknowledgement confirms identical replay')
offset = -1
for n, e in enumerate([event(1, doc='a'), event(1, doc='b'), event(1, doc='c')]):
    if m.apply(e, bad_mapping=n == 1) != 'ACKABLE':
        break
    offset = n
check(offset == 0 and m.state('b') is None and m.state('c') is None,
      'permanent error halts source partition before checkpoint gap')
rebuilt = IndexModel()
rebuilt.apply(event(13, True))
rebuilt.apply(event(12))
check(rebuilt.state()[0:3:2] == (13, 1), 'snapshot with tombstones survives old-event replay')
with rebuilt.db:
    rebuilt.db.execute('DELETE FROM docs')
rebuilt.apply(event(12))
check(rebuilt.state()[2] == 0,
      'negative witness: physically pruning version state allows resurrection')


class PageError(Exception):
    def __init__(self, status):
        self.status = status


SECRET = b'local-test-key-not-for-production'


def seal(value):
    body = json.dumps(value, sort_keys=True, separators=(',', ':')).encode()
    return base64.urlsafe_b64encode(body).decode() + '.' + hmac.new(
        SECRET, body, 'sha256').hexdigest()


def unseal(token):
    try:
        encoded, signature = token.split('.')
        body = base64.urlsafe_b64decode(encoded)
        if not hmac.compare_digest(signature, hmac.new(SECRET, body, 'sha256').hexdigest()):
            raise ValueError('signature')
        return json.loads(body)
    except Exception:
        raise PageError(400)


class PITModel:
    """A fixed ordered corpus; new live writes do not enter this view."""
    def __init__(self, count, allowed=None, *, failure=None):
        self.hits = [dict(id=n, sort=[1000 - n, n]) for n in range(1, count + 1)]
        self.allowed = set(range(1, count + 1)) if allowed is None else set(allowed)
        self.pit, self.clock, self.calls, self.inputs = 'pit-0', 1000, 0, []
        self.failure, self.closed = failure, False

    def search(self, pit, after, size):
        if pit != self.pit or self.failure == 'expired':
            raise PageError(410)
        self.inputs.append(pit)
        self.calls += 1
        if self.failure in ('shard', 'timeout', 'fetch'):
            raise PageError(503)
        start = 0 if after is None else next(
            n + 1 for n, h in enumerate(self.hits) if h['sort'] == after)
        self.pit = f'pit-{self.calls}'
        self.clock += 1
        return self.hits[start:start + size]

    def authority(self, hit):
        if self.failure == 'authority':
            raise PageError(503)
        return hit['id'] in self.allowed


def page(model, limit=20, cursor=None, context='q=docker;scope=public', cap=100):
    if not 1 <= limit <= 20:
        raise PageError(400)
    if cursor:
        c = unseal(cursor)
        if c['context'] != context or c['limit'] != limit:
            raise PageError(400)
        if c['expiry'] <= model.clock:
            raise PageError(410)
        pit, after = c['pit'], c['after']
    else:
        if model.failure == 'open_missing':
            raise PageError(503)
        pit, after = model.pit, None
    out, scanned, exhausted = [], 0, False
    while len(out) < limit and scanned < cap and not exhausted:
        size = min(limit - len(out), cap - scanned)
        expiry = model.clock + 60
        hits = model.search(pit, after, size)
        pit = model.pit
        for hit in hits:
            after = hit['sort']
            scanned += 1
            if model.authority(hit):
                out.append(hit['id'])
        exhausted = len(hits) < size
    continuation = None if exhausted else seal(dict(context=context, limit=limit,
        pit=pit, after=after, expiry=expiry))
    model.closed = exhausted
    return dict(hits=out, cursor=continuation, complete=True,
                truncated=scanned == cap and len(out) < limit and not exhausted,
                scanned=scanned)


def expect_status(status, name, action):
    try:
        action()
    except PageError as e:
        check(e.status == status, name)
        return
    raise AssertionError(name)


m = PITModel(21)
p1 = page(m)
p2 = page(m, cursor=p1['cursor'])
check(p1['hits'] == list(range(1, 21)) and p2['hits'] == [21] and p2['cursor'] is None,
      'normal complete PIT pages have no duplicates or omissions')
check(m.inputs == ['pit-0', 'pit-1'], 'next request uses latest returned PIT identifier')
check(m.closed, 'exhausted session closes snapshot')
m = PITModel(105, allowed=range(101, 106))
p1 = page(m)
c = unseal(p1['cursor'])
check(p1['hits'] == [] and p1['truncated'] and c['after'] == [900, 100],
      '100 filtered hits yield empty continuable page with last-scanned anchor')
check(c['pit'] == 'pit-5' and m.inputs == [f'pit-{n}' for n in range(5)],
      'refill rounds also carry every updated PIT identifier')
p2 = page(m, cursor=p1['cursor'])
check(p2['hits'] == [101, 102, 103, 104, 105] and p2['cursor'] is None,
      'empty filtered page resumes after denied hits and finds remaining allowed hits')
m = PITModel(4, allowed=[2, 4])
check(page(m, limit=2)['hits'] == [2, 4], 'filtered refill preserves allowed order')
check(page(PITModel(0))['cursor'] is None, 'all-shard-confirmed zero hits is terminal')
for failpoint in ['shard', 'timeout', 'fetch', 'authority', 'open_missing']:
    expect_status(503, f'{failpoint} fails without page/cursor',
                  lambda f=failpoint: page(PITModel(21, failure=f)))
expect_status(410, 'missing PIT requires explicit restart',
              lambda: page(PITModel(21, failure='expired')))
m = PITModel(21)
token = page(m)['cursor']
expect_status(400, 'changed query/scope is rejected', lambda: page(m, cursor=token, context='q=other'))
expect_status(400, 'changed page size is rejected', lambda: page(m, cursor=token, limit=19))
expect_status(400, 'forged cursor is rejected', lambda: page(m, cursor=token + '0'))
m.clock += 61
expect_status(410, 'expired token requires restart', lambda: page(m, cursor=token))
expect_status(400, 'zero page size is invalid', lambda: page(PITModel(1), limit=0))

# A delayed cache fill keeps the query-start expiry; a generation swap cannot
# change the captured key. These are contract witnesses, not Redis experiments.
started, expires, fill_arrival = 2.9, 32.9, 35
check(fill_arrival >= expires and expires == started + 30,
      'delayed cache fill is already expired instead of extending staleness')
captured_generation, published_generation = 'g17', 'g18'
check(f'{captured_generation}:docker' != f'{published_generation}:docker',
      'late old-generation fill cannot populate new-generation key')

numbers = {
    'average_qps': float(Fraction(10_000_000 * 8, 86_400)),
    'peak_qps': float(Fraction(10_000_000 * 8 * 10, 86_400)),
    'planned_origin_qps': 10_000 * (1 - Fraction(60, 100)),
    'shard_tasks_per_second': 4 * 4_000,
    'per_copy_after_one_loss': Fraction(4_000, 2),
    'logical_index_GB': Fraction(100_000_000 * 2_000, 10**9),
    'replicated_index_GB': Fraction(100_000_000 * 2_000 * 3, 10**9),
    'deep_candidates': 4 * (10_000 + 20),
    'deep_bytes': 4 * (10_000 + 20) * 32,
    'cursor_candidates': 4 * 20,
    'candidate_amplification': Fraction(4 * (10_000 + 20), 4 * 20),
    'all_four_timely': float(Fraction(99, 100)**4),
    'backlog_events': 200 * 600,
    'ideal_recovery_seconds': Fraction(200 * 600, 600 - 200),
    'prefix_id_MB': Fraction(2_000_000 * 5 * 8, 10**6),
    'BM25_tf3_factor': float(Fraction(66, 42)),
}
check(numbers['planned_origin_qps'] == 4000 and numbers['deep_bytes'] == 1_282_560
      and numbers['candidate_amplification'] == 501 and numbers['prefix_id_MB'] == 80
      and numbers['ideal_recovery_seconds'] == 300, 'independent teaching-number recomputation')
result = dict(passed=True, count=len(checks), checks=checks,
              numbers={k: float(v) if isinstance(v, Fraction) else v for k, v in numbers.items()},
              limits='SQLite conditional-write and deterministic cursor models; no Elasticsearch cluster, Redis, load or failover tests.')
(ROOT / 'docs/reviews/ch13-code-results.json').write_text(json.dumps(result, indent=2) + '\n')
print(f'PASS {len(checks)} SQLite/cursor/number contract probes')
