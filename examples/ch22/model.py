"""SQLite authority + explicit in-memory Data adapter; not a distributed object store.

BEGIN IMMEDIATE serializes writers (coarser than the PG18 row locks in the page).
Data receipts, grants, copies, and writer draining are local contract models, not
cryptographic receipt verification, fsync, replication, or clock-skew evidence.
"""
from contextlib import contextmanager
from dataclasses import dataclass
from hashlib import sha256
import json
from pathlib import Path
import sqlite3
from threading import RLock
from uuid import uuid4


class Conflict(Exception): pass
class Denied(Exception): pass
class NotFound(Exception): pass
class Unknown(Exception): pass


def encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def hashed(value):
    return sha256(encoded(value).encode()).hexdigest()


def namespace(tenant, bucket, key):
    return encoded([tenant, bucket, key])  # exact key; no trim, case fold, or Unicode normalization


@dataclass(frozen=True)
class Receipt:
    upload: str
    fence: int
    part: int
    blob: str
    size: int
    digest: str
    copies: int


class Data:
    def __init__(self):
        self.lock = RLock()
        self.blobs, self.receipts, self.active, self.closed = {}, {}, {}, {}

    def start(self, upload, fence, part, payload, copies=3):
        with self.lock:
            if fence < self.closed.get(upload, 0):
                raise Conflict("Data generation is fenced")
            ticket = (upload, fence, part, bytes(payload), copies, str(uuid4()))
            self.active[ticket[-1]] = ticket
            return ticket

    def finish(self, ticket):
        with self.lock:
            upload, fence, part, payload, copies, blob = self.active.pop(ticket[-1])
            receipt = Receipt(upload, fence, part, blob, len(payload), sha256(payload).hexdigest(), copies)
            self.blobs[blob], self.receipts[blob] = payload, receipt
            return receipt  # a previously admitted writer can land after a metadata fence

    def stage(self, *args, **kwargs):
        return self.finish(self.start(*args, **kwargs))

    def verify(self, receipt):
        with self.lock:
            if self.receipts.get(receipt.blob) != receipt or receipt.blob not in self.blobs:
                raise Conflict("untrusted or missing receipt")
            if sha256(self.blobs[receipt.blob]).hexdigest() != receipt.digest:
                raise Conflict("corrupt Data record")
        return receipt

    def close_and_drain(self, upload, fence):
        with self.lock:
            self.closed[upload] = max(fence, self.closed.get(upload, 0))
            return not any(t[0] == upload for t in self.active.values())

    def delete(self, blob_ids):
        with self.lock:
            for blob in blob_ids:
                self.blobs.pop(blob, None)
                self.receipts.pop(blob, None)


class Authority:
    def __init__(self, filename, data):
        self.filename, self.data = str(filename), data
        with self.connection() as db:
            db.executescript(Path(__file__).with_name("schema.sql").read_text())

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.filename, timeout=10, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        try: yield db
        finally: db.close()

    @contextmanager
    def tx(self):
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            try:
                yield db
                db.execute("COMMIT")
            except BaseException:
                if db.in_transaction: db.execute("ROLLBACK")
                raise

    def grant(self, actor, tenant, bucket, read=True, write=True):
        with self.tx() as db:
            db.execute("INSERT OR REPLACE INTO grants VALUES (?,?,?,?,?)", (actor, tenant, bucket, read, write))

    @staticmethod
    def authorize(db, actor, ns, operation):
        tenant, bucket, _ = json.loads(ns)
        grant = db.execute("SELECT * FROM grants WHERE actor=? AND tenant=? AND bucket=?",
                           (actor, tenant, bucket)).fetchone()
        if grant is None or not grant["can_" + operation]: raise Denied("scope not authorized")

    def upload(self, db, actor, uid, operation="write"):
        u = db.execute("SELECT * FROM uploads WHERE id=?", (uid,)).fetchone()
        if u is None: raise NotFound("upload")
        self.authorize(db, actor, u["ns"], operation)
        if u["owner"] != actor: raise Denied("upload ownership")
        return u

    def begin(self, actor, scope, request_id, size, content_digest, now=0, expected=None, copies=3):
        if type(size) is not int or size < 0 or not request_id or copies not in (3, 6) or len(content_digest) != 64 or any(c not in "0123456789abcdef" for c in content_digest):
            raise ValueError("invalid intent")
        ns = namespace(*scope)
        digest = hashed([ns, actor, size, content_digest, expected, copies])
        with self.tx() as db:
            self.authorize(db, actor, ns, "write")
            prior = db.execute("SELECT * FROM uploads WHERE ns=? AND owner=? AND request_id=?",
                               (ns, actor, request_id)).fetchone()
            if prior:
                if prior["intent_hash"] != digest: raise Conflict("request identity reused with another intent")
                return dict(prior)
            db.execute("INSERT OR IGNORE INTO names(ns,tenant,bucket,object_key) VALUES (?,?,?,?)", (ns, *scope))
            uid, version = str(uuid4()), str(uuid4())
            db.execute("""INSERT INTO uploads(id,ns,owner,request_id,intent_hash,expected_size,expected_digest,
                expected_generation,required_copies,state,fence,created,lease_until,version_id)
                VALUES (?,?,?,?,?,?,?,?,?, 'OPEN',1,?,?,?)""",
                (uid, ns, actor, request_id, digest, size, content_digest, expected, copies, now, now+60, version))
            return dict(db.execute("SELECT * FROM uploads WHERE id=?", (uid,)).fetchone())

    def register(self, actor, uid, fence, receipt, previous=0, now=1):
        self.data.verify(receipt)  # Data contract outside metadata transaction
        with self.tx() as db:
            u = self.upload(db, actor, uid)
            if u["state"] != "OPEN" or u["fence"] != fence or now >= u["lease_until"]:
                raise Conflict("registration closed")
            if receipt.upload != uid or receipt.fence != fence or receipt.part <= 0:
                raise Conflict("receipt scope")
            p = db.execute("SELECT * FROM parts WHERE upload_id=? AND part_no=?", (uid, receipt.part)).fetchone()
            if p and p["blob_id"] == receipt.blob: return dict(p)
            if (p["part_generation"] if p else 0) != previous: raise Conflict("part generation")
            db.execute("INSERT OR REPLACE INTO parts VALUES (?,?,?,?,?,?)",
                       (uid, receipt.part, previous+1, receipt.blob, receipt.size, receipt.digest))
            return dict(db.execute("SELECT * FROM parts WHERE upload_id=? AND part_no=?", (uid, receipt.part)).fetchone())

    @staticmethod
    def selected(db, uid):
        return [dict(p) for p in db.execute("SELECT * FROM parts WHERE upload_id=? ORDER BY part_no", (uid,))]

    def parts(self, actor, uid):
        with self.tx() as db:
            self.upload(db, actor, uid)
            return self.selected(db, uid)

    def freeze(self, actor, uid, fence, parts, now=2):
        digest = hashed(parts)
        with self.tx() as db:
            u = self.upload(db, actor, uid)
            if u["state"] in ("FINALIZING", "COMPLETED"):
                if u["manifest_hash"] != digest: raise Conflict("different frozen manifest")
                return json.loads(u["frozen_manifest"])
            if u["state"] != "OPEN" or u["fence"] != fence or now >= u["lease_until"]:
                raise Conflict("cannot freeze")
            if not parts or parts != self.selected(db, uid) or sum(p["size"] for p in parts) != u["expected_size"]:
                raise Conflict("not the complete exact registered manifest")
            db.execute("UPDATE uploads SET state='FINALIZING',manifest_hash=?,frozen_manifest=? WHERE id=?",
                       (digest, encoded(parts), uid))
            return parts

    def publish(self, actor, uid, fence, parts, lost_ack=False, fail_before_current=False):
        with self.tx() as db:
            u = self.upload(db, actor, uid)
            if u["manifest_hash"] != hashed(parts): raise Conflict("different manifest")
            if u["result"] is not None: return json.loads(u["result"])
            if u["state"] != "FINALIZING" or u["fence"] != fence: raise Conflict("fenced publish")
        try:
            for part in parts: self.data.verify(self.data.receipts[part["blob_id"]])
            object_digest = sha256(b"".join(self.data.blobs[p["blob_id"]] for p in parts)).hexdigest()
        except (KeyError, Conflict):
            # Another publisher may have committed and the old version may already be reclaimed.
            with self.tx() as db:
                u = self.upload(db, actor, uid)
                if u["manifest_hash"] == hashed(parts) and u["result"] is not None:
                    return json.loads(u["result"])
            raise
        with self.tx() as db:
            u = self.upload(db, actor, uid)
            if u["manifest_hash"] != hashed(parts): raise Conflict("different manifest")
            if u["result"] is not None: return json.loads(u["result"])
            if u["state"] != "FINALIZING" or u["fence"] != fence: raise Conflict("fenced publish")
            if object_digest != u["expected_digest"]: raise Conflict("whole object intent digest")
            for part in parts:
                r = self.data.receipts[part["blob_id"]]
                if (r.upload, r.fence, r.part, r.size, r.digest) != (uid, fence, part["part_no"], part["size"], part["digest"]) or r.copies < u["required_copies"]:
                    raise Conflict("receipt identity, checksum, or redundancy")
            name = db.execute("SELECT * FROM names WHERE ns=?", (u["ns"],)).fetchone()
            if u["expected_generation"] is not None and name["generation"] != u["expected_generation"]:
                result = ["CONFLICT", None]
                db.execute("UPDATE uploads SET state='REJECTED',fence=fence+1,result=? WHERE id=?", (encoded(result), uid))
            else:
                result = ["CREATED", u["version_id"]]
                db.execute("INSERT INTO versions VALUES (?,?,'PUBLISHED',1,1,?,1)", (u["version_id"], u["ns"], encoded(parts)))
                if fail_before_current: raise RuntimeError("injected before current update")
                db.execute("UPDATE names SET current=?,generation=generation+1 WHERE ns=?", (u["version_id"], u["ns"]))
                db.execute("UPDATE uploads SET state='COMPLETED',result=? WHERE id=?", (encoded(result), uid))
        if lost_ack: raise Unknown("commit succeeded but response was lost")
        return result

    def query(self, actor, uid):
        with self.tx() as db:
            u = self.upload(db, actor, uid)
            return u["state"], json.loads(u["result"]) if u["result"] else None

    def abort(self, actor, uid):
        with self.tx() as db:
            u = self.upload(db, actor, uid)
            if u["state"] == "FINALIZING": raise Conflict("completion already owns the upload")
            if u["state"] in ("COMPLETED", "ABORTED", "REJECTED"): return u["state"]
            if u["state"] != "OPEN": raise Conflict("reclaimed")
            db.execute("UPDATE uploads SET state='ABORTED',fence=fence+1 WHERE id=?", (uid,))
            return "ABORTED"

    def resolve(self, actor, scope, version=None, now=3):
        ns = namespace(*scope)
        with self.tx() as db:
            self.authorize(db, actor, ns, "read")
            name = db.execute("SELECT * FROM names WHERE ns=?", (ns,)).fetchone()
            vid = version if version is not None else (name["current"] if name else None)
            v = db.execute("SELECT * FROM versions WHERE id=? AND ns=?", (vid, ns)).fetchone()
            if v is None or v["state"] != "PUBLISHED": raise NotFound("no readable version")
            lease = str(uuid4())
            db.execute("INSERT INTO read_leases VALUES (?,?,?,?,?,?)", (lease, actor, vid, v["layout"], v["fence"], now+60))
            return dict(v), lease

    def renew_read(self, actor, scope, lease, now):
        ns = namespace(*scope)
        with self.tx() as db:
            self.authorize(db, actor, ns, "read")
            row = db.execute("""SELECT l.*,v.ns,v.state,v.fence AS current_fence FROM read_leases l
                JOIN versions v ON v.id=l.version_id WHERE l.id=?""", (lease,)).fetchone()
            if row is None or row["owner"] != actor or row["ns"] != ns or row["state"] != "PUBLISHED" or row["fence"] != row["current_fence"] or now >= row["expires"]:
                raise Conflict("lease cannot renew")
            db.execute("UPDATE read_leases SET expires=? WHERE id=?", (now+60, lease))

    def delete_marker(self, actor, scope):
        ns = namespace(*scope)
        with self.tx() as db:
            self.authorize(db, actor, ns, "write")
            db.execute("UPDATE names SET current=?,generation=generation+1 WHERE ns=?", ("marker:"+str(uuid4()), ns))

    def release_retention(self, version):
        # Administrative policy adapter; ordinary object PUT permission does not grant this.
        with self.tx() as db: db.execute("UPDATE versions SET retained=0 WHERE id=?", (version,))

    def claim_version(self, version):
        with self.tx() as db:
            v = db.execute("SELECT * FROM versions WHERE id=?", (version,)).fetchone()
            current = db.execute("SELECT current FROM names WHERE ns=?", (v["ns"],)).fetchone()[0]
            if v["retained"] or current == version: raise Conflict("published reference still retained/current")
            if v["state"] == "PUBLISHED":
                db.execute("UPDATE versions SET state='RECLAIMING',fence=fence+1 WHERE id=?", (version,))
            return [p["blob_id"] for p in json.loads(v["manifest"])]

    def sweep_version(self, version, now):
        with self.tx() as db:
            v = db.execute("SELECT * FROM versions WHERE id=?", (version,)).fetchone()
            if v["state"] != "RECLAIMING": raise Conflict("not claimed")
            if db.execute("SELECT 1 FROM read_leases WHERE version_id=? AND expires>?", (version, now)).fetchone(): return False
            blobs = [p["blob_id"] for p in json.loads(v["manifest"])]
        self.data.delete(blobs)
        return True

    def claim_upload(self, uid, now, quarantine=600):
        with self.tx() as db:
            u = db.execute("SELECT * FROM uploads WHERE id=?", (uid,)).fetchone()
            if u["state"] == "RECLAIMING": return u["fence"]
            if u["state"] not in ("OPEN", "ABORTED", "REJECTED") or now < max(u["created"]+quarantine, u["lease_until"]):
                raise Conflict("upload protected or too young")
            db.execute("UPDATE uploads SET state='RECLAIMING',fence=fence+1 WHERE id=?", (uid,))
            return u["fence"]+1

    def sweep_upload(self, uid, fence):
        with self.tx() as db:
            u = db.execute("SELECT * FROM uploads WHERE id=?", (uid,)).fetchone()
            if u["state"] != "RECLAIMING" or u["fence"] != fence: raise Conflict("not claimed")
        if not self.data.close_and_drain(uid, fence): return False
        self.data.delete([blob for blob, r in list(self.data.receipts.items()) if r.upload == uid])
        return True

    def sweep_extra(self, uid, blob):
        with self.tx() as db:
            u = db.execute("SELECT * FROM uploads WHERE id=?", (uid,)).fetchone()
            if u["state"] != "COMPLETED": raise Conflict("selection not permanently closed")
            if any(p["blob_id"] == blob for p in json.loads(u["frozen_manifest"])):
                raise Conflict("published part")
            receipt = self.data.receipts[blob]
            if receipt.upload != uid: raise Conflict("wrong physical scope")
        self.data.delete([blob])  # immutable identity, never a mutable part-number pathname
