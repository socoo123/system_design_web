import { writeChapter } from "./write-chapter.mjs";

const d2 = (src) => {
  const body = src.trim();
  const sized = /style\.font-size/.test(body) ? body : `style.font-size: 12\n${body}`;
  return "```d2\n" + sized + "\n```";
};

writeChapter({
  id: "ch11",
  num: "11",
  title: "设计新闻 Feed",
  kind: "case",
  relatedChapters: ["ch38", "ch41", "ch42"],
  sections: [
    {
      id: "intro",
      heading: "",
      secNum: null,
      related: [],
      body: [
        "> **预计**：50–60 分钟 ｜ **前置**：Ch01 4 步法；Ch38 缓存、Ch42 消息可后读",
        "> **目标**：按 4 步法把关注流讲完；默认 **hybrid fan-out**；cursor 分页；不讲推荐模型。",
        "",
        "新闻 Feed 是第三道完整 case。短链是读多写少的 KV；通知是服务 → 用户的 fan-out；这题反过来：**一条帖子要出现在所有粉丝的时间线里**，写会被粉丝数放大。面试官要看的不是你能不能画出「全球多 Region + For You 漏斗」，而是：**流类型问清、写放大估对、三个 hard part（这题最该挖透的三块）讲透。**",
        "",
        "系统看起来就是发帖和刷列表。难点在 push vs pull、大 V 把 Redis 打穿、分页和补全别漂。",
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
        "> 「Feed 三个 hard part：push vs pull vs hybrid、大 V 写放大、cursor 分页和 hydration。我先确认是关注流还是推荐流——这题默认 **关注流**；推荐是另一道题，这里不展开模型。规模按千万 DAU 白板：发帖 QPS 很小，但 fan-out = 帖子 × 粉丝数。架构默认 **hybrid fan-out**：普通人写时 push 进粉丝 timeline 缓存，大 V 只写 outbox、读时 pull。timeline 只存 `post_id`，读时批量 hydrate。分页用 cursor，不用 offset。」",
        "",
        "然后按 4 步走，别一上来画终图。",
        "",
        d2(`
direction: right
s1: "1 流类型 + 估算"
s2: "2 高层 hybrid"
s3: "3 推拉 / 大V"
s4: "4 cursor"
s1 -> s2 -> s3 -> s4
`),
        "",
        "| 时间盒 | 你在做什么 |",
        "|---|---|",
        "| 3–10 min | 澄清：关注流 vs 推荐流、时间线 vs 简单权重、实时、媒体、分页 |",
        "| 接着 2 min | back-of-envelope：千万 DAU；发帖小 QPS；**写放大 = 帖 × 粉丝** |",
        "| 10–15 min | 高层：client → feed svc → post 库 + MQ → timeline 缓存 |",
        "| 10–25 min | deep dive：hybrid、大 V / hot key、cursor + hydration |",
        "| 3–5 min | wrap-up：3 个 bottleneck（大 V 写尖峰、timeline 内存、删帖可见性） |",
        "",
        "**red flag：** 还没问流类型就画召回 / 精排；还没算写放大就纯 push；分页用 `LIMIT/OFFSET`；高层图里塞满 CDN 细节、图数据库、多 Region。那是 over-engineering，或把推荐系统 / Ch14 / Ch38 整章搬进来。",
      ].join("\n"),
    },
    {
      id: "sec-clarify",
      heading: "澄清问题清单",
      secNum: "11.1",
      related: [],
      body: [
        "没问清楚就画图 = Jimmy。Feed 这题 5–7 个问题就停，其余自己假设写白板。",
        "",
        "| 你问 | 典型回答 / 你自己的假设 | 它改什么 |",
        "|---|---|---|",
        "| 关注流还是推荐流？ | **关注流**（默认） | 社交图 + hybrid；推荐说「另一道题，不展开模型」 |",
        "| 时间线还是简单权重？ | **时间线**默认 | ZSET score=时间；权重则多一次算分 |",
        "| 粉丝要秒级看到吗？ | 秒级最终一致 | 异步 fan-out；不保证全球同时 |",
        "| 图文还是视频？ | 图文为主 | 媒体对象存储 + CDN；不设计 CDN |",
        "| 分页怎么翻？ | **cursor** | 禁止 offset |",
        "| 删帖要立刻从所有 feed 消失？ | 读时过滤 | tombstone；不反向 fan-out |",
        "",
        "面试官说「你定」时，把假设写上去：",
        "",
        "> 「我假设：这是关注流，不是 For You。默认时间线排序，秒级最终一致。媒体走对象存储 + CDN，CDN 不在这题展开。分页 cursor。先按这个画，不对你打断我。」",
        "",
        "问到推荐流时：**承认差别，立刻收口。** 「那是另一道题，这里不展开模型。本场按关注流 + hybrid fan-out 讲。」问太多超过 10 分钟也是 red flag。黄金线还是那条：**问关键问题 → 自己给假设 → 写白板 → 继续。**",
      ].join("\n"),
    },
    {
      id: "sec-estimate",
      heading: "粗估",
      secNum: "11.2",
      related: ["ch03"],
      body: [
        "公式细节在 Ch03。这里只要数量级，证明你知道**发帖本身不贵，贵的是 fan-out。** 下面用公开量级做白板假设，不是某厂内部数字。",
        "",
        "假设：约 **1000 万 DAU**；约 10% 每天发 1 帖；人均每天打开 feed 约 20 次；**平均粉丝数按 200**（中位数更低，均值被大 V 拉高）。",
        "",
        "| 项 | 怎么估 | 量级 |",
        "|---|---|---|",
        "| 发帖 QPS | 1e6 帖/天 / 86400 | **约 12**；峰值 ×5 大约几十 |",
        "| 读 feed QPS | 1e7 × 20 / 86400 | **约 2e3**；峰值大约 **1e4** |",
        "| **纯 push 写放大** | 1e6 帖 × 200 粉丝 / 86400 | **约 2e3 ZADD/s**；峰值大约 **1e4/s** |",
        "| 大 V 一条 | 100 万粉 / 1000 万粉 | **瞬时 1e6 / 1e7 次写**，摊不进日均 |",
        "| 文本存储 | 1 KB × 1e6/天 | **约 1 GB/天**；权威在 post 库 |",
        "| timeline 内存 | 活跃用户 × 最近 1000 个 id | **几十到一百 GB 量级** Redis（只缓存活跃） |",
        "| 媒体带宽 | 图走对象存储 + CDN | 出站不进 feed svc；CDN 回 Ch38 |",
        "",
        "写放大必须开口算：**fan-out 写次数 ≈ 帖子数 × 粉丝数。** 发帖 QPS 看起来是十几，纯 push 会把它乘上平均粉丝数。大 V 更极端：一次发帖等于一次对全粉丝集合的写风暴，不是「再加一台 fan-out worker」能抹平的。",
        "",
        "**面试怎么说：**",
        "",
        "> 「千万 DAU 白板：发帖日均十几 QPS，读 feed 千到万级。真正的 bottleneck 是写放大——平均 200 粉就把写放大到每秒几千次 ZADD。大 V 百万粉是瞬时百万次写，所以不能纯 push，要 hybrid。」",
        "",
        "常见算错：只报发帖 QPS，假装这是写路径的全部；或把某明星真实粉丝数当自己的内部数字。教学用数量级，阈值到 deep dive 再说。",
      ].join("\n"),
    },
    {
      id: "sec-arch",
      heading: "高层架构",
      secNum: "11.3",
      related: ["ch38", "ch41", "ch42"],
      body: [
        "从左到右：App → feed svc → post 库（权威）+ MQ（异步 fan-out）→ 粉丝 timeline 缓存。面试官 buy-in 之后再拆写路径和读路径。",
        "",
        d2(`
direction: right
app.class: go
app: "App"
api.class: step
api: "Feed svc"
mq.class: store
mq: "MQ"
tl.class: store
tl: "Timeline"
post.class: store
post: "Post 库"
app -> api
api -> post
api -> mq -> tl
`),
        "",
        "**本图引用**：Ch38 缓存与 CDN · Ch41 复制、分片 · Ch42 消息、弹性",
        "",
        "**为什么拆成 post 库 + timeline 缓存（必答）：** post 是权威，按作者分片（Ch41）；timeline 是每人一份预计算 inbox，只存 `post_id`。读快靠缓存，写放大走 MQ 异步（Ch42），API 先返回。Kafka 分区 / ISR 留给 Ch20，这里不要讲成消息队列课。媒体 URL 进对象存储，浏览走 CDN——点到 Ch38，不要设计边缘节点。",
        "",
        "**schema（够用就停）：** `post`（post_id、author_id、text、media_url、created_at、deleted）；`follow`（follower_id、followee_id）；timeline = Redis ZSET（score=时间，member=`post_id`）；大 V 另有 outbox ZSET。不要在白板上画五张宽表。",
        "",
        "排序只保留两档，别往 ML 滑：",
        "",
        "| | 时间线（默认） | 简单权重 |",
        "|---|---|---|",
        "| 做法 | ZSET score=时间戳 | 互动 × 时间衰减一类可解释分 |",
        "| 读 | `ZREVRANGE` 即页 | 先算分再写入或读时排 |",
        "| 代价 | 新帖可能把旧热帖顶下去 | 删帖 / 计数变化要让分失效 |",
        "| 面试 | **关注流默认** | 面试官说「别那么呆」时再加 |",
        "",
        "**面试怎么说：**",
        "",
        "> 「关注流我默认时间线。简单权重可以提一句亲和度 × 衰减，但不会在这题上模型。timeline 只存 id，全文走 post 缓存 hydrate。」",
        "",
        "写路径：**先持久化 post，再入 MQ，再 fan-out。** API 不在请求线程里扫粉丝列表。普通人：查粉丝 → 对每个 timeline `ZADD`，并 `ZREMRANGEBYRANK` 只留最近 N 条。大 V：只写自己的 outbox，见下一节。",
        "",
        d2(`
direction: right
w1.class: go
w1: "发帖"
w2.class: step
w2: "写 Post 库"
w3.class: store
w3: "入 MQ"
w4.class: step
w4: "Fan-out"
w5.class: store
w5: "ZADD 粉丝"
w1 -> w2 -> w3 -> w4 -> w5
`),
        "",
        "**本图引用**：Ch42 消息、弹性 · Ch41 复制、分片",
        "",
        "follow 表的热点查询是「作者的粉丝列表」（`followee_id` 索引）。fan-out worker 要幂等：`ZADD` 同一 `post_id` 两次结果一样。MQ 按 at-least-once 声明即可。",
        "",
        "高层图到这里就该停，问一句：「方向 OK 吗？接下来挖 hybrid、大 V，以及 cursor / hydration。」",
      ].join("\n"),
    },
    {
      id: "sec-pushpull",
      heading: "深入 · Push vs Pull vs Hybrid",
      secNum: "11.4",
      related: ["ch42", "ch38"],
      body: [
        "第一个 hard part。**fan-out 发生在写时还是读时？** 这是写放大 vs 读延迟的 trade-off，不是道德选择。",
        "",
        d2(`
grid-columns: 2
push: {
  label: "Push · 写时 fan-out"
  class: groupOk
  grid-columns: 3
  a.class: ok
  a: "读 O(1)"
  b.class: ok
  b: "写 = 粉丝数"
  c.class: ok
  c: "普通人合适"
}
pull: {
  label: "Pull · 读时 fan-out"
  class: group
  grid-columns: 3
  d.class: step
  d: "写 = 1"
  e.class: step
  e: "读 = 关注数"
  f.class: step
  f: "大V合适"
}
`),
        "",
        "| | Push（写时 fan-out） | Pull（读时 fan-out） | Hybrid（**默认**） |",
        "|---|---|---|---|",
        "| 发帖时 | 写入每个粉丝 timeline | 只写作者 outbox | 普通人 push；大 V 只写 outbox |",
        "| 读 feed | 一次 `ZREVRANGE` | 拉每个关注者最近帖再 merge | 读自己 inbox + 拉关注的大 V |",
        "| 读延迟 | 低 | 高（关注数线性） | 低（大 V 路条数通常很小） |",
        "| 写放大 | **帖 × 粉丝** | 1 | 被阈值截断 |",
        "| 失败模式 | 大 V 写风暴 | 关注 5000 人 = 5000 次读 | 阈值定错 / merge 忘去重 |",
        "",
        "纯 push 在普通人身上很香：粉丝几十到几千，预计算让刷 feed 变成一次缓存读。纯 pull 在大 V 身上很香：发帖写一次，粉丝的读摊在一天里。两边的失败模式都在规模上爆炸——所以 2026 白板默认 **hybrid**，不是「先画 push，被问明星再改」。",
        "",
        "**面试怎么说：**",
        "",
        "> 「普通人 push，大 V pull，读时 merge。阈值按粉丝数（教学大约十万），不是魔法数，看写放大和读延迟调。不会一上来纯 push 把终图画死。」",
        "",
        "trade-off 要主动讲：hybrid 多一次 merge 和一套「谁是大 V」的标记；换来的是写路径有上界。小规模（远低于千万 DAU、没有大 V）可以说先纯 push，并声明阈值触发再切——那是演进，不是这题的第一答案。",
      ].join("\n"),
    },
    {
      id: "sec-celeb",
      heading: "深入 · 大 V 与写放大",
      secNum: "11.5",
      related: ["ch38", "ch41"],
      body: [
        "第二个 hard part。粉丝数服从幂律：极少数账号贡献绝大部分 fan-out 工作量。教学假设一条百万粉的帖，纯 push = **瞬时 1e6 次** timeline 写。千万粉就是 **1e7**。MQ 堆积、Redis CPU、粉丝看到的时间两极分化——这是 hot key，不是再加消费者能从根上消掉的。",
        "",
        d2(`
grid-columns: 2
purePush: {
  label: "纯 push · 灾难"
  class: groupBad
  grid-columns: 3
  a.class: bad
  a: "百万次 ZADD"
  b.class: bad
  b: "MQ / Redis 尖峰"
  c.class: bad
  c: "粉丝看到不均"
}
hybrid: {
  label: "hybrid · 默认"
  class: groupOk
  grid-columns: 3
  d.class: ok
  d: "只写 outbox"
  e.class: ok
  e: "读时 merge"
  f.class: ok
  f: "写放大 = 1"
}
`),
        "",
        "| | 纯 push 给大 V | Hybrid |",
        "|---|---|---|",
        "| 写 | 1 帖 → N 粉丝 N 次写 | 1 帖 → 1 次 outbox 写 |",
        "| 读 | 粉丝 inbox 已有 id | inbox（普通人）+ 大 V outbox 最近 N 条 |",
        "| hot key | **写热点**（Redis 最怕） | 读热点（同一份 outbox，缓存友好） |",
        "| 可选加速 | — | 对**活跃粉丝**限速分批 push，非活跃仍 pull |",
        "",
        "为什么大 V 适合 pull：写尖峰是同一毫秒打进来的；读是千万粉丝在一天里陆续打开 App。把成本从「瞬时写」换成「分散读」，尖峰消失。每人关注的大 V 数量通常远小于关注总数，merge 成本可预期。",
        "",
        "阈值：白板说 **约 10 万粉** 当教学线，并补一句「生产按写放大和 p99 读延迟调，不是魔法数」。低于阈值走 push；跨过就停 push、改 outbox。账号从普通人变成大 V 时，旧的 push 可以停，已在粉丝 inbox 里的 id 不必立刻清。",
        "",
        "再砍一刀写放大（点到即可，别展开成第四套架构）：**不给长期不活跃的粉丝 push**。他们回来时用 pull 重建一页即可。活跃粉丝占比往往远小于粉丝总数。",
        "",
        "**面试怎么说：**",
        "",
        "> 「大 V 我不停地 ZADD 全体粉丝。只写 outbox，粉丝读 feed 时 merge。活跃粉丝可以限速分批 push，那是优化不是第一张图。写热点改成读热点，缓存吃得下。」",
        "",
        "追问「大 V 粉丝怎么及时看到」：outbox 写入是一次、立刻；粉丝下一次读（或长连接推一条轻量「有新帖」，点到 Ch12）就能 merge 到。不需要、也不该保证一亿人在同一秒 inbox 里出现这条 id。",
      ].join("\n"),
    },
    {
      id: "sec-cursor",
      heading: "深入 · cursor 分页与 hydration",
      secNum: "11.6",
      related: ["ch38"],
      body: [
        "第三个 hard part。Feed 是无限下翻 + 发帖持续插入。**分页必须 cursor，timeline 必须先取 id 再 hydrate。** 这两件事绑在一起：页稳不稳看 cursor；内容对不对看补全和失效。",
        "",
        d2(`
grid-columns: 2
offset: {
  label: "offset · 不要"
  class: groupBad
  grid-columns: 3
  a.class: bad
  a: "深翻扫行"
  b.class: bad
  b: "插入漂移"
  c.class: bad
  c: "重复或漏"
}
cursor: {
  label: "cursor · 默认"
  class: groupOk
  grid-columns: 3
  d.class: ok
  d: "锚在 last_id"
  e.class: ok
  e: "走索引"
  f.class: ok
  f: "新帖不挤页"
}
`),
        "",
        "| | offset（`LIMIT 20 OFFSET n`） | cursor（keyset） |",
        "|---|---|---|",
        "| 深翻 | OFFSET 越大越慢 | 从锚点继续，走 ZSET / 索引 |",
        "| 发帖插入 | 下一页重复或跳过 | 锚在 `(ts, post_id)`，新帖只出现在「更新」 |",
        "| hybrid | 两路 merge 更乱 | 同一把有序键切一刀 |",
        "| 面试 | **red flag** | **关注流标配** |",
        "",
        "cursor 白板写法：返回不透明 token，服务端解码成 `(created_at, post_id)`（或雪花 id，本身带时间序）。下一页：timeline 里 **严格小于** 这个锚的 20 条。首页没有 cursor。不要让客户端传 `page=3`。",
        "",
        "读路径：先取 id，再批量补全。**不要把全文塞进每人一份 ZSET**——内存差两个数量级，改帖还要反向改千万份副本。",
        "",
        d2(`
shape: sequence_diagram
app: "App"
api: "Feed API"
tl: "Timeline"
pc: "Post cache"
app -> api: "GET feed"
api -> tl: "ZREVRANGE"
tl -> api: "id 列表"
api -> pc: "MGET hydrate"
pc -> api: "帖子对象"
api -> app: "一页 + cursor"
`),
        "",
        "**本图引用**：Ch38 缓存与 CDN",
        "",
        "hydrate 细节：`MGET post:{id}`；miss 回 post 库再回填（注意 stampede，Ch38）。`deleted=true` 的丢掉，不够一页就再取一段 id。用户卡片、计数走各自缓存，别 JOIN 出一张大宽行。媒体只返回 URL，二进制不经过 feed svc。",
        "",
        "失效不要反向 fan-out：",
        "",
        "| 事件 | 不要 | 要 |",
        "|---|---|---|",
        "| 删帖 | 遍历全部粉丝 inbox 删 id | post tombstone；hydrate 时过滤；后台慢慢摘 id |",
        "| 改文案 | 改千万份副本 | 只改 post / post 缓存；id 不变 |",
        "| 取关 | 立刻扫 inbox | 读时按 follow 集过滤，或异步摘 |",
        "| inbox 膨胀 | 永久堆 id | 只留最近 N 条（如 800–1000） |",
        "",
        "push 把「写」摊到了粉丝侧，一致性就只能 **读侧兜底 + 最终一致**。追求「删帖后一亿 inbox 强一致」是 over-engineering。",
        "",
        "**面试怎么说：**",
        "",
        "> 「分页用 `(时间, post_id)` cursor，不用 offset。timeline 只存 id，读时 MGET hydrate，删帖靠 tombstone 过滤。不会为了删一条去反向 fan-out。」",
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
        "笔记把推荐漏斗写进来了；本站不做推荐系统，面试默认答关注流。",
        "",
        "| 原书或笔记 | 现在怎么答 |",
        "|---|---|",
        "| 只讲关注流的 push/pull（骨架仍对） | **hybrid fan-out 当默认**，不要等面试官问大 V 再改 |",
        "| 排序提到互动分 / 往 ML 滑 | 关注流：**时间线 vs 简单权重**。模型是另一道题 |",
        "| 分页讲得浅、offset 容易混进 SQL 直觉 | **必须 cursor**；讲插入漂移 |",
        "| 明星问题一句话 | 开口就算 **帖 × 粉丝**；outbox + 读时 merge；活跃粉丝分批 push 是优化 |",
        "| 部分产品把关注 tab 也掺了排序模型 | 承认「产品上可能混」；本场仍答关注流 + hybrid，不展开漏斗 |",
        "",
        "原书作为入门骨架仍然能用：写路径落库 → fan-out，读路径 inbox + 补全。过时的是把推荐漏斗当这题第一答案、以及不估写放大的纯 push。",
        "",
        "</details>",
      ].join("\n"),
    },
    {
      id: "sec-traps",
      heading: "追问陷阱",
      secNum: null,
      related: ["ch38", "ch41", "ch42"],
      body: [
        "1. **「push 还是 pull？」** → hybrid：普通人 push，大 V pull，读时 merge。先说阈值，再画。",
        "2. **「百万粉发帖怎么办？」** → 不要纯 push。写 outbox（写放大 = 1）；粉丝读时拉。活跃粉丝可限速分批 push。",
        "3. **「写放大怎么估？」** → 帖子数 × 粉丝数。发帖 QPS 不是写路径的全部。",
        "4. **「为什么 timeline 只存 post_id？」** → 内存；改帖只打一份权威。读时 MGET hydrate。",
        "5. **「feed 能用 offset 翻页吗？」** → 不能。深翻慢 + 新帖插入导致重复/漏。cursor 锚在 `(ts, post_id)`。",
        "6. **「删帖后粉丝还能看到吗？」** → 不应看到。tombstone + hydrate 过滤。不遍历粉丝 inbox。",
        "7. **「关注流还是推荐流？」** → 先问。默认关注流。推荐说「另一道题，不展开模型」。",
        "8. **「排序用什么模型？」** → 时间线默认；简单权重可解释。不讲召回 / 精排。",
        "9. **「媒体怎么存？」** → 对象存储，URL 进 post；浏览走 CDN（Ch38）。不在这题设计 CDN。",
        "10. **终图已经很大了还往上堆？** → 这题 over-engineering 的典型。漏斗、双塔、图库、多 Region 都不是本章。讲透三条 hard part 比画 20 个框得分高。",
      ].join("\n"),
    },
    {
      id: "sec-next",
      heading: "wrap-up 与下一步",
      secNum: null,
      related: ["ch12"],
      body: [
        "收尾不要说完美。三个 bottleneck 口播：",
        "",
        "| bottleneck | 你怎么接 |",
        "|---|---|",
        "| 大 V 写尖峰 | hybrid：outbox + 读时 merge；别对全体粉丝 ZADD |",
        "| timeline 内存 / 冷用户 | 只存 id、只缓存活跃、滑动窗口 N 条；冷用户回来再 pull 一页 |",
        "| 删帖 / 缓存不一致 | tombstone + hydrate 过滤；最终一致，不反向 fan-out |",
        "",
        "自测：合上这一页，用 30 秒开场 + 白板高层，把 hybrid、写放大公式、cursor + hydrate 讲给空气听。哪句卡，回哪一节。",
        "",
        "下一道题是 **Ch12 · 设计聊天系统**。Feed 是一对多的异步时间线；聊天是低延迟双向——WebSocket、消息状态、多端同步。",
      ].join("\n"),
    },
  ],
  reviewMd: `# Ch11 · 记忆闪卡

| # | 正面 | 背面 |
|---|---|---|
| 1 | Feed 三个 hard part？ | push vs pull vs hybrid；大 V 写放大；cursor 分页 + hydration。 |
| 2 | 2026 默认 fan-out？ | **hybrid**：普通人写时 push，大 V pull（outbox），读时 merge。 |
| 3 | 写放大怎么估？ | 帖子数 × 粉丝数。发帖 QPS 不是写路径的全部。 |
| 4 | 为什么大 V 不能纯 push？ | 一次发帖 = 瞬时 N 次 timeline 写（hot key）。改写 outbox，读分散在时间上。 |
| 5 | 高层链路怎么画？ | App → feed svc → post 库 + MQ → timeline 缓存。先落库再 fan-out。 |
| 6 | timeline 存什么？ | 只存 \`post_id\`（ZSET）。全文走 post 缓存 hydrate。 |
| 7 | 读路径怎么走？ | ZREVRANGE 取 id → MGET hydrate → 过滤 tombstone → 返回一页 + cursor。 |
| 8 | 为什么不用 offset？ | 深翻慢；翻页间插入导致重复或漏。cursor 锚在 (ts, post_id)。 |
| 9 | 删帖怎么处理？ | post tombstone；hydrate 时丢掉。不要反向 fan-out 全粉丝 inbox。 |
| 10 | 排序讲到哪？ | 时间线默认；简单权重（互动 × 衰减）可提。不讲推荐漏斗。 |
| 11 | 问到推荐流怎么办？ | 承认是另一道题，不展开模型。本场按关注流 + hybrid 讲。 |
| 12 | 媒体放哪？ | 对象存储 + CDN URL。不在这题设计 CDN（Ch38）。 |`,
});
