import { writeChapter } from "./write-chapter.mjs";

const d2 = (src) => {
  const body = src.trim();
  const sized = /style\.font-size/.test(body) ? body : `style.font-size: 12\n${body}`;
  return "```d2\n" + sized + "\n```";
};

writeChapter({
  id: "ch14",
  num: "14",
  title: "设计视频系统",
  kind: "case",
  relatedChapters: ["ch37", "ch38", "ch42"],
  sections: [
    {
      id: "intro",
      heading: "",
      secNum: null,
      related: [],
      body: [
        "> **预计**：50–60 分钟 ｜ **前置**：对象存储/CDN 见 Ch37/Ch38",
        "> **目标**：转码阶梯、HLS/DASH、CDN 成本、AV1。直播只点到。不讲推荐。",
        "",
        "视频是第六道完整 case。搜索是词 → 文档；这题反过来：**大文件怎么变成能播的流，而且别把带宽账单打穿。** 面试官要看的不是你能不能画出直播专章 + 短视频推荐漏斗 + 某云 SKU 清单，而是：**转码阶梯怎么出、HLS/DASH 怎么播、CDN 为什么是 cost bottleneck。**",
        "",
        "系统看起来就是上传、点播放。难点在预转多档、切片自适应、以及长尾下别给每条冷片都付边缘缓存的钱。",
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
        "> 「视频三个 hard part：上传加转码管线、HLS/DASH ABR 播放、CDN 成本与长尾。我先确认点播还是直播——本场默认点播。短视频是另一套，不展开。规模按教学假设估存储 TB 和 CDN 出口钱的量级。架构：client → upload API → 对象存储 → MQ 转码阶梯 → CDN。播放走 HLS/DASH，player 按带宽切档。编码 H.264 兜底，AV1 当 2026 省带宽选项。直播只点到 LL-HLS/CMAF。不讲推荐。」",
        "",
        "然后按 4 步走，别一上来画终图。",
        "",
        d2(`
direction: right
s1: "1 澄清估算"
s2: "2 高层管线"
s3: "3 转码 ABR"
s4: "4 CDN 成本"
s1 -> s2 -> s3 -> s4
`),
        "",
        "| 时间盒 | 你在做什么 |",
        "|---|---|",
        "| 3–10 min | 澄清：点播 vs 直播、长/短视频、分辨率、DAU |",
        "| 接着 2 min | back-of-envelope：存储 TB/天；CDN 出口钱的量级 |",
        "| 10–15 min | 高层：client → upload API → object store → transcode → CDN |",
        "| 10–25 min | deep dive：转码阶梯 + MQ、HLS/DASH ABR、CDN 长尾 + AV1 |",
        "| 3–5 min | wrap-up：3 个 bottleneck（转码积压、卡顿切档、CDN 账单） |",
        "",
        "**red flag：** 还没问点播/直播就画 WebRTC 连麦；还没讲转码就上推荐漏斗；把短视频当第二条架构；背某厂 CDN 日账单当事实；把 Ch15 断点续传整章搬进来。那是 over-engineering，或把直播/推荐/网盘题整章塞进来。",
      ].join("\n"),
    },
    {
      id: "sec-clarify",
      heading: "澄清问题清单",
      secNum: "14.1",
      related: [],
      body: [
        "没问清楚就画图 = Jimmy。视频这题 5–7 个问题就停，其余自己假设写白板。",
        "",
        "| 你问 | 典型回答 / 你自己的假设 | 它改什么 |",
        "|---|---|---|",
        "| 点播还是直播？ | **点播（VOD）**；直播只点到 | 预转码 + HLS/DASH；不是实时推流专章 |",
        "| 长视频还是短视频？ | **长视频 / UGC 点播** | 短视频另一套，不展开 |",
        "| 要哪些分辨率 / 编码？ | 多档 ABR；H.264 兜底 + AV1 选项 | encoding ladder，不是只存 4K |",
        "| DAU 大概多少？ | 教学：**约 500 万** | 用来估存储和 CDN 钱，不是某厂内部数 |",
        "| 要评论 / 推荐 / 搜索吗？ | **本场不做推荐**；评论/搜索另题 | 主线停在上传、转码、播放 |",
        "| 文件有多大？ | 教学：中长片，GB 级要分块 | GOP 对齐点到；续传深讲留给 Ch15 |",
        "",
        d2(`
grid-columns: 2
vod: {
  label: "点播 VOD · 默认"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "预转码"
  b.class: ok
  b: "HLS ABR"
}
live: {
  label: "直播 · 点到"
  class: group
  grid-columns: 2
  c.class: step
  c: "LL-HLS"
  d.class: step
  d: "不展开"
}
`),
        "",
        "面试官说「你定」时，把假设写上去：",
        "",
        "> 「我假设：默认点播，不是直播专章。短视频是另一套，不展开。本场不做推荐。编码阶梯几档 ABR，H.264 兼容兜底，AV1 作 2026 选项。上传按 GOP 点到分块，断点续传留给网盘题。先按这个画，不对你打断我。」",
        "",
        "问到直播：**承认差别，立刻收口。** 「直播可用 LL-HLS / CMAF 把延迟压到几秒；连麦才是 WebRTC。本场按点播讲。」问到 TikTok / Shorts 同样收口。问太多超过 10 分钟也是 red flag。黄金线还是那条：**问关键问题 → 自己给假设 → 写白板 → 继续。**",
      ].join("\n"),
    },
    {
      id: "sec-estimate",
      heading: "粗估",
      secNum: "14.2",
      related: ["ch03"],
      body: [
        "公式细节在 Ch03。这里只要数量级，证明你知道 **这题 bottleneck 是带宽费和转码计算，不是播放开始的 QPS。** 下面用白板做**教学假设**，不是某厂内部数字，也不是 YouTube 真实账单。",
        "",
        "假设：约 **500 万 DAU**；约 10% 每天上传 1 个片，片均约 300 MB；人均每天看约 5 个片，片均出口约 0.3 GB。CDN 单价按 **约 $0.01/GB**（数量级，不是某云报价单）。",
        "",
        "| 项 | 怎么估 | 量级（教学假设） |",
        "|---|---|---|",
        "| 原始存储 | 5e6 × 10% × 300 MB | **约 150 TB/天**；转码 3–4 档后再 ×几倍 |",
        "| 播放开始 QPS | 5e6 × 5 / 86400 | **约 3e2**；峰值 ×5 仍是千级 |",
        "| CDN 出口 | 5e6 × 5 × 0.3 GB × $0.01 | **约数万美元/天** 这一档 |",
        "| 年存储 | 150 TB × 365 | **约 50 PB** 原始；加阶梯是更大的 PB |",
        "",
        "QPS 看起来很小，因为一次「点播放」后面是 **分钟级的分片拉取**。钱在 GB 出口，不在请求次数。原书用过更高单价算出约 $15 万/天——**当教学数量级可以提，不要说成某厂真实日账单。** 单价腰斩，结论不变：CDN 仍是 cost bottleneck。",
        "",
        "**面试怎么说：**",
        "",
        "> 「五百万 DAU 白板：每天原始存储百 TB 量级；播放 QPS 只有几百到千。贵的是 CDN 出口，教学假设是万美元/天这一档。这题先算钱，再画转码。」",
        "",
        "常见算错：把播放开始 QPS 当唯一负载；或把某平台公开日观看量 / 内部 CDN 账单当自己的事实。教学用数量级。",
      ].join("\n"),
    },
    {
      id: "sec-arch",
      heading: "高层架构",
      secNum: "14.3",
      related: ["ch37", "ch38", "ch42"],
      body: [
        "从左到右只画 **一条管线**：Client → Upload API → 对象存储 → 转码 → CDN。不要在这张图上扇出直播、推荐、审核。字节走对象存储和 CDN，**不要经 API 中转视频**——API 只签发上传、写元数据。面试官 buy-in 之后再拆转码和播放。",
        "",
        d2(`
direction: right
app.class: go
app: "Client"
api.class: step
api: "Upload API"
obj.class: store
obj: "Object store"
tc.class: step
tc: "Transcode"
cdn.class: store
cdn: "CDN"
app -> api -> obj -> tc -> cdn
`),
        "",
        "**本图引用**：Ch37 存储选型 · Ch38 缓存与 CDN · Ch42 消息与弹性",
        "",
        "**写路径（点到）：** 客户端向 API 要预签名 URL，**直传对象存储**（Ch37），API 不被大文件打满。对象写入完成丢一条消息进队列（Ch42），转码 worker 出 encoding ladder，产物写回对象存储当 CDN origin。元数据（时长、可播档、状态）另走小库，和字节分开。",
        "",
        "**读路径：** 点播放先拿 manifest；分片从 **CDN** 走（Ch38）。miss 才回源对象存储。业务 API 继续管点赞、标题，**不经手视频字节**。",
        "",
        "图压成五叶子，是为了高度；MQ 藏在 Transcode 里讲。不要再画 client 同时扇出 CDN / origin / 推荐——三路 fan-out 会竖成细高塔。",
        "",
        "高层图到这里就该停，问一句：「方向 OK 吗？接下来挖转码阶梯，然后是 HLS/DASH，最后 CDN 成本和 AV1。」",
        "",
        "**面试怎么说：**",
        "",
        "> 「上传 client → API 签发 → 对象存储；转码走 MQ。播放 client → CDN，miss 回源。视频不经过 API。直播和推荐不画进这张图。」",
      ].join("\n"),
    },
    {
      id: "sec-transcode",
      heading: "深入 · 上传与转码管线",
      secNum: "14.4",
      related: ["ch37", "ch42"],
      body: [
        "第一个 hard part。**原始片不能直接给所有设备播**：太大、格式不齐、带宽一抖就卡。转码 = 预先做出 **多分辨率 × 多码率** 的 encoding ladder，客户端只负责选档，不在手机上实时降分辨率。",
        "",
        d2(`
direction: right
r360.class: go
r360: "360p"
r720.class: step
r720: "720p"
r1080.class: step
r1080: "1080p"
av1.class: ok
av1: "AV1 档"
r360 -> r720 -> r1080 -> av1
`),
        "",
        "**本图引用**：Ch37 存储选型 · Ch42 消息与弹性",
        "",
        "白板 3–4 档就够，不要一次画出 8 档 × 3 套编码。教学默认：**360p 弱网兜底、720p 移动网、1080p Wi-Fi**；能解 AV1 的客户端走更省带宽的同分辨率档（下一节对照）。更高 4K 按产品要不要再加，不是开场必画。",
        "",
        "为什么服务端预转、不让客户端降级：移动端 CPU / 电量扛不住实时转码；ABR 要的是 **已经切好的分片**，才能在弱网秒切。代价是存储和计算翻倍——用长尾和按需转码把冷片的档数砍回去（第三节）。",
        "",
        "**管线：** 对象存储写入 → MQ（Ch42）→ worker 拉任务出阶梯 → 写回存储 → 完成事件更新「可播放」。转码慢、易积压，所以必须异步，别让上传 HTTP 同步等完 1080p。失败可恢复就重试该档；源片损坏则标失败，不要死循环。量大、尤其 AV1 时 **GPU 转码一句**：同一套队列，worker 换加速卡，不是另开一章集群课。",
        "",
        "**GOP / 分块（点到，深讲 Ch15）：** 切段要对齐 GOP（Group of Pictures），独立可解码，HLS 分片和并行上传才成立。客户端可按块直传对象存储；**断点续传、upload id、已传块清单** 留给 Ch15 网盘，本场不要把 multipart 协议讲成主线。",
        "",
        "| | 只存源片 | 预转 ladder（**默认**） |",
        "|---|---|---|",
        "| 兼容 | 设备解不开就播不了 | 每档一种常见封装 |",
        "| 弱网 | 整段高码率，必卡 | player 切到 360p |",
        "| 成本 | 存储最小 | 存储 ×档数；换来 CDN 可缓存的小文件 |",
        "| 面试 | red flag | 3–4 档 + MQ；冷片少出档 |",
        "",
        "**面试怎么说：**",
        "",
        "> 「源片进对象存储，MQ 驱动转码出 360/720/1080。客户端不实时转。GOP 对齐保证分片能独立解码；续传细节走网盘题。GPU 只在 AV1 / 量大时点到。」",
        "",
        "trade-off：档越多播放越平滑、存储和转码越贵。开场出 20 档 × HEVC × AV1 是 over-engineering。阻塞上传直到全部档完成，用户会以为失败——那是把同步当可靠，其实是 bottleneck。",
      ].join("\n"),
    },
    {
      id: "sec-play",
      heading: "深入 · HLS/DASH ABR 播放",
      secNum: "14.5",
      related: ["ch38"],
      body: [
        "第二个 hard part。点播放不是把整个 mp4 砸到手机里。**ABR（Adaptive Bitrate）**：player 先拉 manifest，再按当前带宽拉对应档的短分片；网变差就切低档，变好切回。分片是普通 HTTP 文件，CDN 好缓存（Ch38）。",
        "",
        d2(`
shape: sequence_diagram
p: "Player"
cdn: "CDN"
orig: "Origin"
p -> cdn: "GET seg"
cdn -> orig: "miss"
orig -> cdn: "segment"
cdn -> p: "segment"
`),
        "",
        "**本图引用**：Ch38 缓存与 CDN",
        "",
        "命中则 CDN 直接回分片，不必每次打 origin。图里画 miss，是为了讲清 **CDN 后面仍有对象存储源站**。manifest（HLS 的 m3u8 / DASH 的 mpd）同样走 CDN；热片的前几个分片命中率极高。",
        "",
        d2(`
grid-columns: 2
hls: {
  label: "HLS/DASH · 默认"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "分片 ABR"
  b.class: ok
  b: "CDN 友好"
}
prog: {
  label: "Progressive"
  class: group
  grid-columns: 2
  c.class: warn
  c: "整文件"
  d.class: warn
  d: "难切码率"
}
`),
        "",
        "| | Progressive 下载 | HLS / DASH（**默认**） |",
        "|---|---|---|",
        "| 开始播 | 往往要缓冲很大一块 | 首片到就能播 |",
        "| 切码率 | 整文件一种码率 | **按分片换档** |",
        "| CDN | 超大对象，命中差、回源痛 | 小分片、Range 友好 |",
        "| 面试 | 教学对照 | **2026 播放第一答案** |",
        "",
        "2026 不必背 Smooth Streaming / HDS。Apple 生态 HLS，开放标准 DASH；**CMAF** 让两套协议共用同一套分片、只换 manifest——存储不必 ×2。白板说「HLS/DASH ABR，分片一份」即可。",
        "",
        "直播点到：**LL-HLS / CMAF** 把传统 HLS 十几秒延迟压到约 2–5 秒；真正连麦 / 会议才是 WebRTC。本场不把直播画成第二条管线。",
        "",
        "**面试怎么说：**",
        "",
        "> 「播放 HLS/DASH：manifest + 分片，player ABR。走 CDN，miss 回源。不用整文件 progressive 当默认。直播一句 LL-HLS，不展开。」",
        "",
        "trade-off：分片太长（几十秒）切档慢、直播延迟差；太短（亚秒）请求次数和编码开销涨。点播常用数秒一级。自研一套私有 UDP 协议当默认，是 over-engineering。",
      ].join("\n"),
    },
    {
      id: "sec-cdn",
      heading: "深入 · CDN 成本、长尾与 AV1",
      secNum: "14.6",
      related: ["ch38", "ch37"],
      body: [
        "第三个 hard part。粗估已经说明：**钱在 CDN 出口，不在 API QPS。** 访问服从长尾：少数热片吃掉绝大多数观看，大量冷片几乎无人点。设计要顺着这个分布省钱，而不是给每个对象在全球边缘各存一份全阶梯。",
        "",
        "| 手段 | 做什么 | 别做成 |",
        "|---|---|---|",
        "| 热片进 CDN | 爆款分片留在边缘 | 冷片也预热全球 |",
        "| 冷片回源 | 对象存储直接出（Ch37） | 和热片同一套缓存 TTL |",
        "| 冷片少档 | 先出 360/720；点了再补 1080/AV1 | 上传瞬间出满阶梯 |",
        "| 区域热度 | 只在热区缓存 | 假想全球均匀 |",
        "",
        "规模到出口以 Tbps 计，才值得谈和 ISP 合作的自建缓存；中小流量用托管 CDN + 长尾策略。不要开场就造一张全球 PoP 网，那是 over-engineering。",
        "",
        d2(`
grid-columns: 2
h264: {
  label: "H.264 · 兼容"
  class: group
  grid-columns: 2
  a.class: step
  a: "全设备"
  b.class: warn
  b: "码率高"
}
av1: {
  label: "AV1 · 2026"
  class: groupOk
  grid-columns: 2
  c.class: ok
  c: "省带宽"
  d.class: warn
  d: "编码更贵"
}
`),
        "",
        "**本图引用**：Ch38 缓存与 CDN · Ch37 存储选型",
        "",
        "AV1 放在这一节，因为它首先是 **CDN 账单上的 trade-off**：同画质大约能再砍一截码率（公开评测常说相对 HEVC 约 30%、相对 H.264 更多），出口 GB 下降。代价是编码更慢、更吃 GPU，老设备解不开。所以 **H.264 仍是兼容兜底**；AV1 给能解的客户端和高播放量的热片。Apple 设备上 HEVC 常见，追问再补一句，开场不必画三套完整农场。",
        "",
        "| | H.264 | AV1（2026 选项） |",
        "|---|---|---|",
        "| 兼容 | **几乎全设备** | 新设备 / 浏览器；老机要回退 |",
        "| 带宽 | 基准，贵 | 更省，直接减 CDN GB |",
        "| 转码 | 快、便宜 | 慢；GPU worker |",
        "| 面试 | 阶梯里必须有 | 热片 / 能解则上；不是唯一档 |",
        "",
        "**面试怎么说：**",
        "",
        "> 「CDN 是 cost bottleneck。热片缓存、冷片回源、冷片少档。AV1 用来省出口，H.264 兜底。不会把每条长尾都出满 AV1 阶梯。」",
        "",
        "trade-off：AV1 全库预转能省最多带宽，但冷片可能永远播不够本。只出 H.264 最省转码、CDN 最贵。热片双档、冷片 H.264 一两档，是白板默认。",
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
        "Xu 把上传、转码阶梯、HLS/DASH、CDN 长尾讲清楚了，这些机制仍成立。过时的是编码停在 H.264/VP9/HEVC、把某次估算的 CDN 日费用说成事实、以及把直播/短视频/推荐整章补进来当第一答案。",
        "",
        "| 原书或笔记 | 现在怎么答 |",
        "|---|---|",
        "| 编码停在 H.264 / HEVC / VP9 | **H.264 兜底 + AV1 选项**；HEVC 追问一句 |",
        "| 固定满阶梯 | 3–4 档白板；冷片少档；per-title 点到即可 |",
        "| HLS 与 DASH 两套分片 | **ABR 默认**；CMAF 一份分片两份 manifest |",
        "| 直播一句话或补成专章 | **本场点播**；LL-HLS/CMAF 一句 |",
        "| 短视频第二条架构 | **一句「另一套，不展开」** |",
        "| 推荐漏斗接 Feed | **本站不做推荐** |",
        "| CDN ≈ $15 万/天当事实 | **教学假设的数量级**；不伪造成内部账单 |",
        "| 1GB 上传上限 | GB 级片要分块；**续传深讲 Ch15** |",
        "| 云厂商 SKU 清单 | 对象存储 + CDN + MQ；不背产品名 |",
        "",
        "原书仍能用：视频不经 API、预转 ladder、ABR 分片、热片 CDN / 冷片源站。过时的是把 AV1 当成没发生，以及把笔记里的推荐、审核、直播做成主线。",
        "",
        "</details>",
      ].join("\n"),
    },
    {
      id: "sec-traps",
      heading: "追问陷阱",
      secNum: null,
      related: ["ch37", "ch38", "ch42"],
      body: [
        "1. **「视频为什么不能经过 API？」** → 大带宽会打爆 API。字节走对象存储 / CDN，API 只管签发和元数据。",
        "2. **「为什么要转码？」** → 兼容、体积、ABR。只存源片，弱网和老设备都会挂。",
        "3. **「什么是 encoding ladder？」** → 同一源片预转 3–4 档码率/分辨率，player 选档。",
        "4. **「为什么不让客户端实时降级？」** → 手机 CPU/电量扛不住；服务端出分片才能 ABR。",
        "5. **「HLS/DASH 和整文件下载？」** → 默认分片 ABR，CDN 缓存小对象；progressive 难切档。",
        "6. **「CDN miss 怎么办？」** → 回源对象存储。热片应命中；冷片本来就该回源。",
        "7. **「CDN 太贵怎么办？」** → 长尾：热片缓存、冷片回源、冷片少档。不要伪造某厂日账单。",
        "8. **「AV1 为什么提？」** → 省出口带宽；编码更贵、要 GPU；H.264 兜底。",
        "9. **「GOP 是什么？」** → 独立可解码的一组帧。分片/分块要对齐。续传细节 → Ch15。",
        "10. **「直播怎么做？」** → 本场点播。LL-HLS/CMAF 一句；连麦才 WebRTC。不是直播专章。",
        "11. **「短视频 / TikTok？」** → 另一套（竖屏、预加载），不展开第二条架构。",
        "12. **「ContentID / 审核 AI？」** → 上传后可接指纹/审核队列，一句收口，不画成主路径。",
        "13. **终图已经很大了还往上堆？** → 推荐漏斗、云 SKU、自建全球 CDN、网盘续传协议都不是本章。讲透三条 hard part 比画 20 个框得分高。",
      ].join("\n"),
    },
    {
      id: "sec-next",
      heading: "wrap-up 与下一步",
      secNum: null,
      related: ["ch15"],
      body: [
        "收尾不要说完美。三个 bottleneck 口播：",
        "",
        "| bottleneck | 你怎么接 |",
        "|---|---|",
        "| 转码积压 | MQ 异步出 3–4 档；失败重试；GPU 只点到 |",
        "| 卡顿 / 切档 | HLS/DASH ABR；分片走 CDN；别 progressive 当默认 |",
        "| CDN 账单 | 长尾分层；冷片少档；AV1 给热片，H.264 兜底 |",
        "",
        "自测：合上这一页，用 30 秒开场 + 白板高层，把转码阶梯、HLS/DASH、CDN 长尾加 AV1 讲给空气听。哪句卡，回哪一节。",
        "",
        "下一道题是 **Ch15 · 设计网盘**。视频只点到 GOP/分块；网盘把断点续传、版本和冲突讲透——从「大文件怎么播」变成「大文件怎么同步」。",
      ].join("\n"),
    },
  ],
  reviewMd: `# Ch14 · 记忆闪卡

| # | 正面 | 背面 |
|---|---|---|
| 1 | 视频三个 hard part？ | 上传+转码管线；HLS/DASH ABR；CDN 成本/长尾（AV1 放在带宽 trade-off 里）。 |
| 2 | 点播还是直播？ | **默认点播**。直播只点到 LL-HLS/CMAF，不是专章。 |
| 3 | 高层管线？ | Client → Upload API → 对象存储 → 转码 → CDN。视频不经 API。 |
| 4 | 为什么要转码？ | 兼容、体积、ABR。服务端预转 ladder，客户端只选档。 |
| 5 | encoding ladder 白板几档？ | 3–4 档：360 / 720 / 1080，外加能解则 AV1。不要开场 8×3 矩阵。 |
| 6 | 转码怎么驱动？ | 对象存储写入 → MQ → worker（Ch42）。上传 HTTP 不要同步等完。 |
| 7 | HLS/DASH 相对 progressive？ | 分片 + manifest，player ABR，CDN 友好。整文件难切码率。 |
| 8 | 播放 miss 路径？ | Player → CDN → miss 则 origin（对象存储）→ 回填分片。 |
| 9 | 这题真正的 bottleneck？ | **CDN 出口钱**和转码计算，不是播放开始 QPS。用教学假设，不伪造内部账单。 |
| 10 | 长尾怎么省 CDN？ | 热片进边缘；冷片回源；冷片少档。 |
| 11 | AV1 vs H.264？ | AV1 省带宽、编码贵；H.264 全设备兜底。热片才上 AV1。 |
| 12 | GOP / 分块和 Ch15？ | GOP 对齐才能独立解码。断点续传深讲留给网盘。 |`,
});
