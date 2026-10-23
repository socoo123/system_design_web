"""SQLite transaction contract model. No real PSP, row-lock or broker guarantee."""
from contextlib import contextmanager
from hashlib import sha256
import json
from pathlib import Path
import sqlite3
from uuid import uuid4


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'))


class Rejected(Exception):
    pass


class Model:
    def __init__(self, filename):
        self.filename = str(filename)

    def connect(self):
        conn = sqlite3.connect(self.filename, timeout=20, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA foreign_keys=ON')
        return conn

    def initialize(self):
        with self.connect() as conn:
            conn.executescript(Path(__file__).with_name('schema.sql').read_text())

    @contextmanager
    def transaction(self):
        conn = self.connect()
        # SQLite reserves the database writer, coarser than PostgreSQL FOR UPDATE.
        conn.execute('BEGIN IMMEDIATE')
        try:
            yield conn
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
        finally:
            conn.close()

    @staticmethod
    def require(ok, reason):
        if not ok:
            raise Rejected(reason)

    @staticmethod
    def event(conn, kind, action, payload):
        conn.execute('INSERT INTO outbox(event_id,kind,action_key,payload) VALUES(?,?,?,?)',
                     (str(uuid4()), kind, action, canonical(payload)))

    def seed(self, stock, quotes):
        with self.transaction() as conn:
            conn.executemany('INSERT INTO stock(sku_id,available) VALUES(?,?)', sorted(stock.items()))
            for q in quotes:
                conn.execute('INSERT INTO quotes VALUES(?,?,?,?,?,?)',
                             (q['id'], q['owner'], q['currency'], q['address'], canonical(q['items']), q['expires']))

    def checkout(self, owner, key, intent, now=100, fail_after=None):
        self.require(isinstance(owner, str) and bool(owner) and isinstance(key, str) and bool(key), 'identity')
        ordered = sorted(intent['items'])
        self.require(bool(ordered) and len({i[0] for i in ordered}) == len(ordered), 'cart')
        self.require(all(type(qty) is int and qty > 0 for _, qty in ordered), 'quantity')
        normalized = dict(intent, items=ordered)
        digest = sha256(canonical([owner, normalized]).encode()).hexdigest()
        with self.transaction() as conn:
            n = conn.execute('INSERT INTO requests(owner,request_key,digest) VALUES(?,?,?) '
                             'ON CONFLICT(owner,request_key) DO NOTHING', (owner, key, digest)).rowcount
            if not n:
                row = conn.execute('SELECT * FROM requests WHERE owner=? AND request_key=?', (owner, key)).fetchone()
                self.require(row['digest'] == digest, 'key_conflict')
                return json.loads(row['receipt'])
            q = conn.execute('SELECT * FROM quotes WHERE quote_id=?', (intent['quote_id'],)).fetchone()
            self.require(q is not None and q['owner'] == owner and q['expires_at'] > now, 'quote')
            prices = json.loads(q['items'])
            self.require(q['currency'] == intent['currency'] and q['address_version'] == intent['address_version']
                         and sorted(prices) == [sku for sku, _ in ordered], 'quote_binding')
            total = sum(prices[sku] * qty for sku, qty in ordered)
            self.require(0 < total <= 2**63-1, 'amount')
            oid = str(uuid4())
            conn.execute('INSERT INTO orders(order_id,owner,total,currency,status,expire_at) VALUES(?,?,?,?,?,?)',
                         (oid, owner, total, q['currency'], 'pending_pay', now+900))
            for index, (sku, qty) in enumerate(ordered):
                n = conn.execute('UPDATE stock SET available=available-?,reserved=reserved+? '
                                 'WHERE sku_id=? AND available>=?', (qty, qty, sku, qty)).rowcount
                self.require(n == 1, 'out_of_stock')
                conn.execute('INSERT INTO items VALUES(?,?,?,?)', (oid, sku, qty, prices[sku]))
                conn.execute('INSERT INTO reservations VALUES(?,?,?,?)', (oid, sku, qty, 'HELD'))
                if fail_after == index+1:
                    raise Rejected('injected_abort')
            self.event(conn, 'order_created', oid, {'order_id': oid, 'version': 1})
            receipt = {'http': 201, 'order_id': oid, 'status': 'pending_pay', 'total': total, 'currency': q['currency']}
            conn.execute('UPDATE requests SET receipt=? WHERE owner=? AND request_key=?', (canonical(receipt), owner, key))
            return receipt

    def finish_holds(self, conn, order, target, inject_failure=False):
        self.require(target in ('COMMITTED', 'RELEASED'), 'bad_target')
        holds = conn.execute('SELECT * FROM reservations WHERE order_id=? ORDER BY sku_id', (order['order_id'],)).fetchall()
        items = conn.execute('SELECT * FROM items WHERE order_id=? ORDER BY sku_id', (order['order_id'],)).fetchall()
        self.require(bool(holds) and [(h['sku_id'], h['qty']) for h in holds] ==
                     [(i['sku_id'], i['qty']) for i in items] and all(h['state'] == 'HELD' for h in holds), 'bad_holds')
        for index, h in enumerate(holds):
            if target == 'COMMITTED':
                n = conn.execute('UPDATE stock SET reserved=reserved-?,sold=sold+? WHERE sku_id=? AND reserved>=?',
                                 (h['qty'], h['qty'], h['sku_id'], h['qty'])).rowcount
            else:
                n = conn.execute('UPDATE stock SET reserved=reserved-?,available=available+? WHERE sku_id=? AND reserved>=?',
                                 (h['qty'], h['qty'], h['sku_id'], h['qty'])).rowcount
            self.require(n == 1, 'bad_aggregate')
            n = conn.execute('UPDATE reservations SET state=? WHERE order_id=? AND sku_id=? AND state=?',
                             (target, order['order_id'], h['sku_id'], 'HELD')).rowcount
            self.require(n == 1, 'hold_lost')
            if inject_failure and index == 0:
                raise Rejected('injected_abort')

    def close(self, oid, reason='expired', now=1001, owner=None, inject_failure=False):
        self.require(reason in ('expired', 'user_cancel'), 'bad_reason')
        with self.transaction() as conn:
            o = conn.execute('SELECT * FROM orders WHERE order_id=?', (oid,)).fetchone()
            self.require(o is not None, 'missing_order')
            if reason == 'user_cancel':
                self.require(o['owner'] == owner, 'owner')
            if o['status'] != 'pending_pay':
                return 'no_change'
            if reason == 'expired' and o['expire_at'] > now:
                return 'not_due'
            state = 'closed' if reason == 'expired' else 'cancelled'
            n = conn.execute('UPDATE orders SET status=?,version=version+1 WHERE order_id=? AND status=?',
                             (state, oid, 'pending_pay')).rowcount
            self.require(n == 1, 'transition_lost')
            self.finish_holds(conn, o, 'RELEASED', inject_failure)
            self.event(conn, 'order_closed', oid, {'order_id': oid, 'version': o['version']+1})
            return state

    def start_attempt(self, oid, owner, now=101):
        with self.transaction() as conn:
            o = conn.execute('SELECT * FROM orders WHERE order_id=?', (oid,)).fetchone()
            self.require(o is not None and o['owner'] == owner and o['status'] == 'pending_pay'
                         and o['expire_at'] > now, 'not_payable')
            a = conn.execute('SELECT * FROM attempts WHERE order_id=? ORDER BY number DESC LIMIT 1', (oid,)).fetchone()
            if a and a['state'] not in ('FAILED_NO_CAPTURE', 'CANCELLED_NO_CAPTURE'):
                return dict(a)
            aid = str(uuid4())
            conn.execute('INSERT INTO attempts VALUES(?,?,?,?,?,?,?,?,?,?,?)',
                         (aid, oid, a['number']+1 if a else 1, 'psp', 'merchant-A', 'test', str(uuid4()),
                          o['total'], o['currency'], 'PREPARED', None))
            return dict(conn.execute('SELECT * FROM attempts WHERE attempt_id=?', (aid,)).fetchone())

    def mark_unknown(self, aid):
        with self.transaction() as conn:
            return conn.execute('UPDATE attempts SET state=? WHERE attempt_id=? AND state IN (?,?)',
                                ('UNKNOWN', aid, 'PREPARED', 'IN_FLIGHT')).rowcount

    def terminal_no_capture(self, aid, verified_irreversible):
        self.require(verified_irreversible, 'not_canonical_terminal')
        with self.transaction() as conn:
            a = conn.execute('SELECT * FROM attempts WHERE attempt_id=?', (aid,)).fetchone()
            self.require(a is not None and a['state'] != 'CAPTURED', 'already_captured')
            conn.execute('UPDATE attempts SET state=? WHERE attempt_id=?', ('FAILED_NO_CAPTURE', aid))

    @staticmethod
    def evidence(attempt, capture_id, **changes):
        e = {'provider': attempt['provider'], 'account': attempt['account'], 'environment': attempt['environment'],
             'capture_id': capture_id, 'attempt_id': attempt['attempt_id'], 'provider_binding': attempt['provider_binding'] or 'object:'+attempt['attempt_id'],
             'owner': None, 'amount': attempt['amount'], 'currency': attempt['currency'], 'status': 'captured'}
        e.update(changes)
        return e

    def apply_capture(self, e, inject_failure=False):
        self.require(e['status'] == 'captured', 'not_captured')
        key = (e['provider'], e['account'], e['capture_id'])
        immutable = canonical(e)
        with self.transaction() as conn:
            old = conn.execute('SELECT * FROM captures WHERE provider=? AND account=? AND capture_id=?', key).fetchone()
            if old:
                self.require(old['immutable_fields'] == immutable, 'capture_identity_changed')
                return old['outcome']
            a = conn.execute('SELECT * FROM attempts WHERE attempt_id=? AND provider=? AND account=?',
                             (e['attempt_id'], e['provider'], e['account'])).fetchone()
            o = conn.execute('SELECT * FROM orders WHERE order_id=?', (a['order_id'],)).fetchone() if a else None
            conn.execute('INSERT INTO captures VALUES(?,?,?,?,?,?)', (*key, e['attempt_id'], immutable, 'UNDECIDED'))
            fields_match = a and o and e['environment'] == a['environment'] and e['amount'] == a['amount'] and \
                e['currency'] == a['currency'] and e['owner'] == o['owner']
            if fields_match and a['provider_binding'] is None:
                conn.execute('UPDATE attempts SET provider_binding=? WHERE attempt_id=? AND provider_binding IS NULL',
                             (e['provider_binding'], a['attempt_id']))
            binding = (a['provider_binding'] or e['provider_binding']) if a else None
            matches = fields_match and e['provider_binding'] == binding
            action = canonical(key)
            if not matches:
                outcome = 'REVIEW'
                conn.execute('INSERT INTO review_tasks VALUES(?,?,?,?,?)', (*key, immutable, 'READY'))
                self.event(conn, 'review', action, {'capture_key': key})
            elif o['status'] == 'pending_pay' and o['accepted_capture'] is None:
                n = conn.execute('UPDATE orders SET status=?,accepted_capture=?,version=version+1 '
                                 'WHERE order_id=? AND status=?', ('paid', action, o['order_id'], 'pending_pay')).rowcount
                self.require(n == 1, 'transition_lost')
                self.finish_holds(conn, o, 'COMMITTED', inject_failure)
                outcome = 'ACCEPTED'
                self.event(conn, 'fulfill', o['order_id'], {'order_id': o['order_id'], 'version': o['version']+1})
            else:
                outcome = 'REFUND_DUE'
                conn.execute('INSERT INTO refund_due VALUES(?,?,?,?,?,?)', (*key, e['amount'], e['currency'], 'READY'))
                self.event(conn, 'refund', action, {'capture_key': key, 'amount': e['amount'], 'currency': e['currency']})
            conn.execute('UPDATE captures SET outcome=? WHERE provider=? AND account=? AND capture_id=?', (outcome, *key))
            if a and (outcome != 'REVIEW' or a['state'] != 'CAPTURED'):
                conn.execute('UPDATE attempts SET state=? WHERE attempt_id=?',
                             ('OBSERVED_REVIEW' if outcome == 'REVIEW' else 'CAPTURED', a['attempt_id']))
            return outcome

    def receive_webhook(self, e, event_id, signature_valid=True):
        # Boundary simulation only. A real SDK must verify raw bytes + timestamp.
        self.require(signature_valid, 'invalid_signature')
        self.require(e['provider'] == 'psp' and e['account'] == 'merchant-A'
                     and e['environment'] == 'test' and e['status'] == 'captured', 'wrong_endpoint_scope')
        key = (e['provider'], e['account'], e['environment'], event_id)
        body = canonical(e)
        with self.transaction() as conn:
            n = conn.execute('INSERT INTO payment_inbox VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING', (*key, body, 'READY')).rowcount
            if not n:
                old = conn.execute('SELECT body FROM payment_inbox WHERE provider=? AND account=? AND environment=? AND event_id=?', key).fetchone()
                self.require(old['body'] == body, 'event_identity_changed')
        return key

    def process_webhook(self, key, crash_after_apply=False):
        with self.connect() as conn:
            row = conn.execute('SELECT * FROM payment_inbox WHERE provider=? AND account=? AND environment=? AND event_id=?', key).fetchone()
        self.require(row is not None, 'missing_inbox')
        if row['state'] == 'DONE':
            return 'already_done'
        result = self.apply_capture(json.loads(row['body']))
        if crash_after_apply:
            raise Rejected('worker_crash_after_capture')
        with self.transaction() as conn:
            conn.execute('UPDATE payment_inbox SET state=? WHERE provider=? AND account=? AND environment=? AND event_id=?', ('DONE', *key))
        return result

    def publish(self, broker, lose_ack=False):
        with self.connect() as conn:
            rows = conn.execute('SELECT * FROM outbox WHERE sent=0 ORDER BY rowid').fetchall()
        for row in rows:
            broker.append(dict(row))  # Mock broker acceptance. No real durability claim.
            if not lose_ack:
                with self.transaction() as conn:
                    conn.execute('UPDATE outbox SET sent=1 WHERE event_id=?', (row['event_id'],))
        return len(rows)

    def consume(self, event, crash_before_commit=False):
        self.require(event['kind'] == 'fulfill', 'wrong_kind')
        digest = sha256(event['payload'].encode()).hexdigest()
        with self.transaction() as conn:
            n = conn.execute('INSERT INTO consumer_inbox VALUES(?,?,?) ON CONFLICT DO NOTHING',
                             ('fulfillment', event['event_id'], digest)).rowcount
            if n:
                oid = json.loads(event['payload'])['order_id']
                conn.execute('INSERT INTO fulfillment_jobs VALUES(?,?,?) ON CONFLICT(order_id) DO NOTHING',
                             (oid, 'shipment:'+oid, 'READY'))
            else:
                old = conn.execute('SELECT digest FROM consumer_inbox WHERE consumer=? AND event_id=?',
                                   ('fulfillment', event['event_id'])).fetchone()
                self.require(old['digest'] == digest, 'event_identity_changed')
            if crash_before_commit:
                raise Rejected('consumer_abort')

    def scan(self, cutoff, fail_ids=(), before_close=None):
        cursor = (-1, '')
        seen = []
        while True:
            with self.connect() as conn:
                rows = conn.execute('SELECT expire_at,order_id FROM orders WHERE status=? AND expire_at<=? '
                                    'AND (expire_at,order_id)>(?,?) ORDER BY expire_at,order_id LIMIT 500',
                                    ('pending_pay', cutoff, *cursor)).fetchall()
            if not rows:
                break
            for row in rows:
                oid = row['order_id']
                seen.append(oid)
                if before_close:
                    before_close(oid)
                try:
                    if oid in fail_ids:
                        raise Rejected('injected_scan_failure')
                    self.close(oid, now=cutoff)
                except Rejected:
                    pass  # State remains due and next round starts at the beginning.
            cursor = (rows[-1]['expire_at'], rows[-1]['order_id'])
        return seen

    def rows(self, table):
        allowed = {'stock','quotes','orders','requests','items','reservations','attempts','captures','refund_due',
                   'review_tasks','outbox','payment_inbox','consumer_inbox','fulfillment_jobs'}
        self.require(table in allowed, 'table')
        with self.connect() as conn:
            return [dict(r) for r in conn.execute('SELECT * FROM '+table)]
