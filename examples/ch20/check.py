#!/usr/bin/env python3
"""Reproduce source sync, Java 17, and bounded SQL/contract checks. No Kafka cluster."""
from pathlib import Path
import hashlib
import html
import json
import re
import sqlite3
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor
from fractions import Fraction

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
checks = []


def check(ok, name):
    if not ok:
        raise AssertionError(name)
    checks.append(name)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


page = (ROOT / 'chapters/ch20.html').read_text()
blocks = re.findall(r'<pre\b([^>]*)><code[^>]*>([\s\S]*?)</code></pre>', page)
for attrs, content in blocks:
    source = re.search(r'data-source="([^"]+)"', attrs)[1]
    expected = (HERE / source).read_text()
    if source.endswith('.java'):
        expected = expected.split('// BEGIN page-progress\n', 1)[1].split('    // END page-progress', 1)[0]
        expected = '\n'.join(line[4:] if line.startswith('    ') else line for line in expected.splitlines()).rstrip() + '\n'
    check(html.unescape(content) == expected, 'page/source exact: ' + source)
check(len(blocks) == 6, 'six labelled source-identical blocks')
check(len(re.findall(r'<button[^>]*class="flip"', page)) == 14, 'fourteen flashcards')
baseline = (ROOT / 'docs/reviews/ch19-ch20-ch21-baseline/ch20.html').read_text()
check(re.findall(r'<title id="([^"]+)"', page) == re.findall(r'<title id="([^"]+)"', baseline), 'all 30 title IDs retained in order')
check(re.findall(r'<desc id="([^"]+)"', page) == re.findall(r'<desc id="([^"]+)"', baseline), 'all 30 description IDs retained in order')

java_home = Path('/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin')
with tempfile.TemporaryDirectory(prefix='ch20-java-') as temp:
    compile_result = subprocess.run([str(java_home / 'javac'), '--release', '17', '-d', temp,
                                    str(HERE / 'PartitionProgress.java'), str(HERE / 'PartitionProgressTest.java')],
                                   text=True, capture_output=True, check=True)
    java_result = subprocess.run([str(java_home / 'java'), '-cp', temp, 'PartitionProgressTest'],
                                text=True, capture_output=True, check=True)
check('checks passed' in java_result.stdout, 'actual Java 17 compilation/execution')

# Extract the actual SQL statements printed in the teaching pseudocode.
pseudo = (HERE / 'apply-event.pseudo').read_text()
insert_sql = re.search(r'inserted = (INSERT[\s\S]*?RETURNING event_id)', pseudo)[1]
select_sql = re.search(r'old = (SELECT[\s\S]*?event_id=:event_id)', pseudo)[1]
update_sql = re.search(r'result = (UPDATE[\s\S]*?RETURNING balance_cents)', pseudo)[1]
result_sql = re.search(r'^  (UPDATE inbox[^\n]+)', pseudo, re.M)[1]


class UnknownCommit(Exception):
    pass


def apply_event(db, handler, event, account, delta, fail=None):
    con = sqlite3.connect(db, timeout=20, isolation_level=None)
    values = dict(handler=handler, event_id=event, account_id=account, delta_cents=delta)
    try:
        # SQLite's coarse writer lock differs from PostgreSQL READ COMMITTED.
        con.execute('BEGIN IMMEDIATE')
        inserted = con.execute(insert_sql, values).fetchone()
        if inserted is None:
            prior = con.execute(select_sql, values).fetchone()
            if prior is None or prior[2] is None:
                raise ValueError('invariant')
            if prior[:2] != (account, delta):
                raise ValueError('intent conflict')
            con.commit()
            return 'ALREADY_APPLIED', prior[2]
        if fail == 'after_inbox':
            raise RuntimeError('crash before effect')
        result = con.execute(update_sql, values).fetchone()
        if result is None:
            raise ValueError('unknown account')
        if fail == 'after_effect':
            raise RuntimeError('crash before commit')
        values['result'] = result[0]
        con.execute(result_sql, values)
        con.commit()
        if fail == 'after_commit':
            raise UnknownCommit('committed but response lost')
        return 'APPLIED', result[0]
    finally:
        if con.in_transaction:
            con.rollback()
        con.close()


with tempfile.TemporaryDirectory(prefix='ch20-inbox-') as temp:
    db = str(Path(temp) / 'inbox.sqlite')
    with sqlite3.connect(db) as con:
        con.executescript((HERE / 'schema.sql').read_text())
        con.executemany('INSERT INTO ledger VALUES (?,?)', [('alice', 100), ('bob', 200)])
    check(apply_event(db, 'billing', '9001', 'alice', 30) == ('APPLIED', 130), 'normal durable effect')
    check(apply_event(db, 'billing', '9001', 'alice', 30) == ('ALREADY_APPLIED', 130), 'replay after checkpoint failure')
    check(apply_event(db, 'billing', '9002', 'alice', 10) == ('APPLIED', 140), 'different event changes balance')
    check(apply_event(db, 'billing', '9001', 'alice', 30) == ('ALREADY_APPLIED', 130), 'duplicate returns original result after newer event')
    for account, delta in [('bob', 30), ('alice', 99)]:
        try:
            apply_event(db, 'billing', '9001', account, delta)
            raise AssertionError('expected conflict')
        except ValueError as error:
            check(str(error) == 'intent conflict', 'same event different full intent rejected: ' + account)
    for mode in ['after_inbox', 'after_effect']:
        try:
            apply_event(db, 'billing', mode, 'alice', 7, mode)
            raise AssertionError('expected rollback')
        except RuntimeError:
            pass
        with sqlite3.connect(db) as con:
            check(con.execute('SELECT count(*) FROM inbox WHERE event_id=?', (mode,)).fetchone()[0] == 0,
                  mode + ': failed transaction leaves no dedupe row')
            check(con.execute("SELECT balance_cents FROM ledger WHERE account_id='alice'").fetchone()[0] == 140,
                  mode + ': failed transaction leaves no effect')
    try:
        apply_event(db, 'billing', 'lost-response', 'alice', 7, 'after_commit')
    except UnknownCommit:
        pass
    check(apply_event(db, 'billing', 'lost-response', 'alice', 7) == ('ALREADY_APPLIED', 147), 'unknown DB commit safely recovers same event')
    try:
        apply_event(db, 'billing', 'missing-account', 'missing', 7)
        raise AssertionError('expected unknown account')
    except ValueError as error:
        check(str(error) == 'unknown account', 'unknown account fails effect')
    with sqlite3.connect(db) as con:
        check(con.execute("SELECT count(*) FROM inbox WHERE event_id='missing-account'").fetchone()[0] == 0,
              'unknown account rolls back inserted inbox')
    with ThreadPoolExecutor(max_workers=12) as pool:
        results = list(pool.map(lambda _: apply_event(db, 'billing', 'concurrent', 'alice', 7), range(12)))
    check(sum(state == 'APPLIED' for state, _ in results) == 1, '12 actual SQLite duplicate contenders: one insertion/effect')
    check(all(result == 154 for _, result in results), '12 contenders return same original result')
    with sqlite3.connect(db) as con:
        check(con.execute("SELECT balance_cents FROM ledger WHERE account_id='alice'").fetchone()[0] == 154,
              'concurrent duplicate ledger delta once')
        # Executed negative control: a separately committed inbox cannot repair a lost effect.
        con.execute("INSERT INTO inbox VALUES ('broken','split','bob',9,NULL)")
        con.commit()
    try:
        apply_event(db, 'broken', 'split', 'bob', 9)
        raise AssertionError('expected invariant failure')
    except ValueError as error:
        check(str(error) == 'invariant', 'negative control: split inbox commit suppresses missing effect')

peak = Fraction(100_000_000, 86_400) * 10
byte_rate = peak * 1024
check(100_000_000 * 1024 * 7 * 3 == 2_150_400_000_000, 'retention bytes')
check((peak + 799) // 800 == 15, 'fifteen uniform members')
check(sum(h % 48 != h % 96 for h in range(96)) == 48, '48 to 96 remaps half')
check(sum(h % 48 != h % 49 for h in range(48 * 49)) == 48 * 48, '48 to 49 remaps 48/49')
backlog = (peak - 8000) * 60
check(round(float(backlog / (16000 - peak)), 2) == 48.45, 'drain uses net capacity')
check(round(float(byte_rate * 4 + 40_000_000) * 8 / 1_000_000, 1) == 699.3, 'network mixed load')

# Independent contract trace: decide once in a Kafka transaction.
def txn_trace(staging='ok', commits=('ok',)):
    ops = ['initTransactions', 'poll', 'begin', 'send', 'sendOffsets']
    if staging == 'fatal':
        return ops + ['close', 'stop']
    if staging == 'abortable':
        return ops + ['abort', 'close', 'recover']
    for outcome in commits:
        ops.append('commit')
        if outcome == 'ok':
            return ops + ['committed']
        if outcome != 'timeout':
            return ops + ['close', 'recover']
    return ops + ['close', 'recover_unknown']

check(txn_trace()[-1] == 'committed', 'Kafka contract model normal commit')
trace = txn_trace(commits=('timeout', 'timeout', 'ok'))
check(trace.count('commit') == 3 and 'abort' not in trace, 'Kafka contract model retries SAME commit after timeout')
trace = txn_trace(commits=('timeout',))
check(trace[-1] == 'recover_unknown' and 'abort' not in trace, 'Kafka contract model budget ends unknown, not aborted')
check('abort' in txn_trace(staging='abortable'), 'Kafka contract model precommit abortable branch')
check('abort' not in txn_trace(staging='fatal'), 'Kafka contract model fatal producer closes')

result = {'passed': True, 'checks': checks, 'checkCount': len(checks),
          'javaOutput': java_result.stdout.strip(), 'sqliteVersion': sqlite3.sqlite_version,
          'files': {'chapters/ch20.html': digest(ROOT / 'chapters/ch20.html'),
                    **{str(f.relative_to(ROOT)): digest(f) for f in sorted(HERE.iterdir()) if f.is_file()}},
          'limits': ['No Kafka cluster or real group/rebalance adapter was executed.',
                     'SQLite uses BEGIN IMMEDIATE, not PostgreSQL row locking/READ COMMITTED.',
                     'Transaction traces are independent contract models, not Kafka executions.']}
(ROOT / 'docs/reviews/ch20-code-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({k: result[k] for k in ['passed', 'checkCount', 'javaOutput', 'sqliteVersion']}, ensure_ascii=False))
