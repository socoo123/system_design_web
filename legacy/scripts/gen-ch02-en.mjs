import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch02",
  titleEn: "Scale from zero to a million users",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 50–60 min ｜ **Prereq**: Ch01 4-step method
> **Goal**: walk a single box to a million users with “pain → fix → new pain”; do not open with the final diagram; know which M6 chip hangs on each episode.

Ch01 is how you play 45 minutes. This chapter is **how architecture grows**. When they say “design a system that can hold a million users,” the strong-hire signal is not a 20-box final picture. It is: **start from one machine, add one component at a time, and say what it solves and what it introduces.**

The numbers live in **Ch03**. Mechanisms (CAP, cache policy, sharded transactions, K8s) get a pointer; depth is M6.`,
    },
    {
      id: "sec-answer",
      headingEn: "How to answer in the interview",
      bodyEn: `### Opening 30 seconds

> “I’ll start from the simplest single box, find the bottleneck, then add components one by one. At each step I’ll say: why we move now, what we introduce, what it solves, and the new pain. I’ll keep the whole evolution in 8–12 minutes. I won’t draw the final picture first.”

Then push the 8 episodes. About a minute each, talking while you draw. Past 12 minutes and you are doing a deep dive inside Step 2—that is a red flag.

### The 8-episode cadence (say this out loud)

| Episode | Current pain | Introduce | New pain |
|---|---|---|---|
| 1 Single box | No system yet | One machine runs web + DB | Resource fight; one death takes the site |
| 2 Split layers | web and DB fight for CPU/RAM | web / DB on separate machines | DB is still a single point |
| 3 LB | One web cannot scale | Managed LB + more web | DB still a single point; if session sticks to a web box, horizontal scale is fake |
| 4 Primary/replica | Reads saturate the single DB | primary writes, replica reads | failover may lose data; reads lag |
| 5 Cache CDN | Read path still too slow | cache-aside + CDN / object storage | cache consistency; cache itself is a SPOF |
| 6 Stateless | sticky session blocks scale-out | shared session or JWT | depends on shared store; token revoke is extra work |
| 7 Multi-DC | Single Region failure, cross-continent latency | geoDNS / Anycast + multi AZ/Region | CAP cost of cross-Region writes |
| 8 MQ · sharding | Slow jobs block the write path; single-DB write ceiling | Managed Kafka; sharding or distributed SQL | duplicate consume; reshard / hot keys / cross-shard join |

**Discipline: do not open with the final big picture.** That is over-engineering. They want the reasoning, not you reciting a production topology.`,
    },
    {
      id: "sec-clarify",
      headingEn: "Clarifying questions",
      bodyEn: `This prompt is an **evolution story**, not a feature problem like “design a short URL.” Step 1 still asks first, but the questions collapse into three buckets:

| Bucket | You ask | Why |
|---|---|---|
| Scale | Is a million DAU or total signups? What order of magnitude is read QPS? | Decides whether you stop at primary/replica or must shard |
| Read/write | Rough read:write? Any “write then immediately read”? | Decides how you place replica, cache, CDN |
| Region | Users across continents? Can we live with one Region? | Decides multi-Region; Active-Active is expensive |

Two extra constraints if you have room: latency target (same-city milliseconds vs cross-continent hundreds of ms); which data needs strong consistency (accounts yes, likes usually no).

Stop at 5–7. If they say “you assume” → write the board: “Assume 1M DAU, read-heavy, one Region first; global users then add geoDNS.” Wrong assumptions they will correct. Sitting silent for perfect numbers they will not.`,
    },
    {
      id: "sec-estimate",
      headingEn: "Back-of-the-envelope (short)",
      bodyEn: `This chapter **does not teach estimate details**. Leave 1–2 minutes before Step 2 for back-of-the-envelope. Formulas and the 2026 latency table live in **Ch03**.

Three lines that are enough in the interview:

1. “I’ll write QPS / storage order of magnitude first, then use it to check whether each episode’s new component actually holds.”
2. “Latency story is memory, NVMe, same-city, cross-continent. HDD is not the first answer.”
3. “A single box with NVMe + lots of RAM often takes more reads than intuition says. Don’t go distributed on minute one to look senior—that is over-engineering.”

How to multiply DAU, how to size replica disks: Ch03.`,
    },
    {
      id: "sec-map",
      headingEn: "High level: the 8-episode map",
      bodyEn: `Show the interviewer the route. **Do not** open with the end-state architecture. The diagram below only answers “what is the order.”

${D2}

Talk track:

> “I’ll evolve along this chain. We’re on episode 1. If you want to jump to multi-Region or sharding, tell me and I’ll speed up; otherwise I add one episode at a time.”

Walk it episode by episode. Each one is **pain → fix → new pain**. Architecture diagrams only take three snapshots: early split, mid LB+primary/replica+cache, late multi-DC. MQ and sharding stay in words so one picture does not swallow 20 nodes.`,
    },
    {
      id: "sec-early",
      headingEn: "Episodes 1–3: single box → split layers → LB",
      bodyEn: `### Episode 1 · Single box

**Pain:** There is no system yet, but users already need to hit something.

**Fix:** One machine runs the web app and the database. Users get a public IP via DNS; HTTP lands on this box. DNS can be a third-party managed service—treat it as a known external. You should be able to say “authoritative DNS can later do geo routing”; details wait for episode 7.

**New pain:** web and DB fight for the same CPU / RAM / NVMe; no redundancy, process death takes the site; vertical scale has a hardware ceiling.

### Episode 2 · Split web / DB

**Pain:** One box fights for resources; neither side can scale independently.

**Fix:** Two layers. web holds business logic; DB is its own machine. 2026 default is a relational store first (PostgreSQL-class): if you have a schema, transactions, and joins, do not pick NoSQL to “look distributed.” Extreme access patterns (pure KV, pure time-series, massive writes) then switch to a specialized store—the selection table is **Ch37**.

${D2}

This diagram cites: Ch37 storage choice · Ch40 protocol choice (HTTP read path)

**New pain:** DB is still a single point. web is still one box.

### Episode 3 · LB + horizontal scale

**Pain:** One web is a SPOF; adding CPU to that one box (scale up) has a ceiling.

**Fix:** Add web boxes horizontally (scale out), put a **managed LB** in front. LB does two jobs: drop unhealthy nodes via health checks (failover), and spread traffic across boxes. Homogeneous machines: round-robin is enough; long-lived connections then least-conn. L4 vs L7, consistent-hash LB: depth in **Ch39**. Here just say “entry is a managed LB; content-based routing then L7.”

Web boxes talk over the private network. Clients only see the LB’s public entry.

**New pain:** DB is still one machine; when reads grow it dies first. Also, if session still lives in one web’s memory, the LB has to be sticky—episode 6 splits that. Admit the landmine now; do not pretend you are already stateless.`,
    },
    {
      id: "sec-mid",
      headingEn: "Episodes 4–6: primary/replica → cache/CDN → stateless",
      bodyEn: `### Episode 4 · Primary/replica

**Pain:** You can add web now, but DB is still a single point. Typical product is read-heavy; reads saturate the primary.

**Fix:** One primary takes writes, several replicas take reads. Say **primary / replica** (drop master/slave). Three wins in one breath: reads spread out, data has copies, a dead DB can still fail over.

Default replication is **async** (fast; primary death may lose unreplicated writes). Smaller loss window → semi-sync (ACK after at least one replica has it). Waiting for every replica puts cross-AZ latency on the critical path—finance can talk about it; a social timeline usually is not worth it. Mechanism in **Ch41**.

**New pain:** primary failover is not “change a DNS record”; replicas can lag. A user who writes then immediately reads a replica may see a stale value. These two are this chapter’s deep dive—park them on the board.

### Episode 5 · Cache and CDN

**Pain:** Reads are still expensive; avatars, JS, video keep hitting origin; cross-continent users wait on first byte.

**Fix:** Hot reads go through cache (**cache-aside** you must be able to say: miss → origin → fill; after writing the DB, **delete** the cache, do not update it). Static and bulky files go through CDN + **object storage**. TTL is required; cache needs replicas, or you just moved the SPOF.

2026 extra line: when several derived stores (cache, search index) should not be dual-written by the app, use **CDC** (listen to the DB WAL / binlog) to invalidate or refill. Aside is enough to pass; CDC is extra credit, depth in **Ch38**. Cache penetration / breakdown / stampede also live there; here just name them: empty-value TTL, mutex on hot keys, TTL with jitter.

${D2}

This diagram cites: Ch39 load balancing and stateless · Ch38 cache and CDN · Ch41 replication, sharding, transactions

**New pain:** cache and DB are not one transaction—brief inconsistency. CDN TTL too long goes stale; too short blows origin. If the next episode still leaves session in web memory, adding machines still hurts.

### Episode 6 · Stateless web

**Pain:** sticky session makes “horizontal scale” fake—the user is glued to one box; that box dies and session dies; auto-scaling has to migrate sessions.

**Fix:** web is **stateless**. Session lives in shared storage (Redis-class), or JWT (self-contained token, web only verifies the signature). Any box can take the request; the managed LB does not need to stick.

${D2}

This diagram cites: Ch39 load balancing and stateless

JWT cost: active logout needs a denylist or short access + refresh. Saying “I know this trade-off” scores higher than pretending it is perfect.

K8s gets one mental line: **only stateless replicas can add Pods from a metric**. YAML and HPA live in **Ch42**; this chapter does not write them.

**New pain:** shared session is a new dependency. If the single Region dies, none of the above saves cross-continent users.`,
    },
    {
      id: "sec-late",
      headingEn: "Episodes 7–8: multi-DC → MQ → sharding",
      bodyEn: `### Episode 7 · Multi-DC (Region / AZ)

**Pain:** One data center (now: one Region) is too big a failure domain; every RTT for a cross-continent user is hundreds of milliseconds.

**Fix:** Multiple **AZ**s in the same Region is 2026 default HA, not extra credit. Real disaster recovery and proximity then multi-Region: entry via **geoDNS or Anycast**, switch traffic by location + health checks.

| | Active-Passive | Active-Active |
|---|---|---|
| Traffic | One Region takes writes, the other is hot standby | Both take traffic |
| failover | Minute-class cutover | Already live |
| Data | One-way replication, few conflicts | Bidirectional writes; conflict is the hard part |
| Cost | Standby can be cheaper | Close to two live copies of resources |

Active-Active is not free global low latency. Cross-continent sync either adds latency (you want consistency) or accepts brief forks (you want availability). How to open CAP / PACELC is **Ch36**. Here just: **pick per data, not per whole site**—accounts can lean consistent, Feed can lean available.

${D2}

This diagram cites: Ch36 Trade-off (CAP / PACELC) · Ch42 messaging, elasticity, container mental model

**New pain:** writing the same row across Regions conflicts. The usual escape is geo-sharding (a user always writes their home Region), not global sync-on-write from minute one. Object storage cross-Region replication is relatively easy to tell; the database is the pain.

### Episode 8a · MQ

**Pain:** If transcode-after-upload, notifications, and derived-data refresh run synchronously, the write path is blocked by slow jobs; web and workers are tightly coupled and cannot scale independently.

**Fix:** Writes land on **managed Kafka** (or a similar log-style MQ) first; web returns fast; workers scale on their own. Producer and consumer decouple; backlog → add consumers.

Delivery semantics in one line: production default is **at-least-once**, so the consumer must be idempotent (business unique key + unique index). exactly-once as an end-to-end slogan is loud; engineering is usually “at-least-once + idempotent” dressed up. Depth **Ch42**; Kafka partitions / ISR in **Ch20**.

**New pain:** duplicates, reordering, backlog, dead letters. MQ **does not solve** the single-DB write ceiling.

### Episode 8b · Sharding (and when not to hand-roll it)

**Pain:** Single-DB write QPS and data size hit the ceiling. Primary/replica only scales reads.

**Fix:** Split data across shards by a **shard key**. The key needs high cardinality, even distribution, and common queries should land on **one** shard. \`user_id\` usually works; \`gender\` or a monotonically increasing timestamp as the only key hotspots easily.

2026 first sentence: **prefer native distributed SQL when you can** (the storage layer splits ranges, rebalances, multi-replica). Interviews still ask hand-rolled sharding because the hard part did not change: shard key, reshard, hot keys, cross-shard join. How consistent hashing cuts migration is **Ch05 / Ch41**; hot/warm/cold tiers in **Ch43**.

Prefer to **avoid** cross-shard joins and cross-shard transactions: keep data of the same aggregate together (point at **Ch45**). Real long-running cross-service transactions: Saga / Outbox in Ch41; this chapter does not expand 2PC. How to split microservices is **Ch44**—do not suddenly draw a service mesh in episode 8.

**New pain:** reshard migrates; a celebrity key blows one shard; cross-shard queries become scatter-gather. Park the evolution story here and switch to Step 3 deep dive.`,
    },
    {
      id: "sec-deep",
      headingEn: "Three deep dives",
      bodyEn: `On this prompt, Step 3’s hard part (the piece worth digging) is usually these three. Pick 1–2 and go to the bottom. Do not skim all three.

### 1. Primary/replica failover and read lag

Failover in five spoken steps: **detect** (consecutive health-check failures) → **pick a replica** (the one with the newest replication position) → **catch up** (replay to the old primary’s position) → **cut routing** (app / LB point at the new primary) → **rebuild replicas**.

Under async replication, primary death can drop writes that were ACK’d but never made it to a replica. That is RPO. Semi-sync shrinks the window; the cost is write latency. Do not promise “we never lose data”; say how large a window you accept and which replication mode buys that window.

**Read-your-writes** is a must-follow-up. Sequence:

${D2}

This diagram cites: Ch41 replication, sharding, transactions

Fixes (name the trade-off; that is enough):

| Move | Effect | Cost |
|---|---|---|
| After a write, read primary for a short window | That user gets read-your-writes | Primary read pressure ↑ |
| Client carries a version; replica not caught up → fall back to primary | More precise | You must expose a position / version |
| Semi-sync | Shorter stale window | Writes get slower |

Monotonic reads (refresh makes data “shrink”): pin the same user to the same replica. Do not let the LB bounce across replicas that lag by different amounts.

### 2. Cache consistency

cache-aside standard write path is **write DB first, then delete the cache**. Delete is idempotent; “SET the cache in the same breath as the DB write” can put the old value back under concurrency. After delete, the next read fills; TTL is the safety net.

Still possible: a read gets the old row, a write deletes the empty cache, the read SETs the old row back. Engineering: **short TTL** bounds the window. Many derived stores (cache + search + warehouse): let **CDC** listen to WAL, invalidate or fill in one place, app no longer dual-writes. CDC is not zero latency; it moves “who owns consistency” out of the app. Details **Ch38**.

How to pick in the interview: second-level stale is OK → aside + delete + TTL. Several downstreams must follow the DB → mention CDC; do not design a dual-write protocol on the whiteboard.

### 3. Shard key and hot keys

Three questions for the key: even distribution? Can a point lookup land on one shard? Will the newest writes all pile onto one range?

Hot keys (celebrity key): reads can sit behind cache; writes split one logical key into sub-keys (salting) then aggregate, or give the ultra-hot key its own resource. Range sharding on a monotonic primary key dumps inserts onto the rightmost range—distributed SQL faces this too, the engine may auto-split; you still need to say “why this key gets hot.”

reshard: change N on \`hash % N\` and you migrate almost everything. That is why interviews mention consistent hashing / range split. Native distributed SQL → let the storage layer rebalance. If you cannot, say the migration window and dual-write cutover up front. Do not pretend \`MOD 4\` lives to a hundred million.`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs the original book",
      bodyEn: `<details>
<summary>What the book / notes said then · what lives in the body now, what lives in the fold</summary>

| Book (~2020) | How you answer now |
|---|---|
| master / slave | primary / replica |
| Latency table anchored on HDD | Body uses memory / NVMe / same-city / cross-continent; HDD waits in the Ch03 fold |
| sticky session written as a viable design | Transition or counter-example; body defaults to stateless + shared session or JWT |
| “Multi data center” in a few paragraphs | Region / AZ, geoDNS or Anycast; Active-Active pays a CAP cost (Ch36) |
| Cache almost only aside / read penetration | aside is still required; you may mention CDC invalidation; delayed double-delete is not the first answer |
| Endgame is hand-rolled MySQL sharding | Shard key / reshard / hot keys still must-ask; prefer native distributed SQL when you can |
| Cloud-vendor lists: ALB, NLB, SQS | Say managed LB, object storage, managed Kafka |
| Almost no container orchestration | One line on stateless replica mental model; no YAML (Ch42) |
| Close with one final big picture | Close with the evolution story; opening with the final picture is a red flag |

The notes also dump SQL/NoSQL big fan-out, Service Mesh, the whole edge-computing kit. Those can be “the next curve” in wrap-up. Do not draw them in episode 2.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. “Why not draw the final architecture first?” → The interview scores evolution reasoning. Opening with the final picture = over-engineering.
2. “I wrote then refreshed and don’t see it?” → You read a lagging replica. After a write, read primary for a short window, or fall back with a version.
3. “If primary dies, do we lose data?” → Async, yes. Talk RPO + semi-sync / accepted window. Do not promise zero loss.
4. “Cache and DB disagree?” → aside delete + TTL; many downstreams → mention CDC. Do not promise a strongly consistent cache.
5. “Can’t sticky still scale?” → For a while. Box death drops session; scale-in has to migrate. The real answer is stateless.
6. “Multi-Region that’s both fast and consistent?” → You don’t get both for free. Pick per data; mechanism in Ch36.
7. “Messages duplicated?” → Under at-least-once the consumer is idempotent; unique key as the backstop.
8. “How do you pick a shard key?” → High cardinality, even, point lookup on one shard. Then hot keys and reshard. Prefer distributed SQL first, still explain the key.
9. “Traffic ×10?” → First find which layer dies first (LB / cache / primary writes / hot shard), then decide replicas vs sharding. Do not just add machines.`,
    },
    {
      id: "sec-next",
      headingEn: "What’s next",
      bodyEn: `Close the page. Walk “a million users” in 8 episodes, three sentences each: pain, fix, new pain. If you stall on numbers, go to **Ch03 · Back-of-the-envelope estimates**. The first small 4-step problem is **Ch04 rate limiter**.

Self-check: without drawing the final picture, can you make them understand failover and read lag by episode 4? If yes, this chapter is done.`,
    },
  ],
  reviewMdEn: `# Ch02 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | Why can’t you open a scale question with the final diagram? | They score pain → fix → new pain. Opening with the final picture is over-engineering. |
| 2 | 8-episode order? | Single box → split layers → LB → primary/replica → cache/CDN → stateless → multi-DC → MQ/sharding. |
| 3 | Step 1 on this chapter: which three buckets? | Scale, read/write, multi-region or not. |
| 4 | Where do the estimate formulas live? | Ch03. This chapter only leaves a slot for back-of-the-envelope. |
| 5 | After splitting web/DB, what’s the new pain? | DB is still a single point; web is still one box. |
| 6 | What does LB solve / not solve? | Solves web failover and horizontal scale. Does not solve DB as a single point. |
| 7 | Does async primary failover lose data? | It can. ACK’d writes that never reached a replica go into RPO. |
| 8 | Wrote then immediately can’t read it—how do you say it? | You hit a lagging replica. After a write, read primary for a short window, or fall back to primary if the version hasn’t caught up. |
| 9 | Why does cache-aside delete the cache on write? | Delete is idempotent; concurrent SET can write the old value back. TTL as the safety net. |
| 10 | When do you mention CDC in 2026? | When several derived stores must follow the DB. aside is still the required baseline. |
| 11 | Why is sticky session a counter-example? | Glued to one box: death drops session, scale-out has to migrate. Stateless uses shared session or JWT. |
| 12 | Cost of Active-Active? | Bidirectional write conflicts + cross-continent latency. Pick consistent vs available per data; point at Ch36. |
| 13 | Mainstream MQ delivery semantics? | at-least-once; consumer idempotent. MQ does not lift the single-DB write ceiling. |
| 14 | How to pick a shard key? Hot keys? | High cardinality, even, point lookup on one shard. Hot keys: cache / salt / dedicated resource. Prefer distributed SQL when you can. |`,
});
