import { writeChapter } from "./write-chapter.mjs";

const d2 = (src) => {
  const body = src.trim();
  const sized = /style\.font-size/.test(body) ? body : `style.font-size: 12\n${body}`;
  return "```d2\n" + sized + "\n```";
};

writeChapter({
  id: "ch09",
  num: "09",
  title: "设计短链服务",
  kind: "case",
  relatedChapters: ["ch37", "ch38", "ch06", "ch07"],
  sections: [
    {
      id: "intro",
      heading: "",
      secNum: null,
      related: [],
      body: [
        "> **预计**：50–60 分钟 ｜ **前置**：Ch01 4 步法；Ch06 KV、Ch07 唯一 ID 可后读",
        "> **目标**：按 4 步法把短链讲完；默认答 **302** 和 **base62 + 号段/自增**；能说清为什么 **不要用 Snowflake 当 6 位短码的 ID 源**。",
        "",
        "短链是第一道完整 case。范围小、路径清晰，正好把 Ch01 的骨架跑通。面试官要看的不是你能不能画出「全球 CDN + 数仓」，而是：**两个 endpoint 说得清、规模估对、两个 hard part（这题最该挖透的两块）讲透。**",
        "",
        "系统其实不大。难点在短码怎么生成、跳转怎么回源。",
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
        "> 「短链两个 endpoint：`POST /shorten` 把 long_url 换成短码，`GET /{code}` 做 302 跳回长链。我先估规模——读多写少，存储也不大。两个 hard part：① 默认 **302** 而不是 301，因为要 Analytics，301 会被浏览器缓存、后续不回源；② 短码用 **base62 + 号段/自增**，不要 hash 截断，更不要拿 Snowflake 喂 6 位短码。落地就是 KV + 缓存。」",
        "",
        "然后按 4 步走，别一上来画终图。",
        "",
        d2(`
direction: right
s1: "1 API + 估算"
s2: "2 高层 KV"
s3: "3 302 / 短码"
s4: "4 wrap-up"
s1 -> s2 -> s3 -> s4
`),
        "",
        "| 时间盒 | 你在做什么 |",
        "|---|---|",
        "| 3–10 min | 澄清：自定义短码、过期、Analytics、读写比 |",
        "| 接着 2 min | back-of-envelope：写百级 QPS、读万级、TB 级存储 |",
        "| 10–15 min | 高层：client → gateway → shorten/redirect → KV+Cache |",
        "| 10–25 min | deep dive：302 vs 301、base62 vs hash、不用雪花、热点 |",
        "| 3–5 min | wrap-up：3 个 bottleneck（热点短码、可枚举、缓存不一致） |",
        "",
        "**red flag：** 还没问 Analytics 就画 301；还没算 62^6 就说「用 Snowflake + base62」；高层图里塞满 MQ、数仓、多 Region。那是 over-engineering。",
      ].join("\n"),
    },
    {
      id: "sec-clarify",
      heading: "澄清问题清单",
      secNum: "9.1",
      related: [],
      body: [
        "没问清楚就画图 = Jimmy。短链这题 5–7 个问题就停，其余自己假设写白板。",
        "",
        "| 你问 | 典型回答 / 你自己的假设 | 它改什么 |",
        "|---|---|---|",
        "| 要不要自定义短码？ | 要。用户指定的码优先 | 写路径先查占用 |",
        "| 短链过不过期？ | 可选 TTL | schema 加 `expires_at`，读时校验 |",
        "| 要不要 Analytics？ | **要**（默认） | 必须 302；埋点异步 |",
        "| 读写比？ | 每条被点几十到上百次 | 读多写少 → 缓存 |",
        "| 同一 long_url 多次 shorten，返回同码吗？ | 默认同码 | 反向索引，写路径幂等 |",
        "| 要不要预览真实目标？ | 点到即可 | `短码+` / preview，防钓鱼 |",
        "",
        "面试官说「你定」时，把假设写上去：",
        "",
        "> 「我假设：要点击统计、允许自定义短码、读写大约 100:1、同一 long_url 返回同一短码。先按这个画，不对你打断我。」",
        "",
        "问太多超过 10 分钟也是 red flag。黄金线还是那条：**问关键问题 → 自己给假设 → 写白板 → 继续。**",
      ].join("\n"),
    },
    {
      id: "sec-estimate",
      heading: "粗估",
      secNum: "9.2",
      related: ["ch03"],
      body: [
        "公式细节在 Ch03。这里只要数量级，证明你知道**这是小系统**。下面用公开量级做假设，不是某厂内部数字。",
        "",
        "假设：日创建约 100 万条；每条平均被点约 100 次。",
        "",
        "| 项 | 怎么估 | 量级 |",
        "|---|---|---|",
        "| 写 QPS（shorten） | 1e6 / 86400 | **约 10**，峰值打 10 倍也就是百级 |",
        "| 读 QPS（redirect） | 写 × 100 | **约 1e3–1e4** |",
        "| 读写比 | 读 / 写 | **约 100:1**，缓存友好 |",
        "| 存储 | 每条 code + URL + 元数据约 0.5 KB；年增约 2 亿条 | 年增约 **100 GB**；十年含副本仍是 **TB 级** |",
        "| 带宽 | 302 响应本身几百字节，不是目标页大小 | 万级 QPS 也只是 **MB/s** 出站头 |",
        "",
        "**面试怎么说：**",
        "",
        "> 「读写比大约 100:1，存储 TB 级。这不是分布式难题。QPS 和容量都撑得住单 Region 的 KV + 缓存。我把时间花在短码和跳转上。」",
        "",
        "常见算错：把用户点开后下载的整个落地页算进短链带宽。短链服务返回的是 **302 + Location**，那几十字节才是你的出站。",
      ].join("\n"),
    },
    {
      id: "sec-arch",
      heading: "高层架构",
      secNum: "9.3",
      related: ["ch06", "ch37", "ch38"],
      body: [
        "从左到右：client → LB → shorten / redirect → KV + Cache。面试官 buy-in 之后再拆写路径、读路径。",
        "",
        d2(`
direction: right
app.class: go
app: "浏览器 / App"
lb.class: step
lb: "LB"
shorten.class: ok
shorten: "shorten"
redirect.class: ok
redirect: "redirect"
kv.class: store
kv: "KV"
cache.class: store
cache: "Cache"
app -> lb
lb -> shorten -> kv
lb -> redirect -> cache
`),
        "",
        "**本图引用**：Ch06 键值存储 · Ch37 存储选型 · Ch38 缓存与 CDN",
        "",
        "**schema（够用就停）：** `short_code`（PK）→ `long_url`；可选 `expires_at`、`user_id`、`created_at`。不需要 JOIN，所以 KV 比关系库更贴这题。小规模 PostgreSQL 单表也能过面试——说清「现在单表，QPS 上来再换 KV」即可。",
        "",
        "**写路径**和**读路径**分开画，不要画成一张迷宫。",
        "",
        d2(`
direction: right
longUrl: "long_url"
leaf: "号段取 ID"
enc: "base62"
kv: "写入 KV"
out: "返回短码"
longUrl -> leaf -> enc -> kv -> out
`),
        "",
        "**本图引用**：Ch07 分布式唯一 ID",
        "",
        "写路径口播：自定义短码优先（占用则拒绝）；否则从号段拿一个 ID，base62 成 6 位，写入 `code → url`。若要求同 URL 同码，再写一条 `url → code` 反查。",
        "",
        "读路径用时序。先看**缓存未命中**（步骤更全）；命中时 Cache 直接返回 long_url，不打 KV。",
        "",
        d2(`
shape: sequence_diagram
browser: "浏览器"
svc: "redirect"
cache: "Cache"
kv: "KV"
browser -> svc: "GET /abc123"
svc -> cache: "查短码"
cache -> svc: "未命中"
svc -> kv: "查映射"
kv -> svc: "long_url"
svc -> cache: "回填"
svc -> browser: "302 Location"
`),
        "",
        "**本图引用**：Ch38 缓存与 CDN · Ch06 键值存储",
        "",
        "302 返回后，点击事件**异步**丢进 MQ，不要同步写分析库。Analytics 点到为止，这题不是数仓课。",
        "",
        "高层图到这里就该停，问一句：「方向 OK 吗？接下来挖 302 和短码。」",
      ].join("\n"),
    },
    {
      id: "sec-redirect",
      heading: "深入 · 301 vs 302",
      secNum: "9.4",
      related: ["ch38"],
      body: [
        "第一个 hard part。短链默认 **302**。",
        "",
        d2(`
grid-rows: 2
temp: {
  label: "302 临时 · 默认"
  class: groupOk
  grid-columns: 3
  a.class: ok
  a: "每次回源"
  b.class: ok
  b: "Analytics"
  c.class: ok
  c: "可改目标"
}
perm: {
  label: "301 永久 · 仅 SEO"
  class: groupBad
  grid-columns: 3
  d.class: bad
  d: "浏览器缓存"
  e.class: bad
  e: "后续不回源"
  f.class: bad
  f: "统计丢失"
}
`),
        "",
        "| | 302 Found | 301 Moved Permanently |",
        "|---|---|---|",
        "| 浏览器 | 不把跳转当永久缓存 | **会缓存**，之后直跳长链 |",
        "| 是否回源 | **每次点击都打你的服务** | 第一次之后不再来 |",
        "| Analytics | 每次都能埋点 | 后续点击统计不到 |",
        "| 改目标 / 过期 | 可以：下次 302 到新地址或 404 | 客户端还记着旧 Location |",
        "| SEO | 权重不传给目标 | 适合永久搬家 |",
        "",
        "**为什么默认 302：** 商业短链的核心价值之一是点击统计。301 一旦被浏览器（以及部分中间代理）缓存，后面的点击根本不经过你——Analytics、过期、更换目标全失效。",
        "",
        "**面试怎么说：**",
        "",
        "> 「我用 302。短链要统计每一次点击；301 会被浏览器缓存，后续不回源。只有面试官明确说『纯 SEO、永不改目标、不要统计』，才改 301。」",
        "",
        "trade-off 要主动讲：302 让读 QPS 都打到你这边。这正是前面要上 Cache 的原因，**不是**改回 301 的理由。",
        "",
        "同样不要把 302 丢到 CDN 里长期缓存——效果约等于变相 301，Analytics 又没了。热点用**服务端**本地缓存 / Redis，见下一节。",
      ].join("\n"),
    },
    {
      id: "sec-code",
      heading: "深入 · hash vs base62（不要用雪花）",
      secNum: "9.5",
      related: ["ch07"],
      body: [
        "第二个 hard part。生产默认：**base62 编码号段或 DB 自增 ID**，6 位。",
        "",
        "base62 字符集是 `[0-9a-zA-Z]`，共 62 个。**6 位 = 62^6 = 56,800,235,584 ≈ 568 亿。** 日增百万条也要用上百年才满；真不够就加到 7 位（约 3.5 万亿），不要先换 ID 方案。",
        "",
        d2(`
grid-rows: 2
b62: {
  label: "base62 + 号段 · 默认"
  class: groupOk
  grid-columns: 3
  a.class: ok
  a: "无冲突"
  b.class: ok
  b: "刚好 6 位"
  c.class: ok
  c: "ID 小于 62^6"
}
hsh: {
  label: "hash 截断 · 要查库"
  class: groupBad
  grid-columns: 3
  d.class: bad
  d: "生日悖论"
  e.class: bad
  e: "必须查库"
  f.class: bad
  f: "冲突重试"
}
`),
        "",
        "### hash 截断为什么麻烦",
        "",
        "`MD5(long_url)` 再截成 6 位（大约 36 bit）看起来「空间很大」。生日悖论：冲突概率 50% 大约在 **√N** 条。N = 568 亿时，√N ≈ **24 万**。几十万条就可能撞，不是「568 亿条才会撞」。",
        "",
        "所以 hash 方案**必须查库**：码已存在且不是同一 URL → 加盐或换后缀再 hash，再查，直到空位。写路径多一次读、还要处理并发双写。同 URL 同码是它唯一的甜头。",
        "",
        "### base62 + 号段为什么是默认",
        "",
        "ID 唯一 → 编码后唯一，**无冲突、不必为生成去查库**。号段（Leaf segment）或 DB 自增都是「从小往上涨」的 ID，喂给 base62 就是 6 位。Ch07 讲号段：每个 shorten 实例一次领一段（如 1–10000），本地自增，用完再领。",
        "",
        "缺点也要说：默认情况下同 URL 每次新 ID、新码；相邻码可猜。前者用反向索引补；后者用限流，不要为了「不可猜」去上 Snowflake。",
        "",
        "### 高频翻车：不要用 Snowflake 当 6 位短码的 ID 源",
        "",
        "雪花 ID 是 64 位，量级约 **10^18**。`base62(10^18)` 大约 **11 位**，不是 6 位。6 位要求 ID **< 62^6 ≈ 568 亿**。雪花高位是毫秒时间戳，远超这个上限。",
        "",
        d2(`
grid-rows: 2
seg: {
  label: "号段 / DB 自增"
  class: groupOk
  grid-columns: 3
  a.class: ok
  a: "ID 从小涨"
  b.class: ok
  b: "编成 6 位"
  c.class: ok
  c: "Leaf segment"
}
snow: {
  label: "Snowflake · 不要喂短码"
  class: groupBad
  grid-columns: 3
  d.class: bad
  d: "量级 10^18"
  e.class: bad
  e: "大约 11 位"
  f.class: bad
  f: "不是 6 位"
}
`),
        "",
        "| ID 源 | 量级 | base62 长度 | 6 位短链？ |",
        "|---|---|---|---|",
        "| DB 自增 / 号段（Leaf segment） | 1 → 568 亿 | **6 位** | **用这个** |",
        "| Snowflake | ~10^18 | **约 11 位** | 不适合 |",
        "| UUID | ~10^38 | 二十多位 | 不适合 |",
        "",
        "截断雪花也不行：丢掉 sequence 或机器位，同一毫秒就会冲突，唯一性保证被破坏。要短，就用**小 ID**；要雪花那种吞吐和不协调，就接受 11 位——短链面试两者都不是默认。",
        "",
        "**面试怎么说：**",
        "",
        "> 「生产我用号段或 DB 自增，再 base62。雪花大约 10 的 18 次，编完 11 位，喂不成 6 位。Ch07 的雪花留给订单号、消息 ID。」",
      ].join("\n"),
    },
    {
      id: "sec-hot",
      heading: "深入 · 热点短码与写路径幂等",
      secNum: "9.6",
      related: ["ch38"],
      body: [
        "读是 Zipf：少数短码（活动页、热帖）吃掉大部分 redirect。这是读路径的 bottleneck，不是再加一层数仓能解决的。",
        "",
        d2(`
direction: right
req: "redirect"
local: "本地 LRU"
redis: "Redis"
kv: "KV"
req -> local
local -> redis: "miss"
redis -> kv: "miss"
`),
        "",
        "**本图引用**：Ch38 缓存与 CDN",
        "",
        "| 层 | 做什么 |",
        "|---|---|",
        "| 进程内 LRU | 挡爆款；同一实例不再打 Redis |",
        "| Redis | 热集；单机挂了还有 KV |",
        "| KV | 冷数据与权威映射 |",
        "",
        "缓存 miss 时注意 stampede：同一爆款码同时打穿，用 singleflight / 锁合并回源，不要 N 个请求一起打 KV。失效用短 TTL + 删除时主动删缓存。细节在 Ch38。",
        "",
        "**写路径幂等：** 同一 `long_url` 是否返回同一码？默认假设**是**——少垃圾码，也防「同一落地页刷几千条」。实现：先查 `url → code`；有则直接返回；无则生成并**同时写**正向、反向两条。自定义短码：`Put` 带「码不存在」条件，冲突返回占用。",
        "",
        "自定义短码**优先于**生成码：用户要 `/sale` 就先占 `/sale`，不要再发一个随机 6 位。",
        "",
        "安全点到即可：短链会藏真实 URL，适合钓鱼。面试加一句「可疑则预览页（很多产品用短码后面加 `+`）」+ 创建限流，够了。可枚举见追问。不要展开成完整安全课。",
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
        "| 原书或笔记 | 现在怎么答 |",
        "|---|---|",
        "| 301/302 给了表，默认倾向 301（省流量） | **默认 302**。要 Analytics、要能改目标、要过期。301 仅 SEO / 永久搬家 |",
        "| Analytics 几乎没串到状态码 | 302 的理由就是每次回源才能埋点；埋点走 MQ，不挡 302 |",
        "| base62 没接 ID 生成器 | 接 **号段 / DB 自增**（Ch07），不是雪花 |",
        "| hash 冲突一笔带过 | 截断 + 生日悖论，必须查库重试 |",
        "| 笔记对照表有一行「2026 接雪花」 | **以数学为准，忽略那行。** 雪花 ~10^18 → 约 11 位，编不成 6 位 |",
        "",
        "原书作为入门骨架仍然能用：两个 API、KV、缓存。过时的是**默认 301**和**没把 ID 长度算清楚**。",
        "",
        "</details>",
      ].join("\n"),
    },
    {
      id: "sec-traps",
      heading: "追问陷阱",
      secNum: null,
      related: ["ch07", "ch38"],
      body: [
        "1. **「301 还是 302？」** → 短链默认 302。301 浏览器缓存，后续不回源，Analytics / 过期 / 换目标全断。纯 SEO 才 301。",
        "2. **「为什么不用雪花？」** → 雪花 ~10^18，base62 约 11 位。6 位要求 ID < 62^6 ≈ 568 亿。用号段或 DB 自增。截断雪花会丢唯一性。",
        "3. **「6 位够不够？」** → 568 亿。日增百万也极其宽裕。不够加到 7 位，不要先换方案。",
        "4. **「短码可枚举怎么办？」** → 自增 base62 相邻可猜。创建限流；需要不可预测再加盐或随机码池。**不要**为此改用雪花。",
        "5. **「热点短码把 Redis / KV 打穿？」** → 本地 LRU + Redis；miss 合并回源。不要用 CDN 长期缓存 302。",
        "6. **「同 URL 多次 shorten？」** → 要同码就反向索引，写路径幂等。不要每次新发一个码还声称去重。",
        "7. **「hash 不是无状态更香吗？」** → 同 URL 同码是真的；截断必冲突，必须查库。生产更常选号段 + 反查。",
        "8. **终图已经很大了还往上堆？** → 这题 over-engineering 的典型。单 Region、KV、缓存、302、号段，讲透比画 20 个框得分高。",
      ].join("\n"),
    },
    {
      id: "sec-next",
      heading: "wrap-up 与下一步",
      secNum: null,
      related: ["ch10"],
      body: [
        "收尾不要说完美。三个 bottleneck 口播：",
        "",
        "| bottleneck | 你怎么接 |",
        "|---|---|",
        "| 热点短码 | 本地缓存 + Redis；合并回源 |",
        "| 可枚举 / 滥用创建 | 限流；反向索引同 URL 同码 |",
        "| 缓存与 KV 不一致 | 短 TTL + 删除时失效 |",
        "",
        "自测：合上这一页，用 30 秒开场 + 白板高层，把 302 和「不用雪花」讲给空气听。哪句卡，回哪一节。",
        "",
        "下一道题是 **Ch10 · 设计通知系统**（SMS / Email / Push + MQ）。短链是读多写少的 KV；通知是 fan-out 和投递。",
      ].join("\n"),
    },
  ],
  reviewMd: `# Ch09 · 记忆闪卡

| # | 正面 | 背面 |
|---|---|---|
| 1 | 短链两个核心 endpoint？ | \`POST /shorten\`：long_url → 短码。\`GET /{code}\`：302 到 long_url。 |
| 2 | 短链默认 301 还是 302？为什么？ | **302**。要 Analytics、能改目标/过期。301 会被浏览器缓存，后续不回源。 |
| 3 | 301 之后发生什么？ | 浏览器记住 Location，之后直跳长链，短链服务看不到点击。 |
| 4 | 生产短码默认怎么生成？ | **base62 + 号段或 DB 自增**。无冲突，6 位。hash 截断要查库重试。 |
| 5 | 为什么不用 Snowflake 当 6 位短码 ID？ | 雪花 ~10^18，base62 约 11 位。6 位需要 ID < 62^6 ≈ 568 亿。 |
| 6 | 62^6 是多少？6 位够不够？ | ≈ 568 亿。日增百万也极宽裕；不够加到 7 位。 |
| 7 | hash 截断为什么必须查库？ | 生日悖论：空间 568 亿时，约几十万条就可能冲突。撞了要加盐重试。 |
| 8 | 热点短码怎么挡？ | 本地 LRU → Redis → KV；miss 合并回源。不要长期 CDN 缓存 302。 |
| 9 | 同一 long_url 如何返回同一码？ | 反向索引 url → code；写路径先查再写，幂等。 |
| 10 | 自定义短码和生成码谁优先？ | 自定义优先。占用则拒绝，不要再发随机码。 |
| 11 | 短码可枚举怎么接？ | 创建限流；要不可预测再加盐或随机池。不要为此改用雪花。 |
| 12 | 这题最大的 over-engineering 是什么？ | 系统其实不大。终图堆 CDN/多 Region/数仓，却没讲清 302 和号段。 |`,
});
