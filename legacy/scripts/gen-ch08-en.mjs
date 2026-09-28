import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch08",
  titleEn: "Distributed locks",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 45–55 min ｜ **Prereq**: replication / timeouts in Ch41
> **Goal**: Redis SET NX + fencing; **do not default Redlock**; watchdog vs business timeout.

Distributed locks are the fifth brick in M2, and they close the skeleton lane: many instances racing for the same inventory, the same cron, the same critical section. In-process \`synchronized\` cannot see the box next door. They do not want five lock implementations recited as equals. They want three sentences you can ship: **for an efficiency lock, default Redis \`SET key token NX PX ttl\` + Lua compare-and-del; if the critical section writes storage, add a fencing token; do not default Redlock.**

The hard part (the piece worth digging) is those three: **SET NX + TTL + safe unlock**; **fencing token vs Redlock**; **watchdog renew vs GC pause / business timeout**. Reentrancy (same owner token + refcount) is optional — name it and stop. Consensus lease (etcd / ZK / Chubby) comes up when you need a correctness lock *and* you already have a coordinator. **Do not turn this chapter into a Raft lecture** — replication and timeouts live in **Ch41**.`,
    },
    {
      id: "sec-answer",
      headingEn: "How to answer in the interview",
      bodyEn: `### Opening 30 seconds

> “First split efficiency lock vs correctness lock. Dedup work, occasional double-run is OK: Redis \`SET key token NX PX ttl\`, unlock with Lua compare-and-del. If the critical section writes the store and a double-write corrupts data: you must add a fencing token — the lock service hands out a strictly increasing number, storage rejects a stale one. Do not default Redlock: a majority of independent Redis nodes is not consensus, and it eats the clock. Want a consensus lease, use etcd / ZK / Chubby. The hard part is TTL vs business timeout: a watchdog cannot save a GC pause longer than the TTL; the work must finish shorter than the lock TTL, or the lock expires while you are still in the critical section.”

Then walk that chain. Do not open by drawing five independent Redis boxes as a “HA lock.”

${D2}

| Time box | What you are doing |
|---|---|
| 3–5 min | Clarify: efficiency vs correctness; do we write storage; how long is the work; reentrant |
| 2 min | Back-of-the-envelope: lock QPS (not business QPS); TTL vs business P99 |
| 8–12 min | High-level: Redis SET NX vs etcd lease; knock Redlock off the default |
| 10–15 min | Deep dive: safe unlock, fencing, watchdog vs GC / business timeout |
| 2–3 min | Wrap-up: a unique constraint is often better; failover dual-hold is fenced |

**red flag:** Redlock as the first answer; \`SETNX\` then \`EXPIRE\` (crash in between, lock never releases); unlock with a raw \`DEL\` (you delete someone else's lock); promising “absolute mutual exclusion” without fencing; work that may run 60 s with TTL set to 10 s and calling that fine.`,
    },
    {
      id: "sec-clarify",
      headingEn: "Clarifying questions",
      bodyEn: `If you have not pinned “what breaks if two of us run,” Redis and etcd later are empty. Ask 5–7, then stop; the rest you write as assumptions. Raft / replica topology go to **Ch41**. This chapter only decides **lock semantics**.

| You ask | Why | Default you write on the board |
|---|---|---|
| Is a double-run wasted work, or a bad ledger? | Efficiency vs correctness; do you need fencing / consensus | “Scheduler dedup = efficiency; decrement stock / book a ledger = correctness” |
| Does the critical section write shared storage? | Writes need fencing; blocking duplicate compute can skip the fence | “Writes the DB → carry a fencing token” |
| How long is the work? P99? A hard timeout? | Sets TTL; work must be shorter than the lock, or watchdog + still fence | “P99 2 s, TTL 10 s, hard timeout 8 s” |
| Can the same process re-enter? | Reentrant = same owner + refcount, optional | “Non-reentrant first; add a counter if they ask” |
| Do we already have Redis, or already etcd / ZK? | Do not spin up a coordinator cluster for an efficiency lock | “Have Redis → SET NX; correctness and already have etcd → lease” |
| Miss the lock: retry, fail, or queue? | A lock is not a queue; flash-sale inventory is a different prompt | “tryLock fails, return; do not queue on the lock” |

When they say “you assume,” write it up:

> “Assume: many instances racing for one resource. Scheduler-style = efficiency lock, Redis SET NX + Lua unlock. Decrement stock / write a ledger = correctness lock, same Redis plus a fencing token, storage rejects a stale number. Business P99 2 s, TTL 10 s. No Redlock. If a DB unique constraint can do it, ask first whether we even need a lock.”

The moment they say “absolute mutual exclusion, money must not spend twice,” **put fencing or a unique constraint on the board immediately**. Do not just lengthen TTL. If they say “just keep two workers from claiming the same cron,” an efficiency lock is enough — five-node Redlock is over-engineering.`,
    },
    {
      id: "sec-estimate",
      headingEn: "Back-of-the-envelope: lock QPS and TTL",
      bodyEn: `This chapter’s back-of-envelope has to prove two things: **lock QPS is usually far below business QPS**; and **TTL is not a guess — it lines up with the business timeout**. Teaching numbers, not some company’s capacity plan.

Teaching assumption: ingress **10K QPS**; the ones actually fighting one lock are a hot SKU / a sharded job; global acquire/release about **1K / s**. A single hot lock is serial; effective throughput is capped by critical-section length.

| Item | Hand-calc | How you use it in the interview |
|---|---|---|
| Acquire/release QPS | 1K acquire/s, not 10K | Redis SET on one box is ~100K; **the lock service is usually not the bottleneck** |
| Hot-lock throughput | Critical section 20 ms → ~50/s | **Serial on one key** is the ceiling; split keys, do not cluster first |
| TTL | **10 s** | After a crash, stuck at most 10 s; too long and failover is slow |
| Business P99 | **2 s** | 5× headroom; if P99 is 12 s → the lock expires first |
| Hard timeout | **8 s** abort | Business timeout < lock TTL. That is a hard constraint |
| Watchdog | 30 s lease, renew ~every 10 s | Covers “alive but slow”; **cannot cover STW longer than remaining TTL** |

How you talk headroom: TTL should cover P99 + same-metro RTT + a little jitter, but it should not cover “might run a minute” — that just lengthens the deadlock window. A hard timeout (8 s abort) is cleaner than cranking TTL to 5 minutes. The watchdog renews the lease while “the process is alive”; the cost is that after a crash everyone waits one lease. That is a trade-off, not a free lunch.

**How you say it in the interview:**

> “Of ten thousand QPS, maybe a thousand actually hit the lock. Redis SET is not the bottleneck on this prompt — the same hot lock is. TTL ten seconds, business P99 two, hard timeout eight — the work must be shorter than the lock. Watchdog renews a thirty-second lease, but a GC pause longer than TTL can still dual-hold, so writes still need fencing.”

Do not reverse “Redis is fast” into “so we put Redlock on five nodes” — that is over-engineering.`,
    },
    {
      id: "sec-arch",
      headingEn: "High-level: Redis SET NX vs etcd lease",
      bodyEn: `On the whiteboard put two cells: **efficiency lock = Redis; want a consensus lease, then etcd / ZK.** Redlock is not a third default column — put it in why-not.

${D2}

This diagram cites: Ch41 replication, sharding, transactions

Hot path: Worker \`SET lock:sku token NX PX 10000\` succeeds → do the work → Lua checks the value is still its token, then \`DEL\`. etcd: hang the key on a **lease**, \`KeepAlive\` renews; session dies, key is gone. ZK: ephemeral sequential nodes, smallest seq holds the lock. Chubby is the same family (lock generation number as the fence). How consensus elects and replicates **points to Ch41** — do not unroll Raft logs on this board.

| | Redis SET NX (efficiency default) | etcd / ZK lease |
|---|---|---|
| Semantics | A TTL lease, not permanent exclusion | Session / lease; drop only when heartbeat dies |
| Latency | Sub-ms to ~1 ms | Usually 5–20 ms |
| Correctness | AP; primary failover can briefly dual-hold | Linearizable lease; still recommend fencing |
| Where the fence comes from | Separate \`INCR\` monotonic number, or a store version | etcd **revision** / ZK **zxid** |
| Fits | Already have Redis, dedup, short critical section | Already have a coordinator, leader election, correctness lock |

Two why-not sentences, then stop:

1. **Redlock (majority of five independent Redis)**: independent nodes ≠ consensus; it assumes bounded clocks and bounded pause; a UUID **cannot** be a fencing token. Not the default; the debate goes in the fold.
2. **If a DB unique constraint can do it, skip the lock.** \`INSERT … unique key\` failing means someone else already took the slot. An idempotency key, or \`UPDATE … WHERE version=\` on the inventory row, is often shorter and harder. A lock is coordination; the constraint is the store’s own mutual exclusion.

**How you say it in the interview:**

> “Efficiency lock: Redis SET NX. Correctness lock: same Redis plus fencing, or if we already have etcd / ZK, use a lease and revision / zxid as the fence. Do not default Redlock. If unique / CAS can do it, skip the lock.”

Stop the high-level here. Ask: “Two cells OK? Next I’ll write safe acquire/unlock, then why Redlock is not the default, then watchdog vs business timeout.”`,
    },
    {
      id: "sec-setnx",
      headingEn: "Deep dive · SET NX + TTL + safe unlock",
      bodyEn: `First hard part: **acquire must be one command that carries expiry; unlock must compare the owner — no raw DEL.**

The wrong split is two steps, \`SETNX\` then \`EXPIRE\`: process killed in between, the key has no TTL → **deadlock**. The 2026 board writes one line:

\`SET lock:sku <token> NX PX 10000\`

\`NX\` = write only if missing; \`PX\` = millisecond expiry. \`token\` is this holder’s random string (UUID) — **do not store 1**. Success enters the critical section; failure means you did not get it.

${D2}

Unlock: \`GET\` then \`DEL\` leaves a window where someone else already took the lock after TTL — you would delete **the next holder’s** key. Lua runs serially inside Redis:

\`\`\`
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end
\`\`\`

A pipeline can still be interleaved between commands. **Do not sell pipeline as a Lua substitute** (same sentence as Ch04 rate limiting).

${D2}

Reentrant (optional, not the default): the same owner token acquiring again **bumps a refcount +1**, unlock −1, DEL only at 0. Redisson does this in production. Open non-reentrant; add the counter if they ask — do not lead with a reentrant-lock kitchen sink.

One sentence on primary failover: the lock is in the primary’s memory, unreplicated, then failover — the new primary does not have the key, another client \`SET NX\` succeeds → **dual-hold**. WAIT a replica, or accept the window and fence. Replication expands in **Ch41**.

**How you say it in the interview:**

> “One \`SET token NX PX\`. The token names the holder. Unlock Lua: DEL only if the value is still mine. SETNX+EXPIRE and a raw DEL are both red flags. Reentrant is the same token plus a counter.”`,
    },
    {
      id: "sec-fence",
      headingEn: "Deep dive · fencing token vs Redlock",
      bodyEn: `Second hard part: **the lock expired, and the holder may still be alive.** That is not an implementation bug — it is the definition of a lease. Kleppmann (2016, *How to do distributed locking*) calls this a lease: GC pause, network delay, STW — the client thinks it still holds the lock, Redis already deleted the key, B acquired, A wakes and writes anyway.

A fencing token: every successful acquire issues a **strictly monotonically increasing** integer. You send that number with the write; storage remembers the highest it has seen and **rejects anything smaller**. A is 33, after expiry B is 34; A’s write carries 33, storage has already seen 34 → reject. The zombie write is fenced out.

On the Redis side: a separate \`INCR lock:sku:fence\` (this key **must not** expire with the lock), or etcd revision / ZK zxid. On the store: \`UPDATE … WHERE last_fence < $token\`. **The resource has to cooperate** — a third-party API that cannot do a conditional write cannot land fencing, and the lock is best-effort at best.

${D2}

This diagram cites: Ch41 replication, sharding, transactions

Redlock (Antirez): parallel \`SET NX PX\` to **N independent Redis** (often 5); you hold the lock only if you got a majority (≥3) *and* the elapsed time is still less than TTL; the remaining validity also subtracts clock-drift. It addresses “one Redis died and the lock vanished.” It does **not** give a comparable fencing number — the value is a random UUID, so storage cannot tell who is newer. A majority of independent nodes is **not** Raft / Zab: no replicated log, no shared state machine. Correctness also assumes network delay, process pause, and clock drift are all small vs TTL — real STW and an NTP step break that synchrony model.

So on a 2026 board: **do not default Redlock.** An efficiency lock is one Redis; a correctness lock needs fencing, or switch to an etcd/ZK consensus lease. Five independent Redis as “more correct” is a red flag. Antirez’s reply (*Is Redlock safe?*) grants you should use a monotonic clock, and argues relative timing is good enough in a datacenter — **both sides know that**. In the interview, stand on Kleppmann’s side as the correctness default; details go in the fold.

**How you say it in the interview:**

> “A lease expires, and the old holder may still write. A fencing token lets storage reject a stale number — that is the default patch when you write the store. Redlock has no monotonic token, it eats the clock, and independent nodes are not consensus. Not the default.”`,
    },
    {
      id: "sec-watchdog",
      headingEn: "Deep dive · watchdog vs GC pause / business timeout",
      bodyEn: `Third hard part: **business timeout must be shorter than lock TTL; a watchdog renews “the process is still alive,” not “I have not finished so I am forever safe.”**

The fixed-TTL bind: too short → live work is unfinished and the lock is gone; too long → after a crash everyone waits out expiry. A watchdog (Redisson \`lockWatchdogTimeout\` defaults to 30 s, renews about every TTL/3) — when you **did not set leaseTime** — keeps topping up TTL in the background: a live process can finish a long job; a dead process cannot renew, the lock expires on its own. If you *did* set leaseTime, it **does not renew** — that is you guaranteeing the critical section is shorter than the lease.

${D2}

The watchdog **stops with the business thread**. Full GC / a machine pause longer than remaining TTL: Redis expires anyway, B takes the lock, A wakes thinking it renewed and keeps writing. A renewer thread cannot save “the whole JVM is not running.” So: **a pause longer than TTL must be treated as the lock already lost**; writes still rely on fencing. Do not claim “we have a watchdog, so absolute mutual exclusion.”

Business timeout is a second axis people skip:

| Rule | Why |
|---|---|
| **Business hard timeout < lock TTL** (no watchdog) | Otherwise the lock is gone and you are still in the critical section — that *is* the double-write window |
| With a watchdog: still set a business hard timeout | Stops a runaway job; after a crash the wait ceiling is still one lease |
| Near TTL, abort — do not write storage | Cleaner than “renew once more and hope” |
| Compensate / roll back after timeout | The lock is not a transaction; Outbox / state machine in **Ch41** |

Teaching talk track: TTL 10 s, hard timeout 8 s, P99 2 s. A 30 s watchdog lease is only for “occasionally over 10 s but the process is healthy.” Money paths: **watchdog + fencing**, not either-or.

**How you say it in the interview:**

> “No watchdog: business timeout must be less than TTL. A watchdog renews a live process; a GC pause longer than TTL can still dual-hold. Still working after expiry is the real hard part on this prompt. Writes rely on fencing — do not fake it by cranking TTL to five minutes.”`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs the original book",
      bodyEn: `<details>
<summary>Redlock’s original blog vs Kleppmann; Antirez’s reply lives here</summary>

No matching Xu chapter — rebuilt from 2026 backend interviews. The internet still treats Redlock as “the correct way to lock with Redis.” That is 2010s doc inertia, not today’s whiteboard default.

| How it was taught then | How you answer now |
|---|---|
| Redis docs Redlock: 5 independent nodes, majority, subtract clock-drift | **Not the default.** Efficiency lock: one Redis SET NX. Correctness: fencing or etcd/ZK |
| Kleppmann 2016: Redlock eats synchrony assumptions, **no fencing token** | **The body takes this side** as the correctness answer |
| Antirez *Is Redlock safe?*: relative timing is enough; apps should use a monotonic-clock API | Fold admits the debate; correctness still does not open with Redlock |
| \`SETNX\` + \`EXPIRE\` tutorials everywhere | **One \`SET NX PX\`**. Two steps are a deadlock window |
| Watchdog = the lock is always correct | Only covers “alive but slow”; **STW > TTL still dual-holds** |
| Reentrancy as required | **Optional**: owner + refcount |
| Spin up a coordinator cluster for exclusion | If **UNIQUE / CAS** can do it, skip the lock |

The skeleton still holds: a lock is a lease, it must carry TTL, unlock compares the holder, a critical section that writes shared state needs a fence. What aged out is **Redlock as the HA default**, and **not treating “still working after expiry” as the hard part**.

One production sentence (this fold only): Redisson \`RLock\` has a watchdog; the newer \`RFencedLock\` returns a monotonic token on acquire — **storage still has to check**, the API is not magic. etcd lease / ZK ephemeral fencing uses revision / zxid; the mechanism chain is **Ch41**.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. “Why not SETNX then EXPIRE?” → Crash between the two steps, the lock has no TTL, deadlock. One \`SET NX PX\`.
2. “Why not unlock with a raw DEL?” → TTL fired, someone else holds it, you delete the next holder. Lua: DEL only if GET == my token.
3. “Why not default Redlock?” → Independent Redis ≠ consensus; eats clock and pause; a UUID cannot fence. Efficiency lock: one node is enough; correctness needs fencing or etcd/ZK.
4. “What is a fencing token?” → A monotonically increasing number on every acquire; send it with the write; storage rejects anything below the max it has seen.
5. “Can Redlock’s random value be a fence?” → No. Unordered. The resource cannot tell old from new.
6. “Does a watchdog make it safe?” → It only renews “the process is alive.” GC / pause longer than TTL stops the watchdog too — you can still dual-hold.
7. “Work longer than TTL?” → Hard-timeout inside the TTL; or watchdog + **still fencing**. Do not just crank TTL to five minutes.
8. “Vs a DB unique constraint?” → If \`INSERT\` unique / \`UPDATE … WHERE version\` can do exclusion, skip the distributed lock. A lock is coordination; the constraint is storage exclusion.
9. “How do you do reentrant?” → Same owner token + refcount, DEL at 0. Optional, not the opening.
10. “Redis primary failover?” → An unreplicated lock is lost; on the new primary someone else SET NX succeeds → dual-hold. WAIT or fencing. Replication detail in Ch41.
11. “When etcd / ZK?” → You already have a coordinator, you want a consensus lease, leader election. revision / zxid is a natural fence. Do not spin up a cluster for an efficiency lock.
12. “Guarantee absolute mutual exclusion?” → A lease cannot be absolute. Shared-state writes rely on fencing or a unique constraint. “Redlock is absolutely safe” is a red flag.`,
    },
    {
      id: "sec-next",
      headingEn: "What’s next",
      bodyEn: `Do not close by saying it is perfect. Three bottlenecks, talk track:

| bottleneck | How you pick it up |
|---|---|
| Still working after expiry | fencing; business timeout < TTL; pause > TTL means the lock is lost |
| Hot lock is serial | Split keys / shrink the critical section; do not cluster Redlock first |
| Failover dual-hold | Replication window + fencing; mechanism in Ch41 |

Self-check: close the page, 30-second opening; write \`SET NX PX\` and the Lua compare-and-del; say why Redlock is not the default; fencing token in one sentence; watchdog vs GC; why business timeout must be shorter than TTL. Wherever you stall, go back to that section.

**M2 classic bricks end here.** Design problems start at **Ch09 · Design a URL shortener**, already on the site (the case sample). You can go to Ch09 and open M3 now, or finish the later M3 prompts on the spine first. The skeleton lane (Ch02–Ch08) is closed; the next chapter is not another brick.`,
    },
  ],
  reviewMdEn: `# Ch08 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | Distributed lock — opening 30 seconds? | Efficiency lock: Redis SET NX PX + Lua unlock; writes get a fencing token; do not default Redlock; TTL lines up with business timeout. |
| 2 | Why must acquire be one SET NX PX? | SETNX then EXPIRE, crash in between → no TTL → deadlock. NX+PX is atomic. |
| 3 | Why unlock with Lua comparing the token? | A raw DEL can delete the next holder after TTL. DEL only if GET == my token. |
| 4 | Why is the token in the key? | Names the holder. Reentrant = same token + refcount. Do not store 1. |
| 5 | What is a fencing token? | A monotonically increasing number on every acquire; send it with the write; storage rejects anything below the max it has seen. |
| 6 | Why not default Redlock? | Majority of independent nodes is not consensus; eats clock and pause; a random UUID cannot fence. |
| 7 | Efficiency lock vs correctness lock? | Double-run is only wasted work → one Redis. Double-run corrupts data → fencing or etcd/ZK lease. |
| 8 | When etcd / ZK instead of Redis? | Already have a coordinator, want a consensus lease, leader election. revision / zxid as the fence. Do not spin up a cluster for dedup. |
| 9 | What does a watchdog renew solve / not solve? | Renews TTL for a live long job; crash stops renewing. GC pause longer than TTL stops it too — you can still dual-hold. |
| 10 | Business timeout vs lock TTL? | Business hard timeout must be < lock TTL (no watchdog). Still working after expiry is the hard part. |
| 11 | When should you skip a distributed lock? | When UNIQUE / CAS / an idempotency key can do exclusion. A lock is coordination; the constraint is storage exclusion. |
| 12 | Redis primary failover and locks? | An unreplicated lock is lost; on the new primary someone else SET NX → dual-hold. WAIT or fencing. Ch41. |
| 13 | What is the hot-lock bottleneck? | One lock is serial; throughput ≈ 1/critical-section. Split keys; do not jump to five-node Redlock. |
| 14 | Typical over-engineering on this prompt? | Redlock as the first answer; etcd for an efficiency lock; cranking TTL to five minutes to pretend you solved expiry double-write. |`,
});
