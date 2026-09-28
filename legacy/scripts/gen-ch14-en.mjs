import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch14",
  titleEn: "Design a video platform",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 50–60 min ｜ **Prereq**: object storage / CDN in Ch37 / Ch38
> **Goal**: encoding ladder, HLS/DASH, CDN cost, AV1. Live is a callout only. No recommenders.

Video is the sixth full case. Search is words → documents; this one is the reverse: **how a large file becomes a stream you can play, without blowing the bandwidth bill.** The interviewer is not scoring whether you can draw a live-streaming chapter + a short-video recommendation funnel + a cloud SKU catalog. They want: **how you produce the encoding ladder, how HLS/DASH plays, and why CDN is the cost bottleneck.**

The system looks like upload, then hit play. The hard parts are pre-transcoding multiple rungs, adaptive segments, and not paying edge-cache money for every cold title in the long tail.`,
    },
    {
      id: "sec-answer",
      headingEn: "How to answer in the interview",
      bodyEn: `**Opening 30 seconds (say it out loud):**

> "Video has three hard parts: the upload-plus-transcode pipeline, HLS/DASH ABR playback, and CDN cost with the long tail. I'll confirm VOD vs live—this loop defaults to VOD. Short video is another system; I won't unpack it. Scale from teaching assumptions: storage in TB and CDN egress money. Architecture: client → upload API → object store → MQ encoding ladder → CDN. Playback is HLS/DASH; the player switches rungs by bandwidth. Codec: H.264 as the compatibility floor, AV1 as the 2026 bandwidth-saving option. Live is a callout to LL-HLS/CMAF only. No recommenders."

Then walk the 4 steps. Do not draw the final diagram first.

${D2}

| Time-box | What you are doing |
|---|---|
| 3–10 min | Clarify: VOD vs live, long vs short video, resolution, DAU |
| Next 2 min | back-of-envelope: storage TB/day; order of CDN egress dollars |
| 10–15 min | High-level: client → upload API → object store → transcode → CDN |
| 10–25 min | deep dive: encoding ladder + MQ, HLS/DASH ABR, CDN long tail + AV1 |
| 3–5 min | wrap-up: 3 bottlenecks (transcode backlog, stalling / rung switches, CDN bill) |

**red flag:** drawing WebRTC co-hosting before asking VOD vs live; jumping to a recommendation funnel before transcode; treating short video as a second architecture; reciting some company's CDN daily bill as fact; dragging in the whole Ch15 resumable-upload chapter. That is over-engineering, or stuffing a live / recommender / cloud-drive prompt into this one.`,
    },
    {
      id: "sec-clarify",
      headingEn: "Clarifying questions",
      bodyEn: `Drawing before you clarify = Jimmy. On video, stop at 5–7 questions; assume the rest and write the board.

| You ask | Typical answer / your assumption | What it changes |
|---|---|---|
| VOD or live? | **VOD**; live is a callout only | pre-transcode + HLS/DASH; not a realtime ingest chapter |
| Long video or short video? | **Long video / UGC VOD** | short video is another system; don't unpack |
| Which resolutions / codecs? | Multi-rung ABR; H.264 floor + AV1 option | encoding ladder, not store-4K-only |
| About how many DAU? | Teaching: **~5 million** | storage and CDN money, not some company's internal number |
| Comments / recommenders / search? | **No recommenders this loop**; comments/search are other prompts | spine stops at upload, transcode, play |
| How big are the files? | Teaching: mid/long titles, GB-scale needs chunks | GOP alignment as a callout; resumable upload deep-dive is Ch15 |

${D2}

When they say "you decide," write the assumptions:

> "I'll assume: default VOD, not a live chapter. Short video is another system; I won't unpack it. No recommenders this loop. Encoding ladder is a few ABR rungs, H.264 as the compatibility floor, AV1 as the 2026 option. Upload chunks aligned to GOP as a callout; resumable upload belongs to the cloud-drive prompt. I'll draw on that—cut me off if it's wrong."

If they bring up live: **acknowledge the difference, then close it.** "Live can use LL-HLS / CMAF to squeeze delay to a few seconds; co-hosting / calls are WebRTC. This loop is VOD." Same close for TikTok / Shorts. Asking past 10 minutes is also a red flag. The golden line is still: **ask the key questions → state your own assumptions → write the board → move.**`,
    },
    {
      id: "sec-estimate",
      headingEn: "Back-of-the-envelope",
      bodyEn: `Formulas live in Ch03. Here you only need order of magnitude: prove you know **this prompt's bottleneck is bandwidth money and transcode compute, not play-start QPS.** Whiteboard **teaching assumptions** below—not some company's internal numbers, and not YouTube's real bill.

Assume about **5 million DAU**; ~10% upload 1 title per day, ~300 MB average; ~5 titles watched per user per day, ~0.3 GB egress each. CDN unit price **~$0.01/GB** (order of magnitude, not a cloud price sheet).

| Item | How you estimate | Order of magnitude (teaching) |
|---|---|---|
| Raw storage | 5e6 × 10% × 300 MB | **~150 TB/day**; after 3–4 transcode rungs, × a few more |
| Play-start QPS | 5e6 × 5 / 86400 | **~3e2**; peak ×5 is still thousands |
| CDN egress | 5e6 × 5 × 0.3 GB × $0.01 | **tens of thousands of dollars/day** in that band |
| Yearly storage | 150 TB × 365 | **~50 PB** raw; the ladder is a larger PB |

QPS looks tiny because one "hit play" is followed by **minutes of segment fetches**. The money is GB egress, not request count. The original book used a higher unit price and got ~$150k/day—**fine as a teaching magnitude; do not say it is some company's real daily bill.** Cut the unit price in half and the conclusion is the same: CDN is still the cost bottleneck.

**Interview line:**

> "5 million DAU on the board: raw storage on the order of 100 TB/day; play QPS only hundreds to a thousand. The expensive part is CDN egress—teaching assumption is tens of thousands of dollars/day. On this prompt, count the money first, then draw transcode."

Common mistakes: treating play-start QPS as the only load; or taking a platform's public daily views / internal CDN bill as your own fact. Teaching uses order of magnitude.`,
    },
    {
      id: "sec-arch",
      headingEn: "High-level architecture",
      bodyEn: `Left to right, draw only **one pipeline**: Client → Upload API → object store → transcode → CDN. Do not fan out live, recommenders, or moderation on this diagram. Bytes go through object storage and CDN—**do not proxy video through the API**. The API only signs uploads and writes metadata. After they buy in, split transcode and playback.

${D2}

**This diagram cites**: Ch37 Storage choices · Ch38 Cache & CDN · Ch42 Messaging, resilience, containers

**Write path (name it and stop):** the client asks the API for a presigned URL and **uploads straight to object storage** (Ch37), so the API is not saturated by large files. When the object lands, drop a message on a queue (Ch42); transcode workers produce the encoding ladder and write artifacts back to object storage as the CDN origin. Metadata (duration, playable rungs, status) lives in a small DB, separate from the bytes.

**Read path:** hit play, fetch the manifest first; segments come from the **CDN** (Ch38). Miss goes back to object storage. The product API still owns likes and titles—**it never touches video bytes**.

The diagram is five boxes so it stays short; MQ lives inside the Transcode box and we unpack it later. Do not also fan the client out to CDN / origin / recommenders—three-way fan-out turns into a skinny tower.

Stop the high-level here. Ask: "Does this direction look OK? Next I'll dig into the encoding ladder, then HLS/DASH, then CDN cost and AV1."

**Interview line:**

> "Upload: client → API signs → object store; transcode via MQ. Playback: client → CDN, miss back to origin. Video never goes through the API. Live and recommenders stay off this diagram."`,
    },
    {
      id: "sec-transcode",
      headingEn: "Deep dive · upload and transcode pipeline",
      bodyEn: `First hard part. **The raw file cannot play on every device as-is**: too big, formats are messy, one bandwidth blip stalls. Transcode = pre-build an encoding ladder of **multiple resolutions × multiple bitrates**. The client only picks a rung; it does not downscale in real time on the phone.

${D2}

**This diagram cites**: Ch37 Storage choices · Ch42 Messaging, resilience, containers

3–4 rungs on the board is enough. Do not draw 8 rungs × 3 codecs at once. Teaching default: **360p for weak networks, 720p for mobile, 1080p for Wi-Fi**; AV1-capable clients take a cheaper same-resolution rung (next section). Higher 4K only if the product needs it—not a required opening box.

Why pre-transcode on the server, not let the client downscale: mobile CPU / battery cannot survive realtime transcode; ABR needs **segments that are already cut**, so a weak network can switch in a second. The cost is storage and compute multiplying—use the long tail and on-demand transcode to cut rungs on cold titles (section 3).

**Pipeline:** object-store write → MQ (Ch42) → workers pull jobs and emit the ladder → write back to storage → a completion event marks "playable." Transcode is slow and backs up, so it must be async—do not make the upload HTTP wait for 1080p. Recoverable failures retry that rung; a corrupt source is marked failed, no infinite loop. At volume, especially AV1, **one sentence on GPU transcode**: same queue, workers swap in accelerator cards—not a second cluster chapter.

**GOP / chunking (callout; deep dive in Ch15):** cuts must align to a GOP (Group of Pictures) so each piece is independently decodable—otherwise HLS segments and parallel upload do not work. The client can upload chunks straight to object storage; **resumable upload, upload id, and the list of completed parts** belong to Ch15 cloud drive. This loop does not make the multipart protocol the spine.

| | Store source only | Pre-transcode ladder (**default**) |
|---|---|---|
| Compatibility | Device cannot decode → cannot play | Each rung is a common container |
| Weak network | Whole high-bitrate file, will stall | player drops to 360p |
| Cost | Storage smallest | Storage × rungs; you get small CDN-cacheable files |
| Interview | red flag | 3–4 rungs + MQ; fewer rungs on cold titles |

**Interview line:**

> "Source lands in object storage; MQ drives transcode to 360/720/1080. The client does not transcode in real time. GOP alignment so segments decode independently; resumable-upload details go to the cloud-drive prompt. GPU only as a callout for AV1 / high volume."

trade-off: more rungs means smoother playback and more expensive storage and transcode. Opening with 20 rungs × HEVC × AV1 is over-engineering. Blocking the upload until every rung finishes makes the user think it failed—that treats sync as reliability, and it is actually a bottleneck.`,
    },
    {
      id: "sec-play",
      headingEn: "Deep dive · HLS/DASH ABR playback",
      bodyEn: `Second hard part. Hitting play is not dumping a whole mp4 onto the phone. **ABR (Adaptive Bitrate):** the player fetches the manifest first, then pulls short segments of the current rung by bandwidth; network worse → lower rung, better → switch back. Segments are ordinary HTTP files, so CDNs cache them well (Ch38).

${D2}

**This diagram cites**: Ch38 Cache & CDN

On a hit, the CDN returns the segment; you do not hammer origin every time. The diagram shows a miss so it is clear **object storage is still behind the CDN as origin**. Manifests (HLS m3u8 / DASH mpd) also ride the CDN; the first few segments of a hot title hit extremely often.

${D2}

| | Progressive download | HLS / DASH (**default**) |
|---|---|---|
| Time to first frame | Often buffers a large chunk | First segment arrives, you can play |
| Bitrate switch | One bitrate for the whole file | **Switch rungs per segment** |
| CDN | Huge objects, poor hit rate, painful origin | Small segments, Range-friendly |
| Interview | Teaching contrast | **First answer for playback in 2026** |

In 2026 you do not need to recite Smooth Streaming / HDS. Apple ecosystem is HLS; the open standard is DASH; **CMAF** lets both protocols share one set of segments and only swap the manifest—storage does not have to ×2. On the board, "HLS/DASH ABR, one copy of the segments" is enough.

Live as a callout: **LL-HLS / CMAF** takes classic HLS's tens of seconds of delay down to about 2–5 seconds; real co-hosting / meetings are WebRTC. This loop does not draw live as a second pipeline.

**Interview line:**

> "Playback is HLS/DASH: manifest + segments, player ABR. Through the CDN; miss back to origin. Do not default to whole-file progressive. Live is one sentence of LL-HLS; I won't unpack it."

trade-off: segments too long (tens of seconds) make rung switches slow and live delay worse; too short (sub-second) inflates request count and encode overhead. VOD commonly uses a few seconds per segment. Inventing a private UDP protocol as the default is over-engineering.`,
    },
    {
      id: "sec-cdn",
      headingEn: "Deep dive · CDN cost, long tail, and AV1",
      bodyEn: `Third hard part. The estimate already showed: **the money is CDN egress, not API QPS.** Access follows a long tail: a few hot titles eat most of the views; a huge pile of cold titles almost nobody clicks. Design along that distribution to save money—do not keep a full ladder of every object at every global edge.

| Move | What you do | Do not |
|---|---|---|
| Hot titles on the CDN | Viral segments stay at the edge | Preheat cold titles worldwide |
| Cold titles from origin | Serve from object storage (Ch37) | Same cache TTL as hot titles |
| Fewer rungs on cold | 360/720 first; 1080/AV1 on demand after a play | Full ladder the instant they upload |
| Regional heat | Cache only in hot regions | Pretend the globe is uniform |

You talk about ISP-partnered self-built caches when egress is in Tbps; mid/small traffic uses a managed CDN plus a long-tail policy. Do not open by building a global PoP mesh—that is over-engineering.

${D2}

**This diagram cites**: Ch38 Cache & CDN · Ch37 Storage choices

AV1 lives in this section because it is first a **trade-off on the CDN bill**: at similar quality it can cut another chunk of bitrate (public tests often say ~30% vs HEVC, more vs H.264), so egress GB drops. The cost is slower encodes, more GPU, and old devices cannot decode. So **H.264 is still the compatibility floor**; AV1 is for clients that can decode it and for hot titles with high play volume. HEVC is common on Apple devices—add a sentence on follow-up; you do not need three full encode farms on the opening board.

| | H.264 | AV1 (2026 option) |
|---|---|---|
| Compatibility | **Almost every device** | New devices / browsers; old phones fall back |
| Bandwidth | Baseline, expensive | Cheaper; directly cuts CDN GB |
| Transcode | Fast, cheap | Slow; GPU workers |
| Interview | Must be on the ladder | Hot titles / if they can decode; not the only rung |

**Interview line:**

> "CDN is the cost bottleneck. Cache hot titles, origin for cold, fewer rungs on cold. AV1 saves egress; H.264 is the floor. I will not emit a full AV1 ladder for every long-tail title."

trade-off: pre-transcoding the whole library to AV1 saves the most bandwidth, but cold titles may never play enough to pay back. H.264-only is cheapest to transcode and most expensive on the CDN. Dual rungs on hot titles, one or two H.264 rungs on cold, is the whiteboard default.`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs the original book",
      bodyEn: `<details>
<summary>What the book / notes said then (not the first answer)</summary>

Xu explained upload, the encoding ladder, HLS/DASH, and the CDN long tail clearly—those mechanisms still hold. What is outdated is stopping codecs at H.264/VP9/HEVC, treating one estimated CDN daily cost as fact, and stuffing live / short-video / recommender chapters in as the first answer.

| Book or notes | How you answer now |
|---|---|
| Codecs stop at H.264 / HEVC / VP9 | **H.264 floor + AV1 option**; HEVC in one follow-up sentence |
| Fixed full ladder | 3–4 rungs on the board; fewer on cold; per-title as a callout |
| Separate segment sets for HLS and DASH | **ABR default**; CMAF one segment set, two manifests |
| Live in one sentence or a whole extra chapter | **VOD this loop**; LL-HLS/CMAF in one sentence |
| Short video as a second architecture | **One sentence: "another system, I won't unpack it"** |
| Recommendation funnel glued onto the Feed | **This site does not do recommenders** |
| CDN ≈ $150k/day as fact | **Teaching-assumption magnitude**; do not fake an internal bill |
| 1 GB upload cap | GB-scale titles need chunks; **resumable upload deep-dive is Ch15** |
| Cloud-vendor SKU catalog | Object store + CDN + MQ; do not recite product names |

Still useful from the book: video never through the API, pre-transcode ladder, ABR segments, hot titles on CDN / cold at origin. Outdated: pretending AV1 never happened, and making notes' recommenders, moderation, and live the spine.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **"Why can't video go through the API?"** → Big bandwidth saturates the API. Bytes go through object storage / CDN; the API only signs and writes metadata.
2. **"Why transcode?"** → Compatibility, size, ABR. Source-only dies on weak networks and old devices.
3. **"What is an encoding ladder?"** → Pre-transcode the same source into 3–4 bitrate/resolution rungs; the player picks one.
4. **"Why not let the client downscale in real time?"** → Phone CPU / battery cannot take it; ABR needs server-cut segments.
5. **"HLS/DASH vs whole-file download?"** → Default is segmented ABR; CDN caches small objects. Progressive cannot switch rungs cleanly.
6. **"What if the CDN misses?"** → Go back to object storage. Hot titles should hit; cold titles are supposed to miss to origin.
7. **"CDN is too expensive—what then?"** → Long tail: cache hot, origin for cold, fewer rungs on cold. Do not fake some company's daily bill.
8. **"Why bring up AV1?"** → Saves egress bandwidth; encode is more expensive and wants GPU; H.264 is the floor.
9. **"What is a GOP?"** → A group of independently decodable frames. Segments / chunks must align. Resumable-upload details → Ch15.
10. **"How do you do live?"** → VOD this loop. LL-HLS/CMAF in one sentence; co-hosting is WebRTC. Not a live chapter.
11. **"Short video / TikTok?"** → Another system (vertical, preload). Do not unpack a second architecture.
12. **"ContentID / moderation AI?"** → After upload you can hang a fingerprint / moderation queue. Close in one sentence; do not draw it as the main path.
13. **The final diagram is already huge and they keep stacking?** → Recommendation funnel, cloud SKUs, a self-built global CDN, cloud-drive resumable-upload protocol are not this chapter. Three hard parts spoken clearly scores higher than 20 boxes.`,
    },
    {
      id: "sec-next",
      headingEn: "Wrap-up and what's next",
      bodyEn: `Wrap-up never says perfect. Three bottlenecks out loud:

| bottleneck | How you take it |
|---|---|
| Transcode backlog | MQ async 3–4 rungs; retry on failure; GPU as a callout only |
| Stalling / rung switches | HLS/DASH ABR; segments through the CDN; do not default to progressive |
| CDN bill | Long-tail tiers; fewer rungs on cold; AV1 on hot titles, H.264 as the floor |

Self-check: close this page. 30-second opening + high-level on the board; walk encoding ladder, HLS/DASH, CDN long tail plus AV1 to the air. Wherever you stumble, come back to that section.

Next problem is **Ch15 · Design a cloud drive**. Video only callouts GOP / chunking; the cloud-drive chapter unpacks resumable upload, versions, and conflicts—from "how a large file plays" to "how a large file syncs."`,
    },
  ],
  reviewMdEn: `# Ch14 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | Three hard parts of video? | Upload + transcode pipeline; HLS/DASH ABR; CDN cost / long tail (AV1 sits in the bandwidth trade-off). |
| 2 | VOD or live? | **Default VOD**. Live is a callout to LL-HLS/CMAF, not its own chapter. |
| 3 | High-level pipeline? | Client → Upload API → object store → transcode → CDN. Video never through the API. |
| 4 | Why transcode? | Compatibility, size, ABR. Server pre-transcodes the ladder; the client only picks a rung. |
| 5 | How many rungs on the encoding-ladder board? | 3–4: 360 / 720 / 1080, plus AV1 if they can decode. Do not open with an 8×3 matrix. |
| 6 | How is transcode driven? | Object-store write → MQ → worker (Ch42). Upload HTTP must not wait synchronously. |
| 7 | HLS/DASH vs progressive? | Segments + manifest, player ABR, CDN-friendly. Whole file cannot switch bitrate cleanly. |
| 8 | Playback miss path? | Player → CDN → miss then origin (object store) → fill the segment. |
| 9 | Real bottleneck on this prompt? | **CDN egress money** and transcode compute, not play-start QPS. Teaching assumptions; do not fake an internal bill. |
| 10 | How does the long tail save CDN? | Hot titles at the edge; cold titles from origin; fewer rungs on cold. |
| 11 | AV1 vs H.264? | AV1 saves bandwidth, encode is expensive; H.264 is the all-device floor. AV1 on hot titles only. |
| 12 | GOP / chunking and Ch15? | GOP alignment so pieces decode independently. Resumable upload deep-dive belongs to cloud drive. |`,
});
