import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch18",
  titleEn: "Design an e-commerce order system",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 50–60 min ｜ **Prereq**: CAP grid Ch36; transactions Ch41
> **Goal**: order state machine, inventory hold, payment callback, cancel / timeout close-order. Flash sale and payment clearing are cross-links only—do not unpack them.

E-commerce orders is the tenth full case. The gateway finished "how a request enters the cluster"; this one swaps in **how one transaction stays consistent**. Default is **place an item → hold inventory → pay → ship (mention only)**—not hotel booking (Ch21), not flash-sale Redis hold (also Ch21), not a payment ledger / clearing (Ch24).

It looks like "place an order and take a payment." Three hard parts: **order state machine**, **inventory hold and timeout rollback**, **payment callback idempotent on \`pay_no\` + close-order**. The interviewer is not scoring some company's GMV, a 2PC flowchart, or a fulfillment map. They want: does status jump illegally, can you oversell, and if money lands after close, do you resurrect a closed order.`,
    },
    {
      id: "sec-answer",
      headingEn: "How to answer in the interview",
      bodyEn: `**Opening 30 seconds (say it out loud):**

> "This is e-commerce orders, not hotels, not flash sale, not a payment system. Three hard parts: state machine, inventory hold plus timeout release, payment callback idempotent on \`pay_no\` then close-order. Status: \`created → pending_pay → paid → shipped\`; from \`pending_pay\` the user cancels or timeout goes \`closed\`, both return inventory. Inventory default is **DB CAS hold**; flash-sale Redis Lua is one sentence in Ch21. Payment is redirect + server callback; ledger goes back to Ch24. Side effects via Outbox; no Saga textbook."

Then walk the 4 steps. Do not lead with a warehouse network + split settlement + an end-to-end Saga.

${D2}

| Time-box | What you are doing |
|---|---|
| 3–10 min | Clarify: e-commerce vs hotel/flash sale, hold vs decrement-on-pay, how long until timeout, refunds or not |
| Next 2 min | back-of-envelope: daily order volume as a teaching assumption; place-order QPS is far below flash sale; the fear is consistency, not throughput |
| 10–15 min | High-level: Client → Order API → DB; payment is redirect only |
| 10–25 min | deep dive: state-machine CAS, hold + timeout release, callback idempotency vs close-order race |
| 3–5 min | wrap-up: 3 bottlenecks (illegal status jump, oversell / stuck inventory, callback fighting close-order) |

**red flag:** drawing Redis Lua flash sale before asking scope; leading with 2PC / a full Saga orchestration; turning Ch24's ledger, recon files, and PCI into a chapter; no state machine, just \`UPDATE status\`; treating some company's public GMV as your own fact. That is over-engineering, or dragging a neighbor chapter in whole.`,
    },
    {
      id: "sec-clarify",
      headingEn: "Clarifying questions",
      bodyEn: `Drawing before you clarify = Jimmy. On orders, stop at 5–7 questions; assume the rest and write the board. **The first question must be scope.**

| You ask | Typical answer / your assumption | What it changes |
|---|---|---|
| E-commerce order, hotel booking, or flash sale? | **Ordinary e-commerce item order** | hotel room-type / Redis spike is Ch21 |
| Inventory: hold on place, decrement on pay, or deduct on place? | **Hold + timeout release** | stop oversell without locking stock forever |
| How long is the payment timeout? | Teaching: **15–30 minutes** | delayed message + scan as a safety net |
| Refunds / split settlement / multiple PSPs? | Callback is idempotent to \`paid\`; ledger is **Ch24** | this loop does not draw a ledger |
| Single-warehouse SKU or split across warehouses? | **Single-warehouse SKU** | split orders / delivery is a neighbor; mention only |
| Rough daily orders? | Teaching: **~1 million orders/day** | proves the bottleneck is consistency, not QPS |

When they say "you decide," write the assumptions:

> "I'll assume: ordinary e-commerce checkout, not flash sale. DB hold on place; unpaid after 15–30 minutes closes and releases. State machine \`pending_pay → paid | cancelled | closed\`. Payment is PSP redirect; the server callback is authoritative, idempotent on \`pay_no\`. I'll draw on that—cut me off if it's wrong."

If they chase flash sale / hotels / wallets: **acknowledge the difference, then close it.** "Flash sale has to stop concurrency in front of Redis—that's Ch21; hotels book a room-type + date. Payment ledger and recon files are Ch24. This loop is order status and three-party consistency." Asking past 10 minutes is also a red flag. The golden line is still: **ask the key questions → state your own assumptions → write the board → move.**`,
    },
    {
      id: "sec-estimate",
      headingEn: "Back-of-the-envelope",
      bodyEn: `Formulas live in Ch03. Here you only need order of magnitude: prove you know **this prompt's bottleneck is status and inventory consistency, not "nationwide place-order QPS."** Whiteboard **teaching assumptions** below—not some company's internal numbers, and not some promo-day GMV.

Assume ~**1 million orders created per day**; payment conversion ~**70%**; unpaid close-order ~**20–30%**. Reads (My orders) outnumber writes, but a wrong write path is oversell or double-booking money.

| Item | How you estimate | Order of magnitude (teaching) |
|---|---|---|
| Place-order QPS | 1e6 / 86400 | **~12**; peak ×10 is still **hundreds** |
| Payment callbacks | ~0.7 × place-order | same order; the PSP **retries**, so QPS by "notification count" is a bit higher |
| Timeout close | unpaid × once per order | delayed consume; not an ingress bottleneck |
| Storage | header + lines ~2–4 KB; ~360 million/year | **TB/year**; shard by \`user_id\` or \`order_id\` (Ch41) |
| vs flash sale | one SKU, instant 10k–100k QPS | **not this chapter**; Ch21 |

Everyday e-commerce writes are small. What is expensive is: **concurrent holds on the same SKU must not oversell**, and **callback, user cancel, and timeout-close are three writers racing one row**. Drawing ingress at 100k QPS and never mentioning CAS is answering the flash-sale prompt in the wrong room.

**Interview line:**

> "A million orders/day on the board: place-order is teens of QPS daily, hundreds at peak. This is not a throughput prompt. I spend the time on the state machine, the hold, and callback idempotency. I will not treat some company's GMV as an internal number."

Common mistakes: treating a promo flash-sale peak as ordinary checkout; or reporting only place-order and pretending callback retries and the close-order worker do not write the DB. Teaching uses order of magnitude, and you **label the assumptions**.`,
    },
    {
      id: "sec-arch",
      headingEn: "High-level architecture",
      bodyEn: `Left to right, draw only **one checkout control plane**: Client → Order API → DB. Do not fan out warehouses, a ledger, risk, or multi-Region on this diagram. Inventory defaults to **same DB, one-row CAS** with the order (Ch41); payment is "jump to the PSP, come back on the callback." After they buy in, split the state machine and the hold.

${D2}

**This diagram cites**: Ch41 Replication, sharding, transactions · Ch36 CAP / PACELC

${D2}

**schema (enough, then stop):** \`orders\` (order_id, user_id, status, pay_no, expire_at, amount_cents, idem_key); \`order_items\` (order_id, sku_id, qty); \`inventory\` (sku_id, available, reserved). \`pay_no\` is **UNIQUE**. Amounts are integer cents, not float. Do not draw five wide tables on the board.

**Write path:** auth + idempotency key (stop double-click double-order) → one transaction INSERT order \`pending_pay\` + \`UPDATE inventory SET available=available-n, reserved=reserved+n WHERE available>=n\` → write Outbox (delayed close / domain events) → 200 + payment redirect. If \`WHERE\` hits 0 rows, roll the whole order back and say out of stock.

**Read path:** "My orders" lists by \`user_id\`; detail by \`order_id\`. This is not Feed; do not put a CDN on the read path.

**Consistency line (point to Ch36):** the hold itself wants **CP** (oversell is unacceptable); callback and fulfillment can be short-window eventual, via the state machine + recon—do not replace CAS with a CAP slogan. Three-party recon (order status / inventory reserved / PSP success) is one sentence; file-level recon is Ch24.

Stop the high-level here. Ask: "Does this direction look OK? Next I'll dig into the state machine, then hold and timeout rollback, then callback idempotency and the close-order race."

**Interview line:**

> "Clients hit Order API; orders and inventory share a DB first. Payment's ledger does not go on this diagram. Flash-sale Redis does not go on it. Side effects via Outbox."`,
    },
    {
      id: "sec-fsm",
      headingEn: "Deep dive · Order state machine",
      bodyEn: `First hard part. An order is not a sticky note you can scribble on: **only legal edges, and every update is CAS.** 2026 whiteboard default: draw the happy path left to right. Do not draw a tall state tree.

${D2}

**This diagram cites**: Ch41 Replication, sharding, transactions

\`created\` is the insert instant (or "writing"); after the inventory hold commits, the user sees **\`pending_pay\`**. Two extra edges off \`pending_pay\` stay off the happy path—write them beside it: user cancel → \`cancelled\`; expiry worker → \`closed\`. Both are terminal; both release the hold. \`shipped\` only after \`paid\` (fulfillment is a mention; logistics is Ch27).

| Edge | Who fires it | Inventory |
|---|---|---|
| → \`pending_pay\` | place-order txn commits | already held |
| \`pending_pay\` → \`paid\` | payment callback (authoritative) | **commit** reserved |
| \`pending_pay\` → \`cancelled\` | user | release |
| \`pending_pay\` → \`closed\` | timeout | release |
| \`paid\` → \`shipped\` | warehouse event | do not touch the hold (already committed) |

**Illegal jumps:** \`paid → pending_pay\`; \`closed/cancelled → paid\` (a late success callback is a **refund**, Ch24—do not resurrect a closed order into paid); \`shipped → pending_pay\`. No state machine, just an absolute \`SET status='paid'\`, is the biggest red flag in this loop—callback retries and close-order will overwrite each other.

Implementation in one line: \`UPDATE orders SET status=:to WHERE id=? AND status=:from\`. 0 rows = someone else won the race; look at the current row and decide idempotent 200 vs compensate. Place-order idempotency is a unique \`idem_key\`; that is a different thing from status CAS: the former stops double orders, the latter stops double jumps.

**Interview line:**

> "Happy path created → pending_pay → paid → shipped. Cancel and timeout only leave pending. Every status change is CAS. A closed order cannot become paid."

trade-off: finer states (paying, partial-ship) help ops; too many states on the board and you miss an edge—get 5–6 states right first. Turning the state machine into a rules engine / workflow platform is over-engineering.`,
    },
    {
      id: "sec-hold",
      headingEn: "Deep dive · Inventory hold and timeout rollback",
      bodyEn: `Second hard part. You should be able to name all three deduct styles; **this chapter defaults to hold**.

| | Deduct on place | Deduct on pay | Hold + timeout release (**default**) |
|---|---|---|---|
| Oversell | hardest | may be OOS after they paid | blocked at hold time |
| UX | unpaid still locks stock | they pay, then find no stock | unpaid expires, stock returns |
| Implementation | simple | callback path is messy | need close-order + idempotent release |
| Interview | locks stock too hard | common in e-commerce, does not stop "paid but OOS" | **first answer in 2026** |

Hold is not "drive \`available\` negative and live with it." Whiteboard SQL:

\`UPDATE inventory SET available = available - :n, reserved = reserved + :n WHERE sku_id = ? AND available >= :n\`

That is one CAS: not enough → 0 rows, txn rolls back. Payment success **commit**: \`reserved -= n\` (sold; you can also \`sold += n\`, depending how you book it). Cancel / timeout **release**: \`reserved -= n, available += n\`, also with \`reserved >= n\`, so a double release cannot fly the books.

${D2}

**This diagram cites**: Ch41 Replication, sharding, transactions

**Timeout rollback:** on place, stamp \`expire_at\`; Outbox emits a delayed message (or a delay queue). Expiry worker: **only if still \`pending_pay\`** CAS to \`closed\` and release. Message lost? **Scan as a safety net** (scan expired pending by \`expire_at\`); do not trust a single MQ delivery. Delayed messages are on-time; the scan is correctness. Scheduler details wait for Ch25; mention only here.

**One-sentence split with flash sale:** only when a hot SKU turns the DB row into a serial bottleneck do you move the hold to **Redis Lua**, and the DB only accepts orders already reserved—that is Ch21. Ordinary orders with DB CAS is the right default, not "not cool enough."

When order and inventory split into two services: local txn writes the order + Outbox; the consumer does hold/release **idempotently** (by order_id). Do not put 2PC on the first diagram. Same-DB passes the interview; split-DB uses Outbox compensation; name Saga, point to Ch41, stop.

**Interview line:**

> "Place-order CAS hold. Paid commits; cancel or timeout releases. Close-order CAS pending so it does not fight the callback. Redis is flash sale; this chapter does not draw it."

trade-off: hold locks unpaid stock for 15–30 minutes, and almost always has stock when they pay. Decrement-on-pay feels like "order first, race later"; oversell and refunds go up. Malicious repeat-place to lock stock: rate-limit + unpaid-count; do not switch back to decrement-on-pay as the first answer because of that.`,
    },
    {
      id: "sec-callback",
      headingEn: "Deep dive · Idempotent payment callback and close-order",
      bodyEn: `Third hard part. Money lives at the PSP; the order only trusts the **server callback**. Browser redirect "payment success" is not trusted—UX only. The PSP notifies **at least once**, so you must be idempotent on \`pay_no\`. Payment page, ledger, split settlement, recon files all go back to **Ch24**.

${D2}

**This diagram cites**: Ch41 Replication, sharding, transactions · Ch24 Payment system

**Where idempotency lands:** unique index on \`pay_no\` (PSP txn id or merchant payment id—pick one on the board and do not switch). First INSERT of the payment row succeeds → then you may \`pending_pay → paid\` + commit inventory. Second time, same \`pay_no\`: UNIQUE conflict, **200 immediately**, do not commit again. Do not use "SELECT then update" as the only defense—two callbacks both see pending. For concurrency, a row lock or racing the UNIQUE \`INSERT\` is enough; no global lock.

**Close-order vs callback race (must say):** the worker wants to close a timed-out order; the callback wants to mark the same order paid. Both CAS \`pending_pay\`. Whoever commits first wins.

| Who finished first | What the late one does |
|---|---|
| Callback set \`paid\` | close-order CAS fails; **do not release inventory** |
| Close-order set \`closed\` | callback CAS fails; PSP already took money → **refund** (Ch24); never \`closed → paid\` |

That is why close-order cannot \`WHERE id=?\` unconditional SET closed. Late money is not "resurrect the closed order."

${D2}

User cancel and timeout close share **the same inventory release**; the only difference is the trigger: sync API vs delay/scan. Both may only hit \`pending_pay\`. A paid order is not "user taps cancel = close-order"—that is after-sales / refund.

**Outbox (mention, not a Saga class):** status change and "notify fulfillment / delayed close / release inventory (if inventory is another DB)" write an outbox table in the **same local transaction**, then publish to MQ (Ch41). Consumers are idempotent on \`order_id\` + event type. Under backlog, the order is already in the DB; fulfillment can be slow. Do not fire warehouse RPC synchronously on the callback thread.

**Three-party recon, mention only:** end of day, pull "PSP success ∩ order not paid" and "order paid ∩ inventory not committed." Fix numbers with compensating orders; do not re-run a non-idempotent deduct. CAP language: the hold wants linearizability; vs the PSP you trade latency for confirmation (PACELC)—details Ch36 / Ch24.

**Interview line:**

> "Redirect is for the user; the callback changes the order. pay_no is unique. Close-order and callback both CAS pending. If close-order wins, refund—do not resurrect. Side effects via Outbox."

trade-off: strict CAS turns "paid after close" into a refund cost, and you get inventory and status you can explain. Doing deduct + ship RPC synchronously on the callback binds p99 to PSP retries—that is a red flag.`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs no dedicated book",
      bodyEn: `<details>
<summary>No Xu chapter; old web answers are not the first answer</summary>

Alex Xu's two volumes have no "Design an e-commerce order system." Hotel booking (hold / timeout) and payments (callback / idempotency) only lend a skeleton. **The body is rebuilt from 2026 domestic / general public "design an order system" interviews**—not a polish of some notes, and not a reskin of the hotel or payment prompt. The web still loves "lead with microservices + 2PC," "flash-sale Redis as ordinary checkout," "decrement-on-pay as the only answer," "run fulfillment synchronously inside the callback"—that is tutorial inertia, not today's whiteboard default.

| Old web / tutorial inertia | How you answer now |
|---|---|
| No state machine, just mutate a field | **explicit states + CAS**; no jumping back from a terminal state |
| Decrement-on-pay as the default | **hold + timeout release**; if you decrement on pay, say oversell |
| Redis Lua on ordinary checkout | **DB CAS**; Lua is Ch21 flash sale |
| 2PC / a big Saga as the first answer | same-DB txn; cross-DB **Outbox**; Saga, point to Ch41 |
| Browser sync payment result as truth | **server callback**; redirect is UX only |
| Callback not idempotent / SELECT only | **\`pay_no\` UNIQUE** |
| Close-order unconditional UPDATE | **CAS pending**; lose to the callback → refund |
| Trust delayed messages alone to close | **delay + scan as a safety net** |
| Draw ledger, split settlement, PCI into orders | **Ch24** |
| Some company's GMV / promo peak as fact | **teaching assumptions**; order of magnitude only |

Still-valid skeleton: placing an order must reserve stock, unpaid must return it, money and goods status must line up, PSP notifications repeat. Outdated is leading with flash sale, 2PC, and a payments platform as the first diagram of an orders prompt.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **"How does this relate to hotel booking / flash sale?"** → All of them reserve scarce inventory. This chapter is ordinary SKU + DB hold. Room-type+date, Redis Lua spike → Ch21.
2. **"Why not decrement on pay?"** → Less stock locked, but they may pay and find no stock, then you refund. E-commerce defaults to hold.
3. **"Why not Redis hold?"** → Everyday QPS is not hot enough. Row lock / CAS is enough. Lua stopping concurrency in front of the DB is flash sale (Ch21).
4. **"Who closes on timeout?"** → Delayed messages are on-time; the scan is correctness. Full-table poll is dumb; trusting one MQ delivery leaks.
5. **"Callback arrives twice?"** → \`pay_no\` unique; second time 200. Do not commit inventory again.
6. **"Close-order and pay arrive together?"** → Both CAS \`pending_pay\`. Close-order wins → refund, never \`closed → paid\`.
7. **"Can redirect count as success?"** → No. User kills the process, gateway timeout, they all lie to you. Authority is the callback.
8. **"Do you need 2PC?"** → Not as the first answer. Same-DB txn; cross-service Outbox. 2PC is a red flag.
9. **"How do you orchestrate a Saga?"** → Name the compensations: close-order release; pay after close → refund. Do not draw an orchestration engine. Ch41.
10. **"What about CAP?"** → The hold wants consistency (oversell is unacceptable). vs the PSP: eventual + recon. Slogans go back to Ch36.
11. **"Double-click placed two orders?"** → Client \`Idempotency-Key\` unique constraint. Not the same key as \`pay_no\`.
12. **The final diagram is already huge and they keep stacking?** → Warehouse networks, ledger, flash sale, promo engines are not this chapter. Three hard parts spoken clearly scores higher than 20 boxes.`,
    },
    {
      id: "sec-next",
      headingEn: "Wrap-up and what's next",
      bodyEn: `Wrap-up never says perfect. Three bottlenecks out loud:

| bottleneck | How you take it |
|---|---|
| Illegal status jump / last-write-wins | Explicit state machine; \`UPDATE … WHERE status=:from\` |
| Oversell or stock locked forever | DB CAS hold; timeout/cancel release; Redis only for flash sale |
| Callback fighting close-order | \`pay_no\` idempotent; both CAS pending; loser refunds, no resurrect |

Self-check: close this page. 30-second opening + high-level on the board; walk state-machine CAS, hold + timeout release, and callback vs close-order to the air. Wherever you stumble, come back to that section. Ch21 / Ch24 are boundary callouts only—do not open your mouth on Lua or the ledger.

Next problem is **Ch19 · Nearby / LBS**. Orders is one transaction's status and inventory; LBS swaps in "how you query nearby points"—from write-path consistency to a geo index on the read path.`,
    },
  ],
  reviewMdEn: `# Ch18 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | Three hard parts of an order system? | State machine; inventory hold and timeout rollback; payment callback idempotent on pay_no + close-order. Do not unpack flash sale / ledger. |
| 2 | Default scope? | **Ordinary e-commerce item order**. Not hotels, not flash sale (Ch21), not payment clearing (Ch24). |
| 3 | Happy-path states? | \`created → pending_pay → paid → shipped\`. Off pending: \`cancelled\` / \`closed\`. |
| 4 | How do you change status? | \`UPDATE … WHERE status=:from\`. No unconditional SET. Terminal states cannot jump back to paid. |
| 5 | Three deduct styles? Default? | Deduct on place / decrement on pay / **hold + timeout release (default)**. |
| 6 | Hold SQL intuition? | \`available-=n, reserved+=n WHERE available>=n\`. 0 rows → rollback. |
| 7 | How do you close on timeout? | Delayed MQ + \`expire_at\` scan as a safety net. Only CAS \`pending_pay → closed\`, then release. |
| 8 | Is redirect the payment authority? | **No**. Redirect is UX only. Server callback changes the order. Details Ch24. |
| 9 | How is the callback idempotent? | \`pay_no\` **UNIQUE**. Second time 200 immediately; do not commit inventory again. |
| 10 | Close-order and pay at the same time? | Both CAS pending. Close-order wins → **refund**, never \`closed → paid\`. |
| 11 | How do you emit side effects? | Local txn **Outbox** (Ch41). Not 2PC / a big Saga as the first answer. |
| 12 | Biggest over-engineering on this prompt? | Flash-sale Redis, payment ledger, 2PC, warehouse network. Speak the three hard parts. |`,
});
