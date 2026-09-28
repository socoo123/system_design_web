import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch07",
  titleEn: "Distributed unique IDs",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 40–50 min ｜ **Prereq**: Ch09 short codes — do not use Snowflake
> **Goal**: default **Snowflake**; contrast UUID / segment IDs; bring up clock rollback yourself.

Distributed unique IDs are the fourth brick in M2: order IDs, message IDs, trace_id, primary keys — all need an integer that never collides. They do not want you reciting four schemes as equals. They want three sentences you can hand-calc: **for ordered 64-bit, default Snowflake; UUID v4 is unordered, segment IDs give DB-friendly auto-increment; bring up clock rollback yourself.**

The hard part (the piece worth digging) is those three. Ticket Server / multi-master auto_increment are why-nots — do not put them next to Snowflake as “four equivalent answers.” Sonyflake / ULID go in the fold. **Do not feed Snowflake to a 6-char short code** — Ch09 already did the math: Snowflake is ~10^18, base62 is about 11 chars.`,
    },
    {
      id: "sec-answer",
      headingEn: "How to answer in the interview",
      bodyEn: `### Opening 30 seconds

> “Globally unique, 64-bit integer, roughly increasing, 10K+ QPS. UUID v4 you can mint locally, but it is unordered — not a clustered primary key. If you need strict +1 and a B+ tree-friendly write, use segment IDs (Leaf). Otherwise default Snowflake: 1 sign + 41 timestamp + 10 worker + 12 sequence, 4096 IDs per millisecond per box. The hard part is clock rollback — NTP and VM migration can push wall clock backwards: small skew, wait; large, refuse. Do not use Snowflake for short codes; that is a segment-ID job.”

Then walk that chain. Do not open by reciting Ticket / multi-master / Sonyflake / ULID as a kitchen sink.

${D2}

| Time box | What you are doing |
|---|---|
| 3–5 min | Clarify: 64-bit vs 128; roughly increasing vs strict +1; contiguous or not; QPS |
| 2 min | Back-of-the-envelope: mint QPS; 4096/ms per box; how many years 41 bits buy |
| 8–12 min | High-level: three schemes side by side; Snowflake hot path has no coordinator |
| 10–15 min | Deep dive: hand-calc bit layout, how you claim a segment, three-tier clock rollback |
| 2–3 min | Wrap-up: colliding worker ids, sequence exhausted, short codes are not Snowflake |

**red flag:** treating four schemes as equivalent implementations; never mentioning rollback; truncating Snowflake into a 6-char short code; opening by drawing a Ticket cluster.`,
    },
    {
      id: "sec-clarify",
      headingEn: "Clarifying questions",
      bodyEn: `If you have not pinned “how long, do we need ordered,” Snowflake and segment IDs later are empty. Ask 5–7, then stop; the rest you write as assumptions. The math on short-code length goes to **Ch09**. This chapter only decides **the shape of the ID**.

| You ask | Why | Default you write on the board |
|---|---|---|
| 64-bit integer, or a 128-bit string? | 64-bit is the Snowflake path; only if they accept 128 do you bring up UUID | “64-bit long, roughly increasing” |
| Roughly increasing, or must it be strict +1? | Strict contiguous = segment IDs; Snowflake only guarantees later IDs are larger | “Roughly is enough; gaps OK” |
| Must IDs be contiguous? Can they leak volume? | Contiguous auto-increment leaks order volume; ordered ≠ gap-free | “No need to be contiguous” |
| Roughly what QPS? Bursty? | 10K is easy for Snowflake; segment IDs you back-solve DB from step | “Peak 10K IDs/s” |
| Used as a DB primary key? InnoDB clustered? | Unordered UUID scatters B+ tree pages | “Yes as PK → no UUID v4” |
| Is this a short / public-facing code? | A 6-char short code is not this prompt’s Snowflake | “Internal ID; short codes → Ch09” |

When they say “you assume,” write it up:

> “Assume: globally unique, 64-bit integer, roughly increasing, not contiguous. Peak about 10K QPS. Default Snowflake. If they need strict +1, switch to segment IDs. Not a 6-char short code.”

The moment they say “6-char short URL code,” **switch to segment IDs immediately**. Do not rewrite this chapter into Ch09.`,
    },
    {
      id: "sec-estimate",
      headingEn: "Back-of-the-envelope: mint QPS and bit headroom",
      bodyEn: `This chapter’s back-of-envelope has to prove two things: **minting itself is usually not the bottleneck**; and **bit width sets lifetime and per-box cap, so you have to hand-calc headroom**. Teaching numbers, not some company’s capacity plan.

Teaching assumption: peak **10K IDs/s** (book order of magnitude); classic Snowflake layout 1 + 41 + 10 + 12.

| Item | Hand-calc | How you use it in the interview |
|---|---|---|
| Per-box sequence | 2^12 = **4096 / ms** | ×1000 ≈ **4.1 million / s / worker** |
| vs 10K QPS | 4e6 / 1e4 = **400×** | One worker is enough; do not draw a cluster for minting |
| Timestamp lifetime | 2^41 ms ≈ 2.2e12 ms | / 1000 / 86400 / 365 ≈ **69 years** |
| Worker bits | 2^10 = **1024** workers | 5 DC + 5 machine, or fold into 10 bit |
| Segment DB | step = 1000 | DB QPS ≈ 10K / 1000 = **10** |

How you talk headroom: 41 bits use a custom epoch (do not start at 1970 — you waste the high bits). When it expires, swap the epoch or steal bits for time. Sequence exhausted in the same millisecond → wait for the next ms. That is the hard throughput cap, not “add a Ticket.” Fewer than 1024 machines: steal bits from sequence; the trade-off is per-box burst drops.

**How you say it in the interview:**

> “Ten thousand QPS, Snowflake is four million per box per second — two orders of headroom. 41 bits is about 69 years. Segment IDs with step 1000, DB is about ten writes a second. Minting is not the bottleneck on this prompt.”

Do not reverse 4e6 into “so we need 200 ID servers” — that is over-engineering.`,
    },
    {
      id: "sec-arch",
      headingEn: "High-level: three schemes side by side",
      bodyEn: `On the whiteboard put three cells, **check Snowflake as the default**. UUID v4 and segment IDs are contrast, not peer implementations you also have to build. Ticket / multi-master auto_increment get one why-not sentence — no fourth column.

${D2}

Hot path: a Snowflake worker **locally** packs 64 bits. Minting does not hit DB, does not hit ZK. Segment IDs are the ones that “claim a range, then increment in memory.” UUID v4 is also local, but unordered.

| | Snowflake (default) | Segment / Leaf | UUID v4 |
|---|---|---|---|
| Length | 64-bit integer | 64-bit integer | 128-bit |
| Ordered | Roughly increasing | Strict +1 (inside a segment) | No |
| Hot path | No coordination | Occasional DB claim | No coordination |
| Clock | Depends on wall clock | Does not | None |
| Fits | Orders / messages / PK | DB-friendly, short codes | Docs / resource IDs |

Two why-not sentences, then stop:

1. **Multi-master auto_increment + step k**: adding a box means changing the step, and IDs still do not track time.
2. **Ticket Server** (Flickr’s one auto-increment table): the numbers are simple, but it is a single point; split it across boxes and you are back at scheme 1.

**How you say it in the interview:**

> “Default Snowflake: mint locally, roughly increasing. Need strict +1 or a short code → segment IDs. UUID v4 is not a PK. Ticket and multi-master are why-nots.”

Stop the high-level here. Ask: “Three cells OK? Next I’ll say why we pick this, then hand-calc the bits, then I’ll bring up rollback myself.”`,
    },
    {
      id: "sec-why",
      headingEn: "Deep dive · why Snowflake / UUID / segment IDs",
      bodyEn: `First hard part: **none of them is “the default” in a vacuum — the requirements knock the other two out.**

UUID v4: random 128 bits locally, collision probability is ignorable, **zero coordination**. The cost is unordered — an InnoDB clustered PK randomly inserts pages: page splits, cache misses. Index and storage are also more expensive than an 8-byte long. So on the board: “simple but not sortable; not the PK on this prompt.”

Segment IDs (Leaf-segment): one DB row \`biz_tag / max_id / step\`. The app claims \`[max_id, max_id+step)\` once, mints from memory, then claims again. DB load drops by step; inside a segment you get strict +1, sequential B+ tree writes. **No clock**, so no rollback. Cost: you depend on the DB; gaps between segments (process dies with unused IDs); neighboring instances claim adjacent ranges, so IDs are guessable.

${D2}

This diagram cites: Ch09 short URL (6-char short codes use segment IDs, not Snowflake)

Production often uses a **double buffer**: async-claim the next range before the current one is empty, so claim jitter does not land on the hot path. One sentence on the board is enough.

Snowflake: timestamp in the high bits → later IDs are larger; worker bits keep boxes from colliding; sequence keeps the same millisecond from colliding. Hot path is zero network. That is the 2026 whiteboard default for “ordered unique 64-bit.”

Short-code pointer (do not expand on this prompt): 6-char base62 needs ID < 62^6 ≈ 56.8 billion. Snowflake is ~10^18, which encodes to about 11 chars. **Truncating drops uniqueness.** Short codes use segment IDs or DB auto-increment — **Ch09**.

**How you say it in the interview:**

> “UUID is unordered, so I knock it out as a PK. Segment IDs for strict +1 and short codes. Ordered 64-bit I use Snowflake. Do not truncate Snowflake to 6 chars.”`,
    },
    {
      id: "sec-bits",
      headingEn: "Deep dive · bit layout and throughput",
      bodyEn: `Second hard part: draw 64 bits as **4–5 coarse boxes**, and be able to hand-calc. Do not draw 64 tiny cells.

Classic Twitter (positive signed long):

\`1 sign | 41 timestamp (ms) | 5 datacenter | 5 worker | 12 sequence\`

Datacenter + machine often fold into a **10-bit worker**. Sign bit stays 0 so a signed 64-bit stays positive.

${D2}

Timestamp sits in the **highest significant slice** (after the sign): comparing IDs ≈ comparing mint time. That is where “roughly increasing” comes from, and also why rollback can reorder / collide.

Same millisecond: sequence +1; past 4095 it overflows → **wait for the next millisecond**, seq resets. Not “switch to a Ticket.”

worker_id must be globally unique. Collision = two boxes emit the same sequence in the same millisecond → duplicate IDs. Three ways to assign, name them and stop: hand-fill in config (easy to get wrong); claim at startup from etcd / ZK (the original did this); DB \`INSERT … RETURNING\`. Production should not rely on a human filling it in.

Custom epoch: start from the day the product ships, and 41 bits actually give you the full 69 years. Starting at Unix 1970 wastes the high bits on decades before you even launched.

**How you say it in the interview:**

> “1+41+5+5+12. Timestamp in the high bits, so roughly increasing. 4096 per millisecond per box; if you fill it, wait for the next ms. Workers claim an id at startup — do not hand-fill two boxes the same.”`,
    },
    {
      id: "sec-clock",
      headingEn: "Deep dive · clock rollback",
      bodyEn: `Third hard part: **Snowflake depends on this box’s wall clock moving forward.** NTP stepping backwards, VM migration, leap seconds — any of them can make \`now < last_ts\`. If you still mint from seq=0 at the new time, you can collide with a historical ID, or emit something smaller than what you already issued.

The book only said “use NTP.” A 2026 whiteboard wants you to **bring up detection + three-tier handling yourself** — that is the signal.

${D2}

| Tier | What you do | When |
|---|---|---|
| **Wait** | \`sleep\` until \`now >= last_ts\` | Rollback is tiny (a few ms) |
| **Refuse** | Error, alert, this box stops minting | Rollback is large; this machine’s clock is no longer trusted |
| **Reserved bits** | During rollback, switch to spare sequence space, or pin last_ts and keep bumping seq | You do not want to stop, and you still need (time, seq) unique |

Wait is the usual interview default: trade a little latency for correctness on small jitter. Large rollback you cannot spin-wait forever — it may never come back. Fail and alert. Twitter’s original refused any rollback with \`InvalidSystemClock\`, which is strict; production often splits into wait-small / refuse-large.

Reserved / borrowed bits: carve a slice out of the 12 sequence bits, or an extra 1 bit that marks “this is rollback logical time.” During rollback you do not follow wall clock; you keep incrementing on the largest stamp you already issued. IDs stay unique and monotonic; the embedded time just runs a little ahead. Putting this cell on the board proves you know there is a third path. Do not expand it into an HLC lecture.

One ops sentence against rollback: NTP **slew** (drag slowly), not a hard step. That lowers how often it happens. It **does not replace** detection in code.

Why segment IDs do not care: in-memory counter + DB \`max_id\`, no wall clock. That is the reason to switch to segment IDs when “the PK must survive clock rollback.”

**How you say it in the interview:**

> “Snowflake’s biggest pit is clock rollback. I detect \`now < last_ts\`: small, wait; large, refuse and alert. If I have spare bits I reserve sequence as a logical clock. Segment IDs do not eat the clock. ‘Just run NTP’ is a red flag.”`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs the original book",
      bodyEn: `<details>
<summary>What the book / notes said then · Ticket as a peer, rollback is just NTP, variants live here</summary>

| Book / notes | How you answer now |
|---|---|
| Multi-master / UUID / Ticket / Snowflake as four peer schemes | **Body default is Snowflake**. UUID and segment IDs are contrast. Ticket and multi-master are why-nots |
| Clock rollback in one NTP sentence | **Bring up wait / refuse / reserved bits yourself**. NTP slew is ops, not code |
| Never mention segment IDs | Strict +1, B+ friendly, short codes → **segment / Leaf**. Double buffer in one sentence |
| Never mention UUIDv7 | **One sentence**: RFC 9562 (2024) time prefix + random, 128-bit sortable; use it when they accept 128 bits and you do not want to coordinate workers. **Not** a replacement lecture for this prompt’s 64-bit default |
| Snowflake variants in the body | **One fold line**: Sonyflake is more conservative (rollback only sleeps); ULID is a 128-bit sortable code. Baidu UidGenerator pre-borrows future time — name it and stop |
| Short codes on Snowflake | **Do not.** 6-char short codes use segment IDs, Ch09 |

The book skeleton still holds: unique, 64-bit, roughly increasing, Snowflake bit slices. What aged out is **giving Ticket the same length as Snowflake as a third answer**, and **not treating rollback as the hard part**.

UUIDv7 (this fold only): 48-bit Unix ms + random (optional monotonic counter). Sortable, no worker registration, databases are starting to support it natively. Still 128-bit, fatter index than a long; first sentence for a 64-bit ordered ID is still Snowflake.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. “Why not UUID?” → v4 is unordered; clustered PK page-splits. Want zero coordination and sortable, one sentence on UUIDv7 (128-bit); 64-bit still Snowflake.
2. “Why not Ticket / multi-master auto-increment?” → Ticket is a single point; multi-master changing the step when you add a box, and IDs still do not track time. why-not.
3. “How long do 41 bits last?” → About 69 years (2^41 ms). Custom epoch. Swap the epoch when it expires.
4. “Why not Unix 1970?” → Wastes high bits. Start from the day you ship.
5. “Max IDs per millisecond per box?” → 4096. Beyond that, wait for the next ms.
6. “Clock rollback?” → Wait-small, refuse-large; you can reserve sequence bits. NTP alone is not enough.
7. “How do you assign worker_id?” → Claim at startup (etcd / ZK / DB). Two boxes hand-filled the same → colliding IDs.
8. “Why are segment IDs rollback-proof?” → Memory + DB max_id, no wall clock.
9. “Why not Snowflake for a 6-char short code?” → Magnitude too big; base62 is about 11 chars; truncating drops uniqueness. Segment IDs, see Ch09.
10. “More than 1024 machines?” → Steal bits from sequence; or claim workers dynamically. Do not switch to Ticket for this.
11. “Must IDs be contiguous?” → Usually no. Contiguous leaks order volume; roughly increasing is enough for the index.
12. “Draw all four schemes?” → over-engineering. Default Snowflake + two contrast cells + rollback.`,
    },
    {
      id: "sec-next",
      headingEn: "What’s next",
      bodyEn: `Do not close by saying it is perfect. Three bottlenecks, talk track:

| bottleneck | How you pick it up |
|---|---|
| Clock rollback | Detect; wait-small / refuse-large; segment IDs survive the clock |
| Colliding worker ids | Claim at startup; never hand-fill duplicates |
| Sequence exhausted in the same ms | Wait for the next millisecond; do not switch to a central Ticket |

Self-check: close the page, 30-second opening; draw 1+41+5+5+12; hand-calc 4096/ms and 69 years; three-tier rollback; say why short codes are not Snowflake. Wherever you stall, go back to that section.

Next chapter **Ch08 · Distributed locks**: mutual exclusion, fencing token, why Redlock is not the default.`,
    },
  ],
  reviewMdEn: `# Ch07 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | Ordered 64-bit ID — opening 30 seconds? | Default Snowflake; UUID v4 unordered, not a PK; strict +1 use segment IDs; bring up clock rollback yourself. |
| 2 | Snowflake bit layout? | 1 sign + 41 timestamp + 5 datacenter + 5 worker + 12 sequence (workers often fold into 10 bit). |
| 3 | IDs per millisecond per box? When full? | 4096. Overflow → wait for the next ms, seq resets. |
| 4 | How long do 41 timestamp bits last? | About 69 years. Custom epoch; do not start at 1970. |
| 5 | Why timestamp in the high bits? | Later IDs are larger → roughly increasing. Also why rollback reorders / collides. |
| 6 | Why is UUID v4 not the default PK? | 128-bit and unordered; B+ tree random page inserts. |
| 7 | What are segment IDs for? | Strict +1, DB-friendly, short codes. No clock. |
| 8 | How do segment IDs cut DB load? | Claim \`step\` IDs at a time, mint from memory; double-buffer the next range. |
| 9 | Three tiers of clock rollback? | Small: wait. Large: refuse and alert. Third: reserve / borrow sequence bits as a logical clock. |
| 10 | Is “just use NTP” enough? | No. NTP slew lowers frequency; code must detect now < last_ts. |
| 11 | Why not Snowflake for short codes? | Snowflake ~10^18 → base62 about 11 chars. 6-char uses segment IDs. Truncating drops uniqueness. Ch09. |
| 12 | Why Ticket / multi-master are why-nots? | Ticket is a single point; multi-master changing the step, IDs still do not increase with time. |
| 13 | How do you keep worker_id from colliding? | Claim at startup from etcd/ZK/DB. Two boxes hand-filled the same emit duplicate IDs. |
| 14 | Typical over-engineering on this prompt? | Drawing four schemes evenly; a Ticket cluster for 10K QPS; turning UUIDv7 into a replacement lecture. |`,
});
