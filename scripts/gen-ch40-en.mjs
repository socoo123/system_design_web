import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch40",
  titleEn: "Protocol choices",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 90–120 min ｜ **Prereq**: Ch12 WS; Ch29/32 SSE streams
> **Goal**: how you pick REST / gRPC / WS / SSE / QUIC. SSE only lays the foundation; the deep dive is back in Ch29/32.

This is **M6's fifth foundation chip**, not another 4-step design problem. On the spine, the gateway exposes HTTP to the outside, chat pins a long-lived connection, and the LLM streams tokens out—here we unpack **which protocol you pick on the public surface, between services, for push, and at the transport**. Design problems just cite it; they do not turn the whiteboard into a protocol class. Ch12 already made chat a product; Ch29 / Ch32 already covered streaming and gateway passthrough. Here we only lay the foundation: **what SSE is, and why LLMs usually use it**. We do not re-teach TTFT, GPUs, or token billing.

**One line:** public default **REST + JSON**; internal default **gRPC** (protobuf + HTTP/2); bidirectional push uses **WebSocket**; server-to-client only (including LLM token streams) uses **SSE**; HTTP/3 / QUIC is one interview sentence: **0-RTT + no TCP head-of-line blocking**.

Three hard parts (the pieces worth digging):

1. **When to switch REST vs gRPC** — public surface vs service-to-service; browsers still usually REST/JSON
2. **WS vs SSE** — bidirectional vs server→client; LLM streams default SSE (deep dive Ch29/32)
3. **The HTTP/3 / QUIC interview one-liner** — 0-RTT; streams are independent, unlike TCP where one loss stalls the whole connection

This chapter **does not cover**: the OSI seven-layer textbook, cloud API Gateway SKUs, redesigning Ch12 chat as a product, re-teaching Ch32 TPM/RPM, making an HTTP/2 vs 1.1 fight the spine, walking QUIC RFCs section by section, a GraphQL / tRPC / MQTT / WebRTC catalog. East-west mTLS / Mesh goes to **Ch44**. L4 vs L7 already lives in **Ch39**.`,
    },
    {
      id: "sec-pitch",
      headingEn: "One-line definition · 20-second interview open",
      bodyEn: `First put the scoring signal on the table: you pick by scene, you have a whiteboard default, and you will not open by reciting seven layers.

> "Ask the scene, then pick the protocol. Public APIs default **REST + JSON**: stateless, uniform interface, intermediaries can cache. Service-to-service defaults **gRPC**: protobuf + HTTP/2, you have a schema, you can stream. In front of a browser it's still usually REST; gRPC-Web needs a proxy—don't make it the public first answer. Bidirectional (chat, collab) uses **WebSocket**; server-to-client only (notifications, **LLM token streams**) uses **SSE**—the streaming product deep-dive is Ch29/32. HTTP/3 / QUIC in one line: handshake can be **0-RTT**, streams are independent, no TCP-style head-of-line blocking. Whiteboard default: public REST, internal gRPC, notify/chat WS, LLM stream SSE."

The whole chapter walks this one chain. Say the 20 seconds, then stop. Let the interviewer decide whether to dig into REST/gRPC, WS/SSE, or QUIC.

${D2}

This figure cites: Ch12 chat WS · Ch17 gateway REST · Ch29/32 LLM SSE (foundation here, deep dive there)

| Interviewer ask | Where you land |
|---|---|
| "Same protocol public and internal?" | Public REST; internal often switches to gRPC |
| "Realtime push: WS or SSE?" | Bidirectional WS; one-way (including LLM streams) SSE |
| "Do I draw HTTP/3 into the architecture?" | One QUIC sentence; weak-net, then name connection migration |

**red flag:** opening with OSI; forcing gRPC on a public API and claiming the browser speaks it natively; defaulting chat to SSE + a separate POST; opening LLM streams with WebSocket; turning HTTP/2 vs 1.1 into the whole chapter.`,
    },
    {
      id: "sec-rest-grpc",
      headingEn: "Mechanism · REST vs gRPC (when to switch)",
      bodyEn: `First hard part. **In a 2026 interview, reciting HTTP verbs is worse than saying "which boundary I switch the protocol."** REST is not "I used GET/POST." gRPC is not "Google uses it so I get points."

REST (Representational State Transfer) is an architectural **constraint** from **Fielding 2000**, usually paired with HTTP + JSON. Two interview sentences are enough: **stateless** (every request carries everything needed to understand it; the server does not pin the session to one TCP connection) and **uniform interface** (you operate resources with the same methods: identify the resource, change it via a representation, messages are self-describing). That is why a CDN, a gateway, and a cache can sit in the middle—the client only sees the entry. Know the name HATEOAS; CRUD JSON on the board **is still REST**.

${D2}

| | **REST + JSON** | **gRPC** |
|---|---|---|
| Contract | URL + HTTP verbs + optional OpenAPI | **\`.proto\`**, generate stubs |
| Encoding | Text JSON, human-readable | **protobuf** binary |
| Transport | HTTP/1.1 or HTTP/2 both fine | Native on **HTTP/2** (multiplexed RPCs) |
| Caching | GET can hit a CDN / shared cache | Not an HTTP cache key by default |
| Browser | **First-class** (fetch / curl) | No full HTTP/2 frame API in the browser; you need **gRPC-Web + a proxy** |
| Streaming | SSE / chunked; not a first-class RPC | unary / server-stream / client-stream / bidi |
| When you open it | **Public API, third parties, cacheable reads** | **Service-to-service, strong types, internal fan-out** |

A public request is three leaves. Don't fan out the whole microservice family.

${D2}

This figure cites: Ch17 API gateway (REST outside, can translate to gRPC inside) · Ch39 L7 (gRPC must split by RPC; don't L4-pin one connection)

**When to switch (volunteer the trade-off; don't wait for the follow-up):**

1. **Stay on REST:** browsers / mobile apps / partners; you want curl to debug; GET should be cacheable as an HTTP response by a CDN or Cache-Aside; errors and docs follow HTTP semantics.
2. **Switch to gRPC:** high call density inside the cluster, you need schema evolution (field numbers, compatibility), you want to multiplex many RPCs on one connection, you need server-stream or bidi, and generating stubs across languages is cheaper than hand-rolled JSON. Latency-sensitive internal fan-out often switches here too.
3. **A bad reason to switch:** "we're already gRPC inside, so public must be gRPC too." In 2026 the public surface **is still usually REST/JSON**. gRPC-Web needs an Envoy-class proxy to translate frames—fine as extra credit, not the whiteboard default public protocol.

The gateway is the natural protocol boundary (Ch17): one REST contract outside, stubs speak gRPC inside. Don't hand-write two DTO sets in every BFF and call it "unified." East-west encryption, retries, timeouts are **Ch44**; this chapter only picks the protocol.

gRPC rides HTTP/2: many streams on one TCP connection. **L4 only sees that one connection**—Ch39 already said it; here we only recycle the sentence: if the problem has gRPC, the LB needs L7 awareness. Don't fill a Maglev table again.

protobuf, name it: field numbers are the contract; adding optional fields is compatible with old clients; **don't renumber, don't reuse a deleted number**. This is not a protobuf tutorial.

How to open it:

> "Public REST: stateless + uniform interface, so caches and gateways are easy. Internal gRPC: protobuf + HTTP/2. Browsers still get JSON. The signal to switch is internal density and schema, not 'REST is outdated.'"

**red flag:** treating REST as "four verbs"; forcing gRPC on a public API and claiming fetch can speak it natively; calling GraphQL a REST upgrade without being able to say how caching works; drawing every CRUD as a bidi stream to "look like a big company."`,
    },
    {
      id: "sec-ws-sse",
      headingEn: "Mechanism · WS vs SSE",
      bodyEn: `Second hard part. **Direction matters more than the brand.** WebSocket is full-duplex; SSE is a server→client HTTP event stream. Picking wrong is not a performance tweak—it is drawing the connection model backwards.

${D2}

| | **WebSocket** | **SSE** |
|---|---|---|
| Direction | **Full-duplex**: after connect, either side can send anytime | **One-way**: only the server pushes out |
| Wire | Frames after HTTP **101** upgrade (RFC 6455) | Still HTTP: \`text/event-stream\` |
| Reconnect | You own heartbeat / exponential backoff | Browser **EventSource** reconnects + \`Last-Event-ID\` |
| Proxies / firewalls | Some old middleboxes dislike Upgrade | Looks like a normal GET; easier to pass |
| Whiteboard default | Chat, collab, realtime that needs uplink | Notifications, quotes, **LLM token streams** |

Why chat defaults to WS: you send and you receive; presence and typing sit on the same connection. Ch12 already covered the stateful gateway, message three-states, and group-chat sharding—**this chapter does not redesign IM**. Here we only recycle: SSE + a separate POST is two channels, not the chat default. Poll / long-poll get one sentence each as history.

SSE foundation (stop here; the deep dive is Ch29 / Ch32):

- Client \`GET\`, the response stays open, events push as \`data:\` lines.
- **Auto-reconnect** is the product win vs WS; event ids are how you resume.
- LLM chat only needs the server to emit tokens; the client **does not** need to push binary frames on the same connection. Public OpenAI-compatible streaming is SSE (or fetch + a readable stream—still server-push semantics).
- The gateway **must not buffer until complete**—that kills TTFT. Passthrough; cancel must abort upstream. Billing, TPM, semantic cache are **Ch32**; GPU / KV are **Ch29**; we do not re-teach them here.

${D2}

This figure cites: Ch29 inference streaming (TTFT) · Ch32 gateway passthrough (don't buffer) · Ch12 chat is when you use WS

The LLM path is these three leaves: Client subscribes, gateway/API is SSE, engine emits tokens. Don't draw a GPU cluster.

**Signals not to use WS:** the client almost never talks on this connection; you just like the word "realtime." One-way notifications (Ch10 already named the push channel) can be SSE too; mobile battery-saving push is MQTT—one sentence, send it back, don't open an IoT class.

**Signals not to use SSE:** the client must uplink often (ops, acks, collab cursors); you need binary frames. SSE is UTF-8 text events. Bidirectional is WS (or internal gRPC bidi—that's service-to-service, not browser chat).

How to open it:

> "Bidirectional is WebSocket; server-to-client push is SSE. LLM token streams I default SSE; engine and gateway deep-dive is Ch29/32. Chat I default WS; I will not redo Ch12 here."

**red flag:** drawing WS for every realtime; defaulting chat to SSE; unpacking PagedAttention or token unit price in this chapter; turning EventSource header limits into a whole browser class.`,
    },
    {
      id: "sec-quic",
      headingEn: "Mechanism · HTTP/3 / QUIC (the interview one-liner)",
      bodyEn: `Third hard part. **The whiteboard does not need you to implement a transport.** The interview wants one sentence that can take weak-net, head-of-line blocking, and 0-RTT—not an RFC recitation.

**This sentence:**

> "HTTP/3 runs HTTP semantics on **QUIC**. QUIC does multiplexed streams and crypto on **UDP**. Two wins are enough: **0-RTT** (a seen connection can send data immediately) and **no TCP-style head-of-line blocking** (one stream loses a packet, the others still move). Switching Wi-Fi / cellular can **migrate** on a connection ID—you don't re-handshake a whole TCP."

${D2}

This figure cites: Ch39's entry is still Client → LB → App; HTTP/3 vs HTTP/2 does not change the boxes you draw. Video chunks are Ch14; this is not a CDN class.

Why this is not an "HTTP/2 vs 1.1 textbook": HTTP/2 already multiplexes on **one TCP**. TCP only guarantees an ordered byte stream—**one packet lost, every later stream waits**. That's TCP head-of-line blocking. HTTP/3 drops multiplex down into QUIC; streams are independent. Interview contrast stops here. Don't recite frame types.

| Point | Open with | Don't unpack |
|---|---|---|
| **0-RTT** | Reconnect can carry early data; weak-net / short sessions feel faster | TLS 1.3 handshake state machine, session-ticket internals |
| **replay** | 0-RTT is **not** something you casually turn on for non-idempotent POST | A cryptography paper |
| **HOL** | TCP loss stalls the whole connection; QUIC streams are independent | Congestion-control formulas |
| **Migration** | connection ID ≠ 4-tuple; IP changes, the connection stays | Multipath scheduling algorithms |
| **UDP blocked** | Fall back to HTTP/2 over TCP | A middlebox-taxonomy encyclopedia |

The architecture default is still Client → edge → service. CDNs / browsers in 2026 already speak a lot of HTTP/3; you **do not** have to relabel every box "QUIC termination." When they ask mobile weak-net, live-stream stalls, or expensive short-connection handshakes, then point at this layer. Don't replace the REST/gRPC pick on the first diagram.

Most gRPC implementations today still sit on HTTP/2/TCP; "gRPC automatically means HTTP/3" is wrong. Public Web traffic and internal RPC are not the same upgrade ticket.

How to open it:

> "HTTP/3 is HTTP over QUIC. I remember 0-RTT and no TCP HOL. Non-idempotent, be careful with 0-RTT. UDP blocked, fall back. I will not draw a QUIC state machine on an order problem."

**red flag:** explaining QUIC with the seven OSI layers; claiming HTTP/3 makes gRPC obsolete; calling 0-RTT absolutely safe; spending the chapter on HTTP/1.1 HOL and never naming TCP vs QUIC.`,
    },
    {
      id: "sec-choose",
      headingEn: "Choice table",
      bodyEn: `Fill four cells on the whiteboard first, then talk transport. Drawing all five protocols is over-engineering.

| Scenario | Default | Don't |
|---|---|---|
| Public HTTP API, third-party integration | **REST + JSON** | Browser talking native gRPC |
| Service-to-service, strong types, internal fan-out | **gRPC** | Giant schemaless JSON internally too |
| REST outside, RPC inside | Gateway does protocol translation (Ch17) | Every service publishes two unrelated contracts |
| Chat / collab / realtime that needs uplink | **WebSocket** | SSE as the IM default |
| Notifications, quotes, server-push only | **SSE** | WS because it is "cooler" |
| LLM token stream | **SSE** (foundation); engine/gateway **Ch29/32** | Opening with WS; buffering the whole chunk at the gateway |
| Cacheable GET | REST, so it can hit a CDN | Making the read an RPC that must handshake |
| Weak-net, network switch, expensive short-connection handshake | Name **HTTP/3 / QUIC** in one line | Drawing the transport as the main architecture |
| Realtime A/V | A different problem (WebRTC) | Stuffing it in as a fifth default in this chapter |

Spoken default, one more time:

> "Public REST; internal gRPC; notify/chat WS; LLM stream SSE. QUIC is a transport extra-credit sentence, not a fifth application protocol you implement."

GraphQL / tRPC: talk about them when the client wants to cut fields on demand, or the full stack shares one TS type—**not** the 2026 public API default. MQTT: IoT / mobile long-lived connections to save battery; the Ch12 one-liner is enough. SOAP: enterprise leftover. None of them is the spine.`,
    },
    {
      id: "sec-papers",
      headingEn: "Papers and classic systems",
      bodyEn: `M6 needs names you can drop. Two required, two optional below. **The interview one-liner** is in the table; don't memorize page numbers, don't treat RFCs as whiteboard homework.

${D2}

The timeline is only a memory aid: first the Web's REST constraints, then Google running QUIC at internet scale on UDP, then IETF writing QUIC / HTTP/3 into standards. That does not mean you implement all three.

${D2}

Fielding's constraints on the interview only walk this short chain: **client-server → stateless → uniform interface**. Cacheable, layered, optional code-on-demand—know the names; don't recite chapter 6.

| | Paper | Required / optional | Interview one-liner |
|---|---|---|---|
| 1 | **Fielding**, UC Irvine PhD 2000, *Architectural Styles and the Design of Network-based Software Architectures* (chapter 5 REST) | Required | REST is a constraint, not a verb table. Interview grab **stateless** and **uniform interface** (resource identity, representation, self-describing messages). Intermediaries can cache and evolve because of the constraints, not because "you used JSON" |
| 2 | **Iyengar & Thomson** (eds.), IETF **RFC 9000**, 2021-05, *QUIC: A UDP-Based Multiplexed and Secure Transport* | Required | QUIC = multiplexed secure transport on UDP; streams are independent; 0-RTT is possible; connections use an ID instead of pinning a 4-tuple. Overview stops here; don't recite frames |
| 3 | **Bishop** (ed.), IETF **RFC 9114**, 2022-06, *HTTP/3* | Optional | HTTP semantics mapped onto QUIC. Interview: "HTTP/3 = HTTP over QUIC." Remember it next to RFC 9000 |
| 4 | **Langley et al.**, SIGCOMM 2017, *The QUIC Transport Protocol: Design and Internet-Scale Deployment* | Optional | Before IETF standardized it, Google had already deployed at Chrome / YouTube scale. Proof QUIC is not a 2022 acronym. Numbers (traffic share, search latency then) are a story, not your SLO |

The WebSocket spec is **RFC 6455** (2011, Fette & Melnikov): 101 Upgrade. SSE is HTML / WHATWG \`EventSource\`; there is no same-weight systems paper—talk mechanism, don't invent an "SSE NSDI." gRPC is a 2015 open-source RPC framework (protobuf + HTTP/2); same story: engineering facts, don't mint a conference paper.

**Fielding, two more punches (no third punch into a HATEOAS dissertation):**

1. **Stateless:** any replica can handle any request—same spirit as Ch39's stateless App; the protocol layer wrote it into the constraint first.
2. **Uniform interface:** you give up a bit of "specialized-for-this-RPC efficiency" in exchange for evolvability and intermediaries. gRPC is the other end: specialized, fast, tight contract.`,
    },
    {
      id: "sec-used",
      headingEn: "Which design problems use this",
      bodyEn: `Do the spine problems first; jump into this chapter when you get stuck. Back-links are not "finish M6 then start writing."

| Chapter | The sentence you use |
|---|---|
| **Ch10** notifications | In-browser push can be SSE; actually reaching the device is still vendor Push. Don't treat APNS as WS |
| **Ch12** chat | **WebSocket default**; SSE is one-way, not IM. QUIC weak-net one line, don't unpack |
| **Ch17** gateway | REST outside; gRPC inside if you want. Auth and rate limit at L7; protocol translation lives here too |
| **Ch14** video | Playback is HLS/DASH; transport may be HTTP/3. Don't turn this chapter into transcoding |
| **Ch18 / Ch24** order / pay | Public REST; the idempotency key is in the contract. Don't use 0-RTT on a charge POST to look fast |
| **Ch27** delivery | Location reports bidirectional lean WS; a driver→user status stream only can be SSE |
| **Ch28** config | Listen/push: long-poll / SSE / WS all work; simple one-way → SSE |
| **Ch29** LLM inference | **Streaming** to the user; protocol foundation is SSE. Engine-side TTFT / KV **live there** |
| **Ch32** LLM gateway | SSE **passthrough**, no buffering; why not WS comes back here. Billing is not this chapter |
| **Ch33** Agent tools | Bidirectional session can be WS; model output is still often SSE |
| **Ch39** LB | gRPC / HTTP2 need L7. This chapter picks the protocol; that one picks connection vs request |
| **Ch44** microservices | East-west default gRPC + mTLS mental model; public surface still REST |

Feed / short URL / comments: the read path is REST GET; cache it if you can (Ch38). Don't make it a WS that must upgrade.`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs notes / the original book",
      bodyEn: `<details>
<summary>How the book / notes taught it then · OSI textbooks and protocol catalogs go here</summary>

The notes map to the AWS book's communications chapter: seven OSI layers, TCP handshake, SMTP/XMPP/MQTT, the whole polling family, GraphQL, WebRTC, then a cloud-networking patch. **That is not this chapter's body.** In 2026 you walk in with the REST/gRPC boundary, WS vs SSE, and one QUIC sentence.

| Book / notes | How you answer now |
|---|---|
| Seven OSI layers as the opening recitation | **Forbidden as the spine.** L4/L7 decisions are Ch39; this chapter picks the application protocol |
| HTTP/2 vs 1.1 in great detail | Name that gRPC rides HTTP/2; HOL is left to the QUIC one-liner |
| SSE as a backup | **LLM streams default SSE**; one-way push prefers SSE |
| Realtime = WebSocket | Ask first whether you need uplink |
| gRPC vs REST with no matrix | Public REST, internal gRPC; browsers still JSON |
| GraphQL / tRPC as the 2026 default | On-demand fields / full-stack TS, then talk; not the public API default |
| QUIC only written as "uses UDP" | Three words: **0-RTT + no TCP HOL + connection migration** |
| API Gateway cloud SKUs | Mechanism is the gateway (Ch17); don't recite model numbers |
| mTLS / Mesh written into this chapter | **Ch44** |
| WebRTC / SFU | A/V is a different problem |
| XMPP / SMTP tour | Legacy or mail; a new IM does not open with XMPP |

The body's first answer is this 2026 set. The fold only stops you from putting seven layers and mail protocols on the board.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **Same protocol public and internal?** → Often no. Public REST, internal gRPC.
2. **What is REST?** → A constraint: stateless + uniform interface. Not four HTTP verbs.
3. **Fielding, interview one-liner?** → 2000 PhD, chapter 5; intermediaries can cache because of the constraints.
4. **When do you switch to gRPC?** → Service-to-service, schema, internal streams, fan-out. Not "REST is outdated."
5. **Why is the browser still REST?** → No full gRPC-over-HTTP/2 frame API; gRPC-Web needs a proxy.
6. **gRPC and L4?** → HTTP/2 multiplexes. L4 pins one connection. Back to Ch39.
7. **WS vs SSE in one line?** → Bidirectional vs server→client.
8. **Why doesn't chat use SSE?** → You send and you receive. SSE + POST is two channels.
9. **Why do LLMs usually use SSE?** → Tokens only go out; it is HTTP; auto-reconnect. Deep dive Ch29/32.
10. **Can the gateway buffer SSE a bit?** → No. That kills TTFT. Ch32.
11. **HTTP/3, which sentence?** → HTTP over QUIC; 0-RTT; no TCP HOL.
12. **0-RTT casually?** → Non-idempotent has replay. Don't use it to look fast on a charge POST.
13. **Why is QUIC on UDP?** → User-space evolution, multiplex, handshake bundled with crypto; blocked, fall back to TCP.
14. **Rewrite the whole architecture to HTTP/3?** → No. Weak-net / handshake, then name it.
15. **What is Langley 2017?** → SIGCOMM: Google-scale QUIC deployment. Optional.
16. **RFC 9000 / 9114?** → 2021 QUIC transport; 2022 HTTP/3 mapping.
17. **Why is replication/sharding next?** → Protocol is picked; how data sits and how you split transactions is **Ch41**.`,
    },
    {
      id: "sec-next",
      headingEn: "What's next",
      bodyEn: `Close the page and walk it in 20 seconds: public REST, internal gRPC; bidirectional WS, one-way SSE; LLM stream SSE only lays the foundation, deep dive back to Ch29/32; QUIC in one line, 0-RTT and no TCP HOL. If you can drop chat, gateway, and inference streaming back onto Ch12 / Ch17 / Ch29, this chapter is done.

Next is **Ch41 · Replication, sharding, transactions**: primary/replica, shard keys, Saga / Outbox / CDC; why 2PC is often a no. Protocols do not unpack again. Raft / Sagas get named over there.

Self-check: left column, when to switch REST vs gRPC; middle, WS vs SSE; right, the HTTP/3 one-liner. Don't recite OSI and cloud-gateway SKUs back.`,
    },
  ],
  reviewMdEn: `# Ch40 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | How do you open in 20 seconds? | Public REST+JSON; internal gRPC. Bidirectional WS; one-way / LLM stream SSE. QUIC: 0-RTT + no TCP HOL. |
| 2 | Three hard parts? | ① When to switch REST vs gRPC ② WS vs SSE ③ HTTP/3/QUIC interview one-liner. |
| 3 | REST, which two constraints? | **stateless** and **uniform interface**. Not a verb table. |
| 4 | Which Fielding paper? | 2000 PhD *Architectural Styles and the Design of Network-based Software Architectures*, chapter 5 REST. |
| 5 | When do you switch to gRPC? | Service-to-service, protobuf schema, internal streams, fan-out. Public surface often still REST. |
| 6 | Why isn't gRPC the browser default? | No full HTTP/2 frame API; gRPC-Web needs a proxy. |
| 7 | What does gRPC ride? | **protobuf + HTTP/2**. Many RPCs on one connection → LB needs L7 (Ch39). |
| 8 | WS vs SSE? | WS full-duplex (101 upgrade); SSE is a server→client HTTP event stream. |
| 9 | Chat default? | **WebSocket** (Ch12). SSE is not the IM default. |
| 10 | LLM token stream default? | **SSE**. Engine/TTFT → Ch29; gateway passthrough, don't buffer → Ch32. |
| 11 | SSE's product win vs WS? | Still HTTP; EventSource auto-reconnect + Last-Event-ID. |
| 12 | HTTP/3, interview one-liner? | HTTP semantics on QUIC (UDP); 0-RTT; streams independent, no TCP HOL. |
| 13 | 0-RTT pit? | early data has replay. Non-idempotent (charge) don't use it to look fast. |
| 14 | QUIC connection migration? | connection ID, not pinned to a 4-tuple. Network switch doesn't redo a TCP. |
| 15 | RFC 9000? | Iyengar & Thomson, **2021-05**, *QUIC: A UDP-Based Multiplexed and Secure Transport*. |
| 16 | RFC 9114? | Bishop, **2022-06**, *HTTP/3*. HTTP over QUIC. |
| 17 | Langley 2017? | SIGCOMM: *The QUIC Transport Protocol: Design and Internet-Scale Deployment*. Optional. |
| 18 | Whiteboard four-cell default? | Public REST; internal gRPC; notify/chat WS; LLM stream SSE. |
| 19 | Public + internal two contracts? | Gateway translates (Ch17). Don't give every service two unrelated contracts. |
| 20 | What's next? | **Ch41 replication, sharding, transactions**. Mesh/mTLS → Ch44. |`,
});
