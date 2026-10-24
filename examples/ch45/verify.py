"""Execute local SQL contracts, not a PostgreSQL/PSP/broker implementation."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from pathlib import Path
import hashlib
import json
import sqlite3
import tempfile
import threading
import uuid

ROOT = Path(__file__).resolve().parent
checks = []
traces = []


class RetryableConflict(RuntimeError):
    """Caller must reload/retry within budget; no committed outcome means no ACK."""


def next_version(version):
    # SQLite INTEGER affinity can promote overflow to REAL; mirror Java long.
    if type(version) is not int or not 0 <= version < 2**63 - 1:
        raise OverflowError("VERSION")
    return version + 1


def check(condition, label):
    if not condition:
        raise AssertionError(label)
    checks.append(label)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def connect(path):
    conn = sqlite3.connect(path, timeout=10, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def fixture(path, pending=False):
    with closing(connect(path)) as db:
        db.executescript((ROOT / "schema.sql").read_text())
        values = ("t1", "o42", 9 if pending else 7, "pending_pay" if pending else "draft",
                  10999 if pending else 8000, "USD", "a9" if pending else None, None)
        db.execute("INSERT INTO orders VALUES(?,?,?,?,?,?,?,?)", values)
        db.executemany("INSERT INTO order_lines VALUES('t1','o42',?,?,?)",
                       [("sku1", 3 if pending else 2, 2999), ("sku2", 1, 2002)])
        for payment in ["p9", "p10"]:
            db.execute("INSERT INTO bindings VALUES('t1',?,'o42','a9',10999,'USD')", (payment,))


def snapshot(path):
    with closing(connect(path)) as db:
        return {table: [dict(row) for row in db.execute(f"SELECT * FROM {table} ORDER BY 1,2")]
                for table in ["orders", "order_lines", "command_result", "inbox", "capture_result",
                              "refund_work", "outbox", "quarantine"]}


def edit(path, key, expected, quantity, fail=False, tenant="t1"):
    # Fixture supplies an already authenticated tenant authorized for o42.
    request_hash = digest(["edit-v1", tenant, "o42", expected, "sku1", quantity])
    with closing(connect(path)) as db:
        db.execute("BEGIN IMMEDIATE")
        try:
            fresh = db.execute("INSERT INTO command_result VALUES(?,'o42',?,?,NULL) "
                               "ON CONFLICT(tenant,order_id,key) DO NOTHING",
                               (tenant, key, request_hash)).rowcount
            if not fresh:
                saved = db.execute("SELECT * FROM command_result WHERE tenant=? AND order_id='o42' AND key=?",
                                   (tenant, key)).fetchone()
                if saved["hash"] != request_hash:
                    raise ValueError("KEY_REUSE")
                db.rollback()
                return json.loads(saved["result"])
            before = db.execute("SELECT * FROM orders WHERE tenant=? AND id='o42'", (tenant,)).fetchone()
            if not before or before["version"] != expected or before["state"] != "draft":
                raise ValueError("CONFLICT")
            candidate_version = next_version(before["version"])
            if not isinstance(quantity, int) or quantity <= 0:
                raise ValueError("QUANTITY")
            total = quantity * 2999 + 2002
            if total > 2**63 - 1:
                raise OverflowError("MONEY")
            changed = db.execute("UPDATE orders SET total=?,version=version+1 WHERE tenant=? AND id='o42' "
                                 "AND version=? AND state='draft'", (total, tenant, expected)).rowcount
            if changed != 1:
                raise ValueError("CONFLICT")
            db.execute("UPDATE order_lines SET quantity=? WHERE tenant=? AND order_id='o42' AND sku='sku1'",
                       (quantity, tenant))
            if fail:
                raise RuntimeError("crash before receipt")
            receipt = {"version": candidate_version, "total": total, "currency": "USD"}
            db.execute("UPDATE command_result SET result=? WHERE tenant=? AND order_id='o42' AND key=?",
                       (json.dumps(receipt), tenant, key))
            db.commit()
            return receipt
        except BaseException:
            db.rollback()
            raise


def event(event_id="e17", **changes):
    data = {"source": "pay", "version": 1, "event_id": event_id, "tenant": "t1", "order_id": "o42",
            "payment_id": "p9", "attempt": "a9", "amount": 10999, "currency": "USD", "pay_version": 3}
    data.update(changes)
    return data


def quarantine(db, message, reason):
    db.execute("INSERT INTO quarantine VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING",
               (message["source"], message["event_id"], digest(message), reason, json.dumps(message)))
    return "QUARANTINED"


def consume(path, message, fail=False, authenticated=True):
    # No signature implementation: authenticated is the adapter's required input contract.
    if not authenticated:
        raise ValueError("UNAUTHENTICATED")
    with closing(connect(path)) as db:
        db.execute("BEGIN IMMEDIATE")
        try:
            binding = db.execute("SELECT * FROM bindings WHERE tenant=? AND payment_id=?",
                                 (message["tenant"], message["payment_id"])).fetchone()
            columns = ["order_id", "attempt", "amount", "currency"]
            if message["source"] != "pay" or message["version"] != 1 or not binding or any(
                    binding[name] != message[name] for name in columns):
                result = quarantine(db, message, "CONTRACT_OR_BINDING")
                db.commit()  # durable custody before ACK
                return result
            payload_hash = digest(message)
            fresh = db.execute("INSERT INTO inbox VALUES('order','pay',?,?,NULL) ON CONFLICT DO NOTHING",
                               (message["event_id"], payload_hash)).rowcount
            if not fresh:
                saved = db.execute("SELECT * FROM inbox WHERE consumer='order' AND source='pay' AND event_id=?",
                                   (message["event_id"],)).fetchone()
                if saved["payload_hash"] != payload_hash:
                    result = quarantine(db, message, "EVENT_ID_REUSE")
                    db.commit()
                    return result
                db.rollback()
                return saved["outcome"]
            fact_hash = digest(["capture-v1"] + [message[name] for name in
                                ["tenant", "order_id", "payment_id", "attempt", "amount", "currency"]])
            new_fact = db.execute("INSERT INTO capture_result VALUES(?,?,?,NULL) ON CONFLICT DO NOTHING",
                                 (message["tenant"], message["payment_id"], fact_hash)).rowcount
            if not new_fact:
                saved = db.execute("SELECT * FROM capture_result WHERE tenant=? AND payment_id=?",
                                   (message["tenant"], message["payment_id"])).fetchone()
                if saved["fact_hash"] != fact_hash:
                    raise ValueError("FACT_ID_REUSE")
                outcome = saved["outcome"]
            else:
                before = db.execute("SELECT * FROM orders WHERE tenant=? AND id=?",
                                    (message["tenant"], message["order_id"])).fetchone()
                if not before or before["attempt"] != message["attempt"] or before["total"] != message["amount"] \
                        or before["currency"] != message["currency"] or before["state"] == "draft":
                    raise ValueError("ORDER_CONTRACT")
                if before["state"] == "pending_pay":
                    next_version(before["version"])  # fail before any version+1 SQL
                    changed = db.execute("UPDATE orders SET state='paid',version=version+1,accepted_payment=? "
                                         "WHERE tenant=? AND id=? AND state='pending_pay' AND version=?",
                                         (message["payment_id"], message["tenant"], message["order_id"], before["version"])).rowcount
                    if changed != 1:
                        raise RetryableConflict("CAS_CONFLICT")
                    outcome, kind = "ACCEPTED", "OrderPaid"
                elif before["state"] == "paid" and before["accepted_payment"] == message["payment_id"]:
                    outcome, kind = "ALREADY_ACCEPTED", None
                else:
                    outcome, kind = "REFUND_REQUIRED", "RefundRequested"
                    refund_id = "r17" if message["payment_id"] == "p9" else "r-" + str(uuid.uuid4())
                    db.execute("INSERT INTO refund_work VALUES(?,?,?,?,?,'pending')",
                               (message["tenant"], message["payment_id"], refund_id, message["amount"], message["currency"]))
                if fail:
                    raise RuntimeError("crash before outbox and results")
                if kind:
                    public_payload = {name: message[name] for name in
                                      ["tenant", "order_id", "payment_id", "amount", "currency"]}
                    if kind == "RefundRequested":
                        public_payload["refund_id"] = refund_id
                    db.execute("INSERT INTO outbox VALUES(?,?,?,'pending')",
                               (str(uuid.uuid4()), kind, json.dumps(public_payload)))
                db.execute("UPDATE capture_result SET outcome=? WHERE tenant=? AND payment_id=?",
                           (outcome, message["tenant"], message["payment_id"]))
            db.execute("UPDATE inbox SET outcome=? WHERE consumer='order' AND source='pay' AND event_id=?",
                       (outcome, message["event_id"]))
            db.commit()
            return outcome
        except ValueError as error:
            db.rollback()
            db.execute("BEGIN IMMEDIATE")
            result = quarantine(db, message, str(error))
            db.commit()
            return result
        except BaseException:
            db.rollback()
            raise


def must_fail(action, kind, label):
    try:
        action()
    except kind:
        check(True, label)
    else:
        raise AssertionError(label)


def run():
    with tempfile.TemporaryDirectory(prefix="ch45-sql-") as tmp:
        def fresh(name, pending=False):
            path = Path(tmp) / (name + ".sqlite")
            fixture(path, pending)
            return path
        path = fresh("edit")
        before = snapshot(path)
        must_fail(lambda: edit(path, "crash", 7, 3, True), RuntimeError, "edit crash raised")
        check(snapshot(path) == before, "root lines and command receipt roll back together")
        first = edit(path, "k42", 7, 3)
        check(first == {"version": 8, "total": 10999, "currency": "USD"}, "normal edit commits v8")
        edit(path, "k43", 8, 4)
        check(edit(path, "k42", 7, 3) == first, "lost response returns original v8 even after another edit")
        check(snapshot(path)["orders"][0]["total"] == 13998, "replay does not apply edit again")
        must_fail(lambda: edit(path, "k42", 7, 4), ValueError, "same key changed parameters rejected")
        before = snapshot(path)
        must_fail(lambda: edit(path, "stale", 7, 5), ValueError, "stale version rejected")
        check(snapshot(path) == before, "stale write changes no line or receipt")
        must_fail(lambda: edit(path, "bad", 9, 0), ValueError, "invalid quantity rejected")
        check(snapshot(path) == before, "invalid quantity commits no placeholder")
        path = fresh("edit-version-overflow")
        with closing(connect(path)) as db:
            db.execute("UPDATE orders SET version=?", (2**63 - 1,))
        before = snapshot(path)
        must_fail(lambda: edit(path, "max-version", 2**63 - 1, 3), OverflowError,
                  "signed64 edit version exhaustion rejected")
        check(snapshot(path) == before, "version overflow changes no root lines or receipt")
        path = fresh("capture-version-overflow", True)
        with closing(connect(path)) as db:
            db.execute("UPDATE orders SET version=?", (2**63 - 1,))
        before = snapshot(path)
        must_fail(lambda: consume(path, event("max-capture-version")), OverflowError,
                  "signed64 capture version exhaustion rejected without ACK")
        check(snapshot(path) == before, "capture overflow rolls back inbox fact state and outbox")
        path = fresh("same-key")
        barrier = threading.Barrier(2)
        def same_key(_):
            barrier.wait(timeout=5)
            return edit(path, "k42", 7, 3)
        with ThreadPoolExecutor(max_workers=2) as pool:
            receipts = list(pool.map(same_key, [0, 1]))
        data = snapshot(path)
        check(receipts[0] == receipts[1] and data["orders"][0]["version"] == 8, "two connections same key commit once")
        check(len(data["command_result"]) == 1 and data["command_result"][0]["result"] is not None, "unique durable command result")
        path = fresh("capture", True)
        before = snapshot(path)
        must_fail(lambda: consume(path, event(), True), RuntimeError, "capture crash raised")
        check(snapshot(path) == before, "inbox state capture result outbox all roll back")
        check(consume(path, event()) == "ACCEPTED", "normal capture accepted")
        first = snapshot(path)
        check(first["orders"][0]["state"] == "paid" and first["orders"][0]["version"] == 10, "paid v10 durable")
        check(len(first["inbox"]) == len(first["capture_result"]) == len(first["outbox"]) == 1, "normal state result and event atomic")
        check(consume(path, event()) == "ACCEPTED" and snapshot(path) == first, "lost ACK same delivery returns original decision")
        check(consume(path, event("e18")) == "ACCEPTED", "different delivery same capture returns original result")
        data = snapshot(path)
        check(len(data["inbox"]) == 2 and len(data["capture_result"]) == len(data["outbox"]) == 1, "delivery and business uniqueness are distinct")
        check(consume(path, event(pay_version=4)) == "QUARANTINED", "same event ID changed payload quarantined")
        check(consume(path, event("bad-amount", amount=10998)) == "QUARANTINED", "amount binding mismatch quarantined")
        check(consume(path, event("bad-version", version=2)) == "QUARANTINED", "unknown schema quarantined")
        check(consume(path, event("bad-tenant", tenant="t2")) == "QUARANTINED", "foreign tenant cannot apply")
        must_fail(lambda: consume(path, event("forged"), authenticated=False), ValueError, "source authentication is required")
        data = snapshot(path)
        check(len(data["quarantine"]) == 4 and len(data["inbox"]) == 2, "quarantine takes durable custody without fake application")
        check(consume(path, event("extra", payment_id="p10")) == "REFUND_REQUIRED", "extra capture creates refund work")
        data = snapshot(path)
        check(data["orders"][0]["accepted_payment"] == "p9" and len(data["refund_work"]) == 1, "extra capture does not create second fulfillment")
        path = fresh("closed", True)
        with closing(connect(path)) as db:
            db.execute("UPDATE orders SET state='closed',version=10 WHERE version=9")
        before = snapshot(path)
        must_fail(lambda: consume(path, event(), True), RuntimeError, "late capture crash raised")
        check(snapshot(path) == before, "late capture rollback leaves no consumed inbox or lost refund")
        check(consume(path, event()) == "REFUND_REQUIRED", "late capture creates refund obligation")
        consume(path, event("e18"))
        data = snapshot(path)
        check(data["orders"][0]["state"] == "closed" and data["orders"][0]["version"] == 10, "closed never resurrects")
        check(len(data["inbox"]) == 2 and len(data["refund_work"]) == len(data["outbox"]) == 1, "late capture different event IDs preserve one r17")
        check(json.loads(data["outbox"][0]["payload"])["refund_id"] == "r17", "refund public contract carries durable r17")
        with closing(connect(path)) as db:
            db.execute("UPDATE refund_work SET state='UNKNOWN' WHERE tenant='t1' AND refund_id='r17'")
        consume(path, event("e19"))
        data = snapshot(path)
        check(data["refund_work"][0]["state"] == "UNKNOWN" and data["refund_work"][0]["refund_id"] == "r17", "redelivery preserves unknown original refund identity")
        path = fresh("race", True)
        barrier = threading.Barrier(2)
        def race(target):
            with closing(connect(path)) as db:
                observed = db.execute("SELECT version FROM orders WHERE tenant='t1' AND id='o42'").fetchone()[0]
                barrier.wait(timeout=5)
                db.execute("BEGIN IMMEDIATE")
                count = db.execute("UPDATE orders SET state=?,version=version+1,accepted_payment=? WHERE tenant='t1' AND id='o42' "
                                   "AND state='pending_pay' AND version=?", (target, "p9" if target == "paid" else None, observed)).rowcount
                db.commit()
                return {"target": target, "observed": observed, "affected": count}
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(race, ["paid", "closed"]))
        check(all(r["observed"] == 9 for r in results) and sorted(r["affected"] for r in results) == [0, 1], "two connections v9 CAS have one winner")
        winner = next(r["target"] for r in results if r["affected"])
        check(snapshot(path)["orders"][0]["state"] == winner, "durable state matches CAS winner")
        traces.append({"race": results, "winner": winner, "limitation": "SQLite serializes writers; not a PostgreSQL isolation experiment"})
    return {"passed": True, "checks": len(checks), "cases": checks, "traces": traces,
            "limitation": "Local files and SQL contracts only; no real broker, PostgreSQL, PSP or crash process"}


if __name__ == "__main__":
    print(json.dumps(run(), ensure_ascii=False))
