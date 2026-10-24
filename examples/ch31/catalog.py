"""SQLite transaction model, not a replicated WAL or a vector database.

The same authority database owns the log, MVCC rows, manifests, alias and pins.
Immutable JSON snapshots stand in for verified, loaded vector/payload/index roots.
"""
import contextlib
import hashlib
import json
import math
import sqlite3


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


class Rejected(Exception):
    pass


DDL = """
CREATE TABLE IF NOT EXISTS space(id TEXT PRIMARY KEY, schema_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS progress(space TEXT, shard INTEGER, epoch INTEGER,
 durable INTEGER NOT NULL DEFAULT 0, applied INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(space,shard));
CREATE TABLE IF NOT EXISTS event(space TEXT, shard INTEGER, lsn INTEGER, op TEXT,
 body TEXT NOT NULL, PRIMARY KEY(space,shard,lsn), UNIQUE(space,shard,op));
CREATE TABLE IF NOT EXISTS mvcc(space TEXT, shard INTEGER, lsn INTEGER, tenant TEXT,
 id TEXT, version INTEGER, body TEXT NOT NULL, PRIMARY KEY(space,shard,lsn));
CREATE TABLE IF NOT EXISTS seen_version(space TEXT, shard INTEGER, tenant TEXT,
 id TEXT, version INTEGER, body TEXT NOT NULL, PRIMARY KEY(space,shard,tenant,id,version));
CREATE TABLE IF NOT EXISTS bundle(id TEXT PRIMARY KEY, space TEXT NOT NULL,
 route TEXT NOT NULL, codebook TEXT NOT NULL, published INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS root(bundle TEXT, shard INTEGER, epoch INTEGER, cut INTEGER,
 hash TEXT NOT NULL, document TEXT NOT NULL, PRIMARY KEY(bundle,shard));
CREATE TABLE IF NOT EXISTS alias(name TEXT PRIMARY KEY, seq INTEGER NOT NULL, bundle TEXT);
CREATE TABLE IF NOT EXISTS pin(query TEXT PRIMARY KEY, bundle TEXT NOT NULL);
"""


class Catalog:
    def __init__(self, path):
        self.db = sqlite3.connect(path, timeout=10, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=FULL")
        self.db.executescript(DDL)

    @contextlib.contextmanager
    def tx(self):
        self.db.execute("BEGIN IMMEDIATE")
        try:
            yield
            self.db.execute("COMMIT")
        except BaseException:
            if self.db.in_transaction:
                self.db.execute("ROLLBACK")
            raise

    def schema(self, space):
        row = self.db.execute("SELECT schema_json FROM space WHERE id=?", (space,)).fetchone()
        if row is None:
            raise Rejected("unknown space")
        return json.loads(row[0])

    def add_space(self, space, model, dimensions=2, shards=(0, 1), metric="cosine", route="hash-v1"):
        schema = dict(model=model, dimensions=dimensions, metric=metric,
                      normalize="unit" if metric == "cosine" else "none", shards=list(shards), route=route)
        if dimensions < 1 or metric not in ("cosine", "squared_l2", "inner_product") or not shards or len(set(shards)) != len(shards):
            raise Rejected("schema")
        with self.tx():
            self.db.execute("INSERT INTO space VALUES (?,?)", (space, canonical(schema)))
            self.db.executemany("INSERT INTO progress(space,shard,epoch) VALUES (?,?,1)", [(space,s) for s in shards])

    def accept(self, space, shard, operation, point, fail_before_commit=False):
        """Trusted shard routing/version producer; retry operation IDs forever in this model."""
        schema = self.schema(space)
        p = dict(point)
        if not operation or shard not in schema["shards"] or p["version"] < 1:
            raise Rejected("write identity")
        if not p["deleted"]:
            v = p["vector"]
            if len(v) != schema["dimensions"] or any(not math.isfinite(x) for x in v):
                raise Rejected("vector")
            norm = math.hypot(*v)
            if schema["metric"] == "cosine":
                if norm == 0 or not math.isfinite(norm):
                    raise Rejected("cosine norm")
                p["vector"] = [x/norm for x in v]
        body = canonical(p)
        with self.tx():
            old = self.db.execute("SELECT lsn,body FROM event WHERE space=? AND shard=? AND op=?", (space,shard,operation)).fetchone()
            progress = self.db.execute("SELECT * FROM progress WHERE space=? AND shard=?", (space,shard)).fetchone()
            if old:
                if old["body"] != body:
                    raise Rejected("operation reused with different payload")
                return space, progress["epoch"], old["lsn"]
            lsn = progress["durable"] + 1
            self.db.execute("INSERT INTO event VALUES (?,?,?,?,?)", (space,shard,lsn,operation,body))
            self.db.execute("UPDATE progress SET durable=? WHERE space=? AND shard=?", (lsn,space,shard))
            if fail_before_commit:
                raise Rejected("injected rollback")
        return space, progress["epoch"], lsn

    # BEGIN apply
    def apply_next(self, space, shard, fail_before_commit=False):
        with self.tx():  # actual SQLite BEGIN IMMEDIATE / COMMIT
            p = self.db.execute("SELECT * FROM progress WHERE space=? AND shard=?", (space,shard)).fetchone()
            lsn = p["applied"] + 1
            e = self.db.execute("SELECT body FROM event WHERE space=? AND shard=? AND lsn=?", (space,shard,lsn)).fetchone()
            if e is None:
                return False  # never jump across a hole
            body = json.loads(e["body"])
            old = self.db.execute("SELECT version,body FROM mvcc WHERE space=? AND shard=? AND tenant=? AND id=? ORDER BY version DESC LIMIT 1",
                                  (space,shard,body["tenant"],body["id"])).fetchone()
            same = self.db.execute("SELECT body FROM seen_version WHERE space=? AND shard=? AND tenant=? AND id=? AND version=?",
                                   (space,shard,body["tenant"],body["id"],body["version"])).fetchone()
            if same is not None and same["body"] != e["body"]:
                raise Rejected("same version, different payload; stop the prefix")
            self.db.execute("INSERT OR IGNORE INTO seen_version VALUES (?,?,?,?,?,?)",
                            (space,shard,body["tenant"],body["id"],body["version"],e["body"]))
            if old is None or body["version"] > old["version"]:
                self.db.execute("INSERT INTO mvcc VALUES (?,?,?,?,?,?,?)",
                                (space,shard,lsn,body["tenant"],body["id"],body["version"],e["body"]))
            # A stale event is a deterministic no-op, including an old upsert after delete.
            self.db.execute("UPDATE progress SET applied=? WHERE space=? AND shard=?", (lsn,space,shard))
            if fail_before_commit:
                raise Rejected("injected rollback")
        return True  # this transaction committed vector + metadata + version + watermark
    # END apply

    def drain(self, space, shard):
        while self.apply_next(space, shard):
            pass

    def create_bundle(self, bundle, space, route=None, codebook="flat"):
        schema = self.schema(space)
        route = schema["route"] if route is None else route
        if route != schema["route"]:
            raise Rejected("route change needs a separately populated space")
        with self.tx():
            self.db.execute("INSERT INTO bundle(id,space,route,codebook) VALUES (?,?,?,?)", (bundle,space,route,codebook))

    def stage_root(self, bundle, shard, cut):
        with self.tx():
            b = self.db.execute("SELECT * FROM bundle WHERE id=?", (bundle,)).fetchone()
            if b is None or b["published"]:
                raise Rejected("immutable published bundle")
            schema = self.schema(b["space"])
            p = self.db.execute("SELECT * FROM progress WHERE space=? AND shard=?", (b["space"],shard)).fetchone()
            if p is None or cut < 0 or cut > p["applied"]:
                raise Rejected("not search-ready")
            rows = self.db.execute("SELECT * FROM mvcc WHERE space=? AND shard=? AND lsn<=? ORDER BY lsn", (b["space"],shard,cut)).fetchall()
            live = {}
            for row in rows:
                live[(row["tenant"],row["id"])] = json.loads(row["body"])
            document = dict(space=b["space"], schema=schema, route=b["route"], codebook=b["codebook"],
                            shard=shard, epoch=p["epoch"], cut=cut, points=list(live.values()))
            self.db.execute("INSERT INTO root VALUES (?,?,?,?,?,?)", (bundle,shard,p["epoch"],cut,digest(document),canonical(document)))

    # BEGIN publish
    def publish(self, alias, expected_seq, bundle, barrier):
        with self.tx():  # all roots and the alias CAS share one authority transaction
            b = self.db.execute("SELECT * FROM bundle WHERE id=?", (bundle,)).fetchone()
            if b is None:
                raise Rejected("unknown bundle")
            required = set(self.schema(b["space"])["shards"])
            roots = self.db.execute("SELECT * FROM root WHERE bundle=?", (bundle,)).fetchall()
            if set(barrier) != required or {r["shard"] for r in roots} != required:
                raise Rejected("missing shard or barrier")
            for r in roots:
                epoch, minimum = barrier[r["shard"]]
                if r["epoch"] != epoch or r["cut"] < minimum or digest(json.loads(r["document"])) != r["hash"]:
                    raise Rejected("stale or corrupt root")
            self.db.execute("INSERT OR IGNORE INTO alias VALUES (?,0,NULL)", (alias,))
            changed = self.db.execute("UPDATE alias SET seq=seq+1,bundle=? WHERE name=? AND seq=?",
                                      (bundle,alias,expected_seq)).rowcount
            if changed != 1:
                raise Rejected("publication CAS lost")
            self.db.execute("UPDATE bundle SET published=1 WHERE id=?", (bundle,))
        return expected_seq + 1
    # END publish

    def pin(self, alias, query, minimum=None):
        with self.tx():
            a = self.db.execute("SELECT * FROM alias WHERE name=?", (alias,)).fetchone()
            if a is None or a["bundle"] is None:
                raise Rejected("no serving bundle")
            b = self.db.execute("SELECT * FROM bundle WHERE id=?", (a["bundle"],)).fetchone()
            roots = self.db.execute("SELECT * FROM root WHERE bundle=?", (a["bundle"],)).fetchall()
            required = set(self.schema(b["space"])["shards"])
            if {r["shard"] for r in roots} != required:
                raise Rejected("incomplete stored bundle")
            if minimum is not None and not set(minimum).issubset(required):
                raise Rejected("token requires route translation")
            for r in roots:
                if digest(json.loads(r["document"])) != r["hash"]:
                    raise Rejected("corrupt root")
                if minimum is not None and r["shard"] in minimum:
                    token_space, epoch, cut = minimum[r["shard"]]
                    if token_space != b["space"] or epoch != r["epoch"] or r["cut"] < cut:
                        raise Rejected("read token not covered")
            self.db.execute("INSERT INTO pin VALUES (?,?)", (query,a["bundle"]))
            return dict(query=query, bundle=a["bundle"], seq=a["seq"], roots={r["shard"]:dict(r) for r in roots})

    def release(self, query):
        with self.tx():
            self.db.execute("DELETE FROM pin WHERE query=?", (query,))

    def retire(self, bundle):
        with self.tx():
            if self.db.execute("SELECT 1 FROM alias WHERE bundle=? UNION ALL SELECT 1 FROM pin WHERE bundle=?", (bundle,bundle)).fetchone():
                raise Rejected("serving or pinned")
            self.db.execute("DELETE FROM root WHERE bundle=?", (bundle,))
            self.db.execute("DELETE FROM bundle WHERE id=?", (bundle,))

    def close(self):
        self.db.close()


def gather(pin, attempts, replies, allow_partial=False, k=10):
    """Replies are trusted replica results after VectorCandidates-style checks.

    A digest identifies the read root, not a proof of arbitrary remote computation.
    One active attempt per shard; late attempts do not count twice.
    """
    required = set(pin["roots"])
    if set(attempts) != required:
        raise Rejected("attempt coverage")
    accepted = {}
    for reply in replies:
        s = reply["shard"]
        if s not in required or reply["query"] != pin["query"] or reply["attempt"] != attempts[s]:
            continue
        r = pin["roots"][s]
        if (reply["bundle"],reply["root"],reply["epoch"],reply["cut"]) != (pin["bundle"],r["hash"],r["epoch"],r["cut"]):
            raise Rejected("mixed generation or moving cut")
        if s in accepted:
            if canonical(accepted[s]) != canonical(reply):
                raise Rejected("inconsistent repeated reply")
            continue
        if any(not math.isfinite(h["distance"]) for h in reply["hits"]):
            raise Rejected("nonfinite score")
        accepted[s] = reply
    missing = sorted(required - set(accepted))
    if missing and not allow_partial:
        return dict(status="UNAVAILABLE", complete=False, hits=[], missing=missing)
    hits = sorted([h for r in accepted.values() for h in r["hits"]], key=lambda h:(h["distance"],h["id"]))
    return dict(status="PARTIAL" if missing else "OK", complete=not missing,
                hits=hits[:k], missing=missing, covered=sorted(accepted))
