import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch37",
  titleEn: "Storage choices",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 90–120 min ｜ **Prereq**: Ch06 KV/LSM; Ch36 CAP grid
> **Goal**: how to pick relational / KV / document / columnar / graph / object / time-series / vector; B+Tree vs LSM. Vector engine details go back to Ch31. This is not an AWS shopping trip.

This is **M6's second foundation chip**, not another 4-step design problem. Ch36 tells you AP vs CP; this chapter tells you **how the model and the engine plug into that grid**. On the spine, short URL, search, video, drive, and KV all touch "which store"—here we make the choice language precise. Design problems just cite it; they do not turn the whiteboard into a shopping lecture.

**One line:** ask the access pattern first, then pick the model. Need **transactions + join + constraints** → relational is the default, not "SQL is old so we switch to NoSQL." Engine: **B+Tree (read-optimized) vs LSM (write-optimized)**. Wide-column, analytic column-store, object, and vector are four different things. Do not call them all "columnar."

Three hard parts (the pieces worth digging):

1. **Access pattern decides the model** — point lookup / range / join / scan / multi-hop / ANN, before product names
2. **B+Tree vs LSM** — read-optimized vs write-optimized; the compaction tax; how to open write amplification / read amplification
3. **Don't mix wide-column vs analytic column-store vs object vs vector** — Cassandra is not ClickHouse; a blob is not a vector

This chapter **does not cover**: cloud-vendor SKU catalogs, isolation-level encyclopedia (that's **Ch41**), block/file/object as a hardware spine, re-teaching Ch06 quorum / hinted handoff / vector clocks as a whole chapter, re-teaching Ch31 HNSW / IVF as a whole chapter, GNN, HTAP / NewSQL trade-show tours, Mongo vs PG flame wars, K8s YAML. NewSQL gets one line: "the SQL + distributed consensus line exists." Vector clocks stay folded; production conflict default is **LWW** (already in Ch06).`,
    },
    {
      id: "sec-pitch",
      headingEn: "One-line definition · 20-second interview open",
      bodyEn: `First put the scoring signal on the table: you pick by access pattern, not by posters and brands.

> "Storage: ask **how you read and write** first, then pick the model. Need transactions, join, FKs/constraints → **relational is the default**, not because SQL is old. Just \`get/put\`, sessions, a cache-aside partner → **KV** (Ch06). JSON shape is still moving → **document**, but schema still lives in the app. Write-heavy wide rows → **wide-column + LSM**. Analytic column scans → **column-store OLAP**, don't mix it with wide-column. Multi-hop paths are when you reach for a graph; blob / video / backups go to **object**, metadata is often still relational. Time-series is append + downsample, not a general-purpose store. RAG / ANN is when you reach for vectors; engine details in Ch31. Engine: stable point lookups, OLTP → **B+Tree**; write throughput, AP KV → **LSM**, compaction is the tax."

The whole chapter walks this one chain. Say the 20 seconds, then stop. Let the interviewer decide whether to dig into the choice, the engine, or "don't mix them."

${D2}

This figure cites: Ch06 key-value store · Ch36 CAP grid (how the model plugs into AP/CP)

| Interviewer ask | Where you land |
|---|---|
| "What database for this problem?" | Ask **point / join / scan / ANN** first; then name the model |
| "Is SQL too old?" | Need transactions + join + constraints → still the default; not a vintage question |
| "Aren't Cassandra and a warehouse both columnar?" | **Wide-column LSM ≠ analytic column-store**; object and vector are separate |
| "What about the engine?" | Tight read latency → B+Tree; write-heavy → LSM + compaction tax |

**red flag:** leading with a cloud product name; drawing a follow graph and jumping to Neo4j; calling Cassandra and column-store OLAP the same "columnar"; stuffing blobs into KV; standing up a dedicated vector cluster for RAG before you've asked about scale.`,
    },
    {
      id: "sec-access",
      headingEn: "Mechanism · access pattern decides the model",
      bodyEn: `First hard part. **In a 2026 interview, being able to recite eight databases is worse than knowing how to ask the access pattern.** The model is the answer to the query shape, not a shopping list.

${D2}

This figure cites: Ch06 point lookup · Ch31 ANN (join defaults to relational; scan is not wide-column)

The questions are this chain: is this path a **single key**, a **range**, a **multi-table join**, a **scan of lots of columns for aggregation**, **a few hops on a graph**, or **high-dimensional nearest neighbor**? Once you answer, the model is almost decided. Underneath, you can say "block storage for the DB disk, file share for mounts, object for blobs"—**that is not this chapter's table of contents**.

${D2}

The figure only pins the four OLTP cells (side by side, so four groups don't stack into a tower). Graph, object, time-series, and vector get paragraphs below.

### Relational: the default when you need transactions + join + constraints

Orders, inventory, payment ledgers, drive directories—need **atomic commit, cross-table consistency, unique/FK constraints**, first answer is still a relational store. Not "SQL is old so we switch." Don't lecture isolation levels: production's common default is **SI / MVCC** (PostgreSQL's default line; MySQL InnoDB is also an MVCC main path). Dirty-read / phantom-read comparison tables go to **Ch41**.

| How to open it on the board | One line and stop |
|---|---|
| Default isolation | **SI / MVCC**: reads don't see uncommitted; write conflicts use versions / locks |
| Need Serializable | The cost is throughput; money-related paths can discuss it, don't default the whole site |
| Read Uncommitted | Almost never pick it in interviews; don't sell it as an "optimization" |

Sharding, cross-DB transactions, Saga / Outbox are **Ch41**. NewSQL (SQL interface + distributed consensus) **exists**, used to answer "I still want SQL and I want to scale out"—don't turn it into a product tour.

### KV: point get/put, sessions and a cache-aside partner

\`get(key)\` / \`put(key, value)\`, value is small. Sessions, carts, short-URL maps (**Ch09**), high-QPS point lookups. The AP-line mechanisms are already in **Ch06** (quorum, LWW, LSM write path)—this chapter only answers **when to pick it**: no join, no cross-key transactions as the source of truth. It also often sits in front of a relational store as a **cache-aside** partner (unpacked in **Ch38**), not a second ledger. Redis Cluster is a different product (hash slot + primary); don't draw it in the same box as Dynamo-style AP KV.

### Document: JSON is moving, not "schema forever gone"

Nested documents, fields forking by tenant/category, fast evolution → document model fits. **Schemaless is not a license:** constraints moved from the store into the app, so dirty data is easier to ingest. Later validation / optional schema is the honest story: a "soft schema." If you really need frequent joins across collections, you actually want relational. Multi-document transactions exist in plenty of engines now; still don't treat a document store as universal OLTP.

### Wide-column: write-heavy, sparse wide rows (Cassandra style)

Partition key + clustering key; a row can be very wide and sparse; writes are append-friendly; the engine is almost always **LSM**. Fits time-ordered wide tables, scanning **columns inside this row** by primary-key range. Intra-row atomicity is common; **cross-row ACID is not the selling point**. Don't treat it and analytic column-store as one "columnar"—the don't-mix table in the next section splits them.

### Graph: the reason is multi-hop, not that the board has "follows"

\`user follows user\` one hop, two hops: a relational join / closure table is often enough. The reason to pick a graph store is **repeated multi-hop, paths, variable-length traversal** that turns join into a bottleneck. Don't write Neo4j because you drew two circles and an edge. GNN / graph neural nets are **not this chapter**.

### Object: blobs; metadata still often goes relational

Video source and chunks (**Ch14**), drive blocks (**Ch15**), backups, static assets—immutable bytes go to object storage; directory, ACL, duration, version numbers go to a small store. **The dedicated chapter is Ch22.**

${D2}

This figure cites: Ch14 video · Ch15 drive · Ch22 object storage

Say the order clearly: **land the bytes first, then commit metadata**—the store must not point at an object that doesn't exist yet. The API does not proxy GB. Block storage / file storage get one line: DB disks commonly mount a block device; a shared directory across machines is file; object is HTTP-semantic blob, not a POSIX disk.

### Time-series: append + downsample, not a general-purpose DB

Metrics, IoT, monitoring: almost only append, aggregate by time window, downsample, expire. A dedicated TSDB's value is compression, retention policy, partition by time. Don't store orders in it. Cassandra can stuff "wide rows that look a bit like time-series"; still not a time-series engine.

### Vector: pick it only if you have ANN / RAG; when vs pgvector vs don't

The query is "the k most similar to this embedding" before you need a vector index. Details (HNSW / IVF / filtering) **live in Ch31 as a whole chapter**; here we only pin **when**:

| | Pick it | Don't pick |
|---|---|---|
| **pgvector-class** | Data already in a relational store, millions of rows, need to join with the row | Hundreds of millions of float32 + strict filtering as the main path |
| **Dedicated vector service** | ANN *is* the product; scale/filter/replicas are the bottleneck (Ch31) | Standing up a cluster before you've asked how many rows |
| **Don't use vectors** | Exact id, keywords, SQL LIKE | Dressing inverted index (Ch13) or KV as "semantic" for show |

How to say it in the interview:

> "I ask the access pattern first. Ledger → relational; short URL → KV; video bytes → object + metadata relational; no multi-hop → no graph; no ANN → no vector. I split wide-column and analytic column-store."`,
    },
    {
      id: "sec-engine",
      headingEn: "Mechanism · B+Tree vs LSM",
      bodyEn: `Second hard part. Ch06 already drew **WAL → memtable → SSTable**; this chapter needs you to **derive the trade-off**, not recite the chain again.

${D2}

This figure cites: Ch06 key-value store (write path was covered there; here we dig into amplification)

**B+Tree (read-optimized default):** data lives in pages, lookup walks root to leaf, height is usually small, point lookups and ranges (leaf nodes are ordered and linked) are both stable. Updates are **in-place page writes** + **WAL** for crash safety. Random page writes are the cost: changing 100 bytes can still flush a whole page. InnoDB / PostgreSQL indexes are this family. Fits OLTP: tight read latency, transactions, lots of in-place updates.

**LSM (write-optimized default):** the hot path does not mutate old pages. Writes go sequentially into the **WAL**, then into an in-memory **memtable**; when full, **flush** to an immutable **SSTable**. Background **compaction** merges files and drops old versions. Write throughput is high because disk is sequential append. Cassandra / RocksDB / LevelDB family. Ch06's AP KV node's interior default is this.

${D2}

This figure cites: Ch06 key-value store (compaction is spoken; the figure only draws the hot path)

### Derive: write amplification, read amplification, compaction tax

**Write amplification:** the user writes 1 byte; how much actually hits disk.

- B+Tree: WAL records one entry + dirty page flush. Pages are much larger than rows → already some amplification; but **no** "the same key is merged through six levels" background rewrite.
- LSM: the same key flushes from memtable to L0, then compaction pushes it to deeper levels. More levels, larger inter-level fanout → **the same record gets rewritten many times**. That is the **compaction tax**: extra writes in exchange for fewer files and cleaner reads.

So "LSM writes fast" means **hot-path throughput** (sequential + memory), **not** low write amplification. Collapsing those two phrases into one sentence is a red flag. Ch06's teaching capacity also multiplies in a slice of space amplification—multiple versions occupy disk before compaction.

**Read amplification:** how many files / pages a point get touches.

- B+Tree: about tree-height page reads, predictable.
- LSM: memtable + several SSTables. More files, more pain. **Bloom filter** in one line: if the filter says "not in," this SSTable **can be skipped** (no false negatives); if it says "maybe in," you open the file (false positives allowed). Compaction trades write amplification for read amplification: after merge, fewer layers to check.

| | **B+Tree** | **LSM** |
|---|---|---|
| Write hot path | Mutate page + WAL, lots of random IO | WAL + memory, sequential IO |
| Read hot path | Tree-height lookups, stable | Multi-level + Bloom; high read amp before compact |
| Tax | Page-level write amplification | **compaction tax** + space amplification |
| Fits | OLTP, point/range, transactions | Write-heavy AP KV, wide-column ingest |
| Interview nail | Relational store's default engine family | Ch06 node's interior default |

Reads dominate, writes are rare, latency SLO is tight → don't put RocksDB as primary OLTP just because "internet companies use LSM." That's over-engineering (or a mismatch). Writes dominate, you can live with compaction spikes and briefly multi-level reads → LSM. Mixed load will twist the knobs onto compaction policy; on the board, point at "trade write amplification for read amplification" and stop—don't turn it into a tuning lecture.

How to say it in the interview:

> "B+Tree: stable reads, in-place page writes; LSM: sequential writes on the hot path, tax is compaction. Fast writes ≠ low write amplification. Reads skip files with Bloom. Short URL is read-heavy write-light—authoritative mapping can still be KV, but for the engine I'll ask the read:write ratio. If reads are extremely tight, it can be a B+Tree family."`,
    },
    {
      id: "sec-compare",
      headingEn: "Choice table: one master table + don't mix them",
      bodyEn: `Don't turn the whiteboard into a database trade show. The master table pins the model to the access pattern; the second table is specifically for the overloaded word "columnar."

| Model | Access pattern | Pick it because | Don't pick if |
|---|---|---|---|
| **Relational** | join, transactions, constraints | ledger, orders, metadata source of truth | only single-key, or blob-as-row |
| **KV** | point get/put | sessions, short URL, high-QPS point lookup (Ch06/Ch09) | you need join / cross-key transactions as source of truth |
| **Document** | nested JSON, forked fields | records whose shape is still moving | you want forever-zero schema, or heavy join |
| **Wide-column** | write-heavy, sparse wide rows, scan columns by PK | Cassandra-style ingest | you treat analytic table scans as this |
| **Graph** | **multi-hop** traversal | the path itself is the query | follow-graph within two hops (join is enough) |
| **Object** | large blob, write-once read-many | video/drive/backup (Ch14/15/22) | directory tree only in object, no metadata store |
| **Time-series** | append + downsample | metrics / IoT | as a general business store |
| **Vector** | ANN / RAG | similarity is the query (when: previous section; engine Ch31) | exact match, keyword search |
| **Inverted index** | term → documents | on-site search (Ch13) | as a general DB or a recs funnel |

Leaderboards (**Ch23**) are often: source of truth in a store, hot list as an ordered structure (ZSET-class) on the read path—that's **access pattern = range top-k**, not "buy another graph database."

${D2}

This figure cites: Ch22 object storage · Ch31 vector search (wide-column ≠ column-store OLAP)

| Don't mix | What you store | What the query is | Interview nail |
|---|---|---|---|
| **Wide-column LSM** | sparse rows, columns clustered by row key | point lookup / short range by partition key | Cassandra / HBase lineage; write engine is LSM |
| **Analytic column-store** | one column laid out continuously, good for compression | **scan columns to aggregate** (warehouse / OLAP) | Parquet, ClickHouse-class; **not** wide-column |
| **Object** | immutable bytes + object id | GET whole object or Range | metadata in relational; not "columnar" |
| **Vector** | embedding + optional payload | **ANN** top-k | pick it only if you have similarity; HNSW details back to Ch31 |

Calling Cassandra and Redshift / ClickHouse both "columnar" with no qualifier is this chapter's biggest vocabulary red flag. Wide-column's "column" is a dynamic column on a sparse row; analytic column-store's "column" is the same field stacked vertically for scans. Object has no "column." A vector index is not a B+Tree point lookup.

How to say it in the interview:

> "The master table fills by access pattern. For 'columnar' I ask first: write-heavy wide rows, or OLAP column scans. Object holds blobs, vector holds ANN. Inverted index is a search problem—don't stuff it into this shopping table as a ninth universal store."`,
    },
    {
      id: "sec-papers",
      headingEn: "Papers and classic systems",
      bodyEn: `M6 needs you to name papers. Below: 3 required, 2 optional. **The interview one-liner** is in the table; don't memorize page numbers, don't invent internal conclusions. The teaching chain is "AP KV → write engine → wide-column system," **not publication chronology** (LSM 1996 before Bigtable 2006 before Dynamo 2007).

${D2}

| | Paper | Required / optional | Interview one-liner |
|---|---|---|---|
| 1 | **DeCandia et al.**, SOSP 2007, *Dynamo: Amazon's Highly Available Key-value Store* | Required | **AP KV**: still put during a partition. The paper has sloppy quorum, **hinted handoff**, vector clocks. On the board, production conflict default is **LWW** (Ch06); don't turn the paper's full kit into an implementation spec |
| 2 | **O'Neil, Cheng, Gawlick, O'Neil**, 1996, *The log-structured merge-tree (LSM-tree)*, Acta Informatica | Required | Designed for high insert: memory component + disk component, **merge into sequential writes**. Reads can be more expensive. Ancestor of today's SSTable / compaction |
| 3 | **Chang et al.**, OSDI 2006, *Bigtable: A Distributed Storage System for Structured Data* | Required | Sparse, distributed, multi-dimensional sorted map; (row, column, timestamp) → bytes. tablet + **memtable / SSTable**. Wide-column lineage, **not** analytic column-store, not relational |
| 4 | **Stonebraker & Çetintemel**, ICDE 2005, *"One Size Fits All": An Idea Whose Time Has Come and Gone* | Optional | punchline: **the era of one engine for everything is over**; streaming, warehouse, OLTP split into specialized engines. Use it to close this chapter's choice |
| 5 | **Corbett et al.**, OSDI 2012, *Spanner: Google's Globally-Distributed Database* | Optional | **One line:** TrueTime exposes clock uncertainty, used for **external consistency** (commit order aligned with real time). Don't turn it into a Spanner chapter; CAP grid is in Ch36 |

The Dynamo paper can name hinted handoff (on failure, hand the write to another node, return it later)—**don't** re-do quorum hand-calc, Merkle, Gossip. That's Ch06 / Ch41. Vector clocks: the paper uses them to find causally concurrent versions; **2026 production default is LWW**, already nailed in Ch06.

Bigtable's SSTable lines up with the LSM paper: immutable sorted files + an in-memory table. HBase is this public lineage. Analytic column-store (C-Store / later column-store OLAP) is a different story—don't stuff it into the Bigtable one-liner.

Vector-index papers (HNSW etc.) are **not required reading for this chapter**—link **Ch31**.`,
    },
    {
      id: "sec-used",
      headingEn: "Which design problems use this",
      bodyEn: `Do the spine problems first; jump into this chapter when you get stuck. The back-links are not "finish M6 before you start writing."

${D2}

This figure cites: Ch06 / Ch09 · Ch15 / Ch22 · Ch30 / Ch31

| Chapter | The one line you'll use |
|---|---|
| **Ch06** KV | When to use KV; LSM inside the node; the B+Tree contrast is deepened in this chapter |
| **Ch09** short URL | \`code → url\` is a point get; KV + cache, no join needed |
| **Ch13** search | Inverted index is not a general-purpose store; body/object stored separately; index is term → posting |
| **Ch14** video | Bytes in object storage; metadata in a small store; API does not proxy GB |
| **Ch15** drive | Blocks go to object + CAS; directory/version go relational; blocks first, then commit |
| **Ch22** object storage | This chapter's object model unpacked (upload, metadata, consistency) |
| **Ch23** leaderboard | Hot list is an ordered top-k read path, not a graph store; authoritative scores can still live in a DB |
| **Ch30 / Ch31** | RAG is when you need vectors; dedicated engine vs pgvector "when" is in this chapter; HNSW back to Ch31 |
| **Ch18 / Ch24** | Orders/payments: relational default; don't use AP KV as the ledger |
| **Ch34** | Agent run state is a "point lookup by id + must persist" choice; don't pick a brand on the orchestration board |

Chat, Feed, comments: the timeline can be a wide table or KV; **accounts, permissions, money** still lean relational. Split by data. Don't run the whole site on one engine.`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs notes / the original book",
      bodyEn: `<details>
<summary>How the book / notes taught it then · AWS brand catalogs and "everything is columnar" go here</summary>

The notes map to the AWS book's two storage chapters: the block/file/object trio mapped onto cloud-disk SKUs, RDS/Aurora shopping, four NoSQL families + a string of product names. **That is not this chapter's body.** In 2026 you walk in with access pattern → model → engine.

| Book / notes | How you answer now |
|---|---|
| EBS / EFS / S3 / RDS / Aurora / DynamoDB tables as a catalog | **Block / file / object**; **managed relational / managed KV** as mechanism examples, not a shopping list |
| Five isolation levels as the spine | **One line: SI/MVCC default**; encyclopedia **Ch41** |
| File/block/object as this chapter's backbone | Object as a **model** for blobs; hardware class is not the TOC |
| CAP pick-two poster to choose a store | Grid is in **Ch36**; this chapter plugs in the model and the engine |
| Cassandra and Redshift both called "columnar" | **Wide-column LSM vs analytic column-store** must be split |
| Vector clocks as the conflict core | Can name the paper; production **LWW** (Ch06) |
| Dynamo paper as an implementation spec | Interview is AP KV + tunable consistency; name handoff and stop |
| Mongo vs PG who wins | Access pattern; no flame war |
| GNN / HTAP product tour | **Not this chapter**; NewSQL one line that it exists |
| No vectors / or only a managed vector SKU | **When** to use vector vs pgvector vs don't; engine Ch31 |

The body's first answer is this 2026 set. The fold only stops you from putting the cloud catalog and the word "columnar" on the board.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **"Why still use a relational store?"** → Need transactions, join, constraints. Not a vintage question. Don't use AP KV as the ledger of record.
2. **"How do you ask the access pattern?"** → point / range / join / scan / multi-hop / ANN. Answer those, then name the model.
3. **"Document stores don't need a schema?"** → Constraints live in the app. Dirty-data risk; not forever-zero schema.
4. **"Wide-column vs analytic column-store?"** → Sparse wide rows + LSM ingest vs columns laid out continuously for OLAP scan. Don't call both columnar.
5. **"Does a follow graph need Neo4j?"** → One or two hops: join. Multi-hop paths are the reason for a graph.
6. **"Why not put video in KV?"** → Blob is too big; object + a small metadata store. KV assumes a small value (Ch06).
7. **"Can a time-series store be the business DB?"** → No. Append + downsample is specialized.
8. **"When do you add vectors? Is pgvector enough?"** → Only if you have ANN. Already in PG, millions of rows, need join → pgvector. Hundreds of millions + filtering as the main path → Ch31 dedicated engine.
9. **"Which is faster, B+Tree or LSM?"** → Depends on read vs write. Stable reads: B+Tree; write throughput: LSM. Fast writes ≠ low write amplification.
10. **"What tax is compaction?"** → Background rewrites the same key many times, trading write amplification for fewer files and lower read amplification.
11. **"What does a Bloom filter do?"** → Says not in → skip that SSTable; no false negatives. Says maybe in → then you read disk.
12. **"How does the Dynamo paper resolve conflicts?"** → Paper: vector clocks / app merge; **production default LWW** (Ch06). Name hinted handoff, don't unpack it into a failure lecture.
13. **"Is Bigtable a warehouse?"** → No. Sparse wide table + tablet + SSTable. Analytic column-store is a different line.
14. **"What does One Size Fits All mean?"** → Stonebraker: one general-purpose engine for everything is outdated, which is why this chapter splits by access pattern.
15. **"Spanner in one line?"** → TrueTime + **external consistency**. Not unpacked in this chapter; CP grid in Ch36.
16. **"Isolation levels?"** → Default SI/MVCC. Don't sell Read Uncommitted as an optimization. Detail table in Ch41.`,
    },
    {
      id: "sec-next",
      headingEn: "What's next",
      bodyEn: `Close the page and walk it in 20 seconds: access pattern → model; when relational is the default; B+Tree vs LSM and the compaction tax; don't mix the four cells wide-column / analytic column-store / object / vector. If you can drop short URL, drive, and RAG into the grid, this chapter is done.

Next is **Ch38 · Cache & CDN**: aside / through / back, penetration / breakdown / avalanche, CDN. The storage chapter answers "where does the source of truth live"; the cache chapter answers "don't hit the source of truth on every hot-path request." Short URL's Redis, video's CDN, search's query cache all unpack there. Semantic cache points at Ch32—don't open it early.

Self-check: left column, three hard-part lines; middle, four rows of the master table (relational / KV / object / vector); right, B+Tree vs LSM, one tax line each. Don't recite cloud SKUs back.`,
    },
  ],
  reviewMdEn: `# Ch37 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | How do you open in 20 seconds? | Access pattern first, then the model. Transactions+join+constraints → relational default. KV for point lookup; document still has an app schema. Engine: B+Tree read-optimized / LSM write-optimized. Wide-column ≠ analytic column-store ≠ object ≠ vector. |
| 2 | Three hard parts? | ① Access pattern decides the model ② B+Tree vs LSM (compaction tax) ③ Don't mix wide-column / column-store OLAP / object / vector. |
| 3 | Which access-pattern classes do you ask? | point lookup, range, join, scan, graph multi-hop, ANN. Before product names. |
| 4 | When is relational the default? | Need **transactions + join + constraints**. Not "SQL isn't outdated so we settle." Ledger/orders/metadata source of truth. |
| 5 | Isolation levels in this chapter? | Default **SI / MVCC**. Encyclopedia in Ch41. Don't lecture five levels. |
| 6 | When KV? | High-QPS point get/put, sessions, short URL, cache-aside partner. No join. Mechanisms in Ch06. |
| 7 | Can a document store have no schema? | **Not as a license.** Constraints live in the app; dirty-data risk. Pick document when the shape is still moving. |
| 8 | Wide-column vs analytic column-store? | Wide-column: sparse wide rows + LSM write-heavy. Analytic column-store: columns laid out continuously, OLAP scan (Parquet / column-store OLAP). Don't call both "columnar." |
| 9 | When a graph store? | **Multi-hop paths** are the query. Follow-graph one or two hops: join. Don't pick it because the board has circles. |
| 10 | How do you split object and metadata? | blob → object storage; directory/ACL/version → relational. **Land the bytes first, then commit.** Ch14/15/22. |
| 11 | Is a time-series store a general-purpose DB? | **No.** append + downsample + retention. Don't store orders. |
| 12 | When vectors? pgvector vs dedicated? | Only if you have ANN/RAG. Millions of rows already in PG → pgvector. Hundreds of millions + filtering as the main path → Ch31. Exact match: no vectors. |
| 13 | B+Tree vs LSM in one line? | B+Tree: stable reads, in-place page writes. LSM: sequential writes on the hot path. Fast writes ≠ low write amplification. |
| 14 | What is the compaction tax? | Background rewrites the same key many times (write amplification), in exchange for fewer SSTables and lower read amplification. |
| 15 | Bloom filter in one line? | Says "not in" → skip that SSTable (no false negatives); "maybe in" → then you open the file. |
| 16 | Dynamo paper interview one-liner? | SOSP 2007, AP KV. Can name hinted handoff. Production conflict **LWW** (Ch06); don't treat vector clocks as the default. |
| 17 | LSM-tree paper? | O'Neil et al. 1996 Acta Informatica: high insert, memory+disk merge, sequential writes. Ancestor of SSTable. |
| 18 | Bigtable interview one-liner? | OSDI 2006: sparse multi-dimensional map + tablet + memtable/SSTable. Wide-column lineage, not a warehouse. |
| 19 | Stonebraker One Size? | ICDE 2005: one general-purpose engine for everything is outdated → split engines by workload. Optional punchline. |
| 20 | Spanner in one line? | OSDI 2012: TrueTime → **external consistency**. Not unpacked in this chapter. |`,
});
