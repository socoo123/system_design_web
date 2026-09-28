import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch31",
  titleEn: "Vector search service",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 50–70 min ｜ **Prereq**: Ch30 RAG as the caller; Ch03 back-of-envelope
> **Goal**: land the vector **storage engine**: HNSW / IVF / PQ, filtering, replica/shard. Skip RAG chunking/generation.

When they say “design a vector store / ANN service,” they are not scoring Milvus / Qdrant / Pinecone SKUs, and they are not asking you to redraw Ch30’s RAG pipeline.

**Who calls this API:** the RAG backend (Ch30) sends an **already-computed query vector** and a metadata filter; this chapter returns top-k id + score. Chunking, hybrid fusion, rerank, citation, LLM generation are not on this whiteboard.

The **hard part** is three pieces: **index choice** (HNSW vs IVF-PQ / DiskANN-class), **filtered ANN** (how metadata and the approximate graph walk together), **replica / shard / ingest consistency** (when is a write searchable after WAL). Drawing a “vector DB” box and then being unable to talk those three is a red flag.

This chapter’s boundary:

- **RAG chunking / hybrid / generation** → already Ch30; here you only point at the caller
- **Multi-model routing, semantic cache, billing** → preview Ch32
- **Skip** recommenders, two-tower, ranking

M5 hard rule: **LLM + Agent infra only. No recommender funnel.** Vendor names are examples of a mechanism at most; talk architecture as **HNSW graph / IVF list / PQ code**.`,
    },
    {
      id: "sec-pitch",
      headingEn: "How to answer in the interview (30 seconds)",
      bodyEn: `Don’t open by drawing 20 boxes, and don’t read a hosted vector-DB price sheet. Land the scoring signal first: this is an **ANN storage engine**, and the hard part is not the logo.

> “This is a vector **search service**, not RAG. The caller sends an embedding and a filter; I do **ANN + payload filter**, return top-k. Tens of millions, RAM is enough → default **HNSW**; memory is the bottleneck → **IVF+PQ or DiskANN-class**. Filtering is the part that’s actually hard in production. QPS is **replica**; data volume is **shard**. Writes go to WAL first. ANN is approximate; visibility can still be eventual — don’t mix those two.”

How the 4 steps fill in:

${D2}

| Step | What it maps to on this prompt |
|---|---|
| Step 1 clarify | Vector count / dim, p95, how strict the filter is, streaming writes vs batch build, searchable immediately, multi-tenant |
| Step 2 high-level | query: client → query svc → index replica (filter + ANN); ingest is a second picture |
| Step 3 deep dive | ① HNSW vs IVF-PQ ② filtered ANN ③ replica / shard / WAL |
| Step 4 wrap-up | recall@k vs latency, RAM full, filter punching through recall, replica lag, observe ingest lag |

**red flag:** walking RAG chunking/generation again; opening a two-tower recommender; saying “SQL filter then exact kNN” as a hundred-million-scale plan; locking to one vendor; quoting some company’s internal QPS.`,
    },
    {
      id: "sec-clarify",
      headingEn: "Clarifying questions",
      bodyEn: `Drawing an HNSW cluster before you asked scale and filtering = Jimmy. About 6–8 questions; assume the rest and write the board.

| You ask | Why you ask | Typical assumption (when they say “you pick”) |
|---|---|---|
| How many vectors? Dimension? | Directly decides whether float32 + the graph fit in RAM | **10M–100M** vectors, **768-dim** |
| Latency SLO? p95 in milliseconds? | Sets ef / nprobe, and whether you quantize then rescore | Interactive retrieval **p95 < 20–50 ms** (embedding not included) |
| Almost every query carry a **metadata filter**? How strict? | filtered ANN is the real hard part on this prompt | Yes; common tenant / time window, sometimes very tight |
| Writes: streaming incremental, or nightly full rebuild? | HNSW eats insert; IVF centroids drift; classic DiskANN is more static | **Streaming upsert**; deletes must become unsearchable |
| Searchable immediately after insert? | WAL durable ≠ appearing in ANN right away | Default **second-level visibility** (bounded), not linear across replicas |
| Multi-tenant: separate collections or a payload filter? | Isolation is safer and more expensive; filter saves machines, leak risk | **tenant_id filter** first; hard isolation → split collections |
| Who is the caller? | Nail the boundary so you don’t draw RAG | **RAG backend (Ch30)**; vectors already computed |

How to say it:

> “I’ll assume 768-d, tens of millions to a hundred million, every query with a tenant filter, streaming writes, second-level visibility, caller is RAG. RAM enough → HNSW first; if not, quantize or DiskANN-class. Does that direction look OK?”`,
    },
    {
      id: "sec-estimate",
      headingEn: "Back-of-the-envelope (don’t fake precision)",
      bodyEn: `This prompt’s back-of-envelope is so the interviewer hears: **memory is the first bottleneck**, not a “vector-DB QPS slogan.” Don’t invent some company’s internal numbers.

Teaching assumption (write the board): **100 million × 768-dim × float32**.

> 100M × 768 × 4 B ≈ **300 GB** raw vectors. HNSW still stores graph edges, commonly another small multiplier (depends on M). One “memory box” doesn’t hold it — that’s why the interview forks by default.

| Scale (768-dim, teaching) | float32 vectors | How you open it |
|---|---|---|
| 1M | ~3 GB | Single-box HNSW is easy; even pgvector is often enough |
| 10M | ~30 GB | Fat box + HNSW; or SQ8 to cut another slice |
| **100M** | **~300 GB** | RAM is the bottleneck; PQ / DiskANN-class / shard |
| 1B | ~3 TB | Must compress + on-disk graph + shards; don’t talk pure-RAM HNSW |

Quantization order of magnitude (same 100M × 768):

| Encoding | Rough size | The interview sentence |
|---|---|---|
| float32 | ~300 GB | Upper bound, as a control |
| **SQ8 / int8** | ~75 GB | **~4×**, recall barely drops, often the first cut |
| PQ (aggressive code) | GB-class codes | 8–32× is common; you train a codebook, recall drops more |

HNSW graph edges, ID mapping, payload inverted index all add another bill. Saying “write 300 GB on the board first, then decide quantize vs swap the index” scores higher than “a hundred million is fine.”

### Where QPS forks

Assume yourself: **read 100–500 QPS**, writes much smaller than reads (write that it is an assumption).

- **replica** spreads read QPS and does failover
- **shard** spreads **data volume**; query is scatter-gather; too many shards can make p95 worse — not free speedup
- Filter-free HNSW is often not the bottleneck; **tight filter + high recall@k** is what blows latency

Hot-query results can sit in a short-TTL cache (mental model Ch38). That is not “semantic-cache the whole LLM answer” (Ch32). Point at it and move on.

How to say it:

> “100M × 768 float32 is about 300 GB. RAM enough → HNSW; if not, SQ8 first, then IVF-PQ or DiskANN-class. QPS I assume a few hundred reads; add replicas, don’t blindly add shards.”`,
    },
    {
      id: "sec-arch",
      headingEn: "High-level architecture",
      bodyEn: `Get buy-in: **query and ingest are two pictures**. Don’t dump chunking, GPU, LangChain, and HNSW knobs into one 20-node final diagram.

The caller (Ch30 RAG or another retrieval service) already computed the embedding. This chapter only sees: vector, top_k, filter, consistency.

### query path

${D2}

**This diagram cites**: storage choices (Ch37), replication and sharding (Ch41). The client is the RAG backend (Ch30), not a browser user. The replica does **payload filter + ANN** together — don’t draw an exact full-corpus scan first. Hot-result cache points at Ch38.

query svc is stateless: auth, pick collection, pick consistency, scatter-gather merge. **State lives on the index replica** (graph or IVF lists in RAM / mmap / SSD).

Step 2 can volunteer endpoints (bonus; no schema needed):

- \`POST /v1/vectors/search\` (vector, top_k, filter, consistency)
- \`POST /v1/vectors/upsert\`
- \`POST /v1/vectors/delete\`
- optional \`GET /metrics\` (sampled recall@k, p95, ingest lag, filter hit rate)

How to say it:

> “The read path is query svc hitting an index replica; filter and ANN happen together inside the engine. Writes take a separate WAL path. If that direction is OK, I’ll dig into the index, filtering, and replication.”`,
    },
    {
      id: "sec-index",
      headingEn: "Deep dive ①: HNSW vs IVF-PQ",
      bodyEn: `2026 interview default (conclusion first, then mechanism):

- **HNSW**: roughly **< 10M–50M** vectors, graph still fits in RAM → **first answer**. Low latency, incremental insert is natural.
- **IVF+PQ / DiskANN-class**: memory is the bottleneck, or you are past a hundred million → compress, or put the graph on SSD. Don’t still insist “pure-RAM HNSW on one box” at 100M float32.

Numbers are order of magnitude, not law. Extra-fat RAM can stretch HNSW; very tight filters sometimes walk IVF more cleanly. Speak from the estimate.

${D2}

### One sentence per mechanism

**HNSW**: multi-layer small-world graph. Upper layers are sparse long hops; lower layers are dense local search. Query walks greedily top-down. Interview knobs — remember three: **M** (edges per node, often start at 16), **ef_construction** (candidate width while building), **ef_search** (query width — **tune this first** for recall vs latency). The graph almost has to be hot in RAM; jumping HNSW on cold pages hurts.

**IVF**: k-means cuts the space into lists (inverted file). Query finds the nearest few centroids, then only scans those lists. **nlist** is set at build; **nprobe** is set at query — nprobe is the recall vs latency knob. Building needs a batch of data to compute centroids; if the distribution drifts you **rebuild**. That’s the biggest ops gap vs HNSW.

**PQ**: split the vector into m subvectors; each subvector becomes a short code from a codebook. Distance is a table lookup. **OPQ** learns a rotation first so variance is more even across segments; same compression, usually better recall. Production often **PQ for coarse search, original vectors to rescore a shortlist**.

**SQ8 / int8**: per-dimension quantization, about **4×** compression, recall barely drops — safer than opening with PQ. **DiskANN-class** (Vamana graph + SSD): PQ codes in RAM for navigation, full-precision vectors on disk. Classic implementations are more static; **FreshDiskANN**-class adds streaming insert/delete.

| | HNSW | IVF-PQ | DiskANN-class |
|---|---|---|---|
| Memory | High (graph + vectors) | Low (codes + a few lists) | Small RAM, SSD carries volume |
| Latency | Usually lowest (fully hot) | Medium; depends on nprobe | Low–medium, eats NVMe |
| insert | Add a point on the graph, friendly | Centroids drift, need rebuild | Classic needs rebuild; Fresh can stream |
| Scale intuition | Tens of millions in RAM | Mid-to-large when RAM is tight | Hundreds of millions that don’t fit RAM |

Starting knobs (public defaults as a starting point, not magic): HNSW \`M=16\`, move **ef_search** first. IVF nlist is often on the order of **sqrt(N)**; move **nprobe** first. No golden-set recall@k → don’t verbally claim “I already tuned it.”

Vendors are a control, **not architecture**:

| Mechanism | Where you might see it (examples) |
|---|---|
| RAM HNSW | Qdrant / Weaviate default; pgvector HNSW; Milvus has it too |
| IVF-PQ | FAISS family, Milvus IVF_PQ |
| DiskANN-class | Milvus DiskANN; Postgres ecosystem has StreamingDiskANN-class |
| Same transaction as the row | **pgvector** (million-scale often enough; don’t force it past that) |

How to say it:

> “If it fits in RAM, HNSW, and ef_search trades recall. If not, SQ8 first, then IVF-PQ or DiskANN-class. IVF means you accept centroid rebuilds. Don’t make exact kNN the hundred-million default.”`,
    },
    {
      id: "sec-filter",
      headingEn: "Deep dive ②: metadata filter + ANN",
      bodyEn: `Filter-free ANN is a homework problem. Production almost always carries **tenant / time / status / ACL**. **filtered ANN** is the real hard part at scale on this prompt: a filter can cut graph connectivity, and it can empty the IVF lists you were supposed to probe.

${D2}

Three mechanisms (talk selectivity, don’t recite product names):

| | What it does | When it still works | Crash |
|---|---|---|---|
| **pre-filter** | Inverted / bitset first → allowed set, then search only inside it | Allowed set is **tiny** → brute force on the subset is great | Allowed set still millions → degrades into a disk scan |
| **post-filter** | ANN first for top-(k×N), then drop mismatches | Filter is **very loose** (most points pass) | Filter is **very tight** → nothing left in top-k, recall punches through |
| **in-graph / hybrid** | Skip failing points while walking HNSW, or expand two-hop neighbors; planner cuts between brute and graph by selectivity | Production default should lean here | Treating “filter = a WHERE and you’re done” with no connectivity talk |

**Tight filter** (few points pass, e.g. one tenant is 0.1%): post-filter must **oversample** (inflate k), and latency and recall both rot; pre-filter then exact-scan a small set is often cleaner.

**Loose filter** (most points pass): pre-filter barely shrinks the search space — you paid a scalar retrieval for nothing.

Graph indexes have a structural issue: HNSW edges connect **vector neighbors, not tenants**. Filter out a point on the path and greedy search walks into a dead end. Public directions:

- **ACORN**-class (paper *ACORN: Performant and Predicate-Agnostic Search…*; Weaviate made ACORN the default filter strategy from some version): predicate-agnostic, uses **two-hop neighbors** to keep the walk viable; more stable on low-correlation, tighter filters.
- **Filterable HNSW** (Qdrant-class): payload inverted index + constrained graph walk; planner cuts between brute and graph by selectivity.
- IVF: after filtering some lists are almost empty — raise nprobe or accept recall holes. At high filter ratios IVF can be easier to talk than a pure graph, but you still measure.

Payload needs a **scalar index** (inverted / columnar / bitset). Don’t full-table-scan metadata every time. Multi-tenant via filter instead of physical isolation: default assumption is the engine **will not** leak another tenant into top-k — that’s correctness, not an optimization.

One filtered search:

${D2}

**This diagram cites**: storage choices (Ch37) — the vector index and the scalar inverted index are two structures, hit in one query.

How to say it:

> “Filtering is not WHERE after search. Tight filter + post-filter misses; loose filter + pre-filter is a wasted scan. Default talk is a planner: tiny allowed set → brute; otherwise a constrained graph (ACORN / filterable HNSW-class). Measure recall@k on a set that has the real filter.”`,
    },
    {
      id: "sec-scale",
      headingEn: "Deep dive ③: replication, sharding, ingest",
      bodyEn: `Don’t invent a new CAP for a distributed vector engine. **replica adds read QPS and failover; shard cuts data volume.** Sharding early is over-engineering.

${D2}

| | replica | shard |
|---|---|---|
| What it solves | Read throughput, availability | One box can’t hold RAM/disk |
| query | Hit one replica | **Broadcast** to relevant shards, each returns local top-k, coordinator **merges** |
| Cost | Another copy of memory; sync vs async | Network fan-out; too many shards make p95 worse |
| red flag | Adding replicas as if that were “data scale-out” | Adding shards as if that were “QPS scale-out” |

Shard key like **hash(id)** so each shard is still a random subset of the global vector space. **Sharding by semantics / category** puts neighbors on another shard and ANN is just wrong — unless the query can route exactly and you accept that cross-category is unreachable.

Merge is cheap (compare \`k × shard count\` rows). What’s expensive is **every shard running ANN once**. Shard count follows the memory budget (one shard’s hot data + graph < ~70% RAM). Don’t open with 64 shards for show.

### ingest: WAL → growing → sealed

embedding is **already computed upstream** (Ch30 ingest). This chapter starts at “one upsert that already has a vector.”

${D2}

**This diagram cites**: replication, sharding, logs (Ch41). WAL means a crash doesn’t lose the write; **searchable** is the next stage.

Public engines differ in detail (Milvus-class shared-storage vs Qdrant/Weaviate-class workers owning the full lifecycle); the mechanism is shareable:

1. **Append WAL first** (local disk, or Kafka/Pulsar, or object-store WAL) — durability
2. **growing segment**: new data in a memory buffer; searchable, often brute or a tiny temp index
3. Size / count hits a threshold → **seal**, build HNSW / IVF / DiskANN in the background, then queries hit the read-only segment
4. **delete** = tombstone in the WAL, skip at search, compact later. Upsert-only with no delete is a correctness bug

| Visibility you promise | Meaning | trade-off |
|---|---|---|
| **Strong** | Read waits until this WAL entry is ingested into a searchable structure (or a sync replica ack) | Write latency is high; “insert returns → searchable” is expensive |
| **Bounded / eventual** | Allow second-level lag | Throughput is good; common default for a RAG knowledge base |

Don’t mix two things: **ANN recall@k** (approximate neighbors) and **consistency** (did the read see the latest write). You can “strongly consistently return an approximate top-k.” Splitting them unprompted is bonus.

Streaming vs rebuild:

- HNSW: you can keep adding points; deletes are tombstones first, the graph only shrinks after compact
- IVF: inserts can still land in a list; **centroids go stale** → periodic rebuild
- Static DiskANN: large increments usually mean rebuild; FreshDiskANN-class treats streaming as a first-class citizen

Swap the embedding model = swap the coordinate system. New collection / new named vector. **Don’t** mix two dims in one ANN — Ch30 already said this; the engine’s job is not letting an upsert land in the wrong index.

How to say it:

> “Replicas for QPS, shards for volume, query is scatter-gather. Writes WAL → growing → sealed. Default bounded visibility. Keep ANN approximation and ‘read the latest write’ as two sentences. Deletes need a tombstone.”`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs early “single-node FAISS”",
      bodyEn: `<details>
<summary>Single-node FAISS, build offline then search — how you answer now</summary>

Xu-generation books have **no** vector-search-service chapter. Early engineering default was often: build FAISS IVF-PQ once in Python, pickle to disk, load in-process, no filter, no replica. That’s lab retrieval. **It is not 2026 body copy.**

| Then / early engineering | How you answer now |
|---|---|
| Single-node FAISS, full rebuild | Online service: WAL + growing/sealed; HNSW incremental |
| No talk of filtering | **filtered ANN** is the hard part; pre / post / in-graph |
| Exact kNN or “approximate is fine anyway” | Declare a **recall@k SLO**, measure on a golden set that has the filter |
| RAM tight → add machines running HNSW | **SQ8 / PQ** first, then DiskANN-class, then shard |
| One vendor logo = architecture | Mechanism: graph, IVF list, PQ code, replica vs shard |
| insert returns = searchable immediately | Durability and visibility are separate; default bounded |
| Same 20-node picture as RAG | This chapter is the storage engine only; caller is Ch30 |

Body first answer uses this set. The fold only stops you from treating “import faiss” as the final draft.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **Why not exact kNN?** → Hundred-million-scale O(n) doesn’t scan. ANN trades recall@k for latency; declare an SLO, don’t verbally say “close enough.”
2. **Can you just add machines for HNSW?** → Compute 100M × 768 float32 ≈ 300 GB first. Memory is the bottleneck → quantize or DiskANN-class, not pile RAM blindly.
3. **Why does IVF need a rebuild?** → Centroids are k-means on old data; if the distribution drifts, lists no longer represent the space. HNSW has no global centroid layer.
4. **Is PQ free compression?** → You train a codebook; recall drops; common pattern is PQ coarse search + original-vector rescore. SQ8 is usually the safer first cut.
5. **Why is filtering hard?** → Graph edges don’t grow along the predicate. Tight post-filter misses recall; loose pre-filter is a wasted pass. You need in-graph / a planner.
6. **Will a multi-tenant filter leak?** → Treat it as correctness: engine-side constraint, not “search then drop in the app.” Hard isolation → split collections.
7. **Do more shards raise QPS?** → Not necessarily. scatter-gather runs ANN on every shard. QPS: add **replicas** first.
8. **Write succeeded, why can’t I search it?** → WAL is durable, growing isn’t visible yet, or the replica is async. They’re asking consistency, not a broken disk.
9. **Deleted, still a hit?** → No tombstone / no compact. upsert-only is a red flag.
10. **Isn’t this just RAG?** → No. Chunking and generation are Ch30. This chapter is the ANN engine. Next is the gateway in Ch32 — don’t let the prompt drift.`,
    },
    {
      id: "sec-next",
      headingEn: "What's next",
      bodyEn: `Close the page. Walk the 30-second open + two pictures (query replica, WAL ingest). If you can explain **when HNSW, when IVF-PQ/DiskANN, why filtering is hard, replica vs shard, WAL visibility**, you pass.

Next prompt preview: **LLM API gateway** (multi-model routing, rate-limit/billing, semantic cache, fallback). This chapter is the retrieval engine; the caller RAG is already Ch30.

Self-check: left column assumptions (count, dim, SLO, filter, visibility), middle read/write two chains, right three deep-dive trade-offs.`,
    },
  ],
  reviewMdEn: `# Ch31 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | Design a vector search service — 30-second open? | ANN storage engine, not RAG. HNSW when RAM is enough; RAM tight → IVF-PQ / DiskANN-class. hard part: filtering + replica/shard + visibility. |
| 2 | What’s the hard part on this prompt? | ① HNSW vs IVF-PQ ② filtered ANN ③ replica / shard / WAL consistency. Not chunking, not two-tower. |
| 3 | What should you clarify? | Count and dim, p95, how strict the filter is, streaming vs rebuild, searchable immediately, multi-tenant, who calls. |
| 4 | How big is 100M × 768 float32? | ~300 GB raw vectors. HNSW graph adds another slice. That’s the teaching anchor for the memory bottleneck. |
| 5 | When HNSW, when IVF-PQ? | Tens of millions, RAM enough → HNSW. RAM tight or hundred-million-scale → IVF-PQ or DiskANN-class. |
| 6 | Which HNSW knob first? | **ef_search** trades recall vs latency. M / ef_construction are build cost. |
| 7 | What does IVF nprobe do? | How many lists you probe at query. Raise nprobe → raise recall, raise latency. Centroids drift → rebuild. |
| 8 | SQ8 vs PQ? | SQ8 ~4×, recall barely drops, first cut. PQ is more aggressive, needs a codebook, often with rescore. OPQ rotates first. |
| 9 | What does DiskANN-class solve? | Graph designed for SSD: PQ codes in RAM, full precision on disk. FreshDiskANN adds streaming updates. |
| 10 | pre-filter vs post-filter? | Filter first: tiny allowed set → brute is good, large → becomes a scan. ANN then drop: loose filter works, tight filter misses recall. |
| 11 | ACORN / in-graph filter? | Skip failing points while walking; two hops keep connectivity; predicate-agnostic. Production shouldn’t rely on post-filter only. |
| 12 | replica vs shard? | replica spreads QPS and failover. shard cuts volume; query is scatter-gather. Don’t mix them up. |
| 13 | Why not shard by semantics? | Neighbors may sit on another shard; ANN can’t recall them. Use hash(id) so each shard is a random subset. |
| 14 | Why still unsearchable after WAL? | Durable ≠ visible. growing hasn’t caught up, or the replica is async. Strong vs bounded is the trade-off. |
| 15 | Boundary vs Ch30? | Ch30 chunks / hybrid / generates and calls this API. This chapter does not walk the RAG pipeline. Next is Ch32 gateway. |`,
});
