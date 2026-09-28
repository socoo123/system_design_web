import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch35",
  titleEn: "LLM infrastructure",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 50–70 min ｜ **Prereq**: single-request inference is Ch29; gateway is Ch32
> **Goal**: model registry, GPU scheduling, canary/rollback, multi-tenant. This chapter is the **platform**. Don’t re-teach PagedAttention.

When they say “design an LLM platform / model infrastructure / how do you manage GPUs and model versions,” they are not scoring another walkthrough of decode on one card, and they are not asking for an accelerator price sheet.

**Who hosts whom:** the **Ch32** gateway sends traffic in by \`model\` alias. This chapter is the **platform** behind that: which immutable versions sit in the registry, which cards the scheduler packs into a pool, and a fleet of **Ch29 workers** running in that pool. How the engine pages KV and how continuous batching works is already Ch29 — here you treat those workers as a **stateful replica fleet**.

The **hard part** is three pieces: **model versions / registry** (weights immutable, aliases switchable, LoRA one sentence), **GPU scheduling + cluster-level VRAM / batch policy** (binpack vs spread; KV hit and batch quotas are scheduling policy, not kernel), **multi-tenant isolation + canary / rollback** (quota, noisy neighbor, data isolation; new weights must be able to gray and pull back). Drawing a “GPU cluster” box and then being unable to talk those three is a red flag.

This chapter’s boundary:

- **PagedAttention / continuous batching / TTFT vs TPS / prefill–decode** → already **Ch29**; name them, don’t re-teach the kernel
- **Routing, TPM billing, semantic cache** → already **Ch32**; the gateway **consumes** models this platform hosts
- **Tools / MCP / HITL / Agent loop** → Ch33 / Ch34; not this chapter’s main line
- **Training platform / full MLOps** → electives paused. Fine-tune / LoRA at most one sentence
- **Recommender funnel** → forbidden

M5 hard rule: **LLM + Agent infra only.** 2026 default: “design an LLM platform” = registry + GPU pool scheduler + isolation + rollout.`,
    },
    {
      id: "sec-pitch",
      headingEn: "How to answer in the interview (30 seconds)",
      bodyEn: `Don’t open by drawing a machine-room topology, and don’t recite some vendor’s accelerator SKU list. Land the scoring signal first: this is a **control plane + accelerator pool**, and the hard part is not the logo.

> “This is **LLM infrastructure**, not Ch29 again. Default is a **model registry**: immutable weight versions + \`prod\` / \`canary\` aliases; optional LoRA is a small artifact pinned to a base. **GPU scheduling** binpacks online inference for utilization, and spreads latency-sensitive replicas so one node isn’t a single point. Cluster policy owns **KV-affinity routing** and **per-replica batch / concurrency quotas** — paging is Ch29. Ship by **canarying new weights**; if SLO breaks, **rollback the alias**. Multi-tenant uses **quota + slot isolation**; don’t share prefix cache on sensitive data. Ch32 hits the alias; this platform hosts the fleet.”

How the 4 steps fill in:

${D2}

| Step | What it maps to on this prompt |
|---|---|
| Step 1 clarify | How many models, multi-tenant or not, online vs batch, what you gray (prompt vs weights), rollback SLO |
| Step 2 high-level | registry → scheduler → GPU pool → Ch29 workers; gateway consumes aliases |
| Step 3 deep dive | ① registry / versions ② cluster scheduling + VRAM/batch policy ③ isolation + canary/rollback |
| Step 4 wrap-up | Overwriting versions, no rollback, tenants stealing slots, answering this as PagedAttention or a training platform |

**red flag:** re-teaching the Ch29 kernel; K8s YAML as architecture; A100/H100 price sheet; locking to one cloud SKU; quoting some company’s internal card count; opening recommenders.`,
    },
    {
      id: "sec-clarify",
      headingEn: "Clarifying questions",
      bodyEn: `Drawing GPU topology before you asked “how many models, how many tenants, are we gray-releasing the prompt or the weights” = Jimmy. About 6–8 questions; assume the rest and write the board.

| You ask | Why you ask | Typical assumption (when they say “you pick”) |
|---|---|---|
| How many **model ids** at once? Do versions need to coexist? | Decides how you split pools and whether the registry has aliases | **2 chat models**; each at least \`prod\` + optional \`canary\` |
| One team internally, or a **multi-tenant** platform? | Isolation and quota may be the hard part | **Multi-tenant**: internal product lines, not hyperscale public cloud |
| Interactive chat, or offline batch? | binpack / pool isolation / SLO fork | **Online first**; batch goes to a separate low-priority pool |
| Are you gray-releasing **weights**, **prompt**, or both? | Prompt gray is cheap; weight gray occupies GPU | **Both**; default prompt first, then 10% weight canary |
| How fast must rollback be? Can you drop old-version replicas immediately? | Weight load is minutes; empty-pool rollback is naked | **Keep v1 until v2 is stable**; SLO break → flip the alias back |
| Can tenant data enter a shared prefix cache? | Decides whether KV affinity can cross tenants | **Isolate by default**: shared pool shares slots, not sensitive prefixes |
| Does this prompt include training, or the single-request engine kernel? | Stops you drawing MLOps or Ch29 | **No**; LoRA one sentence; kernel points at Ch29 |

How to say it:

> “I’ll assume: internal multi-tenant platform, two or three online models, registry owns immutable versions. Scheduler binpacks for utilization, spreads critical replicas. Ship canary then cut the alias, can rollback. Engine fleet is Ch29, gateway is Ch32. Does that direction look OK?”`,
    },
    {
      id: "sec-estimate",
      headingEn: "Back-of-the-envelope (don’t fake precision)",
      bodyEn: `This prompt’s back-of-envelope is so the interviewer hears: **the bill is GPU count and replica slots, not the page table.** Don’t invent some company’s internal card count, and don’t quote accelerator list prices. How one card pages KV is Ch29.

Teaching assumption (write the board): aligned with Ch32, chat peak **20 req/s**. Average generation occupies a replica for **~8 s** → about **160** concurrent sequences (in-flight, not raw QPS).

> The cluster sets a **slot budget** per Ch29 worker (e.g. \`max_num_seqs ≈ 32\`): that’s a platform SLO, not how the engine slices pages. 160 / 32 ≈ **5** prod replicas. Canary adds **1** v2 replica (~10% capacity for ~10% traffic). A second smaller model gets **2** more replicas. Spread the critical pool across ≥2 machines.

| Quantity | Teaching number | How you open it |
|---|---|---|
| Peak requests | **20 /s** | Same order as the gateway; don’t borrow 10k-QPS CRUD |
| Concurrent sequences | **~160** | Sessions holding KV slots; QPS lies |
| Slots per replica | **~32** | Platform quota; full → queue / 429, no oversubscribe |
| **prod replicas** | **~5** | Fleet for one hot model |
| **canary extra** | **+1** | Extra cards in the ship window; reclaim v1 after it is stable |
| **Teaching GPU scale** | **8–16** | Two models + canary head + failure domain; not “buy two cards and run vLLM” |

Loading 70B-class weights is often **minutes** (Ch29 already said this). In the estimate say: **scale-out cannot absorb a spike, so you reserve canary / HA headroom — don’t assume Pods scale in seconds.** Elasticity details cite Ch42.

How to say it:

> “Size replicas as concurrent sequences divided by slots per card. Teaching number is a small platform, eight to sixteen cards. The money is concurrent slots and dual-running a ship, not the sticker on one SKU.”`,
    },
    {
      id: "sec-arch",
      headingEn: "High-level architecture",
      bodyEn: `Get buy-in: **one chain that lands the platform — don’t draw PagedAttention into it.** Ch32 hits the alias; this platform registers versions, places cards, and brings up the Ch29 fleet.

${D2}

**This diagram cites**: what’s stateless is the gateway, not the worker (Ch39); pool elasticity, queuing, slow loads (Ch42). How the gateway routes / bills is Ch32 — this picture does not redraw it.

| Piece | What it does | How you say it |
|---|---|---|
| **registry** | Immutable weights + aliases + metadata | Hot path reads the alias, not “whatever the latest filename is” |
| **scheduler** | Places replicas onto cards / nodes | binpack or spread; not round-robin HTTP |
| **GPU pool** | Accelerator set sliced by model / priority | Don’t mix SLO between online and batch pools |
| **Ch29 workers** | Engine replicas that actually infer | Stateful: KV lives on the card; manage them as a fleet |
| **Ch32** | The API the product sees | **Consumes** aliases; this platform **hosts** models |

How you split from the single-request path (draw this yourself so you don’t go off-prompt):

${D2}

How to say it:

> “Registry publishes versions, scheduler places cards, the pool is a fleet of Ch29 workers. The gateway only knows aliases. If that direction is OK, I’ll dig into versions, scheduling, and canary isolation.”`,
    },
    {
      id: "sec-registry",
      headingEn: "Deep dive ①: model registry and versions",
      bodyEn: `2026 default: **weights are an immutable artifact; the alias is the mutable pointer.** The hot path must not “overwrite the same \`model.safetensors\`.” Public registry mental models (MLflow Model Registry / Hugging Face revision, KServe model name + version) are this pattern — don’t write product names on the whiteboard as components.

Minimum fields: \`model_id\`, **content hash**, storage URI (object storage, cite Ch37), dtype / context window, who approved prod, compatible inference image. Aliases: \`prod\`, \`canary\`, \`staging\`. Cutting traffic = change the alias or the weight split (next section), **not** SSH onto a replica and copy files.

LoRA / adapter: **one sentence is enough** — the adapter is its own small version, must pin to one base checkpoint (quantize / rope / dtype mismatch silently emits garbage); it can hot-attach onto an already-loaded base, so you don’t reload 70B per customer. Don’t answer this chapter as a training platform.

Prompts are versions too: system prompt, tool schema, decode params can decouple from weights. **Gray the prompt first, then the weights** is usually cheaper — a prompt does not occupy a second GPU. Public designs in the Gateway API Inference Extension class also treat **incremental LoRA-adapter rollout** as a first-class citizen: switch adapters on the same base fleet, cheaper than swapping the base.

| | Do | Don’t |
|---|---|---|
| Weights | Immutable + hash; verify before load | Overwrite the prod file in place |
| Alias | \`prod\` / \`canary\` cut atomically | Clients hard-code replica IPs |
| Adapter | Pin the base; own version number | Assume it plugs into any base |
| Prompt | Independent version, gray first | Ship prompt and weights as one big-bang release |

How to say it:

> “Versions in the registry are immutable; prod is just an alias. LoRA is an optional small pack that must pin the base. Prompts can gray on their own. Don’t overwrite the file that’s serving traffic.”`,
    },
    {
      id: "sec-sched",
      headingEn: "Deep dive ②: GPU scheduling and cluster batch policy",
      bodyEn: `Cards are expensive, so the first scheduling trade-off is **binpack vs spread**. K8s mental model: LeastAllocated leans spread, MostAllocated leans pack — say the policy in interview, don’t write YAML, don’t go into DRA.

${D2}

| | binpack | spread |
|---|---|---|
| Goal | Fill existing nodes, fewer machines | Spread replicas; one node down doesn’t wipe the fleet |
| When | Internal utilization first; same-SLO online pool | Latency-critical; need failure domains |
| Pitfall | noisy neighbor; concentrated maintenance blast | Fragmentation; idle cards burn money |

Teaching default: **spread one model’s prod fleet across ≥2 nodes**; **binpack** small models / batch jobs onto the same node. Don’t pick one extreme for the whole site.

**MIG / fractional GPU:** one sentence — MIG slices a card into hardware-isolated instances, good for multi-tenant small models; time-slicing / soft fractional isolation is weak, only for dev or preemptible batch. Don’t make fractional GPU the default for production chat.

VRAM and batching in this chapter are **cluster policy**, not Ch29’s paging implementation:

1. **Per-replica slot cap** (\`max_num_seqs\` class) is published by the platform as capacity. Over it → queue or 429. Don’t “squeeze one more sequence” by oversubscribing KV.
2. **KV / prefix affinity:** public serving stacks (Gateway API Inference Extension, llm-d Endpoint Picker) send the request to the **replica that already holds that prefix KV**, so you don’t re-prefill. That’s **routing policy**. How pages are allocated is still Ch29.
3. **Pool isolation:** long-context / batch / latency-sensitive must not share the same batch slots — otherwise interactive traffic dies behind a long prefill. Splitting pools looks more like a platform prompt than turning kernel knobs on one card.
4. After a model or LoRA swap, old KV is **invalid**; the scheduler must not stick requests to a version that’s already unloaded.

How to say it:

> “Spread latency-critical online replicas; binpack for utilization. Slots are a cluster quota. KV affinity is so you hit the prefix, not a second lecture on PagedAttention. MIG only for small models that need hard isolation.”`,
    },
    {
      id: "sec-rollout",
      headingEn: "Deep dive ③: canary, rollback, and multi-tenant isolation",
      bodyEn: `Swapping weights is not shipping a jar. New replicas **load first, then take traffic**; a failed load must not cut \`prod\`. Public practice (KServe LLMInferenceService canary): two versions coexist, **split traffic by weight**, and you can slam the weight back; the docs also warn **don’t dark-deploy at weight=0 and then yank it up** — the gateway may not have warmed the backend. Teaching line: **canary at least eats a real sliver of traffic.**

${D2}

Break metrics by **version**: TTFT, error rate, reject rate, KV occupancy. Cluster averages bury a bad canary. Rollback = point the alias / weight back at v1, **not** hot-patch the weight file on a bad replica. Don’t shrink the v1 fleet to 0 during the window, or rollback has to reload.

Prompt gray vs model gray (the path that saves cards):

${D2}

First cut **prompt / decode params** for some tenants or internal staff (almost zero GPU); then cut **new weights** on 10% of traffic; then ramp; finally full cut and reclaim v1. Skipping canary and cutting everything is a red flag.

Multi-tenant isolation — batch slots on GPU are scarce; there is no “OS fair scheduler” that saves you:

${D2}

| Plane | What the platform does | Split vs Ch32 |
|---|---|---|
| **quota** | Per-tenant GPU slots / concurrent sequences; full → reject or degrade pool | Gateway TPM/RPM is the token bill; slots are the card bill — you need both layers |
| **noisy neighbor** | On a shared replica, one tenant filling \`max_num_seqs\` drags everyone else’s latency | High-priority tenants get their own pool, or a hard per-tenant cap |
| **data isolation** | Sensitive tenants get a **dedicated replica**; shared pools must not reuse prefix KV across tenants (side channel / data bleed) | Gateway auth does not fix cache on the card |

How to say it:

> “Canary new weights at 10%, watch per-version SLO, and if it breaks flip the alias back to v1 — keep the old fleet. Tenants need a token quota and a slot quota. Sensitive data does not share KV prefixes with anyone else.”`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs “buy a few cards and run vLLM”",
      bodyEn: `<details>
<summary>Single-box docker running the engine — what you say now</summary>

A lot of 2023–2024 first versions were: buy a few cards, \`docker run\` one engine, filename as the model, restart equals ship. Fine for a demo, **not the 2026 platform-prompt first answer**.

| Then / early engineering | What you say now |
|---|---|
| One card, one container = “the cluster” | **registry + GPU pool + Ch29 fleet** |
| Overwrite the weight file and restart | **Immutable versions + aliases**; canary, then cut |
| round-robin every replica | **Slot quota + prefix/KV affinity routing** (policy layer) |
| Everyone shares one batch | **Tenant quota**; sensitive tenants get their own pool |
| Ship is a full cut; if it breaks, stop by hand | **Weighted canary + one-click rollback** (KServe-class public APIs are this mental model) |
| Answering this as PagedAttention | Kernel is **Ch29**; this chapter is the control plane |
| Training platform / full MLOps | Electives paused; LoRA one sentence |

Body first answer uses this set. The fold only stops you from treating “buy cards and run an engine” as the final draft.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **Isn’t this just vLLM again?** → Ch29 is the single-request path. This chapter is registry, placing cards, shipping, tenants.
2. **How is PagedAttention implemented?** → **Ch29.** This chapter only sets slot caps and KV-affinity policy.
3. **Gateway routing / TPM?** → **Ch32.** The gateway consumes aliases; the platform hosts weights.
4. **Why not overwrite the prod file?** → No rollback, no canary, hash won’t match. Versions must be immutable.
5. **Does LoRA need its own chapter?** → One sentence: small pack, pin the base. Don’t answer this as training.
6. **Why not binpack everything?** → One node down takes the fleet. Critical replicas spread.
7. **Why not spread everything?** → Idle cards burn money. Small models and batch can pack.
8. **Is MIG required?** → Only for small models that need hard isolation. Big chat replicas are usually a whole card.
9. **What’s wrong with round-robin?** → It shatters prefix KV; you re-prefill and burn cards. Affinity is cluster policy.
10. **How do you pull a bad version?** → Flip the alias back to v1; keep the old fleet in the window. Don’t hot-edit the file.
11. **Isn’t token rate-limit enough?** → No. Slots are the GPU. noisy neighbor happens inside the batch.
12. **Can’t we share KV?** → Throughput is great, but cross-tenant you get data bleed and a side channel. Sensitive tenants get a dedicated replica.`,
    },
    {
      id: "sec-next",
      headingEn: "What's next",
      bodyEn: `Close the page. Walk the 30-second open + the platform chain (registry → scheduler → GPU pool → Ch29 workers). If you can explain **why versions are immutable, how cards pack vs spread, that slots and KV affinity are policy, how canary rolls back, how tenants isolate**, you pass.

M5 ends here. Next chapter starts **M6 foundations**: **Ch36 · Trade-offs: CAP / PACELC / SLO**. Platform prompts that say “SLO broke → rollback, how you spend error budget” use that language; mainline design prompts can cite it the other way too.

Self-check: left column assumptions (multi-tenant, two models, 8–16 card teaching scale), middle the four-step chain, right the three deep-dive trade-offs. Don’t draw the Ch29 kernel picture back.`,
    },
  ],
  reviewMdEn: `# Ch35 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | Design an LLM platform — 30-second open? | registry: immutable versions + aliases; GPU scheduling binpack/spread; slots and KV affinity are cluster policy; canary/rollback; multi-tenant quota. Fleet is Ch29, gateway is Ch32. |
| 2 | What’s the hard part on this prompt? | ① model versions/registry ② GPU scheduling + cluster VRAM/batch policy ③ tenant isolation + canary/rollback. |
| 3 | How do you split vs Ch29 / Ch32? | Ch29 = single-request path (paging, batching, TTFT). Ch32 = routing and billing, consumes aliases. This chapter = the hosting platform. |
| 4 | What should you clarify? | How many models, multi-tenant or not, online vs batch, gray prompt or weights, how fast rollback, can KV cross tenants. |
| 5 | Teaching estimate for GPU count? | Concurrent sequences ÷ slots per replica → prod replicas; add canary head and the second model. Teaching **8–16** cards, no price sheet. |
| 6 | Minimum registry mental model? | Weights immutable + hash; \`prod\`/\`canary\` aliases can cut. Don’t overwrite the file that’s serving. |
| 7 | The one LoRA sentence on this prompt? | Adapter is its own version, must pin a compatible base; can hot-attach. Not a training chapter. |
| 8 | binpack vs spread? | pack fills nodes, high util; spread crosses failure domains. Critical online replicas spread; small models/batch pack. |
| 9 | MIG / fractional GPU? | MIG is hardware-isolated small instances; soft fraction / time-slicing is weak isolation — not the default for production chat. |
| 10 | What does KV cache mean in this chapter? | Cluster policy: slot cap, prefix-affinity routing, invalidate old KV on version swap. Paging lives in Ch29. |
| 11 | How does canary run? | New fleet loads first, eats a real sliver of traffic, watch per-version SLO; break → flip the alias back to v1. |
| 12 | Why keep v1 around? | Weight load is slow. Shrink v1 to zero in the window and rollback is naked. |
| 13 | Why gray the prompt first? | Almost no second GPU. Then 10% weights → ramp → full cut. |
| 14 | Three multi-tenant things? | token quota (Ch32) + GPU slots; stop noisy neighbor; don’t share prefix KV on sensitive data. |
| 15 | 2026 vs buy cards and run vLLM? | Now: registry, fleet, affinity routing, canary, isolation. One container overwriting a file is a demo. |`,
});
