import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch16",
  titleEn: "Design a comment system",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 50–60 min ｜ **Prereq**: cache Ch38; messaging Ch42
> **Goal**: nested comments, counters, moderation queue, hot posts, cursor pagination. Anti-spam as a callout only.

Comments are the eighth full case. Cloud drive finished "how files stay consistent"; this one swaps in **how discussion hangs off a single post**. Default is **nested comments under a post**—Twitter / YouTube / a news site—not a social graph, not DMs. The interviewer is not scoring whether you can draw an anti-spam ML chapter + unbounded nested trees + some company's comment QPS. They want: **how nested comments are stored and read, likes that do not lock a row, hot posts that do not reload the whole tree, cursor pagination on the top-level list, and a write path into a moderation queue.**

The system looks like type a sentence, get a reply. The hard parts are schema and read fan-out, counters and hot keys, pagination and visibility.`,
    },
    {
      id: "sec-answer",
      headingEn: "How to answer in the interview",
      bodyEn: `**Opening 30 seconds (say it out loud):**

> "Comments have three hard parts: nested-comment schema and read fan-out, counters plus hot posts, and cursor pagination plus a moderation queue. I'll confirm nested comments under a post, not a social graph. Scale from a teaching assumption of ~10 million DAU: write QPS is small; reads and likes are the hotspot. Architecture: client → comment API → DB (\`parent_id\`) + cache. Top-level list is **cursor, not offset**. Likes are Redis \`INCR\`, periodic flush, no row lock. Hot posts cache the first N trees plus lazy-load replies. Writes go into a moderation queue (pre-publish or post-publish—both need a state machine). Anti-spam is rate limit plus enqueue; I won't unpack a model."

Then walk the 4 steps. Do not draw the final diagram first.

${D2}

| Time-box | What you are doing |
|---|---|
| 3–10 min | Clarify: nested under a post vs social graph, two-level threads, moderation, likes, pagination |
| Next 2 min | back-of-envelope: write QPS is small; reads and likes; Zipf on a single post |
| 10–15 min | High-level: client → comment API → DB + cache; moderation on MQ |
| 10–25 min | deep dive: \`parent_id\` + lazy load, Redis counters / hot posts, cursor + moderation queue |
| 3–5 min | wrap-up: 3 bottlenecks (hot-post reads, like row locks, deep offset pages) |

**red flag:** drawing follow graphs / DMs before asking scope; nested set as the comment default; \`LIMIT/OFFSET\` on the top-level list; \`SELECT FOR UPDATE\` on every like; fetching the whole tree in one shot; turning anti-spam into an ML chapter. That is over-engineering, or dragging Feed / recommenders / trust-and-safety into this prompt.`,
    },
    {
      id: "sec-clarify",
      headingEn: "Clarifying questions",
      bodyEn: `Drawing before you clarify = Jimmy. On comments, stop at 5–7 questions; assume the rest and write the board. **The first question must be scope.**

| You ask | Typical answer / your assumption | What it changes |
|---|---|---|
| Nested under a post, or a social graph? | **Nested under a post** (Twitter / YouTube / news) | store and shard by \`post_id\`; not follower fan-out |
| Unbounded indent, or two-level threads? | **Store \`parent_id\`, display two levels flattened** | replies hang under a top-level comment, "A replies @B" |
| Pre-publish or post-publish moderation? | Both are valid; pick one on the board | state machine + moderation queue (Ch42) |
| Likes / reply counts? | **Yes**; near-realtime is enough | Redis counters, no row lock |
| How do you paginate? | **cursor** | no offset |
| About how many DAU? | Teaching: **~10 million** | sizes reads/writes and hot posts, not some company's internal number |

When they say "you decide," write the assumptions:

> "I'll assume: default nested comments under a post, not a social network. Store \`parent_id\` plus optional \`root_id\`; UI is two levels flattened. Top-level list is cursor. Likes go through Redis, periodic flush to DB. Writes enter a moderation queue. Anti-spam is rate limit plus enqueue. I'll draw on that—cut me off if it's wrong."

If they chase unbounded depth or a social graph: **acknowledge the difference, then close it.** "Unbounded indent blows read fan-out; products like YouTube / Twitter are two-level on mobile too. A social graph is a Feed prompt; this loop is the comment tree on one post." Asking past 10 minutes is also a red flag. The golden line is still: **ask the key questions → state your own assumptions → write the board → move.**`,
    },
    {
      id: "sec-estimate",
      headingEn: "Back-of-the-envelope",
      bodyEn: `Formulas live in Ch03. Here you only need order of magnitude: prove you know **this prompt's bottleneck is hot-post reads and like writes, not "national comment-write QPS."** Whiteboard **teaching assumptions** below—not some company's internal numbers, and not the real peak of some trending post.

Assume about **10 million DAU**; ~**2 comments** written per user per day, ~**10 likes**, ~**15** opens of a comment thread. Reads far exceed writes; a few posts eat most of the traffic (Zipf).

| Item | How you estimate | Order of magnitude (teaching) |
|---|---|---|
| Write QPS | 1e7 × 2 / 86400 | **~2e2**; peak ×5 is still thousands |
| Like QPS | 1e7 × 10 / 86400 | **~1e3**; peak ~**5e3** |
| Read-list QPS | 1e7 × 15 / 86400 | **~2e3**; peak ~**1e4** |
| Hot single post | reads follow Zipf | a few \`post_id\`s eat huge QPS → must cache; never rebuild the whole tree from DB each time |
| Storage | ~0.5–1 KB per comment; ~2e7 new rows/day | **~10–20 GB/day**; TB/year; shard by \`post_id\` (Ch41) |

Writes look cheap. What is expensive: **the same viral post being opened over and over** (read fan-out), and **the same hot comment being liked over and over** (if you lock the DB row every time, the counter itself becomes the bottleneck). Like volume is usually higher than writes; the counter path must be split from the comment INSERT.

**Interview line:**

> "10 million DAU on the board: writes are a few hundred QPS daily; reads and likes are thousands to tens of thousands. What actually hurts is Zipf on a single post—cache the first N plus lazy-load replies. Likes do not lock a row: Redis INCR then flush. I will not treat some trending-post peak as an internal number."

Common mistakes: importing some platform's public "peak comments" as your factual QPS; or only quoting writes and pretending the read path is free. Teaching uses order of magnitude, and you **label the assumptions**.`,
    },
    {
      id: "sec-arch",
      headingEn: "High-level architecture",
      bodyEn: `Left to right, draw only **one shared write/read control plane**: Client → Comment API → DB + Cache. Do not fan out a social graph, an anti-spam model, or multi-Region on this diagram. Comment bodies go to a relational store (shard by \`post_id\`, Ch41); hot lists and counters go to cache (Ch38); moderation goes on MQ (Ch42). After they buy in, split nested comments and counters.

${D2}

**This diagram cites**: Ch38 Cache & CDN · Ch41 Replication, sharding, transactions · Ch42 Messaging, resilience

**schema (enough, then stop):** \`comment\` (id, post_id, parent_id, root_id, author_id, body, status, created_at); counters are not an authoritative row-lock field on every like—\`like_count\` / \`reply_count\` are Redis, flushed periodically. \`status\`: \`pending\` / \`visible\` / \`rejected\`. Indexes: top-level list \`(post_id, created_at, id)\` where \`parent_id IS NULL\`; replies \`(root_id, created_at, id)\` or \`(parent_id, created_at, id)\`. Do not draw five wide tables on the board.

**Write path:** API auth + rate limit (anti-spam callout: throttle by user / IP, reject over the cap, enqueue if suspicious) → INSERT (\`pending\` or \`visible\`, depending on moderation policy) → enqueue moderation → return 200. **Do not** run a model on the request thread. Likes: \`SET NX\` for "already liked" idempotency, then \`INCR\`, API returns immediately; flush is async.

**Read path:** hot posts hit cache first (first N top-level + first K replies each); miss then hits DB by cursor. Do not load all replies in one shot. Delete / moderation reject: flip status, delete the cache key or short TTL; do not walk the whole tree to patch replicas.

Stop the high-level here. Ask: "Does this direction look OK? Next I'll dig into how nested comments are read, then counters and hot posts, then cursor and the moderation queue."

**Interview line:**

> "Comments land by post; \`parent_id\` is parent/child. Behind the API: DB + cache; moderation on a queue. Hot reads hit cache; cold data cursor back to DB. Likes do not take a row lock on this diagram."`,
    },
    {
      id: "sec-nested",
      headingEn: "Deep dive · nested-comment schema and read fan-out",
      bodyEn: `First hard part. **A comment tree is write-heavy and the read must be truncated**—not a category tree that almost never changes. 2026 default: **adjacency list \`parent_id\`**; product display is **two-level nested comments** (top-level + flattened replies, copy like "A replies @B"). You can store unbounded indent, but the read fan-out explodes—YouTube / Twitter do not unbounded-indent on mobile either.

${D2}

**This diagram cites**: Ch41 Replication, sharding, transactions

You have to size the read fan-out out loud: 20 top-level per page; if you recursively fetch every descendant under each, one hot comment can pull thousands of rows and the first screen times out. So **one page of top-level, replies return the first K plus \`reply_count\`, expand then cursor by parent / root.** Assemble one layer on the server; do not let the client N+1 every parent.

| | Adjacency list \`parent_id\` (**default**) | Materialized path | Nested set (lft/rgt) |
|---|---|---|---|
| Insert | **O(1)** one row | O(1) write path; moving a subtree rewrites descendants | insert rewrites a range; bad for comment trees |
| Direct children | \`WHERE parent_id=?\` on an index | also works; the win is subtrees | subtree is one range, writes too expensive |
| Whole subtree | recursive CTE or multiple queries; **not on first screen** | \`path LIKE 'root/%'\` | range is fast, still do not fetch the whole tree on first screen |
| Interview | **first answer for comments** | upgrade if you truly need "whole subtree" often | **static categories** only; on comments it is a red flag |

\`root_id\` is the accelerator for a two-level UI: every reply points at the same top-level comment, so "all replies in this thread" does not recurse \`parent_id\`. Depth still uses \`parent_id\` to restore the @ relationship. A closure table (ancestor closure) speeds arbitrary descendants, but for comments that is over-engineering—you do not need "the whole subtree of an arbitrary node" as the default read.

Shard key is **\`post_id\`** (Ch41): comments for one post live together; top-level cursor and reply queries are single-shard. Hashing by comment_id turns one page of top-level into scatter-gather—that is the wrong shard. Hot posts still hit a hot shard—so the next section uses cache to absorb reads, not a different shard key.

**Interview line:**

> "Store \`parent_id\`, display two levels. Top-level is cursor; replies lazy-load by parent or root, first K. No nested set. Shard by post_id."

trade-off: two-level flattening gives up "seeing the true indent depth" and buys an upper bound on the read path. Unbounded depth looks more "tree"; first-screen fan-out has no bound. Nested set / closure table for one \`LIKE path\` on a high-insert comment tree turns write amplification into a new bottleneck.`,
    },
    {
      id: "sec-counter",
      headingEn: "Deep dive · counters and hot posts",
      bodyEn: `Second hard part. Likes / reply counts are **high-QPS counters that can be briefly wrong**, not inventory. **Do not** \`SELECT … FOR UPDATE\` then \`like_count + 1\` on every like—a hot comment serializes that row into a bottleneck. 2026 default: **Redis \`INCR\` as the live counter, periodic flush to DB** (write-behind). "Already liked" uses \`SET NX\` (or a Redis SET plus async detail rows) for idempotency, so you do not double-count.

${D2}

**This diagram cites**: Ch38 Cache & CDN

Flush dirty keys / a Stream in batches: \`UPDATE … SET like_count = like_count + delta\`. The DB sees "once every few tens of seconds per hot comment," not thousands of row locks per second. A crash window can drop a slice of increments—likes allow that, inventory does not. AOF / a short interval only shrinks the window; it does not pretend you are as durable as a sync write. Reads display Redis; DB is the recovery and cold-read source of truth.

Hot posts are Zipf on the read path: the same \`post_id\` is opened over and over. **Do not rebuild the whole tree from origin every time.** Cache JSON for "first N top-level + first K replies each" (or an id list then hydrate—same pattern as Feed). Expanding replies and deep pages hit DB plus finer-grained cache. After a successful visible write, delete the key or short TTL; do not maintain a full in-memory tree that stays in sync with DB.

${D2}

| | Row-lock UPDATE counters | Redis INCR + flush (**default**) |
|---|---|---|
| Likes on a hot comment | row lock serializes, DB CPU saturates | \`INCR\` in memory; DB in batches |
| Consistency | strong, but likes do not need it | seconds of eventual consistency; dropping a small slice is OK |
| Reads | hit primary | GET the counter; lists hit the hot cache |
| Interview | red flag | **first answer in 2026** |

Hot keys: one more sentence is enough. A single comment's \`INCR\` usually fits in Redis; if one key's CPU saturates, shard and sum (Ch38). Local LRU absorbs viral reads on the same instance. Negative cache / singleflight merge origin fetches to stop a stampede. **Do not** turn counters into a "global multi-Region counter lecture."

**Interview line:**

> "Likes INCR, no row lock, periodic flush. Hot posts cache the first N trees, lazy-load replies. The full tree does not go into Redis. Counters can be briefly wrong."

trade-off: write-behind buys throughput; you accept a loss window and "the number jumps after a refresh." Making every like a row-locked transaction is over-engineering. Caching a million comments as one giant JSON blows memory and invalidation together—cache only the first-screen slice.`,
    },
    {
      id: "sec-cursor",
      headingEn: "Deep dive · cursor pagination and the moderation queue",
      bodyEn: `Third hard part. Top-level comments are infinite scroll while people are still posting. **Pagination must be cursor (keyset), not offset.** Moderation is visibility after the write, not a "safety" box you add later.

${D2}

| | offset (\`LIMIT 20 OFFSET n\`) | cursor / keyset (**default**) |
|---|---|---|
| Deep pages | OFFSET gets slower the farther you go; you still skip earlier rows | seek from \`(created_at, id)\` |
| Inserts while paging | next page duplicates or skips | anchored on the last row of the previous page; new comments only show in "latest" |
| Jump to page N | you can | **comment threads do not need page numbers** |
| Interview | **red flag** | **standard for the top-level list** |

Whiteboard: return an opaque cursor; the server decodes it to \`(created_at, id)\`. Next page: \`post_id=? AND parent_id IS NULL AND (created_at, id) < (?, ?) AND status='visible' ORDER BY created_at DESC, id DESC LIMIT 20\`. Timestamps collide—**id is the required tiebreaker**, or boundary rows skip or repeat. Composite index matches \`ORDER BY\`. Expanding replies is the same pattern, anchored on \`root_id\` or \`parent_id\`. First page has no cursor. Do not let the client pass \`page=3\`.

Writes must enter a **moderation queue** (Ch42); do not call a model synchronously from the API. Both policies need a named trade-off; pick one on the board and keep drawing:

| | Pre-publish | Post-publish |
|---|---|---|
| User | sees "in review" themselves; public sees nothing yet | on the wall immediately |
| Risk | delay, cold discussion | violations are briefly visible; you rely on takedown |
| Queue | worker flips to \`visible\` only on pass | worker flips to \`rejected\` + cache delete on reject |
| Fits | high-risk topics, new accounts | trusted authors, threads you want lively |

Common 2026 landing is **hybrid**: keywords / new users go pre-publish; everyone else post-publish with async machine review, humans only on uncertain. You do not have to draw a trust-and-safety platform, but the state machine must exist: \`pending → visible | rejected\`. Lists and cache **read only visible**.

${D2}

**This diagram cites**: Ch42 Messaging, resilience · Ch38 Cache & CDN

Queue is at-least-once: moderation results must be idempotent (the same comment_id passing twice is still visible). On backlog, keep writes succeeding and let review slow down—do not stall the API. Human queues only take machine-uncertain items; do not claim "every comment is human-reviewed" and still draw tens of thousands of QPS.

**Anti-spam as a callout only:** rate-limit the write path (user / IP / post) + enqueue moderation; duplicate body / links can be enqueue features. **Do not** unpack a classifier, graph features, or a captcha factory on this prompt—that is another problem, and over-engineering this loop.

**Interview line:**

> "Top-level list is a \`(time, id)\` cursor, not offset. Writes go pending into a queue, visible on pass; or visible first, async takedown. Anti-spam is rate limit plus queue."

trade-off: cursor cannot jump to "page 50"; comment threads are scroll anyway. Pre-publish is safer and colder; post-publish is livelier and you need fast takedown plus cache delete. Drawing moderation as a sync RPC lets downstream wreck your p99.`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs no dedicated book",
      bodyEn: `<details>
<summary>No Xu chapter; old web answers are not the first answer</summary>

Alex Xu's two volumes have no "Design a comment system." This chapter is rebuilt from 2026 domestic / general public interview prompts and production practice—not a polish of some notes. The web still loves nested set, offset, row-locked likes, and fetching the whole tree in one shot—that is tutorial inertia, not today's whiteboard default.

| Old web / tutorial inertia | How you answer now |
|---|---|
| Nested set / closure table as the comment default | **\`parent_id\` adjacency list**; two-level UI + lazy load. Nested set is for static trees |
| Unbounded indent, recursive CTE on first screen | **top-level cursor + first K replies**; expand then fetch |
| \`LIMIT/OFFSET\` through comments | **keyset cursor**; inserts drift |
| \`UPDATE like_count\` with a row lock | **Redis INCR + periodic flush**; likes are not inventory |
| Hot post JOINs the whole tree every time | **cache the first-N slice**; the full tree does not go in memory |
| Sync call to a moderation model | **moderation queue**; pre-publish or post-publish, both need status |
| Anti-spam = stand up deep learning | **rate limit + enqueue**, then stop |
| Shard by comment_id | **by post_id**, one post on one shard |
| Some site's trending QPS as fact | **teaching assumptions**; order of magnitude only |

Still-valid skeleton: comments are a tree on a post, read-heavy, hot Zipf, async moderation. Outdated is dragging category-tree algorithms, offset habits, and row-locked counters into comments as the first answer.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **"Comments under a post, or a social network?"** → Default nested under a post. A social graph is a Feed prompt; this loop does not draw follower fan-out.
2. **"Why not nested set?"** → Comments insert often; lft/rgt rewrites a range. Adjacency list is O(1) write; subtrees use root_id / lazy load.
3. **"How do you store unbounded depth?"** → \`parent_id\` can store it. Display defaults to two levels flattened, or read fan-out has no bound.
4. **"How do you avoid N+1 on first screen?"** → Batch one page of top-level; replies \`root_id IN (…)\` once for the first K, or a cached slice.
5. **"Why no row lock on likes?"** → Hot comments serialize. Counters can be briefly wrong; \`INCR\` + flush. Inventory prompts lock.
6. **"Redis dies, what happens to counts?"** → Dropping a small increment slice is OK; DB is the source of truth, rebuild the cache. Do not pretend strong consistency.
7. **"Hot post punches through the DB?"** → Cache first N top-level + first K replies; stampede-merge origin. Do not cache a million-node tree.
8. **"Can comments use offset?"** → No. Deep pages are slow; inserts duplicate/skip. Cursor anchors \`(created_at, id)\`.
9. **"Pre-publish or post-publish?"** → Name the trade-off, then pick. Both need a queue and status; lists read only visible.
10. **"How do you build the anti-spam model?"** → Rate limit + enqueue. No ML on this prompt.
11. **"How do you shard?"** → \`post_id\`. Comment id scatters one page.
12. **The final diagram is already huge and they keep stacking?** → Social graph, recommenders, human-review platforms, global multi-Region are not this chapter. Three hard parts spoken clearly scores higher than 20 boxes.`,
    },
    {
      id: "sec-next",
      headingEn: "Wrap-up and what's next",
      bodyEn: `Wrap-up never says perfect. Three bottlenecks out loud:

| bottleneck | How you take it |
|---|---|
| Hot-post reads / whole-tree fan-out | cache first N; lazy-load replies; shard by post_id |
| Like row locks | Redis INCR + periodic flush; SET NX for idempotency |
| Deep offset pages + sync moderation | cursor; writes enter a moderation queue; status controls visibility |

Self-check: close this page. 30-second opening + high-level on the board; walk \`parent_id\` lazy load, INCR without a row lock, and cursor + moderation queue to the air. Wherever you stumble, come back to that section. Anti-spam is rate limit plus enqueue, then stop.

Next problem is **Ch17 · Design an API gateway**. Comments are a tree and counters behind one business API; the gateway swaps in auth, rate limit, routing, and circuit breaking—from "how one resource is stored" to "how every API is guarded at the door."`,
    },
  ],
  reviewMdEn: `# Ch16 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | Three hard parts of comments? | Nested-comment schema + read fan-out; counters + hot posts; cursor pagination + moderation queue. Anti-spam as a callout only. |
| 2 | Default scope? | **Nested under a post** (Twitter/YouTube/news). Not a social graph, not DMs. |
| 3 | How do you store nested comments? | **\`parent_id\` adjacency list** + optional \`root_id\`. Display two levels flattened. "A replies @B". |
| 4 | Why not nested set? | Comments insert heavily; rewriting lft/rgt is a range. Nested set is for static trees. |
| 5 | How do you truncate read fan-out? | Top-level cursor; first K replies + reply_count; expand then fetch. No whole tree on first screen. |
| 6 | Shard key? | **post_id**. One post on one shard. Do not scatter a page by comment_id. |
| 7 | How do likes count? | Redis \`INCR\` + periodic flush. \`SET NX\` for idempotency. **No DB row lock**. |
| 8 | How do you shield a hot post? | Cache first N top-level + first K replies. Full tree does not go into Redis. Misses merge origin. |
| 9 | Why not offset? | Deep pages scan rows; inserts duplicate or skip. Cursor anchors \`(created_at, id)\`. |
| 10 | How does moderation plug in? | **Queue + status**. Pre-publish or post-publish; lists read only visible. No sync RPC to a model. |
| 11 | How far do you take anti-spam? | Rate-limit the write path + enqueue moderation. Do not unpack ML. |
| 12 | Biggest over-engineering on this prompt? | Social graph, unbounded whole-tree indent, nested set, row-locked likes, an anti-spam chapter. Speak the three hard parts. |`,
});
