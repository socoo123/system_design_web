"""New inputs call the actual Ch32 ledger, including close/fallback competition."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
import datetime
import hashlib
import json
import sys
import tempfile

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "examples/ch32"))
import ledger as L

checks = []


def check(name, condition):
    checks.append({"name": name, "passed": bool(condition)})
    if not condition:
        raise AssertionError(name)


def denied(name, call):
    try:
        call()
    except (L.Denied, L.Conflict):
        check(name, True)
    else:
        check(name, False)


with tempfile.TemporaryDirectory() as tmp:
    filename = Path(tmp) / "independent-ledger.db"
    L.initialize(filename, cap=9000)
    db = L.connect(filename)
    db.execute("INSERT INTO budgets(tenant,period,cap) VALUES('other','p1',8000)")
    db.execute("INSERT INTO budgets(tenant,period,cap) VALUES('t','p2',9000)")
    a = L.reserve_first(db, "t", "same-rid", "request-a", "p1", "route-12", "A", 3000, "owner-a", True)
    b = L.reserve_first(db, "other", "same-rid", "request-b", "p1", "route-20", "X", 4000, "owner-x")
    L.bind_upstream(db, "t", "same-rid", 1, "owner-a", "provider-a-17", "A")
    check("same rid is independently scoped by tenant", a["created"] and b["created"] and L.balance(db)["held"] == 3000 and L.balance(db, "other")["held"] == 4000)
    same = L.reserve_first(db, "t", "same-rid", "request-a", "p2", "route-13", "A2", 2000, "owner-new")
    check("retry across period rollover retains original request", not same["created"] and same["request"]["period"] == "p1" and same["request"]["route"] == "route-12" and L.balance(db, period="p2")["held"] == 0)
    denied("changed body never transfers old rid into a new period", lambda: L.reserve_first(db, "t", "same-rid", "different", "p2", "route-13", "A2", 2000, "owner-new"))
    check("wrong owner cannot classify an attempt for retry", not L.mark_failure(db, "t", "same-rid", 1, "foreign-owner"))
    check("timeout classified by actual owner", L.mark_failure(db, "t", "same-rid", 1, "owner-a"))
    L.reserve_fallback(db, "t", "same-rid", "owner-a", "B", 2000, "owner-b")
    L.bind_upstream(db, "t", "same-rid", 2, "owner-b", "provider-b-91", "B")
    check("fallback keeps full old hold and independently sized new hold", L.balance(db)["held"] == 5000)
    check("late primary cannot choose the public stream", not L.claim_commit(db, "t", "same-rid", 1, "owner-a"))
    denied("backup evidence cannot settle primary reservation", lambda: L.settle(db, "t", "same-rid", 1, 2100, 300, "b-authoritative", upstream_id="provider-b-91", served_model="B"))
    check("settlement still accepts late primary cost", L.settle(db, "t", "same-rid", 1, 2100, 300, "a-authoritative", upstream_id="provider-a-17", served_model="A"))
    check("late cost does not consume fallback reservation", L.balance(db)["held"] == 2000 and L.balance(db)["settled"] == 2400)
    check("selected backup commits", L.claim_commit(db, "t", "same-rid", 2, "owner-b"))
    L.settle(db, "t", "same-rid", 2, 1200, 300, "b-authoritative", upstream_id="provider-b-91", served_model="B")
    check("two differently sized attempts conserve their own balances", L.balance(db)["held"] == 0 and L.balance(db)["settled"] == 3900)
    check("tenant and period isolation survive late settlement", L.balance(db, "other")["held"] == 4000 and L.balance(db, period="p2")["settled"] == 0)
    denied("different final cannot charge already settled attempt twice", lambda: L.settle(db, "t", "same-rid", 1, 2100, 301, "new-evidence", upstream_id="provider-a-17", served_model="A"))
    check("conflicting evidence leaves all balances unchanged", L.balance(db)["settled"] == 3900 and L.balance(db)["held"] == 0)
    db.close()

    for schedule in ("close-first", "fallback-first", "parallel"):
        path = Path(tmp) / f"{schedule}.db"
        L.initialize(path)
        db = L.connect(path)
        L.reserve_first(db, "t", "r", "d", "p1", "p12", "A", 3000, "w1", True)
        L.mark_failure(db, "t", "r", 1, "w1")
        db.close()

        def close(connection):
            return L.close_if_selected(connection, "t", "r", 1, "w1")

        def fallback(connection):
            try:
                return L.reserve_fallback(connection, "t", "r", "w1", "B", 2000, "w2")["created"]
            except L.Denied:
                return False

        if schedule == "parallel":
            gate = Barrier(2)
            def concurrent(work):
                conn = L.connect(path)
                try:
                    gate.wait()
                    return work(conn)
                finally:
                    conn.close()
            with ThreadPoolExecutor(max_workers=2) as pool:
                answers = list(pool.map(concurrent, (close, fallback)))
        else:
            conn = L.connect(path)
            if schedule == "close-first":
                answers = [close(conn), fallback(conn)]
            else:
                backup = fallback(conn)
                answers = [close(conn), backup]
            conn.close()
        conn = L.connect(path)
        q = L.request(conn, "t", "r")
        check(f"{schedule}: exactly one transition owns continuation", sum(answers) == 1 and not (q["selected"] == 2 and q["closed"]))
        check(f"{schedule}: unknown primary remains held", L.balance(conn)["held"] == (5000 if q["selected"] == 2 else 3000))
        conn.close()

result = {"at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "checks": checks,
          "files": {"examples/ch32/ledger.py": hashlib.sha256((ROOT / "examples/ch32/ledger.py").read_bytes()).hexdigest()},
          "passed": all(row["passed"] for row in checks),
          "limits": "Local SQLite file transactions, both serial transition orders and a separate-connection race; no provider calls, SSE network or calendar-reset worker."}
(ROOT / "docs/reviews/ch31-ch32-ch33-root-ledger-results.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({"passed": result["passed"], "checks": len(checks)}))
