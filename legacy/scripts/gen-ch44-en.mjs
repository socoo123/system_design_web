import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch44",
  titleEn: "Microservices & service governance",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 90–120 min ｜ **Prereq**: gateway Ch17; config Ch28; resilience Ch42 (can read later)
> **Goal**: whether to split, sync vs async, discovery / timeout / retry / idempotency. Tracing named. The anti-pattern is a distributed monolith. No YAML.

This is **M6's foundation chip** on how you split services and keep them alive after, not another 4-step design problem. On the spine, gateway, orders, messaging, and config all hit "do we need more processes, how do calls fail"—this chapter unpacks **criteria for splitting, sync vs async, the governance minimum**. Design problems just cite it; don't open a microservices pep talk on the whiteboard. Ch17 already pinned the north-south door; Ch28 already pinned config KV. This chapter does not rewrite those two; it only wires discovery and timeout/retry/idempotency onto governance.

**One line:** split by **independent deploy / team / failure domain**, not by every noun; the answer the user is waiting for goes sync, side effects go async; resolving a name to instances is discovery, KV is **Ch28**; timeout + bounded retry + idempotency is the minimum set, circuit breaker back-links **Ch42**. The anti-pattern is a **distributed monolith**.

Three hard parts (the pieces worth digging):

1. **Whether to split / the criteria** — independently deployable, team boundary, failure domain; finer is not better
2. **Sync vs async** — what the user is waiting for goes RPC; side effects go to a queue (Ch20 / Ch42)
3. **Discovery + timeout / retry / idempotency** — governance minimum; config back-links Ch28; tracing only names \`trace_id\`

This chapter **does not cover**: K8s YAML, an Istio filter catalog, the full DDD tactics book (that's **Ch45**), a pep talk about splitting into 200 services, a cloud App Mesh shop. Circuit breaker / bulkhead / retry storm are dug in **Ch42**; here we only wire "timeout must be on, retries must be bounded and idempotent."`,
    },
    {
      id: "sec-pitch",
      headingEn: "One-line definition · 20-second interview open",
      bodyEn: `First put the scoring signal on the table: you can tell whether to split, you know a sync mesh is not microservices, and you know the governance minimum is not a mesh plugin table.

> "The bar for microservices is **independently deployable**, not more processes. Split by **deploy cadence / team / failure domain**; one service per noun, split by tech layer, still sharing one database — that's a **distributed monolith**. You pay the network tax and get no independent release. User places an order and needs an orderId now: sync until you can return it; email, points, search index: async (Ch20). Name to healthy instances is **service discovery**; timeouts, kill switches, flags are **config center Ch28**. Every downstream has a timeout; retries are bounded and only hit idempotent writes; circuit breaker back-links Ch42. Tracing is one sentence: the request carries a \`trace_id\` that stitches hops. No YAML."

The whole chapter walks this one chain. Say the 20 seconds, then stop. Let the interviewer decide whether to dig into splitting, sync vs async, or governance.

${D2}

This figure cites: Ch17 gateway (north-south entry) · Ch28 config center (KV, not discovery) · Ch42 resilience (circuit breaker deep dive)

| Interviewer ask | Where you land |
|---|---|
| "Should we go microservices?" | Ask if independent deploy actually hurts; if not, modular monolith |
| "How do services call each other?" | What the user is waiting for: sync; side effects: async; don't chain a sync loop |
| "What does governance do?" | Discovery + timeout/retry/idempotency; config → Ch28; circuit breaker → Ch42 |

**red flag:** opening with 20 boxes; calling a sync mesh on a shared DB "microservices"; teaching the config center as a registry; opening with Istio filters / an App Mesh SKU; reciting a DDD tactics table as the split criteria.`,
    },
    {
      id: "sec-split",
      headingEn: "Mechanism · Whether to split (the criteria)",
      bodyEn: `First hard part. **In a 2026 interview, reciting "high cohesion, low coupling" scores lower than saying when you would not split.** Splitting a service buys organizational independence; you pay network, data, and ops tax. Split with no pain named and the bill is due immediately, with none of the upside.

Three criteria. **Not** one service per noun:

${D2}

| Criterion | What you ask | Interview nail |
|---|---|---|
| **Independent deploy** | Can this boundary ship and roll back alone, without lockstep with its neighbors? | Fowler's line: a service is **independently deployable**. If release is still a site-wide train, you don't have a service yet |
| **Team** | Do two teams regularly block each other's ships? | Team boundary lines up with the deploy unit (Conway: the org's communication structure shows up in the system). One person owning 30 repos is over-engineering |
| **Failure domain** | If this piece dies, must it take the neighbor down? | Billing down, search still searches; weld them in one process and the failure domain is the whole site |

They often stack: billing ships daily, search weekly (deploy) + two teams don't approve each other (team) + payments must not die with recs (failure domain). **Only one soft reason** → draw module lines inside the monolith first; cheaper than rushing onto the network.

**Don't split this way:**

- **Every noun**: \`User\` / \`Address\` / \`OrderItem\` each get a process; a function call becomes RPC. No independent data, no independent cadence.
- **By tech layer**: a "data access service," a "business logic service," an "API service." Looks like a clean N-tier. Every request hops three times, and a requirement change still ships with three teams — that's a distributed N-tier, not microservices.
- **Share one database**: processes split, tables still JOIN. Transactions and schema lock you back to one deploy. Data ownership never cut, so the service boundary is fake.

How you draw bounded contexts and aggregates is **Ch45**. This chapter only needs one sentence: **first a capability boundary you can ship alone, then domain nouns.**

The anti-pattern has a name: **distributed monolith**. Looks like many services; it's actually a sync mesh + shared DB + must ship together. You paid latency and ops tax; independence and failure isolation never arrived.

${D2}

This figure cites: Ch17 gateway (the routing layer when you strangler-cut; name it and stop)

Self-check one line: if tomorrow this service's database and pipeline had to be 100% independent, would a large surface break? Yes → you don't have a boundary yet; keep modularizing or cut the data. No → now it looks like a service.

**2026 default starting point is a modular monolith:** one deploy unit, modules talk through interfaces, each owns its tables, no cross-module JOIN. Public stories like Shopify / GitHub show a monolith can be large. When you actually hit independent scale, independent compliance, independent release, strangler-cut one piece out (the gateway points new traffic at the new service, **Ch17**). No big-bang rewrite.

How to open it:

> "I split by independent deploy, team, and failure domain. One service per noun, or by layer, still sharing a DB — that's a distributed monolith. No pain, modular monolith first; migrate with strangler, don't cut 200 services in one shot."

**red flag:** "microservices are the evolution endpoint"; drawing 30 boxes on the whiteboard before asking about the business; sharing a DB while claiming independent scale.`,
    },
    {
      id: "sec-sync",
      headingEn: "Mechanism · Sync vs async",
      bodyEn: `Second hard part. Once you split, how you call decides whether you have microservices or a sync mesh. **The answer the user is sitting there for goes sync; side effects that can arrive later go async.**

${D2}

This figure cites: Ch20 message queue · Ch42 delivery and backlog (mechanism lives there; this chapter only picks)

| | **Sync (RPC / HTTP)** | **Async (queue / events)** |
|---|---|---|
| User sees | This request must bring the result back | "Accepted" now, finish later is fine |
| Failure | Immediate 4xx/5xx; you need a timeout | Retry, DLQ, reconcile; at-least-once is the default |
| Coupling | The other side must be up at call time | The other side can be down at publish time |
| Nail | Place order, return \`orderId\`; read inventory, can they buy | Email, points, search index, audit log |
| Cost | Latencies add; slow downstream = slow user | Eventual consistency; need idempotency and a backlog plan (Ch20) |

Keep the user path a **short sync chain**. Teaching default: Client → gateway → **one** business service that can return. Inventory check and writing the order can finish inside the order service process or its own DB; don't sync-chain payment, points, recs, and search on one checkout for "microservices purity."

${D2}

This figure cites: Ch17 API gateway (north-south entry; auth and rate limit live at the door, not copied into every microservice)

If the gateway then sync fan-out to five downstreams, user P99 is five timeouts stacked, and any one down fails the whole order — that's a distributed monolith at runtime. Points, notify, index: drop an event after the order succeeds, **Ch20** picks it up. If payment must confirm in the user's face, treat it as one of the **few** sync deps on this path and give it a deadline; don't casually sync-hit marketing on the way.

A sync chain needs a **deadline**: gateway 800ms, order keeps its own budget for downstream. Downstream timeout is not "wait a bit more"; it's fail or degrade, and leave the leftover time for the user. Retry budget sits on the same deadline; mechanism in the next section.

How to open it:

> "The result the user needs, I take sync. Side effects, async. I will not sync-chain eight services on checkout. Gateway to order is a short chain; points and email go to a queue."

**red flag:** everything sync "to guarantee consistency"; everything async "for decoupling" and the user refreshes five times before checkout shows success; hauling the Saga / Temporal textbook in (orchestration lives on the order/payment problems, not this chapter's spine).`,
    },
    {
      id: "sec-gov",
      headingEn: "Mechanism · Governance minimum (discovery · timeout / retry / idempotency)",
      bodyEn: `Third hard part. After you split, processes vanish, addresses move, calls drop. Governance is not a mesh feature list; it is **a name that can find a person, a failure that can stop, a retry that does not double-charge**.

### Service discovery ≠ config center

Discovery answers: **which healthy instances does this service name have right now.** Config answers: **what is this key's value right now** (timeout, kill switch, rate-limit threshold). The latter is a whole chapter in **Ch28** (push/pull, versions, canary, watch) — here we only draw the line, we don't rewrite it.

${D2}

This figure cites: Ch28 config center (KV / version / rollback; don't stuff the instance list into config as the main plan) · Ch17 gateway (north-south can also find a cluster via discovery)

| | **Service discovery** | **Config (Ch28)** |
|---|---|---|
| Data | Instance addresses + health | KV: flags / timeouts / quotas |
| Why it changes fast | Scale out/in, an instance died | A human flipped a switch, tuned a param |
| If it dies | New instances can't join; existing connections may still hit old addresses for a while | Client **local snapshot**; most flags still work |
| Don't | Use discovery as feature-flag storage | Use the config center as a registry (no heartbeat / eviction semantics) |

Instances register, heartbeat, time out and get evicted. Teaching does not lock Consul / etcd / DNS to a SKU. DNS fits a stable entry; when instances come and go in seconds, heartbeat + watch fits better than long-TTL DNS. Discovery is not a health guarantee: an instance in the registry may already be dead, so you still need a timeout.

### Timeout → bounded retry → idempotency

The minimum resilience chain for a sync call is these three. Circuit breaker (trip on error rate, fail fast while open) **back-links Ch42**; don't unpack the state machine in this chapter.

${D2}

This figure cites: Ch42 circuit breaker and retry storms · Ch17 gateway (timeout at the door; don't blindly retry POST at the gateway)

1. **Timeout must be on.** A sync call with no timeout fills threads/connections and turns downstream slowness into your own avalanche. Timeout must be shorter than the upstream deadline.
2. **Retries must be bounded.** Few attempts (teaching intuition: 1–2, not 10); backoff + jitter, so you don't retry in lockstep. Auto-retry only **idempotent** writes, or writes that carry an idempotency key. The gateway **must not** fire \`POST /orders\` three times on its own — it doesn't know whether the first write landed. Retry on a different instance: hitting the same dead box again is pointless; discovery can hand you another address.
3. **Idempotency.** After a timeout the client does not know success. Without idempotency, retry = double charge, double order. Client sends an \`Idempotency-Key\` (or a business dedupe key); the server stores the first result under that key and returns it as-is on replay. Same key, different payload → conflict; don't silently run the second one.

**Tracing: name it and stop.** Each request generates or forwards a \`trace_id\`; each hop is a span; the same id stitches gateway → order → downstream into one chain. That's how you debug. **Don't** make OpenTelemetry's four pillars, sampling, or Collector topology this chapter.

How to open it:

> "Discovery is name to instances; config is Ch28 KV. Every downstream has a timeout; retries have a count and only hit idempotent writes; writes carry an idempotency key. Circuit breaker per Ch42. Tracing is a \`trace_id\` stitching hops."

**red flag:** mashing discovery and config into one "registry-config center" without being able to name the two data shapes; infinite retry; retrying a non-idempotent POST after timeout; opening with an Istio retry/circuit-breaker filter table; turning tracing into the whole observability textbook.`,
    },
    {
      id: "sec-pick",
      headingEn: "Choice table: split or not, how you call, what you govern",
      bodyEn: `Don't turn the whiteboard into a governance-platform trade show. Ask about the pain first, then pick sync vs async, and only then discovery and timeouts.

| Scenario | Default | Don't |
|---|---|---|
| Small/mid team, ships aren't blocking | **Modular monolith** | Split a ring of services by noun |
| Billing ships daily, search weekly | Extract the piece with a different cadence | Call it microservices while still doing a site-wide release train |
| Payments must not die with recs | Cut by **failure domain** | Sync mesh sharing a thread pool |
| User checkout needs an answer now | Short sync: GW → order (Ch17 / Ch18) | Sync-chain points / email / recs |
| Email, points, index | **Async** Ch20 | Sync RPC "this request must succeed" |
| Find a downstream instance | **Service discovery** | Config center as a registry |
| Change a timeout / kill switch | **Ch28** config | Treat one config change as a discovery change |
| Downstream slow or timed out | Timeout + bounded retry + idempotency | Infinite retry; circuit-breaker details go to Ch42 |
| North-south auth and rate limit | **Gateway Ch17** | Every service copies JWT / rate limit |

One order problem can mix: write the order sync, issue a coupon async, ledger consistency per **Ch18 / Ch24**. Don't erase a charge with "we're microservices so we're eventually consistent."

How to open it:

> "No independent-deploy pain, modularize the monolith. Pain, extract by team and failure domain. Face-to-face sync, side effects async. Discovery owns instances, config goes to Ch28, resilience minimum is timeout / retry / idempotency."`,
    },
    {
      id: "sec-papers",
      headingEn: "Papers and classic systems",
      bodyEn: `M6 needs names you can drop. Below the punchline is **independently deployable**; circuit breaker only back-links. **The interview one-liner** is in the table; don't memorize page numbers, don't invent internal numbers.

${D2}

| | Paper | Required / optional | Interview one-liner |
|---|---|---|---|
| 1 | **Lewis & Fowler**, 2014, *Microservices* (martinfowler.com short piece) | **Optional** | Services are built around business capabilities and are **independently deployable**. Many processes that must ship together is not the style that article describes |
| 2 | **Nygard**, *Release It!* (circuit breaker) | Back-link **Ch42** | Trip when the error rate hits a threshold, cut the cascade. This chapter only wires it next to timeout/retry; **don't** teach the Hystrix state machine here. Hystrix is unmaintained; the tool name stays in Ch42 |
| 3 | **Conway**, 1968, *How Do Committees Invent?* | Optional | An organization's communication structure gets copied into the system design. Service splits have to line up with teams, or the boundary is fake |
| 4 | **Sigelman et al.**, 2010, *Dapper, a Large-Scale Distributed Systems Tracing Infrastructure* | Optional (name it) | The request carries a **trace_id**; spans across processes form a tree. That's the interview sentence; sampling / four pillars are not this chapter |

Fowler, one more squeeze (one punch in the interview): a library in the same process means a one-line change ships the whole package; you split into services so **most changes ship only that one service**. An interface change still needs coordination — the goal is a cohesive boundary that keeps coordination rare, not a promise you never pair on a change again.

Don't unpack: reciting nine characteristics, SOA vs microservices as a religion, Sidecar internals, a cloud mesh SKU.`,
    },
    {
      id: "sec-used",
      headingEn: "Which design problems use this",
      bodyEn: `Do the spine problems first; jump into this chapter when you get stuck. Back-links are not "finish M6 then start writing." Each case's business hard part already lives in its chapter; here we only recycle **split or not, sync vs async, discovery and timeout**.

| Chapter | The sentence you use |
|---|---|
| **Ch17** gateway | North-south entry; the short sync chain starts here. Mesh / east-west only names this chapter. Auth and rate limit stay at the door; don't copy them into every microservice |
| **Ch18** orders | Write the order sync, take \`orderId\`; how you cut inventory/payment is domain (Ch45) + state machine. Points and email async. Splitting "order service / inventory service" on a shared DB is a distributed monolith |
| **Ch20** messaging | The implementation of the async cell. at-least-once → consumers must be idempotent. Backlog is not this chapter |
| **Ch21** flash sale | Don't sync-chain a pile of downstreams on the hot path; shed peak onto a queue. Splitting services does not fix oversell |
| **Ch24** payments | A charge must be idempotent; timeout-retry without a key is double charge. Sync only keeps the one hop facing the user |
| **Ch28** config | Timeout values and kill switches go to the config center, **not** discovery. Discovery is taught deep in this chapter |
| **Ch10 / Ch11** notify / Feed | Fan-out defaults to async; don't sync-hit every follower service |
| **Ch32** LLM gateway | That's model routing, not business-microservice governance. Don't draw this chapter into token billing |
| **Ch02** scale | Vertical-split modules first, then talk independent deploy; step one is not 200 services |

Short URL, comments, chat: the online path is still few hops; **don't** mesh them into a sync call graph for the resume.`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs notes / the original book",
      bodyEn: `<details>
<summary>How the book / notes taught it then · evolution-endpoint and mesh shopping go here</summary>

The source notes (aws_08) wrote monolith → N-tier → microservices as an evolution story and spread mesh / Sidecar / circuit-breaker tools. **That is not this chapter's body.** In 2026 you walk in with split criteria, sync vs async, and the governance minimum.

| Book / notes / old talk track | How you answer now |
|---|---|
| Microservices are the architecture evolution endpoint | **Split by pain**; default modular monolith. Distributed monolith is a red flag |
| Finer is better / one table one service | **Independent deploy / team / failure domain**; shared DB = you didn't split |
| Service-to-service default is all sync REST | Face-to-face sync, side effects async (Ch20) |
| Discovery and config mashed into a Nacos shop | **Two data shapes**; config mechanism is the whole of Ch28 |
| Hystrix state machine as the body | **Circuit breaker back-links Ch42**; Hystrix stopped in 2018, not this chapter's tool class |
| Istio filter / App Mesh catalog | **Forbidden**. Governance minimum does not need a mesh directory |
| K8s YAML / Ingress as the design | **No YAML** (PLAN M6) |
| DDD tactical-pattern table | **Ch45**; this chapter does not recite aggregate homework |
| Observability four pillars / OpenTelemetry textbook | Tracing is one sentence: \`trace_id\` |
| Strangler as a migration specialty chapter | Name it: gateway cuts one piece out; don't write the playbook |

The body's first answer is this 2026 set. The fold only stops you from putting "evolution is inevitable" and a mesh shop on the whiteboard.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **When should you split?** → Independent deploy, teams blocking ships, failure domain. Can't name the pain, don't split.
2. **Finer is better?** → No. Noun-granularity is usually a distributed monolith.
3. **Split by Controller / Service / DAO?** → Tech-layer split. Extra hops per request, still change together.
4. **Shared database OK?** → Fine as a transition; as a goal you have no data ownership, ship and schema still lock together.
5. **What is a distributed monolith?** → Many processes + sync mesh + shared DB / must ship together. You paid the tax, got no independence.
6. **Modular monolith?** → One deploy unit, clear module boundaries, each owns its tables. A common 2026 starting point.
7. **Sync or async?** → What the user is waiting for: sync; side effects: async.
8. **Should checkout sync-hit eight services?** → No. Short chain returns; the rest are events.
9. **Discovery vs config?** → Discovery: name → instances. Config: KV. Ch28.
10. **Is discovery a health guarantee?** → No. The registry lags; you still need a timeout.
11. **Why must you timeout?** → A slow downstream fills you up. No timeout → cascade.
12. **Retry everything that failed?** → Bounded; only idempotent. Gateway does not hammer a non-idempotent POST.
13. **How do you do idempotency?** → \`Idempotency-Key\` or a business dedupe; same key returns the first result.
14. **Circuit breaker?** → **Ch42**. This chapter wires "don't stack retries into a storm."
15. **What do you say about tracing?** → \`trace_id\` stitches hops. Stop.
16. **Do you still need a gateway?** → North-south still yes (Ch17). Microservices is not every client hitting 30 services.
17. **Mesh / Istio?** → East-west policy can sink there; this loop does not recite filters.
18. **Relation to DDD?** → You split deploy and failure domain; how you cut the domain is **Ch45**.
19. **Fowler interview one-liner?** → **Independently deployable**. Not "lots of small processes."
20. **Why is next chapter DDD?** → Criteria are done; domain boundaries, aggregates, domain events live in **Ch45**.`,
    },
    {
      id: "sec-next",
      headingEn: "What's next",
      bodyEn: `Close the page and walk it in 20 seconds: split by independent deploy / team / failure domain; a distributed monolith is a sync mesh plus a shared DB; face-to-face sync, side effects async; discovery is name to instances, config is Ch28; timeout + bounded retry + idempotency; circuit breaker goes to Ch42; tracing is one \`trace_id\`. If you can drop gateway, orders, and messaging back onto Ch17 / Ch18 / Ch20, this chapter is done.

Next is **Ch45 · DDD & domain modeling**: bounded context, aggregate, domain events; how you draw the line with orders and payments. This chapter answers "should this become a process"; the next answers "how you cut the domain." Don't recite a tactics-pattern noun table early.

Self-check: left column, three hard-part lines; middle, split / don't-split contrast; right, discovery ≠ config + the timeout-retry-idempotency chain. Don't recite YAML and 200 services back.`,
    },
  ],
  reviewMdEn: `# Ch44 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | How do you open in 20 seconds? | Split by independent deploy / team / failure domain. Distributed monolith = sync mesh + shared DB. Face-to-face sync, side effects async. Discovery ≠ config (Ch28). Timeout + bounded retry + idempotency. Circuit breaker Ch42. \`trace_id\` named. |
| 2 | Three hard parts? | ① Whether to split / the criteria ② Sync vs async ③ Discovery + timeout/retry/idempotency. |
| 3 | Three split criteria? | **Independent deploy, team, failure domain.** Not every noun. |
| 4 | When do you not split? | Can't name the pain; by tech layer; still JOIN a shared DB. Modular monolith first. |
| 5 | Distributed monolith? | Many services, still sync-calling each other, sharing a DB, must ship together. Paid the tax, got no independence. |
| 6 | Fowler interview one-liner? | A service is **independently deployable**. More processes is not the definition. |
| 7 | Where does sync go? | The result the user is waiting for. Short chain: Client → GW → one business service. |
| 8 | Where does async go? | Side effects: email, points, index. Ch20. at-least-once needs idempotency. |
| 9 | Discovery vs config? | Discovery: name → healthy instances. Config: KV / version / rollback (**Ch28**). |
| 10 | Why must timeout be on? | A slow downstream fills you up, becomes a cascade. Timeout shorter than the upstream deadline. |
| 11 | Retry rules? | Bounded; jitter; only idempotent. Different instance. Gateway does not hammer a non-idempotent POST. |
| 12 | How do you open idempotency? | \`Idempotency-Key\`; same key returns the first result. That's how you safely retry a write after timeout. |
| 13 | Where is circuit breaker taught? | **Ch42**. This chapter only wires it next to timeout/retry, no state machine. |
| 14 | Tracing, name it? | Request carries a \`trace_id\`, hops become a chain. Not the OTel four-pillars textbook. |
| 15 | Still need a gateway? | Yes. North-south Ch17. Microservices is not the client hitting every service. |
| 16 | How does the order problem use this? | Write the order sync, take orderId; points and email async. Splitting inventory on a shared DB is a red flag. |
| 17 | Conway one-liner? | Org communication gets copied into the system. Service splits have to line up with teams. |
| 18 | 2026 default starting point? | Modular monolith; strangler-cut one piece when it hurts. Not the evolution endpoint. |
| 19 | What does this chapter not cover? | K8s YAML, Istio filters, the DDD tactics book, a 200-service pep talk, a cloud mesh shop. |
| 20 | Next chapter? | **Ch45 DDD**: bounded context / aggregate / domain events. |`,
});
