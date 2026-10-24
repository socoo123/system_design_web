# Ch28 configuration center teaching contracts

The page has seven same-source blocks: executable SQLite constraints, authority
transaction pseudocode, a local watch excerpt, two local SDK excerpts, a pure
cohort selector excerpt, and folded HTTP interface notation. HTTP paths alone
are not counted as an implementation. Full Java classes compile with Java 17.

From the repository root:

```sh
node examples/ch28/sync.mjs --check
PYTHONDONTWRITEBYTECODE=1 python3 examples/ch28/check.py
node tools/audit-chapter.mjs ch28
```

`check.py` writes `docs/reviews/ch28-code-results.json`, binding source SHA256s.
Pass a different output path as its first argument for an independent run.
It uses Python standard-library SQLite and Java 17 at
`/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin`.
Temporary databases and class files live in a temporary directory and are removed.
No service, credentials, dependency installation or user browser is required.

## Guarantee and adapter boundaries

- `model.py` executes real SQLite transactions, composite foreign keys, NOT NULL,
  receipt identities, conditional Current updates and concurrent separate
  connections. BEGIN IMMEDIATE serializes all writers, more coarsely than the
  PostgreSQL-shaped Current-row lock in the pseudocode. It does **not** install or
  test PostgreSQL, Raft, etcd, quorum durability, statement isolation on replicas,
  replicated failover or a distributed network. Namespace provisioning is a
  trusted fixture; it is not another public creation endpoint.
- The immutable canonical intent contains expected generation, stable/canary,
  percentage, salt, cluster, reason and optional new content. Authorization is
  checked even for replay. The receipt is rechecked after writer serialization
  and before expected generation, so concurrent identical retries return one
  result. The application insertion path rejects an existing release ID with
  changed bytes. Production raw-write permissions must preserve immutability.
  Audit stores old and new full Current views, and the same local transaction
  persists the original result and ChangeLog. The adapter has injected aborts
  at release/Current/receipt/ChangeLog boundaries and tests reply loss by discarding
  the committed call result. This is not a power-cut or ambiguous physical-COMMIT
  experiment.
- The local adapter retains all receipts/audit/content; expiry, archival, garbage
  collection and a production replay-window admission policy are not implemented.
  The page's 24h receipt/15min retry figures specify a teaching retention contract,
  not a measured or locally executed cleanup policy.
- Authentication, namespace authorization, approved rollout context, schema
  approval and transport identity are **trusted fixtures/contracts**, not an
  implemented security service. `View` is already digest-verified, parsed and
  resource-prepared before `install`; local Java does not fetch or parse an HTTP
  response, construct connection pools, implement TLS or turn an arbitrary hash
  string into a verified digest. Failed staging preserves old applied data.
- `WatchHub` owns one namespace on one service node. Its monitor only closes
  local registration/recheck versus relay-update races. Production must tail
  committed durable changes to every connection owner, bootstrap from a
  consistent store revision, map namespace generation to the store cursor, stop
  admission when replay is unhealthy, and bound waiter queues. HTTP timeout,
  cancellation and disconnection must call `idle`/remove the waiter. The Java
  model tests timeout cleanup; it is not an async server or replay-liveness proof.
  A cursor below `compactedThrough` resets; equality resumes after that floor.
  A cursor ahead of local replay requires synchronization, not an idle answer.
- `Cohort.Auth` represents an already authenticated namespace/instance/cluster/
  issued-context. A user constructing that record is not authentication. The
  selector uses SHA256 of length-prefixed UTF-8 namespace/salt/instance fields,
  the unsigned first 64 bits modulo 100, and approved cluster **AND** percentage.
  Same salt gives a nested cohort on expansion; the sampled count is not an exact
  quota or traffic share. Its deterministic sample and Python cross-check are
  correctness checks of the chosen encoding, not statistical fairness proof.
- `ConfigClient` is a one-process transition model. Local synchronized methods
  serialize whole-view/proof changes, without providing distributed authority.
  A proof binds the exact View (including identity context), request nonce and
  request-start clock. An install invalidates pending proof; identity changes
  clear the selection before a same-generation reselection. Duplicated install
  does not reset time; same-generation forks under one identity fail.
- `confirmed(..., authority)` accepts a **trusted uncached linearizable selection
  result** returned by an authenticated transport adapter. The boolean is not
  derived by the local model and must never be accepted from an untrusted caller.
  The Ticket object stands for a transport-correlated unpredictable request nonce;
  the local sequential number is not an on-wire authentication mechanism. Exactly
  one request is outstanding; consumed or timed-out responses cannot renew proof.
  No-authority/malformed/mismatched responses clear qualification. A timeout is
  unknown and retains only prior proof until its original expiry. Auth failure
  calls `invalidateProof`.
- The injected clock is a nonnegative elapsed counter with a runtime era and
  trust status, not wall-clock time. It must count suspension and long pauses,
  **or** change era/clear proof before any resumed action. This adapter obligation
  is not supplied by Java nanoTime alone. Tests control time and era; they do not
  suspend the OS, validate clock drift or discover resume events. Clock distrust,
  backwards samples, age at least 30s and epoch changes deny and prevent old-proof
  resurrection. Responses must be younger than 2s at receipt. The application
  fixes these safety limits; published config cannot turn them off.
- The gate authorizes action admission. A returned allow does not atomically
  cover later remote effects or cancel long-running work. Real actions need
  checkpoints or a separate operation authorization/revocation protocol.
  Restart may restore validated bytes but starts without proof. File flushing,
  atomic rename, directory durability, multi-process resource retirement, telemetry,
  HTTP response status, request/body byte admission and production load are design
  contracts, not locally implemented or experimentally verified here.

The chapter distinguishes **333 ten-namespace batch requests/s** from
**3,333 namespace payloads/s** over a 30s cold recovery. A 500 batch-response/s
cap means 200 MB/s only at the assumed 400 KB average response, so byte admission
must also cover larger payloads. The 500 recipients/0.25s broad-publication schedule
is a separate unit. None of these teaching rates claims measured throughput.
