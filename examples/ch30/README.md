# Ch30 RAG teaching contracts

Six nearby page blocks share these sources: four pseudocode files and two excerpts
of `RagCore.java`. Java17 uses only the standard library; the pseudocode is not a
compilable production backend. Run from the repository root:

```sh
node examples/ch30/sync.mjs --check
PYTHONDONTWRITEBYTECODE=1 python3 examples/ch30/check.py
node tools/audit-chapter.mjs ch30
```

The checker executes Java17 at the session's explicit JDK path and writes
`docs/reviews/ch30-code-results.json`; a first positional argument selects another
result path. No package install, credentials or network service is needed.

- `query.pseudo` owns cancellation/deadlines and pins the whole immutable bundle.
  Authentication supplies tenant/subject, while current membership comes from the
  authority. Both retrieval lanes receive the same scope. `filter_ids` joins
  pool-specific current revisions, published manifest ID/hash and indexed-child role,
  live membership and whole-span ACLs before text
  reads. Candidate caches hold IDs only; hits reauthorize. Answer caching is off.
  Hosted rerank/inference/judge services must be approved tenant data processors.
- `ingest.pseudo` commits revision/jobs/stable receipts before202. Connector source
  cursors are monotone. Catalog writers lock doc then job, sample time after locks,
  and check live owner/epoch/lease, target revision and tombstone at publication.
  Leases fence publication, not arbitrary external writes. Immutable keys include
  pool/splitter/revision/offsets. One canonical embedding artifact is persisted per
  manifest, and retries reuse bytes instead of assuming floating-point determinism.
  Manifest.text includes children plus parent text; both index sets contain only
  children. Parents must be text members, not arbitrary same-revision staging.
  Full manifest IDs/hashes and serving-reader visibility are explicit adapter
  contracts; a canary or write acknowledgement cannot fulfill them alone.
- `RagCore.rrf` consumes already authorized/current qualified IDs and original ranks,
  deduplicates per lane, sorts deterministically and caps80. `pack` accepts already
  checked exact spans, conservatively discards overlaps and counts both serialized
  evidence and the complete prompt. Production injects the actual generation
  tokenizer/chat template. The executable uses character-count fixtures only.
  Renderer must safely serialize evidence as data; delimiters do not prevent
  prompt injection. It must include IDs/provenance/roles/question and all wrappers.
- Parent expansion is an authorization operation before packing: same revision and
  pool, every covered ACL range, then deduplicate. Unauthorized/oversized parents
  fall back to authorized children. The SQLite adapter exercises a readable child,
  mixed-permission parent and an uncovered ACL gap. It does not implement parsing,
  embedding or a production parent expansion pipeline.
- `release.pseudo` distinguishes mechanical identity from support. Controlled facts
  compare entity/value/unit/conditions; free text uses a pinned fallible judge with
  human calibration. Structured claim parsing/evidence requirement classification
  are also fallible contracts, not proven NLP implementations. Unsupported or
  UNKNOWN/timeout blocks the whole sentence, with at most one bounded rewrite.
  After judging, reauthorize **all** prompt dependencies, including uncited spans;
  any policy/current/deletion change invalidates the whole draft. A different pack
  requires regeneration. Do not just delete a citation from an old draft.
- The check/send gap is intentional: the authority check has a defined linearization
  point; approved/in-flight bytes can still arrive after revocation. Stronger
  revocation acknowledgement requires serializing/draining active queries and
  cannot retract sent network bytes. Citation clicks reauthorize exact revisions.
- `migration.pseudo` requires a consistent source snapshot plus retained versioned
  change log covering every partition, including upserts/deletes/policy. Source
  coverage, both-lane search visibility and held-out evaluation precede whole-bundle
  CAS. Both pools and the old encoder remain current through rollback retention.
  Sources lacking those primitives need a write freeze or explicitly weaker
  reconciliation. The executable models independent pool currents and global deny,
  not a real snapshot/change-stream or distributed switch implementation.

`model.py` uses actual SQLite transactions and multiple connections. `BEGIN IMMEDIATE`
serializes writers more coarsely than PostgreSQL row locks; no PostgreSQL SQL or
cluster is installed/tested. Fixture time is sampled inside the transaction.
`freeze_manifest` accepts trusted parser/embedding fixtures and stores an immutable
expected set; `publish` compares text receipts with the persisted text set and both index receipts with
the persisted child set. Fetch/release verifies manifest text ID/hash; index
candidate pinning also requires child role. Extra same-version staging is rejected. Receipt dictionaries model a trusted external visibility adapter; they do not
perform Elasticsearch refresh, real search queries or vector verification. Actual
text rows and their hashes are checked, but external index durability/searchable
replicas are not. Raw metadata writes must be restricted to controlled adapters in
production.

The threaded dangerous case pauses a support judge, revokes uncited B in a second
connection, then requires complete-pack recheck to reject the draft citing only A.
Normal release, invalid IDs, support failure, membership changes, parent ACLs,
partial receipts, rollback, stale leases/targets, deletion and per-pool revisions
are tested. No real model support accuracy, prompt-injection prevention, tokenizer,
index filtering, physical deletion/backup cleanup, fault-tolerant durability,
throughput or production reliability is claimed. No commit/push/deploy is performed.
