# Ch25 scheduler teaching contracts

The six page blocks are PostgreSQL 18 teaching SQL and pseudocode, not compilable
Java. They expose T1 materialization, claim and generation, lease transitions,
recurring misfire pages and business T2. No production service is implied.

Run from the repository root with Python 3.9+ and Node.js:

```sh
node examples/ch25/sync.mjs --check
PYTHONDONTWRITEBYTECODE=1 python3 examples/ch25/check.py
node tools/audit-chapter.mjs ch25
```

`check.py` writes `docs/reviews/ch25-code-results.json` by default. Pass an output
path as its first argument to retain a separate reviewer run. It uses only the
Python standard library and transient database files. No framework, credentials,
external server, Java compiler or package install is required.

## Adapter contracts and deliberate limits

- Registration authentication, tenant authorization and canonical request receipts
  are Ch09-style dependencies. `Scheduler.add` inserts an already validated fixture,
  not a public HTTP endpoint. Definition edits must lock the job row, increment its
  version, choose the new cursor and clear/resolve its pending recovery pass in the
  same transaction. Old runs retain immutable payload/effect_key; pausing stops
  future materialization only. Previously materialized work needs explicit cancel.
- The production calendar enumerates strictly increasing UTC instants from pinned
  expression/timezone/tzdb/DST rules. `model.py` implements **only fixed UTC intervals
  and one-shots**. It preserves arbitrary fixed-interval phase (30s,90s,150s at a
  180s restart produces next=210s). It is not a cron parser or a DST implementation.
  Recurring misfire pins the first still-live occurrence across pages; completion
  of that pass is independent of a fresh misfire threshold. One-shot due work
  keeps its original deadline and sets the next cursor to null, including after
  downtime; it defaults to execution rather than skip.
- `freeze_input_and_business_key` is deterministic pure input construction.
  Occurrence identity is non-null job/version/original UTC instant. Only the
  specifically identified occurrence-key conflict is replayed, after comparing
  frozen payload and effect key; unrelated constraint/storage errors roll back.
- T1 covers run insertion, audit and cursor in the **same scheduler database**.
  Queue publication cannot join this local transaction; scan durable ready or add
  a dispatch outbox. Do not dispatch from an unconfirmed commit. Claim ACK loss
  recovers by persisted unique owner and generation, not a new occurrence.
- PostgreSQL row locks and SKIP LOCKED are verified against PostgreSQL 18 official
  documentation. The executable adapter uses actual SQLite BEGIN IMMEDIATE, which
  serializes writers at a coarser level; this does **not** test PostgreSQL row locks,
  statement snapshots, SKIP LOCKED, SQL schema installation, replication or failover.
  The model schema is embedded in model.py; schema.sql documents PostgreSQL types.
- Lease/due time is read after acquiring the protection lock. PostgreSQL adapters
  use clock_timestamp(), not transaction-start now()/CURRENT_TIMESTAMP. The tests
  read a controlled persisted fixture_clock row inside the transaction; it permits
  deterministic pause and lock-wait counterexamples, **not** a real clock-drift or
  physical-commit-time lease guarantee. No RPC occurs while holding a row lock.
- Claims increment both attempts and generation, including expired-owner takeover.
  At most five automatic attempts occur. Heartbeat/complete/timeout require current
  running owner/generation and lease valid at the locked time sample. Timeout and
  expiry retain unknown effect; definitive business outcome must be investigated
  under the original key. Reaper and direct takeover serialize through the row.
  The deterministic test backoff omits jitter; production adds bounded jitter and
  shared downstream admission. This adapter is not an at-least-once liveness proof.
- Complete accepts a trusted fixture result CLOSED/NOOP_TERMINAL; real adapters must
  authenticate result provenance, tenant, operation identity and frozen input.
  Passing a result string is **not** an implementation of remote authentication.
- Cancellation before the first attempt can mark ready as cancelled. A running
  cancellation records a cooperative request; a confirmed effect may still complete.
  Cancelling retry_wait enters review with uncertainty intact. Review/query/manual
  resolution, job-level serialization slots, attempt audit storage and its UI are
  design contracts, not a full implementation in this adapter.
- OrderStore uses another real SQLite file. It locks the order, checks the business
  deadline and atomically commits state, stable-key receipt and outbox. Unpaid and
  not due returns RETRY_AT without caching a no-op. PAID/CLOSED cannot reopen in this
  teaching model. Canonical intent excludes attempt identity. Tenant comes from a
  trusted authentication fixture; raw HTTP authorization is not implemented.
- Scheduler and Order DB never share a transaction. The direct Python method call
  models an RPC result/ACK loss; it is not a network integration. A third real sink
  database atomically commits event inbox and local effect. Relay ACK loss can
  resend; it never establishes once-only email/SMS delivery through a non-idempotent
  provider. Retain operation evidence for the whole replay scope independently of
  seven-day terminal-run history. Production raw-write permissions must protect the
  controlled transaction paths and immutable identities.

The executable checks cover normal and rollback paths, two-connection scheduler
and worker races, post-lock clock sampling, takeover/stale writes, lost replies,
finite retries, cancellation, misfire pages/phase, timer hints, real UNIQUE/NOT NULL,
business deadlines, cross-database recovery and duplicate sink delivery. They do
not test production process pauses, clock service behavior, real network failures,
PostgreSQL installation/failover, throughput, arbitrary cron/DST, or production
reliability. No commit, push or deploy is performed by these examples.
