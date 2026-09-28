import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch06",
  titleEn: "Key-value store",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 50–60 min ｜ **Prereq**: Ch05 ring; CAP mechanics in Ch36
> **Goal**: Dynamo-style AP + quorum; conflict default **LWW**; write path LSM. Vector clocks only in the fold.

A key-value store is the third brick in M2. Ch05 only answers “which machine owns this key.” This chapter stacks replication, quorum, conflict, and on-node storage on top of the partition, into a **Dynamo / Cassandra-style interview KV**. They do not want the Dynamo paper’s full kitchen sink. They want three sentences you can hand-calc: **why this prompt defaults to AP; how you set N/W/R, and why W+R>N lets a read see the new value; production conflicts use LWW, the write path uses LSM.**

The hard part (the piece worth digging) is those three sentences. CAP / PACELC mechanics go to **Ch36**; B+Tree vs LSM, and when not to use KV, go to **Ch37**; replication topology, failover, anti-entropy go to **Ch41**. Gossip, hinted handoff, Merkle: name them and stop. Do not make them a fourth pillar next to quorum / LWW / LSM.`,
    },
    {
      id: "sec-answer",
      headingEn: "How to answer in the interview",
      bodyEn: `### Opening 30 seconds

> “I’ll walk a Dynamo / Cassandra-style AP KV. Values are small, we need high availability, consistency is tunable. Partition with consistent hashing — the ring from the last prompt — N=3 replicas per key. Consistency is quorum: default N=3, W=2, R=2; W+R>N means the read and write sets must intersect. Conflicts default to Last-Write-Wins, by timestamp or version. On the node the write path is LSM: WAL → memtable → SSTable. CAP details live in the consistency chapter; engine comparison in storage choices. Redis Cluster is a different product: hash slot + one primary per slot, a more-CP shard table, not this whiteboard.”

Then walk that chain. Do not open by reciting Gossip + hinted handoff + Merkle + a causality graph.

${D2}

| Time box | What you are doing |
|---|---|
| 3–5 min | Clarify: AP or CP; value size; single DC; read:write |
| 2 min | Back-of-the-envelope: key count, raw capacity × N, write QPS with replication |
| 8–12 min | High-level: Client → Coordinator → N replicas; ring is a pointer to Ch05 |
| 10–15 min | Deep dive: hand-calc quorum, LWW, LSM write/read |
| 2–3 min | Wrap-up: hot key, clock skew, write amplification; failure repair parks in Ch41 |

**red flag:** filling the board evenly with the paper’s four-pack; first answer for conflict is not LWW; opening with a 20-node ring; treating Redis Cluster or Spanner as the default for this prompt.`,
    },
    {
      id: "sec-clarify",
      headingEn: "Clarifying questions",
      bodyEn: `If you have not pinned CAP and the shape of the value, quorum and LSM later are empty. Ask 5–7, then stop; the rest you write as assumptions. Mechanism definitions go to **Ch36**. This chapter only decides **which side this KV sits on**.

| You ask | Why | Default you write on the board |
|---|---|---|
| High availability or strong consistency? Account balance? | AP is the Dynamo-style path; money and config are CP | “Social / session / cart → AP” |
| How big is the value? Could it be a blob? | <10KB is KV; large objects go to object storage | “Value ~1KB, cap 10KB” |
| Single DC or multi-DC? | Multi-DC quorum latency and LOCAL_* strategies differ | “Single DC first; cross-region is a pointer to Ch41” |
| Roughly what read:write? | Write-heavy is why LSM is the default; read-extreme means you raise read amplification | “Write-heavy or mixed; teaching 5:1 read” |
| Is a stale read OK? Tunable? | Sets W/R; W+R≤N is eventual | “Tunable; default W=2 R=2 N=3” |
| Super-hot keys? TTL? | Ring and quorum do not save one key filling a box | “Even; split a hot key” |

When they say “you assume,” write it up:

> “Assume: a distributed KV, get/put, small values. We keep serving through a partition, so AP. N=3, default quorum W=2 R=2. Conflicts LWW. LSM on the node. Not Redis Cluster, not Spanner.”

The moment they say “this is a config store / account balance / cross-continent strong consistency,” switch to **CP** (etcd / TiKV / Spanner class) and **stop immediately** — that is Ch36 + Ch41. Do not rewrite this chapter into a consensus class.`,
    },
    {
      id: "sec-estimate",
      headingEn: "Back-of-the-envelope: capacity and replica amplification",
      bodyEn: `This chapter’s back-of-envelope has to prove two things: **raw data × N is the on-disk floor**; and **LSM still has space amplification, so hand-calc another factor**. Formulas live in Ch03. The numbers are teaching numbers, not some company’s capacity plan.

Teaching assumption: k = **100 million** keys, average value **1KB**, ignore metadata; read:write = **5:1**; peak write **10K QPS**, read **50K**; replicas **N=3**.

| Item | Hand-calc | How you use it in the interview |
|---|---|---|
| Raw capacity | 1e8 × 1KB = **100GB** | Say this first, then multiply by replicas |
| After replication | ×3 ≈ **300GB** | Forgetting × N is a red flag |
| LSM space amplification | Teaching ×2 more ≈ **600GB** order of magnitude | Extra versions before compaction; not a precise coefficient |
| Write into the cluster | 10K × 1KB ≈ **10MB/s** | × N again is replica-to-replica traffic |
| Replication bandwidth | ×3 ≈ **30MB/s** | Fine same-city; cross-continent is a different sentence |

Read traffic 50K × 1KB ≈ 50MB/s outbound is usually not the first bottleneck. The first ones are **a single hot key** and **quorum tail latency** (you wait on the slowest ACK).

**How you say it in the interview:**

> “A hundred million keys, 1KB, raw 100GB; three replicas 300GB; for LSM I hand-calc about 2× space amplification, call it 600GB order of magnitude. 10K write QPS after replication is about 30MB/s. The numbers prove you multiply by N; they are not a quote.”

Do not reverse 600GB into “so we need 20 NVMe boxes” — that is over-engineering. “Estimate shard count from capacity and write QPS; the ring is Ch05” is enough.`,
    },
    {
      id: "sec-arch",
      headingEn: "High-level: Coordinator + N replicas",
      bodyEn: `On the whiteboard draw **Client → Coordinator → three replicas**. How the ring finds a node is already Ch05 — **do not redraw a 20-point geometric circle**. Any node can be Coordinator: hash out a preference list, forward put/get to those N boxes.

${D2}

This diagram cites: Ch41 replication, sharding, transactions

Four rules:

1. The API is just \`get(key)\` / \`put(key, value)\`.
2. The client hits any node; that node is Coordinator.
3. Locate with Ch05’s ring, **walk clockwise for N distinct physical machines** (vnodes can land consecutive on the same box — skip those).
4. Coordinator sends the write to those N replicas **in parallel** (the figure flattens the preference list into a chain so a three-way fan-out does not become a tall tower), **waits for W ACKs** before success to the client; the rest catch up async.

N=3 is the whiteboard default. Spread replicas across racks; cross-DC placement and failover live in **Ch41**. No central primary: every node has the same job. That is the Dynamo-style vs “one primary + a string of replicas” difference.

**How you say it in the interview:**

> “Decentralized: whoever takes the request coordinates. Pick three distinct physical machines on the ring. I draw Client to Coordinator to A/B/C; I do not redraw the hash ring.”

| | Dynamo-style KV | Redis Cluster (one contrast sentence) |
|---|---|---|
| Partition | Consistent hashing + vnode | **16384 hash slots** |
| Replication | All N replicas are writable; quorum | **One primary** per slot |
| Interview role | **This chapter’s default** | A different product; more-CP slot table; name it and stop |

Stop the high-level here. Ask: “Coordinator plus three replicas OK? Next I’ll hand-calc quorum, then conflict and LSM.”`,
    },
    {
      id: "sec-quorum",
      headingEn: "Deep dive · quorum N/W/R",
      bodyEn: `First hard part: **tunable consistency is three integers, not a slogan.** N is replica count, W is ACKs needed for a successful write, R is responses needed for a successful read.

${D2}

This diagram cites: Ch36 Trade-off · Ch41 replication, sharding, transactions

W+R>N: the write confirmed W boxes have the new value; the read asked R boxes. Two set sizes that add up past N **must intersect** (pigeonhole). Coordinator takes the highest timestamp among the read results and sees this write. W+R≤N: the read and write sets can miss each other entirely — eventual, possibly stale.

Hand-calc: N=3, W=2, R=2. Write ACKed A and B. Read B and C. B is in both sets → B has the new value → return it.

A more precise talk track (do not mix this with linearizability): this is **freshness from quorum intersection**, not a real-time total order. PACELC and linearizability go to **Ch36**. Even with intersection, a messy clock can still overwrite by the wrong timestamp — next section, LWW.

${D2}

This diagram cites: Ch41 replication, sharding, transactions

Figure: W=2, N=3: wait for ACK from A and B, then return. **C still gets the write; it just does not block the client.** This is the most common follow-up:

> “W=1 is not ‘write one box.’ All N boxes get the write; W is how many ACKs the Coordinator **waits for before 200**. The rest are async.”

| Config | Behavior | Whiteboard role |
|---|---|---|
| **N=3 W=2 R=2** | Lose 1 box, still read/write; they intersect | **Default** |
| W=1 R=1 | Fastest; can be stale | Cache-like, want eventual |
| W=3 R=1 | Write waits for all; read any one | Read-heavy, write-light |
| W=1 R=3 | Write fast, read slow | Write-heavy; read has to gather all |
| W=3 R=3 | Slowest; one box down and you stop | Almost no AP left; rarely used |

N=3, W=2 still lets you gather W after **one** failover. Two boxes down at once, strict quorum fails the write — serving both sides of a partition is sloppy quorum + later hinted handoff, details **Ch41**. Finish strict quorum on the board first.

**How you say it in the interview:**

> “Default 3/2/2. W+R>N so the sets must intersect; on read I take the newest timestamp. W is ACK count, not how many boxes you write. People often say strong consistency here — I add: this is quorum freshness, not linearizability.”`,
    },
    {
      id: "sec-lww",
      headingEn: "Deep dive · conflict default is LWW",
      bodyEn: `Second hard part: under a partition or concurrent puts, the same key becomes two values on different replicas. **2026 whiteboard production default is Last-Write-Wins**: every mutation carries a timestamp (or a monotonic version); on read/repair you keep the bigger stamp. Cassandra’s public line is LWW (deletes’ tombstones also ride the stamp). Do not make a causality graph the first answer.

Where the conflict comes from: A writes \`name=SF\`, B writes \`name=NY\`, both hit their W; after the network heals both copies are “legal.” LWW compares stamps, keeps one.

| | LWW (default) |
|---|---|
| Compare | Client or Coordinator timestamp / version |
| Winner | The put with the bigger stamp |
| Cost | **Drop** the concurrent write that lost |
| Clocks | NTP skew, a client lying about the stamp → can overwrite the wrong one |
| Fits | Overwritable state, sessions, profile fields |
| Does not fit | Concurrent updates you cannot drop (app-level merge or CRDT; name it and stop) |

Quorum only guarantees you read **some replica that was written**; **who wins** is LWW. So “W+R>N means you never lose an update” is wrong: concurrent writes plus a skewed stamp can still overwrite a causally later write. Jepsen-style analyses have LWW swallowing an ACK’d write on partition recovery — admitting that sentence in the interview scores more than pretending LWW is lossless merge.

**How you say it in the interview:**

> “Conflicts I default to LWW; Cassandra production is this line. Overwritable state is enough. You drop the concurrent write that lost; clocks have to be sane. Counters or structures that need merge: CRDT / app-level merge, I do not expand on this prompt.”

red flag: treating conflict as “the client must implement a fancy merge protocol”; or the other way, selling LWW as never losing data. Sensitive fields (inventory, balance) should not use this AP KV as source of truth — go back to clarify, switch to CP, see **Ch36**.`,
    },
    {
      id: "sec-lsm",
      headingEn: "Deep dive · LSM write / read path",
      bodyEn: `Third hard part: **inside the replica node**, how you make put fast. This prompt defaults to **LSM** (Cassandra / RocksDB family): turn random page updates into sequential appends. Full B+Tree vs LSM lives in **Ch37**; here we only keep the write and read chains.

${D2}

This diagram cites: Ch37 storage choices

Write:

1. **WAL** (Cassandra calls it commit log): sequential append; crash recovery uses it.
2. **memtable**: an in-memory ordered structure; put mutates memory.
3. memtable hits a threshold → **flush** to an immutable **SSTable** (sorted KV file on disk).
4. Background **compaction** merges files, drops old versions (the body figure only draws the first three steps; compaction is one sentence out loud).

So writes are fast: the hot path is **sequential disk + memory**, not B+Tree’s “one row update might touch a page.” Follow immediately with the trade-off: **high write throughput is not low write amplification** — compaction rewrites the same key many times. Do not mash those two words into one.

Read:

1. Check memtable first.
2. Then SSTables newest to oldest; use a **Bloom filter** to skip files that definitely do not have the key (“no” really means no; “maybe” is when you open the file).
3. Many layers of files = **read amplification**. Compaction is trading write amplification for read amplification.

| | LSM (this prompt’s default) | B+Tree (contrast, Ch37) |
|---|---|---|
| Write | Sequential WAL + memory | In-place page update, random IO |
| Read | Many SSTable layers, need Bloom | One lookup is more stable |
| Amplification | Write amp and space amp both show | Write amp from whole pages + WAL |
| Fits | Write-heavy AP KV | OLTP, tight point-lookup latency |

**How you say it in the interview:**

> “On the node I default to LSM. put goes WAL then memtable; when it fills, flush to SSTable. Read is memory, then Bloom, then files. I buy throughput with sequential writes and pay back read amplification with compaction. How that compares to InnoDB lives in the storage-choices chapter.”

A hot key still fills one box’s CPU and makes the memtable thrash — LSM does not solve that. Split the key at the app layer, same sentence as Ch05.`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs the original book",
      bodyEn: `<details>
<summary>What the book / notes said then · vector clocks, Gossip/Merkle kitchen sink live here</summary>

${D2}

| Book / notes | How you answer now |
|---|---|
| Vector clocks as the conflict core; hand-calc ancestor vs sibling | **Body default is LWW**. Vector clocks: client has to write merge, the clock grows; Cassandra publicly does not use them. Riak-class systems actually do. Expand in M6 on the Dynamo paper; still mark that production mostly uses LWW |
| Gossip + hinted handoff + Merkle as four pillars next to quorum | Whiteboard is **quorum + LWW + LSM**. Failure: detection / hinted handoff / anti-entropy, one sentence each; mechanics **Ch41** |
| W+R>N equals linearizability | Say **quorum freshness**; linearizability / PACELC go to Ch36 |
| Never mention Redis Cluster | **One contrast sentence**: 16384 slots, one primary per slot, more-CP sharding, not this chapter |
| Never mention Spanner / TiKV | **One CP contrast sentence**; TrueTime / Raft do not expand on this prompt |
| Dynamo paper as an implementation spec | 2026 interview is **Cassandra-style AP + tunable quorum**; DynamoDB evolved into managed + optional strong reads, not an AWS shopping list |

The book skeleton still holds: you partition, you keep N replicas, you use quorum, LSM write path. What aged out is **treating vector clocks as the production default**, and **drawing the failure three-pack at the same length as quorum**.

Vector clocks (this fold only): each replica holds a \`[node → count]\` map, used to tell “A is B’s ancestor” from “concurrent siblings.” Only siblings need app merge. Elegant, but the write path often has to read first, and the vector has to be truncated — that is why production moved to LWW.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. “Why AP on this prompt?” → You still want get/put through a partition (session, cart, timeline). Account/config switch to CP; point at Ch36.
2. “Why not talk CA?” → A distributed system has partitions; P is not optional. Mechanics Ch36.
3. “Why does W+R>N let you read the new value?” → Read and write sets must intersect; on the read side take the highest timestamp.
4. “Is W=1 write-one-box?” → **No.** Write N boxes; W is ACK count.
5. “Is that linearizability?” → No. Quorum freshness. PACELC goes to Ch36.
6. “How do you resolve conflict?” → **LWW**. You drop the concurrent write that lost; clock skew can overwrite the wrong one. Do not make the paper’s causality graph the default.
7. “Can you still write if one box is down?” → N=3 W=2 yes. Two down, strict quorum no; sloppy is Ch41.
8. “Why is LSM write-fast? Is write amplification small too?” → Sequential WAL + memory so throughput is high; compaction makes **write amplification high**. Do not mash them.
9. “How do reads not scan every file?” → memtable → Bloom → SSTable. Bloom says no, you skip.
10. “Isn’t Redis Cluster also a KV?” → Hash slot + primary, a different product. Do not rewrite this into a Redis class.
11. “No Gossip / Merkle?” → Name them: failure detection, hinted handoff, anti-entropy. Expand in Ch41, otherwise over-engineering.`,
    },
    {
      id: "sec-next",
      headingEn: "What’s next",
      bodyEn: `Do not close by saying it is perfect. Three bottlenecks, talk track:

| bottleneck | How you pick it up |
|---|---|
| Single hot key | Ring and quorum do not solve it; split the key / dedicated pool |
| LWW + clock skew | Admit you can drop a concurrent write; if you cannot drop, do not use this AP KV |
| LSM write amp / read amp | Tune compaction levels; read-heavy, contrast B+Tree (Ch37) |

Self-check: close the page, 30-second opening; hand-calc why N=3 W=2 R=2 intersect; say W is not how many boxes you write; what LWW drops; WAL → memtable → SSTable. Wherever you stall, go back to that section.

Next chapter **Ch07 · Distributed unique IDs**: where KV keys come from; Snowflake, UUID, segment IDs, and clock rollback.`,
    },
  ],
  reviewMdEn: `# Ch06 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | What do you say in the KV opening 30 seconds? | Dynamo/Cassandra-style AP; N=3 on the ring; quorum default 3/2/2; conflict LWW; LSM on the node. Redis Cluster in one sentence, then stop. |
| 2 | Why does this prompt default to AP? | You still serve through a partition. Account/config switch to CP (etcd/TiKV/Spanner); mechanics Ch36. |
| 3 | What are N, W, R? | N replica count; W ACKs a write waits for; R responses a read waits for. Default N=3 W=2 R=2. |
| 4 | What does W+R>N guarantee? | Read and write sets must intersect, so a read can hit a replica that was written. Quorum freshness, not linearizability. |
| 5 | Is W=1 write-one-box? | **No.** Still write N boxes; W is how many ACKs the Coordinator waits for before 200. |
| 6 | What about W+R≤N? | Read and write can miss each other → eventual, possibly stale. |
| 7 | Production default for conflict? | **LWW**: bigger timestamp/version wins. Cassandra’s line. |
| 8 | LWW trade-off? | Drop the concurrent write that lost; clock skew can overwrite the wrong one. Do not use this for data you cannot drop. |
| 9 | LSM write path? | WAL → memtable → flush to SSTable; background compaction. |
| 10 | Why write-fast, but write amplification high? | Hot path is sequential write + memory (throughput); compaction rewrites many times (amplification). Two different things. |
| 11 | LSM read path? | memtable → Bloom filter → SSTable. Bloom says no, you skip. |
| 12 | What do you draw at high-level, and what not? | Client → Coordinator → N replicas. Do not redraw a 20-node ring (Ch05). |
| 13 | Redis Cluster in one sentence? | 16384 hash slots, one primary per slot, more-CP sharding. Not this chapter’s default. |
| 14 | Typical over-engineering on this prompt? | Paper failure kitchen sink at the same weight as quorum; causality graph as production default; rewriting the prompt into Redis or Spanner. |`,
});
