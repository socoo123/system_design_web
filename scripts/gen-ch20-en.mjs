import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch20",
  titleEn: "Distributed message queue",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 50–70 min ｜ **Prereq**: transactions / Outbox Ch41; resilience Ch42 (can read later)
> **Goal**: Kafka partitions, consumer groups, ISR, exactly-once, KRaft. Not a Rabbit handbook, not a resilience encyclopedia.

Nearby finished "how you query nearby points"; this prompt swaps in **how events travel reliably**. Default is **design a message queue / Kafka-style log**: append-only log, parallel by partition, consumer groups each tracking their own offset. Not a RabbitMQ five-exchange encyclopedia, not Ch42's delivery-semantics / backlog / circuit-breaker chapter, not a Flink job.

It looks like Producer drops a record and Consumer pulls one. Three hard parts: **partitions and ordering**, **consumer groups and rebalance**, **ISR / EOS / KRaft opening**. The interviewer is not scoring whether you can recite some company's daily volume, an AMQP routing encyclopedia, or a stream-processing topology. They want: how far ordering is guaranteed, how a group scales, when a replica actually means no loss, why exactly-once is expensive, and whether the control plane still needs ZooKeeper.`,
    },
    {
      id: "sec-answer",
      headingEn: "How to answer in the interview",
      bodyEn: `**Opening 30 seconds (say it out loud):**

> "Design a Kafka-style log, not Rabbit's five exchanges, not a resilience encyclopedia. Three hard parts: partitions and ordering, consumer-group rebalance, ISR / EOS / KRaft. Order is partition-local only; same key goes to the same partition. One consumer per partition inside a group. Replication is ISR, \`acks=all\`. exactly-once is expensive; whiteboard default is **at-least-once + idempotent consumers**. Control plane 2026 default is **KRaft**; ZooKeeper goes in the fold. Backlog and retry storms point at Ch42; same transaction as the DB is Outbox (Ch41)."

Then walk the 4 steps. Do not lead with Schema Registry, Connect, Flink, or five exchanges.

${D2}

| Time-box | What you are doing |
|---|---|
| 3–10 min | Clarify: log vs consume-and-delete, ordering scope, retention, semantics, how many independent groups |
| Next 2 min | back-of-envelope: daily volume as a teaching assumption; the fear is hot partitions and backlog, not inventing some company's QPS |
| 10–15 min | High-level: Producer → Broker log → Consumer; KRaft owns metadata |
| 10–25 min | deep dive: key→partition, group rebalance, ISR + EOS opening + KRaft |
| 3–5 min | wrap-up: 3 bottlenecks (hot key, rebalance stops consume, acks vs ISR mismatch) |

**red flag:** drawing Rabbit exchanges / Flink / a circuit-breaker encyclopedia before asking scope; promising global FIFO; treating exactly-once as a free default; still putting ZooKeeper on the first 2026 diagram; inventing LinkedIn's trillions/day as your own fact. That is over-engineering, or dragging a neighbor chapter in whole.`,
    },
    {
      id: "sec-clarify",
      headingEn: "Clarifying questions",
      bodyEn: `Drawing before you clarify = Jimmy. On a message queue, stop at 5–7 questions; assume the rest and write the board. **The first question must be scope.**

| You ask | Typical answer / your assumption | What it changes |
|---|---|---|
| Kafka-style log, or classic MQ (consume-and-delete)? | **A replayable partitioned log** | not five exchanges; Rabbit, mention and stop |
| Global order or partition-local order? | **FIFO within a partition by key** | global order = one partition, throughput collapses |
| How long to retain? Replay? | Teaching: **~7 days**; consume does not delete | disk cuts segments by retention |
| Delivery semantics? | **at-least-once**; EOS opening | consumers must be idempotent; transactions are a separate sentence |
| How many independent consumer groups? | **≥2** (business + audit-class) | each group has its own offset |
| Rough daily volume? | Teaching: **~1e8 records/day** | size partitions and disk—not some company's internal number |

When they say "you decide," write the assumptions:

> "I'll assume: a Kafka-style partitioned log, not a Rabbit handbook. Order is FIFO within a partition by message key, not global. Retention ~7 days, replayable. Default at-least-once; consumers are idempotent on a business key. Replication RF=3, \`acks=all\`, ISR. Control plane is KRaft. I'll draw on that—cut me off if it's wrong."

If they chase five exchanges, delayed-queue plugins, Flink windows, circuit-breaker retry storms: **acknowledge the difference, then close it.** "AMQP routing is another kind of broker; backlog, poison messages, circuit breakers are Ch42. This loop is partitions, consumer groups, ISR, and KRaft." If they chase the same transaction as the order: Outbox / CDC points at Ch41; do not turn it into a CDC-platform prompt. Asking past 10 minutes is also a red flag. The golden line is still: **ask the key questions → state your own assumptions → write the board → move.**`,
    },
    {
      id: "sec-estimate",
      headingEn: "Back-of-the-envelope",
      bodyEn: `Formulas live in Ch03. Here you only need order of magnitude: prove you know **this prompt's bottleneck is hot partitions, rebalance, and replica acks—not "invent some company's peak."** Whiteboard **teaching assumptions** below—not some company's internal numbers, and not a public "trillions/day" as your own QPS.

Assume an internal event bus of about **1e8 records/day**; mean size **~1 KB**; peak about **5–10×** daily average; retention **7 days**; replicas **RF=3**. Compression and batching cut the network further; estimate uncompressed first.

| Item | How you estimate | Order of magnitude (teaching) |
|---|---|---|
| Daily writes | 1e8 / 86400 | **~1e3 QPS**; peak **~1e4** |
| Daily storage (uncompressed) | 1e8 × 1 KB | **~100 GB/day** |
| 7 days × RF=3 | 100 GB × 7 × 3 | **~2 TB** order of magnitude |
| Parallelism | in-group parallelism ≤ partition count | pre-partition **tens to hundreds**; a hot key still piles into one partition |
| Backlog | lag = log end − committed | adding instances only scales to the partition count; extra ones sit idle |

A log looks like "just write disk." What is expensive is: **the same key punching through one partition**, and **the whole group stopping consume during rebalance, or ISR shrinking so \`acks=all\` cannot write**. Drawing ingress as a million QPS without partitions and ISR is inventing numbers, not estimating.

**Interview line:**

> "A hundred million/day on the board: thousands of QPS daily, tens of thousands at peak. Disk is TB-class from retention and replicas. What I actually fear is hot partitions and group rebalance. I will not treat some company's daily volume as an internal number."

Common mistakes: treating a public "trillions/day" as your own fact QPS; or reporting only the average and pretending every key is uniform. Teaching uses order of magnitude, and you **label the assumptions**.`,
    },
    {
      id: "sec-arch",
      headingEn: "High-level architecture",
      bodyEn: `Left to right, draw only **one data plane**: Producer → Broker (partitioned log) → Consumer. Do not fan out Schema Registry, Connect, Streams, Flink, five exchanges, or multi-Region on this diagram. The broker holds **append-only partitions**; consumer groups each record offset on an internal topic. **KRaft controller quorum** owns metadata (topics, partition leaders, ISR)—it does not carry business bytes. After they buy in, split how keys route and how a group rebalances.

${D2}

**This diagram cites**: Ch42 Messaging, resilience · Ch41 Replication, sharding, transactions

**Write path:** the client library picks a partition by key, batches (\`linger.ms\` / \`batch.size\`) → hits that partition's **leader** → leader appends the WAL → followers enter ISR, then it commits the **high watermark** → \`acks=all\` is the only success. Events that must share a transaction with the DB: **write Outbox first, then produce** (Ch41). Do not make "write the DB then naked send on the request thread" the only plan. CDC from binlog into a topic, mention only—not this chapter.

**Read path:** the consumer joins a **group** → is assigned some partitions → **pull** from the committed offset (long poll) → process → commit offset. Consume does not delete the log; expiry drops segments by retention. Another group can replay from the start.

${D2}

Throughput is **sequential write + batch + pagecache / sendfile**, not "messages must live in an in-memory store." Latency wants small batches; log aggregation wants large ones. Do not unpack a zero-copy lecture at high level.

Backlog, poison messages, retry storms, circuit breakers: **point at Ch42**; this loop is not a resilience encyclopedia. Stop the high-level here. Ask: "Does this direction look OK? Next I'll dig into partitions and ordering, then consumer-group rebalance, then ISR, exactly-once, and KRaft."

**Interview line:**

> "Producer hits the broker's partitioned log; Consumer pulls by group. Consistency with the DB is Outbox. Control plane is KRaft; the data plane does not draw ZooKeeper."`,
    },
    {
      id: "sec-partition",
      headingEn: "Deep dive · Partitions and ordering",
      bodyEn: `First hard part. The log's unit of parallelism is the **partition**, not the topic, and not "the whole bus is one FIFO." 2026 whiteboard first sentence: **order is partition-local only; the same key hashes to the same partition. There is no global order.**

${D2}

**This diagram cites**: Ch41 Replication, sharding, transactions

**topic / partition / offset:** a topic is a logical stream; each partition is one append-only file (cut into segments). Writes only append; the position is a monotonic **offset**. With no key, the client sticky-batches onto one partition (throughput) and **does not preserve order across messages**. With a key: \`hash(key) % N\` (Kafka default murmur2) → same key, same partition → **that key's events are FIFO**.

**Do not add partitions lightly.** When N changes, almost every key's routing changes; events that used to share a partition get split. Kafka lets you add, not shrink. 2026 default: **pre-partition enough at create time** (more than the near-term consumer count); scale throughput by **adding consumers** first, leave N alone. A hot key (whale user, hot SKU) still piles into one partition no matter how many you add—that is the partition model's trade-off, not something another hash round erases.

| | Partition-local FIFO | Global FIFO | Unordered |
|---|---|---|---|
| How | same key, same partition + one consumer in the group | **one partition** | no key / consume across partitions |
| Throughput | scales with partition count | equals one leader | highest |
| Interview | **the default promise** | only for an audit ledger | OK for log aggregation |

If two consumers in a group read the same partition, order is gone—so Kafka **assigns a partition to only one member of the group at a time**. That sentence feeds the next section. Pick a business ordering key (\`user_id\` / \`order_id\`); do not hash a random UUID and still promise "this user's events are ordered."

**Interview line:**

> "Order follows the key into a partition. Global order is one partition—do not promise it casually. Pre-partition enough; do not change N to scale and smash affinity."

trade-off: more partitions spread throughput and disk files; you give up cross-partition order, hot keys still sit in one partition, and changing N breaks affinity. Collapsing the whole topic to one partition for "absolute global order" turns the queue into a single-box queue.`,
    },
    {
      id: "sec-group",
      headingEn: "Deep dive · Consumer groups and rebalance",
      bodyEn: `Second hard part. A **consumer group** is both point-to-point and pub-sub: members of the same group compete for partitions = a record is processed once inside the group; **different groups each have their own offset** = the same log is replayed independently. In-group parallelism caps at the partition count; extra consumers beyond that sit **idle**.

${D2}

**This diagram cites**: Ch42 Messaging, resilience

**How you consume:** default is **pull**. The consumer controls rate and batches well; an empty log uses long poll so you do not spin the broker. Push is lower latency, but a slow consumer gets flooded—whiteboard first answer is still pull. Commit offset after processing = **at-least-once** (a crash replays); commit first, then process = at-most-once (you can lose). Auto-commit is fine for a demo and easy to drop or duplicate on a processing failure in prod—say you prefer manual in the interview.

**Rebalance:** a member joins / leaves / heartbeats time out, and the **group coordinator** (a broker, located by group id) reassigns partitions. Classic protocol is **stop-the-world**: the whole group pauses fetch until assignment finishes. A large group with frequent scale events is a visible stall. 2026 opening: **cooperative / incremental** only moves affected partitions; Kafka **4.0**'s next-gen protocol (KIP-848) is ready on the server, client **\`group.protocol=consumer\` opt-in**—do not turn the KIP number into a chapter, and do not pretend every old client already defaults to incremental.

Backlog: look at **lag**. Horizontal instances only scale to the partition count; still not enough → **add partitions** (accept key remapping) or split the topic. Sync RPC plus unbounded retries inside the consumer is a **retry storm**—circuit breakers, isolation, DLQ are **Ch42**; mention and stop. Share groups (Kafka 4.0 EA, queue-style steal of single records) are **not the whiteboard default**; still draw a consumer group.

**Interview line:**

> "One consumer per partition in a group keeps order. Multiple groups each have their own offset. Classic rebalance stops consume; 2026 opening is the incremental protocol. Backlog, look at partition count first; retry storms go to Ch42."

trade-off: static partition assignment is simple and keeps order clear; scale-out and rolling deploys trigger rebalance. Treating every request as an independent queue and dropping partition order is a different prompt (share groups / classic MQ)—do not change the problem mid-loop.`,
    },
    {
      id: "sec-isr",
      headingEn: "Deep dive · ISR, exactly-once, and KRaft",
      bodyEn: `Third hard part, three-sentence opening: **ISR decides when a write counts and where the leader is elected from; exactly-once is expensive; the 2026 control plane is KRaft.** Do not write resilience, transactional messaging, or CDC as neighbor chapters.

${D2}

**This diagram cites**: Ch42 Messaging, resilience · Ch41 Replication, sharding, transactions

**Replication and ISR:** RF per partition is commonly **3**. Producer writes the leader only; followers fetch. **ISR** = replicas that have caught up within \`replica.lag.time.max.ms\`. \`acks=all\` (Kafka 3.0+ default) waits for the **current ISR** to append; consumers only read up to the **high watermark**, so they never see a dirty tail that might get truncated. \`min.insync.replicas=2\`: when ISR shrinks to 1, \`acks=all\` refuses writes—availability for durability. If the leader dies, **elect only from ISR**; unclean leader election can lose already-acked data, so the whiteboard default is off. ELR (KIP-966, 4.0 preview): interview mention is "a safer-to-elect subset of ISR," then stop.

${D2}

**exactly-once:** an idempotent producer (PID + per-partition sequence, **on by default in 3.0+**, requires \`acks=all\`) only guarantees **no double-write from retries in the same session, same partition**. Cross-partition, consume–process–produce, tying offset to output: that needs **transactional id + the transaction coordinator**, and consumers on \`read_committed\`. This end-to-end EOS **only holds inside the Kafka closed loop**; writing out to an external DB still needs business idempotency or Outbox (Ch41). Interview: **EOS is expensive (latency, throughput, ops); practice default is at-least-once + idempotent consumers**; do not turn "Kafka supports exactly-once" into every pipeline getting free exactly-once.

${D2}

**KRaft:** the controller quorum writes internal \`__cluster_metadata\` with Raft; brokers **pull** incremental metadata. Production commonly **3 or 5 dedicated controllers**—do not colocate them with heavy-disk brokers as the first answer. **Kafka 4.0 (2025-03) no longer ships ZooKeeper mode**; a 3.x cluster still on ZK must migrate to KRaft before 4.x. The book's all-ZK path: put it in the fold, not on the 2026 first diagram.

**Interview line:**

> "\`acks=all\` waits for ISR; a new leader is elected only from ISR. EOS is idempotent producer plus transactions, and it's expensive; default is at-least-once plus idempotent consumers. Control plane is KRaft; do not draw ZooKeeper."

trade-off: a larger ISR and \`acks=all\` are safer and slower; shrinking ISR lets you write but weakens durability. Transactions buy Kafka-internal atomicity at the cost of the coordinator and \`read_committed\` latency. Setting \`min.insync\` equal to RF for "never lose a byte" means one jittery follower refuses writes.`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs the book",
      bodyEn: `<details>
<summary>How the book / notes told it then (not the first answer)</summary>

Xu Vol.2 covers topic/partition, WAL, consumer groups, pull, leader/follower thoroughly. Partition-local order and batching still hold. What aged is **ZooKeeper the whole way**, replication as only "3 replicas + enough of them," semantics as only "configurable," and reciting some company's daily volume. The notes already patched ISR / EOS / KRaft; this page reorders around 2026 defaults and does not treat the notes as the body.

| Book or notes | How you answer now |
|---|---|
| Control plane defaults to ZooKeeper / etcd | **KRaft controller quorum**; ZK only in the fold. Kafka **4.0 dropped ZK mode** |
| Replication is only leader/follower | **ISR + HWM + \`min.insync.replicas\`** |
| Delivery semantics "configurable" | Opening EOS = idempotent producer + transactions; **practice default at-least-once + idempotent consumers** |
| Idempotence / transactions as a 2026 patch | Idempotent producer **on by default in 3.0+**; transactions still on demand |
| Rebalance is only stop-the-world | Opening **incremental / KIP-848 opt-in** |
| Five AMQP exchanges as the main diagram | **This prompt is a Kafka log**; Rabbit, mention only |
| Pulsar named, never explained | Storage/compute split in **one sentence**; do not make it this loop's main architecture |
| Long retention all on local disk | **tiered storage**, mention only; no object-storage chapter |
| Some company / LinkedIn QPS as fact | **Teaching assumptions**; order of magnitude only |
| Flink / Streams jobs | **Not this loop** |

Still-valid skeleton: the partition is the unit of parallelism and order, WAL sequential append, one consumer per partition in a group, pull + long poll. Outdated is drawing ZooKeeper onto the 2026 main path, and treating exactly-once as a zero-cost default.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **"Is this Rabbit or Kafka?"** → Default is a replayable partitioned log. Five exchanges are not this chapter.
2. **"Can you guarantee global order?"** → Only partition-local. Global = one partition. Same key, same partition.
3. **"Can I add partitions whenever?"** → Adding changes \`hash % N\` and smashes order affinity. Pre-partition enough; scale by adding consumers first.
4. **"More consumers than partitions?"** → Extra ones sit idle. Parallelism caps at the partition count.
5. **"Push or pull?"** → Default pull + long poll. A slow consumer does not get flooded.
6. **"Can you consume during rebalance?"** → Classic protocol stops. Opening is cooperative / 4.0 new protocol opt-in.
7. **"Leader dies—do we lose data?"** → \`acks=all\` and elect only from ISR: committed data stays. Unclean election can lose.
8. **"How do you implement exactly-once?"** → Idempotent producer + transactions. Expensive. Practice default is at-least-once + idempotent consume. Across a DB you still need Outbox (Ch41).
9. **"Do we still need ZooKeeper?"** → **Not as a 2026 default.** KRaft; no ZK mode from 4.0 on.
10. **"What if we're backlogged?"** → Look at lag and partition count. Retry storms, circuit breakers, DLQ → **Ch42**.
11. **"Why disk instead of pure memory?"** → Sequential append + pagecache, capacity and retention. Not an HDD latency table.
12. **The final diagram is already huge and they keep stacking?** → Registry, Flink, five exchanges, a resilience encyclopedia are not this chapter. Three hard parts spoken clearly scores higher than 20 boxes.`,
    },
    {
      id: "sec-next",
      headingEn: "Wrap-up and what's next",
      bodyEn: `Wrap-up never says perfect. Three bottlenecks out loud:

| bottleneck | How you take it |
|---|---|
| Hot key / casual global-order promise | Partition-local FIFO; same key, same partition; pre-partition N, do not add partitions casually |
| Rebalance stops consume / more instances than partitions | One consumer per partition in the group; opening incremental protocol; backlog is lag (Ch42) |
| Replicas and semantics fuzzy | ISR + \`acks=all\`; EOS is expensive; default at-least-once; control plane KRaft |

Self-check: close this page. 30-second opening + high-level on the board; walk partition order, consumer groups, ISR, why EOS is expensive, and KRaft to the air. ZooKeeper only in the fold. Outbox in one sentence to Ch41. Do not unpack backlog and retries into a resilience chapter. Wherever you stumble, come back to that section.

Next problem is **Ch21 · Hotel booking & flash-sale inventory**. The queue is "how events travel reliably"; the next prompt swaps in inventory hold, idempotency, and an order spike—from broker logs back to transactional correctness.`,
    },
  ],
  reviewMdEn: `# Ch20 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | Three hard parts of a message queue? | Partitions and ordering; consumer-group rebalance; ISR / EOS / KRaft opening. Not a Rabbit handbook, not all of Ch42. |
| 2 | Whiteboard default? | **A Kafka-style partitioned log** (replayable). Not five exchanges, not Flink. |
| 3 | How far does order go? | **FIFO within a partition**; same key, same partition. No global order (unless one partition). |
| 4 | Why not add partitions casually? | \`hash(key) % N\` changes and smashes affinity. Pre-partition enough; scale by adding consumers first. |
| 5 | How does a consumer group keep order and do pub-sub? | One consumer per partition in the group. Multiple groups each have an offset = independent replay. |
| 6 | More consumers than partitions? | Extra ones sit idle. Parallelism cap = partition count. |
| 7 | Rebalance pain? | Classic stop-the-world. Opening incremental; Kafka 4.0 new protocol is client opt-in. |
| 8 | ISR / acks opening? | ISR is caught-up replicas; \`acks=all\` waits for ISR; elect leader only from ISR; read up to HWM. |
| 9 | exactly-once interview line? | Idempotent producer + transactions, **expensive**. Practice default **at-least-once + idempotent consumers**. Across a DB → Ch41. |
| 10 | Still draw ZooKeeper in 2026? | **No.** Default **KRaft**. Kafka 4.0 dropped ZK mode. ZK only in the fold. |
| 11 | How do you commit with the DB? | **Outbox / CDC, point at Ch41**. Do not pretend Kafka transactions cover an external DB. |
| 12 | Biggest over-engineering on this prompt? | Five exchanges, Flink, fake company QPS, EOS as a free default, dragging all of Ch42 resilience in. |`,
});
