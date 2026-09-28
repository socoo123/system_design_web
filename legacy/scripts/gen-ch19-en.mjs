import { writeChapterEn } from "./write-chapter-en.mjs";

const D2 = "```d2\n_\n```";

writeChapterEn({
  id: "ch19",
  titleEn: "Nearby / LBS",
  sections: [
    {
      id: "intro",
      headingEn: "",
      bodyEn: `> **Time**: 50–60 min ｜ **Prereq**: hashing Ch05; storage Ch37
> **Goal**: geohash / H3, radius neighbor cells, hotspot sharding. Privacy in one sentence. No map rendering, no delivery matching.

Nearby is the first full case in M4. Orders finished "how one transaction stays consistent"; this one swaps in **how you query nearby points**. Default is Dianping / map "search nearby"—**businesses, POIs, people, or things inside a radius, ranked by distance**. Not Google Maps tile rendering (elective), not instant-delivery supply-demand matching (Ch27), not recommendations.

It looks like "take lat/lng and search a circle." Three hard parts: **how you turn 2D into an indexable key (geohash / H3)**, **radius query and neighbor cells**, **how hotspot cells shard**. The interviewer is not scoring a road network, a tile CDN, or some map vendor's QPS. They want: can a cell be a key, do you miss points across a cell edge, and does downtown's one cell blow up a single key.`,
    },
    {
      id: "sec-answer",
      headingEn: "How to answer in the interview",
      bodyEn: `**Opening 30 seconds (say it out loud):**

> "Nearby has three hard parts: turn 2D into an indexable key, radius query with neighbor cells, hotspot cell sharding. Default is nearby businesses / POI, radius plus ranking; not map rendering, not delivery matching. Whiteboard default is **geohash prefix**; **H3 hexagons** are the 2026 backup—do not answer H3 only. Index: DB prefix scan or Redis GEO; query the current cell plus neighbors. Scale by geohash-prefix shards (Ch05 / Ch37). Privacy in one sentence: coarse location, short retention, no traces."

Then walk the 4 steps. Do not lead with a tile pyramid or an H3 encyclopedia.

${D2}

| Time-box | What you are doing |
|---|---|
| 3–10 min | Clarify: nearby POI vs people, radius, static vs check-in, ranking, no rendering/delivery |
| Next 2 min | back-of-envelope: nearby-search read QPS; POI writes are rare; the fear is hot cells |
| 10–15 min | High-level: Client → Nearby API → geo index + POI store |
| 10–25 min | deep dive: geohash/H3 keys, current cell + neighbors, prefix shards |
| 3–5 min | wrap-up: 3 bottlenecks (no neighbors → miss the edge; single GEO key; downtown hot cell) |

**red flag:** drawing map rendering / delivery matching / recs before asking scope; H3 as the only answer; a B-tree on lat and another on lng as the first design; no neighbor cells; turning PostGIS into a chapter; inventing some map vendor's QPS. That is over-engineering, or dragging a neighbor / elective chapter in whole.`,
    },
    {
      id: "sec-clarify",
      headingEn: "Clarifying questions",
      bodyEn: `Drawing before you clarify = Jimmy. On LBS, stop at 5–7 questions; assume the rest and write the board. **The first question must be scope.**

| You ask | Typical answer / your assumption | What it changes |
|---|---|---|
| Nearby businesses / POI, nearby people, or maps / delivery? | **Nearby businesses / POI** (radius + ranking) | rendering is elective; matching is Ch27 |
| How do you pick the radius? | Teaching: **0.5 / 1 / 2 / 5 km** | maps to geohash length or H3 resolution |
| Static catalog or live check-ins? | **Static POI**, CRUD is rare | "nearby people" is when the write path gets hot |
| Rank by distance? | **Yes**; cells coarse-filter, then exact distance | you cannot return unordered IDs inside a cell |
| Type / hours filters? | **Post-filter** | recall first, then filter; no inverted-index chapter on the board |
| Rough DAU? | Teaching: **~10 million** | estimates read QPS and hot cells—not some map vendor's internal number |

When they say "you decide," write the assumptions:

> "I'll assume: nearby businesses / POI, not map rendering, not instant delivery. Radius 0.5–5 km, ranked by distance. Index is geohash prefix (DB or Redis GEO); query the current cell plus 8 neighbors. H3 as a backup cell type. Shard by prefix. Location is coarse-grained, short TTL. I'll draw on that—cut me off if it's wrong."

If they chase map tiles, navigation graphs, rider matching: **acknowledge the difference, then close it.** "Tiles and road networks are Maps elective; delivery is two-sided matching, Ch27. This loop is radius recall and cell indexes." If they chase "nearby people": same keys, only location reports become a write hotspot—mention it, do not turn it into a traces system. Asking past 10 minutes is also a red flag. The golden line is still: **ask the key questions → state your own assumptions → write the board → move.**`,
    },
    {
      id: "sec-estimate",
      headingEn: "Back-of-the-envelope",
      bodyEn: `Formulas live in Ch03. Here you only need order of magnitude: prove you know **this prompt's bottleneck is radius reads on hot cells, not "nationwide POI writes."** Whiteboard **teaching assumptions** below—not some map vendor's internal numbers, and not some app's public DAU.

Assume ~**10 million DAU**; each person searches nearby ~**5 times**/day; POI catalog ~**20 million**. Merchant CRUD is far below search. Lunch and downtown hammer the same cells again and again.

| Item | How you estimate | Order of magnitude (teaching) |
|---|---|---|
| Search QPS | 1e7 × 5 / 86400 | **~6e2**; peak ×5 is still **thousands** |
| POI writes | CRUD is rare | **far below reads**; next-day apply is OK |
| Catalog storage | ~0.5–1 KB × 2e7 | **~10–20 GB** of details; geo keys are smaller |
| Hot cells | reads follow Zipf | a few downtown prefixes eat most QPS |
| Nearby people (if they change the prompt) | location reports | writes become a hotspot; the index idea stays |

Searching nearby does not look expensive. What is expensive is: **the same prefix getting punched through at city-wide lunch** (one Redis GEO key or one DB partition), and **skipping neighbor cells so you miss the edge**. Drawing ingress as "some map vendor's million QPS" without cells and shards is inventing numbers, not estimating.

**Interview line:**

> "Ten million DAU on the board: nearby search is hundreds of QPS daily, thousands at peak. Writes are rare. What I actually fear is downtown's one cell—shard by geohash prefix, then split hot cells finer. I will not treat some map vendor's peak as an internal number."

Common mistakes: treating a public "DAU / place count" as your own fact QPS; or reporting only a national average and pretending downtown and the desert are equally empty. Teaching uses order of magnitude, and you **label the assumptions**.`,
    },
    {
      id: "sec-arch",
      headingEn: "High-level architecture",
      bodyEn: `Left to right, draw only **one read control plane**: Client → Nearby API → geo index + POI store. Do not fan out a tile CDN, a road network, delivery dispatch, or multi-Region on this diagram. The geo index is **geohash prefix → ID list** (Postgres prefix / Redis GEO, Ch37); details live in another table, hydrated by \`poi_id\`. After they buy in, split how keys encode and how you query neighbors.

${D2}

**This diagram cites**: Ch37 Storage choices · Ch05 Consistent hashing

**Read path:** client sends \`(lat, lng, radius)\` → API encodes the point into the current cell → compute neighbor cells → query the index in parallel for candidate IDs → hydrate details → rank by true distance, truncate top-K. The list returns a summary only (name, distance, coords); tapping through hits the POI table.

**Write path (POI):** business / ops change a row → write the details table + update that point's geohash row (or \`GEOADD\`). A static catalog can rebuild the index nightly; "nearby people" is what needs high-frequency \`GEOADD\`. **Do not** scan the whole table computing distance on the request thread.

**Privacy (one sentence, then stop):** store only a coarse cell (truncated geohash), short TTL, no full traces—this is not a GDPR chapter.

${D2}

Stop the high-level here. Ask: "Does this direction look OK? Next I'll dig into how 2D becomes a key, then radius and neighbors, then hotspot sharding."

**Interview line:**

> "Clients hit Nearby API. Behind it: geo index plus POI details. Recall by cell first, then hydrate and rank by distance. Privacy: coarse cells, short retention."`,
    },
    {
      id: "sec-geokey",
      headingEn: "Deep dive · Turning 2D into an indexable key",
      bodyEn: `First hard part. A relational B-tree eats **one-dimensional ordered keys**. Index \`lat\` and \`lng\` separately then intersect: both ranges are still huge, so you never turned "nearby" into a seek. 2026 whiteboard first sentence: **tile the plane into cells, use the cell ID as the key.**

${D2}

**This diagram cites**: Ch37 Storage choices

**Geohash (default):** interleave lat/lng bits into a base32 string. One more character = a smaller cell; **the longer the shared prefix, the more likely they are close**. Map radius to length (enough for the board): ~0.5 km → length 6; 1–2 km → 5; 5–20 km → 4. Any store that can prefix-scan works: \`WHERE geohash LIKE 'wx4g%'\`, or Redis GEO (under the hood geohash as a sorted-set score, \`GEOADD\` / \`GEOSEARCH\`).

**H3 (backup, Uber-style hexagons):** hexes on the sphere; a cell is a 64-bit integer. **All 6 edge neighbors are equidistant from the center**; \`gridDisk(k)\` / k-ring is cleaner than square "edge vs corner." One resolution step is one cell size. On the board you can say "same pattern: point → cell → query a set of cells"; **do not make H3 the only correct answer**—add one sentence on whether the library / language is already there.

| | Geohash (**default**) | H3 (**backup**) | Quadtree / PostGIS |
|---|---|---|---|
| Key | string prefix | uint64 cell | in-memory tree / GiST |
| Neighbors | 8 (edge+corner, uneven distance) | 6 equidistant; k-ring is tidy | walk the tree up / spatial functions |
| Into storage | **any prefix index, Redis GEO** | Redis SET / shard key by cell | single box or a relational mention |
| Interview | **draw this first** | one cell when they chase "hexagons" | density-adaptive / polygons: mention and stop |

Quadtree: dense areas split fine, sparse stay coarse—fits in-memory single box. PostGIS: \`ST_DWithin\` on GiST; useful for polygons / exact geometry. **This loop does not unpack a spatial-index encyclopedia**—naming the trade-off "cell keys vs relational spatial index" is enough. S2 / Hilbert wait for Maps / geofences; do not dig here.

**Interview line:**

> "Drop 2D to a cell ID. Default is geohash prefix; Redis GEO is that. H3 is the hexagon backup—neighbors are more even, not the only answer. Quadtree / PostGIS, mention only."

trade-off: geohash is simple and stores anywhere; cells stretch at high latitude, and corner neighbors are farther. H3 spreads a radius more evenly, but you depend on a library—if you cannot speak resolution, do not force it. Rolling a quadtree from scratch as the first answer, for static POI, is over-engineering.`,
    },
    {
      id: "sec-radius",
      headingEn: "Deep dive · Radius query and neighbor cells",
      bodyEn: `Second hard part. Cells are a **coarse filter**: the circle sits on a cell edge, so querying only the current cell misses points on the other side; if the cell is bigger than the circle, you recall points outside. 2026 default: **current cell + neighbor cells, then filter and rank by true distance.**

${D2}

**This diagram cites**: Ch37 Storage choices

**Geohash edges:** a long shared prefix → usually close; **close → long shared prefix does not hold**. Two points across a cell edge, the equator, or the prime meridian can share almost no prefix. So you must **compute the 8 neighbor geohashes (O(1)) and query them with the current cell**. Only \`LIKE 'current-prefix%'\` is a red flag.

**H3:** \`gridDisk(k)\`. k=1 is the center plus 6 neighbors (7 cells); larger radius, bump k. Hexes do not have the square disease of "corner neighbors √2 farther," but **a cell is still an approximation**—points outside the circle still get filtered.

Exact distance: after cell recall, spherical distance (Haversine-class) from user to POI, **sort ascending and truncate**. On the board write "coarse filter then compute distance." Do not recite the formula, and do not pretend every point in the cell is inside the radius.

Not enough inside the radius: geohash **drop the last character** (one coarser cell) and query neighbors again; H3 **bump k**. First agree "only return inside the radius"; if that is empty, return empty or prompt them to zoom out—expanding the search is extra credit, not a default you must finish.

${D2}

A single-key Redis \`GEOSEARCH BYRADIUS\` does geohash neighborhoods inside the engine—**great for a prototype**. At scale one GEO key does not shard—next section splits keys by cell, and the API fans out to neighbor cells then merges. You need both stories; do not pretend "one GEOSEARCH line" is a global architecture.

**Interview line:**

> "Current cell plus neighbors, merge IDs, then filter and rank by distance. Close in geohash is not the same as a shared prefix. If the radius is empty, drop precision or bump the k-ring."

trade-off: querying 8 extra cells / one k-ring buys you not missing the edge. The recall set gets larger; you cut with distance and COUNT. Scanning neighboring regions or the whole table so you "never miss" turns a radius query into a scan.`,
    },
    {
      id: "sec-hotspot",
      headingEn: "Deep dive · Hotspot cells and sharding",
      bodyEn: `Third hard part. Both POI and traffic are **geo-skewed**: downtown one cell is packed with shops and lunch QPS; a suburban cell is almost empty. One nationwide Redis GEO, or hashing by \`poi_id\`, turns "nearby" into scatter-gather, or dumps hot writes into the same sorted set. 2026 default: **shard by geohash prefix (or H3 cell)**—the same sentence as Ch05's ring and Ch37's shard key.

${D2}

**This diagram cites**: Ch05 Consistent hashing · Ch37 Storage choices

The shard key is a **cell prefix**, not user ID: one radius query only hits the current cell's shard plus a few neighbor shards (neighbors usually sit next to the current prefix, so most still land on one or two shards). Prefix too short (length 3) → one shard holds half a province, the hot zone still explodes; too long → one query fans out to dozens of shards. On the board pick **a length that matches the radius** (5–6) for routing; split a hot prefix into a longer prefix, or add replicas on that prefix.

Redis GEO: **one key is one sorted set; writes and \`GEOSEARCH\` all pile onto the same point.** Scale-out is many keys \`geo:{prefix}\` or \`geo:{h3cell}\`; the query parallel mget / pipelines neighbor cells. H3's gift is that a cell is a natural shard name; geohash works the same. Consistent hashing maps prefixes onto nodes (Ch05); when the prefix set changes, use virtual nodes, avoid \`% N\`.

Split hot cells again: downtown length 6 still blows up → that region stores and queries at length 7; the query side picks precision from the radius. Replicas: a read-heavy prefix gets a read replica—that is not the same sentence as "the whole geo table is read replicas, never split." Once the catalog and QPS are large, **prefix sharding is the 2026 default**; a small dataset on one box + replicas still holds—state the assumption when they chase it.

Cache, mention only: key on cell ID, not raw lat/lng (GPS jitter blows up cache entries). A hot prefix's ID list can take a short TTL. Do not unpack a global multi-Region lecture on this prompt; "deploy nearby" in one sentence is enough.

**Interview line:**

> "Shard by geohash prefix, not by POI id. Split Redis GEO into one key per cell. Downtown: split finer or add replicas. Ch05's ring hangs prefixes."

trade-off: prefix shards localize a radius query; you still split hot cells a second time, and neighbors may cross shards. Hashing by ID looks even; one nearby query becomes a broadcast. The book's "the geo index is small so we do not shard" is not the first answer once you have tens of millions of POI plus a hot-city Redis—park it in the fold for contrast.`,
    },
    {
      id: "sec-2026",
      headingEn: "2026 vs the book",
      bodyEn: `<details>
<summary>How the book / notes told it then (not the first answer)</summary>

Xu Vol.2 Nearby walks **2D scan → uniform grid → geohash → quadtree → S2** thoroughly. Edges, neighbor cells, and read-heavy vs write still hold. What aged is treating quadtree memory estimates as a must-dig, "the geo index is read replicas only, never split," and never mentioning Redis GEO / H3. Long GDPR notes, geofencing, some company's QPS—do not put those in this loop's body.

| Book or notes | How you answer now |
|---|---|
| Interview: geohash **or** quadtree, unpack one | **Whiteboard default geohash**; quadtree, mention only |
| Walk all five index evolutions | Cell key + neighbors first; S2 / uniform grid wait for follow-ups |
| No Redis GEO | **GEOADD / GEOSEARCH**; under the hood geohash + ZSET |
| No H3 | **Hexagon backup**; not the only answer |
| Geo index unsharded, rely on read replicas | **Shard by geohash prefix**; single box + replicas only when the data is small |
| Privacy is just the word GDPR | **One sentence**: coarse + short retention |
| PostGIS / GiST later padded into an encyclopedia | **Spatial index, mention only** |
| 100M DAU, some map vendor QPS as recitation | **Teaching assumptions**; order of magnitude only |
| Map rendering, geofencing push unpacked | **Not this loop**; Maps elective, delivery Ch27 |

Still-valid skeleton: 2D must drop to cells, geohash must query neighbors, POI reads dwarf writes, list and details split. Outdated is a quadtree-memory lecture and "never shard" as the 2026 first diagram.

</details>`,
    },
    {
      id: "sec-traps",
      headingEn: "Follow-up traps",
      bodyEn: `1. **"Is this maps or delivery?"** → Default nearby POI ranked by radius. Tile rendering is elective; rider matching Ch27.
2. **"Why not an index on lat and another on lng?"** → 1D range intersection is still huge. You need a cell key to seek.
3. **"A long geohash prefix means they are close?"** → Usually close; the converse does not hold. Across an edge you must query neighbors.
4. **"Why must you query 8 neighbors?"** → The circle sits on a cell edge; the other side has a different prefix. Missing the edge is a functional bug.
5. **"Can I answer H3 only?"** → Fine as a backup. Whiteboard default is geohash / Redis GEO. On H3, speak equidistant neighbors and k-ring.
6. **"Is Redis GEO enough?"** → For a prototype, one \`GEOSEARCH\` line is enough. One key cannot shard; split keys by cell.
7. **"Shard by poi_id?"** → One nearby query becomes scatter-gather. Shard key is the cell prefix (Ch05).
8. **"Why did the book not shard the geo index?"** → They assumed a tiny working set; the bottleneck was reads. After hot-city + a single Redis key, prefix shards are the default.
9. **"Downtown cell is full?"** → Longer prefix, split finer, or replica that prefix. Not one nationwide ZSET.
10. **"How do you rank distance?"** → Cells coarse-filter, then sort by spherical distance. Do not recite the formula; do not pretend every in-cell point qualifies.
11. **"Location privacy?"** → Coarse cells, short retention, no traces. Not a compliance chapter.
12. **The final diagram is already huge and they keep stacking?** → Tiles, road networks, delivery, recs, a PostGIS encyclopedia are not this chapter. Three hard parts spoken clearly scores higher than 20 boxes.`,
    },
    {
      id: "sec-next",
      headingEn: "Wrap-up and what's next",
      bodyEn: `Wrap-up never says perfect. Three bottlenecks out loud:

| bottleneck | How you take it |
|---|---|
| 2D cannot seek / miss the edge | geohash or H3 as the key; current cell + neighbors; then rank by distance |
| Single GEO key / shard by ID | Split keys and shards by geohash prefix (Ch05 / Ch37) |
| Downtown hot cell | Longer prefix, split finer, or replica that prefix |

Self-check: close this page. 30-second opening + high-level on the board; walk geohash as default, neighbor cells, and prefix shards to the air. H3 is one comparison cell. Privacy in one sentence. Wherever you stumble, come back to that section. Do not unpack map rendering or delivery matching out loud.

Next problem is **Ch20 · Distributed message queue**. LBS is a geo index on the read path; the queue swaps in partitions, consumer groups, ISR—from "how you query nearby" to "how events travel reliably."`,
    },
  ],
  reviewMdEn: `# Ch19 · Flashcards

| # | Front | Back |
|---|---|---|
| 1 | Three hard parts of LBS? | 2D → cell key (geohash/H3); radius query + neighbor cells; hotspot cell sharding. Privacy in one sentence. |
| 2 | Default scope? | **Nearby businesses / POI + rank by radius**. Not map rendering, not delivery matching (Ch27), not recs. |
| 3 | Whiteboard default index? | **Geohash prefix** (DB or Redis GEO). H3 hexagons are the 2026 backup, not the only answer. |
| 4 | Why not two B-trees on lat/lng? | 1D range intersection is still huge. Only a cell ID turns "nearby" into a seek on the key. |
| 5 | Long geohash prefix = must be close? | Usually close; **close ≠ long prefix**. Across an edge, query current cell + 8 neighbors. |
| 6 | What is H3 better at than squares? | 6 edge neighbors equidistant; k-ring is tidy. Still filter points outside the circle. Do not answer H3 only. |
| 7 | How do you use Redis GEO, and the cap? | \`GEOADD\` / \`GEOSEARCH\`; under the hood geohash+ZSET. One key does not shard; split keys by cell. |
| 8 | How do you rank distance? | Cells coarse-filter, then spherical distance, sort and truncate. In-cell points are not guaranteed inside the radius. |
| 9 | How do you shard? | **geohash prefix / H3 cell** (Ch05). Do not scatter nearby by poi_id. |
| 10 | Hot cell? | Longer prefix, split finer, or replica that prefix. One nationwide GEO is a red flag. |
| 11 | How far do you go on privacy? | **Coarse cells + short retention**, no traces. Not a GDPR chapter. |
| 12 | Biggest over-engineering on this prompt? | Map rendering, delivery matching, H3 only, PostGIS encyclopedia, fake map-vendor QPS. Speak the three hard parts. |`,
});
