"""Run normal, concurrent and failure traces against the SQLite contract model."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Barrier
import json
import math
import sys

from model import Model, Rejected, canonical

results = []


def check(condition, label):
    if not condition:
        raise AssertionError(label)
    results.append(label)


def rejects(call, label):
    try:
        call()
    except Rejected as error:
        results.append(label+': '+str(error))
        return
    raise AssertionError(label)


with TemporaryDirectory(prefix='ch18-contract-') as temp:
    serial = 0

    def fixture(stock=None, items=None, owner='alice'):
        global serial
        serial += 1
        db = Model(Path(temp)/f'{serial}.sqlite')
        db.initialize()
        db.seed(stock or {'A': 10, 'B': 10},
                [{'id': 'q', 'owner': owner, 'currency': 'CNY', 'address': 'addr-v1',
                  'items': items or {'A': 100}, 'expires': 500}])
        intent = {'quote_id': 'q', 'currency': 'CNY', 'address_version': 'addr-v1',
                  'items': [(sku, 1) for sku in sorted(items or {'A': 100})]}
        return db, intent

    def paid_e(db, oid, capture='cap-1'):
        a = db.start_attempt(oid, 'alice')
        return a, db.evidence(a, capture, owner='alice')

    def counts(db, sku='A'):
        row = next(s for s in db.rows('stock') if s['sku_id'] == sku)
        return row['available'], row['reserved'], row['sold']

    db, intent = fixture()
    first = db.checkout('alice', 'same', intent)
    check(counts(db) == (9, 1, 0), 'normal checkout holds one unit')
    with ThreadPoolExecutor(max_workers=12) as pool:
        repeats = list(pool.map(lambda _: db.checkout('alice', 'same', intent, now=1000), range(24)))
    check(all(r == first for r in repeats) and len(db.rows('orders')) == 1,
          '24 concurrent lost-reply replays return same receipt after quote expires')
    check(len(db.rows('requests')) == 1 and len(db.rows('reservations')) == 1 and len(db.rows('outbox')) == 1,
          'same-key concurrency creates one request hold and event')
    rejects(lambda: db.checkout('alice', 'same', dict(intent, items=[('A', 2)])), 'same key changed quantity conflicts')
    rejects(lambda: db.checkout('bob', 'same', intent), 'quote ownership prevents another user adopting intent')
    with db.transaction() as conn:
        conn.execute('INSERT INTO quotes VALUES(?,?,?,?,?,?)', ('bobq', 'bob', 'CNY', 'addr-v1', '{"A":100}', 500))
    bob = db.checkout('bob', 'same', dict(intent, quote_id='bobq'))
    check(bob['order_id'] != first['order_id'], 'same string key in another user scope is a different request')

    for quantity in (0, -1, True, 1.5):
        rejects(lambda q=quantity: db.checkout('alice', str(q), dict(intent, items=[('A', q)])), 'invalid integer quantity rejected')
    rejects(lambda: db.checkout('alice', 'dupe', dict(intent, items=[('A', 1), ('A', 1)])), 'duplicate SKU rejected before canonicalization')
    rejects(lambda: db.checkout('alice', 'currency', dict(intent, currency='USD')), 'quote currency bound')
    rejects(lambda: db.checkout('alice', 'address', dict(intent, address_version='addr-v2')), 'quote address version bound')
    rejects(lambda: db.checkout('alice', 'expired', intent, now=500), 'new checkout rejects expired quote')

    db, basket = fixture(stock={'A': 10, 'B': 0}, items={'A': 100, 'B': 200})
    rejects(lambda: db.checkout('alice', 'short', basket), 'second SKU failure aborts basket')
    check(counts(db) == (10, 0, 0) and not db.rows('orders') and not db.rows('items')
          and not db.rows('requests') and not db.rows('reservations') and not db.rows('outbox'),
          'first SKU and all writes roll back on second shortage')
    db, basket = fixture(items={'A': 100, 'B': 200})
    rejects(lambda: db.checkout('alice', 'crash', basket, fail_after=1), 'injected checkout crash after first hold')
    check(counts(db) == (10, 0, 0) and not db.rows('requests') and not db.rows('outbox'), 'checkout exception rolls back identity and stock')
    retry = db.checkout('alice', 'crash', dict(basket, items=list(reversed(basket['items']))))
    check(retry['total'] == 300 and counts(db) == (9, 1, 0), 'whole-transaction retry and canonical basket order succeed')

    db, intent = fixture(stock={'A': 1})
    def race_create(i):
        try:
            return db.checkout('alice', 'buyer-'+str(i), intent)['order_id']
        except Rejected:
            return None
    with ThreadPoolExecutor(max_workers=12) as pool:
        created = list(pool.map(race_create, range(12)))
    check(sum(v is not None for v in created) == 1 and counts(db) == (0, 1, 0), '12 concurrent baskets compete for final stock unit')

    db, intent = fixture()
    one = db.checkout('alice', 'one', dict(intent, items=[('A', 3)]))['order_id']
    two = db.checkout('alice', 'two', dict(intent, items=[('A', 3)]))['order_id']
    check(db.close(one) == 'closed' and counts(db) == (7, 3, 0), 'closing returns only its own three units')
    check(db.close(one) == 'no_change' and counts(db) == (7, 3, 0), 'duplicate release cannot spend other order hold')
    unsafe_available, unsafe_reserved = 7, 3
    if unsafe_reserved >= 3:
        unsafe_available += 3; unsafe_reserved -= 3
    check((unsafe_available, unsafe_reserved) == (10, 0), 'negative example aggregate-only guard wrongly returns another hold')
    check(any(h['order_id'] == two and h['state'] == 'HELD' for h in db.rows('reservations')), 'other order still owns held stock')
    rejects(lambda: db.close(two, 'user_cancel', owner='bob'), 'cancel authenticates order owner')
    check(db.close(two, now=999) == 'not_due', 'early expiry cannot release')

    db, intent = fixture(items={'A': 100, 'B': 200})
    oid = db.checkout('alice', 'close-abort', intent)['order_id']
    rejects(lambda: db.close(oid, inject_failure=True), 'closing failure after first SKU')
    check(db.rows('orders')[0]['status'] == 'pending_pay' and all(h['state'] == 'HELD' for h in db.rows('reservations'))
          and counts(db) == (9, 1, 0) and len(db.rows('outbox')) == 1, 'close status holds counters and event roll back together')

    db, intent = fixture()
    oid = db.checkout('alice', 'pay', intent)['order_id']
    with ThreadPoolExecutor(max_workers=12) as pool:
        attempts = list(pool.map(lambda _: db.start_attempt(oid, 'alice'), range(24)))
    check(len({a['attempt_id'] for a in attempts}) == 1, '24 concurrent start-payment calls share one prepared attempt')
    a = attempts[0]
    check(a['provider_binding'] is None, 'provider object can be unknown after prepared commit')
    db.mark_unknown(a['attempt_id'])
    check(db.start_attempt(oid, 'alice')['attempt_id'] == a['attempt_id'], 'UNKNOWN explicitly blocks a new attempt')
    rejects(lambda: db.terminal_no_capture(a['attempt_id'], False), 'local timeout is not irreversible no-capture evidence')
    db.terminal_no_capture(a['attempt_id'], True)
    b = db.start_attempt(oid, 'alice')
    check(b['attempt_id'] != a['attempt_id'] and b['number'] == 2, 'confirmed no-capture terminal permits next numbered attempt')
    e = db.evidence(b, 'capture-b', owner='alice')
    check(db.apply_capture(e) == 'ACCEPTED' and counts(db) == (9, 0, 1), 'first queried capture recovers object binding and consumes own hold')
    bound = next(x for x in db.rows('attempts') if x['attempt_id'] == b['attempt_id'])
    check(bound['provider_binding'] == e['provider_binding'], 'object identity binds once on validated canonical fields')
    check(db.mark_unknown(b['attempt_id']) == 0 and next(x for x in db.rows('attempts') if x['attempt_id'] == b['attempt_id'])['state'] == 'CAPTURED',
          'late timeout cannot overwrite captured evidence')
    check(db.checkout('alice', 'pay', intent)['status'] == 'pending_pay', 'idempotent create receipt remains original after order becomes paid')
    check(db.close(oid) == 'no_change' and counts(db) == (9, 0, 1), 'payment first prevents expiry release')
    check(db.apply_capture(dict(e, capture_id='capture-b2')) == 'REFUND_DUE', 'second real capture creates its own refund obligation')
    check(len(db.rows('refund_due')) == 1 and len([x for x in db.rows('outbox') if x['kind'] == 'fulfill']) == 1,
          'one fulfillment and per-capture compensation')
    check(db.apply_capture(dict(e, capture_id='capture-b2')) == 'REFUND_DUE' and len(db.rows('refund_due')) == 1,
          'duplicate extra capture reuses existing unfinished refund')
    check(db.apply_capture(dict(e, capture_id='wrong-object', provider_binding='foreign-object')) == 'REVIEW', 'bound attempt rejects another provider object')
    rejects(lambda: db.apply_capture(dict(e, amount=e['amount']+1)), 'same capture with conflicting immutable amount cannot overwrite record')

    for changes, label in [({'amount': 99}, 'amount'), ({'currency': 'USD'}, 'currency'), ({'owner': 'bob'}, 'owner'),
                           ({'attempt_id': 'missing'}, 'missing local attempt')]:
        db, intent = fixture()
        oid = db.checkout('alice', 'review', intent)['order_id']
        a, e = paid_e(db, oid)
        check(db.apply_capture(dict(e, **changes)) == 'REVIEW', label+' mismatch persists review')
        check(db.rows('orders')[0]['status'] == 'pending_pay' and len(db.rows('review_tasks')) == 1
              and any(x['kind'] == 'review' for x in db.rows('outbox')), label+' never ships and retains durable responsibility')
        if label != 'missing local attempt':
            check(db.rows('attempts')[0]['state'] == 'OBSERVED_REVIEW' and db.start_attempt(oid, 'alice')['attempt_id'] == a['attempt_id'],
                  label+' review is not fulfillment permission or new-attempt permission')
        check(db.rows('attempts')[0]['provider_binding'] is None, label+' mismatch cannot bind unknown object')

    db, intent = fixture()
    oid = db.checkout('alice', 'late', intent)['order_id']
    a, e = paid_e(db, oid)
    db.mark_unknown(a['attempt_id']); db.close(oid)
    check(db.apply_capture(e) == 'REFUND_DUE' and counts(db) == (10, 0, 0), 'close first refunds late capture without reacquiring stock')
    check(db.rows('orders')[0]['status'] == 'closed' and db.rows('refund_due')[0]['state'] == 'READY', 'refund pending is not refunded success')
    rejects(lambda: db.start_attempt(oid, 'alice'), 'closed order blocks another payment attempt')

    race_outcomes = []
    for index in range(10):
        db, intent = fixture()
        oid = db.checkout('alice', 'race', intent)['order_id']
        _, e = paid_e(db, oid)
        start = Barrier(2)
        def run_payment():
            start.wait()
            return db.apply_capture(e)
        def run_close():
            start.wait()
            return db.close(oid)
        with ThreadPoolExecutor(max_workers=2) as pool:
            if index % 2:
                closing = pool.submit(run_close)
                payment = pool.submit(run_payment)
            else:
                payment = pool.submit(run_payment)
                closing = pool.submit(run_close)
            outcome, closed = payment.result(), closing.result()
        state = db.rows('orders')[0]['status']
        check((state == 'paid' and outcome == 'ACCEPTED' and counts(db) == (9, 0, 1)) or
              (state == 'closed' and outcome == 'REFUND_DUE' and counts(db) == (10, 0, 0)),
              f'actual concurrent capture/expiry race {index+1} has one complete outcome')
        race_outcomes.append([state, outcome, closed])

    db, intent = fixture(items={'A': 100, 'B': 200})
    oid = db.checkout('alice', 'capture-abort', intent)['order_id']
    a, e = paid_e(db, oid)
    rejects(lambda: db.apply_capture(e, inject_failure=True), 'capture transaction abort after first SKU')
    check(not db.rows('captures') and db.rows('orders')[0]['status'] == 'pending_pay' and counts(db) == (9, 1, 0)
          and all(h['state'] == 'HELD' for h in db.rows('reservations')), 'capture evidence order holds counters and events roll back on actual exception')
    check(db.apply_capture(e) == 'ACCEPTED', 'retained evidence retries entire capture transaction')

    db, intent = fixture()
    oid = db.checkout('alice', 'inbox', intent)['order_id']
    a, e = paid_e(db, oid)
    rejects(lambda: db.receive_webhook(e, 'bad-signature', False), 'invalid signature boundary rejects ingress')
    rejects(lambda: db.receive_webhook(dict(e, account='merchant-B'), 'wrong-account'), 'endpoint merchant scope checked')
    rejects(lambda: db.receive_webhook(dict(e, environment='live'), 'wrong-env'), 'endpoint environment checked')
    rejects(lambda: db.receive_webhook(dict(e, status='authorized'), 'authorized'), 'authorization cannot become captured evidence')
    check(not db.rows('payment_inbox'), 'rejected ingress creates no accepted inbox')
    key = db.receive_webhook(e, 'evt-1')
    check(db.rows('payment_inbox')[0]['state'] == 'READY' and not db.rows('captures'), '2xx boundary retains full input before applying capture')
    rejects(lambda: db.process_webhook(key, crash_after_apply=True), 'worker crashes between capture commit and inbox done')
    check(db.rows('payment_inbox')[0]['state'] == 'READY' and len(db.rows('captures')) == 1, 'committed capture plus unfinished ingress remains recoverable')
    check(db.process_webhook(key) == 'ACCEPTED' and db.rows('payment_inbox')[0]['state'] == 'DONE', 'worker replay recovers obligation without a second action')
    key2 = db.receive_webhook(e, 'evt-2')
    db.process_webhook(key2)
    check(len(db.rows('captures')) == 1 and len([x for x in db.rows('outbox') if x['kind'] == 'fulfill']) == 1,
          'two event IDs for one capture preserve one fulfillment')
    rejects(lambda: db.receive_webhook(dict(e, amount=777), 'evt-1'), 'same event identity altered input rejected')
    conflicting = db.receive_webhook(dict(e, amount=777), 'evt-conflicting')
    rejects(lambda: db.process_webhook(conflicting), 'capture immutable conflict cannot mark input handled')
    check(next(r for r in db.rows('payment_inbox') if r['event_id'] == 'evt-conflicting')['state'] == 'READY',
          'complete conflicting input retained for review and alert')

    broker = []
    n = db.publish(broker, lose_ack=True)
    check(n > 0 and all(r['sent'] == 0 for r in db.rows('outbox')), 'unknown broker ACK keeps outbox discoverable')
    db.publish(broker)
    fulfill = [e for e in broker if e['kind'] == 'fulfill']
    check(len(fulfill) == 2 and fulfill[0]['event_id'] == fulfill[1]['event_id'], 'relay retries the same event identity after lost ACK')
    downstream, _ = fixture()
    rejects(lambda: downstream.consume(fulfill[0], crash_before_commit=True), 'consumer abort before commit')
    check(not downstream.rows('consumer_inbox') and not downstream.rows('fulfillment_jobs'), 'consumer inbox and job roll back together')
    downstream.consume(fulfill[0]); downstream.consume(fulfill[1])
    another = dict(fulfill[0], event_id='different-event-same-order')
    downstream.consume(another)
    check(len(downstream.rows('consumer_inbox')) == 2 and len(downstream.rows('fulfillment_jobs')) == 1,
          'same event replay and different event same order create one durable job')

    db, intent = fixture(stock={'A': 1000})
    ids = [db.checkout('alice', f'scan-{i}', intent)['order_id'] for i in range(503)]
    old = ids[0]
    visited = db.scan(1001, fail_ids={old})
    check(len(visited) == 503 and sum(o['status'] == 'closed' for o in db.rows('orders')) == 502,
          'scan continuously pages beyond 500 while preserving a failed due row')
    check(db.scan(1001) == [old] and all(o['status'] == 'closed' for o in db.rows('orders')),
          'next scan restarts from oldest due and recovers skipped failure')
    db, intent = fixture()
    oid = db.checkout('alice', 'stale-selection', intent)['order_id']
    _, e = paid_e(db, oid)
    db.scan(1001, before_close=lambda _: db.apply_capture(e))
    check(db.rows('orders')[0]['status'] == 'paid' and counts(db) == (9, 0, 1), 'payment after scan selection wins before locked close check')

    check(math.isclose(1_000_000/86400*10,115.74074074074075), 'creation rate recomputed')
    check(116*900 == 104400 and 104400*3 == 313200, 'reservation occupancy upper bound recomputed')
    check(116*10*120 == 139200 and math.ceil(139200/(2000-1160)) == 166, 'outbox recovery uses net drain')
    check(35*600/(70-35) == 600 and 1_000_000*4000*365*3 == 4.38e12, 'scan recovery and storage recomputed')

summary = {'passed': True, 'assertions': len(results), 'checks': results, 'concurrent_races': race_outcomes,
           'limits': ['SQLite BEGIN IMMEDIATE serializes writers at database scope, not PG row locks.',
                      'Signature, immutable provider metadata, canonical queries and broker durability are contract simulations.',
                      'No real refund/warehouse call, production load test, replication or failover was exercised.']}
target = Path(__file__).resolve().parents[2]/'docs/reviews/ch18-code-results.json'
target.write_text(json.dumps(summary, ensure_ascii=False, indent=2)+'\n')
print(json.dumps({'passed': True, 'assertions': len(results), 'concurrent_races': race_outcomes}, ensure_ascii=False))
