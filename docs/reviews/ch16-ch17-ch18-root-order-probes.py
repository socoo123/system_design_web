"""Additional root-authored inputs against the author's actual SQLite model.

This does not run PostgreSQL, cryptography, a provider or a warehouse.
"""
from pathlib import Path
import hashlib
import importlib.util
import json
import sys
import tempfile

sys.dont_write_bytecode = True
root = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('ch18_under_test', root / 'examples/ch18/model.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
checks = []


def check(ok, message):
    if not ok:
        raise AssertionError(message)
    checks.append(message)


def rejected(action):
    try:
        action()
    except module.Rejected:
        return True
    return False


def stock(model):
    return sorted(model.rows('stock'), key=lambda r: r['sku_id'])


with tempfile.TemporaryDirectory(prefix='sd-c5-root-orders-') as directory:
    model = module.Model(Path(directory) / 'orders.sqlite')
    model.initialize()
    quotes = [{'id': 'qa', 'owner': 'alice', 'currency': 'USD', 'address': 'v1',
               'items': {'A': 7, 'B': 13}, 'expires': 500},
              {'id': 'qb', 'owner': 'bob', 'currency': 'USD', 'address': 'v2',
               'items': {'A': 7, 'B': 13}, 'expires': 500}]
    model.seed({'A': 11, 'B': 3}, quotes)
    alice = {'quote_id': 'qa', 'currency': 'USD', 'address_version': 'v1', 'items': [('B', 2), ('A', 4)]}
    bob = {'quote_id': 'qb', 'currency': 'USD', 'address_version': 'v2', 'items': [('A', 1), ('B', 1)]}
    first = model.checkout('alice', 'same-key', alice)
    second = model.checkout('bob', 'same-key', bob)
    check(first['order_id'] != second['order_id'], 'request identities are owner-scoped')
    check(first['total'] == 54 and second['total'] == 20, 'trusted integer quote arithmetic')
    before = stock(model)
    check(before == [{'sku_id': 'A', 'available': 6, 'reserved': 5, 'sold': 0},
                     {'sku_id': 'B', 'available': 0, 'reserved': 3, 'sold': 0}], 'both exact holds own their units')
    events = len(model.rows('outbox'))
    check(rejected(lambda: model.close(first['order_id'], now=1001, inject_failure=True)), 'injected partial finalize fails')
    check(stock(model) == before, 'multi-SKU counters roll back together')
    check(all(r['state'] == 'HELD' for r in model.rows('reservations')), 'partial hold updates roll back')
    check(len(model.rows('outbox')) == events, 'failed finalize leaves no ghost event')
    check(next(r for r in model.rows('orders') if r['order_id'] == first['order_id'])['status'] == 'pending_pay', 'order status rolls back with holds')
    check(model.close(first['order_id'], now=1001) == 'closed', 'normal expiry closes Alice')
    after_close = stock(model)
    check(model.close(first['order_id'], now=1002) == 'no_change' and stock(model) == after_close, 'repeated expiry cannot release Bobs reservation')
    check(model.checkout('alice', 'same-key', alice, now=5000) == first, 'retry returns original receipt after quote expiry and close')
    changed = dict(alice, address_version='v9')
    check(rejected(lambda: model.checkout('alice', 'same-key', changed)), 'same key changed intent rejected')
    attempt = model.start_attempt(second['order_id'], 'bob', now=101)
    check(model.mark_unknown(attempt['attempt_id']) == 1, 'timeout persists unknown')
    check(model.start_attempt(second['order_id'], 'bob', now=102)['attempt_id'] == attempt['attempt_id'], 'unknown blocks a fresh attempt')
    evidence = model.evidence(attempt, 'capture-one', owner='bob')
    inbox = model.receive_webhook(evidence, 'event-one')
    check(rejected(lambda: model.process_webhook(inbox, crash_after_apply=True)), 'crash after durable capture before inbox done')
    check(model.rows('payment_inbox')[0]['state'] == 'READY', 'crashed inbox remains discoverable')
    check(model.process_webhook(inbox) == 'ACCEPTED', 'replay discovers committed outcome')
    check(len([r for r in model.rows('outbox') if r['kind'] == 'fulfill']) == 1, 'one durable fulfillment intention')
    check(model.mark_unknown(attempt['attempt_id']) == 0, 'late timeout cannot overwrite captured')
    duplicate_event = model.receive_webhook(evidence, 'event-two')
    check(model.process_webhook(duplicate_event) == 'ACCEPTED' and len(model.rows('captures')) == 1, 'different events for same capture do not charge twice')
    extra = dict(evidence, capture_id='capture-two')
    check(model.apply_capture(extra) == 'REFUND_DUE', 'second real capture creates its own refund obligation')
    check(model.apply_capture(extra) == 'REFUND_DUE' and len(model.rows('refund_due')) == 1, 'refund obligation survives duplicate capture')
    wrong = dict(evidence, capture_id='capture-three', amount=999)
    check(model.apply_capture(wrong) == 'REVIEW', 'mismatched money becomes durable review')
    check(len(model.rows('review_tasks')) == 1, 'unmatched funds retain a review task')
    check(model.rows('attempts')[0]['state'] == 'CAPTURED', 'later review does not erase an earlier captured fact')
    check(model.close(second['order_id'], now=1005) == 'no_change', 'paid winner prevents expiry release')
    broker = []
    model.publish(broker, lose_ack=True)
    model.publish(broker)
    for event in broker:
        if event['kind'] == 'fulfill':
            model.consume(event)
    check(len(model.rows('fulfillment_jobs')) == 1, 'outbox replay materializes one downstream task')
    check(all(r['available'] + r['reserved'] + r['sold'] == {'A': 11, 'B': 3}[r['sku_id']] for r in stock(model)), 'stock conservation holds after all branches')

result = {'passed': True, 'checks': len(checks), 'cases': checks,
          'limitation': 'Actual author SQLite model; adapters and provider inputs are declared contracts.',
          'sourceHashes': {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
                           for p in [root / 'examples/ch18/model.py', root / 'examples/ch18/schema.sql']}}
(root / 'docs/reviews/ch16-ch17-ch18-root-order-results.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'passed': True, 'checks': len(checks)}))
