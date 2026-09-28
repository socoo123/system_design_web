import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch10",
  titleEn: "Design a notification system",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 50–60 min ｜ **Prereq**: Ch01 4-step method; Ch04 rate limiting, Ch42 delivery semantics can wait
> **Goal**: walk notifications through the 4 steps; default Push to **FCM HTTP v1**; speak **at-least-once + idempotency**, don't fake exactly-once.

Notifications is the second full case. A URL shortener is read-heavy, write-light KV; this prompt is fan-out and delivery. They are not scoring whether you can draw "global multi-Region + a warehouse funnel." They want: **channels asked clearly, scale estimated right, three hard parts (the three pieces worth digging) spoken through.**

The system looks like anyone can fire a push. The hard parts are heterogeneous channels, don't drop / don't duplicate, and not waking the user at 3am.`,
    },
    {
      id: "sec-answer",
      headingEn: "How to answer in the interview",
      bodyEn: `**Opening 30 seconds (say it out loud):**

> "Notifications have three hard parts: heterogeneous channels, don't drop / don't duplicate, don't spam. I'll confirm channels first (Push / SMS / Email), transactional vs marketing, 1:1 vs broadcast. Scale on a 10-million DAU board: Push is ~1k QPS daily average; marketing bursts are gated by third-party rate limits. Architecture is product services → notification API → MQ → per-channel workers → third parties. Push story is **FCM HTTP v1** covering Android and Web; iOS still goes APNS, but I don't make it the only answer. Reliability is at-least-once + \`notification_id\` idempotency — I don't pretend exactly-once."

Then walk the 4 steps. Do not lead with the final diagram.

${D2}

| Time-box | What you are doing |
|---|---|
| 3–10 min | Clarify: channels, transactional vs marketing, 1:1 vs broadcast, reliability, quiet hours / unsubscribe |
| Next 2 min | back-of-envelope: 10M DAU, Push ~1k QPS, marketing burst gated by third-party rate limits |
| 10–15 min | High-level: client → API → MQ → per-channel workers → third parties |
| 10–25 min | deep dive: idempotency / DLQ, FCM and token lifecycle, rate limit / quiet hours |
| 3–5 min | wrap-up: 3 bottlenecks (third-party rate limits, stale tokens, marketing blocking transactional) |

**red flag:** drawing only APNS before you asked about channels; lecturing Kafka partitions and ISR before you asked transactional vs marketing; claiming exactly-once; marketing fan-out as a for-loop over 10 million users in the API. That is over-engineering, or dragging all of Ch20 / Ch04 onto this board.`,
    },
    {
      id: "sec-clarify",
      headingEn: "Clarifying questions",
      bodyEn: `Drawing before you clarify = Jimmy. On notifications, stop at 5–7 questions; assume the rest and write the board.

| You ask | Typical answer / your assumption | What it changes |
|---|---|---|
| Which channels? | Push + SMS + Email; Web Push counts as Push | Workers split by topic; protocols differ |
| Transactional or marketing? | **Both** | Priority queues; marketing gets quiet hours / unsubscribe |
| 1:1 or broadcast? | Transactional 1:1; marketing can broadcast | fan-out is async; API does not loop users |
| Can we drop / can we duplicate? | OTP cannot drop; occasional dupes OK | Persist first + retry; idempotent dedup |
| Quiet hours / unsubscribe? | Marketing yes; transactional (OTP / payments) exempt | Preference table; quiet hours delay, don't drop |
| Open-rate funnel? | Mention it, stop | Payload carries an id; this is not a warehouse class |

When they say "you decide," write the assumptions:

> "I'll assume: Push / SMS / Email all in; both transactional and marketing; OTP cannot drop; marketing needs quiet hours and unsubscribe. Push uses FCM HTTP v1 as the Android / Web main channel. I'll draw on that — cut me off if it's wrong."

Asking past 10 minutes is also a red flag. The golden line is still: **ask the key questions → state your own assumptions → write the board → move.**`,
    },
    {
      id: "sec-estimate",
      headingEn: "Back-of-the-envelope",
      bodyEn: `Formulas live in Ch03. Here you only need order of magnitude: prove you know **this is medium throughput, heavy on compliance** — the hard part is not saturating a single box. Teaching assumptions below from public-scale numbers — not some company's internals.

Assume ~**10 million DAU**; ~10 Push messages per user per day.

| Item | How you estimate | Order of magnitude |
|---|---|---|
| Push daily-average QPS | 1e7 × 10 / 86400 | **~1e3**; peak ×5 is still a few thousand |
| SMS | Expensive, small share; board ~100k/day | **single-digit to tens of QPS** |
| Email | Mostly batch; board ~1 million/day | Average tens, higher inside the send window |
| Marketing burst | 1e7 users / 10 minutes | **~1e4/s**, but gated by third-party rate |
| Storage | Logs ~0.5 KB × 100 million/day; keep 30 days | ~**TB-scale** (with replicas) |
| Bandwidth | Payload is KB, not video | Outbound is gated by **third-party QPS quotas** |

**Interview line:**

> "On a 10-million DAU board: Push is ~1k QPS daily average, storage TB-scale. Marketing can spike instantaneous QPS into the tens of thousands, but FCM / SMS aggregators will rate-limit you — so you need MQ to absorb the burst. The bottleneck on this prompt is not compute; it's delivery and not spamming people."

Common mistake: treating the marketing burst of 1e4/s as a number you must synchronously punch into third parties. Workers leak at the third-party quota; the API only enqueues. Do not invent a company's exact delivery-rate percentage.`,
    },
    {
      id: "sec-arch",
      headingEn: "High-level architecture",
      bodyEn: `Left to right: product services → notification API → MQ → per-channel workers → third parties. After they buy in, split write path and feedback.

${D2}

**This diagram cites**: Ch40 Protocol choices · Ch42 Messaging, resilience

**Why MQ (must answer):** decoupling (third-party calls are slow; API returns first); absorb bursts (marketing spikes); retry (a third-party blip does not drop the intent); **channel isolation** (slow SMS cannot stall Push). Mention and stop: topics split by channel (then by priority). Kafka partitions / ISR / exactly-once wait for Ch20 — do not turn this into a message-queue class.

**schema (enough, then stop):** \`notification\` (id, user_id, channel, status, template_id); \`device\` (user_id, token, platform, status); \`user_preference\` (channel, opt-in, quiet hours). User-to-device is 1:N. Do not draw five wide tables on the board.

Write path: **persist the intent first (PENDING), then enqueue MQ, then send.** API validates, request-level idempotency, check preferences, then fan-out onto per-channel topics. Marketing broadcast does not scan 10 million users on the request thread — a separate fan-out job pours into MQ.

Delivery path is a sequence diagram. Push as the example (FCM HTTP v1); SMS / Email are isomorphic, only the third party and receipts differ.

${D2}

**This diagram cites**: Ch42 Messaging, resilience · Ch40 Protocol choices

Workers are independent pools per channel: rate, retry, and auth are different on each leg. SMS is billed per message — cap concurrency hard; FCM has high throughput but you must handle dead tokens. One shared pool: the slow channel drags everything down.

Stop the high-level here. Ask: "Does this direction look OK? Next I'll dig into reliability, channels, and anti-spam."`,
    },
    {
      id: "sec-reliable",
      headingEn: "Deep dive · Don't drop, don't duplicate (don't fake exactly-once)",
      bodyEn: `First hard part. Notifications default to **at-least-once**: MQ redelivers, workers retry. The user feeling "I got it once" is idempotency, not free exactly-once.

${D2}

| Side | What you do |
|---|---|
| **Don't drop** | Write DB first (PENDING), then enqueue MQ; fail with exponential backoff + jitter; after N times **DLQ** + alert |
| **Don't duplicate** | Request-level: \`notification_id\` (caller or UUID) Redis \`SET NX\`, TTL e.g. 24h; business-level: \`user + template + window\` against double-tap |

End-to-end exactly-once across FCM / APNS / SMS **does not exist**: the network retries, and the third parties retry themselves. 2PC / transactional outbox pulls latency and ops cost up — not worth it for notifications. Declare at-least-once, dedup on the server by id, filter again on the client by id — that is the interview default. Delivery semantics live in Ch42.

**Interview line:**

> "I guarantee at-least-once: persist first, then send; retry on failure; exhaust into DLQ. Duplicates are blocked by \`notification_id\` idempotency. I will not say exactly-once — I do not control third-party retries."

OTP is more loss-sensitive than marketing: a dedicated high-priority topic, more aggressive retry, SMS aggregator failover if needed. Dropping one marketing message is acceptable — do not use "we can drop" as an excuse to skip persistence.`,
    },
    {
      id: "sec-channel",
      headingEn: "Deep dive · Heterogeneous channels and device tokens",
      bodyEn: `Second hard part. One intent fans out by device / preference; **every channel has a different protocol, rate, receipt, and cost.** 2026 board: Android / Web Push story is **FCM HTTP v1** (short-lived OAuth; legacy server key is dead). iOS is still APNS (HTTP/2 + p8 JWT) — you can talk to it directly, or let FCM proxy — but do not draw APNS as the only egress on the whole diagram.

${D2}

| Channel | Third party | Differences to remember |
|---|---|---|
| Push (Android / Web) | **FCM HTTP v1** | Free, high throughput; auth is OAuth, not a forever server key; some error codes let you drop the token |
| Push (iOS) | APNS | Free, best-effort; **no positive "device received" receipt**; expiry often \`410\` |
| SMS | Aggregator | **Billed per message**; DLR receipts; CN needs signature / template; workers must throttle |
| Email | ESP | Cheap, fits marketing; watch bounce / complaint; unsubscribe must be honored |

SMS: you do not run your own SMSC. You go through an **aggregator**: route by country / carrier / price / success rate; on failure, circuit-break to a backup. DLR is an async webhook callback, reconciled on \`msg_id\` — that is why SMS is easier to count as delivered than Push. Protocol comparison is Ch40; do not turn SMPP into a class here.

**Device tokens are not forever.** Uninstall, reinstall, revoke permission, FCM rotation, a device that has been offline a long time — all invalidate. Keep pushing a dead token = waste quota, tank reachability, maybe get rate-limited by the platform. This is the #1 production pit.

Feedback loop as a sequence: FCM returns \`UNREGISTERED\` (HTTP 404 class) → delete; iOS direct often \`410 Gone\`. The same feedback handler writes \`device.status = inactive\`; later sends skip it.

${D2}

**This diagram cites**: Ch40 Protocol choices

App-side token refresh must write back to the device table. Multi-device users: hang multiple tokens off \`user_id\`; do not use the token as the user primary key. You can also periodically sweep tokens that have been inactive a long time, but **the send-failure callback is the main path**.

**Interview line:**

> "Android / Web I go FCM HTTP v1; iOS I go APNS. Tokens die — FCM \`UNREGISTERED\` or APNS \`410\` must be cleaned. I will not make APNS the default channel for the whole prompt, and I will not use the deprecated FCM legacy key."`,
    },
    {
      id: "sec-anti",
      headingEn: "Deep dive · Anti-spam: rate limit, priority, quiet hours, unsubscribe",
      bodyEn: `Third hard part. Being able to send is not the same as should send. Marketing blocking OTP, waking people at 3am, sending after they unsubscribed — all red flags.

${D2}

**This diagram cites**: Ch04 Design a rate limiter

Rate-limiter algorithms (token bucket / sliding window, Redis + Lua) live in **Ch04**. Here you only say **which layer, and why transactional and marketing must be split** — do not turn this chapter into a rate-limiter class.

| Layer | What it stops |
|---|---|
| Per-user | Daily / hourly cap, anti-hammer |
| Per-channel | SMS strictest (cost + compliance); Push looser |
| Per-template | Same template, short window (business-level dedup) |
| Global / third-party | Protect FCM / aggregator quotas |

**Priority:** OTP / payments go on a dedicated high-priority topic + workers, so a marketing blast cannot stall them. Social notifications can coalesce (10 likes → one message). Marketing can delay and throttle.

**Quiet hours:** marketing that lands in the window is **delayed until the window ends** — do not silently drop (unless product explicitly says drop). Transactional (OTP, security) sends immediately. Store timezone as IANA; evaluate on the send path; do not use the datacenter's local time.

**Unsubscribe / opt-out:** marketing must be opt-out-able; after unsubscribe, that channel stops. OTP is usually still allowed. Preferences are read-heavy: short-TTL cache, source of truth in DB.

**Interview line:**

> "Per-user and per-channel rate limits; algorithm details in Ch04. OTP gets its own high-priority queue. Marketing respects quiet hours and unsubscribe — send when the window ends, don't throw it away. I will not wake the user in the name of 'must deliver.'"

trade-off: anti-spam lowers marketing reach; reliability raises duplicate risk. Speak this tension on the board — don't just draw more arrows.`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs the book",
      bodyEn: `<details>
<summary>How the book / notes used to teach it (not the first answer)</summary>

| Book or notes | How you answer now |
|---|---|
| FCM legacy server key | **HTTP v1 + OAuth**. Legacy send API shut down in 2024 |
| **APNS as the main channel** drawn in the center | **FCM HTTP v1** as the Android / Web story; iOS is APNS |
| Device token as forever | They expire; \`UNREGISTERED\` / \`410\` must be cleaned |
| Dedup waved through | Request-level \`notification_id\` + windowed business dedup |
| Quietly implying exactly-once | Declare at-least-once; cross-vendor exactly-once is over-engineering |
| SMS named as one cloud vendor | Aggregator routing + failover; CN still needs signature / template / unsubscribe |

The book's skeleton still works as an intro: multi-channel, API → MQ → worker. What aged is **FCM legacy**, **APNS as the default main channel**, and shallow dedup.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **"How do you guarantee exactly once?"** → End-to-end exactly-once does not exist. at-least-once + \`notification_id\` idempotency + client-side dedup by id.
2. **"Why not APNS as the main channel?"** → APNS only covers Apple. Android / Web default **FCM HTTP v1**. iOS can talk APNS directly, or FCM as a proxy.
3. **"Token expired — now what?"** → FCM \`UNREGISTERED\`, APNS \`410\` → feedback handler marks inactive, stop pushing. Keep pushing wastes quota.
4. **"Does FCM still use a server key?"** → No. Legacy is dead. HTTP v1 + OAuth (service account).
5. **"How do you blast 10 million for marketing?"** → fan-out job into MQ; workers leak at third-party rate. Do not loop in the API. Do not expand Kafka ISR.
6. **"Third party is down?"** → Retry + DLQ; SMS multi-aggregator failover + circuit break. Push has no second "equivalent APNS."
7. **"How do you stop spam?"** → Per-user / per-channel rate limit (Ch04) + priority + quiet-hours delay + unsubscribe. OTP is the exception.
8. **"OTP during quiet hours — send or not?"** → Transactional sends immediately; marketing delays. Do not drop everything with one rule.
9. **"Why split workers by channel?"** → Rate, auth, retry, billing all differ. Slow SMS cannot stall Push.
10. **The final diagram is already huge and they keep stacking?** → Classic over-engineering on this prompt. Funnels, recs, partition rebalance are not this chapter. Speaking three hard parts scores higher than 20 boxes.`,
    },
    {
      id: "sec-next",
      headingEn: "Wrap-up and what's next",
      bodyEn: `Wrap-up never says perfect. Three bottlenecks out loud:

| bottleneck | How you take it |
|---|---|
| Third-party rate / marketing burst | MQ absorbs; workers leak at quota; SMS stricter |
| Still pushing dead tokens | Feedback loop cleanup; biggest lever on reachability |
| Marketing blocking OTP | High-priority dedicated topic; quiet hours only constrain marketing |

Self-check: close this page. 30-second opening + high-level on the board; walk FCM HTTP v1, at-least-once + idempotency, and dead tokens to the air. Wherever you stumble, come back to that section.

Next problem is **Ch11 · Design a news feed**. Notifications are service → user fan-out; Feed is the reverse — aggregation and push vs pull.`,
    },
  ],
  reviewMdEn: `# Ch10 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | Three hard parts of notifications? | Heterogeneous channels; don't drop / don't duplicate; don't spam. |
| 2 | Push 2026 default story? | **FCM HTTP v1** (Android / Web). OAuth, not a legacy server key. |
| 3 | Where does APNS sit? | iOS channel. Direct or FCM as a proxy. Not the default main channel for the whole prompt. |
| 4 | High-level path? | Product services → notification API → MQ → per-channel workers → third parties. Persist first, then enqueue. |
| 5 | Why declare at-least-once? | MQ redelivery + third-party retries. exactly-once across vendors does not exist — over-engineering. |
| 6 | How do you do idempotency? | \`notification_id\` SET NX; plus user+template+window dedup. Client filters again by id. |
| 7 | Token-death signals? | FCM \`UNREGISTERED\`; APNS often \`410\`. Feedback handler marks inactive, stop pushing. |
| 8 | Why split workers by channel? | Rate, auth, retry, billing differ. Slow SMS cannot stall Push. |
| 9 | Marketing burst — how? | fan-out into MQ, leak at third-party quota. Do not loop 10 million users in the API. |
| 10 | Quiet hours? | Marketing delayed until the window ends; OTP / payments send immediately. Evaluate in the user's timezone. |
| 11 | SMS vs Push receipts? | SMS has DLR; APNS has no positive device receipt. Do not invent exact delivery-rate percentages. |
| 12 | How deep on rate limiting? | Where per-user / per-channel sit, and split transactional vs marketing. Algorithms back to Ch04 — do not turn the chapter into a limiter class. |`,
});
