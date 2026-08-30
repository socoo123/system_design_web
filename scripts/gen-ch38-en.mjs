import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch38",
  titleEn: "Cache & CDN",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 90–120 min ｜ **Prereq**: Ch37 storage; the read path in design problems
> **Goal**: Cache-Aside / Through / Back; penetration / breakdown / avalanche; CDN. Semantic cache points at Ch32. This is not a cloud shopping trip.

This is **M6's third foundation chip**, not another 4-step design problem. On the spine, short-URL redirect, Feed timeline, search prefixes, comment counts, and video bytes all hit "don't punch the source of truth on every hot path"—here we unpack **how to write Cache-Aside as the default, how to open the three failure modes, and what CDN does on the HTTP read path**. Design problems just cite it; they do not turn the whiteboard into a caching lecture. LLM gateway **semantic cache / embedding cache** gets one line back to **Ch32**; we don't re-teach it here.

**One line:** read-heavy write-light APIs default to **Cache-Aside** (lazy load): the app owns miss fill, **the DB is the source of truth**, close the window with invalidation after write + **TTL**. Write-Through / Write-Back are trade-offs, not three things you have to implement. CDN is HTTP cache at the edge, not a video-transcoding class.

Three hard parts (the pieces worth digging):

1. **Aside vs Through vs Back** — who writes, who is authoritative, what happens when it dies
2. **How to open penetration / breakdown / avalanche** — bloom or negative cache; single-flight; TTL jitter; hotspot replica
3. **What CDN does on the read path** — Client → Edge → Origin; name **cache key / origin shield / stale-while-revalidate**

This chapter **does not cover**: CloudFront / ElastiCache SKU catalogs, Redis vs Memcached flame wars as the body, CDN product tours, re-teaching Ch32 semantic cache, K8s YAML, a seven-pattern encyclopedia, Belady / FIFO / MRU eviction encyclopedia, delayed double-delete as a silver bullet. Video / blob go back to **Ch14 / Ch22**.`,
    },
    {
      id: "sec-pitch",
      headingEn: "One-line definition · 20-second interview open",
      bodyEn: `First put the scoring signal on the table: you have a default policy, you know one line for each of the three failures, and you know CDN is HTTP at the edge—not another cloud to buy.

> "Read-heavy write-light defaults to **Cache-Aside**: the app checks the cache, on miss hits the DB and fills; **the DB is the source of truth**. After you write the DB, **invalidation** (delete the key), **TTL** caps how long stale can live. Write-Through sync dual-writes—you pay write latency to keep the cache hot. Write-Back writes the cache first and flushes the DB async: high throughput, you can lose data—pick by consistency, don't draw all three. Penetration: keys that never exist get bloom or negative cache. Breakdown / **stampede**: single-flight. Avalanche: TTL jitter. Extra-hot keys get a replica. CDN is HTTP cache on Client → Edge → Origin; name **cache key, origin shield, stale-while-revalidate**. Semantic cache goes back to Ch32."

The whole chapter walks this one chain. Say the 20 seconds, then stop. Let the interviewer decide whether to dig into policy, the three failures, or CDN.

${D2}

This figure cites: Ch37 storage (DB is authoritative) · semantic cache Ch32 (one line, don't unpack)

| Interviewer ask | Where you land |
|---|---|
| "How does the system use cache?" | Cache-Aside + TTL + delete after write first; then whether you need Through / Back |
| "Cache dies / a hot key expires—what then?" | Penetration / breakdown / avalanche, three lines; don't mash them into one word |
| "Do we need a CDN?" | Static and cacheable HTTP go to the edge; personalized JSON stays in the app cache |

**red flag:** leading with a cloud product name; "implementing" all three write policies as extra credit; reciting penetration, breakdown, and avalanche as the same sentence "add a lock"; drawing CDN as video transcoding or an edge-function trade show; re-teaching Ch32 embedding cache here.`,
    },
    {
      id: "sec-aside",
      headingEn: "Mechanism · Cache-Aside / Through / Back",
      bodyEn: `First hard part. **In a 2026 interview, reciting six policies is worse than picking a default.** For a read-heavy write-light API, you open with **Cache-Aside** (also called lazy load / lookaside). Write-Through and Write-Back are trade-offs you volunteer, not a checklist homework.

${D2}

| | **Cache-Aside** | **Write-Through** | **Write-Back** |
|---|---|---|---|
| Read | App checks cache; on miss it hits the DB and SET | Read the cache (the write path already warmed it) | Read the cache |
| Write | **Write the DB**, then **DEL** the cache | Cache and DB both written **in sync** before you return | **Write the cache first**, flush the DB async |
| Authority | **DB is the source of truth** | The write is done only when both succeed | For a short window the cache is authoritative—dangerous |
| Cache dies | Slower, reads still correct | You have to define how dual-write failure rolls back | **Unflushed writes can be lost** |
| When to open it | **Read-heavy write-light default** | Need the new value on the next read, and you can pay write latency | Counters / metrics, OK to lose a few seconds |

**Why Aside is the default:** cache is an accelerator, not a second ledger. If it dies you fall through to the DB—that is graceful degradation, not a single point of correctness. You only cache keys that were actually requested; cold data does not sit in memory. On the write path, **delete, don't update**: under concurrency, "read old → write new → a slow request SETs the old value back" is the common bug; delete so the next beat miss-fills. Cap the inconsistency window with **TTL**.

Read-Through vs Aside is **who fills**: the cache library goes to origin vs the app hits the DB itself. In interviews you still say Aside—most Redis / Memcached usage is the app owning it. Write-Around (writes bypass the cache) gets one line: data you write once and almost never read should not pollute the hot set. Refresh-ahead / warmup is not a third write policy; it is a cold-start tool.

The read-miss chain is just three leaves. On hit you stop at Cache; don't draw the DB as a hop you always take.

${D2}

This figure cites: Ch37 storage choices (DB is authoritative; cache is not another database)

Miss sequence (participants are just App / Cache / DB). Write-path spoken line: \`UPDATE\` DB → \`DEL\` key; don't stack a Through path onto this figure.

${D2}

How to open consistency (Aside):

> "The DB is the source of truth. The cache is allowed to be stale. After a successful write I delete the key; TTL stops a missed delete from leaving dirty data too long. I do not promise linearizability—that's enough for Feed / short URL. Money and inventory authority do not live in the cache as a ledger."

**Through's trade-off:** write latency becomes two hops, "cache + DB"; the next read is immediately fresh. The cache gets polluted by keys that are written and never read. Dual-write can still succeed on one side only—don't sell it as a distributed transaction.

**Back's trade-off:** write throughput and coalesced updates (the same counter flushed to the DB once) feel great. When the interviewer asks about lost writes, you have to say it yourself—process dies, node has no persistence, unflushed writes are gone. Ledgers, orders, balances are a **red flag**. Acceptable examples: play counts, coarse like counts, monitoring metrics.

How to say it in the interview:

> "This problem is read-heavy write-light, so I use Cache-Aside + TTL + invalidation after write. If I need the new value on the next read and write QPS is low, I'll consider Through. Back is only for counters I can lose. The three are not a full-marks combo meal."

**over-engineering:** drawing Aside, Through, Back, CDC, delayed double-delete, and local + Redis + CDN as five layers on the board, and still not being able to say whether the DB is authoritative.`,
    },
    {
      id: "sec-stampede",
      headingEn: "Mechanism · penetration / breakdown / avalanche",
      bodyEn: `Second hard part. Chinese big-tech interviews almost always fire this three-question chain. **Split the three words first**, then give one default line each. In English, stampede / thundering herd mostly map to **breakdown** (a hot key expires, concurrent requests all go back to origin).

${D2}

| | **Penetration** | **Breakdown** (stampede) | **Avalanche** |
|---|---|---|---|
| What happens | You look up a key that **never existed**—not in cache, not in DB | **One hot** key expires, concurrent requests all miss | **A batch** of keys expire together, or the cache cluster dies |
| bottleneck | DB flooded with useless queries | A single-key origin storm floods the DB | Origin fan-out goes from 1 to N, or the cache layer vanishes |
| Interview default | **negative cache** (empty value, short TTL) or **bloom** | **single-flight** / a lock, only one goes back to origin | **TTL jitter** (base TTL + random) |
| One more line | bloom "not in" means definitely not in; only false positives hit the DB | Extra hot → **hotspot replica** | Cluster down needs rate limit / degrade, not just a TTL change |

**Penetration:** malicious random ids, already-deleted resources, mistyped short codes—cache always misses, every request hits the DB. Cache the empty value too, with a TTL shorter than a real entry (tens of seconds, say), so "does not exist" does not occupy the cache forever. Bloom: "not in" you block; "maybe in" you query the DB. Bloom has to be updated on writes, or a just-inserted legitimate key gets false-killed—that is the trade-off you volunteer, not bloom as magic.

**Breakdown / stampede:** the opposite of penetration—the key **exists and is extremely hot**. The moment TTL hits, N requests hit the DB at once and SET at once. Default **single-flight**: coalesce inside one process; across processes use a short lock (\`SET NX\` + expiry, don't split it into SETNX then EXPIRE). Whoever didn't get the lock waits tens of milliseconds and GET again, or, if the product allows it, reads the old value. Logical expiry (the key itself has no TTL; the value carries expireAt; one thread refreshes async) is the upgrade when stale is allowed—same idea as serve stale in the Facebook paper. Extra hot → **replica**: copy the same key onto several cache nodes, spread one shard's CPU—viral short-URL codes and Feed celebrity outboxes are this shape (Ch09 / Ch11 already pointed at it; don't re-do those problems here).

**Avalanche:** a bulk warmup wrote the same TTL, everything dies on the hour; or during Redis cluster failover every read falls through. Jitter: something like \`TTL = base + random(0, 0.1×base)\` is enough—don't memorize a function. The cache layer itself needs replicas / failover; below that is rate limit and degrade (Ch04 / Ch42). This chapter's nail: TTL solves "expire together"; it does not solve "the cluster is gone."

How to say it in the interview:

> "Penetration is a key that never existed: I cache an empty value with a short TTL, and add bloom if the traffic is large. Breakdown is a hot key expiring: single-flight lets only one go back to origin; extra hot, replica. Avalanche is expire-together or the cache dying: TTL jitter spreads expiry; if it's down you rate-limit—you cannot just change TTL."

**red flag:** one sentence "add a distributed lock" for all three words; penetration with never-expire; avalanche as only "Redis HA" with no explanation of expire-together; never-expire on every key as the only stampede answer (that's a hotspot special case, not a global policy).`,
    },
    {
      id: "sec-cdn",
      headingEn: "Mechanism · what CDN does on the read path",
      bodyEn: `Third hard part. CDN puts **cacheable HTTP responses** on an **edge** close to the user, cuts RTT, and shields origin. This chapter is **HTTP edge cache**, not transcoding, chunking, or the inside of object storage. Video bytes and large-blob storage / playback live in **Ch14 / Ch22**—here we only say: the URL the browser / app gets often hits the edge first.

${D2}

This figure cites: Ch14 video · Ch22 object storage (blobs are not designed in this chapter)

Read-path spoken line: Client asks the nearest Edge; **hit** returns immediately. On **miss**, don't let every PoP punch Origin—put an **origin shield** in the middle (a regional coalescing cache) and **collapse** worldwide misses into a few origin fetches. Same idea as single-flight for breakdown, just happening at the HTTP edge.

Three lines you should be able to name in the interview (name them and stop; don't open a product class):

| Point | What it does | What it looks like when you get it wrong |
|---|---|---|
| **cache key** | Decides "what counts as the same object": path, selected query, selected headers (\`Vary\`) | Shared key on a logged-in page → leak across users; every \`utm_*\` in the key → hit rate goes to zero |
| **origin shield** | Edge miss hits a central cache first, then origin | Every edge node fetches origin on its own; origin gets a stampede |
| **stale-while-revalidate** | After expiry, serve stale first, revalidate in the background (**RFC 5861**) | Treated as "forever dirty"; or claiming origin-down is fine without **stale-if-error** |

**cache key** is the correctness switch: omit something that belongs in the key (language, encoding, login state) and you leak data across users; stuff in something that doesn't (ad click ids) and the cache shards into snowflakes. Personalized APIs default to **private / no shared cache**; don't long-cache short-URL **302** on the CDN—that's approximately Ch09's 301, and Analytics disappears.

**stale-while-revalidate:** \`max-age\` in \`Cache-Control\` owns freshness; after expiry, for a window you can still return the old response while you fetch origin in the background. Sibling directive **stale-if-error**: origin 5xx or timeout, keep serving stale for availability. Both are **intentional stale**; they have to line up with the product's consistency window, not free CAP magic.

Pull vs Push in one line: interview default is **pull** (first miss fetches origin, then fills the edge). Push (pre-positioning source at the edge) is a video-chunk problem—leave it for Ch14; don't draw a global warmup topology here.

How to split it from the app cache:

| | **App cache** (process / Redis) | **CDN edge** |
|---|---|---|
| What you cache | Objects, counters, already-rendered JSON | HTTP responses, static bytes, public APIs |
| Who invalidates | App \`DEL\` / TTL | TTL, purge, bump the cache-key version |
| Personalization | per-user key is fine | Shared edge **must not** cache private pages that carry cookies |

How to say it in the interview:

> "CDN sits on the HTTP read path: Client → Edge, miss folds through a shield, then Origin. Correctness is the cache key; origin staying alive is shield and SWR. JSON business data still uses Cache-Aside; image hosts / JS / public GETs go to the edge. How video is chunked is Ch14."

**red flag:** answering CDN as a cloud-SKU comparison; designing global PoPs and certs on a Feed / short-URL board; making edge-compute Workers this chapter's spine; claiming "we have CDN so we don't need Redis."`,
    },
    {
      id: "sec-choose",
      headingEn: "Choice table",
      bodyEn: `Fill this table on the board first, then decide how many layers to draw. Layer count is not the score.

${D2}

| | **In-process** (Caffeine / local LRU) | **Remote** (Redis / Memcached) |
|---|---|---|
| Latency | Microseconds, no network | Same-metro millisecond RTT |
| Sharing | Serves only this process; every box is cold the instant you ship | All replicas share one hot set |
| Invalidation | Hard: every box must delete or wait for TTL | One \`DEL\`, everyone misses |
| Capacity | Bound by one machine's heap | Can shard |
| How you use it in interviews | First punch against a **hotspot** (Ch09 viral codes) | Default cross-instance cache |

The common combo is **L1 local + L2 Redis**, not a five-layer nesting doll. Local only holds extremely hot, stale-OK, read-only data; the write path still takes invalidation from Redis / DB as authority—local must have a short TTL, or every box holds its own old value. That's the trade-off: one less RTT, invalidation gets harder.

| Scene | Default | Don't |
|---|---|---|
| Read-heavy write-light API, object cache | Cache-Aside + TTL + DEL after write | Stack all three policies |
| Need the new value on the next read, write QPS low | Consider Through | Use Back and pretend strong consistency |
| Coarse counters, OK to lose | Back or an async queue | Make balances Write-Back |
| Non-existent ids being scanned | Empty value / bloom | Only add a lock |
| Hot key | single-flight + local L1 + replica | Infinite TTL as a global policy |
| JS / images / public GET | CDN + a correct cache key | Put logged-in JSON on a shared edge |
| Similar LLM prompts | **Ch32** exact default, semantic optional | Unpack embedding in this chapter |

Redis vs Memcached: **don't start a flame war.** If the interview needs data structures, TTL, persistence, clustering → Redis (or a protocol-compatible fork). If you only need a pure KV, multi-threaded in-memory lookaside, Memcached is still the brick in the Facebook paper. One selection line is enough; don't open a license class.

Eviction: remote cache LRU / approximate LRU is enough to open; in-process Java often uses **W-TinyLFU** (Caffeine) against scan pollution—one line from the optional paper, don't treat Belady-optimal as an implementation.`,
    },
    {
      id: "sec-papers",
      headingEn: "Papers and classic systems",
      bodyEn: `M6 needs you to name papers. Below: 2 required, 2 optional. **The interview one-liner** is in the table; don't memorize page numbers, don't invent internal numbers.

${D2}

Facebook's figure and Cache-Aside read-miss are the same chain: memcache **does not know** the DB exists; the app fills after a miss—the paper calls it **demand-filled lookaside**.

| | Paper | Required / optional | Interview one-liner |
|---|---|---|---|
| 1 | **Nishtala et al.**, NSDI 2013, *Scaling Memcache at Facebook* | Required | memcache is **demand-filled lookaside** (that's Cache-Aside); **delete** after you write the DB. **leased get**: on miss, issue a lease, stop **stale set** and **thundering herd**; brief **stale** is allowed. You can name this line when the board says single-flight |
| 2 | **Nottingham**, RFC 5861 (2010), *HTTP Cache-Control Extensions for Stale Content* | Required | **stale-while-revalidate**: serve stale first, revalidate in the background. **stale-if-error**: origin errors, you can still serve the old response. Use this on the CDN slice; don't name a product |
| 3 | **Einziger, Friedman, Manes**, ACM TOS 2017, *TinyLFU: A Highly Efficient Cache Admission Policy* (W-TinyLFU) | Optional | In-process cache: **admission** looks at frequency, not LRU-only. Caffeine walks this line. Resists scan pollution. Not a Redis required question |
| 4 | **Nygren, Sitaraman, Sun**, ACM SIGOPS OSR 2010, *The Akamai Network: A Platform for High-Performance Internet Applications* | Optional | CDN puts objects on an edge close to the user and uses DNS mapping to pick a site. Use it to prove "edge HTTP cache" is a real system, not a shopping cart. Don't memorize server counts |

**Memcache paper, one more bite (three punches for the interview):**

1. **Lookaside:** app \`get\` → on miss read MySQL → \`set\`; on update, SQL then \`delete\`. The cache is not the source of truth.
2. **Lease:** miss comes with a 64-bit token; \`set\` has to carry it. If a \`delete\` happened in between, the token is void, which blocks a slow request from writing an old row back (stale set). Tokens for the same key are rate-limited; other clients are told to retry later—that's stampede control. The paper also says: after delete you can keep the old value aside as **stale**, until the lease holder fills the new one.
3. **Don't unpack:** UDP get, region pools, mcrouter topology—name "they also split pools by workload and replicate hot keys" and leave the rest for a deep dive.

Semantic cache, GPTCache, embedding nearest-neighbor are **not this paper, and not this chapter**—one line: **Ch32**.`,
    },
    {
      id: "sec-used",
      headingEn: "Which design problems use this",
      bodyEn: `Do the spine problems first; jump into this chapter when you get stuck. The back-links are not "finish M6 before you start writing." Short URL and Feed already have their product hard parts in those cases; here we only recycle **the cache / CDN one-liner**.

| Chapter | The one line you'll use |
|---|---|
| **Ch02** scale | Read path: cache first, then CDN; don't draw a global edge on step one |
| **Ch09** short URL | Read-heavy write-light → Aside; hot codes L1+L2; **don't long-cache 302 on the CDN**; stampede coalesces origin |
| **Ch11** Feed | timeline / hydrate is app cache; media URLs go to CDN, you don't design PoPs on this problem; celebrities are hot keys |
| **Ch13** search | Autocomplete and hot queries can be cached; the inverted index itself is not an authority Redis can replace |
| **Ch14** video | **HTTP edge + chunking** live in that chapter; this chapter only supplies shield / cache key / SWR vocabulary |
| **Ch16** comments | Counts and hot-thread floors are Aside; deleting a post needs invalidation, don't rely on a long TTL alone |
| **Ch22** object | Blobs live in object storage; CDN caches GET bytes, not a second storage system |
| **Ch32** LLM gateway | **exact cache** is the default; semantic-cache correctness vs hit rate lives in that chapter; don't re-teach it here |

Chat, notifications, orders: sessions and unread counts can be cached; **authority for balances and inventory decrement** still lives in the DB / ledger (Ch18 / Ch24). Split by data. Don't run the whole site on one Redis as a database.`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs notes / the original book",
      bodyEn: `<details>
<summary>How the book / notes taught it then · six-policy encyclopedias and cloud shopping go here</summary>

The notes map to the AWS book's cache chapter: a long eviction table, six read/write policies, in-process / inter-process / remote, Push/Pull CDN, Memcached vs Redis comparison, then patches for penetration / breakdown / avalanche, Valkey, edge Workers, semantic cache, delayed double-delete. **That is not this chapter's body.** In 2026 you walk in with Aside as the default, three lines for the three failures, and three CDN points.

| Book / notes | How you answer now |
|---|---|
| Six policies as a table of contents (aside / through / around / back / read-through / refresh-ahead) | **Cache-Aside default**; Through / Back as trade-offs; the rest get one line |
| Penetration / breakdown / avalanche missing from the book, notes treat them as a 2026 patch | **Fixed three-question chain in Chinese interviews**; the body has to know how to open them |
| Long Memcached vs Redis table + license / Valkey as the main story | One selection line; **no flame war**; the lookaside classic is still the Memcache paper |
| CloudFront / ElastiCache / someone's Workers catalog | **HTTP edge + remote KV** as mechanisms, not a shopping list |
| CDN only as static, or edge compute as the spine | This chapter is **edge HTTP cache**; Workers is not the hard part |
| Semantic cache / GPTCache / embedding hits | **One line: Ch32** |
| Delayed double-delete / CAN / CDC as the only correct answer | Aside = write DB then **DEL** + TTL; lease / single-flight stop stale set and stampede |
| Belady / FIFO / MRU / ARC encyclopedia | LRU is enough to open; in-process W-TinyLFU is optional |
| "2026 you must pick Valkey" | A protocol-compatible remote cache is enough; don't treat a license as a system-design answer |

The body's first answer is this 2026 set. The fold only stops you from putting the policy encyclopedia and the cloud catalog on the board.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **Default policy?** → Cache-Aside. Not all three.
2. **After an Aside write, why delete the cache instead of updating it?** → Stop a slow read from SETting the old value back. Next beat miss-fills. TTL caps a missed delete.
3. **Who is authoritative, DB or cache?** → Under Aside, **the DB is the source of truth**.
4. **Through vs Aside?** → Through sync dual-writes on the write path, reads hit more often; writes are slower; still not a distributed transaction.
5. **Write-Back loses data—then what?** → Admit the loss first. Use it only if loss is OK. Need durability? Don't use Back, or accept the RPO.
6. **Penetration vs breakdown?** → Penetration: the key never existed. Breakdown: a hot key exists but expired, stampede back to origin.
7. **Is changing TTL enough for avalanche?** → Jitter covers expire-together. Cluster down still needs rate limit / degrade / replicas.
8. **Why TTL jitter?** → Same batch of keys, same expiry → miss together. Add randomness to spread it.
9. **single-flight vs a distributed lock?** → Coalesce in-process first; short lock across processes. A lock is not the answer to penetration.
10. **Why replica a hot key?** → One shard's CPU / NIC is the bottleneck. Copy the hot key, spread the reads.
11. **Does CDN replace Redis?** → No. Edge is HTTP; Redis is application objects.
12. **Wrong cache key—what happens?** → Leak across users, or hit rate turns to dust. Don't put \`utm_\` in the key; don't share private responses.
13. **What does origin shield do?** → Collapse misses from many edges into a few origin fetches; stop an origin stampede.
14. **Which paper is stale-while-revalidate?** → RFC 5861. Serve stale, then refresh. Origin down relies on stale-if-error.
15. **Can short-URL 302 live on the CDN?** → Don't long-cache it, or it becomes a de facto 301 and Ch09 Analytics is gone.
16. **Facebook Memcache interview one-liner?** → demand-filled lookaside; leased get stops herd and stale set.
17. **Semantic cache?** → **Ch32**. This chapter does not cover embedding cache.
18. **Why is load balancing next?** → Cache solves the hot read path; stateless + LB solves horizontal scale (**Ch39**).`,
    },
    {
      id: "sec-next",
      headingEn: "What's next",
      bodyEn: `Close the page and walk it in 20 seconds: Aside default, DB is authority, TTL + delete after write; penetration empty-value/bloom, breakdown single-flight, avalanche jitter; CDN is Client → Edge → Origin, name cache key / shield / SWR. If you can drop short-URL 302, Feed media, and LLM cache back onto Ch09 / Ch11 / Ch32, this chapter is done.

Next is **Ch39 · Load balancing & stateless**: L4 / L7, sessions, Maglev vs consistent-hash LB. Cache makes one box read fast; stateless lets you add machines. Together they are the "web can scale out" link on Ch02's growth chain. The Maglev paper lives over there; don't open it early.

Self-check: left column, three hard-part lines; middle, Aside read-miss sequence; right, one default line each for the three failures. Don't recite cloud SKUs and six policies back.`,
    },
  ],
  reviewMdEn: `# Ch38 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | How do you open in 20 seconds? | Read-heavy write-light defaults to Cache-Aside; DB is authority; DEL after write + TTL. Through/Back are trade-offs. Penetration: empty value/bloom; breakdown: single-flight; avalanche: TTL jitter. CDN: cache key / shield / SWR. Semantic cache Ch32. |
| 2 | Three hard parts? | ① Aside vs Through vs Back ② How to open penetration / breakdown / avalanche ③ What CDN does on the HTTP read path. |
| 3 | Why is Cache-Aside the default? | The app owns miss; only requested keys are cached; if the cache dies, reads are still correct (just slower). lookaside = lazy load. |
| 4 | Under Aside, who is the source of truth? | **DB**. Cache is allowed to be stale. TTL + invalidation on write. |
| 5 | After a write, why delete instead of updating the cache? | A slow request may SET the old value back. Delete, next beat fills. |
| 6 | Write-Through in one line? | Sync-write cache and DB. Fresh reads, slower writes; dual-write failure still has to be handled. |
| 7 | Write-Back in one line? | Write the cache first, flush the DB async. High throughput, **you can lose data**. Only for counters you can lose. |
| 8 | Penetration vs breakdown vs avalanche? | A key that never existed; **one** hot key expires (stampede); **a batch** expire together or the cache dies. |
| 9 | Penetration default? | negative cache (empty value, short TTL) or bloom. Bloom "not in" has no false negatives. |
| 10 | Breakdown default? | single-flight / a short lock, only one goes back to origin; if stale is OK, logical expiry. Hot keys **replica**. |
| 11 | Avalanche default? | TTL jitter. Cluster down still needs rate limit/degrade, not just a TTL change. |
| 12 | In-process vs Redis? | Local is microseconds, not shared, hard to invalidate. Remote is cross-instance, has RTT. L1 only blocks the extra-hot. |
| 13 | How do you draw the CDN read path? | Client → Edge → (Shield) → Origin. Hit stops at the edge. |
| 14 | Wrong cache key? | Miss Vary/login state → leak across users; utm in the key → shards to dust. Don't share private responses. |
| 15 | origin shield? | Collapse misses from each edge, protect origin—stampede control. |
| 16 | stale-while-revalidate? | RFC 5861: after expiry, serve stale first, revalidate in the background. stale-if-error covers origin errors. |
| 17 | Short-URL 302 and CDN? | Don't long-cache 302 (Ch09), or it becomes a de facto 301 and Analytics is lost. |
| 18 | Memcache NSDI 2013 one-liner? | demand-filled lookaside; leased get stops stale set and thundering herd; can serve stale. |
| 19 | Where is semantic cache taught? | **Ch32**. This chapter does not cover embedding cache. |
| 20 | Video / blob? | Storage and playback **Ch14 / Ch22**. This chapter only supplies HTTP-edge vocabulary. |`,
});
