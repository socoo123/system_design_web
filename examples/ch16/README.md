# Ch16 teaching implementations

The five displayed blocks are shared with `chapters/ch16.html`:

| Source | Nature and contract |
|---|---|
| `page.sql` | PostgreSQL 18 teaching SQL, not a full runnable schema. Authenticated post and signed cursor parameters; immutable parent/root/time/id; root `ever_public` never resets. First page omits the seek predicate. Assemble joined rows into root containers, without exposing hidden body/profile/quote fields. Expansion validates root ownership/history and starts below that root's last preview. |
| `like.lua` | Complete executable Redis 7.2+ script. One comment hash contains `ready=1,total,delta,u:<user>`. Initialize complete state only; a new comment can start empty. No TTL or independent eviction. Authenticated numeric user ID and desired `0/1` are arguments. Counts stay within ±10¹² exact integers. One HSET changes all three facts. No recovery lifecycle or authorization implementation. |
| `flush.sql` | PostgreSQL 18 teaching fragment: `(comment_id,batch_id)` unique immutable ledger, existing `like_count` row with nonnegative count, one in-flight batch per comment. Application must check count-row existence and compare the new statement's stored delta before commit. Statements share a transaction and one database. Not executed against PostgreSQL here. |
| `moderate.pseudo` | Transaction pseudocode. All named records use one post-shard authority. Pre-created `post_guard(post_id)` is locked with `SELECT ... FOR UPDATE` through commit by create/edit/delete/approval operations. Receipt uniqueness is `(post_id,user,key)`; canonical intent includes all externally observable input. IDs and parentage never change. Decision inputs are trusted worker events with reviewed digest/version. |
| `cache.pseudo` | Adapter pseudocode. Cache-side lease owner/token check+fill and token rotation+delete are atomic. Tokens never repeat, including restart. BUSY waits and returns a fresh filled page or 503; it does not query origin. CACHE_UNAVAILABLE may bypass under the shared global quota without filling. The query reads a fresh authoritative statement snapshot, not a lagging replica or old transaction. Absolute expiry and bounded clock/output error are required. |

`rotate.lua` and `ack.lua` are executable supporting scripts, not additional page blocks.
Rotation atomically stores the frozen delta and resets the live delta in the same hash;
one in-flight batch prevents an unlike batch arriving before its like batch. Concurrent
rotators obtain the existing batch. UUID generation/never-reuse is a trusted caller contract.
Only a matching committed acknowledgement clears the active batch; new delta survives.

Like acceptance is intentionally weak. An entry recovery gate must stop writes following
restart, failover or snapshot restore, even when a restored hash says ready=1. Detecting
those events, maintaining the gate and reconciling facts are deployment contracts that
these scripts do not implement. A persisted integer cannot recover membership. Without
durable membership, remain read-only or explicitly reset the product to a fresh generation
with zero count/members and reject all old batches. Do not silently resume with empty members.
Receipt order defines conflicting like targets. A delayed old like may beat a new unlike;
operation-order semantics require durable versioned membership, not this script.

Run from the repository root:

```sh
python3 examples/ch16/sync.py --check
REDIS_SERVER=/tmp/redis-7.2.5/src/redis-server python3 examples/ch16/verify.py
```

`sync.py` (without `--check`) copies the five source blocks into HTML; it does not rewrite
prose or diagrams. `verify.py` uses only Python's standard library and an existing local
Redis binary. Redis runs in a temporary directory with an isolated Unix socket, port 0,
no RDB/AOF and no access to existing services. It is terminated and the directory removed.
The SQLite model has real constraints, transactions and concurrent connections, but its
locking and per-root probes do **not** validate PostgreSQL LATERAL/plans or row locks.
Cursor/cache and moderation ordering probes test declared contracts. No cluster, replica,
queue, recovery, clock-skew, network partition, load or production SLO experiment is claimed.
Results: `docs/reviews/ch16-code-results.json`.
