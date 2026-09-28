import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch26",
  titleEn: "Red packet / lucky money",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 50–60 min ｜ **Prereq**: payments Ch24; cache Ch38; transactions Ch41
> **Goal**: split the packet, inventory without oversell, expiry refund, recon. Money and channels go back to payments; don't expand the wallet.

The scheduler covered “fire once when due.” This prompt is **how you split a fixed total, how you don't get oversold, how leftovers go back**. Default is a **group red packet**: fixed total, limited count, random or even split, leftover refunded on expiry. Not the wallet elective, not securities, not redrawing Ch24's payment channels—red packets sit on the **business inventory** side; money is in payments / the ledger.

The system looks like: send a packet, the group grabs a few times. Three hard parts: **how to split (pre-generate vs on-the-fly random)**, **atomic inventory, no oversell**, **expiry refund + the payment-reconciliation boundary**. The interviewer is not scoring some New Year's Eve public QPS, a red-packet-rain ops console, or wallet double-spend. They want: do N amounts sum to one extra cent; can the same \`packet_id\` oversell under concurrency; when that last cent refunds on expiry, can inventory and the ledger line up.`,
    },
    {
      id: "sec-answer",
      headingEn: "How to answer in the interview",
      bodyEn: `**Opening 30 seconds (say it):**

> “This is a group red packet, not a wallet, not securities, not a full payment channel. Three hard parts: how to split, atomic inventory no oversell, expiry refund and the recon boundary. Fixed total, limited count, lucky-draw or even split, leftover refunded on expiry. 2026 default is **pre-generate at send** (double-mean + shuffle); grab uses Redis Lua to atomically debit **remaining count + remaining amount**. Don't lock a DB row at peak. Freeze, credit, refund go to Ch24; the red packet is only business inventory. Persist via Outbox; recon lines inventory up with the ledger. Expiry jobs point at Ch25.”

Then walk the 4 steps. Do not open by drawing a red-packet-rain platform, wallet accounts, channel settlement, or a company's SET sharding.

${D2}

| Time-box | What you are doing |
|---|---|
| 3–10 min | Clarify: group vs personal / rain, random vs even, pre-generate vs on-the-fly, expiry, how you cut vs Ch24 |
| Next 2 min | back-of-envelope: daily send as a teaching assumption; what you fear is single-packet hotspot oversell, not the nationwide sum |
| 10–15 min | High-level: Client → Packet API → Redis inventory; money stays off this picture |
| 10–25 min | deep dive: pre-generate vs on-the-fly random, Lua atomic debit, expiry refund + payment recon |
| 3–5 min | wrap-up: 3 bottlenecks (doesn't sum, oversell, refund vs ledger mismatch) |

**red flag:** drawing wallet / securities before you asked scope; \`FOR UPDATE\` on the packet row at peak; DECR count only and ignore amount; opening with 2PC against payments; drawing Ch24 ledger accounts into the first picture; treating some New Year's Eve QPS as your fact. That is over-engineering, or lifting a neighbor chapter / an elective wholesale.`,
    },
    {
      id: "sec-clarify",
      headingEn: "Clarifying questions",
      bodyEn: `Drawing before you asked = Jimmy. On red packets, stop at 5–7 questions; assume the rest and write the board. **The first question must be scope.**

| You ask | Typical answer / your assumption | What it changes |
|---|---|---|
| Group, personal, or red-packet rain? | **group** (fixed total, limited count) | Personal = 1 share, no split; rain is a campaign drop, not this loop |
| Lucky-draw or even split? | **lucky-draw first**; point at even | Even still needs atomic count debit |
| Pre-generate amounts, or random at grab? | **pre-generate (default)** | On-the-fly double-mean as the contrast; see the table |
| How long until expiry? Leftovers? | teaching **24h**, leftover back to sender | Scheduler points at Ch25; refund exit is Ch24 |
| Where is the money? Draw a wallet? | **payment freeze / credit / refund** | Wallet elective is paused; don't rewrite channels |
| Redis already, or DB only? | **Redis + a packet table** | Peak inventory is Lua; don't lock a DB row |

When they say “you pick,” write the assumptions:

> “I'll assume: group red packet, fixed total, limited count, lucky-draw. At send, double-mean pre-generate and shuffle into a Redis List. Grab: Lua atomically debit remaining count and remaining amount; \`(packet_id, user_id)\` once per person. Amounts in integer cents. Open for grab only after payment succeeds; leftover on expiry refunds via Ch24. I'll draw this; interrupt me if it's wrong.”

If they bring up wallet / securities / red-packet rain / a full payment channel: **acknowledge the difference, then close the scope.** “Wallet is account balance and double-spend; securities is matching; electives are paused. Red-packet rain is campaign inventory, not a social group packet. Channels, ledger, day-cut files are Ch24; this loop only calls freeze / credit / refund. Flash-sale remaining count is a cousin (Ch21); this chapter adds the amount dimension. This loop I will go to the bottom on split, atomic inventory, and refund recon.” Asking past 10 minutes is also a red flag. The golden line is still: **ask the key questions → state your assumptions → write the board → move.**`,
    },
    {
      id: "sec-estimate",
      headingEn: "Back-of-the-envelope",
      bodyEn: `The formulas live in Ch03. Here you only need order of magnitude, to show you know **this problem's bottleneck is single-packet hotspot oversell and a one-cent mismatch, not “nationwide red-packet QPS.”** The numbers below are **teaching assumptions** on the board—not some company's internals, not a New Year's Eve public peak.

Assume: about **1 million** group packets sent per day; N per packet teaching **10–100** (social-group order of magnitude, not rain); grab only after payment succeeds.

| Item | How you estimate | Order of magnitude (teaching) |
|---|---|---|
| Daily grabs | 1e6 packets × ~10 grabs / 86400 | **~hundreds of QPS**; peak multiplies with a campaign—still label the assumption |
| Single-packet hotspot | the same group tapping the same \`packet_id\` at once | **this is what the inventory lock must stop**; nationwide sum is not the score |
| Pre-generate storage | N integer cents + metadata per packet | **KB class / packet**; the List is short, don't fear it |
| Grab records | one row \`(packet_id, user_id)\` | same order as grab count; shard by packet (Ch41) |
| vs “New Year's Eve peak” marketing | do not invent some night's QPS on the board | **this loop does not score on throughput** |

The worldwide sum of everyday group packets is tiny. What costs is: **the same packet's remaining count / remaining amount must not go negative**, and **grabbed sum + remaining = total**. Drawing a 100k QPS ingress then \`SELECT … FOR UPDATE\` on that one row is copying the wrong flash-sale answer.

**How to say it:**

> “Whiteboard: a million packets/day; daily grabs in the hundreds of QPS. Time goes to per-packet atomic inventory, split, and refund recon. I will not treat some night's public peak as an internal number.”

Common mis-counts: treating red-packet rain / Spring Festival campaign peaks as ordinary group packets; or only quoting sends, then pretending grabs and expiry refunds don't write the DB. Use teaching orders of magnitude, and **label them as assumptions.**`,
    },
    {
      id: "sec-arch",
      headingEn: "High-level architecture",
      bodyEn: `Left to right, draw **one grab control plane**: Client → Packet API → Redis inventory. Do not fan out wallet, channels, risk, or red-packet rain on this picture. Money is Ch24; this picture is only business inventory. After the interviewer buys in, then dig into split and expiry.

${D2}

**This diagram cites**: Ch38 cache and CDN · Ch41 replication, shard, transactions

**Write path (send):** validate total, count, floor 1 cent → write a \`packets\` row \`pending_pay\` (\`pay_no\`, \`total_cents\`, \`total_n\`, \`expire_at\`) → call payments to freeze the total (Ch24). **No grab before the callback succeeds.** Payment success: pre-generate N shares (or even split) → load Redis (List of amounts + Hash remaining count/amount + expiry TTL) → CAS \`open\`. TTL slightly longer than business expiry, so the cache doesn't vanish while the packet is still being grabbed (Ch38).

**Write path (grab):** auth + same-group visibility, point at it → **Lua atomic debit** (check already-grabbed, debit remaining, pop amount, record user) → 200 the amount immediately → Outbox writes a \`grabs\` row. Do not \`FOR UPDATE\` the packet row on the grab path, and do not write the DB first then debit Redis.

**Read path:** packet cover (remaining count), grab list. Reads can hit Redis Hash / grab Set; DB is the recon source of truth. Not Feed; no CDN.

**schema (stop when it's enough):** \`packets\` (packet_id, sender_id, total_cents, total_n, remain_cents, remain_n, status, expire_at, pay_no); \`grabs\` (packet_id, user_id UNIQUE, amount_cents, grabbed_at); \`outbox\`. Amounts in **integer cents**. Do not draw a luckiest-draw animation table on the board.

Redis here is an **inventory engine**, not cache-aside read acceleration (Ch38): inside the authoritative window, remaining is whatever Lua says; the DB catches up via Outbox, then recon closes it. Flash-sale remaining count is a cousin (Ch21)—this chapter adds a **remaining amount** dimension, and every cent has to recon back to payments.

Stop the high-level here and ask: “Does this direction look OK? Next I'll dig into how to split, then Lua against oversell, then expiry refund and how you cut vs payments.”

**How to say it:**

> “Client hits Packet API; inventory lives in Redis. Load the packet only after payment succeeds. The ledger stays off this picture.”`,
    },
    {
      id: "sec-split",
      headingEn: "Deep dive · how to split: pre-generate vs on-the-fly random",
      bodyEn: `First hard part. Fixed total, fixed share count; after the split they must **sum exactly to the total**, at least 1 cent each. Lucky-draw also has to “look random”; in expectation the first grabber shouldn't always win.

**Algorithm (lucky-draw): double-mean.** Remaining amount M, remaining people N; the next share is uniform in \`[1, min(2×(M/N), M-(N-1))]\`, last share takes the leftover. Even split: \`total/N\`, remainder sprinkled onto a few shares. All integer cents; no float.

2026 whiteboard default: **compute all N shares at send, shuffle, put them in a List.** On-the-fly double-mean on every grab is only the contrast.

${D2}

| | Pre-generate (**default**) | On-the-fly random (double-mean) |
|---|---|---|
| When you compute amounts | **at send / payment success** | every grab |
| Grab path | List \`LPOP\` + debit remaining | read M, N → random → write M, N back |
| Total | checksum the sum at generate time | last share eats leftover; concurrent grabs must share one Lua |
| Fairness | after **shuffle**, grab order ≠ generate order | first grabber has larger variance (the algorithm itself) |
| Memory | N integers; negligible for a group packet | only remaining; cheaper |
| Fits | **high-concurrency grab**; compute leaves the hot path | huge packets, you don't want a List; or you need a dynamic range |

After pre-generate, **shuffle** is a required sentence: double-mean generated in order has large variance on the first few shares; without shuffle, the first tapper eats “generate order,” not a “random queue.” On-the-fly saves the List, but random still sits inside peak Lua, so debugging “why oversell / why is the last share insane” is harder.

Don't invent a second inventory for even split: the List holds N identical (or off-by-1-cent) numbers; the grab path is the same as lucky-draw. Don't send even split to the DB and lucky-draw to Redis.

**How to say it:**

> “Default: double-mean pre-generate at send, shuffle into a List. Grab is just LPOP. On-the-fly saves memory but the hot path is heavier; use it as contrast.”

trade-off: pre-generate spends memory and “one extra CPU at send,” and grab becomes pure inventory; on-the-fly saves the List, and binds random + debit into one atomic. Both must be **atomic**; neither is “SELECT remaining then UPDATE.” Reciting only the double-mean formula from the internet, never mentioning pre-generate, answered the algorithm and not the system.`,
    },
    {
      id: "sec-stock",
      headingEn: "Deep dive · atomic stock, no oversell",
      bodyEn: `Second hard part. Inventory is two-dimensional: **remaining count** and **remaining amount**, debited together. DECR count only and compute amount separately, and you get “headcount is right, money oversold.” Oversell is unacceptable on red packets—a flash-sale SKU that oversells can restock; here the extra is real money (public interviews often contrast this with ordinary flash sale).

2026 default: at peak, **one Lua script** does check + debit. Don't SETNX a coarse lock on the whole packet, and don't \`FOR UPDATE\` that row. Lua is atomic inside Redis's single thread; a coarse lock serializes every request on the same packet, and when the lock expires you double-debit.

${D2}

**This diagram cites**: Ch38 cache and CDN · Ch41 replication, shard, transactions

Inside the script, in order (one eval; don't split into multiple client commands):

1. Already grabbed → return the grabbed amount (idempotent); don't debit again.
2. \`remain_n <= 0\` or List empty → packet gone.
3. Pre-generate: \`LPOP\` one share; on-the-fly: compute one share from M, N.
4. \`remain_n -= 1\`, \`remain_cents -= amount\` (both dimensions together).
5. Record \`user → amount\` (Hash / Set). Return the amount.

${D2}

**This diagram cites**: Ch41 replication, shard, transactions

Stop at four participants: User / Packet / Redis / Outbox. The DB stays off the synchronous grab path.

**Dual write:** Lua success is authoritative on the grab path; the \`grabs\` row lands async. Fail → retry the same Outbox row; \`(packet_id, user_id)\` UNIQUE blocks a second row. Lua already recorded the user, so a retry grab takes step 1 and will not debit inventory twice. Redis lost: rebuild remaining from DB grabbed-sum, **prefer undersell for a while over oversell**; during rebuild, refuse grabs or go read-only.

Internal invariant (for recon; don't full-scan every grab): \`sum(grabs.amount) + remain_cents = total_cents\`, and \`count(grabs) + remain_n = total_n\`. Broken means oversell or under-record → compensation; don't silently rewrite the Hash.

Difference vs Ch21 flash-sale inventory in one sentence: **that side is often piece count; here both count and amount are inventory, and amount has to recon to the ledger.** Don't take the order chapter's DB CAS debit as the first answer for group grab—QPS sits on a single key; a row lock queues.

**How to say it:**

> “Remaining count and remaining amount debit together in Lua. Debit the cache first; Outbox lands the DB. UNIQUE blocks double-grab. Don't lock a DB row at peak.”

trade-off: Redis is fast inside the window, in exchange for dual-write and recon; a DB row lock the whole way is correct, but the grab path gets punched through by one packet. Client-side “GET remaining, then DECR, then LPOP” is not atomic—that's a red flag.`,
    },
    {
      id: "sec-refund",
      headingEn: "Deep dive · expiry refund and payment-reconciliation boundary",
      bodyEn: `Third hard part. Ungrabbed money must **refund to the sender on the original path** after expiry—not one cent short, not twice. The red-packet system computes “how much is left”; **what actually moves money is payments / the ledger (Ch24)**. How expiry wakes up points at Ch25; don't draw the scheduler as this chapter's main architecture.

${D2}

**This diagram cites**: Ch24 payment system · Ch41 replication, shard, transactions

**How expiry runs:** send carries \`expire_at\` (teaching 24h). Ch25 delayed job or scan of due \`open\` packets. Grab and expiry contend for the same remaining: first Lua / CAS the packet to \`expiring\`, **zero remaining** (later Lua grabs fail). Then call Ch24 refund with \`remain_cents\`; idempotency key \`packet_id\` + an expiry suffix. Refund success → \`expired\`. Refund is at-least-once: a second UNIQUE hit is already success; don't credit another debit.

Remaining already 0: flip status only, don't call refund. Partial grabs: you refund **the remaining frozen at that moment**, not the total. Late grabs after expiry: inventory is frozen, return “gone”; don't reopen an expired packet for UX.

${D2}

**This diagram cites**: Ch24 payment system

| Action | Red-packet side | Payments / ledger side (Ch24) |
|---|---|---|
| Send | \`pending_pay\`, inventory not loaded | freeze / debit sender \`total_cents\` |
| Payment success | pre-generate, load Redis, \`open\` | payment order success; money in platform-escrow terms |
| Grab | Lua debit remaining; Outbox records grab | **async** credit to the grabber; no 2PC |
| Expiry | freeze remaining, stop grabs | refund leftover to sender |
| Recon | grabbed sum + remaining ≟ total | freeze ≟ credited grabs + refunded + in-flight |

Two recon cuts; don't mix them:

1. **Inventory self-check** (this chapter): grabbed amount + remaining = total; grabbed count + remain_n = total_n.
2. **Money recon** (Ch24): in the channel / ledger, this \`pay_no\`'s freeze must equal credited grabs + expiry refund + in-flight. A gap goes to backfill credit or reverse—**don't rewrite history**, and don't debit the sender again.

Don't 2PC / XA with payments: grab success first commits inventory; credit goes through Outbox (Ch41). Slow credit is OK; oversell is not. Backlog uses retry + DLQ; the recon job itself is idempotent (same \`packet_id\` day-cut rerun does not double-refund). How a wallet balance prevents double-spend: elective paused; not this loop.

**How to say it:**

> “Expiry: freeze remaining first, then call refund; refund_id is idempotent. Red packets own inventory; Ch24 owns money. One cut for inventory, one for the ledger; a mismatch goes to compensation.”

trade-off: async credit keeps the grab path short, in exchange for a “grabbed, not yet credited” window, closed by Outbox + recon. Sync RPC to payments before returning the grab result binds p99 to the ledger—worse at peak. Drawing day-cut CSV parsing into the red-packet chapter is lifting Ch24 wholesale.`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs old internet answers",
      bodyEn: `<details>
<summary>No Xu chapter · don't lead with a row lock / some night's QPS</summary>

Alex Xu's two volumes have no “design a red packet system” chapter. Old internet answers are mostly: \`FOR UPDATE\` one row per grab, reciting only the double-mean formula, SETNX on the whole packet, drawing wallet and channel settlement into the first picture, or treating InfoQ 2017 WeChat red-packet public peaks as your own fact. **The body is rewritten for 2026 public domestic “design a red packet / WeChat red packet” interviews**—not a notes polish, not a company's internal architecture class.

| Old internet / early engineering | How you answer now |
|---|---|
| Double-mean only, no pre-generate | **default pre-generate at send + shuffle**; on-the-fly as the contrast table |
| Peak \`SELECT … FOR UPDATE\` | **Lua atomic debit**; DB stays off the sync grab path |
| SETNX lock on the whole packet | Lua is already atomic; coarse lock queues, TTL still double-debits |
| Client GET / DECR / LPOP stepwise | **one Lua**; stepwise oversells |
| Debit count only, amount separately | **remaining count + remaining amount** together |
| Optimistic version lock to grab | money scenarios: conflict-rollback UX is bad; inventory goes to Redis |
| 2017 queue / memcached CAS as the final whiteboard | know “don't let a DB row lock eat peak”; 2026 default Lua + \`packet_id\` |
| Wallet / channels / rain on the first picture | **Client → Packet API → Redis**; money back to Ch24 |
| 2PC / TCC with payments as default | **local inventory + Outbox credit**; refund idempotent |
| Expiry full-table scan, unlocked double-refund | Ch25 due job; freeze remaining + \`refund_id\` |
| Some night's peak QPS / internal SET count | **forbidden**; teaching orders of magnitude only |

The skeleton that still holds: total cannot overshoot, once per person, leftover refunded on expiry, info and money stay separate, recon closes eventual consistency. What's dated is a DB row lock, a coarse lock, and a payments platform as the first picture of a red-packet prompt. The public 2017 write-up stressed request queuing so the DB wouldn't contend on row locks—the direction (don't hit a row lock at peak) still holds; the means on today's board is Redis inventory.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **“What's the relationship with payments?”** → Red packets are business inventory. Freeze, grab credit, expiry refund are Ch24. Don't redraw the ledger and channels.
2. **“And flash-sale inventory?”** → Both are atomic debit. Flash sale is often piece count (Ch21); red packets add the amount dimension, and still have to recon money.
3. **“Why pre-generate instead of on-the-fly random?”** → Grab path is just dequeue; total is checksummed at generate time; after shuffle, order is fairer. On-the-fly as contrast.
4. **“How does double-mean guarantee the sum?”** → Integer cents; last share eats leftover; assert sum when pre-generate finishes.
5. **“Why not lock a DB row?”** → Same-packet hotspot queues. Lua debit inventory; DB lands async.
6. **“Why not SETNX?”** → Whole-packet serial; lock expiry double-debits. Lua is itself atomic.
7. **“DECR count only?”** → No. Amount oversells or undersells. Debit both dimensions together.
8. **“Lua succeeded, persist failed?”** → Outbox retry; UNIQUE blocks a second row. Retry grab takes the already-grabbed branch.
9. **“Same person taps twice?”** → Lua checks already-grabbed first; DB \`(packet_id, user_id)\` UNIQUE.
10. **“Expiry and the last grab at the same time?”** → Both go through freeze-remaining / Lua. Whoever wins, you refund the frozen remaining.
11. **“Why still recon?”** → Dual-write and async credit are briefly unbalanced. One cut inventory, one cut ledger.
12. **“2PC into payments?”** → No. Local inventory commit + Outbox. 2PC is a red flag.
13. **The final picture is already huge and they want more boxes?** → Red-packet rain, wallet, channel settlement, WeChat SET sharding, some night's QPS are not this chapter's first answer. Going to the bottom on the three hard parts scores higher than twenty boxes.`,
    },
    {
      id: "sec-next",
      headingEn: "Wrap-up and what's next",
      bodyEn: `Never say the design is perfect. Speak three bottlenecks:

| bottleneck | How you take it |
|---|---|
| Doesn't sum / first grabber always wins | integer cents; double-mean; **pre-generate + shuffle**; on-the-fly as contrast |
| Oversell or double-grab | Lua debit remaining count and amount together; already-grabbed short path; UNIQUE; don't lock a DB row at peak |
| Expiry refund wrong, ledger won't line up | freeze remaining first then idempotent refund (Ch24); inventory self-check + money recon; Outbox, no 2PC |

Self-check: close this page. Give the 30-second open + whiteboard Client → Packet API → Redis, and talk pre-generate vs on-the-fly, Lua two-dimensional inventory, expiry freeze remaining, and the cut vs Ch24 to the air. Wherever you stumble, come back to that section. Do not open by re-teaching ledger accounts. Do not draw a wallet.

Next problem is **Ch27 · Instant delivery**. Red packets covered “how you split a limited number of cents, how you don't oversell.” Delivery swaps in **dispatch matching, capacity, live location**—the inventory becomes people on the road, not cents in a List.`,
    },
  ],
  reviewMdEn: `# Ch26 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | Three hard parts of a red packet? | How to split (pre-generate vs on-the-fly random); atomic inventory, no oversell; expiry refund + the payment-reconciliation boundary. |
| 2 | Default scope? | **Group red packet**: fixed total, limited count, lucky-draw or even split, leftover refunded on expiry. Not a wallet, not securities, don't rewrite Ch24. |
| 3 | 2026 default split? | **Double-mean pre-generate at send + shuffle** into a List. On-the-fly only stores remaining; use it as contrast. |
| 4 | Double-mean in one sentence? | Remaining M, N people; next share \`[1, min(2×M/N, later people still get ≥1 cent)]\`; last share eats leftover. Integer cents. |
| 5 | How many inventory dimensions? | **Remaining count + remaining amount**, debited together in Lua. DECR count only oversells money. |
| 6 | Why not lock a DB row at peak? | A single \`packet_id\` hotspot queues. Grab path is Lua; DB Outbox lands async. |
| 7 | Why not SETNX the whole packet? | Lua is already atomic. Coarse lock serializes; TTL expiry can double-debit. |
| 8 | How do you close the dual write? | Lua is grab-path authority; \`grabs\` UNIQUE; failed retry takes already-grabbed. Recon: grabbed + remaining = total. |
| 9 | Expiry refund steps? | Scheduler due → freeze remaining, stop grabs → Ch24 refund leftover (\`refund_id\` idempotent). |
| 10 | How do you cut vs Ch24? | Red packet: business inventory. Payments: freeze, grab credit, refund, day-cut ledger. No 2PC. |
| 11 | How do you cut vs flash-sale inventory? | Both are atomic debit. Flash sale is often piece count (Ch21); red packets add the amount dimension + money recon. |
| 12 | Biggest over-engineering on this prompt? | Row lock, wallet, channel settlement, red-packet rain, some night's QPS. Go to the bottom on the three hard parts. |`,
});
