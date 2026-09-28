import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch29",
  titleEn: "LLM inference service",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 50–70 min ｜ **Prereq**: Ch01 4-step method; back-of-envelope (Ch03) makes this smoother
> **Goal**: whiteboard the **single-request inference path + GPU serving**: GPU memory, scheduling, streaming, scale-out. **Skip** RAG, vector DBs, recommenders, training platforms.

This prompt is common now. When they say “design an LLM inference service,” they are not scoring model internals, and they are not asking you to open a cloud GPU price sheet.

The **hard part**: GPUs are expensive **and** stateful (KV cache lives on the card); request lengths vary; interactive has to feel fast, the cluster has to stay full. Almost every optimization sits around **GPU memory** and **throughput**.

This chapter’s boundary (later chapters each own a slice; here you only point):

- **RAG / chunking / citations** → preview Ch30; not the star of this chapter
- **Vector engine** → preview Ch31
- **Multi-model routing, semantic cache, billing** → gateway deep dive preview Ch32; this chapter’s gateway only keeps auth / rate limit / enqueue
- **Model registry, training, multi-tenant platform** → preview Ch35

M5 hard rule: **LLM + Agent infra only. No recommender funnel.**`,
    },
    {
      id: "sec-pitch",
      headingEn: "How to answer in the interview (30 seconds)",
      bodyEn: `Don’t open by drawing 20 boxes. Land the scoring signal first: you know where the money is, what the optimizations wrap around, and what the engine vs the queue in front each do.

> “The expensive part is **GPU**. Every optimization sits around **GPU memory** and **throughput**. Engine layer: **PagedAttention** for KV cache, **continuous batching** to pack the batch dynamically. In front: a queue + rate limit — **token bucket counted in tokens**, not request count. Stream to the user so **TTFT** feels short. Split the SLO into TTFT and TPS; don’t report a single QPS.”

How the 4 steps fill in:

| Step | What it maps to on this prompt |
|---|---|
| Step 1 clarify | Self-host vs call an API, TTFT vs total generation time, context, multi-model / multi-LoRA, streaming or not, QPS vs concurrent sessions |
| Step 2 high-level | client → gateway → scheduler/queue → GPU worker (inference engine) → stream back; weights in object storage, loaded once, resident in GPU memory |
| Step 3 deep dive | ① KV cache + PagedAttention ② continuous batching ③ prefill/decode disaggregation + scale-out |
| Step 4 wrap-up | GPU-memory OOM, queueing, engine-down failover, observe TTFT / TPS / queue depth |

**red flag:** opening with RAG retrieval, drawing a recommender funnel, quoting some company’s internal QPS, or treating K8s YAML as architecture. That’s off-topic.

Gateway details (multi-model routing, semantic cache, degrade): one sentence in the loop — “there’s a routing / billing layer in front; we can open that separately” — is enough. The full LLM gateway is a later chapter.`,
    },
    {
      id: "sec-clarify",
      headingEn: "Clarifying questions",
      bodyEn: `Drawing a vLLM cluster before you asked = Jimmy. About 5–7 questions; assume the rest and write the board.

| You ask | Why you ask | Typical assumption (when they say “you pick”) |
|---|---|---|
| Self-host an open model, or call an external API? | Self-host is where you get a GPU pool / KV; an API prompt becomes gateway + quota | Self-host, Llama-class size |
| Latency SLO: **TTFT**, or whole-generation time? | Interactive vs offline summary; the architecture forks | Chat: TTFT short; total time of a few seconds is OK |
| How long is context? Input / output tokens? | KV cache grows with length; prefill cost grows too | Input 2k–8k, output a few hundred |
| How many models? Multi-LoRA? | GPU-memory layout; whether you route to different workers | One model first; multi-LoRA, just point at it |
| Streaming? | SSE vs one-shot JSON on a short connection | Yes, chat default |
| Scale in **QPS** or **concurrent sessions**? | One session can occupy the GPU for tens of seconds; QPS lies | Give concurrent sessions + a target TPS |

Don’t mix the two latency numbers:

${D2}

**TTFT** (time to first token) = how long until the user sees the first character. Almost entirely **prefill** (one forward pass over the whole prompt, write KV). **TPS** (tokens per second) has two layers: the per-user token rate (reciprocal of TPOT / ITL), and cluster-wide throughput (cost). Interview open: **interactive looks at TTFT; capacity looks at TPS; they trade off; there is no one knob that’s optimal for both.**

How to say it:

> “I’ll assume self-hosted chat: streaming, TTFT first, medium context, one model to start. Scale in concurrent sessions, not raw QPS. Does that direction look OK?”`,
    },
    {
      id: "sec-estimate",
      headingEn: "Back-of-the-envelope (don’t fake precision)",
      bodyEn: `This prompt’s back-of-envelope is **not byte-precise**. The interviewer is listening for: you know GPU memory is two bills, KV grows with concurrency and context, and the rate-limit unit is tokens.

### Weight GPU memory

Order of magnitude (public, mental math): params × bytes per param.

| Precision | Per param | ~7B weights | ~70B weights |
|---|---|---|---|
| FP16 / BF16 | ~2 B | ~14 GB | ~140 GB (multi-GPU) |
| FP8 | ~1 B | ~7 GB | ~70 GB |
| INT4 weight quant (AWQ etc.) | ~0.5 B order | another cut | still leave room for KV |

Quantization (**AWQ** / **FP8**): mention it. What you save is **weights**; KV cache may still be FP16/FP8, and at long context that’s the bulk. Don’t tell the story as “quantize so the model is small and you never OOM.”

### KV cache is the concurrency ceiling

During decode every new token reads historical K/V. Without a cache you’d recompute attention over the whole sequence — so you must cache. It grows with **layers × KV heads × head dim × seq length × precision × concurrency**.

Public anchor (vLLM 2023 blog, not some company’s internals): LLaMA-13B **per sequence** KV can hit **~1.7 GB**; if existing systems pre-reserve contiguous max-length blocks, fragmentation + over-reservation wastes **60%–80%** of GPU memory. So “the card isn’t compute-full and you already OOM” is common.

How to say it:

> “Weights are a fixed lease; KV is a variable lease. Longer context, bigger batch, KV grows linearly. I won’t quote an exact GB, but concurrency first asks whether KV fits, then compute.”

### Don’t size traffic in raw QPS

One request may prefill thousands of tokens, decode hundreds, occupy the GPU for several seconds. More useful:

- **concurrent sessions** (requests holding KV at once)
- **input token/s** (prefill pressure) and **output token/s** (decode pressure)
- rate limit: **token bucket in tokens/minute** (can split input/output), not “HTTP requests per second”

Don’t invent “some company does 100k QPS.” State assumptions, write the board, talk order of magnitude. That’s enough.`,
    },
    {
      id: "sec-arch",
      headingEn: "High-level architecture",
      bodyEn: `Draw the path first; get buy-in, then dig into the engine. Gateway here only keeps “auth, token rate limit, pick a model pool”; routing / billing / semantic cache go to the LLM-gateway chapter.

${D2}

**This diagram cites**: load balancing and stateless (Ch39), protocol choices / SSE (Ch40), resilience and queues (Ch42). Weight repo and cluster scheduling are platform — preview Ch35.

One sentence per layer:

| Layer | What it does | How you say it |
|---|---|---|
| client | send prompt, receive a token stream | chat default \`stream=true\` |
| gateway | auth, token rate limit, pick a pool, timeout | stateless, scale horizontally; **don’t** store KV here |
| scheduler / queue | only enter the engine if there’s a slot; overload → queue or reject | loading a model onto GPU is slow; you cannot scale like a stateless web in seconds |
| GPU worker | inference engine: PagedAttention + continuous batching | stateful: KV lives on the card |
| storage | weights in object storage, load into GPU memory at start | hot path does not read disk |

Step 2 can volunteer 3 endpoints (bonus; no schema needed):

- \`POST /v1/chat/completions\` (OpenAI-compatible is the 2026 default line)
- \`GET /health\` (can the engine still take requests)
- optional \`GET /metrics\` (TTFT, TPS, queue depth, KV occupancy)

### Why stream

Users don’t wait for the whole generation. First token out, the feel goes from “stuck” to “it’s writing.” **TTFT becomes the product experience via streaming**; total time can still be seconds.

Protocol: **SSE** for one-way server-push of tokens; bidirectional (Agent tool interrupts later) then **WebSocket**. How you pick the protocol and how you reconnect is Ch40 — this chapter only needs **why you stream**.

${D2}

**This diagram cites**: protocol choices (Ch40). Gateway is stateless, engine is stateful — don’t think failover like a normal stateless service (Ch39 / Ch42).

How to say it:

> “Client to gateway is stateless; gateway token-rate-limits then queues; GPU worker runs the engine and SSE-pushes back. Weights load once from object storage. KV only lives on the worker, so scale-out and failover are both slow and painful. If that direction is OK, I’ll dig into GPU memory and packing the batch.”`,
    },
    {
      id: "sec-kv",
      headingEn: "Deep dive ①: KV cache and PagedAttention",
      bodyEn: `This is the mechanism you should go deepest on. When they ask “why OOM / why did switching engines 2× throughput,” the answer is almost always here.

### Why you must have KV cache

Autoregressive decode: **each step only computes 1 new token**, but attention needs K/V of every previous token. Keep already-computed K/V in GPU memory and decode goes from “quadratic recompute over the whole sequence” to “read cache + compute this step.”

Cost: GPU memory grows with sequence. Context 4k → 32k, **same concurrency**, KV can differ by an order of magnitude. That’s the direct answer to “how does GPU memory grow with context” — approximately linear (attention compute has another complexity; on the interview grab the linear GPU-memory bill first).

### Why contiguous reservation fragments

Early approach: reserve one contiguous KV block per request at **max sequence length**. Actual output lengths vary wildly, so:

- **internal fragmentation**: reserved 4k, used 200
- **external fragmentation**: free total is enough, no contiguous large block

vLLM public conclusion: that waste can hit **60%–80%**. Compute still idle, GPU memory blows first, the batch can’t grow, throughput can’t grow.

### What PagedAttention is doing

Public source: Kwon et al., SOSP 2023; the vLLM blog analogizes KV to OS virtual memory.

- Split each sequence’s KV into **fixed-size pages / blocks** (one page holds K/V for a fixed number of tokens)
- Logically contiguous, physically can be scattered; mapped by a **block table** (same mental model as a process page table)
- **Allocate on demand**: one more decode step, one more page; done → return to the free pool immediately
- Waste is mostly the **last page not full** — the blog says actual waste can go **under 4%**
- Same prompt prefix, parallel sampling, can **share physical pages** (copy-on-write)

${D2}

**This diagram cites**: cache mental model (Ch38). KV is the working set on the GPU, not a Redis sidecar cache; but “over-reserve / fragmentation / share the prefix” is the same class of intuition as cache.

How to say it:

> “PagedAttention is not a new Transformer. It’s paged allocation of KV. Contiguous reservation fragments GPU memory, so the batch can’t grow. Paging is what makes continuous batching’s ‘enter and leave anytime’ cheap.”

### prefix caching

vLLM’s Automatic Prefix Caching: for a new request, if the token prefix hashes match already-computed blocks, **skip that prefill**, reuse the KV pages. System prompts, multi-turn history, the same doc asked repeatedly — that’s free TTFT lunch.

Invalidation (high-frequency follow-up):

1. **Prefix bytes changed** — one space in the system prompt, hash miss, recompute the whole thing
2. **Pages evicted** — GPU memory tight, LRU / policy eviction, hit becomes miss
3. **Model or LoRA changed** — different weights, old KV unusable
4. It only speeds **prefill**, doesn’t shorten stepwise decode (official docs state this limit)

prefix cache ≠ “semantic cache (cache the whole answer).” The latter is gateway-layer — preview Ch32.`,
    },
    {
      id: "sec-batch",
      headingEn: "Deep dive ②: continuous batching vs static batch",
      bodyEn: `GPUs fill up via **batch**. But LLM output length is a random variable: someone finishes in 20 tokens, someone in 2000.

${D2}

**Static batch (static / request-level batching):** wait until N requests, run until the slowest finishes. Short requests idle alongside long ones; p50/p99 both dragged by the tail. Early serving and “fixed-batch offline inference” looked like this.

**continuous batching** (also iteration-level / in-flight batching): public origin is Orca (OSDI 2022); vLLM made it the default scheduler. After every **decode step**, the scheduler re-looks at the queue:

- Sequences that just hit EOS exit immediately, KV pages returned
- New waiting requests can take the slot immediately (prefill first, then join the decode batch)
- Batch composition changes every step; no right-padding until everyone is aligned

Anyscale’s public survey of continuous batching, vLLM vs HF Transformers / TGI throughput numbers (the blog said tens of × vs HF, several × vs TGI at the time) — interview use: “order-of-magnitude lift, don’t memorize some day’s chart.”

It pairs with PagedAttention: batch composition changes, lengths change, contiguous large-block allocation becomes a disaster; paging makes enter/leave cheap. vLLM’s contribution is landing both, not just paging in a paper.

| | static | continuous |
|---|---|---|
| Scheduling grain | whole request | each token step |
| GPU idle | tied to the longest sequence | empty slots fill immediately |
| GPU-memory allocation | large reserved blocks get harder | must allocate in fragments |
| Latency | queue until full + ride along | queue becomes “wait one compute step” |

**Is a bigger batch always better?** No. Bigger batch → higher compute utilization, higher cluster TPS; but each step is slower, **per-user TPS / TPOT gets worse**, and TTFT can also suffer if prefills pile up. Correct line: under the SLO, open the batch to the max GPU memory and latency still accept. That’s a trade-off, not “bigger scores higher.”

chunked prefill (slice a long prompt, interleave with decode) is a **same-card colocate** relief, so one huge prefill doesn’t freeze every decode. It is not P/D disaggregation, but you can use it as a one-sentence bridge.`,
    },
    {
      id: "sec-pd",
      headingEn: "Deep dive ③: prefill/decode disaggregation and scaling",
      bodyEn: `### Why the two phases fight

| Phase | Work | Hardware temperament | Matching SLO |
|---|---|---|---|
| **prefill** | eat the whole prompt once, write KV | leans **compute-bound** | **TTFT** |
| **decode** | emit one token at a time, reread weights + KV | leans **memory-bound** | **TPS / TPOT** |

On the same GPU (colocate + continuous batching): a new large prefill either interrupts people who are decoding, or shares an iteration with decode — public systems papers call this **prefill–decode interference**. You can only prioritize TTFT or TPOT, or over-provision GPU to save both.

### What disaggregation is

Split a **prefill pool** and a **decode pool**: the prefill worker computes KV, **moves it** over a high-speed interconnect to the decode worker, then streams tokens. The two pools can have different parallelism, different card counts, scale independently.

${D2}

**This diagram cites**: resilience and queues (Ch42). Moving KV depends on datacenter fabric, not something ordinary HTTP retry can paper over.

Public breadcrumbs (2024–2026, speak them, don’t invent internal numbers):

- **DistServe** (OSDI 2024): split is for **goodput** (effective throughput that meets both TTFT and TPOT), not raw TPS
- **Splitwise** (Microsoft): phase split, can even use heterogeneous hardware
- **2025**: NVIDIA **Dynamo** (GTC 2025) treats P/D workers as first-class; vLLM / SGLang have disagg paths; Hao AI Lab recap wrote “from 2025, large-scale serving stacks treat disaggregation as a playbook”
- Counterexample you should also be able to say: Dynamo community publicly discussed **splitting is not always faster** — prefill pool too small, KV transfer is bad, or the load doesn’t actually interfere: colocate may be better

**How to place it in a 2026 interview:** first picture is still “gateway + queue + engine with PagedAttention.” When they ask scale, dual SLO, long context, volunteer **prefill/decode disaggregation as a bonus / large-scale default direction**. Don’t say “every company must split from day one of tiny traffic.” Small cluster: colocate + continuous batching + optional chunked prefill is still the correct first answer.

### Scaling, queueing, batch size vs latency SLO

GPU workers are **not stateless web**. Loading 70B-class weights is often minutes; scale-out cannot catch a spike. Playbook:

${D2}

**This diagram cites**: resilience, queues, circuit breakers (Ch42); what’s stateless is the gateway, not the engine (Ch39).

| Lever | What it does | Pitfall |
|---|---|---|
| Queue | smooth spikes, protect in-flight sessions | a long queue blows TTFT first; you need timeout and 429 |
| Cap concurrency / batch size | hold TTFT / TPOT SLO | cluster TPS drops, cost gets worse |
| Warm GPU pool | scale-out has cards to add | an idle pool still burns money; cold start is still slow |
| Scale P/D pools separately | TTFT tight → add prefill; token rate slow → add decode | ops get harder; you have to move KV |

wrap-up spoken:

> “I scale a GPU pool, not Pods in seconds. Spike first: queue and shrink the batch; SLO broken, then add cards. The usual four metrics become this prompt’s version: TTFT, TPS, queue depth, KV occupancy.”`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs the book",
      bodyEn: `<details>
<summary>2020 books had a blank / early fixed batch — how you answer now</summary>

Alex Xu–generation system design books have **almost no** LLM serving. The notes’ “keep learning” list is a few lines of KV / PagedAttention / continuous batching — not a 2026 final draft.

| Then / early engineering | How you answer now |
|---|---|
| No such prompt, or treating “call \`generate()\`” as a service | Treat it as a stateful GPU system: queue, GPU memory, streaming, split SLOs |
| Static batch, contiguous KV reserved at max length | **PagedAttention** + **continuous batching** is the open-source engine default line (vLLM family) |
| Only report QPS, only report param count | Report **TTFT vs TPS**, concurrent sessions, tokens/minute |
| One-shot JSON response | Chat default **SSE streaming** (protocol details Ch40) |
| 2023–24 papers’ P/D split still looks like research | **2025–26 large-scale stack bonus** (DistServe / Dynamo / first-class in the engine); tiny traffic does not split on picture one |
| Quantization as mysticism | AWQ / FP8 **mention it**: saves weight GPU memory; KV and scheduling are still there |

Body first answer uses this set. The fold only stops you from treating “fixed-batch offline scripts” as the production default.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **Context gets longer — how does GPU memory grow?** → KV grows approximately linearly with seq length × concurrency; weights don’t. First ask whether KV fits, then talk compute.
2. **Why OOM?** → Not “the model is 7B so a 16GB card must work.” Weights + activations + **KV × concurrency**; fragmentation (no paging) lets you blow up at low utilization.
3. **Is a bigger batch always better?** → No. Cluster TPS goes up; per-request TPOT / TTFT usually go down. Cap by SLO.
4. **When does prefix cache miss?** → Prefix changed, pages evicted, model / LoRA changed. Helps prefill only, not decode.
5. **Engine dies — how do you failover?** → KV is on that card, **this generation is gone**. Gateway drops SSE; client retries (maybe a different worker, maybe recompute prefill). Don’t say “silent cut like a stateless API.” Health checks + send new traffic to live replicas; prefix cache usually isn’t on the other card either.
6. **Why not rate-limit by QPS?** → One request’s tokens can differ 100×. token bucket in tokens (can split input/output).
7. **Must you P/D-split from picture one?** → Tiny traffic: colocate is right; dual SLO + large scale, then split. Splitting also costs KV transfer and ops complexity.
8. **Multi-LoRA / multi-model?** → Point at it: you may need separate pools or LoRA hot-load; the GPU-memory bill gets messier. Deep dive is the platform chapter — don’t stuff training and recommenders into this prompt.`,
    },
    {
      id: "sec-next",
      headingEn: "What's next",
      bodyEn: `Close the page. Walk the 30-second open + four-layer diagram. If you can explain **why KV occupies GPU memory, why paging lets you pack a bigger batch, why TTFT / TPS cannot both be cranked on the same knob**, you pass.

Next prompt preview: **RAG backend** (retrieve + stitch the prompt + then walk this chapter’s inference path). Vector engine, LLM gateway, training platform are still later — don’t write them here.

Self-check: left column assumptions (model, TTFT, context, concurrency), middle four-layer diagram, right three deep-dive trade-offs.`,
    },
  ],
  reviewMdEn: `# Ch29 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | Design an LLM inference service — 30-second open? | Expensive part is GPU; optimizations sit around GPU memory and throughput; PagedAttention + continuous batching; token rate limit + queue in front; stream to cut perceived TTFT. |
| 2 | What’s the hard part on this prompt? | KV GPU memory and scheduling (pack the batch without blowing latency). Not microservice count, not RAG. |
| 3 | What should you clarify? | Self-host vs API, TTFT vs total time, context, multi-model / LoRA, streaming, QPS vs concurrent sessions. |
| 4 | Two GPU-memory bills? | Weights ≈ params × precision; KV grows with concurrency and context — often the bulk at long context. |
| 5 | Why must you have KV cache? | Every decode step needs historical K/V; without a cache you’d recompute attention over the whole sequence. |
| 6 | What does PagedAttention solve? | Page-allocate KV, logically contiguous, physically scattered; cuts the 60%–80%-class waste of contiguous reservation, so the batch can grow. |
| 7 | continuous batching vs static batch? | Static waits until full, short requests idle; continuous re-packs the batch every decode step, done sequences yield immediately. |
| 8 | Is a bigger batch always better? | No. Cluster TPS up, TTFT / TPOT usually worse. Cap by SLO. |
| 9 | TTFT vs TPS? | TTFT ≈ prefill / how it feels; TPS ≈ decode throughput / cost. Interactive and capacity are not the same knob. |
| 10 | Why stream? | First token out, TTFT becomes the experience; SSE / WS protocol depth is Ch40. |
| 11 | Rate-limit by what? | token bucket in tokens (can split input/output), not raw QPS. |
| 12 | When does prefix cache miss? | Prefix changed, pages evicted, model / LoRA changed; only speeds prefill. |
| 13 | Why does longer context OOM easily? | KV grows approximately linearly; plus fragmentation (no paging) and concurrency, you blow up before weights change. |
| 14 | Engine dies — what then? | In-flight KV is gone, the stream drops; gateway has the client retry another replica. Not silent failover. |
| 15 | When do you talk P/D disaggregation? | Bonus when large-scale and you must hold TTFT and TPOT together; tiny traffic: colocate + continuous batching is still picture one. |`,
});
