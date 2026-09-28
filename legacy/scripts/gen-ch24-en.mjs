import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch24",
  titleEn: "Payment system",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 50–70 min ｜ **Prereq**: Ch36 CAP; Ch18 order boundary; transactions Ch41
> **Goal**: correctness > QPS, ledger, idempotency keys, reconciliation. Wallet / securities: mention and stop. Do not rewrite the order state machine.

Leaderboard finished "compute it fast"; this prompt swaps in **money that cannot be wrong and cannot post twice**. Default is **merchant pay-in / channel callbacks**: create the payment, point at channel routing, callback, post to the ledger, reconcile. Not a digital wallet, not a securities matching engine (both electives paused—one sentence), and not redrawing Ch18's \`created → pending_pay → paid\`—the order state machine already drew that boundary. This chapter sits on the **payment record + ledger** side.

It looks like: place an order, jump to the channel, money comes back. Three hard parts: **idempotency and channel callbacks**, **ledger correctness**, **reconciliation that lines both sides up**. The interviewer is not scoring some processor's public TPS, a PCI textbook, or a wallet product catalog. They want: when callbacks are at-least-once, does the same \`pay_no\` post twice; can the journal / double-entry self-check; when the day-cut file and the internal ledger disagree, how do you close it.`,
    },
    {
      id: "sec-answer",
      headingEn: "How to answer in the interview",
      bodyEn: `**Opening 30 seconds (say it out loud):**

> "This is merchant pay-in, not an order state machine, not a wallet, not securities. Three hard parts: idempotency and channel callbacks, ledger correctness, reconciliation. **Correctness > QPS.** Money uses PACELC **PC/EC** (Ch36): under partition you refuse a split-brain post; even with no partition you wait for the ledger to commit. Create with \`Idempotency-Key\`; channel callbacks are at-least-once, so **post idempotently on \`pay_no\`**. Ledger is append-only; double-entry in one sentence: one txn, debits equal credits, amounts in integer cents. Do not 2PC out to the channel; local commit of the post + Outbox, then notify orders (Ch41). Reconciliation is a day-cut: channel settlement file vs internal ledger. Wallet / securities electives paused."

Then walk the 4 steps. Do not lead with a five-box kitchen sink, a split-settlement platform, or global multi-currency clearing.

${D2}

| Time-box | What you are doing |
|---|---|
| 3–10 min | Clarify: merchant pay-in vs wallet/securities, go through a PSP, single currency, how you cut vs Ch18 |
| Next 2 min | back-of-envelope: teaching daily volume; TPS is tiny; what you fear is double-post, not throughput |
| 10–15 min | High-level: Client → Pay API → Ledger; channel callbacks are async |
| 10–25 min | deep dive: idempotency keys + callbacks, double-entry in one beat, day-cut recon; Outbox not 2PC |
| 3–5 min | wrap-up: 3 bottlenecks (duplicate callback double-posts, books don't balance, the two sides don't line up) |

**red flag:** drawing wallet balances / securities matching before asking scope; dragging the whole Ch18 state machine in; opening with 2PC / XA against the channel; ledger is only \`UPDATE balance\`; callback does SELECT-then-INSERT; treating some company's promo TPS as your own fact. That is over-engineering, or dragging a neighbor chapter / paused elective in whole.`,
    },
    {
      id: "sec-clarify",
      headingEn: "Clarifying questions",
      bodyEn: `Drawing before you clarify = Jimmy. On this prompt, stop at 5–7 questions; assume the rest and write the board. **The first question must be scope.**

| You ask | Typical answer / your assumption | What it changes |
|---|---|---|
| Merchant pay-in, digital wallet, or securities? | **Merchant pay-in + channel callbacks** | wallet balances / matching are electives, paused this course |
| Collect cards yourself or go through a PSP / channel? | **Through a channel**; hosted page, no PAN stored | skip the PCI textbook; channel routing is one sentence |
| Pay-in only, or pay-out too? | This loop is **pay-in** (buyer → platform settlement) | pay-out to sellers: one sentence |
| Single currency or global multi-currency? | **Single currency first** | multi-currency / FX: do not unpack |
| How does this relate to the e-commerce order? | Order status is **Ch18**; this chapter owns the payment record, posting, recon | share \`pay_no\`; do not redraw the state machine |
| Rough daily payments? | Teaching: **~1 million / day** | proves the bottleneck is correctness, not QPS |

When they say "you decide," write the assumptions:

> "I'll assume: merchant pay-in, not a wallet, not securities. Through a PSP / domestic channel; card data never hits our system. Single currency. Create with \`Idempotency-Key\`; callbacks post idempotently on \`pay_no\`. Journal plus double-entry in one beat. Day-cut recon. Order \`pending_pay → paid\` stays in Ch18. I'll draw on that—cut me off if it's wrong."

If they chase wallet / securities / split settlement / BNPL: **acknowledge the difference, then close it.** "A wallet is account balance and double-spend; securities is matching; those electives are paused. Split settlement and multi-seller split: point at payment_order and stop. This loop I will speak callback idempotency, the ledger, and recon." Order timeout close: that is Ch18's CAS; this chapter only exposes "money arrived / needs a refund." Asking past 10 minutes is also a red flag. The golden line is still: **ask the key questions → state your own assumptions → write the board → move.**`,
    },
    {
      id: "sec-estimate",
      headingEn: "Back-of-the-envelope",
      bodyEn: `Formulas live in Ch03. Here you only need order of magnitude: prove you know **this prompt's bottleneck is not one cent wrong and not posting twice—not "national payment QPS."** Whiteboard **teaching assumptions** below—not some processor's internal numbers, and not some promo's public TPS as your own fact.

Assume about **1 million** creates/day; ~**70%** succeed; the channel **retries callbacks** on successes (at-least-once).

| Item | How you estimate | Order of magnitude (teaching) |
|---|---|---|
| Create QPS | 1e6 / 86400 | **~12**; peak ×10 is still **hundreds** |
| Successful posts | ~0.7 × creates | same order |
| Callback count | successes × retry factor (teaching ×1.5–3) | still **hundreds**; the hard part is duplicates, not the peak |
| Storage | payment record ~1 KB; one double-entry = 2 journal rows | **under TB/year**; shard by \`pay_no\` / merchant (Ch41) |
| vs "high-QPS payments" marketing | do not invent some company's peak on the board | **this loop does not score on throughput** |

Day-to-day merchant pay-in writes are tiny. What is expensive: **the same \`pay_no\` hitting twice must post once**, and **internal books and the channel file must line up at day-end**. Drawing a 100k-QPS front door and never saying an idempotency key is answering a throughput prompt in the wrong room.

**Interview line:**

> "A million/day on the board: day-mean a dozen QPS, peak hundreds. Any serious DB holds that. I spend the time on idempotency, the ledger, and recon. I will not treat some company's public peak as an internal number."

Common mistakes: treating wallet second-level transfers or securities matching latency as this loop's cost; or only quoting creates and pretending callback retries do not write the DB. Teaching uses order of magnitude, and you **label the assumptions**.`,
    },
    {
      id: "sec-arch",
      headingEn: "High-level architecture",
      bodyEn: `Left to right, draw only **one payment control plane**: Client → Pay API → Ledger. Do not fan out risk mid-office, split settlement, multi-Region, or a wallet on this diagram. The channel is an async callback, not a fourth vertical tower on this picture. After they buy in, dig into idempotency and recon.

${D2}

**This diagram cites**: Ch41 Replication, sharding, transactions · Ch36 CAP / PACELC

${D2}

**CAP in one sentence (then stop):** posting is **PC/EC** (Ch36)—under partition the minority refuses the write so you do not split-brain two posts; with no partition you still wait for a local ledger commit; you do not trade latency for a wrong book. Between you and the channel it is **at-least-once + reconciliation**. Do not pretend you and the PSP form one XA transaction.

**Write path (create):** auth + validate amount (integer cents) → UNIQUE INSERT of the payment record as \`created\` using the client's \`Idempotency-Key\` → channel routing in one sentence (pick a PSP by method / currency; failover is one more sentence) → 200 + hosted checkout URL / redirect. Card number and CVV **never enter our DB**. Browser redirect "success" is UX only; authority is the server-side callback.

**Write path (callback post):** verify signature → one local txn: INSERT journal (\`pay_no\` UNIQUE) + two double-entry rows + CAS the payment to \`success\` + Outbox (notify orders). Deliver after commit. Do not RPC the order service synchronously on the callback thread.

**Read path:** merchant lookup by \`pay_no\` / merchant order id. Not a Feed; do not put a CDN on the read path. If you show a balance, it is a projection of the journal, not a second source of truth.

**schema (stop when it's enough):** \`payments\` (pay_no UNIQUE, merchant_order_id, amount_cents, status, channel, idem_key, channel_txn_id); \`ledger_entries\` (tx_id, account, debit_cents, credit_cents, pay_no, append-only); \`outbox\`; optional \`idempotency_keys\` (key, request fingerprint, response, expires_at). Amounts are **integer cents**, not float. Do not draw a full chart of accounts on the board.

Cross with Ch18 is this one sentence: **the order trusts the \`pay_no\` callback to move \`pending_pay → paid\`; if close won, refund is this chapter's exit.** State-machine edges and inventory CAS stay in the order chapter.

Stop the high-level diagram here. Ask: "Does this direction look OK? Next I'll dig into idempotency and callbacks, then the ledger, then recon and why not 2PC."

**Interview line:**

> "Client hits Pay API; the ledger is on our side. Channel callbacks are async. Orders only consume Outbox events. I do not draw a wallet."`,
    },
    {
      id: "sec-idem",
      headingEn: "Deep dive · Idempotency and channel callbacks",
      bodyEn: `First hard part. Channel notifications are **at-least-once**: timeout → they resend; you 500 → they resend. Exact-once delivery is not a thing; what you can do is **at-least-once delivery + at-most-once posting**. At-most-once posting is idempotency.

Two keys—do not mix them:

| Key | Who mints it | What it blocks |
|---|---|---|
| **\`Idempotency-Key\`** (HTTP header, Stripe de-facto standard) | client / merchant | double-click create, timeout retry minting two payment records |
| **\`pay_no\` / channel event id** (UNIQUE) | our payment number, or the channel callback id | the same successful callback posting twice |

Create: same key returns the last result (including payment number and redirect URL). Concurrent same key: one processes, others **409 / 429**—do not let two people each insert a record. Key vs body fingerprint mismatch → **422**; do not silently post the first amount. TTL teaching is **~24h** (a common public-PSP window), not some company's internal config.

Callback: HMAC verify + timestamp window first (forgery / replay), then post on the unique key. Do not make "SELECT whether it exists, then INSERT" your only defense—two callbacks both see empty.

${D2}

**This diagram cites**: Ch41 Replication, sharding, transactions

First journal INSERT succeeds → only then CAS \`created/paying → success\` and write Outbox. Second hit on the same \`pay_no\`: UNIQUE conflict, **200 immediately**, do not credit again. A non-200 and the channel keeps retrying—so "in progress" must not 500-loop; if you can succeed idempotently, return 200.

Race with Ch18's close (payment-side view): the order may already be \`closed\`. This chapter **does not revive a closed order**; the channel already collected → **refund / reversal** as a reverse journal. How the order CAS-es pending is already written in that chapter.

${D2}

**Why you cannot 2PC to the channel:** a PSP / WeChat Pay / card network will not join your XA coordinator. Cross-process two-phase commit parks the post on an uncertain network round-trip; partitions make it worse. 2026 whiteboard default: local txn commits ledger + payment record + outbox row (Ch41); a relay then notifies orders. Notification can be slow; the books cannot be wrong. Backlog is retry + DLQ, not turning the callback thread into a sync orchestrator.

**Interview line:**

> "Create with Idempotency-Key; post with pay_no UNIQUE. Callbacks are at-least-once; second time 200. No 2PC with the channel; Outbox notifies orders."

trade-off: a strict unique key turns "channel succeeded, we UNIQUE-conflicted" into an exception for recon, in exchange for never double-posting. Making the callback a sync "update order + ship RPC" ties p99 to channel retries—that is a red flag.`,
    },
    {
      id: "sec-ledger",
      headingEn: "Deep dive · Ledger correctness",
      bodyEn: `Second hard part. The interview is not an accounting textbook. They want **the journal as authority, double-entry that can self-check, amounts not in float.** A balance column can be a cache; it cannot be the only truth.

${D2}

**This diagram cites**: Ch36 CAP / PACELC · Ch41 Replication, sharding, transactions

**Double-entry in one beat (then stop):** under at least one \`tx_id\`, **sum of debits = sum of credits**. Teaching example: debit the channel clearing account \`amount_cents\`, credit merchant pending-settlement \`amount_cents\` (if you split a fee row, it still has to balance). \`SUM(debit_cents - credit_cents) GROUP BY tx_id\` ≠ 0 is a bug you can scan the same day—this is the ledger's built-in assertion, not something you wait for month-end finance to find.

**append-only:** you do not UPDATE a historical amount to "fix" it; you write a reverse journal (reversal / refund). Audit wants a trail, not the last cell painted correct.

**Amount:** store and compute in **integer cents** (minor currency unit). Float turns \`0.1 + 0.2\` into recon noise. The API can ship a decimal string; parse into integers before you post. The book pushed string-not-double, which is the right direction; the 2026 whiteboard first sentence is **integer cents**.

Chart of accounts, assets = liabilities + equity: one sentence—"customer stored value is a platform liability"—then stop; do not teach accounting. TigerBeetle-class specialized ledgers: know they exist, **not** this loop's default. Default is still a relational DB + unique constraint + two journal rows in one txn (Ch41).

You can cut one more knife internally: sum of \`success\` payment amounts should equal the corresponding accounts' activity on the ledger. That is a different knife from "the channel file": first your own books balance, then you line up with the outside.

**Interview line:**

> "Journal is append-only; one txn, debits equal credits; amounts in integer cents. Balance is a projection. We and the channel can disagree for a while; day-cut recon closes it. PC/EC is one opening sentence."

trade-off: writing multiple rows per post is slower and harder to change than \`balance += n\`, in exchange for auditability and a self-check. Mutating balance first and backfilling the journal "for QPS" means when recon disagrees you cannot explain it—that is a red flag.`,
    },
    {
      id: "sec-recon",
      headingEn: "Deep dive · Reconciliation: lining both sides up",
      bodyEn: `Third hard part. Idempotency and local txns cannot stop: a dropped callback, an extra channel notify, an amount sliced by fees, a day-cut timezone mix-up. **Reconciliation is the last line of defense**—periodically match the channel settlement file against the internal ledger; do not assume the outside is always right.

${D2}

**This diagram cites**: Ch41 Replication, sharding, transactions

**Day-cut:** pick a cut (teaching: calendar day or the channel's settlement day); freeze both sides into snapshots inside that window, then compare. In-flight across the cut goes to "pending"—do not force-fail it. Channel file formats differ: first **normalize** into one settlement-event table (channel txn id, merchant \`pay_no\`, integer cents, currency, fee), then match. Do not JOIN a raw CSV onto the production ledger.

| Both sides differ | Usually means | How you close it |
|---|---|---|
| Channel has it, ledger does not | dropped callback / post failed but you never returned 200 | **backfill the post** (still through the idempotent path) |
| Ledger has it, channel does not | we over-posted / channel not yet settled / a test txn | reverse, or wait the next settlement day; do not quietly DELETE journal rows |
| Same \`pay_no\`, amounts differ | fees, partial capture, currency | split fee lines then compare; if it still doesn't balance, open a ticket |

Fixes in three buckets (enough for the interview): auto and classifiable → same idempotent post / reverse path; classifiable but not auto → finance ticket; not classifiable → deep-investigation queue. The recon job itself must be **idempotent on the file** (re-running the same settlement day does not double-backfill).

Recon repairs the **books**, not a replay of a non-idempotent charge. Finding a diff and charging the channel again is turning recon into a second injury.

Pay-out (paying sellers) this loop does not unpack: another flow, another settlement file. One sentence: "the platform is a custodian, not booking the user's money as its own revenue."

**Interview line:**

> "Day-cut: channel settlement file vs internal ledger. Match on pay_no. Diffs go through backfill or reverse; you do not rewrite history. The recon job itself is idempotent."

trade-off: day-cut has a T+1 window, in exchange for a complete file. Streaming recon finds dropped callbacks earlier, but channel-side authority is still the settlement file—both can coexist; get day-cut right on the board first.`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs the book",
      bodyEn: `<details>
<summary>How the book / notes told it then (not the first answer)</summary>

Alex Xu Vol.2 has a dedicated "Design a Payment System" chapter: pay-in / pay-out, payment service / executor / PSP / ledger / wallet, double-entry, hosted page, recon, idempotency. That skeleton still holds. **The body is rewritten for a 2026 merchant-pay-in whiteboard**, not a notes polish. Wallet and securities are the next two chapters in the book—this course **pauses those electives**; this loop is one sentence.

| Book / notes / old internet answer | How you answer now |
|---|---|
| 1M/day, 10 TPS as a book fact | **Teaching assumption**; order of magnitude only; no company's promo TPS |
| Idempotency mainly nonce / payment_order_id | **Two layers**: \`Idempotency-Key\` on create + \`pay_no\` on post |
| First diagram is five boxes + wallet | **Client → Pay API → Ledger**; wallet is elective |
| Strong consistency with the PSP / Raft as the first answer | Posting **PC/EC in one sentence**; with the channel **idempotency + recon** |
| 2PC / a big Saga / TCC as the default | **Local txn + Outbox** (Ch41); TCC in one sentence |
| Double-entry accounting identity unpacked into a lecture | **Debits equal credits + append-only + integer cents** |
| amount as string-not-double | Compute in **integer cents**; wire format may be string |
| Webhook as a name only | **HMAC + timestamp + idempotent 200** |
| TigerBeetle / UPI / Pix / BNPL / PCI 4.0 as must-draw | Know they exist; **not** this loop's main architecture |
| Order state machine written into the payments chapter | **Ch18**; this chapter only shares \`pay_no\` and the refund exit |

Still-valid skeleton: correctness > throughput, hosted page so you touch less card data, settlement file vs ledger, unique key for idempotency. Outdated is treating wallet, securities, 2PC, and a specialized finance DB as the first diagram.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **"How does this relate to the order system?"** → Orders own the state machine and inventory (Ch18). This chapter owns the payment record, posting, recon. Share \`pay_no\`. Do not redraw \`pending_pay → paid\`.
2. **"Why is correctness greater than QPS?"** → Teaching a million/day is a dozen QPS. Double-post and unbalanced books are real money. Throughput is not this loop's scoring point.
3. **"How do you pick CAP?"** → Posting **PC/EC** in one sentence (Ch36). You and the channel are not one CP system; you rely on idempotency and recon. Do not teach a CAP class.
4. **"Why not 2PC?"** → The channel does not join XA. Local commit of the ledger + Outbox. 2PC is a red flag.
5. **"The callback arrived twice?"** → \`pay_no\` UNIQUE; second time 200, do not credit again. Create used a different key: \`Idempotency-Key\`.
6. **"Can the redirect count as success?"** → No. Authority is the signed server-side callback.
7. **"How does the webhook stop fake callbacks?"** → HMAC verify + timestamp window + an allowlist of channels. A fake payload cannot be blocked on amount by the idempotency key alone.
8. **"Why does the ledger need double-entry?"** → One txn walks both sides, sums to 0; a wrong book you can scan the same day. Only mutating \`balance\` has no trail.
9. **"Why not float for amount?"** → Rounding becomes a fake diff. Integer cents.
10. **"If it's idempotent, why still recon?"** → Async does not guarantee delivery. The channel file is the external authority. Recon is the last line of defense.
11. **"Recon finds the channel has it, we don't?"** → Same idempotent backfill path. Do not charge again.
12. **"How would you design a wallet / securities?"** → Electives paused. This loop does not draw balance double-spend or matching.
13. **The final diagram is already huge and they keep stacking?** → Split-settlement mid-office, PCI clauses, real-time ML fraud, TigerBeetle are not this chapter's first answer. Three hard parts spoken clearly scores higher than 20 boxes.`,
    },
    {
      id: "sec-next",
      headingEn: "Wrap-up and what's next",
      bodyEn: `Wrap-up never says perfect. Three bottlenecks out loud:

| bottleneck | How you take it |
|---|---|
| Duplicate callback double-posts | Create \`Idempotency-Key\`; post \`pay_no\` UNIQUE; second time 200 |
| Books don't balance / no trail | append-only double-entry; integer cents; balance is only a projection |
| Don't line up with the channel | day-cut file vs internal ledger; backfill or reverse; no 2PC |

Self-check: close this page. 30-second opening + high-level on the board; walk the two idempotency keys, double-entry must balance, day-cut recon, Outbox not 2PC to the air. Wherever you stumble, come back to that section. Ch18: report the boundary only; do not re-teach the order state machine. Wallet and securities: do not unpack.

Next problem is **Ch25 · Job scheduler**. Payments finished "how one unit of money lines up"; scheduling swaps in **how a cron / delayed job runs once in a cluster, and how you catch up a miss**—recon jobs and close-order scanners both become consumers of that chapter.`,
    },
  ],
  reviewMdEn: `# Ch24 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | Three hard parts of payments? | Idempotency and channel callbacks; ledger correctness; recon that lines both sides up. Correctness > QPS. |
| 2 | Default scope? | **Merchant pay-in + channel callbacks**. Not a wallet, not securities (electives paused), do not rewrite the Ch18 order state machine. |
| 3 | How do you open CAP / PACELC for money? | Posting **PC/EC** (Ch36) in one sentence. With the channel: idempotency + recon, not 2PC. |
| 4 | Two idempotency keys? | Create \`Idempotency-Key\`; post \`pay_no\` / channel event id UNIQUE. Do not smash them into one. |
| 5 | Why are callbacks at-least-once? | Channel retries on timeout. Exact-once delivery does not exist; posting must be at-most-once. |
| 6 | How do you handle a duplicate callback? | UNIQUE hit → **200** immediately, do not credit again. SELECT-then-INSERT double-posts. |
| 7 | Why not 2PC to the channel? | The channel does not join XA. Local txn posts + **Outbox** notifies orders (Ch41). |
| 8 | Minimum ledger bar? | append-only; one txn, debits equal credits; amounts in **integer cents**. Balance is a projection. |
| 9 | Temporarily disagree with the channel? | Allowed. Day-cut recon closes it; do not pretend strong consistency with the PSP. |
| 10 | What does recon match? | **Channel settlement file vs internal ledger**, on \`pay_no\`. Diffs backfill or reverse; do not rewrite historical journal. |
| 11 | How do you cut vs Ch18? | Orders: state machine / inventory / close CAS. Payments: payment record / posting / refund exit. Share \`pay_no\`. |
| 12 | Biggest over-engineering on this prompt? | Wallet, securities, 2PC, PCI textbook, some company's TPS. Speak the three hard parts. |`,
});
