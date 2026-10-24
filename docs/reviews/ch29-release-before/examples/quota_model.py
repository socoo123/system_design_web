"""Actual local SQLite adaptation of reject.pseudo; two databases, not a cluster."""
from pathlib import Path
import sqlite3
from contextlib import contextmanager

@contextmanager
def transaction(path):
    db = sqlite3.connect(path, isolation_level=None, timeout=10)
    db.execute('PRAGMA foreign_keys=ON')
    try:
        db.execute('BEGIN IMMEDIATE')
        yield db
        db.execute('COMMIT')
    except BaseException:
        if db.in_transaction: db.execute('ROLLBACK')
        raise
    finally:
        db.close()

class Model:
    def __init__(self, directory):
        self.authority = str(Path(directory)/'attempt.sqlite')
        self.quota = str(Path(directory)/'quota.sqlite')
        with transaction(self.authority) as db:
            db.execute('CREATE TABLE IF NOT EXISTS attempt(id TEXT PRIMARY KEY, owner TEXT NOT NULL, state TEXT NOT NULL, status INTEGER, reason TEXT)')
            db.execute('CREATE TABLE IF NOT EXISTS settlement(id TEXT PRIMARY KEY REFERENCES attempt(id), acked INTEGER NOT NULL DEFAULT 0)')
        with transaction(self.quota) as db:
            db.execute('CREATE TABLE IF NOT EXISTS reservation(id TEXT PRIMARY KEY, units INTEGER NOT NULL, state TEXT NOT NULL, refunds INTEGER NOT NULL DEFAULT 0)')

    def seed(self, attempt, owner='boot7/gen11', units=512):
        # Fixture provisioning is complete before public enqueue; not a cross-DB transaction.
        with transaction(self.authority) as db:
            db.execute("INSERT INTO attempt VALUES(?,?,'ASSIGNED',NULL,NULL)", (attempt,owner))
        with transaction(self.quota) as db:
            db.execute("INSERT INTO reservation VALUES(?,?,'RESERVED',0)",(attempt,units))

    def reject(self, attempt, owner='boot7/gen11', fail=False):
        with transaction(self.authority) as db:
            row = db.execute('SELECT owner,state,status,reason FROM attempt WHERE id=?',(attempt,)).fetchone()
            if row[1] == 'TERMINAL': return (row[2],row[3])
            if row[0] != owner or row[1] != 'ASSIGNED': return (202,'PENDING')
            changed = db.execute("UPDATE attempt SET state='TERMINAL',status=429,reason='OVERLOADED' WHERE id=? AND owner=? AND state='ASSIGNED'",(attempt,owner)).rowcount
            assert changed == 1
            if fail: raise RuntimeError('injected before settlement intent')
            db.execute('INSERT INTO settlement(id) VALUES(?)',(attempt,))
        return (429,'OVERLOADED')

    def enqueue(self, attempt, full):
        with transaction(self.authority) as db:
            row = db.execute('SELECT state,status,reason FROM attempt WHERE id=?',(attempt,)).fetchone()
            if row[0] == 'TERMINAL': return (row[1],row[2])
            if row[0] != 'ASSIGNED': return (202,'PENDING')
        return self.reject(attempt) if full else (202,'QUEUED')

    def grant(self, attempt, owner='boot7/gen11'):
        with transaction(self.authority) as db:
            db.execute("UPDATE attempt SET state='RUN_GRANTED' WHERE id=? AND owner=? AND state='ASSIGNED'",(attempt,owner))
            row = db.execute('SELECT state,owner FROM attempt WHERE id=?',(attempt,)).fetchone()
            return row == ('RUN_GRANTED',owner)

    def deliver(self, attempt, lose_ack=False):
        with transaction(self.authority) as db:
            row = db.execute('SELECT acked FROM settlement WHERE id=?',(attempt,)).fetchone()
            if row is None or row[0]: return False
        with transaction(self.quota) as db:
            db.execute("UPDATE reservation SET state='RELEASED',refunds=refunds+1 WHERE id=? AND state='RESERVED'",(attempt,))
        if lose_ack: return True               # quota committed, relay progress not committed
        with transaction(self.authority) as db:
            db.execute('UPDATE settlement SET acked=1 WHERE id=?',(attempt,))
        return True

    def snapshot(self, attempt):
        with transaction(self.authority) as db:
            a = db.execute('SELECT state,status,reason FROM attempt WHERE id=?',(attempt,)).fetchone()
            event = db.execute('SELECT acked FROM settlement WHERE id=?',(attempt,)).fetchone()
        with transaction(self.quota) as db:
            q = db.execute('SELECT units,state,refunds FROM reservation WHERE id=?',(attempt,)).fetchone()
        return (a,event,q)
