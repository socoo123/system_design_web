"""Executable SQLite semantics / migration contract probe, not a distributed implementation."""
import hashlib, json, sqlite3

class Reject(Exception):
    pass

def connect(path):
    db = sqlite3.connect(path, timeout=15, isolation_level=None)
    db.execute('PRAGMA foreign_keys=ON')
    return db

def create(path):
    db = connect(path)
    db.executescript('''
    CREATE TABLE entity(id INTEGER PRIMARY KEY, owner INTEGER NOT NULL,
      session TEXT NOT NULL, seq INTEGER NOT NULL, version INTEGER NOT NULL,
      point TEXT NOT NULL, observed INTEGER NOT NULL, sharing INTEGER NOT NULL);
    CREATE TABLE receipt(entity INTEGER, request TEXT, intent_hash TEXT NOT NULL,
      response TEXT NOT NULL, PRIMARY KEY(entity,request));
    CREATE TABLE accepted(entity INTEGER, accepted_at INTEGER NOT NULL);
    CREATE TABLE outbox(event_id INTEGER PRIMARY KEY, entity INTEGER NOT NULL,
      version INTEGER NOT NULL, old_point TEXT, new_point TEXT, observed INTEGER,
      UNIQUE(entity,version));
    CREATE TABLE cell_guard(cell TEXT PRIMARY KEY, revision INTEGER NOT NULL);
    CREATE TABLE membership(cell TEXT, entity INTEGER, version INTEGER NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('LIVE','TOMBSTONE')), payload TEXT NOT NULL,
      PRIMARY KEY(cell,entity), FOREIGN KEY(cell) REFERENCES cell_guard(cell));
    ''')
    db.close()

def report(db, owner, request_id, intent, now, clock_error=0, fail_before_commit=False):
    fingerprint = hashlib.sha256(json.dumps(intent, sort_keys=True).encode()).hexdigest()
    db.execute('BEGIN IMMEDIATE') # Actual SQLite writer lock; coarser than a row lock.
    try:
        entity = db.execute('SELECT * FROM entity WHERE id=?', (intent['entity'],)).fetchone()
        if entity is None or entity[1] != owner: raise Reject('owner')
        receipt = db.execute('SELECT intent_hash,response FROM receipt WHERE entity=? AND request=?',
                             (intent['entity'],request_id)).fetchone()
        if receipt:
            if receipt[0] != fingerprint: raise Reject('intent conflict')
            db.commit(); return json.loads(receipt[1])
        if not entity[7] or intent['session'] != entity[2] or intent['seq'] <= entity[3]:
            raise Reject('session/sequence/sharing')
        if now - intent['observed'] + clock_error > 30000 or intent['observed'] > now + clock_error:
            raise Reject('sample age')
        used = db.execute('SELECT count(*) FROM accepted WHERE entity=? AND accepted_at>?',
                          (intent['entity'],now-60000)).fetchone()[0]
        if used >= 4: raise Reject('quota')
        version = entity[4] + 1
        point = json.dumps(intent['point'])
        db.execute('UPDATE entity SET seq=?,version=?,point=?,observed=? WHERE id=?',
                   (intent['seq'],version,point,intent['observed'],intent['entity']))
        db.execute('INSERT INTO accepted VALUES(?,?)', (intent['entity'],now))
        db.execute('INSERT INTO outbox(entity,version,old_point,new_point,observed) VALUES(?,?,?,?,?)',
                   (intent['entity'],version,entity[5],point,intent['observed']))
        response = {'version': version, 'index':'pending'}
        db.execute('INSERT INTO receipt VALUES(?,?,?,?)',
                   (intent['entity'],request_id,fingerprint,json.dumps(response)))
        if fail_before_commit: raise Reject('injected before commit')
        db.commit(); return response
    except BaseException:
        db.rollback(); raise

def put(db, cell, entity, version, state, payload, fail_revision=False):
    payload = json.dumps(payload, sort_keys=True)
    db.execute('BEGIN IMMEDIATE')
    try:
        db.execute('INSERT INTO cell_guard VALUES(?,0) ON CONFLICT DO NOTHING', (cell,))
        old = db.execute('SELECT version,state,payload FROM membership WHERE cell=? AND entity=?',
                         (cell,entity)).fetchone()
        if old and old[0] > version: db.commit(); return 'STALE'
        if old and old[0] == version:
            if old[1:] != (state,payload): raise Reject('same version different payload')
            db.commit(); return 'DUPLICATE'
        db.execute('INSERT INTO membership VALUES(?,?,?,?,?) ON CONFLICT(cell,entity) DO UPDATE SET '
                   'version=excluded.version,state=excluded.state,payload=excluded.payload',
                   (cell,entity,version,state,payload))
        if fail_revision: raise Reject('injected revision failure')
        db.execute('UPDATE cell_guard SET revision=revision+1 WHERE cell=?', (cell,))
        db.commit(); return 'APPLIED'
    except BaseException:
        db.rollback(); raise

def apply(db, entity, version, old_cell, new_cell, sample, crash_after_add=False):
    if new_cell is not None: put(db,new_cell,entity,version,'LIVE',sample)
    if crash_after_add: raise Reject('crash after add')
    if old_cell is not None and old_cell != new_cell: put(db,old_cell,entity,version,'TOMBSTONE',None)
    return 'ACK'

def snapshot(db, cell):
    db.execute('BEGIN')
    try:
        revision = db.execute('SELECT revision FROM cell_guard WHERE cell=?',(cell,)).fetchone()
        rows = db.execute('SELECT entity,version,state,payload FROM membership WHERE cell=?',(cell,)).fetchall()
        db.commit(); return (revision[0] if revision else 0, rows)
    except BaseException:
        db.rollback(); raise

class Migration:
    """Only barrier/route contract checks; no real leases, durable directory or projectors."""
    def __init__(self, start):
        self.applied = dict(start)
        self.completed = {p:set() for p in start}
        self.phase='MIGRATING'; self.epoch=4; self.targets={'parent','children'}
        self.old_not_after=None
    def effect_complete(self, partition, offset):
        self.completed[partition].add(offset)
        while self.applied[partition]+1 in self.completed[partition]:
            self.applied[partition]+=1
            self.completed[partition].remove(self.applied[partition])
    def cutover(self, target, old_routes_not_after):
        if set(target)!=set(self.applied) or any(self.applied[p]<w for p,w in target.items()):
            raise Reject('not every contiguous partition watermark reached')
        if self.phase!='MIGRATING': raise Reject('epoch CAS')
        self.epoch+=1; self.phase='CHILDREN'; self.old_not_after=old_routes_not_after
    def retire(self, now, old_readers):
        if self.phase!='CHILDREN' or now < self.old_not_after or old_readers:
            raise Reject('routes AND readers')
        self.targets={'children'}; self.phase='RETIRED'
