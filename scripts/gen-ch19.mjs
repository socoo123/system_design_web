import { writeChapter } from "./write-chapter.mjs";

const d2 = (src) => {
  const body = src.trim();
  const sized = /style\.font-size/.test(body) ? body : `style.font-size: 12\n${body}`;
  return "```d2\n" + sized + "\n```";
};

writeChapter({
  id: "ch19",
  num: "19",
  title: "邻近服务 / LBS",
  kind: "case",
  relatedChapters: ["ch37", "ch05"],
  sections: [
    {
      id: "intro",
      heading: "",
      secNum: null,
      related: [],
      body: [
        "> **预计**：50–60 分钟 ｜ **前置**：哈希 Ch05；存储 Ch37",
        "> **目标**：geohash / H3、半径邻格、热点分片。隐私一句。不讲地图渲染，不讲配送匹配。",
        "",
        "邻近服务是 M4 第一道完整 case。订单把「一笔交易怎么一致」讲完；这题换成 **附近的点怎么查**。默认是点评 / 地图搜附近那种 **半径内的商家、POI、人或物 + 按距离排序**，不是 Google Maps 瓦片渲染（选修），不是即时配送供需匹配（Ch27），不是推荐。",
        "",
        "系统看起来就是带 lat/lng 搜一圈。三个 hard part：**怎么把二维变成可索引的键（geohash / H3）**、**半径查询与邻格**、**热点格子怎么分片**。面试官要看的不是你能不能画出路网、瓦片 CDN、某图商 QPS，而是：格子怎么当键、边界对面会不会漏、市中心那一格会不会把单 key 打满。",
      ].join("\n"),
    },
    {
      id: "sec-answer",
      heading: "面试怎么答",
      secNum: null,
      related: [],
      body: [
        "**开场 30 秒（直接说）：**",
        "",
        "> 「邻近服务三个 hard part：二维变成可索引的键、半径查询带邻格、热点格子分片。默认附近商家 / POI，半径加排序；不是地图渲染，不是配送匹配。白板默认 **geohash 前缀**；**H3 六边形**当 2026 备选，不要只答 H3。索引：DB 前缀扫描或 Redis GEO，当前格加邻居一起查。规模按 geohash 前缀分片（Ch05 / Ch37）。隐私一句：粗粒度位置、短保留，不留轨迹。」",
        "",
        "然后按 4 步走，别一上来画瓦片金字塔或 H3 百科。",
        "",
        d2(`
direction: right
s1: "1 澄清估算"
s2: "2 高层索引"
s3: "3 邻格半径"
s4: "4 热点分片"
s1 -> s2 -> s3 -> s4
`),
        "",
        "| 时间盒 | 你在做什么 |",
        "|---|---|",
        "| 3–10 min | 澄清：附近 POI vs 人、半径、静态 vs 上报、排序、不要渲染/配送 |",
        "| 接着 2 min | back-of-envelope：搜附近读 QPS；POI 写很少；怕的是热格子 |",
        "| 10–15 min | 高层：Client → Nearby API → geo index + POI store |",
        "| 10–25 min | deep dive：geohash/H3 键、当前格+邻格、前缀分片 |",
        "| 3–5 min | wrap-up：3 个 bottleneck（无邻格漏边、单 GEO key、市中心热格） |",
        "",
        "**red flag：** 还没问范围就画地图渲染 / 配送匹配 / 推荐；只答 H3 当唯一答案；对 lat/lng 各建一棵 B-tree 当第一方案；不查邻格；把 PostGIS 讲成一章；编造某图商 QPS。那是 over-engineering，或把邻章 / 选修整章搬进来。",
      ].join("\n"),
    },
    {
      id: "sec-clarify",
      heading: "澄清问题清单",
      secNum: "19.1",
      related: [],
      body: [
        "没问清楚就画图 = Jimmy。LBS 这题 5–7 个问题就停，其余自己假设写白板。**第一问必须是范围。**",
        "",
        "| 你问 | 典型回答 / 你自己的假设 | 它改什么 |",
        "|---|---|---|",
        "| 附近商家 / POI、附近的人，还是地图 / 配送？ | **附近商家 / POI**（半径 + 排序） | 渲染是选修；匹配是 Ch27 |",
        "| 半径怎么选？ | 教学：**0.5 / 1 / 2 / 5 km** | 映射 geohash 长度或 H3 resolution |",
        "| 静态目录还是实时上报？ | **POI 静态**，CRUD 低频 | 「附近的人」写路径才热 |",
        "| 要按距离排序吗？ | **要**；格子粗筛，精确距离再排 | 不能只返回格内无序 ID |",
        "| 类型 / 营业时间过滤？ | **后置过滤** | 先召回再滤，白板上不要倒排专章 |",
        "| DAU 大概多少？ | 教学：**约 1000 万** | 用来估读 QPS 和热格，不是某图商内部数 |",
        "",
        "面试官说「你定」时，把假设写上去：",
        "",
        "> 「我假设：默认附近商家 / POI，不是地图渲染，不是即时配送。半径 0.5–5 km，按距离排序。索引用 geohash 前缀（DB 或 Redis GEO），查询当前格加 8 邻格。H3 作为备选格子。按前缀分片。位置只存粗粒度、短 TTL。先按这个画，不对你打断我。」",
        "",
        "问到地图瓦片、导航路网、骑手匹配：**承认差别，立刻收口。** 「瓦片和路网是 Maps 选修；配送是供需双边匹配，Ch27。本场把半径召回和格子索引讲透。」问到「附近的人」：同一套键，只是位置上报变成写 hotspot——点到即可，不要改成轨迹系统。问太多超过 10 分钟也是 red flag。黄金线还是那条：**问关键问题 → 自己给假设 → 写白板 → 继续。**",
      ].join("\n"),
    },
    {
      id: "sec-estimate",
      heading: "粗估",
      secNum: "19.2",
      related: ["ch03"],
      body: [
        "公式细节在 Ch03。这里只要数量级，证明你知道 **这题 bottleneck 是热格子上的半径读，不是「全国 POI 写入」。** 下面用白板做**教学假设**，不是某图商内部数字，也不是某款 App 的公开 DAU。",
        "",
        "假设：约 **1000 万 DAU**；每人每天搜附近约 **5 次**；POI 目录约 **两千万**。商家增删改远小于搜索。饭点、市中心同一批格子被反复打。",
        "",
        "| 项 | 怎么估 | 量级（教学假设） |",
        "|---|---|---|",
        "| 搜索 QPS | 1e7 × 5 / 86400 | **约 6e2**；峰值 ×5 仍是 **千级** |",
        "| POI 写入 | CRUD 低频 | **远小于读**；次日生效也可接受 |",
        "| 目录存储 | 每条约 0.5–1 KB × 2e7 | **约 10–20 GB** 详情；geo 键更小 |",
        "| 热格子 | 读服从 Zipf | 少数 downtown 前缀吃掉大量 QPS |",
        "| 附近的人（若改题） | 位置上报 | 写变成 hotspot；索引思路不变 |",
        "",
        "搜附近看起来不贵。贵的是：**同一前缀被全市饭点打穿**（单 Redis GEO key 或单库分区），以及 **不查邻格导致边界漏结果**。把入口画成「某图商百万 QPS」却不讲格子和分片，是编数字，不是估算。",
        "",
        "**面试怎么说：**",
        "",
        "> 「千万 DAU 白板：搜附近日均几百 QPS，峰值千级。写很少。真正怕的是市中心那一格——按 geohash 前缀分片，热格再切细。不会拿某图商峰值当内部数。」",
        "",
        "常见算错：把公开的「日活 / 地点数」当成自己的事实 QPS；或只报全国平均、假装 downtown 和沙漠一样空。教学用数量级，并标**假设**。",
      ].join("\n"),
    },
    {
      id: "sec-arch",
      heading: "高层架构",
      secNum: "19.3",
      related: ["ch37", "ch05"],
      body: [
        "从左到右只画 **一条读控制面**：Client → Nearby API → geo index + POI store。不要在这张图上扇出瓦片 CDN、路网、配送调度、多 Region。geo index 是 **geohash 前缀 → ID 列表**（Postgres 前缀 / Redis GEO，Ch37）；详情另表按 `poi_id` 补全。面试官 buy-in 之后再拆键怎么编码、邻格怎么查。",
        "",
        d2(`
direction: right
app.class: go
app: "Client"
api.class: step
api: "Nearby API"
idx.class: store
idx: "Geo index"
poi.class: store
poi: "POI store"
app -> api
api -> idx
api -> poi
`),
        "",
        "**本图引用**：Ch37 存储选型 · Ch05 一致性哈希",
        "",
        "**读路径：** 客户端带 `(lat, lng, radius)` → API 把点编成当前格 → 算出邻居格 → 并行查 index 拿候选 ID → 详情 hydrate → 按真实距离排序、截断 top-K。列表只返回摘要（名、距、坐标），点进详情再查 POI 表。",
        "",
        "**写路径（POI）：** Business / 运营改一条 → 写详情表 + 更新该点的 geohash 行（或 `GEOADD`）。静态目录可以 nightly 重建 index；「附近的人」才需要高频 `GEOADD`。**不要**在请求线程里扫全表算距离。",
        "",
        "**隐私（一句就停）：** 位置只存粗粒度格子（截断 geohash）、短 TTL，不留完整轨迹——不是 GDPR 专章。",
        "",
        d2(`
grid-columns: 2
coarse: {
  label: "粗粒度"
  class: groupOk
  grid-columns: 1
  a.class: ok
  a: "截断 geohash"
}
keep: {
  label: "短保留"
  class: groupOk
  grid-columns: 1
  b.class: ok
  b: "短 TTL 不留轨迹"
}
`),
        "",
        "高层图到这里就该停，问一句：「方向 OK 吗？接下来挖二维怎么变成键，然后是半径和邻格，最后热点分片。」",
        "",
        "**面试怎么说：**",
        "",
        "> 「Client 打 Nearby API。后面是 geo index 加 POI 详情。先按格子召回，再补全、按距离排。隐私：粗格子、短保留。」",
      ].join("\n"),
    },
    {
      id: "sec-geokey",
      heading: "深入 · 二维变成可索引的键",
      secNum: "19.4",
      related: ["ch37"],
      body: [
        "第一个 hard part。关系库的 B-tree 吃的是 **一维有序键**。对 `lat`、`lng` 各建索引再求交集，两个范围仍然巨大，等于没把「附近」变成 seek。2026 白板第一句：**把平面切成格子，格子 ID 当键。**",
        "",
        d2(`
grid-columns: 2
gh: {
  label: "Geohash · 白板默认"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "前缀即缩放"
  b.class: ok
  b: "Redis GEO"
}
hx: {
  label: "H3 · 2026 备选"
  class: group
  grid-columns: 2
  c.class: step
  c: "六边形 k-ring"
  d.class: step
  d: "邻居等距"
}
`),
        "",
        "**本图引用**：Ch37 存储选型",
        "",
        "**Geohash（默认）：** 经纬度比特交错，编成 base32 字符串。多一位 = 格子更小；**公共前缀越长，越可能靠近**。半径映射长度即可（白板够用）：约 0.5 km → 长度 6；1–2 km → 5；5–20 km → 4。任意能做前缀扫描的存储都能用：`WHERE geohash LIKE 'wx4g%' `，或 Redis GEO（底层就是 geohash 当 sorted-set score，`GEOADD` / `GEOSEARCH`）。",
        "",
        "**H3（备选，Uber 风格六边形）：** 球面铺六边形，cell 是 64-bit 整数。**6 个边邻居到中心等距**，`gridDisk(k)` / k-ring 比方形「边邻 vs 角邻」干净。分辨率一档对应一种格大小。白板可以说「同一套：点 → cell → 查 cell 集合」；**不要把 H3 讲成唯一正确答案**，实现和邻居表要多带一句「库 / 语言是否现成」。",
        "",
        "| | Geohash（**默认**） | H3（**备选**） | Quadtree / PostGIS |",
        "|---|---|---|---|",
        "| 键 | 字符串前缀 | uint64 cell | 内存树 / GiST |",
        "| 邻居 | 8 个（边+角，距离不均） | 6 个等距；k-ring 整齐 | 树往上扩 / 空间函数 |",
        "| 进存储 | **任何前缀索引、Redis GEO** | 按 cell 做 Redis SET / 分片键 | 单机或关系库点到 |",
        "| 面试 | **先画这个** | 追问「六边形」时再铺一格 | 密度自适应 / 多边形：点到即停 |",
        "",
        "Quadtree：密集区切细、稀疏区切粗，适合内存单机。PostGIS：`ST_DWithin` 走 GiST，多边形 / 精确几何用得上。**本场不展开空间索引百科**——能说「格子键 vs 关系库空间索引」的 trade-off 就够。S2 / Hilbert 留给 Maps / 围栏，本场不挖。",
        "",
        "**面试怎么说：**",
        "",
        "> 「二维降成格子 ID。默认 geohash 前缀，Redis GEO 就是它。H3 是六边形备选，邻居更齐，不是唯一答案。Quadtree / PostGIS 点到。」",
        "",
        "trade-off：geohash 实现简单、处处能存，格子在高纬拉长、角邻居更远。H3 半径扩散更匀，但要依赖库、面试讲不清分辨率就别硬上。自己从零实现四叉树当第一答案，对静态 POI 是 over-engineering。",
      ].join("\n"),
    },
    {
      id: "sec-radius",
      heading: "深入 · 半径查询与邻格",
      secNum: "19.5",
      related: ["ch37"],
      body: [
        "第二个 hard part。格子是 **粗筛**：圆会压在格边上，只查当前格会漏掉对面的点；格比圆大，又会召回圈外的点。2026 默认：**当前格 + 邻居格，再按真实距离过滤排序。**",
        "",
        d2(`
direction: right
loc.class: go
loc: "当前格"
nei.class: step
nei: "邻格集合"
union.class: step
union: "合并候选"
rank.class: ok
rank: "距离排序"
loc -> nei -> union -> rank
`),
        "",
        "**本图引用**：Ch37 存储选型",
        "",
        "**Geohash 边界：** 公共前缀长 → 往往近；**近 → 公共前缀长并不成立**。跨格边、跨赤道 / 本初子午线的两点可以几乎无公共前缀。所以必须把 **8 个邻居 geohash 算出来（O(1)）和当前格一起查**。只 `LIKE '当前前缀%'` 是 red flag。",
        "",
        "**H3：** `gridDisk(k)`。k=1 是中心加 6 邻（7 格）；半径更大就加 k。六边形没有「角邻居更远 √2」那种方形病，但 **cell 仍是近似**，圈外点照样要滤掉。",
        "",
        "精确距离：格子召回之后用球面距离（Haversine 一类）算用户到 POI，**升序截断**。白板上写「粗筛再算距」，不要默写公式，也不要假装格内点都在半径里。",
        "",
        "半径内不够：geohash **丢掉最后一位**（格放大一级）再查邻格；H3 **加大 k**。先约定「只返回半径内」，不够就空或提示放大——扩搜是加分，不是默认必须做完。",
        "",
        d2(`
shape: sequence_diagram
cli: "Client"
api: "Nearby API"
idx: "Geo index"
poi: "POI store"
cli -> api: "lat lng r"
api -> idx: "当前格与邻格"
idx -> api: "候选 ID"
api -> poi: "补全详情"
api -> cli: "按距排序"
`),
        "",
        "单 key Redis `GEOSEARCH BYRADIUS` 会在引擎内做 geohash 邻域，**原型很好**。规模上去后一个 GEO key 难分片——下一节按格子拆 key，API 自己 fan-out 邻格再合并。两种都要能讲，不要假装「一行 GEOSEARCH」等于全球架构。",
        "",
        "**面试怎么说：**",
        "",
        "> 「当前格加邻居，合并 ID，再按距离滤和排。geohash 近不等于前缀相同。半径不够再降精度或加大 k-ring。」",
        "",
        "trade-off：多查 8 格 / 一圈 k-ring，换的是不漏边。召回集会变大，靠距离截断和 COUNT。为了「绝对不漏」去扫相邻大区或全表，是把半径查询做成扫描。",
      ].join("\n"),
    },
    {
      id: "sec-hotspot",
      heading: "深入 · 热点格子与分片",
      secNum: "19.6",
      related: ["ch05", "ch37"],
      body: [
        "第三个 hard part。POI 和流量都 **地理倾斜**：市中心一格塞满店和饭点 QPS，郊区一格几乎空。全国一张 Redis GEO、或按 `poi_id` 哈希分片，都会把「附近」打成 scatter-gather，或把热写打进同一个 sorted set。2026 默认：**按 geohash 前缀（或 H3 cell）分片**，和 Ch05 的环、Ch37 的分片键是同一句话。",
        "",
        d2(`
grid-columns: 2
hot: {
  label: "热点格子 · 不要"
  class: groupBad
  grid-columns: 2
  a.class: bad
  a: "全市单 key"
  b.class: bad
  b: "按 ID 打散"
}
shard: {
  label: "前缀分片 · 默认"
  class: groupOk
  grid-columns: 2
  c.class: ok
  c: "按 geohash 前缀"
  d.class: ok
  d: "热格再切细"
}
`),
        "",
        "**本图引用**：Ch05 一致性哈希 · Ch37 存储选型",
        "",
        "分片键用 **格子前缀**，不要用用户 ID：一次半径查询只打当前格所在分片 + 少数邻居分片（邻居通常和当前前缀相邻，多数仍落在同一或两个 shard）。前缀太短（长度 3）→ 一 shard 装半个省，热区仍爆炸；太长 → 一次查询 fan-out 几十片。白板选 **和半径同级的长度**（5–6）做路由，热前缀再拆成更长前缀或给该前缀加副本。",
        "",
        "Redis GEO：**一个 key 一个 sorted set，写和 `GEOSEARCH` 都挤在同一点。** 规模化是 `geo:{prefix}` 或 `geo:{h3cell}` 多 key，查询并行 mget / pipeline 邻格。H3 的好处是 cell 天然当 shard 名；geohash 同样能当。一致性哈希把前缀映射到节点（Ch05），前缀集合变了用虚拟节点，避免 `% N`。",
        "",
        "热格再切：downtown 长度 6 仍爆 → 该区域改用长度 7 存和查，查询方按半径选精度。副本：读极重的前缀加只读副本，和「整张 geo 表只做读副本、绝不切分」不是同一句话——目录和 QPS 大了，**前缀分片是 2026 默认**；小数据量单机 + 副本仍然成立，追问时讲清楚假设。",
        "",
        "缓存点到：key 用格子 ID 不是原始经纬度（定位抖动会打爆缓存项）。热前缀的 ID 列表可短 TTL。不要在这题上展开全球多 Region 课；就近部署一句够。",
        "",
        "**面试怎么说：**",
        "",
        "> 「按 geohash 前缀分片，别按 POI id。Redis GEO 要拆成每格一个 key。市中心再切细或加副本。Ch05 的环用来挂前缀。」",
        "",
        "trade-off：前缀分片让半径查询局部化，换来热点仍要二次切格、邻居可能跨 shard。按 ID 均分看起来均匀，附近一次查询变成广播。原书「geo 索引很小所以不分片」在千万 POI + 热城 Redis 上不够当第一答案，放到折叠里对比。",
      ].join("\n"),
    },
    {
      id: "sec-2026",
      heading: "2026 vs 原书",
      secNum: null,
      related: [],
      body: [
        "<details>",
        "<summary>原书 / 笔记当时怎么讲（不要当第一答案）</summary>",
        "",
        "Xu Vol.2 邻近服务把 **2D 扫描 → 均匀网格 → geohash → quadtree → S2** 讲透了，边界问题、邻格、读多写少仍成立。过时的是把 quadtree 内存估算当必须深挖、geo 索引「只做读副本绝不切分」、以及完全不提 Redis GEO / H3。笔记里的 GDPR 长段、geofencing、某厂 QPS，不要当本场正文。",
        "",
        "| 原书或笔记 | 现在怎么答 |",
        "|---|---|---|",
        "| 面试 geohash **或** quadtree 二选一讲透 | **白板默认 geohash**；quadtree 点到 |",
        "| 五种索引演进讲满 | 先格子键 + 邻格；S2 / 均匀网格放追问 |",
        "| 没提 Redis GEO | **GEOADD / GEOSEARCH**；底层 geohash + ZSET |",
        "| 没提 H3 | **六边形备选**；不要当成唯一答案 |",
        "| geo 索引不分片、靠读副本 | **按 geohash 前缀分片**；小数据量才单机+副本 |",
        "| 隐私只提 GDPR 名词 | **一句**：粗粒度 + 短保留 |",
        "| PostGIS / GiST 后来补成百科 | **空间索引点到** |",
        "| 100M DAU、某图商 QPS 当背诵 | **教学假设**；只报数量级 |",
        "| 地图渲染、geofencing 推送铺开 | **本场不做**；Maps 选修，配送 Ch27 |",
        "",
        "仍成立的骨架：二维要降成格子、geohash 必须查邻居、POI 读远大于写、列表和详情分离。过时的是把四叉树内存课和「绝对不分片」当成 2026 第一张图。",
        "",
        "</details>",
      ].join("\n"),
    },
    {
      id: "sec-traps",
      heading: "追问陷阱",
      secNum: null,
      related: ["ch37", "ch05"],
      body: [
        "1. **「这是地图还是配送？」** → 默认附近 POI 半径排序。瓦片渲染选修；骑手匹配 Ch27。",
        "2. **「为什么不能对 lat/lng 各建索引？」** → 一维范围交集仍大。要格子键才能 seek。",
        "3. **「geohash 前缀长就一定近？」** → 往往近；反过来不成立。跨边必须查邻格。",
        "4. **「为什么必须查 8 邻居？」** → 圆压在格边上，对面点前缀不同。漏边是功能 bug。",
        "5. **「只答 H3 行不行？」** → 当备选可以。白板默认 geohash / Redis GEO。H3 讲等距邻居和 k-ring。",
        "6. **「Redis GEO 不够吗？」** → 原型一行 `GEOSEARCH` 够。一个 key 不能分片；按格拆 key。",
        "7. **「按 poi_id 分片呢？」** → 附近一次查询变成 scatter-gather。分片键用格子前缀（Ch05）。",
        "8. **「geo 索引原书为什么不分片？」** → 当时假设工作集很小、瓶颈是读。热城 + Redis 单 key 之后，前缀分片是默认。",
        "9. **「市中心格子打满？」** → 更长前缀切细，或该前缀加副本。不要全国一张 ZSET。",
        "10. **「距离怎么排？」** → 格子粗筛，球面距离再 sort。不要默写公式，不要假装格内都合格。",
        "11. **「位置隐私？」** → 粗粒度格子、短保留，不留轨迹。不是合规专章。",
        "12. **终图已经很大了还往上堆？** → 瓦片、路网、配送、推荐、PostGIS 百科都不是本章。讲透三条 hard part 比画 20 个框得分高。",
      ].join("\n"),
    },
    {
      id: "sec-next",
      heading: "wrap-up 与下一步",
      secNum: null,
      related: ["ch20"],
      body: [
        "收尾不要说完美。三个 bottleneck 口播：",
        "",
        "| bottleneck | 你怎么接 |",
        "|---|---|",
        "| 二维无法 seek / 漏边界 | geohash 或 H3 当键；当前格 + 邻格；再按距离排 |",
        "| 单 GEO key / 按 ID 分片 | 按 geohash 前缀拆 key 和 shard（Ch05 / Ch37） |",
        "| 市中心热格 | 更长前缀切细或给该前缀加副本 |",
        "",
        "自测：合上这一页，用 30 秒开场 + 白板高层，把 geohash 默认、邻格、前缀分片讲给空气听。H3 用一格对比即可。隐私一句。哪句卡，回哪一节。地图渲染和配送匹配不要开口展开。",
        "",
        "下一道题是 **Ch20 · 分布式消息队列**。LBS 是读路径上的地理索引；消息队列换成分区、消费者组、ISR——从「附近怎么查」变成「事件怎么可靠传」。",
      ].join("\n"),
    },
  ],
  reviewMd: `# Ch19 · 记忆闪卡

| # | 正面 | 背面 |
|---|---|---|
| 1 | LBS 三个 hard part？ | 二维→格子键（geohash/H3）；半径查询+邻格；热点格子分片。隐私一句。 |
| 2 | 默认范围？ | **附近商家 / POI + 半径排序**。不是地图渲染，不是配送匹配（Ch27），不是推荐。 |
| 3 | 白板默认索引？ | **Geohash 前缀**（DB 或 Redis GEO）。H3 六边形是 2026 备选，不是唯一答案。 |
| 4 | 二维为什么不能两棵 B-tree？ | 一维范围交集仍大。格子 ID 才能把「附近」变成键上的 seek。 |
| 5 | Geohash 前缀长 = 一定近？ | 往往近；**近 ≠ 前缀长**。跨边必须查当前格 + 8 邻格。 |
| 6 | H3 比方形好在哪？ | 6 个边邻居等距，k-ring 整齐。仍要滤圈外点。不要只答 H3。 |
| 7 | Redis GEO 怎么用、上限？ | \`GEOADD\` / \`GEOSEARCH\`；底层 geohash+ZSET。单 key 难分片，按格拆 key。 |
| 8 | 距离怎么排？ | 格子粗筛，再算球面距离排序截断。格内点不保证在半径内。 |
| 9 | 怎么分片？ | **geohash 前缀 / H3 cell**（Ch05）。不要按 poi_id 把附近打散。 |
| 10 | 热格子怎么办？ | 更长前缀切细，或该前缀加副本。全国一张 GEO 是 red flag。 |
| 11 | 隐私讲到哪？ | **粗粒度格子 + 短保留**，不留轨迹。不是 GDPR 章。 |
| 12 | 这题最大的 over-engineering？ | 地图渲染、配送匹配、只答 H3、PostGIS 百科、假图商 QPS。讲透三条 hard part。 |`,
});
