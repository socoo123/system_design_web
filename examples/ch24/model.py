"""SQLite teaching contract model, not a PSP integration or production ledger.
BEGIN IMMEDIATE serializes writers here; PostgreSQL requires the documented
row locks, UNIQUE constraints, restricted posting role, and failover policy.
"""
import hashlib
import json
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

HERE = Path(__file__).parent

class Conflict(Exception):
    pass

class Crash(Exception):
    pass

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()

def identity(prefix, *parts):
    return prefix + ':' + digest(parts)[:24]

@dataclass(frozen=True)
class VerifiedQuote:
    # Output of a trusted authenticated order/quote adapter, not client JSON.
    environment: str
    merchant_id: str
    order_ref: str
    authorized_business_version: int
    amount: int
    currency: str
    authorized_method: str

class Store:
    def __init__(self, file):
        self.db = sqlite3.connect(file, timeout=10, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA foreign_keys=ON')

    def install(self):
        self.db.executescript((HERE / 'schema.sql').read_text())
        self.db.executescript((HERE / 'keys.sql').read_text())

    def close(self):
        self.db.close()

    @contextmanager
    def tx(self):
        self.db.execute('BEGIN IMMEDIATE')
        try:
            yield
            self.db.commit()
        except BaseException:
            self.db.rollback()
            raise

    def one(self, query, args=()):
        return self.db.execute(query, args).fetchone()

    def count(self, table):
        assert table in {'payment', 'attempt', 'request_key', 'posting', 'entry', 'inbox', 'outbox', 'refund', 'review'}
        return self.one('SELECT count(*) n FROM ' + table)['n']

    def _outbox(self, event, kind, ref, payload):
        self.db.execute('INSERT INTO outbox VALUES (?,?,?,?)', (event, kind, ref, json.dumps(payload, sort_keys=True)))

    def _request(self, env, merchant, op, key):
        return self.one('SELECT * FROM request_key WHERE environment=? AND merchant_id=? AND operation=? AND request_key=?',
                        (env, merchant, op, key))

    def create_request(self, key, body, quote, *, merchant='m1', env='live',
                       channel='psp', account='acct1', crash=False):
        """Raw request boundary. `quote` is supplied by the trusted adapter."""
        if not isinstance(quote, VerifiedQuote) or (quote.environment, quote.merchant_id) != (env, merchant):
            raise Conflict('quote owner/environment')
        if (body.get('order'), body.get('businessVersion'), body.get('method')) != (
                quote.order_ref, quote.authorized_business_version, quote.authorized_method):
            raise Conflict('request does not match authorized quote')
        if type(body.get('businessVersion')) is not int:
            raise Conflict('invalid requested business version')
        return self.create(key, order=quote.order_ref, amount=quote.amount,
                           currency=quote.currency, merchant=quote.merchant_id,
                           env=quote.environment, version=quote.authorized_business_version,
                           method=quote.authorized_method, channel=channel, account=account, crash=crash)

    def create(self, key, order='o1', amount=10000, currency='CNY', merchant='m1', env='live', version=1,
               method='hosted', channel='psp', account='acct1', crash=False):
        # Internal teaching-fixture entry for ALREADY VERIFIED quote facts.
        # Raw browser/API input must pass create_request; never forward body.version here.
        if not key or type(amount) is not int or not 0 < amount <= 9223372036854775807:
            raise Conflict('invalid input')
        fingerprint = digest([order, amount, currency, version, method])
        with self.tx():
            old = self._request(env, merchant, 'CREATE', key)
            if old:
                if old['digest'] != fingerprint:
                    raise Conflict('request body changed')
                return old['result_ref']
            p = self.one('SELECT * FROM payment WHERE environment=? AND merchant_id=? AND order_ref=? AND business_version=?',
                         (env, merchant, order, version))
            if p:
                if p['digest'] != fingerprint:
                    raise Conflict('intent body changed')
                pay = p['pay_no']
            else:
                pay = identity('pay', env, merchant, order, version)
                self.db.execute('INSERT INTO payment(pay_no,environment,merchant_id,order_ref,business_version,digest,amount,currency,channel,account_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
                                (pay, env, merchant, order, version, fingerprint, amount, currency, channel, account))
                attempt = pay + ':a7'
                self.db.execute('INSERT INTO attempt(attempt_id,pay_no,environment,channel,account_id,channel_key,payload_hash,state) VALUES (?,?,?,?,?,?,?,?)',
                                (attempt, pay, env, channel, account, attempt, fingerprint, 'CREATED'))
                self._outbox('channel:' + attempt, 'CHANNEL_COMMAND', attempt, {'pay': pay, 'attempt': attempt})
            self.db.execute('INSERT INTO request_key VALUES (?,?,?,?,?,?)', (env, merchant, 'CREATE', key, fingerprint, pay))
            if crash:
                raise Crash('before acceptance commit')
        return pay

    def prepare_send(self, attempt, now, window=86400):
        with self.tx():
            a = self.one('SELECT * FROM attempt WHERE attempt_id=?', (attempt,))
            if a['state'] in ('CONFIRMED', 'DECLINED'):
                return None
            first = a['first_send_at'] if a['first_send_at'] is not None else now
            before = a['retry_before'] if a['retry_before'] is not None else first + window
            if now >= before:
                return None
            self.db.execute('UPDATE attempt SET first_send_at=?,retry_before=?,state=? WHERE attempt_id=?',
                            (first, before, 'SENT', attempt))
        return {'key': a['channel_key'], 'hash': a['payload_hash'], 'retry_before': before}

    def apply_non_success(self, attempt, final_no_charge=False):
        with self.tx():
            self.db.execute("UPDATE attempt SET state=? WHERE attempt_id=? AND state NOT IN ('CONFIRMED','DECLINED')",
                            ('DECLINED' if final_no_charge else 'UNKNOWN', attempt))

    def receive(self, event_id, raw, *, verified=True, env='live', channel='psp', account='acct1'):
        if not verified:
            raise Conflict('invalid signature/account fixture')
        with self.tx():
            old = self.one('SELECT * FROM inbox WHERE environment=? AND channel=? AND account_id=? AND event_id=?',
                           (env, channel, account, event_id))
            if old:
                if old['payload_hash'] != digest(raw):
                    self.db.execute('INSERT OR IGNORE INTO review VALUES (?,?)',
                                    (identity('receipt-mismatch', env, channel, account, event_id, raw), json.dumps(raw)))
            else:
                self.db.execute('INSERT INTO inbox(environment,channel,account_id,event_id,payload_hash,raw_body) VALUES (?,?,?,?,?,?)',
                                (env, channel, account, event_id, digest(raw), json.dumps(raw)))
        return '2xx'

    def evidence(self, pay, object_id='c9', amount=None, kind='CAPTURE'):
        p = self.one('SELECT * FROM payment WHERE pay_no=?', (pay,))
        return dict(verified=True, environment=p['environment'], channel=p['channel'], account_id=p['account_id'],
                    attempt_id=pay + ':a7', object_id=object_id, amount=p['amount'] if amount is None else amount,
                    currency=p['currency'], kind=kind)

    def _posting(self, p, e, operation, entries, crash=False):
        post = identity('post', e['environment'], e['channel'], e['account_id'], e['object_id'], e['kind'])
        self.db.execute('INSERT INTO posting VALUES (?,?,?,?,?,?,?,?,?,?)',
                        (post, p['pay_no'], e['environment'], e['channel'], e['account_id'], e['object_id'], operation, e['kind'], e['amount'], e['currency']))
        for seq, (account, side, amount, currency) in enumerate(entries):
            self.db.execute('INSERT INTO entry VALUES (?,?,?,?,?,?)', (post, seq, account, side, amount, currency))
            if crash and seq == 0:
                raise Crash('one journal entry inserted but not committed')
        rows = self.db.execute('SELECT * FROM entry WHERE posting_id=?', (post,)).fetchall()
        if len(rows) < 2 or any(r['currency'] != e['currency'] for r in rows):
            raise Conflict('incomplete/wrong-currency journal')
        balance = sum(r['amount'] if r['side'] == 'DR' else -r['amount'] for r in rows)
        if balance:
            raise Conflict('unbalanced journal')
        return post

    def post_capture(self, e, *, crash=False, credit_delta=0):
        if not e.get('verified') or e['kind'] != 'CAPTURE':
            raise Conflict('untrusted capture')
        with self.tx():
            a = self.one('SELECT * FROM attempt WHERE attempt_id=?', (e['attempt_id'],))
            if not a:
                raise Conflict('unbound attempt')
            p = self.one('SELECT * FROM payment WHERE pay_no=?', (a['pay_no'],))
            if (e['environment'], e['channel'], e['account_id'], e['amount'], e['currency']) != (
                    p['environment'], p['channel'], p['account_id'], p['amount'], p['currency']):
                raise Conflict('capture binding/amount/currency mismatch')
            old = self.one('SELECT * FROM posting WHERE environment=? AND channel=? AND account_id=? AND object_id=? AND kind=?',
                           (e['environment'], e['channel'], e['account_id'], e['object_id'], e['kind']))
            if old:
                if (old['pay_no'], old['operation_ref'], old['amount'], old['currency']) != (
                        p['pay_no'], a['attempt_id'], e['amount'], e['currency']):
                    raise Conflict('effect key reused with different binding')
                return old['posting_id']
            if p['captured']:
                raise Conflict('second distinct capture; retain external evidence in review')
            entries = [('PSP_RECEIVABLE', 'DR', e['amount'], e['currency']),
                       ('MERCHANT_PAYABLE', 'CR', e['amount'] + credit_delta, e['currency'])]
            j = self._posting(p, e, a['attempt_id'], entries, crash)
            self.db.execute('UPDATE payment SET captured=? WHERE pay_no=?', (e['amount'], p['pay_no']))
            self.db.execute('UPDATE attempt SET state=?,channel_object=? WHERE attempt_id=?', ('CONFIRMED', e['object_id'], a['attempt_id']))
            self._outbox('paid:' + p['pay_no'], 'PAYMENT_PAID', p['pay_no'], {'pay': p['pay_no'], 'journal': j})
        return j

    def reserve_refund(self, key, pay, amount, *, merchant='m1', env='live', currency='CNY'):
        if not key or type(amount) is not int or not 0 < amount <= 9223372036854775807:
            raise Conflict('invalid refund amount/key')
        fingerprint = digest([pay, amount, currency])
        with self.tx():
            p = self.one('SELECT * FROM payment WHERE pay_no=? AND environment=? AND merchant_id=?', (pay, env, merchant))
            if not p:
                raise Conflict('foreign payment')
            old = self._request(env, merchant, 'REFUND', key)
            if old:
                if old['digest'] != fingerprint:
                    raise Conflict('refund body changed')
                return old['result_ref']
            if currency != p['currency'] or amount > p['captured'] - p['refunded'] - p['reserved']:
                raise Conflict('refund capacity/currency')
            r = identity('refund', env, merchant, key)
            self.db.execute('INSERT INTO refund(refund_id,pay_no,amount,currency,state) VALUES (?,?,?,?,?)', (r, pay, amount, currency, 'RESERVED'))
            self.db.execute('UPDATE payment SET reserved=reserved+? WHERE pay_no=?', (amount, pay))
            self.db.execute('INSERT INTO request_key VALUES (?,?,?,?,?,?)', (env, merchant, 'REFUND', key, fingerprint, r))
            self._outbox('refund-command:' + r, 'REFUND_COMMAND', r, {'refund': r, 'pay': pay})
        return r

    def refund_result(self, refund, object_id, status='UNKNOWN', *, crash=False):
        # The fixture represents a bound, verified authoritative result.
        with self.tx():
            r = self.one('SELECT * FROM refund WHERE refund_id=?', (refund,))
            p = self.one('SELECT * FROM payment WHERE pay_no=?', (r['pay_no'],))
            if r['channel_object'] and r['channel_object'] != object_id:
                raise Conflict('refund object changed')
            if r['state'] in ('SUCCEEDED', 'FAILED'):
                if status not in ('UNKNOWN', r['state']):
                    self.db.execute('INSERT OR IGNORE INTO review VALUES (?,?)', (identity('contradictory-refund', refund, status), status))
                return
            if status == 'SUCCEEDED':
                e = dict(environment=p['environment'], channel=p['channel'], account_id=p['account_id'],
                         object_id=object_id, kind='REFUND', amount=r['amount'], currency=r['currency'])
                entries = [('MERCHANT_PAYABLE', 'DR', r['amount'], r['currency']), ('PSP_RECEIVABLE', 'CR', r['amount'], r['currency'])]
                j = self._posting(p, e, refund, entries, crash)
                self.db.execute('UPDATE payment SET reserved=reserved-?,refunded=refunded+? WHERE pay_no=?', (r['amount'], r['amount'], p['pay_no']))
                self._outbox('refunded:' + refund, 'REFUND_SUCCEEDED', refund, {'refund': refund, 'journal': j})
            elif status == 'FAILED':
                self.db.execute('UPDATE payment SET reserved=reserved-? WHERE pay_no=?', (r['amount'], p['pay_no']))
            elif status != 'UNKNOWN':
                raise Conflict('unknown fixture status')
            self.db.execute('UPDATE refund SET state=?,channel_object=? WHERE refund_id=?', (status, object_id, refund))

    def reconcile_capture(self, case_key, evidence, crash_after_post=False):
        with self.tx():
            self.db.execute('INSERT OR IGNORE INTO review VALUES (?,?)', (case_key, json.dumps(evidence, sort_keys=True)))
        j = self.post_capture(evidence)
        if crash_after_post:
            raise Crash('after posting but before closing case')
        with self.tx():
            self.db.execute('DELETE FROM review WHERE case_key=?', (case_key,))
        return j

class ProviderFixture:
    """Assumes API-v1-style key caching within its contractual window.
    No transport, clock, or provider-fencing guarantee is tested here.
    """
    def __init__(self):
        self.cache = {}
        self.moves = 0

    def call(self, key, payload_hash, ambiguous=False):
        if key in self.cache:
            old_hash, response = self.cache[key]
            if old_hash != payload_hash:
                raise Conflict('provider same-key parameter mismatch')
            return response
        self.moves += 1
        response = 'AMBIGUOUS_500' if ambiguous else 'CAPTURED'
        self.cache[key] = (payload_hash, response)
        return response
