"""Deterministic local histories, not a distributed implementation/proof."""
from math import ceil


def cap_trace():
    # Both nodes are alive; inter-node messages are withheld.
    replicas = {"A": 0, "B": 0}
    replicas["A"] = 1  # local write completes and responds OK
    later_read = replicas["B"]
    assert later_read == 0  # violates write-OK-before-read real-time order
    return {"write": "OK(1)", "later_read": later_read,
            "strong_read_without_proof": "UNAVAILABLE"}


# BEGIN quorum

def quorum_without_writeback():
    # N=3, W=2, R=2; one immutable version order, no failures of local memory.
    replicas = {"A": (0, "x=0"), "B": (0, "x=0"), "C": (0, "x=0")}
    replicas["A"] = (1, "x=1")  # W has only one ACK: the write is pending
    r1_members = {"A", "B"}
    r2_members = {"B", "C"}
    assert len(r1_members & r2_members) == 1
    r1 = max(replicas[n] for n in r1_members)
    # R1 responds x=1; it does NOT write that version back before returning.
    r2 = max(replicas[n] for n in r2_members)  # R2 starts after R1 responds
    assert (r1[1], r2[1]) == ("x=1", "x=0")
    # Place pending write before R1 and R2 is wrong; after R1 and R1 is wrong.
    # There is no second write that could restore x=0.
    return {"R1": r1[1], "R2_after_R1": r2[1], "linearizable": False}

# END quorum


def percentile_example():
    # Nearest-rank percentile; independent sample-index alignment is explicit.
    a = [100] + [1] * 99
    b = [1, 100] + [1] * 98
    p99 = lambda values: sorted(values)[ceil(len(values) * .99) - 1]
    return {"sum_of_p99_ms": p99(a) + p99(b),
            "p99_of_path_ms": p99([x + y for x, y in zip(a, b)])}
