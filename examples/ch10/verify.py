"""Executable SQLite contract model, not PostgreSQL/network integration.

Run from repository root: python3 examples/ch10/verify.py
The model deliberately exposes the external acceptance / local commit gap.
"""
from pathlib import Path
from fractions import Fraction
import hashlib
import json
import math
import re
import sqlite3
import subprocess

ROOT = Path(__file__).resolve().parents[2]
checks = []


def check(name, condition, detail=None):
    assert condition, name
    checks.append({'name': name, 'passed': True, 'detail': detail})


class Store:
    def __init__(self):
        self.db = sqlite3.connect(':memory:', isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.db.executescript('''
          CREATE TABLE notification(id TEXT PRIMARY KEY, tenant TEXT, key TEXT,
            digest TEXT, receipt TEXT, UNIQUE(tenant,key));
          CREATE TABLE delivery(id TEXT PRIMARY KEY, notification_id TEXT,
            endpoint TEXT, status TEXT DEFAULT 'queued', epoch INTEGER DEFAULT 0,
            lease_until REAL DEFAULT 0, due REAL DEFAULT 0, expires REAL DEFAULT 300,
            sends INTEGER DEFAULT 0, max_sends INTEGER DEFAULT 4,
            uncertain INTEGER DEFAULT 0, unknown_retry INTEGER DEFAULT 1,
            wake_no INTEGER DEFAULT 0, last_woken REAL DEFAULT 0,
            UNIQUE(notification_id,endpoint));
          CREATE TABLE attempt(id TEXT PRIMARY KEY, delivery_id TEXT,
            epoch INTEGER, outcome TEXT);
          CREATE TABLE outbox(id INTEGER PRIMARY KEY, kind TEXT, aggregate_id TEXT,
            ready REAL, dedupe TEXT UNIQUE);
          CREATE TABLE device(id TEXT PRIMARY KEY, version INTEGER,
            registered REAL, status TEXT);
        ''')

    def row(self, delivery_id):
        row = self.db.execute('SELECT * FROM delivery WHERE id=?', (delivery_id,)).fetchone()
        return dict(row) if row else None

    def count(self, table):
        assert table in {'notification', 'delivery', 'attempt', 'outbox'}
        return self.db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]

    def accept(self, tenant='t', key='k', digest='body', endpoints=('a',), fail=False):
        # Unique-constraint failure is rolled back before a new winner lookup.
        proposed = f'n{self.count("notification") + 1}'
        self.db.execute('BEGIN IMMEDIATE')
        try:
            self.db.execute('INSERT INTO notification VALUES(?,?,?,?,?)',
                            (proposed, tenant, key, digest, f'202:{proposed}'))
            for endpoint in endpoints:
                did = proposed + ':' + endpoint
                self.db.execute('INSERT INTO delivery(id,notification_id,endpoint) VALUES(?,?,?)',
                                (did, proposed, endpoint))
                self.db.execute('INSERT INTO outbox(kind,aggregate_id,ready,dedupe) VALUES(?,?,?,?)',
                                ('ready', did, 0, 'initial:' + did))
            if fail:
                raise OSError('injected outbox/commit-before-confirmation failure')
            self.db.execute('COMMIT')
            return f'202:{proposed}'
        except sqlite3.IntegrityError:
            self.db.execute('ROLLBACK')
            row = self.db.execute('SELECT * FROM notification WHERE tenant=? AND key=?',
                                  (tenant, key)).fetchone()
            return row['receipt'] if row and row['digest'] == digest else '409'
        except OSError:
            self.db.execute('ROLLBACK')
            return '503'

    def claim(self, did, now):
        # SQLite serializes this model. PG SELECT FOR UPDATE is verified in docs.
        self.db.execute('BEGIN IMMEDIATE')
        d = self.row(did)
        eligible = d and ((d['status'] in ('queued', 'retry_wait') and d['due'] <= now)
                          or (d['status'] == 'leased' and d['lease_until'] <= now))
        if not eligible:
            self.db.execute('COMMIT')
            return None
        self.db.execute("UPDATE attempt SET outcome='timeout_unknown' "
                        "WHERE delivery_id=? AND outcome='started'", (did,))
        unknown = self.db.execute("SELECT 1 FROM attempt WHERE delivery_id=? "
                                  "AND outcome='timeout_unknown'", (did,)).fetchone()
        self.db.execute("UPDATE delivery SET status='leased',epoch=epoch+1,lease_until=?,"
                        "uncertain=uncertain OR ? WHERE id=?", (now + 30, bool(unknown), did))
        result = self.row(did)
        self.db.execute('COMMIT')
        return result

    def prepare(self, claim, now):
        self.db.execute('BEGIN IMMEDIATE')
        d = self.row(claim['id'])
        if (d['epoch'] != claim['epoch'] or d['status'] != 'leased'
                or d['lease_until'] <= now):
            self.db.execute('ROLLBACK')
            return None
        aid, decision = None, 'allow'
        if d['expires'] <= now:
            decision = 'expired'
        elif d['uncertain'] and not d['unknown_retry']:
            decision = 'unknown_stop'
        elif d['sends'] >= d['max_sends']:
            decision = 'exhausted'
        else:
            aid = f"{d['id']}:{d['epoch']}:{d['sends'] + 1}"
            self.db.execute('UPDATE delivery SET sends=sends+1 WHERE id=?', (d['id'],))
            self.db.execute('INSERT INTO attempt VALUES(?,?,?,?)',
                            (aid, d['id'], d['epoch'], 'started'))
        self.db.execute('COMMIT')
        return aid, decision

    def dispatch(self, claim, now, provider, gate='allow', allowed_at=None,
                 crash_after_send=False, fail_result=False):
        # Model the shared deliver fragment after claim; other gates are injected.
        decision = 'accepted' if 'accepted' in self.observations(claim['id']) else gate
        aid = None
        if decision == 'allow':
            prepared = self.prepare(claim, now)
            if prepared is None:  # lost ownership: neither a call nor an ACK
                return {'attempt': None, 'acked': False}
            aid, decision = prepared
            if aid is not None:
                decision = provider.send(aid)
                if crash_after_send:
                    return {'attempt': aid, 'acked': False}
        committed = self.finish(claim, aid, decision, now + 1,
                                allowed_at=allowed_at, fail=fail_result)
        return {'attempt': aid, 'acked': committed}

    def finish(self, claim, aid, outcome, now, provider_min=0, fail=False, allowed_at=None):
        self.db.execute('BEGIN IMMEDIATE')
        d = self.row(claim['id'])
        if aid:
            self.db.execute('UPDATE attempt SET outcome=? WHERE id=?', (outcome, aid))
        if d['epoch'] == claim['epoch'] and d['status'] == 'leased':
            d['uncertain'] |= outcome == 'timeout_unknown'
            state, due, reason = plan(d, outcome, now, provider_min, allowed_at=allowed_at)
            self.db.execute('UPDATE delivery SET status=?,due=?,uncertain=? WHERE id=?',
                            (state, due, d['uncertain'], d['id']))
            if state == 'retry_wait':
                self.db.execute('INSERT INTO outbox(kind,aggregate_id,ready,dedupe) VALUES(?,?,?,?)',
                                ('retry', d['id'], due, f"retry:{d['id']}:{d['epoch']}"))
            if reason == 'EXHAUSTED':
                self.db.execute('INSERT INTO outbox(kind,aggregate_id,ready,dedupe) VALUES(?,?,?,?)',
                                ('dlq', d['id'], now, f"dlq:{d['id']}:{d['epoch']}"))
        if fail:
            self.db.execute('ROLLBACK')
            return False
        self.db.execute('COMMIT')
        return True

    def observations(self, did):
        return [r[0] for r in self.db.execute('SELECT outcome FROM attempt WHERE delivery_id=?', (did,))]

    def repair(self, now):
        self.db.execute('BEGIN IMMEDIATE')
        for row in self.db.execute('SELECT * FROM delivery').fetchall():
            d = dict(row)
            eligible = ((d['status'] in ('queued', 'retry_wait') and d['due'] <= now)
                        or (d['status'] == 'leased' and d['lease_until'] <= now))
            if eligible and d['last_woken'] < now - 30:
                number = d['wake_no'] + 1
                self.db.execute('INSERT INTO outbox(kind,aggregate_id,ready,dedupe) VALUES(?,?,?,?)',
                                ('repair', d['id'], now, f"repair:{d['id']}:{number}"))
                self.db.execute('UPDATE delivery SET wake_no=?,last_woken=? WHERE id=?',
                                (number, now, d['id']))
        self.db.execute('COMMIT')


def plan(d, outcome, now, provider_min=0, jitter=0.5, provider=None, status=None,
         retry_after=None, quota_kind=None, allowed_at=None):
    if outcome == 'accepted':
        return 'provider_accepted', 0, None
    if outcome == 'suppressed':
        return 'suppressed', 0, None
    if now >= d['expires']:
        return 'expired', 0, None
    if outcome in ('permanent_reject', 'invalid_token', 'registration_recheck'):
        return 'failed', 0, None
    if outcome == 'unknown_stop' or (d['uncertain'] and not d['unknown_retry']):
        return 'failed', 0, 'UNKNOWN_STOP'
    if outcome == 'deferred':
        assert allowed_at is not None and allowed_at > now
        due = allowed_at
    else:
        if d['sends'] >= d['max_sends']:
            return 'failed', 0, 'EXHAUSTED'
        if provider == 'FCM' and outcome in ('temporary_reject', 'timeout_unknown'):
            provider_min = max(provider_min, now + 10)
            if status == 429:
                provider_min = max(provider_min, retry_after if retry_after is not None else now + 60)
                if quota_kind in ('overall', 'topic'):
                    provider_min = max(provider_min, now + 60)
        cap = min(60, 2 ** max(0, d['sends'] - 1))
        due = max(now + jitter * cap, provider_min, d['due'])
    return ('expired', 0, None) if due >= d['expires'] else ('retry_wait', due, None)


class Provider:
    """Injected acceptance, counted only after a committed attempt reservation."""
    def __init__(self):
        self.calls = []

    def send(self, attempt):
        self.calls.append(attempt)
        return 'accepted'


subprocess.run(['python3', str(Path(__file__).with_name('sync.py')), '--check'], check=True)
check('five shared HTML/source blocks match', True)
page = (ROOT / 'chapters/ch10.html').read_text()
baseline = (ROOT / 'docs/reviews/ch10-ch11-ch12-baseline/ch10.html').read_text()
ids = lambda s: re.findall(r'<title id="([^"]+)"', s)
check('all 31 original frame IDs and order retained', ids(page) == ids(baseline) and len(ids(page)) == 31)

average = Fraction(10_000_000 * 10 * 14, 10 * 86_400)
peak = average * 5
spare = 2000 - average
backlog = (peak - 2000) * 600
numbers = {
    'endpoint_average_s': float(average), 'endpoint_peak_s': float(peak),
    'campaign_exclusive_s': 14_000_000 / 2000,
    'campaign_shared_s': float(Fraction(14_000_000) / spare),
    'burst_backlog': float(backlog), 'burst_drain_s': float(backlog / spare),
    'raw_state_TB': 140_000_000 * 500 * 30 / 10 ** 12,
    'replicated_state_TB': 140_000_000 * 500 * 30 * 3 / 10 ** 12,
    'email_hours': 3_000_000 / 200 / 3600,
    'tail_probability': 1 - 0.99 ** 100,
}
check('independent endpoint/campaign/burst calculations',
      round(numbers['endpoint_peak_s']) == 8102
      and round(numbers['campaign_shared_s'] / 3600, 2) == 10.24
      and round(numbers['burst_drain_s'] / 3600, 2) == 2.68, numbers)
check('storage and pagination arithmetic', numbers['raw_state_TB'] == 2.1
      and numbers['replicated_state_TB'] == 6.3
      and 10_000_000 // 1000 == 10_000 and 2000 // 500 == 4)

s = Store()
check('normal accept commits intent, both endpoints and outbox',
      s.accept(endpoints=('a', 'b')) == '202:n1'
      and [s.count(t) for t in ('notification', 'delivery', 'outbox')] == [1, 2, 2])
check('same-key replay after lost response returns same receipt', s.accept() == '202:n1' and s.count('notification') == 1)
check('same key with changed content conflicts', s.accept(digest='other') == '409')
check('tenant-scoped keys permit a different tenant', s.accept(tenant='t2') == '202:n2')
t = Store()
check('injected transaction failure rolls back all three tables', t.accept(fail=True) == '503'
      and all(t.count(k) == 0 for k in ('notification', 'delivery', 'outbox')))
check('rollback followed by retry can create the intent', t.accept() == '202:n1')

# Two callers both read a miss, then the real unique constraint resolves insertion.
u = Store()
misses = [u.db.execute("SELECT id FROM notification WHERE tenant='t' AND key='k'").fetchone() for _ in range(2)]
first, second = u.accept(), u.accept()
check('two observed misses still create one intent through UNIQUE', misses == [None, None]
      and first == second == '202:n1' and u.count('outbox') == 1)

c = s.claim('n1:a', 0)
check('concurrent duplicate wake cannot claim a live lease', c['epoch'] == 1 and s.claim('n1:a', 1) is None)
aid, _ = s.prepare(c, 1)
check('normal send persists accepted before ACK', s.finish(c, aid, 'accepted', 2)
      and s.row('n1:a')['status'] == 'provider_accepted')
check('lost ACK replays terminal endpoint without another send', s.claim('n1:a', 3) is None
      and s.row('n1:a')['sends'] == 1)

v = Store(); v.accept(); vp = Provider()
c1 = v.claim('n1:a', 0)
first = v.dispatch(c1, 1, vp, crash_after_send=True)
a1 = first['attempt']
c2 = v.claim('n1:a', 31)
check('expired started attempt recovers as unknown, not failed delivery',
      c2['epoch'] == 2 and c2['uncertain'] == 1
      and not first['acked'] and vp.calls == [a1]
      and v.observations('n1:a') == ['timeout_unknown'])
second = v.dispatch(c2, 32, vp)
check('direct counterexample: allowed unknown retry can duplicate externally',
      len(vp.calls) == 2 and v.count('attempt') == 2 and second['acked']
      and v.row('n1:a')['sends'] == 2 and v.row('n1:a')['status'] == 'provider_accepted',
      {'delivery': v.row('n1:a'), 'attempts': v.count('attempt'), 'provider_calls': vp.calls})
before = v.row('n1:a')
v.finish(c1, a1, 'permanent_reject', 34)
check('old epoch records evidence without overwriting successor acceptance',
      v.row('n1:a') == before and 'permanent_reject' in v.observations('n1:a'))

w = Store(); w.accept(); wp = Provider()
# The policy is already disabled before the first external acceptance.
w.db.execute('UPDATE delivery SET unknown_retry=0 WHERE id=?', ('n1:a',))
c1 = w.claim('n1:a', 0)
first = w.dispatch(c1, 1, wp, crash_after_send=True)
a1 = first['attempt']
c2 = w.claim('n1:a', 31)
check('forbidden retry recovery retains the first unrecorded acceptance as unknown',
      first['acked'] is False and c2['uncertain'] == 1
      and wp.calls == [a1] and w.observations('n1:a') == ['timeout_unknown'])
before = w.row('n1:a')
stale = w.dispatch(c1, 32, wp)
check('stale epoch cannot reserve or stop its successor under the unknown policy',
      stale == {'attempt': None, 'acked': False} and w.row('n1:a') == before
      and w.count('attempt') == 1 and wp.calls == [a1])
failed_stop = w.dispatch(c2, 33, wp, fail_result=True)
check('unknown-stop result rollback leaves wake unacknowledged without a new call',
      failed_stop == {'attempt': None, 'acked': False} and w.row('n1:a') == before
      and w.count('attempt') == 1 and wp.calls == [a1] and w.count('outbox') == 1)
stopped = w.dispatch(c2, 34, wp)
check('forbidden unknown retry reserves no attempt/count/call and durably stops',
      stopped == {'attempt': None, 'acked': True}
      and w.row('n1:a')['status'] == 'failed' and w.row('n1:a')['uncertain'] == 1
      and w.row('n1:a')['sends'] == 1 and w.count('attempt') == 1
      and wp.calls == [a1] and w.count('outbox') == 1,
      {'before': before, 'after': w.row('n1:a'), 'attempts': w.count('attempt'),
       'provider_calls': wp.calls, 'dispatch': stopped})
w.finish(c1, a1, 'accepted', 36)
check('late accepted evidence remains visible after scheduling stopped',
      w.row('n1:a')['status'] == 'failed' and w.row('n1:a')['uncertain'] == 1
      and 'accepted' in w.observations('n1:a'))
w.repair(100)
check('late acceptance and repair do not reopen stopped unknown work',
      w.claim('n1:a', 100) is None and w.count('outbox') == 1)

deferred = Store(); deferred.accept(); dp = Provider()
dc = deferred.claim('n1:a', 0)
dr = deferred.dispatch(dc, 1, dp, gate='deferred', allowed_at=90)
check('ordinary gate deferral still commits a future wake without reserving a send',
      dr == {'attempt': None, 'acked': True} and deferred.row('n1:a')['status'] == 'retry_wait'
      and deferred.row('n1:a')['due'] == 90 and deferred.row('n1:a')['sends'] == 0
      and deferred.count('attempt') == 0 and not dp.calls and deferred.count('outbox') == 2)

# Exercise the non-ALLOW gate and evidence-priority paths after the same crash.
for gate in ('deferred', 'accepted', 'suppressed'):
    g = Store(); g.accept(); gp = Provider()
    g.db.execute('UPDATE delivery SET unknown_retry=0 WHERE id=?', ('n1:a',))
    gc1 = g.claim('n1:a', 0)
    ga1 = g.dispatch(gc1, 1, gp, crash_after_send=True)['attempt']
    gc2 = g.claim('n1:a', 31)
    if gate == 'accepted':
        g.finish(gc1, ga1, 'accepted', 32)  # stale evidence arrives before gates
    result = g.dispatch(gc2, 33, gp, gate='allow' if gate == 'accepted' else gate,
                        allowed_at=90)
    expected = {'deferred': 'failed', 'accepted': 'provider_accepted',
                'suppressed': 'suppressed'}[gate]
    check(f'{gate} gate preserves unknown-stop/evidence priority without sending',
          result == {'attempt': None, 'acked': True}
          and g.row('n1:a')['status'] == expected and g.row('n1:a')['uncertain'] == 1
          and g.row('n1:a')['sends'] == 1 and g.count('attempt') == 1
          and gp.calls == [ga1] and g.count('outbox') == 1)

for boundary in ('lease', 'expiry', 'max_sends'):
    b = Store(); b.accept(); bp = Provider()
    b.db.execute('UPDATE delivery SET uncertain=1,unknown_retry=? WHERE id=?',
                 (int(boundary == 'max_sends'), 'n1:a'))
    bc = b.claim('n1:a', 0)
    now = 30 if boundary == 'lease' else 1
    if boundary == 'expiry':
        b.db.execute('UPDATE delivery SET expires=1 WHERE id=?', ('n1:a',))
    if boundary == 'max_sends':
        b.db.execute('UPDATE delivery SET max_sends=0 WHERE id=?', ('n1:a',))
    result = b.dispatch(bc, now, bp)
    expected = {'lease': 'leased', 'expiry': 'expired', 'max_sends': 'failed'}[boundary]
    check(f'{boundary} still blocks reservation before any provider call',
          result == {'attempt': None, 'acked': boundary != 'lease'}
          and b.row('n1:a')['status'] == expected and b.row('n1:a')['uncertain'] == 1
          and b.row('n1:a')['sends'] == 0 and b.count('attempt') == 0 and not bp.calls
          and b.count('outbox') == (2 if boundary == 'max_sends' else 1))

x = Store(); x.accept(); c = x.claim('n1:a', 0); a, _ = x.prepare(c, 1)
outbox_before = x.count('outbox')
check('retry result transaction failure prevents ACK and rolls back state/outbox',
      not x.finish(c, a, 'timeout_unknown', 2, fail=True)
      and x.row('n1:a')['status'] == 'leased' and x.count('outbox') == outbox_before
      and x.observations('n1:a') == ['started'])
c = x.claim('n1:a', 31)
x.finish(c, None, 'timeout_unknown', 32, provider_min=90)
check('retry plan is durable and never earlier than provider bound',
      x.row('n1:a')['status'] == 'retry_wait' and x.row('n1:a')['due'] == 90)
check('early duplicate wake does not start a delayed retry', x.claim('n1:a', 89) is None)

d = x.row('n1:a')
check('60-second local cap never truncates a 900-second provider delay',
      plan(d, 'temporary_reject', 32, 932)[0] == 'expired')
check('retry exactly at business expiry is expired', plan(d, 'temporary_reject', 32, 300)[0] == 'expired')
fc = dict(d, expires=60, uncertain=0)
check('FCM one-minute minimum beyond OTP deadline expires',
      plan(fc, 'temporary_reject', 1, 61)[0] == 'expired')
fcm = dict(d, sends=1, uncertain=0, expires=300, due=0)
check('FCM 500 without Retry-After waits at least 10 seconds',
      plan(fcm, 'temporary_reject', 32, provider='FCM', status=500)[1] >= 42)
check('FCM retry minimum longer than remaining OTP life expires',
      plan(dict(fcm, expires=41), 'temporary_reject', 32, provider='FCM', status=500)[0] == 'expired')
check('FCM 429 without Retry-After retains its 60-second floor',
      plan(fcm, 'temporary_reject', 32, provider='FCM', status=429)[1] >= 92)
check('FCM Retry-After is never shortened by local backoff or 10-second floor',
      plan(fcm, 'temporary_reject', 32, provider='FCM', status=429, retry_after=150)[1] == 150)
check('business expiry retains unknown possibility',
      plan(dict(d, expires=32), 'timeout_unknown', 32)[0] == 'expired' and d['uncertain'] == 1)
check('four reserved SMS attempts exhaust without a fifth',
      plan(dict(d, sends=4), 'timeout_unknown', 32)[2] == 'EXHAUSTED')

y = Store(); y.accept(); y.repair(31)
check('lost published wake can be reconstructed from durable queued work',
      y.count('outbox') == 2 and y.row('n1:a')['wake_no'] == 1)
y.repair(32)
check('repair throttles repeated wakes without altering task state', y.count('outbox') == 2
      and y.row('n1:a')['status'] == 'queued')
c = y.claim('n1:a', 33); a, _ = y.prepare(c, 34); y.finish(c, a, 'accepted', 35)
y.repair(100)
check('repair never resets a terminal endpoint', y.row('n1:a')['status'] == 'provider_accepted'
      and y.count('outbox') == 2)

first_repair = Store(); first_repair.accept()
first_claim = first_repair.claim('n1:a', 0)  # original owner crashes, no repair has run
check('duplicate live-lease wake has no claim and may be ACKed',
      first_repair.claim('n1:a', 1) is None)
first_repair.repair(31)
check('first expired-lease repair works from acceptance-initialized last_woken',
      first_claim is not None and first_repair.count('outbox') == 2
      and first_repair.row('n1:a')['wake_no'] == 1)

z = Store(); z.accept(endpoints=('a', 'b'))
ca = z.claim('n1:a', 0); aa, _ = z.prepare(ca, 1); z.finish(ca, aa, 'accepted', 2)
cb = z.claim('n1:b', 0); ab, _ = z.prepare(cb, 1); z.finish(cb, ab, 'timeout_unknown', 2, 60)
check('partial endpoint acceptance retries only the unfinished endpoint',
      z.claim('n1:a', 61) is None and z.claim('n1:b', 61) is not None)

z.db.execute("INSERT INTO device VALUES('dev',6,110,'active')")
changed = z.db.execute("UPDATE device SET status='inactive' WHERE id='dev' AND version=?", (5,)).rowcount
check('late invalidation cannot retire a newer registration version', changed == 0)

def apns_invalid_applies(registered, invalidated, clock_error):
    return clock_error is not None and registered + clock_error <= invalidated

check('same-version APNs registration newer than invalidation is not retired',
      not apns_invalid_applies(110, 100, 2))
check('unbounded timestamp comparison requires registration recheck',
      not apns_invalid_applies(90, 100, None))
check('proven old APNs registration may be conditionally retired', apns_invalid_applies(90, 100, 2))

result = {'passed': True, 'checks': checks, 'count': len(checks),
          'pageSha256': hashlib.sha256(page.encode()).hexdigest(),
          'limits': ['SQLite/serialized contract model, not PostgreSQL row-lock concurrency',
                     'No provider, broker, load, failover, or clock-fault experiment',
                     'External duplicate and lost-reply traces are injected counterexamples']}
(ROOT / 'docs/reviews/ch10-code-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(f'PASS {len(checks)} source/inventory/arithmetic/transaction/ambiguity checks')
