import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch23",
  titleEn: "Game leaderboard",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 50–60 min ｜ **Prereq**: storage Ch37; cache Ch38
> **Goal**: ZSET leaderboard, sharding, write hotspots and your own rank. Not a warehouse, not recs.

Object storage finished "massive immutable bytes"; this prompt swaps in **how massive scores stay ordered in real time**. Default is mobile / esports **global or season top N + around-me**. Not recs, not a social Feed, not a general analytics warehouse. The interviewer is not scoring whether you can draw Flink streaming + friend recs + some game's public DAU. They want: **Redis Sorted Set as the whiteboard default, how you break ties, how you split keys across boards, no SCAN on a hot key, your own rank via ZRANK.**

It looks like: match ends, score goes on the board. The hard parts are the ordered structure, sharding multiple boards, and "on that hot key, still read where I rank."`,
    },
    {
      id: "sec-answer",
      headingEn: "How to answer in the interview",
      bodyEn: `**Opening 30 seconds (say it out loud):**

> "Leaderboard has three hard parts: ZSET model (score, ties, top-K), shard by board, write hotspot plus your own rank. I'll confirm this is a game score board, not recs and not a warehouse. Scale is a teaching assumption of tens of millions DAU: writes are a hotspot; top-N can be cached. Architecture: client → board API → Redis ZSET (hot) + DB write-behind (backing store). Updates use **ZADD**; ties use a composite score or a member suffix—do not rely on player-id lexicographic order. Multiple boards split keys by **leaderboard id / season / region**—do not one ZSET for the whole game forever. around-me is **ZRANK + ZRANGE**. No SCAN."

Then walk the 4 steps. Do not lead with a kitchen-sink diagram or reciting cloud SKUs.

${D2}

| Time-box | What you are doing |
|---|---|
| 3–10 min | Clarify: score board vs recs, server-authoritative score, season/region, top-N + around-me, ties |
| Next 2 min | back-of-envelope: write QPS; top-N can be cached; one board is GB-class memory |
| 10–15 min | High-level: client → API → Redis ZSET + DB persist |
| 10–25 min | deep dive: ZADD / ties / top-K, shard by board, hot key + ZRANK |
| 3–5 min | wrap-up: 3 bottlenecks (single-key write hotspot, SQL for rank, SCAN to find yourself) |

**red flag:** drawing a recs funnel / Flink warehouse before asking scope; one ZSET for every game and every season; \`ORDER BY score\` as live rank; SCAN for around-me; pretending Redis ranks by "who got there first" without talking ties. That is over-engineering, or dragging the storage / analytics chapters in whole.`,
    },
    {
      id: "sec-clarify",
      headingEn: "Clarifying questions",
      bodyEn: `Drawing before you clarify = Jimmy. On this prompt, stop at 5–7 questions; assume the rest and write the board. **The first question must be scope.**

| You ask | Typical answer / your assumption | What it changes |
|---|---|---|
| Score board or recs / Feed? | **Game score leaderboard** (global or season top N + around-me) | not two-tower, not a follow graph, not a warehouse |
| Who computes the score? | **Server-authoritative** (game server validates, then writes the board) | client-reported scores are a cheat surface |
| Absolute score or cumulative? | Pick one on the board | overwrite → **ZADD**; accumulate → \`ZINCRBY\` |
| How many boards? | **Global + season**; region optional | keys split by board, not one immortal ZSET |
| Which reads? | **top-N + your own rank + around-me** | ZRANGE / ZRANK; no SCAN |
| How do ties rank? | **First to achieve ranks higher** (composite score) | do not default to player-id lexicographic order |
| Rough DAU? | Teaching: **~10 million** | used to size writes and memory, not some game's internal number |

When they say "you decide," write the assumptions:

> "I'll assume: default game score board, not recs. Server validates then ZADD. Global board + season board; Redis keys split by \`game/season/region\`. Reads are top-N and around-me. Ties: score plus reverse timestamp. I'll draw on that—cut me off if it's wrong."

If they chase friends / guild boards: **acknowledge the difference, then close it.** "A friends board is a small set; another ZSET or filter at read time. This loop's mainline is the public season board." Real-time push / WebSocket: a short TTL cache on top-N is enough; push is not the hard part. Asking past 10 minutes is also a red flag. The golden line is still: **ask the key questions → state your own assumptions → write the board → move.**`,
    },
    {
      id: "sec-estimate",
      headingEn: "Back-of-the-envelope",
      bodyEn: `Formulas live in Ch03. Here you only need order of magnitude: prove you know **this prompt's bottleneck is score writes punching the same board's hot key, and "where do I rank" cannot scan the whole table.** Whiteboard **teaching assumptions** below—not some company's internal numbers, and not some game's public DAU as your own fact.

Assume about **10 million DAU**; each player ~**5** score updates/day and ~**3** leaderboard opens (one top-N, maybe around-me as well).

| Item | How you estimate | Order of magnitude (teaching) |
|---|---|---|
| Write QPS | 1e7 × 5 / 86400 | **~6e2**; peak ×5 is still **thousands** |
| Read QPS | 1e7 × 3 / 86400 | **~3e2**; peak ~**2e3**; top-N is highly repeated |
| Members on one board | a season's active entries | **tens of millions**; split by board, do not pile all history into one |
| Memory | ~100–150 B per member (skip list + hash overhead) | 20 million members on one board **~2–3 GB**; a single box often fits; what splits first is the hot key |
| SQL for rank | \`COUNT(*) WHERE score > ?\` | under frequent writes this is an **O(N) scan**, not a live answer |

Writes look like "only a thousand QPS." What is expensive is **a thousand QPS on the same Redis key** (one hot season), and **everyone needs their own rank** (a cached global top-100 does not answer that). top-N reads can take a short TTL; around-me must land on that person.

**Interview line:**

> "Tens of millions DAU on the board: writes hundreds/day-mean, peak thousands; what I fear is punching one season ZSET. top-N can be cached; your own rank is ZRANK. Memory is members × ~100 bytes, GB-class. I will not treat some game's public peak as an internal number."

Common mistakes: treating a game's marketed DAU as your own fact QPS; or only quoting top-10 reads and pretending "where do I rank" is free. Teaching uses order of magnitude, and you **label the assumptions**.`,
    },
    {
      id: "sec-arch",
      headingEn: "High-level architecture",
      bodyEn: `Left to right, draw only **one write/read control plane**: Client → Board API → Redis ZSET (hot path) + DB (durable backing store). Do not fan out Flink, recs, or multi-Region on this diagram. Score authority lives in the API after the game server validates; ZSET is the ordered hot view (Ch38); DB is recovery and cold reads (Ch37). After they buy in, split ties and sharding.

${D2}

**This diagram cites**: Ch38 Cache & CDN · Ch37 Storage choices

**Why server-authoritative scores:** a client that reports its own score can be proxied and rewritten. Whiteboard default: the match settles on the game server → call board API \`ZADD\`. Server-authoritative gameplay (the server already knows who won) may not even need the client to call "add score." Anti-cheat: one sentence, then stop—do not turn this into a security chapter.

**schema (stop when it's enough):** Redis key e.g. \`lb:{game}:{season}:{region}\`, member = \`player_id\`, score = composite. DB stores \`player_id, board_id, score, updated_at\` for rebuild. Display name / avatar do not go in the ZSET; hydrate after you read top-N. Do not draw five wide tables on the board.

**Write path:** API auth + validate the match is legal → \`ZADD\` the hot ZSET → 200; score **write-behind** into the DB (or batch on a short interval). **Do not** run warehouse jobs on the request thread. Cumulative points use \`ZINCRBY\`; "this match's high score / overwrite total" uses ZADD.

**Read path:** top-N: \`ZRANGE 0 N-1 REV WITHSCORES\` (Redis 6.2+; the old name \`ZREVRANGE\` is still fine to say). Your own rank: \`ZRANK member REV\`. Nearby: rank ± k then \`ZRANGE\`. top-N can take a few seconds of cache; personal rank hits Redis by default.

Need an MQ? If the score **only serves this board** → no. Push / analytics then go on a queue—analytics is not this chapter; mention and stop.

Stop the high-level diagram here. Ask: "Does this direction look OK? Next I'll dig into how the ZSET is modeled, then multiple boards and sharding, then write hotspots and your own rank."

**Interview line:**

> "The hot path is a Redis Sorted Set. Behind the API: ZADD / ZRANGE / ZRANK. The DB is only the backing store and recovery—not live \`ORDER BY\`. Split keys by season."`,
    },
    {
      id: "sec-zset",
      headingEn: "Deep dive · ZSET model (score, ties, top-K)",
      bodyEn: `First hard part. **A leaderboard needs: unique members, ordered by score, in the right place the moment you insert, and O(log N) rank for any member.** A relational \`score\` table can store it, but live rank is not something \`ORDER BY\` gives you for free. 2026 whiteboard default: **Redis Sorted Set** (hash table + skip list): \`ZADD\` O(log N), \`ZRANGE\` O(log N + K), \`ZRANK\` O(log N), because skip-list nodes carry span—rank is a sum along the path, not a full-table scan.

${D2}

**This diagram cites**: Ch38 Cache & CDN

| | Relational \`ORDER BY\` | Redis ZSET (**default**) |
|---|---|---|
| Write score | UPDATE one row; indexes thrash | \`ZADD\` reorders in place, O(log N) |
| top-K | \`LIMIT K\` is OK, still eats write thrash | \`ZRANGE 0 K-1 REV\` |
| Anyone's rank | \`COUNT(*) WHERE score>\` near O(N) | **ZRANK** O(log N) |
| Interview | for contrast, not the live answer | **2026 first answer** |

Redis 6.2+ unifies on \`ZRANGE … REV\`, \`ZRANK … REV\`; \`ZREVRANGE\` / \`ZREVRANK\` are still fine to say—do not spend time on command aliases. member must be unique: another \`ZADD\` for the same player updates the score; you do not get two rows.

**Ties:** on equal scores Redis **orders by member string lexicographically** (reversed under \`REV\`). **Not** insertion order, and **not** "who got there first." Letting player id be the tie-break is a product accident. Whiteboard default: **encode the tie-break into the score**: \`composite = score * scale + (MAX_TS - achieved_at)\`, so the first to achieve sits slightly higher. Watch IEEE 754 integer precision to 2^53: size scale and the timestamp so you do not blow both ends. Alternative: member as \`playerId#seq\`, ties fall to lexicographic order. Reading a side Hash in the app to compare time is an extra round trip and you still have to align under concurrency—worse than one composite key.

**dense vs skip:** one sentence for display—dense is 1,1,2 (no gap after a tie), skip is 1,1,3. \`ZRANK\` gives a unique 0-based index; tie display is a product layer. Do not pretend Redis will pick for you.

${D2}

top-N is a small head: lots of reads, relatively slow to change, **can take a short TTL cache** (even \`ZRANGESTORE\` to materialize a head). around-me must locate this person first, then slice ±k. **No SCAN of the whole set.** Do not draw "nearby" as a traversal.

**Interview line:**

> "ZSET is the default. ZADD to write, ZRANGE for top-K, ZRANK for yourself. Ties go into the score or a member suffix. Say dense vs skip in one sentence. around-me: no SCAN."

trade-off: a composite score buys one sort and one fewer read, but you must stay inside float precision; parking the timestamp in a side Hash complicates the read path. SQL as an authoritative archive is fine; as a live rank engine it is not—the hotter the writes, the more ORDER BY thrashes.`,
    },
    {
      id: "sec-shard",
      headingEn: "Deep dive · Sharding and multiple boards",
      bodyEn: `Second hard part. **The first cut on scale is not slicing one global ZSET into ten score bands—it is not stuffing every game, every season, every region into the same key.** 2026 default: one Sorted Set per board; the key carries **leaderboard id / season / region**. Old seasons TTL or archive to the DB; do not let historical members live forever in hot Redis.

${D2}

**This diagram cites**: Ch37 Storage choices · Ch38 Cache & CDN

Once you split by board, writes naturally land on different Redis keys (and different slots on Cluster). Global, season, and region boards are **multiple views**: one match can ZADD two or three times (global + this season). Do not invent a "universal set" and filter on every read. A friends board is a small set; another key or filter at read time—this loop does not unpack a social graph.

When a single board is still too big / too hot, then talk about **cutting inside that board**. Both common schemes have a trade-off; do not pretend the board has only one:

| | Split by board / season / region (**do this first**) | Hash-shard by player | Score-band shards |
|---|---|---|---|
| top-K | hit that board's ZSET | take K from each shard then merge (scatter-gather) | the head usually sits in the highest band |
| Your own rank | **ZRANK once** | cross-shard \`ZCOUNT\` or approximate | local rank + \`ZCARD\` of higher bands |
| Writes | hit the matching key | spread by user; one board's writes fan out | a score change may migrate across bands |
| Pitfall | a hot season can still be a single-key hotspot | exact global rank gets expensive | skewed scores hotspot the high bands |
| Interview | **2026 first cut** | only after one board's writes explode | the book loves this; now it is the second cut |

Hash by player: writes are easy; reading top-K fans out. **Exact "Nth place" means counting, on every shard, how many people beat you**—at scale you often switch to "exact at the head, percentile in the tail." That is a product call, not silently dropping ZRANK. Score bands: top-K looks nice; a member moving up must delete-old + add-new, plus a user→score route. **Split by board first**; most interview scales stop there. Only then materialize a small head ZSET for top-N reads, so you do not scatter-gather every time.

Do not pull in Flink windows and an offline warehouse to get "globally exact rank 1,200,001." That is an analytics prompt. This loop's DB is only the **backing store for the hot ZSET** (Ch37), not a second live pipeline.

**Interview line:**

> "Split ZSETs by game, season, region first; expire old seasons. Hash or score bands only after one board is still hot. top-N can materialize a head. Do not pile every game into one key."

trade-off: multiple keys buy isolation and expiry; the cost is one match may write several boards. Hashing players spreads writes and complicates rank. Score bands give the head locality; migration and skew are new bottlenecks. One immortal global ZSET looks cheap until the season ends and you cannot delete, and writes still punch the same lock.`,
    },
    {
      id: "sec-hot",
      headingEn: "Deep dive · Write hotspots and your own rank",
      bodyEn: `Third hard part. That hot-season key is a **write hotspot**: every \`ZADD\` enters the same Sorted Set, and on Cluster it still lands on the same slot. Reads split two ways—top-N can sit behind a cache; **your own rank must locate this member**. No SCAN, and a cached top-100 does not answer "I am rank 40,000."

${D2}

**This diagram cites**: Ch38 Cache & CDN · Ch37 Storage choices

${D2}

Write path: the same player updating in a burst can **coalesce to the last ZADD** (last-write is enough; a leaderboard is not a ledger). Do not synchronously hit Redis for every combat log. Read top-N: local LRU or Redis short TTL, coalesce stampedes on the origin (Ch38). Personal rank: \`ZRANK\` hits the primary; a replica is eventually consistent, so reading yourself right after a write may be off by one—if that is OK, read the replica; if not, read the primary.

**Persistence is a trade-off, not buying another warehouse.** Redis is the hot view: replica failover covers a node death. If the process is gone entirely, you rebuild from the backing store.

| | Redis as the only truth | Hot ZSET + DB write-behind (**default**) |
|---|---|---|
| Write latency | AOF always drags ZADD | API ZADDs first, then async persist |
| Loss window | AOF everysec can still lose a second | crash before flush drops a slice of increment |
| Recovery | wait on RDB/AOF | rebuild that board with \`ZADD\` from the DB's latest scores |
| Interview | fine for a small board | **hot + backing store**; admit the window |

Rebuild by **pouring the current score snapshot** back into the ZSET. Do not replay "every match +1" unless you really treat the stream as a ledger—that is a payments prompt (Ch24), not a leaderboard. AOF / a short interval only shrink the window; they are not as durable as synchronous dual-write.

**Interview line:**

> "A hot season is a single-key write. Split by board first; short-cache top-N. Your own rank is ZRANK, then ZRANGE for nearby. Redis hot, DB backing store, accept a brief loss window. No SCAN."

trade-off: write-behind buys write latency; you accept loss and "after restart the board takes a few minutes to rebuild." Sync-transaction every ZADD into the DB turns the hot path into a relational-DB prompt. Global multi-Region CRDT on one key is over-engineering—this loop is done with a single-Region hot board + split keys.`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs the book",
      bodyEn: `<details>
<summary>How the book / notes told it then (not the first answer)</summary>

Xu explained clearly why relational \`ORDER BY\` cannot hold, that ZSET = hash + skip list, \`ZADD\` / range reads / personal rank, and "too big → shard." Those mechanics still hold. What aged is treating **5M DAU on one box, 500M before you cut by score band** as the only scale story, and treating cloud SKUs, Dragonfly multipliers, and Flink / t-digest warehouses from the notes as the first answer.

| Book or notes | How you answer now |
|---|---|
| One Redis holds "the book's DAU"; shard only when bigger | **Split keys by board / season / region first**; not one immortal ZSET for the whole game |
| Fixed score bands vs hash scatter-gather as the first cut | Multi-board sharding is the default; score bands or a materialized head only after one board is still hot |
| Script locked to \`ZINCRBY\` + \`ZREVRANGE\` | Overwrite totals with **ZADD**; Redis 6.2+ **ZRANGE REV / ZRANK REV** |
| Store ties in a Hash and sort twice | **Composite score or member suffix**—one sort |
| On crash, replay every win with \`ZINCRBY\` | **Current-score snapshot** write-behind backfill; a ledger is a payments prompt |
| At scale only percentile / lookup-table silver bullets | **ZRANK** first; approximate only in the tail. Not a percentile chapter |
| Lambda + managed Redis inventory as architecture | Whiteboard is ZSET + DB backing store; **do not recite cloud SKUs** |
| Client poll vs must-have WS push | Short-cache top-N is enough; push is not the hard part |
| Real-time warehouse / Flink updating the board | **Not this prompt** |

Still-valid skeleton: server-authoritative scores, ZSET complexity, top-K and personal rank, replica failover. Outdated is treating "one global ZSET + score bands" as the only scale path, and making the analytics stack or a product SKU list the mainline.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **"Score board or recs?"** → Default game score board. Recs / Feed / warehouse are other prompts.
2. **"Why can't the client report the score?"** → Tamperable. Game server settles, then ZADD.
3. **"Why not SQL ORDER BY?"** → Under hot writes, rank is near a full-table count. ZSET's ZRANK is O(log N).
4. **"ZADD or ZINCRBY?"** → Overwrite / high score → ZADD; accumulate → ZINCRBY. Do not only know one.
5. **"Who ranks higher on a tie?"** → Redis defaults to lexicographic order. Encode "first to achieve" with a composite score or member suffix.
6. **"dense or skip?"** → One product sentence. ZRANK is a unique index; tie display is the presentation layer.
7. **"How do you query around-me?"** → ZRANK then ZRANGE ±k. **No SCAN.**
8. **"One ZSET for the whole world?"** → Split by \`game/season/region\`. TTL old seasons.
9. **"Is hashing players good?"** → Spreads writes; top-K needs a merge; exact rank gets expensive. Split by board first.
10. **"Redis dies, board is gone?"** → Hot view + DB backing store to rebuild. Admit the write-behind window.
11. **"Need Flink?"** → No. This is not a streaming-warehouse chapter.
12. **The final diagram is already huge and they keep stacking?** → Recs, cross-region CRDT, cloud SKUs, a percentile lecture are not this chapter. Three hard parts spoken clearly scores higher than 20 boxes.`,
    },
    {
      id: "sec-next",
      headingEn: "Wrap-up and what's next",
      bodyEn: `Wrap-up never says perfect. Three bottlenecks out loud:

| bottleneck | How you take it |
|---|---|
| Single-key write hotspot / immortal global ZSET | Split keys by board, season, region; short-cache top-N |
| SQL live rank | Redis ZSET; ZADD + ZRANK; do not put \`ORDER BY\` on the hot path |
| SCAN to find yourself / no backing store | around-me = ZRANK + ZRANGE; DB write-behind to rebuild |

Self-check: close this page. 30-second opening + high-level on the board; walk ZSET ties, shard-by-board, ZRANK not SCAN to the air. Wherever you stumble, come back to that section. Warehouse and recs: mention and stop.

Next problem is **Ch24 · Payment system**. A leaderboard allows brief inaccuracy and a loss window; payments flip it: **correctness beats QPS**—ledger, idempotency keys, reconciliation—from "ordered in memory" to "not one cent wrong."`,
    },
  ],
  reviewMdEn: `# Ch23 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | Three hard parts of a leaderboard? | ZSET model (score, ties, top-K); shard by board; write hotspot + your own rank. Not a warehouse, not recs. |
| 2 | Default scope? | **Game score board**: global/season top N + around-me. Not a Feed, not recs. |
| 3 | Whiteboard default data structure? | Redis **Sorted Set**. \`ZADD\` / \`ZRANGE REV\` / \`ZRANK REV\`. |
| 4 | Why not SQL for rank? | Under hot writes, \`COUNT/ORDER BY\` is near a full table. ZSET rank is O(log N). |
| 5 | How do you break ties? | Composite score or member suffix. **Do not** default to player-id lexicographic order. |
| 6 | dense vs skip? | One presentation sentence: 1,1,2 or 1,1,3. ZRANK is a unique index. |
| 7 | around-me? | **ZRANK then ZRANGE ±k**. No SCAN. |
| 8 | How do you shard? | **Split keys by leaderboard id / season / region**. Not one immortal global ZSET. |
| 9 | Hash by player? | Spreads writes; top-K scatter-gather; exact rank is expensive. Split by board first. |
| 10 | How do you absorb a hot key? | Spread writes across boards; short-cache top-N; personal rank hits ZRANK. |
| 11 | Redis and the DB? | Redis **hot**; DB **write-behind backing store** for recovery. Admit the loss window. |
| 12 | Biggest over-engineering on this prompt? | Flink warehouse, recs funnel, cloud SKUs, one ZSET for every game. Speak the three hard parts. |`,
});
