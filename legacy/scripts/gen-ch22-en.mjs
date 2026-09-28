import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch22",
  titleEn: "Object storage",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 50–70 min ｜ **Prereq**: storage choice Ch37; replication / sharding Ch41; how you talk about nines Ch36
> **Goal**: split the metadata plane from the data plane; erasure coding vs 3-replica + failure domains. Do not turn this into a drive, a video CDN, or a lakehouse textbook.

The queue and inventory chapters finished "how events travel reliably" and "how you occupy units"; this prompt swaps in **how you store a huge pile of immutable blobs, cheaply, and keep them**. Default is **S3-like object storage**: bucket + object key, PUT / GET / optional list and versioning. Not Ch15 drive (directory tree, chunk dedup, multi-device conflict), not Ch14 video (transcode, CDN playback), not Ch43 hyperscale data / lakehouse (columnar, table formats). Block vs file vs object is a **one-line table**; engine details go back to Ch37.

It looks like "upload a file and GET it back." Three hard parts: **metadata plane vs data plane (inode idea; pack small objects to cut IOPS)**, **durability: erasure coding vs 3-replica + failure domains (rack / AZ)**, **how you shard huge metadata + multipart for large objects (open it, don't productize)**. The interviewer is not scoring a cloud SKU catalog, S3 Select / Object Lambda product sheets, or an 11 nines number you multiplied yourself. They want: why names and bytes do not live in the same table, why durability opens with erasure coding, and how you pick a metadata shard key so a hot bucket does not punch through.`,
    },
    {
      id: "sec-answer",
      headingEn: "How to answer in the interview",
      bodyEn: `**Opening 30 seconds (say it out loud):**

> "Object storage has three hard parts. First, **split metadata from data**: the inode holds the name, ACL, and pointer; bytes go to data nodes; pack small objects into large files to cut IOPS. Second, **durability**: capacity default is **erasure coding**; hot / tiny objects stay 3-replica; blocks across racks and AZs. Third, shard metadata on \`hash(bucket, key)\`; large objects open with **multipart**. This is not drive sync (Ch15), not transcode+CDN (Ch14). Block / file / object go back to Ch37. Public SLAs often quote 11 nines durability — that's the published line, not a number I computed."

Then walk the 4 steps. Do not lead with Glacier tier shopping, S3 Tables, or dragging Ch15 conflict policy in.

${D2}

| Time-box | What you are doing |
|---|---|
| 3–10 min | Clarify: object-size mix, whether you need list / versioning, durability vs write-latency first |
| Next 2 min | back-of-envelope: teaching ~100 PB, 1e8-class objects; what is expensive is disks and IOPS, not API QPS |
| 10–15 min | High-level: Client → API → metadata / data plane |
| 10–25 min | deep dive: split+packing, erasure coding vs 3-replica, shard key + multipart |
| 3–5 min | wrap-up: 3 bottlenecks (tiny files punching disks, failure domains not split, hot-bucket metadata hotspot) |

**red flag:** writing every object as a POSIX file before you asked size mix; opening with "erasure coding is too hard so always 3-replica"; treating pre-2020 "eventual consistency is fine" as the 2026 first answer; drawing drive sync / video transcode / lakehouse table formats; reciting a cloud SKU; inventing some company's internal PB or multiplying your own 11 nines. That is over-engineering, or dragging a neighbor chapter in whole.`,
    },
    {
      id: "sec-clarify",
      headingEn: "Clarifying questions",
      bodyEn: `Drawing before you clarify = Jimmy. On this prompt, stop at 5–7 questions; assume the rest and write the board. **The first question must be scope: a pure object API, or a drive / CDN / warehouse.**

| You ask | Typical answer / your assumption | What it changes |
|---|---|---|
| PUT/GET only, or a drive, VOD, lakehouse? | This loop is an **S3-like object API** | no directory conflict, transcode, or columnar |
| How big are objects? What share are tiny files? | Teaching: **KB through GB; lots of small objects** | must pack; large objects multipart |
| Need prefix list and versioning? | **Open them**; not a product sheet | shard key and delete marker |
| Durability first or write latency first? | Capacity default **erasure coding**; hot path can replica | do not make 3-replica the only answer |
| Consistency model? | 2026: **read-after-write strong consistency** as the default line | eventual goes in the fold |
| Rough scale? | Teaching: **~100 PB logical, 1e8-class objects** | metadata must shard; not some company's internal number |

When they say "you decide," write the assumptions:

> "I'll assume: S3-like object storage, not a drive, not a video CDN. Objects from KB to a few GB; small objects get packed. Metadata and bytes are split. Capacity default is erasure coding; hot / tiny objects can be 3-replica; blocks across failure domains. Metadata shards on \`hash(bucket, key)\`. Large files multipart. GET sees the new object as soon as PUT succeeds. I'll draw on that—cut me off if it's wrong."

If they chase Drive sync, HLS transcode, Iceberg / lakehouse tables, S3 Select: **acknowledge the difference, then close it.** "Drive is Ch15, transcode is Ch14, table formats point at Ch43. This loop stops at the object API and data nodes." Asking past 10 minutes is also a red flag. The golden line is still: **ask the key questions → state your own assumptions → write the board → move.**`,
    },
    {
      id: "sec-estimate",
      headingEn: "Back-of-the-envelope",
      bodyEn: `Formulas live in Ch03. Here you only need order of magnitude: prove you know **this prompt's bottleneck is capacity, IOPS, and metadata row count—not "the QPS of the first second of upload."** Whiteboard **teaching assumptions** below—not some cloud's internal occupancy, and not a public SLA reverse-engineered into a durability number you designed.

Teaching orders of magnitude (**assumptions**; reuse the notes' scale so you can compare, not some company's facts): logical data ~**100 PB**; object sizes mix small / medium / large. Rough object count ~**1e8-class** (the notes derive ~6.8e7); each metadata row ~1 KB → metadata ~**0.5–1 TB**. A single HDD's random IOPS is on the order of hundreds—**one file per object fills inodes and IOPS first**, so you must pack.

| Item | How you estimate | Order of magnitude (teaching) |
|---|---|---|
| Logical capacity | whiteboard 100 PB | **hundreds of PB**; erasure-coding overhead is extra, not what the user sees |
| Object count | mix of sizes / average object | **1e8-class**; metadata cannot be one table on one box |
| Metadata | 1e8 × ~1 KB | **TB-class**; must shard (Ch41) |
| Small-object IOPS | one create per object | HDD **~100 IOPS**; disks die before you pack |
| API QPS | far below byte throughput | control plane can scale stateless; what is expensive is disks and rebuild traffic |

Durability numbers: **do not multiply 11 nines on the whiteboard.** Public lines for mainstream object-storage Standard often quote **11 nines durability** (e.g. the published S3 SLA line); textbooks using 3-replica to "about 6 nines" are only order-of-magnitude intuition. Open with: "that's a **published SLA line, not a number I computed**; I guarantee failure domains + a redundancy scheme, not nines I multiplied myself."

**Interview line:**

> "Hundreds of PB and 1e8 objects are teaching assumptions. What is expensive is disks, tiny-file IOPS, and how you cut metadata. I will not treat some company's internal PB as a fact, and I will not multiply 11 nines by hand."

Common mistakes: reporting only API QPS and pretending there are no tiny files; or saying 11 nines is an internal conclusion you multiplied from a 0.81% AFR. Teaching uses order of magnitude, and you **label the assumptions**.`,
    },
    {
      id: "sec-arch",
      headingEn: "High-level architecture",
      bodyEn: `Left to right, draw only **one object control plane**: Client → API → metadata plane / data plane. Do not fan out transcode, CDN, a lakehouse catalog, or a drive directory tree on this diagram. **The API is stateless**; auth is a point, then stop. After they buy in, split packing and erasure coding.

${D2}

**This diagram cites**: Ch37 Storage choice · Ch41 Replication, sharding, transactions

**Block / file / object (short table; details Ch37):** block is a raw volume, for VM / database disks; file is a directory tree + POSIX, for shared mounts; **object is an HTTP-semantic immutable blob**, addressed by key, write-once read-many. Object storage **deliberately** trades latency for scale, cost, and very high durability—do not treat it as a hot-DB disk.

**Write path:** auth → data plane lands the bytes first (you get an object id / location) → **then commit metadata** (name → id, checksum, length). The store must not point at bytes that do not exist yet. Read: metadata looks up location → data node reads by offset → verify checksum. List is a metadata query, not a disk scan.

${D2}

Only these four participants. **Do not** add an IAM microservice, CDN, or transcode as a fifth person. Placement / topology (which disks, which rack) lives in the data-plane line: replicas or erasure chunks must land in **different failure domains**—mechanism goes back to Ch41; here you only nail "not the same rack."

Do not unpack at high level: specific Reed-Solomon parameters, some cloud's Glacier name, S3 Select. Ask: "Does this direction look OK? Next I'll dig into the metadata split and small-object packing, then erasure coding vs 3-replica, then shard key and multipart."

**Interview line:**

> "Client hits the API. Bytes go to the data plane; inodes go to metadata. Land bytes first, then commit the name. Do not draw a drive and a CDN on this diagram."`,
    },
    {
      id: "sec-meta",
      headingEn: "Deep dive · Metadata split and small-object packing",
      bodyEn: `First hard part. **Do not stuff names and bytes into the same table, and do not make one POSIX file per object.** UNIX splits inode from data block; object storage is the same idea: metadata is mutable (change ACL, change the name mapping), payload is **immutable** (overwrite = a new object / new version). Scale them independently: metadata is a shardable small store; data is append files + redundancy.

**Small objects are an IOPS killer.** A million 10 KB objects, one file each: wasted blocks, exhausted inodes, random creates filling the HDD. 2026 default: **append into the current writable large file (a few GB class)**, at a threshold **seal it read-only**, new objects open a new file. Lookup on the node: \`object_id → file + offset + size\`. Read-heavy write-light, this map can be an embedded store or a local KV—do not open SQLite vs RocksDB shopping on the whiteboard.

${D2}

**This diagram cites**: Ch37 Storage choice

The write path serializes: one writable file can only append at a time. Speak **one writable file per core (or per disk group)** so you do not take a global lock. Compaction / GC: accumulate delete marks, copy live objects into a new file, **update the map and delete the old file in the same transaction**, or a read hits a hole. Point at the detail and stop; do not draw an LSM textbook (Ch37).

**Interview line for Haystack / f4:** Facebook **Haystack** (2010): the hot-photo path = **pack small objects into large files + split metadata from data + multi-replica**. **f4** (2014): warm data switches to **erasure coding**, driving the effective replica factor down. One sentence on the board proves you know the industrial prototype; do not recite the paper's PB counts or Reed-Solomon(10,4) as an internal spec.

| | One file per object | Pack into large files (**default**) |
|---|---|---|
| IOPS | every create punches the disk | sequential append |
| inode | object count = file count | file count ≈ capacity / a few GB |
| Lookup | filesystem directory | \`id → offset\` |
| Interview | contrast / red flag | **2026 first answer** |

**Interview line:**

> "Inodes and bytes are split. Small objects append into a large file, then seal. Haystack is that sentence; once warm, f4-style erasure coding. This is not a drive-directory prompt."

trade-off: packing buys IOPS; you take GC, a map, and a dead block meaning you repair a slice of a file. Insisting on one file per object "for simplicity" at 1e8 small objects is this loop's biggest red flag.`,
    },
    {
      id: "sec-durability",
      headingEn: "Deep dive · Erasure coding vs 3-replica",
      bodyEn: `Second hard part. **A 2026 interview expects you to open with erasure coding**; do not make "too complex so always 3-replica" the first answer. 3-replica still has a seat: **hot path, tiny objects, repair must be fast**—copying the whole object keeps latency more controllable. Capacity default, cold / warm, when you need to squeeze disks: **erasure coding** (Reed-Solomon class): \`k\` data chunks + \`m\` parity chunks; you can still rebuild after losing ≤ \`m\` chunks. Teaching open **(8+4)** or **(4+2)** both work; **do not recite k, m as some company's internal code.**

${D2}

**This diagram cites**: Ch36 CAP / SLO · Ch41 Replication, sharding, transactions

| | 3-replica | Erasure coding (**capacity default**) |
|---|---|---|
| Disk overhead | ~3× | teaching (8+4) ~1.5×; (4+2) same order |
| Write | copy two more copies | slice first, then parity; CPU + many nodes |
| Read (healthy) | read one copy | read k chunks and stitch |
| Repair | copy one copy | solve from many chunks; the network hurts more |
| Failure domain | three copies not on the same rack / AZ | **k+m chunks not in the same failure domain either** |

Public lines for object-storage Standard often quote **11 nines durability**; textbooks using 3-replica intuition say "about 6 nines." **Open labeled: published SLA line, not a number you computed.** What you actually have to talk is **failure domains**: node → rack (shared switch / power) → AZ. If three copies or k+m chunks sit on the same rack, one power loss = correlated failure, and the nines poster is instantly void. Cross-AZ is the default line; multi-Region replication is "a different SLA"—do not draw a global mesh.

Tiering in **one sentence**: hot data can start as replicas, then recode to erasure coding when it cools (the f4 story). Do not recite Glacier / Intelligent-Tiering SKU names as architecture.

${D2}

**Checksum:** a disk that never reports failure can still **bit rot**. Store a checksum per object (and per sealed large file); recompute on read; mismatch → read from another failure domain or rebuild from parity. 2026 whiteboard default is **CRC32C** (common hardware accel) or **SHA-256** (harder integrity). MD5 is weak, only a historical ETag contrast—into the fold, not the first answer.

**Interview line:**

> "Capacity default is erasure coding; hot and tiny objects stay 3-replica. Chunks across racks and AZs. CRC32C against silent corruption. 11 nines is a published line; I talk failure domains and redundancy, not nines I multiplied by hand."

trade-off: erasure coding saves disks; repair and tail latency cost more. 3-replica costs disks and is easier to implement. Picking one side and never saying failure domain makes the nines empty. Retelling replication protocols and Raft logs as a chapter steals Ch41.`,
    },
    {
      id: "sec-shard",
      headingEn: "Deep dive · Metadata sharding and multipart",
      bodyEn: `Third hard part. 1e8-class inodes **must shard**; the mechanism (consistent hashing, rebalance) goes back to Ch41. This loop only nails the **shard key** and how you open large objects. Versioning / list: enough to survive follow-ups; do not become an S3 feature handbook.

${D2}

**This diagram cites**: Ch41 Replication, sharding, transactions

**How you pick the key:** only \`bucket_id\` → a hot bucket (one public dataset) punches a single shard. Only \`object_id\` (UUID) → even, but \`GET bucket/key\` still needs name→id first, and prefix list hurts more. Whiteboard default **\`hash(bucket_name, object_name)\`**: even by URI; a point lookup by name hits the right shard. Prefix list under sharding has to scan many shards then merge-page—speak "list is not a performance priority; you can denormalize a per-bucket list table." Do not design a second search engine here (Ch13).

**Versioning (open it):** overwrite does not delete old bytes; insert a new row; current version = latest version number. Delete inserts a **delete marker**; GET current = 404; old versions still fetch by version id. Time-ordered ids are enough; do not drag a TIMEUUID lecture in.

**Multipart:** do not bet a GB-class object on one HTTP request. Init gets an upload id → parallel PUT part → complete then commit as one object. Interrupt: only refill missing parts. Incomplete parts need timeout GC, or the bill and the disks leak. This is not the same prompt as Ch15 drive "chunk dedup": here you **do not have to dedup**; you only need a reliable finish. Content-addressed CAS is the drive hard part.

**Interview line:**

> "Metadata shards on hash(bucket, name); do not shard by a hot bucket. Large files multipart. Versioning inserts a new row plus a delete marker. Point at list and GC; do not draw a product sheet."

trade-off: hashing by name makes point lookups fast; list gets harder. A denormalized list table for list is space for simplicity. Turning multipart into a resume-protocol textbook, then stacking Ch15 dedup, steals a neighbor chapter's time.`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs the book",
      bodyEn: `<details>
<summary>How the book / notes told it then (not the first answer)</summary>

Xu Vol.2 object storage covers the high-level, small-object packing, metadata sharding, versioning, multipart, and GC skeleton thoroughly; inode split and small-object packing still hold. This body is rewritten around the **2026 interview default**: you can open erasure coding, strong consistency is the default line, checksum is no longer MD5-only. S3 Select / Object Lambda / S3 Tables and Glacier SKU names from the notes are not the spine. This is not the notes polished onto the page.

| Book or notes / old web answers | How you answer now |
|---|---|
| Eventual consistency is fine | **From 2020-12** public S3 is **read-after-write + list strong consistency**; whiteboard default follows that line |
| Mostly 3-replica (erasure coding is too hard) | **Capacity default erasure coding**; hot / tiny objects stay 3-replica |
| Checksum is MD5 only | **CRC32C / SHA-256**; MD5 is weak, historical ETag |
| Never mention Haystack / f4 | **One-sentence prototype**: pack+split; warm data erasure coding |
| Never mention tiering | **One sentence** hot replica / cold erasure coding; no cold-storage SKU |
| Drive conflict / video transcode inside the object chapter | **Ch15 / Ch14**; this loop stops at the object API |
| Lakehouse / columnar / S3 Tables | **Point at Ch43**; not this chapter |
| Multiply 11 nines on the spot | **Published SLA line**; talk failure domains and redundancy |
| Some company's internal PB as fact | **Teaching assumptions** hundreds of PB / 1e8 objects |

Still-valid skeleton: split metadata from data, pack small objects, failure domains, checksum, shard by name, multipart. Outdated is treating eventual consistency and "always 3-replica" as the 2026 first sentence.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **"What's the difference between block, file, and object?"** → Block is for disks; file is a directory tree; object is an HTTP blob, immutable, at huge scale. Details Ch37.
2. **"What's the relationship to Ch15 drive?"** → The drive stores chunks in object storage; it still needs directories, dedup, conflict. This chapter only does the object API.
3. **"Why split metadata from data?"** → inode is mutable, bytes are immutable; scale independently, fail independently.
4. **"Why not one file per small object?"** → IOPS and inodes. Append into a large file, then seal.
5. **"Haystack interview line?"** → Pack + split + hot replicas; f4 is warm-data erasure coding.
6. **"Why doesn't 2026 open with always 3-replica?"** → Disks are too expensive. Capacity default erasure coding; hot / tiny stay replica.
7. **"Can erasure chunks sit on the same rack?"** → No. Failure domains not split means redundancy is fake (Ch41).
8. **"How did you compute 11 nines?"** → **You don't.** Published SLA line. I guarantee failure domains and the code.
9. **"Disk didn't fail but the data is wrong?"** → checksum (CRC32C / SHA-256); mismatch → rebuild from another domain.
10. **"GET right after PUT?"** → 2026 default **strong consistency**; eventual is the old line.
11. **"How do you shard the object table?"** → \`hash(bucket, key)\`. Bucket-only is a hotspot; UUID-only hurts lookup by name.
12. **"How do you upload a large file?"** → multipart: init / part / complete; leftover parts need GC. Not Ch15 dedup.
13. **"How do you cut cost?"** → erasure coding + pack small objects + one sentence hot/cold. No Glacier shopping.
14. **The final diagram is already huge and they keep stacking?** → Select, Object Lambda, lakehouse tables, drive sync, transcode are not this chapter. Three hard parts spoken clearly scores higher than 20 boxes.`,
    },
    {
      id: "sec-next",
      headingEn: "Wrap-up and what's next",
      bodyEn: `Wrap-up never says perfect. Three bottlenecks out loud:

| bottleneck | How you take it |
|---|---|
| Tiny files punching disks / inodes | Split metadata from data; append-pack then seal (the Haystack sentence) |
| Fake redundancy, expensive repair | Capacity default erasure coding; hot / tiny 3-replica; chunks across failure domains; CRC32C |
| Hot-bucket metadata, large-file interrupt | \`hash(bucket, key)\`; multipart + timeout GC |

Self-check: close this page. 30-second opening + high-level on the board; walk split+packing, erasure coding vs 3-replica, shard key and multipart to the air. Ch15 conflict, Ch14 transcode, Ch43 lakehouse as boundaries only. Wherever you stumble, come back to that section.

Next problem is **Ch23 · Game leaderboard** (chapter already exists). Object storage is how you keep a blob durable; the leaderboard swaps in how you cut an ordered set—ZSET and sharding.`,
    },
  ],
  reviewMdEn: `# Ch22 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | Three hard parts of object storage? | Metadata/data split + pack small objects; erasure coding vs 3-replica + failure domains; metadata shard key + multipart. Not a drive/CDN/lakehouse. |
| 2 | Why split inode from bytes? | Metadata is mutable, payload is immutable; scale independently. Land bytes first, then commit the name. |
| 3 | Default store for small objects? | Append into a large file, seal read-only at a threshold; \`id → file+offset\`. One file per object is a red flag. |
| 4 | Haystack / f4 interview line? | Haystack: pack + split + hot replicas. f4: warm-data erasure coding to cut effective replica factor. |
| 5 | 2026 durability first sentence? | **Capacity default erasure coding**; hot / tiny objects stay 3-replica. Not "too complex so always 3-replica." |
| 6 | What do you nail on failure domains? | Node / rack / AZ. Replicas or k+m chunks cannot sit on the same rack. Mechanism back to Ch41. |
| 7 | How do you open 11 nines? | **Published SLA line, not a number you computed.** Talk redundancy and failure domains; do not multiply nines on the spot. |
| 8 | 2026 default checksum? | **CRC32C** (hardware accel) or SHA-256. MD5 is weak, into the fold. Against bit rot. |
| 9 | GET right after PUT? | Default **read-after-write strong consistency** (public S3 since 2020-12). Eventual is the old answer. |
| 10 | Metadata shard key? | **hash(bucket, key)**. Bucket-only is a hotspot; UUID-only hurts lookup by name. List can denormalize. |
| 11 | How do you open large objects? | **multipart**: init / part / complete; leftover parts timeout GC. Not Ch15 CAS dedup. |
| 12 | Biggest over-engineering on this prompt? | Drive conflict, transcode CDN, lakehouse tables, cloud SKU shopping, multiplying 11 nines, always 3-replica. Speak the three hard parts. |`,
});
