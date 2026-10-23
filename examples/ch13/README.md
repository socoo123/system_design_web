# Ch13 key mechanisms

The page shows a teaching excerpt from a runnable Java 17 pure core, plus two teaching pseudocode blocks. The complete imports and outer class are in `SearchMerge.java`.
No external Java dependencies are required. Run from the repository root:

```sh
python3 examples/ch13/sync.py --check
python3 examples/ch13/verify.py
CH13_BUILD=$(mktemp -d /tmp/ch13-java.XXXXXX)
/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin/javac -d "$CH13_BUILD" examples/ch13/SearchMerge.java examples/ch13/SearchMergeTest.java
/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin/java -cp "$CH13_BUILD" SearchMergeTest
```

`sync.py` copies each `.pseudo` file and the `BEGIN PAGE`/`END PAGE` Java excerpt
into the matching `data-source` block. `--check` compares decoded HTML exactly.

## Ingest

`ingest.pseudo` accepts full, immutable source snapshots and returns ACKABLE,
RETRY_SAME_EVENT or STOP_PARTITION_AND_ALERT. A source transaction commits its row
state, monotonic version and replayable change atomically; the namespace/doc ID
is never reused. One `(doc_id, version)` must identify one canonical event digest
covering ID, version, operation and full source payload (excluding the digest field
itself). The analyzer is
deterministic within the captured concrete index generation.

The real atomic boundary is Elasticsearch's external-version **single-document
index** operation. It performs strict-greater comparison and replacement together.
Deletion indexes the same ID with `deleted=true` and the canonical deletion digest,
without the old body. It does not invoke physical DELETE. All search requests
inject the mandatory `deleted=false` filter independently of user filters. Keep
tombstones through source replay and rebuild. This example never prunes them;
finite pruning needs a proof covering all retained logs, snapshots, retries and
offline work, or another durable version fence inside the atomic apply path.
Logical deletion is not immediate physical erasure from old segments/snapshots.

On 409 the realtime GET adapter maps `_version` and `_source.source_digest` to the
fields used by the pseudocode. Equal version/equal digest is replay; higher version
supersedes the event; equal version/different digest stops the source partition.
Unknown GET or write outcomes do not commit a checkpoint. An impossible missing or
lower conflict record conservatively halts rather than discarding the event.
STOP halts and alerts until corrected; backoff handles only retryable outcomes.
The source-partition loop is sequential; parallel implementations may checkpoint
only a fully applied contiguous source prefix, not their largest finished offset.
Lost acknowledgements replay the same event. Mapping/authentication errors stop
the source partition. A production adapter must configure and verify acknowledged
index-write durability/recovery; `refresh` is a separate visibility operation.
Source history and reconciliation/rebuild remain necessary after index loss.

## Merge

`SearchMerge.java` accepts expected logical shards, one reply per shard, k, and an
explicit optional partial policy. Each successful reply is exact local top-k under
the same view, mandatory filters and comparator. `ok=false` includes query-stage
timeouts/failures, whose candidate data is ignored. Fetch occurs after global
selection; any required fetch failure must discard the page/cursor in the outer
response path. A successful pure merge alone does not establish end-to-end success.
PIT tie values model
globally unique `_shard_doc` values. The method rejects duplicate logical shards
(such as two replicas), IDs, tie values, nonfinite scores and unsorted results.
It returns hits and missing-shard IDs; complete mode throws before a page escapes.
Its optional partial result is an approximate first page: never give it a stable
pagination cursor or store it in the complete cache.

The comparator selects exact top-k for **the declared score values**. It does not
prove that local-statistic BM25 scores equal corpus-wide-statistic BM25 scores.
No RPC, term scoring, snapshot opening or authorization is implemented here.
112 executed Java checks include a 100-case deterministic randomized comparison
against sorting all documents, plus missing shards, duplicates and tie cases.

## PIT page

`page.pseudo` takes a normalized query plus authenticated scope and returns a
complete page, possibly short/empty with a continuing cursor, or an error. Sort is
fixed `_score desc, _shard_doc asc`; input page size is 1–20. Context canonicalization
includes query/filter/sort/page size, subject, tenant and authorization-scope
version. User input cannot override the injected `deleted=false` condition.
`authenticated_open` verifies token integrity and expiry before use; a production
opaque token may use authenticated encryption to keep the PIT ID confidential.
Tampering/context changes are 400, expired/missing PIT is product-defined 410.

`open_complete_pit` sets `allow_partial_search_results=false`, validates all required
shards and targets one resolved generation. Later searches use the returned latest
PIT ID, the identical query/sort and every last-scanned sort value, not only the last
displayed hit. The search adapter includes required fetch failures in `r.failed`.
It must reject timeout, missing shards and malformed results even on HTTP 200.
It never silently replaces a PIT. Old-generation index mappings/search analysis
remain available for live sessions, without mixing a newly deployed analyzer.

The one 200 ms monotonic deadline covers queueing, opening/search/fetch, authorization
and refill; adapters propagate remaining budget and cancel work best-effort.
`authority_check` uses authoritative deletion/access state for cached/PIT hits too,
not another stale derived index. It guarantees that state committed before the
check is reflected, with no claim to recall responses already in flight afterward.
Any uncertainty fails closed and discards buffered hits and cursor. It is not a
transaction atomically spanning all documents and the remote response.

At most 100 candidate hits are scanned per page. Advance the scan anchor even on
denied hits. Cap exhaustion can return empty+`truncated=true`+cursor; actual snapshot
exhaustion ends the session. `complete=true` means no required shard is missing;
`truncated` separately signals the scan cap, not an exhaustive set of eligible hits.
Candidate count 80 in the diagram is per four-shard
query round; authorization refills add work. Token expiry is conservatively based
on the final search round's renewal start. External clock skew needs a known
allowance; engine PIT loss may force an earlier restart. Completion closes the PIT
best-effort, while errors/orphaned sessions eventually expire. Production also
caps total session age and active PIT count; the pseudocode omits that controller.

## Evidence limits

`verify.py` executes actual SQLite conditional upsert/replacement and independent
PIT/cursor contract models. It includes a deliberately unsafe physical-prune
counterexample, ACK-loss replay, fail-stop checkpointing, a fully filtered
100-hit page, changed/forged/expired cursors, missing shards and authority failures.
The Python cursor model uses HMAC authentication, not encryption. These probes
exercise the specified transitions, not Elasticsearch replication, Redis clocks,
network failure or production load. No such experiment is claimed.
