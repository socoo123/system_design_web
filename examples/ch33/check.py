"""Execute local SQLite failure/concurrency cases against the actual adapter."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from dataclasses import asdict, is_dataclass, replace
from pathlib import Path
import hashlib
import json
import sqlite3
import sys
import tempfile
import threading

from model import Action, Business, Context, Denied, Gateway, canonical_args, encode, read, write

ROOT = Path(__file__).resolve().parents[2]
RESULT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "docs/reviews/ch33-code-results.json"
checks = []


def check(name, actual, expected=True):
    checks.append({"name": name, "actual": actual, "expected": expected, "passed": actual == expected})
    assert actual == expected, (name, actual, expected)


def denied(call):
    try:
        call()
        return False
    except (Denied, UnicodeError):
        return True


def sql_failure(call):
    try:
        call()
        return False
    except sqlite3.DatabaseError:
        return True


class Clock:
    def __init__(self):
        self.value = 1000
    def __call__(self):
        return self.value


RAW = b'{"ticket_id":"T-1","expected_version":4,"reason":"resolved"}'
CTX = Context()


@contextmanager
def fixture():
    with tempfile.TemporaryDirectory(prefix="ch33-two-databases-") as directory:
        clock = Clock()
        gateway = Gateway(Path(directory) / "execution.sqlite", clock)
        backend = Business(Path(directory) / "business.sqlite")
        yield gateway, backend, clock


def prepared(gateway, intent="action-1"):
    action, _ = gateway.submit(CTX, intent, RAW)
    gateway.approve(action.key, action.binding)
    return action


def parallel(count, call):
    barrier = threading.Barrier(count)
    def task(_):
        barrier.wait(timeout=10)
        return call()
    with ThreadPoolExecutor(max_workers=count) as executor:
        return list(executor.map(task, range(count)))


try:
    canonical, parsed = canonical_args(RAW)
    check("canonical key order/whitespace", canonical_args(b'{ "reason":"resolved", "expected_version":4, "ticket_id":"T-1" }')[0], canonical)
    for name, raw in {
        "float is not integer": RAW.replace(b':4,', b':4.0,'),
        "boolean is not integer": RAW.replace(b':4,', b':true,'),
        "string is not integer": RAW.replace(b':4,', b':"4",'),
        "duplicate property": RAW[:-1] + b',"expected_version":5}',
        "extra property": RAW[:-1] + b',"tenant":"foreign"}',
        "missing property": b'{"ticket_id":"T-1","expected_version":4}',
        "too large before parse": b' ' * (16 * 1024 + 1),
        "too deep before parse": b'[' * 9 + b'0' + b']' * 9,
        "non-JSON number": RAW.replace(b':4,', b':NaN,'),
    }.items():
        check(name, denied(lambda raw=raw: canonical_args(raw)))

    with fixture() as (g, b, clock):
        a, state = g.submit(CTX, "one", RAW)
        check("new action pending", state, "PENDING")
        clock.value += 10
        replay, _ = g.submit(CTX, "one", RAW)
        check("retry keeps original grant/expiry", replay, a)
        check("same arguments new intent is distinct", g.submit(CTX, "two", RAW)[0].intent != a.intent)
        check("changed args same intent rejected", denied(lambda: g.submit(CTX, "one", RAW.replace(b'resolved', b'different'))))
        check("schema valid foreign resource denied", denied(lambda: g.submit(CTX, "foreign", RAW.replace(b'T-1', b'T-2'))))
        check("caller actor cannot reuse key", denied(lambda: g.submit(replace(CTX, actor="eve"), "one", RAW)))
        check("caller agent cannot reuse key", denied(lambda: g.submit(replace(CTX, agent="other-agent"), "one", RAW)))
        check("unauthorized approver rejected", denied(lambda: g.approve(a.key, a.binding, "eve")))
        for field, value in {"actor":"eve", "agent":"other-agent", "tool":"ticket.delete", "revision":"r8",
                             "route":"other-backend", "policy":"p10", "expires":9000,
                             "resource":"T-2", "version":5, "args":canonical.replace('resolved','changed')}.items():
            check("approval binds " + field, denied(lambda field=field, value=value: g.approve(a.key, replace(a, **{field:value}).binding)))
        approvals = parallel(6, lambda: g.approve(a.key, a.binding))
        check("six duplicate approvals replay approved", approvals, ["APPROVED"] * 6)
        check("grant consumed once", read(g.path, "SELECT SUM(consumed) AS n FROM GrantToken")["n"], 1)
        check("one approval event", read(g.path, "SELECT COUNT(*) AS n FROM Audit WHERE kind='approved'")["n"], 1)
        claims = parallel(6, lambda: g.claim(CTX, a.key))
        check("six gateway instances one claim", sum(value is not None for value in claims), 1)
        receipts = parallel(6, lambda: b.apply(CTX, a))
        check("six same-key backend calls one effect", read(b.path, "SELECT version FROM Ticket WHERE id='T-1'")["version"], 5)
        check("six same-key calls same receipt", len({encode(value) for value in receipts}), 1)
        epoch = next(value[1] for value in claims if value)
        check("persist known outcome", g.record(a.key, epoch, receipts[0]))
        check("record duplicate cannot post twice", g.record(a.key, epoch, receipts[0]), False)
        check("completed call replays stored state", g.submit(CTX, "one", RAW)[1], "SUCCEEDED")
        check("backend key rejects changed params", denied(lambda: b.apply(CTX, replace(a, args=canonical.replace('resolved', 'changed')))))
        check("backend route cannot change", denied(lambda: b.apply(CTX, replace(a, route="fallback-v2"))))

    for column, value in [("revision", "r8"), ("route", "tickets-v2"), ("policy", "p10"), ("enabled", 0)]:
        with fixture() as (g, b, clock):
            a = prepared(g)
            with write(g.path) as db:
                db.execute(f"UPDATE Tool SET {column}=?", (value,))
            check("dispatch rechecks " + column, g.claim(CTX, a.key), None)
            check("changed tool creates no effect " + column, b.lookup(a.key), None)
    for permission in ["user_allow", "agent_allow"]:
        with fixture() as (g, b, clock):
            a = prepared(g)
            with write(g.path) as db:
                db.execute(f"UPDATE Principal SET {permission}=0")
            check("dispatch rechecks " + permission, g.claim(CTX, a.key), None)

    with fixture() as (g, b, clock):
        a = prepared(g)
        g.claim(CTX, a.key)
        with write(b.path) as db:
            db.execute("UPDATE Principal SET agent_allow=0")
        check("backend independently rechecks postclaim revocation", denied(lambda: b.apply(CTX, a)))
        check("backend revoked action leaves object unchanged", read(b.path, "SELECT version,state FROM Ticket WHERE id='T-1'"), {"version":4,"state":"OPEN"})

    with fixture() as (g, b, clock):
        a, _ = g.submit(CTX, "expired-pending", RAW)
        clock.value = a.expires
        check("exact expiry forbids approval too", g.approve(a.key, a.binding), "DENIED")
        check("expired pending does not consume grant", read(g.path, "SELECT consumed FROM GrantToken")["consumed"], 0)

    with fixture() as (g, b, clock):
        a = prepared(g)
        clock.value = a.expires
        check("exact expiry forbids dispatch", g.claim(CTX, a.key), None)
        check("undispatched expiry known denied", g.status(a.key)["state"], "DENIED")

    with fixture() as (g, b, clock):
        a = prepared(g)
        _, epoch = g.claim(CTX, a.key)
        with write(b.path) as db:
            db.execute("UPDATE Ticket SET version=5 WHERE id='T-1'")
        receipt = b.apply(CTX, a)
        check("postapproval resource race known no effect", receipt["outcome"], "FAILED_KNOWN")
        check("stale condition leaves ticket open", read(b.path, "SELECT state FROM Ticket WHERE id='T-1'")["state"], "OPEN")
        with write(b.path) as db:
            db.execute("UPDATE Ticket SET version=4 WHERE id='T-1'")
        check("known failed key remains failed on later valid version", b.apply(CTX, a)["outcome"], "FAILED_KNOWN")

    with fixture() as (g, b, clock):
        a = prepared(g)
        _, epoch = g.claim(CTX, a.key)
        receipt = b.apply(CTX, a)  # drop response rather than record it
        g.unknown(a.key, epoch)
        check("remote committed/local unknown are separate", (g.status(a.key)["state"], receipt["outcome"]), ("UNKNOWN", "SUCCEEDED"))
        clock.value = a.expires + 1
        check("receipt replay precedes new version and expiry", b.apply(CTX, a)["outcome"], "SUCCEEDED")
        check("status recovery after approval expiry", g.recover(a.key, b), "SUCCEEDED")

    with fixture() as (g, b, clock):
        a = prepared(g)
        _, epoch = g.claim(CTX, a.key)
        g.unknown(a.key, epoch)  # crash before network, indistinguishable locally
        check("missing receipt does not prove no send", g.recover(a.key, b), "UNKNOWN")
        check("documented same-key replay can finish missing operation", g.replay_unknown(CTX, a.key, b), "SUCCEEDED")

    with fixture() as (g, b, clock):
        a = prepared(g)
        _, epoch = g.claim(CTX, a.key)
        g.unknown(a.key, epoch)
        clock.value = a.replay_until + 1
        check("retention/approval expiry forbids effect replay", denied(lambda: g.replay_unknown(CTX, a.key, b)))
        check("unknown survives retention with missing receipt", g.recover(a.key, b), "UNKNOWN")
        check("unknown still occupies unique key", g.submit(CTX, a.intent, RAW)[1], "UNKNOWN")

    with fixture() as (g, b, clock):
        a = prepared(g)
        with write(g.path) as db:
            db.execute("CREATE TRIGGER block_dispatch BEFORE INSERT ON Audit WHEN NEW.kind='dispatch' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END")
        check("audit insert failure aborts claim transaction", sql_failure(lambda: g.claim(CTX, a.key)))
        check("aborted dispatch stays approved", (g.status(a.key)["state"], g.status(a.key)["epoch"]), ("APPROVED", 0))
        check("no backend receipt after local rollback", b.lookup(a.key), None)

    with fixture() as (g, b, clock):
        a = prepared(g)
        _, epoch = g.claim(CTX, a.key)
        with write(b.path) as db:
            db.execute("CREATE TRIGGER block_receipt BEFORE INSERT ON Receipt BEGIN SELECT RAISE(ABORT,'receipt unavailable'); END")
        check("receipt insertion fault executed", sql_failure(lambda: b.apply(CTX, a)))
        check("effect rolls back with failed receipt", read(b.path, "SELECT version,state FROM Ticket WHERE id='T-1'"), {"version":4,"state":"OPEN"})
        check("failed transaction leaves no receipt", b.lookup(a.key), None)

    with fixture() as (g, b, clock):
        a = prepared(g)
        _, epoch = g.claim(CTX, a.key)
        receipt = b.apply(CTX, a)
        with write(g.path) as db:
            db.execute("CREATE TRIGGER block_result BEFORE UPDATE ON Intent WHEN NEW.state='SUCCEEDED' BEGIN SELECT RAISE(ABORT,'result DB unavailable'); END")
        check("local result write failure executed", sql_failure(lambda: g.record(a.key, epoch, receipt)))
        check("remote success survives local result rollback", b.lookup(a.key)["outcome"], "SUCCEEDED")
        g.unknown(a.key, epoch)
        with write(g.path) as db:
            db.execute("DROP TRIGGER block_result")
        check("recover repairs failed local result persistence", g.recover(a.key, b), "SUCCEEDED")

    with fixture() as (g, b, clock):
        a = prepared(g)
        check("cancel before claim known denied", g.cancel(CTX, a.key), "DENIED")
        check("cancelled approved action cannot claim", g.claim(CTX, a.key), None)
        check("cancel before dispatch no effect", b.lookup(a.key), None)

    with fixture() as (g, b, clock):
        a = prepared(g)
        _, epoch = g.claim(CTX, a.key)
        check("cancel after claim unknown", g.cancel(CTX, a.key), "UNKNOWN")
        check("query absent while old request delayed remains unknown", g.recover(a.key, b), "UNKNOWN")
        check("cancel prevents automatic same-key replay", denied(lambda: g.replay_unknown(CTX, a.key, b)))
        receipt = b.apply(CTX, a)  # an already issued request can still arrive
        check("delayed old request may commit after cancel", receipt["outcome"], "SUCCEEDED")
        check("late reliable evidence retained", g.record(a.key, epoch, receipt))
        check("known success retains cancel requested flag", (g.status(a.key)["state"], g.status(a.key)["cancel"]), ("SUCCEEDED",1))

    with fixture() as (g, b, clock):
        a = prepared(g)
        _, old_epoch = g.claim(CTX, a.key)
        g.takeover(a.key)
        receipt = b.apply(CTX, a)
        check("new epoch rejects old local writer", g.record(a.key, old_epoch, receipt), False)
        check("epoch did not fence remote side effect", b.lookup(a.key)["outcome"], "SUCCEEDED")
        check("new owner queries rather than reallocates intent", g.recover(a.key, b), "SUCCEEDED")
        clock.value = a.replay_until + 1
        b.compact(a.key)
        check("tombstone survives body compaction", b.apply(CTX, a)["outcome"], "SUCCEEDED")
        check("compaction removes response body", b.lookup(a.key)["body"], None)
        check("tombstone replay no second effect", read(b.path, "SELECT version FROM Ticket WHERE id='T-1'")["version"], 5)

    for turn in range(8):
        with fixture() as (g, b, clock):
            a = prepared(g, f"cancel-race-{turn}")
            barrier = threading.Barrier(2)
            def claim():
                barrier.wait(timeout=10)
                return g.claim(CTX, a.key)
            def cancel():
                barrier.wait(timeout=10)
                return g.cancel(CTX, a.key)
            with ThreadPoolExecutor(max_workers=2) as pool:
                claim_future, cancel_future = pool.submit(claim), pool.submit(cancel)
                issued, cancelled = claim_future.result(), cancel_future.result()
            if issued:
                receipt = b.apply(CTX, issued[0])
                g.record(a.key, issued[1], receipt)
                check(f"cancel/claim race {turn}: issued may finish", g.status(a.key)["state"], "SUCCEEDED")
            else:
                check(f"cancel/claim race {turn}: denied did not send", (g.status(a.key)["state"], b.lookup(a.key)), ("DENIED",None))

    numerics = {
        "logical_calls_s": 20*3, "mean_active_no_retry": 60*0.3,
        "physical_calls_s":60*1.1, "mean_active_retry":66*0.3,
        "deadline_seconds":3.5+0.2+3.5+0.8, "approval_arrivals_s":60*0.2,
        "steady_pending":60*0.2*30, "audit_bytes_day":2000*60*86400,
        "audit_GB_day":2000*60*86400/1e9, "hot_GB":10.368*7*2,
        "archive_GB":10.368*30*2, "buffer_MiB":64*64*1024/1024**2,
    }
    expected = [60,18,66,19.8,8,12,360,10368000000,10.368,145.152,622.08,4]
    for (name, value), want in zip(numerics.items(), expected):
        check("numeric " + name, round(value,9), want)
    passed = True
except BaseException as error:
    passed = False
    checks.append({"failure":repr(error),"passed":False})
    raise
finally:
    files = [p for p in Path(__file__).parent.iterdir() if p.suffix in (".py", ".pseudo", ".mjs")]
    report = {"passed":passed, "sqlite_version":sqlite3.sqlite_version, "python_version":sys.version,
              "checks":checks, "count":len(checks),
              "hashes":{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(files)},
              "limits":["Local two-file SQLite transactions, not networked/MCP tools", "Fixture trusted identities, clock and adapter envelope", "No real remote cancellation, durable quota, replication or production load test"]}
    RESULT.parent.mkdir(parents=True, exist_ok=True)
    RESULT.write_text(json.dumps(report, ensure_ascii=False, indent=2,
                                 default=lambda value: asdict(value) if is_dataclass(value) else repr(value))+"\n")
    print(json.dumps({"passed":passed,"checks":len(checks),"result":str(RESULT)}))
