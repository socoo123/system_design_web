import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch27",
  titleEn: "Instant delivery",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 50–70 min ｜ **Prereq**: Nearby / LBS Ch19; protocols Ch40; resilience mental model Ch42
> **Goal**: matching, capacity, point at routing, live location. Don't cover map rendering.

Red packets covered “how you split a limited number of cents, how you don't oversell.” This prompt swaps in **place an order → match a courier → pick up and deliver**. Default is **same-city food-delivery fulfillment**: the merchant cooks, a courier picks up and drops off, the user watches ETA. Not the LBS radius-query chapter (Ch19), not the message-queue chapter (Ch20 / Ch42), not the full payments / orders book (Ch18 / Ch24), and not backend cron (Ch25 schedules jobs, not people on the road).

The system looks like: dispatch one courier. Three hard parts: **the matching model (assign vs broadcast-grab + timeout reassign)**, **live location (report frequency vs storm, what you do with stale points)**, **capacity and peaks (partition, queue, degrade)**. The interviewer is not scoring map tiles, A* on a road network, or reciting some company's capacity paper. They want: how you recall nearby candidates, why the score is explainable, what you do when nobody accepts, and what happens when location punches matching through.

This chapter **does not cover**: map rendering, a full nav engine, treating some company's internal order volume / algorithm names as facts.`,
    },
    {
      id: "sec-answer",
      headingEn: "How to answer in the interview",
      bodyEn: `**Opening 30 seconds (say it):**

> “This is instant-delivery fulfillment, not nearby people, not maps, not a full order-and-payments system. Three hard parts: matching model, live location, capacity at peak. Default same-city food delivery: after the order, recall nearby couriers, filter online / load / heading, score an **explainable score** on distance, heading, load, on-time risk, then the platform assigns; timeout with no accept → reassign. Location drops into a cell for candidates—details go back to Ch19. Reports must be throttled; stale location is kicked out of matching. Peak: partition and queue; ingress rate limit is Ch04; backlog / circuit-breaker mental model is Ch42. Routing is a pointer: after accept, use routing to estimate ETA, don't implement nav. 2026 whiteboard does not draw a deep-learning dispatch black box.”

Then walk the 4 steps. Do not open by drawing road-network tiles, an ML dispatch platform, or some company's daily order count.

${D2}

| Time-box | What you are doing |
|---|---|
| 3–10 min | Clarify: courier flash vs food delivery, live track or not, matching objective (ETA / accept rate / fairness) |
| Next 2 min | back-of-envelope: city daily orders, online couriers, report frequency; what you fear is matching hotspots and a location storm |
| 10–15 min | High-level: Client → order matching → courier location → dispatch |
| 10–25 min | deep dive: assign vs grab + timeout reassign; capacity partition and degrade; location throttle + point at channels in Ch40 |
| 3–5 min | wrap-up: 3 bottlenecks (matching objective unclear, location storm, peak with nobody accepting) |

**red flag:** drawing map rendering / nav SDK / Kafka partitions before you asked scope; opening with deep-learning dispatch; lifting Ch19's neighbor-cell algorithm wholesale; drawing the payment state machine into the first picture; treating some company's daily orders / courier count as your fact. That is over-engineering, or lifting a neighbor chapter / an elective wholesale.`,
    },
    {
      id: "sec-clarify",
      headingEn: "Clarifying questions",
      bodyEn: `Drawing before you asked = Jimmy. On delivery, stop at 5–7 questions; assume the rest and write the board. **The first question must be scope.**

| You ask | Typical answer / your assumption | What it changes |
|---|---|---|
| Same-city courier flash, or food delivery (pickup at merchant then dropoff)? | **food-delivery fulfillment** (pickup + dropoff) | Flash has no cook time; matching is still people, the objective is different |
| Does the user watch a live track? | **near-real-time location**; not map rendering | Report frequency, channel, stale policy all change |
| Matching objective: ETA, accept rate, or courier fairness? | **ETA / on-time first**; point at fairness | Score weights; optimizing distance only starves some couriers |
| Assign or grab? | **assign as default**; grab as contrast | Timeout reassign is a hard requirement only on assign |
| Do you already have a geo index? | **yes, a cell index** (Ch19) | Don't re-teach neighbor cells this loop; just drop into a cell and take candidates |
| How far do you draw order / payment? | **order already paid**; state machine back to Ch18 / Ch24 | This loop stops at matching and the fulfillment track |

When they say “you pick,” write the assumptions:

> “I'll assume: same-city food delivery, pickup at the merchant, dropoff at the user. Matching objective is ETA / on-time first, fairness as a constraint. Nearby cell recall, filter then an explainable score, platform assigns; T seconds with no accept → reassign. User wants near-real-time location, no map tiles. Location drops into a cell; stale points are kicked out of candidates. Peak: queue by zone, rate-limit the ingress. Money and the order state machine stay off this picture. I'll draw this; interrupt me if it's wrong.”

If they bring up map tiles, a nav SDK, a full road network, some company's dispatch paper, payment channels: **acknowledge the difference, then close the scope.** “Rendering and the road network are a Maps elective. routing is only for ETA; this loop does not implement A*. Ch19 already covered cells and neighbors; here we just call it. Order / payment is Ch18 / Ch24. This loop I will go to the bottom on matching, capacity, and the location storm.” Asking past 10 minutes is also a red flag. The golden line is still: **ask the key questions → state your assumptions → write the board → move.**`,
    },
    {
      id: "sec-estimate",
      headingEn: "Back-of-the-envelope",
      bodyEn: `The formulas live in Ch03. Here you only need order of magnitude, to show you know **this problem's bottleneck is matching hotspots and a location-report storm, not “nationwide daily orders.”** The numbers below are **teaching assumptions** on the board—not some food-delivery company's internals, not a public peak treated as your fact.

Assume: **one city**, about **500k** orders/day; lunch/dinner peak multiplies the thinned daily-average order QPS by **5–10**; concurrent online couriers about **5k–10k**; location reports teaching **every 5–10 seconds** (or only when displacement exceeds a threshold).

| Item | How you estimate | Order of magnitude (teaching) |
|---|---|---|
| Daily-average orders | 5e5 / 86400 | **~6 orders/s**; peak ×5–10 → **tens/s** |
| Online couriers | whiteboard 10k | Matching is “dozens nearby,” not a nationwide scan |
| Location QPS | 1e4 couriers / 5s | **~2e3**; if once per 1s → **~1e4**, that's the storm |
| User watching a track | in-flight orders × push frequency | Push only **the order someone is looking at**; don't fan-out the whole city |
| vs “some company does tens of millions/day” | don't invent it on the board | **this loop does not score on nationwide throughput** |

Everyday one-city order QPS is small. What costs is: **the same commercial district at mealtime, orders pile into a few cells and fight over the same couriers**; and **everyone's high-frequency GPS filling writes and the index**. Drawing a million-QPS ingress without throttle and partition is inventing numbers, not estimating.

**How to say it:**

> “Whiteboard: 500k orders/day in one city. Daily-average orders are single-digit to tens of QPS. Time goes to hotspot matching and the location storm. Report every 5–10 seconds; once a second punches the Loc store through. I will not treat some company's daily orders as an internal number.”

Common mis-counts: treating nationwide daily orders as one city's matching QPS; or only quoting orders, then pretending couriers report every second and saying that's fine. Use teaching orders of magnitude, and **label them as assumptions.**`,
    },
    {
      id: "sec-arch",
      headingEn: "High-level architecture",
      bodyEn: `Left to right, draw **one fulfillment control plane**: Client → order matching → courier location → dispatch. Do not fan out tile CDN, road network, payments, or Kafka partitions on this picture. Order create can assume already paid (Ch18 / Ch24); this picture only hands the order to matching. After the interviewer buys in, then dig into assign and location.

${D2}

**This diagram cites**: Ch40 protocol choices · Ch42 messaging, resilience, containers

**Write path (order → dispatch):** user places the order (already paid) → order enters pending-match → Match **drops the pickup into a cell, takes online couriers from neighbor cells** (Ch19 in one sentence, don't re-teach) → filter → score → Dispatch notifies the courier. Delivery and backlog for notify and the location stream point at Ch42; don't draw a message queue as the main architecture.

**Write path (location):** courier app throttles reports → Loc store updates latest point + cell + \`updated_at\`. Stale points don't enter candidates. If the user is watching this order, push location to that connection—channel details next, point at Ch40.

**Read path:** user watches order ETA / courier near-real-time point; courier watches pending pickup / dropoff. The list is not Feed; no CDN. After accept, ETA asks a routing service (internal or external); **this loop does not implement a road network**.

**schema (stop when it's enough):** \`orders\` (order_id, pickup, dropoff, status: \`pending_match\` / \`assigned\` / \`picked\` / \`delivered\` / \`reassign\`); \`couriers\` (courier_id, status, load, last_cell, last_seen); \`assignments\` (order_id, courier_id, assigned_at, deadline). Don't draw a map-layer table on the board.

Stop the high-level here and ask: “Does this direction look OK? Next I'll dig into assign vs grab, then capacity at peak, then the location storm and channels.”

**How to say it:**

> “Client hits order matching. Matching reads courier location; dispatch goes out. Payments and maps stay off this picture.”`,
    },
    {
      id: "sec-match",
      headingEn: "Deep dive · matching: candidates, scoring, assign vs grab",
      bodyEn: `First hard part. Matching is not “sort nearby people and you're done,” and not opening with a machine-learning black box. 2026 whiteboard default: **a simplified constraint optimization**—distance, heading, load, on-time risk, composed into an **explainable score**; the platform **assigns**; timeout **reassigns**. Deep learning and OR paper names are one follow-up sentence: “online you can have a model for cook time / road time; the board still uses a rule score.”

${D2}

| | Assign (**default**) | Broadcast grab |
|---|---|---|
| Who decides | **the platform** picks 1 by score (or a short-window batch) | nearby couriers race, first accept wins |
| Global | can manage load, heading, fairness | easy to cherry-pick nearby orders; far orders sit |
| Timeout | **T seconds no accept → reassign** is a hard path | nobody grabs → expand the ring / bump the fee |
| fan-out | notify 1 (or a few backups) | nearby N people; louder at peak |
| Fits | **food-delivery fulfillment**; you need an ETA promise | early stage, surplus capacity, courier-flash “whoever is on the way” |

In public interviews, a human dispatcher comparing order-by-order beats pure grab at small scale; at scale you have to system-assign. Grab is fast to build, but cherry-pick punches on-time through—so it's the contrast, not the 2026 first answer.

${D2}

**This diagram cites**: Ch19 Nearby / LBS

Pipeline (stop at these four steps on the board):

1. **Recall:** drop the pickup into a cell, **take candidates from neighbor cells** (algorithm back to Ch19, don't re-teach this loop). Only online couriers whose \`last_seen\` is not stale.
2. **Filter:** wrong vehicle, already at capacity, suspended for violations, obviously the wrong heading (moving away from the merchant). Filter is a hard constraint; don't dump it all into the score.
3. **Score:** \`dist\` (to the store), \`heading\` (on the way or not), \`load\` (orders in hand), \`lateness\` (on-time risk for this order + existing ones). Write the weights on the board so the interviewer can change them.
4. **Assign:** top-score one person; optional short window to batch a few orders then pair (delayed decision, so you don't assign then immediately see a better courier). **Don't** solve a full vehicle-routing problem on the board.

ETA after accept: one **routing** call each for pickup and dropoff (external maps or an internal service), plus a cook-time buffer. If you can't estimate, admit you degrade to straight-line distance × speed; **don't write A* live**.

${D2}

Assign carries a \`deadline\` (teaching 15–30 seconds). No ACK / reject: order back to \`pending_match\`, original courier on a short cooldown so you don't ping-pong. Reassign after pickup is expensive; default only in the **not-yet-picked-up** window. After pickup, timeout goes to nudge / CS; don't invent a second OR layer on the board.

**How to say it:**

> “Neighbor-cell recall, then filter, then an explainable score. Default assign, timeout reassign. Grab as contrast. Don't draw deep learning.”

trade-off: assign buys global quality and a reassign path, in exchange for “couriers feel the system is pushing orders.” Grab buys simplicity and courier autonomy, in exchange for cherry-picking and fan-out. An explainable score buys “you can change the weights,” in exchange for being less accurate than an online model—the interview wants you able to change weights, not a black box.`,
    },
    {
      id: "sec-capacity",
      headingEn: "Deep dive · capacity and hotspots: partitions, queues, degrade",
      bodyEn: `Second hard part. Mealtime is not just “QPS got bigger”: **orders and couriers both pile into the same cells**. However smart matching is, when a zone has nobody to dispatch, you queue, rate-limit, degrade—you don't pull every courier in the city for a scan.

${D2}

**This diagram cites**: Ch04 design a rate limiter · Ch42 messaging, resilience, containers

**Partition:** matching stays local by commercial district / cell prefix (same sentence as Ch19 hot cells). Cross-zone dispatch is a bonus sentence: borrow from a neighbor when they have slack; default is not a nationwide broadcast.

**Queue:** when in-zone \`pending_match\` exceeds a threshold, new orders enter a queue, dequeued by promised ETA or order time. Queue-backlog mental model is Ch42—if the consumer (matching worker) can't keep up, degrade; don't grow without a cap.

**Rate limit:** order ingress per zone is a token bucket / sliding window (Ch04 in one sentence): over limit → **429** or “capacity short right now, try again later.” What you limit is **creating a fulfillment order**, not lifting the rate-limiter chapter wholesale.

**Degrade (light to heavy):** stretch the promised ETA → encourage later cook / batching (point at it, don't design pricing) → pause taking orders in non-core zones → matching failure uses the circuit-breaker wording (Ch42): if downstream Loc / routing is down, use straight-line distance + cached location; **don't draw the resilience chapter as the main picture**.

Capacity forecast (orders and on-shift in the next N minutes) can be a pointer: “dispatch stretches ETA / sends fewer far orders based on the forecast”; the board still uses current online count and queue length. Don't recite some company's intelligent-dispatch paper.

**How to say it:**

> “Peak: partition first. Queue backing up → rate-limit and 429 the order ingress. Still not enough → stretch ETA. Circuit breaker / backlog go back to Ch42; this loop doesn't expand them.”

trade-off: partition localizes matching, in exchange for boundary orders having to borrow a neighbor zone. Rate limit protects courier experience, in exchange for conversion dropping—say out loud whether you prioritize on-time or order volume. One city-wide matching pool looks fair; hotspot cells get punched through.`,
    },
    {
      id: "sec-location",
      headingEn: "Deep dive · live location and path waypoints",
      bodyEn: `Third hard part. The track looks like it wants “true real-time,” but courier GPS **once a second** writes the Loc store and the index into a storm. 2026 default: **throttled reports + cell index + expire stale**. On the user side, push only **the one order they're looking at**.

${D2}

**This diagram cites**: Ch19 Nearby / LBS

**Throttle:** teaching **5–10 seconds**, or only when displacement exceeds a threshold (tens of meters). Stationary: send less; moving: send denser. Drop duplicate points. Don't report at 1Hz for the animation.

**Index:** location drops into a cell; matching takes candidates from neighbor cells—**how neighbor cells are computed is Ch19; don't re-teach it here.** Loc store is the latest point (Redis GEO / \`geo:{cell}\` + Hash details), not a trajectory store. Full trajectory is short TTL or a separate pipe; this loop doesn't keep it.

**Expire:** \`last_seen\` older than teaching **30–60 seconds** (or the TTL dropped) → **cannot be a candidate**. Matching treats stale as offline. On the user map you can show “location temporarily unavailable”; don't compute ETA from a five-minute-old point and pretend it's accurate.

Out-of-order / duplicates: carry \`ts\`, only accept a newer point. GPS jumps: simple smoothing or drop impossible speed; point at it, don't write a filtering chapter.

${D2}

**This diagram cites**: Ch40 protocol choices · Ch42 messaging, resilience, containers

Channels are a pointer; the full protocol book is Ch40:

| Direction | Whiteboard default | When you switch |
|---|---|---|
| Courier → service (high-frequency small packets, may need downlink dispatch) | **WebSocket** | weak network / battery: point at **MQTT**; prototype **throttled HTTP POST** |
| Service → user watching the point (one-way) | **SSE** | no push needed → **short-poll** the latest point |

Align with Ch40's wording: location reports want bidirectional, so lean WS; a driver→user status stream can be SSE. MQTT is not the browser default; point at it and stop. Short-poll is simple, burns battery, and at peak looks more like a storm—use it as contrast.

Dispatch notify and location fan-out: push only if someone is watching; backlog, retry, circuit breaker go back to Ch42. **Don't** lecture Kafka partition keys and ISR on this prompt.

**Routing pointer:** after a successful match, use routing to estimate to-store / to-door ETA and a polyline. In the interview say “external or internal routing; failure degrades to straight-line distance.” **Don't implement A*, don't talk road-network tiles, don't plug in a nav SDK.**

**How to say it:**

> “Throttle 5–10 seconds, drop into a cell, expire out of matching. Courier WS or throttled POST; user watching the track is SSE. routing only estimates ETA.”

trade-off: denser points buy a smoother track, in exchange for a location storm and battery. Pushing every in-flight order in the city buys “true real-time,” in exchange for connection count and fan-out. Expire threshold too short → false offline, reassign storm; too long → you dispatch using a dead person's location.`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs old internet answers",
      bodyEn: `<details>
<summary>No Xu chapter · don't lead with “nearby people”</summary>

Alex Xu's two volumes have no “design instant delivery” chapter. Old internet answers mostly stop at: Redis GEO search nearby couriers, assign whoever is closest, WebSocket push points. **The body is rewritten for 2026 public “design food delivery / courier flash / delivery matching” interviews**—not a notes polish, not some company's internal daily orders or paper names treated as facts.

| Old internet / early engineering | How you answer now |
|---|---|
| Stop at “nearby people” GEO | **objective** (ETA / on-time / fairness) + filter + explainable score |
| Default broadcast grab | **assign as default**; grab as contrast; **timeout reassign** is required |
| Open with deep learning / OR black box | whiteboard rule score; a model estimating ETA is a bonus sentence |
| Report every second + everyone WS-mesh | **throttle 5–10s**; push only people who are watching; channel back to Ch40 |
| Re-teach neighbor cells / geohash wholesale | **drop into a cell → neighbor-cell candidates** in one sentence, back to Ch19 |
| Write A* / road network on the board | **routing estimates ETA**; failure → straight-line distance |
| First picture draws tiles / payments / Kafka partitions | **Client → order matching → location → dispatch** |
| Peak = add machines | **partition, queue, rate limit (Ch04), degrade / backlog (Ch42)** |
| Some company's daily orders, courier count, internal algorithm names | **forbidden**; teaching orders of magnitude only |

The skeleton that still holds: nearby recall, live points, dispatch notify, peak will run short of people. What's dated is not talking matching objective and timeout reassign, and lifting the LBS-index prompt, the protocol prompt, and the resilience prompt wholesale.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **“What's the relationship with Ch19 Nearby / LBS?”** → Cell recall is the same index. Ch19 covers radius and neighbor cells; this chapter adds two-sided matching, reassign, and the location storm. Don't re-teach the neighbor-cell algorithm.
2. **“And Ch25's scheduler?”** → Ch25 is backend cron / delayed jobs. Courier matching is supply and demand on the road, not a job worker.
3. **“Why not grab?”** → Grab cherry-picks nearby orders. Assign can manage load and on-time; timeout reassign is the companion path.
4. **“Where does the score come from? Do you need deep learning?”** → Whiteboard: distance, heading, load, on-time risk. Online you can have an ETA model; it is not the first picture.
5. **“Won't timeout reassign ping-pong?”** → Original courier on cooldown; reassign only before pickup; cap the reassign count.
6. **“How often do you report location?”** → 5–10 seconds or a displacement threshold. Once a second is a storm.
7. **“What about stale location?”** → Kick it out of candidates. User side shows temporarily unavailable. Don't promise ETA from a stale point.
8. **“MQTT, WS, or polling?”** → Courier bidirectional WS; weak network points at MQTT; prototype throttled POST; user watching the point is SSE. Details in Ch40.
9. **“Peak with no couriers?”** → Partition and queue, ingress rate limit (Ch04), stretch ETA. Backlog / circuit breaker Ch42.
10. **“How do you plan the path?”** → routing estimates ETA. Don't implement A*, don't render a map.
11. **“What about the order / payment state machine?”** → Ch18 / Ch24. This loop is \`pending_match\` → the fulfillment track.
12. **“What queue for dispatch messages?”** → Point at delivery and backlog (Ch42). Don't lecture partitions.
13. **The final picture is already huge and they want more boxes?** → Tiles, nav SDK, some company's paper, nationwide daily orders are not this chapter's first answer. Going to the bottom on the three hard parts scores higher than twenty boxes.`,
    },
    {
      id: "sec-next",
      headingEn: "Wrap-up and what's next",
      bodyEn: `Never say the design is perfect. Speak three bottlenecks:

| bottleneck | How you take it |
|---|---|
| Matching objective unclear / only “nearby” | explainable score; **assign + timeout reassign**; grab as contrast; don't draw an ML black box |
| Location storm or dead points | throttle reports; drop into a cell, back to Ch19; expire out; channel Ch40; push only people who are watching |
| Peak with nobody accepting, city-wide scan | partition and queue; rate limit Ch04; degrade ETA; backlog / circuit breaker point at Ch42 |

Self-check: close this page. Give the 30-second open + whiteboard Client → order matching → courier location → dispatch, and talk assign vs grab, reassign, throttle and expire, and peak degrade to the air. Wherever you stumble, come back to that section. Do not open by re-teaching neighbor-cell bits. Do not draw tiles.

The mainline design prompts wrap here. **Ch28 · Configuration center** is already in the course: push vs pull, versions, canary—matching weights and timeout T will later become config. Point at it this loop; don't draw a config center into the delivery picture.`,
    },
  ],
  reviewMdEn: `# Ch27 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | Three hard parts of instant delivery? | Matching model (assign vs grab + timeout reassign); live location (throttle / expire); capacity at peak (partition, queue, degrade). |
| 2 | Default scope? | **Same-city food-delivery fulfillment**: pickup + dropoff, near-real-time location. Not map rendering, not the Ch19 radius chapter, don't redraw order / payment. |
| 3 | What is the first question? | Courier flash or food delivery; live track or not; matching objective is ETA / accept rate / fairness. |
| 4 | 2026 matching default? | Neighbor-cell recall → filter → **explainable score** (distance, heading, load, on-time) → **assign**. Don't draw deep learning. |
| 5 | Assign vs grab? | Assign manages global quality and reassign. Grab fan-outs, easy to cherry-pick; use as contrast. |
| 6 | Timeout reassign? | T seconds with no ACK → back to the pool and reassign; original courier on cooldown; default not-yet-picked-up window. |
| 7 | Why not 1Hz location? | Online couriers / interval = report QPS. Once a second is a storm; teaching 5–10 seconds or a displacement threshold. |
| 8 | How do you use cells, who teaches neighbors? | **Drop into a cell → neighbor-cell candidates** in one sentence. Neighbor-cell algorithm is Ch19; don't re-teach this loop. |
| 9 | Stale location? | \`last_seen\` past TTL (teaching 30–60s) kicked out of candidates. Don't promise ETA from a dead point. |
| 10 | How do you point at location channels? | Courier bidirectional **WS** (weak network points at MQTT, prototype throttled POST); user watching the point **SSE** / short-poll. Full book Ch40. |
| 11 | How do you degrade at peak? | Partition and queue; ingress rate limit (Ch04); stretch ETA; backlog / circuit-breaker mental model Ch42. |
| 12 | Biggest over-engineering on this prompt? | Map rendering, A* road network, ML dispatch black box, Kafka partition lecture, some company's daily orders. Go to the bottom on the three hard parts. |`,
});
