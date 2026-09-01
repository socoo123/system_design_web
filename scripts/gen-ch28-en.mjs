import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch28",
  titleEn: "Configuration center",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 50–60 min ｜ **Prereq**: protocols Ch40; resilience Ch42; governance Ch44 (can read later)
> **Goal**: push vs pull, versions, gray release, watch. Point at service discovery; don't write a microservices chapter.

Designing a configuration center is the last M4 case. Instant delivery covered matching after an order; this prompt swaps in **how you push dynamic config down to a running app**. Default is an **application config center**: feature flags / switches / timeout and rate-limit thresholds as KV. Not Git-as-config, not a K8s ConfigMap YAML tutorial, not full service governance (Ch44).

The interviewer is not scoring a Nacos vs Apollo SKU table, and not you lifting GitOps and mesh wholesale. Three hard parts: **push vs pull / watch**, **versions and consistency (who sees the change)**, **gray release of config**. Client **watch**: pull once at startup, get notified on change; the notify is thin, content is a separate pull. Persist **DB + cache**, not memory only.`,
    },
    {
      id: "sec-answer",
      headingEn: "How to answer in the interview",
      bodyEn: `**Opening 30 seconds (say it):**

> “Configuration center, three hard parts: how you watch (push vs pull), who sees a version change, how you gray-release config. Default is application config: feature flags, switches, timeout and rate-limit thresholds—not Git, not ConfigMap YAML, not microservice governance. Client pulls once at startup, then long-poll or a long-lived push; notify carries only the key / version, then pull the content. Server versions by namespace / app / cluster / key; writes use optimistic concurrency. Gray release by instance / tag / percent—same idea as Ch17 traffic canary, different object. Persist DB + cache. Registry owns the instance list, config owns KV; deep dive is Ch44.”

Then walk the 4 steps. Don't open by drawing the final picture or reciting product names.

${D2}

| Time-box | What you are doing |
|---|---|
| 3–10 min | Clarify: application config vs Git / ConfigMap, gray release or not, how you watch |
| Next 2 min | back-of-envelope: publish QPS is tiny; what costs is watch connections and notify fan-out |
| 10–15 min | High-level: Client → Config API → Cache + DB; Admin publishes |
| 10–25 min | deep dive: push vs pull watch, who sees a version, config gray release (point at Ch44) |
| 3–5 min | wrap-up: 3 bottlenecks (short-poll, memory only, all-at-once cutover) |

**red flag:** drawing a Git repo / Ingress YAML / sidecar before you asked scope; 30-second short-poll as the only design; config in memory only; stuffing the full payload into notify by default; reciting the Nacos vs Apollo feature table; drawing config gray release as Ch17 gateway 90/10 traffic; turning service discovery into a whole chapter. That's over-engineering, or lifting Ch17 / Ch44 wholesale.`,
    },
    {
      id: "sec-clarify",
      headingEn: "Clarifying questions",
      bodyEn: `Drawing before you asked = Jimmy. On a config center, stop at 5–7 questions; assume the rest and write the board. **The first question must be scope.**

| You ask | Typical answer / your assumption | What it changes |
|---|---|---|
| Application dynamic config, or Git / ConfigMap? | **application config center** (switches, thresholds, flags) | You need watch and versions; not rolling Pods, not Git pull |
| What do you store? | **feature flags / timeouts / rate-limit thresholds** | KV + callback; not business order data |
| Push or pull? | **pull at startup + watch** (long-poll or long-lived connection) | Don't lead with pure short-poll |
| Gray release? | **yes**; by instance / tag / percent | Keep it separate from Ch17 traffic canary |
| Same product as the registry? | **often asked together**; different data planes | One sentence of split, deep dive Ch44 |
| Rough scale? | teaching: **~10k instances** | For connections and fan-out, not some company's internals |

When they say “you pick,” write the assumptions:

> “I'll assume: an application config center, not Git, not ConfigMap. Client pulls the full set at startup, then long-poll or gRPC watch; notify carries only the key, then GET the content. Writes go through version CAS; history is rollbackable. Gray-release by instance first, then full. If the center is down, read a local snapshot. Registry / discovery is one sentence. I'll draw this; interrupt me if it's wrong.”

If they bring up Nacos / Apollo: **acknowledge the difference, then close the scope.** “They're mechanism examples: one leans HTTP long-poll, 2.x leans a gRPC long-lived stream. This loop is watch, versions, gray release—not SKUs.” If they want the whole mesh / service-discovery chapter: **one sentence of boundary.** “Config is KV; discovery is the instance list. Ch44.” Asking past 10 minutes is also a red flag. The golden line is still: **ask the key questions → state your assumptions → write the board → move.**`,
    },
    {
      id: "sec-estimate",
      headingEn: "Back-of-the-envelope",
      bodyEn: `The formulas live in Ch03. Here you only need order of magnitude, to show you know **this problem's bottleneck is hung watches and notify fan-out on a publish, not “config read/write QPS.”** The numbers below are **teaching assumptions** on the board—not some company's internals, not a public cloud-console peak treated as fact.

Assume: about **10k instances**; each instance watches about **10** configs (namespace / dataId); publishes come from humans and CI, not the user request path.

| Item | How you estimate | Order of magnitude (teaching) |
|---|---|---|
| Publish QPS | humans + pipeline | **single digits to hundreds**; peak still far below business reads |
| Watch connections | 1e4 instances × one channel | **~10k** long-polls held or long-lived connections (Ch40) |
| One fan-out | a hot key subscribed by many instances | one publish may **thousands to tens of thousands** of notifies; you must batch (Ch42) |
| Startup pull | burst during a rolling deploy | a few KB per instance; almost nothing in steady state |
| Storage | small keys + history versions | **inside GB**; not an object-storage prompt |

Config looks like “just a KV.” What costs is not disk: **tens of thousands of idle connections holding file descriptors and threads**, and **flip a hot switch and every subscriber wakes at once**. Short-poll (GET every 5 seconds) multiplies idle QPS—that's a mis-count and a red flag.

**How to say it:**

> “Whiteboard 10k instances: publish QPS is noise. What you fear is watch connections and a notify thundering herd. Notify carries the version; content is pulled on demand. I will not treat some cloud config center's public peak as an internal number.”

Common mis-counts: parking a business API's 10k-QPS onto config reads/writes; or only quoting storage and pretending connections are free. Use teaching orders of magnitude, and **label them as assumptions.**`,
    },
    {
      id: "sec-arch",
      headingEn: "High-level architecture",
      bodyEn: `Left to right, draw **one control plane**: Client → Config API → Cache + DB. Do not fan out registry/discovery, mesh, or GitOps on this picture. Admin / CI publish goes through the same API's write path. After the interviewer buys in, then split push vs pull, versions, gray release.

${D2}

**This diagram cites**: Ch40 protocol choices · Ch42 messaging, resilience, containers · Ch44 microservices and service governance

**What you store (stop when it's enough):** keyspace \`namespace / app / cluster / key\` (some implementations call it dataId + group). Value is text / JSON. Each publish has a **version** (or MD5 / notificationId). Historical Releases are rollbackable. Gray-release rules hang on the same key, not a second system.

**Read path:** SDK \`GET\`s the full set into memory at startup, writes a **local snapshot** (so the app still boots if the center is down). Then **watch**: long-poll or a long-lived connection. Change arrives → callback → the app refreshes timeouts / switches / rate-limit thresholds. \`getConfig\` reads the in-process cache, not the server every time.

**Write path:** auth → optimistic concurrency (carry the current version / MD5) → persist DB → update cache → notify subscribers. Don't synchronously fan-out tens of thousands of clients on the request thread (Ch42: wake them in batches).

Stop the high-level here and ask: “Does this direction look OK? Next I'll dig into how watch works, then who sees a version, then config gray release; service discovery is just a boundary.”

**How to say it:**

> “Client hits Config API, behind it cache plus DB. Pull at startup, watch on change. Admin publish writes a version then notifies. Discovery and mesh stay off this picture.”`,
    },
    {
      id: "sec-watch",
      headingEn: "Deep dive · push vs pull and watch",
      bodyEn: `First hard part. 2026 default is not “push a giant JSON” and not “short-poll every 5 seconds.” Default is **pull at startup + notify on change + pull the content**. The channel can be HTTP **long-poll** or a **gRPC / WebSocket long-lived connection**—both are watch; the difference is the protocol (Ch40).

${D2}

**This diagram cites**: Ch40 protocol choices

**Long-poll (the mechanism on Apollo's client path):** Client hits \`/notifications\` with the current namespace's version / notificationId. Server **holds** the request with an async result for about 30–60 seconds. No change → **304**; change → return immediately **which key / version changed**, Client then \`GET\`s the content. LB-friendly (still HTTP); latency upper bound is about one hold window.

**Long-lived push (the mechanism on Nacos 2.x gRPC):** a bidirectional stream stays open; server pushes **change events** (usually still the triple / dataId, not the full text). Client marks stale, then batch-compares MD5 and pulls on demand. Latency is milliseconds; the server has to own connection lifecycle, idle timeout, reconnect backoff (Ch42). WebSocket is the same class of channel; don't lock it to “must be WS.”

| | Short-poll | Long-poll (**valid default**) | Long-lived push (**also a valid default**) |
|---|---|---|---|
| Idle | GET every few seconds, fake-high QPS | held, almost no idle | one connection, event-driven |
| Latency | up to one period | up to one hold | push as soon as it changes |
| Protocol / LB | simplest | HTTP, most LBs pass it | idle / ports / stickiness (Ch40) |
| Server state | none | held requests | connection table; reconnect must re-subscribe |
| Interview | **red flag as the only design** | one of the 2026 standard answers | one of the 2026 standard answers |

**Why doesn't notify carry the full body?** The notify API only answers “did it change?”; pulling config is a separate idempotent GET. Thin channel, easy to retry, easy to reconcile. Apollo's public implementation is notify-then-pull; Nacos 2.x change push is also usually a light notify. Stuffing 200KB of JSON into every wake-up amplifies retry, and gray release gets hard (different instances shouldn't get the same payload).

**Safety net:** even a short push can drop. Client **reconciles on a timer** (minute-level pull of MD5 / version; unchanged → 304). Config center down: read a **disk snapshot**, boot with the old value—most flags fail-open, auth / security flags fail-close. Don't pretend watch never drops.

**callback:** SDK \`addListener\`. After new text arrives, the app refreshes: timeouts, rate-limit thresholds, feature flags. Don't do heavy work on the listener thread (Ch42). Changing class shape or a serialization protocol **cannot hot-reload**—admit it: that's a deploy, not the config center's job.

**How to say it:**

> “Pull once at startup, then watch. Long-poll or gRPC both work. Notify carries only the key, then pull the content. Minute-level reconcile + local snapshot. Short-poll is not the first answer.”

trade-off: long-poll is simple to implement, latency has an upper bound; long-lived connections are more real-time, connection ops are heavier. Pure short-poll wastes QPS. Putting the full body in notify looks like one less RTT; the API's job blurs, retry and gray release both get harder.`,
    },
    {
      id: "sec-version",
      headingEn: "Deep dive · versions and consistency",
      bodyEn: `Second hard part. When they ask “who sees the change,” don't say “the whole fleet in the same millisecond.” Config consistency is **a per-key version clock + each Client catching up on its own**; old and new necessarily coexist in the middle.

${D2}

**This diagram cites**: Ch40 protocol choices · Ch42 messaging, resilience, containers

**What a version looks like:** each successful publish creates a Release: a monotonic version / notificationId, or a content MD5. Client remembers the last number it saw. GET carries the local version; same → 304. Keyspace is \`namespace / app / cluster / key\`; gray release is another Release on the same key, not a renamed key.

**Writes use optimistic concurrency:** two people edit the same draft; the later write carries the old MD5 / version → **conflict, reject**, not silent last-write-wins. Nacos's public \`casMd5\` is an example of this mechanism. The console needs history: rollback = re-publish the previous Release, not \`DELETE\` the current row.

**“Who sees it” in four stages, don't mix them:**

| Stage | What you see | How to say it |
|---|---|---|
| 1. DB commit | the authoritative version is in | memory-only is a red flag; process restart loses the publish |
| 2. Server cache | Config API reads the new value | multi-node may have a short dump lag |
| 3. Notify | subscribers get woken | only the changed key; can batch to avoid a thundering herd (Ch42) |
| 4. Client callback | **that instance** is on the new value | the fleet has **old and new together** for a while—that's normal |

So: **don't promise linearizable global simultaneous cutover.** You promise: every instance eventually sees the same published version; the window is seconds to tens of seconds, depending on the watch channel and fan-out. That's why you gray-release—let a subset of instances see v2 first.

Server cluster in one sentence: config data usually cares more about “don't lose it, don't fork” than instance heartbeats do; in open-source implementations config often takes stronger replication, discovery often takes eventual consistency. Protocol details go to Ch44; this loop only needs “DB is the source of truth, cache is the hot path.”

**How to say it:**

> “Publish lands in DB and bumps the version, CAS to prevent overwrite. After notify, each Client pulls on its own. The fleet will not align in the same millisecond; rollback is a historical Release. Memory-only is not a config center.”

trade-off: version + history buys audit and rollback, in exchange for storage and one extra step per publish. Forcing “return only after every instance has transactionally committed” kills publish QPS and availability together—config does not need cross-instance 2PC.`,
    },
    {
      id: "sec-gray",
      headingEn: "Deep dive · gray release and the discovery boundary",
      bodyEn: `Third hard part. Config gray release is **the same code, different instances reading different values**. Ch17's canary is **the gateway sending requests to different code versions**. Same idea (small then large, rollbackable), different object—don't reuse that 90/10 traffic picture as the config-center final diagram.

${D2}

**Rules (stop when it's enough):** by **IP / instance id** (Apollo-style gray rules), by **tag** (AZ, cluster, canary group), by **percent** (\`hash(instanceId) % 100 < n\`). Hit → read the gray Release; miss → read production. A gray change only wakes matching subscribers. Watch error rate and business metrics, then **merge to full** or **stop the gray**. User-dimension flags: the rule still lives in config, **the decision can be computed in-app with userId**—that's client-side feature-flag evaluation; don't mash it into one picture with “server ships two payloads by instance.”

| | Ch17 traffic canary | This chapter's config gray |
|---|---|---|
| What you split | request → v1 / v2 **process** | instance → v1 / v2 **KV** |
| Who executes | gateway weight / header | Config API picks a Release by client identity |
| Code | often two artifacts | **the same code** reads different thresholds / switches |
| Rollback | weights back to 100/0 | stop the gray or re-publish the previous Release |

Say the dangerous case out loud: gray-releasing a switch for “old and new protocol are incompatible” **splits fleet behavior** (half serialize A, half B). That follows a deploy, not config gray. Rate-limit thresholds, timeouts, rollbackable flags are what you gray first.

${D2}

**This diagram cites**: Ch42 messaging, resilience, containers · Ch44 microservices and service governance

The sequence is that loop: **publish → persist → notify → Client pulls again → callback.** Four roles and stop. Don't add a registry, mesh, or Git on top.

Config center and registry are **often asked together**. One sentence of split, then stop—don't write a microservices chapter.

${D2}

**This diagram cites**: Ch44 microservices and service governance

| | Config center (**this chapter**) | Registry / discovery (**Ch44**) |
|---|---|---|
| Data | switches, thresholds, copy, flag rules | \`host:port\`, weight, health |
| Change rate | humans / CI, low | heartbeats, up/down, high |
| Consistency taste | wants history, wants CAS, usually more afraid of loss | more afraid of unavailability; a briefly dirty list is OK |
| What you watch | a key | a service name |

The same product (Nacos is a common example) can do both data planes; **on the whiteboard they are still two tables**. How mesh / sidecar fetches config and does mTLS: point at Ch44, don't expand this loop.

**How to say it:**

> “Config gray ships another Release by instance or percent, not gateway traffic split. Gray first, then full. Registry owns who's up; config owns which switch is on. Discovery details go to Ch44.”

trade-off: gray buys a safety window, in exchange for a stretch of split behavior—only gray rollbackable items. Server-side filter by instance keeps rules centralized; client-side eval by userId fits “this user sees the new copy.” Neither belongs as a release-platform YAML picture.`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs no dedicated book chapter",
      bodyEn: `<details>
<summary>No Xu chapter; don't lead with old internet answers</summary>

Alex Xu's two volumes have no “design a configuration center.” This chapter is rebuilt from 2026 CN/general public interview prompts and engineering practice (long-poll / long-lived watch, version CAS, instance gray, config vs discovery split)—not a notes polish, not a Nacos / Apollo product manual.

| Old internet / tutorial inertia | How you answer now |
|---|---|
| Short-poll every 5–30s as the only design | **pull at startup + watch**; minute-level reconcile is only a safety net |
| Stuff the full config into notify | **notify key / version first, then GET** |
| Memory only / a single-node Map | **DB + cache**; Client also keeps a disk snapshot |
| Git repo as the config center | Git has no watch, no instance gray; publish is a commit |
| ConfigMap / roll Pods after a change | that's deploy config; this chapter is **runtime hot reload** |
| Recite Nacos vs Apollo feature table | use them as **mechanism examples** (HTTP hold vs gRPC stream) |
| Config gray = gateway 90/10 | **same code, different KV**; traffic canary is Ch17 |
| UDP-push config as the 2026 default | old helper; now long-poll or a long-lived connection |
| Fill the board with registry / mesh | **one sentence of split**, deep dive Ch44 |
| Some company's config QPS as fact | **teaching assumption**; order of magnitude only |

The skeleton that still holds: centralized store, dynamic updates, versions and rollback. What's dated is leading the whiteboard with short-poll, Git, Pod restarts, and a product comparison table.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **“Can Git be the config center?”** → It can store. It cannot watch, cannot gray by instance. Runtime switches need a config center.
2. **“What about ConfigMap?”** → A change usually rolls Pods. This chapter is in-process callback hot reload.
3. **“Why not short-poll?”** → Idle QPS, latency equals the period. Long-poll or a long-lived connection.
4. **“Push or pull?”** → Pull at startup; on change **notify then pull**. Pure-push of the full body is not the default.
5. **“Must it be WebSocket?”** → No. HTTP long-poll and a gRPC stream are both watch channels (Ch40).
6. **“Why doesn't notify carry the body?”** → Split the APIs, easy to retry, easy to gray. Client then GETs.
7. **“Does every machine see it at the same time?”** → No. Each instance catches up on its own; old and new coexist in the middle.
8. **“Two people edit at once?”** → version / MD5 CAS, conflict rejects. Not last-write-wins.
9. **“Config center is down?”** → Boot from a local snapshot. Most flags fail-open; security items fail-close.
10. **“How do you gray?”** → IP / tag / percent. Not Ch17 gateway traffic split.
11. **“What's the relationship with the registry?”** → Config is KV, discovery is the instance list. Deep dive Ch44.
12. **The final picture is already huge and they want more boxes?** → Mesh, GitOps, SKU tables, the whole microservices chapter are not this chapter. Going to the bottom on the three hard parts scores higher than twenty boxes.`,
    },
    {
      id: "sec-next",
      headingEn: "Wrap-up and what's next",
      bodyEn: `Never say the design is perfect. Speak three bottlenecks:

| bottleneck | How you take it |
|---|---|
| Short-poll idle / stuffing the full body into notify | Pull at startup + watch; notify carries only the version, then GET |
| Memory only, no versions | DB + cache; CAS; history rollbackable; snapshot as safety net |
| All-at-once cutover / mixed with discovery | Instance gray first; KV vs instance list; discovery goes to Ch44 |

Self-check: close this page. Give the 30-second open + whiteboard high-level, and talk long-poll or long-lived watch, who sees a version, and config gray to the air. Wherever you stumble, come back to that section. Service discovery is only the split.

M4 advanced business wraps here. On the mainline catalog, next is already-written **Ch29 · LLM inference service**. This lane's next chapter is **Ch43 · Hyperscale data** (foundation, no longer the case 4-step frame).`,
    },
  ],
  reviewMdEn: `# Ch28 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | Three hard parts of a config center? | Push vs pull / watch; versions and consistency (who sees it); config gray release. Discovery is a pointer. |
| 2 | Default scope? | **Application config center** (flags / switches / timeout and rate-limit thresholds). Not Git, not ConfigMap YAML, not a microservices chapter. |
| 3 | How do you watch in 2026? | **Pull at startup + notify on change + pull the content.** Long-poll or a gRPC/WS long-lived connection. Short-poll is not the first answer. |
| 4 | Does notify carry the full body? | **Not by default.** Only key / version; Client then GETs. Thin, easy to retry, easy to gray. |
| 5 | Long-poll vs long-lived connection? | Hold 30–60s, 304 or wake vs event push. Both are watch. Protocol / connection ops: Ch40, Ch42. |
| 6 | Who sees a change? | Persist, bump version → notify → **each instance pulls on its own.** The fleet briefly has old and new together, not global simultaneous. |
| 7 | Two people edit at once? | **Optimistic concurrency** (version / MD5 CAS). Rollback is a historical Release. |
| 8 | Persistence? Center is down? | **DB + cache**, not memory only. Client **local snapshot**; most flags fail-open. |
| 9 | Config gray vs Ch17 canary? | Gray is the same code, different **KV**; Ch17 is the gateway splitting **traffic / code versions**. By IP, tag, percent. |
| 10 | Config vs service discovery? | Config: KV, versions, rollbackable. Discovery: instance list, heartbeats. Deep dive **Ch44**. |
| 11 | What does callback do? | SDK listener refreshes timeouts / switches / thresholds. Things that can't hot-reload go with a deploy. Don't block the listener thread. |
| 12 | Biggest over-engineering on this prompt? | SKU tables, GitOps, mesh, the whole discovery chapter, short-poll, memory only. Go to the bottom on the three hard parts. |`,
});
