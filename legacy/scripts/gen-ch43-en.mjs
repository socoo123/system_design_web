import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch43",
  titleEn: "Hyperscale data",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 90–120 min ｜ **Prereq**: Ch37 storage choice (don't mix columnar)
> **Goal**: hot/warm/cold, columnar compression, partition evolution; Lambda/Kappa one sentence each; name the lakehouse. No Hadoop ops, no cloud shopping.

This is **M6's foundation chip** on how data lives at scale, not another 4-step design problem. On the spine, search logs, object storage, leaderboard history, and log-shaped systems all hit "where does hot data live, how do you scan the old stuff"—this chapter unpacks **tiering by access, why columnar scans less, how partitions change over time**. Design problems just cite it; don't open a big-data class on the whiteboard. Ch37 already pinned **wide-column ≠ analytic columnar**; this chapter does not reopen the storage catalog, it only digs **why analytic columnar can scan**.

**One line:** tier by access frequency **hot / warm / cold** (SSD·KV / columnar / object storage); don't park the whole lake on hot media. Columnar keeps IO down by **scanning fewer columns + compressing well within a column**. Partition by time, the spec can evolve, tiny files get merged with compaction.

Three hard parts (the pieces worth digging):

1. **Hot/warm/cold tiering** — by access, not by brand; hot SSD/KV, warm columnar, cold object
2. **Why columnar + compression can scan** — only read the columns you use; values in a column look alike so they compress hard (Dremel punchline)
3. **How partitions evolve over time** — cut by time; spec can change; avoid tiny files, name compaction

This chapter **does not cover**: Hadoop NameNode ops, a cloud EMR / Dataproc shopping list, Spark vs Flink as the body, rewriting Kafka as this chapter (**Ch20**), making Ch37's B+Tree vs LSM the spine again, recommender systems, a Hive homework book. Lambda / Kappa: **one sentence each and stop**. Lakehouse: only name **table format on object storage**; Iceberg / Hudi as mechanism examples, not an SKU tour.`,
    },
    {
      id: "sec-pitch",
      headingEn: "One-line definition · 20-second interview open",
      bodyEn: `First put the scoring signal on the table: you tier by access, you know columnar scans less because of column prune and compression, and you know partitions evolve rather than getting cut once and frozen.

> "Hyperscale data: tier by **access frequency** first, not by cluster brand. **Hot**: SSD / KV, point lookups in milliseconds. **Warm**: columnar, analytic scans. **Cold**: object storage, cheap, seconds is fine. Columnar can scan because queries usually touch a few columns—**read fewer columns, compress well within a column**. That's the Dremel line. Default partition is by time; when traffic changes the spec can evolve, you don't rewrite the whole lake. Tiny files get compacted into bigger ones—that's lake merge, not Ch37's LSM multi-level tax. Lambda: a batch layer for correctness, a stream layer for freshness; two pipelines is the tax. Kappa: one stream processor, recompute is log replay. Lakehouse: a table format on object storage that owns snapshots and the file list. No Hadoop ops, no cloud shopping."

The whole chapter walks this one chain. Say the 20 seconds, then stop. Let the interviewer decide whether to dig into tiering, columnar, or partitions.

${D2}

This figure cites: Ch37 storage choice (don't mix columnar with wide-column) · Ch22 object storage (the cold tier)

| Interviewer ask | Where you land |
|---|---|
| "Where does all this data go?" | Ask access frequency first; hot KV, warm columnar, cold object |
| "How do analytics even scan?" | Column prune + compression; not another Hadoop box |
| "How do you partition? Can you change it later?" | Cut by time; spec can evolve; tiny files need merge |

**red flag:** opening with EMR / a warehouse SKU; calling Cassandra and Parquet both "columnar" as the same answer; leaving the whole site's logs on SSD forever; turning Lambda/Kappa into a religion fight; replaying Ch37 B+Tree vs LSM as this chapter's spine.`,
    },
    {
      id: "sec-tier",
      headingEn: "Mechanism · Hot / warm / cold tiering",
      bodyEn: `First hard part. **In a 2026 interview, reciting eight storage classes scores lower than putting data where it is accessed.** The axis is **access frequency** (where the newest, hottest queries land). Time is a common proxy: older usually means colder, but a viral replay or an audit sample can warm "old" back up.

Three tiers is enough. Don't draw an eight-layer Glacier / Deep Archive tower.

${D2}

This figure cites: Ch37 KV / columnar models · Ch22 object storage (cold-tier GET)

| | **Hot** | **Warm** | **Cold** |
|---|---|---|---|
| Access | Just written, high-frequency point lookup | Recent reports, funnels, log aggregates | Compliance, replay, rarely queried |
| Media | SSD / KV next to memory | Columnar files (block or local disk) | **Object storage** |
| Latency | milliseconds | tens of milliseconds to seconds | seconds is fine |
| Shape | row / KV; mutable | columnar, mostly append | compressed columnar files, mostly immutable |
| Example | sessions, short URL, live leaderboard | day/week analytics | yearly logs, backups, audit |

**Why you must tier:** parking everything on hot media is cost over-engineering—access is long-tail; yesterday's point lookup and last year's audit are not the same SLO. Parking everything on object storage mismatches hot-path latency: object is great at large blobs and high-throughput GET, bad at millisecond point lookups (mechanism in **Ch22**).

Queries can cross tiers: last hour hits KV, last week hits warm columnar, last year hits columnar files on object. The planner prunes tiers by time predicates; don't make the app write three SQLs as a hero story.

Line this up with Ch37: **don't mash tier and model into one word:**

- Hot is often **KV / relational / wide-column ingest** (point lookup, write-heavy). The Bigtable / Dynamo line lives here; back-link the papers section.
- Warm is **analytic columnar** (scan columns and aggregate). Cassandra wide rows are not this tier.
- Cold is **object + columnar files**. Object itself has no "columns"; columns live in the file format (Parquet-class).

Leaderboard (**Ch23**): the live board is hot (ordered structure / KV); historical seasons and cold ranges go warm/cold—don't leave three years of scores in Redis as source of truth. Search (**Ch13**): online inverted index is the hot path; query log and index-build pipelines are warm/cold. Log-shaped systems (**Ch20**): a replayable log is a hot/warm conveyor, **not an infinite warehouse**—when retention expires, land it on object.

How to open it:

> "I split three tiers by access: hot SSD/KV for point lookups, warm columnar for analytic scans, cold object for archive. Time is a proxy; a viral replay can warm back up. I don't park the whole lake on SSD, and I don't use object as a primary-key lookup."

**over-engineering:** drawing six storage classes on the whiteboard, three clouds' archive SKUs, and a "smart tiering" product name before anyone asked QPS.`,
    },
    {
      id: "sec-column",
      headingEn: "Mechanism · Columnar store and compression (why scans stay cheap)",
      bodyEn: `Second hard part. Ch37 already split **wide-column LSM ≠ analytic columnar**. No reciting the catalog again. Dig one sentence: **why analytic queries can scan on a columnar store.**

${D2}

This figure cites: Ch37 storage choice (the analytic columnar cell; wide-column is not re-taught on this figure)

Row store: a record's fields sit together on disk. \`SELECT sum(price)\` can still drag name, address, and a JSON blob off disk, then throw them away. Wider table, more waste.

Columnar: the same field is laid out continuously, vertical. The query only touches the stripe / page for the \`price\` column; **other columns are never read**. That's Dremel's "read less data from secondary storage."

Compression is the second multiplier: values in one column look alike (status codes, country, enums, sorted timestamps), so **dictionary / RLE**-class encodings are cheap; a row page holds a heterogeneous tuple and compresses worse. Fewer bytes to read, cheaper to decompress—Dremel put "less IO + cheaper compression" in the same sentence. Two punches in the interview; don't open an encoding encyclopedia.

Leaf chain of one analytic scan:

${D2}

This figure cites: Ch37 analytic columnar (partition prune stacks on in the next section; this figure only pins columns)

Predicates help another cut: filters like time and country drop whole stripes before you even decompress. When you need the full row back (many columns, or nested records), the win shrinks—Dremel wrote: as you read more fields, the columnar advantage thins linearly, and assembling the record is itself expensive. Don't claim "columnar is always faster" on the whiteboard.

**Pin wide-column one more time (one sentence, no engine lecture):** Bigtable-style puts a row's sparse columns together; it serves **point lookup / short range by row key**. Analytic columnar puts one column across many rows together; it serves **scan-and-aggregate**. Access patterns are opposite; don't call both "columnar" and sit down. B+Tree vs LSM is Ch37's engine spine; this chapter does not re-teach it.

Public-paper magnitudes are intuition, not an SLA you invent: Dremel has a run where "columnar / columnar MR read ~0.5TB compressed, row-store MR read ~87TB"—the punchline is **scanning fewer columns is an order of magnitude**, not that you memorize 87.

How to open it:

> "Analytic queries use a few columns. Columnar only reads those, values in a column look alike so they compress hard, IO and decompress both get cheaper. That's the Dremel line. Wide-column is a different access pattern; I don't mix them, per Ch37."

**red flag:** drawing ClickHouse / Parquet and Cassandra as the same kind of store; selling columnar as an OLTP point-lookup silver bullet; reciting a compression-algorithm table and still not saying "read fewer columns."`,
    },
    {
      id: "sec-partition",
      headingEn: "Mechanism · Partition evolution",
      bodyEn: `Third hard part. Analytic tables almost always filter on time, so the default is **partition by time** (hour / day). What partition buys you: when the query has \`WHERE event_time BETWEEN ...\`, whole unrelated files never open—file-level prune, stacked on last section's column-level prune.

Granularity changes over time. Fresh data is dense, queries are fine-grained → by hour; once it cools, day or month is enough. That's not another storage tier; it's **the same time axis, coarser chunks.**

${D2}

This figure cites: Ch22 object storage (cold files still land on a time prefix/partition) · last section's columnar scan

**Evolution means two things; split them in the interview:**

1. **Data cools, chunks get coarser.** Hot partitions keep fine grain; history merges into bigger time buckets. Same story as hot/warm/cold.
2. **The table's partition spec changes.** Old world (Hive: directory name *is* the partition): day → hour often means a new table or a full rewrite, and queries still have to write the partition column. New world (Iceberg-class table format) keeps the partition spec in metadata: **changing the spec is a metadata operation**; old files keep the old spec, new data uses the new layout; the query planner groups by spec. Iceberg docs call this partition evolution—**you don't have to rewrite the whole lake just to change the cut.**

Iceberg / Hudi here are **mechanism examples** (hidden partitions, each file's spec recorded in the manifest), not a product comparison table.

**tiny files:** too-fine cuts × many writers × small batches = a sea of tiny files. On object storage the bottleneck is LIST / open metadata, not "the disk still has space." Streaming a few-KB Parquet every second will kill the warm tier on file count first.

**Name compaction and stop:** a background job **merges small files in the same partition into larger ones** (teaching intuition: target around hundreds of MB, not an SLA). Queries keep running; merge is an async tax.

This word is **not Ch37 LSM compaction**: that one rewrites the same key across multi-level SSTables; this one is **tiny-file merge** on the lake / columnar store. Say it out loud: "different object."

| Move | Why | Don't |
|---|---|---|
| Time partition | Queries almost always have time | Partition on a high-cardinality user_id; scanning one user can still scan the world |
| Fine when hot, coarse when cold | Matches access | Three years of data cut by the minute |
| Spec can evolve | Traffic changed, no write stop | Changing partition means an outage and a hand-migrated table as the only answer |
| Merge tiny files | Cut open/LIST | Turn it into a Hadoop NameNode ops class |

How to open it:

> "Default cut is by time. Fresh data can be hourly; once cold, day/month. Spec changes go through table-format metadata evolution; old files don't have to rewrite immediately. Tiny files merge in the background. Lake compaction is not the LSM tax."

**red flag:** "Hive partition directories" as the only 2026 answer; high-cardinality ids as the partition key; NameNode inode tuning as this chapter; welding compaction and LSM into one sentence.`,
    },
    {
      id: "sec-pick",
      headingEn: "Choice table: tiers + batch/stream one-liners + lakehouse named",
      bodyEn: `Don't turn the whiteboard into a big-data trade show. Fill tiers by access first; name batch/stream and lakehouse, then stop.

| Scenario | Default | Don't |
|---|---|---|
| Hot-path point lookup | KV / SSD (Ch37 / Ch06) | Object storage as a primary-key lookup |
| Recent analytic column scans | Columnar + time partition | Full table scan on a row store; wide-column as the warehouse |
| Cold archive / replay | Object + columnar files (Ch22) | Everything on SSD; a raw path glob as a table |
| Leaderboard history | Hot ordered structure; cold into columnar/object (Ch23) | Three years of the board in Redis |
| Search logs / index pipeline | Warm columnar; online inverted index stays the search engine (Ch13) | Stuff the inverted index into the lake as OLTP |
| Log transport | Replayable log (Ch20); land when retention ends | Kafka with infinite retention as a warehouse |

**Lambda vs Kappa: one sentence each, then stop.** This is not an architecture-religion chapter; don't stack Spark vs Flink on top.

${D2}

**Lambda (one sentence):** a batch layer computes the correct view from the full set, a stream layer fills in freshness, serving merges—**two pipelines, two copies of the logic, that's the tax.**

**Kappa (one sentence):** keep a replayable log, **one stream processor** serves both online and recompute; fix a bug, then replay.

Stop. If they ask "so which do you pick": if one stream can express it and log retention covers the replay window → Kappa is less ops. If the batch job (big shuffle, training samples) cannot be a stream, or compliance wants a batch gold standard → then Lambda dual-stack is worth paying. Don't default-draw three-layer Lambda for extra credit.

**Lakehouse: name it.** Lakehouse is not another brand you buy; it is a **table format on object storage**: files are still Parquet-class, plus a snapshot / manifest so the engine can prune files without LISTing the whole bucket, and you get schema / partition evolution.

${D2}

This figure cites: Ch22 object storage (the bytes sit on object) · table format is a metadata layer, not a second disk

Iceberg / Hudi as mechanism nails: the former leans snapshot + hidden partitions + evolution; the latter leans upsert / incremental. **Name the mechanism and stop**—no feature comparison table, no cloud Lakehouse SKU.

How to open it:

> "Tiers get filled by access. Batch/stream I give Lambda one sentence, Kappa one sentence, pick by whether one stream can express it. Lakehouse is a table format on object, not another warehouse brand."`,
    },
    {
      id: "sec-papers",
      headingEn: "Papers and classic systems",
      bodyEn: `M6 needs names you can drop. Two required back-link abstracts below, three optional. **The interview one-liner** is in the table; don't memorize page numbers, don't invent internal numbers. The teaching chain is "hot KV / wide-table ingest → interactive column scan," **not publication chronology** (Bigtable 2006 is earlier than Dynamo 2007).

${D2}

| | Paper | Required / optional | Interview one-liner |
|---|---|---|---|
| 1 | **Chang et al.**, OSDI 2006, *Bigtable: A Distributed Storage System for Structured Data* | Required (back-link) | Sparse wide table + tablet + memtable/SSTable. **Hot-path ingest / point lookup**, not analytic columnar. Details and "not a warehouse" already live in **Ch37**; this chapter only uses it to pin the hot tier |
| 2 | **DeCandia et al.**, SOSP 2007, *Dynamo: Amazon's Highly Available Key-value Store* | Required (back-link) | **Hot KV**: you still put during a partition. Don't re-teach quorum / vector clocks in this chapter—**Ch06 / Ch37**. This chapter uses it to pin "hot is not a warehouse" |
| 3 | **Melnik et al.**, VLDB 2010, *Dremel: Interactive Analysis of Web-Scale Datasets* | Optional | **Scan fewer columns, compression is cheaper.** Column striping; nested data can still be cut by column. A few fields can be about an order of magnitude. BigQuery's public story follows this line. Interview: "less scan surface, better compression" |
| 4 | **Abadi, Madden, Hachem**, SIGMOD 2008, *Column-stores vs. row-stores: how different are they really?* | Optional | Public column-store survey: splitting a row table by column is not enough; you also need **compression, late materialization, column-wise operators**. Use it to back Dremel's "why" |
| 5 | **Armbrust, Ghodsi, Xin, Zaharia**, CIDR 2021, *Lakehouse: A New Generation of Open Platforms that Unify Data Warehousing and Advanced Analytics* | Optional | Lakehouse: **open columnar files (Parquet-class) sit on cheap storage**, plus table management, instead of two copies in warehouse and lake. Interview: name the table format; don't treat the paper as a product launch |

Dremel, one more squeeze (two punches in the interview):

1. **Read less:** if the query only needs a few columns, don't haul the whole row off disk.
2. **Compress well:** same column, contiguous → lightweight compression pays; CPU and IO both drop.

Don't unpack: serving-tree levels, hand-computing repetition/definition levels, the MapReduce comparison table—name "tree aggregation, nested columnar" and leave it for a deep dive.

Lambda (Marz) / Kappa (Kreps 2014 blog) **are not this chapter's paper table**. One sentence each in the choice section is enough. The Kafka log paper lives in **Ch20 / Ch42**; it does not take a required slot here.`,
    },
    {
      id: "sec-used",
      headingEn: "Which design problems use this",
      bodyEn: `Do the spine problems first; jump into this chapter when you get stuck. Back-links are not "finish M6 then start writing." Each case's business hard part already lives in its chapter; here we only recycle **which tier the scale data sits on, and how you scan**.

| Chapter | The sentence you use |
|---|---|
| **Ch13** search | Online inverted index is the hot path; query log, index build, offline features go warm columnar + time partition. The inverted index is not an OLTP table on the lake |
| **Ch14 / Ch15** video / drive | Bytes sit on object (cold/warm GET); playback analytics and audit then go columnar. Don't haul the transcode class in |
| **Ch20** message queue | A replayable log is the premise of the Kappa sentence; **retention is not an infinite warehouse**, expire onto object. Mechanism still lives in Ch20 |
| **Ch22** object storage | The cold tier *is* this. Table format is metadata on top of object, not a GET/PUT replacement |
| **Ch23** leaderboard | Live board is an ordered structure; historical boards and cold seasons go columnar/object. Three years of a ZSET is not tiering |
| **Ch37** storage | Wide-column vs analytic columnar already pinned; this chapter adds "why scans stay cheap" and the tiers. Don't re-teach B+Tree/LSM on this problem |
| **Ch06** KV | Hot-tier point lookup. Don't use AP KV as the warehouse of record |
| **Ch02** scale | Data grew: tier first, don't open with a Hadoop cluster |

Comments, Feed, short URL: the online path is still store + cache; **behavior logs and funnels** go warm/cold. Split by the data; don't make one "big data platform" the whole architecture.`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs notes / the original book",
      bodyEn: `<details>
<summary>How the book / notes taught it then · Hadoop textbooks and cloud EMR go here</summary>

This chapter has almost no note to map to. Old interviews loved: an HDFS / MapReduce / Hive textbook, a cloud EMR / Dataproc shop, Spark vs Flink camps, "put Hadoop on it" as the first answer to scale. **That is not this chapter's body.** In 2026 you walk in with hot/warm/cold, two columnar punches, and partition evolution.

| Book / notes / old talk track | How you answer now |
|---|---|
| Hadoop NameNode, balancer, rack awareness as the spine | **Not this chapter**; tiny files as "metadata/open tax," not an ops manual |
| EMR / Dataproc / a warehouse SKU catalog | **Object storage + columnar files + table format** as mechanism; not a shopping list |
| Spark vs Flink who wins | **No flame war**; batch/stream, one sentence each of Lambda/Kappa, then stop |
| HDFS on the cluster means you know big data | Access-tier first; hot may still be KV |
| Hive partition directories can never change | Cut by time + **table-format evolution**; old files can coexist |
| Wide-column, columnar, and object all called columnar | **Ch37 already split them**; this chapter only digs scan + compression |
| MapReduce is the only batch | Batch is "bounded data, compute the correct view"; the engine is not locked to that 2004 homework |
| Lakehouse = buy another warehouse | **Table format on object**; CIDR 2021, name it and stop |
| Kafka as a whole chapter | **Ch20**; this chapter only says log retention cools onto object |

The body's first answer is this 2026 set. The fold only stops you from putting a Hadoop textbook and a cloud catalog on the whiteboard.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **How do you split hot/warm/cold?** → Access frequency. Time is a proxy, not the only axis.
2. **The three media?** → Hot SSD/KV, warm columnar, cold object. Not eight cloud archive tiers.
3. **Why not everything on SSD?** → Long-tail access; cost over-engineering.
4. **Why not everything on object?** → Hot-path point-lookup latency mismatch. Object mechanism is Ch22.
5. **Why can columnar scan?** → Only read the columns you use + compress well within a column. The Dremel line.
6. **Vs wide-column?** → Wide-column serves row-key point lookup; columnar serves scan-and-aggregate. Ch37 already pinned it; don't mix.
7. **What does compression ride on?** → Values in a column look alike; dictionary/RLE-class. Don't recite an algorithm table.
8. **Still winning when you read many columns?** → Advantage thins; assembling the record is also expensive. Don't mythologize.
9. **Default partition cut?** → Time. Queries almost always filter on time.
10. **High-cardinality user_id as partition?** → Usually a red flag. You can't prune, and you get more tiny files.
11. **Can you change partitions later?** → Yes. Table format makes evolution metadata; old files can keep the old spec.
12. **Why do tiny files hurt?** → LIST/open metadata tax, not a full disk.
13. **Compaction vs the LSM one?** → Not the same. Here: merge tiny files into bigger ones. LSM: rewrite the same key across levels (Ch37).
14. **Lambda in one sentence?** → Batch correct, stream fresh, serving merges; two pipelines is the tax.
15. **Kappa in one sentence?** → One stream; recompute is log replay.
16. **What is a lakehouse?** → Table format on object (manifest/snapshot), not another warehouse brand.
17. **Dremel interview one-liner?** → Scan fewer columns, compression is cheaper.
18. **Is Bigtable a warehouse?** → No. Hot wide-table ingest. Ch37.
19. **Put the search inverted index on the lake?** → Online inverted index is the search engine (Ch13); logs and analytics go to the lake.
20. **Why is next chapter microservices?** → Data scale is done; how you split and govern services is **Ch44**.`,
    },
    {
      id: "sec-next",
      headingEn: "What's next",
      bodyEn: `Close the page and walk it in 20 seconds: hot SSD/KV, warm columnar, cold object; columnar scans fewer columns and compresses well within a column; time partitions can evolve, tiny files merge. Lambda / Kappa one sentence each; lakehouse is a table format on object. If you can drop search logs, object, and leaderboard history back onto Ch13 / Ch22 / Ch23, this chapter is done.

Next is **Ch44 · Microservices & service governance**: criteria for splitting services, sync vs async, discovery / timeout / retry / idempotency, config back-links to Ch28, tracing named. Data scale answers "where the bytes live, how you scan"; governance answers "how you split services, how you contain failure." Don't open a distributed-monolith flame war early.

Self-check: left column, three hard-part lines; middle, one hot/warm/cold chain; right, two columnar punches + one partition-evolution sentence. Don't recite a Hadoop textbook and cloud EMR back.`,
    },
  ],
  reviewMdEn: `# Ch43 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | How do you open in 20 seconds? | Tier by access: hot SSD/KV, warm columnar, cold object. Columnar: scan fewer columns + compress well (Dremel). Time partitions can evolve; tiny-file compaction. Lambda / Kappa one sentence each. Lakehouse = table format on object. |
| 2 | Three hard parts? | ① Hot/warm/cold tiering ② Why columnar + compression can scan ③ How partitions evolve over time. |
| 3 | What do you tier on? | **Access frequency**. Time is a common proxy. A viral replay can warm back up. |
| 4 | Hot / warm / cold media? | Hot SSD/KV; warm columnar; cold object storage. Not eight cloud archive tiers. |
| 5 | Why must you tier? | All-hot is too expensive; all-cold mismatches point-lookup latency. Long-tail access. |
| 6 | Two columnar punches? | Only read the columns you use; values in a column look alike so they compress well. IO and decompress both get cheaper. |
| 7 | Wide-column vs analytic columnar? | Wide-column: row-key point lookup (Bigtable line). Analytic columnar: scan-and-aggregate. Ch37 already pinned it; this chapter does not reopen the catalog. |
| 8 | Dremel interview one-liner? | Scan fewer columns, compression is cheaper. A few fields can be about an order of magnitude. |
| 9 | When you read many columns? | Columnar advantage thins; assembling the record is also expensive. Don't mythologize. |
| 10 | Default partition? | **Cut by time**. Queries almost always filter on time. |
| 11 | Partition evolution? | Fine when hot, coarse when cold; table format changing spec is metadata, old files can keep the old layout. |
| 12 | tiny files? | Too-fine cuts × many writers × small batches. LIST/open is the bottleneck. |
| 13 | Lake compaction? | Merge tiny files into larger ones. **Not** Ch37 LSM rewriting the same key across levels. |
| 14 | Lambda in one sentence? | Batch layer correct, stream layer fresh, serving merges; dual-stack is the tax. |
| 15 | Kappa in one sentence? | One stream processor; recompute is a replayable log. |
| 16 | Lakehouse, name it? | Table format (snapshot/manifest) on top of columnar files on object storage. Iceberg/Hudi as mechanism examples. |
| 17 | Bigtable / Dynamo in this chapter? | Back-link: hot wide table / hot KV. Not a warehouse. Details in Ch37 / Ch06. |
| 18 | Search / object / leaderboard? | Ch13: inverted index hot, logs warm. Ch22: cold tier *is* object. Ch23: live board vs historical board. |
| 19 | Log-shaped systems? | Ch20: log is replayable; retention expires onto object. Don't treat Kafka as an infinite warehouse. |
| 20 | What does this chapter not cover? | Hadoop ops, cloud EMR shopping, Spark vs Flink flame wars, recommenders, LSM as the spine. |`,
});
