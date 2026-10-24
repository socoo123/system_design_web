# Ch35 runnable metadata model

Run from the repository root:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 examples/ch35/check.py
node examples/ch35/sync.mjs --check
CH35_JDK=$(/usr/libexec/java_home -v 17)
CH35_BUILD=$(mktemp -d)
"$CH35_JDK/bin/javac" --release 17 -d "$CH35_BUILD" examples/ch35/Capacity.java
"$CH35_JDK/bin/java" -cp "$CH35_BUILD" Capacity
```

Python uses the standard library and an actual local SQLite file. `write_tx` is `BEGIN IMMEDIATE` followed by `COMMIT` or `ROLLBACK`. Its writer serialization is database behavior across connections/processes, not an in-process lock. The code is a deliberately narrow metadata authority, not a serving platform.

The page displays the exact `Capacity.java` file plus `reserve`, `launch`, and `publish` regions of `ledger.py`; `sync.mjs` updates/checks those blocks. Other functions are linked here rather than copied. Source and result hashes live under `docs/reviews/ch35-*`.

- Reservations atomically check the current route, endpoint incarnation/profile/tier, tenant and replica **sequence plus KV credit**, then create a unique `(tenant,rid)` identity. A failed second debit rolls back the first. The `kv` unit is a conservative **MiB credit** supplied by a trusted adapter. The small fixture uses 4/8 MiB only to force contention; these are not engine capacities. Demand calculation, output/context caps and real engine memory admission are outside this model.
- `clock` is sampled **after acquiring the SQLite writer transaction**. Tests supply deterministic logical milliseconds. Deployment adapters must supply an authority clock with bounded skew and prevalidated snapshot/permit expiry; this program does not implement signatures or distributed clock synchronization. A real blocked writer crossing a deadline is checked.
- A successful original `begin_dispatch` caller may send once; a successful original `consume` caller may launch once. Merely querying an existing intent or RUNNING row does not reauthorize either action. After a lost COMMIT acknowledgment or crash between intent and launch, progress may be lost while credit remains. There is no exactly-once-completion guarantee or generic retry/owner takeover.
- Worker `epoch` identifies the process/device incarnation. Restart requires fencing old execution before a new incarnation becomes ready. Database epochs do not stop hardware. Fixture READY/epochs are administrative setup, not actual warmup evidence.
- `retire` revokes a still-unconsumed dispatch or starts retirement of accepted work. `release` is callable only by a **trusted completion adapter** after all relevant GPU/copy/stream work ended or the old process/device was fenced/reset. Tests inject this signal and do not establish physical completion. The SQL row verifies identity/state and refunds both ledgers once.
- `publish` atomically CASes revision and records the full bundle/weighted endpoint snapshot, stable publication key and audit. It rejects unready/draining/mismatching endpoints and incompatible API/persisted-state schemas. It does **not** measure or implement capacity/quality rollout gates; real deployment must bind approved evidence to current generations before publication. Manifest byte verification, tokenizer compatibility and actual load/warmup are also external.
- A routed worker cannot begin drain. After withdrawal, drain blocks new dispatch and expires undispatched HELD credit; already granted DISPATCHING/RUNNING still prevent unload. Once drained, this model does not promise warm rollback. Artifacts alone do not create ready capacity.

The chapter explains compatible expand/contract state migration; code intentionally rejects incompatible schemas instead of implementing a universal migration. The namespace only models textual bundles, not actual KV payloads, checkpoints or token logs.

`check.py` runs distinct-connection final-slot/KV and same-key races, dispatch/expiry races, rollback of partial SQL mutations, actual process exits before/after commit, publication CAS/idempotency/schema rejection, old-bundle pinning and drain/physical-release bookkeeping. Assertions are metadata checks, not independent production experiments. `Capacity.java` recomputes teaching assumptions under the largest machine failure. No GPU/CUDA, Kubernetes, networking/SSE, PostgreSQL, performance test or real provider is executed.
