# Ch37 · storage contracts

The chapter displays `checkout.pseudo`, `publication.sql`, and the `aggregate` region of `ExactSum.java` verbatim. Pseudocode is not Java. `storage.py` is an executable SQLite adapter of the checkout/publication contracts; it is not a complete web service.

Requirements: Python 3.10+ standard library, SQLite 3.38+ (`unixepoch`; `RETURNING` itself needs3.35+), and JDK17 for the aggregation example. The author ran Python3.11.8/SQLite3.51.0 and Oracle JDK17.0.10; see the review JSON for exact runtime versions.

Run from the repository root:

```sh
python3 examples/ch37/check_sources.py
python3 examples/ch37/run_contracts.py --output docs/reviews/ch37-contract-results.json
javac -d /tmp/ch37-classes examples/ch37/ExactSum.java examples/ch37/ExactSumTest.java
java -cp /tmp/ch37-classes ExactSumTest
```

The last two commands need an existing JDK17 on PATH. The local JDK used by the author is `/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin`.

## Contract

`checkout(path, caller, key, request)` requires a trusted, globally scoped authenticated caller ID, a stable request key, and exactly `lines` plus `delivery_ref`. Quantities are positive bounded integers; repeated SKUs merge, sort and participate in the canonical full-request binding. The schema enforces `(caller,key)` uniqueness, stock nonnegativity, and order/line foreign keys. `BEGIN IMMEDIATE` acquires SQLite's one database writer before reading idempotency. It is real multi-connection serialization, not a process-local lock, and does not emulate PostgreSQL row-level contention or distributed consensus.

A savepoint groups all stock changes and order/lines. Shortage rolls back every effect but commits an immutable OUT_OF_STOCK receipt; replenishment does not change that key's outcome. A different authenticated caller scopes a different key. Same-key changed parameters conflict. Error/connection uncertainty around COMMIT requires same-key recovery. The demo retains idempotency records indefinitely. It omits prices, payment, tenant authorization, migrations, retries/backoff and production retention policy.

`publication(path, caller, upload_id, proof)` requires a trusted verifier's proof of `caller/upload_id/object_key/version/size/checksum`. `object_key` includes its store/bucket namespace and is bound by the session, unique and immutable. The verifier must inspect that exact object version for this session, not accept a client-provided proof. The adapter rejects another session's proof and SQL checks the stored object key, size and checksum. Identical bytes at another key are not interchangeable. A repeated COMMITTED publication must match the whole stored object identity. Without proof the method is the internal cleaner, which grants deletion ownership only for a successful PENDING→ABORTED CAS plus confirmed commit; retries grant no new ownership. The clock is sampled by SQL after writer acquisition. Real object verification, IAM/create-only enforcement, exact-version deletion, late-upload drain and orphan rechecks remain external obligations. Nothing here makes two stores atomic.

`ExactSum.exactSum` assumes its trusted manifest is complete and non-overlapping, pins query/snapshot/manifest revision and content hashes, and consumes authenticated, correctly computed partial sums from the corresponding query workers. It validates binding, idempotent duplicates and completeness. It cannot prove a worker's arithmetic from a content hash. Verified empty manifests are allowed. BigInteger handles signed sums beyond long range. No network, column files, remote workers or distributed snapshot export are implemented.

## Verification

The database runner actually uses temporary SQLite WAL files, separate concurrent connections, and abrupt subprocess exit before/after COMMIT. It preserves an explicit incorrect precheck/write witness, then checks the conditional-transaction implementation. It also checks object-proof identity misuse, expired publication, unique cleanup ownership, and a publisher held behind a real write lock across its deadline. It does not simulate power loss or prove replica/failover durability.

`ExactSumTest` compiles under Java17 and checks normal/reordered/duplicate contributions, wrong query/snapshot/manifest/hash, unknown or missing fragments, conflicting sums, signed values, empty verified manifests and long overflow avoidance. These are local contract tests, not a distributed analytical performance benchmark.
