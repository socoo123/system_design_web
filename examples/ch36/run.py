"""Run: python3 examples/ch36/run.py. No external services or packages."""
import json
from fractions import Fraction
from slo import Attempt, counts, budget, feature_gate
from tradeoffs import cap_trace, quorum_without_writeback, percentile_example

checks = []

def check(name, condition):
    assert condition, name
    checks.append(name)


def row(key, start, observed=None, outcome="UNKNOWN", **kw):
    return Attempt(key, start, observed, outcome, **kw)


cap = cap_trace()
quorum = quorum_without_writeback()
check("CAP completed-write then stale-read counterexample", cap["later_read"] == 0)
check("Quorum new-old inversion without read writeback", quorum["linearizable"] is False)
# Observation times are from one measurement clock. No distributed clock inference.
normal = [row("k", 0, 100, "UNKNOWN"),
          row("k", 0, 800, "APPROVED", correct=True, durable=True)]
check("Retry shares one eligible event and original deadline", counts(normal, 2000, 10000) == (1, 0))
check("Exactly one second is within the declared deadline", counts([row("k", 0, 1000, "DECLINED", correct=True, durable=True)], 2000, 10000) == (1, 0))
check("Late correct durable result remains bad", counts([row("k", 0, 1001, "APPROVED", correct=True, durable=True)], 2000, 10000) == (1, 1))
check("202 does not satisfy terminal checkout", counts([row("k", 0, 200, "PENDING", correct=True, durable=True)], 2000, 10000) == (1, 1))
check("Exposed incorrect terminal cannot be washed by a correct retry", counts([row("k", 0, 100, "APPROVED", durable=True), row("k", 0, 900, "DECLINED", correct=True, durable=True)], 2000, 10000) == (1, 1))
check("Exposed non-durable terminal cannot be washed by a durable retry", counts([row("k", 0, 150, "APPROVED", correct=True), row("k", 0, 800, "APPROVED", correct=True, durable=True)], 2000, 10000) == (1, 1))
check("No reply counts bad once cohort is mature", counts([row("k", 0)], 2000, 10000) == (1, 1))
check("Non-durable 200 cannot satisfy good", counts([row("k", 0, 100, "APPROVED", correct=True)], 2000, 10000) == (1, 1))
check("Exclude immature cohort until its original deadline", counts([row("k", 1500)], 2000, 10000) == (0, 0))
check("Half-open lower bound excluded, upper included", counts([row("lower", -9000), row("upper", 1000)], 2000, 10000) == (1, 1))
check("Eligibility is fixed separately from failure", counts([row("k", 0, eligible=False)], 2000, 10000) == (0, 0))
try:
    counts([row("k", 0), row("k", 900)], 2000, 10000)
    raise AssertionError("retry reset accepted")
except ValueError:
    checks.append("Reject retry reset of original start")
check("A9 allowed10000 remain4000", budget(10_000_000, 6000) == {"allowed": 10000, "remaining": 4000, "burn": Fraction(3, 5)})
check("Zero denominator has no SLI", budget(0, 0) is None)
check("Whole-event boundary:999 eligible permits0 bad", budget(999, 1)["remaining"] == -1)
check("Whole-event boundary:1000 eligible permits1 bad", budget(1000, 1)["remaining"] == 0)
# Good events leaving the window can reduce allowance without any new failures.
check("Good traffic expiry can worsen budget", budget(1000, 1)["remaining"] > budget(999, 1)["remaining"])
for invalid in [(-1, 0), (1, 2), (1, -1)]:
    try:
        budget(*invalid)
        raise AssertionError("invalid counts accepted")
    except ValueError:
        checks.append(f"Reject invalid counts {invalid}")
healthy = {name: (100_000, 0) for name in ("1h", "5m", "6h", "30m")}
month = (10_000_000, 6000)
gate = lambda w=healthy, m=month, **kw: feature_gate(m, w, kw.get("complete", True), kw.get("healthy", True), kw.get("reviewed", True))
check("Healthy budget permits only next canary step", gate() == "ALLOW_NEXT_CANARY_STEP")
fast = {**healthy, "1h": (100_000, 1441), "5m": (100_000, 1441)}
check("Positive monthly balance can still HOLD on burn", gate(fast) == "HOLD_BURN")
check("Long hot / short healthy does not page", gate({**fast, "5m": (100_000, 0)}) == "ALLOW_NEXT_CANARY_STEP")
check("Exact14.4 is not above strict threshold", gate({**fast, "1h": (100_000, 1440)}) == "ALLOW_NEXT_CANARY_STEP")
check("Second pair uses OR and threshold6", gate({**healthy, "6h": (100_000, 601), "30m": (100_000, 601)}) == "HOLD_BURN")
check("Exhausted balance freezes features", gate(m=(10_000_000, 10000)) == "FREEZE_FEATURES")
check("Missing window is no-data", gate({**healthy, "5m": (0, 0)}) == "HOLD_NO_DATA")
check("Incomplete telemetry holds even when observed ratio is healthy", gate(complete=False) == "HOLD_NO_DATA")
check("Unhealthy canary holds", gate(healthy=False) == "HOLD_REVIEW")
check("Unreviewed reopening holds", gate(reviewed=False) == "HOLD_REVIEW")
percentiles = percentile_example()
check("Per-dependency p99s cannot simply add", percentiles == {"sum_of_p99_ms": 2, "p99_of_path_ms": 101})
print(json.dumps({"passed": True, "checks": checks, "count": len(checks),
                  "cap": cap, "quorum": quorum, "percentiles": percentiles,
                  "A9": {k: str(v) for k, v in budget(*month).items()},
                  "gate_high_burn": gate(fast)}, indent=2))
