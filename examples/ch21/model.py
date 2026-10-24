"""SQLite contract model; BEGIN IMMEDIATE is coarser than PostgreSQL row locks.

The injected SQL model_now() models authoritative time sampled under the write lock.
It is NOT an implementation of server clock synchronization, Redis, payment or auth.
"""
from contextlib import contextmanager
from hashlib import sha256
import json
from pathlib import Path
import sqlite3
import time
from uuid import uuid4


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'))


def digest(value):
    return sha256(canonical(value).encode()).hexdigest()


class Rejected(Exception):
    pass


class UnknownCommit(Exception):
    pass


class OutOfStock(Exception):
    pass


class Model:
    OP = 'CREATE_HOLD'

    def __init__(self, filename, clock=None):
        self.filename = str(filename)
        self.clock = clock or (lambda: int(time.time()))

    @staticmethod
    def require(ok, reason):
        if not ok:
            raise Rejected(reason)

    def connect(self):
        conn = sqlite3.connect(self.filename, timeout=15, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA foreign_keys=ON')
        conn.create_function('model_now', 0, self.clock)
        return conn

    def initialize(self):
        with self.connect() as conn:
            conn.executescript(Path(__file__).with_name('schema.sql').read_text())

    @contextmanager
    def transaction(self):
        conn = self.connect()
        conn.execute('BEGIN IMMEDIATE')
        try:
            yield conn
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
        finally:
            conn.close()

    def seed(self, scope, stock, gated=False, epoch=7):
        self.require(not gated or len(stock) == 1, 'one_sku_gate')
        with self.transaction() as conn:
            conn.execute('INSERT INTO fences VALUES(?,?,?,?,NULL,NULL)', (scope, epoch, 1, int(gated)))
            conn.executemany('INSERT INTO stock(scope,resource,cap,free) VALUES(?,?,?,?)',
                             [(scope, resource, cap, cap) for resource, cap in sorted(stock.items())])

    def normalize(self, owner, key, intent):
        self.require(isinstance(owner, str) and 0 < len(owner) <= 128, 'owner')
        self.require(isinstance(key, str) and 0 < len(key) <= 128, 'key')
        self.require(isinstance(intent,dict) and set(intent) == {'scope', 'items', 'order_id', 'policy_version'}, 'intent_fields')
        self.require(all(isinstance(intent[k], str) and intent[k] for k in ['scope','order_id','policy_version']), 'binding')
        raw = intent['items']
        self.require(isinstance(raw, (list, tuple)) and 0 < len(raw) <= 31, 'items')
        self.require(all(isinstance(i, (tuple,list)) and len(i) == 2 and isinstance(i[0],str)
                         and i[0] and type(i[1]) is int and 1 <= i[1] <= 10000 for i in raw), 'quantity')
        self.require(len({i[0] for i in raw}) == len(raw), 'duplicate_resource')
        normalized = dict(intent, items=sorted([list(i) for i in raw]))
        return normalized, digest([owner, self.OP, normalized]), digest([owner, self.OP, key])

    def fence(self, conn, scope, epoch=None):
        f = conn.execute('SELECT * FROM fences WHERE scope=?', (scope,)).fetchone()
        self.require(f is not None and f['active'], 'paused')
        self.require(not f['gated'] or f['epoch'] == epoch, 'epoch')
        return f

    @staticmethod
    def event(conn, event_id, scope, epoch, token, principal, hash_, q, version, state, hold_id=None):
        kind = 'REQUEST_TERMINAL' if hold_id is None else 'HOLD_STATE'
        Model.require((hold_id is None and state in ('REJECTED','CANCELLED') and version == 1)
                      or (isinstance(hold_id,str) and bool(hold_id.strip()) and state in ('HELD','CONFIRMED','RELEASED')),
                      'event_kind_binding')
        payload = {'kind':kind,'scope':scope,'token':token,'principal':principal,'digest':hash_,'q':q,'v':version,
                   'state':state,'hold_id':hold_id,'epoch':epoch}
        conn.execute('INSERT INTO outbox(event_id,kind,scope,epoch,payload) VALUES(?,?,?,?,?)',
                     (event_id,kind,scope,epoch,canonical(payload)))
        if kind == 'HOLD_STATE':
            conn.execute('INSERT INTO deliveries VALUES(?,?,0)', (event_id,'orders'))
        if conn.execute('SELECT gated FROM fences WHERE scope=?', (scope,)).fetchone()[0]:
            conn.execute('INSERT INTO deliveries VALUES(?,?,0)', (event_id,'redis_gate'))

    def create(self, owner, key, intent, epoch=None, fail_after=None, ack_lost=False, after_claim=None):
        intent, hash_, token = self.normalize(owner, key, intent)
        scope, items = intent['scope'], intent['items']
        with self.transaction() as conn:
            f = self.fence(conn, scope, epoch)
            if f['gated']:
                resources = [r[0] for r in conn.execute('SELECT resource FROM stock WHERE scope=?', (scope,))]
                self.require(len(items) == 1 and [items[0][0]] == resources, 'gate_binding')
            inserted = conn.execute('INSERT INTO requests VALUES(?,?,?,?,?,?,?,?,?,?) '
                                    'ON CONFLICT(owner,op,request_key) DO NOTHING',
                                    (owner,self.OP,key,scope,hash_,token,canonical(intent),'CLAIMED',None,None)).rowcount
            if not inserted:
                row = conn.execute('SELECT * FROM requests WHERE owner=? AND op=? AND request_key=?',
                                   (owner,self.OP,key)).fetchone()
                self.require(row['digest'] == hash_, 'identity_conflict')
                return json.loads(row['receipt'])
            if after_claim:
                after_claim()
            conn.execute('SAVEPOINT allocation')
            hid = str(uuid4())
            try:
                conn.execute('INSERT INTO holds VALUES(?,?,?,?,?,?,?,?,?,?)',
                             (hid,owner,intent['order_id'],scope,hash_,token,canonical(items),0,'HELD',1))
                for index, (resource, q) in enumerate(items):
                    n = conn.execute('UPDATE stock SET free=free-?,reserved=reserved+? '
                                     'WHERE scope=? AND resource=? AND free>=?', (q,q,scope,resource,q)).rowcount
                    if n != 1:
                        raise OutOfStock()
                    conn.execute('INSERT INTO hold_items VALUES(?,?,?,?)', (hid,scope,resource,q))
                    if fail_after == index + 1:
                        raise Rejected('injected_abort')
            except OutOfStock:
                conn.execute('ROLLBACK TO SAVEPOINT allocation')
                receipt = {'http':409,'result':'REJECTED'}
                conn.execute('UPDATE requests SET outcome=?,receipt=? WHERE owner=? AND op=? AND request_key=?',
                             ('REJECTED',canonical(receipt),owner,self.OP,key))
                self.event(conn, token+':rejected',scope,f['epoch'],token,owner,hash_,items[0][1],1,'REJECTED')
            else:
                deadline = conn.execute('SELECT model_now()+900').fetchone()[0]
                conn.execute('UPDATE holds SET deadline=? WHERE hold_id=?', (deadline,hid))
                receipt = {'http':201,'hold_id':hid,'result':'HELD','deadline':deadline}
                conn.execute('UPDATE requests SET outcome=?,hold_id=?,receipt=? WHERE owner=? AND op=? AND request_key=?',
                             ('CREATED',hid,canonical(receipt),owner,self.OP,key))
                self.event(conn,hid+':1',scope,f['epoch'],token,owner,hash_,items[0][1],1,'HELD',hid)
            conn.execute('RELEASE SAVEPOINT allocation')
        if ack_lost:
            raise UnknownCommit('committed_but_ack_lost')
        return receipt

    def query(self, owner, key):
        with self.connect() as conn:
            r = conn.execute('SELECT * FROM requests WHERE owner=? AND op=? AND request_key=?',
                             (owner,self.OP,key)).fetchone()
            if not r:
                return None
            h = conn.execute('SELECT state,version FROM holds WHERE hold_id=?', (r['hold_id'],)).fetchone()
            return {'original_receipt':json.loads(r['receipt']), 'current':dict(h) if h else r['outcome']}

    def resolve_or_cancel(self, owner, key, intent, epoch=None):
        intent, hash_, token = self.normalize(owner,key,intent)
        scope, items = intent['scope'], intent['items']
        with self.transaction() as conn:
            f = self.fence(conn,scope,epoch)
            receipt = {'http':409,'result':'CANCELLED'}
            n = conn.execute('INSERT INTO requests VALUES(?,?,?,?,?,?,?,?,?,?) '
                             'ON CONFLICT(owner,op,request_key) DO NOTHING',
                             (owner,self.OP,key,scope,hash_,token,canonical(intent),'CANCELLED',None,canonical(receipt))).rowcount
            if n:
                self.event(conn,token+':cancelled',scope,f['epoch'],token,owner,hash_,items[0][1],1,'CANCELLED')
                return {'original_receipt':receipt,'current':'CANCELLED'}
            r = conn.execute('SELECT * FROM requests WHERE owner=? AND op=? AND request_key=?',
                             (owner,self.OP,key)).fetchone()
            self.require(r['digest'] == hash_, 'identity_conflict')
            h = conn.execute('SELECT state,version FROM holds WHERE hold_id=?', (r['hold_id'],)).fetchone()
            return {'original_receipt':json.loads(r['receipt']), 'current':dict(h) if h else r['outcome']}

    def finish(self, hid, kind, owner, order_id, fail_after=None):
        self.require(kind in ('CONFIRM','EXPIRE'), 'command')
        with self.transaction() as conn:
            h = conn.execute('SELECT * FROM holds WHERE hold_id=?', (hid,)).fetchone()
            self.require(h is not None, 'missing_hold')
            # PG: locate immutable scope before BEGIN; lock fence FOR SHARE, then hold FOR UPDATE.
            f = self.fence(conn,h['scope'],self._epoch(conn,h['scope']))
            self.require(h['owner'] == owner and h['order_id'] == order_id, 'command_binding')
            if h['state'] != 'HELD':
                return h['state']
            now = conn.execute('SELECT model_now()').fetchone()[0]
            if kind == 'CONFIRM' and now >= h['deadline']:
                return 'EXPIRED_NOT_CONFIRMED'
            if kind == 'EXPIRE' and now < h['deadline']:
                return 'NOT_DUE'
            items = conn.execute('SELECT scope,resource,q FROM hold_items WHERE hold_id=? ORDER BY resource', (hid,)).fetchall()
            self.require(all(i['scope'] == h['scope'] for i in items) and [[i['resource'],i['q']] for i in items] == json.loads(h['expected_items']), 'ownership_mismatch')
            target = 'CONFIRMED' if kind == 'CONFIRM' else 'RELEASED'
            self.require(conn.execute('UPDATE holds SET state=?,version=version+1 WHERE hold_id=? AND state=?',
                                      (target,hid,'HELD')).rowcount == 1, 'transition_lost')
            for index, item in enumerate(items):
                q, resource = item['q'], item['resource']
                column = 'confirmed' if target == 'CONFIRMED' else 'free'
                n = conn.execute(f'UPDATE stock SET reserved=reserved-?,{column}={column}+? '
                                 'WHERE scope=? AND resource=? AND reserved>=?',
                                 (q,q,h['scope'],resource,q)).rowcount
                self.require(n == 1, 'counter_mismatch')
                if fail_after == index + 1:
                    raise Rejected('injected_abort')
            self.event(conn,hid+':2',h['scope'],f['epoch'],h['token'],owner,h['digest'],items[0]['q'],2,target,hid)
            return target

    @staticmethod
    def _epoch(conn,scope):
        return conn.execute('SELECT epoch FROM fences WHERE scope=?', (scope,)).fetchone()[0]

    def pause(self,scope):
        with self.transaction() as conn:
            recovery_id = str(uuid4())
            n = conn.execute('UPDATE fences SET active=0,epoch=epoch+1,recovery_id=?,snapshot_hash=NULL '
                             'WHERE scope=? AND gated=1', (recovery_id,scope)).rowcount
            self.require(n == 1,'gated_scope')
            return self._epoch(conn,scope), recovery_id

    def snapshot(self,scope,epoch,recovery_id):
        with self.transaction() as conn:
            f = conn.execute('SELECT * FROM fences WHERE scope=?', (scope,)).fetchone()
            self.require(not f['active'] and f['epoch'] == epoch and f['recovery_id'] == recovery_id, 'recovery_owner')
            stock = conn.execute('SELECT * FROM stock WHERE scope=?', (scope,)).fetchall()
            self.require(len(stock) == 1,'one_sku')
            s = stock[0]
            totals = dict(conn.execute('SELECT h.state,COALESCE(SUM(i.q),0) FROM holds h JOIN hold_items i '
                                      'ON h.hold_id=i.hold_id WHERE h.scope=? AND i.resource=? GROUP BY h.state',
                                      (scope,s['resource'])).fetchall())
            self.require(s['reserved'] == totals.get('HELD',0) and s['confirmed'] == totals.get('CONFIRMED',0), 'snapshot_mismatch')
            tokens = {}
            for r in conn.execute('SELECT * FROM requests WHERE scope=?', (scope,)):
                h = conn.execute('SELECT * FROM holds WHERE hold_id=?', (r['hold_id'],)).fetchone()
                state = h['state'] if h else r['outcome']
                tokens[r['token']] = {'principal':r['owner'],'digest':r['digest'],
                                      'q':json.loads(r['intent'])['items'][0][1],
                                      'state':state,'v':h['version'] if h else 1}
            payload = {'epoch':epoch,'cap':s['cap'],'free':s['free'],'tokens':tokens}
            payload['snapshot'] = digest(payload)
            conn.execute('UPDATE fences SET snapshot_hash=? WHERE scope=?', (payload['snapshot'],scope))
            return payload

    def resume(self,scope,epoch,recovery_id,redis_metadata):
        with self.transaction() as conn:
            f = conn.execute('SELECT * FROM fences WHERE scope=?', (scope,)).fetchone()
            self.require(not f['active'] and f['epoch'] == epoch and f['recovery_id'] == recovery_id, 'recovery_owner')
            self.require(f['snapshot_hash'] is not None and redis_metadata == [str(epoch),f['snapshot_hash'],'1'], 'install_not_verified')
            conn.execute('UPDATE fences SET active=1 WHERE scope=?', (scope,))

    def consume(self,event,fail=False):
        self.require(isinstance(event,dict) and event.get('kind') == 'HOLD_STATE'
                     and isinstance(event.get('hold_id'),str) and 0 < len(event['hold_id'].strip()) <= 128
                     and isinstance(event.get('id'),str) and bool(event['id'].strip())
                     and type(event.get('v')) is int and event['v'] > 0
                     and event.get('state') in ('HELD','CONFIRMED','RELEASED'), 'invalid_hold_event')
        hash_ = digest(event)
        with self.transaction() as conn:
            n = conn.execute('INSERT INTO consumer_inbox VALUES(?,?,?) ON CONFLICT DO NOTHING',
                             ('orders',event['id'],hash_)).rowcount
            if not n:
                old = conn.execute('SELECT digest FROM consumer_inbox WHERE consumer=? AND event_id=?',
                                   ('orders',event['id'])).fetchone()[0]
                self.require(old == hash_,'event_identity_conflict')
                return 'REPLAY'
            conn.execute('INSERT INTO projections VALUES(?,?,?) ON CONFLICT(hold_id) DO UPDATE SET '
                         'version=excluded.version,state=excluded.state WHERE projections.version<excluded.version',
                         (event['hold_id'],event['v'],event['state']))
            if fail:
                raise Rejected('consumer_abort')
            return 'APPLIED'

    def relay(self,event_id,destination,send,crash_before_mark=False):
        with self.connect() as conn:
            row = conn.execute('SELECT o.payload,d.sent FROM outbox o JOIN deliveries d USING(event_id) '
                               'WHERE o.event_id=? AND d.destination=?', (event_id,destination)).fetchone()
            self.require(row is not None,'missing_delivery')
            if row['sent']:
                return 'ALREADY_SENT'
            payload = json.loads(row['payload'])
        ack = send(dict(payload,id=event_id))           # explicit external adapter, outside TX
        if crash_before_mark:
            raise Rejected('relay_abort')
        if not ack:
            return 'PENDING'
        with self.transaction() as conn:
            conn.execute('UPDATE deliveries SET sent=1 WHERE event_id=? AND destination=?',
                         (event_id,destination))
        return 'SENT'

    def counts(self,scope):
        with self.connect() as conn:
            return [tuple(r) for r in conn.execute('SELECT resource,free,reserved,confirmed FROM stock '
                                                  'WHERE scope=? ORDER BY resource', (scope,))]
