import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch34",
  titleEn: "Agent orchestration & runtime",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 50–70 min ｜ **Prereq**: Ch33 tool plane; Ch32 gateway-to-model; Ch25 is cron, not this chapter
> **Goal**: multi-step loop, handoff, workflow vs free loop, HITL, failure compensation. Don't lock to an SDK. Don't re-teach MCP.

When they say “design Agent orchestration / a runtime / let the model call tools over multiple steps,” they are not scoring \`while True\` calling the model inside a service, and they are not asking you to recite LangGraph / OpenAI Agents class names.

**Who runs the loop:** the runtime owns one **run**. Each step calls the model via **Ch32**; if the model emits \`tool_call\`, execute via **Ch33**, write the observation back into the run. Tool gateway, MCP, allowlist, single-hop idempotency are already Ch33 — this chapter **invokes** that layer, it doesn't re-teach it.

The **hard part** is three pieces: **loop vs workflow** (path unknown → bounded ReAct; path known → state machine), **run state + handoff** (persist, pause, switch agents without dropping context), **HITL + failure compensation** (approve write tools; side effects use a compensating action, not retry forever). Drawing an “Agent loop” box and then being unable to talk those three is a red flag.

This chapter’s boundary:

- **Tool gateway / MCP / single-hop timeout & idempotency** → already Ch33; here we only hand off \`tool_call\`
- **cron / delayed jobs / model-free DAG** → Ch25; one comparison table, don't rewrite the scheduler
- **Model routing / TPM** → already Ch32; every LLM step hits that door
- **GPU cluster / training platform** → preview Ch35; don't draw a machine room on this whiteboard
- **RAG pipeline / recommenders / PagedAttention** → not this chapter

M5 hard rule: **LLM + Agent infra only. No recommender funnel.** LangGraph and OpenAI Agents are **pattern examples**, not architecture.`,
    },
    {
      id: "sec-pitch",
      headingEn: "How to answer in the interview (30 seconds)",
      bodyEn: `Don’t open by drawing the LangGraph family, and don’t quote some Agents SDK’s Runner config. Land the scoring signal first: this is a **model-in-the-loop runtime**, and the hard part is not the logo.

> “This is **Agent orchestration & runtime**, not Ch33 again, and not Ch25’s cron. Default is a **bounded ReAct/tool loop**: plan → tool_call → observe → repeat; **max steps** + stuck detection; **run state persisted**. Path known (refunds, onboarding) → **state machine / workflow**, the model only lives inside nodes. Write tools **HITL** pause the run. Side-effect failures go **compensating action** (saga-like), not retry forever on the write path. Every LLM step is Ch32, tools are Ch33. No SDK-lock.”

How the 4 steps fill in:

${D2}

| Step | What it maps to on this prompt |
|---|---|
| Step 1 clarify | Path known or not, writes or not, step budget, single agent vs handoff, compensate vs a human |
| Step 2 high-level | run store + bounded loop; one step through Ch32 then Ch33; stop conditions live on the runtime |
| Step 3 deep dive | ① loop vs workflow ② run state + handoff ③ HITL + compensate |
| Step 4 wrap-up | \`while True\`, no max steps, blind retry on writes, multi-agent from the start, answering this as cron or GPU |

**red flag:** unbounded loop; LangChain class names as architecture; re-teaching Ch33 MCP; importing the Ch25 scheduler as an Agent; opening RAG / recommenders; quoting some company’s internal run QPS.`,
    },
    {
      id: "sec-clarify",
      headingEn: "Clarifying questions",
      bodyEn: `Drawing a multi-agent picture before you asked “is the path known, does this mutate data, who caps the steps” = Jimmy. About 6–8 questions; assume the rest and write the board.

| You ask | Why you ask | Typical assumption (when they say “you pick”) |
|---|---|---|
| Open-ended exploration, or known steps (refund / onboarding)? | Decides loop vs workflow | **Hybrid**: support exploration uses a bounded loop; refunds go through a state machine |
| Any write tools? Who approves HITL, and how do you resume after? | Writes must be able to pause the run | **Writes exist**; writes default to approval; after approve, runtime resumes from checkpoint |
| Step budget and wall-clock for one run? | Unbounded loops blow Ch32 RPM | **max_steps = 12**; wall-clock in minutes; stuck → stop |
| One agent + tools enough, or do you need handoff? | Splitting multi-agent too early is over-engineering | **Single agent first**; handoff only when instructions / tools / policy actually diverge |
| Mid-run failure: retry, compensate, or hand to a human? | Side effects can’t be “just run it again” | Reads: bounded retry (Ch33); writes: compensate or HITL, not retry forever |
| Does a run need to recover across processes? | Decides whether you persist | **Yes**; persist to the run store every step; HITL / crash can both resume |
| Does this prompt include the tool gateway implementation, GPU cluster? | Stops you drawing Ch33 / Ch35 | **No**; tools via Ch33, models via Ch32, the machine room is Ch35 |

How to say it:

> “I’ll assume: default bounded loop + persist. Known paths like refunds use a workflow. Write tools HITL pause the run. Failures on side effects compensate. Single agent first, handoff is optional. I’m not redrawing the tool or model gateways. Does that direction look OK?”`,
    },
    {
      id: "sec-estimate",
      headingEn: "Back-of-the-envelope (don’t fake precision)",
      bodyEn: `This prompt’s back-of-envelope is so the interviewer hears: **the bill is concurrent runs and the step budget, not GPU.** Don’t invent some company’s internal numbers. VRAM / batching is Ch35’s bill.

Teaching assumption (write the board): peak **20** user turns/sec (aligned with Ch32 chat QPS). Average **5** LLM steps per turn (some stop at 1, some hit the cap).

> Inner-loop LLM QPS ≈ 20 × 5 = **100**. If Ch32 sized TPM off 20 chat QPS, an Agent prompt has to multiply the inner loop in — **max_steps is a capacity switch**, not politeness. Tool calls still follow Ch33: ~3 per turn on average → ~60 tool QPS.

| Quantity | Teaching number | How you open it |
|---|---|---|
| User turns | **20 /s** peak | Same order as chat; don’t borrow 10k-QPS CRUD |
| Avg LLM steps | **5** | Between 1 and cap; use the average |
| **Inner-loop LLM QPS** | **~100** | Hits Ch32; unbounded loops blow RPM first |
| **max_steps** | **12** | Public SDKs often default ~20; in interview tune 8–20 to the task |
| Hot-path occupancy | 5 × ~2s ≈ **10s** | Sync holds a worker; HITL parked does not |
| **Concurrent in-flight** | 20 × 10s ≈ **200** | Runs still in the hot loop; ones waiting on approval counted separately |

Don’t pad with GPU / TTFT. The runtime bottleneck is usually: **inner-loop RPM (Ch32), tool quotas (Ch33), run-store writes every step, HITL queue depth.** Elasticity details cite Ch42.

How to say it:

> “20 turns/sec, 5 steps each — about 100 LLM calls. Concurrent about two hundred hot runs. The step budget is how you cut the inner loop first. Storage is run checkpoints, not VRAM.”`,
    },
    {
      id: "sec-arch",
      headingEn: "High-level architecture",
      bodyEn: `Get buy-in: **one picture that lands the bounded loop — don’t draw an MCP cluster or GPUs.** The model is Ch32, tools are Ch33, stop conditions live on the runtime.

${D2}

Four leaves are the skeleton of one run: the model plans (via Ch32); act is \`tool_call\` (via Ch33); observe writes back into messages; **stop is a runtime condition, not the model being well-behaved.** If you didn’t stop after observe, the next beat plans again — draw it as a chain, not a 12-step ReAct tower.

Stop conditions stack (say them in this order):

1. The model stops emitting \`tool_call\` (normal finish)
2. **max_steps** exhausted (teaching 12)
3. **stuck**: same \`(tool, args)\` hash ~3 times in a row, or observation isn’t making progress
4. Wall-clock / error budget blown
5. HITL deny, user cancel, compensation finished

In public implementations, Vercel AI SDK-class defaults are \`stepCountIs(20)\`; OpenAI Agents’ Runner is also “call the model → tool or handoff → run again” until a final output. The interview first answer is **bounded loop + persisted run** — don’t treat the default number as an SLA.

One step through two existing gateways (this picture does not redraw MCP):

${D2}

**This diagram cites**: resilience (Ch42). LLM GW is Ch32; tool GW is Ch33. The runtime writes the run store around each step; omitted on the picture so we don’t go past 4 participants.

| Piece | What it does | How you say it |
|---|---|---|
| **runtime** | Step, stop conditions, pause, handoff | The only place that owns the loop |
| **run store** | messages, step, agent id, side-effect stack | Crash / HITL can both resume |
| **Ch32** | One chat per step | Inner-loop QPS hits its TPM/RPM |
| **Ch33** | Execute one tool hop | allowlist / idempotency / per-hop HITL policy live there |

### Vs Ch25 job scheduling

Ch25 is **backend cron / delayed jobs / model-free DAG**. This chapter may call the model on every step. One table is enough — don’t redesign the lock-steal scheduler.

| | Ch25 job scheduling | This chapter’s Agent runtime |
|---|---|---|
| Trigger | cron, delay, events | User turn / API opens a \`run_id\` |
| Each step | Deterministic code | **Calls the model** (Ch32), then maybe a tool (Ch33) |
| DAG | Job deps, missed-run catch-up | Path known → **state machine** (nodes may still have an LLM) |
| Failure | Rerun the job, catch up missed | Step budget; side effects **compensate** |
| State | job row | **run state** (messages + step + agent) |

How to say it:

> “The runtime runs a bounded loop. Each step hits Ch32, tools hit Ch33. Stop conditions live on the runtime. Runs persist. Ch25 is cron with no model — don’t mix them. If that direction is OK, I’ll dig into loop vs workflow, handoff, HITL and compensation.”`,
    },
    {
      id: "sec-loop",
      headingEn: "Deep dive ①: loop vs workflow",
      bodyEn: `2026 default interview answer: **path unknown → bounded ReAct/tool loop; path known → state machine / workflow.** Both can call the model inside a node. The difference is **who picks the next step**.

- **Loop:** the model picks the next tool. Fits diagnosis, retrieval, open-ended support — you can’t draw fixed edges at design time. You need max steps / stuck / wall-clock, or tokens and side effects drift.
- **Workflow:** edges are code. Fits refunds, onboarding, close-ticket: verify order → eligibility → payout → notify. The model lives inside nodes (extract fields, classify, write copy) and **cannot skip a compliance edge**. Failure follows a determined compensation edge, not “let the model think again.”

${D2}

| | bounded loop | workflow / state machine |
|---|---|---|
| Who picks next | The model | **Code / edges** |
| When | Exploration, tool order unknown up front | Refunds, onboarding, close-ticket, compliance checklists |
| Stop | max steps + stuck + final answer | Terminal state; timeout → compensate or a human |
| Testing | Hard; traces and budgets | Nodes unit-testable; edges enumerable |
| Pitfall | Unbounded = RPM bomb; write path wanders | Drawing an open task as a 12-node DAG = brittle |

LangGraph-class libraries package “stateful graph + checkpoint + interrupt”; OpenAI Agents’ Runner is a loop + optional handoff. In interview say **pattern**: persisted graph / bounded loop. **Don’t** write \`StateGraph\` / \`AgentExecutor\` on the whiteboard as component names. A dozen states you can write by hand, no multi-day approval — forcing a graph engine is over-engineering.

In production you often **hybrid**: outer workflow (gates you must pass), and inside one node a short bounded loop (that subproblem’s path is unknown). The outer still guarantees a refund can’t skip eligibility.

Vs Ch25’s DAG: those nodes are **model-free jobs**. Here, workflow nodes often **still call an LLM**. Don’t say “so I’ll run Agents on the job scheduler” — that’s stuffing model-in-the-loop into a cron worker; HITL and the step budget both get awkward.

How to say it:

> “Default bounded loop + persist. Refunds, where the edges are clear, use a state machine — the model doesn’t get to rewrite edges. Don’t draw an open task as a giant DAG, and don’t rely on the model to stay on a refund path.”`,
    },
    {
      id: "sec-handoff",
      headingEn: "Deep dive ②: run state and handoff",
      bodyEn: `A loop with no persistence is a demo: the process dies, HITL sits overnight, context is gone. 2026 default: **one row (or document) per \`run_id\`**, write it before you call the next beat of the model.

Minimum fields: \`run_id\`, tenant, status (\`running\` / \`paused_hitl\` / \`compensating\` / \`done\` / \`failed\`), \`step_count\`, \`current_agent\`, messages (or an object-store pointer), last tool fingerprint (for stuck), **side-effect stack** (for compensation). Hot path lookup by \`run_id\`; that’s a storage-choice prompt — cite Ch37, don’t pick a brand on this whiteboard.

**Single agent + tools first.** Public orchestration guides (OpenAI Agents-class) say the same: if instructions, tools, and policy don’t actually fork, don’t split. Multi-agent too early = more prompts, more traces, more approval surface — that’s over-engineering.

When you do split, distinguish two kinds of **ownership** (names as patterns, no SDK-lock):

- **handoff:** the specialist takes the conversation. A billing question goes to the billing agent; it talks to the user. The runtime updates \`current_agent\`, **same \`run_id\`**.
- **agent-as-tool:** the manager still owns the user; the specialist does a bounded job like summary / classify, result comes back. Control doesn’t transfer.

${D2}

handoff goes through **shared run state**, not blindly copying the whole transcript into another process. Filter: drop tool results the other agent shouldn’t see, narrow messages, swap the allowlist projection (projection rules still live in Ch33; the runtime only swaps the role). Blind-passing the full history punches through policy isolation.

| | Do | Don’t |
|---|---|---|
| Single → multi | Split only when instructions / tools / policy actually fork | Draw 8 specialists on the opening |
| handoff | Update \`current_agent\`; same run | Open a new run and drop the side-effect stack |
| Context | Filter, then hand to B | Whole transcript + the other agent’s key scope |
| as-tool | Manager synthesizes the final answer | User bounced around with no one on the books |

Crash recovery: workers are stateless, lease a \`running\` run, resume from the last checkpoint. Looks like Ch25 “steal a job,” but you’re resuming **stepping with model context**, not replaying the whole cron. Lease timeout must be takeable — don’t let two workers step the same \`run_id\` at once (fencing / version numbers; mental model cites Ch42 / the locking chapter).

How to say it:

> “Persist the run every step. Single agent first. handoff is swapping current_agent on shared run state — filter the context. Don’t make multi-agent the default architecture.”`,
    },
    {
      id: "sec-hitl",
      headingEn: "Deep dive ③: HITL and failure compensation",
      bodyEn: `Write-tool approval policy lives in **Ch33** (\`approval_required\`, approval token, no token → no execute). This chapter’s hard part is **how the runtime stops, how it resumes, and what you do when the side effect already happened.**

${D2}

HITL is not “please be careful” in the prompt. When the gateway returns \`pending\`, the runtime sets status to \`paused_hitl\`, the checkpoint is already written, **release the worker**. After a human approves / edits / denies, wake it with a short-TTL token. Deny = this hop does not execute; the model sees a normalized \`denied\` and can replan or stop — don’t treat deny as a 5xx and retry the write tool.

Irreversible actions (payout to the outside, email already sent): put the **interrupt before the side effect**. HITL then invoke is cheaper than send-then-compensate.

Failure classes (aligned with Ch33; don’t re-teach the gateway):

- **Transient + retry_safe:** bounded retry (Ch33 already caps the count). The runtime must not wrap another infinite retry.
- **schema / permission 4xx:** hand back to the model or stop; don’t replay.
- **Side effect already happened:** **compensate**, don’t “rerun the whole loop.”

${D2}

This is saga-like (paper and business detail in Ch41): each write tool in the registry pairs a **compensating action** (place order ↔ cancel, hold ↔ release, charge ↔ refund). On failure, compensate the side-effect stack **in reverse**. Compensation itself goes through Ch33’s **idempotency key** — a crash will replay compensation; compensating twice must not become a new incident.

| | Do | Don’t |
|---|---|---|
| retry | Transient, read-only, already marked idempotent | **retry forever** on a non-idempotent POST / a write that already succeeded |
| compensate | Reverse-order undo; compensation is also idempotent | Pretend 2PC spans CRM and payments |
| Irreversible | HITL first; or you can only apologize going forward | Think you can unsend email |
| Compensation fails | DLQ / a human; status=\`failed\` | Swallow it and pretend the run succeeded |

Agents don’t have a distributed transaction across SaaS. Compensation is **semantically walking back**, not an atomic rollback. After timeout you don’t know whether downstream succeeded — that’s why Ch33’s idempotency key is needed on both sides: forward and compensate may both fire again.

How to say it:

> “Write tools HITL: the runtime pauses the run, releases the worker, resumes after approval. Side effects that already happened go compensating action — reverse order, idempotent. Don’t retry forever on the write path. Single-hop idempotency is Ch33.”`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs “while True calling the model”",
      bodyEn: `<details>
<summary>A tight loop calling the model in-process — how you answer now</summary>

Early demos (and a lot of 2023–2024 tutorials) defaulted to: \`while True\` call completion, parse a Thought/Action blob, local functions wired straight to production. It runs. **It is not 2026 body copy.**

| Then / early engineering | How you answer now |
|---|---|
| \`while True\` calling the model | **bounded loop**; max steps + stuck hash + wall-clock |
| messages only in memory | **run state persisted**; HITL / crash can resume |
| Unknown path forced into a giant DAG / known path as pure ReAct | Unknown → loop; known → **workflow**; hybrid is legal |
| Multi-agent group chat from the opening | **Single agent + tools first**; handoff shares run state |
| Write failed → rerun the whole loop | **compensating action**; write path does not retry forever |
| Write tools auto-run | **HITL** pauses the run (policy in Ch33, pause in this chapter) |
| Locked to LangChain classes / some vendor Runner | pattern: bounded loop, checkpoint, handoff; **no SDK-lock** |
| Answering this as cron or a GPU pool | Model-free jobs are Ch25; the machine room is Ch35 |

Body first answer uses this set. The fold only stops you from treating “while True calling the model” as the final draft.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **Isn’t this just while calling the model?** → The gap is stop conditions, persist, HITL pause, compensation. Unbounded loops are RPM and side-effect incidents.
2. **Why not ReAct for everything?** → Refund / onboarding edges are compliance. The model cannot rewrite edges. Known path → workflow.
3. **Why not a DAG for everything?** → Drawing dead edges on an open task is brittle. That’s over-engineering.
4. **Isn’t this Ch25 scheduling?** → Scheduling has no model. This chapter may hit Ch32 every step. One comparison sentence; don’t rewrite lock-steal.
5. **MCP / allowlist?** → **Ch33.** This chapter only invokes.
6. **Model routing / TPM?** → **Ch32.** Inner-loop QPS times the step budget.
7. **Why single agent first?** → Splitting with no fork inflates prompts and approval surface. handoff needs ownership to actually transfer.
8. **Why not open a new run on handoff?** → Side-effect stack and approvals hang off the same \`run_id\`. Splitting runs is how you miss a compensate.
9. **Why not retry forever on failure?** → Write path double-spends. Transient reads retry; everything else compensate or HITL.
10. **Is LangGraph the standard answer?** → It’s one implementation of checkpoint + interrupt. Draw the pattern on the whiteboard, not the class.
11. **How do you scale GPUs?** → **Ch35.** This chapter’s concurrency is runs, not cards.`,
    },
    {
      id: "sec-next",
      headingEn: "What's next",
      bodyEn: `Close the page. Walk the 30-second open + two pictures (plan→act→observe→stop, one step through Ch32/Ch33). If you can explain **when loop, when workflow, why the run persists, why the write path needs HITL and compensation**, you pass.

Next prompt preview: **LLM foundation infra** (model registry, GPU cluster scheduling, VRAM and batching, canary rollback, multi-tenant). This chapter only runs **one run’s loop** on the control plane; how you schedule cards is Ch35.

Self-check: left column assumptions (hybrid loop/workflow, write tools exist, max_steps=12), middle the bounded loop + one-hop sequence, right the three deep-dive trade-offs.`,
    },
  ],
  reviewMdEn: `# Ch34 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | Design Agent orchestration & runtime — 30-second open? | bounded ReAct/tool loop + persist; known path → workflow; write tools HITL; side effects compensate. Tools Ch33, models Ch32. No SDK-lock. |
| 2 | What’s the hard part on this prompt? | ① loop vs workflow ② run state + handoff ③ HITL + failure compensation. |
| 3 | What should you clarify? | Path known or not, writes or not, steps/wall-clock, single vs handoff, compensate vs a human, do you persist. |
| 4 | Boundary vs Ch33 / Ch32 / Ch25 / Ch35? | Ch33 executes one hop. Ch32 is each LLM step. Ch25 is model-free cron. Ch35 is the GPU platform. |
| 5 | Why is the default a bounded loop? | Path unknown → the model picks tools. You need max steps, stuck, wall-clock, or RPM and side effects run away. |
| 6 | When do you switch to a workflow? | Refunds, onboarding — edges you can write down. The model lives in nodes and cannot skip a compliance edge. |
| 7 | Teaching 20 turns/sec — how do you size it? | Avg 5 LLM steps → ~100 inner-loop QPS; hot occupancy ~10s → ~200 concurrent runs. The bill is the step budget, not GPU. |
| 8 | What are the stop conditions? | No tool_call, max_steps, stuck hash, wall-clock/error budget, HITL deny, compensation finished. |
| 9 | How do you detect stuck? | Same (tool, args) hash ~3 times in a row, or observation isn’t making progress. Extra steps won’t save it. |
| 10 | Why persist the run? | HITL overnight, process crash, handoff all need the same checkpoint. An in-memory loop is a demo. |
| 11 | When handoff, when single agent? | Single agent + tools first. Transfer ownership only when instructions/tools/policy actually fork. as-tool: the manager still answers the user. |
| 12 | What does handoff pass? | Same run_id, update current_agent; filter messages and allowlist. Don’t blind-copy the transcript; don’t open a new run and drop the side-effect stack. |
| 13 | What does the runtime do on HITL? | status=paused_hitl, release the worker; resume after the approval token. Deny goes back to the model — don’t retry deny as a write-path 5xx. |
| 14 | Why not retry forever on failure? | Writes double-spend. Transient reads get Ch33 bounded retry; side effects that already happened go compensating action (saga-like; idempotency key still Ch33). |
| 15 | 2026 vs while True? | Now: bounded loop + persist + known path as a graph + HITL + compensation. A tight loop wired to production is a demo. |`,
});
