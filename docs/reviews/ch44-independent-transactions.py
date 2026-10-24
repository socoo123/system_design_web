"""Independent new inputs over the page's actual SQL/schema on real SQLite files.
No import/run of the author's driver. Authentication/PG/network durability not tested.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib
import json
import re
import sqlite3
import tempfile
import threading
import uuid

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "examples/ch44"
checks = []


def sql_blocks(file):
    text = (SOURCE / file).read_text()
    return [re.sub(r"\s+", " ", match).strip() for match in re.findall(
        r"SQL (.*(?:\n\s+(?:VALUES|WHERE|ON CONFLICT) .*?)*)\n", text)]


A = sql_blocks("accept.pseudo")
C = sql_blocks("consume.pseudo")
assert len(A) == 5 and len(C) == 3, (A, C)


def connection(file):
    db = sqlite3.connect(file, timeout=10)
    db.execute("PRAGMA foreign_keys=ON")
    return db


def digest(body):
    return hashlib.sha256(json.dumps(body, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def require_identity(*fields):
    assert all(isinstance(x, str) and x and x.strip() == x for x in fields)


def accept(file, k, body, tenant="review-tenant", operation="CREATE", abort=False):
    require_identity(tenant, operation, k)
    p = dict(tenant=tenant, operation=operation, K=k, digest=digest(body), new_id=str(uuid.uuid4()))
    db = connection(file)
    try:
        db.execute("BEGIN")
        won = db.execute(A[0], p).fetchone()
        if won is None:
            known = db.execute(A[1], p).fetchone()
            if known is None:
                db.rollback()
                return ("UNKNOWN",)
            db.rollback()
            if known[0] != p["digest"]:
                return ("CONFLICT",)
            return (known[1], known[2])
        db.execute(A[2], p)
        db.execute(A[3], p)
        p["result"] = json.dumps({"order_id": p["new_id"], "state": "ACCEPTED"})
        db.execute(A[4], p)
        if abort:
            raise RuntimeError("abort after all writes, before commit")
        db.commit()
        return (p["new_id"], p["result"])
    except BaseException:
        db.rollback()
        raise
    finally:
        db.close()


def consume(file, event, account, delta, tenant="review-tenant", consumer="loyalty", abort=False):
    require_identity(tenant, consumer, event)
    p = dict(tenant=tenant, consumer=consumer, event_id=event, account_id=account,
             delta=delta, digest=digest([account, delta]))
    db = connection(file)
    try:
        db.execute("BEGIN")
        won = db.execute(C[0], p).fetchone()
        if won is None:
            known = db.execute(C[1], p).fetchone()
            db.rollback()
            return ("UNKNOWN",) if known is None else (("CONFLICT",) if known[0] != p["digest"] else (known[1],))
        if db.execute(C[2], p).rowcount != 1:
            db.rollback()
            return ("NO_ACCOUNT_NO_ACK",)
        if abort:
            raise RuntimeError("abort local effect before commit")
        db.commit()
        return (delta,)
    except BaseException:
        db.rollback()
        raise
    finally:
        db.close()


def race(functions):
    barrier = threading.Barrier(len(functions))
    def run(function):
        barrier.wait()
        return function()
    with ThreadPoolExecutor(max_workers=len(functions)) as pool:
        return list(pool.map(run, functions))


def counts(file):
    with connection(file) as db:
        return tuple(db.execute("SELECT count(*) FROM " + table).fetchone()[0]
                     for table in ["orders", "intents", "outbox", "inbox"])


with tempfile.TemporaryDirectory(prefix="ch44-independent-sql-") as folder:
    file = Path(folder) / "review.db"
    with connection(file) as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript((SOURCE / "schema.sql").read_text())
        db.executemany("INSERT INTO accounts VALUES(?,?,?)", [
            ("review-tenant", "a", 500), ("review-tenant", "b", 1000), ("other-tenant", "a", 900)])
    original = race([lambda: accept(file, "review-K", {"sku": "red", "qty": 3})] * 16)
    assert len(set(original)) == 1 and counts(file) == (1, 1, 1, 0)
    checks.append("16 concurrent equal requests commit one order/result/outbox and recover the same result")
    rivals = race([lambda body=body: accept(file, "payload-race", body)
                   for body in [{"sku": "blue"}, {"sku": "green"}]])
    assert rivals.count(("CONFLICT",)) == 1 and counts(file)[:3] == (2, 2, 2)
    checks.append("same K with two concurrently different payloads has one commit and one conflict")
    assert accept(file, "review-K", {"sku": "red", "qty": 3}, operation="CLONE")[0] != original[0][0]
    assert accept(file, "review-K", {"sku": "red", "qty": 3}, tenant="other-tenant")[0] != original[0][0]
    assert counts(file)[:3] == (4, 4, 4)
    checks.append("tenant and operation scopes both participate in stable K identity")
    before = counts(file)
    try:
        accept(file, "aborted-K", {"sku": "discard"}, abort=True)
        raise AssertionError("abort expected")
    except RuntimeError:
        pass
    assert counts(file) == before
    checks.append("abort after all order/outbox/result writes leaves no partial intent")
    committed_without_delivering_ack = accept(file, "resume-K", {"sku": "yellow", "qty": 7})
    assert accept(file, "resume-K", {"qty": 7, "sku": "yellow"}) == committed_without_delivering_ack
    with connection(file) as db:
        db.execute("UPDATE intents SET result=NULL WHERE k='resume-K'")
    assert accept(file, "resume-K", {"sku": "yellow", "qty": 7}) == (committed_without_delivering_ack[0], None)
    assert counts(file)[:3] == (5, 5, 5)
    checks.append("dropped caller ACK and later trimmed result preserve original order identity")

    assert consume(file, "event-19", "a", 17) == (17,)
    assert consume(file, "event-19", "a", 17) == (17,)
    assert consume(file, "event-19", "b", 17) == ("CONFLICT",)
    assert consume(file, "event-19", "a", 18) == ("CONFLICT",)
    checks.append("local inbox replays exact effect, and binds both account and delta")
    assert consume(file, "event-19", "a", 3, consumer="bonus") == (3,)
    assert consume(file, "event-19", "a", 5, tenant="other-tenant") == (5,)
    assert consume(file, "missing", "absent", 100) == ("NO_ACCOUNT_NO_ACK",)
    before = counts(file)
    try:
        consume(file, "aborted-event", "a", 999, abort=True)
        raise AssertionError("abort expected")
    except RuntimeError:
        pass
    assert counts(file) == before
    checks.append("consumer/tenant scopes are separate; missing account and precommit abort roll back inbox/effect")
    replies = race([lambda: consume(file, "event-race", "a", 7)] * 16)
    assert replies == [(7,)] * 16
    assert consume(file, "refund", "a", -4) == (-4,)
    with connection(file) as db:
        balances = db.execute("SELECT tenant,account_id,points FROM accounts ORDER BY tenant,account_id").fetchall()
    assert balances == [("other-tenant", "a", 905), ("review-tenant", "a", 523), ("review-tenant", "b", 1000)]
    assert counts(file) == (5, 5, 5, 5)
    checks.append("16 concurrent inbox deliveries apply one +7; independent expected balances are 905/523/1000")
    rejected = 0
    with connection(file) as db:
        for target, fields, values in [
                ("intents", ["tenant", "operation", "k"], ["review-tenant", "CREATE", "bad"]),
                ("inbox", ["tenant", "consumer", "event_id"], ["review-tenant", "loyalty", "bad"])]:
            for index in range(3):
                for bad in [None, "", "   "]:
                    row = values.copy()
                    row[index] = bad
                    try:
                        if target == "intents":
                            db.execute("INSERT INTO intents VALUES(?,?,?,'digest','none',NULL)", row)
                        else:
                            db.execute("INSERT INTO inbox VALUES(?,?,?,'digest',1)", row)
                        raise AssertionError((target, fields[index], bad))
                    except sqlite3.IntegrityError:
                        rejected += 1
                    db.rollback()
    assert rejected == 18
    checks.append("18 direct DB NULL/empty/blank identity injections rejected across all scope columns")
    evidence = {"passed": True, "sqlite": sqlite3.sqlite_version, "sqlStatementsFromSources": 8,
                "checks": checks, "count": len(checks), "finalCounts": counts(file),
                "balances": balances, "sourceHashes": {
                    str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                    for p in [SOURCE / "accept.pseudo", SOURCE / "consume.pseudo", SOURCE / "schema.sql"]},
                "limits": ["SQLite concurrency and local transactions only", "ACK loss is caller-modelled, not a network injection", "Authentication/current authorization and PostgreSQL were not executed"]}
(ROOT / "docs/reviews/ch44-independent-transactions-results.json").write_text(json.dumps(evidence, indent=2) + "\n")
print(json.dumps(evidence, indent=2))
