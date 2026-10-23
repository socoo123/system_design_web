# Ch14: source binding, claims and immutable publication

Five **teaching pseudocode** snippets are shared with `chapters/ch14.html`.
They are not compilable Java, a complete service, or a real encoder.

```sh
python3 examples/ch14/sync.py --check
python3 examples/ch14/verify.py
```

`sync.py` copies/verifies exact source text. `verify.py` exercises SQLite
transactions/unique constraints, a versioned in-memory object store, actual
CRC32/SHA256 byte checks and a small HLS-reference parser. It is a serial contract
model, not evidence that PostgreSQL row locks, S3, CDN, codec compatibility or
production fault recovery were executed. It outputs retained evidence to
`docs/reviews/ch14-code-results.json`.

## Inputs and atomic boundaries

- `complete.pseudo`: an authenticated owner, server-assigned video/upload identity
  and a non-null physical versionId. The uploaded source uses `CRC32` with
  `FULL_OBJECT`, explicitly selected at multipart initiation/completion. Compare
  algorithm/type/value together; do not compare a composite multipart SHA256 or
  ETag to a whole-file digest. The checksum detects transport corruption; it is
  neither authorization nor a proof that an untrusted source is safe to decode.
  HEAD requests the exact version with checksum retrieval enabled. Missing
  checksum/type is verification failure, not a wildcard match. Transcoder GETs
  that version and recomputes the same full-object CRC32 over its bytes.
- The Upload row protects its server-assigned key until a transaction retires it.
  The completion transaction holds `Video→Upload`, checks ownership, active
  attempt, expiry and visibility, then inserts SourceBinding plus unique Job and
  stores the immutable source receipt. `(video_id,source_version)` and
  `(video_id,source_version,recipe_version)` are primary/unique keys. Job epochs
  never reset and recipe versions are immutable.
- Repeated bound completion returns its old source receipt, not current playback
  readiness or new object access rights. Owner authorization remains mandatory.
  A receipt includes object identity/checksum but no presigned GET capability.
  New source bytes require a new upload attempt/logical source_version. The
  create-video endpoint uses an owner/idempotency-key unique constraint plus
  stable request digest; a uniqueness loser rolls back before a fresh winner
  lookup. Request parsing, SQL parameterization, create quota and authentication
  middleware are contracts, not implemented backend code here.
- `claim.pseudo`: one authoritative PostgreSQL primary, short transactions and
  row locks. Claims, publication and GC lock `Video→Job→Build`; completion uses
  `Video→Upload`. Read errors are distinct from missing rows. A 120s DB lease is
  renewed every 30s with conditions `RUNNING`, same epoch and `lease_until >
  db_clock()`; evaluate time after locking. A lost renewal stops publication.
  Claim attempts include crashes before encoding; at most three without reviewed
  redrive. A completed/failed/obsolete job is terminal, not claimed again.
- Queue messages are durable-work wake-ups, not the work authority. A scanner
  re-wakes due QUEUED/RETRY_WAIT and expired RUNNING jobs even if a previous wake
  had been ACKed. Failure handling takes the same locks, updates only RUNNING at
  the same epoch, commits RETRY_WAIT/next_at or FAILED, then ACKs. It never
  overwrites successor state. DB error/unknown commit does not ACK; recover state
  with a fresh connection. Manual redrive records an operator action and extends
  the budget while preserving epoch; a Dead letters view lists terminal failures.

## Physical outputs, validation and GC

- `build.pseudo`: every claim owns `outputs/J/epoch/`; encode/packager output
  names are normalized relative names. All workers enforce create-only PUT,
  backed by bucket policy, with no object/version deletion or bucket mutation
  permission. Ordinary writes cannot reset a key. Source/output buckets remain
  versioned before any writes. Generic lifecycle deletion excludes managed
  source/output objects; a separate GC owns retirement.
- `put_exact` uses **single object PUT**, not multipart. An unknown PUT response
  or 412 recovers the current version and compares actual bytes before reuse.
  If lookup is missing/unavailable, no reference is returned; the caller retries
  the conditional write within its lease. A conflicting object fails the attempt.
  A single-PUT 409 can retry; multipart-completion 409 would require re-initiation
  and is outside this helper. Different epochs may encode different bytes: their
  isolation, not deterministic encoding, preserves safety.
- Each ref is `(bucket,key,versionId,size,SHA256)`; SHA256 is over full bytes.
  Encode media/init before playlists, then leaf-to-root playlists whose **every
  URI pins its own physical versionId**. URL-encode opaque version IDs. CDN cache
  keys include versionId and forward it to Origin. Authentication query/cookie
  rules are separate and cannot strip content version identity. No assumption
  that a parent's query is inherited by relative child URLs is allowed.
- `publish.pseudo`: the verifier actually GETs and parses the root/child playlists
  and checks their reference closure against inventory, allowing only configured
  bucket/host and normalized keys within this epoch. Every ref is a pinned,
  non-null version with verified size/hash. Required rungs, segment counts,
  continuous timestamps, duration and decoder validation are explicit
  encoder/parser/decoder adapters. No real H.264/AV1 or media validator is run in
  the contract model. The model checks the closure, rung set and byte identity;
  decoder outcome is injected. Full byte revalidation is conservative and adds
  internal read bandwidth not included in viewer egress.
- Verification runs outside the metadata transaction. The transaction checks
  current target, visibility, RUNNING, epoch, unexpired DB lease and BUILDING;
  it co-commits exact Build inventory/root, ready pointer and Job.DONE. The
  `require` shorthand aborts/rolls back on false. A failed COMMIT reply is UNKNOWN;
  reconnect to inspect Job.result. A known DONE only confirms the result and
  never restores an obsolete ready pointer. ACK is last.
- GC uses the same metadata locks. It first commits DELETING only after current
  ready references, valid-session/capability references and retention bounds are
  gone and no live current claim protects the build; only then may it delete
  exact object versions in that prefix. Marking DELETING prevents publication
  even if validation finished just before the mark. If publication wins first,
  the new references prevent deletion. Lease expiry alone is not deletion.
  Retain old published media at least 24 hours and extend recorded retention for
  valid session/manifest windows. Already removed builds cannot regain publish
  rights. Late old workers can create unreferenced objects after a sweep; stop or
  expire their write capability and rescan. This is a storage leak to reclaim,
  not permission to publish them.

## Playback grant admission shares the GC boundary

`grant.pseudo` closes the read-pointer/sign-capability race. Creating or renewing
playback capabilities uses the same `Video→Job→Build` lock order. Playback policy
and removal changes also serialize on Video. A new session selects ready after
locking Video; renewal selects the owned, still-valid grant's exact generation.
Both recheck a PUBLISHED Build while holding its lock, never sign a cached root
first, and reject a DELETING/DELETED build. If GC wins, reject/reselect; if grant
admission wins, its durable reference and gc_not_before prevent GC.

PlaybackGrant has a unique `(viewer,key)` and stores immutable intent, Build,
exact root/version, resource prefix, expires_at and protected_until. Replaying
one key recovers the same deadline, even after ready moves. Renewal uses a new
key and an owned grant identity; it is another protected transaction. Replaying
a committed renewal checks its own deadline before consulting an expired old
grant; only new renewal admission requires the old grant still live. The
transaction stores the grant and extends Build protection **before** signing.
COMMIT UNKNOWN requires a fresh authoritative read of that same grant/key; a
missing/unconfirmed result never produces a capability. The recovered row must
match the request intent, guarding a different intent that later wins the same
key after a rollback. The signer uses only
the committed root and absolute expires_at, checks that time remains, and never
recomputes `now+TTL` while retrying a lost response.

GC protection covers the capability deadline plus deployment bounds for CDN
clock error, bounded in-flight read drain and declared manifest reuse. These
bounds must actually be enforced; if reads cannot be bounded/drained, retain
references until drain is confirmed. Token expiry alone is not read completion.
The five-minute TTL is a teaching input, not evidence that these deployment
bounds were measured. Late grants cannot revive DELETING generations.

The displayed pipeline implements **all-three-rung publication**. BASE then FULL
requires allowed recipe stages and a monotonic quality rank for the same source;
it is described as a variant and is not claimed as implemented by these snippets.
Deletion blocks new sessions and stale publications, while already issued
five-minute capabilities retain their expiry window unless online blocking is
configured. No load test, production crash, clock/network partition, real codec
validation, S3 policy evaluation or CDN configuration experiment is claimed.
