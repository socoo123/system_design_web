#!/usr/bin/env python3
"""Real SQLite files and source-extracted SQL, not a distributed DB proof."""
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import threading
import uuid

ROOT = Path(__file__).resolve().parent

def statements(file):
    lines = (ROOT / file).read_text().splitlines(); result = []
    for i, line in enumerate(lines):
        if 'SQL ' not in line: continue
        sql = line.split('SQL ', 1)[1]
        for extra in lines[i + 1:]:
            if extra.strip().startswith(('VALUES ', 'ON CONFLICT ', 'WHERE ')):
                sql += ' ' + extra.strip()
            else: break
        result.append(sql)
    return result

A, C = statements('accept.pseudo'), statements('consume.pseudo')
assert len(A) == 5 and len(C) == 3, (A, C)

def connect(db):
    c = sqlite3.connect(db, timeout=2)
    c.execute('PRAGMA foreign_keys=ON')
    c.execute('PRAGMA synchronous=FULL')
    return c

def digest(value): return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()
def identity(*values):
    if any(not isinstance(v, str) or not v.strip() or v != v.strip() for v in values):
        raise ValueError('invalid identity')

def accept(db, k, body, *, tenant='t1', operation='CREATE', rollback=False):
    identity(tenant, operation, k)
    c = connect(db)
    p = dict(tenant=tenant, operation=operation, K=k, digest=digest(body), new_id=str(uuid.uuid4()))
    try:
        c.execute('BEGIN')
        won = c.execute(A[0], p).fetchone()
        if not won:
            old = c.execute(A[1], p).fetchone()
            assert old, 'UNKNOWN, never absence'
            if old[0] != p['digest']: raise ValueError('CONFLICT')
            c.rollback(); return (old[1], old[2])
        c.execute(A[2], p); c.execute(A[3], p)
        p['result'] = json.dumps(dict(order_id=p['new_id'], state='ACCEPTED'))
        c.execute(A[4], p)
        if rollback: raise RuntimeError('crash before commit')
        c.commit(); return (p['new_id'], p['result'])
    except BaseException:
        c.rollback(); raise
    finally: c.close()

def consume(db, event_id, delta, *, account_id='a1', rollback=False):
    identity('t1', 'points', event_id)
    c = connect(db)
    p = dict(tenant='t1', consumer='points', event_id=event_id, delta=delta,
             account_id=account_id, digest=digest([account_id, delta]))
    try:
        c.execute('BEGIN')
        won = c.execute(C[0], p).fetchone()
        if not won:
            old = c.execute(C[1], p).fetchone(); assert old
            if old[0] != p['digest']: raise ValueError('CONFLICT')
            c.rollback(); return old[1]
        if c.execute(C[2], p).rowcount != 1: raise ValueError('MISSING_ACCOUNT')
        if rollback: raise RuntimeError('crash before commit')
        c.commit(); return delta
    except BaseException:
        c.rollback(); raise
    finally: c.close()

def expect(error, f):
    try: f()
    except error: return
    raise AssertionError('expected ' + str(error))

def counts(db):
    with connect(db) as c:
        return [c.execute('SELECT count(*) FROM ' + t).fetchone()[0] for t in ['orders','intents','outbox','inbox']]

def concurrent(action):
    barrier = threading.Barrier(2); results=[]; errors=[]
    def work():
        try: barrier.wait(); results.append(action())
        except BaseException as e: errors.append(str(e))
    ts=[threading.Thread(target=work) for _ in range(2)]
    for t in ts: t.start()
    for t in ts: t.join()
    assert not errors, errors
    assert len(results)==2 and results[0] == results[1], results

if len(sys.argv)>1 and sys.argv[1]=='--commit-exit':
    db=sys.argv[2]
    accept(db, 'lost-ack', {'sku':7}); consume(db, 'crash-event', 11)
    os._exit(0)  # committed process exits without delivering application ACKs

with tempfile.TemporaryDirectory(prefix='ch44-tx-') as temp:
    db=Path(temp)/'orders.db'
    with connect(db) as c:
        c.execute('PRAGMA journal_mode=WAL'); c.executescript((ROOT/'schema.sql').read_text())
        c.execute("INSERT INTO accounts VALUES ('t1','a1',100)")
    first=accept(db,'k17',{'sku':1}); assert accept(db,'k17',{'sku':1})==first
    expect(ValueError, lambda: accept(db,'k17',{'sku':2}))
    before=counts(db)
    expect(RuntimeError, lambda: accept(db,'aborted',{'sku':3},rollback=True))
    assert counts(db)==before
    concurrent(lambda: accept(db,'raced',{'sku':4})); assert counts(db)[:3]==[2,2,2]
    other=accept(db,'k17',{'sku':1},tenant='t2'); assert other!=first
    for bad in [None,'','   ',' spaced ']:
        expect(ValueError, lambda bad=bad: accept(db,bad,{'sku':1}))
    with connect(db) as c:
        for bad in [None,'','  ']:
            expect(sqlite3.IntegrityError, lambda bad=bad: c.execute(
                "INSERT INTO intents VALUES ('t1','CREATE',?,'d','none',NULL)",(bad,)))
        c.rollback()
    assert consume(db,'e17',7)==7 and consume(db,'e17',7)==7
    expect(ValueError, lambda: consume(db,'e17',8))
    before=counts(db); expect(ValueError,lambda: consume(db,'missing',9,account_id='missing'))
    expect(RuntimeError,lambda: consume(db,'abort-event',9,rollback=True)); assert counts(db)==before
    concurrent(lambda: consume(db,'raced-event',3))
    subprocess.run([sys.executable,__file__,'--commit-exit',str(db)],check=True)
    lost=accept(db,'lost-ack',{'sku':7}); assert lost==accept(db,'lost-ack',{'sku':7})
    assert consume(db,'crash-event',11)==11
    with connect(db) as c:
        c.execute("UPDATE intents SET result=NULL WHERE k='lost-ack'")
    assert accept(db,'lost-ack',{'sku':7})==(lost[0],None), 'trimmed result retains identity'
    with connect(db) as c:
        points=c.execute("SELECT points FROM accounts WHERE tenant='t1' AND account_id='a1'").fetchone()[0]
        assert points==121, points
        for bad in [None,'','  ']:
            expect(sqlite3.IntegrityError,lambda bad=bad:c.execute(
                "INSERT INTO inbox VALUES ('t1','points',?,'d',1)",(bad,)))
        c.rollback()
    assert counts(db)==[4,4,4,3], counts(db)
    print(json.dumps({'passed':True,'sqlite':sqlite3.sqlite_version,'sqlFromSources':8,
        'cases':['normal/replay','payload-conflict','precommit-rollback','two-connection-key-race',
                 'tenant-scope','NULL/empty-app-and-DB','inbox-local-effect','inbox-conflict',
                 'missing-account-rollback','two-connection-inbox-race','committed-subprocess-exit',
                 'lost-ACK-replay','trimmed-result-identity'], 'counts':counts(db),'points':points}))
