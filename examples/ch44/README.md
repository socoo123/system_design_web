# Ch44 implementation examples

Java 17, Python 3 standard library and SQLite ≥3.35 (RETURNING) are required.
The author ran Oracle Java 17.0.10 and Python's SQLite 3.51.0 on 2026-10-24.
No server framework or dependency installation is required.

```sh
JAVA_CH44=/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home
CH44_BUILD=$(mktemp -d /tmp/ch44-java.XXXXXX)
"$JAVA_CH44/bin/javac" --release 17 -d "$CH44_BUILD" examples/ch44/ServiceGovernance.java
"$JAVA_CH44/bin/java" -cp "$CH44_BUILD" ServiceGovernance
python3 examples/ch44/check_transactions.py
python3 examples/ch44/check_sources.py
```

- `accept.pseudo`: authenticated canonical tenant/operation/K and payload,
  unique identity, order/result/outbox in one local transaction. A deferred
  foreign key links the new identity to the order committed in that transaction.
  Timeouts use the same K; an unresolved commit is UNKNOWN. READ COMMITTED and
  PostgreSQL18 conflict snapshots are documentation-checked, not executed here.
- `consume.pseudo`: inbox and local points in one transaction, ACK after commit,
  retained inbox, changed payload conflict, explicit rollback on missing account.
- `schema.sql` + `check_transactions.py`: real temporary SQLite files, bound SQL
  extracted directly from the above pseudocode. SQLite serializes writers; the
  two-connection cases verify that engine's local transaction/uniqueness boundary,
  not PostgreSQL locking or distributed DB failure semantics. Authentication,
  canonical business validation, HTTP and current-state fallback are not built:
  the adapter returns `(order_id, None)` after result trimming to demonstrate
  that identity survives; the page delegates current-state query explicitly.
- `retry.pseudo`: integration pseudocode only. A 220ms attempt cap includes queue
  and discovery; ≥100ms useful time and 140ms finishing reserve are teaching
  admission policies. Recheck after backoff, worker scheduling and retry quota. The whole worker is
  inside one try/catch/finally, including quota/parse/SDK failures. Its final
  once-only ticket finish and slot release also cover errors before inventory
  I/O. Quota uses one cancellable call bounded by min(now+10ms, attempt_end−100ms);
  denied/UNKNOWN never starts inventory I/O, and unknown quota debits are not retried.
  Client timeout stops retries while the local I/O slot stays occupied. The
  adapter must turn expected network failures into classified outcomes and must
  terminate local I/O; unexpected local errors have a cleanup branch. No real
  RPC, cancellation, shared 20/window retry authority or executor is implemented.
- `ServiceGovernance.java`: runnable process-local breaker with three observed
  dependency failures, one-second cooldown, one half-open probe and generations.
  It uses a lock to protect local observations, not distributed ownership. The
  same class checks deadline arithmetic at 1ns/1ms positive scheduling delay,
  late dispatch and return-reserve boundaries, plus a real nanoTime observation.
  These arithmetic checks do not execute the retry pseudocode or prove timers
  run on time. Twenty real threads compete for a single half-open probe. A runnable local
  guarded-body bracket additionally checks quota exceptions, unknown results,
  late completion and normal success cleanup. This is lifecycle testing, not
  a real quota service/SDK experiment.
- `check_sources.py`: checks four exact HTML snippets plus unchanged animation
  IDs and page/all-example source hashes. It does not validate prose accuracy.

A subprocess commits both a local order and a points event then exits with
`os._exit(0)` before an application acknowledgement. The parent reopens the real
file and replays those identities. This covers a lost application ACK/restart,
not a power outage, broker protocol, replica failover or actual network partition.

IDs are teaching UUIDs. Production authorization, quotas, retention/archival,
lease fencing, remote side effects, resource exhaustion and reconciliation need
separate system contracts. The schema only models ACCEPTED order creation,
not the payment/fulfillment lifecycle. No end-to-end exactly-once claim is made.
