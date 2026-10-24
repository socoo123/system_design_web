"""SQLite teaching adapter: real local transactions; not PostgreSQL row locks.

Authentication/membership and service transport are external contracts. Candidate
objects are internal results from candidate.lua, never trusted browser input.
"""
import contextlib
import hashlib
import json
import sqlite3
import uuid
from pathlib import Path

MAX_CENTS = 10**12


class Rejected(Exception):
    pass


class LostReply(Exception):
    pass


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def identity(value):
    if not isinstance(value, str) or not value or len(value) > 200:
        raise Rejected("BAD_ID")
    return value


def integer(value, lower=1, upper=MAX_CENTS):
    if type(value) is not int or not lower <= value <= upper:
        raise Rejected("BAD_INTEGER")
    return value


class Store:
    def __init__(self, path):
        self.path = str(path)
        with self.connect() as db:
            db.executescript(Path(__file__).with_name('schema.sql').read_text())

    def connect(self):
        db = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        db.execute('PRAGMA synchronous=FULL')
        return db

    @contextlib.contextmanager
    def transaction(self):
        db = self.connect()
        try:
            db.execute('BEGIN IMMEDIATE')  # SQLite serializes all writers.
            yield db
            db.execute('COMMIT')
        except BaseException:
            if db.in_transaction:
                db.execute('ROLLBACK')
            raise
        finally:
            db.close()

    @staticmethod
    def now(db):
        # Invoked after acquiring the real SQLite write lock, never before it.
        return int(db.execute("SELECT unixepoch('subsec')*1000").fetchone()[0])

    @staticmethod
    def emit(db, packet, kind, effect, recipient, amount, currency='CNY'):
        cmd = dict(operation_id=f'{kind}:{effect}', packet=packet, kind=kind,
                   effect=effect, recipient=recipient, cents=amount, currency=currency)
        db.execute('INSERT INTO outbox(operation_id,packet_id,payload) VALUES(?,?,?)',
                   (cmd['operation_id'], packet, encoded(cmd)))
        return cmd

    def create(self, packet, sender, key, plan, expire_at, minimum=1):
        # Fixture takes a server-generated packet ID, fixed plan and policy time.
        for v in (packet, sender, key): identity(v)
        integer(expire_at, upper=2**53-1); integer(minimum)
        if not 1 <= len(plan) <= 100: raise Rejected('BAD_COUNT')
        for sid, amount in plan: identity(sid); integer(amount, lower=minimum)
        total = sum(a for _, a in plan); integer(total)
        if len(set(s for s, _ in plan)) != len(plan): raise Rejected('DUPLICATE_SHARE')
        payload = dict(sender=sender, plan=plan, expire_at=expire_at, minimum=minimum)
        digest = encoded(payload)
        with self.transaction() as db:
            old = db.execute('SELECT * FROM creates WHERE sender=? AND request_key=?',
                             (sender, key)).fetchone()
            if old:
                if old['digest'] != digest: raise Rejected('KEY_CONFLICT')
                return old['packet_id']
            db.execute('''INSERT INTO packets(packet_id,sender,currency,total_cents,total_n,
              minimum,plan_version,remaining_cents,remaining_n,state,epoch,expire_at)
              VALUES(?,?,'CNY',?,?,?,1,?,?,'PENDING_FUND',7,?)''',
              (packet,sender,total,len(plan),minimum,total,len(plan),expire_at))
            db.executemany('INSERT INTO shares VALUES(?,?,?,?)',
                           [(packet,sid,a,i) for i,(sid,a) in enumerate(plan)])
            db.execute('INSERT INTO creates VALUES(?,?,?,?)',(sender,key,digest,packet))
            self.emit(db,packet,'fund',packet,sender,total)
            return packet

    def command(self, operation):
        with contextlib.closing(self.connect()) as db:
            r = db.execute('SELECT payload FROM outbox WHERE operation_id=?',(operation,)).fetchone()
            if not r: raise Rejected('NO_DURABLE_GRANT')
            return json.loads(r[0])

    def packet(self, packet):
        with contextlib.closing(self.connect()) as db:
            return dict(db.execute('SELECT * FROM packets WHERE packet_id=?',(packet,)).fetchone())

    def receipt(self, packet, user):
        with contextlib.closing(self.connect()) as db:
            c = db.execute('SELECT * FROM claims WHERE packet_id=? AND user_id=?',
                           (packet,user)).fetchone()
            return dict(c) if c else None

    def record_applied(self, result):
        cmd = result['command']
        if result['status'] != 'APPLIED' or cmd != self.command(cmd['operation_id']):
            raise Rejected('UNVERIFIED_RESULT')
        # The fixture result comes directly from Ledger, not an untrusted callback.
        with self.transaction() as db:
            row = db.execute('SELECT applied FROM outbox WHERE operation_id=?',
                             (cmd['operation_id'],)).fetchone()
            if row[0]: return
            if cmd['kind'] == 'fund':
                db.execute("UPDATE packets SET state='INITIALIZING' WHERE packet_id=? AND state='PENDING_FUND'",
                           (cmd['packet'],))
            elif cmd['kind'] == 'refund':
                n = db.execute("""UPDATE packets SET refund_applied=refund_pending,
                  refund_pending=0,state='EXPIRED' WHERE packet_id=? AND state='EXPIRING'
                  AND refund_pending=?""",(cmd['packet'],cmd['cents'])).rowcount
                if n != 1: raise Rejected('REFUND_RESULT_CONFLICT')
            db.execute('UPDATE outbox SET applied=1 WHERE operation_id=?',(cmd['operation_id'],))

    def claim(self, packet, user, key, epoch, sid, fail=None, locked=None):
        for v in (packet,user,key,sid): identity(v)
        integer(epoch)
        with self.transaction() as db:
            if locked: locked()
            db.execute('INSERT INTO requests VALUES(?,?,?,NULL) ON CONFLICT DO NOTHING',
                       (user,key,packet))
            req = db.execute('SELECT * FROM requests WHERE user_id=? AND request_key=?',
                             (user,key)).fetchone()
            if req['packet_id'] != packet: raise Rejected('KEY_CONFLICT')
            old = db.execute('SELECT * FROM claims WHERE packet_id=? AND user_id=?',
                             (packet,user)).fetchone()
            if old:
                db.execute('UPDATE requests SET claim_id=? WHERE user_id=? AND request_key=?',
                           (old['claim_id'],user,key))
                result = dict(old)
            else:
                p = db.execute('SELECT * FROM packets WHERE packet_id=?',(packet,)).fetchone()
                if p['state'] != 'OPEN' or not p['ready'] or p['epoch'] != epoch:
                    raise Rejected('STALE_OR_CLOSED')
                if self.now(db) >= p['expire_at']: raise Rejected('EXPIRED')
                s = db.execute('SELECT amount FROM shares WHERE packet_id=? AND share_id=?',
                               (packet,sid)).fetchone()
                if not s: raise Rejected('UNKNOWN_SHARE')
                cid = 'c'+uuid.uuid4().hex
                db.execute('INSERT INTO claims VALUES(?,?,?,?,?)',(cid,packet,user,sid,s[0]))
                n = db.execute('''UPDATE packets SET remaining_n=remaining_n-1,
                  remaining_cents=remaining_cents-? WHERE packet_id=? AND remaining_n>0
                  AND remaining_cents>=?''',(s[0],packet,s[0])).rowcount
                if n != 1: raise Rejected('INVENTORY_CONFLICT')
                if fail == 'before_outbox': raise Rejected('INJECTED_CRASH')
                self.emit(db,packet,'credit',cid,user,s[0],p['currency'])
                db.execute('UPDATE requests SET claim_id=? WHERE user_id=? AND request_key=?',
                           (cid,user,key))
                result = dict(claim_id=cid,packet_id=packet,user_id=user,share_id=sid,amount=s[0])
        if fail == 'lost_reply': raise LostReply('commit succeeded, response lost')
        return result

    def close(self, packet, fail=None, locked=None):
        with self.transaction() as db:
            if locked: locked()
            p = db.execute('SELECT * FROM packets WHERE packet_id=?',(packet,)).fetchone()
            if p['state'] in ('EXPIRING','EXPIRED'): return p['refund_pending']+p['refund_applied']
            if p['state'] not in ('INITIALIZING','OPEN','RECOVERING'): raise Rejected('NOT_FUNDED')
            if self.now(db) < p['expire_at']: raise Rejected('TOO_EARLY')
            a = p['remaining_cents']
            db.execute('''UPDATE packets SET remaining_cents=0,remaining_n=0,ready=0,
              closed_unclaimed_n=?,refund_pending=?,state=? WHERE packet_id=?''',
              (p['remaining_n'],a,'EXPIRING' if a else 'EXPIRED',packet))
            if fail == 'before_outbox': raise Rejected('INJECTED_CRASH')
            if a: self.emit(db,packet,'refund',packet,p['sender'],a,p['currency'])
            return a

    def begin_rebuild(self, packet):
        with self.transaction() as db:
            p = db.execute('SELECT * FROM packets WHERE packet_id=?',(packet,)).fetchone()
            if p['state'] not in ('OPEN','RECOVERING','INITIALIZING'): raise Rejected('NOT_REBUILDABLE')
            if self.now(db) >= p['expire_at']: raise Rejected('EXPIRED')
            epoch = p['epoch']+1
            rows = [(r[0],r[1]) for r in db.execute('''SELECT s.share_id,s.amount FROM shares s
              WHERE s.packet_id=? AND NOT EXISTS(SELECT 1 FROM claims c
              WHERE c.packet_id=s.packet_id AND c.share_id=s.share_id) ORDER BY s.ordinal''',(packet,))]
            if len(rows) != p['remaining_n'] or sum(a for _,a in rows) != p['remaining_cents']:
                raise Rejected('AUTHORITY_MISMATCH')
            token = hashlib.sha256(encoded([packet,epoch,p['plan_version'],rows,p['expire_at']]).encode()).hexdigest()
            db.execute("UPDATE packets SET epoch=?,token=?,ready=0,state='RECOVERING' WHERE packet_id=?",
                       (epoch,token,packet))
            return dict(packet=packet,epoch=epoch,token=token,deadline=p['expire_at'],shares=rows)

    def publish(self, snapshot, ready_token):
        # ready_token is returned by the Redis adapter, never a browser field.
        with self.transaction() as db:
            p = db.execute('SELECT * FROM packets WHERE packet_id=?',(snapshot['packet'],)).fetchone()
            if p['epoch'] != snapshot['epoch'] or p['token'] != ready_token or p['state'] != 'RECOVERING':
                raise Rejected('STALE_REBUILD')
            if self.now(db) >= p['expire_at']: raise Rejected('EXPIRED')
            db.execute("UPDATE packets SET state='OPEN',ready=1 WHERE packet_id=?",(snapshot['packet'],))


class Ledger:
    def __init__(self, path, authority):
        self.path, self.authority = str(path), authority
        with self.connect() as db:
            db.executescript('''
              CREATE TABLE wallets(account TEXT PRIMARY KEY NOT NULL,currency TEXT NOT NULL,cents INTEGER NOT NULL CHECK(cents>=0));
              CREATE TABLE escrows(packet TEXT PRIMARY KEY NOT NULL,sender TEXT NOT NULL,currency TEXT NOT NULL,
                funded INTEGER NOT NULL,available INTEGER NOT NULL CHECK(available>=0));
              CREATE TABLE inbox(operation_id TEXT PRIMARY KEY NOT NULL,payload TEXT NOT NULL,result TEXT NOT NULL,
                effect_kind TEXT NOT NULL,effect_id TEXT NOT NULL,UNIQUE(effect_kind,effect_id));
              CREATE TABLE entries(operation_id TEXT NOT NULL,leg INTEGER NOT NULL,account TEXT NOT NULL,
                delta INTEGER NOT NULL,PRIMARY KEY(operation_id,leg));
            ''')

    def connect(self):
        db = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA synchronous=FULL')
        return db

    def seed(self, user, cents):
        with self.connect() as db:
            db.execute("INSERT INTO wallets VALUES(?,'CNY',?)",(user,cents))

    def apply(self, cmd, fail=None):
        integer(cmd['cents']); identity(cmd['recipient'])
        if cmd['operation_id'] != f"{cmd['kind']}:{cmd['effect']}": raise Rejected('NONCANONICAL_ID')
        # Local fixture of an authenticated immutable grant lookup, not SDK auth.
        if cmd != self.authority.command(cmd['operation_id']): raise Rejected('GRANT_MISMATCH')
        db = self.connect()
        try:
            db.execute('BEGIN IMMEDIATE')
            old = db.execute('SELECT * FROM inbox WHERE operation_id=?',(cmd['operation_id'],)).fetchone()
            if old:
                if old['payload'] != encoded(cmd): raise Rejected('PAYLOAD_CONFLICT')
                db.execute('COMMIT')
                return json.loads(old['result'])
            a, user, packet, currency = cmd['cents'],cmd['recipient'],cmd['packet'],cmd['currency']
            if cmd['kind'] == 'fund':
                n = db.execute('UPDATE wallets SET cents=cents-? WHERE account=? AND currency=? AND cents>=?',
                               (a,user,currency,a)).rowcount
                if n != 1: raise Rejected('INSUFFICIENT_FUNDS')
                db.execute('INSERT INTO escrows VALUES(?,?,?,?,?)',(packet,user,currency,a,a))
                debit, credit = user, 'escrow:'+packet
            else:
                e = db.execute('SELECT * FROM escrows WHERE packet=?',(packet,)).fetchone()
                if not e or e['currency'] != currency: raise Rejected('BAD_SOURCE')
                if cmd['kind'] == 'refund' and e['sender'] != user: raise Rejected('WRONG_REFUND_OWNER')
                if cmd['kind'] not in ('credit','refund'): raise Rejected('BAD_KIND')
                n = db.execute('UPDATE escrows SET available=available-? WHERE packet=? AND available>=?',
                               (a,packet,a)).rowcount
                if n != 1: raise Rejected('ESCROW_EXHAUSTED')
                db.execute('INSERT INTO wallets VALUES(?,?,0) ON CONFLICT DO NOTHING',(user,currency))
                if db.execute('SELECT currency FROM wallets WHERE account=?',(user,)).fetchone()[0] != currency:
                    raise Rejected('CURRENCY_CONFLICT')
                db.execute('UPDATE wallets SET cents=cents+? WHERE account=?',(a,user))
                debit, credit = 'escrow:'+packet, user
            db.execute('INSERT INTO entries VALUES(?,0,?,?)',(cmd['operation_id'],debit,-a))
            if fail == 'after_one_entry': raise Rejected('INJECTED_CRASH')
            db.execute('INSERT INTO entries VALUES(?,1,?,?)',(cmd['operation_id'],credit,a))
            result = dict(status='APPLIED',command=cmd)
            db.execute('INSERT INTO inbox VALUES(?,?,?,?,?)',
                       (cmd['operation_id'],encoded(cmd),encoded(result),cmd['kind'],cmd['effect']))
            db.execute('COMMIT')
        except BaseException:
            if db.in_transaction: db.execute('ROLLBACK')
            raise
        finally:
            db.close()
        if fail == 'lost_reply': raise LostReply('ledger committed, response lost')
        return result
