import { writeChapter } from "./write-chapter.mjs";

const d2 = (src) => {
  const body = src.trim();
  const sized = /style\.font-size/.test(body) ? body : `style.font-size: 12\n${body}`;
  return "```d2\n" + sized + "\n```";
};

writeChapter({
  id: "ch22",
  num: "22",
  title: "对象存储",
  kind: "case",
  relatedChapters: ["ch37", "ch41", "ch36", "ch43"],
  sections: [
    {
      id: "intro",
      heading: "",
      secNum: null,
      related: [],
      body: [
        "> **预计**：50–70 分钟 ｜ **前置**：存储选型 Ch37；复制 / 分片 Ch41；几个 9 的口径 Ch36",
        "> **目标**：元数据与数据平面分离；纠删码 vs 三副本 + 失败域。不要做成网盘、视频 CDN、湖仓全书。",
        "",
        "消息队列和库存闸把「怎么可靠传、怎么占住件数」讲完；这题换成 **海量不可变 blob 怎么放得住、放得便宜。** 默认是 **S3-like 对象存储**：bucket + object key，PUT / GET / 可选 list 与版本。不是 Ch15 网盘（目录树、分块去重、多端冲突），不是 Ch14 视频（转码、CDN 播），不是 Ch43 超大规模数据 / 湖仓（列存、表格式）。块 vs 文件 vs 对象 **一句表** 就够，引擎细节回 Ch37。",
        "",
        "系统看起来就是上传一个文件再 GET 回来。三个 hard part：**元数据平面和数据平面分离（inode 思想；小对象合并降 IOPS）**、**持久性：纠删码 vs 三副本 + 失败域（机架 / AZ）**、**海量元数据怎么切 + 大对象 multipart（开口即可）。** 面试官要看的不是某云 SKU 目录、不是 S3 Select / Object Lambda 产品手册、不是你手算出来的内部 11 nines，而是：名字和字节为什么不塞进同一张表、耐久为什么默认开口纠删码、元数据分片键怎么选才不会把热桶打穿。",
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
        "> 「对象存储三个 hard part。第一，**元数据和数据分离**：inode 记名字、ACL、指向哪；字节走数据节点，小对象合并进大文件降 IOPS。第二，**耐久**：容量默认 **纠删码**，热 / 小对象才三副本；块跨机架、跨 AZ。第三，元数据按 `hash(bucket, key)` 切，大对象开口 **multipart**。这不是网盘同步（Ch15），不是转码 CDN（Ch14）。块 / 文件 / 对象回 Ch37。公开 SLA 常写 11 nines 耐久，那是口径，不是我算的。」",
        "",
        "然后按 4 步走，别一上来画 Glacier 分层购物、S3 Tables、或把 Ch15 冲突策略搬进来。",
        "",
        d2(`
direction: right
s1: "1 澄清规模"
s2: "2 分离架构"
s3: "3 耐久失败域"
s4: "4 元数据切分"
s1 -> s2 -> s3 -> s4
`),
        "",
        "| 时间盒 | 你在做什么 |",
        "|---|---|",
        "| 3–10 min | 澄清：对象大小分布、是否要 list / 版本、耐久 vs 延迟优先 |",
        "| 接着 2 min | back-of-envelope：教学按百 PB、亿级对象；贵的是盘和 IOPS，不是 API QPS |",
        "| 10–15 min | 高层：Client → API → 元数据 / 数据平面 |",
        "| 10–25 min | deep dive：分离+合并、纠删码 vs 三副本、分片键 + multipart |",
        "| 3–5 min | wrap-up：3 个 bottleneck（小文件打盘、失败域没拆开、热桶元数据热点） |",
        "",
        "**red flag：** 还没问大小分布就把每个对象写成一个 POSIX 文件；开口「纠删码太复杂所以永远三副本」；把 2020 年以前的「最终一致可接受」当 2026 第一答案；画网盘同步 / 视频转码 / 湖仓表格式；背某云 SKU；编造某厂内部 PB 或自己算出 11 nines。那是 over-engineering，或把邻章整章搬进来。",
      ].join("\n"),
    },
    {
      id: "sec-clarify",
      heading: "澄清问题清单",
      secNum: "22.1",
      related: [],
      body: [
        "没问清楚就画图 = Jimmy。这题 5–7 个问题就停，其余自己假设写白板。**第一问必须是范围：纯对象 API，还是网盘 / CDN / 数仓。**",
        "",
        "| 你问 | 典型回答 / 你自己的假设 | 它改什么 |",
        "|---|---|---|",
        "| 只要 PUT/GET，还是网盘、点播、湖仓？ | 本场 **S3-like 对象 API** | 不做目录冲突、转码、列存 |",
        "| 对象多大？小文件占比？ | 教学：**KB 到 GB 都有；小对象很多** | 必须合并；大对象 multipart |",
        "| 要 list 前缀、版本吗？ | **要开口**；不当产品清单 | 分片键和 delete marker |",
        "| 耐久优先还是写延迟优先？ | 容量默认 **纠删码**；热路径可副本 | 别把三副本当唯一答案 |",
        "| 一致模型？ | 2026：**read-after-write 强一致** 当默认口径 | 最终一致进折叠 |",
        "| 规模大概多少？ | 教学：**约百 PB 逻辑、亿级对象** | 元数据要分片；不是某厂内部数 |",
        "",
        "面试官说「你定」时，把假设写上去：",
        "",
        "> 「我假设：设计 S3-like 对象存储，不是网盘、不是视频 CDN。对象从 KB 到数 GB，小对象要合并。元数据与字节分离。容量默认纠删码，热 / 小对象可三副本，块跨失败域。元数据 `hash(bucket, key)` 分片。大文件 multipart。GET 在 PUT 成功后立刻看到新对象。先按这个画，不对你打断我。」",
        "",
        "问到 Drive 同步、HLS 转码、Iceberg / 湖仓表、S3 Select：**承认差别，立刻收口。** 「网盘是 Ch15，转码是 Ch14，表格式点到 Ch43。本场停在对象 API 和数据节点。」问太多超过 10 分钟也是 red flag。黄金线还是那条：**问关键问题 → 自己给假设 → 写白板 → 继续。**",
      ].join("\n"),
    },
    {
      id: "sec-estimate",
      heading: "粗估",
      secNum: "22.2",
      related: ["ch03"],
      body: [
        "公式细节在 Ch03。这里只要数量级，证明你知道 **这题 bottleneck 是容量、IOPS 和元数据条数，不是「上传开始那一下的 QPS」。** 下面用白板做**教学假设**，不是某云内部占用，也不是把公开 SLA 倒推成你设计出来的耐久。",
        "",
        "教学常用数量级（**假设**，沿用笔记量级方便对照，不是某厂事实）：逻辑数据约 **100 PB**；对象大小混有小 / 中 / 大。粗推对象数约 **亿级**（笔记推演约 0.68 亿），每条元数据约 1 KB → 元数据约 **0.5–1 TB**。单盘 HDD 随机 IOPS 大约百级——**一对象一文件会把 inode 和 IOPS 先打满**，所以必须合并。",
        "",
        "| 项 | 怎么估 | 量级（教学假设） |",
        "|---|---|---|",
        "| 逻辑容量 | 白板给 100 PB | **百 PB**；纠删码开销另加，不是用户看到的数 |",
        "| 对象条数 | 混大小后除以平均对象 | **亿级**；元数据不能单机一张表 |",
        "| 元数据 | 亿 × ~1 KB | **TB 级**；要分片（Ch41） |",
        "| 小对象 IOPS | 每对象一次 create | HDD **百 IOPS**；合并前盘先死 |",
        "| API QPS | 远小于字节吞吐 | 控制面可以无状态扩；贵的是盘和重建流量 |",
        "",
        "耐久数字：**不要现场手算 11 nines。** 公开口径里，主流对象存储 Standard 类常写 **11 nines 耐久**（例如公开 S3 SLA 口径）；教材用三副本推「大约 6 nines」只是数量级直觉。开口：「这是**公开 SLA 口径，不是我算出来的**；我保证的是失败域 + 冗余方案，不是自己乘出来的 9。」",
        "",
        "**面试怎么说：**",
        "",
        "> 「百 PB、亿对象是教学假设。贵的是盘、小文件 IOPS、元数据切分。我不会拿某厂内部 PB 当事实，也不会手算 11 nines。」",
        "",
        "常见算错：只报 API QPS、假装没有小文件；或把 11 nines 说成自己用 0.81% 年故障率乘出来的内部结论。教学用数量级，并标**假设**。",
      ].join("\n"),
    },
    {
      id: "sec-arch",
      heading: "高层架构",
      secNum: "22.3",
      related: ["ch37", "ch41"],
      body: [
        "从左到右只画 **一条对象控制面**：Client → API → 元数据平面 / 数据平面。不要在这张图上扇出转码、CDN、湖仓 catalog、网盘目录树。**API 无状态**，鉴权点到即可。面试官 buy-in 之后再拆合并和纠删码。",
        "",
        d2(`
direction: right
cli.class: go
cli: "Client"
api.class: step
api: "API"
meta.class: store
meta: "元数据"
data.class: store
data: "数据平面"
cli -> api
api -> meta
api -> data
`),
        "",
        "**本图引用**：Ch37 存储选型 · Ch41 复制、分片、事务",
        "",
        "**块 / 文件 / 对象（短表，细节 Ch37）：** 块是裸卷，给 VM / 数据库盘；文件是目录树 + POSIX，给共享挂载；**对象是 HTTP 语义的不可变 blob**，按 key 寻址，写一次读多次。对象存储**刻意**用延迟换海量、低成本和极高耐久，不要拿它当热库盘。",
        "",
        "**写路径：** 鉴权 → 数据平面先落字节（拿到 object id / 位置）→ **再 commit 元数据**（名字 → id、checksum、长度）。库里不要指向还不存在的字节。读：元数据查位置 → 数据节点按 offset 读 → 校验 checksum。List 是元数据查询，不是扫盘。",
        "",
        d2(`
shape: sequence_diagram
cli: "Client"
api: "API"
data: "Data"
meta: "Meta"
cli -> api: "PUT object"
api -> data: "写字节"
data -> api: "object id"
api -> meta: "commit inode"
api -> cli: "200"
`),
        "",
        "参与者就这四个。**不要**再加 IAM 微服务、CDN、转码当第五人。放置 / 拓扑（哪几台盘、哪个机架）收进数据平面口播：副本或纠删块必须落在**不同失败域**——机制回 Ch41，这里只钉「别放同一机架」。",
        "",
        "高层不要展开：具体 Reed-Solomon 参数、某云 Glacier 名、S3 Select。问一句：「方向 OK 吗？接下来挖元数据分离和小对象合并，然后是纠删码对三副本，最后分片键和 multipart。」",
        "",
        "**面试怎么说：**",
        "",
        "> 「Client 打 API。字节进数据平面，inode 进元数据。先写字节再 commit 名字。别在这张图画网盘和 CDN。」",
      ].join("\n"),
    },
    {
      id: "sec-meta",
      heading: "深入 · 元数据分离与小对象合并",
      secNum: "22.4",
      related: ["ch37"],
      body: [
        "第一个 hard part。**名字和字节不要塞进同一张表、也不要一对象一个 POSIX 文件。** UNIX 把 inode 和 data block 分开；对象存储同一思想：元数据可变（改 ACL、改名字映射），payload **不可变**（覆盖 = 新对象 / 新版本）。两边独立扩：元数据走可分片的小库，数据走追加文件 + 冗余。",
        "",
        "**小对象是 IOPS 杀手。** 百万个 10 KB 对象若各占一个文件：浪费块、耗尽 inode、随机 create 把 HDD 打满。2026 默认：**追加进当前可写大文件（几 GB 一级）**，到阈值 **seal 成只读**，新对象开新文件。节点上的查找表：`object_id → file + offset + size`。读多写少，这张映射可以是嵌入式库或本机 KV——别在白板上开 SQLite vs RocksDB 购物。",
        "",
        d2(`
direction: right
put.class: go
put: "小对象"
app.class: step
app: "追加文件"
seal.class: ok
seal: "seal 只读"
map.class: store
map: "offset 映射"
put -> app -> seal -> map
`),
        "",
        "**本图引用**：Ch37 存储选型",
        "",
        "写路径串行是 bottleneck：一个可写文件同时只能追加。口播 **每核（或每磁盘组）一个可写文件**，避免全局一把锁。Compaction / GC：删标记攒一批，把存活对象拷到新文件，**映射和删旧文件同事务**，否则读到空洞。细节点到即停，不要画成 LSM 全书（Ch37）。",
        "",
        "**面试用哪一句（Haystack / f4）：** Facebook **Haystack**（2010）：热照片路径 = **小对象合并成大文件 + 元数据与数据分离 + 多副本**。**f4**（2014）：温数据改 **纠删码**，把有效副本因子压下来。白板只需这一句证明你知道工业原型；不要背论文里的 PB 数和 Reed-Solomon(10,4) 当内部规格。",
        "",
        "| | 一对象一文件 | 合并大文件（**默认**） |",
        "|---|---|---|",
        "| IOPS | 每次 create 打盘 | 顺序追加 |",
        "| inode | 对象数 = 文件数 | 文件数 ≈ 容量 / 几 GB |",
        "| 查找 | 文件系统目录 | `id → offset` |",
        "| 面试 | 对照 / red flag | **2026 第一答案** |",
        "",
        "**面试怎么说：**",
        "",
        "> 「inode 和字节分开。小对象追加进大文件再 seal。Haystack 就是这句；温了再走 f4 那种纠删码。不当网盘目录题。」",
        "",
        "trade-off：合并换 IOPS，换来 GC、映射表、坏一块要修一段文件。为「简单」坚持一对象一文件，在亿级小对象下是本场最大 red flag。",
      ].join("\n"),
    },
    {
      id: "sec-durability",
      heading: "深入 · 纠删码 vs 三副本",
      secNum: "22.5",
      related: ["ch36", "ch41"],
      body: [
        "第二个 hard part。**2026 面试默认能开口纠删码**，不要把「太复杂所以永远三副本」当第一答案。三副本仍然有位置：**热路径、超小对象、修复要尽快** 时，整份复制延迟更可控。容量默认、冷 / 温、要压盘的，走 **erasure coding**（Reed-Solomon 一类）：`k` 数据块 + `m` 校验块，任意丢 ≤ `m` 块仍能重建。教学开口 **(8+4)** 或 **(4+2)** 都行，**不要把 k、m 背成某厂内部码。**",
        "",
        d2(`
grid-columns: 2
rep: {
  label: "三副本 · 热/小"
  class: group
  grid-columns: 3
  a.class: step
  a: "写整份"
  b.class: step
  b: "延迟低"
  c.class: warn
  c: "约 3x 盘"
}
ec: {
  label: "纠删码 · 默认"
  class: groupOk
  grid-columns: 3
  d.class: ok
  d: "k+m 块"
  e.class: ok
  e: "开销低"
  f.class: ok
  f: "重建贵"
}
`),
        "",
        "**本图引用**：Ch36 CAP / SLO · Ch41 复制、分片、事务",
        "",
        "| | 三副本 | 纠删码（**容量默认**） |",
        "|---|---|---|",
        "| 盘开销 | 约 3× | 教学 (8+4) 约 1.5×；(4+2) 同量级 |",
        "| 写 | 拷两份即可 | 先切片再算校验，CPU + 多节点 |",
        "| 读（健康） | 读一份 | 读 k 块拼回来 |",
        "| 修复 | 拷一份 | 要从多块解方程；网络更疼 |",
        "| 失败域 | 三份不在同一机架 / AZ | **k+m 块也不在同一失败域** |",
        "",
        "公开口径里对象存储 Standard 常写 **11 nines 耐久**；教材用三副本直觉「大约 6 nines」。**开口标：公开 SLA 口径，不是你算出来的。** 真正要讲的是 **失败域**：节点 → 机架（共享交换机 / 电源）→ AZ。三份或 k+m 块若挤在同一机架，一次掉电 = 相关失败，nines 海报立刻作废。跨 AZ 是默认口播；多 Region 复制点到「另一条 SLA」，不要画成全球 mesh。",
        "",
        "分级存储 **一句**：热数据可先副本、冷了再转码成纠删码（f4 那条故事）。不要报 Glacier / Intelligent-Tiering 等 SKU 名当架构。",
        "",
        d2(`
direction: right
w.class: go
w: "写入"
c.class: step
c: "CRC32C"
r.class: step
r: "读校验"
ok.class: ok
ok: "通过"
fix.class: bad
fix: "他域重建"
w -> c -> r
r -> ok
r -> fix
`),
        "",
        "**Checksum：** 盘没报坏也会 **bit rot**。每对象（以及 seal 后的大文件）存校验；读时重算，不对就从其他失败域读或用校验块重建。2026 白板默认 **CRC32C**（常见硬件加速）或 **SHA-256**（完整性更硬）。MD5 弱、只当历史 ETag 对照——进折叠，不当第一答案。",
        "",
        "**面试怎么说：**",
        "",
        "> 「容量默认纠删码，热和小对象才三副本。块跨机架跨 AZ。CRC32C 防静默损坏。11 nines 是公开口径，我讲的是失败域和冗余，不是手算 9。」",
        "",
        "trade-off：纠删码省盘、修复和尾延迟更贵；三副本费盘、实现直观。只选一边而不说失败域，nines 是空的。把复制协议、Raft 日志再讲成一章，是抢 Ch41。",
      ].join("\n"),
    },
    {
      id: "sec-shard",
      heading: "深入 · 元数据分片与 multipart",
      secNum: "22.6",
      related: ["ch41"],
      body: [
        "第三个 hard part。亿级 inode **必须分片**；机制（一致性哈希、再均衡）回 Ch41，本场只钉 **分片键** 和大对象怎么开口。版本 / list 点到能答追问即可，不要变成 S3 功能手册。",
        "",
        d2(`
grid-columns: 2
badk: {
  label: "热点键"
  class: groupBad
  grid-columns: 2
  a.class: bad
  a: "只按 bucket"
  b.class: bad
  b: "只按 UUID"
}
goodk: {
  label: "默认键"
  class: groupOk
  grid-columns: 2
  c.class: ok
  c: "hash 桶+名"
  d.class: ok
  d: "multipart"
}
`),
        "",
        "**本图引用**：Ch41 复制、分片、事务",
        "",
        "**键怎么选：** 只按 `bucket_id` → 热桶（一个公开数据集）全部打在一个分片。只按 `object_id`（UUID）→ 均匀，但 `GET bucket/key` 还要先做 name→id，list 前缀更痛苦。白板默认 **`hash(bucket_name, object_name)`**：按 URI 均匀，点查名字走对分片。List 前缀在分片下要扫多片再合并分页——口播「list 不是性能优先级；可反规范化一张按 bucket 的 list 表」。别在这里设计第二套搜索引擎（Ch13）。",
        "",
        "**版本（开口）：** 覆盖不删旧字节，插新行；当前版 = 最新版本号。删除插 **delete marker**，GET 当前版 = 404，旧版仍能按 version id 拉。实现用时间有序 id 即可，不必把 TIMEUUID 课搬进来。",
        "",
        "**Multipart：** GB 级不要一条 HTTP 赌命。Init 拿 upload id → 并行 PUT part → complete 再 commit 成一个对象。中断只补缺 part。未 complete 的 part 要超时 GC，否则账单和盘都漏。和 Ch15 网盘「分块去重」不是同一题：这里 **可以不去重**，只求可靠传完；content-addressed CAS 是网盘 hard part。",
        "",
        "**面试怎么说：**",
        "",
        "> 「元数据 hash(桶, 名) 切，别按热桶切。大文件 multipart。版本插新行加 delete marker。List 和 GC 点到即可，不画产品清单。」",
        "",
        "trade-off：按名哈希让点查快，list 变难。为 list 再做一张反规范化表，是用空间换简单。把 multipart 讲成断点续传协议全书、再叠 Ch15 去重，是抢邻章时间。",
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
        "Xu Vol.2 对象存储把高层、小对象合并、元数据分片、版本、multipart、GC 骨架讲完整了，inode 分离和小对象合并仍成立。正文按 **2026 面试默认**重写：纠删码能开口、强一致是默认口径、checksum 不再只报 MD5。笔记里的 S3 Select / Object Lambda / S3 Tables、Glacier SKU 名不当脊梁。不是把笔记润色进网页。",
        "",
        "| 原书或笔记 / 网上旧答 | 现在怎么答 |",
        "|---|---|",
        "| 最终一致可接受 | **2020-12 起**公开 S3 已是 **read-after-write + list 强一致**；白板默认跟这条口径 |",
        "| 主用三副本（纠删码太复杂） | **容量默认纠删码**；热 / 小对象才三副本 |",
        "| checksum 只用 MD5 | **CRC32C / SHA-256**；MD5 弱，当历史 ETag |",
        "| 没提 Haystack / f4 | **一句原型**：合并+分离；温数据纠删码 |",
        "| 没提分级 | **一句**热副本 / 冷纠删码；不报冷存 SKU |",
        "| 网盘冲突 / 视频转码写进对象章 | **Ch15 / Ch14**；本场停在对象 API |",
        "| 湖仓 / 列存 / S3 Tables | **点到 Ch43**；不当本章 |",
        "| 11 nines 当场手算 | **公开 SLA 口径**；讲失败域和冗余 |",
        "| 某厂内部 PB 当事实 | **教学假设** 百 PB / 亿对象 |",
        "",
        "仍成立的骨架：元数据与数据分离、小对象合并、失败域、checksum、按名分片、multipart。过时的是把最终一致和「永远三副本」当 2026 第一句。",
        "",
        "</details>",
      ].join("\n"),
    },
    {
      id: "sec-traps",
      heading: "追问陷阱",
      secNum: null,
      related: ["ch37", "ch41", "ch36"],
      body: [
        "1. **「块、文件、对象有何不同？」** → 块给盘；文件给目录树；对象是 HTTP blob、不可变、海量。细节 Ch37。",
        "2. **「和 Ch15 网盘什么关系？」** → 网盘用对象存块，还要目录、去重、冲突。本章只做对象 API。",
        "3. **「为什么元数据和数据要分开？」** → inode 可变、字节不可变，独立扩、独立失败。",
        "4. **「小对象为什么不能一文件一个？」** → IOPS 和 inode。追加大文件再 seal。",
        "5. **「Haystack 面试说哪句？」** → 合并 + 分离 + 热副本；f4 是温数据纠删码。",
        "6. **「为什么 2026 不先说永远三副本？」** → 盘太贵。容量默认纠删码；热 / 小再副本。",
        "7. **「纠删码块能放同一机架吗？」** → 不能。失败域没拆开，冗余是假的（Ch41）。",
        "8. **「11 nines 你怎么算的？」** → **不算。** 公开 SLA 口径。我保证失败域和码制。",
        "9. **「盘没坏数据错了？」** → checksum（CRC32C / SHA-256）；不对就他域重建。",
        "10. **「PUT 完立刻 GET 能看到吗？」** → 2026 默认 **强一致**；最终一致是旧口径。",
        "11. **「object 表按什么切？」** → `hash(bucket, key)`。只按桶会热点；只按 UUID 伤按名查。",
        "12. **「大文件怎么传？」** → multipart：init / part / complete；残留 part 要 GC。不是 Ch15 去重。",
        "13. **「怎么降本？」** → 纠删码 + 小对象合并 + 热/冷一句。不报 Glacier 购物。",
        "14. **终图已经很大了还往上堆？** → Select、Object Lambda、湖仓表、网盘同步、转码都不是本章。讲透三条 hard part 比画 20 个框得分高。",
      ].join("\n"),
    },
    {
      id: "sec-next",
      heading: "wrap-up 与下一步",
      secNum: null,
      related: ["ch23"],
      body: [
        "收尾不要说完美。三个 bottleneck 口播：",
        "",
        "| bottleneck | 你怎么接 |",
        "|---|---|",
        "| 小文件打盘 / inode | 元数据与数据分离；追加合并再 seal（Haystack 那句） |",
        "| 冗余假、修复贵 | 容量默认纠删码；热 / 小三副本；块跨失败域；CRC32C |",
        "| 热桶元数据、大文件中断 | `hash(bucket, key)`；multipart + 超时 GC |",
        "",
        "自测：合上这一页，用 30 秒开场 + 白板高层，把分离+合并、纠删码对三副本、分片键和 multipart 讲给空气听。Ch15 冲突、Ch14 转码、Ch43 湖仓只报边界。哪句卡，回哪一节。",
        "",
        "下一道题是 **Ch23 · 游戏排行榜**（已有章）。对象存储是 blob 怎么耐久地放；排行榜换成有序集合怎么切——ZSET 与分片。",
      ].join("\n"),
    },
  ],
  reviewMd: `# Ch22 · 记忆闪卡

| # | 正面 | 背面 |
|---|---|---|
| 1 | 对象存储三个 hard part？ | 元数据/数据分离 + 小对象合并；纠删码 vs 三副本 + 失败域；元数据分片键 + multipart。不做网盘/CDN/湖仓。 |
| 2 | 为什么 inode 和字节要分开？ | 元数据可变、payload 不可变，独立扩。先写字节再 commit 名字。 |
| 3 | 小对象默认怎么存？ | 追加进大文件，阈值 seal 成只读；\`id → file+offset\`。一对象一文件是 red flag。 |
| 4 | Haystack / f4 面试说哪句？ | Haystack：合并 + 分离 + 热副本。f4：温数据纠删码降有效副本因子。 |
| 5 | 2026 耐久第一句？ | **容量默认纠删码**；热 / 小对象才三副本。不是「太复杂所以永远三副本」。 |
| 6 | 失败域钉什么？ | 节点 / 机架 / AZ。副本或 k+m 块不能挤同一机架。机制回 Ch41。 |
| 7 | 11 nines 怎么开口？ | **公开 SLA 口径，不是你算出来的。** 讲冗余和失败域，别现场乘 9。 |
| 8 | checksum 2026 默认？ | **CRC32C**（硬件加速）或 SHA-256。MD5 弱，进折叠。防 bit rot。 |
| 9 | PUT 完立刻 GET？ | 默认 **read-after-write 强一致**（公开 S3 自 2020-12）。最终一致是旧答案。 |
| 10 | 元数据分片键？ | **hash(bucket, key)**。只按桶热点；只按 UUID 伤按名查。List 可反规范化。 |
| 11 | 大对象怎么开口？ | **multipart**：init / part / complete；残留 part 超时 GC。不是 Ch15 CAS 去重。 |
| 12 | 这题最大的 over-engineering？ | 网盘冲突、转码 CDN、湖仓表、云 SKU 购物、手算 11 nines、永远三副本。讲透三条 hard part。 |`,
});
