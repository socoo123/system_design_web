"""New Ch33 two-database failure inputs, invoking the actual teaching adapter."""
from dataclasses import replace
from pathlib import Path
import datetime
import hashlib
import json
import sqlite3
import sys
import tempfile

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "examples/ch33"))
from model import Business, Context, Denied, Gateway, canonical_args

checks = []


def check(name, condition):
    checks.append({"name": name, "passed": bool(condition)})
    if not condition:
        raise AssertionError(name)


def deny(name, work):
    try:
        work()
    except Denied:
        check(name, True)
    else:
        check(name, False)


with tempfile.TemporaryDirectory() as temp:
    now = [10_000]
    gw = Gateway(Path(temp) / "execution.db", lambda: now[0])
    business = Business(Path(temp) / "business.db")
    caller = Context()
    raw = b'{"reason":"resolved","expected_version":4,"ticket_id":"T-1"}'
    action, state = gw.submit(caller, "customer-confirmed-action", raw)
    original_binding = action.binding
    check("new action is pending with all immutable fields retained", state == "PENDING" and action.agent == caller.agent and action.route == "tickets-v1")
    reordered = b'{"ticket_id":"T-1", "expected_version":4, "reason":"resolved"}'
    repeated, repeated_state = gw.submit(caller, action.intent, reordered)
    check("canonical retry keeps original grant and expiry", repeated.binding == original_binding and repeated_state == "PENDING")
    deny("boolean is not an integer resource version", lambda: canonical_args(b'{"ticket_id":"T-1","expected_version":true,"reason":"resolved"}'))
    deny("duplicate nested identity field is rejected", lambda: canonical_args(b'{"ticket_id":"T-1","ticket_id":"T-2","expected_version":4,"reason":"resolved"}'))
    deny("changed parameters cannot borrow old approval", lambda: gw.submit(caller, action.intent, raw.replace(b'resolved', b'other')))
    check("exact reviewed binding approves", gw.approve(action.key, original_binding) == "APPROVED")
    claimed, old_epoch = gw.claim(caller, action.key)
    check("one dispatch claim binds snapshot and local epoch", claimed.binding == original_binding and old_epoch == 1)
    check("cancel after dispatch retains uncertainty", gw.cancel(caller, action.key) == "UNKNOWN")
    deny("cancelled unknown cannot issue a same-key replay", lambda: gw.replay_unknown(caller, action.key, business))
    check("absence of business receipt is not evidence of no delayed request", gw.recover(action.key, business) == "UNKNOWN" and business.lookup(action.key) is None)

    # This simulates the original already-issued request arriving after its
    # caller's cancellation and approval expiry. Expiry blocks new dispatch,
    # not a rollback of an already authorized remote call.
    now[0] = action.expires + 30
    receipt = business.apply(caller, action)
    row = gw.takeover(action.key)
    check("recovery changes local owner epoch while preserving unknown", row["epoch"] > old_epoch and row["state"] == "UNKNOWN")
    check("old local owner cannot record a late terminal result", not gw.record(action.key, old_epoch, receipt))
    check("current recovery records authoritative late effect", gw.recover(action.key, business) == "SUCCEEDED")
    with sqlite3.connect(business.path) as db:
        ticket = db.execute("SELECT version,state FROM Ticket WHERE tenant='acme' AND id='T-1'").fetchone()
    check("late authorized call changed business version exactly once", ticket == (5, "CLOSED"))
    replayed = business.apply(caller, action)
    check("receipt is read before rejecting a now-stale version", replayed["binding"] == original_binding and replayed["outcome"] == "SUCCEEDED")
    changed_agent = replace(action, agent="different-agent")
    deny("another agent cannot reuse a consumed remote key", lambda: business.apply(Context(agent="different-agent"), changed_agent))
    deny("another endpoint revision cannot replay the bound action", lambda: business.apply(caller, replace(action, route="tickets-v2")))
    business.compact(action.key)
    tombstone = business.lookup(action.key)
    check("body compaction retains key and immutable binding", tombstone["body"] is None and tombstone["binding"] == original_binding and tombstone["retired"] == 1)
    compact_replay = business.apply(caller, action)
    check("compacted receipt prevents a second business effect", compact_replay["outcome"] == "SUCCEEDED" and compact_replay["body"] is None)

    second_raw = b'{"ticket_id":"T-1","expected_version":5,"reason":"second explicit action"}'
    action2, _ = gw.submit(caller, "another-user-confirmation", second_raw)
    check("newly confirmed action gets a new durable intent", action2.key != action.key and action2.grant != action.grant)
    now[0] = action2.expires
    check("expiry boundary prevents a newly approved dispatch", gw.approve(action2.key, action2.binding) == "DENIED" and gw.claim(caller, action2.key) is None)

result = {
    "at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "checks": checks,
    "files": {"examples/ch33/model.py": hashlib.sha256((ROOT / "examples/ch33/model.py").read_bytes()).hexdigest()},
    "passed": all(row["passed"] for row in checks),
    "limits": "Two independent local SQLite files and authenticated context/time fixtures. Delayed call delivery is injected; no real MCP, network, signatures or external effect executed.",
}
(ROOT / "docs/reviews/ch31-ch32-ch33-root-tools-results.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({"passed": result["passed"], "checks": len(checks)}))
