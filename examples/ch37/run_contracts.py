"""Run local database contracts and explicit incorrect-implementation witnesses."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import argparse
import hashlib
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time

from storage import (HERE, KeyConflict, LostReply, canonical, checkout, connect,
                     initialize, publication)

checks = []


def check(name, condition, actual=None):
    checks.append({"name": name, "passed": bool(condition), "actual": actual})
    if not condition:
        raise AssertionError(name)


def expect(name, exception, fn):
    try:
        fn()
    except exception:
        check(name, True, exception.__name__)
    else:
        check(name, False, "no exception")


def request(*lines, delivery="address/1"):
    return {"lines": list(lines), "delivery_ref": delivery}


def value(path, sql, args=()):
    db = connect(path)
    try:
        return db.execute(sql, args).fetchone()[0]
    finally:
        db.close()


def parallel(n, fn):
    gate = threading.Barrier(n)
    def run(i):
        gate.wait(timeout=5)
        return fn(i)
    with ThreadPoolExecutor(max_workers=n) as pool:
        return list(pool.map(run, range(n)))


def seed_upload(path, uid, expires, caller="tenant-a/actor", key=None):
    db = connect(path)
    try:
        db.execute("INSERT INTO upload(caller,upload_id,state,object_key,expected_size,checksum,expires_at) "
                   "VALUES (?,?,'PENDING',?,10,'sha256:fixture',?)",
                   (caller, uid, key or f"fixture://bucket/{uid}", expires))
    finally:
        db.close()


def proof(uid, caller="tenant-a/actor", **changes):
    result = {"caller": caller, "upload_id": uid, "object_key": f"fixture://bucket/{uid}",
              "version": "immutable-version-1", "size": 10, "checksum": "sha256:fixture"}
    result.update(changes)
    return result


def run(temp):
    path = temp / "checkout.db"
    initialize(path, {"a": 10, "b": 1})
    first = checkout(path, "tenant-a/actor", "k", request(("a", 2), ("b", 1)))
    check("normal multi-sku commit", first["outcome"] == "CREATED", first)
    check("normal quantities", value(path, "SELECT sum(on_hand) FROM inventory") == 8)
    check("order lines share commit", value(path, "SELECT count(*) FROM order_line") == 2)
    check("same-key retry", checkout(path, "tenant-a/actor", "k", request(("b", 1), ("a", 2))) == first)
    expect("key change binds delivery", KeyConflict,
           lambda: checkout(path, "tenant-a/actor", "k", request(("a", 2), ("b", 1), delivery="other")))
    expect("key change binds quantity", KeyConflict,
           lambda: checkout(path, "tenant-a/actor", "k", request(("a", 1))))
    other = checkout(path, "tenant-b/actor", "k", request(("a", 1)))
    check("caller scopes key", other["outcome"] == "CREATED" and other != first)
    duplicate = checkout(path, "tenant-a/actor", "duplicate", request(("a", 1), ("a", 2)))
    check("repeated sku merged", value(path, "SELECT qty FROM order_line WHERE order_id=?", (duplicate["order_id"],)) == 3)
    check("repeated sku canonical retry", checkout(path, "tenant-a/actor", "duplicate", request(("a", 3))) == duplicate)
    for label, qty in [("zero", 0), ("negative", -1), ("boolean", True), ("overflow", 2**63)]:
        expect(f"reject {label} quantity", ValueError,
               lambda qty=qty: checkout(path, "tenant-a/actor", label, request(("a", qty))))
    expect("reject empty lines", ValueError,
           lambda: checkout(path, "tenant-a/actor", "empty", request()))
    expect("reject unknown semantic field", ValueError,
           lambda: canonical({**request(("a", 1)), "price": 3}))
    before = value(path, "SELECT on_hand FROM inventory WHERE sku='a'")
    refused = checkout(path, "tenant-a/actor", "short", request(("a", 1), ("b", 1)))
    check("second sku failure known refusal", refused == {"outcome": "OUT_OF_STOCK", "order_id": None})
    check("rollback earlier sku", value(path, "SELECT on_hand FROM inventory WHERE sku='a'") == before)
    check("rollback order and lines", value(path, "SELECT count(*) FROM orders") == 3 and value(path, "SELECT count(*) FROM order_line") == 4)
    db = connect(path); db.execute("UPDATE inventory SET on_hand=10 WHERE sku='b'"); db.close()
    check("refusal is stable after restock", checkout(path, "tenant-a/actor", "short", request(("a", 1), ("b", 1))) == refused)
    check("refusal retry has no effect", value(path, "SELECT on_hand FROM inventory WHERE sku='a'") == before)
    expect("lost successful reply", LostReply,
           lambda: checkout(path, "tenant-a/actor", "lost", request(("a", 1)), "lost_reply"))
    recovered = checkout(path, "tenant-a/actor", "lost", request(("a", 1)))
    check("lost reply recovers one order", recovered["outcome"] == "CREATED" and value(path, "SELECT count(*) FROM orders") == 4)
    check("never commit pending idempotency", value(path, "SELECT count(*) FROM idempotency WHERE outcome='PENDING'") == 0)

    same = temp / "same.db"; initialize(same, {"last": 10})
    results = parallel(8, lambda _: checkout(same, "tenant-a/actor", "shared", request(("last", 1))))
    check("8 same-key connections share one result", len({r["order_id"] for r in results}) == 1 and all(r["outcome"] == "CREATED" for r in results))
    check("same-key concurrency decrements once", value(same, "SELECT on_hand FROM inventory") == 9 and value(same, "SELECT count(*) FROM orders") == 1)
    last = temp / "last.db"; initialize(last, {"last": 1})
    results = parallel(8, lambda i: checkout(last, f"caller/{i}", "last", request(("last", 1))))
    check("8 connections race last unit", [r["outcome"] for r in results].count("CREATED") == 1, [r["outcome"] for r in results])
    check("last-unit refusals stable and no negative", value(last, "SELECT on_hand FROM inventory") == 0 and value(last, "SELECT count(*) FROM orders") == 1 and value(last, "SELECT count(*) FROM idempotency") == 8)
    def change(i):
        try:
            return checkout(same, "tenant-a/actor", "variant", request(("last", 1), delivery=f"place/{i}"))
        except KeyConflict:
            return "CONFLICT"
    results = parallel(4, change)
    check("different bindings on concurrent same key", results.count("CONFLICT") == 3 and sum(isinstance(r, dict) for r in results) == 1)

    # Real SQLite witness of the wrong precheck/update pattern: no transaction spans both.
    bad = temp / "bad.db"; initialize(bad, {"last": 1})
    c1, c2 = connect(bad), connect(bad)
    stale = [c.execute("SELECT on_hand FROM inventory").fetchone()[0] for c in [c1, c2]]
    for i, (c, old) in enumerate(zip([c1, c2], stale)):
        c.execute("UPDATE inventory SET on_hand=? WHERE sku='last'", (old - 1,))
        c.execute("INSERT INTO orders(order_id,caller,delivery_ref) VALUES (?,?,?)", (str(i), str(i), "address"))
    c1.close(); c2.close()
    check("incorrect precheck permits oversell witness", value(bad, "SELECT count(*) FROM orders") == 2 and value(bad, "SELECT on_hand FROM inventory") == 0, {"staleReads": stale, "orders": 2, "on_hand": 0})

    snap = temp / "snapshot.db"; initialize(snap, {"x": 2})
    reader = connect(snap); reader.execute("BEGIN")
    old = reader.execute("SELECT count(*) FROM orders").fetchone()[0]
    checkout(snap, "caller", "new", request(("x", 1)))
    held = reader.execute("SELECT count(*) FROM orders").fetchone()[0]
    reader.rollback(); fresh = reader.execute("SELECT count(*) FROM orders").fetchone()[0]; reader.close()
    check("primary old snapshot counterexample", (old, held, fresh) == (0, 0, 1), [old, held, fresh])

    for failpoint, exitcode, committed in [("exit_before_commit", 23, False), ("exit_after_commit", 24, True)]:
        crash = temp / f"{failpoint}.db"; initialize(crash, {"x": 1})
        program = "import json,sys; from storage import checkout; checkout(sys.argv[1], 'caller', 'crash', json.loads(sys.argv[2]), sys.argv[3])"
        proc = subprocess.run([sys.executable, "-c", program, str(crash), json.dumps(request(("x", 1))), failpoint], cwd=HERE, capture_output=True, text=True, timeout=10)
        check(f"process {failpoint} exercised", proc.returncode == exitcode, proc.returncode)
        check(f"process {failpoint} recovery boundary", value(crash, "SELECT count(*) FROM orders") == int(committed) and value(crash, "SELECT on_hand FROM inventory") == int(not committed))
        result = checkout(crash, "caller", "crash", request(("x", 1)))
        check(f"process {failpoint} same-key recovery", result["outcome"] == "CREATED" and value(crash, "SELECT count(*) FROM orders") == 1)

    uploads = temp / "uploads.db"; initialize(uploads, {})
    now = int(time.time())
    for uid in ["a", "b", "wrong-key", "wrong-size", "wrong-checksum", "wrong-caller"]:
        seed_upload(uploads, uid, now + 3600)
    expect("original root proof missing binding rejected", ValueError,
           lambda: publication(uploads, "tenant-a/actor", "a", {"version": "b/version-1", "size": 10, "checksum": "sha256:fixture"}))
    expect("another session proof rejected", KeyConflict,
           lambda: publication(uploads, "tenant-a/actor", "a", proof("b")))
    check("same bytes wrong object key rejected", publication(uploads, "tenant-a/actor", "wrong-key", proof("wrong-key", object_key="fixture://bucket/b")) is None)
    check("wrong proof size rejected", publication(uploads, "tenant-a/actor", "wrong-size", proof("wrong-size", size=11)) is None)
    check("wrong proof checksum rejected", publication(uploads, "tenant-a/actor", "wrong-checksum", proof("wrong-checksum", checksum="wrong")) is None)
    expect("wrong proof caller rejected", KeyConflict,
           lambda: publication(uploads, "tenant-a/actor", "wrong-caller", proof("wrong-caller", caller="tenant-b/actor")))
    check("another authenticated caller cannot find upload", publication(uploads, "tenant-b/actor", "a", proof("a", caller="tenant-b/actor")) is None)
    committed = publication(uploads, "tenant-a/actor", "a", proof("a"))
    check("exact bound proof commits", committed["state"] == "COMMITTED")
    check("publication retry returns original", publication(uploads, "tenant-a/actor", "a", proof("a")) == committed)
    expect("committed retry cannot swap version", KeyConflict,
           lambda: publication(uploads, "tenant-a/actor", "a", proof("a", version="other")))
    expect("committed retry cannot swap key", KeyConflict,
           lambda: publication(uploads, "tenant-a/actor", "a", proof("a", object_key="fixture://bucket/b")))
    check("cleanup cannot claim committed", publication(uploads, "tenant-a/actor", "a") is None)
    seed_upload(uploads, "expired", now - 1)
    results = parallel(6, lambda i: publication(uploads, "tenant-a/actor", "expired", None if i % 2 else proof("expired")))
    check("cleanup vs expired publisher single owner", sum(r is not None for r in results) == 1 and next(r for r in results if r)["state"] == "ABORTED")
    check("aborted rejects late finalize", publication(uploads, "tenant-a/actor", "expired", proof("expired")) is None)
    check("cleanup retry grants no deletion ownership", publication(uploads, "tenant-a/actor", "expired") is None)
    results = parallel(6, lambda _: publication(uploads, "tenant-a/actor", "b", proof("b")))
    check("publication concurrency same committed identity", all(r == results[0] for r in results) and results[0]["state"] == "COMMITTED")

    # Acquire the actual SQLite write lock first, then cross the actual persisted deadline.
    deadline = int(time.time()) + 2
    seed_upload(uploads, "locked", deadline)
    blocker = connect(uploads); blocker.execute("BEGIN IMMEDIATE")
    started = threading.Event()
    def locked_publish():
        started.set()
        return publication(uploads, "tenant-a/actor", "locked", proof("locked"))
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(locked_publish); started.wait(timeout=2); time.sleep(0.05)
        check("publisher waits on real writer lock", not future.done())
        while time.time() < deadline + 0.02:
            time.sleep(0.02)
        blocker.commit(); blocker.close()
        check("clock sampled after lock rejects expiry", future.result(timeout=5) is None)
    check("expiry cleaner acquires ownership after wait", publication(uploads, "tenant-a/actor", "locked")["state"] == "ABORTED")

    # Fixed-member intersection and the exact sloppy witness from deck 2.
    check("healthy quorum intersects", {"N1", "N2"} & {"N2", "N3"} == {"N2"})
    check("sloppy quorum counterexample", not ({"N1", "N4"} & {"N2", "N3"}) and 2 + 2 > 3)


def main():
    parser = argparse.ArgumentParser(); parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = {"python": sys.version.split()[0], "sqlite": sqlite3.sqlite_version,
              "scope": "local SQLite connections/process exit; no power-loss, replication or real object verifier"}
    try:
        with tempfile.TemporaryDirectory(prefix="ch37-contract-") as directory:
            run(Path(directory))
        result["passed"] = True
    except BaseException as error:
        result["passed"] = False; result["failure"] = repr(error)
        raise
    finally:
        result["checks"] = checks
        result["sourceHashes"] = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in HERE.iterdir() if p.is_file() and p.suffix in [".py", ".sql", ".pseudo", ".java"]}
        if args.output:
            args.output.write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps({"passed": result.get("passed"), "checks": len(checks), "failure": result.get("failure")}))


if __name__ == "__main__":
    main()
