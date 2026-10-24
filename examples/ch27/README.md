# Ch27 delivery teaching contracts

The page has seven shared-source blocks: executable SQL constraints, five
PostgreSQL-shaped teaching pseudocode blocks, and a complete runnable Java 17
validator. `node sync.mjs --check` compares their exact text with the page.

Run from the repository root:

```sh
node examples/ch27/sync.mjs --check
PYTHONDONTWRITEBYTECODE=1 python3 examples/ch27/check.py
node tools/audit-chapter.mjs ch27
```

`check.py --output docs/reviews/ch27-another-run.json` preserves another result
without overwriting the author evidence. It uses only Python standard-library
SQLite, the installed JDK 17 at the documented path, and, when available, an
isolated Redis process from `/tmp/redis-7.2.5/src/redis-server`. Override the latter
with `CH27_REDIS_SERVER`. The test process terminates its own Redis instance and
never connects to an existing one. Classes, DBs and Redis files live in a temporary
directory and are removed. The fixed default output is
`docs/reviews/ch27-code-results.json`.

## Atomicity and identity

- `schema.sql` then `keys.sql` installs the executable local schema. The model
  uses actual SQLite `BEGIN IMMEDIATE` transactions and separate connections.
  SQLite serializes writers more coarsely than PostgreSQL row locks; this checks
  local state/rollback/competition contracts, not PostgreSQL isolation, replica
  durability, split-brain handling or production availability.
- Production pseudocode locks an order then its courier-capacity row. All
  reservers, acceptance, expiry, delivery, cancellation and controlled release
  must follow the same rule. Batch operations lock all affected rows in a
  consistent order. No network Routing call runs while holding those locks.
  A transaction/constraint error rolls back every statement; an identified
  deadlock/serialization abort restarts the whole operation with its fixed keys.
- Re-read a current candidate snapshot before entering the reservation transaction
  and carry its server-derived freshness deadline across Routing/lock waits.
  Check remaining validity after locks, rather than letting a formerly fresh
  point survive an arbitrarily long delay. This is a read-time location snapshot,
  not an atomic transaction with the location/session service: a disconnect after
  the read remains possible. `candidate_valid_until` tests this deadline; omission
  in the SQLite fixture supplies a trusted synthetic point captured at call start.
  It does not query or verify a live location provider. Production must never
  trust a phone-supplied validity deadline.
- One `active_slot` row per order, and one per `(courier,slot)`, enforce both
  sides of live assignment. `occupied` must equal the live-slot count and remain
  within capacity. The row CHECK alone does not establish the cross-table
  invariant. Every controlled release deletes exactly one slot and decrements
  capacity in the state/outbox transaction. Raw writes outside these paths are
  not supported. Courier capacity is fixed at one or two in this teaching model.
- Creation inputs are **already verified** server payment/order facts. The
  `(scope,upstream_order)` identity binds a canonical digest; a changed digest
  conflicts. `Store.create` is a trusted fixture entry, not a raw HTTP endpoint
  and not an implementation of payment verification or customer authentication.
- Attempt identities bind order/generation/courier. Historical offer and accept
  receipts remain immutable. Replay validates bindings and actor, then returns
  the original receipt **plus current state**. A delivered/released old attempt
  never regains a slot or execution rights. Old pickup/delivery cannot affect a
  new attempt. Identities and generation history have no GC/TTL in this model.
- Expiry applies only to unanswered offered rows and uses the same locks as
  accept. Accept checks `now < deadline`, expiry `now >= deadline`, using time
  sampled after locks. PostgreSQL needs `clock_timestamp()`, not transaction-
  start `now()`. The injected test clock is a trusted deterministic fixture, not
  a clock-synchronization implementation. Production must monitor/control clock
  error and stop time-sensitive transitions when authority is uncertain.
- Retry counts and the original 120-second match deadline do not reset on
  retransmission, worker replacement or controlled reassignment. Cooldowns are
  durable attempt facts. Scanners read bounded candidates and recheck current
  state/generation under a transaction before expiring or failing work. Queue
  loss cannot delete the durable pending order.

## Custody, cancellation and compensation

- `customer-authorized` and `operations-authorized` are explicit **trusted auth
  fixtures**, not credentials or an actual authorization scheme. Courier actor
  identity is similarly assumed authenticated before method entry.
- An unanswered offer can be cancelled. Assigned or picked-up work requires a
  trusted `VerifiedRelease` bound to order/attempt/generation/evidence ID and
  verified custody clearance. Constructing the dataclass does not verify a
  real-world handoff. The adapter dependency is intentionally visible; stale GPS,
  missing pickup upload or an expired worker lease never satisfies it.
- Pickup/delivery evidence and operation receipts are deduplicated in the same
  transaction as state and capacity. A changed evidence binding conflicts.
  Delivery is allowed only from picked_up. Physical fraud, delayed human reports
  and real courier handoffs are not tested by this code.
- `cancel_creation` models a **trusted compensation coordinator**. It fences the
  fixed upstream identity, including when no fulfillment row exists, before
  committing compensation intent. A late create cannot cross that fence. If
  current work is offered/assigned/picked_up, this narrow helper refuses and
  requires the appropriate controlled state path; it cannot infer no custody
  from a missing response. Actual refunds use Ch24 and are not implemented here.

## Location and projection

- The authoritative session row is provisioned or created under a uniqueness
  retry, retained beyond point TTL, and never reuses epoch after reconnect or
  store recovery. The SQLite model retains it durably. Production session
  authority is separate from disposable point detail/index keys.
- Every reconnect increments epoch, clears the point and requires new sampling.
  An old disconnect is conditional on epoch. Upload validates the active session,
  nonnegative sequence, coordinates, accuracy and a trusted relative clock bound.
  Duplicate/reordered sequence does not refresh any point timestamp or TTL.
- A6's relative clock uncertainty is ±5 seconds. Freshness requires
  `-5 <= now-captured <= 25` seconds, ensuring a conservative age upper bound of
  30 seconds. `LocationGate.java` uses milliseconds and guards finite numeric
  fields/invalid times; `model.py` uses whole seconds for deterministic fixtures.
  Without a defensible bound, points are ineligible. No spoof-resistant GPS or
  clock calibration is implemented.
- Candidate reads recompute freshness despite remaining cleanup TTL, and check
  current session/connection. Business eligibility and authoritative capacity
  are additional gates. Liveness alone is not fresh GPS.
- The local projection applies only the exact currently valid epoch/sequence and
  reconciles dropped events from latest details. Old migration cannot move a
  courier backwards. SQLite makes the local cell change transactional; production
  sharded indexes must add new membership, conditionally remove old versions,
  deduplicate and recheck details. This model does not prove cross-shard atomicity.
- The isolated Redis probe proves only that expiring a detail key leaves a member
  in a different GEO key. It does not implement Redis Cluster location CAS,
  TTL notification delivery or replica/failover semantics.

## ETA and validation limits

The local `eta` helper checks live/cache validity and a server-derived context
bound to assignment generation, stage, origin, destination and traffic slice.
The model receives that trusted context rather than constructing a real route.
Before pickup ETA is `max(pickup,prep)+dropoff`; after pickup it is remaining
dropoff travel. Missing/expired/wrong-context elements or stale location produce
unavailable, not zero. A valid cached result is marked low-confidence. Real
Routing requests, cache accuracy, SSE/WebSocket reconnection, authorization at
send gates and in-flight privacy revocation are unimplemented dependencies.

The checks execute normal paths, unique-key retries, both sides of reservation
competition, duplicate completions, accept/expire/cancel races, rollback after a
partial mutation, deadline crossing after lock acquisition, controlled release
fencing, bounded recovery, unknown-creation fences, location epoch/sequence/age
boundaries, projection reconciliation, ETA degradation, arithmetic, Java 17 and
the isolated Redis TTL experiment. They are executable teaching evidence, not a
production reliability, throughput, disaster recovery or physical-custody proof.
