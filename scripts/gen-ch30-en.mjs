import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch30",
  titleEn: "RAG backend",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 50–70 min ｜ **Prereq**: Ch01 4-step method; generation path is Ch29; back-of-envelope (Ch03) makes this smoother
> **Goal**: whiteboard a **retrieve + generate backend**: chunking, hybrid search, rerank, citation, eval, freshness. **Skip** recommenders, two-tower, ranking; don’t open the vector engine; don’t bring in MCP/Agent tools.

This prompt is as common now as URL shorteners and Feed. When they say “design a RAG system,” they are not scoring a vector-DB box, and they are not asking you to recite LlamaIndex / LangChain class names.

The **hard part** is three pieces: **chunking quality** (is the retrieval unit right), **hybrid search** (sparse BM25 + dense vectors, not pure ANN), **citation / eval / freshness** (sounding plausible is not a pass). Drawing “embedding → vector DB → LLM” and then being unable to talk those three is a red flag.

This chapter’s boundary (later chapters each own a slice; here you only point):

- **Generation / PagedAttention / streaming** → goes to the inference service; deep dive already in Ch29
- **Vector store engine (HNSW / IVF / PQ)** → preview Ch31; this chapter treats it as a “retrieval service,” no index-parameter tuning
- **Multi-model routing, semantic cache, billing** → preview Ch32
- **MCP / Agent tool gateway** → preview Ch33; not this chapter

Orchestration frameworks (LlamaIndex / LangChain) are **optional glue**. Don’t lock the design to an SDK, and don’t put them in the center of the architecture diagram.

M5 hard rule: **LLM + Agent infra only. No recommender funnel.**`,
    },
    {
      id: "sec-pitch",
      headingEn: "How to answer in the interview (30 seconds)",
      bodyEn: `Don’t open by drawing 20 boxes. Land the scoring signal first: you know this is a retrieve + generate backend, ingest and query are separate, and the hard part is not “which vector-DB logo.”

> “RAG is **retrieve + generate**. Ingest chunks documents, embeds them, writes a **hybrid index** (BM25 + dense vectors). Query fuses two retrievals (RRF), **rerank** (cross-encoder / late interaction) sits after retrieval, then you stitch the prompt and hit the inference service. Answers carry a **citation**. Eval is retrieval metrics + faithfulness. How vectors are stored and how you tune HNSW is the next prompt; how generation is batched is the previous one.”

How the 4 steps fill in:

| Step | What it maps to on this prompt |
|---|---|
| Step 1 clarify | Doc type / update rate, latency SLO, citation or not, multi-tenant, web search allowed, language |
| Step 2 high-level | Two pictures: **ingest pipeline** vs **query path**; generation goes to the inference service; index as a black box |
| Step 3 deep dive | ① chunking ② hybrid + rerank ③ citation / eval / freshness |
| Step 4 wrap-up | Hallucination, docs deleted or edited, swapping the embedding model, observe Recall@k + faithfulness |

**red flag:** opening with a recommender funnel / two-tower / ranking; saying “pure-vector top-k is enough”; treating LangChain as architecture; unpacking PagedAttention or HNSW parameters; quoting some company’s internal QPS. That’s off-topic.

Vector engine, LLM gateway, Agent tools: one sentence in the loop — “we can open that separately” — is enough.`,
    },
    {
      id: "sec-clarify",
      headingEn: "Clarifying questions",
      bodyEn: `Drawing “embedding + vector DB + GPT” before you asked = Jimmy. About 6–8 questions; assume the rest and write the board.

| You ask | Why you ask | Typical assumption (when they say “you pick”) |
|---|---|---|
| What are the docs? PDF / wiki / code / tables? | Chunking strategy is totally different; tables and code cannot be sliced like prose | Internal wiki + PDF manuals, mostly paragraphs |
| Update rate? Minutes, daily, or almost static? | Incremental index vs nightly full rebuild; deletes must cascade chunks | Daily as the base, minute-level lag is OK |
| Latency SLO? Interactive Q&A or offline reports? | rerank and generation dominate; interactive must cap the candidate set | Interactive: end-to-end a few seconds; TTFT still streams |
| Need **citation**? Must it trace back to the source? | Architecture gets a chunk-id column; eval gets “is the cite real” | Yes, cite; if you can’t find it, say you don’t know |
| Multi-tenant? Isolated indexes or a metadata filter? | Isolation is safer and more expensive; filter is cheaper to run, leak risk | Filter on tenant_id first; hard isolation → separate collections |
| Web search allowed? Closed corpus, or add search? | Opening the web is a second retrieval path; hallucination and freshness both change | **Closed-corpus RAG**, no public web |
| Language? Mixed Chinese/English, lots of jargon, SKUs? | Proper nouns are why BM25 exists; the embedding must cover the languages | Mixed CN/EN, lots of terms |

Nail closed-corpus vs open-web first — hybrid and eval both spin around this assumption:

${D2}

How to say it:

> “I’ll assume closed-corpus enterprise Q&A: wiki+PDF, daily updates, citations required, mixed CN/EN terms, interactive in a few seconds, tenant filter first. Generation goes to the existing inference service. Does that direction look OK?”`,
    },
    {
      id: "sec-estimate",
      headingEn: "Back-of-the-envelope (don’t fake precision)",
      bodyEn: `This prompt’s back-of-envelope is so the interviewer hears: you know where chunk count comes from, how to size vector bytes, and that QPS’s bottleneck is usually not embedding. Don’t invent some company’s QPS.

Public assumption (write the board, not internals): **100k** documents, **~2k tokens** each → corpus about **200 million tokens**.

### chunk count

Starting chunking: target block **256–512 tokens**, adjacent **overlap about 10%–15%** (a 512 block overlaps ~50–80 tokens). Stride ≈ block size − overlap, so:

> 200M tokens / ~450-token stride → **on the order of a few hundred thousand chunks** (10⁵–10⁶). Parent-child (small chunk for retrieval, large chunk into the prompt) multiplies by another factor; first compute against “a few hundred thousand vectors.”

### embedding footprint

Point at the dimension; don’t turn this into a model class. Public anchors:

| Example (public) | Dim | Per vector float32 |
|---|---|---|
| Open-source BGE-base class | 768 | ~3 KB |
| BGE-M3 class | 1024 | ~4 KB |
| text-embedding-3-small | 1536 | ~6 KB |
| text-embedding-3-large default | 3072 | ~12 KB |

500k × 6 KB ≈ **~3 GB** raw dense vectors. The HNSW graph is another bill (often a small multiplier); exact algorithms wait for Ch31. float16 halves it. Interview line: “GB order of magnitude — don’t fear storage first; fear retrieval quality and the generation bill.” That’s enough.

Sparse BM25 inverted index is a second index. Usually smaller than dense vectors, but you still count it: “hybrid is not free.”

### Where QPS and money sit

Assume interactive **10–50 QPS** yourself (write that it is an assumption). Each query is roughly:

1. **query embedding** once (tens to hundreds of tokens) — cheap
2. **hybrid retrieval** (inverted + ANN) — milliseconds to tens of ms; details Ch31
3. **rerank** tens to a couple hundred pairs (cross-encoder) — often dearer than ANN, cheaper than the LLM
4. **LLM generation** — usually the latency and cost bottleneck (Ch29)

Ingest-side embedding is one-shot (plus incremental): 200M tokens full pass, at public API prices, is roughly “dollars to tens of dollars” — far below the daily generation bill. Self-host embedding and it becomes GPU time. **Don’t make the embedding-model lecture the star of this prompt.**

pgvector vs a dedicated vector store, one sentence: **under about a million vectors, and you want the same transaction as the business row, pgvector is often enough; past that, or you want native hybrid / independently scaled replicas, hand it to a dedicated engine — details Ch31.**

How to say it:

> “I’ll size 100k docs, a few hundred thousand chunks, 1536-d. Dense vectors are GB-class. QPS I assume tens; the bottleneck is generation and rerank, not stuffing vectors into RAM.”`,
    },
    {
      id: "sec-arch",
      headingEn: "High-level architecture",
      bodyEn: `Get buy-in: **ingest and query must be two pictures**. Don’t dump chunking, HNSW, GPU, gateway, and Agent into one 20-node final diagram.

### ingest pipeline

${D2}

**This diagram cites**: storage choices (Ch37). Sparse inverted + dense vectors can be two components, or two indexes in the same engine; how you lay out RAM/disk is Ch31.

One sentence per step:

| Step | What it does | How you say it |
|---|---|---|
| Doc source | Object store / wiki export / sync | Keep **doc_id + version/hash** — deletes hang off this |
| Chunking | Split on headings / recursively, with overlap | The retrieval unit is decided here; get it wrong and everything downstream is wrong |
| embedding | Chunk → vector; model name into metadata | Swap the model = swap the coordinate system; you cannot overwrite in place and mix-search |
| hybrid index | Dense ANN + BM25 inverted | 2026 default is both, not “vectors first, maybe later” |

### query path

${D2}

**This diagram cites**: cache mental model (Ch38), storage choices (Ch37). **Inference service** is Ch29’s path (gateway / queue / GPU); here you only point “generation goes there.” Multi-model routing and semantic cache wait for Ch32.

Query sequence (rerank after retrieval — don’t draw it as a full-corpus scan in parallel with ANN):

${D2}

**This diagram cites**: protocol choices / SSE (Ch40, generation streaming). What’s stateless is the RAG orchestration layer; the index and the GPU workers both have state.

Step 2 can volunteer endpoints (bonus; no schema needed):

- \`POST /v1/rag/query\` (question, tenant, citation or not)
- \`POST /v1/rag/ingest\` (document upsert; async internally)
- \`POST /v1/rag/delete\` (cascade-delete chunks by doc_id)
- optional \`GET /metrics\` (Recall sample, faithfulness, ingest lag)

How to say it:

> “Ingest is chunking + two indexes. Query is hybrid retrieval → rerank → stitch the prompt → stream from the inference service, with a citation. Treat the vector engine as a retrieval service; don’t tune HNSW on this picture. If that direction is OK, I’ll dig into chunking and hybrid.”`,
    },
    {
      id: "sec-chunk",
      headingEn: "Deep dive ①: chunking",
      bodyEn: `Chunking decides “what is the atom of retrieval.” If the block is wrong, hybrid, rerank, and citation are all makeup on the wrong paragraph. This is one of the real hard parts on this prompt.

### 2026 starting point, not a mystic default

Public engineering consensus (LlamaIndex / various RAG guides — as practice, not as an SDK):

- **Split on structure first**: headings, subsections, lists; for PDFs keep page numbers and heading when you can
- If structure isn’t enough, **recursive character split** (paragraph → sentence → word), target block **256–512 tokens**
- **overlap 10%–15%**, so the answer is less likely to sit on a boundary
- Fixed-token cuts that slice mid-sentence are a common red flag — BM25 term frequency and dense-vector semantics both take the hit

${D2}

Semantic chunking (embedding finds the boundary) can lift dense retrieval, but block size is unstable and BM25 sometimes suffers more. Interview default: **structure split + recursive** as picture one; semantic split as a domain experiment — don’t open with over-engineering.

### Chunk too small vs too large

| | Too small | Too large |
|---|---|---|
| Retrieval | High precision, context is incomplete | Semantics get mushy, BM25 gets diluted |
| Generation | You have to stitch many chunks to have enough | The window fills with irrelevant sentences |
| Citation | Easy to locate | User can’t check “which sentence” |

**Parent-child / small-to-big** (public pattern): index and retrieve on the small chunk (e.g. ~256 tokens); on a hit, send the **parent** (whole section / ~1k–2k tokens) into the prompt. Retrieval precision and generation context decouple. You maintain an extra parent_id, so ingest is fussier — small scale, skip it first.

Code, tables, API docs: **don’t slice them like prose**. Keep a function / table as one block when you can; if it’s too long, split on symbols, and leave path, heading, page number in metadata.

Every chunk at least carries: \`doc_id\`, \`chunk_id\`, \`source\` (path or URL), \`heading\`, \`version/hash\`, \`embedding_model\`. Citation and delete hang off these fields, not off “the vectors look similar.”

How to say it:

> “I’ll split on headings to 256–512 tokens with 10%–15% overlap. Chunking is the ceiling on retrieval quality. A fast vector store cannot save a bad block.”`,
    },
    {
      id: "sec-hybrid",
      headingEn: "Deep dive ②: hybrid search + rerank",
      bodyEn: `2026 default line: **sparse BM25 + dense vectors, then rerank after retrieval.** “Pure-vector top-k into the prompt” can live in the fold as the old answer; it is not picture one.

### Why pure vector is not enough

Dense vectors are good at paraphrase, synonym, cross-language “meaning is close.” They often lose to:

- **Proper nouns, SKUs, error codes, names** — the user typed those exact tokens
- **Exact phrase / quoted queries**
- **New words, internal acronyms** — may not be in the embedding training set

BM25 (inverted + term frequency) eats exactly those. The two paths complement; it is not “the vector era made inverted indexes obsolete.”

### Fusion: don’t add the scores

BM25 is unbounded positive; cosine lives in [-1, 1]. A weighted average is a red flag. Public default is **RRF (Reciprocal Rank Fusion)**: rank only, classic constant **k = 60** as a starting point, then tune on your own query set.

Retrieve both paths in parallel (e.g. 50–100 each), RRF into one shortlist (commonly **50–200**), hand that to the next stage.

${D2}

**This diagram cites**: how the vector engine does ANN / filtering (Ch31); query embeddings can be cached (Ch38) — that is not “cache the whole answer” (the latter previews Ch32).

### rerank sits after retrieval

**cross-encoder** (query and chunk enter the model together) or **late interaction** (ColBERT-class token-level MaxSim): more accurate than a bi-encoder, also more expensive. So:

- **Don’t** run a cross-encoder over the whole corpus
- Score only the fused few dozen to a couple hundred candidates
- Last **3–8 chunks** into the prompt (window and latency SLO)

Tight interactive SLO: shrink candidates, swap a smaller reranker, or skip rerank first — let eval speak; don’t verbally promise “always 200 then a precision pass.” This is not a recommender coarse/fine ranking funnel; don’t borrow that vocabulary.

| Stage | What it does | Typical scale |
|---|---|---|
| Retrieval | BM25 ∥ dense ANN | tens to a hundred each |
| Fusion | RRF | fuse to 50–200 |
| rerank | cross-encoder / late interaction | emit 3–8 |
| Generation | inference service | 1 LLM call |

metadata filters (tenant, time, product line) should ride **on retrieval itself**, not get dropped by hand afterwards — otherwise hybrid’s top-n is polluted by other tenants. How the engine does pre-filter is Ch31.

How to say it:

> “Pure vector dies on SKUs and proper nouns. Default is BM25 + dense, RRF fusion, then rerank the shortlist. rerank is a precision layer, not a second full-corpus scan.”`,
    },
    {
      id: "sec-cite",
      headingEn: "Deep dive ③: citation, eval, freshness",
      bodyEn: `“Sounds right” is not enough on this prompt. The interviewer will chase: is the citation real, how do you know a chunking change helped, why can a deleted doc still be retrieved.

### citation and hallucination

Make it engineering, not a system-prompt line that says “please cite sources”:

1. Every chunk sent to the model carries a stable **chunk_id / source** (bracket numbers are fine)
2. The model may only cite those numbers; **every id in the answer must exist in this turn’s retrieved set**
3. No supporting evidence → say you don’t know, clearly — a closed-corpus RAG product contract, not politeness
4. Post-process drops “invented numbers”; the cite should point at the source snippet so a human can click through

**Hallucination** on this prompt is mainly: a claim the retrieved context cannot entail (unfaithful), or a cite of a document that was never retrieved. A citation ≠ faithfulness; models are good at “writing something that looks like a footnote.”

### Eval: a retrieval layer + a generation layer

Public framework **RAGAS** (and cousins): name it, don’t recite formulas. Two columns on the board:

| Layer | What you look at | The interview sentence |
|---|---|---|
| Retrieval | Recall@k / MRR / nDCG | Did the relevant passage make the shortlist |
| Generation | **faithfulness**, answer relevance | Can the sentence be supported by the context |
| Citation | Does the citation land in the retrieved set | The number isn’t invented |

RAGAS faithfulness tracks human labels better; **context relevance is noisier**. So when you change chunking / hybrid, look at retrieval metrics first, then faithfulness — don’t feel good about one “RAG total score.” You still need a small **golden query** set (human-labeled relevant passages + acceptable answers).

Latency and cost belong in eval too: double the rerank candidates, faithfulness may not move, p95 already breaks the SLO. That’s a trade-off, not “higher score always wins.”

### Freshness: incremental, delete, swap the model

${D2}

**This diagram cites**: storage and versions (Ch37); change propagation is like CDC / incremental sync (Ch41). Don’t make “drop the index and full-rebuild every night” the only plan.

| Event | Correct move | Crash |
|---|---|---|
| Doc edited | Skip unchanged by **content hash**; if it changed, delete old chunks then write new ones | insert-only, no delete → old and new passages retrieved together |
| Doc deleted | **Cascade-delete all chunks by doc_id** | Vectors linger, you cite a ghost document |
| Daily / hourly | Incremental index + periodic full reconcile (catch missed deletes) | Trust incremental forever, never reconcile |
| **Swap the embedding model** | New space, dual-write, backfill, check Recall, **atomic cutover** | Two vector sets mixed in one ANN search |

Swap the model = **swap the coordinate system**. Query with the new model against old vectors in the store, cosine no longer means what it did. Treat it as a schema migration: new collection / new named vector; query **hits one version only**. During backfill, old queries still go to the old index.

Observe: ingest lag (source update → searchable), whether deletes truly hit 0, Recall@k on the golden set before vs after a model swap.

How to say it:

> “Citations must check that the id is in this turn’s retrieved set. Eval splits retrieval + faithfulness. Updates are hash-incremental; deletes cascade by doc_id. Swap embedding as a migration, not an overwrite.”`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs the book",
      bodyEn: `<details>
<summary>Minimal note list / pure-vector top-k — how you answer now</summary>

Alex Xu–generation books have **no RAG chapter**. The notes’ \`ch1_16\` is one picture — “query → embedding → vector DB → stitch prompt → LLM” — plus a line “hybrid is mainstream.” That’s a checklist, **not 2026 body copy**.

| Then / early engineering | How you answer now |
|---|---|
| Pure-vector ANN top-k straight into the prompt | **BM25 + dense** in parallel, **RRF** fusion |
| rerank “optional, if we have time” | Post-retrieval **cross-encoder / late interaction** is the default precision layer (capped by SLO) |
| Fixed 512-token cut | **Headings / recursive**, 256–512 + overlap; parent-child is a bonus |
| A vector-DB box = architecture | Two pictures, ingest vs query; engine details wait for Ch31 |
| Trust the model’s self-written sources | **citation check** + “I don’t know” |
| No eval, or only “does it feel useful” | Recall@k **and** faithfulness; golden set |
| Full rebuild / insert-only | hash incremental, cascade delete, model swap as a migration |
| Draw LangChain as production | Orchestration optional; service boundary is still ingest / retrieve / generate |

Body first answer uses this set. The fold only stops you from treating that one-box note diagram as the final draft.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **Why not pure vector?** → SKUs, proper nouns, exact phrases; BM25 supplies the sparse signal. hybrid is the default, not an advanced extra.
2. **Bigger chunks always better?** → No. Too large dilutes and citations go fuzzy; too small lacks context. Structure split + overlap; parent-child is the decoupling move.
3. **Why doesn’t rerank scan the whole corpus?** → cross-encoder is too expensive. Retrieve first, then a shortlist. That’s a latency/cost trade-off, not recommender ranking.
4. **How do you fuse scores?** → Don’t weighted-add BM25 and cosine. Use RRF (or the engine’s rank fusion).
5. **Can you overwrite when swapping embedding?** → No. The coordinate system changed; dual-write, backfill, cut over by version.
6. **Deleted the doc and you can still retrieve it?** → Chunks weren’t cascade-deleted by doc_id. ingest must be able to delete, not only upsert.
7. **A citation means no hallucination?** → No. Check the number lands in the retrieved set, and look at faithfulness.
8. **pgvector or a dedicated store?** → ~million-scale + same transaction as the row data → pgvector is often enough; larger, or independently scaled hybrid → dedicated engine (Ch31).
9. **Generation latency?** → Stream through the inference service (Ch29); this RAG layer caps rerank candidates and chunks into the prompt.
10. **Should you add Agent / MCP?** → This prompt is a retrieve + generate backend. The tool gateway is Ch33 — don’t let the prompt drift.`,
    },
    {
      id: "sec-next",
      headingEn: "What's next",
      bodyEn: `Close the page. Walk the 30-second open + two pictures (ingest / query). If you can explain **why chunking is the ceiling, why hybrid, how citation and a model swap work**, you pass.

Next prompt preview: **vector retrieval service** (HNSW / IVF / PQ, filtering, replication). This chapter calls it as a retrieval backend; the next chapter opens the box. The generation path is already Ch29.

Self-check: left column assumptions (corpus, SLO, citations, closed-corpus), middle two pipelines, right three deep-dive trade-offs.`,
    },
  ],
  reviewMdEn: `# Ch30 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | Design a RAG backend — 30-second open? | Retrieve + generate, not a vector-DB box. Ingest and query separate; hybrid (BM25+dense) + rerank after retrieval; answers carry a citation. Generation goes to the inference service. |
| 2 | What’s the hard part on this prompt? | Chunking quality, hybrid search, citation / eval / freshness. Not a recommender funnel, not tuning HNSW. |
| 3 | What should you clarify? | Doc type and update rate, latency SLO, citation or not, multi-tenant, web search allowed, language. |
| 4 | How do you open the estimate? | Docs → chunk count; dim × 4B for GB-class vectors; QPS you assume. Bottleneck is usually generation and rerank. |
| 5 | 2026 starting chunking? | Headings / recursive, 256–512 tokens, overlap about 10%–15%. Don’t fixed-cut mid-sentence. |
| 6 | Why overlap / parent-child? | overlap so the answer doesn’t sit on a boundary. Parent-child: retrieve small, prompt large — precision and context decouple. |
| 7 | Why must you hybrid? | Dense eats semantics; BM25 eats SKUs, proper nouns, exact terms. Pure-vector top-k is not the 2026 default. |
| 8 | What does RRF solve? | BM25 and cosine scores are not comparable. Fuse by rank; k=60 as a starting point. |
| 9 | Where does rerank sit? | After retrieval + fusion, on a shortlist (~50–200); cross-encoder or late interaction; keep 3–8 chunks for the prompt. |
| 10 | When is citation not decoration? | Chunks have stable ids; the model may only cite this turn’s retrieved set; drop invented numbers; no evidence → say you don’t know. |
| 11 | Eval — which two layers? | Retrieval: Recall@k / MRR / nDCG. Generation: faithfulness (RAGAS etc.) + whether the cite is real. |
| 12 | Doc update / delete? | Hash incremental; if it changed, delete old chunks then write. Deletes cascade by doc_id. Periodic full reconcile. |
| 13 | Swap the embedding model? | New coordinate system: dual-write, backfill, check, atomic cutover. Don’t mix-search two vector sets. |
| 14 | pgvector vs a dedicated store? | Under ~a million, same transaction as row data → pgvector. Larger / independently scaled hybrid → dedicated engine (Ch31). |
| 15 | Boundary vs Ch29 / Ch31? | Generation and KV in Ch29; HNSW/IVF/PQ in Ch31. This chapter is retrieve + stitch the prompt + citation. |`,
});
