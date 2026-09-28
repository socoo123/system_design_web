import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch41",
  titleEn: "Replication, sharding, transactions",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 90–120 min ｜ **Prereq**: Ch06 quorum; Ch36 CAP grid
> **Goal**: primary/replica, shard keys, Saga / Outbox / CDC; why 2PC is often a no. No cloud shopping.

This is **M6's sixth foundation chip**, not another 4-step design problem. On the spine, KV replicas, order inventory, payment posting, and dual-writes to MQ and DB all hit “how you keep another copy, how you split, how you stay consistent across services”—this chapter unpacks **primary/replica replication, shard keys, Outbox / CDC, Saga, and why 2PC is often a no**. Design problems just cite it; they do not turn the whiteboard into a distributed-database class. Ch06 already covered **leaderless + quorum**; this chapter is the **topology that has a Primary**. We do not re-teach LWW / vector clocks. Kafka partitions are **Ch20**; here we only recycle “how you slice tables,” not a messaging class.

**One line:** reads and writes default **Primary writes, Replica follows**; when you split a database, pick a shard key that is **high-cardinality, even, and aligned with queries**; cross-service dual-write defaults **Outbox + CDC**; long flows use **Saga**; on the user-facing path **do not draw your own 2PC / XA**.

Three hard parts (the pieces worth digging):

1. **Replication lag vs failover** — an async 200 does not mean the Replica has it; promoting a lagging replica drops already-acked writes
2. **How to pick a shard key** — cardinality, hotspots; cross-shard join is not the default
3. **2PC is a no + Outbox/Saga is the default** — blocking + a coordinator; user path uses local transactions + events

This chapter **does not cover**: isolation-level encyclopedia as the spine, Raft paper / C++ recitation, AWS DMS shopping, re-teaching Ch06 Dynamo, treating Kafka partitions as this chapter (Ch20), a Temporal / Step Functions product tour, a NewSQL SKU catalog. etcd leases go back to **Ch08**. Delivery semantics and backlog go to **Ch42**.`,
    },
    {
      id: "sec-pitch",
      headingEn: "One-line definition · 20-second interview open",
      bodyEn: `First put the scoring signal on the table: you can draw primary/replica, you can pick a shard key, and you do not open a cross-service path with XA.

> "Replication I default **Primary writes, Replica follows asynchronously**. Read the Replica right after a write and it may be stale—that's **replica lag**. Failover that promotes a lagging replica drops the window the Primary already 200'd but the Replica hadn't caught up—**async replication's RPO is not 0**. If failover almost never loses writes, wait for replica ACK (sync or semi-sync) and pay latency. When data outgrows one box, shard: the key needs **high cardinality, scatter hotspots, queries land on one shard**; cross-shard join is not the default. Same-database transactions if they fit. Cross-service dual-write defaults **Outbox + CDC**: business row and outbox in the same local transaction, then emit from the log. Long flows are **Saga** (local transaction chain + compensations)—pick choreography or orchestration. **2PC on the user path is often a no**: coordinator dies, participants block in prepared; payment rails don't join your XA. Raft in one line: a write commits only on a **majority**; only the **leader** takes writes—etcd / a lot of consensus stores use this; it is not the primary/replica lecture."

The whole chapter walks this one chain. Say the 20 seconds, then stop. Let the interviewer decide whether to dig into replication, sharding, or transactions.

${D2}

This figure cites: Ch06 quorum (leaderless contrast) · Ch36 PACELC Else (wait for replicas or not)

| Interviewer ask | Where you land |
|---|---|
| "Primary dies—is the data still there?" | Ask sync or async first; async, look at the lag window |
| "How do you split the database horizontally?" | Shard key first; don't open with a cloud sharding SKU |
| "How do order and payment commit together?" | Same DB → local transaction; cross-service Outbox / Saga, not 2PC |

**red flag:** opening with XA / 2PC across payment rails; saying "we have replicas so failover never loses data" without naming lag; sharding on \`status\` / a boolean; using Ch06's N/W/R as the primary/replica talk track; treating Kafka partitions as a table-sharding class.`,
    },
    {
      id: "sec-repl",
      headingEn: "Mechanism · Replication (lag vs failover)",
      bodyEn: `First hard part. **In a 2026 interview, reciting "three replicas" is worse than saying whether replica lag or failover wins.** Default topology here: **one Primary takes writes, Replicas follow the log** (leader-follower / primary-replica). Ch06's Dynamo style is **leaderless + quorum**, conflicts via LWW—**we do not re-teach that**. Both are called replication; the whiteboard topology is not the same.

${D2}

This figure cites: Ch36 Else branch (wait for replicas = buy C, pay L) · Ch06 leaderless contrast (don't paste N/W/R onto this chain)

Writes hit Primary only. Replicas chase a replication stream (WAL / binlog). Reads can hit a Replica for throughput, but consistency is a different sentence.

| | **Async** | **Sync** (incl. semi-sync: wait for at least one ACK) |
|---|---|---|
| When the write 200s | Primary local commit, then return | Wait until a Replica has received it (or fsynced) |
| Write latency | Low | Adds replica RTT; cross-AZ / cross-continent hurts |
| replica lag | **The normal case**: seconds or worse | At commit, the Replica already has this write |
| Failover: lose acked writes? | **Can lose** the lag window (RPO > 0) | The promoted box already has the commit; RPO near 0 |
| Replica dies | Writes still go (the replica just falls behind) | Writes block, or you degrade to async—say which, in advance |
| PACELC | Else leans **L** | Else leans **C** |

The sequence interviewers love: **write, then immediately read the Replica.**

${D2}

200 only guarantees the Primary. The Replica is still catching up; GET returns a stale row. That is not a bug; it is the async contract. For read-your-writes: send this read to Primary, sticky-session to Primary, or wait until the replication position catches up. A Feed can live with stale; "the password I just changed / the inventory I just decremented" should not default to Replica.

**Failover is not "rename a Replica to Primary" and done.** Detect → stop writes on the old primary → pick a Replica to promote → clients cut over. The hard part is tied to lag:

1. **Async + promote a lagging replica** = the client already saw a 200, the new primary does not have the row. Reconciliation, compensation, user retry score higher than pretending RPO=0.
2. **Old primary is not fenced and still takes writes** = split-brain; both sides write. After promote, the old primary must refuse writes (STONITH / lease expiry / read-only). Don't only flip DNS.
3. **Sync buys not-losing, and you pay latency and availability.** Replica in the far DC, every COMMIT nailed to a cross-continent RTT—Ch02 / Ch36 already said pick by the data. A ledger can sync in-metro; a timeline can async across oceans.

Semi-sync (MySQL-class: wait until at least one replica has the event, then commit) is the middle gear: lose less than pure async, wait on fewer people than full sync. Name it and stop; don't open a replication-plugin class.

Ch06 contrast, one sentence then stop: **leaderless** writes N boxes, waits for W ACKs; there is no "promote a Primary" hop; the failure model is quorum and hinted handoff (that chapter points here). **Primary/replica** has a single write point; failover is an explicit cutover; lag is the first risk. Don't recite W+R>N as the primary/replica talk track.

How to open it:

> "Primary/replica defaults async: writes are fast; reading a Replica may be stale. On failover I ask whether the replica has caught up; if not, I admit we lose the lag window. Need almost no loss, go sync and pay latency. I will not say replicas mean we never lose data."

**red flag:** "three replicas so if the primary dies we lose nothing"; failover with no fencing; drawing quorum KV and primary/replica as one diagram that still shares N/W/R; treating cross-continent sync as free strong consistency.`,
    },
    {
      id: "sec-shard",
      headingEn: "Mechanism · How to pick a shard key",
      bodyEn: `Second hard part. **Sharding splits one logical table across machines; pick the wrong key and adding boxes does not scale.** How consistent hashing finds a node is **Ch05**. A Kafka partition is a log-parallelism unit; order holds only inside a partition—**Ch20**; don't redo the messaging problem here. This chapter asks: **which column you slice rows on.**

${D2}

Three talk-track sentences are enough:

1. **High cardinality.** You need enough distinct values to actually make many slices. \`status\`, a boolean, a country code with a dozen buckets—traffic collapses onto a few shards, and one of them is still a single box.
2. **Even, avoid hotspots.** A whale user, a hot SKU, a popular room: every write lands on the same shard. Hashing the key does not save you when **one value owns a shard**. Mitigations: split the hot key (suffix buckets), give that entity its own pool, or accept vertical scale on that shard. A monotonically increasing \`order_id\` as a **range** shard key makes new writes forever smash the newest shard.
3. **Align with queries; cross-shard join is not the default.** Shard orders on \`user_id\` and a user's list lives on one shard—one local query. Shard on \`order_id\` and "this user's last 20 orders" scatter-gathers across many shards. Cross-shard join / cross-shard transactions are you buying distributed; they are not a free SQL feature. Need both access patterns: **dual-write a table organized on the other key** (or an async projection). Don't open with "global 2PC join."

| Key | When it looks right | When it blows up |
|---|---|---|
| **\`user_id\` / \`tenant_id\`** | Requests already carry the user; orders, sessions, config | A huge tenant / celebrity account saturates one shard |
| **\`order_id\` hash** | Point lookup by order id; writes relatively even | "My order list" needs scatter-gather |
| **Time range** | Daily log scans, hot/cold tiers | Current partition is write-hot; historical shards idle |
| **\`status\` / type enum** | Almost never | Low-cardinality hotspot; classic red flag |

Keep an entity **on one shard** when you can: order row and line items share \`order_id\` (or the same \`user_id\`) on one box, so local transactions still work. Helland later called this a repartitionable entity—in the interview say "one aggregate, one shard if you can" and stop; don't open a DDD class (Ch45).

Hash vs range: hash scatters writes; range makes interval scans easy and also heats the head and tail. Ask whether access is point lookup or range scan, then pick. Rebalancing (split a hot shard, move it) — point at "the key has to allow a later split." Don't draw an auto-balancer product.

How to open it:

> "Key first: cardinality and hotspots, then whether queries can land on one shard. Cross-shard join is not my default. Hot users get special handling. I don't slice on \`status\`."

**red flag:** sharding on payment status; claiming "NewSQL auto-shards so I don't pick a key" without being able to talk hotspots; moving a whole Kafka \`hash(key) % N\` lecture in as the table-sharding class.`,
    },
    {
      id: "sec-tx",
      headingEn: "Mechanism · Transactions / Outbox / Saga (why 2PC is often a no)",
      bodyEn: `Third hard part. **Same database, use a local transaction; across services, don't pretend you are still in one COMMIT.** Isolation levels (RC / RR / Serializable)—know the names; **forbidden as this chapter's spine**. Whiteboard default: single database, single shard, ACID; across databases and services, switch to Outbox and Saga.

**Dual-write:** one request writes the DB **and** publishes to MQ (or writes a second database). Write DB then send: process dies before send → the event is gone. Send then write DB: DB rolls back → a ghost event is already outside. Two steps are not atomic.

${D2}

**Why 2PC / XA is often a no in interviews (user path):**

1. **Blocking.** After a participant votes yes it enters prepared, still holding locks, waiting for the coordinator to commit/abort. If the coordinator crashes then, the participant is **in-doubt**: it cannot unilaterally commit or discard until the coordinator comes back. The user request is still sitting on a timeout.
2. **The coordinator.** Extra round of network; everyone has to be alive at once. Payment rails and SMS gateways **do not join your XA**. Ch24: don't 2PC out to a PSP.
3. **Fights retries.** User refresh, gateway retry—"stuck exactly in prepared" is harder to talk than local transaction + idempotency.

**Inside** the database, 2PC / Percolator (NewSQL cross-shard) is fine—that's the engine. What the interview rejects: **you draw a coordinator on the business diagram that locks the order DB, the payment rail, and the inventory service.** That is a red flag.

**Outbox (2026 dual-write default):** the business row and the \`outbox\` row are written in **the same local transaction**. Commit success = the event is at least in the database. A separate relay then publishes to MQ: poll the outbox, or **CDC** reading WAL / binlog (touch the business table less). After a successful send, mark delivered or advance a log position. Consumers **must be idempotent** (Relay is at-least-once). When one aggregate must stay ordered, use the aggregate id as the message key (which partition is Ch20; here only "don't scramble the same order").

${D2}

This figure cites: Ch18 order side effects · Ch24 notify the order after posting · Ch20 message delivery (at-least-once; this chapter does not unpack backlog)

CDC is "capture changes from the log": the DB is still the source of truth. Event sourcing is "events are the truth"—**not the same sentence**; name it and stop. Don't recite DMS / a cloud migration SKU.

**Saga:** a long flow split into several **local transactions**, each with a **compensation** (not a DB rollback across services). The 1987 paper was about long transactions holding locks; a 2026 interview uses it on place-order → charge → reserve-inventory style cross-service chains. Ch18 cancel-order returns inventory, pay-after-cancel refunds—that is compensation; you don't have to draw an orchestration engine.

${D2}

| | **Choreography** | **Orchestration** |
|---|---|---|
| Who advances | Each step finishes and emits; downstream subscribes | One orchestrator calls each step in order |
| Compensation | Scattered in each service's subscriptions | Orchestrator calls compensations in reverse |
| Fits | Few steps, clear boundaries, you want decoupling | Many steps, you want a picture, failure policy in one place |
| Pairing | Events must not vanish → **Outbox** | Still a local transaction per step; don't treat the orchestrator as 2PC |

One grid is enough. Don't open a workflow-engine shopping trip. Short holds (auth-hold on a charge) can name **TCC** in one line: Try reserves, Confirm commits, Cancel releases; long flows are still Saga. Ch24 ledger correctness does not come from a Saga textbook.

${D2}

The happy path is three leaves. On failure, compensate in reverse (fail before ship → refund / release inventory)—say it; don't hang a second, uneven-length leg on the diagram.

How to open it:

> "Across services I don't use 2PC: it blocks, and rails don't join XA. Dual-write is Outbox + CDC. Long chains are Saga: few steps choreography, many steps orchestration. If one local transaction can wrap it, I don't split."

**red flag:** first diagram is XA out to a PSP; Outbox that \`send\`s outside the transaction; Saga as a BPM product demo; reciting an isolation-level table for 20 minutes.`,
    },
    {
      id: "sec-choose",
      headingEn: "Choice table",
      bodyEn: `Pin the defaults on the whiteboard first, then talk consensus engines. Drawing all three is over-engineering.

| Scenario | Default | Don't |
|---|---|---|
| Single DB, scale reads | **Primary writes + async Replica reads** | Pretend a Replica read equals the write you just did |
| Ledger / must read what you just wrote | Read Primary, or **sync / semi-sync** | Cross-continent sync as free |
| Primary dies, cut over | Ask lag first; async, admit RPO; **fence the old primary** | "We have replicas so we don't lose" |
| AP KV, no single primary | **Ch06 quorum**, not this chapter's primary/replica | Paste N/W/R onto a Primary |
| Locks / config majority | **Raft** (Ch08 etcd) | Async primary/replica as lock authority |
| Table outgrows one box | **Shard key** first (cardinality, hotspots, query alignment) | Slice on status; cross-shard join as default |
| Same DB, several tables | **Local transaction** | Split for "microservice purity," then 2PC them back together |
| Write DB + emit event | **Outbox + CDC** | Bare \`send\` on the request thread |
| Cross-service long flow | **Saga** + compensations; few steps choreography, many orchestration | XA on the user path |
| Payment rails | Local post + idempotency + recon (Ch24) | 2PC out to the rail |

Raft is a talk-track close, not an implementation unpacked on this table:

${D2}

**Interview one-liner:** the client talks to the **leader**; an entry is committed only once replicated to a **majority**; a minority cannot crown itself the new leader and walk forward on an uncommitted fork. etcd and a lot of NewSQL Raft groups are this model. Async primary/replica **is not** Raft. Don't recite election timeouts, log-matching proofs, or C++ pseudocode.

Spoken default, one more time:

> "Primary/replica: ask sync or async first. Sharding: ask the key first. Cross-service: Outbox / Saga. 2PC stays inside the engine, not on the user request."`,
    },
    {
      id: "sec-papers",
      headingEn: "Papers and classic systems",
      bodyEn: `M6 needs names you can drop. Two required, two optional below. **The interview one-liner** is in the table; don't memorize page numbers, don't treat Raft as whiteboard homework.

${D2}

The timeline is only a memory aid: first, long transactions split into compensatable steps; then the engineering opinion that at scale you often stop relying on distributed transactions; then a majority replication log you can actually explain. That does not mean you implement all three.

| | Paper | Required / optional | Interview one-liner |
|---|---|---|---|
| 1 | **Ongaro & Ousterhout**, USENIX ATC 2014, *In Search of an Understandable Consensus Algorithm* | Required | Raft = consensus on a replicated log. The **leader** takes writes; an entry commits on a **majority**. Split into leader election / log replication / safety so it is easier to teach than Paxos. Stop at this sentence; etcd uses it; don't recite the paper's algorithm |
| 2 | **Garcia-Molina & Salem**, ACM SIGMOD 1987, *Sagas* | Required | A long transaction is a chain of interleaved local transactions; either you finish, or you run **compensations** to undo partial work. 2026 cross-service flows use this name; it is not a proof that Saga replaces 2PC |
| 3 | **Helland**, CIDR 2007, *Life beyond Distributed Transactions: an Apostate's Opinion* | Optional | At scale, distributed transactions across entities are often abandoned; you move to **local transactions on small entities + messages**. Use it to back "2PC is a no on the user path," not to claim transactions are useless |
| 4 | **Gray**, 1978, *Notes on Data Base Operating Systems* (LNCS 60) | Optional | Classic source for 2PC / WAL / locks. Interview use: **prepared blocking**—when the coordinator vanishes, participants are in-doubt. Know the pedigree; don't treat 1978 as the 2026 default architecture |

Transactional Outbox is a **pattern** in microservices (business + outbox in one transaction, then CDC / Relay emits). It is not an NSDI of the same name. CDC is the engineering practice of reading the transaction log. Both score on mechanism; don't invent a conference paper.

Classic systems are just nails: MySQL / Postgres primary/replica → this section's replication; Cassandra leaderless → **Ch06**; etcd Raft → **Ch08**; Kafka partitions and ISR → **Ch20**. Spanner / TiDB can commit across shards internally—point at "the engine can; the business diagram still does not draw XA out to a rail" and stop.`,
    },
    {
      id: "sec-used",
      headingEn: "Which design problems use this",
      bodyEn: `Do the spine problems first; jump into this chapter when you get stuck. Back-links are not "finish M6 then start writing."

| Chapter | The sentence you use |
|---|---|
| **Ch02** scale | Add Replicas to share reads; cross-DC replication pays RTT; pick sync vs async by the data |
| **Ch05** the ring | Key routing; this chapter fills in "which column is the key" |
| **Ch06** KV | Leaderless quorum; failover / primary-replica topology lives here. Don't bring LWW back |
| **Ch08** locks | Correctness locks go through a Raft majority; async primary/replica as a lock loses the lock on failover |
| **Ch11** Feed | Timeline can read a lagging Replica; fan-out does not need strong sync |
| **Ch12** chat | Sessions shard on \`conv_id\`; a hot group is a hot key |
| **Ch18** orders | Same-DB CAS reserve; side effects **Outbox**; Saga only names compensation, don't draw an engine |
| **Ch20** MQ | Same transaction as the DB → Outbox, then produce; the partition class lives there |
| **Ch21** flash sale | Hot SKU is a shard hotspot; a reserve still has to land back on the authoritative row |
| **Ch24** payments | Post in a local transaction; **no 2PC out to the rail**; Outbox notifies the order |
| **Ch36** CAP | Sync replication = Else buys C; async buys L. Primary/replica failover is not a CAP poster |
| **Ch37** storage | Pick the single-box engine first; then replication and sharding |
| **Ch42** messaging resilience | at-least-once, backlog, retries; this chapter only gets the event out of the database |
| **Ch45** DDD | Aggregate boundary ≈ try to stay on one shard; domain events often ride Outbox |

Short URL, notifications, comments: the read path can be a Replica; **counter decrements and unread as source of truth**—ask whether stale is allowed.`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs notes / the original book",
      bodyEn: `<details>
<summary>How the book / notes taught it then · pattern catalogs and cloud migration go here</summary>

The notes map to the AWS book's architecture-patterns chapter: four CDC implementations, Pub-Sub, orchestration variants, a one-line Saga definition, a one-line Outbox, then a string of cloud services. **That is not this chapter's body.** In 2026 you walk in with primary/replica lag, shard keys, Outbox/CDC, one Saga grid, and why 2PC is a no.

| Book / notes | How you answer now |
|---|---|
| Replication = a "multi-replica" slogan | **Async vs sync + lag vs failover** |
| Sharding only says "split horizontally" | **Key: cardinality, hotspots, no default cross-shard join** |
| 2PC as the cross-service standard answer | **Often a no on the user path**; blocking + coordinator + rails don't join |
| Outbox in one throwaway line | **Dual-write default**; same transaction + CDC/Relay |
| Saga only a definition / workflow SKU | **Choreography vs orchestration, one grid**; compensations; no Temporal tour |
| CDC = cloud DMS shopping | Mechanism: read the WAL; don't recite model numbers |
| Kafka partitions written into this chapter | **Ch20** |
| Dynamo / vector clocks | **Ch06**; production conflict default LWW already lives there |
| Long isolation-level table | Name same-DB ACID; not the spine |
| Full Raft / implementation | **Majority + leader**, one sentence |
| NewSQL / Aurora catalog | Engine can commit across shards internally; the business diagram still does not draw XA out to a PSP |

The body's first answer is this 2026 set. The fold only stops you from putting a patterns textbook and a cloud-migration catalog on the board.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **We have replicas, so if the primary dies we don't lose data?** → Async, look at lag. Promoting a lagging replica drops already-200'd writes.
2. **Why is a Replica read stale?** → Replication lag. read-your-writes hits Primary or waits on position.
3. **Cost of sync replication?** → Write latency stacks RTT; if the replica dies, writes may stop. PACELC Else.
4. **What else do you say on failover?** → Fence the old primary; prevent split-brain.
5. **How is this different from Ch06 quorum?** → That side is leaderless + N/W/R; this side is a single Primary. Don't mix talk tracks.
6. **How do you pick a shard key?** → High cardinality, even, aligned with queries.
7. **Why not slice on status?** → Low cardinality, hotspot shard.
8. **Cross-shard join?** → Not the default. Change the key, a projection table, or accept scatter-gather.
9. **Are Kafka partitions sharding?** → Log parallelism is Ch20. This chapter is how you slice tables.
10. **Why is 2PC a no?** → Coordinator crash blocks prepared; rails don't join XA; the user times out.
11. **What does Outbox solve?** → Atomicity of writing the DB and emitting an event. Same transaction lands the outbox, then CDC.
12. **CDC vs event sourcing?** → CDC: DB is truth. Sourcing: events are truth.
13. **Two kinds of Saga?** → Choreography event chain vs orchestration center. One grid.
14. **Is Saga 2PC?** → No. Local commit + compensation, eventual consistency.
15. **Raft, interview one-liner?** → Leader writes, majority commits. Not async primary/replica.
16. **Sagas, which year?** → Garcia-Molina & Salem, **SIGMOD 1987**.
17. **Raft, which paper?** → Ongaro & Ousterhout, **USENIX ATC 2014**.
18. **Why is messaging resilience next?** → Delivery, backlog, and circuit breaking after the event leaves the DB are **Ch42**.`,
    },
    {
      id: "sec-next",
      headingEn: "What's next",
      bodyEn: `Close the page and walk it in 20 seconds: primary/replica, ask async or sync first; lag and failover are tied together; shard key looks at cardinality and hotspots; cross-service Outbox + CDC, long chains Saga; 2PC on the user path is often a no; Raft in one majority sentence. If you can drop orders / payments / KV back onto Ch18 / Ch24 / Ch06, this chapter is done.

Next is **Ch42 · Messaging, resilience, containers**: delivery semantics, backlog, circuit breaking and degradation; K8s mental model. The Kafka problem is Ch20; this chapter does not unpack partitions again. Protocols do not unpack again.

Self-check: left column, replication lag vs failover; middle, shard keys; right, 2PC is a no + Outbox/Saga. Don't recite an isolation-level table and cloud DMS back.`,
    },
  ],
  reviewMdEn: `# Ch41 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | How do you open in 20 seconds? | Primary writes, Replica follows; ask async/sync and lag first. Shard key: cardinality, hotspots, few cross-shard joins. Cross-service Outbox+CDC; long chains Saga. User path, no 2PC. Raft: leader + majority. |
| 2 | Three hard parts? | ① Replication lag vs failover ② How to pick a shard key ③ 2PC is a no + Outbox/Saga default. |
| 3 | What does an async-replication 200 guarantee? | Primary has committed. It does **not** guarantee the Replica has it. |
| 4 | What does replica lag read? | Write then immediately read Replica → **stale**. read-your-writes hits Primary. |
| 5 | Does async failover lose data? | Promote a lagging replica → lose already-acked writes in the lag window (RPO>0). |
| 6 | What does sync replication buy? | Replica already has this write; failover is safer. You pay write latency / writes stop if the replica dies. |
| 7 | Besides promote, what do you say on failover? | **Fence** the old primary; prevent split-brain. |
| 8 | Primary/replica vs Ch06 quorum? | Primary/replica has a single Primary; Ch06 is leaderless + N/W/R. Don't mix. |
| 9 | Three shard-key rules? | **High cardinality**, **even, avoid hotspots**, **queries land on one shard**; cross-shard join is not the default. |
| 10 | Why not slice on status? | Low cardinality → hotspot shard. |
| 11 | Monotonic ID + range sharding? | New writes smash the newest shard → hotspot. |
| 12 | Why is 2PC often a no? | **Blocking** (prepared waits on the coordinator) + **the coordinator**; rails don't join XA. |
| 13 | Dual-write pit? | DB then MQ loses the event; MQ then DB creates a ghost. |
| 14 | How is Outbox atomic? | Business row + outbox in **the same local transaction**; CDC/Relay emits; consumers idempotent. |
| 15 | CDC in one line? | Capture changes from WAL/binlog; DB is still truth. Not a cloud DMS class. |
| 16 | What is Saga? | Local transaction chain + **compensations**. Choreography = event chain; orchestration = a center that directs. |
| 17 | Sagas paper? | Garcia-Molina & Salem, **SIGMOD 1987**, *Sagas*. |
| 18 | Raft, interview one-liner? | **Leader** takes writes; **majority** commits. ATC **2014**, Ongaro & Ousterhout. |
| 19 | How do orders/payments use this? | Ch18 same-DB CAS + Outbox. Ch24 no 2PC out to the rail. |
| 20 | What's next? | **Ch42 messaging, resilience, containers**. Kafka partitions → Ch20. |`,
});
