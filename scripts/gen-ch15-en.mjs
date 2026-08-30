import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch15",
  titleEn: "Design a cloud drive",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 50–60 min ｜ **Prereq**: object storage Ch37; Ch14 callouts chunking, this chapter covers resumable upload
> **Goal**: chunking + dedup, resumable upload, versions. OT vs CRDT as a callout only—not a Docs chapter.

Cloud drive is the seventh full case. Video was how a large file becomes a playable stream; this one is the reverse: **how a large file is stored, resumed, and synced reliably—and changing one line must not re-upload the whole thing.** The interviewer is not scoring whether you can draw a Google Docs realtime-collab chapter + a zero-knowledge encryption lecture + some cloud SKU catalog. They want: **how you cut chunks, how hash does dedup, how you resume after a drop, and how versions plus file-level conflicts get resolved.**

The system looks like drag-and-drop, then it shows up on another computer. The hard parts are splitting metadata from bytes, content-addressed chunks, and not silently overwriting on a file-level conflict.`,
    },
    {
      id: "sec-answer",
      headingEn: "How to answer in the interview",
      bodyEn: `**Opening 30 seconds (say it out loud):**

> "Cloud drive has three hard parts: chunking plus content-hash dedup, resumable upload / multipart, and versions plus file-level conflicts. I'll confirm file-only vs realtime collab Docs—this loop defaults to file-only. Collab is a callout to OT/CRDT. Scale from teaching assumptions: storage in PB and upload bandwidth; QPS is not the bottleneck. Architecture: client → metadata → block svc → object store. Chunks use the hash as the key for CAS dedup; large files are resumable; versions are copy-on-write; conflicts use a version number plus last-write, or keep both copies."

Then walk the 4 steps. Do not draw the final diagram first.

${D2}

| Time-box | What you are doing |
|---|---|
| 3–10 min | Clarify: file-only vs Docs, file size cap, multi-device sync, versions |
| Next 2 min | back-of-envelope: storage PB; upload bandwidth; QPS is only hundreds to thousands |
| 10–15 min | High-level: client → metadata → block svc → object store |
| 10–25 min | deep dive: chunking + dedup, resumable, versions + file-level conflicts |
| 3–5 min | wrap-up: 3 bottlenecks (re-uploading the whole file, upload drop, silent overwrite) |

**red flag:** drawing OT transform before asking file-only vs Docs; jumping to an E2E zero-knowledge lecture before chunking; reciting some cloud SKU; stuffing transcode / recommenders in. That is over-engineering, or dragging a whole Docs / object-storage chapter into this prompt.`,
    },
    {
      id: "sec-clarify",
      headingEn: "Clarifying questions",
      bodyEn: `Drawing before you clarify = Jimmy. On cloud drive, stop at 5–7 questions; assume the rest and write the board. **The first question must be scope.**

| You ask | Typical answer / your assumption | What it changes |
|---|---|---|
| File-only or realtime collab? | **File-only** (Drive / Dropbox); Docs is a callout | file-level conflicts; not an OT/CRDT chapter |
| How big are the files? | Teaching: GB-scale is common; larger needs resume | small files simple; large files multipart |
| Multi-device sync? | **Yes** | notification + pull missing chunks |
| Version history? | **Yes** | copy-on-write; share immutable chunks |
| About how many DAU? | Teaching: **~10 million** | used to size PB and bandwidth, not some company's internal number |
| Encryption / sharing? | at-rest + TLS; sharing as an ACL callout | do not unpack E2E zero-knowledge |

${D2}

When they say "you decide," write the assumptions:

> "I'll assume: default file-only cloud drive, not a Google Docs chapter. GB-scale goes resumable. Multi-device sync plus version history. Conflicts are file-level: version-number CAS, last-write or keep both copies. I'll draw on that—cut me off if it's wrong."

If they bring up Docs: **acknowledge the difference, then close it.** "Character-level concurrency is when you need OT or CRDT; this loop is file-level, I'll call it out on follow-up." Asking past 10 minutes is also a red flag. The golden line is still: **ask the key questions → state your own assumptions → write the board → move.**`,
    },
    {
      id: "sec-estimate",
      headingEn: "Back-of-the-envelope",
      bodyEn: `Formulas live in Ch03. Here you only need order of magnitude: prove you know **this prompt's bottleneck is storage and bandwidth, not upload-start QPS.** Whiteboard **teaching assumptions** below—not some company's internal numbers, and not some cloud drive's real occupancy.

Assume about **10 million DAU**; ~**50 million** registered; quota about **10 GB** per user. About **2 files** uploaded per user per day; daily upload volume from photos/docs about **100 MB/user** (2026 no longer uses 500 KB per user as the spine).

| Item | How you estimate | Order of magnitude (teaching) |
|---|---|---|
| Quota ceiling | 5e7 × 10 GB | **~500 PB**; this is the quota cap, not actual occupancy |
| Upload QPS | 1e7 × 2 / 86400 | **~2e2**; peak ×5 is still thousands |
| Daily inbound | 1e7 × 100 MB | **~1 PB/day** |
| Read / write | sync is about 1:1 | download bandwidth same order; money is in GB, not request count |

QPS looks tiny because one "save" is followed by **MB–GB of chunk transfer**. The original book used 500 KB per user and upload QPS around 240—fine as a teaching contrast; after the 2026 board pulls average files up to photos/docs, **the conclusion is harder: count PB and bandwidth first, then draw chunking.**

**Interview line:**

> "10 million DAU on the board: quota is on the order of hundreds of PB; upload QPS is only hundreds. The expensive part is inbound/outbound bandwidth and object storage. On this prompt, layer and chunk first—do not stack QPS."

Common mistakes: importing a playback-scale CDN bill; or saying the 500 PB quota is already-landed occupancy. Teaching uses order of magnitude, and you **label the assumptions**.`,
    },
    {
      id: "sec-arch",
      headingEn: "High-level architecture",
      bodyEn: `Left to right, draw only **one write path**: Client → Metadata → Block svc → object store. Do not fan out Docs OT, E2E keys, or cold-storage SKUs on this diagram. Bytes go through object storage (Ch37)—**do not proxy the whole file through the metadata API**. The API only signs, and records the directory and versions. After they buy in, split chunking and resume.

${D2}

**This diagram cites**: Ch37 Storage choices · Ch41 Replication, sharding, transactions

**Layers (you must say this clearly):** metadata is small and needs transactions—directory tree, versions, the chunk-hash list per version—so a relational store (Ch41: commit is CAS; if parent does not match, conflict). Bytes are large, write-once read-many—immutable chunks go into object storage. Block svc's job: take chunks, dedup by content hash, tell metadata "these hashes are durable." **Store chunks first, then commit the version**; metadata must never point at bytes that are not there yet.

**Read / sync:** one device commits successfully; a notification wakes the others; the client pulls new metadata and only fetches chunks it does not have locally. Do not draw sync as "re-upload the whole folder."

${D2}

**This diagram cites**: Ch41 Replication, sharding, transactions

Notification can be long poll, WebSocket, or mobile system push—on the board, "there is a change signal, then the client pulls" is enough; do not turn this into a chat chapter. Offline devices catch up when they come online. The diagram is four leaves so it stays short; do not also fan the client out to three storage paths at once.

Stop the high-level here. Ask: "Does this direction look OK? Next I'll dig into chunking and dedup, then resumable upload, then versions and file-level conflicts."

**Interview line:**

> "Metadata in a relational store, bytes in object storage. The client asks which hashes are missing; chunks go direct or through block svc; metadata commit last. Sync is notification plus pull missing chunks. Docs and the encryption lecture stay off this diagram."`,
    },
    {
      id: "sec-chunk",
      headingEn: "Deep dive · chunking, hashing, and dedup",
      bodyEn: `First hard part. **Store the whole file as one blob**, and changing one character re-uploads everything; versions also cannot share old bytes. 2026 default: **cut chunks + content-hash each chunk + use the hash as the object key (CAS)**. Identical content is stored once; a new version only adds the chunks that changed.

${D2}

**This diagram cites**: Ch37 Storage choices

Chunk size on the board is a **teaching assumption of about 4MB** (Dropbox interviews often cite this order): too large, delta wins little; too small, one row of metadata per chunk, a 1GB file blows the table. Do not recite it as an internal benchmark. Hash with a SHA-256-class strong hash as the key—same content, same key, **dedup for free**. The client computes the hash list first, asks the server which are missing, and only PUTs missing chunks.

| | File-level hash | Chunk-level CAS (**default**) |
|---|---|---|
| Change one line | whole-file key changes, re-store everything | add only 1–2 chunks |
| Version history | a full copy per version | version = hash list; old chunks shared |
| Across files | only a full-file match hits | installers / templates share many chunks |
| Interview | contrast | **first answer in 2026** |

**Delta sync** is the same mechanism, read another way: re-chunk and re-hash locally, diff against the current version's chunk list, upload only the set difference. That is why it works on a weak network—not a second rsync-protocol lecture.

Follow-up "insert one byte at the head, every fixed-size chunk shifts": **call out** content-defined chunking (cut boundaries from content; an insert only disturbs nearby chunks). Do not teach the Rabin algorithm. Open the board on fixed-size 4MB; upgrade in one sentence on follow-up.

**Interview line:**

> "Cut the file into chunks; each chunk's content hash is the object key. Same hash, skip. A version is an ordered hash list. Change one line, upload only dirty chunks. Open on fixed-size; head-insert then mention CDC."

trade-off: larger chunks mean fewer requests and more wasted bandwidth on a change; smaller chunks fatten metadata. Cross-user dedup saves storage, but a hash can probe "has someone else already stored this file"—enterprise drives often dedup inside a tenant. Do not pivot into an E2E lecture here.`,
    },
    {
      id: "sec-resume",
      headingEn: "Deep dive · resumable upload",
      bodyEn: `Second hard part. GB-scale almost never succeeds in one HTTP. **Small files** can be a simple one-shot POST; **large files default to resumable / multipart**: open a session, get an upload id, PUT by chunk with a checksum each; after a drop, list received chunks, fill only the missing ones, then complete. Ch14 only callouts chunking; the protocol is finished here.

${D2}

**This diagram cites**: Ch37 Storage choices

Object stores generally expose the same three steps (init → part → complete). On the board, talk the mechanism—**do not recite some cloud API name and SKU.** Parts can run in parallel, throughput goes up; already-acked chunks are not re-sent. On complete, send the chunk list / ETag-class checksums and assemble the objects that make the logical file (or one logical object). The upload id is the session: incomplete parts occupy temp space; timeout must abort, or garbage fills the store.

| | Simple one-shot | Resumable / multipart (**large-file default**) |
|---|---|---|
| Drop | start the whole file over | fill only missing parts |
| Parallel | one connection | multiple parts PUT at once |
| Round trips | fewest | one extra init / complete |
| Interview | a few MB | **first answer at GB scale** |

Common 2026 landing: the client gets a **presigned URL** for missing chunks, bytes go straight to object storage, metadata commits only after every chunk is durable. Block svc can be the control plane that asks "does this hash already exist"—it does not have to proxy the GB again. Same as the video prompt: **the API is not saturated by large files.**

**Interview line:**

> "Small files in one shot. Large files: init for an upload id, PUT chunks, on drop list what landed and resume, then complete. Bytes go straight to object storage; commit last."

trade-off: parts too small become a request storm; too large waste a lot on one failure. On the board, "a few MB to around 10+ MB" is enough—do not recite some vendor's 5MB–5GB clause as the only truth. You need a session-expiry policy, or incomplete multipart leaks into the bill.`,
    },
    {
      id: "sec-version",
      headingEn: "Deep dive · versions and file-level conflicts",
      bodyEn: `Third hard part. One file version = **an ordered chunk-hash list (manifest) + parent version**. Chunks are immutable; a new version only appends changed chunks, and the list points at a mix of old and new—that is high-level **copy-on-write**. Delta is "which hashes are new vs the previous version"; do not turn the diff algorithm into a Git lecture. Periodic snapshots so you are not stuck on an infinite fine-grained delta chain—callout only.

Two devices both edit from version N; the later commit finds parent ≠ current head (CAS from Ch41). You cannot silently merge whole-file bytes. Both resolutions are valid; you have to name the trade-off:

${D2}

| | last-write / overwrite | Keep both copies (**common default**) |
|---|---|---|
| User sees | one latest copy | a second file like \`report (conflict copy).docx\` |
| Data | may drop the other device's whole-file edit | **nothing dropped**; a human picks |
| Implementation | timestamp or later commit becomes head | CAS fails → save another version / another path |
| Interview | you can name the risk | **common answer for a drive product** |

Offline edit is the same set: on reconnect, CAS against parent; do not treat conflict as "merge the PDF binary." Sharing / ACL as a callout: links should be long enough; enterprise adds domain restriction—not this chapter's main path.

### If they chase Docs (callout, then stop)

File-level conflict granularity is "the whole file"; **Docs is character-level concurrency**—LWW on every keystroke drops characters. Only then mention:

${D2}

**OT:** the client submits ops; a central server transforms then broadcasts; the historical Google Docs-class approach. **CRDT:** the structure itself converges under any merge order; local-first / long offline is smoother (Figma, Yjs class). Difference in one sentence: do you need a central arbiter, and does a long offline stack explode. **Do not** hand-compute an insert transform, and do not teach the G-Counter paper. Say it, stop, return to the drive.

**Interview line:**

> "A version is a chunk list plus parent; commit with CAS. Conflict is either LWW and you admit you may drop an edit, or keep both copies for a human. On Docs I only say OT is central transform, CRDT can merge out of order; I won't unpack it this loop."

trade-off: keep-both never drops user bytes, but the directory gets dirty and you have to teach users. LWW keeps the directory clean; it is a bad answer for "collaborative docs." Drawing OT/CRDT into the drive's main architecture is over-engineering.`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs the original book",
      bodyEn: `<details>
<summary>What the book / notes said then (not the first answer)</summary>

Xu explained the metadata / block-service / object-store split, ~4MB chunking, and notification-then-pull sync clearly—those mechanisms still hold. What is outdated is 500 KB average files, stopping at "use object storage," first-write-wins as the only conflict answer, and treating the notes' Docs OT chapter, E2E zero-knowledge, and cloud-vendor catalog as the first answer.

| Book or notes | How you answer now |
|---|---|
| Realtime collab out of scope | **this loop still defaults to file-only**; OT/CRDT only on a Docs follow-up, not its own chapter |
| Just "use object storage" | **resumable / multipart is the large-file default**; presigned direct upload |
| Dedup = skip on matching hash | **CAS: content hash as the key**; chunk-level beats file-level |
| Conflict is first-write-wins | **version CAS**; LWW or keep both copies; keep-both drops less data |
| Version = one file_version table | **COW: new list shares old chunks**; delta / snapshot as a callout |
| Bytes must stream through the block server | control plane checks missing chunks; **bytes can go straight to object storage** |
| 500 KB per user, QPS-centric | **bandwidth and PB are the bottleneck**; QPS hundreds to thousands |
| Three encryption modes as the spine | **at-rest + TLS**; E2E in one sentence of cost (dedup / search go away) |
| Cloud-vendor SKU / Glacier catalog | object store + one sentence on hot/cold; do not recite product names |

Still useful from the book: bytes split from metadata, chunking, pull after notify, relational store for directory transactions. Outdated: making OT/CRDT the drive's main architecture, and making the notes' encryption lecture and SKU table the spine.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **"File-only or Docs?"** → Default file-only. Docs is when you need OT/CRDT; callout then stop.
2. **"Why not upload the whole file?"** → A drop restarts everything; changing one line wastes bandwidth; versions cannot share chunks.
3. **"Why about 4MB per chunk?"** → Teaching assumption: too large, delta is weak; too small, metadata explodes. Not some company's internal number.
4. **"How do you dedup?"** → Content hash as the key (CAS). Chunk-level beats file-level; cross-user dedup has a probe risk.
5. **"What if I insert one byte at the head?"** → Fixed-size chunks avalanche; call out CDC, do not teach Rabin.
6. **"What if the upload drops?"** → upload id + list completed parts, fill only missing, then complete.
7. **"Why don't bytes go through the API?"** → Same reason as large-file video: saturates the API. Presigned, straight to object storage.
8. **"Will versions blow storage?"** → Immutable chunks + COW sharing; cap how many versions you keep; cold data sinking is a callout only.
9. **"Both sides edit at once?"** → CAS on parent. LWW or keep a conflict copy. Silent overwrite is not the only answer.
10. **"How does Google Docs do it?"** → OT central transform vs CRDT out-of-order merge. This loop: no hand-compute, no change to the main architecture.
11. **"What store for metadata?"** → Directory and versions need transactions → relational. Object storage only holds chunks (Ch37).
12. **"Notification: WS or long poll?"** → A change signal is enough; the client pulls missing chunks. Do not turn this into a chat prompt.
13. **"Encryption?"** → at-rest + TLS as the default. E2E makes server-side dedup and search hard—close in one sentence; not a zero-knowledge lecture.
14. **The final diagram is already huge and they keep stacking?** → OT algorithms, cloud SKUs, transcode ladders, recommenders are not this chapter. Three hard parts spoken clearly scores higher than 20 boxes.`,
    },
    {
      id: "sec-next",
      headingEn: "Wrap-up and what's next",
      bodyEn: `Wrap-up never says perfect. Three bottlenecks out loud:

| bottleneck | How you take it |
|---|---|
| Whole-file re-upload | chunk + content hash; upload only dirty chunks; CAS dedup |
| Upload drop | resumable / multipart; list missing chunks and resume; commit last |
| Silent overwrite | version CAS; LWW or keep both copies; Docs is when you call out OT/CRDT |

Self-check: close this page. 30-second opening + high-level on the board; walk chunking + dedup, resumable upload, and version conflicts to the air. Wherever you stumble, come back to that section. On Docs, callout then stop.

Next problem is **Ch16 · Design a comment system**. Cloud drive finished large-file sync; comments swap in nested threads, counts, and hot posts—from "how files stay consistent" to "how discussion hangs off an object."`,
    },
  ],
  reviewMdEn: `# Ch15 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | Three hard parts of a cloud drive? | Chunking + content-hash dedup; resumable upload / multipart; versions + file-level conflicts. OT/CRDT as a callout only. |
| 2 | File-only or Docs? | **Default file-only** (Drive/Dropbox). Collab is a callout to OT/CRDT, not its own chapter. |
| 3 | High-level pipeline? | Client → Metadata → Block svc → object store. Bytes never through the metadata API. |
| 4 | Metadata vs bytes? | Directory / versions need transactions → relational. Chunks go to object storage (Ch37). Store chunks first, then commit. |
| 5 | Why chunk? | Resume after a drop; change one line, upload only dirty chunks; versions share immutable chunks. Teaching assumption ~4MB. |
| 6 | CAS / dedup? | Chunk content hash as the key; same hash, skip. Chunk-level beats whole-file hash. |
| 7 | Pitfall of fixed-size chunks? | A head-insert avalanches every chunk. Follow-up: call out CDC, do not teach Rabin. |
| 8 | How do you upload a large file? | init → PUT parts → complete. On drop, list what landed and resume. Presigned direct upload is fine. |
| 9 | How does sync work? | One side commits → notification → the other pulls metadata → fetch only missing chunks. |
| 10 | How do versions not explode? | COW: a new version is a new hash list; old chunks are shared. Delta / snapshot as a callout. |
| 11 | File-level conflict? | CAS on parent. LWW may drop an edit; **keep both copies** is more common and drops no data. |
| 12 | They ask about Docs? | OT = central transform; CRDT = out-of-order merge. Callout then stop; do not change the drive's main architecture. |`,
});
