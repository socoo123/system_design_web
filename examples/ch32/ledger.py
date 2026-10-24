"""SQLite teaching ledger. No provider I/O, lease takeover, billing API or calendar reset."""
from contextlib import contextmanager
import sqlite3


class Denied(Exception):
    pass


class Conflict(Exception):
    pass


SCHEMA = """
PRAGMA foreign_keys=ON;
CREATE TABLE budgets (
  tenant TEXT, period TEXT, cap INTEGER NOT NULL CHECK(cap>=0),
  held INTEGER NOT NULL DEFAULT 0 CHECK(held>=0),
  settled INTEGER NOT NULL DEFAULT 0 CHECK(settled>=0),
  blocked INTEGER NOT NULL DEFAULT 0 CHECK(blocked IN (0,1)),
  PRIMARY KEY(tenant,period)
);
CREATE TABLE requests (
  tenant TEXT, rid TEXT, digest TEXT NOT NULL, period TEXT NOT NULL,
  route TEXT NOT NULL, allow_extra INTEGER NOT NULL CHECK(allow_extra IN (0,1)),
  selected INTEGER NOT NULL DEFAULT 0 CHECK(selected BETWEEN 0 AND 2),
  committed INTEGER NOT NULL DEFAULT 0 CHECK(committed IN (0,1)),
  closed INTEGER NOT NULL DEFAULT 0 CHECK(closed IN (0,1)),
  PRIMARY KEY(tenant,rid),
  FOREIGN KEY(tenant,period) REFERENCES budgets(tenant,period)
);
CREATE TABLE attempts (
  tenant TEXT, rid TEXT, n INTEGER CHECK(n IN (1,2)),
  pool TEXT NOT NULL, price TEXT NOT NULL, owner TEXT NOT NULL,
  expected_model TEXT NOT NULL, upstream_id TEXT,
  bound INTEGER NOT NULL CHECK(bound>0),
  state TEXT NOT NULL CHECK(state IN ('INTENT','UNKNOWN','SETTLED')),
  outcome TEXT NOT NULL DEFAULT 'RUNNING'
    CHECK(outcome IN ('RUNNING','TRANSIENT','UNKNOWN')),
  input_tokens INTEGER, output_tokens INTEGER, evidence TEXT,
  PRIMARY KEY(tenant,rid,n), UNIQUE(pool,upstream_id),
  FOREIGN KEY(tenant,rid) REFERENCES requests(tenant,rid)
);
"""


def connect(path):
    db = sqlite3.connect(path, timeout=10, isolation_level=None)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA synchronous=FULL")
    return db


def initialize(path, cap=6000, period="p1"):
    with connect(path) as db:
        db.executescript(SCHEMA)
        db.execute("INSERT INTO budgets(tenant,period,cap) VALUES('t',?,?)", (period, cap))


@contextmanager
def write_tx(db):
    # File-database lock, shared by connections/processes; no Python mutex.
    db.execute("BEGIN IMMEDIATE")
    try:
        yield
        db.commit()
    except BaseException:
        db.rollback()
        raise


def request(db, tenant, rid):
    return db.execute("SELECT * FROM requests WHERE tenant=? AND rid=?", (tenant, rid)).fetchone()


def attempt(db, tenant, rid, n):
    return db.execute("SELECT * FROM attempts WHERE tenant=? AND rid=? AND n=?", (tenant, rid, n)).fetchone()


def valid_bound(bound):
    if type(bound) is not int or not 0 < bound <= 10**12:
        raise ValueError("positive bounded integer required")


# BEGIN reserve
def _hold(db, q, n, pool, bound, owner, price, model):
    changed = db.execute("""UPDATE budgets SET held=held+?
        WHERE tenant=? AND period=? AND blocked=0
          AND cap-settled-held>=?""",
        (bound, q["tenant"], q["period"], bound)).rowcount
    if changed != 1:
        raise Denied("quota_exhausted")
    db.execute("""INSERT INTO attempts
        (tenant,rid,n,pool,price,owner,bound,state,expected_model)
        VALUES(?,?,?,?,?,?,?,'INTENT',?)""",
        (q["tenant"], q["rid"], n, pool, price, owner, bound, model))
    db.execute("UPDATE requests SET selected=? WHERE tenant=? AND rid=?",
               (n, q["tenant"], q["rid"]))


def reserve_first(db, tenant, rid, digest, period, route, pool,
                  bound, owner, allow_extra=False, price="price-v1", model=None):
    valid_bound(bound)
    with write_tx(db):  # BEGIN IMMEDIATE / COMMIT or ROLLBACK
        q = request(db, tenant, rid)
        if q:
            if q["digest"] != digest:
                raise Conflict("rid_body_mismatch")
            return {"created": False, "request": dict(q)}
        db.execute("""INSERT INTO requests
            (tenant,rid,digest,period,route,allow_extra)
            VALUES(?,?,?,?,?,?)""",
            (tenant, rid, digest, period, route, int(allow_extra)))
        q = request(db, tenant, rid)
        _hold(db, q, 1, pool, bound, owner, price, model or pool)
        return {"created": True, "attempt": 1, "owner": owner}
# END reserve


def mark_failure(db, tenant, rid, n, owner, outcome="UNKNOWN"):
    if outcome not in ("UNKNOWN", "TRANSIENT"):
        raise ValueError("failure classification required")
    with write_tx(db):
        changed = db.execute("""UPDATE attempts SET outcome=?,
            state=CASE WHEN state='SETTLED' THEN state ELSE 'UNKNOWN' END
            WHERE tenant=? AND rid=? AND n=? AND owner=? AND outcome='RUNNING'""",
            (outcome, tenant, rid, n, owner)).rowcount
        return changed == 1


def reserve_fallback(db, tenant, rid, failed_owner, pool, bound, owner,
                     price="price-v1", model=None):
    """Trusted caller already validated pool/bound against the saved route plan."""
    valid_bound(bound)
    with write_tx(db):
        q, a = request(db, tenant, rid), attempt(db, tenant, rid, 1)
        if not q or not a or q["selected"] != 1 or not q["allow_extra"]:
            raise Denied("no_fallback")
        if q["committed"] or q["closed"] or a["owner"] != failed_owner:
            raise Denied("closed_or_wrong_owner")
        if a["outcome"] not in ("TRANSIENT", "UNKNOWN"):
            raise Denied("primary_not_failed")
        # Old UNKNOWN hold stays. _hold uses the original budget period.
        _hold(db, q, 2, pool, bound, owner, price, model or pool)
        return {"created": True, "attempt": 2, "owner": owner}


def bind_upstream(db, tenant, rid, n, owner, upstream_id, served_model):
    """Adapter/report authority verifies the response belongs to this invocation."""
    if not upstream_id:
        raise ValueError("upstream request identity required")
    with write_tx(db):
        a=attempt(db,tenant,rid,n)
        if not a or a["owner"] != owner or a["expected_model"] != served_model:
            raise Conflict("wrong_usage_source")
        if a["upstream_id"] and a["upstream_id"] != upstream_id:
            raise Conflict("upstream_identity_changed")
        try:
            db.execute("UPDATE attempts SET upstream_id=? WHERE tenant=? AND rid=? AND n=?",
                       (upstream_id,tenant,rid,n))
        except sqlite3.IntegrityError as error:
            raise Conflict("upstream_identity_already_bound") from error


def claim_commit(db, tenant, rid, n, owner):
    """Only True authorizes the caller to begin sending public headers."""
    with write_tx(db):
        changed = db.execute("""UPDATE requests SET committed=1
            WHERE tenant=? AND rid=? AND selected=? AND committed=0 AND closed=0
              AND EXISTS (SELECT 1 FROM attempts a
                WHERE a.tenant=requests.tenant AND a.rid=requests.rid
                  AND a.n=? AND a.owner=? AND a.outcome='RUNNING')""",
            (tenant, rid, n, n, owner)).rowcount
        return changed == 1


def close_if_selected(db, tenant, rid, n, owner):
    with write_tx(db):
        changed = db.execute("""UPDATE requests SET closed=1
            WHERE tenant=? AND rid=? AND selected=? AND closed=0
              AND EXISTS (SELECT 1 FROM attempts a
                WHERE a.tenant=requests.tenant AND a.rid=requests.rid
                  AND a.n=? AND a.owner=?)""", (tenant, rid, n, n, owner)).rowcount
        return changed == 1


# BEGIN settle
def settle(db, tenant, rid, n, input_tokens, output_tokens, evidence,
           *, upstream_id, served_model):
    # Evidence is final and authenticated by the trusted adapter/reconciler.
    if any(type(x) is not int or not 0 <= x <= 10**12
           for x in (input_tokens, output_tokens)) or not evidence:
        raise ValueError("final nonnegative usage and evidence required")
    with write_tx(db):
        q, a = request(db, tenant, rid), attempt(db, tenant, rid, n)
        if not q or not a:
            raise Denied("unknown_attempt")
        if not a["upstream_id"] or (upstream_id, served_model) != (
                a["upstream_id"], a["expected_model"]):
            raise Conflict("wrong_usage_source")
        payload = (input_tokens, output_tokens, evidence)
        if a["state"] == "SETTLED":
            if payload != (a["input_tokens"], a["output_tokens"], a["evidence"]):
                raise Conflict("conflicting_final_usage")
            return False
        actual = input_tokens + output_tokens
        db.execute("""UPDATE budgets SET held=held-?, settled=settled+?,
            blocked=CASE WHEN ?>? OR settled+?+held-?>cap THEN 1 ELSE blocked END
            WHERE tenant=? AND period=?""",
            (a["bound"], actual, actual, a["bound"], actual, a["bound"], tenant, q["period"]))
        db.execute("""UPDATE attempts SET state='SETTLED',
            input_tokens=?,output_tokens=?,evidence=?
            WHERE tenant=? AND rid=? AND n=?""",
            (*payload, tenant, rid, n))
        return True
# END settle


def balance(db, tenant="t", period="p1"):
    return dict(db.execute("SELECT * FROM budgets WHERE tenant=? AND period=?",
                           (tenant, period)).fetchone())
