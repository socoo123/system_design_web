import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch09",
  titleEn: "Design a URL shortener",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 50–60 min ｜ **Prereq**: Ch01 4-step method; Ch06 KV, Ch07 unique IDs can wait
> **Goal**: walk a URL shortener through the 4 steps; default **302** and **base62 + range / auto-increment**; explain why **Snowflake is not the ID source for a 6-char short code**.

URL shortener is the first full case. Small scope, a clean path — a good run of the Ch01 skeleton. They are not scoring whether you can draw "global CDN + a warehouse." They want: **two endpoints spoken clearly, scale estimated right, two hard parts (the two pieces worth digging) spoken through.**

The system is actually small. The hard parts are how you mint the short code, and how redirect comes back to origin.`,
    },
    {
      id: "sec-answer",
      headingEn: "How to answer in the interview",
      bodyEn: `**Opening 30 seconds (say it out loud):**

> "A URL shortener has two endpoints: \`POST /shorten\` turns a long_url into a short code; \`GET /{code}\` 302s back to the long URL. I'll estimate first — read-heavy, write-light, storage is small. Two hard parts: ① default **302**, not 301, because we want Analytics; 301 gets cached by the browser and later clicks never hit origin; ② short codes are **base62 + range / auto-increment**, not a truncated hash, and do not feed Snowflake into a 6-char code. Ship it as KV + cache."

Then walk the 4 steps. Do not lead with the final diagram.

${D2}

| Time-box | What you are doing |
|---|---|
| 3–10 min | Clarify: custom aliases, expiry, Analytics, read:write |
| Next 2 min | back-of-envelope: writes in the hundreds of QPS, reads in the tens of thousands, TB-scale storage |
| 10–15 min | High-level: client → gateway → shorten/redirect → KV+Cache |
| 10–25 min | deep dive: 302 vs 301, base62 vs hash, no Snowflake, hot keys |
| 3–5 min | wrap-up: 3 bottlenecks (hot short codes, enumerable codes, cache inconsistency) |

**red flag:** drawing 301 before you asked about Analytics; saying "Snowflake + base62" before you computed 62^6; stuffing MQ, a warehouse, and multi-Region into the high-level. That is over-engineering.`,
    },
    {
      id: "sec-clarify",
      headingEn: "Clarifying questions",
      bodyEn: `Drawing before you clarify = Jimmy. On a URL shortener, stop at 5–7 questions; assume the rest and write the board.

| You ask | Typical answer / your assumption | What it changes |
|---|---|---|
| Custom short codes? | Yes. User-picked codes win | Write path checks occupancy first |
| Do short links expire? | Optional TTL | schema adds \`expires_at\`; check on read |
| Analytics? | **Yes** (default) | Must be 302; events async |
| Read:write? | Each link clicked tens to hundreds of times | Read-heavy → cache |
| Same long_url shortened twice — same code? | Same code by default | Reverse index; write path idempotent |
| Preview the real target? | Mention it, stop | \`code+\` / preview, anti-phishing |

When they say "you decide," write the assumptions:

> "I'll assume: click Analytics, custom aliases allowed, read:write about 100:1, same long_url returns the same code. I'll draw on that — cut me off if it's wrong."

Asking past 10 minutes is also a red flag. The golden line is still: **ask the key questions → state your own assumptions → write the board → move.**`,
    },
    {
      id: "sec-estimate",
      headingEn: "Back-of-the-envelope",
      bodyEn: `Formulas live in Ch03. Here you only need order of magnitude: prove you know **this is a small system**. Teaching assumptions below from public-scale numbers — not some company's internals.

Assume ~1 million creates/day; each clicked ~100 times on average.

| Item | How you estimate | Order of magnitude |
|---|---|---|
| Write QPS (shorten) | 1e6 / 86400 | **~10**; peak ×10 is still hundreds |
| Read QPS (redirect) | write × 100 | **~1e3–1e4** |
| Read:write | read / write | **~100:1**, cache-friendly |
| Storage | code + URL + metadata ~0.5 KB/row; ~200 million/year | ~**100 GB**/year; ten years with replicas still **TB-scale** |
| Bandwidth | the 302 itself is a few hundred bytes, not the landing page | tens of thousands of QPS is still **MB/s** of outbound headers |

**Interview line:**

> "Read:write about 100:1, storage TB-scale. This is not a distributed-systems puzzle. QPS and capacity both fit a single-Region KV + cache. I spend the time on the short code and the redirect."

Common mistake: counting the whole landing page the user downloads as shortener bandwidth. The shortener returns **302 + Location** — those few dozen bytes are your outbound.`,
    },
    {
      id: "sec-arch",
      headingEn: "High-level architecture",
      bodyEn: `Left to right: client → LB → shorten / redirect → KV + Cache. After they buy in, split write path and read path.

${D2}

**This diagram cites**: Ch06 Key-value store · Ch37 Storage choices · Ch38 Cache & CDN

**schema (enough, then stop):** \`short_code\` (PK) → \`long_url\`; optional \`expires_at\`, \`user_id\`, \`created_at\`. No JOIN, so KV fits better than a relational store. A small PostgreSQL single table also passes the interview — say "single table now; swap to KV when QPS grows."

Draw **write path** and **read path** separately. Do not draw one maze.

${D2}

**This diagram cites**: Ch07 Distributed unique IDs

Write-path talk track: custom codes first (occupied → reject); else take an ID from a range, base62 it to 6 chars, write \`code → url\`. If same URL must return the same code, also write \`url → code\` reverse lookup.

Read path is a sequence diagram. Walk the **cache miss** first (more steps); on hit, Cache returns long_url and you never touch KV.

${D2}

**This diagram cites**: Ch38 Cache & CDN · Ch06 Key-value store

After the 302, drop the click event on MQ **async** — do not write the analytics store on the request path. Analytics, mention and stop; this is not a warehouse class.

Stop the high-level here. Ask: "Does this direction look OK? Next I'll dig into 302 and the short code."`,
    },
    {
      id: "sec-redirect",
      headingEn: "Deep dive · 301 vs 302",
      bodyEn: `First hard part. URL shorteners default to **302**.

${D2}

| | 302 Found | 301 Moved Permanently |
|---|---|---|
| Browser | Does not treat the hop as a permanent cache | **Caches it**, then jumps the long URL directly |
| Hits origin? | **Every click hits your service** | After the first, they never come back |
| Analytics | You can instrument every click | Later clicks are invisible |
| Change target / expire | Yes: next 302 to a new URL or 404 | The client still remembers the old Location |
| SEO | Link equity does not pass to the target | Fits a permanent move |

**Why default 302:** one of the commercial values of a shortener is click Analytics. Once 301 is cached by the browser (and some middle proxies), later clicks never go through you — Analytics, expiry, and retargeting all die.

**Interview line:**

> "I use 302. A shortener needs every click counted; 301 gets cached by the browser and later clicks never hit origin. I only switch to 301 if they explicitly say 'pure SEO, never change the target, no Analytics.'"

Speak the trade-off: 302 puts all the read QPS on you. That is why Cache was on the high-level — **not** a reason to switch back to 301.

Same idea: do not long-cache a 302 on a CDN — it is a 301 in disguise, and Analytics is gone again. Hot keys use **server-side** local cache / Redis; next section.`,
    },
    {
      id: "sec-code",
      headingEn: "Deep dive · hash vs base62 (don't use Snowflake)",
      bodyEn: `Second hard part. Production default: **base62-encode a range or DB auto-increment ID**, 6 chars.

base62 alphabet is \`[0-9a-zA-Z]\`, 62 symbols. **6 chars = 62^6 = 56,800,235,584 ≈ 56.8 billion.** A million new rows/day still takes a century to fill; if you really run out, go to 7 chars (~3.5 trillion). Do not switch ID schemes first.

${D2}

### Why truncated hash is messy

\`MD5(long_url)\` truncated to 6 chars (~36 bits) looks like "plenty of space." Birthday paradox: 50% collision around **√N** rows. N = 56.8 billion → √N ≈ **240,000**. You can collide at a few hundred thousand, not "after 56.8 billion."

So a hash scheme **must look up the store**: code exists and it is not the same URL → salt or change the suffix, hash again, look up, until you find a hole. Extra read on the write path, plus concurrent double-writes. Same URL → same code is its only sweetener.

### Why base62 + range is the default

Unique ID → unique encoding: **no collision, no lookup just to mint**. Leaf segment or DB auto-increment both grow from small IDs; feed them to base62 and you get 6 chars. Ch07 on ranges: each shorten instance claims a slice (e.g. 1–10000), increments locally, claims another when empty.

Name the downsides too: by default the same URL gets a new ID and a new code every time; adjacent codes are guessable. Fix the first with a reverse index; fix the second with rate limiting. Do not reach for Snowflake just to make codes "unguessable."

### Common crash: do not use Snowflake as the ID source for a 6-char short code

Snowflake is 64-bit, order **10^18**. \`base62(10^18)\` is about **11 chars**, not 6. Six chars need ID **< 62^6 ≈ 56.8 billion**. Snowflake's high bits are a millisecond timestamp, way over that ceiling.

${D2}

| ID source | Magnitude | base62 length | 6-char short URL? |
|---|---|---|---|
| DB auto-increment / range (Leaf segment) | 1 → 56.8 billion | **6 chars** | **Use this** |
| Snowflake | ~10^18 | **~11 chars** | No |
| UUID | ~10^38 | twenty-plus chars | No |

Truncating Snowflake does not work either: drop the sequence or machine bits and the same millisecond collides — uniqueness is gone. Want short, use a **small ID**; want Snowflake's throughput and no coordination, accept 11 chars — neither is the default on a shortener interview.

**Interview line:**

> "Production I use a range or DB auto-increment, then base62. Snowflake is about 10^18, encodes to 11 chars, cannot feed a 6-char code. Leave Ch07's Snowflake for order IDs and message IDs."`,
    },
    {
      id: "sec-hot",
      headingEn: "Deep dive · Hot keys and write-path idempotency",
      bodyEn: `Reads are Zipf: a few short codes (campaign pages, hot posts) eat most of the redirect. That is the read-path bottleneck; another warehouse layer does not fix it.

${D2}

**This diagram cites**: Ch38 Cache & CDN

| Layer | What it does |
|---|---|
| In-process LRU | Stops the viral ones; same instance does not hit Redis again |
| Redis | Hot set; if the box dies, KV is still there |
| KV | Cold data and the source of truth |

On cache miss, watch stampede: the same viral code punches through at once. Merge origin fetches with singleflight / a lock — do not let N requests hit KV together. Invalidation: short TTL + delete the cache on delete. Details in Ch38.

**Write-path idempotency:** does the same \`long_url\` return the same code? Default assume **yes** — fewer junk codes, and you stop "the same landing page minted thousands of times." Implementation: look up \`url → code\` first; if present, return it; else mint and **write both** forward and reverse. Custom codes: \`Put\` with "code must not exist"; conflict → occupied.

Custom codes **beat** generated ones: if they want \`/sale\`, occupy \`/sale\` first — do not also mint a random 6-char.

Security, mention and stop: shorteners hide the real URL, which is good for phishing. One sentence: "if it looks shady, a preview page (a lot of products use \`+\` after the code)" + create rate-limit. Enumerable codes wait for follow-ups. Do not turn this into a full security class.`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs the book",
      bodyEn: `<details>
<summary>How the book / notes used to teach it (not the first answer)</summary>

| Book or notes | How you answer now |
|---|---|
| 301/302 table, default leans 301 (save traffic) | **Default 302**. Want Analytics, want to retarget, want expiry. 301 only for SEO / a permanent move |
| Analytics barely tied to the status code | The reason for 302 is every click hits origin so you can instrument; events go on MQ, do not block the 302 |
| base62 not wired to an ID generator | Wire **range / DB auto-increment** (Ch07), not Snowflake |
| Hash collisions waved through | Truncation + birthday paradox; must look up and retry |
| Notes comparison table has a "2026: wire Snowflake" row | **Trust the math, ignore that row.** Snowflake ~10^18 → ~11 chars, cannot encode to 6 |

The book's skeleton still works as an intro: two APIs, KV, cache. What aged is **default 301** and **not computing ID length**.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **"301 or 302?"** → Shortener default 302. 301 is cached by the browser; later clicks never hit origin; Analytics / expiry / retarget all die. Pure SEO → 301.
2. **"Why not Snowflake?"** → Snowflake ~10^18, base62 ~11 chars. 6 chars need ID < 62^6 ≈ 56.8 billion. Use a range or DB auto-increment. Truncating Snowflake drops uniqueness.
3. **"Is 6 chars enough?"** → 56.8 billion. A million/day is extremely comfortable. If not, go to 7; do not switch schemes first.
4. **"Codes are enumerable?"** → Auto-increment base62, neighbors are guessable. Rate-limit creates; if you need unpredictability, add a salt or a random pool. **Do not** switch to Snowflake for this.
5. **"A hot short code punches through Redis / KV?"** → Local LRU + Redis; merge origin on miss. Do not long-cache 302 on a CDN.
6. **"Same URL shortened twice?"** → Same code → reverse index, write path idempotent. Do not mint a new code every time and still claim dedup.
7. **"Isn't hash nicer because it's stateless?"** → Same URL → same code is real; truncation will collide, so you must look up. Production more often picks range + reverse lookup.
8. **The final diagram is already huge and they keep stacking?** → Classic over-engineering on this prompt. Single Region, KV, cache, 302, range — spoken clearly scores higher than 20 boxes.`,
    },
    {
      id: "sec-next",
      headingEn: "Wrap-up and what's next",
      bodyEn: `Wrap-up never says perfect. Three bottlenecks out loud:

| bottleneck | How you take it |
|---|---|
| Hot short codes | Local cache + Redis; merge origin |
| Enumerable / abusive creates | Rate limit; reverse index so same URL → same code |
| Cache vs KV inconsistency | Short TTL + invalidate on delete |

Self-check: close this page. 30-second opening + high-level on the board; walk 302 and "no Snowflake" to the air. Wherever you stumble, come back to that section.

Next problem is **Ch10 · Design a notification system** (SMS / Email / Push + MQ). A shortener is read-heavy KV; notifications are fan-out and delivery.`,
    },
  ],
  reviewMdEn: `# Ch09 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | Two core endpoints of a URL shortener? | \`POST /shorten\`: long_url → short code. \`GET /{code}\`: 302 to long_url. |
| 2 | Default 301 or 302? Why? | **302**. Want Analytics, want to retarget / expire. 301 is cached by the browser; later clicks never hit origin. |
| 3 | What happens after a 301? | Browser remembers Location, then jumps the long URL directly; the shortener never sees the click. |
| 4 | How do you mint a production short code? | **base62 + range or DB auto-increment**. No collision, 6 chars. Truncated hash must look up and retry. |
| 5 | Why not Snowflake as the 6-char ID source? | Snowflake ~10^18, base62 ~11 chars. 6 chars need ID < 62^6 ≈ 56.8 billion. |
| 6 | What is 62^6? Is 6 chars enough? | ≈ 56.8 billion. A million/day is extremely comfortable; if not, go to 7. |
| 7 | Why must truncated hash look up the store? | Birthday paradox: space 56.8 billion, collision around a few hundred thousand. Hit → salt and retry. |
| 8 | How do you stop a hot short code? | Local LRU → Redis → KV; merge origin on miss. Do not long-cache 302 on a CDN. |
| 9 | Same long_url, same code? | Reverse index url → code; write path look-up-then-write, idempotent. |
| 10 | Custom code vs generated — who wins? | Custom wins. Occupied → reject; do not also mint a random code. |
| 11 | Codes are enumerable — how do you take it? | Rate-limit creates; if you need unpredictability, salt or a random pool. Do not switch to Snowflake for this. |
| 12 | Biggest over-engineering on this prompt? | The system is actually small. Stacking CDN / multi-Region / a warehouse on the final diagram, and never speaking 302 and the range. |`,
});
