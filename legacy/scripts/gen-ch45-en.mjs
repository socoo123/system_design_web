import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch45",
  titleEn: "DDD & domain modeling",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 90–120 min ｜ **Prereq**: orders Ch18; payments Ch24; microservices Ch44
> **Goal**: bounded context, aggregate, domain events. Draw the line with orders/payments. No noun-table recitation, no full tactics homework.

This is **the last M6 foundation chip**, and the dictionary wrap-up: you've already done CAP, storage, cache, protocol, transactions, messaging, big data, microservices — the design problems still need one sentence on **how you cut the domain**. Spine orders and payments already drew their own hard parts; this chapter does not redo those two 4-step problems. It only pins **bounded context, aggregate, domain events** as a jumpable chip. Ch44 already pinned **whether to split into a process** (independent deploy / team / failure domain). This chapter answers a different question: **where the model is true, how far consistency has to lock, and whether the cross-line hop is events or RPC.** A bounded context is not a synonym for a microservice; you get a model boundary first, then decide whether to deploy independently.

**One line:** draw bounded contexts by **language + lifecycle + invariants**, not by a class-name table; an aggregate is a **consistency boundary**, not a fat class; across contexts the default is domain events + **Outbox (Ch41)**, don't weld orders and payments into one RPC. Ubiquitous language in one sentence: inside one context, the business and the code speak the same language.

Three hard parts (the pieces worth digging):

1. **How you draw a bounded context (orders vs payments)** — \`Order\` and \`Payment\` are not the same vocabulary; they share \`pay_no\`, not a "god order table"
2. **An aggregate is a consistency boundary** — only invariants that must hold in the same transaction go in the same aggregate; not everything you can JOIN into one object graph
3. **Domain events vs direct RPC** — what the user is waiting for can be a short sync; cross-context side effects go events + Outbox, don't 2PC out to the PSP

This chapter **does not cover**: the full Factory / Specification / Repository tactics homework, Event Sourcing as the default architecture, the CQRS textbook, K8s YAML, rewriting Ch44 "split by team into processes" as a chapter, reciting nine context-mapping relationships. Circuit breaker, discovery, governance minimum live in **Ch44**; Saga / 2PC mechanics in **Ch41**; the order state machine in **Ch18**; ledger reconciliation in **Ch24**.`,
    },
    {
      id: "sec-pitch",
      headingEn: "One-line definition · 20-second interview open",
      bodyEn: `First put the scoring signal on the table: you can draw a bounded context with orders/payments, you know an aggregate is not a fat class, and you know cross-context uses events instead of a default sync weld.

> "DDD does not open with a noun table. A **bounded context** is the range where a model is true: the same sentence only means the same thing inside this circle. The order context owns the state machine, inventory reserve, close-order (Ch18); the payment context owns the payment order, capture, reconciliation (Ch24); they join on \`pay_no\`, they do not share one \`Order\` class. **Ubiquitous language**: inside one context, the business and the code speak the same language; cross a context and the same word can change meaning. An **aggregate** is a consistency boundary: only invariants that must hold in the same millisecond live together; one transaction mutates one aggregate. Across contexts you don't default to chaining RPC; you commit the aggregate and write the event into the **Outbox (Ch41)** then publish. Don't default Event Sourcing. Don't equate a bounded context with a microservice (splitting a process is Ch44)."

The whole chapter walks this one chain. Say the 20 seconds, then stop. Let the interviewer decide whether to dig into the cut, the aggregate, or events.

${D2}

This figure cites: Ch18 orders · Ch24 payments · Ch41 Outbox · Ch44 microservices (split process ≠ split domain)

| Interviewer ask | Where you land |
|---|---|
| "How do you split the domain?" | Draw contexts first: different language, cut; then ask which aggregate owns the invariant |
| "What is an aggregate?" | A consistency boundary, not a fat class, not a wide table |
| "How does the order notify payment?" | Creating the payment order face-to-face can be a short sync; after capture, events + Outbox, no 2PC |

**red flag:** opening with Entity / VO / Factory / Repo; drawing a service per company noun (Ch44 distributed monolith); stuffing order lines, inventory, payment, and user into one aggregate; leading with Event Sourcing + CQRS dual stack; saying "a bounded context is a microservice."`,
    },
    {
      id: "sec-context",
      headingEn: "Mechanism · How you draw a bounded context (orders vs payments)",
      bodyEn: `First hard part. **In a 2026 interview, reciting Bounded Context in English scores lower than cutting orders and payments on the whiteboard.** Evans's nail: a model is only true inside an explicit boundary; outside it, the same word can be a different model. What an order-domain loop wants is **how you draw the line**, not a 3×3 context-mapping grid.

Three questions, in this order. Don't draw service boxes first:

${D2}

This figure cites: Ch18 order state machine · Ch24 payment ledger (two vocabularies, two lifecycles)

1. **Different language, cut.** In an order meeting the business says "reserve / close-order / \`pending_pay\` / oversell"; in a payments meeting they say "capture / reconcile / reverse / double-entry." Both say "paid": orders mean **the state machine CAS'd to \`paid\`**; payments mean **the ledger credited a row that matches the PSP**. Force one \`Order.paid\` boolean and the two rule-sets step on each other. Ubiquitous language is this one sentence: **inside one bounded context, domain experts and the code speak the same language.**
2. **Different lifecycle, cut.** An order goes \`created → pending_pay → paid → shipped\`; unpaid becomes \`closed\` (Ch18). A payment order goes create → PSP callback → capture → day-cut reconciliation, plus refunds and recon backfill (Ch24). If close-order won, you don't "revive" the payment order into paid; if payment succeeded, you don't go rewrite inventory SQL. If the lifetimes won't bind, they are not one model.
3. **Different invariant owner, cut.** Orders must hold: state only walks legal edges, reserve CAS, close-order and callback race on \`pending_pay\`. Payments must hold: \`pay_no\` capture at-most-once, credits equal debits, integer cents. No invariant requires "the same millisecond you change an order line you must write the ledger" — that is cross-context eventual consistency, not one fat transaction.

Default cut on the whiteboard (teaching, not some company's org chart):

${D2}

This figure cites: Ch18 orders (state / reserve / close-order) · Ch24 payments (payment order / ledger / recon)

| | **Order context (Ch18)** | **Payment context (Ch24)** |
|---|---|---|
| Language | reserve, close-order, oversell, \`pending_pay\` | capture, reconcile, reverse, double-entry, \`Idempotency-Key\` |
| Aggregate intuition | Order root + lines; inventory is often another aggregate, referenced by SKU id | PaymentOrder + entries; balance is a projection |
| Must be true now | State is legal; reserve does not exceed \`available\` | Same \`pay_no\` is not credited twice; books balance |
| Can be late | Knowing "the money landed"; points email | Order showing as paid; fulfillment ships |
| External contract | Place-order idempotency key; timeout close-order | Callback signature check; day-cut statement |
| What they share | **\`pay_no\` / \`order_id\` as correlation** | The same id pair, **not** a shared \`Order\` class or one wide shared-DB table |

How the interview lands on "share \`pay_no\`": after place-order succeeds you jump to the PSP; the authority is the payment-side signed callback. The payment context captures, then publishes "this \`pay_no\` was collected"; the order context **only CAS \`pending_pay → paid\`**. If close-order already won, you take the refund exit, **never \`closed → paid\`**. That race is already pinned in Ch18 / Ch24; this chapter only explains why it is **two contexts, two invariant sets**, not two fields on one object.

Where inventory sits: teaching default, inventory and orders **can share a database and still be different aggregates** (the SKU row has its own CAS). Flash-sale Redis reserve is **Ch21** — don't sync-RPC an inventory service for DDD purity. Fulfillment / delivery is another lifetime (named in Ch27); don't stuff it into the Order root.

**A bounded context ≠ a microservice.** A context is a model boundary: it can be a module inside a modular monolith (each owns its tables, no cross-module JOIN), or an independent process. **Independent deploy / team / failure domain** are Ch44's split-process criteria. In the interview you can say: draw the context first; if independent-ship doesn't hurt, two modules in a modular monolith; if it hurts, strangler-cut. The reverse — "every context must land on K8s first" — is over-engineering.

How you notice a cut is due: write both sides' words on the left and right of the board. Same word needs two definitions → cut. Same table two teams mutate, releases block each other → the models are already fighting, even in one repo. **Don't** make a context per \`User\` / \`Address\` / \`OrderItem\` — that's a noun table, not a domain.

How to open it:

> "I draw contexts by language, lifecycle, and invariants. Orders own state and goods, payments own the books and the PSP, they only share \`pay_no\`. I don't weld both sides into one class. A context is not a microservice; whether it becomes a process is Ch44."

**red flag:** one company-wide \`Order\` model eating settlement and fulfillment; a shared-DB JOIN as "unified domain"; cutting contexts by Controller package names; reciting Ch44's three split criteria as this chapter's answer.`,
    },
    {
      id: "sec-agg",
      headingEn: "Mechanism · An aggregate is a consistency boundary",
      bodyEn: `Second hard part. Evans: an aggregate is a cluster of objects treated as one unit of data change; the outside only mutates through the root. Vernon drives the nail: **aggregate = transactional consistency boundary**, not an excuse to wander an object graph in memory. The 2026 interview is this one sentence: **only invariants that must hold in the same transaction go in the same aggregate.**

True invariants on an order (teaching): if a line quantity changes, the total must immediately equal Σ line subtotals; state only walks legal edges; you cannot \`UPDATE order_items\` from outside the root and send the total flying. So **Order root + lines** is one chain, one load, one commit. Inventory oversell is **the SKU row's own CAS**; you do not lock the whole catalog into the order object.

${D2}

This figure cites: Ch18 orders (state-machine CAS; reserve lives on the inventory row) · Ch41 transactions (one transaction, one aggregate)

A judgment question you can use on the spot:

| Can these two facts disagree for a moment? | Where they go |
|---|---|
| Order-line qty vs order total | **Same aggregate.** Changing a line goes through the root; after commit the total is legal |
| Order \`pending_pay\` vs inventory \`reserved\` | Teaching: same DB, two rows, still **two aggregates**; the place-order transaction can mutate both — that's an engineering choice, not "one fat Order" |
| Order \`paid\` vs ledger credited | **Different contexts.** The money-landed event can be a few seconds late; the business allows it; late arrivals close with refund / recon (Ch24) |
| Order vs user profile | Place-order copies an address snapshot; the user changing a phone number must not lock the order row |

A transaction by default **mutates one aggregate instance**. If two aggregates must be true together immediately, first ask whether you drew too big. Across contexts, definitely no XA. Payment capture and flipping the order state: payment commits its own aggregate + Outbox first, the order CAS's later — that's eventual consistency, not a missing design.

${D2}

This figure cites: Ch41 replication, sharding, transactions (lock grain; 2PC is not the first answer)

Symptoms of an aggregate that's too big: changing one line loads user, coupon, payment order, warehouse; place-order locks half the database; two people buying two SKUs wait on each other. Vernon: **small aggregates** — the root plus the few things that must be true together; externally you only hold **ids** (\`customerId\`, \`pay_no\`, \`skuId\`), you don't hold other aggregate objects as members. Outside the boundary, events catch up.

Symptoms of an aggregate that's too small: quantity and total go in two commits, and a reader sees an illegal order in between. That is not "microservices are fine-grained"; that's an invariant torn apart. Default start small; **only merge when you've proven it must be true in the same millisecond.**

The root is the only entry: \`order.addItem()\` / \`order.cancel()\` check state; the service layer does not mutate child rows directly. A Repository loads the whole aggregate; don't expose \`OrderItemRepository\` as a write door — name it and stop, no homework.

How to open it:

> "An aggregate is a consistency boundary. Total and lines must be true together, so they live in Order. The payment ledger is a different invariant; it does not go into Order. One transaction, one aggregate; outside you reference by id; late arrivals use events."

**red flag:** "an aggregate is a fat class / a wide table"; welding payment, inventory, and membership into one object tree; bidirectional references to every entity for navigation convenience; reciting a Factory list but unable to name which invariant you're locking.`,
    },
    {
      id: "sec-events",
      headingEn: "Mechanism · Domain events vs direct RPC",
      bodyEn: `Third hard part. The aggregate committed — how does anyone else know? **The result this user request must take home: short sync (Ch44).** Side effects in another context: domain events. Don't default to sync-chaining payment, points, and search.

A domain event: a fact that already happened in the domain, that the expert cares about. Order side: \`OrderPlaced\` / \`OrderClosed\`; payment side: \`PaymentCaptured\`. Names use ubiquitous language, past tense. It is not "an RPC to the inventory microservice with a prettier name," and it is not a log string.

Across contexts, don't publish an internal event as the public schema. Give the outside a stable contract (payment captured: \`pay_no\`, amount in cents, time). How you split classes internally, the other side should not compile against your \`Order\`. In the interview, name "internal fact / public contract" and stop; don't open the Integration Event textbook.

${D2}

This figure cites: Ch44 sync vs async · Ch20 messaging (at-least-once → consumer idempotency)

| | **Sync RPC** | **Domain event** |
|---|---|---|
| Use when | This hop must return: place-order takes \`orderId\`; can I buy | The other side can be late: after capture, flip the order, send email, index |
| Failure | Tell the user immediately; short-chain deadline | Retry, DLQ, recon; a window is allowed |
| Coupling | The other side must be up at call time | The other side can be down at publish time |
| Orders × payments | Create the payment order, take the hosted URL: the user is still here, **one** short sync is allowed | After the PSP callback captures: an **event** tells the order to CAS; the payment process does not sync-write the order DB |
| Don't | Place-order sync-chaining ledger, points, recs | Using an event to pretend "the user already sees paid" with no query path |

Dual-write: commit the order then \`publish()\`, process dies in the middle → order with no event. Publish then commit → ghost event. **Don't** make database + message broker 2PC the first answer. Same local transaction writes the aggregate + an **Outbox table**; a relay publishes onto the bus. The full mechanism is **Ch41**; this chapter only wires the link.

${D2}

This figure cites: Ch41 Outbox / CDC · Ch20 delivery semantics · Ch24 notify the order after capture

Teaching chain (payment success → order paid): Pay aggregate captures → same row writes Outbox \`PaymentCaptured(pay_no)\` → relay publishes → Order consumer **idempotently** CAS \`pending_pay → paid\`. Duplicate events key on \`pay_no\` / event id. If close-order already won → don't revive, take the refund (Ch18 / Ch24). Don't let the payment service hold the order datasource and write it directly.

**Don't default Event Sourcing.** State can live in a current table; events are just notifications. Event Sourcing is a different persistence where the event stream is the source of truth — replay, snapshots, subscriptions. If they didn't ask about the storage model, don't draw it. CQRS read/write model split is likewise **not** this chapter's homework. Outbox does not require you to land ES first.

Consumers are idempotent under at-least-once (Ch20 / Ch44). A domain event is not a sync orchestrator: don't use the event bus to fake one giant RPC (publish then synchronously wait for eight handlers to succeed before 200). The user's 200 only guarantees **this aggregate committed**; the rest is eventual, and you prepare recon / compensation.

How to open it:

> "Face-to-face handoff is a short sync chain. Changing someone else's aggregate across a context: events, not a default sync write. Commit and Outbox in one transaction, relay publishes. Ch41. Don't default ES."

**red flag:** place-order sync-RPC to payment, inventory, points, search; dual-write DB and MQ without talking about failure; calling Event Sourcing a DDD requirement; using domain events as a distributed-transaction substitute without idempotency.`,
    },
    {
      id: "sec-pick",
      headingEn: "Choice table: how you split the domain, how you notify",
      bodyEn: `Don't turn the whiteboard into a tactics-pattern trade show. Ask first whether the words match, then which invariant must hold in the same millisecond, and only then sync vs events.

| Scenario | Default | Don't |
|---|---|---|
| Same word, two definitions (paid, customer, order) | **Two bounded contexts** | One god model eats both |
| Order state vs ledger debit/credit | Orders Ch18 / payments Ch24; share ids | Shared-DB JOIN as a unified domain |
| Total = Σ lines | **One Order aggregate** | Line repository writable from outside |
| Order vs payment capture | Two aggregates; events catch up | One fat class locking two trees |
| User face-to-face needs \`orderId\` | Short sync (Ch44) | Fully async, make the user refresh five times |
| After capture, flip the order / send email | **Events + Outbox (Ch41)** | Payment process writes the order DB; dual-write without crash talk |
| XA with the PSP? | No; idempotency + recon (Ch24) | 2PC out to the channel |
| Does a context need its own process? | Deploy/failure pain, then **Ch44** | Every context onto a mesh first |
| Persistence | Current-state table + notification events | **Mandate** Event Sourcing / the CQRS textbook |
| CRUD admin | Transaction script is fine | Full tactics for the resume |

One order problem can mix: write the order sync, PSP callback captures in the payment context, Outbox notifies the order to CAS, points go async. Don't erase charge idempotency with "we're DDD so we're eventually consistent," and don't weld two contexts back into 2PC with "we need strong consistency."

How to open it:

> "Different language, cut the context. True invariants go into the aggregate. Face-to-face sync, cross-context Outbox. Whether it becomes a process is Ch44. Don't default ES."`,
    },
    {
      id: "sec-papers",
      headingEn: "Papers and classic systems",
      bodyEn: `M6 needs names you can drop. Below the punchline is **context + aggregate boundary**, and domain events wire to Outbox. **The interview one-liner** is in the table; don't memorize page numbers, don't invent internal numbers. No Xu chapter; the source is Evans plus public order-domain interviews.

${D2}

| | Paper | Required / optional | Interview one-liner |
|---|---|---|---|
| 1 | **Evans**, 2003, *Domain-Driven Design* (the blue book) | **Required** (take two punches) | **Bounded Context**: a model is only true inside an explicit boundary. **Aggregate**: a unit of change; foreign keys point only at the root. Draw orders/payments; don't recite the TOC |
| 2 | **Evans**, 2015, *DDD Reference* | Optional | **Ubiquitous language**: the model is the team's language; changing a word is changing the model. **Domain Events** were added to the building blocks after the blue book — you can name them; don't recite the nine context-mapping relationships in the reference |
| 3 | **Vernon**, 2011, *Effective Aggregate Design* (three parts) | Optional | Aggregate = **transactional consistency boundary**; small aggregates; reference by id; eventual consistency outside the boundary. A fat object graph is a fake invariant |
| 4 | **Richardson**, *Transactional outbox* (microservices.io) | Optional (back-link **Ch41**) | You cannot write the DB and the message once each. Same transaction writes the Outbox, a relay publishes. **Event Sourcing is another option, not the default.** Dig the mechanism back in Ch41 |

Evans, one more squeeze (two punches in the interview): first draw the **context** (where this sentence is true), then the **aggregate** (which facts must commit together). Fowler's bliki also lands strategic design on Bounded Context — use it as backup, don't switch into Fowler's microservices short piece (that's **Ch44** independent deploy).

Don't unpack: Factory / Spec / Repo homework, the full context-mapping table, a CQRS read/write stack, Event Store shopping, a cloud "domain-driven" SKU.`,
    },
    {
      id: "sec-used",
      headingEn: "Which design problems use this",
      bodyEn: `Do the spine problems first; jump into this chapter when you get stuck. Back-links are not "finish M6 then start writing." Each case's business hard part already lives in its chapter; here we only recycle **how you cut the domain, how far consistency locks, how you notify across domains**.

| Chapter | The sentence you use |
|---|---|
| **Ch18** orders | State machine + reserve is the order context. Payments only share \`pay_no\`. Close-order vs callback is two invariant sets racing the same state, not two setters on one class |
| **Ch24** payments | Payment order / ledger / recon is another context. After capture, Outbox notifies the order; don't redraw \`pending_pay → paid\` |
| **Ch21** flash sale / hotel | Inventory hotspot is another lifetime (Redis reserve, or room-type + date). Don't weld the flash-sale key model into a normal Order aggregate |
| **Ch20** messaging | How the event arrives. at-least-once → consumer idempotency. Backlog is not this chapter |
| **Ch41** transactions | Outbox / Saga / why 2PC is often a no. This chapter only wires "mutate aggregate + publish event" |
| **Ch44** microservices | A context can start as a module. Split a process by independent deploy / failure domain; not one Pod per aggregate |
| **Ch25** scheduler | Close-order scan and recon day-cut are cross-context compensation clocks, not a second aggregate root |
| **Ch17** gateway | North-south entry; the gateway does not know order invariants |
| **Ch10 / Ch11** notify / Feed | Fan-out defaults to events; don't sync-hit every downstream and call it a "domain service" |

Short URL, comments, chat: CRUD-heavy, thin rules — don't force tactical DDD. **Dense rules, words that fight** (place order, take money, fulfill) is when you pull this chapter out.`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs notes / the original book",
      bodyEn: `<details>
<summary>How the book / notes taught it then · noun tables and ES-as-default go here</summary>

This chapter has no Xu section and no packaged notes. Old talk tracks often: treat the blue book's tactics TOC as the interview answer, treat Event Sourcing + CQRS as DDD stock, draw a bounded context as microservice YAML. **That is not this chapter's body.** In 2026 you walk in with how you draw a context, aggregate as consistency boundary, events + Outbox.

| Book / notes / old talk track | How you answer now |
|---|---|
| Recite Entity / VO / Factory / Spec / Repo | **How you split the domain**: language, lifecycle, invariants. Tactics: name the root and the repository door, then stop |
| Aggregate = fat class / if you can JOIN it goes in the tree | **Consistency boundary**; small aggregates; id references |
| One company-wide Order model | Orders / payments, two vocabularies; share \`pay_no\` |
| Bounded Context = microservice | Model boundary. Splitting a process is **Ch44** |
| Cross-service default sync REST for consistency | Face-to-face short sync; cross-context events + Outbox |
| Event Sourcing is the DDD default architecture | **No.** A state table + notification events is enough. ES is a separate conversation |
| CQRS textbook / Event Store shopping | **Forbidden** as this chapter's spine |
| Recite nine context-mapping relationships | Name "contract / anti-corruption" and stop; don't recite the table |
| 2PC / a fat Saga as the first orders×payments answer | Local aggregate + Outbox; Saga mechanics **Ch41** |
| Split by team as this chapter | **Ch44**; this chapter does not rewrite the three independent-deploy criteria |
| K8s YAML / mesh as the domain implementation | **No YAML** (PLAN M6) |

The body's first answer is this 2026 set. The fold only stops you from putting a noun table and ES faith on the whiteboard.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **How do you split the domain?** → Different language, different lifecycle, different invariant owner. No noun table.
2. **Why cut orders and payments?** → "Paid" is not the same fact on both sides; they share \`pay_no\`, not a class.
3. **What is a bounded context?** → The range where a model (and the language) is true. Outside the boundary the same word can change meaning.
4. **Ubiquitous language?** → Inside one context, the business and the code speak the same language. Changing a word is changing the model.
5. **Is a context a microservice?** → No. Modularize first; split a process per Ch44.
6. **What is an aggregate?** → A consistency boundary. Only invariants that must be true in the same transaction live together.
7. **Is an aggregate a fat class?** → No. A fat object graph is usually a fake invariant; locks and contention blow up.
8. **How many aggregates per transaction?** → Default one. If you need several, first ask whether the boundary is wrong.
9. **Why are order lines inside Order?** → Total and lines must be true together.
10. **Why is inventory often not inside Order?** → The SKU has its own CAS; the whole catalog should not lock into one order tree.
11. **How do you reference another aggregate?** → By **id**, you don't hold the object.
12. **What is a domain event?** → A domain fact that already happened. Cross-context notification, not RPC renamed.
13. **Why not RPC-write the order directly?** → You weld the lifecycles; failure locks both sides together. After capture, event + CAS.
14. **Dual-write?** → Writing the DB and the MQ once each loses events or ghosts them. **Outbox (Ch41)**.
15. **Must you Event Source?** → Don't default it. Outbox does not depend on ES.
16. **CQRS?** → Not this chapter. If they didn't ask about read/write split, don't draw it.
17. **Relation to Ch44?** → Ch44: whether to split a process. This chapter: how you cut the model.
18. **Relation to Ch18 / Ch24?** → Those two are the cases; this chapter explains why they were two contexts all along.
19. **Does a CRUD system need DDD?** → Thin rules, transaction script. Pull this out when the words start fighting.
20. **Is there a Ch46 next?** → **No.** The M6 spine closes on this chapter; design problems jump via chips.`,
    },
    {
      id: "sec-next",
      headingEn: "What's next",
      bodyEn: `Close the page and walk it in 20 seconds: draw bounded contexts by language / lifecycle / invariants; orders own goods and state, payments own the books and the PSP, they share \`pay_no\`; an aggregate is a consistency boundary, not a fat class; face-to-face short sync, cross-context events + Outbox (Ch41); whether to split a process is Ch44; don't default ES. If you can drop Ch18 / Ch24 / Ch44 back onto their own hard parts, this chapter is done.

**The spine has finished M6.** There is no Ch46. On a design problem, jump from the world map (Ch01) into the matching foundation chip: consistency → Ch36/Ch41, split a process → Ch44, cut the domain → this chapter. Come back when you're stuck; don't reread the dictionary as an appetizer.

Self-check: left column, three hard-part lines (how you draw a context, what the aggregate locks, events vs RPC); middle, orders/payments contrast; right, the Outbox chain. Don't recite a Factory table and Event Sourcing as stock.`,
    },
  ],
  reviewMdEn: `# Ch45 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | How do you open in 20 seconds? | Draw contexts by language / lifecycle / invariants. Orders ≠ payments, share pay_no. Aggregate = consistency boundary. Cross-context events + Outbox. Context ≠ microservice. Don't default ES. |
| 2 | Three hard parts? | ① How you draw a bounded context (orders vs payments) ② An aggregate is a consistency boundary ③ Domain events vs direct RPC. |
| 3 | Ubiquitous language in one sentence? | Inside one context, the business and the code speak the same language; cross a context and the same word can change meaning. |
| 4 | How do you draw a context? | Different language, different lifetime, different invariant owner. Not a noun table. |
| 5 | What do you cut between orders vs payments? | Orders: state machine / reserve / close-order. Payments: payment order / ledger / recon. Share \`pay_no\`, not an Order class. |
| 6 | Why can't "paid" be one shared field? | Orders: CAS to paid. Payments: captured and it matches the PSP. Two facts. |
| 7 | Is a context a microservice? | No. It can start as a module. Split a process per Ch44 (independent deploy / team / failure domain). |
| 8 | What is an aggregate? | A consistency boundary: invariants that must hold in the same transaction. Not a fat class, not a wide table. |
| 9 | Why are lines in the Order aggregate? | Total must equal Σ subtotals; changing a line goes through the root. |
| 10 | How many aggregates per transaction? | Default one. Across contexts use events; don't XA out to the PSP. |
| 11 | How do you reference outward? | Hold only ids (pay_no / skuId / customerId). |
| 12 | Aggregate too big? | Fake invariants + object-graph navigation; lock the whole graph. Vernon: small aggregates. |
| 13 | Domain events vs RPC? | Face-to-face short sync. Cross-context side effects go events, not a default sync write. |
| 14 | How do you break dual-write? | Same transaction writes the aggregate + Outbox, a relay publishes (**Ch41**). |
| 15 | How does payment success flip the order? | Pay captures → Outbox → Order idempotent CAS pending_pay→paid. If close-order won, refund. |
| 16 | Must you Event Source? | Don't default it. A state table + notifications is enough. CQRS is not this chapter. |
| 17 | Evans's two interview punches? | Bounded Context: a model has a boundary. Aggregate: a unit of change. |
| 18 | Vernon one-liner? | Aggregate = transactional consistency boundary; eventual consistency outside the boundary. |
| 19 | Relation to Ch44? | Ch44: whether to split a process. This chapter: how you cut the model. Not one service per aggregate. |
| 20 | Next chapter? | **No Ch46.** M6 closes; design problems jump via chips. |`,
});
