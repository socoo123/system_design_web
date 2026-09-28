import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch11",
  titleEn: "Design a news feed",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 50–60 min ｜ **Prereq**: Ch01 4-step method; Ch38 cache, Ch42 messaging can wait
> **Goal**: walk a follow feed through the 4 steps; default **hybrid fan-out**; cursor pagination; do not lecture ranking models.

News feed is the third full case. A URL shortener is read-heavy, write-light KV; notifications are service → user fan-out; this prompt is the reverse: **one post has to show up in every follower's timeline**, so writes get amplified by follower count. They are not scoring whether you can draw "global multi-Region + a For You funnel." They want: **feed type asked clearly, write amplification estimated right, three hard parts (the three pieces worth digging) spoken through.**

The system looks like post and scroll a list. The hard parts are push vs pull, celebrities punching a hole in Redis, and pagination / hydration that doesn't drift.`,
    },
    {
      id: "sec-answer",
      headingEn: "How to answer in the interview",
      bodyEn: `**Opening 30 seconds (say it out loud):**

> "Feed has three hard parts: push vs pull vs hybrid, celebrity write amplification, cursor pagination and hydration. I'll confirm follow feed vs recommendation first — this prompt defaults to a **follow feed**; recs are a different problem, I won't expand the model here. Scale on a 10-million DAU board: post QPS is tiny, but fan-out = posts × followers. Architecture defaults to **hybrid fan-out**: regular users push into follower timeline caches on write; celebrities write an outbox only and get pulled on read. Timeline stores \`post_id\` only; hydrate in batch on read. Pagination is cursor, not offset."

Then walk the 4 steps. Do not lead with the final diagram.

${D2}

| Time-box | What you are doing |
|---|---|
| 3–10 min | Clarify: follow vs recs, chronological vs simple ranking, realtime, media, pagination |
| Next 2 min | back-of-envelope: 10M DAU; small post QPS; **write amplification = posts × followers** |
| 10–15 min | High-level: client → feed svc → post store + MQ → timeline cache |
| 10–25 min | deep dive: hybrid, celebrity / hot key, cursor + hydration |
| 3–5 min | wrap-up: 3 bottlenecks (celebrity write spike, timeline memory, delete visibility) |

**red flag:** drawing recall / ranking before you asked feed type; pure push before you estimated write amplification; paginating with \`LIMIT/OFFSET\`; stuffing the high-level with CDN details, a graph DB, multi-Region. That is over-engineering, or dragging recs / Ch14 / Ch38 onto this board.`,
    },
    {
      id: "sec-clarify",
      headingEn: "Clarifying questions",
      bodyEn: `Drawing before you clarify = Jimmy. On Feed, stop at 5–7 questions; assume the rest and write the board.

| You ask | Typical answer / your assumption | What it changes |
|---|---|---|
| Follow feed or recommendation? | **Follow feed** (default) | Social graph + hybrid; recs: "different problem, I won't expand the model" |
| Chronological or simple ranking? | **Chronological** default | ZSET score=time; ranking adds a score pass |
| Do followers need to see it in seconds? | Seconds, eventually consistent | Async fan-out; no global simultaneous guarantee |
| Images/text or video? | Mostly images + text | Media in object storage + CDN; don't design the CDN |
| How do you paginate? | **cursor** | Ban offset |
| Must a delete vanish from every feed immediately? | Filter on read | tombstone; no reverse fan-out |

When they say "you decide," write the assumptions:

> "I'll assume: this is a follow feed, not For You. Default chronological, seconds-level eventual consistency. Media goes object storage + CDN; CDN is out of scope. Pagination is cursor. I'll draw on that — cut me off if it's wrong."

If they ask about recommendation: **acknowledge the difference, then close it.** "That's a different problem; I won't expand the model here. This loop I'll walk follow feed + hybrid fan-out." Asking past 10 minutes is also a red flag. The golden line is still: **ask the key questions → state your own assumptions → write the board → move.**`,
    },
    {
      id: "sec-estimate",
      headingEn: "Back-of-the-envelope",
      bodyEn: `Formulas live in Ch03. Here you only need order of magnitude: prove you know **posting itself is cheap; fan-out is what costs.** Teaching assumptions below from public-scale numbers — not some company's internals.

Assume ~**10 million DAU**; ~10% post once a day; ~20 feed opens per user per day; **average followers ~200** (median is lower; mean is pulled up by celebrities).

| Item | How you estimate | Order of magnitude |
|---|---|---|
| Post QPS | 1e6 posts/day / 86400 | **~12**; peak ×5 is still tens |
| Read-feed QPS | 1e7 × 20 / 86400 | **~2e3**; peak around **1e4** |
| **Pure-push write amplification** | 1e6 posts × 200 followers / 86400 | **~2e3 ZADD/s**; peak around **1e4/s** |
| One celebrity post | 1M / 10M followers | **instant 1e6 / 1e7 writes** — does not average into the daily mean |
| Text storage | 1 KB × 1e6/day | **~1 GB/day**; source of truth is the post store |
| Timeline memory | active users × last 1000 ids | **tens to ~100 GB** Redis (cache actives only) |
| Media bandwidth | images via object storage + CDN | egress is not on feed svc; CDN back to Ch38 |

Write amplification must be spoken out loud: **fan-out writes ≈ posts × followers.** Post QPS looks like a dozen; pure push multiplies it by average follower count. Celebrities are worse: one post is a write storm across the whole follower set — not "add one more fan-out worker" that you can smooth away.

**Interview line:**

> "On a 10-million DAU board: posts are ~10 QPS daily average, read feed is thousands to tens of thousands. The real bottleneck is write amplification — 200 followers average turns writes into thousands of ZADDs per second. A celebrity with a million followers is an instant million writes, so you cannot pure-push; you need hybrid."

Common mistake: reporting only post QPS and pretending that's the whole write path; or treating a real celebrity's follower count as your internal number. Teaching uses order of magnitude; the threshold waits for the deep dive.`,
    },
    {
      id: "sec-arch",
      headingEn: "High-level architecture",
      bodyEn: `Left to right: App → feed svc → post store (source of truth) + MQ (async fan-out) → follower timeline cache. After they buy in, split write path and read path.

${D2}

**This diagram cites**: Ch38 Cache and CDN · Ch41 Replication, sharding · Ch42 Messaging, resilience

**Why split post store + timeline cache (must answer):** post is the source of truth, sharded by author (Ch41); timeline is a precomputed inbox per user, \`post_id\` only. Reads are fast because of cache; write amplification goes async on MQ (Ch42), API returns first. Kafka partitions / ISR wait for Ch20 — do not turn this into a message-queue class. Media URLs go to object storage, browsing hits CDN — point at Ch38, don't design edge nodes.

**schema (enough, then stop):** \`post\` (post_id, author_id, text, media_url, created_at, deleted); \`follow\` (follower_id, followee_id); timeline = Redis ZSET (score=time, member=\`post_id\`); celebrities also have an outbox ZSET. Do not draw five wide tables on the board.

Keep ranking to two gears; don't slide into ML:

| | Chronological (default) | Simple ranking |
|---|---|---|
| How | ZSET score=timestamp | Interpretable score, e.g. engagement × time decay |
| Read | \`ZREVRANGE\` is the page | Score first, then write or rank on read |
| Cost | New posts can bury older hot ones | Deletes / count changes must invalidate scores |
| Interview | **Follow-feed default** | Add it when they say "don't be that dumb" |

**Interview line:**

> "On a follow feed I default chronological. Simple ranking I can mention affinity × decay in one sentence, but I won't put a model on this prompt. Timeline stores ids only; full posts hydrate from the post cache."

Write path: **persist the post first, then enqueue MQ, then fan-out.** The API does not scan the follower list on the request thread. Regular users: look up followers → \`ZADD\` each timeline, \`ZREMRANGEBYRANK\` keep last N. Celebrities: write their own outbox only — next section.

${D2}

**This diagram cites**: Ch42 Messaging, resilience · Ch41 Replication, sharding

The hot query on follow is "author's follower list" (index on \`followee_id\`). Fan-out workers must be idempotent: \`ZADD\` the same \`post_id\` twice is the same. Declare MQ as at-least-once and stop.

Stop the high-level here. Ask: "Does this direction look OK? Next I'll dig into hybrid, celebrities, and cursor / hydration."`,
    },
    {
      id: "sec-pushpull",
      headingEn: "Deep dive · Push vs Pull vs Hybrid",
      bodyEn: `First hard part. **Does fan-out happen on write or on read?** That is write amplification vs read latency — a trade-off, not a moral choice.

${D2}

| | Push (fan-out on write) | Pull (fan-out on read) | Hybrid (**default**) |
|---|---|---|---|
| On post | Write every follower's timeline | Write the author's outbox only | Regular users push; celebrities write outbox only |
| Read feed | One \`ZREVRANGE\` | Pull recent posts from each followee, then merge | Read your inbox + pull followed celebrities |
| Read latency | Low | High (linear in follow count) | Low (celebrity legs are usually few) |
| Write amplification | **posts × followers** | 1 | Capped by the threshold |
| Failure mode | Celebrity write storm | Follow 5000 people = 5000 reads | Wrong threshold / merge forgets to dedup |

Pure push is great for regular users: tens to thousands of followers, precompute turns the feed into one cache read. Pure pull is great for celebrities: one write on post, follower reads spread across the day. Both failure modes explode at scale — so the 2026 board defaults to **hybrid**, not "draw push first, patch it when they ask about stars."

**Interview line:**

> "Regular users push, celebrities pull, merge on read. Threshold is by follower count (teaching ~100k) — not a magic number, tune on write amplification and read latency. I will not lock the final diagram to pure push on the first stroke."

Speak the trade-off yourself: hybrid costs an extra merge and a "who is a celebrity" flag; what you buy is a bounded write path. At small scale (well under 10M DAU, no celebrities) you can start pure push and declare you'll cut over when the threshold trips — that is evolution, not the first answer on this prompt.`,
    },
    {
      id: "sec-celeb",
      headingEn: "Deep dive · Celebrities and write amplification",
      bodyEn: `Second hard part. Follower counts follow a power law: a tiny set of accounts produce most of the fan-out work. Teaching assumption: one post from a million-follower account, pure push = **instant 1e6** timeline writes. Ten million followers is **1e7**. MQ backlog, Redis CPU, followers seeing it at wildly different times — this is a hot key, not something more consumers can root-cause away.

${D2}

| | Pure push for celebrities | Hybrid |
|---|---|---|
| Write | 1 post → N followers, N writes | 1 post → 1 outbox write |
| Read | Follower inbox already has the id | inbox (regular users) + last N from celebrity outboxes |
| hot key | **write hotspot** (what Redis hates most) | read hotspot (one shared outbox, cache-friendly) |
| Optional speedup | — | Rate-limited batched push to **active followers**; inactives still pull |

Why pull fits celebrities: the write spike arrives in the same millisecond; reads are tens of millions of followers opening the app across a day. Swap "instant write" for "spread-out read" and the spike disappears. The number of celebrities each person follows is usually much smaller than total follows, so merge cost is predictable.

Threshold: on the board say **~100k followers** as the teaching line, then add "production tunes on write amplification and p99 read latency — not a magic number." Below the line, push; cross it, stop push, switch to outbox. When an account graduates from regular to celebrity, you can stop the old push; ids already in follower inboxes don't need an instant purge.

One more cut on write amplification (mention, don't expand into a fourth architecture): **don't push to long-inactive followers.** When they come back, pull to rebuild one page. Active followers are often a small fraction of the follower set.

**Interview line:**

> "I will not ZADD every follower of a celebrity. I write the outbox; followers merge on the next feed read. Active followers can get a rate-limited batched push — that's an optimization, not the first diagram. Write hotspot becomes a read hotspot, and cache can eat that."

Follow-up "how do celebrity followers see it in time": the outbox write is once, immediately; the next follower read (or a lightweight "new post" ping on a long-lived connection — point at Ch12) can merge it in. You don't need, and shouldn't promise, that a hundred million inboxes contain this id in the same second.`,
    },
    {
      id: "sec-cursor",
      headingEn: "Deep dive · Cursor pagination and hydration",
      bodyEn: `Third hard part. Feed is infinite scroll plus posts inserting continuously. **Pagination must be cursor; timeline must fetch ids first, then hydrate.** Those two are tied: whether the page is stable is the cursor; whether the content is right is hydration and invalidation.

${D2}

| | offset (\`LIMIT 20 OFFSET n\`) | cursor (keyset) |
|---|---|---|
| Deep pages | OFFSET gets slower as n grows | Continue from the anchor; walk ZSET / index |
| Posts inserting | Next page duplicates or skips | Anchor on \`(ts, post_id)\`; new posts only show up in "refresh" |
| hybrid | Two-way merge gets messier | One ordered key, one cut |
| Interview | **red flag** | **follow-feed default** |

Cursor on the board: return an opaque token; server decodes to \`(created_at, post_id)\` (or a snowflake id, which already has time order). Next page: 20 items in the timeline **strictly less than** that anchor. Home has no cursor. Do not let the client pass \`page=3\`.

Read path: fetch ids first, then hydrate in batch. **Do not stuff full posts into a per-user ZSET** — memory is two orders of magnitude worse, and an edit would have to reverse-patch tens of millions of copies.

${D2}

**This diagram cites**: Ch38 Cache and CDN

Hydrate details: \`MGET post:{id}\`; miss goes to the post store then backfill (watch stampede, Ch38). Drop \`deleted=true\`; if the page is short, fetch another id chunk. User cards and counters live in their own caches — don't JOIN one fat wide row. Media returns URLs only; bytes never go through feed svc.

Invalidation: no reverse fan-out:

| Event | Don't | Do |
|---|---|---|
| Delete | Walk every follower inbox and drop the id | post tombstone; filter on hydrate; lazily strip ids in the background |
| Edit copy | Patch tens of millions of copies | Patch post / post cache only; id stays |
| Unfollow | Immediately scan the inbox | Filter on read by the follow set, or strip async |
| Inbox bloat | Keep ids forever | Keep last N (e.g. 800–1000) |

Push moved "the write" onto the follower side, so consistency can only be **read-side fallback + eventual consistency**. Chasing "a hundred million inboxes strongly consistent after a delete" is over-engineering.

**Interview line:**

> "Pagination is a \`(time, post_id)\` cursor, not offset. Timeline stores ids only; MGET hydrate on read; deletes filter via tombstone. I will not reverse fan-out to delete one post."`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs the book",
      bodyEn: `<details>
<summary>How the book / notes used to teach it (not the first answer)</summary>

The notes pulled in a recs funnel; this site does not cover recommendation systems, and the interview default is a follow feed.

| Book or notes | How you answer now |
|---|---|
| Only push/pull on a follow feed (skeleton still right) | **hybrid fan-out as the default** — don't wait for them to ask about celebrities |
| Ranking mentioned engagement scores / slid toward ML | Follow feed: **chronological vs simple ranking**. Models are a different problem |
| Pagination was thin; offset mixed in from SQL intuition | **Must be cursor**; speak insert drift |
| Celebrity problem in one sentence | Open with **posts × followers**; outbox + merge on read; batched push to actives is an optimization |
| Some products mix a ranking model into the Following tab | Acknowledge "product may mix"; this loop still answers follow feed + hybrid, no funnel |

The book's intro skeleton still works: write path persist → fan-out; read path inbox + hydrate. What aged is treating a recs funnel as the first answer on this prompt, and pure push with no write-amplification estimate.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **"Push or pull?"** → hybrid: regular users push, celebrities pull, merge on read. Speak the threshold, then draw.
2. **"A million-follower account posts — now what?"** → Don't pure-push. Write the outbox (write amplification = 1); followers pull on read. Active followers can get a rate-limited batched push.
3. **"How do you estimate write amplification?"** → posts × followers. Post QPS is not the whole write path.
4. **"Why does timeline store only post_id?"** → Memory; an edit hits one source of truth. MGET hydrate on read.
5. **"Can feed paginate with offset?"** → No. Deep pages are slow + inserts cause dupes/skips. Cursor anchors on \`(ts, post_id)\`.
6. **"After a delete, can followers still see it?"** → They shouldn't. tombstone + filter on hydrate. Don't walk follower inboxes.
7. **"Follow feed or recommendation?"** → Ask first. Default follow feed. Recs: "different problem, I won't expand the model."
8. **"What ranking model?"** → Chronological default; simple ranking is interpretable. No recall / ranking funnel.
9. **"Where does media live?"** → Object storage, URL on the post; browsing hits CDN (Ch38). Don't design CDN on this prompt.
10. **The final diagram is already huge and they keep stacking?** → Classic over-engineering on this prompt. Funnels, two-tower, graph DB, multi-Region are not this chapter. Speaking three hard parts scores higher than 20 boxes.`,
    },
    {
      id: "sec-next",
      headingEn: "Wrap-up and what's next",
      bodyEn: `Wrap-up never says perfect. Three bottlenecks out loud:

| bottleneck | How you take it |
|---|---|
| Celebrity write spike | hybrid: outbox + merge on read; don't ZADD every follower |
| Timeline memory / cold users | ids only, cache actives, sliding window of N; cold users pull one page on return |
| Delete / cache inconsistency | tombstone + filter on hydrate; eventual consistency, no reverse fan-out |

Self-check: close this page. 30-second opening + high-level on the board; walk hybrid, the write-amplification formula, and cursor + hydrate to the air. Wherever you stumble, come back to that section.

Next problem is **Ch12 · Design a chat system**. Feed is one-to-many async timeline; chat is low-latency bidirectional — WebSocket, message state, multi-device sync.`,
    },
  ],
  reviewMdEn: `# Ch11 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | Three hard parts of Feed? | push vs pull vs hybrid; celebrity write amplification; cursor pagination + hydration. |
| 2 | 2026 default fan-out? | **hybrid**: regular users push on write, celebrities pull (outbox), merge on read. |
| 3 | How do you estimate write amplification? | posts × followers. Post QPS is not the whole write path. |
| 4 | Why can't celebrities pure-push? | One post = instant N timeline writes (hot key). Write the outbox; reads spread over time. |
| 5 | High-level path? | App → feed svc → post store + MQ → timeline cache. Persist first, then fan-out. |
| 6 | What does timeline store? | \`post_id\` only (ZSET). Full posts hydrate from the post cache. |
| 7 | Read path? | ZREVRANGE ids → MGET hydrate → filter tombstones → return a page + cursor. |
| 8 | Why not offset? | Deep pages are slow; inserts between pages cause dupes or skips. Cursor anchors on (ts, post_id). |
| 9 | How do you handle deletes? | post tombstone; drop on hydrate. Don't reverse fan-out every follower inbox. |
| 10 | How far on ranking? | Chronological default; simple ranking (engagement × decay) can be mentioned. No recs funnel. |
| 11 | They ask about recommendation? | Acknowledge it's a different problem; don't expand the model. This loop: follow feed + hybrid. |
| 12 | Where does media live? | Object storage + CDN URL. Don't design CDN on this prompt (Ch38). |`,
});
