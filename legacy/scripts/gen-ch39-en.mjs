import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch39",
  titleEn: "Load balancing & statelessness",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 90–120 min ｜ **Prereq**: Ch05 hash ring; Ch02 adding an LB
> **Goal**: L4/L7; sessions sticky vs stateless; Maglev vs consistent-hash LB. This is not a cloud shopping trip. We do not re-teach the Ch05 ring.

This is **M6's fourth foundation chip**, not another 4-step design problem. On the spine, Ch02 episode 3 adds an LB, episode 6 goes stateless, Ch17's gateway routes by path, and Ch12's long-lived connections hit "you have to stick to one box"—here we unpack **L4 vs L7, where sessions live, and how you pick a backend**. Design problems just cite it; they do not turn the whiteboard into an LB lecture. You already know Ch05's ring + vnode; here we only contrast **how LB picks a backend** with hashing. We do not re-do lookup and migration by hand.

**One line:** put an LB in front of a stateless app: L4 forwards by **connection**, L7 forwards by **request**; sessions default to **external (Redis)**, not sticky; line-rate L4 backend selection uses a **Maglev lookup table**—don't treat Ch05's KV ring as the packet-forwarding default.

Three hard parts (the pieces worth digging):

1. **How to open L4 vs L7** — connection vs request; TLS terminates at L7; gRPC / HTTP2 need L7 to split by RPC
2. **Sessions: sticky vs stateless** — default stateless + an external session store; sticky is the fallback when you truly have in-memory state
3. **Maglev vs consistent-hash LB** — vs Ch05: the ring is for partitioning, the lookup table is for the LB; that's the interview sentence

This chapter **does not cover**: cloud-vendor ELB / ALB / NLB SKU catalogs, K8s Service YAML, re-teaching Ch05 vnodes as the spine, Maglev's C++ table-fill implementation, a DNS chapter. Anycast / DNS get one line on "how traffic enters the DC." East-west Mesh gets one line pointing at **Ch44**. Protocol details (REST / gRPC / WS) live in **Ch40**.`,
    },
    {
      id: "sec-pitch",
      headingEn: "One-line definition · 20-second interview open",
      bodyEn: `First put the scoring signal on the table: you can split connection vs request, you default to stateless, and you know Maglev is an LB lookup table—not another ring to draw.

> "Once you add machines, which box gets the request is the LB: traffic distribution + health checks + failover. First pick **L4 or L7**: L4 looks at the connection (5-tuple)—fast, does not parse HTTP, TLS passes through; L7 looks at the request, can terminate TLS, route by path / header. gRPC / HTTP2 multiplex many RPCs on one TCP connection; L4 pins the whole connection to one box—you need L7 to split by request. Sessions default to a **stateless app + Redis (or JWT)**; do not open with sticky. Sticky is the fallback when the process truly has state you cannot move. Backend pick: homogeneous short requests, round-robin is enough; line-rate L4, few connection resets → **Maglev lookup table**. Ring + vnode is Ch05 for KV / cache partitioning, not the packet-forwarding default. Before you take a box out, **connection draining**. Cross-DC, name Anycast or DNS; this is not a DNS class."

The whole chapter walks this one chain. Say the 20 seconds, then stop. Let the interviewer decide whether to dig into L4/L7, sessions, or Maglev.

${D2}

This figure cites: Ch02 adding an LB / going stateless · Ch05 hash ring (contrast, don't re-teach)

| Interviewer ask | Where you land |
|---|---|
| "What's the difference between L4 and L7?" | Connection vs request; who unloads TLS; why gRPC must be L7 |
| "How do you keep the session?" | Default external; volunteer sticky's cost |
| "Consistent hashing for LB?" | Ch05 ring for partitioning; Maglev lookup table for backend pick |

**red flag:** leading with a cloud product name; opening with sticky; reciting a vnode ring as L4 forwarding; drawing one L4 box for gRPC and declaring the load even.`,
    },
    {
      id: "sec-l4l7",
      headingEn: "Mechanism · L4 vs L7 (connection vs request)",
      bodyEn: `First hard part. **In a 2026 interview, reciting OSI layer numbers is worse than saying "what I see is a connection or a request."**

L4 (transport) only looks at **IP + port**, commonly plus protocol, making a **5-tuple** (src IP / src port / dst IP / dst port / protocol). It pins one **TCP / UDP connection** to one backend and forwards packet contents as bytes. It does not parse HTTP, so it never sees URL, Cookie, or gRPC method.

L7 (application) terminates the client connection and **reads the request**: path, header, cookie, HTTP/2 stream. Then it opens its own connection to the backend. Client → LB is one hop, LB → App is another—that's a reverse proxy. A gateway (Ch17) adds auth, rate limiting, protocol translation on this layer; this chapter only takes the cut "pick a backend per request."

${D2}

| | **L4** | **L7** |
|---|---|---|
| What you see | Connection: IP + Port (5-tuple) | Request: path / header / cookie / RPC |
| Decision grain | **The whole connection** goes to one backend | **Each request** (each stream on HTTP/2) can change backend |
| TLS | Default **passthrough** (no unwrap) | Often **termination** at the LB; you can re-encrypt on the internal network |
| Latency / CPU | Cheap, can be line-rate | Parse and crypto cost more |
| Typical use | Throughput-first TCP/UDP, TLS passthrough | HTTP APIs, path-based canaries, gRPC |

Draw the whiteboard chain straight first. Don't fan out three App boxes.

${D2}

This figure cites: Ch17 API gateway (L7 extras) · Ch40 protocol choices (HTTP / gRPC unpack there)

**Why TLS termination is usually at L7:** to see HTTP you have to unwrap TLS first. Cert and private key land on the LB; backends can be plaintext or wrap another hop of internal TLS (re-encrypt). L4 passthrough keeps the cert on the App; the LB is a byte pipe—use it when compliance says "the cert cannot leave the app." The cost is the LB goes blind. How to open it:

> "If I route by path or look at a header, TLS comes off at L7. Only if it must pass through and the cert has to stay in the app do I use L4 passthrough."

**gRPC / HTTP2 is the question they're handing you.** One long-lived connection multiplexes many RPCs. L4 only sees that one connection; every RPC lands in the same process—replicas get none of the split. L7 terminates HTTP/2 and picks a backend per **stream / RPC**. Ch40 covers protocols; here the bar is: if the problem says gRPC, you open with L7 awareness. Don't treat L4 as the answer.

What one request looks like on L7 (participants are just Client / L7 / App):

${D2}

L4 has no "forward this one GET" layer: after the handshake, every byte on that connection goes to the same box until it disconnects.

Production is often **two tiers**: an L4 / VIP in front to eat packets, do health and failover; L7 behind it for routing. On the interview, Client → LB → App is enough; split the two tiers if they ask. Don't open by drawing the whole Mesh family—east-west sidecars are **Ch44**.

How to open it:

> "L4 is by connection, L7 is by request. HTTP APIs and gRPC I default to L7; pure TCP throughput or TLS that must pass through is L4. TLS comes off at the layer that can see HTTP."

**red flag:** reciting the seven OSI layers instead of a decision; claiming L4 "can see the URL too"; drawing only L4 for gRPC and saying the load is even; drawing gateway, WAF, and Mesh as three stacks and still not being able to say connection vs request.`,
    },
    {
      id: "sec-session",
      headingEn: "Mechanism · sessions: sticky vs stateless",
      bodyEn: `Second hard part. It shows up the moment Ch02 episode 3 adds an LB: if session lives in one Web box's memory, horizontal scale is fake. **The 2026 first answer is not sticky—it is moving state out of the process.**

${D2}

| | **Sticky** (affinity) | **Stateless + external store** |
|---|---|---|
| Where the request goes | Same user, same App if you can | **Any** healthy instance |
| Where state lives | Process heap / local disk | **Redis** (or DB); or JWT on the client |
| Scale / die | New boxes are cold; that box dies, the session is gone | Instances are disposable; the next hop reads the store |
| What the LB has to remember | cookie or source IP → node | It can ignore who the user is |
| When to open it | Truly unmovable in-memory state (a match, long-lived presence) | **Default** |

The stateless chain adds one hop to the store. Don't fan out three App boxes:

${D2}

This figure cites: Ch02 episode 6 going stateless · Ch12 chat (long-lived connections are the exception, not the default)

**Why Redis is the default, not sticky:** autoscaling, rolling deploys, one box OOM—the user should not get logged out. The LB itself can scale out too—it does not have to hold a session table. The cost is one RTT per request (milliseconds; a local short TTL can still block hot keys). This is a trade-off, not free.

JWT / encrypted cookie: state sits on the client; the App still has no session store. Revoke, renew, size is a different ledger—Ch02 already named it; this is not a token class. Carts and login that need kick-out and server-side invalidation still lean Redis.

Two sticky implementations—open by naming the downside:

| How | How it sticks | Pit you name immediately |
|---|---|---|
| **Cookie affinity** | LB plants a cookie pointing at an instance | User clears cookies → new box; instance dies → cookie is dead |
| **Source IP** | Same client IP → same box | **NAT / corporate egress / CDN**: one IP, tens of thousands of people, everyone piles onto one box—classic bottleneck |

Consistent hashing maps \`user_id\` onto an instance. Less jitter than "whatever sticky," still **leaving state in the process**. That instance dies, that slice of users still loses in-memory state. To keep state, still externalize; hashing here is only "who owns this user's long-lived connection," not a session backup.

**The truly-stateful exceptions (volunteer them so a follow-up does not freeze you):** multiplayer matches, voice rooms, Ch12-style gateways that hold presence / push slots on the connection. Then:

1. Ask first whether you can externalize the state (most HTTP businesses can).
2. If you cannot, pin the **connection** with hashing or sticky, and admit failover will drop it—reconnect or a migration protocol.
3. Don't say stateless with your mouth and draw the cart on the Web heap—that's a red flag.

How to open it:

> "Default stateless: the App is disposable, session lives in Redis. Sticky is not the first answer. Source-IP affinity behind NAT becomes a single-box hotspot. IM / matches with in-memory state is when I hash-pin the connection, and I say a death means reconnect."

**over-engineering:** stateless already works, but you ship sticky + session replication + local cache as three stacks and still cannot say who is authoritative.`,
    },
    {
      id: "sec-maglev",
      headingEn: "Mechanism · Maglev vs consistent-hash LB (vs Ch05)",
      bodyEn: `Third hard part. Ch05 already covered the ring, clockwise, vnode, and \`hash % N\`. **This chapter does not re-teach that chapter.** Here we only answer: both are called consistent hashing—why **KV partitioning** and **LB backend pick** are not the same job.

${D2}

This figure cites: Ch05 consistent hashing (ring + vnode live there; here we only contrast)

**The interview sentence (this paragraph is enough):**

> "Ch05's ring is for **cache / KV partitioning**: nodes have names, they come and go arbitrarily, lookup can be O(log n), add/remove expects to move only k/n. Maglev (NSDI 2016) is for **L4 LB backend pick**: precompute a fixed-size lookup table (the paper commonly uses prime **M = 65537**), hash the connection's 5-tuple into an index, **O(1) fetch the backend**. Each Maglev independently computes **the same table** from the same healthy backend set, so whichever Maglev the router's ECMP lands a packet on picks the same backend—no cluster-synced connection table. Karger's line prioritizes less migration; Maglev's paper says it outright: to be extremely even across a few hundred backends, a ring's table gets too large for line rate, so they switch to lookup and **prioritize even spread**. Migration is still about 1/N, but it is not the same data structure."

One backend lookup is three leaves:

${D2}

How the table is built—name it in the interview, **do not recite the permutation code:** each backend has a preference order over 0..M−1 (name hashes to offset / skip); they take turns occupying still-empty slots until the table is full. So shares are close to even; weighting changes "how many turns." Add or remove one box and you **recompute the whole table**; about 1/N of the slots change owner—same order-of-magnitude story as "only cut one arc" on the ring, implementation is not a vnode ring.

| | **Ring + vnode (Ch05)** | **Maglev lookup table** |
|---|---|---|
| Job | Data / cache **partitioning** | Per-packet **which App** |
| Lookup | Binary search on ordered points | One index, **O(1)** |
| Nodes | Arbitrary names; you can pull one from the middle | Arbitrary backend set |
| Evenness | Lots of vnodes | Table large enough (prime M) + taking turns on slots |
| Paper motive | Less migration, hot-web caching | Line rate; many Maglevs stay consistent with **no shared state** |
| Whiteboard | KV / cache default | "software L4 LB / Envoy maglev" |

Maglev is **not** pure stateless forwarding: in steady state it uses the table; when the table changes or ECMP sends a flow to a different Maglev, local **connection tracking** tries not to reset already-established TCP. A tracking miss is when you look up the table again. This is not the same thing as "the App is stateless"—the LB may remember a 5-tuple so connections don't drop; the App still should not put the cart on the heap.

Return path, one line: **Direct Server Return** (encapsulate to the backend, response goes straight to the client) so the LB does not eat return bandwidth. Name it and stop; this is not a tunneling class.

Envoy / data-plane \`maglev\` vs \`ring_hash\`: the former is this table; the latter is Ch05's ring. Problem is a software LB behind a gateway, huge connection rate → Maglev. Problem is Redis sharding → the ring. **Jump Hash** is still Ch05's line: saves memory but you cannot delete arbitrary buckets; it is not the L4 default.

How to open it:

> "Partitioning takes the ring. LB takes Maglev lookup: O(1), each LB independently computes the same table. I will not fill a Maglev table on a KV problem, and I will not hand-draw vnodes on packet forwarding."

**red flag:** calling Maglev "Google's vnode" and then hand-computing a 0–99 ring; reciting Pseudocode 1; saying consistent hashing is outdated or "rarely used" (that's old-book bias against \`% N\` hashing, not 2026).`,
    },
    {
      id: "sec-choose",
      headingEn: "Choice table",
      bodyEn: `Fill layer and state on the whiteboard first, then talk algorithms. Round-robin is not shameful; five layers of LB is over-engineering.

| Scenario | Default | Don't |
|---|---|---|
| Stateless HTTP API | L7; round-robin or least-request; session in Redis | Opening with sticky |
| Canary by path / header | L7 | Pretending L4 can see the URL |
| gRPC / HTTP2 | L7, per RPC | L4 pinning one connection |
| Pure TCP / UDP throughput, TLS passthrough | L4 | Forcing an application-layer parse for "smarts" |
| Line-rate L4, many LBs no shared state, few resets | Maglev lookup table | Treating a Ketama ring as the per-packet default |
| Redis / KV sharding | **Ch05** ring + vnode | Filling a Maglev table as the partitioning job |
| Match / long-lived presence | Hash or sticky pin the connection; admit failover | Saying stateless while state sits on the heap |
| Deploy, scale-in | Health check + **connection draining** | Killing connections on the process |
| Cross-DC entry | Anycast VIP or DNS into the nearest Region | Designing authoritative DNS and a TTL textbook in this chapter |
| Service-to-service (east-west) | Name sidecar / client-side LB; details **Ch44** | Copying a north-south diagram and calling it Mesh |

Algorithms, three sentences, not a catalog: request cost even → round-robin; cost varies, long-lived connections → look at current connections/requests (least-conn / least-request—this is **dynamic**, not a static table); need affinity and the backend set will change → hashing (line-rate L4 uses Maglev; partitioning uses the ring).

Health checks and draining, name them:

${D2}

**Health check:** active probes (TCP up, HTTP 200, gRPC health). Consecutive failures pull it from the pool; success puts it back. Passive (looking at real-request 5xx) can be one extra line; it does not replace active probes. After you pull it, new connections don't go there; **existing connections** need draining: stop scheduling new requests, wait for in-flight to finish or time out, then take it down. A rolling deploy that does not drain spends the error budget in one shot.

**Anycast / DNS (this is not a DNS chapter):** the same VIP is announced from multiple DCs; packets enter the nearest ingress—that's Anycast. DNS resolving a name to different Regions is another way into a DC; TTL and caches make cutover slow. One sentence each in the interview; mechanism depth belongs to networking / Ch02 episode 7. Don't draw a resolution chain here.

How to open it:

> "Stateless HTTP uses L7 + an external session. gRPC must be L7. Line-rate L4 backend pick uses Maglev. Drain before you take a box out. Entering a DC, Anycast or DNS—name it and stop."`,
    },
    {
      id: "sec-papers",
      headingEn: "Papers and classic systems",
      bodyEn: `M6 needs names you can drop. Two required, two optional below. **The interview one-liner** is in the table; don't memorize page numbers, don't invent internal pps.

${D2}

The timeline is only a memory aid: first the hash that "moves less when the set changes," then software L4 in the cloud, then Google writing lookup tables into NSDI. That does not mean you implement all three.

| | Paper | Required / optional | Interview one-liner |
|---|---|---|---|
| 1 | **Eisenbud et al.**, NSDI 2016, *Maglev: A Fast and Reliable Software Network Load Balancer* | Required | Software L4 on commodity Linux; ECMP into Maglev; **lookup table** (commonly M=65537) O(1) backend pick; each instance independently computes the same table. Connection tracking blocks resets. **A ring that is extremely even across a few hundred backends makes a table too large**, so they don't take Ketama. In production from 2008 through the paper |
| 2 | **Karger, Lehman, Leighton, Panigrahy, Levine, Lewin**, STOC 1997, *Consistent Hashing and Random Trees: Distributed Caching Protocols for Relieving Hot Spots on the World Wide Web* | Required | The title is already **Web hot spots / caching**: the machine set changes, objects stay on the same box if they can. LB scene = hash for affinity, scatter less traffic. **How to draw the ring goes back to Ch05**; here we only take the "less remapping" sentence |
| 3 | **Karger et al.**, WWW 1999, *Web Caching with Consistent Hashing* | Optional | Connects the STOC idea to a cache array: browser/proxy uses the same hash to pick a cache. Proof that CH was **scheduling requests onto a cache** from day one, not only Dynamo-style partitioning later |
| 4 | **Patel et al.**, SIGCOMM 2013, *Ananta: Cloud Scale Load Balancing* | Optional | Another cloud software L4: reliable control plane, data plane scales out, **DSR** so the return path does not traverse the LB. Together with Maglev: "L4 on commodity boxes" is 2010s orthodoxy, not a cloud shopping list |

**Maglev, three punches (no fourth punch into C++):**

1. **The same table:** same backend set → every Maglev has the same table → ECMP with no shared state still picks the same backend.
2. **Even spread first:** occupying slots by turns, not "scatter vnodes again."
3. **Tracking is the fallback:** table or Maglev affinity changed, the local 5-tuple table tries to keep TCP.

Don't unpack Karger 1997's random trees / hot-web protocol—the interview wants the origin of the four words consistent hashing, and that its **objective function differs** from Maglev (less moving vs line-rate even spread).`,
    },
    {
      id: "sec-used",
      headingEn: "Which design problems use this",
      bodyEn: `Do the spine problems first; jump into this chapter when you get stuck. Back-links are not "finish M6 then start writing."

| Chapter | The sentence you use |
|---|---|
| **Ch02** scale | Episode 3 managed LB; episode 6 **stateless**, sticky as the counterexample |
| **Ch05** hashing | Ring for partitioning; Maglev **points here**—don't fill the table over there |
| **Ch04** rate limit | Usually at L7 / the gateway; not a quota an L4 5-tuple can see |
| **Ch09** short URL | Web is stateless; read-path cache is Ch38, not sticky |
| **Ch11** Feed | Stateless hydrate; don't pin the timeline in one Web box's memory |
| **Ch12** chat | Long-lived / presence: you **can** hash-pin the gateway; failover means reconnect. Don't copy this onto HTTP businesses |
| **Ch17** gateway | L7 routing, TLS, rate limit; layered against a "pure L4 VIP" |
| **Ch18 / Ch24** order / pay | API is stateless; the idempotency key lives in storage, not a Tomcat session |
| **Ch29** LLM inference | Request-level scheduling; gRPC streaming needs L7 / a dedicated scheduler—don't L4-pin a GPU process and think you're load balancing |
| **Ch32** LLM gateway | Same layer as Ch17: by request, not by connection |
| **Ch44** microservices | Who LBs east-west; this chapter only supplies north-south vocabulary |

Game matches, voice rooms: same family as chat—if you have in-memory state, don't pretend you're stateless. Leaderboards and object-store data planes do not scale out by sticky.`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs notes / the original book",
      bodyEn: `<details>
<summary>How the book / notes taught it then · cloud shopping and vnode re-derivation go here</summary>

The notes map to the AWS book's load-balancing chapter: the reverse-proxy family, a long static/dynamic algorithm table, hardware vs software, Nginx upstream, then patches for Mesh / eBPF / cloud SKUs. **That is not this chapter's body.** In 2026 you walk in with L4 vs L7, stateless as the default, and Maglev vs Ch05.

| Book / notes | How you answer now |
|---|---|
| ALB / NLB / CLB / GWLB comparison as the spine | **Managed L4 / L7**; don't recite SKUs |
| "Hashing is rarely used" because \`% N\` remaps | **Outdated.** Partitioning uses the ring (Ch05); L4 LB uses Maglev |
| Least-connections filed under static algorithms | **Dynamic** (looks at runtime connection count) |
| Sticky written as the orthodox plan | **Transition / exception**; default Redis or JWT |
| Re-deriving the vnode ring | **Forbidden.** Only contrast lookup table vs ring |
| Maglev table-fill homework / kernel-bypass pps | Name + table + the same table; don't memorize the numbers |
| K8s Service YAML, Cilium eBPF as the main story | One mental-model line; YAML is not an interview answer |
| Service Mesh must be drawn in this chapter | East-west **Ch44**; this chapter is north-south |
| DNS / GSLB / certificate tour | Anycast or DNS **named**; a dedicated chapter is not this one |
| Nginx config as the spine | Mechanisms spoken; don't paste an upstream block |

The body's first answer is this 2026 set. The fold only stops you from putting SKUs and ring hand-calc on the board.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **L4 vs L7 in one line?** → L4 by connection, L7 by request.
2. **Why can't gRPC rely on L4 alone?** → HTTP/2 multiplexes; L4 sees one connection; every RPC lands on the same backend.
3. **Where does TLS terminate?** → To see HTTP, it comes off at L7; cert must stay on the App → L4 passthrough.
4. **Default session plan?** → Stateless App + Redis (or JWT). Not sticky.
5. **Sticky's biggest pit?** → Box dies, state is gone; source IP behind NAT piles everyone onto one box.
6. **Cost of stateless?** → One extra hop to the session store. That's a trade-off.
7. **Maglev vs the Ch05 ring?** → Ring for partitioning, O(log n); Maglev for LB, O(1) lookup. Goals: less migration vs line-rate even spread.
8. **Why don't many Maglevs sync a connection table?** → Same backend set → same table; whichever box ECMP hits picks the same backend.
9. **How big is the lookup table?** → The paper commonly uses prime **65537**. Textbook anchor; don't invent internal config.
10. **Is Maglev fully stateless?** → Backend pick uses the table; keeping TCP uses local connection tracking.
11. **Health check failed?** → Pull from the pool. Taking it down still needs draining—don't kill in-flight.
12. **What is Anycast?** → Same VIP announced from many sites; packets enter the nearest ingress. Don't unpack a DNS class.
13. **Is round-robin too weak?** → Homogeneous short requests, it's enough. Shipping Maglev without being able to say 5-tuple is over-engineering.
14. **Gateway vs LB?** → LB distributes; the gateway is L7 plus auth and rate limit (Ch17). Often the same layer of software.
15. **Who LBs east-west?** → Name sidecar / client-side; details Ch44.
16. **Karger 1997 interview one-liner?** → Web cache hot spots: the set changes, keep objects on the same machine if you can.
17. **Why is protocol next?** → What L7 sees is HTTP/gRPC/WS; how you pick lives in **Ch40**.`,
    },
    {
      id: "sec-next",
      headingEn: "What's next",
      bodyEn: `Close the page and walk it in 20 seconds: L4 connection, L7 request; TLS comes off where you can see HTTP; gRPC needs L7; session defaults to Redis, not sticky; Maglev is lookup-table backend pick, the ring stays in Ch05; probe pulls the sick box, drain, then take it down. If you can drop gateway, chat long-lived connections, and KV partitioning back onto Ch17 / Ch12 / Ch05, this chapter is done.

Next is **Ch40 · Protocol choices**: REST / gRPC / WebSocket / SSE / QUIC. L7 already assumes you "can see the request"—the next chapter decides what that request looks like. SSE lays the foundation for LLM streams; the deep dive is still Ch29 / Ch32. Don't open Maglev as a class over there.

Self-check: left column, three L4 vs L7 lines; middle, why sticky is not the default; right, the Maglev vs ring sentence. Don't recite cloud SKUs and vnode hand-calc back.`,
    },
  ],
  reviewMdEn: `# Ch39 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | How do you open in 20 seconds? | L4 connection vs L7 request; TLS comes off at L7; gRPC needs L7. Default stateless + Redis, not sticky. L4 backend pick uses Maglev lookup; the ring is Ch05 partitioning. Health + drain. Anycast/DNS named. |
| 2 | Three hard parts? | ① How to open L4 vs L7 ② sticky vs stateless ③ Maglev vs consistent-hash LB (vs Ch05). |
| 3 | What does L4 see? | Connection: IP+Port / 5-tuple. Does not parse HTTP. The whole connection goes to one backend. |
| 4 | What does L7 see? | Request: path, header, cookie, RPC. Can terminate TLS. |
| 5 | Why does gRPC need L7? | HTTP/2 multiplexes many RPCs on one connection. L4 pins one box; replicas get none of the split. |
| 6 | Where does TLS terminate by default? | To see HTTP, at L7. Passthrough keeps the cert on the App; the LB goes blind. |
| 7 | Default session plan? | **Stateless App + external store (Redis)**. JWT is another variant. |
| 8 | Why isn't sticky the first answer? | Box dies, session is gone; scale-out boxes are cold; source IP + NAT piles everyone onto one box. |
| 9 | Source-IP affinity bottleneck? | Corporate egress / CDN share an IP; everyone lands on the same instance. |
| 10 | When do you sticky / hash-pin an instance? | Truly in-memory state: a match, long-lived presence (Ch12). And admit failover. |
| 11 | Maglev vs the Ch05 ring? | Ring: KV/cache partitioning, O(log n). Maglev: LB lookup O(1), even spread first. |
| 12 | Maglev table in one line? | Fixed prime-size table (commonly 65537); 5-tuple → index → backend. |
| 13 | Why don't many Maglevs sync a connection table? | Same backend set → same table; whichever box ECMP hits picks the same backend. |
| 14 | Maglev paper (interview)? | Eisenbud et al., **NSDI 2016**, *Maglev: A Fast and Reliable Software Network Load Balancer*. |
| 15 | Karger 1997 one-liner? | STOC: *Consistent Hashing and Random Trees…* for Web cache hot spots; less remapping. How to draw the ring is Ch05. |
| 16 | Health check + draining? | Probe fails → pull from the pool. Take-down: stop new connections, wait for in-flight, then kill the process. |
| 17 | Anycast, which sentence? | Same VIP announced from many sites; packets enter the nearest ingress. Don't unpack a DNS chapter. |
| 18 | Is round-robin enough? | Homogeneous short requests, yes. least-conn is a dynamic algorithm. Shipping Maglev without being able to say 5-tuple is over-engineering. |
| 19 | Gateway vs LB? | LB distributes; gateway is L7 extras (Ch17). Often the same layer. |
| 20 | What's next? | **Ch40 protocol choices**. East-west Mesh → Ch44. |`,
});
