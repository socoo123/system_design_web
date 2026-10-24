"""Actual SQLite teaching adapter. No real index visibility, PG, ANN or LLM calls."""
from contextlib import contextmanager
from dataclasses import dataclass
import hashlib
import json
import sqlite3


class Denied(Exception):
    pass


@dataclass(frozen=True)
class Evidence:
    chunk: str
    tenant: str
    doc: str
    rev: int
    pool: str
    start: int
    end: int
    digest: str
    member_epoch: int
    acl_epoch: int


class Catalog:
    def __init__(self, path):
        self.db = sqlite3.connect(path, timeout=5, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA foreign_keys=ON')
        self.db.executescript('''
        CREATE TABLE IF NOT EXISTS clock(ms INTEGER NOT NULL);
        INSERT INTO clock SELECT 0 WHERE NOT EXISTS(SELECT 1 FROM clock);
        CREATE TABLE IF NOT EXISTS member(tenant TEXT, subject TEXT, epoch INTEGER,
          groups_json TEXT NOT NULL, active INTEGER NOT NULL, PRIMARY KEY(tenant,subject));
        CREATE TABLE IF NOT EXISTS doc(tenant TEXT, id TEXT, target INTEGER NOT NULL,
          source_seq INTEGER NOT NULL, tombstone INTEGER NOT NULL DEFAULT 0,
          acl_epoch INTEGER NOT NULL DEFAULT 1, allowed_json TEXT NOT NULL,
          PRIMARY KEY(tenant,id));
        CREATE TABLE IF NOT EXISTS revision(tenant TEXT, doc TEXT, rev INTEGER, digest TEXT,
          PRIMARY KEY(tenant,doc,rev));
        CREATE TABLE IF NOT EXISTS receipt(event TEXT PRIMARY KEY, canonical TEXT NOT NULL, jobs TEXT);
        CREATE TABLE IF NOT EXISTS job(id INTEGER PRIMARY KEY, tenant TEXT, doc TEXT, rev INTEGER,
          pool TEXT, splitter TEXT, state TEXT NOT NULL DEFAULT 'ready', epoch INTEGER NOT NULL DEFAULT 0,
          owner TEXT, lease_until INTEGER, result TEXT, UNIQUE(tenant,doc,rev,pool,splitter));
        CREATE TABLE IF NOT EXISTS manifest(job_id INTEGER PRIMARY KEY, expected_json TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS published(tenant TEXT, doc TEXT, pool TEXT, rev INTEGER, manifest TEXT,
          PRIMARY KEY(tenant,doc,pool));
        CREATE TABLE IF NOT EXISTS chunk(id TEXT PRIMARY KEY, tenant TEXT, doc TEXT, rev INTEGER,
          pool TEXT, start INTEGER, end INTEGER, digest TEXT NOT NULL, text TEXT NOT NULL,
          CHECK(start>=0 AND end>start));
        CREATE TABLE IF NOT EXISTS span_acl(tenant TEXT, doc TEXT, rev INTEGER,
          start INTEGER, end INTEGER, allowed_json TEXT NOT NULL,
          PRIMARY KEY(tenant,doc,rev,start));
        ''')

    @contextmanager
    def tx(self):
        self.db.execute('BEGIN IMMEDIATE')       # coarser than PG row locks
        try:
            yield
            self.db.execute('COMMIT')
        except BaseException:
            self.db.execute('ROLLBACK')
            raise

    def now(self):
        return self.db.execute('SELECT ms FROM clock').fetchone()[0]

    def time(self, ms):
        with self.tx(): self.db.execute('UPDATE clock SET ms=?', (ms,))

    def membership(self, tenant, subject, groups, active=True):
        with self.tx():
            self.db.execute('''INSERT INTO member VALUES(?,?,1,?,?)
              ON CONFLICT(tenant,subject) DO UPDATE SET epoch=epoch+1,
              groups_json=excluded.groups_json,active=excluded.active''',
              (tenant, subject, json.dumps(groups), active))

    def accept(self, event, tenant, doc, seq, rev, text, pools=('g1',), fail=False):
        canonical = json.dumps([tenant, doc, seq, rev, text, list(pools)], separators=(',', ':'))
        with self.tx():
            prior = self.db.execute('SELECT * FROM receipt WHERE event=?', (event,)).fetchone()
            if prior:
                if prior['canonical'] != canonical: raise ValueError('event conflict')
                return json.loads(prior['jobs'])
            d = self.db.execute('SELECT * FROM doc WHERE tenant=? AND id=?', (tenant, doc)).fetchone()
            if not d:
                self.db.execute('INSERT INTO doc(tenant,id,target,source_seq,allowed_json) VALUES(?,?,?,?,?)',
                                (tenant, doc, rev, seq, '["staff"]'))
            else:
                if seq <= d['source_seq'] or d['tombstone']: raise Denied('stale event or deleted')
                self.db.execute('UPDATE doc SET target=?,source_seq=? WHERE tenant=? AND id=?', (rev, seq, tenant, doc))
            digest = hashlib.sha256(text.encode()).hexdigest()
            previous = self.db.execute('SELECT digest FROM revision WHERE tenant=? AND doc=? AND rev=?', (tenant, doc, rev)).fetchone()
            if previous and previous[0] != digest: raise ValueError('immutable revision conflict')
            self.db.execute('INSERT OR IGNORE INTO revision VALUES(?,?,?,?)', (tenant, doc, rev, digest))
            ids = []
            for pool in pools:
                self.db.execute('INSERT INTO job(tenant,doc,rev,pool,splitter) VALUES(?,?,?,?,?)', (tenant, doc, rev, pool, 's1'))
                ids.append(self.db.execute('SELECT last_insert_rowid()').fetchone()[0])
            if fail: raise RuntimeError('before commit')
            self.db.execute('INSERT INTO receipt VALUES(?,?,?)', (event, canonical, json.dumps(ids)))
            return ids

    def claim(self, job_id, owner, lease=100):
        with self.tx():
            j = self.db.execute('SELECT * FROM job WHERE id=?', (job_id,)).fetchone()
            t = self.now()                       # after writer lock
            if j['state'] == 'done': return ('done', j['result'])
            if j['state'] == 'running' and j['lease_until'] > t: raise Denied('owned')
            epoch = j['epoch'] + 1
            self.db.execute('UPDATE job SET state="running",owner=?,epoch=?,lease_until=? WHERE id=?',
                            (owner, epoch, t+lease, job_id))
            return epoch

    def put_chunk(self, key, tenant, doc, rev, pool, start, end, text):
        values = (key, tenant, doc, rev, pool, start, end, hashlib.sha256(text.encode()).hexdigest(), text)
        with self.tx():
            old = self.db.execute('SELECT * FROM chunk WHERE id=?', (key,)).fetchone()
            if old:
                if tuple(old) != values: raise ValueError('immutable chunk conflict')
            else: self.db.execute('INSERT INTO chunk VALUES(?,?,?,?,?,?,?,?,?)', values)
        return values[7]

    def freeze_manifest(self, job_id, expected, text_expected=None):
        # Trusted parser/embedding fixture output, not a client-provided candidate subset.
        text_expected = expected if text_expected is None else text_expected
        if any(text_expected.get(k) != v for k,v in expected.items()):
            raise ValueError('indexed child must have exact text identity')
        value = json.dumps(dict(children=expected, text=text_expected), sort_keys=True)
        with self.tx():
            prior = self.db.execute('SELECT expected_json FROM manifest WHERE job_id=?', (job_id,)).fetchone()
            if prior and prior[0] != value: raise ValueError('immutable manifest conflict')
            self.db.execute('INSERT OR IGNORE INTO manifest VALUES(?,?)', (job_id,value))

    def publish(self, job_id, owner, epoch, receipts, fail=False):
        """Receipts are trusted fixtures of external full-manifest verification, NOT an index."""
        with self.tx():
            j = self.db.execute('SELECT * FROM job WHERE id=?', (job_id,)).fetchone()
            if j['state'] == 'done': return j['result']
            d = self.db.execute('SELECT * FROM doc WHERE tenant=? AND id=?', (j['tenant'], j['doc'])).fetchone()
            if (j['owner'] != owner or j['epoch'] != epoch or j['state'] != 'running'
                    or j['lease_until'] <= self.now() or d['tombstone'] or d['target'] != j['rev']):
                raise Denied('stale publication')
            row = self.db.execute('SELECT expected_json FROM manifest WHERE job_id=?', (job_id,)).fetchone()
            if not row: raise Denied('missing manifest')
            manifest_sets = json.loads(row[0])
            expected = manifest_sets['children']
            text_expected = manifest_sets['text']
            if not expected or not text_expected: raise Denied('empty manifest')
            for lane in ('text', 'bm25', 'dense'):
                wanted = text_expected if lane == 'text' else expected
                if receipts.get(lane) != wanted: raise Denied('partial or wrong receipt')
            if receipts.get('pool') != j['pool'] or receipts.get('splitter') != j['splitter']:
                raise Denied('wrong generation')
            for key, digest in text_expected.items():
                c = self.db.execute('SELECT * FROM chunk WHERE id=?', (key,)).fetchone()
                if not c or (c['tenant'], c['doc'], c['rev'], c['pool'], c['digest']) != (j['tenant'], j['doc'], j['rev'], j['pool'], digest):
                    raise Denied('text not exact')
            manifest = json.dumps(manifest_sets, sort_keys=True)
            self.db.execute('''INSERT INTO published VALUES(?,?,?,?,?) ON CONFLICT(tenant,doc,pool)
              DO UPDATE SET rev=excluded.rev,manifest=excluded.manifest''', (j['tenant'],j['doc'],j['pool'],j['rev'],manifest))
            if fail: raise RuntimeError('before job completion')
            self.db.execute('UPDATE job SET state="done",result=? WHERE id=?', (manifest, job_id))
            return manifest

    def policy(self, tenant, doc, allowed, spans=None, rev=1):
        with self.tx():
            self.db.execute('UPDATE doc SET allowed_json=?,acl_epoch=acl_epoch+1 WHERE tenant=? AND id=?', (json.dumps(allowed), tenant, doc))
            if spans is not None:
                self.db.execute('DELETE FROM span_acl WHERE tenant=? AND doc=? AND rev=?', (tenant, doc, rev))
                end = -1
                for start, stop, groups in sorted(spans):
                    if start < end or stop <= start: raise ValueError('overlapping/empty ACL partition')
                    self.db.execute('INSERT INTO span_acl VALUES(?,?,?,?,?,?)', (tenant,doc,rev,start,stop,json.dumps(groups)))
                    end = stop

    def delete(self, tenant, doc):
        with self.tx():
            self.db.execute('UPDATE doc SET tombstone=1,acl_epoch=acl_epoch+1 WHERE tenant=? AND id=?', (tenant,doc))

    @staticmethod
    def permits(allowed, groups):
        return bool(set(json.loads(allowed)).intersection(groups))

    def _inspect(self, tenant, subject, pool, key, indexed=False):
        m = self.db.execute('SELECT * FROM member WHERE tenant=? AND subject=?', (tenant,subject)).fetchone()
        c = self.db.execute('SELECT * FROM chunk WHERE id=?', (key,)).fetchone()
        if not m or not m['active'] or not c or c['tenant'] != tenant or c['pool'] != pool:
            raise Denied('identity/pool')
        groups = json.loads(m['groups_json'])
        d = self.db.execute('SELECT * FROM doc WHERE tenant=? AND id=?', (tenant,c['doc'])).fetchone()
        p = self.db.execute('SELECT * FROM published WHERE tenant=? AND doc=? AND pool=?', (tenant,c['doc'],pool)).fetchone()
        if d['tombstone'] or not p or p['rev'] != c['rev'] or not self.permits(d['allowed_json'],groups):
            raise Denied('doc/current')
        manifest = json.loads(p['manifest'])
        if manifest['text'].get(key) != c['digest']:
            raise Denied('not published manifest text')
        if indexed and manifest['children'].get(key) != c['digest']:
            raise Denied('not published indexed child')
        cursor = c['start']
        for a in self.db.execute('SELECT * FROM span_acl WHERE tenant=? AND doc=? AND rev=? AND end>? AND start<? ORDER BY start',
                                 (tenant,c['doc'],c['rev'],c['start'],c['end'])):
            if a['start'] > cursor or not self.permits(a['allowed_json'],groups): raise Denied('span ACL')
            cursor = max(cursor,a['end'])
        if cursor < c['end']: raise Denied('uncovered ACL span')
        return Evidence(key,tenant,c['doc'],c['rev'],pool,c['start'],c['end'],c['digest'],m['epoch'],d['acl_epoch'])

    def pin(self, tenant, subject, pool, keys, indexed=True):
        with self.tx(): return tuple(self._inspect(tenant,subject,pool,k,indexed) for k in keys)

    def check_pack(self, tenant, subject, pool, pack, authority_available=True):
        if not authority_available or not pack: raise Denied('authority unavailable or no evidence')
        with self.tx():
            for old in sorted(pack, key=lambda e:(e.tenant,e.doc,e.chunk)):
                current = self._inspect(tenant,subject,pool,old.chunk)
                if current != old: raise Denied('pack dependency changed')
        return True  # check point only; no promise about later network delivery

    def release(self, tenant, subject, pool, pack, citations, judge, send):
        if not citations or any(type(i) is not int or i < 1 or i > len(pack) for i in citations):
            raise Denied('citation identity')
        if judge() != 'SUPPORTED': raise Denied('fallible support verdict rejected')
        self.check_pack(tenant,subject,pool,pack)  # after judge, ALL spans
        send()                                  # explicit check/send gap
