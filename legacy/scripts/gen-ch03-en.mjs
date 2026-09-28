import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch03",
  titleEn: "Back-of-the-envelope estimates",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 50–60 min ｜ **Prereq**: Ch01 4-step method; Ch02 scale narrative
> **Goal**: do back-of-the-envelope on the whiteboard: write assumptions first, then size QPS / storage / bandwidth / machines; latency is 2026 memory / NVMe / same-city / cross-continent—HDD is not the first answer.

Ch01 is the time-box. Ch02 is how architecture grows. This chapter is **the 2–4 minutes of numbers inside Step 1–2**. Most people can draw boxes. They cannot say whether it is 1K or 100K QPS—that is the gap.

This is not a 4-step design prompt. There is no final diagram to memorize. The hard part (the piece worth digging) is: **write assumptions clearly, get the order of magnitude right, and let the numbers decide cache / sharding / multi-Region.** How components are built lives in Ch02 / M2. CAP / SLO mechanism points at **Ch36**. Here you only memorize how many nines map to how much downtime.`,
    },
    {
      id: "sec-answer",
      headingEn: "How to answer in the interview",
      bodyEn: `### Opening 30 seconds

> “I’ll start with back-of-the-envelope. Assumptions on the board: DAU, ops per user, read:write, peak multiplier. Then I’ll walk QPS, storage, bandwidth, machine order of magnitude—round the numbers, label the units. Peak is average ×2–3. Latency I’ll use memory / NVMe / same-city / cross-continent, not the 2010 HDD table.”

Then start listing assumptions. Do not draw architecture first. They want the reasoning, not you reciting some company’s internal QPS.

### Estimate cadence (say this out loud)

On a real prompt this slot is **2–4 minutes** (between clarify and high-level). This chapter unpacks it for practice; in the room compress back to this table:

| Beat | What you are doing | Stop signal |
|---|---|---|
| 30 sec | Opening + write the 4 assumptions | They nod or correct a number |
| 1–2 min | QPS (incl. peak) + read:write | Average / peak two lines on the board |
| 1 min | Storage × replicas; bandwidth watch B vs b | Order of magnitude lands (GB / TB / PB) |
| 30 sec | Machine order of magnitude + one cost line | “Tens of boxes or thousands” |

**Discipline:** round (\`86400 ≈ 10^5\` seconds); every number has a unit; assumptions stay on the board so you can look back. Three decimal places is a red flag—that is not back-of-the-envelope.

Finish with one sentence that hooks numbers to architecture: “read:write ≈ 20:1, so cache first, not sharding first.” Without that sentence, the estimate is just accounting.`,
    },
    {
      id: "sec-clarify",
      headingEn: "Clarifying questions",
      bodyEn: `Ask before you estimate. Wrong numbers, and every component after that is over-engineering the wrong scale. Stop at 5–7 questions; the rest you assume and write on the board.

| You ask | Why | Default you write on the board |
|---|---|---|
| Is “a million” DAU, MAU, or total signups? | Only DAU goes into the QPS formula | “Assume 10M DAU” |
| Reads / writes per user per day? | No per-user ops → no QPS | “10 reads, 1 write per user” |
| Rough read:write? | Directly shifts the architecture | “Start at 10:1; you can change it” |
| Peak multiplier? Any sale / promo? | They love catching a missed peak | “Daily ×2–3; promo we talk ×10” |
| Record size, retention? | Storage and bandwidth | “Text 1 KB; media separate; keep 1 year” |
| Users across continents? Latency budget? | Same-city ms vs cross-continent hundreds of ms | “One Region first; cross-continent then add CDN” |

If they say “you assume” → do not sit silent waiting for perfect numbers. Write: “Assume 10M DAU, read-heavy, peak ×3, one Region first.” Wrong, they will correct.

Do not invent “Company X runs 370K QPS in prod.” Use public teaching assumptions, and label them as assumptions.`,
    },
    {
      id: "sec-map",
      headingEn: "High level: 5-step estimate map",
      bodyEn: `The whole chapter walks this chain. In the room, say it at the board. Do not skip a step.

${D2}

Talk track:

> “Five steps: assumptions → QPS (incl. peak) → storage (incl. replicas) → bandwidth and machines → cost order of magnitude. I’ll start from assumptions.”

Below we unpack the tools for each step: powers of 2, the 2026 latency table, the formulas, a few nines. Short hand-calc examples come after the formulas. The old HDD table lives in the fold.`,
    },
    {
      id: "sec-latency",
      headingEn: "Powers of 2 and the 2026 latency table",
      bodyEn: `### Powers of 2

Capacity uses powers of 2. Estimates are an order-of-magnitude game; approximating to a power of 10 is enough.

| Unit | Power of 2 | Interview mnemonic |
|---|---|---|
| KB | 2^10 | ≈ 10^3 |
| MB | 2^20 | ≈ 10^6 |
| GB | 2^30 | ≈ 10^9 |
| TB | 2^40 | ≈ 10^12 |
| PB | 2^50 | ≈ 10^15 |
| EB | 2^60 | ≈ 10^18 |

Mnemonic: \`1K=10^3 · 1M=10^6 · 1G=10^9 · 1T=10^12 · 1P=10^15\`. One day ≈ **10^5 seconds** (exactly 86400; mental math divide by 10^5).

**1 byte = 8 bits.** Storage uses Byte (B); bandwidth uses bit/s (bps). Lowercase \`b\` = bit, uppercase \`B\` = Byte. Mix them and you are off by 8×—a classic red flag.

### 2026 latency table (this is what the body memorizes)

Public, citable anchors come from modern revisions of Jeff Dean / Norvig “Numbers Every Programmer Should Know,” plus public cloud RTT order of magnitude across AZ / Region. **Do not memorize them as some company’s internal SLO.** The interview wants order of magnitude, not microsecond precision.

| Anchor | Interview order of magnitude | How you use it |
|---|---|---|
| DRAM reference | **~100 ns** | Baseline for every comparison; DDR5 is still this order |
| NVMe random read 4 KB | **~10–100 μs** (remember **100 μs**) | ~1000× slower than memory; not 2010 “disk” |
| Same-DC / same-city Ethernet RTT | **~0.2–0.5 ms** (same-city can be 1–5 ms) | Service-to-service call as **0.5 ms** |
| Cross-AZ RTT | **~1–2 ms** | Sync across AZ lands on the critical path |
| Cross-continent RTT | **~80–200 ms** (remember **150 ms**) | US–EU often ~80–120; US–Asia ~150–200; speed-of-light floor |

${D2}

This diagram cites: Ch37 storage choice · Ch38 cache and CDN

Order of magnitude (say it without looking):

- **ns**: CPU cache, DRAM
- **μs**: NVMe random read
- **ms**: same-city Ethernet, cross-AZ
- **hundreds of ms**: cross-continent, object-storage first byte (often 20–100 ms)

How to use this table in the interview (three sentences are enough):

1. “Cache is ~1000× faster than a DB on NVMe—cache is for hot keys and offloading queries, not because the disk still seeks 10 ms.”
2. “Ten serial RPCs in the same city ≈ 5 ms; parallelize or batch; do not stack sync cross-AZ on top.”
3. “Cross-continent 150 ms you cannot change. Global users get CDN / multi-Region. Do not promise 50 ms worldwide from one Region.”

HDD seek ~10 ms and the full 2010 table live in the fold “what the book said.” The body’s first answer is always the table above.`,
    },
    {
      id: "sec-dims",
      headingEn: "QPS · storage · bandwidth · machines",
      bodyEn: `Steps 2–5 of the five-step map are formulas. Write the formula first, then plug in, so they can follow.

### QPS

\`average QPS = DAU × ops per user / 86400\`

Whiteboard mental math: \`/ 10^5\`. **Write read QPS and write QPS separately.**

\`peak QPS = average × 2~3\`

Promo / live event then ×10. Only quote average and patch “what about peak?” when asked—that is a red flag.

### Storage

\`daily growth = write QPS × 86400 × record size\`

\`total = daily growth × days × replicas\`

Replicas start at ×3 (multi-AZ copies + do not forget backups). If they ask “in three years,” multiply a growth factor. Media and metadata separate: pictures go to object storage; do not size 1 MB images inside the row store. Tiers (hot / warm / cold) point at **Ch43**.

### Bandwidth

\`bps = QPS × bytes per request × 8\`

Split ingress / egress. Once you put media on the read path, you often land on “must have CDN”—that is the point of the estimate. \`100 Mbps\` = \`12.5 MB/s\`. Do not treat Mbps as MB/s.

### Machines and cost order of magnitude

\`machines ≈ max(QPS / per-box QPS, data / per-box disk) × 1.5~2\`

Per-box capacity uses **public order of magnitude**, not a fake company load test: stateless web tens of thousands QPS / box; cache instance hundreds of thousands QPS order; a single DB on NVMe reads far above HDD-era intuition. The ×1.5–2 redundancy is for failover, not to inflate the number.

Cost: machine count × public cloud-VM order + storage GB·month. In the interview **“a few thousand USD a month vs a few hundred thousand”** is enough. Do not quote internal discounts, and do not dump a cloud SKU list as the body.

Order of magnitude (for calibration, not an SLA):

| Read QPS order | Intuition |
|---|---|
| ~10K | One box + NVMe often holds; going distributed needs a reason |
| ~100K | LB + multiple boxes; read:write decides cache |
| ~1M | Cache / CDN / sharding enter the high-level picture |
| ~10M | Whole path; find which bottleneck first, do not just add machines |`,
    },
    {
      id: "sec-nines",
      headingEn: "Availability nines",
      bodyEn: `A few nines = how much downtime you allow per year. **Memorize 3 / 4 / 5.** This is the input to the error budget, not a CAP lecture—mechanism, PACELC, SLO vs SLA live in **Ch36**.

| Availability | Downtime / year (approx) | How you use it |
|---|---|---|
| 99% (2 nines) | 3.7 days | Internal tools |
| 99.9% (3 nines) | **8.8 hours** | Common cloud floor |
| 99.99% (4 nines) | **53 minutes** | Core product often talks this |
| 99.999% (5 nines) | **5 minutes** | Finance / telco; cost jumps |

${D2}

This diagram cites: Ch36 Trade-off (CAP / PACELC / SLO)

3 nines → 4 nines, yearly downtime drops **10×**. Money does not drop 10×—it is multi-AZ, automatic failover, drills. 5 nines usually wants multi-Region active-active + chaos; cost steps up again.

Say this unprompted: **not every system needs 5 nines.** Core payments can be 4 nines; edge features 3 nines. Site-wide 5 nines is over-engineering. If they ask RPO / RTO, one line: social can live with second-class loss + minute-class recovery; payments are stricter—expand in Ch36 / Ch41. Do not turn this into a replication-protocol lecture.`,
    },
    {
      id: "sec-examples",
      headingEn: "Three short examples",
      bodyEn: `All of these are **public teaching assumptions**, not some company’s dashboard. If they bring up the book’s Twitter 2010 numbers, treat those as teaching assumptions too—see the fold.

### Short URL

Assume: 100M DAU, 5 ops per user (create or click), 10% creates. Short-code record ~500 B, keep 10 years.

Write QPS ≈ \`1e8 × 5 × 0.1 / 86400 ≈ 600\`; read QPS ≈ \`5200\`; peak read ×3 ≈ **15K**. Daily growth ≈ \`600 × 86400 × 500 B ≈ 26 GB\`; 10-year raw ~95 TB, ×3 replicas ~ **280 TB**.

Conclusion: read:write ≈ 9:1, the system is not huge. A decent KV box can take the read throughput; extra replicas are for HA. **Do not** draw global sharding for this prompt—that is over-engineering. Full problem is Ch09.

### Feed order of magnitude

Assume: 10M DAU, 2 posts per user, 20 refreshes.

Write QPS ≈ \`1e7 × 2 / 86400 ≈ 230\`; read-request QPS ≈ \`2300\`; peak ×3 ≈ **7K**. read:write ≈ 10:1. If one refresh then fans out to 20 items, downstream reads amplify—that is Ch11 push vs pull. At estimate time, get **request QPS** right first.

Conclusion: read-heavy, so cache should show up in the high-level picture; write volume is not yet “must shard.” Media is a separate object-storage + CDN bill.

### Chat

Assume: 10M DAU, 40 messages per user, 200 B each, message bodies kept 7 days.

Write QPS ≈ \`1e7 × 40 / 86400 ≈ 4600\`; peak ×2 ≈ **9K**. Daily growth ≈ \`4600 × 86400 × 200 B ≈ 80 GB\`; 7-day bodies ~560 GB. Group-chat fan-out amplifies **reads**, but disk is still not the hard part.

Conclusion: the pain is long-lived connection count and fan-out, not TB-class storage. Do not open by designing for “massive disks.” Full problem is Ch12.`,
    },
    {
      id: "sec-deep",
      headingEn: "Three deep dives",
      bodyEn: `Once the numbers are up, they will ask “so what.” These three are the hard part that hooks estimates to architecture. Pick one and go deep. Do not recite all three and walk away.

### 1. Peak ×2–3

Average QPS answers “can we live on a normal day.” **Peak decides how much headroom you buy, and whether you need to shed load.** Daily ×2–3 covers morning/evening peaks. Promo / Super Bowl-class then ×10—that is the reason for queues and degradation (point at **Ch42**), not standing up every machine at ×10 all year. That is a cost red flag.

Typical miss: you sized DB connections and disk IOPS to the average; they blow first at peak; cache hit rate drops and you avalanche. In wrap-up, add one line unprompted: “Peak I size at ×3 headroom; beyond that, rate-limit + degrade, not linear add-machines.”

### 2. How read:write changes the architecture

After QPS, **say read:write immediately.** That sentence is worth more than another 10% of QPS precision.

${D2}

This diagram cites: Ch38 cache and CDN · Ch42 messaging, elasticity, container mental model

Reads far above writes (10:1, 100:1): cache + CDN + replica. Writes far above reads: MQ to shed the peak, batched writes, do not let the sync path eat a write flood. Reads and writes close (chat, collab): stateless + more careful consistency. Do not pretend “just add Redis” is the end.

### 3. NVMe rewrites the conclusion; bandwidth B vs b

The 2010 story is “disk is slow → must cache → shard soon.” **NVMe pulled random reads from ~10 ms down to ~100 μs.** Single-box OLTP can take an order of magnitude more reads than most people’s intuition.

${D2}

This diagram cites: Ch37 storage choice · Ch38 cache and CDN

How to open in 2026:

- **You still want cache.** The reason is hot keys, cross-continent RTT, and offloading query planning / serialization—not “disk seeks 10 ms.” The user’s 50–150 ms to the site often already dwarfs one NVMe read.
- **Shard on write QPS and data size**, not on “we used a database.” 10K QPS reads + NVMe: scale up / replica first. Do not jump to 64 shards—that is over-engineering.
- **Bandwidth:** \`1 MB × 8 = 8 Mb\`; on a 100 Gbps link, send time is about **0.08 ms**. Do not mash send time and RTT into one number. Object-storage GET first byte is often tens of ms—that is not the same class of latency as NVMe.`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs the original book",
      bodyEn: `<details>
<summary>What the book / notes said then · HDD table and 2010 latency live here</summary>

| Book / notes | How you answer now |
|---|---|
| Jeff Dean 2010 table: HDD seek ~10 ms, same-DC 0.5 ms, transcontinental 150 ms as the main memory | **Body** uses DRAM / NVMe / same-city / cross-AZ / cross-continent; HDD is cold archive only |
| SSD random read written as ~150 μs, conclusion still “disk is slow” | NVMe commonly **10–100 μs**; bottleneck moves to cross-AZ / cross-continent / object-storage first byte |
| Mechanical seek, HDD sequential 1 MB ~30 ms as must-memorize | Interview default medium is NVMe; HDD numbers you can admit “I know,” not as the first answer |
| Only estimate QPS + storage | Add peak, bandwidth (B vs b), machine order of magnitude, cost order of magnitude |
| Twitter example: 300M MAU, write ~3500 QPS, reads at 100:1 pulled to 350K | **Teaching assumption** (the book’s signature), not a Twitter production dashboard; media bandwidth is how you argue CDN |
| Availability only as SLA | A few nines vs downtime; SLO mechanism waits for Ch36; this chapter does not expand |
| Did not stress read:write | After QPS, say read:write unprompted, then pick cache / MQ / sharding |

**2010 latency table (contrast only; do not open 2026 with this):** L1 ~0.5 ns · DRAM ~100 ns · HDD seek ~10 ms · same-DC RTT ~0.5 ms · transcontinental ~150 ms. Cross-continent 150 ms still holds (speed of light); what changed is the **disk**.

The notes also dump object-storage GET, LLM first-token seconds. The former you can mention on a bandwidth / media prompt; the latter is M5 latency budget. This chapter does not expand.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. “What disk latency are you using?” → Ask the medium. NVMe ~100 μs. Do not quote HDD 10 ms as the default.
2. “How much faster is memory than NVMe?” → ~100 ns vs ~100 μs, about **1000×**. The HDD-era line “100,000×” is outdated.
3. “Same-city vs cross-continent?” → 0.5 ms vs ~150 ms, about **300×**. Cross-continent is a speed-of-light floor.
4. “What about cross-AZ?” → Public order of magnitude **1–2 ms RTT**. Sync replication lands on write latency.
5. “What about peak?” → Average ×2–3; promo ×10. Forgetting peak is a red flag.
6. “100 Mbps is how many MB/s?” → **12.5**. B vs b.
7. “3 nines vs 4 nines?” → Yearly downtime 8.8 h vs 53 min, 10×; cost is not a linear 10× drop.
8. “Why not 5 nines?” → Site-wide 5 nines is over-engineering. Grade by product; point at Ch36.
9. “What about three years from now?” → Multiply growth; say storage / sharding early. Do not only quote today.
10. “Is this some company’s real QPS?” → No. Whiteboard assumption. Inventing internal numbers is worse.`,
    },
    {
      id: "sec-next",
      headingEn: "What’s next",
      bodyEn: `Close the page. Walk the five steps on blank paper: assumptions → QPS+peak → storage ×3 → bandwidth (×8) → machine order of magnitude. Then hand-calc the short-URL or Feed teaching assumptions once.

Self-check: can you say the 2026 five latency bands in two minutes, and explain why 10K QPS reads do not need sharding immediately? If yes, this chapter is done.

Next chapter enters M2 building blocks: **Ch04 · Design a rate limiter**. Estimates become where the rate-limit threshold comes from.`,
    },
  ],
  reviewMdEn: `# Ch03 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | What do you say in the opening 30 seconds of an estimate? | Write assumptions first (DAU, per-user ops, read:write, peak multiplier), then walk QPS / storage / bandwidth / machines. Round, label units. |
| 2 | Four buckets you must ask before estimating? | DAU definition, per-user read/write, read:write, peak multiplier. Retention and cross-continent if you have room. |
| 3 | Average QPS formula? Seconds in a day for mental math? | DAU × ops per user / 86400. Divide by 10^5. Split read and write. |
| 4 | How do you multiply for peak? What flag if you forget? | Daily ×2–3, promo ×10. Average-only is a red flag. |
| 5 | Why ×3 on storage? | Replicas + don’t skip backups. If they ask three years, multiply growth. |
| 6 | Bandwidth formula? 100 Mbps = ? | QPS × Byte × 8 = bps. 100 Mbps = 12.5 MB/s. B vs b is 8×. |
| 7 | DRAM / NVMe / same-city / cross-AZ / cross-continent? | ~100 ns · ~100 μs · ~0.5 ms · ~1–2 ms · ~150 ms. |
| 8 | Memory vs NVMe? NVMe vs HDD? | ~1000×. NVMe vs HDD seek ~100×. Do not treat HDD as the default disk. |
| 9 | Why can’t you drop cross-continent 150 ms? | Speed-of-light floor in fiber. Use CDN / multi-Region. Do not promise 50 ms worldwide from one Region. |
| 10 | 3 nines vs 4 nines yearly downtime? | ~8.8 hours vs ~53 minutes, 10×. 5 nines ~5 minutes; site-wide 5 nines is over-engineering. |
| 11 | How does read:write change architecture? | Read-heavy → cache/CDN/replica. Write-heavy → MQ to shed the peak. Close → don’t lean on cache alone. |
| 12 | How does NVMe change “cache first, then shard”? | Cache is for hot keys and cross-continent, not seek time. Shard on write volume and data size. 10K QPS reads → 64 shards is over-engineering. |
| 13 | Short-URL teaching-assumption conclusion? | Writes hundreds, reads tens of thousands, TB-class storage. KV + cache is enough; no global sharding. |
| 14 | Can whiteboard numbers be a company’s real QPS? | No. Public teaching assumptions. Inventing internal numbers is worse. |`,
});
