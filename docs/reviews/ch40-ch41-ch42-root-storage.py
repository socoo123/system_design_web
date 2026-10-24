"""New inputs against the actual local adapters; no replicated DB or broker."""
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from pathlib import Path
import ast
import hashlib
import importlib.util
import json
import sqlite3
import tempfile

ROOT = Path(__file__).resolve().parents[2]
PREFIX = 'ch40-ch41-ch42'
checks = []


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / file)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


def check(ok, label):
    checks.append(dict(label=label, passed=bool(ok)))
    if not ok:
        raise AssertionError(label)


def rejected(action, exception, expected, label):
    try:
        action()
    except exception as error:
        check(str(error) == expected, label)
    else:
        check(False, label)


def rows(file, sql):
    with sqlite3.connect(file) as db:
        return db.execute(sql).fetchall()


def submit_counts(file):
    return tuple(rows(file, f'SELECT COUNT(*) FROM {table}')[0][0]
                 for table in ('outbox', 'request_result'))


store = module('root_ch41_storage', 'examples/ch41/storage.py')
effect = module('root_ch42_effect', 'examples/ch42/check_effect.py')
with tempfile.TemporaryDirectory(prefix='ch40-ch41-ch42-root-') as directory:
    directory = Path(directory)
    order_db = str(directory / 'orders.db')
    store.initialize(order_db, quantity=2, order_ids=('first', 'second', 'third'))
    args = (order_db, 't1', 'caller-B', 'request-17', 'first', 0)
    original = store.submit(*args)
    check(original['version'] == 1 and submit_counts(order_db) == (1, 1), 'Ch41 normal submit commits result and outbox')
    check(store.submit(*args) == original and submit_counts(order_db) == (1, 1), 'Ch41 lost successful reply reuses saved snapshot')
    rejected(lambda: store.submit(order_db, 't1', 'caller-B', 'request-17', 'second', 0),
             store.Rejected, 'KEY_CONFLICT', 'Ch41 same key cannot select another order')
    rejected(lambda: store.submit(order_db, 't1', 'caller-B', 'request-17', 'first', 1),
             store.Rejected, 'KEY_CONFLICT', 'Ch41 same key cannot change expected version')
    try:
        store.submit(order_db, 't1', 'caller-B', 'retry-after-rollback', 'second', 0, fault='after_stock')
    except RuntimeError:
        pass
    check(rows(order_db, 'SELECT available FROM stock') == [(1,)]
          and rows(order_db, "SELECT state,version FROM orders WHERE order_id='second'") == [('DRAFT', 0)]
          and submit_counts(order_db) == (1, 1), 'Ch41 fault after stock rolls back order, stock, event and result')
    check(store.submit(order_db, 't1', 'caller-B', 'retry-after-rollback', 'second', 0)['version'] == 1,
          'Ch41 known rollback permits retry of whole transaction')
    rejected(lambda: store.submit(order_db, 't1', 'caller-B', 'third-key', 'third', 0),
             store.Rejected, 'SOLD_OUT', 'Ch41 empty stock leaves no false successful result')
    check(submit_counts(order_db) == (2, 2) and rows(order_db, 'SELECT available FROM stock') == [(0,)],
          'Ch41 rejected request creates no outbox or receipt')
    with store.connect(order_db) as db:
        db.execute("UPDATE orders SET state='CANCELLED',version=9 WHERE order_id='first'")
    check(store.submit(*args) == original, 'Ch41 replay returns accepted-time result, not later mutable row')

    race_db = str(directory / 'last-stock.db')
    store.initialize(race_db, quantity=1, order_ids=('race-A', 'race-B'))
    def compete(order):
        try:
            return store.submit(race_db, 't1', 'caller-B', order, order, 0)['state']
        except store.Rejected as error:
            return str(error)
    with ThreadPoolExecutor(max_workers=2) as pool:
        answers = list(pool.map(compete, ('race-A', 'race-B')))
    check(sorted(answers) == ['SOLD_OUT', 'SUBMITTED'] and submit_counts(race_db) == (1, 1),
          'Ch41 two real connections competing for last item commit one success')
    same_db = str(directory / 'same-key.db')
    store.initialize(same_db, quantity=1, order_ids=('only',))
    def same(_):
        return store.submit(same_db, 't1', 'caller-B', 'same-key', 'only', 0)
    with ThreadPoolExecutor(max_workers=2) as pool:
        answers = list(pool.map(same, range(2)))
    check(answers[0] == answers[1] and submit_counts(same_db) == (1, 1),
          'Ch41 simultaneous same key reads one stored outcome')

    fence_db = str(directory / 'fence.db')
    store.initialize(fence_db)
    writer = store.connect(fence_db)
    writer.execute('BEGIN IMMEDIATE')
    writer.execute("UPDATE range_data SET value=1 WHERE range_id='r1'")
    with ThreadPoolExecutor(max_workers=1) as pool:
        pending = pool.submit(store.freeze, fence_db, 7)
        try:
            pending.result(timeout=.05)
            check(False, 'Ch41 fence must wait for existing writer transaction')
        except FutureTimeout:
            check(True, 'Ch41 fence waits for existing writer transaction')
        writer.commit()
        writer.close()
        pending.result(timeout=5)
    check(rows(fence_db, 'SELECT revision,state FROM range_owner') == [(7, 'FROZEN')]
          and rows(fence_db, 'SELECT value FROM range_data') == [(1,)], 'Ch41 fence follows old writer commit')
    rejected(lambda: store.guarded_increment(fence_db, 7), store.Rejected, 'STALE_ROUTE',
             'Ch41 stale writer rejected by actual storage after fence')
    rejected(lambda: store.guarded_increment(fence_db, 8), store.Rejected, 'STALE_ROUTE',
             'Ch41 guessed future revision cannot reactivate source')

    # Execute the same DDL literal used by the author's runnable fixture.
    tree = ast.parse((ROOT / 'examples/ch42/check_effect.py').read_text())
    schemas = [call.args[0].value for call in ast.walk(tree)
               if isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute)
               and call.func.attr == 'executescript' and call.args
               and isinstance(call.args[0], ast.Constant) and isinstance(call.args[0].value, str)
               and 'CREATE TABLE inbox' in call.args[0].value]
    check(len(schemas) == 1, 'Ch42 independent fixture reads actual published schema')
    effects_db = str(directory / 'effects.db')
    db = effect.connect(effects_db)
    db.executescript(schemas[0])
    db.execute("INSERT INTO account VALUES ('b',20)")
    db.close()
    check(effect.apply(effects_db, 'ledger-B', 'evt-301', 'a', 19) == 'APPLIED', 'Ch42 new scoped event applies')
    check(effect.apply(effects_db, 'ledger-B', 'evt-301', 'a', 19) == 'APPLIED'
          and effect.state(effects_db)['balance'] == 19, 'Ch42 repeated original event has no second delta')
    rejected(lambda: effect.apply(effects_db, 'ledger-B', 'evt-301', 'b', 19),
             ValueError, 'IDENTITY_CONFLICT', 'Ch42 replay cannot substitute destination account')
    for scope, event in ((None, 'x'), ('ledger-B', None), ('', 'x'), ('ledger-B', '')):
        rejected(lambda: effect.apply(effects_db, scope, event, 'a', 19), ValueError,
                 'PERMANENT_SCHEMA_ERROR', 'Ch42 malformed identity is a permanent schema rejection')
    check(effect.state(effects_db) == dict(balance=19, effects=1, inbox=1),
          'Ch42 invalid identities and digest conflict leave no mutation')
    db = effect.connect(effects_db)
    for table in ('inbox', 'ledger'):
        try:
            if table == 'inbox':
                db.execute("INSERT INTO inbox VALUES (NULL,'direct','d','APPLIED')")
            else:
                db.execute("INSERT INTO ledger VALUES (NULL,'direct','a',1)")
        except sqlite3.IntegrityError:
            check(True, f'Ch42 {table} database constraint independently rejects NULL identity')
        else:
            check(False, f'Ch42 {table} permits NULL identity')
    db.close()
    def event_race(_):
        return effect.apply(effects_db, 'ledger-B', 'evt-302', 'a', 23)
    with ThreadPoolExecutor(max_workers=3) as pool:
        answers = list(pool.map(event_race, range(3)))
    check(answers == ['APPLIED'] * 3 and effect.state(effects_db) == dict(balance=42, effects=2, inbox=2),
          'Ch42 three connections replay one event with one effect')
    rejected(lambda: effect.apply(effects_db, 'ledger-B', 'missing-account', 'missing', 7),
             ValueError, 'MISSING_ACCOUNT', 'Ch42 missing target rolls back provisional claim')
    check(effect.state(effects_db) == dict(balance=42, effects=2, inbox=2), 'Ch42 no partial inbox or ledger after missing target')

files = ['examples/ch41/storage.py', 'examples/ch41/schema.sql', 'examples/ch41/submit.sql',
         'examples/ch42/check_effect.py', 'examples/ch42/effect.pseudo']
result = dict(checks=checks, sourceHashes={p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in files},
              passed=all(x['passed'] for x in checks),
              limits='Actual SQLite file transactions and separate connections; local lock wait and malformed-input tests. No PostgreSQL replication/failover, Kafka, payment provider, power loss, or production load experiment.')
(ROOT / f'docs/reviews/{PREFIX}-root-storage-results.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(dict(passed=result['passed'], checks=len(checks))))
