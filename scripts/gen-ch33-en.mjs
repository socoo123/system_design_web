import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch33",
  titleEn: "Agent tool platform",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 50–70 min ｜ **Prereq**: Ch32 gateway-to-model; orchestration is Ch34
> **Goal**: tool gateway, MCP, timeout/retry/idempotency, permission guardrails, session audit. Don't lock to one vendor SDK. Don't teach multi-step orchestration.

When they say “wire tools into an Agent / design a tool platform,” they are not scoring \`axios\` against production APIs inside the loop, and they are not asking you to recite some Agent SDK’s class names.

**Who calls whom:** the model (via Ch32) only emits a **JSON schema** \`tool_call\`. The thing that actually touches CRM, tickets, payments, search is the **tool gateway**. Behind the gateway: an MCP server or plain HTTP. **Don't let the model hit production endpoints directly.**

The **hard part** is three pieces: **tool gateway + schema** (allowlist, validation, credentials never in the prompt), **MCP vs ad-hoc HTTP** (model-facing function calling ≠ server-facing MCP), **timeout / bounded retry / write-path idempotency + permission guardrails**. Drawing an “Agent calls tools” box and then being unable to talk those three is a red flag.

This chapter’s boundary:

- **Model routing / TPM / semantic cache** → already Ch32; here we **invoke** tools, we don’t re-teach model selection
- **Multi-step loop, handoff, workflow** → preview Ch34; one sentence: **the multi-step loop is Ch34**
- **cron / DAG job scheduling** → Ch25; a tool call is a short RPC-like hop, not a scheduler
- **RAG pipeline / vector engine / PagedAttention** → not this chapter; retrieval at most as “one more read tool”

M5 hard rule: **LLM + Agent infra only. No recommender funnel.** Vendor SDKs are not architecture.`,
    },
    {
      id: "sec-pitch",
      headingEn: "How to answer in the interview (30 seconds)",
      bodyEn: `Don’t open by drawing the LangGraph family, and don’t name some Anthropic / OpenAI SDK. Land the scoring signal first: this is a **tool execution plane**, and the hard part is not the logo.

> “This is an **Agent tool platform**, not Ch32 again. The model only emits \`tool_call\` (OpenAI function calling / everyone’s tool use — that’s **model-facing schema**). Execution goes through a **tool gateway**: allowlist, JSON schema validation, auth, timeout, bounded retry; write tools need an **idempotency key**, default **HITL**. Behind it: MCP or HTTP — **MCP is a server-facing protocol**, not a vendor SDK lock. Every call lands session + audit. The multi-step loop is Ch34.”

How the 4 steps fill in:

${D2}

| Step | What it maps to on this prompt |
|---|---|
| Step 1 clarify | Which tools, read vs write, HITL, timeout budget, who holds credentials, do you need MCP |
| Step 2 high-level | runtime → tool GW (schema + allowlist + timeout) → MCP / HTTP; audit off to the side |
| Step 3 deep dive | ① gateway + schema ② MCP vs HTTP ③ timeout/retry/idempotency + permissions |
| Step 4 wrap-up | model hitting production, blind retry on writes, no audit, answering this as orchestration or cron |

**red flag:** axios from inside the Agent; locking the whole picture to one SDK; re-teaching Ch32 routing; writing the Ch34 loop early; opening RAG / recommenders; quoting some company’s internal tool QPS.`,
    },
    {
      id: "sec-clarify",
      headingEn: "Clarifying questions",
      bodyEn: `Drawing an MCP cluster before you asked “does this mutate data, who owns the timeout, where do credentials live” = Jimmy. About 6–8 questions; assume the rest and write the board.

| You ask | Why you ask | Typical assumption (when they say “you pick”) |
|---|---|---|
| Internal HTTP, third-party SaaS, or MCP servers? | How many transports sit behind the gateway | **Hybrid**: internal REST + some MCP; one schema facing out |
| Any write tools (place order, send email, close ticket)? | Reads can auto-run; writes need HITL + idempotency | **Writes exist**; writes default to approval, reads auto-run inside the allowlist |
| Timeout budget per tool call? Fail → retry or hand back to the model? | A hung call stalls the whole turn; blind retry double-writes | Reads **5–8s**; writes same cap; bounded retry only on retry_safe |
| Production credentials on the runtime or the gateway? | Keys in the prompt are an incident | **Gateway / vault**; the model only sees name + JSON schema |
| Allowlist by tenant, role, or Agent? | Permissions are this prompt’s guardrail | **tenant × Agent role**; default deny |
| How long do you keep audit? Replay by session? | Compliance and debug | Every tool call persisted; look up by \`session_id\` |
| Does this prompt include the multi-step loop / workflow? | Stops you drawing Ch34 | **No**; runtime only hands a single \`tool_call\` to the gateway |

How to say it:

> “I’ll assume the model emits tool_call via Ch32. All execution goes through the tool gateway. Read tools auto-run inside the allowlist; write tools HITL + idempotency key. MCP and HTTP both plug in; no SDK-lock. The multi-step loop is not on this whiteboard. Does that direction look OK?”`,
    },
    {
      id: "sec-estimate",
      headingEn: "Back-of-the-envelope (don’t fake precision)",
      bodyEn: `This prompt’s back-of-envelope is so the interviewer hears: **the bill is tool QPS and audit volume, not GPU.** Don’t invent some company’s internal numbers. TPM / model routing is Ch32’s bill.

Teaching assumption (write the board): peak **20** Agent conversation turns/sec (same order as Ch32 chat QPS). Average **3** tool calls per turn.

> Tool QPS ≈ 20 × 3 = **60 QPS**. This is a short RPC, not Ch25’s minute-scale cron. Read-tool p50 is often tens to hundreds of ms; write + HITL is async — don’t size GPUs against a sync 60 QPS.

| Quantity | Teaching number | How you open it |
|---|---|---|
| Agent turns | **20 /s** peak | Same order as chat; don’t borrow 10k-QPS CRUD |
| Tools per turn | **3** | Some turns 0, some 8; use the average |
| **tool QPS** | **~60** | Gateway capacity, timeout threads, downstream quotas look at this |
| In-flight calls | 60 × 0.3s ≈ **20** | Read path; writes waiting on approval don’t sit here |
| Audit | ~2 KB/call × 60 × 86400 ≈ **10 GB/day** | Truncate large fields; hot data lookup by session |

Don’t pad with GPU / TTFT. The tool-plane bottleneck is usually: **downstream API quotas, write-path approval queue, audit writes, retries amplifying QPS.** Elasticity details cite Ch42.

How to say it:

> “20 turns/sec, 3 tools each — about 60 tool QPS. Timeouts in seconds. Storage is audit, not VRAM. Ch32’s TPM is the model-side bill.”`,
    },
    {
      id: "sec-arch",
      headingEn: "High-level architecture",
      bodyEn: `Get buy-in: **one picture that lands the execution plane — don’t draw GPUs or a multi-step state machine.** The model is upstream (Ch32); the loop is a downstream preview (Ch34).

${D2}

All three boxes are leaves: runtime hands the model’s \`tool_call\` to the gateway; the gateway validates, auths, executes with a timeout; the backend is an MCP server or plain HTTP — they look the same to the runtime. Credentials and allowlist live only on the GW.

**This diagram cites**: protocols (Ch40), timeout/retry (Ch42). Upstream chat is Ch32; this picture does not draw the inference engine.

| Piece | What it does | How you say it |
|---|---|---|
| **agent runtime** | Takes the model’s \`tool_call\`, stuffs the result back into messages | Caller only in this chapter; the loop is Ch34 |
| **tool GW** | schema, allowlist, timeout, retry, idempotency, HITL | The **only** plane that may touch production APIs |
| **MCP / HTTP** | The server that actually does the work | Transports can mix; policy cannot |

Step 2 can volunteer endpoints (bonus; no full schema needed):

- Model side: \`tools\` / \`tool_calls\` on the chat request (**model-facing** JSON schema)
- Gateway: \`POST /tools/invoke\` (internal), \`GET /tools/catalog\` (this Agent’s allowlist projection)
- MCP: \`tools/list\`, \`tools/call\` (**server-facing**; 2026 remote MCP load-balances like ordinary HTTP)
- Audit: lookup by \`session_id\` / \`tool_call_id\`

Vs Ch25: a scheduler owns cron, delayed jobs, missed-run catch-up. A tool call is a **short RPC inside the user’s turn**, timeout in seconds, failure goes back to the model or HITL — don’t default it onto a job queue.

How to say it:

> “The runtime does not hold production keys. Every tool_call hits the gateway: validate schema, pass the allowlist, then MCP or HTTP. If that direction is OK, I’ll dig into the gateway, the MCP boundary, timeout and the write path.”`,
    },
    {
      id: "sec-gw",
      headingEn: "Deep dive ①: tool gateway and schema",
      bodyEn: `2026 default: **the model does not touch production.** It only produces “which tool, with what args.” The gateway is the only execution plane: registry + allowlist + JSON schema validation + auth. Scattering those checks into every axios call is the flip side of over-engineering that looks simple and then drifts in a few months — policy copy-paste fails.

Each registry entry at least has: \`name\`, JSON schema, transport (mcp / http), \`side_effect\` (read / write), timeout, \`retry_safe\`, \`approval_required\`. The model only sees the **filtered** name + schema — not URLs, keys, or internal error codes.

Validation order (say it in this order, don’t reverse it):

1. Is the tool in the registry (name hallucination → reject immediately)
2. Is it on this tenant / this Agent’s **allowlist** (default deny)
3. Do arguments match the schema (missing field, extra field, wrong type → 4xx back to the model, **not** a 5xx retry)
4. Write tools: HITL required? idempotency key present?
5. Then execute, with a timeout

${D2}

| | read | write |
|---|---|---|
| Default | Auto-run inside the allowlist | **approval_required** (HITL) |
| Credentials | Read-only scope | Narrower; if you can split \`ticket.close\`, don’t ship \`ticket.update_anything\` |
| Failure | Normalized error back to the model | No approval = no execute; timeout is abort, never sneak a run |
| Audit | args / latency / result summary | Also who approved, the approval token |

HITL is not “please be careful” in the prompt. A policy engine (rules, **not** another LLM call) returns \`allow\` / \`deny\` / \`approval_required\`. Before approval the gateway can 202 + \`pending\`; the runtime pauses this hop (how you suspend the loop is Ch34). Approval tokens have a short TTL; without a token, a write tool never runs.

Credentials: the gateway calls downstream with vault / short-lived tokens. Agent tokens can only narrow, never widen (user is \`repo:read\`, the Agent must not become \`repo:write\`). Keys in schema descriptions or plaintext logs are a red flag.

Don’t register every internal microservice as a tool. Tools are a **product surface for the model**: few, well-documented, side effects labeled. Stuffing a hundred endpoints into the \`tools\` array burns prompt tokens and amplifies mis-invokes — that’s over-engineering.

How to say it:

> “Gateway does allowlist first, then schema. Reads auto-run, writes HITL. Keys stay on the gateway. The model only sees JSON schema. Don’t let the Agent hit production.”`,
    },
    {
      id: "sec-mcp",
      headingEn: "Deep dive ②: MCP vs HTTP (no SDK-lock)",
      bodyEn: `Interviewers love “so do we use MCP or function calling?” The right answer: **not a choice. Two layers.**

- **Model-facing:** each vendor’s tool / function calling. You put JSON schema on the chat request; the model returns \`tool_calls\`. OpenAI says function calling, Anthropic says tool use — the shape is “name + arguments,” field names differ a bit (\`parameters\` vs \`input_schema\`). **This layer is for the model.**
- **Server-facing:** MCP (Model Context Protocol) is the open protocol between tool processes: \`tools/list\` for discovery, \`tools/call\` for execute. The gateway can translate that into HTTP JSON. **This layer is for the tool server.**

Late 2025 MCP moved under the Linux Foundation’s Agentic AI Foundation; 2026 remote MCP is heading toward **sessionless at the protocol layer** (no handshake + sticky to hit the same instance), so the gateway routes and rate-limits by method / tool name. The interview first answer is still “gateway + open protocol.” **Don’t** draw the architecture as requiring some Python/TS SDK.

${D2}

| | MCP | Ad-hoc HTTP |
|---|---|---|
| Discovery | \`tools/list\` (cacheable) | Gateway registers the schema itself |
| Execute | \`tools/call\` | \`POST\` some internal endpoint |
| When | Many clients, want a standard, tools owned by other teams | **One or two internal APIs**, no MCP server yet |
| Pitfall | Untrusted \`tools/list\` must pin the allowlist (tool descriptions can be swapped) | Every new hook hand-writes auth/timeout and leaks |
| vs the model | Gateway **projects** the catalog into function schema | Same projection; the model never sees URLs |

The gateway can **mix**: some backends MCP, some HTTP. The runtime only knows one invoke. That’s “no SDK-lock”: swap the model, you only change Ch32’s schema dialect; swap the tool server, you only change the gateway transport.

Ad-hoc HTTP is not original sin. Three internal read endpoints, no cross-product reuse — forcing an MCP cluster is over-engineering. When a tool needs to be shared by multiple Agents and runtimes, collapse the HTTP adapter into an MCP server — the gateway allowlist doesn’t get rewritten.

Protocol-layer session ≠ **business session**. 2026 remote MCP can be sessionless at the protocol; you still persist **conversation / tool-call audit** (next section). Don’t hear “MCP went stateless” as “we can skip recording who invoked a write tool.”

How to say it:

> “Function calling is the model dialect; MCP is tool transport. The gateway translates. One or two internal HTTP endpoints can hang off the gateway directly. Don’t draw some vendor SDK on the whiteboard.”`,
    },
    {
      id: "sec-retry",
      headingEn: "Deep dive ③: timeout, retry, idempotency, and session audit",
      bodyEn: `A tool is a short RPC; it needs a **deadline**. The model will re-emit the same intent as another \`tool_call\`, and the gateway itself will want to retry on 5xx — on the write path that’s double-spend / double-ticket. Algorithm mental model is Ch42; what’s specific here is the **retry_safe bit + idempotency key**.

${D2}

Timeout: a cap per tool (teaching **8s** on reads, same cap on writes). On expiry **abort downstream**, hand the runtime a normalized \`tool_timeout\`. Don’t stall an Agent turn on a hung HTTP. Long jobs should not masquerade as sync tools — either the MCP side returns a task handle (client polls), or it isn’t this chapter’s short RPC.

${D2}

| | Do | Don’t |
|---|---|---|
| **timeout** | Every call has a cap; cancel must reach downstream | Wait forever; time out only the runtime and leave the connection |
| **retry** | Only \`retry_safe\` (read-only / marked idempotent); **at most once** + jitter | Hammer 4xx, or POST that isn’t marked idempotent |
| **idempotency** | Write tools require a key (caller-supplied, or hash(session, step, name, args)) | Rely on “the model probably won’t re-send” |

Idempotency store: gateway \`SET NX\` key → result (success body or error code) + TTL. Same key again → **return the first result as-is**, don’t hit downstream. HITL “approved twice” also uses the same key. Same sentence as the payments prompt; the caller just happens to be a model that hallucinates.

Session / audit is stored separately from the MCP protocol session:

${D2}

**This diagram cites**: storage choice (Ch37), resilience (Ch42). Hot path: KV / document store keyed by \`session_id\`; cold path: object storage or the log system.

Every tool call at least records: \`session_id\`, \`tool_call_id\`, tenant, tool name, args summary (redacted), policy result (\`allow\` / \`deny\` / \`pending\`), latency, downstream status, idempotency key. That’s the minimum for debug and compliance. Don’t substitute “the conversation in the prompt” — that gets truncated, and it never lands in SIEM.

How to say it:

> “Every tool has a timeout. Bounded retry only on reads. Writes require an idempotency key. No HITL token → no execute. Audit lands by session, not the MCP handshake ID.”`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs “axios from inside the Agent”",
      bodyEn: `<details>
<summary>fetch-ing production APIs inside the loop — how you answer now</summary>

Early demos (and a lot of 2024 tutorials) defaulted to: register a few Python functions in a ReAct loop, \`axios\` / \`fetch\` the CRM from inside the function. It runs. **It is not 2026 body copy.**

| Then / early engineering | How you answer now |
|---|---|
| Runtime hits a URL with one key | **tool gateway**; keys and allowlist live on the gateway |
| Schema baked into the prompt | Gateway validates JSON schema; catalog projected by role |
| Fail → call again | Reads only if retry_safe; writes **idempotency key** |
| Write tools also auto-run | Reads auto, writes **HITL** |
| Locked to one Agent SDK | model-facing uses each vendor’s tool calling; server-facing MCP or HTTP |
| Don’t record calls | session + audit; separate from the MCP protocol session |
| Answering this as cron or orchestration | Short RPC in this chapter; multi-step loop Ch34; scheduling Ch25 |

Body first answer uses this set. The fold only stops you from treating “axios inside the Agent” as the final draft.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **Isn’t this just an API gateway?** → Auth / timeout / audit are isomorphic with a business gateway. What’s specific is **schema from the model**, per-Agent allowlist, HITL, and the model will re-call so the write path must be idempotent.
2. **Why not let the model HTTP directly?** → Keys, allowlist, timeout, audit drift into every runtime. One hallucinated arg hits production.
3. **MCP or function calling?** → Two layers. Function calling faces the model; MCP faces the tool server. The gateway translates.
4. **Why not MCP for everything?** → Forcing the protocol onto one or two internal HTTP endpoints is over-engineering. Multi-client, then collapse to MCP.
5. **Why not auto-retry on failure?** → 4xx is schema/permission. Retrying a non-idempotent POST = double-write. Read-only + bounded.
6. **Isn’t this Ch25 scheduling?** → Scheduling is cron / delay / missed-run catch-up. Tools are in-turn second-scale RPC.
7. **Model routing?** → Ch32. This chapter assumes \`tool_call\` already came out of the model.
8. **Multi-step loop / handoff?** → **The multi-step loop is Ch34.** This chapter executes one hop.
9. **Semantic-cache tool results?** → Reads can have a short TTL; writes no. Don’t import Ch32 semantic cache as a correctness plan.
10. **MCP is sessionless — still need a session store?** → Protocol handshake can be gone. **Business audit / HITL pause** still need storage.`,
    },
    {
      id: "sec-next",
      headingEn: "What's next",
      bodyEn: `Close the page. Walk the 30-second open + two pictures (runtime → GW → MCP/HTTP, read/write contrast). If you can explain **why the gateway sits in front of the model, the two protocol layers, why the write path needs idempotency and HITL**, you pass.

Next prompt preview: **Agent orchestration and runtime** (multi-step loop, handoff, workflow, failure compensation). This chapter only lands one tool hop safely.

Self-check: left column assumptions (hybrid MCP/HTTP, write tools exist, 8s timeout), middle the three-box chain, right the three deep-dive trade-offs.`,
    },
  ],
  reviewMdEn: `# Ch33 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | Design an Agent tool platform — 30-second open? | Model only emits tool_call; tool gateway does allowlist/schema/timeout/idempotency; MCP or HTTP behind it; write path HITL. No SDK-lock. Multi-step loop is Ch34. |
| 2 | What’s the hard part on this prompt? | ① gateway + schema ② MCP vs HTTP (two layers) ③ timeout / bounded retry / write-path idempotency + permissions. |
| 3 | What should you clarify? | Tool kinds, read vs write, HITL, timeout, who holds credentials, do you need MCP, does this include the loop. |
| 4 | Boundary vs Ch32 / Ch34 / Ch25? | Ch32 calls the model. This chapter executes one tool hop. Ch34 is the multi-step loop. Ch25 is cron, not second-scale RPC. |
| 5 | Why can’t the model hit production APIs directly? | Keys, allowlist, timeout, audit can’t be unified; a hallucinated arg hits a real system. |
| 6 | model-facing vs server-facing? | function calling / tool use shows the model JSON schema. MCP faces the tool server. The gateway translates. |
| 7 | Teaching 20 turns/sec → how much tool QPS? | 3 tools per turn → ~60 tool QPS. The bill is RPC and audit, not GPU. |
| 8 | allowlist + schema order? | Registry first, then allowlist (default deny), then JSON schema, then HITL/idempotency, then execute. |
| 9 | Default read vs write policy? | Reads: auto inside the allowlist. Writes: HITL + idempotency key; no approval token → no execute. |
| 10 | When MCP, when HTTP? | Many clients, want standard discovery → MCP. One or two internal APIs → HTTP off the gateway. Mix is legal. |
| 11 | Timeout and retry? | Every call has a deadline (teaching 8s). Bounded retry only on retry_safe. No retry on 4xx or non-idempotent POST. |
| 12 | Why do write tools need an idempotency key? | Model and gateway can both replay. Same key returns the first result — no double-write. |
| 13 | What does audit store? Is it the MCP session? | session_id, the call, policy result, latency, redacted args. Business audit ≠ protocol handshake ID. |
| 14 | 2026 vs axios inside the loop? | Now: gateway + two protocol layers + write-path guardrails. Direct connect is a demo. |
| 15 | Register every microservice as a tool? | red flag / over-engineering. Tools are a small product surface for the model, not an endpoint catalog. |`,
});
