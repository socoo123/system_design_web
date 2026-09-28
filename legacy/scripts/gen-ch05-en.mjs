import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch05",
  titleEn: "Consistent hashing",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 40–50 min ｜ **Prereq**: Ch02 sharding intuition
> **Goal**: why you cannot \`hash % N\`; the ring + virtual nodes; Maglev is a pointer to Ch39—do not deep-dive it here.

Consistent hashing is the second brick in M2. Not a full product prompt. It is the **partition function** that KV, cache shards, and some LBs all call later. They do not want a geometric circle. They want three sentences you can hand-calc: **why \`hash % N\` remaps almost everything; why clockwise lookup on the ring does not depend on N; how virtual nodes pin both evenness and how much you move.**

The hard part (the piece worth digging) is those three sentences. Maglev and Jump Hash: one sentence each, then stop—the lookup-table LB paper lives in **Ch39**. Ketama / virtual nodes is still the 2026 whiteboard default.`,
    },
    {
      id: "sec-answer",
      headingEn: "How to answer in the interview",
      bodyEn: `### Opening 30 seconds

> “To scale out you put keys on many machines. The obvious \`hash(key) % N\` remaps almost every key when N changes, and the cache avalanches. Consistent hashing maps both nodes and keys onto a ring; the first node you hit clockwise owns it—the mapping does not depend on N, so add or remove one machine and you move about k/n. Evenness comes from virtual nodes; on the whiteboard I walk Ketama. For a network LB that needs O(1) lookup I mention Maglev; the paper is in the load-balancing chapter, I do not expand it here.”

Then walk that chain. Do not open by reciting four hash variants.

${D2}

| Time box | What you are doing |
|---|---|
| 3–5 min | Clarify: cache shard / data partition / LB affinity; can you take a node out at random |
| 2 min | Back-of-the-envelope: how much moves when N changes; write k/n with k and n |
| 8–12 min | High-level: 0–99 teaching ring + clockwise lookup (do not draw a geometric circle) |
| 10–15 min | Deep dive: add/remove only moves the neighbor’s arc; vnode for evenness + heterogeneous boxes |
| 2–3 min | Wrap-up: a hot key is not solved; Maglev in one sentence, park it in Ch39 |

**red flag:** opening with a perfect circle; implementing four algorithms side by side; saying “consistent hashing spreads a hot key”; treating Maglev’s lookup table as the default for KV partitioning.`,
    },
    {
      id: "sec-clarify",
      headingEn: "Clarifying questions",
      bodyEn: `Same ring, different trade-off on cache vs KV vs LB. Ask 5–7, then stop; the rest you write as assumptions. Replication and quorum wait for **Ch06**. This chapter only puts the key on a machine.

| You ask | Why | Default you write on the board |
|---|---|---|
| Cache shard, data partition, or LB session affinity? | A wrong cache mapping avalanches the DB; a data partition also moves disk | “Walk the ring as cache / KV partition first” |
| Do nodes have stable names? Can you yank any one? | Jump Hash wants buckets 0..N-1; you cannot delete a middle one at random | “Named nodes, add/remove any → ring + vnode” |
| Are the boxes homogeneous? | Heterogeneous capacity means a different vnode count per box | “Homogeneous first; if asked, strong boxes get more vnodes” |
| Any super-hot keys? | The ring solves a changing machine set, not one key filling a box | “Even traffic; a hot key is split at the app layer” |
| About how many physical nodes? | Whether you must stress vnode; 3 boxes vs 300 are very different on evenness | “Teaching: 4 boxes; prod: tens to hundreds” |
| Is take-down failover or shrink? | The clockwise neighbor picks up; with vnode the load spreads, not one box eating it all | “Shrink first; failover is the same clockwise walk” |

When they say “you assume,” write it up:

> “Assume: partitioning a cache or KV. Nodes have names and come and go at random. Start with 4 homogeneous boxes. The goal is move less when N changes, not O(1) per packet on an L4 LB.”

The moment they say “this is a software LB behind the gateway, millions of packets a second,” name Maglev and **stop immediately**—that is Ch39, not a rewrite of this chapter into a lookup-table homework.`,
    },
    {
      id: "sec-estimate",
      headingEn: "Back-of-the-envelope: how much you move",
      bodyEn: `This chapter’s back-of-envelope is not product QPS. It is: **when N changes, how many keys change machines.** Formulas live in Ch03. Here you prove \`% N\` takes cache and shards down together.

Teaching assumption: k = **1 million** keys, n = **10** machines. Not some company’s dashboard.

${D2}

This diagram cites: Ch38 cache and CDN · Ch41 replication, sharding, transactions

### Why \`hash % N\` remaps almost everything

\`serverIndex = hash(key) % N\`. N sits in the denominator. Change N, almost every remainder flips. The mapping **explicitly depends** on the machine count at that moment.

Hand-calc: let \`hash(key_i) = i\`, 8 keys, N: 4 → 3.

| key | % 4 | % 3 | Changed? |
|---|---|---|---|
| 0 | 0 | 0 | No |
| 1 | 1 | 1 | No |
| 2 | 2 | 2 | No |
| 3 | 3 | 0 | **Yes** |
| 4 | 0 | 1 | **Yes** |
| 5 | 1 | 2 | **Yes** |
| 6 | 2 | 0 | **Yes** |
| 7 | 3 | 1 | **Yes** |

**5 of 8** remainders already changed. An unchanged remainder does not mean the same physical box—you usually re-number the live machines 0..2, so index 1 is no longer the old S1. Intuition: **you should only be moving keys from the machine that left; instead everyone’s assignment is recomputed.**

Scale a cache shard with \`% N\`: almost every cache key misses → traffic hits the DB. That is the avalanche. Data partitions: you migrate almost everything; the window is dual-write + bandwidth + inconsistency all at once.

### How much consistent hashing moves

Add or remove **1** machine, expected move is about **k / n** (when you grow to n+1 it is about k/(n+1); out loud you still say k/n).

| Item | \`% N\` | Ring + vnode |
|---|---|---|
| 1M keys, 10 boxes, add 1 | Nearly **1 million** change machines | About **100K** (~1/11) |
| Cache fallout | Almost every miss | Miss only on the new node’s arc |
| Depends on | Mapping bound to N | Mapping bound to a point on the ring |

**How you say it in the interview:**

> “\`% N\` puts N in the denominator, so the remainder flips when the set changes—almost a full remap. Consistent hashing makes ownership independent of N; expected move is k/n. Hand-calc: a million keys, ten boxes, add one, you move about a hundred thousand, not a million.”

| | \`% N\` | Consistent hashing |
|---|---|---|
| Lookup | O(1) modulo | Binary search on the ring, O(log (n×vnode)) |
| Scale in/out | Almost everything moves | Expected k/n |
| Fits | A **fixed** pool whose N never changes | Cache / KV whose nodes will change |
| Interview role | Anti-pattern (a cluster that will change) | **Whiteboard default** |

A fixed worker pool whose N never changes: modulo is simple and even. That is not this prompt. This prompt assumes **the machine set will change**.`,
    },
    {
      id: "sec-arch",
      headingEn: "High-level: the ring + clockwise",
      bodyEn: `On the whiteboard, **flatten the ring into a left-to-right clockwise chain**, and mark wrap-around at the end. Do not nest boxes to “draw a circle”—it gets tall and unreadable. Production hash space is huge (Ketama often MD5, about 2^128; some implementations use SHA-1’s 2^160); collisions are noise. Hand-calc uses **0–99**.

${D2}

This diagram cites: Ch39 load balancing and stateless · Ch41 replication, sharding, transactions

Four steps:

1. Treat the hash space as a ring (teaching 0–99, one lap wraps to 0).
2. Each physical box (or a vnode later) lands on the ring with \`hash(node name)\`.
3. The key lands the same way with \`hash(key)\`.
4. Walk **clockwise** from the key; the first node you hit owns it. Past the max point, wrap to 0 and keep looking.

Figure: S0@10, S1@40, S2@75. key hash=25 sits between 10 and 40; clockwise first is **S1**. No \`% N\`. S1 owns the arc from it **counterclockwise** to the previous node (S0), i.e. (10, 40].

**How you say it in the interview:**

> “Nodes and keys both hash onto the ring. Ownership = the next node clockwise. The answer does not depend on how many machines you have right now, so N can change. On the board I draw a left-to-right chain, mark wrap-around, and I do not draw a geometric circle.”

| | Modulo | Clockwise on the ring |
|---|---|---|
| Input | hash and **N** | hash and the **point set on the ring** |
| Lookup | One \`%\` | Binary search on sorted points; past the end, wrap to the head |
| Add one box | Every remainder is recomputed | You only split one interval |
| Whiteboard | One-line formula | Chain + wrap-around; no hollow circle |

Implementation intuition: a sorted array of node hashes, \`bisect\` for the first point ≥ key; past the end, index 0. Writing the steps scores more than reciting a full class. Stop the high-level here. Ask: “Lookup on the ring OK? Next I’ll compute which arc moves on add/remove, then add vnode.”`,
    },
    {
      id: "sec-migrate",
      headingEn: "Deep dive · add/remove only moves the neighbor",
      bodyEn: `Second hard part: when the set changes, **whose keys move**. The answer is always “the arc you just cut,” never the whole set.

${D2}

This diagram cites: Ch41 replication, sharding, transactions

Keep the 0–99 ring: S0@10, S1@40, S2@75. Insert **S3** at 25.

- Before, (10, 40] all belonged to S1.
- Now (10, 25] belongs to S3, (25, 40] still S1.
- S2’s (40, 75] and S0’s (75, 99]∪[0, 10] **do not move**.

Talk-track mnemonic: **walk counterclockwise from the new node to the previous node; that arc is what moves to the newcomer.** Remove is symmetric: the arc it owned goes to the next node clockwise (failover is the same sentence).

Without vnode, delete S1: S2 swallows S1’s whole arc, S2’s load can double—that is one reason the next section adds vnode.

**How you say it in the interview:**

> “Add one machine and you only split the interval that used to belong to its clockwise neighbor, expected k/n keys. Remove one, its interval goes to the next clockwise. You are not rehashing the world.”

| | Add a node | Remove / failover |
|---|---|---|
| Who moves | From the new node counterclockwise to the previous | The interval the deleted node used to own |
| Who picks it up | The new node | Next node clockwise |
| Expected volume | ~k/n | ~k/n (without vnode it dumps onto **one** neighbor) |
| Other keys | Stay | Stay |

For data partitions this move is disk/network cost; for cache partitions it is a one-shot miss. Either way, it is an N-times smaller order of magnitude than \`% N\` remapping everything.`,
    },
    {
      id: "sec-vnode",
      headingEn: "Deep dive · virtual nodes",
      bodyEn: `Third hard part: only physical machines on the ring means too few points, high spacing variance, and machines can clump. **Virtual nodes (vnode)** are the 2026 whiteboard default patch. Ketama (memcached consistent hashing) is this path.

${D2}

This diagram cites: Ch41 replication, sharding, transactions

Each physical machine places **many vnodes** (\`hash(node name + i)\`), scattered on the ring. Lookup is still the first vnode clockwise, then map back to the physical box. More points, each machine’s arc length approaches even (law of large numbers). Delete one machine, its many small arcs go to different neighbors—not one neighbor eating the whole block.

Whiteboard order of magnitude (teaching numbers, **not some company’s SLA**): about **tens to a few hundred** vnodes per machine. The book often uses “about 100–200, relative standard deviation around 5–10%” as a hand-calc anchor; more is more even, but ring points = n × vnode, so memory and update cost climb. Production defaults differ; do not memorize them as internal config.

Heterogeneous: strong boxes get more vnodes, weak ones fewer—modulo cannot weight by capacity.

**How you say it in the interview:**

> “Too few physical machines on the ring and you get uneven arcs, and one failover can crush a neighbor. Ketama: a batch of vnodes per box. Evenness, spreading the move, and weighting by capacity, in one shot. Lookup is still clockwise; you just have more points.”

| | No vnode | Many vnodes |
|---|---|---|
| Evenness | Poor, luck | More points ↑, variance ↓ |
| Delete one box | Next box swallows the whole arc | Many small arcs go to many neighbors |
| Memory | O(n) | O(n × vnode) |
| Heterogeneous | Hard | Strong boxes get more vnodes |
| Lookup | Binary search n points | Binary search n×vnode points |

More vnodes still **cannot spread a single hot key**: the same \`user:katy\` always lands on the same physical box. To split it you change the key (shard it, salt it, a dedicated pool)—that is the application layer, not “add more points.” Selling the ring as “it automatically spreads hot keys” is a red flag.`,
    },
    {
      id: "sec-maglev",
      headingEn: "Deep dive · Maglev in one sentence",
      bodyEn: `For general data/cache partitioning, stop at the ring + vnode. The next bit is only to catch “do you know anything else”—**not a second homework.** Lookup-table LB mechanics, the paper, and Envoy choice live in **Ch39**.

${D2}

This diagram cites: Ch39 load balancing and stateless

**Maglev** (Eisenbud et al., NSDI 2016): precompute a fixed-size lookup table (the paper often uses prime **M = 65537**), O(1) backend per packet, for line-rate software L4 LB. Do not recite the permutation fill on a KV partition prompt.

**Jump consistent hash** (Lamping / Veach, 2014): almost no memory, O(log N) to get a bucket, but buckets must be **0..N-1**—you cannot yank a named middle node. Fits storage that only appends shards; does not fit arbitrary cache-node failover.

**How you say it in the interview:**

> “For partition and cache I default to ring + vnode: nodes have names, any of them can leave. L4 LB that needs O(1) per packet is when I say Maglev lookup table; details live in load balancing. Jump Hash in one sentence: cheap on memory, but you cannot delete an arbitrary bucket.”

| | Ring + vnode | Maglev | Jump Hash |
|---|---|---|---|
| Lookup | O(log (n×v)) | **O(1)** table lookup | O(log N) compute |
| Node names | Any | Any backend | **Must** be 0..N-1 |
| Whiteboard | **Default** | One bonus sentence for LB | One bonus sentence |
| Expand | This chapter | **Ch39** | Stop here |

Three cache boxes, one KV partition, filling Maglev’s table across the whiteboard = over-engineering. Redis Cluster’s 16384 slots is another “fixed slot table” idea—name it and move on; do not turn this into a Redis class.`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs the original book",
      bodyEn: `<details>
<summary>What the book / notes said then · Maglev deep dives and stale concurrency numbers live here</summary>

| Book / notes | How you answer now |
|---|---|
| Classic ring + vnode only; variants as a big appendix table | **Whiteboard default is still ring + vnode (Ketama)**. Maglev / Jump **one sentence each**; mechanics go to Ch39 |
| Hand-draw a geometric circle; SHA-1’s 2^160 as the first figure | Teaching: 0–99 **straight chain + wrap-around**; huge hash space in one sentence |
| Virtual nodes as a fact: “100–200, stddev 5–10%” | Treat it as a **teaching anchor**, mark it is not some company’s config; say tens to a few hundred |
| Discord “5 million concurrent” class numbers as evidence | **Do not memorize product concurrency**. Cassandra / Dynamo-style partition, memcached Ketama is enough |
| Maglev vs Jump vs Rendezvous as a body comparison table | At most three rows in the body; Rendezvous (HRW) is out of scope here |
| Notes treat Maglev as something you must implement | On a 2026 partition prompt, Maglev **name + why it is LB** is enough; reciting the fill is a rabbit hole |

The book skeleton still holds: \`% N\` blows up, the ring does not depend on N, vnode patches evenness. What aged out is **making the variants this chapter’s spine** and **using stale product numbers as authority**.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. “Why not \`hash % N\`?” → N is in the denominator; the set changes and you remap almost everything; a cache shard avalanches.
2. “Where is the ‘consistent’?” → Ownership does not depend on N; add/remove one, expected move is k/n—not “never move.”
3. “Clockwise and you find nothing?” → Past the max, wrap to the smallest point. Draw a chain; mark wrap-around at the end.
4. “Add one box, which keys move?” → From the new node counterclockwise to the previous. Everyone else stays.
5. “How many vnodes?” → Teaching: tens to a few hundred per box; more is more even, more memory. Give the range and the trade-off; do not invent an internal default.
6. “Boxes of different size?” → Strong boxes get more vnodes. Modulo cannot weight by capacity.
7. “Does it solve a hot key?” → **No.** One key still lands on one box. Split the key or give it a dedicated pool.
8. “Failover, who picks up?” → Next node clockwise; with vnode, many small arcs land on many boxes, so one neighbor does not swallow it.
9. “Why does Google’s LB use Maglev?” → O(1) per packet; binary search on the ring is too slow for line-rate LB. **Point at Ch39; do not fill the table in this chapter.**
10. “Doesn’t Jump Hash also move little?” → It does, but buckets must be 0..N-1; taking a named node offline does not fit.`,
    },
    {
      id: "sec-next",
      headingEn: "What’s next",
      bodyEn: `Do not close by saying it is perfect. Three bottlenecks, talk track:

| bottleneck | How you pick it up |
|---|---|
| \`% N\` scale-out, cache misses as a flock | Change the partition function to a ring; hand-calc the move as k/n |
| Neighbor overload with no vnode | A batch of vnodes per box; failover spreads |
| One hot key fills a box | Admit the ring is not enough; split the key at the app layer; do not pretend more vnodes save you |

Self-check: close the page, 30-second opening; hand-calc who key=25 lands on with 0–99; which arc moves when you add a point; two reasons for vnode (evenness + spreading the move). Wherever you stall, go back to that section.

Next chapter **Ch06 · Key-value store**: this chapter only answers “which machine for this key”; Ch06 stacks replication, quorum, and failure handling on top of the partition, into a Dynamo / Cassandra-style KV.`,
    },
  ],
  reviewMdEn: `# Ch05 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | What do you say in the consistent-hashing opening 30 seconds? | \`% N\` remaps almost everything; clockwise on the ring, independent of N; add/remove moves k/n; vnode for evenness. Maglev is a pointer to LB, do not expand. |
| 2 | Why is \`hash % N\` so bad? | N is in the denominator; change N, almost every remainder flips. Keys that should only leave one box get fully recomputed. Cache shard → avalanche. |
| 3 | Add one box, expected move? | About **k/n** (k total keys, n machines). A million keys, ten boxes, add one → about a hundred thousand, not a million. |
| 4 | How do you find a node for a key on the ring? | Nodes and keys both hash onto the ring; first node clockwise from the key. Past the max, wrap to 0. |
| 5 | How do you draw the ring on the whiteboard? | 4–5 points left to right as a clockwise chain, wrap-around at the end. Do not nest containers into a geometric circle. |
| 6 | Add a node, which arc moves? | From the new node counterclockwise to the previous. Other keys stay. Remove: its arc goes to the next clockwise. |
| 7 | Why virtual nodes? | Too few physical points: uneven, clumped; delete one and you crush a neighbor. Many vnodes: more even, the move spreads across many boxes. |
| 8 | How many vnodes, trade-off? | Teaching: tens to a few hundred per box (you often hear 100–200). More is more even; memory O(n×vnode) climbs. Do not invent a company default. |
| 9 | Heterogeneous boxes? | Strong boxes get more vnodes, weak ones fewer. \`% N\` cannot weight by capacity. |
| 10 | Does it solve a hot key? | **No.** The same key still lands on one box. Split the key / dedicated pool at the app layer. |
| 11 | Maglev in one sentence? | NSDI 2016, fixed lookup table (often M=65537), O(1) for L4 LB. Do not recite the fill on a partition prompt; paper in **Ch39**. |
| 12 | Jump Hash, one limitation? | Lamping/Veach 2014: cheap memory, O(log N), but buckets must be 0..N-1; you cannot delete an arbitrary named node. |
| 13 | 2026 whiteboard default? | **Ring + vnode (Ketama)**. Modulo only if N never changes. Maglev is not the KV default. |
| 14 | Typical over-engineering on this prompt? | Draw a perfect circle; implement four hashes; answer three cache boxes with Maglev fill; claim the ring spreads a single hot key. |`,
});
