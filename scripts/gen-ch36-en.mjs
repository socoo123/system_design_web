import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch36",
  titleEn: "Trade-offs: CAP / PACELC / SLO",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 90–120 min ｜ **Prereq**: Ch03 the nines; Ch06 AP quorum
> **Goal**: correct the CAP poster misread; PACELC; SLO and error budget. Don't haul the AWS opening encyclopedia in.

This is **M6's first foundation chip**, not another 4-step design problem. On the spine, Ch02 multi-Region, Ch06 KV, Ch11 Feed, and Ch24 payments all hit "consistency vs availability, how many nines is enough" — this chapter makes that **trade-off language** precise. Design problems just cite it; they do not turn the whiteboard into a lecture.

**One line:** CAP only constrains **when a partition is happening**; with no partition, look at PACELC's latency vs consistency; the nines get spent as an SLO and an **error budget**, not stacked to five nines.

Three hard parts (the pieces worth digging):

1. **CAP misread** — the CA / AP / CP poster treats CA as a third everyday mode
2. **PACELC's daily latency** — partitions are rare; every write is already paying L vs C
3. **How you open SLO + error budget** — SLI / SLO / SLA are different; how a 30-day budget is spent, and what you do when it's gone

This chapter **does not cover**: the seven-concept encyclopedia, Deutsch's eight fallacies as a TOC, Chaos Engineering, platform engineering, the four pillars of observability, some cloud Well-Architected checklist. The eight fallacies get one sentence in the papers section. The latency table and yearly-downtime table already live in **Ch03** — we do not recopy that table as eight rows of body.`,
    },
    {
      id: "sec-pitch",
      headingEn: "One-line definition · 20-second interview open",
      bodyEn: `First put the scoring signal on the table: you know the poster is wrong, you know what you actually buy day-to-day is latency, and you know nines are a budget, not a medal.

> "CAP only holds during a **partition**: you cannot have linearizability and a non-error response from every non-failed node at the same time. Day-to-day you are not picking one of three posters CA / AP / CP — **CA is not a third distributed mode**. During a partition you pick **CP** (minority refuses writes, etcd / Spanner) or **AP** (keep serving, Dynamo / Cassandra style). No partition: look at **PACELC**'s Else — latency vs consistency. SLO is the internal target, SLI is how you measure, SLA is the contract. **error budget = 1 − SLO**; 99.9% over 30 days is about 43 minutes; inside the budget you keep shipping, exhausted you freeze feature launches. Five nines is often over-engineering. Yearly downtime I take from Ch03; here I talk about how you spend the budget."

The whole chapter walks this one chain. Say the 20 seconds, then stop. Let the interviewer decide whether to dig into CAP, PACELC, or SLO.

${D2}

This figure cites: Ch03 the nines · Ch06 AP quorum (mechanism in the next two sections)

| Interviewer ask | Where you land |
|---|---|
| "How do you pick CAP for this system?" | First: **is there a partition, and can you stop if it breaks?** Then CP vs AP |
| "What about when there is no partition?" | PACELC Else: sync replication buys consistency; async buys low latency |
| "How many nines / what's the SLA?" | SLI first, then SLO, SLA looser; open with error budget |

**red flag:** opening by drawing the CAP triangle pick-two; writing CA as "no partition so we pick CA" as an architecture choice; treating SLA and SLO as one word; site-wide five nines with no story for how the budget is spent.`,
    },
    {
      id: "sec-cap",
      headingEn: "Mechanism · CAP misread (the poster is not the theorem)",
      bodyEn: `First hard part. **In a 2026 interview, reciting "pick two" scores lower than taking the poster apart.**

Brewer 2000 at PODC proposed a **conjecture** (later nicknamed Brewer's theorem). **Gilbert & Lynch 2002** proved it: in an asynchronous network, a read/write register cannot simultaneously provide **atomic consistency** (linearizability: a read always sees the most recent completed write), **availability** (every non-failed node must respond), and **partition tolerance** (the network can drop arbitrarily many messages).

The theorem governs guarantees **while a partition is happening**, not a stamp on the system's birth certificate that says CA / AP / CP.

${D2}

**Why CA is not a third mode:** a single machine has no partition; CAP is meaningless. Once you have replicas and a network, partition is **not optional** — fiber cuts, switch bugs, datacenters split. So-called "pick CA" = during a partition the system stops being a distributed system (stop writes, or shrink to one box). That is not an everyday architecture gear. Brewer himself wrote in 2012: the *2 of 3* poster has been misleading; with no partition you can have C and A together — what you pay is latency.

When the partition arrives, two gears left:

${D2}

This figure cites: Ch06 key-value store · Ch08 distributed locks

| | **CP** | **AP** |
|---|---|---|
| During a partition | Minority **refuses writes / blocks reads**, so the two sides don't each write their own | Both sides keep taking requests; you accept a temporary fork |
| After recovery | No fork to reconcile (or only uncommitted failures) | You merge: LWW / read repair; concurrent writes can be lost |
| Interview examples | etcd / ZK lease, Spanner, majority consensus | Dynamo / Cassandra-style KV (Ch06) |
| Typical business | locks, config, ledger, inventory reserve | sessions, cart, timeline cache |

Gilbert & Lynch's C is stricter than "replicas eventually match": **linearizability**. Ch06's W+R>N is **quorum freshness**, not the C in this theorem. Landing that one sentence scores higher than calling KV "so we are CP."

**Pick by data, not by the whole site.** Ch02 already said: accounts can lean consistency, Feed can lean availability. One poster over the whole site is a red flag.

How to say it:

> "I don't pick CA. Distributed systems will partition. For this data, during a partition, would you rather refuse, or rather be stale? Locks and money go CP; Feed and sessions go AP. Latency with no partition, I talk PACELC."`,
    },
    {
      id: "sec-pacelc",
      headingEn: "Mechanism · PACELC: partitions are rare, latency is daily",
      bodyEn: `Second hard part. CAP barely talks about **no partition**. Abadi's **PACELC** (say pass-elk): **if Partition then A vs C, Else Latency vs Consistency.**

Partitions are rare; replication is daily. Every write that waits for replica ACKs is buying C and paying L on the Else branch; return on the first write and catch up in the background is buying L and paying brief inconsistency. That is the real everyday trade-off on the whiteboard.

${D2}

This figure cites: Ch06 quorum · Ch41 replication, sharding, transactions

How to remember the four cells (**examples are not a database catalog**):

| PACELC | During partition | Day-to-day | Interview one-liner |
|---|---|---|---|
| **PA/EL** | want availability | want low latency | Dynamo / Cassandra default: async replication, tunable quorum; W=1 leans L harder |
| **PC/EC** | want consistency | still want consistency | Spanner: Paxos / TrueTime; etcd: Raft majority, minority does not write |
| **PA/EC** | partition leans available | day-to-day still waits for consistency | Rare; don't invent one just to fill the table |
| **PC/EL** | partition leans consistent | day-to-day chase low latency | Don't memorize this as a default gear either |

Lined up with Ch06: default N=3 W=2 R=2 is **tunable on a PA base** — drop one node in a partition and you can still write; waiting for one extra ACK day-to-day is a step toward C on Else, and both latency and tail latency go up. W=1 is more EL. Calling W+R>N "linearizability / we are CP" is a red flag.

Cross-AZ / cross-Region blows Else up: same-city RTT can still sync; transcontinental sync nails user latency to the speed of light. That Ch02 line lands here: **pick by data** — a ledger still wants EC across continents; a timeline across continents uses EL + eventual consistency.

How to say it:

> "CAP only covers partitions. PACELC fills in day-to-day: do you wait for replicas. Feed I default PA/EL; the payment ledger PC/EC. Ch06's W/R is a knob between EL and leaning C, not a different theorem."`,
    },
    {
      id: "sec-slo",
      headingEn: "Mechanism · SLO and error budget (how you spend the nines)",
      bodyEn: `Third hard part. Ch03 already had you memorize **3 / 4 / 5 nines vs yearly downtime** (about 8.8 hours / 53 minutes / 5 minutes). This chapter does not recopy that table. Here we turn nines into a **budget you can spend**, and we open it the way the public SRE Workbook teaches — **do not quote some company's internal SLO numbers.**

${D2}

| Term | What it is | How you use it in the interview |
|---|---|---|
| **SLI** | how you measure: successful requests / valid requests; or "the fraction of users who can finish checkout" | define the event and the window first, then talk nines |
| **SLO** | internal target: e.g. successful requests ≥ 99.9% over a 30-day window | engineering schedules, alerts, and freeze launches against it |
| **SLA** | contract with the customer, usually **looser than** the SLO; breach means money / credits | don't treat the contract number as the daily target |
| **error budget** | \`1 − SLO\`: the allowed failure fraction or time | budget = innovation quota; spent → you turn toward stability |

The chain is one-way: **SLI → SLO → SLA**. Nines with no SLI are a slogan. Tight SLO, looser SLA: so you hit the brakes yourself before you pay out.

### Hand calc: how a 30-day budget is spent

Teaching window is **30 days** (common SRE Workbook convention; don't present it as some company's internal report).

\`30 × 24 × 60 = 43,200\` minutes.

| SLO | error budget (time) | Teaching request scale (assume 10 million valid requests) |
|---|---|---|
| **99.9%** | \`43,200 × 0.001 ≈ 43\` minutes | allow **10,000** failures |
| **99.99%** | ≈ **4.3** minutes | allow **1,000** |
| **99.999%** | ≈ **26** seconds | one slightly long incident burns it |

Yearly downtime lookup is back in **Ch03**. Here the point is: **the window becomes 30 days so the number looks like a schedule.** A 20-minute incident still leaves about half the budget at 99.9%; at 99.99% you are already overspent.

Series/parallel gets one hand-calc (don't turn it into an availability class): two 99.9% dependencies in **series**, \`0.999 × 0.999 ≈ 99.8%\`, the whole user path lost a nine. Independent replicas in parallel are \`1 − 0.001×0.001\`, lots of nines on paper — **correlated failures (same-AZ power) trash that math**, so don't claim six nines from a napkin calc.

${D2}

Public teaching (not some internal policy verbatim): budget remaining → ship normally, canary, controlled experiments; **budget burned → freeze feature launches**, only merge reliability / security fixes until the window returns the budget. Ch35 says "SLO broken → rollback" — that is spending (or rescuing) this budget.

**Five nines is often over-engineering.** The core payment path can talk four nines; edge read-only, internal tools, three nines is enough. Site-wide five nines = multi-Region active-active + drills + refusing to ship, users often don't feel it, the team is afraid to move. Splitting SLO **by user journey** in the interview looks more like a strong hire than quoting one site-wide nine.

How to say it:

> "I define the SLI first: checkout success / valid checkouts. SLO is 99.9% over 30 days, error budget about 43 minutes. Inside the budget we keep shipping; burned we freeze features. If the external SLA is 99.9%, the internal SLO is one notch tighter. Five nines I only give paths that truly cannot stop, not a site-wide default."`,
    },
    {
      id: "sec-compare",
      headingEn: "Choice table: how the problem lands in a cell",
      bodyEn: `Don't turn the whiteboard into a database trade show. Two contrast figures pin **bricks** and **business problems**.

${D2}

This figure cites: Ch06 key-value store · Ch08 distributed locks

${D2}

This figure cites: Ch11 news Feed · Ch24 payment system

| Problem / brick | During partition | Else | How you open SLO |
|---|---|---|---|
| **Ch06 KV** (sessions, cart) | AP: lose one node, still get/put | EL: default quorum, you can tighten W/R | availability SLO; brief stale is OK |
| **Ch08 locks** (inventory critical section) | CP: minority does not issue locks | EC: wait for majority / fencing | correctness > lock-service QPS |
| **Ch11 Feed** | followers can see it a few seconds late | EL: async fan-out | read-path latency SLO; not globally simultaneous |
| **Ch24 payments** | partition: rather refuse the charge | EC: ledger, idempotency, recon | successful capture / books balance; four nines is discussable, five nines you name the cost |
| **Ch02 multi-Region** | split **by data**, not one poster for the site | transcontinental sync = buy C, pay L | nearby reads can be EL; writes belong to a Region |

You can mix inside one problem: Feed's **timeline cache** AP/EL, **accounts / follow graph** can be tighter. In payments, **promo display** three nines, the **ledger** another SLO. That is "pick by data."

How to say it:

> "KV and Feed I take AP + low latency; locks and payments CP + wait for consistency day-to-day too. SLO I split by journey; I don't quote one site-wide five nines."`,
    },
    {
      id: "sec-papers",
      headingEn: "Papers and classic systems",
      bodyEn: `M6 needs names you can drop. Below: 3 required, 2 optional. **The interview one-liner** is in the table; don't memorize page numbers, don't invent internal conclusions.

${D2}

| | Paper | Required / optional | Interview one-liner |
|---|---|---|---|
| 1 | **Brewer**, PODC 2000 conjecture; 2012 *CAP Twelve Years Later* | Required | During a partition you cannot have C and A together; **the 2 of 3 poster is a misread**; with no partition C+A is feasible, what you pay is latency |
| 2 | **Gilbert & Lynch**, 2002, *Brewer's Conjecture and the Feasibility of Consistent, Available, Partition-Tolerant Web Services* | Required | This is the **proof**; C = atomic / linearizability, not "same in a while" |
| 3 | **Abadi**, PACELC (2010 short piece, 2012 *IEEE Computer* write-up) | Required | if P then A vs C; **Else L vs C**. CAP only covers rare partitions |
| 4 | **Deutsch**, the eight fallacies of distributed computing | Optional | One sentence: **the network is not reliable, latency is not zero** → so P is not optional. Don't make the eight a chapter TOC |
| 5 | **SRE Book / SRE Workbook** (public: Implementing SLOs, Error Budget Policy) | Optional | SLI → SLO → SLA; **error budget gone → freeze feature launches**. Public teaching only, don't quote Google's internal nines |

Classic systems are only **nails in the grid**; unpack the implementation in other chapters: Dynamo / Cassandra → Ch06; Raft / replication topology → **Ch41**; B+Tree vs LSM, when not to use KV → **Ch37**. Spanner in the interview is one line TrueTime + majority; don't open a TrueTime class.`,
    },
    {
      id: "sec-used",
      headingEn: "Which design problems use this",
      bodyEn: `Do the spine problems first; jump into this chapter when you get stuck. Back-links are not "finish M6 then start writing."

| Chapter | The sentence you use |
|---|---|
| **Ch02** scale | Multi-Region / Active-Active: pick C vs A by data; transcontinental sync is not free |
| **Ch03** estimates | The yearly-downtime nines table lives there; this chapter turns it into a 30-day error budget |
| **Ch06** KV | Default AP + tunable quorum; W+R>N ≠ linearizability |
| **Ch08** locks | Correctness locks go CP / fencing; efficiency locks are not a CAP theorem |
| **Ch11** Feed | Second-scale eventual consistency, PA/EL; not globally visible at the same instant |
| **Ch18** orders | State machine and inventory: money-related paths lean CP; display can be loose |
| **Ch20** MQ | "Available" under at-least-once is not ledger consistency; recon lives in payments/orders |
| **Ch21** flash sale | Reserve can be an AP cache; recon and deduct must be reclaimable; the books are source of truth |
| **Ch24** payments | Correctness > QPS; ledger PC/EC; SLO looks at capture and books balancing |
| **Ch29 / Ch35** | SLO broken → rollback = spending the error budget; platform prompts use the same vocabulary |

URL shortener, notifications, chat: the read path can be EL; **unread counts, balances, read receipts** — ask on the spot which must be tighter. Don't slap one PACELC label on the whole site.`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs notes / the original book",
      bodyEn: `<details>
<summary>How the original book / notes put it · the seven-concept encyclopedia and stacking nines live here</summary>

The notes map to the AWS-book opening: seven concepts, eight fallacies, the CAP poster, a long availability-nines table. **That is not this chapter's body.** A 2026 interview you walk in with three pieces of trade-off language.

| Original book / notes | How you answer now |
|---|---|
| Pick-two poster; CA written as a distributed mode | **CP vs AP only during a partition**; CA is not a third gear |
| CAP unpacked, PACELC one sentence | **PACELC fills in day-to-day L vs C**; partitions are rare, latency is daily |
| Availability = stack nines, chase 5–6 nines | **error budget**; five nines is often over-engineering; yearly downtime table in Ch03 |
| Seven concepts + eight fallacies as the opening TOC | This chapter is only CAP / PACELC / SLO; eight fallacies, one optional sentence |
| Four pillars of observability / Chaos / platform engineering / Well-Architected | **Not this chapter** |
| Cloud product catalog (someone's global table vs someone's monitoring) | Use Dynamo / Cassandra vs Spanner / etcd as cells, not a shopping list |
| W+R>N equals CAP's C | quorum freshness; linearizability is the Gilbert & Lynch C |

The body's first answer is this 2026 set. The fold only stops you from hauling the opening encyclopedia onto the whiteboard.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **Is CAP pick-two?** → Poster talk. The theorem governs during a partition; no partition is not "giving up P."
2. **Why can't you pick CA?** → A network will partition. Pick CA = during a partition you stop being a distributed system.
3. **Whose word counts, Brewer or Gilbert & Lynch?** → Conjecture vs **2002 proof**. When you say "theorem" in the interview, you mean the latter's C/A/P definitions.
4. **CAP vs PACELC?** → CAP ⊂ the partition branch; PACELC adds Else's L vs C.
5. **Cassandra is AP so it has no consistency?** → Tunable. Default leans PA/EL; tightening W/R is buying latency. Still not linearizability.
6. **Can etcd still write after half the nodes die?** → Majority to write. That's CP.
7. **Which is tighter, SLO or SLA?** → Internal SLO is usually tighter; SLA is the contract.
8. **How long can 99.9% be down in a month?** → Teaching: ~**43 minutes** in 30 days. Yearly downtime ~8.8 hours is in Ch03.
9. **Why not chase five nines?** → Budget is about 26 seconds / 30 days; site-wide is over-engineering. Split by journey.
10. **Still ship after the error budget is spent?** → Public teaching: freeze features, reliability-only. Keep stacking features is a red flag.
11. **Are reliability and availability the same?** → No. Reliable = fail less; available = respond when asked. SLO needs both in the SLI; they are not synonyms.
12. **Two 99.9% in series still 99.9%?** → About 99.8%. Dependencies on the user path eat your nines.
13. **Does Feed need strong consistency?** → Default no. Ch11 is second-scale eventual. Money and locks are a different story.`,
    },
    {
      id: "sec-next",
      headingEn: "What's next",
      bodyEn: `Close the page and walk it in 20 seconds: where the poster is wrong, how you pick CP vs AP during a partition, PACELC's Else, how you spend the 43-minute budget. If you can hand-calc \`0.999×0.999\` and 30-day 99.9%, and drop Feed / payments / KV into cells, this chapter is done.

Next chapter **Ch37 · Storage choices**: relational / KV / document / columnar / object… and B+Tree vs LSM. The CAP grid tells you "lean AP or lean CP"; the storage chapter tells you **how the engine and the model plug into that cell**. Dynamo paper, LSM, Bigtable unpack there; don't open that catalog here.

Self-check: left column, three hard-part lines; middle, PACELC four cells (only fill the two you actually use); right, SLI / SLO / budget for one user journey. Don't recite the seven concepts back.`,
    },
  ],
  reviewMdEn: `# Ch36 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | How do you open in 20 seconds? | CAP only during a partition; don't pick CA. Partition CP vs AP. Else is PACELC's L vs C. SLI→SLO→SLA; error budget=1−SLO; five nines is often over-engineering. |
| 2 | Three hard parts? | ① CAP poster misread ② PACELC's daily latency ③ How you open SLO + error budget. |
| 3 | When does CAP apply? | **Only during a partition**. No partition is not "we picked CA." |
| 4 | What's wrong with the CA poster? | Replicas imply partitions. CA is not a third everyday distributed mode. |
| 5 | Brewer vs Gilbert & Lynch? | Brewer 2000 conjecture; **2002 proof** made it a theorem. C is linearizability / atomic. |
| 6 | What does CP do during a partition? | Minority refuses or blocks, to avoid a fork. Examples: etcd, Spanner. |
| 7 | What does AP do during a partition? | Keep answering, accept a fork, merge on recovery. Examples: Dynamo / Cassandra style. |
| 8 | Is Ch06's W+R>N CAP's C? | **No.** Quorum freshness, not linearizability. |
| 9 | PACELC in one sentence? | if Partition then A vs C; **Else Latency vs Consistency** (Abadi). |
| 10 | Why is Else asked more often? | Partitions are rare; whether each write waits for replicas is the latency you pay every day. |
| 11 | Dynamo-style vs Spanner cells? | Former typical PA/EL; latter PC/EC. Examples, not a database catalog. |
| 12 | SLI / SLO / SLA? | How you measure → internal target → contract (usually looser). |
| 13 | error budget formula? | \`1 − SLO\`. 30-day 99.9% ≈ **43 minutes** (43,200×0.001). |
| 14 | 30-day budget for 99.99% and 99.999%? | About **4.3 minutes**; about **26 seconds**. The latter one incident burns it. |
| 15 | Inside the budget vs exhausted? | Inside: keep shipping / canary. Exhausted: **freeze feature launches**, reliability-only. |
| 16 | Why is five nines often over-engineering? | Cost spikes, launch freeze, users don't feel it. Split SLO by journey; site-wide five nines is a red flag. |
| 17 | Two 99.9% in series? | 0.999×0.999≈**99.8%**, the user path loses a nine. Parallel napkin math must not pretend correlated failures don't exist. |
| 18 | Feed vs payments? | Ch11: can be stale, PA/EL. Ch24: the ledger has to match, PC/EC. |
| 19 | KV vs locks? | Ch06 AP + tunable quorum. Ch08 correctness locks go etcd-class CP. |
| 20 | Where is the yearly downtime table? | **Ch03**. This chapter only changes the window to 30 days and talks about how you spend it. |`,
});
