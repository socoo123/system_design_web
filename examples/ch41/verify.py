"""Run local semantic checks and same-source validation; writes text evidence only."""
from pathlib import Path
import hashlib
import html
import json
import multiprocessing as mp
import os
import re
import sqlite3
import subprocess
import tempfile
import time

from storage import STATEMENTS, Rejected, connect, freeze, guarded_increment, initialize, submit

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
REPORT = ROOT / 'docs/reviews/ch41-code-results.json'


def compete(path, key, order_id, gate, output):
    gate.wait()
    try:
        submit(path, 't1', 'buyer', key, order_id, 0)
        output.put('SUBMITTED')
    except Rejected as error:
        output.put(str(error))


def crash_before_commit(path):
    con = connect(path)
    con.execute('BEGIN IMMEDIATE')
    params = dict(tenant='t1', order_id='o1', expected_version=0)
    row = con.execute(STATEMENTS['submit_order'], params).fetchone()
    params.update(sku=row[0], qty=row[1])
    con.execute(STATEMENTS['take_stock'], params)
    os._exit(17)  # No Python exception cleanup and no COMMIT.


def freeze_worker(path, pipe):
    pipe.send('attempting')
    freeze(path, 7)
    pipe.send('frozen')
    pipe.close()


def state(path):
    con = connect(path)
    try:
        return dict(stock=con.execute('SELECT available FROM stock').fetchone()[0],
                    orders=con.execute('SELECT order_id,state,version FROM orders ORDER BY order_id').fetchall(),
                    outbox=con.execute('SELECT count(*) FROM outbox').fetchone()[0],
                    results=con.execute('SELECT count(*) FROM request_result').fetchone()[0])
    finally:
        con.close()


def must_reject(action, message):
    try:
        action()
    except Rejected as error:
        assert str(error) == message, (str(error), message)
    else:
        raise AssertionError(f'Expected {message}')


def run():
    result = dict(scope='Local SQLite transactions, Java eligibility and source inventory; not distributed fault proof',
                  python_sqlite=sqlite3.sqlite_version, checks=[], numeric={}, passed=False)
    page = (ROOT / 'chapters/ch41.html').read_text()
    baseline = (ROOT / 'docs/reviews/ch40-ch41-ch42-baseline/ch41.html').read_text()
    sources = re.findall(r'<pre[^>]*data-source="([^"]+)"[^>]*><code>(.*?)</code></pre>', page, re.S)
    assert len(sources) == 4
    for filename, content in sources:
        assert html.unescape(content) == (HERE / filename).read_text().rstrip(), filename
    before_ids = re.findall(r'<(?:title|desc) id="([^"]+)"', baseline)
    after_ids = re.findall(r'<(?:title|desc) id="([^"]+)"', page)
    assert before_ids == after_ids and len(before_ids) == 80
    assert len(re.findall(r'<figure class="deck">', page)) == 8
    assert len(re.findall(r'<div class="slide">', page)) == 40
    assert len(set(re.findall(r'\bid="([^"]+)"', page))) == len(re.findall(r'\bid="([^"]+)"', page))
    result['checks'].append('Four page snippets equal their source; original 8 decks/40 frames/80 title-desc IDs retained')
    result['source_sha256'] = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                                for p in [ROOT / 'chapters/ch41.html', *sorted(HERE.glob('*'))]
                                if p.is_file() and p.name != 'README.md'}

    ctx = mp.get_context('spawn')
    with tempfile.TemporaryDirectory(prefix='ch41-') as temp:
        temp = Path(temp)
        db = str(temp / 'idempotent.sqlite')
        initialize(db, quantity=2)
        first = submit(db, 't1', 'buyer', 'lost-reply', 'o1', 0)
        before_retry = state(db)
        # Pretend the first response was lost; reuse key and original expected version.
        assert submit(db, 't1', 'buyer', 'lost-reply', 'o1', 0) == first
        assert state(db) == before_retry
        must_reject(lambda: submit(db, 't1', 'buyer', 'lost-reply', 'o2', 0), 'KEY_CONFLICT')
        must_reject(lambda: submit(db, 't1', 'buyer', 'new-key', 'o1', 0), 'STATE_CONFLICT')
        must_reject(lambda: submit(db, 't1', 'buyer', 'wrong-version', 'o2', 2), 'STATE_CONFLICT')
        # Caller scopes the key; this is a separate valid operation on o2.
        submit(db, 't1', 'other-buyer', 'lost-reply', 'o2', 0)
        assert state(db)['stock'] == 0 and state(db)['outbox'] == 2
        result['checks'].append('Normal commit/lost reply reuse original response; changed request and stale state/version reject; caller key scope is independent')

        db = str(temp / 'race.sqlite')
        initialize(db)
        gate, output = ctx.Event(), ctx.Queue()
        workers = [ctx.Process(target=compete, args=(db, f'key-{i}', f'o{i+1}', gate, output)) for i in range(2)]
        for worker in workers:
            worker.start()
        gate.set()
        observed = [output.get(timeout=10) for _ in workers]
        for worker in workers:
            worker.join(10)
            assert worker.exitcode == 0, worker.exitcode
        assert sorted(observed) == ['SOLD_OUT', 'SUBMITTED'], observed
        observed_state = state(db)
        assert observed_state['stock'] == 0 and observed_state['outbox'] == 1 and observed_state['results'] == 1
        assert sum(row[1] == 'SUBMITTED' for row in observed_state['orders']) == 1
        result['race'] = dict(outcomes=observed, state=observed_state)
        result['checks'].append('Two real processes competing for the final unit produce one commit and one full rollback')

        db = str(temp / 'event-error.sqlite')
        initialize(db)
        con = connect(db)
        con.execute("""CREATE TRIGGER fail_event BEFORE INSERT ON outbox
            BEGIN SELECT RAISE(ABORT, 'injected outbox failure'); END""")
        con.close()
        try:
            submit(db, 't1', 'buyer', 'event-fail', 'o1', 0)
        except sqlite3.IntegrityError:
            pass
        else:
            raise AssertionError('Expected event insertion failure')
        assert state(db) == dict(stock=1, orders=[('o1','DRAFT',0),('o2','DRAFT',0)], outbox=0, results=0)
        con = connect(db); con.execute('DROP TRIGGER fail_event'); con.close()
        submit(db, 't1', 'buyer', 'event-fail', 'o1', 0)
        result['checks'].append('Injected outbox constraint error rolls back order and stock; a same-key retry after known rollback succeeds')

        db = str(temp / 'crash.sqlite')
        initialize(db)
        child = ctx.Process(target=crash_before_commit, args=(db,))
        child.start(); child.join(10)
        assert child.exitcode == 17
        assert state(db) == dict(stock=1, orders=[('o1','DRAFT',0),('o2','DRAFT',0)], outbox=0, results=0)
        result['checks'].append('Process exits without cleanup after stock SQL; opening the local DB recovers uncommitted order/stock')

        db = str(temp / 'fence.sqlite')
        initialize(db)
        writer = connect(db)
        writer.execute('BEGIN IMMEDIATE')
        assert writer.execute("SELECT revision,state FROM range_owner WHERE range_id='r1'").fetchone() == (7,'ACTIVE')
        writer.execute("UPDATE range_data SET value=value+1 WHERE range_id='r1'")
        parent_pipe, child_pipe = ctx.Pipe()
        child = ctx.Process(target=freeze_worker, args=(db, child_pipe))
        child.start()
        assert parent_pipe.recv() == 'attempting'
        assert not parent_pipe.poll(0.15), 'Fence must wait for the existing writer'
        writer.commit(); writer.close()
        assert parent_pipe.poll(10) and parent_pipe.recv() == 'frozen'
        child.join(10); assert child.exitcode == 0
        must_reject(lambda: guarded_increment(db, 7), 'STALE_ROUTE')
        con = connect(db)
        assert con.execute('SELECT value FROM range_data').fetchone()[0] == 1
        assert con.execute('SELECT state FROM range_owner').fetchone()[0] == 'FROZEN'
        con.close(); parent_pipe.close(); child_pipe.close()
        result['checks'].append('Local fence waits for an existing writer; after durable FROZEN, the same old revision cannot write')

        java = Path('/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin')
        build = temp / 'classes'; build.mkdir()
        compile_run = subprocess.run([str(java/'javac'), '--release', '17', '-d', str(build),
                                      str(HERE/'ReadGate.java'), str(HERE/'ReadGateProbe.java')],
                                     text=True, capture_output=True)
        assert compile_run.returncode == 0, compile_run.stderr
        java_run = subprocess.run([str(java/'java'), '-cp', str(build), 'ReadGateProbe'],
                                  text=True, capture_output=True)
        assert java_run.returncode == 0, java_run.stderr
        result['java'] = java_run.stdout.strip()
        result['checks'].append(result['java'])

    result['numeric'] = dict(local_sync_ms=4+6+2, distant_sync_ms=4+80+2,
                             unrecoverable_risk_writes=2*1000,
                             balanced_per_shard=8000/8, conditional_capacity=8*1200,
                             hot_tenant=8000*0.4, hot_over_budget=8000*0.4-1200,
                             other_shards_ideal=4800/7, hot_bucket_ideal=3200/8,
                             full_copy_s=400*1000/100,
                             catchup_s=120*1000/(60-20),
                             raw_retention_GB=1000*1000*3600/1e9,
                             retransmission_MBps=1000*1000*1.1/1e6)
    assert result['numeric']['full_copy_s'] == 4000
    assert result['numeric']['catchup_s'] == 3000
    assert result['numeric']['raw_retention_GB'] == 3.6
    assert result['numeric']['retransmission_MBps'] == 1.1
    result['not_experimentally_verified'] = [
        'Replica history/visible-prefix production, network deadlines and promotion/fencing across independent servers',
        'Migration snapshot/delete merging, H export, durable directory CAS and target activation adapters',
        'PostgreSQL 40001/40P01 behavior, real prepared transactions, MQ delivery and PSP/Shipping recovery',
        'Production hardware durability, load/latency and region disasters'
    ]
    result['passed'] = True
    REPORT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(dict(passed=True, evidence=str(REPORT.relative_to(ROOT)), checks=result['checks']), ensure_ascii=False))


if __name__ == '__main__':
    run()
