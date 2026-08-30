import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch01",
  titleEn: "World map & the 4-step method",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 60–70 min ｜ **Prereq**: none
> **Goal**: know how to use this site; run a 45-minute system design interview on a time-box; recover when you get stuck.

> From the book: *The final design is less important compared to the work you put in the design process.*

You may have shipped a lot of services and still never been asked on a whiteboard: “what if traffic ×10?” This course is not Spring again. It is: **take bricks you already know, assemble them in an order the interviewer can follow, and say the trade-off out loud.**

Plenty of people have the knowledge and still fail because they have no frame: they jump to an answer, rabbit-hole, then go silent. This chapter does two jobs once—**how to read this site**, and **how to play 45 minutes**. Every later problem fills this skeleton. We will not open another chapter to repeat “this interview is collaboration.”`,
    },
    {
      id: "sec-essence",
      headingEn: "What the interview actually scores",
      bodyEn: `It is not “build WeChat in 45 minutes,” and it is not a trivia contest. It is: **two engineers collaborating to turn a fuzzy prompt into a design you could start building.** Open-ended. No golden diagram. **Process > final picture.**

The interviewer is watching whether you:

- clarify before you draw
- estimate order of magnitude (not bytes)
- pick between two reasonable designs and name the trade-off
- speak when you stall, and ask for a hint if you need one

A pretty final diagram with a silent process = low score. A clear process with an intentionally simplified diagram = high score.

${D2}

**The biggest red flag = over-engineering.** Interviewers fear you chasing a “pure” design and skipping trade-offs. Saying “I simplified here because X; production would also consider Y” scores higher than stacking fancy boxes.

**The biggest DON'T = thinking in silence.** Algorithm interviews can take a quiet 5 minutes. System design cannot—if they cannot see the thought, there is no signal, and that is a low score. Talk while you draw.`,
    },
    {
      id: "sec-site",
      headingEn: "How to read this site",
      bodyEn: `Six modules. The spine is **M1–M5**. **M6 is last**, not an appetizer.

${D2}

**Recommended first pass:**

1. This chapter (map + 4-step method)
2. **Ch02** zero → a million users → **Ch03** back-of-the-envelope
3. M2: run the 4 steps on small problems (rate limit, hashing, KV, IDs, locks)
4. M3 → M4 backend problems (short URL, Feed, search, orders, payments, schedulers…)
5. **M5** LLM inference / RAG / Agent infra (**no recommender systems**)
6. **M6 foundations last**: mechanisms + papers. When a design problem hits “cache / shard / microservice,” tap a chip and jump in—or save the whole module until the spine is done.

Design problems are **not locked to those interview books**. Topics the books skip (orders, gateways, red packets, Agent orchestration, DDD) are written the way interviews ask them now.`,
    },
    {
      id: "sec-chips",
      headingEn: "Chips, D2, flashcards",
      bodyEn: `- **Reference chips**: most of them jump to **M6 foundations** (sometimes a related design problem). Skip them on the first pass; open them when you want depth—there is a papers section inside.
- **D2 diagrams**: at most 5 boxes in a row; wrap or stack after that. Theme switch recolors the diagram.
- **Flashcards**: folded at the end of the chapter. Front = a question an interviewer might ask. Back ≤ 3 lines. If you can say it, you know it.
- **2026 vs the book**: in a fold. The body is how you should answer now. Do not lead with outdated book defaults (HDD is slow, APNS as the main channel, vector clocks as a production default).

There is **no in-browser coding**. A system design interview is talking and drawing.`,
    },
    {
      id: "sec-overview",
      headingEn: "The 4 steps and the time-box",
      bodyEn: `When you leave this page you should be able to: walk the four steps in 3–10 / 10–15 / 10–25 / 3–5 minutes; spot a red flag; and when stuck, “zoom out / ask for a hint / switch designs” instead of going silent.

${D2}

Ch02 is how architecture grows. Ch03 is how you estimate. Later chapters are concrete problems. **How you spend 45 minutes is these four steps.** The formulas live in Ch03. This chapter only asks you to leave a slot for back-of-the-envelope before Step 2.`,
    },
    {
      id: "sec-step1",
      headingEn: "Step 1 · Understand the problem, set scope (3–10 min)",
      bodyEn: `### Don't be Jimmy

The book’s story: a kid named Jimmy who blurts the answer the instant the question lands. In system design, **jumping in scores zero**. A design before requirements is a huge red flag.

### Ask four kinds of questions

${D2}

Example: “Design a News Feed.”

| You | Interviewer (typical) |
|---|---|
| Mobile, web, or both? | Both |
| Most important features? | Post + read the feed |
| Time order or a ranking model? | Keep it simple, reverse chronological |
| Max friends per user? | 5000 |
| Traffic? | 10M DAU |

Goal: turn “design X” into a **concrete, designable boundary**. After the questions, both of you agree on what you are building, how big it is, and the constraints.

If they bounce it back—“what do you think?”—**state an assumption and write it on the board.** Do not interrogate until they get annoyed.

**Must-ask list (stop around 5–7):** user scale, core features, read:write ratio, latency, consistency, availability, multi-region or not.

Ask too few → the design drifts (skip read:write and the cache layer is wrong). Ask too many past 10 minutes → they get bored. The golden line: **ask the key questions → state your own assumptions → write the board → move.**`,
    },
    {
      id: "sec-step2",
      headingEn: "Step 2 · High-level design, get buy-in (10–15 min)",
      bodyEn: `Four moves: sketch the first blueprint → ask for feedback while you draw → use Ch03 back-of-the-envelope to check it holds → walk 1–2 use cases.

${D2}

Talk track:

> “I’ll spend about 5 minutes on a high-level sketch so we agree on direction before I go deep. Clients here… this layer is LB + stateless web… does this direction look OK?”

You **must have consensus** before you leave this step. Do not steamroll into the next one.

Do you define APIs and schema here? On a huge prompt (“design search”) you can skip it; on a medium/small one you should write them. If you are unsure, ask: “Want me to list APIs first?” In 2026 virtual interviews, **volunteering 3–5 endpoints** is usually extra credit.`,
    },
    {
      id: "sec-step3",
      headingEn: "Step 3 · Deep dive (10–25 min)",
      bodyEn: `This is the whole interview. By now you have: agreed scope, a high-level sketch, and a sense of what they want to dig.

How to pick what to dig: ① the **hard part** (the piece this problem lives or dies on: short URL → encoding and redirect; chat → connections and fan-out); ② whatever they just asked; ③ the level (senior talks bottleneck and failure).

${D2}

**Depth > breadth.** The quiet failure mode is “a little of everything”: you name every box and go deep on none. A rate limiter should be token bucket vs sliding window, not another tour of the CDN.

Time is the kill switch. Glance at the clock every 5 minutes. Do not spend 15 minutes on a ranking formula—that does not prove design skill.`,
    },
    {
      id: "sec-stuck",
      headingEn: "How to recover when you stall",
      bodyEn: `This is what decides whether you can hold the room. The book barely writes it as a list; interviews use it constantly.

${D2}

Iron rule: **silence is the worst stall.** “Let me think out loud—I’m stuck on message fan-out” beats 40 quiet seconds. Asking for a hint is not weakness. They want a teammate, not a solo hero.`,
    },
    {
      id: "sec-step4",
      headingEn: "Step 4 · Wrap-up (3–5 min)",
      bodyEn: `Never say “my design is perfect.” Pick 2–3 of these:

1. Find the bottleneck + how you’d improve it
2. Failure handling (process death, network partition)
3. Observability (latency, traffic, errors, saturation)
4. The next curve (1M → 10M, what changes)
5. Cost

Always have 3 bottleneck lines ready:

| bottleneck | fix |
|---|---|
| Single point | replicas / failover |
| Hot key | shard / local cache |
| Cache vs DB drift | TTL + invalidation; or CDC |

Whiteboard in three zones: **left** requirements, assumptions, estimates; **center** architecture and data flow; **right** deep dive and trade-off. Virtual loops on Excalidraw / a shared doc are the same idea—write large, structure that reads in one glance.`,
    },
    {
      id: "sec-script",
      headingEn: "A 45-minute script (worth memorizing)",
      bodyEn: `${D2}

| Time | Move | Line |
|---|---|---|
| 0–1 | Restate | “Let me restate—you want…” |
| 1–8 | Requirements | “Features? Scale? Read:write? Latency?” |
| 8–10 | Estimate | “DAU × actions / 86400 × peak ≈ QPS” |
| 10–22 | High-level | “I’ll sketch high-level; tell me if the direction is wrong” |
| 22–40 | Deep dive | “This is the hard part. Option A… option B… I pick A because…” |
| 40–45 | Wrap-up | “Three bottlenecks: single point, hot key, consistency. If we had more time I’d…” |

Confirm the length up front. Virtual onsites are often 45–50 minutes; work the time-box backwards from that.`,
    },
    {
      id: "sec-dodont",
      headingEn: "DO / DON'T and failure modes",
      bodyEn: `**Do:** clarify first; think out loud; offer more than one design then take a trade-off; get buy-in on the high-level before the deep dive; treat the interviewer as a teammate; never quit.

**Don't:** draw before requirements; dive into one component at minute one; go silent; treat “I finished the diagram” as the end—it ends when they say it ends.

| Failure mode | Symptom | Fix |
|---|---|---|
| Jumping in | Skip Step 1 | Force 5–7 questions |
| Rabbit hole | One detail for 30 minutes | Clock every 5 minutes |
| A little of everything | Every box, no depth | Pick 1–2 cores and go to the bottom |
| Silence | Thinking with no words | Narrate the whole way |
| over-engineering | Stack boxes, skip trade-off | For each box, say why / why not |`,
    },
    {
      id: "sec-level",
      headingEn: "How level changes the answer",
      bodyEn: `Same prompt, different level, different Step 3 depth. Do not dump staff vocabulary on a junior loop, and do not wave off a senior loop with “it would work.”

| Level | Step 3 leans toward | Wrap-up should mention |
|---|---|---|
| Junior | Components, APIs, schema, clearly | Basic bottlenecks |
| Senior | Bottleneck, scale, failure | Observability, failure modes |
| Staff | Trade-off, multi-region, cost, org boundaries | How you’d split services / domains (point at it; depth is M6) |

If a backend loop asks about LLM / Agent: give the traditional design first, then “if we add retrieval / tool calls, here’s where it plugs in.” Details live in M5. This chapter only needs you to know **you might get asked—don’t go blank.**`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs the book",
      bodyEn: `<details>
<summary>What the book said / why we add a few lines now</summary>

| Book (2020) | How you answer now |
|---|---|
| Physical whiteboard by default | Virtual boards (Excalidraw / shared docs) are the default—practice them |
| Weak on API-first | On medium/small problems, volunteer endpoints in Step 2 |
| Five scoring axes | They also watch drawing clarity, time control, cost, observability |
| Almost no AI | You may get “how would vector search / Agent tools plug in”—traditional design + an enhancement path. Details in M5 (no recommenders) |

Senior loops will ask monthly cost order-of-magnitude, what happens when a box dies, and how you observe. Bring those up in wrap-up. It reads senior.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. “Anything else?” → 2–3 bottlenecks + fixes. Never say perfect.
2. “Traffic ×10?” → shard, read/write split, cache, CDN (back to Ch02, episode 8).
3. “One DC dies?” → multi-region + CAP/PACELC trade-off (mechanism in M6 Ch36; the interview line is this chapter’s wrap-up).
4. “How do you monitor?” → four golden signals + traces.
5. “Why A not B?” → you need a trade-off reason.
6. “Walk the data flow?” → sequence diagram, one write path, one read path.`,
    },
    {
      id: "sec-next",
      headingEn: "What’s next",
      bodyEn: `Go straight to **Ch02 · Scale from zero to a million users.** It is a “pain → fix → new pain” story. Ch03 drills estimates. The first concrete design problem is **Ch04 rate limiter**—small scope, a clean run of the 4 steps.

Self-check: close this page and walk the 45-minute script out loud. Wherever you stumble, come back to that section.`,
    },
  ],
  reviewMdEn: `# Ch01 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | Does system design mainly score the final diagram? | No. It scores clarifying, estimating, trade-off, and the collaboration. |
| 2 | Recommended first-pass order? | Ch01 → Ch02 → Ch03 → M2–M5. M6 last; chips can jump. |
| 3 | What does M5 cover / skip? | LLM inference / RAG / Agent infra. No recommender systems. |
| 4 | What is M6? | Foundations (mechanisms + papers, including big data, microservices, DDD). Not an appetizer. |
| 5 | 4-step time-box? | Scope 3–10; high-level 10–15; deep dive 10–25; wrap-up 3–5. |
| 6 | Two biggest red flags? | over-engineering; silent thinking. Jumping in (Jimmy) is right behind. |
| 7 | Step 1: too many or too few questions? | 5–7 key questions; assume the rest and write the board. |
| 8 | When is Step 2 done? | When they buy in on the high-level sketch—not when you finished drawing. |
| 9 | Step 3: depth or breadth? | Depth. Pick 1–2 hard parts and go to the bottom. |
| 10 | First move when you stall? | Say the stall out loud. No silence. Then zoom out / hint / switch designs. |
| 11 | Can wrap-up say the design is perfect? | Never. Keep 3 bottlenecks: single point, hot key, consistency. |
| 12 | How to zone the board? | Left: requirements, assumptions, estimates. Center: architecture. Right: deep dive and trade-off. |
| 13 | How to take “traffic ×10”? | Shard, cache, CDN, read/write split—not just more boxes. |
| 14 | Body vs “what the book said”—which is the first answer? | The body (2026). The fold is the outdated path. |`,
});
