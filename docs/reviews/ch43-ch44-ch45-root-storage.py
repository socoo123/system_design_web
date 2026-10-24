"""New-input local transaction probes. No PostgreSQL or replicated-DB claim."""
from pathlib import Path
from contextlib import closing
import hashlib
import importlib.util
import json
import sqlite3
import sys
import tempfile

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
PREFIX = 'ch43-ch44-ch45'
checks = []
files = [p for n in (43, 44, 45) for p in (ROOT / f'examples/ch{n}').rglob('*')
         if p.is_file() and '__pycache__' not in p.parts]
before = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}


def check(ok, label):
    if not ok:
        raise AssertionError(label)
    checks.append(label)


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / file)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def sql_from_pseudo(file):
    lines = (ROOT / file).read_text().splitlines()
    statements = []
    for i, line in enumerate(lines):
        if 'SQL ' not in line:
            continue
        statement = line.split('SQL ', 1)[1]
        for following in lines[i + 1:]:
            if following.strip().startswith(('VALUES ', 'ON CONFLICT ', 'WHERE ')):
                statement += ' ' + following.strip()
            else:
                break
        statements.append(statement)
    return statements


catalog = module('root_catalog43', 'examples/ch43/catalog_contract.py')
domain = module('root_domain45', 'examples/ch45/verify.py')
with tempfile.TemporaryDirectory(prefix=PREFIX + '-sql-') as directory:
    with closing(sqlite3.connect(':memory:', isolation_level=None)) as db:
        db.executescript('''
            CREATE TABLE catalog(table_id TEXT PRIMARY KEY NOT NULL,current TEXT NOT NULL);
            CREATE TABLE accepted(table_id TEXT NOT NULL,batch_id TEXT NOT NULL,
              digest TEXT NOT NULL,snapshot TEXT NOT NULL,PRIMARY KEY(table_id,batch_id));
            INSERT INTO catalog VALUES('root-table','s100'),('root-other','s100');
        ''')
        check(catalog.publish(db, 'root-table', 'root-batch', 'd100', 's100', 's101') == 's101',
              'catalog: new table/batch publishes')
        check(catalog.publish(db, 'root-table', 'next', 'd101', 's101', 's102') == 's102',
              'catalog: subsequent commit advances pointer')
        check(catalog.publish(db, 'root-table', 'root-batch', 'd100', 's100', 'must-not-publish') == 's101'
              and db.execute("SELECT current FROM catalog WHERE table_id='root-table'").fetchone()[0] == 's102',
              'catalog: retry recovers original receipt despite newer pointer')
        try:
            catalog.publish(db, 'root-table', None, 'd-null', 's102', 'invalid')
            raise AssertionError('NULL batch accepted')
        except sqlite3.IntegrityError:
            check(db.execute("SELECT current FROM catalog WHERE table_id='root-table'").fetchone()[0] == 's102',
                  'catalog: identity insertion failure rolls back prior pointer update')
        check(catalog.publish(db, 'root-other', 'root-batch', 'other', 's100', 'other101') == 'other101',
              'catalog: batch identity is scoped to table')

    accept = sql_from_pseudo('examples/ch44/accept.pseudo')
    consume = sql_from_pseudo('examples/ch44/consume.pseudo')
    with closing(sqlite3.connect(':memory:')) as db:
        db.execute('PRAGMA foreign_keys=ON')
        db.executescript((ROOT / 'examples/ch44/schema.sql').read_text())
        db.execute("INSERT INTO accounts VALUES('root-tenant','account-extra',70)")
        db.commit()
        p = dict(tenant='root-tenant', operation='CREATE', K='root-key', digest='payload-one',
                 new_id='root-order', result='durable-root-receipt')
        db.execute('BEGIN')
        check(db.execute(accept[0], p).fetchone()[0] == 'root-order', 'accept: new scoped key wins')
        for statement in accept[2:]:
            db.execute(statement, p)
        db.commit()
        db.execute('BEGIN')
        check(db.execute(accept[0], p).fetchone() is None
              and db.execute(accept[1], p).fetchone()[2] == 'durable-root-receipt',
              'accept: same key returns durable receipt instead of creating a new order')
        db.rollback()
        aborted = dict(p, K='aborted-root-key', new_id='aborted-root-order')
        db.execute('BEGIN')
        db.execute(accept[0], aborted)
        db.execute(accept[2], aborted)
        db.execute(accept[3], aborted)
        db.rollback()  # Failure after all three writes, before receipt/COMMIT.
        check(not db.execute("SELECT 1 FROM orders WHERE order_id='aborted-root-order'").fetchone()
              and not db.execute("SELECT 1 FROM intents WHERE k='aborted-root-key'").fetchone()
              and not db.execute("SELECT 1 FROM outbox WHERE event_id='aborted-root-order'").fetchone(),
              'accept: no orphan intent/order/outbox after injected abort')
        effect = dict(tenant='root-tenant', consumer='root-consumer', event_id='root-event',
                      digest='account-extra:+13', delta=13, account_id='account-extra')
        db.execute('BEGIN')
        db.execute(consume[0], effect)
        check(db.execute(consume[2], effect).rowcount == 1, 'consume: new local effect updates one account')
        db.rollback()
        check(not db.execute('SELECT 1 FROM inbox').fetchone()
              and db.execute('SELECT points FROM accounts').fetchone()[0] == 70,
              'consume: inbox and effect roll back together')
        db.execute('BEGIN')
        db.execute(consume[0], effect)
        db.execute(consume[2], effect)
        db.commit()
        db.execute('BEGIN')
        check(db.execute(consume[0], effect).fetchone() is None
              and db.execute(consume[1], effect).fetchone()[1] == 13,
              'consume: duplicate delivery uses committed result')
        db.rollback()
        check(db.execute('SELECT points FROM accounts').fetchone()[0] == 83,
              'consume: duplicate does not add points twice')

    path = Path(directory) / 'new-domain.sqlite'
    domain.fixture(path, pending=True)
    with closing(domain.connect(path)) as db:
        db.execute("INSERT INTO orders VALUES('t2','o42',20,'pending_pay',600,'EUR','root-attempt',NULL)")
        db.execute("INSERT INTO order_lines VALUES('t2','o42','root-sku',2,300)")
        db.execute("INSERT INTO bindings VALUES('t2','p9','o42','root-attempt',600,'EUR')")
        db.execute("INSERT INTO bindings VALUES('t2','root-extra-pay','o42','root-attempt',600,'EUR')")
    fact = domain.event('root-domain-event', tenant='t2', amount=600, currency='EUR', attempt='root-attempt')
    untouched = domain.snapshot(path)
    try:
        domain.consume(path, fact, fail=True)
        raise AssertionError('expected injected application abort')
    except RuntimeError:
        check(domain.snapshot(path) == untouched, 'domain: new-tenant abort leaves every participating table unchanged')
    check(domain.consume(path, fact) == 'ACCEPTED', 'domain: new tenant, amount, currency and attempt accepted')
    data = domain.snapshot(path)
    orders = {row['tenant']: row for row in data['orders']}
    check(orders['t1']['state'] == 'pending_pay' and orders['t2']['state'] == 'paid'
          and orders['t2']['version'] == 21, 'domain: equal order/payment IDs do not cross tenant scope')
    check(domain.consume(path, dict(fact, event_id='root-second-delivery')) == 'ACCEPTED',
          'domain: second delivery ID for same business fact returns original result')
    data = domain.snapshot(path)
    check(len(data['inbox']) == 2 and len(data['capture_result']) == len(data['outbox']) == 1,
          'domain: transport identity and payment identity remain distinct')
    extra = dict(fact, event_id='root-extra-event', payment_id='root-extra-pay')
    check(domain.consume(path, extra) == 'REFUND_REQUIRED', 'domain: extra capture creates refund obligation')
    with closing(domain.connect(path)) as db:
        db.execute("UPDATE refund_work SET state='UNKNOWN' WHERE tenant='t2'")
    check(domain.consume(path, dict(extra, event_id='root-extra-replay')) == 'REFUND_REQUIRED',
          'domain: new message for extra capture recovers same refund decision')
    data = domain.snapshot(path)
    check(len(data['refund_work']) == 1 and data['refund_work'][0]['state'] == 'UNKNOWN'
          and len(data['outbox']) == 2, 'domain: replay preserves unresolved refund and creates no second obligation/event')

after = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
result = dict(passed=before == after, sourcesUnchangedDuringRun=before == after,
              sourceHashes=after, checks=checks, count=len(checks),
              limits='SQLite files, source-extracted SQL and author contract adapters with new inputs. No PostgreSQL isolation, replicated database, broker, PSP, power-loss or distributed cancellation experiment.')
(ROOT / f'docs/reviews/{PREFIX}-root-storage-results.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(dict(passed=result['passed'], checks=len(checks))))
raise SystemExit(0 if result['passed'] else 1)
