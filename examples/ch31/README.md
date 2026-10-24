# Ch31 · Fixed read roots and candidate eligibility

This is a Java17 CPU candidate model plus a Python standard-library/SQLite
authority model. It does **not** execute HNSW, IVF, ACORN, pgvector, Milvus, a
replicated WAL, embeddings, a networked replica, physical resharding or production
load. The chapter's 100M-vector numbers are arithmetic assumptions.

Run from the repository root:

```sh
node examples/ch31/sync.mjs --check
PYTHONDONTWRITEBYTECODE=1 python3 examples/ch31/check.py
/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin/javac -d /tmp/ch31-java examples/ch31/VectorCandidates.java
/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin/java -cp /tmp/ch31-java VectorCandidates
```

`sync.mjs` extracts the three marked regions from their actual source and checks
the chapter's `<pre data-source>` bytes; without `--check`, it synchronizes them.
The Java file's main runs executable checks. `check.py` executes actual SQLite
transactions and two-connection races and saves the individual results to
`docs/reviews/ch31-sqlite-results.json`. SQLite uses `journal_mode=WAL` and
`synchronous=FULL`; the vector-service WAL in the diagram is a separate concept.
Injected rollback/reopen schedules do not test power loss or filesystem fsync.

## Trusted inputs and scope

- Authentication and a trusted collection/schema registry supply tenant, model
  revision, dimensions, metric, normalization and a permitted metadata predicate.
  A schema ID is an immutable reference, not a client-controlled model label.
  Model changes use a separate space with **newly supplied vectors**.
  Query orchestration pins the bundle first, then validates the query embedding's
  model/schema against that pinned bundle. If an alias switched models, an old
  query embedding is rejected or recomputed upstream; it is never relabeled.
- A trusted router supplies the point's shard. This compact model does not
  implement hash routing. Shards in a published route are disjoint and cover the
  collection. Each space registry also fixes its routing generation; create_bundle
  rejects changing that route inside the same space. A new route requires a
  separately populated space, then token translation or an explicit error;
  changing the hash modulus alone is invalid.
- Trusted upstream supplies a monotone point version within `(space,tenant,id)`.
  Older events are logged no-ops; same-version different-body conflicts halt
  apply. An operator/source repair must resolve a conflict in order. The code
  does not skip poisoned records and claim progress. Operation IDs are retained
  indefinitely here. Production needs a retry/deduplication retention contract.
- The Java model takes a trusted immutable `pinnedLive` map and immutable point
  records with copied vector lists. Candidate payload and scores are ignored;
  keys include tenant and ID, and the latest point at the fixed cut supplies raw
  vectors and metadata. Only an eligible matching version is rescored.
- Java normalizes both query and stored vectors for cosine, rejects zero/nonfinite
  vectors, validates dimensions and rejects nonfinite arithmetic results. Squared
  L2, `1-cosine`, and negative inner product all rank low first. Java uses double
  arithmetic rather than testing a physical float32 encoding. The chapter's
  memory formula assumes actual float32 storage.
- The exact allowed count is obtained by scanning the in-memory map. This is a
  tiny correctness model, not a plan for 100M points. Production needs indexes or
  bitsets at the same read cut. The candidate stream is a fixture, so reaching k
  says nothing about ANN recall. All inspected entries, including rejected and
  repeated candidates, count against the cap. Real scanning and deadline limits
  belong to the engine adapter and admission layer.

## Concrete transaction and publication boundaries

`Catalog.accept` writes the durable operation/body/LSN and durable watermark in
one `BEGIN IMMEDIATE` transaction. A repeated operation returns the original
space/epoch/LSN or rejects changed contents. A return is emitted after commit. A lost
ACK is modeled by ignoring a committed result and retrying.

`Catalog.apply_next` reads only `applied+1`. MVCC vector/metadata/version rows and
the applied watermark commit together; tombstones retain the highest point
revision. A `seen_version` identity row is retained even for stale no-op events,
so reusing that revision with a different body also stops apply. Old MVCC rows remain so `stage_root(cut)` can read a historical cut even
after later apply. All core data lives in the **same local SQLite authority**;
no distributed atomicity is inferred from this transaction.

`stage_root` reads all MVCC rows through a contiguous applied cut and saves an
immutable JSON read root. The document binds schema, route, codebook, shard,
epoch, exact cut and all point state including deletes. Inserts never replace an
existing root, and published bundles cannot acquire roots later. The model's
checksum can verify these actual stored bytes.

In a real vector service, roots reference external immutable/MVCC index, vector,
payload and live-version structures. Before registering a root as staged, the
adapter must verify checksums, schema/codebook, coverage and actual loading on an
eligible replica; its readiness receipt binds root hash, exact cut and process
incarnation. The catalog transaction cannot make an external load atomic or keep
that replica alive. Resource loss/expired readiness requires revalidation, and
read-time root acquisition may fail. Do not replace this adapter with “write ACK
means searchable.” These load/replication obligations are **not executed here**.

`publish` requires exactly the schema's entire shard set plus a trusted minimum
barrier for each shard. Matching epochs/cuts/checksums and the alias sequence CAS
share one authority transaction. The monotonically increasing alias sequence
avoids an ABA publication race. The barrier is supplied by the trusted ingestion/
migration coordinator, not the caller; for a model migration, source-cursor
backfill/replay must first establish it in the new model's log. The model does
not establish source coverage or generate embeddings. Reusing old roots only
passes when they cover the requested barrier; fresh rollback needs freshly
caught-up old-space roots.

`pin` reads alias/bundle/roots and records a persistent query pin in one authority
transaction. An optional write token binds space/schema identity in addition to
shard/epoch/LSN. `pin` rejects a token from another space even if epoch/LSN numbers
coincide after an alias model switch. It is a **minimum** checked against the bundle.
The root's read cut is then fixed, not merely a lower bound. `gather` checks query,
active attempt, bundle/hash/epoch/**exact** cut; duplicates count once and stale
attempts cannot fill a missing shard. Replica hits are trusted results already
processed by candidate checks. A checksum identifies a read root, not a proof of
arbitrary remote computation. It returns canonical low-first top-k. `complete`
means every required shard replied, not exact nearest neighbors. Callers still
aggregate the Java per-shard shortfall/exhaustion statuses; this catalog model's
`gather` demonstrates coverage and attempt handling, not that status aggregation.

`retire` refuses any bundle referenced by an alias or query pin. Pins are explicit
and have no TTL: a process crash can leak them. A production lease design must
fence expired workers before reclamation; deleting a lease row alone is unsafe.

The fixed per-shard cut vector may contain different logical moments. It provides
neither cross-shard atomic writes nor a single global transactional/linearizable
snapshot. The model also does not implement a bounded-staleness clock proof. A
token outside the current bundle waits for a newly covering bundle or fails;
silently falling back to an older root is invalid.
