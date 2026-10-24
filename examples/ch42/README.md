# Ch42 teaching examples

`effect.pseudo` is SQL plus explicit application branching. `check_effect.py`
executes its four SQL statements against an actual SQLite file (SQLite 3.35+
for `RETURNING`). The primary key is `(scope,event_id)` in both inbox and ledger;
both columns are `NOT NULL` with nonempty checks. The handler rejects missing,
empty or noncanonical identities before writing. SQLite rowid composite primary
keys do not implicitly reject NULL, so uniqueness alone is insufficient.
The handler computes a canonical operation digest including account and delta.
`BEGIN IMMEDIATE` serializes writers; `SQLITE_BUSY` is a retryable whole-transaction
failure, never a reason to acknowledge the event. Other databases require their
own transaction/isolation review. Authorization, accounting double entry, amount
validation, database replication and power-loss testing are outside this example.

`Resilience.java` uses only Java 17's standard library. `BatchProgress` runs on the
consumer poll thread, with one paused fetched batch per partition. It tracks the
ordered records actually returned, so numeric offset holes do not stall progress.
The real adapter must also carry the appropriate Kafka leader epoch and assignment
generation. This class is not a Kafka consumer implementation.

`IoGate` bounds one process's local synchronous I/O and uses a zero-length worker
queue. Its adapter returns only after local I/O is truly finished. Timing out the
caller leaves the permit held until that adapter exits. It does not prove that
remote business work ended or rolled back. Each dependency needs its own gate and
executor; an adapter that hides ongoing background work violates this contract.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 examples/ch42/check_effect.py
ch42_classes=$(mktemp -d /tmp/ch42-classes.XXXXXX)
/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin/javac \
  -d "$ch42_classes" examples/ch42/Resilience.java
/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin/java \
  -cp "$ch42_classes" Resilience
PYTHONDONTWRITEBYTECODE=1 python3 examples/ch42/check_sources.py
```

`consumer.pseudo`, `retry.pseudo` and `drain.pseudo` are integration contracts,
not deployed clients. Normal/failed traces are recorded in
[`docs/reviews/ch42.md`](../../docs/reviews/ch42.md). Kafka rebalance races,
transport cancellation and Kubernetes endpoint propagation require real adapters
and a cluster to test. No production availability claim is made here.
