import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch04",
  titleEn: "Design a rate limiter",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 50–60 min ｜ **Prereq**: Ch01 4-step method; Ch03 estimates (where the threshold comes from)
> **Goal**: walk a rate limiter through the 4 steps; default answer is **token bucket or sliding window** + **Redis + Lua** for distributed atomicity; put the limiter at the **API Gateway** (Envoy / Kong / nginx / cloud gateway), do not copy-paste it into every service; over the limit → **429** + RateLimit / X-RateLimit-* headers.

The rate limiter is the first brick in M2. Small scope, but it tests algorithm choice, distributed races, and where you put it—all in one prompt. They do not want you reciting five algorithm names. They want: **pick a primary design, say the trade-off, and do the count atomically in a shared store.**

The hard part (the piece worth digging) is two things: **the read-check-write race** (if it is not atomic, you over-admit), and **where it lives** (the client can be bypassed; one copy per service is over-engineering). Leaky bucket, fixed window, and sliding log: compare them, then drop them. Do not treat all five as “must implement side by side.”`,
    },
    {
      id: "sec-answer",
      headingEn: "How to answer in the interview",
      bodyEn: `### Opening 30 seconds

> “I’ll start by confirming granularity: user / IP / API key / endpoint, and whether over-limit is 429 or queueing. Default algorithm is **token bucket** (allows burst). If they want a strict window and no double-at-the-boundary, I switch to a **sliding window counter**. On the implementation, the limiter lives at the **API Gateway**; counts go in **Redis + Lua**, so multiple instances share one atomic counter. Over the limit I return 429 with RateLimit headers and Retry-After. A service-mesh sidecar can rate-limit service-to-service traffic; for this prompt, the ingress layer is the gateway—that’s enough.”

Then walk the 4 steps. Do not open by reciting five algorithm flowcharts.

${D2}

| Time box | What you are doing |
|---|---|
| 3–8 min | Clarify: granularity, burst, 429 vs queue, single Region |
| 2 min | Back-of-the-envelope: peak QPS, active bucket count, Redis memory order of magnitude |
| 8–12 min | High-level: Client → Gateway → Redis Lua → business service |
| 10–20 min | Deep dive: token bucket vs sliding window, Lua atomicity, clocks, fail-open |
| 3–5 min | Wrap-up: Redis hot keys, rules too tight / too loose, rate limit vs circuit breaker |

**red flag:** equal airtime on five algorithms; putting the limiter inside every microservice as the default; GET the counter then INCR with no mention of the race; drawing “one global bucket” before you have even asked granularity.`,
    },
    {
      id: "sec-clarify",
      headingEn: "Clarifying questions",
      bodyEn: `If granularity is fuzzy, the key design and the algorithm are empty. Ask 5–7, then stop; the rest you write as assumptions.

| You ask | Why | Default you write on the board |
|---|---|---|
| By user, IP, API key, or endpoint? | Decides the Redis key; you often stack layers | “user + endpoint; login also by IP” |
| Allow burst? | The split between token bucket and leaky bucket | “Short burst allowed → token bucket” |
| Reject over-limit, or queue? | Sync 429, or enqueue and delay | “Sync 429; queues only if this is checkout-class” |
| Single box or many instances? Multi-Region? | Local counts are useless on a stateless tier | “Many instances, one Region first” |
| Who changes the rules? Tiers by plan? | Config vs hard-coded; free vs paid QPS | “Gateway reads config; one default tier first” |
| If the limiter itself fails, allow or reject? | Failover when Redis is down | “Read API fail-open; login / SMS fail-close” |

When they say “you assume,” write it up:

> “Assume: public HTTP API, limit by user_id + endpoint; login extra-limited by IP. Many instances OK, one Region first. Over-limit is 429. Burst is allowed, so the algorithm is token bucket.”

Ask “do we need never-exceed on every single request” before you switch from token bucket to sliding window. Do not default to a sliding log—that trades memory for precision, and for most APIs it is over-engineering.`,
    },
    {
      id: "sec-estimate",
      headingEn: "Back-of-the-envelope",
      bodyEn: `Formulas live in Ch03. Here you only need to prove: **this is not a storage problem; the bottleneck is hot keys and Lua QPS.** Numbers below are teaching assumptions, not some company’s dashboard.

Assume: ingress peak **10K QPS** (daily average another order of magnitude lower); concurrent active buckets (user × endpoint) **1 million**; each bucket one Redis hash, about **100 B** (tokens + timestamp + TTL).

| Item | How you estimate | Order of magnitude |
|---|---|---|
| Gateway peak | Teaching assumption | **~10K QPS** |
| Redis memory | 1M keys × 100 B | **~100 MB**; even with a replica still hundreds of MB |
| One decision latency | Same-city Redis + Lua | **sub-ms to 1 ms**; cheaper than one business query |
| Hot key | One viral user / one login IP | One key saturates Redis’s single thread; local pre-check or split the dimension |

**How you say it in the interview:**

> “Memory is noise. The scale problem on a rate limiter is: every request needs an atomic decision, and a hot key lands on one Redis shard. I put the gateway in front of ingress and the counters in Redis; I do not start with a sharded cluster.”

Rule numbers are teaching-grade too, so you can hand-calc later: login **5/min/IP**; read API **100/min/user**; write **20/min/user**. Asked “where does the threshold come from” → back it out from Ch03 peak QPS and downstream capacity, then leave headroom; do not invent internal load-test numbers.`,
    },
    {
      id: "sec-place",
      headingEn: "Where the limiter lives",
      bodyEn: `2026 default: **ingress at the API Gateway**, counters shared. The client is assist-only; hand-rolling a copy inside every business process as the default is a red flag.

${D2}

This diagram cites: Ch39 load balancing and stateless · Ch42 messaging, elasticity, container mental model

**How you say it in the interview:**

> “Put the limiter on the gateway: Envoy, Kong, nginx, or a cloud vendor API Gateway. Rules are centralized, business services stay stateless. Client-side limiting can shed traffic, but you cannot trust it. Copy-pasting a Redis client into every service means rules drift and get missed—that is over-engineering.”

| Where | Upside | Downside | How you use it in the interview |
|---|---|---|---|
| Client | Early drop, saves bandwidth | **Unreliable**—forgeable, can be turned off | Assist; never the only line of defense |
| In-app | Algorithm fully custom | Rewrite per service; fights LB statelessness | Sink it here only when the gateway plugin is not enough |
| **API Gateway** | Unified, sits with auth / routing | Limited to algorithms the gateway supports | **Default**; Kong / Envoy / nginx / cloud gateway |

nginx \`limit_req\` is closer to leaky bucket (constant drain). If you want token bucket, pick a gateway plugin or custom Lua; do not assume “we put nginx in front, so it is token bucket.”

Service-to-service calls can take another cut at the sidecar (Envoy / Istio)—**one sentence is enough**; expanding into mesh is a rabbit hole. Business API ingress is still the gateway; rate-limit billing at an LLM ingress is Ch32; gateway as a product is Ch17.`,
    },
    {
      id: "sec-arch",
      headingEn: "High-level architecture",
      bodyEn: `Left to right: Client → API Gateway → Redis (Lua decision) → only allowed traffic hits the business service. After they buy in, then dig into the algorithm and the race.

${D2}

This diagram cites: Ch39 load balancing and stateless · Ch42 messaging, elasticity, container mental model

Talk track:

1. The gateway pulls the key off the request (user / IP / API key + endpoint).
2. \`EVAL\` a Lua script: refill tokens or sliding-window count, atomically allow or deny.
3. Allow → forward downstream; deny → **429 on the spot**, never hit the business.
4. Response carries quota headers so the client can slow itself down.

Why Redis, not a DB: the decision is on the request critical path; you want memory + TTL. One DB round-trip turns the limiter itself into the bottleneck. The gateway is stateless (Ch39); the same user can land on any instance, so the count must be centralized. **Do not use a sticky session** to “pin this user to one limiter box”—that fights scale-out.

Rules (who gets 100/min, who gets 5/min) come from config, not hard-coded inside Lua. You can name Lyft’s open-source ratelimit (Envoy often talks to it) as an industrial template—touch it and move on; do not turn this into a YAML class.

Stop the high-level picture here. Ask: “Direction OK? Next I’ll compare algorithms, then write the Redis race.”`,
    },
    {
      id: "sec-algo",
      headingEn: "Deep dive · token bucket vs sliding window",
      bodyEn: `First hard part: **pick the primary algorithm, then name what you drop.** The 2026 interview default is pick one of two—burst → token bucket; window smoothness → sliding window counter.

${D2}

### Token bucket (primary A)

Two parameters: \`capacity\` (bucket depth, burst ceiling) and \`rate\` (how many you refill per second). A request arrives, you refill by elapsed time, then try to spend:

\`tokens = min(capacity, tokens + rate * dt)\`

If a token is there, allow and subtract 1; otherwise deny. When the bucket is full you can emit \`capacity\` requests in an instant—that is the burst. Public docs at Amazon API Gateway and Stripe both describe quotas as a token bucket.

Hand-calc (teaching): capacity 4, rate = 4/min, discrete refill so it is easy to walk; production refills continuously with \`rate * dt\`. t=0 the bucket is full at 4; at 10s three requests arrive, 1 left; at 20s two arrive, allow 1, deny 1. Interview arithmetic stays discrete; add one line: “in prod we refill continuously by elapsed time.”

Tuning talk track: \`rate\` ≈ average allowed QPS; \`capacity\` ≈ how many seconds of peak you can sustain × rate. Capacity way too large means you did not actually limit burst; capacity of 1 degenerates into leaky bucket.

### Sliding window counter (primary B)

Current-window count + previous-window count × overlap fraction, which gives an approximate “any rolling window” usage. A fixed window can admit double at the minute boundary; the sliding counter folds in the previous window’s tail, so the boundary spike is flattened. You assume requests in the previous window were uniform—this is an approximation, not an exact log. Cloudflare has written publicly about using an approximate sliding window for edge rate limiting: cheap on memory, friendly to high traffic.

Teaching: limit 7/min; previous window 5, current window already 3, the new request lands 30% into the current window → \`3 + 5 × (1 - 0.3) = 6.5\`, ≤ 7 so allow.

**How you say it in the interview:**

> “For API rate limiting I default to token bucket, because the product usually allows a short burst. If they stress no doubling at the minute boundary and want the window fair, I switch to a sliding window counter. Both only need a few integers per key, so they fit Redis.”

### Compare, then drop (do not implement all five side by side)

| Algorithm | Burst | Precision | Memory | Interview role |
|---|---|---|---|---|
| **Token bucket** | Allowed | Medium | Low | **Default A**: API quotas |
| **Sliding window counter** | Smooth | High (approx) | Low | **Default B**: flatten boundary double |
| Leaky bucket | Forced-smooth | Medium | Low | Egress that must be a constant rate; cousin of nginx \`limit_req\` |
| Fixed window | Can double at the boundary | Low | Lowest | Demo only; as the only design it is a red flag |
| Sliding log | Exact | Highest | **High** (one timestamp per request) | Only if compliance is extremely strict; most prompts it is over-engineering |

Leaky bucket: the queue drains at a constant rate; a burst either queues or new requests are denied—fits “downstream can only eat a fixed QPS.” Sliding log: a Redis sorted set records every timestamp, exact over any window, but even denied requests occupy memory, and it gets expensive the moment QPS climbs. Asked “what else is there,” close with the three rows above, then immediately go back to A or B.`,
    },
    {
      id: "sec-lua",
      headingEn: "Deep dive · Redis + Lua atomicity",
      bodyEn: `Second hard part. When many gateway instances share a counter, **GET → check → SET/INCR is not atomic**: two requests both read “still allowed,” both go through, the quota is broken.

${D2}

This diagram cites: Ch42 messaging, elasticity, container mental model

While Redis runs a Lua script, that script is serialized: read tokens, refill by \`dt\`, decide, write back; no other command can sneak in the middle. That is the standard answer for distributed rate limiting—not “we used Redis, so it is atomic.” Commands inside a pipeline can still be interleaved by another client. **Do not sell pipeline as a Lua substitute.**

Token bucket inside the script is that one line: \`tokens = min(capacity, tokens + rate * dt)\`; if enough, subtract \`cost\`, then HMSET + EXPIRE. Sliding window is INCR the current-window key, read the previous window, estimate by overlap. Writing the steps on the whiteboard scores more than reciting 40 lines of Lua.

**Clocks:** do not compute \`dt\` by subtracting each gateway pod’s local clock—NTP skew makes refill too fast or too slow. In Lua, \`redis.call('TIME')\` takes Redis’s own seconds (and microseconds); on one instance it is monotonic and consistent. After a Redis primary/replica failover, TIME still follows the new primary. Extreme clock rollback is rare; one line—“we trust Redis TIME”—is enough. Do not turn this into a distributed-clocks lecture.

**How you say it in the interview:**

> “With multiple instances, read-check-write has to live inside Redis Lua. Time comes from Redis TIME, not the gateway’s local now. Allow → forward with remaining quota; deny → 429 immediately, the downstream never sees it.”

| | Lua script | Client GET+INCR |
|---|---|---|
| Atomicity | The whole script is serialized | Race; you over-admit |
| Clock | Redis TIME | Each pod’s local clock, with skew |
| Ops | You have to version the script | Looks simple |
| When it is enough | **Distributed default** | Single-box demo, or you already INCR and can live with over-admit |

Will a centralized Redis become a SPOF: replica + failover first; then shard by key (hash of user id). Still not enough, add the local pre-check in the next section. Multi-Region usually means one Redis per Region and you accept a brief over-limit—that is more common than forcing one globally synced bucket. A globally exact single bucket is often over-engineering.`,
    },
    {
      id: "sec-headers",
      headingEn: "Deep dive · two-layer decision and 429",
      bodyEn: `Third deep dive: under a hot key, do not let every request saturate Redis; how you talk to the client when they are over; what you do when Redis is down.

${D2}

This diagram cites: Ch39 load balancing and stateless · Ch42 messaging, elasticity, container mental model

### Local + Redis

Inside the gateway process, run a tight token bucket first: obviously-too-fast requests get 429 immediately and never touch Redis. Anything that passes local then asks the Redis authority bucket. Local can be slightly loose or slightly tight; **you trade a little error** to shed a single-key hotspot. Authority still lives in Redis; the sum across instances is the quota.

| | Local only | Redis only | Local + Redis |
|---|---|---|---|
| Correctness | Each instance counts alone; global quota will break | **Globally accurate** | Accurate; local only filters spikes |
| Latency / load | Fastest | A same-city RTT every time | Hot keys hit Redis less |
| Cost | Stateless scale-out makes it meaningless | Redis becomes the bottleneck | One extra knob |

**How you say it in the interview:**

> “Default is Redis as the authority. When QPS or a hot key shows up, the gateway adds a local pre-check and we tolerate a little over-limit. Local-only is not distributed rate limiting.”

### 429 and headers

Sync reject uses **429 Too Many Requests**. Queue-and-delay (orders into an MQ) is a different product call; wait for them to nod before you change it. By default do not draw the rate limiter as a message queue.

Headers should let the client slow itself down:

- **IETF draft** \`draft-ietf-httpapi-ratelimit-headers\` (still an Internet-Draft in 2026): \`RateLimit-Policy\` describes the quota (e.g. \`q\` for the allowance, \`w\` for the window in seconds); \`RateLimit\` describes what is left now (\`r\` remaining, \`t\` seconds the window is still valid). Example: \`RateLimit: "default";r=0;t=12\`.
- **De-facto standard** (GitHub / Stripe and friends still use these heavily): \`X-RateLimit-Limit\`, \`X-RateLimit-Remaining\`, \`X-RateLimit-Reset\`. Reset is sometimes a Unix timestamp, sometimes a number of seconds—that is exactly what the draft is trying to unify.
- On 429, add **Retry-After** (seconds or an HTTP date); clients should prefer this.

Interview default: **429 + Retry-After + both the draft RateLimit headers and X-RateLimit-***, so old SDKs still work. Do not only memorize the X- prefix and pretend 2026 has just one family.

### Redis is down: fail-open vs fail-close

| | fail-open | fail-close |
|---|---|---|
| Behavior | Redis timeout → **allow** | Timeout → **429** |
| Who you protect | Availability, user requests | Downstream, abuse |
| Fits | Read-heavy public APIs | Login, SMS, payments, issuing coupons |

If you do not say this sentence, a limiter outage either floods the whole site or rejects the whole site. Default talk track: read path fail-open + alert; money / captcha paths fail-close. A circuit breaker is fail-fast once the downstream is already broken (Ch42); a rate limiter rejects excess before ingress is full—do not mash the two words into one box.`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs the original book",
      bodyEn: `<details>
<summary>What the book / notes said then · five algorithms side by side and X-RateLimit-only live here</summary>

| Book / notes | How you answer now |
|---|---|
| Five algorithms (token bucket / leaky bucket / fixed window / sliding log / sliding counter) get equal pages | **Pick a primary first**: token bucket or sliding window counter. Compare the rest, then drop them |
| Placement only says API Gateway; the notes called service mesh “the 2026 two-layer default” | **Default is still the gateway**. Sidecar in one sentence; expanding into mesh is a rabbit hole |
| Lua / sorted set named, the race diagram is thin | You must make GET+INCR over-admit clear, plus **Lua + Redis TIME** |
| Over-limit headers are only \`X-Ratelimit-*\` | Add IETF \`RateLimit\` / \`RateLimit-Policy\` (draft, still not an RFC in 2026) + still emit X- for compatibility |
| Sticky session as an option | On a stateless gateway, **do not** use sticky sessions as the rate-limit design |
| Cloudflare node count as trivia | Do not memorize node counts; the sentence they want is “the edge uses an approximate sliding window” |
| Multi-level limiting written as three layers of code you must ship | In clarify, name the user / IP / endpoint dimensions; the implementation is still one Lua, different keys |

The book skeleton still works: you need a limiter, you need a distributed count, you need 429. What aged out is **you must be able to implement all five** and **not treating the gateway as the default**. Full Lua dumps in the notes, Shopify’s leaky bucket, 330+ cities—those are not the body’s first answer.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. “Token bucket vs leaky bucket?” → Token bucket allows burst (full bucket can emit capacity instantly); leaky bucket forces a smooth output. APIs default to the former.
2. “What’s wrong with a fixed window?” → The window boundary can admit double. Use a sliding window counter or token bucket; do not ship fixed window as the production default.
3. “High concurrency, the count is wrong?” → Redis Lua atomic script; do not GET then INCR. Pipeline ≠ atomic.
4. “Whose clock?” → Redis TIME. Gateway local clocks have clock skew; refill drifts.
5. “Redis is down?” → Read APIs often fail-open + alert; login / SMS fail-close. Say who you are protecting.
6. “Rate limit vs circuit breaker?” → Rate limit sheds excess at ingress; circuit breaker fail-fasts when the downstream is already down. Point at Ch42.
7. “Why not put it in every service?” → Stateless scale-out, rule drift. Default is the gateway; sink custom algorithms later.
8. “Doesn’t nginx already have limit_req?” → Close to leaky bucket. If you want token bucket, do not pretend you already bought it.
9. “One global bucket across Regions?” → Usually a quota per Region + accept a brief overage. A globally exact synced bucket is often over-engineering.
10. “Isn’t sliding log the most accurate?” → Accurate, but you store a timestamp per request. Most quota prompts use a counter / token bucket. Extremely strict compliance, then maybe.`,
    },
    {
      id: "sec-next",
      headingEn: "What’s next",
      bodyEn: `Do not close by saying it is perfect. Three bottlenecks, talk track:

| bottleneck | How you pick it up |
|---|---|
| Hot key saturates one Redis shard | Local pre-check + shard by user; no sticky |
| Rules too tight / too loose | Watch 429 ratio and downstream CPU; back the threshold out of capacity |
| Redis failure | Pick fail-open / fail-close by path, plus alerts |

Self-check: close the page, 30-second opening, draw Client → Gateway → Redis, say the token-bucket formula and “why Lua” out loud. Wherever you stall, go back to that section.

Next chapter **Ch05 · Consistent hashing**: rate limiting is controlling rate; hashing is spreading keys evenly across machines—Redis sharding and the KV store later both use it.`,
    },
  ],
  reviewMdEn: `# Ch04 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | What do you say in the rate-limiter opening 30 seconds? | Ask granularity; default token bucket or sliding window counter; put it at the API Gateway; Redis + Lua; over-limit 429 + RateLimit headers. |
| 2 | Where does a 2026 rate limiter live by default? | **API Gateway** (Envoy / Kong / nginx / cloud gateway). The client is unreliable; copy-paste per service is a red flag. |
| 3 | Two token-bucket parameters? What does burst mean? | capacity + rate. A full bucket can emit capacity instantly. \`tokens = min(capacity, tokens + rate * dt)\`. |
| 4 | When do you switch to a sliding window counter? | To flatten a fixed window’s boundary double, and to make the window fairer. Approx: current window + previous × overlap. |
| 5 | Why are leaky bucket / fixed window / sliding log not the default? | Leaky bucket forbids burst; fixed window doubles at the boundary; sliding log stores a timestamp per request, memory is expensive. Compare, then pick A or B. |
| 6 | Why must it be Redis + Lua? | Multi-instance GET-check-write over-admits. Lua serializes the whole script inside Redis. Pipeline does not guarantee atomic. |
| 7 | Whose clock for dt? | **Redis TIME**. Gateway local clocks have clock skew; refill drifts. |
| 8 | Over-limit, what do you return? How do you speak in headers? | **429** + Retry-After. Draft \`RateLimit\` / \`RateLimit-Policy\`; also emit \`X-RateLimit-*\` for old clients. |
| 9 | Redis down: fail-open or fail-close? | Read APIs often fail-open + alert; login / SMS / payments fail-close. Say who you are protecting. |
| 10 | Rate limit vs circuit breaker? | Rate limit: reject excess at ingress. Circuit breaker: downstream already failing, fail fast so you do not take yourself down. |
| 11 | Local + Redis two-layer trade-off? | Local filters hot keys, a little error is OK; Redis is the authority. Local-only = the global quota is gone. |
| 12 | Is nginx limit_req a token bucket? | Closer to leaky bucket. Want token bucket, use a gateway plugin or Lua; do not assume “nginx is there, we’re done.” |
| 13 | Should service mesh be the primary answer? | Ingress default is the gateway. Sidecar in one sentence; expanding into Istio is a rabbit hole. |
| 14 | Typical over-engineering on this prompt? | Implement all five algorithms; sticky session; one strongly synced global bucket; a custom stack per service. |`,
});
