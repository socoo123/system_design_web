# Ch12 · Chat contracts

The chapter contains five shared teaching code blocks. `sync.mjs` copies these exact files into the HTML or checks byte-for-byte equality after HTML entity decoding:

- `schema.sql`: PostgreSQL 18 constraint syntax for conversation/member/message/send receipt/outbox.
- `submit.pseudo`: the conversation row is locked through the ordinary counter/message/receipt/outbox commit. Membership/policy changes use the same conversation lock. Only a confirmed A5 durable commit returns Sent; ambiguous results retry the same key.
- `receive.pseudo`: local entries and the contiguous cursor share one durable local database transaction. Certified omitted slots cover visibility holes; expired history requires an explicit reset baseline.
- `receipt.pseudo`: receipt tables are logical tables on the **same transactional authority/database** as conversation/member, although Receipt svc is a separate service. Per-device Delivered and private/public user Read have separate keys and atomic max updates. Read is bounded by this device's reported Delivered; claims still assume an honest client.
- `route.sql`: a pre-created DeviceSession row `(user_id,device_id)` contains a durable non-reused epoch plus nullable connection/gateway/lease fields. Register under a row lock; heartbeat/close match both epoch and connection. Unknown registration is discarded. This is SQL teaching, not a complete authentication/registry service.

`committed_envelope` is pure serialization, not an external publish. Message Store implements the SQL transaction, primary keys and conflict/abort handling. A5 additionally requires consensus replication of all mutations and the commit decision, durable logs, safe recovery/promotion, correct quorum membership and failure-domain placement. PostgreSQL DDL/row locks alone do not provide this distributed guarantee. A transactional replicated database may supply it; that deployment is not implemented here.

## Run

From the repository root:

```sh
node examples/ch12/sync.mjs --check
python3 examples/ch12/verify.py
/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin/javac --release 17 -d /tmp/ch12-java examples/ch12/ChatContracts.java
/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin/java -cp /tmp/ch12-java ChatContracts
node tools/audit-chapter.mjs ch12
node docs/reviews/ch12-browser.mjs
node docs/reviews/ch12-render.mjs after
python3 docs/reviews/ch12-evidence.py after
```

Browser scripts default to the existing HTTP service `http://127.0.0.1:8765` and the installed Playwright module. `SITE_BASE`/`PLAYWRIGHT_MODULE`/`CHROME` override the browser-check defaults. They launch isolated headless contexts and do not alter the user's browser.

## What was actually exercised

- Java 17 pure immutable prefix/revision model: out-of-order 108, gap closure, duplicates, tombstone/omitted slots, wrong view, untrusted omission, conflicting equal revision, newer redaction, retention baseline and highest legal seq. Its `serverCertified` boolean models a validated server input; it is not a cryptographic verifier. Its immutable copy models an aborted transition, not database durability.
- Python standard-library SQLite adaptations: original schema constraints, message/counter/receipt/outbox transactions, partial abort, committed-but-lost ACK, 24 concurrent same-key writers, post-removal authorization, receipt max/gap/multi-device/private/new-view cases, persistent route-epoch predicates, and local entry/cursor transactions with FULL synchronization. Dropping a dedup receipt deliberately demonstrates a duplicate old intent.
- SQLite `BEGIN IMMEDIATE` is a **database writer lock**, used in place of PostgreSQL row locks. SQLite `max(old,new)` adapts `GREATEST`; integer seconds adapt SQL intervals. This is not PostgreSQL concurrency, an actual server/phone database integration, power-loss testing or a distributed consensus experiment.
- Independent capacity arithmetic and explicitly labelled negative event traces. No throughput, packet-loss, node-failover, clock-drift or production durability benchmark was run.

The sample intentionally performs no send-receipt GC. A 24 h client retry policy alone cannot reject arbitrarily delayed requests after receipt deletion. Safe GC needs a server-verifiable closed sending epoch/admission deadline plus bounded/drained in-flight work. History body retention can be independent of minimal retry receipts.

Membership revocation rejects new authorization after its serialized change. Bytes already authorized/in flight cannot be recalled. A stronger “no old subscription sends after the revocation response” product promise needs an acknowledged gateway isolation barrier, which this example does not implement.

Revision application is separate from change discovery. The receive model only merges revisions already delivered to it. If a device is offline at cursor 108 while seq 106 changes to rev2, fetching `seq > 108` cannot discover that revision. Propagating edits/retractions behind the cursor is not implemented here. A complete offline protocol needs control events with new log positions or a separate change cursor; the higher-revision UPSERT/model is not a change-discovery guarantee.
