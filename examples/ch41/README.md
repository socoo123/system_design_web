# Ch41 examples

Run from the repository root:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 examples/ch41/verify.py
```

Requires Python 3, SQLite 3.35+ (`RETURNING`), and Java17 at the path in `verify.py`.
The runner uses a temporary directory for databases and `.class` files, then removes it.
Results are written to `docs/reviews/ch41-code-results.json`.

The four HTML snippets are copied from `ReadGate.java`, `migration.pseudo`,
`submit.pseudo` and `submit.sql`; the runner compares them byte for byte after HTML
entity decoding. `storage.py` executes the actual named statements in `submit.sql`.

- `ReadGate.java` checks a trusted, pinned query snapshot's cluster, history and
  included continuous prefix. It deliberately accepts equal histories only. A
  real engine adapter must produce that proof, open the snapshot after the replay
  barrier, retain server/connection identity, and enforce deadlines/admission.
- `storage.py` demonstrates one-item draft submission in one authoritative SQLite
  database. `BEGIN IMMEDIATE` takes its single writer before the result lookup.
  Every draft edit must increment its version. Tenant/caller authorization is an
  external trusted precondition; this is not an HTTP service or an auth example.
- A committed `(tenant, caller, key)` is bound to the complete request
  `(tenant, order_id, expectedVersion)` and stores the successful response. Failed
  transactions leave no result; e.g. a sold-out request may succeed after stock
  replenishment. Any final-rejection caching contract would need explicit storage.
- Order CAS, stock, outbox and successful result commit together. No RPC or other
  irreversible effect is inside the transaction. The adapter performs one
  transaction attempt. The pseudocode's bounded PostgreSQL retry policy is a
  caller contract, not an implemented PostgreSQL adapter.
- The local range guard/freeze exercise uses SQLite's coarse writer lock to
  demonstrate one shared serialization domain. It does not implement distributed
  ownership, log positions, a migration engine, or failover fencing. The
  `migration.pseudo` directory and target proof/grant are explicitly engine/control
  plane contracts. Old prepared work must finish before a drain proof exists.

Actual checks cover normal commit, response loss, changed parameters, stale
version/state, two processes taking the final unit, an outbox constraint failure,
unclean process exit before COMMIT, and an in-flight writer delaying a fence.
Java checks fresh/stale snapshots, forks, another cluster and denied fallback.
The result file separately lists untested distributed integrations. None of these
local exercises is a proof of real replica durability, 2PC recovery or MQ/PSP/Saga
reliability.
