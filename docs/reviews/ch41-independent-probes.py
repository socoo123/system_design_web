"""Independent new inputs calling Ch41's original Java class and SQLite adapter.

The separate Shipping SQL witness illustrates the stated authority contract;
it is explicitly not an implementation or end-to-end test of the chapter's Saga.
"""
from pathlib import Path
from decimal import Decimal
import hashlib
import html
import json
import multiprocessing as mp
import os
import re
import sqlite3
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
EXAMPLES = ROOT / 'examples/ch41'
sys.path.insert(0, str(EXAMPLES))
import storage  # Original chapter adapter, not a mirrored implementation.

checks = []
observations = {}


def check(ok, label):
    if not ok:
        raise AssertionError(label)
    checks.append(label)


def rejected(action, expected):
    try:
        action()
    except storage.Rejected as error:
        check(str(error) == expected, f'original adapter rejects {expected}')
    else:
        raise AssertionError(f'expected {expected}')


def snapshot(path):
    con = storage.connect(path)
    try:
        return {table: con.execute(f'SELECT * FROM {table} ORDER BY 1,2').fetchall()
                for table in ['stock', 'orders', 'outbox', 'request_result']}
    finally:
        con.close()


def same_key_worker(path, order, start, output):
    start.wait()
    try:
        response = storage.submit(path, 't1', 'parallel-buyer', 'request-Ω', order, 0)
        output.put(('SUCCESS', order, response))
    except storage.Rejected as error:
        output.put((str(error), order, None))


def fence_worker(path, pipe):
    pipe.send('entering original freeze')
    storage.freeze(path, 8)
    pipe.send('frozen')
    pipe.close()


def run():
    document = (ROOT / 'chapters/ch41.html').read_text()
    excerpts = re.findall(r'<pre[^>]*data-source="([^"]+)"[^>]*><code>(.*?)</code></pre>', document, re.S)
    check(len(excerpts) == 4 and all(html.unescape(text) == (EXAMPLES / name).read_text().rstrip()
                                  for name, text in excerpts), 'all four excerpts match actual original files')
    baseline = (ROOT / 'docs/reviews/ch40-ch41-ch42-baseline/ch41.html').read_text()
    ids = lambda text: re.findall(r'<(?:title|desc) id="([^"]+)"', text)
    check(ids(document) == ids(baseline) and len(ids(document)) == 80, 'all 8 decks / 40 frames / 80 animation IDs retained')

    ctx = mp.get_context('spawn')
    with tempfile.TemporaryDirectory(prefix='ch41-independent-') as directory:
        directory = Path(directory)
        db = str(directory / 'multi-item.sqlite')
        storage.initialize(db, quantity=10, order_ids=('order-α', 'reserve-fail'))
        con = storage.connect(db)
        con.execute("UPDATE orders SET qty=3,version=8 WHERE order_id='order-α'")
        con.close()
        first = storage.submit(db, 't1', 'buyer-β', 'opaque:key:7', 'order-α', 8)
        check(first['qty'] == 3 and first['version'] == 9 and snapshot(db)['stock'][0][2] == 7,
              'multi-unit versioned order commits exact quantity and new version')
        con = storage.connect(db)
        con.execute("UPDATE orders SET state='CANCELLED',version=10 WHERE order_id='order-α'")
        con.close()
        before = snapshot(db)
        replay = storage.submit(db, 't1', 'buyer-β', 'opaque:key:7', 'order-α', 8)
        check(replay == first and snapshot(db) == before,
              'lost-reply replay returns original response snapshot after later business state changes')
        rejected(lambda: storage.submit(db, 't1', 'buyer-β', 'opaque:key:7', 'order-α', 10), 'KEY_CONFLICT')
        rejected(lambda: storage.submit(db, 't1', 'buyer-β', 'new-key', 'order-α', 10), 'STATE_CONFLICT')
        con = storage.connect(db)
        con.execute("INSERT INTO stock VALUES ('t2','sku1',6)")
        con.execute("INSERT INTO orders VALUES ('t2','order-α','sku1',2,'DRAFT',0)")
        con.close()
        scoped = storage.submit(db, 't2', 'buyer-β', 'opaque:key:7', 'order-α', 0)
        check(scoped['tenant'] == 't2' and scoped['qty'] == 2,
              'same caller/key/order text is independent in another authenticated tenant')
        observations['versionedReceipt'] = {'original': first, 'replay': replay, 'currentOrder': snapshot(db)['orders'][0]}

        db = str(directory / 'result-constraint.sqlite')
        storage.initialize(db, quantity=5)
        con = storage.connect(db)
        con.execute("UPDATE orders SET qty=4 WHERE order_id='o1'")
        con.execute("""CREATE TRIGGER fail_result BEFORE INSERT ON request_result
                       WHEN NEW.request_key='reject-result'
                       BEGIN SELECT RAISE(ABORT, 'independent result failure'); END""")
        con.close()
        before = snapshot(db)
        try:
            storage.submit(db, 't1', 'buyer', 'reject-result', 'o1', 0)
        except sqlite3.IntegrityError as error:
            check('independent result failure' in str(error), 'result insert constraint propagates as error, not duplicate success')
        else:
            raise AssertionError('result constraint was swallowed')
        check(snapshot(db) == before, 'last-statement result failure rolls back order, stock AND already inserted outbox')
        con = storage.connect(db); con.execute('DROP TRIGGER fail_result'); con.close()
        storage.submit(db, 't1', 'buyer', 'reject-result', 'o1', 0)
        check(snapshot(db)['stock'][0][2] == 1, 'same successful identity can commit after a known complete rollback')

        db = str(directory / 'same-key-race.sqlite')
        storage.initialize(db, quantity=20, order_ids=('left', 'right'))
        con = storage.connect(db)
        con.execute("UPDATE orders SET qty=2 WHERE order_id='left'")
        con.execute("UPDATE orders SET qty=4 WHERE order_id='right'")
        con.close()
        start, output = ctx.Event(), ctx.Queue()
        processes = [ctx.Process(target=same_key_worker, args=(db, order, start, output)) for order in ['left', 'right']]
        for process in processes: process.start()
        start.set()
        outcomes = [output.get(timeout=15) for _ in processes]
        for process in processes:
            process.join(15)
            check(process.exitcode == 0, 'independent same-key competitor exited cleanly')
        check(sorted(item[0] for item in outcomes) == ['KEY_CONFLICT', 'SUCCESS'],
              'same request key racing different requests binds exactly one request')
        winner = next(item[2] for item in outcomes if item[0] == 'SUCCESS')
        after = snapshot(db)
        check(after['stock'][0][2] == 20 - winner['qty'] and len(after['outbox']) == len(after['request_result']) == 1,
              'same-key race leaves only the winning stock/effect/event/result')
        observations['sameKeyRace'] = {'outcomes': outcomes, 'state': after}

        db = str(directory / 'rollback-fence.sqlite')
        storage.initialize(db)
        con = storage.connect(db)
        con.execute("UPDATE range_owner SET revision=8 WHERE range_id='r1'")
        con.execute("UPDATE range_data SET value=3 WHERE range_id='r1'")
        con.close()
        rejected(lambda: storage.guarded_increment(db, 7), 'STALE_ROUTE')
        writer = storage.connect(db)
        writer.execute('BEGIN IMMEDIATE')
        writer.execute("UPDATE range_data SET value=41 WHERE range_id='r1'")
        parent, child = ctx.Pipe()
        process = ctx.Process(target=fence_worker, args=(db, child)); process.start()
        check(parent.recv() == 'entering original freeze' and not parent.poll(0.15),
              'fence cannot finish while an old writer still owns the same SQLite arbitration domain')
        writer.rollback(); writer.close()
        check(parent.poll(15) and parent.recv() == 'frozen', 'fence can complete after old transaction rolls back')
        process.join(15); check(process.exitcode == 0, 'original fence exited cleanly')
        rejected(lambda: storage.guarded_increment(db, 8), 'STALE_ROUTE')
        con = storage.connect(db)
        check(con.execute('SELECT value FROM range_data').fetchone() == (3,), 'aborted old write is not imported into the final fenced state')
        check(con.execute('SELECT revision,state FROM range_owner').fetchone() == (8, 'FROZEN'), 'durable frozen guard rejects current and stale old routes')
        con.close(); parent.close(); child.close()

        java = Path('/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin')
        build = directory / 'classes'; build.mkdir()
        subprocess.run([str(java/'javac'), '--release', '17', '-d', str(build),
                        str(EXAMPLES/'ReadGate.java'), str(ROOT/'docs/reviews/ch41-independent-ReadGate.java')], check=True)
        result = subprocess.run([str(java/'java'), '-cp', str(build), 'Ch41IndependentReadGate'], check=True, capture_output=True, text=True)
        observations['java'] = result.stdout.strip()

    # Executable witness for the text's authority contract, not original Saga code.
    witness = sqlite3.connect(':memory:', isolation_level=None)
    witness.execute("CREATE TABLE shipping (id TEXT PRIMARY KEY, state TEXT, version INTEGER)")
    saga = []
    for first in ['cancel', 'ship']:
        witness.execute('DELETE FROM shipping')
        witness.execute("INSERT INTO shipping VALUES ('o9','READY',5)")
        transition = lambda state: witness.execute("UPDATE shipping SET state=?,version=6 WHERE id='o9' AND state='READY' AND version=5", (state,)).rowcount
        if first == 'cancel':
            check(transition('CANCELLED') == 1 and transition('SHIPPED') == 0,
                  'Shipping authority cancel winner rejects late old-version dispatch')
        else:
            check(transition('SHIPPED') == 1 and transition('CANCELLED') == 0,
                  'Shipping authority ship winner prevents pretending later cancel was successful')
        state = witness.execute('SELECT state,version FROM shipping').fetchone()
        saga.append({'first': first, 'authoritativeState': state, 'refundEligible': state[0] == 'CANCELLED'})
    witness.close()
    observations['shippingContractWitness'] = saga
    numeric = {
        'localSyncMs': Decimal(4)+6+2, 'remoteSyncMs': Decimal(4)+80+2,
        'riskWrites': Decimal(1000)*2, 'balancedPerShard': Decimal(8000)/8,
        'capacity': Decimal(8)*1200, 'hotShard': Decimal(8000)*Decimal('.4'),
        'hotOverBudget': Decimal(3200)-1200, 'hotBucket': Decimal(3200)/8,
        'fullCopySeconds': Decimal(400)*1000/100,
        'catchupSecondsBeforeFence': Decimal(120)*1000/(60-20),
        'sameBacklogSecondsAfterFence': Decimal(120)*1000/60,
        'rawOutboxGB': Decimal(1000)*1000*3600/10**9,
        'retransmissionMBps': Decimal(1000)*1000*Decimal('1.1')/10**6,
    }
    check([numeric[k] for k in ['localSyncMs','remoteSyncMs','riskWrites','balancedPerShard','capacity','hotShard','hotOverBudget','hotBucket','fullCopySeconds','catchupSecondsBeforeFence','sameBacklogSecondsAfterFence','rawOutboxGB','retransmissionMBps']]
          == [Decimal(v) for v in ['12','86','2000','1000','9600','3200','2000','400','4000','3000','2000','3.6','1.1']],
          'primary quantities independently recomputed; pre-fence and post-fence rates distinguished')
    signed = [ROOT/'chapters/ch41.html', *sorted(EXAMPLES.glob('*'))]
    report = {'passed': True, 'checks': checks, 'observations': observations,
              'numeric': {k: str(v) for k,v in numeric.items()},
              'sourceHashes': {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in signed if p.is_file()},
              'openFindings': [],
              'limits': ['FreshView is a trusted engine/connection/snapshot proof; no real replica or failover was run.',
                         'Migration/PREPARED/whole-PostgreSQL-retry/Outbox/PSP/Shipping integrations are reviewed contracts, not exercised production systems.',
                         'Shipping SQL is a reviewer-created witness for the text, not a chapter implementation.']}
    (ROOT/'docs/reviews/ch41-independent-probes-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'passed': True, 'checks': len(checks), 'java': observations['java']}))


if __name__ == '__main__':
    run()
