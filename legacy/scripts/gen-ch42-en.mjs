import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch42",
  titleEn: "Messaging, resilience, containers",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 90–120 min ｜ **Prereq**: message queues Ch20; Outbox Ch41; governance Ch44 (can read later)
> **Goal**: delivery semantics, backlog, circuit breaking and degradation; K8s mental model. The Kafka problem is Ch20. No cloud shopping, no YAML.

This is **M6's seventh foundation chip**, not another 4-step design problem. On the spine, notifications, Feed, order side effects, gateway timeouts, and scheduler retries all hit "do messages get lost, what about backlog, how do you live if downstream is down, where does the process run"—this chapter unpacks **delivery semantics, backlog and retry storms, circuit breaker / bulkhead / timeout, and the container / Pod mental model**. Design problems just cite it. Kafka partitions, consumer groups, ISR, exactly-once implementation, and KRaft are **Ch20**; here we only recycle "how the semantics land," not a messaging class. Split-service criteria, discovery, and the mesh checklist are **Ch44**; here we only pick up at resilience.

**One line:** the whiteboard defaults **at-least-once + an idempotent consumer**; exactly-once is expensive, and across DBs you still need **Outbox (Ch41)**. Backlog is **lag**; poison messages go to a **DLQ**; timeout retries amplify. On sync calls, pin **timeout** first, then **bulkhead** and **circuit breaker**. K8s = **desired state**; the scheduling unit is the **Pod**, not a YAML class.

Three hard parts (the pieces worth digging):

1. **How delivery semantics land** — at-most / at-least / exactly-once; whiteboard default at-least-once + idempotent; EOS is expensive, across DBs still Outbox
2. **Backlog and retry storms** — lag, poison / DLQ, timeout-retry amplification, backpressure
3. **Circuit breaking, degradation + container mental model** — timeout / bulkhead / circuit breaker; K8s = desired state, scheduling unit is the Pod

This chapter **does not cover**: rewriting Ch20 as this chapter (partitions / ISR / KRaft / consumer groups are a one-line back-link), hauling Ch44's split-service criteria / discovery book in, a K8s YAML / Dockerfile tutorial, a Karpenter / Argo / WASM product tour, an AWS SQS / SNS / EKS shopping list, Hystrix as the 2026 default. mesh / mTLS: name it and stop.`,
    },
    {
      id: "sec-pitch",
      headingEn: "One-line definition · 20-second interview open",
      bodyEn: `First put the scoring signal on the table: you can pick delivery semantics, you can treat backlog, you timeout before you circuit-break, and K8s is mental model, not YAML.

> "Messaging I default **at-least-once + consumer idempotency**: commit the offset after processing; a crash replays, so side effects must be idempotent. at-most-once is commit-then-process; you can lose, so it is only for metrics / logs. exactly-once is **expensive**: Kafka transactions only cover topic-to-topic; a write out to a DB or HTTP still needs idempotency; dual-write across databases is **Outbox (Ch41)**. Backlog is **lag**; in-group parallelism is capped by partition count—how you partition is Ch20. Poison messages go to a **DLQ** after bounded retries; don't stall the partition. In-lockstep timeout retries make a storm; you need a budget and jitter. On sync calls, pin **timeout** first, then **bulkhead** isolation and a **circuit breaker** that probes half-open; 2026 does not default Hystrix. K8s: a container is process isolation; the scheduling unit is the **Pod**; you declare desired state, the control loop reconciles. Runtime open: **containerd**."

The whole chapter walks this one chain. Say the 20 seconds, then stop. Let the interviewer decide whether to dig into semantics, backlog, or resilience.

${D2}

This figure cites: Ch20 partitions and groups (the mechanism lives there) · Ch41 Outbox (you still need it across DBs) · Ch44 governance minimum set (timeout / retry / idempotency; circuit breaking is unpacked here)

| Interviewer ask | Where you land |
|---|---|
| "Can you do exactly-once?" | Practice default is at-least + idempotent first; then EOS bounds and cost |
| "Consumers can't keep up?" | lag; parallelism has a cap; poison → DLQ; no infinite retries |
| "Downstream is down—how do you live?" | timeout first, then bulkheads and half-open; degrade with a flag |
| "Walk me through containers and K8s?" | process isolation vs VM; Pod is the scheduling unit; desired state |

**red flag:** treating exactly-once as a free default; opening this chapter by reciting partitions / ISR / KRaft; infinite retries as resilience; Hystrix as the 2026 first answer; Docker as the K8s runtime default; starting to write YAML / draw an EKS shopping trip.`,
    },
    {
      id: "sec-delivery",
      headingEn: "Mechanism · Delivery semantics (at-most / at-least / exactly-once)",
      bodyEn: `First hard part. **In a 2026 interview, reciting the three English words scores lower than saying when you commit the offset and which layer EOS actually covers.** How you cut partitions, how a group rebalances, ISR and KRaft—**Ch20**, we do not re-teach them. This chapter asks: **between broker and consumer, who wins, loss or duplicates.**

${D2}

This figure cites: Ch20 exactly-once open (idempotent producer + transactions, expensive) · Ch41 Outbox (dual-write across DBs)

Three contracts. Pin them before you talk implementation:

| Semantics | How it lands | What happens | Who gets it on the whiteboard |
|---|---|---|---|
| **at-most-once** | commit the offset / fire without waiting for ACK **before** processing | **can lose**, no duplicates | metrics, logs, sampleable telemetry |
| **at-least-once** | commit after a successful process; fail → retry | **no loss, can duplicate** | **default**: orders, notifications, posting notices |
| **exactly-once** | broker transactions + consumer idempotency, or a business dedupe key | looks like once; **expensive, narrow bounds** | Kafka-internal read-process-write; not a free gift on every hop |

The sequence interviewers love: **process succeeds, process dies before the offset is committed.**

${D2}

That is at-least-once: the broker cannot tell "done, ACK just didn't land" from "never did the work." It must redeliver. So an **idempotent consumer** is not extra credit; it is the default contract: upsert on a business key / event id, or a conditional write that only moves pending → paid. Commit-then-process = at-most-once; a crash drops the message—don't pick that on a ledger path.

**Whiteboard default is this one sentence:** at-least-once + idempotent. Auto-commit looks clean and in production it is easy to lose or replay on a failed process; in the interview, say you commit by hand, after processing.

**Where exactly-once is expensive, and what is still left after you pay.** Kafka EOS is an **idempotent producer** (same session, same partition, retries do not double-write) plus **transactions** (consume–process–produce binds offset and output in one commit; consumers use \`read_committed\`). That set holds **only inside the Kafka loop**. The moment the consumer hits HTTP, writes an external DB, or sends an SMS, the broker transaction does not cover that hop—out there it is still at-least-once, still needs idempotency. Dual-write "order row + emit event" is not something Kafka EOS can buy; it is **Outbox + CDC (Ch41)**: same-row local transaction, then deliver; the delivery itself is still at-least-once.

Ch20 already pinned ISR, \`acks=all\`, and KRaft. Here we only close: **durability is a replication problem; semantics are a commit-point and idempotency problem.** Don't weld the two chapters into one section.

How to open it:

> "I default at-least-once; the consumer is idempotent on a business key. EOS only covers Kafka-to-Kafka, and it is expensive. A write out to a DB or a channel still needs idempotency; same transaction as the DB is Outbox. I don't pretend exactly-once is free."

**red flag:** "Kafka supports exactly-once so the business does not need idempotency"; at-most-once as the payment default; moving a whole partitions / consumer-groups / KRaft section in as this chapter.`,
    },
    {
      id: "sec-backlog",
      headingEn: "Mechanism · Backlog and retry storms",
      bodyEn: `Second hard part. **Backlog is not a slogan that vanishes when you add ten more consumers.** Define it first, then poison messages and timeout amplification.

${D2}

This figure cites: Ch20 partition parallelism cap (one consumer per partition inside a group) · Ch41 where events come from (Outbox does not fix backlog)

**lag** = log end − committed offset (or queue depth). It measures "work not yet done," not a QPS poster. Don't invent an internal throughput number; say this: **if producers stay faster than consumers, lag grows.** It is an incident when it hits a business deadline (notifications an hour late, recon overnight).

Parallelism has a hard cap. On a log bus, **only one member of a group processes a given partition at a time**—ordering is tied to that (Ch20). Consumer count > partition count, the extras idle. When lag will not come down, adding instances only helps up to partition count; more throughput means **add partitions** (accept key remapping) or split the topic, not 200 more idle processes. That is a parallelism cap, not tuning mysticism.

${D2}

**Poison messages:** a record that fails no matter how you process it (bad schema, invariant violation, downstream permanent 4xx). If the consumer sits on that one record, **the whole partition stalls**, and every healthy message behind it is blocked. The fix is not "retry overnight":

1. **Bounded retries** (teaching intuition: 1–2, not 10), backoff + **jitter**, so every instance does not punch back on the same millisecond.
2. Still failing → **DLQ / dead-letter topic**; the main path keeps moving. Someone watches the DLQ, can replay, can alert; it is not a black hole named \`trash\`.
3. Retry only recoverable errors (downstream 429 / brief 5xx); validation failures do not retry.

The second sequence interviewers love: **retry amplification from timeouts.**

${D2}

Downstream is already slow; the caller times out and immediately fires again—one slow request becomes 2, then 3, and you raise your own arrival rate. Deeper backlog → more timeouts → more retries: positive feedback. The gateway **must not** autonomously fire a non-idempotent \`POST\` three times (Ch17). Retry budget on a sync chain counts against the same **timeout** deadline; you do not buy an extra 10 seconds.

**Backpressure:** when downstream is slow, upstream must slow down or refuse; it must not swallow the signal in an unbounded in-memory queue. A log bus's **pull** is already consumer-paced. On the edge: queue depth / lag over threshold → **429 / 503** with \`Retry-After\`; rate limiting is **Ch04**. An unbounded in-memory retry queue looks like "we didn't drop," but it hides the backlog in the heap until OOM. Recovery is more dangerous: after the fault is fixed, backlog + retries flood out together and knock the just-revived downstream over again—drain at a limited rate; don't "open everything."

How to open it:

> "Backlog, I look at lag first, not 'add machines.' Parallelism is capped by partitions. Poison: bounded retries then DLQ. Timeout retries amplify; you need jitter and a budget. The edge uses backpressure, not an unbounded in-memory queue."

**red flag:** "adding consumers scales linearly" without naming the partition cap; poison in a death loop occupying a partition; in-lockstep retry the instant you time out; infinite retries as availability.`,
    },
    {
      id: "sec-resilience",
      headingEn: "Mechanism · Circuit breaking, degradation + container mental model",
      bodyEn: `Third hard part, two halves: **how a sync dependency fails without taking you down**, and **what isolation unit the process actually runs in**. The governance minimum set (discovery + timeout / retry / idempotency) is already pinned in Ch44; this chapter digs bulkhead and circuit breaking after timeout, plus the container mental model. Don't re-teach split-service criteria.

### timeout → bulkhead → circuit breaker

**The 2026 first sentence is timeout, not a circuit-breaker brand.** A call with no timeout fills threads and connections and turns downstream slowness into your own avalanche. Timeouts live on the **HTTP client** (connect / read), shorter than the upstream deadline. The gateway edge needs one too (Ch17). Resilience4j-class TimeLimiter **does not wrap a blocking sync call**—don't think an annotation gave you a timeout.

${D2}

This figure cites: Ch17 gateway-edge timeout · Ch44 bounded retries and idempotency (don't blindly retry writes) · Ch28 degradation flags

| Piece | What it does | What it does not |
|---|---|---|
| **timeout** | a single call has a deadline; the thread comes back | not "stop calling after consecutive failures" |
| **bulkhead** | each dependency gets its own thread pool / semaphore; one slow cabin does not sink the ship | not a substitute for timeout; cabin size still has to be sized |
| **circuit breaker** | failure rate / slow-call rate over the line → **Open**, fail fast, let downstream breathe; after a while **Half-open** lets a few probes through, then **Closed** if healthy | not a timer; Open still needs a degrade path, not a bare 500 |

Half-open is the key: stay Open forever and you never learn the other side recovered; fling the gates open and the just-recovered side gets hammered again. Probe count stays small. The failure-rate window needs a **minimum request count**, or 1 failure in 2 trips the breaker—that's friendly fire.

**Degradation:** the user is still waiting after Open. Optional deps (recs, points display, third-party avatars) return cache, a default, or omit; flags go through **Ch28**. Core paths (charge, place-order) usually degrade to failure + a clear error, not a silent "treat as success." The breaker protects you and your neighbors; it does not cancel business recon.

**2026 default library: timeout + isolation + half-open.** Java-track interviews say **Resilience4j** (or the equivalent: client timeout + bulkhead + breaker). **Hystrix is unmaintained**—not the first answer; book details on Hystrix thread-pool isolation go in the fold. Don't open an Istio retry/outlier plugin table—mesh / mTLS: "a sidecar can do timeout and mTLS for you; you still have to explain the mechanism on the whiteboard"; the checklist lives in Ch44 and we don't unpack it here.

### Container mental model: not a YAML class

The interview wants three sentences, not Deployment fields.

${D2}

1. **Process isolation vs VM.** Containers share the host kernel; namespaces show different PID / net / mounts; cgroups cap CPU / memory. Fast start, high density. A VM has its own kernel: stronger isolation, heavier. Untrusted multi-tenant code still has a place for VMs or a sandbox; ordinary stateless services default to containers in 2026.
2. **The scheduling unit is the Pod, not the container.** A Pod is a group of containers that share net and storage and are scheduled together. app + sidecar must land on the same node and talk over localhost, so the abstraction is the Pod. One Pod usually has one main container; extra containers are sidecars, not "stuff the microservice into one Pod."
3. **Declarative desired state.** You say "this service, 3 replicas"; the control loop compares actual vs desired and schedules, starts, or replaces the difference. Self-heal is **reconcile**, not an alert waiting for someone to SSH. kubelet on the node aligns the Pod spec to the runtime.

${D2}

This figure cites: Ch25 job scheduling (that's cron / delayed jobs, not this figure's Pod scheduling) · Ch39 stateless replicas · Ch44 discovery (a Service as a stable entrypoint: name it and stop)

**2026 open is containerd; don't treat Docker as the K8s runtime default.** Kubernetes 1.24 removed dockershim; kubelet talks **CRI** to **containerd** (or CRI-O). Images you build with Docker on a laptop are still **OCI**; the cluster pulls them the same. One sentence is enough; don't open a runtime-implementation class.

K8s is **not** a business job scheduler. Recon, close-order, misfire are **Ch25**. Answering a scheduler problem with CronJob YAML misses both chapters. Stable identity for stateful things (StatefulSet-class): "databases usually are not casually replaced by a Deployment"—then stop; don't open a volume tutorial.

How to open it:

> "Sync: timeout first, then bulkhead, then a half-open circuit; degrade with a flag. Hystrix is not the 2026 default. Containers share the kernel; K8s schedules Pods; I declare desired state, the loop reconciles. Runtime is containerd; images are still OCI."

**red flag:** drawing a breaker before you have a timeout; Hystrix as the current default; an unbounded thread pool as isolation; drawing Docker into kubelet as the runtime; opening with YAML / Karpenter / a cloud EKS SKU; mixing Ch25 cron and Pod scheduling into one problem.`,
    },
    {
      id: "sec-choose",
      headingEn: "Choice table",
      bodyEn: `Pin the defaults on the whiteboard first. Drawing three semantics, two schedulers, and a cloud catalog at once is over-engineering.

| Scenario | Default | Don't |
|---|---|---|
| Business events (place-order, notify) | **at-least-once + consumer idempotency** | at-most-once; pretend EOS is free |
| Metrics / droppable logs | at-most-once is fine | make the ledger droppable too |
| In-Kafka stream processing, no duplicate output | EOS (transactions + \`read_committed\`), admit it is expensive | skip idempotency after you said EOS |
| Write DB + emit event | **Outbox (Ch41)** | bare \`send\` on the request; Kafka transactions covering an external DB |
| Backlog | look at **lag**; parallelism ≤ partition count | "add 100 more consumers" |
| Messages that always fail | bounded retries → **DLQ** | death loop occupying a partition |
| Calls after timeout | budget + jitter; retry only idempotent | in-lockstep immediate retry of a non-idempotent POST |
| Edge overload | backpressure / rate limit (Ch04); 429 + Retry-After | unbounded in-memory queue swallowing the signal |
| Sync downstream | **timeout is mandatory** → bulkhead → circuit | lead with Hystrix; circuit-break before you have a timeout |
| Breaker Open | degrade (cache / default / omit); flags Ch28 | bare 500; core charge silently treated as success |
| How the process runs | containers; scheduling unit **Pod**; desired state | YAML as the talk track; Docker Engine as the K8s runtime |
| Timed recon / close-order | **Ch25** job scheduling | K8s CronJob as exactly-once |

Spoken default, one more time:

> "Semantics default at-least + idempotent. Backlog is lag and DLQ. Resilience starts with timeout. K8s is Pods and desired state. Partitions and ISR go to Ch20; splitting services goes to Ch44."`,
    },
    {
      id: "sec-papers",
      headingEn: "Papers and classic systems",
      bodyEn: `M6 needs names you can drop. Two required, two optional below. **The interview one-liner** is in the table; don't memorize page numbers, don't treat Borg as YAML homework.

${D2}

The timeline is only a memory aid: first, "the log is truth, a consumer is just an offset"; then "timeout, bulkhead, circuit breaker keep failure local"; then "the cluster schedules work to desired state." That does not mean you implement all three.

| | Paper | Required / optional | Interview one-liner |
|---|---|---|---|
| 1 | **Kreps, Narkhede, Rao**, NetDB 2011, *Kafka: a Distributed Messaging System for Log Processing* | Required | Messages are an **append-only log**; a consumer is an **offset**. Replayable; independent groups. Partition / ISR engineering lives in **Ch20**; this chapter uses the sentence to back at-least-once: the commit point decides lose vs replay |
| 2 | **Nygard**, *Release It!* (2007; 2nd ed. 2018) | Required | The **timeout, bulkhead, circuit breaker** trio: a deadline first, then isolate the dependency, consecutive failures fail fast and probe half-open. 2026 swapped the library name (Resilience4j); the pattern did not. Hystrix was a later implementation, now EOL |
| 3 | **Kreps**, LinkedIn Engineering 2013, *The Log: What every software engineer should know about real-time data's unifying abstraction* | Optional | The log is a unifying abstraction: DB, MQ, replication can all be seen as a log. Use it to back "log first, then semantics"; don't treat the post as a Kafka config manual |
| 4 | **Verma et al.**, EuroSys 2015, *Large-scale cluster management at Google with Borg* | Optional | Large-scale clusters: declare what should run; the manager places it and keeps it there. K8s desired-state / Pod mental model comes from this line. Stop at "scheduling unit + reconcile"; don't recite Borg internal names |

Fowler's Circuit Breaker short post (2014) is a pattern catalog, not a paper; use it to line up with Nygard. Kubernetes docs are not a paper: dockershim removal, CRI, containerd are engineering facts you can say; don't invent a conference.

Classic systems are just nails: Kafka log → this section's semantics and backlog; Resilience4j / equivalents → breaker implementation; K8s → Pod and desired state. Rabbit / SQS: "also at-least-once, still need idempotency and a DLQ"—don't open a product comparison table.`,
    },
    {
      id: "sec-used",
      headingEn: "Which design problems use this",
      bodyEn: `Do the spine problems first; jump into this chapter when you get stuck. Back-links are not "finish M6 then start writing."

| Chapter | The sentence you use |
|---|---|
| **Ch02** scale | Add MQ to absorb peaks; you still have to consume, or the backlog walks latency into the user path |
| **Ch04** rate limit | Edge backpressure; 429 on backlog, don't only add a queue |
| **Ch10** notifications | Channel failure: bounded retries + DLQ; don't sync-chain three carriers |
| **Ch11** Feed | fan-out is async; lag is acceptable; retries must not explode write fan-out |
| **Ch14** video | Transcode-queue lag; poison files go to DLQ, don't stall the whole pipeline |
| **Ch16** comments | Moderation queue; timeout retries must not become a spam storm |
| **Ch17** gateway | Edge timeout; don't blindly retry a non-idempotent POST |
| **Ch18** orders | Side effects leave via Outbox (Ch41); consume idempotently; close-order retries are bounded |
| **Ch20** MQ | Partitions, groups, ISR, EOS, KRaft live there. This chapter is how semantics land, lag, DLQ |
| **Ch21** flash sale | The async place-order queue will backlog; retries after sold-out are a storm nursery |
| **Ch24** payments | Callbacks are at-least-once → posting is idempotent; don't replace recon with an EOS slogan |
| **Ch25** scheduling | misfire / compensation storms and message retries are the same kind of amplification; not a K8s CronJob problem |
| **Ch28** config | Degradation flags after a trip, timeout values: go through the config center, not baked into the image |
| **Ch39** stateless | Replicas are replaceable—same sentence as Pod desired state |
| **Ch41** transactions | Events leave the database; this chapter owns whether they are lost or blocked after that |
| **Ch44** microservices | Discovery and splits live there; timeout / retry / idempotency minimum set was named there; circuit breaking is unpacked here |

Chat, short URL: the sync read path rarely needs a queue. **The moment you have "do the work, then notify someone else,"** bring this chapter's three sentences.`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs notes / the original book",
      bodyEn: `<details>
<summary>How the book / notes taught it then · Hystrix, Docker runtime, cloud shopping go here</summary>

The notes map to the AWS book's container chapter: Dockerfile, object manifests, Karpenter, GitOps, WASM, a mesh catalog, plus a string of cloud SKUs. Resilience is almost absent from that note. **That is not this chapter's body.** In 2026 you walk in with delivery semantics, lag/DLQ, timeout-first circuit breaking, Pods and desired state.

| Book / notes / old talk track | How you answer now |
|---|---|
| exactly-once as a free default | **at-least-once + idempotent**; EOS is expensive and only covers the Kafka loop |
| partitions / ISR / KRaft written into this chapter | **Ch20** |
| backlog = add consumers | **lag + partition parallelism cap + DLQ** |
| infinite retries as resilience | bounded, jitter, timeouts amplify |
| **Hystrix** thread pools as the standard answer | EOL. **timeout** first (on the HTTP client), then bulkhead + half-open. Library name: Resilience4j-class |
| drawing a breaker before you have a timeout | the breaker is fail-fast after consecutive failures, not the deadline itself |
| K8s runtime drawn as Docker Engine | **dockershim removed from 1.24**; open **containerd / CRI**. Docker **images** are still OCI; they work |
| Dockerfile / YAML / Service-type tables | three mental-model sentences: process isolation, Pod, desired state |
| Karpenter / Argo / WASM / eBPF tour | **forbidden** as the spine; knowing the names is enough, they stay out of the body |
| EKS / SQS / SNS / Fargate shopping | mechanism in generic words: managed log, object storage, container platform |
| split-service / discovery / Istio filters | **Ch44**; mesh: name it and stop |
| CronJob as job scheduling | **Ch25** |

The body's first answer is this 2026 set. The fold only stops you from putting a container textbook and dead Hystrix on the whiteboard.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **Default delivery?** → at-least-once + an idempotent consumer.
2. **When at-most-once?** → droppable metrics / logs. Commit then process; a crash drops it.
3. **Processed, never committed, then crash?** → replay. So you must be idempotent.
4. **Is Kafka exactly-once free?** → No. Expensive; and it only covers topic→topic.
5. **Write out to a DB—still EOS?** → No. Outside still needs idempotency or **Outbox (Ch41)**.
6. **Why not partitions / ISR / KRaft here?** → That's **Ch20**. This chapter is semantics and resilience.
7. **What is lag?** → log end − committed position. The backlog ruler.
8. **Why don't extra consumers scale linearly?** → parallelism cap = partition count.
9. **Poison message?** → bounded retries, then **DLQ**; don't stall the partition.
10. **Why are timeout retries dangerous?** → the slow request is copied; you raise your own arrival rate.
11. **Backpressure in one line?** → downstream slow → upstream slows or refuses; an unbounded in-memory queue swallows the signal.
12. **Resilience first sentence?** → **timeout** is mandatory, on the client, shorter than the upstream deadline.
13. **bulkhead?** → one cabin per dependency (thread pool / semaphore); one slow cabin does not sink the ship.
14. **Breaker three states?** → Closed lets traffic through → Open fail-fast → Half-open probes.
15. **Still teaching Hystrix in 2026?** → Not the default. EOL; say Resilience4j / the equivalent mechanism.
16. **Container vs VM?** → containers share the kernel, process isolation; VMs have their own kernel, heavier, stronger isolation.
17. **Why Pod, not container?** → scheduling and lifecycle are bound together; sidecars need the same node.
18. **K8s and Docker?** → runtime is **containerd** (CRI); images are still OCI. dockershim is gone.
19. **Desired state?** → declare replica count; the control loop pulls actual back.
20. **Vs Ch44 / Ch25?** → split-service and discovery go to Ch44; cron jobs go to Ch25. This chapter does not write YAML.`,
    },
    {
      id: "sec-next",
      headingEn: "What's next",
      bodyEn: `Close the page and walk it in 20 seconds: semantics default at-least-once + idempotent; EOS is expensive, across DBs Outbox; backlog is lag, poison goes to DLQ, timeout retries amplify; resilience starts with timeout, then bulkhead and a half-open circuit; K8s is Pods and desired state, runtime containerd. If you can drop the messaging problem back onto Ch20, governance onto Ch44, Outbox back onto Ch41, this chapter is done.

**The Ch38–Ch42 chip set closes here.** Cache, load balancing, protocols, replication/transactions, and this chapter—the M6 chips the spine actually uses are written. The dictionary chapters **Ch43 hyperscale data, Ch44 microservices, Ch45 DDD** are already on the site; design problems jump in via chips—don't treat this chapter as a prologue to YAML or big data.

Self-check: left column, delivery and idempotency; middle, lag / DLQ / retry storms; right, timeout–bulkhead–circuit + Pod desired state. Don't recite Hystrix and Docker-as-runtime back.`,
    },
  ],
  reviewMdEn: `# Ch42 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | How do you open in 20 seconds? | at-least-once + consumer idempotency. EOS is expensive, across DBs Outbox. lag + DLQ. timeout first, then bulkhead / circuit. K8s: Pod + desired state, containerd. |
| 2 | Three hard parts? | ① How delivery semantics land ② Backlog and retry storms ③ Circuit breaking, degradation + container mental model. |
| 3 | Whiteboard default delivery? | **at-least-once + an idempotent consumer**. Commit the offset after processing. |
| 4 | How does at-most-once lose? | Commit before processing. Crash = drop. Only for droppable metrics. |
| 5 | Processed, never ACKed, then crash? | Broker redelivers. Must be idempotent. |
| 6 | What does EOS cover? | Kafka topic→topic (transactions). External DB/HTTP **does not count**. |
| 7 | Dual-write across DBs? | **Outbox (Ch41)**, not Kafka EOS. |
| 8 | Partitions / ISR / KRaft? | **Ch20**. This chapter does not re-teach them. |
| 9 | What is lag? | log end − committed position. The backlog ruler. |
| 10 | Why is there a cap on adding consumers? | In-group parallelism ≤ **partition count**. |
| 11 | Poison message? | Bounded retries → **DLQ**; don't stall the partition. |
| 12 | Retry storm? | timeout then in-lockstep retry; you amplify your own arrival rate. jitter + budget. |
| 13 | Backpressure in one line? | Downstream slow → slow down or refuse. An unbounded in-memory queue swallows the signal. |
| 14 | Resilience first sentence? | **timeout** is mandatory (HTTP client), shorter than the upstream deadline. |
| 15 | bulkhead? | One cabin per dependency; one slow cabin does not sink the ship. |
| 16 | Breaker three states? | Closed → Open (fail fast) → Half-open (probes). |
| 17 | Still Hystrix in 2026? | No, EOL. Resilience4j / equivalent; timeout first. |
| 18 | Container vs VM? | Container: shared kernel, process isolation. VM: own kernel, heavier. |
| 19 | Why Pod? | Scheduling unit; shared lifecycle, can sidecar. Not a YAML class. |
| 20 | K8s runtime in 2026? | **containerd** (CRI). dockershim is gone. Docker images are still OCI. |`,
});
