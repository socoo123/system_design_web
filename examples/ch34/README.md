# Ch34 · Durable runtime contracts

Run from the repository root with Python 3.10+ and its SQLite 3.38+ (unixepoch and RETURNING) support:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 examples/ch34/check.py
node examples/ch34/sync.mjs --check
```

The page contains one real SQLite statement and three pseudocode contracts,
kept byte-for-byte in `claim.sql`, `step.pseudo`, `resume.pseudo`, `recover.pseudo`.
`model.py` is their small executable adapter using two separate temporary SQLite
databases. `check.py` runs normal paths and concrete failure/concurrency probes;
results persist in `docs/reviews/ch34-code-results.json` with source hashes.

`Runtime` owns run/step/action/checkpoint-event state. `Gateway` is a narrow
business-receipt fixture with a full-refund rule, not a production Ch33 gateway.
The SQLite claim statement executes verbatim inside `BEGIN IMMEDIATE`. Other
operations lock the same local writer, check ownership/version/state and commit
their records together. No database transaction spans the model/tool call.
The adapter's current run/step rows, `last_seq` and event records form its logical
checkpoint; it is not a complete historical snapshot or time-travel engine.

This adapter pins retrieval/time/random observations, reuses committed model
output and preserves unknown usage reservations. It caps physical model attempts
at two **only in this adapter**; the page's 10% extra-attempt traffic is a teaching
average, not a guarantee that every supplier accepts replay or honors an ID.
Token IDs and bindings are not used as authorization credentials.

Trusted fixtures stand in for authenticated users/agents/approvers, current
resource authorization, signed grants, provider usage and remote dispatch-time
checks. The model does not implement a general schema validator, context/object
store, transport, global 320-slot admission, complete workflow migration/handoff engine or production
scheduler. SQLite serializes writers more broadly than PostgreSQL row locks.
The two databases commit independently; tests do not prove distributed
replication durability, exactly-once remote effects, remote cancellation or
production capacity. The charge/refund balance is a tiny conditional business
example, not a payment service.
