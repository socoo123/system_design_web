import { writeChapter } from "./write-chapter.mjs";

const d2 = (src) => {
  const body = src.trim();
  const sized = /style\.font-size/.test(body) ? body : `style.font-size: 12\n${body}`;
  return "```d2\n" + sized + "\n```";
};

writeChapter({
  id: "ch16",
  num: "16",
  title: "设计评论系统",
  kind: "case",
  relatedChapters: ["ch38", "ch41", "ch42"],
  sections: [
    {
      id: "intro",
      heading: "",
      secNum: null,
      related: [],
      body: [
        "> **预计**：50–60 分钟 ｜ **前置**：缓存 Ch38；消息 Ch42",
        "> **目标**：楼中楼、计数、审核队列、热点帖、cursor 分页。反垃圾只点到。",
        "",
        "评论是第八道完整 case。网盘把「文件怎么一致」讲完；这题换成 **讨论怎么挂在一条帖子上**。默认是微博 / B 站 / 新闻站那种 **帖下嵌套评论**，不是整张社交图、不是私信。面试官要看的不是你能不能画出反垃圾模型课 + 无限缩进树 + 某厂评论 QPS，而是：**楼中楼怎么存和怎么读、点赞别锁行、热点帖别整树回源、一级列表用 cursor、写出审核队列。**",
        "",
        "系统看起来就是发一句、盖一楼。难点在 schema 和读 fan-out、计数与热 key、分页和可见性。",
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
        "> 「评论三个 hard part：楼中楼 schema 和读 fan-out、计数加热点帖、cursor 分页加审核队列。我先确认是帖下嵌套，不是社交图。规模按千万 DAU 教学假设估：发评 QPS 不大，读和点赞才是 hotspot。架构：client → comment API → DB（`parent_id`）+ 缓存。一级列表 **cursor 不是 offset**。点赞 Redis `INCR`，定时 flush，不锁行。热点帖缓存前 N 棵 + 子评懒加载。写出进审核队列（先审或先发都要有状态机）。反垃圾就是限流 + 进队，不展开模型。」",
        "",
        "然后按 4 步走，别一上来画终图。",
        "",
        d2(`
direction: right
s1: "1 澄清估算"
s2: "2 高层落库"
s3: "3 楼中楼计数"
s4: "4 cursor审核"
s1 -> s2 -> s3 -> s4
`),
        "",
        "| 时间盒 | 你在做什么 |",
        "|---|---|",
        "| 3–10 min | 澄清：帖下嵌套 vs 社交图、两级楼中楼、审核、点赞、分页 |",
        "| 接着 2 min | back-of-envelope：发评小 QPS；读和点赞；单帖 Zipf |",
        "| 10–15 min | 高层：client → comment API → DB + cache；审核走 MQ |",
        "| 10–25 min | deep dive：`parent_id` + 懒加载、Redis 计数 / 热点、cursor + 审核队列 |",
        "| 3–5 min | wrap-up：3 个 bottleneck（热点帖读、点赞锁行、offset 深翻） |",
        "",
        "**red flag：** 还没问范围就画关注关系 / 私信；nested set 当评论默认；一级列表 `LIMIT/OFFSET`；每次点赞 `SELECT FOR UPDATE`；整棵树一次拉回；把反垃圾做成 ML 专章。那是 over-engineering，或把 Feed / 推荐 / 风控整章搬进来。",
      ].join("\n"),
    },
    {
      id: "sec-clarify",
      heading: "澄清问题清单",
      secNum: "16.1",
      related: [],
      body: [
        "没问清楚就画图 = Jimmy。评论这题 5–7 个问题就停，其余自己假设写白板。**第一问必须是范围。**",
        "",
        "| 你问 | 典型回答 / 你自己的假设 | 它改什么 |",
        "|---|---|---|",
        "| 帖下嵌套还是社交图？ | **帖下嵌套**（微博 / B 站 / 新闻） | 按 `post_id` 存和分片；不是 follower fan-out |",
        "| 无限缩进还是两级楼中楼？ | **存 `parent_id`，展示两级摊平** | 子评挂在一级下，「A 回复 @B」 |",
        "| 先审后发还是先发后审？ | 两种都成立；白板先定一种 | 状态机 + 审核队列（Ch42） |",
        "| 要不要点赞 / 回复数？ | **要**；近实时即可 | Redis 计数，不锁行 |",
        "| 分页怎么翻？ | **cursor** | 禁止 offset |",
        "| DAU 大概多少？ | 教学：**约 1000 万** | 用来估读写和热点，不是某厂内部数 |",
        "",
        "面试官说「你定」时，把假设写上去：",
        "",
        "> 「我假设：默认帖下楼中楼，不是社交网络。存储 `parent_id` + 可选 `root_id`，UI 两级摊平。一级列表 cursor。点赞走 Redis，定时刷库。写出进审核队列。反垃圾只做限流 + 入队。先按这个画，不对你打断我。」",
        "",
        "问到无限层级或社交图：**承认差别，立刻收口。** 「无限缩进读 fan-out 会炸；产品上 B 站 / 微博也是两级。社交图是 Feed 题，本场按一条帖子的评论树讲。」问太多超过 10 分钟也是 red flag。黄金线还是那条：**问关键问题 → 自己给假设 → 写白板 → 继续。**",
      ].join("\n"),
    },
    {
      id: "sec-estimate",
      heading: "粗估",
      secNum: "16.2",
      related: ["ch03"],
      body: [
        "公式细节在 Ch03。这里只要数量级，证明你知道 **这题 bottleneck 是热点帖的读和点赞写，不是「全国发评 QPS」。** 下面用白板做**教学假设**，不是某厂内部数字，也不是某条热搜的真实峰值。",
        "",
        "假设：约 **1000 万 DAU**；每人每天发约 **2 条评论**、点赞约 **10 次**、打开评论区约 **15 次**。读远多于写；少数帖吃掉大部分流量（Zipf）。",
        "",
        "| 项 | 怎么估 | 量级（教学假设） |",
        "|---|---|---|",
        "| 发评 QPS | 1e7 × 2 / 86400 | **约 2e2**；峰值 ×5 仍是千级 |",
        "| 点赞 QPS | 1e7 × 10 / 86400 | **约 1e3**；峰值约 **5e3** |",
        "| 读列表 QPS | 1e7 × 15 / 86400 | **约 2e3**；峰值约 **1e4** |",
        "| 单帖热点 | 读服从 Zipf | 少数 `post_id` 吃掉大量 QPS → 必须缓存，不能每次整树打 DB |",
        "| 存储 | 每条约 0.5–1 KB；日增约 2e7 条 | **约 10–20 GB/天**；年 TB 级；按 `post_id` 分片（Ch41） |",
        "",
        "发评看起来不贵。贵的是：**同一条爆款帖被反复打开**（读 fan-out），以及 **同一条热评被反复点赞**（若每次锁 DB 行，计数本身变成 bottleneck）。点赞次数通常高于发评；计数路径必须和正文写入拆开。",
        "",
        "**面试怎么说：**",
        "",
        "> 「千万 DAU 白板：发评日均几百 QPS，读和点赞是千到万。真正怕的是单帖 Zipf——缓存前 N 条 + 子评懒加载。点赞不锁行，Redis INCR 再 flush。不会拿某条热搜的峰值当内部数。」",
        "",
        "常见算错：把某平台公开的「高峰评论」当成自己的事实 QPS；或只报发评、假装读路径免费。教学用数量级，并标**假设**。",
      ].join("\n"),
    },
    {
      id: "sec-arch",
      heading: "高层架构",
      secNum: "16.3",
      related: ["ch38", "ch41", "ch42"],
      body: [
        "从左到右只画 **一条写/读共用的控制面**：Client → Comment API → DB + Cache。不要在这张图上扇出社交图、反垃圾模型、多 Region。正文进关系库（按 `post_id` 分片，Ch41）；热列表和计数进缓存（Ch38）；审核走 MQ（Ch42）。面试官 buy-in 之后再拆楼中楼和计数。",
        "",
        d2(`
direction: right
app.class: go
app: "Client"
api.class: step
api: "Comment API"
db.class: store
db: "DB"
cache.class: store
cache: "Cache"
app -> api
api -> db
api -> cache
`),
        "",
        "**本图引用**：Ch38 缓存与 CDN · Ch41 复制、分片、事务 · Ch42 消息、弹性",
        "",
        "**schema（够用就停）：** `comment`（id、post_id、parent_id、root_id、author_id、body、status、created_at）；计数不作为每次点赞的权威行锁字段——`like_count` / `reply_count` 是 Redis 的定期投影。`status`：`pending` / `visible` / `rejected`。索引：一级列表 `(post_id, created_at, id)` 且 `parent_id IS NULL`；子评 `(root_id, created_at, id)` 或 `(parent_id, created_at, id)`。不要在白板上画五张宽表。",
        "",
        "**写路径：** API 鉴权 + 限流（反垃圾点到：按 user / IP 限速，超了直接拒绝，可疑进队）→ INSERT（`pending` 或 `visible`，看审核策略）→ 入审核队列 → 回 200。**不要**在请求线程里跑模型。点赞：`SET NX` 做「是否已赞」幂等，再 `INCR`，API 立刻返回；flush 异步。",
        "",
        "**读路径：** 热点帖先看缓存（前 N 条一级 + 每条前 K 条子评）；miss 才按 cursor 打 DB。子评默认不一次拉完。删评 / 审核拒绝：改 status，缓存删 key 或短 TTL；不要遍历整棵树改副本。",
        "",
        "高层图到这里就该停，问一句：「方向 OK 吗？接下来挖楼中楼怎么读，然后是计数和热点帖，最后 cursor 和审核队列。」",
        "",
        "**面试怎么说：**",
        "",
        "> 「评论按帖子落库，`parent_id` 表父子。API 后面是 DB + 缓存，审核走队列。热点读缓存，冷数据 cursor 回源。点赞不进这张图的行锁。」",
      ].join("\n"),
    },
    {
      id: "sec-nested",
      heading: "深入 · 楼中楼 schema 与读 fan-out",
      secNum: "16.4",
      related: ["ch41"],
      body: [
        "第一个 hard part。**评论是一棵写频繁、读要截断的树**，不是类目那种几乎不改的静态树。2026 默认：**邻接表 `parent_id`**；产品展示做成 **两级楼中楼**（一级 + 摊平的回复，文案「A 回复 @B」）。无限缩进能存，但读会把 fan-out 打爆——B 站 / 微博也不在移动端无限缩进。",
        "",
        d2(`
direction: right
post.class: go
post: "帖子"
roots.class: step
roots: "一级 cursor"
kids.class: step
kids: "按 parent 拉"
lazy.class: ok
lazy: "展开更多"
post -> roots -> kids -> lazy
`),
        "",
        "**本图引用**：Ch41 复制、分片、事务",
        "",
        "读 fan-out 必须开口算：一页 20 条一级，若每条下面递归拉全部子孙，热评一条就能拖出成千上万行，首屏超时。所以 **一级一页、子评先返回前 K 条 + `reply_count`，展开再按 parent / root cursor 拉。** 树在服务端拼一层即可，不要让客户端对每个 parent 打一轮 N+1。",
        "",
        "| | 邻接表 `parent_id`（**默认**） | 物化路径 path | Nested set（lft/rgt） |",
        "|---|---|---|---|",
        "| 插入 | **O(1)** 一行 | O(1) 写 path；子树移动才改子孙 | 插入要改一段区间，评论树不适合 |",
        "| 拉直接子节点 | `WHERE parent_id=?` 走索引 | 也能；优势在子树 | 子树一条 range，但写太贵 |",
        "| 拉整棵子树 | 递归 CTE 或多次查；**首屏不要这么干** | `path LIKE 'root/%'` | range 快，仍不该首屏整树 |",
        "| 面试 | **评论第一答案** | 真要频繁「整棵子树」再升级 | **静态类目**才考虑；评论上是 red flag |",
        "",
        "`root_id` 是两级 UI 的加速列：所有回复指向同一条一级，展开「这楼全部回复」不必递归 `parent_id`。深度仍可用 `parent_id` 还原 @ 关系。Closure table（祖先闭包）能加速任意子孙，但对评论是 over-engineering——你并不需要「任意节点的整棵子树」当默认读。",
        "",
        "分片键用 **`post_id`**（Ch41）：同一帖的评论在一起，一级 cursor 和子评查询都是单分片。按 comment_id 哈希会把一页一级打成 scatter-gather，那是错误的分片。热点帖仍会打热分片——所以下一节用缓存挡读，而不是换分片键。",
        "",
        "**面试怎么说：**",
        "",
        "> 「存 `parent_id`，展示两级。一级 cursor；子评按父或 root 懒加载，先给 K 条。不用 nested set。分片按 post_id。」",
        "",
        "trade-off：两级摊平牺牲「看见真正的缩进深度」，换来读路径有上界。无限层级看起来更「树」，首屏 fan-out 没有上界。为了一次 `LIKE path` 上 nested set / 闭包表，评论这种高插入树会把写放大变成新的 bottleneck。",
      ].join("\n"),
    },
    {
      id: "sec-counter",
      heading: "深入 · 计数与热点帖",
      secNum: "16.5",
      related: ["ch38"],
      body: [
        "第二个 hard part。点赞 / 回复数是 **高 QPS、可短暂不准** 的计数，不是库存。**不要**每次点赞 `SELECT … FOR UPDATE` 再 `like_count + 1`——热评会把那一行锁成串行 bottleneck。2026 默认：**Redis `INCR` 当 live 计数，定期 flush 到 DB**（write-behind）。用户「是否已赞」用 `SET NX`（或 Redis SET + 异步落明细），保证幂等，避免重复计数。",
        "",
        d2(`
direction: right
like.class: go
like: "点赞"
incr.class: step
incr: "Redis INCR"
flush.class: step
flush: "定时 flush"
db.class: store
db: "DB 计数"
like -> incr -> flush -> db
`),
        "",
        "**本图引用**：Ch38 缓存与 CDN",
        "",
        "flush 用脏 key / Stream 批量 `UPDATE … SET like_count = like_count + delta`，DB 看到的是「每条热评每隔几十秒一次」而不是每秒几千次行锁。crash 窗口里可能丢一段增量——点赞允许，库存不允许。AOF / 短间隔只能缩小窗口，不能假装和同步写库一样耐久。读展示以 Redis 为准；DB 是恢复和冷读的底稿。",
        "",
        "热点帖是读路径的 Zipf：同一 `post_id` 被反复打开。**不要每次回源拼整棵树。** 缓存「前 N 条一级 + 每条前 K 条子评」的 JSON（或 id 列表再 hydrate，和 Feed 同一套路）。子评展开、深翻页打 DB + 更小粒度的缓存。写成功（可见）后删 key 或短 TTL；不要维护一棵和 DB 同步的完整内存树。",
        "",
        d2(`
grid-columns: 2
hot: {
  label: "热点缓存 · 默认"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "前 N 一级"
  b.class: ok
  b: "子评懒加载"
}
orig: {
  label: "每次回源 · 不要"
  class: groupBad
  grid-columns: 2
  c.class: bad
  c: "单帖打穿"
  d.class: bad
  d: "整树查询"
}
`),
        "",
        "| | 行锁 UPDATE 计数 | Redis INCR + flush（**默认**） |",
        "|---|---|---|",
        "| 热评点赞 | 行锁串行，DB CPU 打满 | `INCR` 内存；DB 批量 |",
        "| 一致性 | 强，但点赞不需要 | 秒级最终一致；丢一小段可接受 |",
        "| 读 | 打主库 | GET 计数；列表走热缓存 |",
        "| 面试 | red flag | **2026 第一答案** |",
        "",
        "热 key 再往下点到即可：单条评论的 `INCR` 通常 Redis 吃得住；真把单 key CPU 打满再分 shard 求和（Ch38）。本地 LRU 挡同一实例的爆款读。空值 / 单飞合并回源，防 stampede。**不要**为计数去上「全球多 Region 计数课」。",
        "",
        "**面试怎么说：**",
        "",
        "> 「点赞 INCR，不锁行，定时刷库。热点帖缓存前 N 棵，子评懒加载。完整树不进 Redis。允许计数短暂不准。」",
        "",
        "trade-off：write-behind 换吞吐，接受丢失窗口和「刷新后数字跳一下」。把每条点赞做成带行锁的事务是 over-engineering。把整帖百万评论缓存成一棵大 JSON 会把内存和失效一起炸——只缓存首屏切片。",
      ].join("\n"),
    },
    {
      id: "sec-cursor",
      heading: "深入 · cursor 分页与审核队列",
      secNum: "16.6",
      related: ["ch38", "ch42"],
      body: [
        "第三个 hard part。一级评论是无限下翻、同时有人在盖楼。**分页必须 cursor（keyset），不要 offset。** 审核是写出后的可见性，不是事后补一张「安全」框。",
        "",
        d2(`
grid-columns: 2
offset: {
  label: "offset · 不要"
  class: groupBad
  grid-columns: 2
  a.class: bad
  a: "深翻扫行"
  b.class: bad
  b: "插入漂移"
}
cursor: {
  label: "cursor · 默认"
  class: groupOk
  grid-columns: 2
  c.class: ok
  c: "锚在 last_id"
  d.class: ok
  d: "走索引"
}
`),
        "",
        "| | offset（`LIMIT 20 OFFSET n`） | cursor / keyset（**默认**） |",
        "|---|---|---|",
        "| 深翻 | OFFSET 越大越慢，仍要跳过前面的行 | 从 `(created_at, id)` 接着 seek |",
        "| 盖楼插入 | 下一页重复或漏 | 锚住上一页最后一条，新楼只出现在「最新」 |",
        "| 总页码 | 能跳第 N 页 | **评论区不需要跳页码** |",
        "| 面试 | **red flag** | **一级列表标配** |",
        "",
        "白板写法：返回不透明 cursor，服务端解码成 `(created_at, id)`。下一页：`post_id=? AND parent_id IS NULL AND (created_at, id) < (?, ?) AND status='visible' ORDER BY created_at DESC, id DESC LIMIT 20`。时间戳会并列，**必须带 id 做 tiebreaker**，否则边界行会跳或重。复合索引对齐 `ORDER BY`。子评展开同一套路，锚在 `root_id` 或 `parent_id`。首页无 cursor。不要让客户端传 `page=3`。",
        "",
        "写出必须进 **审核队列**（Ch42），不要在 API 里同步调一套模型。两条策略都要能讲 trade-off，白板选定一种往下画：",
        "",
        "| | 先审后发（pre-publish） | 先发后审（post-publish） |",
        "|---|---|---|",
        "| 用户 | 自己可见「审核中」；公众暂无 | 立刻上墙 |",
        "| 风险 | 延迟，讨论冷 | 违规会短暂曝光，靠撤回 |",
        "| 队列 | worker 通过才改 `visible` | worker 拒绝再改 `rejected` + 删缓存 |",
        "| 适用 | 高风险话题、新账号 | 已建立信任的作者、要活跃的评论区 |",
        "",
        "2026 常见落地是 **混合**：关键词 / 新用户走先审；其余先发、异步机审，可疑再人工。白板不必画风控平台，但状态机要有：`pending → visible | rejected`。列表和缓存 **只读 visible**。",
        "",
        d2(`
shape: sequence_diagram
cli: "Client"
api: "Comment API"
mq: "Audit queue"
db: "DB"
cli -> api: "POST 评论"
api -> db: "写入 pending"
api -> mq: "入队审核"
mq -> db: "改可见"
`),
        "",
        "**本图引用**：Ch42 消息、弹性 · Ch38 缓存与 CDN",
        "",
        "队列 at-least-once：审核结果要幂等（同一 comment_id 重复通过仍是 visible）。积压时先保证写成功、审变慢，不要把 API 拖死。人工队列只收机审不确定的，不要声称「每条都人审」还画万级 QPS。",
        "",
        "**反垃圾只点到：** 写路径限流（user / IP / 帖）+ 进审核队列；重复内容 / 链接可以当入队特征。**不要**在这题上展开分类模型、图特征、验证码工厂——那是另一道题，也是本场 over-engineering。",
        "",
        "**面试怎么说：**",
        "",
        "> 「一级列表 `(时间, id)` cursor，不用 offset。写出 pending 入队，通过再可见；也可以先可见再异步撤。反垃圾就是限流加队列。」",
        "",
        "trade-off：cursor 不能跳到「第 50 页」，评论区本来就是滚。先审更安全、讨论更冷；先发更热闹、要能快速撤回和删缓存。把审核画成同步 RPC，p99 会被下游拖垮。",
      ].join("\n"),
    },
    {
      id: "sec-2026",
      heading: "2026 vs 没专书",
      secNum: null,
      related: [],
      body: [
        "<details>",
        "<summary>没有 Xu 专章；网上旧答不要当第一答案</summary>",
        "",
        "Alex Xu 两卷没有「设计评论系统」。本章按 2026 国内/通用公开面试题和工程实践重建，不是某本笔记的润色。网上仍常见 nested set、offset、行锁点赞、一次拉整树——那是教程惯性，不是现在的白板默认。",
        "",
        "| 网上旧答 / 教程惯性 | 现在怎么答 |",
        "|---|---|---|",
        "| nested set / 闭包表当评论默认 | **`parent_id` 邻接表**；两级 UI + 懒加载。nested set 留给静态树 |",
        "| 无限缩进递归 CTE 首屏 | **一级 cursor + 子评前 K 条**；展开再拉 |",
        "| `LIMIT/OFFSET` 翻评论 | **keyset cursor**；插入会漂移 |",
        "| `UPDATE like_count` 行锁 | **Redis INCR + 定时 flush**；点赞不是库存 |",
        "| 热点帖每次 JOIN 整棵树 | **缓存前 N 切片**；完整树不进内存 |",
        "| 同步调审核模型 | **审核队列**；先审或先发都要有 status |",
        "| 反垃圾 = 上深度学习 | **限流 + 入队** 点到即停 |",
        "| 按 comment_id 分片 | **按 post_id**，一帖在一片 |",
        "| 某站热搜 QPS 当事实 | **教学假设**；只报数量级 |",
        "",
        "仍成立的骨架：评论是帖子上的树、读多写少、热点 Zipf、审核异步。过时的是把类目树算法、offset 习惯和行锁计数搬进评论当第一答案。",
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
        "1. **「帖下评论还是社交网络？」** → 默认帖下嵌套。社交图是 Feed 题，本场不画 follower fan-out。",
        "2. **「为什么不用 nested set？」** → 评论插入频繁，lft/rgt 要改一片。邻接表 O(1) 写；子树用 root_id / 懒加载。",
        "3. **「无限层级怎么存？」** → `parent_id` 能存。展示默认两级摊平，否则读 fan-out 无上界。",
        "4. **「首屏怎么避免 N+1？」** → 一级一页批量取；子评按 root_id IN (…) 一次拉前 K 条，或缓存切片。",
        "5. **「点赞为什么不锁行？」** → 热评会串行。计数可短暂不准；`INCR` + flush。库存题才锁。",
        "6. **「Redis 挂了计数怎么办？」** → 丢一小段增量可接受；DB 是底稿，重建缓存。不要假装强一致。",
        "7. **「热点帖把 DB 打穿？」** → 缓存前 N 一级 + 前 K 子评；stampede 合并回源。不要缓存整棵百万树。",
        "8. **「评论能用 offset 吗？」** → 不能。深翻慢，盖楼导致重复/漏。cursor 锚 `(created_at, id)`。",
        "9. **「先审还是先发？」** → 讲 trade-off 再选。都要队列和 status；列表只读 visible。",
        "10. **「反垃圾模型怎么做？」** → 限流 + 入队。不在这题上 ML。",
        "11. **「怎么分片？」** → `post_id`。按评论 id 会把一页打散。",
        "12. **终图已经很大了还往上堆？** → 社交图、推荐、人审平台、全球多 Region 都不是本章。讲透三条 hard part 比画 20 个框得分高。",
      ].join("\n"),
    },
    {
      id: "sec-next",
      heading: "wrap-up 与下一步",
      secNum: null,
      related: ["ch17"],
      body: [
        "收尾不要说完美。三个 bottleneck 口播：",
        "",
        "| bottleneck | 你怎么接 |",
        "|---|---|",
        "| 热点帖读 / 整树 fan-out | 缓存前 N；子评懒加载；按 post_id 分片 |",
        "| 点赞锁行 | Redis INCR + 定时 flush；SET NX 幂等 |",
        "| offset 深翻 + 同步审核 | cursor；写出进审核队列，status 控制可见 |",
        "",
        "自测：合上这一页，用 30 秒开场 + 白板高层，把 `parent_id` 懒加载、INCR 不锁行、cursor + 审核队列讲给空气听。哪句卡，回哪一节。反垃圾只点到限流和入队。",
        "",
        "下一道题是 **Ch17 · 设计 API 网关**。评论是一条业务 API 后面的树和计数；网关换成鉴权、限流、路由和熔断——从「一个资源怎么存」变成「所有 API 怎么挡在门口」。",
      ].join("\n"),
    },
  ],
  reviewMd: `# Ch16 · 记忆闪卡

| # | 正面 | 背面 |
|---|---|---|
| 1 | 评论三个 hard part？ | 楼中楼 schema + 读 fan-out；计数 + 热点帖；cursor 分页 + 审核队列。反垃圾只点到。 |
| 2 | 默认范围？ | **帖下嵌套**（微博/B站/新闻）。不是社交图，不是私信。 |
| 3 | 楼中楼怎么存？ | **\`parent_id\` 邻接表** + 可选 \`root_id\`。展示两级摊平。「A 回复 @B」。 |
| 4 | 为什么不用 nested set？ | 评论高插入；改 lft/rgt 一片。nested set 留给静态树。 |
| 5 | 读 fan-out 怎么截断？ | 一级 cursor；子评先 K 条 + reply_count；展开再拉。首屏不要整树。 |
| 6 | 分片键？ | **post_id**。同一帖在一片。不要按 comment_id 把一页打散。 |
| 7 | 点赞怎么计？ | Redis \`INCR\` + 定时 flush。\`SET NX\` 幂等。**不锁 DB 行**。 |
| 8 | 热点帖怎么挡？ | 缓存前 N 一级 + 前 K 子评。完整树不进 Redis。miss 合并回源。 |
| 9 | 为什么不用 offset？ | 深翻扫行；盖楼插入导致重复或漏。cursor 锚 \`(created_at, id)\`。 |
| 10 | 审核怎么接？ | **队列 + status**。先审后发或先发后审，列表只读 visible。不要同步 RPC 模型。 |
| 11 | 反垃圾讲到哪？ | 写路径限流 + 进审核队列。不展开 ML。 |
| 12 | 这题最大的 over-engineering？ | 社交图、无限缩进整树、nested set、行锁点赞、反垃圾专章。讲透三条 hard part。 |`,
});
