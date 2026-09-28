import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch12",
  titleEn: "Design a chat system",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 50–60 min ｜ **Prereq**: Ch01 4-step method; protocols in Ch40, stateless / LB in Ch39
> **Goal**: default **WebSocket**; walk message state, group chat shard, presence. Do not make E2EE / voice the main line.

Chat is the fourth full case. Feed is one-to-many async timeline; this prompt is the reverse: **low-latency bidirectional**, and the connection is stateful. They are not scoring whether you can draw an MQTT protocol class + Signal + a million voice channels. They want: **protocol asked clearly, stateful connections spoken through, three hard parts (the three pieces worth digging) spoken through.**

The system looks like send a message, the other side gets it in a second. The hard parts are how you hang long-lived connections, how messages don't drop or reorder, and how a large group doesn't punch a hole in one machine.`,
    },
    {
      id: "sec-answer",
      headingEn: "How to answer in the interview",
      bodyEn: `**Opening 30 seconds (say it out loud):**

> "Chat has three hard parts: protocol and stateful connections, messages that don't drop or reorder plus status, group chat shard plus presence. I'll confirm 1:1 vs group, read receipts, and multi-device first. Scale on a 10-million DAU board: concurrent connections are millions of long-lived sockets, message QPS is thousands to tens of thousands. Architecture defaults to **WebSocket**; chat svc is **stateful**, you need a conn registry / service discovery (Ch39). Messages go into KV by conversation + seq; **at-least-once + client seq idempotency**. Small groups push on write; large groups store one copy by \`group_id\` and pull on read. Presence is heartbeat + pubsub."

Then walk the 4 steps. Do not lead with the final diagram.

${D2}

| Time-box | What you are doing |
|---|---|
| 3–10 min | Clarify: 1:1 / group, multi-device, read receipts, group size, E2EE out of scope |
| Next 2 min | back-of-envelope: 10M DAU; millions of WS; message QPS thousands to tens of thousands |
| 10–15 min | High-level: client → WS / chat → msg store + presence |
| 10–25 min | deep dive: stateful connections, message state, group shard + heartbeat |
| 3–5 min | wrap-up: 3 bottlenecks (long-lived failover, large-group fan-out, presence flap) |

**red flag:** drawing Discord voice before you asked 1:1 vs group; lecturing the C10M paper before you estimated connections; defaulting to long-poll; claiming exactly-once; putting E2EE / QUIC as the main architecture. That is over-engineering, or dragging Ch40 / a voice prompt onto this board.`,
    },
    {
      id: "sec-clarify",
      headingEn: "Clarifying questions",
      bodyEn: `Drawing before you clarify = Jimmy. On chat, stop at 5–7 questions; assume the rest and write the board.

| You ask | Typical answer / your assumption | What it changes |
|---|---|---|
| 1:1, group, or both? | **Both**; groups start small, large groups get their own dive | Small-group push vs large-group pull |
| Multi-device sync? | **Yes** (phone + desktop) | One cursor per device, not one connection |
| Read receipts? | **Yes**; large groups skip all-member read | sent / delivered / read |
| Group size cap? | Teaching: small groups hundreds; 10k+ switch to pull | Write amplification vs read aggregation |
| End-to-end encryption? | **Not this loop** | Server sees plaintext; one sentence if they chase |
| Images/video? Voice? | Media is URL only; **voice is a different prompt** | Don't design CDN / WebRTC |

When they say "you decide," write the assumptions:

> "I'll assume: 1:1 and group both in scope; multi-device; read receipts. Small groups (hundreds) fan-out on write; larger ones store one copy by \`group_id\` and pull. E2EE and voice I won't expand this loop. I'll draw on that — cut me off if it's wrong."

If they ask about voice / a million-seat stage: **acknowledge the difference, then close it.** "That's a different problem; I won't design WebRTC here. This loop I'll walk text IM + WebSocket." Asking past 10 minutes is also a red flag. The golden line is still: **ask the key questions → state your own assumptions → write the board → move.**`,
    },
    {
      id: "sec-estimate",
      headingEn: "Back-of-the-envelope",
      bodyEn: `Formulas live in Ch03. Here you only need order of magnitude: prove you know **IM's bottleneck is connection count first, then message QPS.** Teaching assumptions below from public-scale numbers — not some company's internals.

Assume ~**10 million DAU**; peak ~15% holding a WS at once; active users send ~20 messages a day.

| Item | How you estimate | Order of magnitude |
|---|---|---|
| Concurrent connections | 1e7 × 15% | **~1e6–2e6** WS |
| Send-message QPS | 1e7 × 0.5 active × 20 / 86400 | **~1e3**; peak ×5 **~5e3–1e4** |
| Reads | 1:1 ≈ 1:1; groups amplify by member count | Board is still tens of thousands; large groups cut over to pull |
| Text storage | ~200 B × 1e8 msgs/day | **~20 GB/day**; source of truth is conversation KV |
| Connection memory | 2e6 × a few KB to tens of KB | **tens of GB cluster-wide**; not one box stuffed full |

In 2026 don't recite the 2010 line "10k connections = 10 GB." Event-driven, each connection is KB-scale; **how many one box can hold is a runtime question. What the interview wants is the cluster: conn registry, how you migrate when a machine dies, don't fan-out to every member on one box.**

**Interview line:**

> "On a 10-million DAU board: peak is millions of long-lived connections, messages average thousands QPS, peak tens of thousands. This prompt's bottleneck is stateful connections first — don't treat message QPS like a URL shortener's read-heavy write-light. Storage is conversation + seq, tens of GB of text a day."

Common mistake: reporting only message QPS and pretending that's the whole load; or treating some product's real daily message volume as your internal number. Teaching uses order of magnitude; the threshold waits for the deep dive.`,
    },
    {
      id: "sec-arch",
      headingEn: "High-level architecture",
      bodyEn: `Left to right: Client → WS gateway / chat svc (**stateful**) → message store + presence. Login and profile still go stateless HTTP. After they buy in, split protocol and the message path.

${D2}

**This diagram cites**: Ch39 Load balancing & statelessness · Ch40 Protocol choices · Ch37 Storage choices

**Why chat is stateful, API is stateless (must answer):** WebSocket is a persistent connection; the socket lives on one chat box. That machine's memory has "user A's connection." Switch boxes = disconnect and reconnect. So the chat layer needs a **conn registry** (user → server / connection). Scale-out and failover both cost more than stateless Web — details go back to Ch39; don't turn this chapter into an LB class. Login / profile stay HTTP + LB; don't stuff every endpoint into WS.

**schema (enough, then stop):** \`message\` (conv_id, seq, from, body, client_seq); small groups optionally \`inbox\` (user_id, seq, msg_ref); \`presence\` (user_id, online, last_seen, TTL); conn registry (user_id → chat node). Messages go into KV / wide-column by **conversation + monotonic seq** (Ch37). Don't use a relational DB as the primary store for massive chat.

Offline goes through push (point at Ch10); media is object-storage URLs only. Protocol comparison and stateful routing are the next deep dive; stop here and ask: "Does this direction look OK? Next I'll dig into why WebSocket is stateful, the three message states, and group chat shard."

**Interview line:**

> "For bidirectional chat I default WebSocket. Chat is stateful, with a conn registry next to it; messages land in KV by conv + seq; presence is its own leg. HTTP is login and profile only."`,
    },
    {
      id: "sec-protocol",
      headingEn: "Deep dive · Protocol and stateful connections",
      bodyEn: `First hard part. **How does the server push a message to the client?** That's a protocol question; which machine to push to is a statefulness question. They are tied together.

${D2}

| | Poll | Long-poll | WebSocket (**default**) |
|---|---|---|---|
| Push | Client asks on a timer | Server holds until there is a message | Server pushes anytime |
| Bidirectional | No | No (sends go another HTTP) | **Full duplex** |
| Cost | Lots of empty queries | Timeout means reopen the request | One handshake, frames are tiny |
| LB | Stateless is easy | Send and hold may land on different boxes | Connection is pinned to one box |
| Interview | Evolution, one sentence | Firewall fallback | **2026 first answer** |

**SSE** is server → client one-way stream — fine for notifications and LLM tokens (Ch40). Chat has to send and receive; SSE + POST is two channels, not the default. **MQTT** in one sentence: mobile power-saving push can go that way. **QUIC** in one sentence: connection migration is stabler when you flip Wi-Fi / cellular on a weak network. Two sentences, stop — don't open a protocol class.

Why long-poll is not enough: HTTP is stateless, LB round-robins; A's send hits server 1, B's hold may be on server 2 — server 1 **doesn't know who to forward to**. WebSocket pins the connection to one box, then the registry forwards across machines.

| | Stateless HTTP API | Stateful chat |
|---|---|---|
| Scale-out | Cut anywhere | Cut the connection and you drop; migrate or reconnect |
| LB | round-robin | sticky, or discover then connect (Ch39) |
| Memory | Gone when the request ends | socket + routing table |

Clients must not blindly round-robin the chat layer. Flow: auth → discover a suitable chat box (region / capacity) → upgrade WS → register the user → this box. Machine dies: client reconnects, backfills messages after seq from KV — **you don't lose messages because of storage, not because that socket never dies.**

**Interview line:**

> "Poll / long-poll as evolution. Default WebSocket. Chat is stateful, you need a registry, you cannot scale it like stateless Web. SSE is one-way; MQTT / QUIC each get one sentence of when, I won't expand."

trade-off: stateful makes push simple, failover costs more. Broadcasting every message to every chat node so "any box can handle anyone" is over-engineering.`,
    },
    {
      id: "sec-msg",
      headingEn: "Deep dive · Message reliability, ordering, and state",
      bodyEn: `Second hard part. What the user wants: **don't drop, ordered inside a conversation, checkmarks right.** Board default is **at-least-once + client seq idempotency**. Don't pretend cross-device exactly-once.

${D2}

**This diagram cites**: Ch37 Storage choices

**Persist first, then push.** If B's connection is down at that moment, the message is already in KV; B comes online and pulls by seq. A failed push is not a drop. Offline then goes Push (Ch10) — that's a wake-up, not the source-of-truth channel.

| | at-most-once | at-least-once + idempotent (**default**) | exactly-once |
|---|---|---|---|
| Drop | Possible | Retry fills in | End-to-end extremely hard |
| Dup | No | Possible; dedup on \`client_seq\` | Not free across connections |
| Interview | IM cannot drop | ACK + retry; server dedups by sender + seq | over-engineering |

Client send carries \`client_seq\` (or client_msg_id); server assigns in-conversation \`seq\` and persists on first accept, duplicate submit returns the same \`seq\`. In-conversation order = **server commit order**, don't use \`created_at\` (same-second collisions). A↔B order does not have to compare with C↔D — you don't need global order.

Multi-device: each device has its own cursor (max seq seen). A lagging device comes online and pulls the gap. Sends are also numbered by the server, so devices don't collide on IDs.

${D2}

| State | Meaning | Who triggers |
|---|---|---|
| **Sent** | Server received and persisted | ACK to A |
| **Delivered** | Peer device received | B's ACK |
| **Read** | Peer opened the conversation | B's read receipt |

Receipts are also a message, same WS, different type. Receipts are **at-least-once**: state only moves forward (Read > Delivered > Sent); a duplicate packet cannot turn a blue check back to grey. Large groups don't broadcast "everyone has read" to every member — that's write amplification; each person keeps their own last_read.

**Interview line:**

> "Persist first, then push. at-least-once, client seq dedup. In-conversation seq is the order. Checks are sent / delivered / read; receipts are idempotent and don't go backwards. Large groups skip all-member read."`,
    },
    {
      id: "sec-group",
      headingEn: "Deep dive · Group chat shard and presence",
      bodyEn: `Third hard part. Group messages and presence are both fan-out; **small groups push on write, large groups pull on read.** Shard key is \`group_id\` — don't let a celebrity group's online push land on one box. Same class of trade-off as Ch11 hybrid.

${D2}

| | Small-group push (fan-out on write) | Large-group pull / inbox (on read) |
|---|---|---|
| Write | Copy into each member inbox, writes = N | One row by \`group_id\` |
| Read | Scan your own inbox | Open the group, then pull by seq |
| Online push | Push one copy to each online member | **Only push people currently looking**; everyone else pulls on next open |
| Failure mode | 10k-member group fills chat / KV | Cold members open a bit slower |
| Teaching line | Hundreds of people | Cross the line, stop all-member fan-out |

Storage and connections both shard by \`group_id\`: one group's messages land in one partition, query is one range scan. Celebrity group = hot key, but **don't fan-out to every online member on one machine** — the online list itself can exceed one box's connection budget. Large groups: one copy of the message; push only hits connections that have this group open right now; everyone else backfills with a cursor.

Board threshold: say **around a few hundred people** as the teaching line, then add "production tunes on write amplification and p99 — not a magic number." Don't turn this prompt into Discord voice channels.

${D2}

**This diagram cites**: Ch39 Load balancing & statelessness

Don't bind presence to the message source-of-truth path. Heartbeat refreshes a Redis TTL; only mark offline if it wasn't refreshed inside the window — **the lag is there to fight flap** (a subway blip shouldn't make the green dot strobe). Friend lists push state over pubsub; 10k-member groups **pull on join / refresh**, no all-member realtime broadcast.

| | Short heartbeat | Long heartbeat |
|---|---|---|
| Realtime | Green dot is accurate | Offline discovery is slow |
| Cost | Battery + presence load | Saves battery |
| Board | Web can be ~10s | Mobile stretches it, with a TTL window |

\`last_seen\` can persist; "online right now" can rebuild from reconnect even if you lose it — it does not have to live in the message KV.

**Interview line:**

> "Small groups fan-out into inbox on write; large groups store one copy by \`group_id\` and pull on read — don't push to every online member on one machine. Presence is heartbeat + TTL against flap; friends use pubsub; large groups pull on join."`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs the book",
      bodyEn: `<details>
<summary>How the book / notes used to teach it (not the first answer)</summary>

The book walked poll → long-poll → WebSocket thoroughly; the skeleton still holds. What aged is treating the evolution as the main answer, and connection estimates still stuck on "10k connections = 10 GB."

| Book or notes | How you answer now |
|---|---|
| Three protocols in a lot of detail | **WebSocket default**; poll / long-poll each one sentence of evolution; SSE is one-way, not the chat default |
| Didn't mention MQTT / QUIC | Each **one sentence**: mobile power-saving push / weak-network handoff. Don't open a protocol class |
| Chat discovery via ZooKeeper | Point at service discovery; etcd / Consul / in-house all fine, details Ch39 |
| 10k connections = 10 GB | 2026: each connection is KB-scale; speak **cluster failover + registry**, don't write a C10M paper |
| Group chat only small-group inbox | **Small-group push, large-group pull**; shard by \`group_id\` |
| Didn't cover sent / delivered / read | **Three states + receipt idempotency** go in the main text |
| E2EE / voice written deep | Not the main line this loop; E2EE is a one-sentence trap, voice is a different prompt |

The book's skeleton still works: clients don't connect to storage directly, chat is stateful, history in KV, persist then push. What aged is treating long-poll as the end state, and single-box memory arithmetic as architecture.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **"WebSocket or HTTP?"** → Send/receive default WS; login and profile still HTTP. Don't stuff everything into one socket.
2. **"Why not poll / long-poll?"** → Empty spinning or hold; long-poll send and hold may land on different boxes. WS is the 2026 default.
3. **"Can you use SSE?"** → One-way. Chat needs bidirectional, not the default (Ch40).
4. **"How do messages not drop or duplicate?"** → Persist first, then push; at-least-once; \`client_seq\` idempotency. Don't pretend exactly-once.
5. **"How do you guarantee order?"** → In-conversation server seq, not \`created_at\`. You don't need global order.
6. **"How do read receipts work?"** → sent / delivered / read; receipts are also messages; state doesn't go backwards. Large groups skip all-member read.
7. **"How does group chat fan-out?"** → Small groups push into inbox on write; large groups store one copy by \`group_id\`, pull on read.
8. **"A celebrity group punches a hole in one box?"** → Shard \`group_id\`; don't fan-out to every online member on one machine.
9. **"How does presence not flap?"** → Heartbeat + TTL window; offline only if it wasn't refreshed. Large groups pull on join, no all-member broadcast.
10. **"How do you do E2EE?"** → Server only sees ciphertext; search / moderation don't work. Don't expand Signal this loop; if you do it, it's privacy vs auditability trade-off.
11. **"If chat dies, do messages drop?"** → They shouldn't. Source of truth is KV; client reconnects on another box and pulls the seq gap.
12. **The final diagram is already huge and they keep stacking?** → MQTT class, C10M, voice channels are not this chapter. Speaking three hard parts scores higher than 20 boxes.`,
    },
    {
      id: "sec-next",
      headingEn: "Wrap-up and what's next",
      bodyEn: `Wrap-up never says perfect. Three bottlenecks out loud:

| bottleneck | How you take it |
|---|---|
| Millions of long-lived connections / stateful failover | WS + conn registry; machine dies → reconnect, backfill from KV |
| Large-group write amplification | Small-group push; large-group one copy by \`group_id\` + pull; don't all-member fan-out on one box |
| Presence flap / large-group broadcast | Heartbeat TTL against flap; friends pubsub; large groups lazy-pull |

Self-check: close this page. 30-second opening + high-level on the board; walk WebSocket statefulness, three-state receipts, and small/large-group fan-out to the air. Wherever you stumble, come back to that section.

Next problem is **Ch13 · Design a search system**. Chat is low-latency bidirectional; search cuts to inverted index and prefix autocomplete — from "push to people" to "query as you type."`,
    },
  ],
  reviewMdEn: `# Ch12 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | Three hard parts of chat? | Protocol + stateful connections; messages that don't drop/reorder plus status; group chat shard + presence. |
| 2 | 2026 default protocol? | **WebSocket**. poll / long-poll are evolution; SSE is one-way, not the default. |
| 3 | How do you mention MQTT / QUIC? | One sentence each: mobile power-saving push / weak-network handoff. Don't open a protocol class. |
| 4 | Why is chat stateful? | WS is pinned to one box; you need a conn registry. Can't round-robin it like stateless Web (Ch39). |
| 5 | High-level path? | Client → WS / chat → msg store + presence. HTTP is login and profile only. |
| 6 | How do messages not drop or duplicate? | Persist first, then push; **at-least-once** + \`client_seq\` idempotency. Don't pretend exactly-once. |
| 7 | What orders messages? | In-conversation server seq, not created_at. You don't need global order. |
| 8 | Three message states? | Sent (server ACK) → Delivered (peer device) → Read (opened the conversation). Receipts don't go backwards. |
| 9 | Small group vs large group? | Small groups fan-out into inbox on write; large groups store one copy by \`group_id\`, pull on read. |
| 10 | What about a celebrity group? | Shard \`group_id\`; don't fan-out to every online member on one machine. |
| 11 | How do you do presence? | Heartbeat refreshes TTL against flap; friends pubsub; large groups pull on join. |
| 12 | They ask about E2EE? | Server only sees ciphertext; search / moderation don't work. Don't expand Signal this loop. |`,
});
