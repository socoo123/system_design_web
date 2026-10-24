#!/usr/bin/env python3
"""Meaningful local DB/contract counterexamples, with explicit fixture limits."""
import sys
sys.dont_write_bytecode = True
import json
import sqlite3
import tempfile
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from model import Store, Conflict, Crash, ProviderFixture, VerifiedQuote

results = []

def check(name, assertion):
    assert assertion, name
    results.append({'name': name, 'passed': True})

def rejects(name, error, action):
    try:
        action()
    except error:
        results.append({'name': name, 'passed': True})
    else:
        raise AssertionError(name + ': did not reject')

with tempfile.TemporaryDirectory(prefix='ch24-') as tmp:
    file = Path(tmp) / 'payments.sqlite'
    s = Store(file); s.install()
    rejects('pre-commit crash rolls back acceptance', Crash, lambda: s.create('crash', crash=True))
    check('no orphan payment/attempt/command after rollback', s.count('payment') == s.count('attempt') == s.count('outbox') == 0)
    rejects('boolean create amount is not an integer money value', Conflict, lambda: s.create('bool', amount=True))
    rejects('overflow create amount rejected', Conflict, lambda: s.create('overflow', amount=2**63))
    p = s.create('k1')
    check('create commits intent+attempt+channel command', s.count('payment') == s.count('attempt') == s.count('outbox') == 1)
    check('lost acceptance response resolves same key', s.create('k1') == p)
    check('rotated header still resolves same business intent', s.create('k2') == p and s.count('attempt') == 1)
    rejects('same key changed amount conflicts', Conflict, lambda: s.create('k1', amount=20000))
    rejects('same business intent changed method conflicts', Conflict, lambda: s.create('k3', method='other'))
    quote = VerifiedQuote('live', 'm1', 'o1', 1, 10000, 'CNY', 'hosted')
    raw = {'order': 'o1', 'businessVersion': 1, 'method': 'hosted', 'amount': 1}
    check('raw request takes amount from authorized quote', s.create_request('raw-key', raw, quote) == p)
    rejects('raw body increment cannot authorize business version 2', Conflict,
            lambda: s.create_request('raw-new-version', dict(raw, businessVersion=2), quote))
    rejects('raw body method cannot override authorized quote', Conflict,
            lambda: s.create_request('raw-new-method', dict(raw, method='unapproved'), quote))
    rejects('raw version bool is rejected despite Python int equality', Conflict,
            lambda: s.create_request('raw-bool-version', dict(raw, businessVersion=True), quote))
    rejects('quote cannot be reused by another authenticated merchant', Conflict,
            lambda: s.create_request('raw-foreign', raw, quote, merchant='m2'))
    check('raw mutation created no second intent or provider attempt', s.count('payment') == 1 and s.count('attempt') == 1)
    foreign = s.create('k1', merchant='m2', order='o2', account='acct2')
    check('request-key merchant scopes independent', foreign != p)

    barrier = threading.Barrier(2)
    def concurrent_create(i):
        db = Store(file)
        try:
            barrier.wait(); return db.create('parallel', order='parallel')
        finally: db.close()
    with ThreadPoolExecutor(max_workers=2) as pool:
        created = list(pool.map(concurrent_create, range(2)))
    check('two DB clients create one intent/attempt', created[0] == created[1] and s.count('attempt') == 3)

    attempt = p + ':a7'; send = s.prepare_send(attempt, 100, 1000)
    check('SENT durable before external call', s.one('SELECT state FROM attempt WHERE attempt_id=?', (attempt,))['state'] == 'SENT')
    provider = ProviderFixture()
    provider.call(send['key'], send['hash'])  # reply is lost
    s.apply_non_success(attempt)
    check('lost response keeps UNKNOWN', s.one('SELECT state FROM attempt WHERE attempt_id=?', (attempt,))['state'] == 'UNKNOWN')
    repeated = s.prepare_send(attempt, 200, 1000)
    provider.call(repeated['key'], repeated['hash'])
    check('within-window repeated fixture request moves once', provider.moves == 1 and repeated['retry_before'] == 1100)
    check('retry window never slides on replay', s.prepare_send(attempt, 1100, 1000) is None)
    e = s.evidence(p); journal = s.post_capture(e)
    s.apply_non_success(attempt)
    check('late timeout cannot downgrade CONFIRMED', s.one('SELECT state FROM attempt WHERE attempt_id=?', (attempt,))['state'] == 'CONFIRMED')
    check('terminal attempt is not redispatched', s.prepare_send(attempt, 300) is None)

    fixture = ProviderFixture()
    check('ambiguous 500 is cached in v1 fixture', fixture.call('500-key', 'body', True) == fixture.call('500-key', 'body') == 'AMBIGUOUS_500' and fixture.moves == 1)
    rejects('provider fixture rejects changed payload', Conflict, lambda: fixture.call('500-key', 'changed'))
    rejects('invalid signature fixture cannot enter inbox', Conflict, lambda: s.receive('bad', {}, verified=False))
    check('no accepted invalid inbox', s.count('inbox') == 0)
    check('inbox commit precedes returned ACK', s.receive('evt8', e) == '2xx' and s.count('inbox') == 1)
    s.receive('evt8', e); s.receive('evt9', e)
    check('event duplicate and distinct event same capture separate', s.count('inbox') == 2 and s.post_capture(e) == journal)
    check('capture has exactly two entries and one paid outbox', s.one("SELECT count(*) n FROM entry WHERE posting_id=?", (journal,))['n'] == 2 and s.one("SELECT count(*) n FROM outbox WHERE kind='PAYMENT_PAID'")['n'] == 1)
    bad_amount = dict(e, amount=20000)
    rejects('balanced but wrong capture amount rejected', Conflict, lambda: s.post_capture(bad_amount))
    rejects('wrong provider account rejected', Conflict, lambda: s.post_capture(dict(e, account_id='attacker')))
    rejects('wrong currency rejected', Conflict, lambda: s.post_capture(dict(e, currency='JPY')))
    rejects('a second capture object does not silently post', Conflict, lambda: s.post_capture(dict(e, object_id='c10')))

    q = s.create('q', order='q')
    before = (s.count('posting'), s.count('entry'), s.count('outbox'))
    rejects('crash between journal entries rolls back everything', Crash, lambda: s.post_capture(s.evidence(q, 'cq'), crash=True))
    check('partial journal/state/outbox do not survive', before == (s.count('posting'), s.count('entry'), s.count('outbox')) and s.one('SELECT captured FROM payment WHERE pay_no=?', (q,))['captured'] == 0)
    rejects('unbalanced journal rejects whole transaction', Conflict, lambda: s.post_capture(s.evidence(q, 'cq'), credit_delta=1))
    rejects('same external capture cannot bind a second payment', Conflict, lambda: s.post_capture(s.evidence(q, 'c9')))
    s.post_capture(s.evidence(q, 'cq'))

    rejects('boolean refund amount rejected', Conflict, lambda: s.reserve_refund('bool-refund', p, True))
    r0 = s.reserve_refund('r0', p, 3000); s.refund_result(r0, 'r0-external', 'SUCCEEDED')
    r1 = s.reserve_refund('r1', p, 2000)
    s.refund_result(r1, 'r1-external')
    state = s.one('SELECT * FROM payment WHERE pay_no=?', (p,))
    check('UNKNOWN preserves 2000 reservation and 5000 availability', state['refunded'] == 3000 and state['reserved'] == 2000 and state['captured'] - state['refunded'] - state['reserved'] == 5000)
    rejects('6000 refund exceeds available 5000', Conflict, lambda: s.reserve_refund('too-large', p, 6000))
    check('same refund key does not reserve twice', s.reserve_refund('r1', p, 2000) == r1)
    rejects('same refund key changed amount conflicts', Conflict, lambda: s.reserve_refund('r1', p, 1000))
    rejects('cross-merchant refund rejected', Conflict, lambda: s.reserve_refund('foreign', p, 100, merchant='m2'))
    before = (s.count('posting'), s.count('entry'), s.count('outbox'))
    rejects('refund crash rolls back journal and reservation conversion', Crash, lambda: s.refund_result(r1, 'r1-external', 'SUCCEEDED', crash=True))
    check('refund remains reserved after failed commit', before == (s.count('posting'), s.count('entry'), s.count('outbox')) and s.one('SELECT reserved FROM payment WHERE pay_no=?', (p,))['reserved'] == 2000)
    s.refund_result(r1, 'r1-external', 'SUCCEEDED'); s.refund_result(r1, 'r1-external', 'SUCCEEDED'); s.refund_result(r1, 'r1-external', 'FAILED')
    state = s.one('SELECT * FROM payment WHERE pay_no=?', (p,))
    check('success/duplicate/late failure never double converts reservation', state['refunded'] == 5000 and state['reserved'] == 0)
    barrier = threading.Barrier(2)
    def concurrent_refund(i):
        db = Store(file)
        try:
            barrier.wait()
            try: return db.reserve_refund('race' + str(i), q, 6000)
            except Conflict: return 'REJECTED'
        finally: db.close()
    with ThreadPoolExecutor(max_workers=2) as pool:
        refunds = list(pool.map(concurrent_refund, range(2)))
    check('two clients cannot both reserve last 6000 of 10000', refunds.count('REJECTED') == 1 and s.one('SELECT reserved FROM payment WHERE pay_no=?', (q,))['reserved'] == 6000)
    race_refund = next(r for r in refunds if r != 'REJECTED')
    s.refund_result(race_refund, 'race-external', 'FAILED'); s.refund_result(race_refund, 'race-external', 'FAILED')
    check('final no-refund releases once', s.one('SELECT reserved FROM payment WHERE pay_no=?', (q,))['reserved'] == 0)

    pending_pay = s.create('pending', order='pending')
    s.receive('refund-before-capture', {'pay': pending_pay, 'kind': 'REFUND'})
    check('out-of-order receipt invents no capture', s.one('SELECT captured FROM payment WHERE pay_no=?', (pending_pay,))['captured'] == 0)
    recon_e = s.evidence(pending_pay, 'recon-capture')
    count = s.count('posting')
    rejects('recon crash after financial commit retains case', Crash, lambda: s.reconcile_capture('recon-case', recon_e, True))
    s.reconcile_capture('recon-case', recon_e)
    check('recon rerun closes case without another posting', s.count('posting') == count + 1 and s.one('SELECT * FROM review WHERE case_key=?', ('recon-case',)) is None)
    rejects('journal entries cannot be updated', sqlite3.IntegrityError, lambda: s.db.execute('UPDATE entry SET amount=1 WHERE posting_id=?', (journal,)))
    rejects('journal headers cannot be deleted', sqlite3.IntegrityError, lambda: s.db.execute('DELETE FROM posting WHERE posting_id=?', (journal,)))
    # Every PK is explicitly NOT NULL, including SQLite TEXT primary keys.
    for table, col in [('payment','pay_no'),('attempt','attempt_id'),('posting','posting_id'),('refund','refund_id'),('outbox','event_id'),('review','case_key')]:
        row = next(r for r in s.db.execute('PRAGMA table_info(' + table + ')') if r['name'] == col)
        check(table + ' primary identity explicitly NOT NULL', row['notnull'] == 1)
        columns = [r['name'] for r in s.db.execute('PRAGMA table_info(' + table + ')')]
        values = list(s.one('SELECT * FROM ' + table + ' LIMIT 1'))
        values[columns.index(col)] = None
        try:
            s.db.execute('INSERT INTO ' + table + ' VALUES (' + ','.join('?' for _ in columns) + ')', values)
        except sqlite3.IntegrityError as exc:
            check(table + ' actual NULL primary identity rejected first', 'NOT NULL' in str(exc))
        else:
            raise AssertionError(table + ' accepted NULL')
    rejects('NULL request scope rejected by SQLite', sqlite3.IntegrityError, lambda: s.db.execute('INSERT INTO request_key VALUES (NULL,?,?,?,?,?)', ('m','CREATE','k','d','r')))
    rejects('NULL TEXT primary key rejected by SQLite', sqlite3.IntegrityError, lambda: s.db.execute('INSERT INTO review VALUES (NULL,?)', ('evidence',)))
    check('all committed journals balance per journal/currency', not s.db.execute("SELECT posting_id,currency FROM entry GROUP BY posting_id,currency HAVING sum(CASE side WHEN 'DR' THEN amount ELSE -amount END)<>0 OR count(*)<2").fetchall())
    check('all payment refund bounds hold', s.one('SELECT count(*) n FROM payment WHERE refunded<0 OR reserved<0 OR refunded+reserved>captured')['n'] == 0)
    s.close()

print(json.dumps({'passed': True, 'checks': results, 'limits': ['SQLite local transaction/constraint semantics only; not PostgreSQL failover', 'Provider fixture assumes its key contract; no real PSP, SDK signature, deadline or network proof', 'No performance/load/fault-injection-on-live-provider test']}, ensure_ascii=False, indent=2))
