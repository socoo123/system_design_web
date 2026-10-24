"""Python 3.10+ standard-library teaching model; all times are integer ms."""
from dataclasses import dataclass
from fractions import Fraction

SCALE = 1_000_000
BAD_PPM = 1_000  # SLO = 99.9%
DEADLINE_MS = 1_000


@dataclass(frozen=True)
class Attempt:
    checkout_id: str
    started_ms: int  # original ingress time, immutable across retries
    observed_ms: int | None
    outcome: str
    correct: bool = False
    durable: bool = False
    eligible: bool = True  # fixed at ingress, before outcome is known


# BEGIN count

def counts(attempts, now_ms, window_ms):
    if window_ms <= 0:
        raise ValueError("window must be positive")
    cutoff = now_ms - DEADLINE_MS  # complete cohorts; one-deadline lag
    groups = {}
    for a in attempts:
        groups.setdefault(a.checkout_id, []).append(a)
    eligible = bad = 0
    for rows in groups.values():
        first = rows[0]
        identity = (first.started_ms, first.eligible)
        if any((r.started_ms, r.eligible) != identity for r in rows):
            raise ValueError("retry changed original start or eligibility")
        if not first.eligible or not cutoff - window_ms < first.started_ms <= cutoff:
            continue
        eligible += 1
        # observed_ms means a result actually delivered at the measured boundary.
        terminal = [r for r in rows if r.outcome in {"APPROVED", "DECLINED"}
                    and r.observed_ms is not None
                    and first.started_ms <= r.observed_ms <= first.started_ms + DEADLINE_MS]
        exposed_bad = any(not (r.correct and r.durable) for r in terminal)
        good = any(r.correct and r.durable for r in terminal) and not exposed_bad
        bad += int(not good)
    return eligible, bad

# END count


# BEGIN gate

def budget(eligible, bad):
    if not (0 <= bad <= eligible):
        raise ValueError("invalid counts")
    if eligible == 0:
        return None  # no data, never 100% success
    allowed = eligible * BAD_PPM // SCALE  # maximum whole bad events
    return {"remaining": allowed - bad, "allowed": allowed,
            "burn": Fraction(bad * SCALE, eligible * BAD_PPM)}


def feature_gate(month, windows, telemetry_complete, canary_healthy, reviewed):
    # All inputs use the same SLI, cohort cutoff, and service scope.
    monthly = budget(*month)
    rates = {name: budget(*windows[name])
             for name in ("1h", "5m", "6h", "30m")}
    if not telemetry_complete or monthly is None or any(v is None for v in rates.values()):
        return "HOLD_NO_DATA"
    if monthly["remaining"] <= 0:
        return "FREEZE_FEATURES"
    burn = {name: value["burn"] for name, value in rates.items()}
    page = ((burn["1h"] > Fraction(72, 5) and burn["5m"] > Fraction(72, 5))
            or (burn["6h"] > 6 and burn["30m"] > 6))
    if page:
        return "HOLD_BURN"
    if not (canary_healthy and reviewed):
        return "HOLD_REVIEW"
    return "ALLOW_NEXT_CANARY_STEP"  # reviewed repair uses a separate policy path

# END gate
