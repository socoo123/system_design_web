import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch21",
  titleEn: "Hotel booking & flash-sale inventory",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 50–70 min ｜ **Prereq**: caching Ch38; rate limiting Ch04; transactions Ch41
> **Goal**: idempotency, optimistic locking, Redis hold, Outbox. Hotel unique inventory vs flash-sale, side by side. Do not rewrite the order/payment chapters.

The queue chapter finished "how events travel reliably"; this prompt swaps in **how you occupy finite inventory without overselling**. Default is an **inventory-decrement contrast**: hotel **room-nights (unique / near-unique resources)** vs flash-sale **one SKU under high concurrency**. Not a full hotel OTA (search, dynamic pricing, channel aggregation), not redrawing Ch18's order state machine, not Ch24 payment clearing.

It looks like booking a night or grabbing one item. Three hard parts: **unique inventory vs flash-sale inventory (two models)**, **Redis hold + timeout release**, **idempotent hold key + Outbox**. The interviewer is not scoring some OTA's room count, some sale-day ingress QPS, or 2PC welding Redis to the DB. They want: do not mix the two gates, who commits vs who releases after a hold, and whether retrying the same hold decrements twice.`,
    },
    {
      id: "sec-answer",
      headingEn: "How to answer in the interview",
      bodyEn: `**Opening 30 seconds (say it out loud):**

> "Two inventory-decrement models—do not mix them. A hotel room-night is **unique inventory**: one row per date, DB **conditional update / version / UNIQUE**; optional oversell just widens the cap. Flash sale is **the same SKU under high concurrency**: first gate is **Redis Lua DECR**, async persist, timeout release; the DB is not the first gate. Holds use an idempotency key. Hold→order events go through Outbox (Ch41)—**no Redis+DB 2PC**. Order state machine is Ch18, payment idempotency Ch24, ingress rate limiting points at Ch04."

Then walk the 4 steps. Do not lead with an OTA kitchen sink, Redlock, or dragging all of Ch18's state machine in.

${D2}

| Time-box | What you are doing |
|---|---|
| 3–10 min | Clarify: room-type pool vs assigned room vs flash-sale SKU, whether oversell is allowed, hold timeout |
| Next 2 min | back-of-envelope: hotel mean is tiny; flash-sale ingress >> stock units; the fear is oversell, not inventing a peak |
| 10–15 min | High-level: Client → Hold API → hold gate → hold row |
| 10–25 min | deep dive: two models, Lua hold + release, idempotency key + Outbox |
| 3–5 min | wrap-up: 3 bottlenecks (wrong model, dangling hold, double decrement) |

**red flag:** drawing the hotel as flash-sale Lua, or the flash sale as \`SELECT FOR UPDATE\`, before asking scope; opening with Redis+DB 2PC / XA; treating Ch18's state machine or Ch24's ledger as this chapter; Redlock as the flash-sale first answer; inventing some company's sale-day QPS as your own fact. That is over-engineering, or dragging a neighbor chapter in whole.`,
    },
    {
      id: "sec-clarify",
      headingEn: "Clarifying questions",
      bodyEn: `Drawing before you clarify = Jimmy. On this prompt, stop at 5–7 questions; assume the rest and write the board. **The first question must be the inventory model.**

| You ask | Typical answer / your assumption | What it changes |
|---|---|---|
| Room-type pool, assigned unique room, or flash-sale SKU? | This loop **contrasts both**; pick the gate first | unique resource → DB; spike SKU → Redis |
| Book a room type or a specific room number? | Chain hotel: **book a type**, assign the room at check-in | not an Airbnb listing; inventory is type + night |
| Allow oversell? | Room-type pool: **optional policy**; assigned room / flash sale: **default no** | different caps; oversell is neither a bug nor required |
| How long is the hold timeout? | Teaching: **10–15 min** | expire → release; scan as fallback |
| Draw the order state machine / ledger? | **No**; boundary Ch18 / Ch24 | this loop stops at hold and inventory |
| Rough scale? | Teaching: hotel daily mean is tiny; flash-sale ingress >> stock | prove the bottleneck is oversell, not mean TPS |

When they say "you decide," write the assumptions:

> "I'll assume: a chain hotel books a room type, not a room number; one inventory row per type per night; DB version CAS. Oversell is not the default; if allowed, only the cap changes. Flash sale on one SKU uses Redis Lua hold, async persist, timeout release. Holds carry an idempotency key, TTL ~15 min. Order states and payment callbacks stay out of this loop. I'll draw on that—cut me off if it's wrong."

If they chase a full OTA, search ranking, ML pricing, Redlock, 2PC: **acknowledge the difference, then close it.** "Search and pricing are not the inventory gate. Flash sale does not rely on Redlock; it relies on Lua atomic DECR. Redis and the DB do not do 2PC—release + Outbox. Ingress rate limiting is Ch04; mention and stop." Asking past 10 minutes is also a red flag. The golden line is still: **ask the key questions → state your own assumptions → write the board → move.**`,
    },
    {
      id: "sec-estimate",
      headingEn: "Back-of-the-envelope",
      bodyEn: `Formulas live in Ch03. Here you only need order of magnitude: prove you know **this prompt's bottleneck is oversell and dangling holds—not "nationwide booking QPS."** Whiteboard **teaching assumptions** below—not some OTA / e-commerce company's internal numbers, and not a public sale-day peak as your own QPS.

Hotel teaching: about **thousands of hotels, million-class rooms**; occupancy ~70%, mean stay ~3 nights → daily bookings ~**2e5**, mean **single-digit to low-teens TPS**. Detail reads >> booking writes. What you fear is a **hot room-type spike** punching through the same room-night, not the daily mean.

Flash-sale teaching: one SKU stock **1e3–1e5 units**; ingress can be **orders of magnitude above stock**. Successful orders cap at stock. The DB only has to absorb "the small set that held successfully"; it cannot absorb ingress itself.

| Item | How you estimate | Order of magnitude (teaching) |
|---|---|---|
| Hotel daily writes | ~2e5 / 86400 | **~2–3 TPS**; a hot room-type spike is still usually **far below** a flash-sale SKU |
| Hotel inventory rows | hotels × types × bookable days | **tens of millions to 1e8** rows; shard by hotel_id (Ch41) |
| Flash-sale ingress | far above stock units | **rate-limit first (Ch04)** then Lua; success path ≈ stock |
| Dangling holds | TTL × unpaid fraction | no release → false sold-out |
| vs everyday commerce | Ch18 ordinary order peak is hundreds | putting the DB as the flash-sale first gate fills connections |

A hotel looks like "TPS is tiny." What is expensive is **contention on the last room of that night**, and every row in a date range having to succeed together. A flash sale looks like "we need a million QPS." What is expensive is **blocking failures in front of Redis**; the success path is still small. Drawing ingress as some company's public sale-day number without the gate is inventing numbers, not estimating.

**Interview line:**

> "Hotel mean is a few TPS; what I fear is overselling a hot room-night. Flash-sale ingress can be huge; successful orders never exceed stock. I will not treat some company's peak as an internal number. Pick the wrong gate and a pretty estimate still oversells."

Common mistakes: reporting only hotel daily mean and pretending there is no spike; or treating flash-sale ingress as QPS the DB must eat. Teaching uses order of magnitude, and you **label the assumptions**.`,
    },
    {
      id: "sec-arch",
      headingEn: "High-level architecture",
      bodyEn: `Left to right, draw only **one hold control plane**: Client → Hold API → hold gate → hold row. Do not fan out OTA search, a Rate service, PSP, or warehouse on this diagram. **Swap the gate by model**: hotel default is DB; flash sale default is Redis. After they buy in, split the two models and release.

${D2}

**This diagram cites**: Ch41 Replication, sharding, transactions · Ch38 Caching · Ch04 Rate limiting

**Write path (shared skeleton):** auth + **idempotent hold key** → hold gate (occupy only if enough) → persist hold row (\`held\`, with \`expire_at\`) → 200. Confirm (payment success / front-desk confirm) → **commit**. Timeout or cancel → **release**. How payment callbacks work is Ch24; how the order jumps states is Ch18. This loop only guarantees: **occupied units = unexpired holds + committed, never above cap**.

**Read path:** hotel detail / remaining count can read cache (Ch38); **the booking still trusts the gate**. Cache over-reports one room, hold is rejected, user refreshes. Flash-sale page is harsher: ingress rate-limits first (Ch04); requests without a token never touch Lua.

Do not unpack at high level: shard key (one sentence: hotels use \`hotel_id\`), CDC backfill of cache, multi-Region. Ask: "Does this direction look OK? Next I'll contrast the two inventory models, then Redis hold and release, then the idempotency key and Outbox."

**Interview line:**

> "Client hits Hold API; the gate occupies first, then we persist the hold. Hotel gate is the DB; flash-sale gate is Redis. Confirm commits; timeout releases. Do not draw an OTA kitchen sink on this diagram."`,
    },
    {
      id: "sec-models",
      headingEn: "Deep dive · Unique inventory vs flash-sale inventory",
      bodyEn: `First hard part. **Oversell is defined the same; the gate is not.** A hotel room-night is near-unique: few units of the same type the same night, mean QPS is low, correctness lives in the DB. Flash-sale same SKU: units can be many, but ingress concurrency can punch through the DB, so correctness lives in Redis first. Both are inventory—**do not turn in the same diagram.**

${D2}

**This diagram cites**: Ch41 Replication, sharding, transactions

**Hotel business in one sentence (do not unpack OTA):** a chain hotel books a **room type**, not a room number; the number is assigned at check-in. That is different from Airbnb **booking a specific listing**. Teaching inventory table: **one row per type per night**, PK \`(hotel_id, room_type_id, date)\`. A multi-night booking = occupy every row in the range; any night short, the whole booking fails.

**Assigned unique room / seat:** one physical room one night, or one seat, **units = 1**. Whiteboard default \`UNIQUE(room_id, stay_date)\` or a conditional update \`reserved < 1\` on that row. Overlapping date ranges can mention an exclusion constraint in one sentence—**not the first answer**. On this resource **oversell is a bug** (unless the business explicitly accepts a walk).

**Room-type pool:** substitutable units > 1. Whiteboard SQL intuition:

\`UPDATE inventory SET reserved = reserved + :n, version = version + 1 WHERE hotel_id=? AND room_type_id=? AND date=? AND version=? AND reserved + :n <= cap\`

0 rows → conflict or full, retry or fail. This is **optimistic locking / CAS**, not SELECT then decrement in the app. \`SELECT … FOR UPDATE\` can be correct, but long locks and deadlocks; under hotel's low contention **do not make it the first answer**. A CHECK constraint (\`reserved <= cap\`) is a last backstop; still pair it with CAS—constraint alone turns every conflict into a wall of errors.

${D2}

\`cap\` defaults to \`total\`. When the business wants oversell (to offset no-shows), raise cap to \`total * (1+rate)\`—**this is policy, not a kind of lock.** The book often writes 10%; 2026 whiteboard says "configurable; assigned rooms default 0." Do not draw ML no-show prediction into this loop.

| | Unique room-night / seat | Room-type pool | Flash-sale SKU |
|---|---|---|---|
| Gate | DB UNIQUE / CAS | DB version CAS | **Redis Lua** |
| Contention | low; only the last room is hot | low to medium | **extreme** |
| Oversell | default no | optional cap | default no |
| Failure shape | unique conflict | 0-row retry | DECR fail, reject immediately |
| Interview default | assigned hotel room / listing | chain hotel | sale-day single SKU |

Why flash sale cannot copy hotel optimistic locking: **under high contention only one version wins, everyone else retries**, DB connections and CPU fill with retries before stock is even gone. So flash sale **the DB is not the first gate**—next section.

**Interview line:**

> "Hotel is one row per type per night, version CAS; assigned rooms use UNIQUE. Do not treat optimistic locking as the flash-sale gate. Oversell only changes cap; it is not another lock."

trade-off: a DB gate is simple and there is one source of truth; you give up spike capacity. A Redis gate has high throughput; you take a window vs the DB and you must release. Drawing both models as the same Lua, or the same \`FOR UPDATE\`, is this loop's biggest red flag.`,
    },
    {
      id: "sec-redis",
      headingEn: "Deep dive · Redis hold + release",
      bodyEn: `Second hard part. Flash-sale path: **rate limit (Ch04) → Lua atomic hold → async persist → timeout release.** Redis here is not Ch38's cache-aside read accelerator; it is the **inventory gate**. Do not drag cache stampede / avalanche into this chapter.

${D2}

**This diagram cites**: Ch38 Cache and CDN · Ch04 Rate limiting

**Why Lua is enough:** while Redis runs Lua it inserts no other commands; check + DECR + write hold key is one step. A single \`DECR\` can decrement too, but going negative, duplicate holds, and missing TTL each need extra round trips—interview default is **one Lua script**. On a cluster put \`stock:{sku}\` and \`hold:{sku}:{key}\` in the same hash tag, or a cross-slot script fails immediately.

Whiteboard script intuition (do not recite a novel): hold key already exists → return already held (**idempotent, do not DECR again**); \`GET stock\` < qty → fail; else \`DECRBY\` + \`SET hold EX ttl\`. Teaching TTL **10–15 min**, aligned with the business hold window.

${D2}

Only these four participants: API holds, DB persists successful holds, Worker scans expiry. **Do not** add a PSP or order service as a fifth person.

**Async persist:** Lua success only means the gate let you through. The hold row goes into the DB (\`held\` + UNIQUE idempotency key). DB fail / process crash → Redis already decremented, DB has nothing: rely on **TTL + Worker release**, do not 2PC Redis and the DB on the request thread. After persist succeeds, **commit**: mark hold \`committed\`, inventory truth is in the DB; on Redis you can delete the hold key or mark confirmed; Worker sees committed and **must not INCR**.

**Release must be idempotent:** Worker only handles rows still \`held\` and expired: CAS them to \`released\`, then \`INCRBY\` the units. Already \`committed\` / already \`released\` → INCR zero times. Trusting only Redis TTL, with no DB status, will add stock back at "expired in the same instant as commit" → **oversell**. Delayed messages can be on time; **scan \`expire_at\` as fallback** (same idea as Ch18 closing unpaid orders; do not redraw the order machine in this loop).

Redis down: the gate is gone; **rebuild stock from DB committed + unexpired held**. Brief undersell (false sold-out) is acceptable; oversell is not. AOF is not the source of truth.

Ingress rate limiting: **point at Ch04**. A token bucket cuts requests to roughly "stock + a small multiple"; Lua is the second gate. Rate limiting does not guarantee no oversell; it only keeps Redis / the app from being punched empty. Per-user purchase caps can live in Lua as a SET of user+sku; do not put Redlock on for that.

**Interview line:**

> "Flash-sale first gate is Lua DECR; the DB only eats successful holds. Timeout CAS release; committed never INCR. Redis dies, rebuild from DB—prefer undersell. No Redis+DB 2PC."

trade-off: a hold blocks oversell in memory; you take dangling holds and release complexity. Treating TTL as the only release races with commit. Wiring XA across Redis and MySQL for "absolute consistency" is this loop's red flag—coordination costs more than the gate itself.`,
    },
    {
      id: "sec-idem",
      headingEn: "Deep dive · Idempotency + Outbox",
      bodyEn: `Third hard part. After a successful hold, two things can still repeat: **the client retries the hold**, and **hold changes need to notify order / downstream**. The first is an idempotency key; the second is Outbox. The payment-callback \`pay_no\` is Ch24—do not mash it with the hold key into one key.

${D2}

**This diagram cites**: Ch41 Replication, sharding, transactions

**Two keys, do not mix:**

| Key | Who mints it | What it blocks |
|---|---|---|
| **hold / \`Idempotency-Key\`** | client | double-click, timeout retry DECR / CAS twice on the same intent |
| **\`pay_no\`** (Ch24) | payment record / channel | callback credits twice; not this loop |

Same hold key: Lua already exists → return the first result; DB \`UNIQUE(idem_key)\`, conflict → return the existing hold, **do not hold again**. Key vs body (sku, qty, room-night) fingerprint mismatch → reject; do not silently occupy the first quantity. TTL is the same order as the hold window; after expiry a new intent is allowed, and that is a new key.

**Do not 2PC Redis+DB.** Gate in Redis, truth in the DB; the window in between is closed by "undersell + release." Cross-service notify even less XA: in the local transaction **commit the hold row + outbox row together**, then deliver \`hold.created\` / \`hold.committed\` / \`hold.released\`. Consumers are idempotent on hold id (Ch41). "Write DB then naked send MQ" on the request thread drops the event when send fails—that is exactly what Outbox fixes.

Hotel same-DB: inventory CAS + INSERT hold + INSERT outbox in **one transaction**. Flash sale: Redis already held; the DB transaction only wraps hold + outbox; failure takes the release path, not a 2PC rollback of Redis. Saga textbook, TCC three-phase: **point at Ch41 and stop**. This loop's compensation is two moves: **release inventory**, **if already paid, refund exit (Ch24)**.

**Interview line:**

> "Holds use an idempotency key; retries do not decrement twice. Downstream events go into the same-transaction Outbox as the hold. Redis and the DB do not 2PC. The payment key is Ch24."

trade-off: Outbox costs an extra table and a dispatcher; you get hold and event born together. Dual-writing Redis and Kafka to save a table misaligns events and inventory. Retelling payment idempotency in this chapter steals Ch24's time.`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs the book",
      bodyEn: `<details>
<summary>How the book / notes told it then (not the first answer)</summary>

Xu Vol.2 hotel booking covers double booking, optimistic locking, one row per date, 10% oversell, 2PC vs Saga thoroughly; room type vs specific room still holds. This body is rewritten around the **2026 inventory gate**: the same chapter contrasts flash sale, default Redis hold instead of putting every lock in the DB. ML pricing, Redlock, and a full microservice diagram from the notes are not the first answer. This is not the notes polished onto the page.

| Book or notes / old web answers | How you answer now |
|---|---|
| Every lock in the DB (pessimistic / optimistic / CHECK) | **Hotel DB CAS / UNIQUE**; flash sale **Lua first gate** |
| 10% oversell as a default fact | **Policy**; assigned room / flash sale default cap=total |
| Never contrast hotel vs flash sale | **Two models in one chapter**; the hard part is not mixing them |
| First answer 2PC / a giant Saga | **No Redis+DB 2PC**; same-DB transaction + **Outbox** (Ch41) |
| Redlock as the flash-sale lock | **Lua atomic DECR**; a distributed lock is not an inventory gate (Ch08) |
| Redis only as a read-only stock cache | In flash sale Redis is the **hold gate**; read cache still has DB as final say (hotel) |
| Full OTA: search / Rate / ML yield | **Not this loop**; stop at hold |
| Order state machine + payment ledger inside the hotel chapter | **Ch18 / Ch24** as boundaries only |
| Some company's sale-day QPS / JD flash sale as fact | **Teaching assumptions**; order of magnitude only |
| Hold, then never talk release | **TTL + CAS release + scan fallback** |

Still-valid skeleton: book a type not a number, one row per date, idempotency key against double-click, optimistic lock under low contention, oversell is cap, cache can be dirty but booking trusts the gate. Outdated is treating a DB lock as the flash-sale answer, and drawing Redis and MySQL into the same XA.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **"How is hotel inventory different from Airbnb?"** → Hotel books a type, assigns at check-in; Airbnb books a listing. The former counts by type+night; the latter is UNIQUE on a unique resource.
2. **"What's the relationship to Ch18 orders?"** → Orders own the state machine and closing unpaid. This chapter owns the gate: how you occupy, how you give back. Do not redraw \`pending_pay → paid\`.
3. **"Why doesn't flash sale use optimistic locking?"** → High-contention retry storm; the DB dies first. Lua blocks failures at the door.
4. **"Why doesn't the hotel use Redis hold?"** → Mean TPS is low; DB CAS is enough, one less consistency window. Hot room types can graduate to Redis; do not default to it.
5. **"How do you implement oversell?"** → Change cap, not another lock. Assigned rooms default no.
6. **"Lua succeeded but the DB failed?"** → No 2PC. TTL + Worker only releases still-\`held\` rows. committed must not INCR.
7. **"Is Redis TTL alone enough to release?"** → No. A race with commit oversells. DB status CAS + scan fallback.
8. **"Double-click decrements twice?"** → Hold idempotency key: Lua EXISTS short-circuit + DB UNIQUE. Not the same key as Ch24's \`pay_no\`.
9. **"Why no Redis+DB 2PC?"** → Coordination is expensive; Redis is not an XA citizen. Undersell can be patched; oversell is an incident. Outbox only covers DB-side events (Ch41).
10. **"What about Redlock?"** → Not an inventory gate. Atomicity is Lua's single thread, not another lock on top (Ch08).
11. **"Can ingress rate limiting replace the hold?"** → No. Rate limiting (Ch04) protects the system; oversell still needs the gate.
12. **"Cache says rooms available, booking says no?"** → Hotel read cache can be dirty (Ch38). The gate is DB / Lua. User refreshes.
13. **The final diagram is already huge and they keep stacking?** → OTA search, ML pricing, ledger, order machine, Redlock are not this chapter. Three hard parts spoken clearly scores higher than 20 boxes.`,
    },
    {
      id: "sec-next",
      headingEn: "Wrap-up and what's next",
      bodyEn: `Wrap-up never says perfect. Three bottlenecks out loud:

| bottleneck | How you take it |
|---|---|
| Wrong gate for the two models | Unique room-night DB CAS / UNIQUE; flash sale Lua first gate, not the DB |
| Dangling hold / release oversell | hold state machine: commit does not INCR; TTL + scan; no 2PC |
| Retry double-decrement / lost events | idempotent hold key; Outbox in the same transaction as the hold (Ch41) |

Self-check: close this page. 30-second opening + high-level on the board; walk the two inventory models, Lua hold + release, idempotency key and Outbox to the air. Ch18 state machine, Ch24 ledger, Ch04 rate limiting as boundaries only. Wherever you stumble, come back to that section.

Next problem is **Ch22 · Object storage**. The inventory gate is "how you occupy units"; the next prompt swaps in how you store a blob—metadata vs data split, erasure coding vs three replicas.`,
    },
  ],
  reviewMdEn: `# Ch21 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | Three hard parts of an inventory prompt? | Unique vs flash-sale two models; Redis hold + release; idempotent hold key + Outbox. Do not rewrite order/payment. |
| 2 | Hotel default gate? | **DB conditional update / version / UNIQUE**. One row per type per night. Assigned room UNIQUE. |
| 3 | Flash-sale default gate? | **Redis Lua DECR** first; async persist; timeout release. The DB is not the first gate. |
| 4 | Book a type or a room number? | Chain hotel books a **type**, assigns at check-in. Airbnb books a listing, treated as a unique resource. |
| 5 | How do you open oversell? | Change **cap**. Room-type pool optional; assigned room / flash sale default no. Not a kind of lock. |
| 6 | Why no optimistic lock for flash sale? | High contention **retry storm**, fills the DB. Lua blocks failures at the door. |
| 7 | Lua succeeded, DB failed? | **No 2PC**. TTL + Worker CAS-releases still-\`held\` rows. committed must not INCR. |
| 8 | Redis TTL alone to release? | **No**. Race with commit oversells. DB status + scan fallback. |
| 9 | What does hold idempotency block? | Same \`Idempotency-Key\` does not DECR / CAS twice. Not the same key as Ch24 \`pay_no\`. |
| 10 | How do you emit events? | Hold row + **Outbox** same transaction (Ch41). No naked send, no Redis+DB XA. |
| 11 | Rate limit vs hold for oversell? | Rate limiting Ch04 protects the system. **Oversell needs the gate**. Read cache can be dirty; booking trusts the gate (Ch38). |
| 12 | Biggest over-engineering on this prompt? | OTA kitchen sink, Redlock, 2PC, fake company QPS, dragging Ch18/Ch24 in. Speak the three hard parts. |`,
});
