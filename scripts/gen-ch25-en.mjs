import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch25",
  titleEn: "Job scheduler",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 50–60 min ｜ **Prereq**: locks Ch08; transactions Ch41
> **Goal**: shard + grab the lock, missed-fire compensation, point at DAG. This chapter is backend cron / delayed jobs, not Agent orchestration (Ch34).

Payments covered “how one amount reconciles.” This prompt is **how a timed / delayed job fires once in a cluster, and how you catch up when you miss**. Default is backend **cron + delayed jobs**: reconciliation, close-order, retry on failure. Not K8s CronJob YAML, not an Airflow product class, not Ch34’s multi-agent loop.

The system looks like: due time fires, a worker does the work. Three hard parts: **shard + lock to avoid double-fire**, **missed-fire / misfire**, **the boundary with Ch34**. The interviewer is not scoring a vendor’s published QPS, crontab syntax, or a Redlock recap (that’s Ch08). They want: will two nodes fire the same \`job_id\` in the same time slot twice; if the scheduler was down an hour, do you skip or catch-up; and did you answer a model-free backend job as an Agent runtime.`,
    },
    {
      id: "sec-answer",
      headingEn: "How to answer in the interview",
      bodyEn: `**Opening 30 seconds (say it):**

> “This is backend cron / delayed jobs, not K8s YAML, not an Airflow class, not a Ch34 Agent loop. Three hard parts: shard + lock to avoid double-fire, misfire catch-up, and the boundary with Agent orchestration. Multiple workers, shard by \`job_id\` / time wheel; grab the lock or fencing (Ch08) so the same fire point runs once. For misfire, pick skip or catch-up out loud—don’t silently replay a storm. Delayed jobs use a time wheel / delay queue; don’t mash them with cron into one scan. Whiteboard default: **independent jobs**; point at a workflow engine for DAG. Handlers must be idempotent; side effects go through Outbox (Ch41).”

Then walk the 4 steps. Do not open by drawing the XXL-JOB product suite, an Airflow DAG editor, or a K8s CronJob manifest.

${D2}

| Time-box | What you are doing |
|---|---|
| 3–10 min | Clarify: cron/delay vs DAG vs Agent, is double-fire harmful, misfire policy, Redis/DB or not |
| Next 2 min | back-of-envelope: number of job defs; fire QPS is tiny; what you fear is double-fire and a catch-up storm |
| 10–15 min | High-level: Scheduler → Lock → Worker; metadata in the DB |
| 10–25 min | deep dive: shard + lock + fencing, misfire skip/catch-up, delay vs cron; point at DAG / Ch34 |
| 3–5 min | wrap-up: 3 bottlenecks (double-fire, misfire storm, answering this as Agent) |

**red flag:** drawing Airflow / Temporal product architecture before you asked scope; treating single-box Spring \`@Scheduled\` as the cluster answer; opening with five-node Redlock; defaulting catch-up to replay every miss; drawing Ch34’s ReAct loop into cron; treating some company’s scheduler QPS as your fact. That is over-engineering, or lifting a neighbor chapter / a product class wholesale.`,
    },
    {
      id: "sec-clarify",
      headingEn: "Clarifying questions",
      bodyEn: `Drawing before you asked = Jimmy. On a scheduler, stop at 5–7 questions; assume the rest and write the board. **The first question must be scope.**

| You ask | Typical answer / your assumption | What it changes |
|---|---|---|
| cron, delayed, DAG workflow, or Agent? | **backend cron + delayed** (reconciliation, close-order, retry) | Point at DAG; Agent is **Ch34** |
| Is double-fire wasted CPU, or close-order twice / reconcile twice? | writes storage → **correctness lock + fencing** (Ch08) | Dedup-only can be an efficiency lock |
| Redis already, or DB only? | **Redis + a job table** | SET NX, or \`SKIP LOCKED\` to claim due rows |
| Missed an hour—how do you catch up? | **per job**: patrol skip; recon catch-up / fire once | No silent global catch-up storm |
| Do jobs depend on each other? | whiteboard **independent jobs** | DAG goes to a workflow engine; don’t invent topology |
| About how many job defs? | teaching: **~10k** | Proves the bottleneck is not fire QPS |

When they say “you pick,” write the assumptions:

> “I’ll assume: backend cron + delayed jobs, not K8s YAML, not an Airflow product, not Ch34. Independent jobs like recon, close-order, retry. Multi-instance, shard by \`job_id\`, grab the lock when due, write the DB with fencing. misfire defaults to skip; recon jobs get their own catch-up or fire-once-now. Delayed jobs go through a time wheel / delay queue. Handler idempotent + Outbox. I’ll draw this; interrupt me if it’s wrong.”

If they bring up Airflow / Temporal / K8s CronJob / Agent: **acknowledge the difference, then close the scope.** “Real DAG uses a workflow engine; this loop I am not designing topology inside the scheduler. K8s CronJob is a containerized independent periodic job—YAML is not this problem, and it does not guarantee exactly-once. Multi-step model-driven tools are Ch34. This loop I will go to the bottom on shard + lock and misfire.” Asking past 10 minutes is also a red flag. The golden line is still: **ask the key questions → state your assumptions → write the board → move.**`,
    },
    {
      id: "sec-estimate",
      headingEn: "Back-of-the-envelope",
      bodyEn: `The formulas live in Ch03. Here you only need order of magnitude, to show you know **this problem’s bottleneck is double-fire and a misfire storm, not “nationwide job QPS.”** The numbers below are **teaching assumptions** on the board—not some scheduler’s internal stats, not a company’s published peak.

Assume: about **10k** job defs; most are hourly / daily cron; delayed jobs (close-order) are the same order as order creates, but the scan path is not cron.

| Item | How you estimate | Order of magnitude (teaching) |
|---|---|---|
| If all 10k were per-minute cron | 1e4 / 60 | **~170 fire/s** upper bound; a real mix is far below |
| More typical hourly / daily | fires are sparse | **single digits to tens /s**; any serious DB poll eats this |
| Delayed close-order | same order as creates (teaching) | What costs is due-time precision and fire-once, not the peak |
| Metadata storage | ~1 KB per job; run history extra | **GB class**; shard by \`job_id\` / time slot (Ch41) |
| vs “massive scheduler” marketing | do not invent a company’s QPS on the board | **this loop does not score on throughput** |

The scheduler itself is rarely the bottleneck; the worker pool and **two nodes claiming the same fire point** are. If misfire catch-up is per-minute and you were down two hours, you suddenly dump ~120 executions—that is a catch-up storm, not a QPS you forgot to estimate.

**How to say it:**

> “Whiteboard: tens of thousands of job defs; fire is usually tens of QPS. Time goes to shard + lock, fencing, misfire policy. I will not treat a company’s scheduler peak as an internal number.”

Common mis-counts: treating a data-platform DAG’s task concurrency as cron fire QPS; or only quoting the def count, then pretending a full-table scan every tick is fine. Use teaching orders of magnitude, and **label them as assumptions.**`,
    },
    {
      id: "sec-arch",
      headingEn: "High-level architecture",
      bodyEn: `Left to right, draw **one scheduler control plane**: Scheduler → Lock → Worker. Do not fan out Airflow Web UI, a K8s Operator, or an Agent runtime on this picture. Metadata (cron, \`next_run_at\`, misfire policy) lives in the job table; claiming a due row must be exclusive; workers run an idempotent handler. After the interviewer buys in, then dig into shard and catch-up.

${D2}

**This diagram cites**: Ch08 distributed locks · Ch41 replication, shard, transactions · Ch42 messaging, resilience

**Write path (register / change cron):** API writes a job row (\`job_id\`, cron or \`delay_until\`, \`shard\`, \`next_run_at\`, \`misfire_policy\`) → the scheduler that owns the shard puts the next fire point into a scan window or a time wheel. Do not let every business service run its own \`@Scheduled\`—in a cluster each instance fires once.

**Fire path:** the shard owner scans \`next_run_at <= now\` (or ticks the time wheel) → **grabs the lock / claims** this fire point → inserts a \`runs\` row (\`run_id\` UNIQUE; prefer \`(job_id, scheduled_at)\`) → hands off to a worker (in-process pool or a queue, Ch42) → handler finishes, CAS \`success\`, computes the next \`next_run_at\`. Side effects (close-order, email, ledger) write **Outbox** in the same transaction; do not RPC synchronously in the handler and then mark success.

**Read path:** a console looks up a job / recent runs. This is not Feed; no CDN. Watch: lag (should have fired, didn’t), lock held too long, failed retries, DLQ.

**schema (stop when it’s enough):** \`jobs\` (job_id, cron or delay_until, shard, next_run_at, misfire_policy, timeout); \`runs\` (run_id, job_id, scheduled_at UNIQUE, fence, status, lease_until); \`outbox\`. Do not draw Quartz’s twenty \`QRTZ_*\` tables on the board.

Public implementations are **pattern names**, not architecture: XXL-JOB’s admin uses a DB lock so the cluster fires once, and after 2.1 a time wheel replaced Quartz; Quartz cluster uses \`QRTZ_LOCKS\` + JDBC JobStore. Draw Scheduler → Lock → Worker; do not recite a product schema.

Stop the high-level here and ask: “Does this direction look OK? Next I’ll dig into shard and grabbing the lock, then misfire, then the delay queue and why this is not Ch34.”

**How to say it:**

> “Scheduler sees due times, Lock guarantees fire-once, Worker runs an idempotent handler. Metadata in the DB. A queue is optional; the lock is not.”`,
    },
    {
      id: "sec-shard",
      headingEn: "Deep dive · shard + lock to avoid double-fire",
      bodyEn: `First hard part. Multiple instances for HA will all look at the same due table. Without shard and claim, **the same \`job_id\` runs twice in the same minute**—close-order twice, reconcile twice, both incidents. You cannot do exact-once delivery; what you can do is **at-least-once fire + at-most-once business effect** (idempotent handler + unique run).

Two layers—don’t mix them:

| Layer | What it does | Typical means |
|---|---|---|
| **shard** | each scheduler only scans its slice; fewer collisions and full-table scans | \`hash(job_id) % N\`, or ownership by time-wheel slot |
| **grab lock / claim** | the same shard can still have primary + standby | Redis \`SET NX\` (Ch08); or \`SELECT … FOR UPDATE SKIP LOCKED\`; or \`(job_id, scheduled_at)\` UNIQUE |

Sharding is not “shard it and you never double-fire”: on failover two nodes can briefly both think they own the same shard (split-brain). So **shard cuts collisions; lock / unique constraint closes double-fire.** Jobs that write storage also take a **fencing token** (Ch08): after the lock expires, an old worker writes \`runs\` / the business table with a stale token, and storage rejects it. Do not re-teach Redlock on this board—an efficiency lock is one Redis; correctness is fence or a DB constraint, not five nodes.

${D2}

**This diagram cites**: Ch08 distributed locks · Ch41 replication, shard, transactions

${D2}

Claiming due rows (DB as queue): \`WHERE next_run_at <= now() AND status='waiting' FOR UPDATE SKIP LOCKED LIMIT n\`—each instance takes different rows; you do not need a separate coordinator cluster. Schedulers in the Airflow family use this idea. The job table still needs an index on \`(status, next_run_at)\` / the shard key, or a full-table scan every second is the real bottleneck.

Long jobs: the lock is a lease. Handler P99 must be shorter than TTL, or a watchdog renews **and you still fence** (Ch08). Also add a \`lease_until\` heartbeat: if the worker dies, someone else can retry the same run. Cut business timeout inside the lease. Do not “the job might run ten minutes so I set TTL to an hour” and still fail to prevent double-write.

XXL-JOB’s shard broadcast and Quartz \`@DisallowConcurrentExecution\`—name them only: broadcast is **big-data slice parallelism**, not the same sentence as “this cron fires once”; disallow-concurrent is **the same job overlapping itself**, and it will not save you if you forgot the cluster lock. First get “this fire point is claimed once” right on the board.

**How to say it:**

> “Shard by job_id to cut collisions. Same fire point: SET NX or SKIP LOCKED to claim; unique key on runs as a backstop. Writes carry fencing. I am not walking Redlock.”

trade-off: the unique key turns “claimed twice” into a second insert failing, in exchange for never double-running; the cost is defining what “the same fire point” means (align wall clock to the cron slot; don’t use “now” as the key). No lock at all, just “stagger crontab on each machine,” is a red flag.`,
    },
    {
      id: "sec-misfire",
      headingEn: "Deep dive · missed-fire / misfire",
      bodyEn: `Second hard part. The scheduler died, the thread pool jammed, shard failover was slow—\`next_run_at\` is already in the past. When you wake up you need a **misfire policy**; you cannot pretend the clock never stopped. In public implementations: Quartz has \`misfireThreshold\` (docs default on the order of 60s) and skip / fire-now instructions; XXL-JOB treats “next fire + 5s still behind now” as misfire, and the policy is ignore or compensate once immediately. On the board remember **the policy, not a product constant as SLA**.

${D2}

| Policy | What you do on wake | Fits | Pitfall |
|---|---|---|---|
| **skip** | drop missed slots; schedule only the next future point | cache refresh, patrol, heartbeat | recon / billing miss a window |
| **catch-up** | run every missed cron slot | jobs that must cover every business day | **catch-up storm**: down 2 hours, per-minute job ≈ 120 fires in a row |
| **fire-once-now** | compensate **once** immediately, then jump to the future | the usual business default (XXL-JOB can configure this) | not “replay every slot”; write that into the policy |

2026 whiteboard default: **policy is per job; the system leans skip / fire-once-now; do not global catch-up.** Public fact: Airflow 2.x defaulted \`catchup=True\`; 3.0 flipped the default to \`False\`—the catch-up storm is a pit the industry already stepped in. This loop **is not an Airflow product class**; borrow that one sentence to show skip-as-default is more common.

Recon jobs (Ch24 day-cut) usually need to **catch up a window, not cron ticks**: if you were down, run recon “from last success watermark to now,” which is cleaner than replaying a per-minute trigger 120 times. That is the business version of catch-up; the key is **business date / watermark**, not a misfire counter.

The misfire threshold must be larger than failover / lock wait, or a normal primary cut looks like a miss. Quartz docs: \`misfireThreshold\` should exceed cluster checkin, to avoid false misfire. On the board say “the threshold covers failover RTT + one lock TTL”; don’t recite a config key.

Compensation itself must take **the same claim + idempotent path**: a catch-up run still grabs the lock and writes the same \`(job_id, scheduled_at)\`. Recon jobs are idempotent on the file (Ch24). Do not “it’s a misfire so fire unlocked in a burst.”

**How to say it:**

> “misfire: per job, skip or compensate once. Recon catch-up is a watermark window. Default is not catch-up every slot—that’s a storm. Catch-up runs still take the lock and stay idempotent.”

trade-off: skip drops a window, in exchange for the system coming up; catch-up covers correctly, in exchange for delay and a storm. Treating “the scheduler must be so reliable it never misfires” as the design goal means you have not understood lease and failure.`,
    },
    {
      id: "sec-delay",
      headingEn: "Deep dive · delayed jobs, DAG, and Ch34",
      bodyEn: `The third hard part is the boundary: clock-driven backend jobs, not a model-driven Agent. While you are here, close **delay vs cron** and **point at DAG**—people often draw those as another product; they are still “when does it fire, how many times.”

**cron vs delay:** cron is an expression → compute the next \`next_run_at\`, then compute the one after that when it finishes. Delay is **one-shot** (close the order in 30 minutes, exponential-backoff retry). Do not fake delay with “scan every order every minute”—as orders grow, the scan is the bottleneck.

${D2}

**This diagram cites**: Ch42 messaging, resilience

| | Scan due rows | time wheel | delay queue / ZSET |
|---|---|---|---|
| How you find due | poll \`next_run_at <= now\` | in-memory ring; each tick only looks at the current slot | pop from a queue / sorted set by score |
| Precision | worst case one poll interval | slot width (often 1s) | depends on the middleware |
| Failure | DB is still there; restart and scan | **rebuild the wheel from DB** | depends on durability; still prefer DB as source of truth |
| Interview | tens of thousands of jobs **is enough** | add it when fire points are dense and you need to cut table scans | close-order / retry use this a lot (Ch42) |

2026 common combo: **DB as source of truth + sharded time wheel for speed** (the path XXL-JOB took after leaving Quartz). Restart has a few-second cold-start window—handle that window with the misfire policy; don’t pretend an in-memory wheel never drops. Delayed close-order can also: write \`delay_until\` at create, or drop a delayed message; **business effect still hangs on order-state CAS + idempotency**; the scheduler only wakes you up.

**Point at DAG (then stop):** whiteboard default is **independent jobs**. A real edge like “recon succeeds, then emit the report” is **workflow-engine** topology (Airflow / Temporal class), not an adjacency list you invent inside a cron scheduler. XXL-JOB parent/child tasks are a lightweight trigger—know the name. If they push on DAG: admit the engine exists, **do not turn this prompt into a data-platform orchestration class.** Drawing an open-ended job as a twelve-node DAG is over-engineering; turning close-order into an Agent loop is the wrong chapter.

${D2}

| | This chapter (cron / delay) | Ch34 Agent orchestration |
|---|---|---|
| Who picks the next step | **clock / cron / delay** | the model (bounded loop) or **code edges** (workflow) |
| LLM? | **none** | each step may hit Ch32 |
| Double-fire | shard + lock + fencing | \`run_id\` + compensation; not grabbing a cron slot |
| Workflow | **point at it**; default independent jobs | loop vs state machine is that chapter’s hard part |
| HITL / handoff | none | that chapter |

Ch34 can **call** this chapter: e.g. “run recon every night” is still cron waking a model-free job; do not nest ReAct inside the job. The other way: timeout retry on an Agent run is the tool layer (Ch33) and compensation, not a second XXL-JOB. **One comparison table and stop; do not rewrite Agent runtime.**

Side-effect close (same line both chapters; mechanism in Ch41): handler **idempotent** (close-order CAS, recon UNIQUE per day); local transaction flips run status + Outbox, then notify. You cannot kill at-least-once delivery; you can only make the effect at-most-once.

**How to say it:**

> “Delay uses a wheel or a delay queue, not a full-table scan every minute. Point DAG at an engine; default independent jobs. Ch34 is a model loop; this chapter is a clock. Handler idempotent plus Outbox.”

trade-off: scanning the table is fast to implement, and a growing job count will saturate the DB; a time wheel is fast, and you have to rebuild and misfire. Filling the board with K8s CronJob YAML does not score.`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs old internet answers",
      bodyEn: `<details>
<summary>No Xu chapter · don’t lead with single-box cron / a company’s QPS</summary>

Alex Xu’s two volumes have no “design a job scheduler” chapter. Old internet answers are mostly: single-process Spring \`@Scheduled\`, reciting the Quartz API, K8s CronJob YAML, Airflow screenshots, or Redlock as the only cluster answer. **The body is rewritten for 2026 public interviews (distributed crontab / XXL-JOB / Quartz cluster framing)**—not a notes polish, not a product manual.

| Old internet / early engineering | How you answer now |
|---|---|
| Single-process \`@Scheduled\` / crontab | **multi-worker + shard + grab the lock**; single-box in a cluster *is* double-fire |
| Reciting Quartz tables as architecture | **Scheduler → Lock → Worker**; Quartz cluster lock is a pattern name |
| XXL-JOB menus / routing-strategy laundry list | remember DB lock, time wheel, two misfire policies; not a product class |
| Default catch-up replay everything | **per job**; system default skip / fire-once-now; recon uses a watermark |
| Airflow as the first picture | **point at** DAG; independent jobs on the board. Airflow 3 no longer defaulting catchup is a side note |
| K8s CronJob YAML | one sentence for containerized independent periodics; **does not guarantee exactly-once**; not this problem |
| Five-node Redlock | **Ch08**: efficiency lock SET NX; fencing on writes. This chapter does not rewrite it |
| Full-table scan every minute as delay | **time wheel / delay queue**; DB is still source of truth |
| Drawn together with Agent orchestration | **one comparison table**; the model loop is Ch34 |
| A company’s scheduler QPS / internal shard count | **forbidden**; teaching orders of magnitude only |
| Sync RPC in the handler, then mark success | **idempotent + Outbox** (Ch41) |

The skeleton that still holds: due rows need exclusive claim, handlers need to be idempotent, misses need a policy, delay and cron are not the same data structure. What’s dated is a single-box timer as a distributed answer, and drawing a workflow product / Agent runtime into the first picture.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **“What’s the relationship with Ch34?”** → This chapter has no model; the clock fires. Ch34 is a bounded loop / workflow. One comparison table; don’t rewrite the runtime.
2. **“Why not a crontab on every machine?”** → Every machine fires. You need shard or grab the lock, plus a unique key on runs.
3. **“You sharded—why still a lock?”** → On failover / split-brain two nodes will contend for the same shard. Shard cuts collisions; lock and UNIQUE close it.
4. **“Why bother fencing?”** → The lock is a lease; after it expires the old worker may still be running (Ch08). Writes to \`runs\` / the business table reject a stale token. Don’t re-teach Redlock.
5. **“Does SKIP LOCKED count as a lock?”** → It’s a claim. Row locks make each instance take different due rows. Business writes still want UNIQUE + idempotency.
6. **“Does misfire default to replay everything?”** → No. skip / fire-once-now as the system default; recon uses a watermark. catch-up storms.
7. **“Down two hours, per-minute job?”** → catch-up ≈ 120 times. Say the number, then change the policy or catch up a window.
8. **“Why not SELECT unclosed orders every minute for delayed close-order?”** → As orders grow the scan is the bottleneck. \`delay_until\` / wheel / delay queue. Close-order itself is CAS.
9. **“Do we need a DAG?”** → Default independent jobs. Real deps use a workflow engine; point and stop. Not an Airflow class.
10. **“K8s CronJob?”** → Independent periodic containers are fine. YAML is not this problem; the docs also don’t guarantee exactly-once.
11. **“XXL-JOB or Quartz—which is right?”** → Both are patterns: a central lock or a DB lock, a misfire policy, optional time wheel. Don’t bind the board to a product.
12. **“Side effect failed?”** → Handler idempotent; Outbox delivery (Ch41). Don’t mark the trigger success with a failed downstream RPC and no trace.
13. **The final picture is already huge and they want more boxes?** → Shard-algorithm papers, a K8s Operator, multi-region scheduling, Agent tool loops are not this chapter’s first answer. Going to the bottom on the three hard parts scores higher than twenty boxes.`,
    },
    {
      id: "sec-next",
      headingEn: "Wrap-up and what's next",
      bodyEn: `Never say the design is perfect. Speak three bottlenecks:

| bottleneck | How you take it |
|---|---|
| Two nodes double-fire | shard cuts collisions; SET NX / SKIP LOCKED to claim; \`(job_id, scheduled_at)\` UNIQUE; fencing on writes (Ch08) |
| misfire storm or a missed window | per job: skip / fire-once-now / watermark window; no silent catch-up of every slot |
| Answered as Agent or a DAG product | this chapter is a clock + independent jobs; point DAG at an engine; the model loop is Ch34 |

Self-check: close this page. Give the 30-second open + whiteboard Scheduler → Lock → Worker, and talk shard, grabbing the lock, fencing, skip vs catch-up, the delay wheel, and the Ch34 comparison to the air. Wherever you stumble, come back to that section. Do not open by re-teaching Redlock. Do not draw an Agent loop.

Next problem is **Ch26 · Red packet / lucky money**. The scheduler covered “fire once when due.” Red packets swap in **split the packet, inventory, no over-issue, recon**—and the boundary with payments / orders will bite again.`,
    },
  ],
  reviewMdEn: `# Ch25 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | Three hard parts of a job scheduler? | Shard + lock to avoid double-fire; misfire missed-fire compensation; the boundary with Ch34 Agent orchestration. |
| 2 | Default scope? | **Backend cron + delayed jobs** (recon, close-order, retry). Not K8s YAML, not an Airflow class, not Ch34. |
| 3 | Three high-level boxes? | **Scheduler → Lock → Worker**. Metadata in the DB; handler idempotent + Outbox. |
| 4 | Why shard *and* a lock? | Shard cuts scans and collisions; failover can still double-own a shard—close with grab-lock / UNIQUE / fencing. |
| 5 | How does the same fire point run once? | Claim: SET NX or SKIP LOCKED; \`runs(job_id, scheduled_at)\` UNIQUE; writes carry fencing (Ch08). |
| 6 | Why isn’t Redlock this chapter’s default? | The lock chapter already said no. Efficiency lock is one Redis; correctness is fence or a DB constraint. This chapter does not rewrite it. |
| 7 | skip vs catch-up? | skip schedules only the next (patrol/cache); catch-up replays every slot (storm-prone); compromise is fire-once-now. Per job. |
| 8 | Cleaner recon misfire catch-up? | **watermark / business-day window**, not replaying a per-minute trigger a hundred times. |
| 9 | Why not full-table scan every minute for delayed close-order? | Orders grow and it becomes the bottleneck. time wheel / delay queue / \`delay_until\`; close-order CAS idempotent. |
| 10 | How do you point at DAG on the board? | Default **independent jobs**. Real deps use a workflow engine; point and stop. Don’t invent topology or teach Airflow. |
| 11 | How do you cut vs Ch34? | This chapter is a clock, no model. Ch34: the model picks the step or code edges + persist the run. One comparison table. |
| 12 | Biggest over-engineering on this prompt? | Single-box cron as the cluster answer, Redlock, global catch-up, K8s YAML, Agent loop, a company’s QPS. |`,
});
