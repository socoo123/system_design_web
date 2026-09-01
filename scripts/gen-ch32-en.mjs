import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch32",
  titleEn: "LLM API gateway",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 50–70 min ｜ **Prereq**: Ch04 rate limit, Ch29 inference, Ch38 cache
> **Goal**: multi-model routing, token rate-limit/billing, semantic cache, fallback. Contrast with Ch17 business gateway; don’t re-teach GPU.

When they say “design an LLM gateway / model routing layer,” they are not scoring LiteLLM / Portkey SKUs, and they are not asking you to nginx-proxy one provider key and call it done.

**Who calls this API:** product services, chat backends, internal Agents. They only speak one **OpenAI-compatible** \`POST /v1/chat/completions\`. Behind the gateway sit OpenAI, Anthropic, local vLLM — that kind of inference (Ch29).

The **hard part** is three pieces: **routing policy** (how model id / cost / latency pick a backend), **token accounting + rate limit** (TPM / RPM + quota, input/output split), **semantic cache correctness vs hit rate**. Drawing an “AI Gateway” box and then being unable to talk those three is a red flag.

This chapter’s boundary:

- **Rate-limit algorithm / Redis Lua** → already Ch04; here we only talk how to put tokens in the bucket
- **Business REST gateway** (auth, canary, circuit break) → Ch17; this chapter contrasts, doesn’t re-teach
- **GPU, KV cache, TTFT inside the engine** → already Ch29; the gateway **calls** inference, it doesn’t redesign the engine
- **Tools / MCP** → preview Ch33; don’t dump tool protocol onto this whiteboard
- **RAG pipeline / vector engine** → Ch30 / Ch31; semantic cache at most says “might call embedding once”

M5 hard rule: **LLM + Agent infra only. No recommender funnel.** Vendor names are examples of a mechanism at most.`,
    },
    {
      id: "sec-pitch",
      headingEn: "How to answer in the interview (30 seconds)",
      bodyEn: `Don’t open by drawing 20 boxes, and don’t read a hosted-gateway price sheet. Land the scoring signal first: this is an **LLM control plane**, and the hard part is not the logo.

> “This is an **LLM API gateway**, not a Ch17 business REST gateway. Externally **OpenAI-compatible**; \`model\` is the routing key, hitting OpenAI / Anthropic / local vLLM. Rate limit is **TPM + RPM**; quota is token accounting, **input / output split**. Cache defaults to **exact-match**; semantic cache can raise hit rate, but it can return the wrong answer. Primary down → **fallback** to a smaller/cheaper model; everything down → 503. To the user, **SSE** streaming. How GPUs run is Ch29; the gateway does not hold KV.”

How the 4 steps fill in:

${D2}

| Step | What it maps to on this prompt |
|---|---|
| Step 1 clarify | External API vs self-hosted, how many models, route by id / cost / latency, 429 vs queue, can cache be dirty, is quality drop allowed |
| Step 2 high-level | client → LLM GW (router + limiter + cache) → inference; SSE passthrough |
| Step 3 deep dive | ① routing policy + fallback ② TPM/RPM + accounting ③ semantic cache correctness |
| Step 4 wrap-up | 429 storms, silent quality drop, cache serving the wrong answer, stream buffered, observe the actual served model |

**red flag:** answering this as nginx reverse proxy; re-deriving Ch04 token bucket; redesigning the Ch29 engine; opening RAG / recommenders; locking to one vendor; quoting some company’s internal $/token.`,
    },
    {
      id: "sec-clarify",
      headingEn: "Clarifying questions",
      bodyEn: `Drawing a gateway before you asked “how many backends, what happens when you exceed, can answers be dirty” = Jimmy. About 6–8 questions; assume the rest and write the board.

| You ask | Why you ask | Typical assumption (when they say “you pick”) |
|---|---|---|
| External APIs only, or mixed with local inference? | Pure-API prompt is quota + routing; local fallback only exists if you have vLLM | **Hybrid**: cloud default + a local OpenAI-compatible engine |
| How many vendor SDKs must the client speak? | Decides whether you do protocol translation | Externally only **OpenAI-compatible**; Anthropic is translated behind the gateway |
| How do you route? Caller names the model, or gateway policy? | Routing is one of the hard parts | First **model id / alias**; then stack cost, latency, health |
| Over limit: **429** or queue? | Queuing interactive chat blows TTFT | Chat: **sync 429**; offline batch gets a separate enqueue path |
| Semantic cache? What’s the cost of a wrong answer? | Hit rate vs correctness | Default **exact**; FAQ-class can turn semantic on; high-risk paths off |
| Primary model down: is a quality drop OK? Do you tell the caller? | Silent quality drop is a production incident | **Allow fallback** to smaller/cheaper; echo the actual model in the response; metric + alert |
| Streaming? | SSE vs one-shot JSON; can the gateway buffer | **Yes, SSE**; gateway passthrough; never accumulate then flush |

How to say it:

> “I’ll assume OpenAI-compatible externally, several backends including local vLLM. Chat is SSE. Over limit → 429. Cache starts exact. Primary down → smaller model, but we record served model. Does that direction look OK?”`,
    },
    {
      id: "sec-estimate",
      headingEn: "Back-of-the-envelope (don’t fake precision)",
      bodyEn: `This prompt’s back-of-envelope is so the interviewer hears: **chat completions QPS is small; token bandwidth is the bill.** Don’t invent some company’s internal QPS or $/token.

Teaching assumption (write the board): peak **20 QPS** of \`chat/completions\` (a mid-size chat product, not 10k-QPS REST). Each call **2k input + 400 output ≈ 2.4k tokens**.

> RPM = 20 × 60 = **1,200 RPM**. TPM ≈ 20 × 2.4k × 60 ≈ **2.9M TPM**. On the same TPM budget, one 32k long prompt can eat a dozen short chats — so **RPM-only rate limit is a red flag**.

| Quantity | Teaching number | How you open it |
|---|---|---|
| chat QPS | **20** (peak) | Don’t borrow the “10k QPS CRUD” intuition |
| tokens / call | 2k in + 400 out | Long context fills TPM first |
| **RPM** | ~1,200 | Request count; agent inner loops blow this up |
| **TPM** | ~2.9M | Real capacity and money; split input TPM / output TPM |
| SSE bandwidth | 20 × 400 tokens × a few bytes | Usually not the bottleneck; the money is tokens |

input / output **must be estimated separately**: public price lists usually charge more for completion than prompt (the number moves with the model — say “multiply each side by its unit price,” don’t recite one day’s price card as fact). Reserve with \`estimated_input + max_tokens\`; then **settle** on response \`prompt_tokens\` / \`completion_tokens\` (or Anthropic’s \`input_tokens\` / \`output_tokens\`).

Line it up with Ch29: the gateway sees **tokens/minute** and concurrent streams; the engine side is TTFT / GPU. Don’t mix the units.

How to say it:

> “I’ll assume 20 QPS, 2.4k tokens each — about 1200 RPM, a couple million TPM. Rate limit both dimensions. Long prompts fill TPM first; tiny agent calls fill RPM first.”`,
    },
    {
      id: "sec-arch",
      headingEn: "High-level architecture",
      bodyEn: `Get buy-in: **one picture that lands the gateway trio — don’t draw the GPU cluster.** Inference is downstream (Ch29). The gateway is stateless; an L7 LB can sit in front (Ch39).

${D2}

The trio lives in **one stateless LLM GW process**. The diagram is real order: rate-limit first, then cache lookup, miss then route. An L7 LB can sit in front (Ch39).

**This diagram cites**: cache (Ch38), load balancing and statelessness (Ch39), protocols / SSE (Ch40). inference is Ch29’s engine or an external API — **not** part of the gateway. Rate-limit algorithm is Ch04.

One sentence per piece:

| Piece | What it does | How you say it |
|---|---|---|
| **router** | Pick a backend from model alias + policy | OpenAI / Anthropic / local vLLM look the same to the client |
| **limiter** | RPM + TPM + tenant quota | Estimate tokens, then admit; over limit → 429 |
| **cache** | Hit → skip inference | Default exact; semantic is optional and dangerous |

### Contrast with Ch17 business gateway

Ch17 is the **REST product entry**: auth, QPS rate limit, route to microservices, canary, timeout + circuit break. This chapter reuses “one entry, gateway is stateless,” but **the billing unit and the routing key both changed**. One contrast table is enough; don’t re-teach Ch17.

${D2}

| | Ch17 business gateway | This chapter’s LLM gateway |
|---|---|---|
| Routing key | path / host / header | **model id** + cost/latency policy |
| Rate-limit unit | request count (QPS / RPM) | **TPM + RPM**; quota is tokens |
| Cache | occasional HTTP cache | exact prompt; optional **semantic cache** |
| Failure | circuit break, retry, 503 | plus **model fallback** (quality can drop) |
| Protocol | mostly one-shot JSON | chat default **SSE** passthrough |
| Downstream | stateless microservices | stateful GPU or external LLM API |

Step 2 can volunteer endpoints (bonus; no schema needed):

- \`POST /v1/chat/completions\` (**2026 default lingua franca**; \`stream=true\` is SSE)
- \`POST /v1/embeddings\` (semantic cache or the caller’s own use; not a RAG pipeline)
- \`GET /v1/models\` (alias list)
- optional \`GET /metrics\` (TPM usage, 429 rate, fallback rate, cache hit, actual served model)

### Streaming: what you say at the gateway layer

Chat defaults to **SSE** (OpenAI / Anthropic / Gemini public APIs all look like this): client POSTs once, server pushes tokens one way. **WebSocket** is for truly bidirectional cases (mid-stream interrupt, voice — preview Ch33 / deep-read Ch40). Don’t re-teach the protocol chapter here.

The gateway hard part is **passthrough, don’t buffer**: if a proxy or gateway accumulates \`text/event-stream\` and then flushes, TTFT is immediately dead. Client cancel must **abort upstream**, or you keep burning tokens.

How to say it:

> “The client only speaks OpenAI-compatible. The gateway routes, rate-limits by token, checks cache, then forwards to inference. Streams are SSE passthrough. The gap vs Ch17 is token accounting and the model router. If that direction is OK, I’ll dig into routing, accounting, and cache.”`,
    },
    {
      id: "sec-route",
      headingEn: "Deep dive ①: routing policy and fallback",
      bodyEn: `2026 interview default: one **OpenAI-compatible** schema externally, and the **\`model\` field is the routing key**. The gateway maps an alias to a concrete deployment (some vendor API, some Azure/Bedrock region, some local vLLM pool). Don’t let every product service ship three SDKs — that’s over-engineering.

Policies stack on top of id; they are not a three-way mutex. Hit the alias first, then pick inside the candidate pool by cost / latency / health.

${D2}

| Policy | What it does | When you use it | Pitfall |
|---|---|---|---|
| **model id / alias** | \`gpt-class\` → a concrete deployment | **Default first layer**; caller stays stable, backend can swap | If alias ≠ real model, say so in the response |
| **cost** | Same-class work goes to the cheaper candidate | Tight quota, batch, internal tools | Quality cliff; don’t silently swap a reasoning prompt onto a small model |
| **latency / least-busy** | Pick the pool with recent low TTFT, TPM not full | Multi-replica, multi-region, multi-key | Needs health checks; probes are not load |

Local vLLM (or a sibling engine) also speaks OpenAI-compatible: to the gateway it’s just another base URL. **Don’t re-teach how the engine pages KV at this layer.**

### Fallback: primary → smaller/cheaper → 503

After primary 429 / 5xx / timeout, try the next model on a list — don’t hammer the same deployment until TPM is gone. Public gateways (LiteLLM Router-class) are an **ordered list**: primary first, then a fallback group.

${D2}

Three rules that score:

1. **Keep the chain short.** Each hop times \`num_retries\` and one failure becomes a string of paid empty calls. Default: **one short retry + one fallback**. A third hop is almost always over-engineering.
2. **Quality drop cannot be silent.** Fallback success is still 200, but the answer can be clearly worse. Logs and response metadata must carry the **actual served model**; alert on fallback rate. Quality-sensitive paths (citations, structured output) would rather 503 than secretly swap a small model.
3. **Branch by error class.** Context too long must not land on a smaller-window model and get hard-truncated. 429 is a good reason to swap key / vendor / smaller model. A content-policy reject is not “try the same model again.”

| | Do | Don’t |
|---|---|---|
| 5xx / timeout | Swap deployment or a smaller model | Hammer the same 5xx with no jitter |
| Upstream 429 | Swap key, swap vendor, or this gateway 429s first | Immediately replay the same call as-is |
| Everything down | **503** + Retry-After | Unbounded queue that kills TTFT |

How to say it:

> “Routing looks at the model alias first, then picks in the pool by cost and latency. Fallback is a short ordered chain; success still records served model. Everything down → 503. Don’t sell fallback as free HA.”`,
    },
    {
      id: "sec-limit",
      headingEn: "Deep dive ②: token accounting, rate limit, quota",
      bodyEn: `How you implement it — token bucket, sliding window, **Redis + Lua**, multi-instance races — is already **Ch04**. This chapter does not re-derive the formula. The hard part here is: **what sits in the bucket, over-limit is 429 or a queue, and how the books line up with streaming.**

Public LLM APIs (OpenAI / Anthropic-class) rate-limit **RPM and TPM** together; response headers carry remaining requests / remaining tokens. Your gateway adds another layer on **tenant / API key / model**, so one team doesn’t turn a shared upstream into a 429 storm.

| Dimension | What you count | Who blows first |
|---|---|---|
| **RPM** | HTTP completion count | agent inner loops, short classify calls |
| **TPM** | input + output tokens (split if you can) | long RAG prompts, large \`max_tokens\` |
| **Concurrent streams** | SSE connections open at once | chat holds the socket; this is not RPM |
| **Quota** | daily/monthly token budget (tenant or key) | end of month sudden 402/403, not 429 |

Rate limit ≠ quota. Rate limit is speed inside a sliding window; quota is a cumulative budget. Two buckets, two reject codes — don’t mix them.

### Reserve then settle

Before admit, estimate \`input + max_tokens\` with a tokenizer or a conservative heuristic. Not enough → **this gateway 429s**. Try not to ship traffic upstream and eat their 429 — upstream quota is shared and more expensive.

After the stream ends, write back usage: over-reserved → refund the hold; under-reserved → charge the rest. **SSE usage often lives in the last frame**; if budget checks only look mid-stream, they get bypassed — a pit public gateways have hit; naming it in the interview scores.

**Separate unit prices, separate buckets** for input / output is 2026 default talk: on the same 2k+400 call, money and TPM pressure may sit mostly on one side. Don’t paper over it with “average 2k tokens × one price.”

### 429 vs queue

| | Sync 429 reject | Queue |
|---|---|---|
| When | **Interactive chat** (default) | Offline batch, delay-tolerant summaries |
| Why | Caller is still holding SSE; a long queue blows TTFT first | The job has a deadline; overload is brief |
| Queue needs | — | **Bounded** + timeout; full still 429/503 |

For a sync caller, an unbounded queue turns a rate problem into a memory problem. Interactive path: **this gateway 429 + Retry-After**. If you need a queue, open a separate batch entry — don’t share one queue with chat.

Ch04’s “over limit defaults to 429” still holds; the cost just changed from “1 request” to “estimated tokens.” Redis keys split as \`tenant:model:rpm\` and \`tenant:model:tpm\`; Lua still deducts atomically once.

How to say it:

> “Ch04’s Redis Lua still sits here; cost is tokens. Two buckets, RPM and TPM; input/output accounted separately. Chat over limit → 429; don’t queue SSE inside the gateway. Reserve, then settle on usage.”`,
    },
    {
      id: "sec-cache",
      headingEn: "Deep dive ③: semantic cache vs exact cache",
      bodyEn: `The gateway caches the **whole model answer** (or the concatenated stream), not KV / prefix pages inside the Ch29 engine. Mental model is Ch38 (cache-aside, TTL, invalidation). The prompt-specific trade-off is: **an approximate hit can return the wrong answer**.

**2026 default: exact-match first; semantic cache is optional, and dangerous by default.** Leading with semantic cache and never talking correctness is a red flag.

${D2}

| | exact-match | semantic cache |
|---|---|---|
| Key | hash(model + temperature + full messages + tenant) | Those hard fields **exactly equal**; embedding nearest-neighbor only on the **last user turn** |
| Hit | Byte-for-byte identical | Paraphrase / synonym questions can hit |
| Correctness | High (can still be **stale**: knowledge moved) | Loosen the threshold and you answer the wrong question |
| Cost | Near zero; natural-language hit rate is often low | Every miss pays an **embedding** first |
| When on | Internal tools, identical prompt replay, eval replay | FAQ, doc Q&A, occasional dirty is OK |
| When off | — | Personalized, real-time data, high-risk, tool calls (Ch33) |

Semantic cache is **not** Ch30 RAG: it does not retrieve a knowledge base then generate. It only asks “have we answered a near-meaning question before.” When you need vectors, call an embedding API or this gateway’s embeddings endpoint — **don’t draw an HNSW cluster on this picture** (that engine is Ch31).

The threshold is a whole engineering decision. Public discussion often starts cosine **0.9+** — lower looks great on hit rate, wrong answers rise. Per-route thresholds (FAQ a bit looser, transaction copy stricter) are more serious than one global magic number.

Hard fields must be exact: model, system prompt, multi-turn history, temperature, tenant. Similarity only on the last user message, so “the same human sentence, a totally different system setup” does not collapse. That’s the right default.

### miss path (streaming)

${D2}

**This diagram cites**: cache (Ch38); SSE passthrough is Ch40. In semantic mode, lookup may embed internally; the diagram does not add a separate actor.

Invalidation:

- **TTL**: short TTL buys freshness, hit rate drops; long TTL saves money, a changed FAQ still serves the old answer
- **Version in the key**: system prompt / tool defs / doc version go into the hash; one change invalidates all
- Don’t treat semantic cache as a “knowledge-base update channel” — that’s RAG freshness (Ch30), not gateway cache

On a hit: if the original request wanted SSE, still push the cached answer as SSE (or explicitly degrade to one-shot JSON). Don’t leave the client stuck on \`stream=true\` waiting for the first packet.

How to say it:

> “Default exact cache; key includes model and tenant. Semantic cache trades embedding nearest-neighbor for hit rate; the threshold is the correctness knob. High-risk paths off. It is not RAG, and it is not prefix cache on the GPU.”`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs “just a reverse proxy”",
      bodyEn: `<details>
<summary>nginx reverse-proxying one provider key — how you answer now</summary>

Xu-generation books have **no** LLM-gateway chapter. Early engineering default was often: the app talks to OpenAI directly, or nginx / Envoy in front, one API key, QPS rate limit, no accounting, no fallback. That’s lab wiring. **It is not 2026 body copy.**

| Then / early engineering | How you answer now |
|---|---|
| One vendor SDK, or nginx reverse proxy | **OpenAI-compatible** single entry; several backends + local vLLM behind |
| QPS only | **TPM + RPM** + tenant token quota; input/output split |
| Over limit: pass the upstream 429 through | This gateway blocks first; interactive 429, batch may queue |
| No cache, or HTTP GET cache only | exact prompt cache; semantic cache optional and you talk correctness |
| Upstream down → 502 | **Short fallback chain** to smaller/cheaper; everything down → 503; record served model |
| One-shot JSON | Chat **SSE passthrough**; gateway must not buffer |
| Answering this as Ch17 | One contrast table: token accounting + model routing + semantic cache |

Body first answer uses this set. The fold only stops you from treating “reverse proxy + one key” as the final draft.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **Isn’t this just an API gateway?** → Auth / routing / circuit break are isomorphic with Ch17. What’s LLM-specific is **token accounting, model routing, semantic cache, quality-drop fallback**. One contrast table and you’re done.
2. **Why not rate-limit on QPS?** → Tokens per request can differ 100×. You need RPM and TPM; long prompts hit TPM, inner loops hit RPM. Algorithm is Ch04.
3. **Why not queue when over limit?** → Chat is holding SSE; a long queue blows TTFT first. Default 429; batch gets a separate entry.
4. **Isn’t semantic cache free money?** → Hit rate up, correctness down. Threshold, TTL, hard fields exact. High-risk off. Not RAG.
5. **Relation to engine prefix cache?** → Prefix cache speeds **prefill** (Ch29). Gateway cache is the **answer**. Two layers; don’t mix them.
6. **Why alert on a successful fallback?** → 200 may have come from a worse model. No served model recorded = silent quality drop.
7. **Why not ship three SDKs in every service?** → Keys, rate limit, accounting, fallback all drift. One gateway; product only speaks one schema.
8. **Why can’t the gateway buffer SSE a bit?** → Accumulate-then-flush kills TTFT. Passthrough; cancel must abort upstream.
9. **Why not WebSocket?** → One-way tokens: SSE is enough, and it rides existing HTTP/proxies. Bidirectional → WS (Ch40 / Ch33).
10. **Tool calls / MCP?** → Next chapter, Ch33. This gateway only goes as far as chat completions and model backends.`,
    },
    {
      id: "sec-next",
      headingEn: "What's next",
      bodyEn: `Close the page. Walk the 30-second open + two pictures (the trio chain, the Ch17 contrast). If you can explain **how you route, how TPM/RPM rate-limit, why semantic cache is dangerous, why fallback cannot be silent**, you pass.

Next prompt preview: **Agent tool platform** (tool gateway, MCP, timeout/retry/idempotency, permission guardrails). This chapter only lands chat on a model; don’t write the tool protocol early.

Self-check: left column assumptions (hybrid backends, 20 QPS, 429, exact default), middle client → GW → inference, right three deep-dive trade-offs.`,
    },
  ],
  reviewMdEn: `# Ch32 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | Design an LLM API gateway — 30-second open? | OpenAI-compatible entry; model routes to several backends / local vLLM; TPM+RPM; exact cache default; fallback to a smaller model; SSE passthrough. Not Ch17. |
| 2 | What’s the hard part on this prompt? | ① routing policy ② token accounting + rate limit ③ semantic cache correctness vs hit rate. Not GPU, not RAG. |
| 3 | What should you clarify? | External vs hybrid, routing key, 429 vs queue, can cache be dirty, is quality drop visible, streaming. |
| 4 | Gap vs Ch17? | Ch17: auth, QPS, canary, circuit break. This chapter: token accounting, model routing, semantic cache, model fallback. |
| 5 | 2026 default external protocol? | **OpenAI-compatible** \`/v1/chat/completions\`. Anthropic-class is translated behind the gateway. |
| 6 | Three routing layers? | Model alias first, then pick in the pool by cost / latency / health. Don’t ship three SDKs per service. |
| 7 | Teaching 20 QPS → how much RPM/TPM? | 2.4k tokens each → ~1200 RPM, ~2.9M TPM. Long prompts fill TPM first. |
| 8 | Why split input/output accounting? | Unit price and TPM pressure differ; reserve input+max_tokens, settle on usage. |
| 9 | 429 vs queue? | Chat defaults to 429. Queue only for deadline-bearing batch, and it must be bounded. |
| 10 | exact vs semantic cache? | exact: hash, high correctness, low hit rate. semantic: embedding nearest-neighbor, high hit rate, can return the wrong answer. |
| 11 | Semantic cache key gotchas? | model / system / history / temperature / tenant **exact**; similarity only on the last user turn. |
| 12 | Fallback red flag? | Long chain × retries; 200 success that silently swapped a small model; no served model recorded. |
| 13 | Every backend down? | **503** + Retry-After; no unbounded queue. |
| 14 | SSE vs WS? | One-way tokens → SSE passthrough. Bidirectional (interrupt / tools) → WS. Gateway must not buffer. |
| 15 | Boundary vs Ch29 / Ch33? | Ch29 is the inference engine. This chapter calls it. Tools/MCP is Ch33. |`,
});
