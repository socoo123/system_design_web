"""Local SQLite contract adapter. BEGIN IMMEDIATE is coarser than PG row locks.

Clock, authentication, payment confirmation, and custody evidence are explicit
trusted fixtures. This is not a fulfillment server or a production DB adapter.
"""
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
import json
import math
import sqlite3
import time


class Conflict(Exception):
    pass


@dataclass(frozen=True)
class VerifiedRelease:
    order_id: str
    attempt_id: str
    generation: int
    custody_clear: bool
    evidence_id: str


def fresh(now, captured, accuracy, lat=31.0, lon=121.0, bounded=True):
    return (bounded and type(now) is int and type(captured) is int and now >= 0 and captured >= 0
            and all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
                    for v in (accuracy, lat, lon))
            and 0 <= accuracy <= 50 and abs(lat) <= 90 and abs(lon) <= 180
            and -5 <= now - captured <= 25)


def eta(location_fresh, picked_up, prep, live, cached, now, context):
    """Each route tuple is (pickup_min, dropoff_min, valid_until, context).
    The trusted caller binds context to assignment/phase/origins/destination/traffic.
    None is an unavailable route, never zero minutes.
    """
    if not location_fresh or not math.isfinite(prep) or prep < 0:
        return None
    for route, confidence in ((live, 'normal'), (cached, 'low')):
        if route is None:
            continue
        pickup, dropoff, until, key = route
        if key == context and now < until and all(math.isfinite(x) and x >= 0 for x in (pickup, dropoff)):
            return {'minutes': dropoff if picked_up else max(pickup, prep) + dropoff,
                    'confidence': confidence}
    return None


class Store:
    def __init__(self, path, clock=None):
        self.path = str(path)
        self.clock = clock or (lambda: int(time.time()))

    def connect(self):
        db = sqlite3.connect(self.path, timeout=8, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        return db

    def install(self):
        with self.connect() as db:
            base = Path(__file__).parent
            db.executescript((base / 'schema.sql').read_text() + (base / 'keys.sql').read_text())

    @contextmanager
    def tx(self, after_lock=None):
        db = self.connect()
        try:
            db.execute('BEGIN IMMEDIATE')
            if after_lock:
                after_lock()
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    @staticmethod
    def require(condition, message='CONFLICT'):
        if not condition:
            raise Conflict(message)

    @staticmethod
    def event(db, key, kind, payload):
        db.execute('INSERT INTO outbox(event_key,kind,payload) VALUES(?,?,?)',
                   (key, kind, json.dumps(payload, sort_keys=True)))

    @staticmethod
    def order(db, oid):
        row = db.execute('SELECT * FROM orders WHERE order_id=?', (oid,)).fetchone()
        Store.require(row is not None, 'NOT_FOUND')
        return row

    def snapshot(self, oid):
        with self.connect() as db:
            return dict(self.order(db, oid))

    def create(self, oid, upstream, digest='fixed-digest', scope='city-A', deadline=None):
        # These are already verified paid-order facts, not client-supplied payment claims.
        with self.tx() as db:
            self.require(not db.execute('SELECT 1 FROM creation_fence WHERE scope=? AND upstream_order=?', (scope, upstream)).fetchone(), 'CREATION_FENCED')
            old = db.execute('SELECT * FROM orders WHERE scope=? AND upstream_order=?', (scope, upstream)).fetchone()
            if old:
                self.require(old['digest'] == digest, 'IDENTITY_PAYLOAD_CONFLICT')
                return dict(old)
            now = self.clock()
            db.execute('INSERT INTO orders(order_id,scope,upstream_order,digest,state,generation,match_deadline,created_at) VALUES(?,?,?,?,?,?,?,?)',
                       (oid, scope, upstream, digest, 'pending_match', 7, deadline if deadline is not None else now + 120, now))
            self.event(db, f'match:{oid}:7', 'MATCH', {'order': oid, 'generation': 7})
            return dict(self.order(db, oid))

    def cancel_creation(self, upstream, scope='city-A'):
        # Trusted compensation coordinator fixture. No custody is released here.
        with self.tx() as db:
            o = db.execute('SELECT * FROM orders WHERE scope=? AND upstream_order=?', (scope, upstream)).fetchone()
            self.require(o is None or o['state'] in ('pending_match', 'cancelled'), 'REVIEW_CURRENT_ASSIGNMENT')
            db.execute('INSERT OR IGNORE INTO creation_fence VALUES(?,?)', (scope, upstream))
            if o and o['state'] == 'pending_match':
                db.execute('UPDATE orders SET state=?,generation=generation+1 WHERE order_id=?', ('cancelled', o['order_id']))
            key = f'compensate:{scope}:{upstream}'
            if not db.execute('SELECT 1 FROM outbox WHERE event_key=?', (key,)).fetchone():
                self.event(db, key, 'COMPENSATE', {'upstream': upstream, 'scope': scope})
            return key

    def courier(self, cid, capacity=2):
        with self.tx() as db:
            db.execute('INSERT INTO courier_capacity(courier_id,capacity) VALUES(?,?)', (cid, capacity))

    def reserve(self, oid, generation, cid, aid, crash=None, after_lock=None, candidate_valid_until=None):
        # Trusted feasible-point fixture at call start, not a real location-provider read.
        valid_until = self.clock() + 25 if candidate_valid_until is None else candidate_valid_until
        with self.tx(after_lock) as db:
            o = self.order(db, oid)
            a = db.execute('SELECT * FROM attempts WHERE attempt_id=?', (aid,)).fetchone()
            if a:
                self.require((a['order_id'], a['generation'], a['courier_id']) == (oid, generation, cid), 'ATTEMPT_BINDING')
                return {'receipt': a['offer_receipt'], 'current': dict(o)}
            c = db.execute('SELECT * FROM courier_capacity WHERE courier_id=?', (cid,)).fetchone()
            self.require(c is not None, 'NO_COURIER')
            now = self.clock()  # deliberately after BEGIN IMMEDIATE acquired the write lock
            self.require(o['state'] == 'pending_match' and o['current_attempt'] is None and o['generation'] == generation, 'STALE')
            self.require(now < o['match_deadline'] and o['attempt_count'] < 3, 'EXHAUSTED')
            self.require(now <= valid_until, 'STALE_CANDIDATE')
            self.require(not c['paused'] and c['occupied'] < c['capacity'], 'REMATCH')
            cooling = db.execute('SELECT 1 FROM attempts WHERE order_id=? AND courier_id=? AND cooldown_until>?', (oid, cid, now)).fetchone()
            self.require(not cooling, 'COOLDOWN')
            used = {r[0] for r in db.execute('SELECT slot FROM active_slot WHERE courier_id=?', (cid,))}
            slot = next(i for i in range(c['capacity']) if i not in used)
            receipt = f'offer:{oid}:{generation}:{cid}:{aid}'
            db.execute('INSERT INTO attempts(attempt_id,order_id,generation,courier_id,deadline,result,offer_receipt) VALUES(?,?,?,?,?,?,?)',
                       (aid, oid, generation, cid, min(now + 20, o['match_deadline']), 'offered', receipt))
            db.execute('INSERT INTO active_slot VALUES(?,?,?,?)', (cid, slot, oid, aid))
            db.execute('UPDATE courier_capacity SET occupied=occupied+1 WHERE courier_id=?', (cid,))
            if crash == 'after_slot':
                raise RuntimeError('simulated crash before order/outbox')
            db.execute('UPDATE orders SET state=?,current_attempt=?,attempt_count=attempt_count+1 WHERE order_id=?', ('offered', aid, oid))
            self.event(db, f'offer:{aid}', 'OFFER', {'attempt': aid, 'order': oid, 'generation': generation})
            return {'receipt': receipt, 'current': dict(self.order(db, oid))}

    @staticmethod
    def release_slot(db, a):
        changed = db.execute('DELETE FROM active_slot WHERE attempt_id=? AND order_id=?', (a['attempt_id'], a['order_id'])).rowcount
        Store.require(changed == 1, 'MISSING_SLOT')
        changed = db.execute('UPDATE courier_capacity SET occupied=occupied-1 WHERE courier_id=? AND occupied>0', (a['courier_id'],)).rowcount
        Store.require(changed == 1, 'INVALID_OCCUPANCY')

    def decide(self, op, oid, aid, generation, actor=None, after_lock=None):
        self.require(op in ('ACCEPT', 'REJECT', 'EXPIRE'), 'INVALID_OPERATION')
        with self.tx(after_lock) as db:
            o = self.order(db, oid)
            a = db.execute('SELECT * FROM attempts WHERE attempt_id=?', (aid,)).fetchone()
            self.require(a and (a['order_id'], a['generation']) == (oid, generation), 'ATTEMPT_BINDING')
            if op != 'EXPIRE':
                self.require(actor == a['courier_id'], 'FORBIDDEN')
            if op == 'ACCEPT' and a['accept_receipt'] is not None:
                return {'receipt': a['accept_receipt'], 'current': dict(o)}
            self.require(o['current_attempt'] == aid and o['generation'] == generation
                         and o['state'] == 'offered' and a['result'] == 'offered', 'STALE')
            now = self.clock()
            if op == 'ACCEPT':
                self.require(now < a['deadline'], 'EXPIRED')
                receipt = f'accepted:{aid}:{generation}'
                db.execute('UPDATE attempts SET result=?,accept_receipt=? WHERE attempt_id=?', ('assigned', receipt, aid))
                db.execute('UPDATE orders SET state=? WHERE order_id=?', ('assigned', oid))
                self.event(db, f'assigned:{aid}', 'ASSIGNED', {'attempt': aid})
            else:
                self.require(op == 'REJECT' or now >= a['deadline'], 'NOT_DUE')
                self.release_slot(db, a)
                result = 'rejected' if op == 'REJECT' else 'expired'
                db.execute('UPDATE attempts SET result=?,cooldown_until=? WHERE attempt_id=?', (result, now + 5, aid))
                state = 'failed' if now >= o['match_deadline'] or o['attempt_count'] >= 3 else 'pending_match'
                db.execute('UPDATE orders SET state=?,current_attempt=NULL,generation=generation+1 WHERE order_id=?', (state, oid))
                self.event(db, f'{state}:{oid}:{generation + 1}', 'MATCH' if state == 'pending_match' else 'FAILURE',
                           {'order': oid, 'generation': generation + 1, 'cooldownCourier': a['courier_id'], 'cooldownUntil': now + 5})
                receipt = f'{result}:{aid}'
            return {'receipt': receipt, 'current': dict(self.order(db, oid))}

    def control(self, oid, aid, generation, action, actor, evidence, release=None, crash=None):
        self.require(action in ('PICKUP', 'DELIVER', 'CANCEL', 'REASSIGN'), 'INVALID_OPERATION')
        self.require(bool(evidence), 'MISSING_EVIDENCE')
        with self.tx() as db:
            o = self.order(db, oid)
            a = db.execute('SELECT * FROM attempts WHERE attempt_id=?', (aid,)).fetchone()
            self.require(a and (a['order_id'], a['generation']) == (oid, generation), 'ATTEMPT_BINDING')
            # 'customer-authorized' and 'operations-authorized' are trusted auth fixtures.
            self.require(actor == (a['courier_id'] if action in ('PICKUP', 'DELIVER') else
                                   'customer-authorized' if action == 'CANCEL' else 'operations-authorized'), 'FORBIDDEN')
            if action == 'REASSIGN':
                self.require(isinstance(release, VerifiedRelease) and release.custody_clear
                             and (release.order_id, release.attempt_id, release.generation, release.evidence_id)
                             == (oid, aid, generation, evidence), 'REVIEW')
            old = db.execute('SELECT * FROM operation_receipt WHERE attempt_id=? AND action=?', (aid, action)).fetchone()
            if old:
                self.require(old['evidence'] == evidence, 'EVIDENCE_CONFLICT')
                return {'receipt': old['receipt'], 'current': dict(o)}
            self.require(o['current_attempt'] == aid and o['generation'] == generation, 'STALE')
            if action == 'PICKUP':
                self.require(o['state'] == 'assigned', 'BAD_STATE')
                state = result = 'picked_up'
                db.execute('UPDATE orders SET state=? WHERE order_id=?', (state, oid))
            else:
                self.require(o['state'] == ('picked_up' if action == 'DELIVER' else 'offered')
                             if action != 'REASSIGN' else o['state'] in ('assigned', 'picked_up'), 'CONTROLLED_HANDOFF_REQUIRED')
                self.release_slot(db, a)
                if crash == 'after_release':
                    raise RuntimeError('simulated crash before state/outbox')
                state = 'pending_match' if action == 'REASSIGN' else 'delivered' if action == 'DELIVER' else 'cancelled'
                result = 'released' if action == 'REASSIGN' else state
                db.execute('UPDATE orders SET state=?,current_attempt=NULL,generation=generation+1 WHERE order_id=?', (state, oid))
            db.execute('UPDATE attempts SET result=? WHERE attempt_id=?', (result, aid))
            receipt = f'{action.lower()}:{aid}:{evidence}'
            db.execute('INSERT INTO operation_receipt VALUES(?,?,?,?)', (aid, action, evidence, receipt))
            self.event(db, f'{action.lower()}:{aid}', 'MATCH' if action == 'REASSIGN' else action, {'order': oid, 'attempt': aid})
            return {'receipt': receipt, 'current': dict(self.order(db, oid))}

    def recover(self, limit=100):
        # Bounded read scan; every mutation rechecks after acquiring the write lock.
        with self.connect() as db:
            pending = [dict(x) for x in db.execute('SELECT * FROM orders WHERE state=? ORDER BY match_deadline,created_at LIMIT ?', ('pending_match', limit))]
            offered = [dict(x) for x in db.execute('SELECT * FROM attempts WHERE result=? AND deadline<=? LIMIT ?', ('offered', self.clock(), limit))]
        queued = []
        for candidate in pending:
            with self.tx() as db:
                o = self.order(db, candidate['order_id'])
                if o['state'] != 'pending_match' or o['generation'] != candidate['generation']:
                    continue
                if self.clock() >= o['match_deadline'] or o['attempt_count'] >= 3:
                    db.execute('UPDATE orders SET state=?,generation=generation+1 WHERE order_id=?', ('failed', o['order_id']))
                    self.event(db, f'failed:{o["order_id"]}:{o["generation"] + 1}', 'FAILURE', {'order': o['order_id']})
                else:
                    queued.append((o['order_id'], o['generation']))
        for a in offered:
            try:
                self.decide('EXPIRE', a['order_id'], a['attempt_id'], a['generation'])
            except Conflict as conflict:
                if str(conflict) not in ('STALE', 'NOT_DUE'):
                    raise
        return queued

    def start_session(self, cid, bounded=True):
        with self.tx() as db:
            old = db.execute('SELECT epoch FROM location_session WHERE courier_id=?', (cid,)).fetchone()
            epoch = old[0] + 1 if old else 1
            db.execute('INSERT INTO location_session(courier_id,epoch,connected,seq,clock_bounded) VALUES(?,?,1,-1,?) '
                       'ON CONFLICT(courier_id) DO UPDATE SET epoch=excluded.epoch,connected=1,seq=-1,clock_bounded=excluded.clock_bounded,'
                       'captured=NULL,received=NULL,expires=NULL,accuracy=NULL,lat=NULL,lon=NULL,cell=NULL', (cid, epoch, int(bounded)))
            return epoch

    def disconnect(self, cid, epoch):
        with self.tx() as db:
            return db.execute('UPDATE location_session SET connected=0,captured=NULL WHERE courier_id=? AND epoch=?', (cid, epoch)).rowcount

    def report(self, cid, epoch, seq, captured, accuracy=5, lat=31, lon=121, cell='A'):
        with self.tx() as db:
            s = db.execute('SELECT * FROM location_session WHERE courier_id=?', (cid,)).fetchone()
            now = self.clock()
            self.require(s and s['epoch'] == epoch and s['connected'], 'STALE_SESSION')
            self.require(type(seq) is int and seq >= 0 and fresh(now, captured, accuracy, lat, lon, bool(s['clock_bounded'])), 'INVALID_POINT')
            if seq <= s['seq']:
                return s['seq']
            db.execute('UPDATE location_session SET seq=?,captured=?,received=?,expires=?,accuracy=?,lat=?,lon=?,cell=? WHERE courier_id=?',
                       (seq, captured, now, now + 60, accuracy, lat, lon, cell, cid))
            return seq

    def location(self, cid):
        with self.connect() as db:
            s = db.execute('SELECT * FROM location_session WHERE courier_id=?', (cid,)).fetchone()
            return dict(s) if s else None

    def candidate(self, cid):
        s = self.location(cid)
        now = self.clock()
        return bool(s and s['connected'] and s['expires'] is not None and now < s['expires']
                    and fresh(now, s['captured'], s['accuracy'], s['lat'], s['lon'], bool(s['clock_bounded'])))

    def project(self, cid, epoch, seq):
        with self.tx() as db:
            s = db.execute('SELECT * FROM location_session WHERE courier_id=?', (cid,)).fetchone()
            if not (s and s['connected'] and (s['epoch'], s['seq']) == (epoch, seq) and s['cell'] is not None
                    and fresh(self.clock(), s['captured'], s['accuracy'], s['lat'], s['lon'], bool(s['clock_bounded']))):
                return False
            db.execute('INSERT INTO cell_member VALUES(?,?,?,?) ON CONFLICT(courier_id,cell) DO UPDATE SET epoch=excluded.epoch,seq=excluded.seq',
                       (cid, s['cell'], epoch, seq))
            db.execute('DELETE FROM cell_member WHERE courier_id=? AND cell<>?', (cid, s['cell']))
            return True

    def reconcile_location(self):
        with self.connect() as db:
            rows = [dict(x) for x in db.execute('SELECT courier_id,epoch,seq FROM location_session WHERE captured IS NOT NULL')]
        return sum(self.project(s['courier_id'], s['epoch'], s['seq']) for s in rows)

    def invariants(self):
        with self.connect() as db:
            errors = []
            for c in db.execute('SELECT * FROM courier_capacity'):
                count = db.execute('SELECT count(*) FROM active_slot WHERE courier_id=?', (c['courier_id'],)).fetchone()[0]
                if count != c['occupied'] or not 0 <= count <= c['capacity']:
                    errors.append('occupancy')
            for h in db.execute('SELECT * FROM active_slot'):
                o = self.order(db, h['order_id'])
                a = db.execute('SELECT * FROM attempts WHERE attempt_id=?', (h['attempt_id'],)).fetchone()
                c = db.execute('SELECT capacity FROM courier_capacity WHERE courier_id=?', (h['courier_id'],)).fetchone()
                if not (o['current_attempt'] == a['attempt_id'] and o['generation'] == a['generation']
                        and o['state'] in ('offered', 'assigned', 'picked_up') and o['state'] == a['result']
                        and a['courier_id'] == h['courier_id'] and 0 <= h['slot'] < c[0]):
                    errors.append('binding')
            for o in db.execute('SELECT * FROM orders'):
                count = db.execute('SELECT count(*) FROM active_slot WHERE order_id=?', (o['order_id'],)).fetchone()[0]
                if count != int(o['state'] in ('offered', 'assigned', 'picked_up')):
                    errors.append('current-slot')
            self.require(not errors, str(errors))
            return True
