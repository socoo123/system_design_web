import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch17",
  titleEn: "Design an API gateway",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 50–60 min ｜ **Prereq**: rate limit Ch04; LB Ch39; protocols Ch40
> **Goal**: auth, rate limit, routing, canary, timeout and circuit breaking; BFF vs a unified gateway. This chapter is business APIs, not LLM model routing (Ch32).

API gateway is the ninth full case. Comments finished "how a tree hangs off one business API"; this one swaps in **how every business API is guarded at the door**. Default is an **HTTP/gRPC business edge** like orders / comments / Feed—not Ch32's model router, and not a sidecar chapter (mention mesh in one sentence, deep-dive Ch44).

The interviewer is not scoring a Kong plugin catalog, an Envoy filter list, some cloud SKU, or Ingress YAML. Three hard parts: **BFF vs a unified gateway**, **auth + rate limit at the door**, **routing / canary + timeout and circuit breaking**. The gateway itself should be stateless; rate-limit counters live in Redis.`,
    },
    {
      id: "sec-answer",
      headingEn: "How to answer in the interview",
      bodyEn: `**Opening 30 seconds (say it out loud):**

> "This is a business API gateway, not Ch32's LLM model router. Default is one **unified L7 gateway**: verify JWT / OIDC at the door, rate-limit by user / API key / route (Ch04 token bucket or sliding window + Redis+Lua), route by path / host / header. Gateway is stateless; rate-limit state lives in Redis. BFF only if mobile / web aggregation diverges a lot—not required. Canary by weight or header stickiness. Timeouts always on; retry only idempotent; circuit breaker if downstream is dead. Mesh is east-west mTLS, point to Ch44."

Then walk the 4 steps. Do not draw the final diagram first or recite product names.

${D2}

| Time-box | What you are doing |
|---|---|
| 3–10 min | Clarify: business API vs LLM, REST/gRPC, JWT vs cookie, BFF or not, canary |
| Next 2 min | back-of-envelope: ingress QPS / bandwidth; gateway stateless; rate-limit keys in Redis |
| 10–15 min | High-level: Client → Gateway → business services; Redis only for rate limit |
| 10–25 min | deep dive: BFF vs unified, where auth+rate limit live, canary + timeout/circuit breaker |
| 3–5 min | wrap-up: 3 bottlenecks (auth leak at the door, copy-paste rate limit per service, retry storm with no timeout) |

**red flag:** drawing LLM token billing / semantic cache before asking scope; defaulting to "must BFF"; copy-pasting rate limit into every service; sessions on the gateway; turning Maglev / mesh / Ingress YAML into a chapter. That is over-engineering, or dragging Ch32 / Ch39 / Ch44 into this prompt.`,
    },
    {
      id: "sec-clarify",
      headingEn: "Clarifying questions",
      bodyEn: `Drawing before you clarify = Jimmy. On a gateway, stop at 5–7 questions; assume the rest and write the board. **The first question must be scope.**

| You ask | Typical answer / your assumption | What it changes |
|---|---|---|
| Business API, or LLM model routing? | **Business HTTP/gRPC** (orders / comments / Feed) | this chapter; token billing / semantic cache is Ch32 |
| REST, gRPC, or both? | **REST first**; mention gRPC (Ch40) | L7 at the edge; no Maglev chapter |
| Auth: JWT / OIDC, session cookie, or API key? | **JWT / OIDC first**; browsers can cookie; partners API key | verify at the gateway; how identity headers go downstream |
| Different aggregation for mobile / web? | **Unified gateway first**; BFF only if they diverge a lot | do not default to two gateways |
| Canary / gray release? | **Yes**; weight or header | gateway splits traffic; this is not a release platform |
| Rough ingress peak? | Teaching: **~10k QPS** | proves stateless + Redis, not some company's internal number |

When they say "you decide," write the assumptions:

> "I'll assume: one unified L7 business gateway, not an LLM gateway. JWT verified at the door, rate-limit by user + route, 429 over the cap. Gateway is stateless. No BFF yet. Canary 90/10 by weight, timeouts always on. Mesh is a one-line mTLS callout. I'll draw on that—cut me off if it's wrong."

If they chase sidecar / Istio: **acknowledge the difference, then close it.** "The gateway owns north-south ingress; mesh sidecars own east-west. mTLS and retry details live in Ch44 / Ch42. This loop is the door." Asking past 10 minutes is also a red flag. The golden line is still: **ask the key questions → state your own assumptions → write the board → move.**`,
    },
    {
      id: "sec-estimate",
      headingEn: "Back-of-the-envelope",
      bodyEn: `Formulas live in Ch03. Here you only need order of magnitude: prove you know **this prompt's bottleneck is door policy and downstream timeouts, not what the gateway stores.** Whiteboard **teaching assumptions** below—not some company's internal numbers.

Assume ingress peak about **10k QPS**; average request ~**2 KB**, response ~**4 KB**; live rate-limit buckets (user × route) about **1 million**.

| Item | How you estimate | Order of magnitude (teaching) |
|---|---|---|
| Ingress QPS | teaching peak | **~1e4**; everyday traffic one order lower |
| Bandwidth | 1e4 × 2 KB in / 4 KB out | in ~**20 MB/s**, out ~**40 MB/s**; the gateway is CPU / connections, not disk |
| Gateway state | instances should be stateless (Ch39) | **no** local session / local counters; scale out freely |
| Rate-limit state | 1 million keys × ~100 B | Redis **~100 MB**; decide in Redis+Lua (Ch04) |
| Auth | local JWT verify + JWKS cache | sub-millisecond per request; no introspection every call |

The gateway looks like it "does everything." What is expensive is not storing user profiles—it is **every request verifying a signature + atomic rate limit + forwarding with a timeout**. Pinning a session to one gateway box (sticky) fights horizontal scale—that is a red flag.

**Interview line:**

> "10k QPS on the board: bandwidth tens of MB/s, gateway is stateless so add boxes. Rate-limit buckets live in Redis, not gateway RAM. I will not treat some cloud gateway's public peak as an internal number."

Common mistakes: folding the downstream business DB's storage into the gateway; or drawing a stateful gateway and using sticky session to "nail rate limit to one box." Teaching uses order of magnitude, and you **label the assumptions**.`,
    },
    {
      id: "sec-arch",
      headingEn: "High-level architecture",
      bodyEn: `Left to right, draw only **one north-south control plane**: Client → API Gateway → business services. Redis is only for rate-limit counters. Do not fan out sidecars, LLM routing, or a release platform on this diagram. You can mention L4 LB in one sentence (Ch39); on the board the gateway is L7. After they buy in, split BFF, identity headers, and canary.

${D2}

**This diagram cites**: Ch39 Load balancing & statelessness · Ch40 Protocol choices · Ch44 Microservices & service governance

**What the gateway does (enough, then stop):** AuthN (verify JWT / OIDC / API key), coarse AuthZ (is this identity allowed on this route), rate limit, route by path / host / header, timeout, observability (access log / metrics). **Do not** put place-order inventory, comment moderation, or Feed push/pull in the gateway—that is the business service.

**How you draw the boundary with the two neighbors:** BFF is "aggregation for one client," usually **behind** the gateway, not a replacement. Sidecar / service mesh owns service-to-service (east-west) mTLS and retries—**one sentence**, deep-dive Ch44. L4 vs L7: an L4 LB can spray connections in front; path, JWT, and header canary are L7—do not turn Maglev into a chapter (Ch39). REST vs gRPC: the edge can terminate HTTP/1.1 or HTTP/2; protocol details live in Ch40.

**Write-path line:** strip spoofed identity headers → verify signature → take the rate-limit key → Redis Lua → forward only if allowed, with a timeout; reject is 429 on the spot, downstream never sees it.

Stop the high-level here. Ask: "Does this direction look OK? Next I'll dig into BFF vs a unified gateway, then auth and rate limit at the door, then canary plus timeout and circuit breaking."

**Interview line:**

> "Clients hit one L7 gateway; orders / comments / Feed sit behind it. Gateway is stateless; Redis is only rate limit. Mesh does not go on this ingress diagram."`,
    },
    {
      id: "sec-bff",
      headingEn: "Deep dive · BFF vs a unified gateway",
      bodyEn: `First hard part. 2026 whiteboard default: **one unified L7 gateway** for the door policy every client shares. BFF (Backend for Frontend) is not "a better gateway"—it answers a different question: **what aggregation and field shape this one client needs**. They often stack: gateway owns policy, BFF owns page assembly.

${D2}

**This diagram cites**: Ch44 Microservices & service governance

| | Unified gateway (**draw this first**) | BFF |
|---|---|---|
| Problem | Ingress policy every client needs | The data shape this App / this Web wants |
| Owner | Platform / edge | The matching frontend team |
| Fits | Auth, rate limit, routing, timeout | Homepage aggregates 3–5 services once, field trimming |
| Don't | Put "can this order be refunded" in the gateway | Site-wide rate limit / global JWT verify as the only defense |
| Cost | One API shape has to fit all clients | Extra hop, extra deploys; BFFs copy business rules |

One client, or mobile / web hitting the same REST is enough: **do not** add BFF for a resume word—that is over-engineering. When they diverge a lot (weak network wants fewer round-trips, desktop wants a wide table): BFF **sits behind the gateway**; the gateway still verifies and rate-limits. Do not let every BFF invent its own JWT check—rules drift.

Aggregation fan-out has a ceiling: one page hitting 3–5 downstreams still looks like a BFF; if it becomes an orchestration engine with compensating transactions, that is a business service, not a gateway plugin.

Sidecar in one sentence, then stop: mesh does not replace the ingress gateway. North-south policy stays on the gateway; east-west identity is mTLS (Ch44). Three pieces of infra fighting over the same job (rate limit on the gateway *and* the BFF *and* the sidecar) is ownership drift—say out loud in the interview: "one coarse cut at the door; service-to-service is a separate budget."

**Interview line:**

> "Default is a unified gateway. BFF only if clients diverge a lot, behind the gateway, not a replacement for auth and rate limit. Mesh is east-west; this loop does not unpack it."

trade-off: a unified gateway gives you one policy and one chain to debug; the client may fan out a few extra times. BFF buys fewer round-trips and pays an extra hop plus two codebases. Putting inventory rules in a BFF is copying business logic per client—that is a red flag.`,
    },
    {
      id: "sec-auth",
      headingEn: "Deep dive · Auth and rate limit at the door",
      bodyEn: `Second hard part. AuthN / AuthZ and rate limit both live on the **gateway**, so business services stay stateless and you do not copy a set that someone will forget. Algorithms already live in Ch04 (token bucket / sliding window + Redis+Lua)—this chapter is only **where it sits, which key, what you return over the cap**. Do not re-derive five rate limiters.

${D2}

**This diagram cites**: Ch44 Microservices & service governance

**AuthN at the edge:** JWT verify (iss / aud / exp + signature, JWKS cache); OIDC is OAuth with an identity layer—the gateway verifies the ID token or access token. Browser sites can use a session cookie (encrypted cookie or a session store lookup). Partners use API keys. **Coarse AuthZ** (is this route / this method allowed) can live on the gateway; **fine AuthZ** (can this user cancel this order) stays in the service—the gateway has no domain data.

**How identity goes downstream:** after verify, write \`X-User-Id\` (or equivalent) to the backend so every service does not parse JWT again. **You must strip any same-named header the client sent, then write**—otherwise a caller forges \`X-User-Id\` and impersonates. That is spoofing. Trust boundary: these headers are trusted only on the internal network / mesh behind the gateway; if someone can hit the service and skip the gateway, the header is worthless. The patch is network policy + service-to-service mTLS (point to Ch44), not copying another verify as the "more secure" first answer.

${D2}

**This diagram cites**: Ch39 Load balancing & statelessness

Rate limit **on the gateway**: keys are **per-user** (JWT \`sub\`), **per-API key**, **per-route** (or user+route stacked). Authenticate first, then bucket by identity—unauthenticated-by-IP is a helper, not the only key after login. Counters go to **Redis+Lua** (Ch04), because gateway instances are stateless and a local memory bucket can be bypassed. Over the cap: **429 Too Many Requests**, with \`Retry-After\`, plus \`X-RateLimit-Limit\` / \`Remaining\` / \`Reset\` (or IETF RateLimit headers). Do not return 503 as rate limit—that pollutes the "service is down" SLO.

| | Gateway rate limit (**default**) | Copy into every service |
|---|---|---|
| Missed config | one cut at the door | a new service forgets and is naked |
| Rules | one config | each repo writes its own, they drift |
| Stateless | gateway scales freely (Ch39) | local counters + sticky is a red flag |
| Interview | **first answer in 2026** | over-engineering |

Client-side rate limit can only shed load; it is not trusted. A second cut inside the service is a patch for "this place-order API needs to be stricter than the gateway," not the first diagram. If Redis dies: reads often fail-open; login / SMS fail-close—same sentence as Ch04, then stop.

**Interview line:**

> "Verify JWT at the door, strip spoofed identity headers, then write them downstream. Rate-limit by user and route, Redis Lua, 429 with headers over the cap. Do not copy another set into every service."

trade-off: one door buys "business processes stay simple"; fine-grained permission still goes back to the service. Turning the gateway into an IdP (full login page, minting tokens) is usually too heavy; verify + JWKS is enough. One globally exact rate-limit bucket is often over-engineering—start with a single Region.`,
    },
    {
      id: "sec-route",
      headingEn: "Deep dive · Routing, canary, timeout and circuit breaking",
      bodyEn: `Third hard part. Routing is path / host / header matching onto a downstream cluster. Canary (gray release) is **v1 / v2 split on the same route**, not a homemade release platform. Resilience: **timeouts always on**; retry only idempotent; circuit breaker stops a downstream avalanche. Retry storms are a deep dive in Ch42.

${D2}

**This diagram cites**: Ch39 Load balancing & statelessness

**Match:** \`/orders/*\` → orders; \`api.example.com\` vs an \`internal\` host; \`x-canary: true\` goes to the new version. **Weighted canary:** 90/10 by weight, raise it after error rate and latency look good. **Header stickiness:** pin the same user or QA to v2 with a header, so "one request v1, next v2" does not scramble writes. Rollback is weight back to 100/0. Stop here—do not draw a page of Flagger / Argo YAML.

gRPC at the edge: the gateway can recognize HTTP/2 + content-type and route by service name; grpc-web / transcoding, point to Ch40, do not unpack a protocol lecture. L4 can only spray by connection; it cannot canary by path—so this prompt defaults to L7 (Ch39).

${D2}

**This diagram cites**: Ch42 Messaging, resilience, containers

**Timeout:** every route sets a client timeout and a backend timeout (backend should be ≤ the total). Downstream slow to the deadline → **504**, do not wait forever. **Retry:** only idempotent (typical GET, or a write with an idempotency key). Auto-retrying a non-idempotent POST double-places an order—red flag. **circuit breaker:** if downstream error rate / latency punches through, open the circuit, fast 503, so you do not pile threads; half-open to probe. Details and retry storms (amplified fan-out) → Ch42.

| | Say this | Not the first answer |
|---|---|---|
| Timeout | **always on**, per route | trust a default 60s |
| Retry | idempotent only + a cap + jitter | hammer every 5xx three times |
| circuit breaker | downstream is dead, fail fast | "just retry a few more times" |

**Interview line:**

> "Route by path / host; canary by weight or header stickiness. Timeouts always on, 504. Retry only idempotent. Circuit-break a dead downstream. How retries amplify traffic is Ch42."

trade-off: weight canary is simple, users may bounce versions; header stickiness is stabler on the write path, you have to agree where the header comes from. Timeout too short false-kills p99; too long ties up gateway connections. Retry with no timeout multiplies a downstream incident onto the edge—that is the biggest resilience red flag in this loop.`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs no dedicated book",
      bodyEn: `<details>
<summary>No Xu chapter; old web answers are not the first answer</summary>

Alex Xu's two volumes have no "Design an API gateway." This chapter is rebuilt from 2026 domestic / general public interview prompts and production practice—not a polish of some notes. The web still loves "nginx reverse proxy, done," "must BFF," "every microservice rate-limits itself," and reciting the Kong plugin table—that is tutorial inertia, not today's whiteboard default.

| Old web / tutorial inertia | How you answer now |
|---|---|
| nginx reverse proxy = the whole prompt | **L7 door policy**: auth, rate limit, routing, timeout; reverse proxy is just the carrier |
| Must add BFF | **Default unified gateway**; BFF only if clients diverge, behind the gateway |
| Copy rate limit / JWT verify into every service | **one cut at the door**; fine-grained permission goes back to the service |
| Local session / sticky on the gateway | **stateless**; rate limit in Redis (Ch04 / Ch39) |
| Recite Kong / Envoy / cloud SKU | product names as mechanism examples, not a plugin catalog from memory |
| Ingress YAML as the design | whiteboard matching and weights, not a K8s tutorial |
| Auto-retry every request | **idempotent only**; timeout + circuit breaker; storms → Ch42 |
| Mix with Ch32 into model routing | this chapter is business APIs; leave token billing / semantic cache alone |
| Maglev / mesh as a chapter | L4, point to Ch39; mTLS, point to Ch44 |
| Some cloud gateway QPS as fact | **teaching assumptions**; order of magnitude only |

Still-valid skeleton: north-south ingress, cross-cutting concerns stripped out of business processes, stateless scale-out. Outdated is leading with reverse proxy, a plugin catalog, and "BFF everywhere" as the first answer.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **"How does this relate to BFF?"** → Default unified gateway. BFF solves per-client aggregation, usually behind the gateway. Not required, not a replacement for auth and rate limit.
2. **"And sidecar / mesh?"** → Gateway is north-south; mesh is east-west mTLS. This loop does not unpack Istio (Ch44).
3. **"Why not verify JWT in every service?"** → You will miss one, and rules drift. Verify at the door; fine AuthZ lives in the service that has the data.
4. **"Can you trust \`X-User-Id\`?"** → Only after the gateway stripped and rewrote it, and callers cannot skip the gateway. Otherwise spoofing.
5. **"Rate-limit algorithm?"** → Ch04: token bucket or sliding window + Redis+Lua. Here you talk placement and 429 headers, not five algorithms again.
6. **"Rate-limit key?"** → per-user / per-API key / per-route, often stacked. Authenticate first, then by identity.
7. **"What do you return over the cap?"** → **429** + Retry-After + RateLimit headers. Do not fake it with 503.
8. **"Should the gateway be stateful?"** → No. Counters in Redis. Sticky session to nail rate limit is a red flag.
9. **"How do you canary?"** → Weight or header stickiness. Do not design a release platform on the board.
10. **"Do you retry on failure?"** → Timeouts always on (504). Retry only idempotent. Circuit breaker for downstream. Storms → Ch42.
11. **"L4 or L7? gRPC?"** → This prompt is L7. L4 / Maglev → Ch39. REST vs gRPC → Ch40.
12. **"How does an LLM route models?"** → That is Ch32. This chapter is orders / comments / Feed.
13. **The final diagram is already huge and they keep stacking?** → Plugin catalogs, Ingress, a mesh chapter, token billing are not this chapter. Three hard parts spoken clearly scores higher than 20 boxes.`,
    },
    {
      id: "sec-next",
      headingEn: "Wrap-up and what's next",
      bodyEn: `Wrap-up never says perfect. Three bottlenecks out loud:

| bottleneck | How you take it |
|---|---|
| Auth leak at the door / spoofed identity headers | Gateway verifies JWT; strip then write; callers cannot skip the gateway |
| Copy-paste rate limit per service + a stateful gateway | Redis+Lua at the door; gateway is stateless (Ch04 / Ch39) |
| Retry storm with no timeout | Timeout 504; retry only idempotent; circuit breaker; deep-dive Ch42 |

Self-check: close this page. 30-second opening + high-level on the board; walk "unified gateway, BFF is not required," "auth and rate limit at the door," and "canary + timeout and circuit breaking" to the air. Wherever you stumble, come back to that section. Do not open your mouth on Ch32 token / semantic cache.

Next problem is **Ch18 · Design an e-commerce order system**. The gateway is the door for every business API; orders swap in a state machine, inventory hold, and payment callbacks—from "how a request enters the cluster" to "how one transaction stays consistent."`,
    },
  ],
  reviewMdEn: `# Ch17 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | Three hard parts of a gateway? | BFF vs a unified gateway; auth + rate limit at the door; routing / canary + timeout and circuit breaking. |
| 2 | What do you draw by default? | **One unified L7 gateway**. BFF only if client aggregation diverges—not required. |
| 3 | Gateway vs BFF vs mesh? | Gateway: north-south policy. BFF: per-client aggregation, usually behind the gateway. Mesh: east-west mTLS, point to Ch44. |
| 4 | Where does auth live? Identity headers? | Gateway verifies JWT / OIDC. Strip client-forged headers, then write \`X-User-Id\`. Fine AuthZ in the service. |
| 5 | Where does rate limit live? Algorithms? | **Gateway** + Redis+Lua. Token bucket / sliding window is Ch04; this chapter is placement. |
| 6 | Rate-limit grain? Over the cap? | per-user / per-API key / per-route. **429** + Retry-After + RateLimit headers. |
| 7 | Is the gateway itself stateful? | **Stateless**. Rate-limit state in Redis. Do not sticky-pin a session. |
| 8 | How do you canary? | Weighted split or header stickiness. Do not build a release platform on the board. |
| 9 | Timeout / retry / circuit breaker? | Timeouts always on (504). Retry only idempotent. Circuit breaker for downstream. Storms → Ch42. |
| 10 | L4 vs L7? REST vs gRPC? | This prompt is **L7**. Maglev / L4 → Ch39. Protocols → Ch40. |
| 11 | How do you split with Ch32? | This chapter is business APIs. Do not talk LLM model routing, token billing, or semantic cache. |
| 12 | Biggest over-engineering on this prompt? | Plugin catalogs, Ingress YAML, must-BFF, per-service rate limit, a mesh/Maglev chapter. Speak the three hard parts. |`,
});
