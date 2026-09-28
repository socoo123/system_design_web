import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch13",
  titleEn: "Design a search system",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 50–60 min ｜ **Prereq**: Ch01 4-step method; cache Ch38
> **Goal**: inverted index + BM25-level relevance + pagination; autocomplete (Trie / debounce) as one read-path section only. No two-tower recommenders.

Search is the fifth full case. Chat pushes messages to people; this one is the reverse: **the user types a few words, and you recall and rank a page from an existing corpus.** The interviewer is not scoring whether you can draw a web crawler + recommendation funnel + ranking model. They want: **how you build the inverted index, how you score lexical relevance, pagination that does not fall over, and autocomplete as a read-path sidecar only.**

Xu's book chapter is almost all typeahead. We flip it: the spine is **search on the query path**; autocomplete is the faster read next to the search box. Where do documents come from? Default **existing corpus / sync from the product DB**—not a second crawler problem (crawlers are elective; that whole track is paused).`,
    },
    {
      id: "sec-answer",
      headingEn: "How to answer in the interview",
      bodyEn: `**Opening 30 seconds (say it out loud):**

> "Search has three hard parts: inverted index plus analyzer, BM25-level relevance and pagination, autocomplete as a read-path sidecar. I'll confirm this is site / product search, not a web crawler; ranking is lexical, no recommendation funnel. Scale on the board at 10M DAU: search QPS in the thousands to tens of thousands, hot queries through cache. Architecture: product DB syncs into the inverted index; query path client → search API → hot-query cache → inverted index. Scoring is BM25 / TF-IDF. Shallow paging can use offset; deep paging uses a cursor. Autocomplete is a separate path: debounce + Trie / prefix index top-k."

Then walk the 4 steps. Do not draw the final diagram first.

${D2}

| Time-box | What you are doing |
|---|---|
| 3–10 min | Clarify: site vs web, corpus size, freshness, autocomplete, personalization or not |
| Next 2 min | back-of-envelope: 10M DAU; search QPS thousands to tens of thousands; index on the order of 100 GB |
| 10–15 min | High-level: client → search API → cache → inverted index; ingest is a sync callout |
| 10–25 min | deep dive: analyzer + posting list, BM25 + pagination, Trie + debounce |
| 3–5 min | wrap-up: 3 bottlenecks (hot-term postings, deep pagination, autocomplete saturating QPS) |

**red flag:** drawing a crawler cluster before asking if this is site search; jumping to two-tower / ranking models before the inverted index; turning the whole chapter into a Trie lecture; hitting the backend on every keystroke with no debounce. That is over-engineering, or dragging in a recommendation / crawler / autocomplete-only problem as if it were this one.`,
    },
    {
      id: "sec-clarify",
      headingEn: "Clarifying questions",
      bodyEn: `Drawing before you clarify = Jimmy. On search, stop at 5–7 questions; assume the rest and write the board.

| You ask | Typical answer / your assumption | What it changes |
|---|---|---|
| Site / product search, or web search? | **Site**; corpus already lives in the product DB | ingest = sync, no crawler |
| About how many documents? | Teaching default: **tens of millions to hundreds of millions** | inverted index must shard; not a single-box LIKE |
| How soon after a write is it searchable? | **Near-real-time** (seconds to minutes) | refresh; no guarantee of immediately visible |
| Autocomplete? | **Yes**; prefix top-k | search-box sidecar, not the main index |
| Personalized / recommendation ranking? | **Not this loop** | BM25-level lexical scores; ranking models are another prompt |
| What does pagination look like? | Jump to the first few pages; maybe infinite scroll | offset for shallow paging + cursor for deep |

When they say "you decide," write the assumptions:

> "I'll assume: site search, existing corpus synced from the product DB. Relevance is BM25, no recommendation funnel. Autocomplete yes, prefix match, client debounce. Pagination: offset for shallow pages, cursor for deep. I'll draw on that—cut me off if it's wrong."

If they bring up crawlers / web-scale indexing: **acknowledge the difference, then close it.** "That's another prompt; crawlers are elective and paused in this course. This loop is the query path over an existing corpus." Same close for two-tower / ranking models. Asking past 10 minutes is also a red flag. The golden line is still: **ask the key questions → state your own assumptions → write the board → move.**`,
    },
    {
      id: "sec-estimate",
      headingEn: "Back-of-the-envelope",
      bodyEn: `Formulas live in Ch03. Here you only need order of magnitude: prove you know **read QPS is on the query path, and the expensive part is posting-list scans and hot queries—not reciting Google's daily search volume.** Whiteboard assumptions from public-scale numbers, not some company's internal stats.

Assume about **10M DAU**; ~8 searches per user per day; peak about 10×. Corpus about **100 million** docs, ~2 KB of body text each.

| Item | How you estimate | Order of magnitude |
|---|---|---|
| Search QPS | 1e7 × 8 / 86400 | **~1e3**; peak ×10 **~1e4** |
| Autocomplete QPS | after debounce, ~3–5 prefix requests per search | **~3e3–5e3**; peak tens of thousands |
| Body text size | 1e8 × 2 KB | **~200 GB** of text |
| Inverted-index size | with tf / position, roughly 0.5–1.5× the body | **~100–300 GB**; plus replicas |
| Hot queries | Zipf: a few queries eat most of the reads | a **query cache** cuts a chunk (Ch38) |

Do not multiply autocomplete by "one request per keystroke"—that is self-harm without debounce. On the board, multiply by 3–5 first; in the deep dive, debounce pulls the peak back down.

**Interview line:**

> "10M DAU on the board: search ~1k QPS daily average, ~10k at peak. Index for 100M docs is on the order of 100 GB—needs shards, but this is not the web-scale crawler prompt. Bottleneck first is hot-term postings and hot queries, not folding crawler bandwidth into this loop."

Common mistakes: treating a public search engine's daily query volume as your internal number; stuffing whole-site HTML / images into the inverted index. The index eats **terms after the analyzer**, not raw object storage.`,
    },
    {
      id: "sec-arch",
      headingEn: "High-level architecture",
      bodyEn: `Left to right, draw only the **query path**: Client → Search API → hot-query cache → inverted index. Hang ingest in one sentence on the side: product DB syncs into the index—do not unpack a crawler on this diagram. After they buy in, split inverted index and scoring.

${D2}

**This diagram cites**: Ch38 Cache & CDN · Ch37 Storage choices · Ch43 Hyperscale data

**ingest (name it and stop):** existing corpus / product-DB changes (CDC or periodic pull) → the same analyzer → write the inverted index. Near-real-time is the refresh interval; you **do not guarantee** searchable in the same millisecond as the commit. This is not a WAL lecture, and not a crawler lecture.

**schema (enough and stop):** forward index \`doc_id\` → title / body / fields; inverted index \`term\` → posting list (\`doc_id\`, tf, optional position). Query-cache key = normalized query string (plus locale if you have one). Autocomplete is a separate prefix structure—do not draw it as the same box as the main inverted index.

Elasticsearch / OpenSearch in the interview are only **an example of inverted index + analyzer + BM25**. Do not recite node roles, shard-count magic, or the plugin catalog.

How one query walks (a cache hit short-circuits; the diagram shows a miss so the path is complete):

${D2}

**This diagram cites**: Ch38 Cache & CDN

Stop the high-level here. Ask: "Does this direction look OK? Next I'll dig into inverted index and analyzer, then BM25 plus pagination, then autocomplete as the sidecar."

**Interview line:**

> "Query path client → API → hot-query cache → inverted index. Docs sync from the product DB; no crawler. Autocomplete is a separate prefix index. Scoring starts at BM25."`,
    },
    {
      id: "sec-index",
      headingEn: "Deep dive · inverted index & analyzer",
      bodyEn: `First hard part. **The forward index is document → terms; the inverted index is term → documents.** You cannot scan 100 million docs. You take the terms in the query, fetch posting lists, then intersect / union.

${D2}

**This diagram cites**: Ch37 Storage choices · Ch43 Hyperscale data

**analyzer (index and query must use the same one):** tokenize → lowercase → optional stopwords → stemming / product tokenizer. \`Docker\` and \`docker\` become the same term, or the inverted index never meets. Chinese needs a segmenter; on the board assume "there is an analyzer"—do not turn this chapter into an NLP lecture.

Posting lists are ordered by \`doc_id\`: multi-term intersection can two-pointer scan; you do not load one side into a HashSet and probe. Lists often carry **tf** (how many times in this doc) and **position** (phrase / proximity: "new york" must be adjacent). OR-only keyword search can skip position and save space; phrase queries without position fall back to reading the forward index to verify—that is a trade-off of IO for index size.

| | Shard by term | Shard by doc (usual default) |
|---|---|---|
| What lives on a shard | Full postings for some terms | The whole inverted index for some documents |
| Query fan-out | Only the shards that own those terms | **Almost every shard** (scatter-gather) |
| Hot terms | \`the\` / product hot terms saturate one shard | Hot docs spread out; tail latency is the slowest shard |
| Interview | Name the hotspot | **Teaching default**; ES is also doc shards if they ask |

On doc shards, each shard fetches local postings, scores BM25, and returns its own top-k; the coordinator merges. p99 is dragged by the slowest shard—that is Ch43 scatter-gather; name it and stop. Do not unpack hedging-request papers.

A hot term's posting list can be longer than your memory budget: skip lists / skip pointers, compression (delta-encoded doc_id)—one sentence is enough. If one box cannot hold it, shard + replicas. Do not pretend a HashMap survives 100 million docs.

**Interview line:**

> "Inverted index is term → posting list. Same analyzer on index and query. Multi-term AND walks ordered postings. I default to sharding by document, query is scatter-gather; if we shard by term I will name the hot-term hotspot."

trade-off: postings with position are larger and phrases are accurate; without them you save space and phrases get expensive. Putting the whole table on one box so "one node owns every term" is the other failure mode—an instant single-point bottleneck.`,
    },
    {
      id: "sec-rank",
      headingEn: "Deep dive · relevance and pagination",
      bodyEn: `Second hard part. After recall you still have to **rank**: users only look at page one. Relevance in this loop stops at **BM25 / TF-IDF**. Explainable; you can finish it on the board. Do not draw a recall / coarse-rank / fine-rank funnel.

${D2}

BM25 in three whiteboard sentences—no need to memorize the formula:

1. **TF saturates**: more occurrences in a doc is better, but the 10th hit adds far less than the first.
2. **IDF**: rarer terms discriminate better (\`docker\` beats \`the\`).
3. **Length normalization**: a long doc cannot win by stuffing terms.

TF-IDF is a simpler member of the same family; in the interview, "BM25 is TF-IDF with saturation and length normalization" is enough. Multi-field (title weight > body) is a weighted sum—still lexical, not a model lecture.

Hot queries: normalize the query → cache the whole result page (Ch38). Under Zipf a few queries own a lot of QPS; cache is the first cut on the read path. Invalidation follows document updates with a short TTL or an active delete. Do not promise search and the primary DB agree in the same millisecond.

${D2}

| | offset / \`from+size\` | cursor (\`search_after\`) |
|---|---|---|
| UI | **can jump to page N** | only next-page / infinite scroll |
| Cost | deeper means ranking everything before it | continue from the last sort key of the previous page |
| New docs inserted | pages can duplicate or skip | anchored on \`(score, doc_id)\`, more stable |
| Interview | first few pages are fine | **default for deep paging**; name ES \`search_after\` |

Unlike Ch11 Feed, search products often need "page 2, page 3"—offset is not an instant red flag. **The red flag is still using a huge \`from\` for deep paging**, or claiming you can cheaply jump to page 10000. Board: offset for the first pages; infinite scroll, export, and deep pages switch to a cursor anchored on \`(BM25 score, doc_id)\`.

**Interview line:**

> "Scoring is BM25: TF saturation, IDF, length normalization. No two-tower. Hot queries cache the whole page. Offset for shallow paging, cursor for deep. Never from=10000."`,
    },
    {
      id: "sec-ac",
      headingEn: "Deep dive · autocomplete (read-path sidecar)",
      bodyEn: `Third hard part, **this section only**. Autocomplete is the read on the search box before they hit Enter: latency is tighter than result search, and QPS is easier to saturate from the keyboard. It is not a second inverted index, and it is not a recommender.

${D2}

**This diagram cites**: Ch38 Cache & CDN

**Debounce first.** Hitting the API on every keystroke is self-harm: QPS scales with word length, and the second-to-last response can arrive late and flicker the list. Client waits **~200–300ms** with no new keystroke, then sends; minimum prefix 2–3 characters so typing \`a\` does not scan half the tree. Server cancels in-flight requests on the same connection or drops out-of-order responses.

**Prefix structure:** teaching default is a **Trie**. Root is the empty string, edges are characters, a path is a prefix. Query: walk to the prefix node, take the **top-k** cached on that node (by global popularity). Two optimizations you should volunteer: ① cap max prefix length (users rarely type a novel); ② **store top-k on every node**, so the query is near O(1)—space for latency. Popularity comes from async aggregation of search logs. **Do not** mutate the Trie on every online query—reads are heavy, writes are light; collection and query are separate services.

Alternatives in one sentence each: Lucene compresses prefixes with an FST, same family as a Trie; small data can scan a Redis ZSET in lexicographic order. Name them and stop—no data-structure lecture.

| | Main search inverted index | Autocomplete Trie / prefix index |
|---|---|---|
| Input | full query, analyzer → terms | **prefix string** |
| Output | a page of docs + scores | 5–10 suggested queries |
| Latency | hundreds of ms is OK | tighter: in-memory structure + cache |
| Updates | document sync / refresh | rebuild from logs in batch, or layered updates |

Browser HTTP cache / CDN is also sweet for "the same prefix": top-k for \`do\` is almost the same for everyone (no personalization in this loop). That is Ch38 again—do not turn autocomplete into a user-profile system.

**Interview line:**

> "Autocomplete is a sidecar: client debounce, minimum prefix, Trie or prefix index, top-k cached on the node. Popularity aggregated async. Do not draw it as the same service as the BM25 inverted index, and do not put a personalized ranker on it."

trade-off: caching top-k on the node makes reads O(1); updating one term touches ancestors, so you prefer batch rebuild over per-key live mutations. A personalized Trie per user is over-engineering.`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs the original book",
      bodyEn: `<details>
<summary>What the book / notes said then (not the first answer)</summary>

Xu titled this chapter autocomplete: Trie, frequency, top-k cached on the node, collection service split from query service. That still holds for **the typeahead section**. What is outdated is answering the whole "design search" prompt with only a Trie, and treating a web crawler as a required main diagram.

| Book or notes | How you answer now |
|---|---|
| Whole chapter is autocomplete | **Spine is the inverted-index query path**; autocomplete is one sidecar section |
| No BM25 / inverted index | **BM25 / TF-IDF + posting list** in the body |
| Web crawler as the first half of search | This loop: **existing corpus / product-DB sync**; crawler elective paused |
| Notes add personalization + ML ranking | **Fold is enough**; first answer is still lexical |
| Notes add CJK pinyin, GDPR | One sentence each on follow-up; do not unpack another system |
| Autocomplete QPS written as some company's 24K | Use 10M DAU whiteboard magnitude; do not recite internal numbers |
| No debounce | **Client debounce** is the first cut on autocomplete |

Still useful from the book: Trie prefixes, node top-k, read-heavy / write-light, async tree build. Outdated: using that instead of an inverted index, and treating a ranking model as the default final diagram for search.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **"Inverted vs forward index?"** → Forward is doc → terms; inverted is term → postings. Queries walk the inverted index.
2. **"Why an analyzer?"** → Same tokenize / lowercase on index and query, or terms never match.
3. **"How do you recall multiple terms?"** → Intersect ordered postings (AND) or union (OR).
4. **"BM25 vs ML ranking?"** → BM25 this loop. Two-tower / recommendation funnel is another prompt—do not draw it.
5. **"How do you shard?"** → Default by document, query is scatter-gather; shard-by-term needs the hot-term hotspot spoken out loud.
6. **"Is offset OK for pagination?"** → First few pages yes; deep paging switches to cursor / \`search_after\`. Never from=10000.
7. **"How do you survive hot queries?"** → Cache the whole page for a normalized query (Ch38). Zipf.
8. **"Searchable immediately after write?"** → Near-real-time refresh; no same-millisecond guarantee with the primary.
9. **"How do you do autocomplete?"** → debounce + minimum prefix + Trie/prefix-index top-k. Not another inverted-index scan.
10. **"Request on every keystroke?"** → No. debounce; otherwise QPS and out-of-order responses are both red flags.
11. **"Do we need a crawler?"** → Existing corpus this loop. Crawler is another prompt; elective paused.
12. **"Chinese pinyin / GDPR / personalization?"** → Pinyin is another prefix; query logs are not a permanent profile. Close in one sentence; do not unpack.
13. **The final diagram is already huge and they keep stacking?** → ES ops class, recommendation funnel, web-scale crawler are not this chapter. Three hard parts spoken clearly scores higher than 20 boxes.`,
    },
    {
      id: "sec-next",
      headingEn: "Wrap-up and what's next",
      bodyEn: `Wrap-up never says perfect. Three bottlenecks out loud:

| bottleneck | How you take it |
|---|---|
| Hot-term postings / shard tail latency | Ordered postings + shard-by-doc scatter-gather; hot-query cache |
| Deep pagination | Offset for shallow; cursor for deep; no huge \`from\` |
| Autocomplete saturating reads | debounce + minimum prefix + in-memory Trie top-k; async popularity rebuild |

Self-check: close this page. 30-second opening + high-level on the board; walk inverted index + analyzer, BM25 plus pagination, autocomplete debounce to the air. Wherever you stumble, come back to that section.

Next problem is **Ch14 · Design a video platform**. Search is term → documents; video switches to transcoding, chunking, and CDN—from "inverted-index recall" to "how a large file plays."`,
    },
  ],
  reviewMdEn: `# Ch13 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | Three hard parts of search? | Inverted index + analyzer; BM25-level relevance + pagination; autocomplete Trie + debounce (sidecar). |
| 2 | Where do documents come from? | **Existing corpus / product-DB sync**. No web crawler. |
| 3 | High-level query path? | Client → Search API → hot-query cache → inverted index. |
| 4 | What does the inverted index store? | term → posting list (doc_id, tf, optional position). |
| 5 | Why the same analyzer? | Same tokenize / lowercase on index and query, or terms miss. |
| 6 | Shard by term vs by doc? | Term shards have a hot-term hotspot; **default by document**, query is scatter-gather. |
| 7 | BM25 in three sentences? | TF saturates, IDF on rare terms, length normalization. Not two-tower / ranking. |
| 8 | How do you survive hot queries? | Cache the whole page for a normalized query (Ch38). Zipf. |
| 9 | Offset or cursor? | Offset for shallow / jump-to-page; cursor / search_after for deep. |
| 10 | Is autocomplete the same service as the inverted index? | No. Sidecar: debounce + Trie/prefix top-k. |
| 11 | Why debounce? | Avoid one request per key; cut QPS, stop out-of-order flicker. |
| 12 | How do you mention Elasticsearch here? | An example of inverted index + analyzer + BM25. Do not recite cluster plugins. |`,
});
