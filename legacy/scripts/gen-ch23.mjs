import { writeChapter } from "./write-chapter.mjs";

const d2 = (src) => {
  const body = src.trim();
  const sized = /style\.font-size/.test(body) ? body : `style.font-size: 12\n${body}`;
  return "```d2\n" + sized + "\n```";
};

writeChapter({
  id: "ch23",
  num: "23",
  title: "游戏排行榜",
  kind: "case",
  relatedChapters: ["ch37", "ch38"],
  sections: [
    {
      id: "intro",
      heading: "",
      secNum: null,
      related: [],
      body: [
        "> **预计**：50–60 分钟 ｜ **前置**：存储 Ch37；缓存 Ch38",
        "> **目标**：ZSET 排行榜、分片、写热点和自己的名次。不是数仓，不是推荐。",
        "",
        "对象存储把「海量不可变字节」讲完；这题换成 **海量分数怎么实时有序**。默认是手游 / 电竞那种 **全球或赛季 top N + 自己附近名次**，不是推荐、不是社交 Feed、不是通用分析数仓。面试官要看的不是你能不能画出 Flink 实时数仓 + 好友推荐 + 某款游戏的公开 DAU，而是：**一张 Redis Sorted Set 怎么当白板默认、并列怎么打破、多榜怎么拆 key、写热点别 SCAN、自己的名次用 ZRANK。**",
        "",
        "系统看起来就是打完一局、分数上榜。难点在有序结构、多榜分片、以及「热 key 上还要读我排第几」。",
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
        "> 「排行榜三个 hard part：ZSET 模型（分数、并列、top-K）、按榜分片、写热点加自己的名次。我先确认是游戏分数榜，不是推荐也不是数仓。规模按千万 DAU 教学假设估：写分是 hotspot，top-N 可读缓存。架构：client → board API → Redis ZSET（热）+ DB write-behind（底稿）。更新用 **ZADD**；同分用复合 score 或 member 后缀，不要靠 player id 字母序。多榜按 **leaderboard id / 赛季 / 区服** 拆 key，不要全游戏一张 ZSET 用到天荒地老。around-me 是 **ZRANK + ZRANGE**，禁止 SCAN。」",
        "",
        "然后按 4 步走，别一上来画终图或背云 SKU。",
        "",
        d2(`
direction: right
s1: "1 澄清估算"
s2: "2 高层 ZSET"
s3: "3 分片多榜"
s4: "4 写热名次"
s1 -> s2 -> s3 -> s4
`),
        "",
        "| 时间盒 | 你在做什么 |",
        "|---|---|",
        "| 3–10 min | 澄清：分数榜 vs 推荐、服务端设分、赛季/区服、top-N + around-me、同分 |",
        "| 接着 2 min | back-of-envelope：写分 QPS；top-N 可读缓存；单榜内存 GB 级 |",
        "| 10–15 min | 高层：client → API → Redis ZSET + DB persist |",
        "| 10–25 min | deep dive：ZADD/并列/top-K、按榜分片、热 key + ZRANK |",
        "| 3–5 min | wrap-up：3 个 bottleneck（单 key 写热、SQL 求名次、SCAN 找自己） |",
        "",
        "**red flag：** 还没问范围就画推荐漏斗 / Flink 数仓；一张 ZSET 装所有游戏所有赛季；`ORDER BY score` 当实时名次；around-me 用 SCAN；还没讲并列就假装 Redis 会按「先达成」排。那是 over-engineering，或把存储课 / 分析课整章搬进来。",
      ].join("\n"),
    },
    {
      id: "sec-clarify",
      heading: "澄清问题清单",
      secNum: "23.1",
      related: [],
      body: [
        "没问清楚就画图 = Jimmy。排行榜这题 5–7 个问题就停，其余自己假设写白板。**第一问必须是范围。**",
        "",
        "| 你问 | 典型回答 / 你自己的假设 | 它改什么 |",
        "|---|---|---|",
        "| 分数榜还是推荐 / Feed？ | **游戏分数排行榜**（全球或赛季 top N + 附近名次） | 不是双塔、不是关注流、不是数仓 |",
        "| 分数谁算？ | **服务端设分**（游戏服校验再写榜） | 客户端报分是作弊面 |",
        "| 绝对分还是累加？ | 白板定一种 | 覆盖用 **ZADD**；累加用 `ZINCRBY` |",
        "| 几张榜？ | **全球 + 赛季**；区服可选 | key 按榜拆，不是一张永生 ZSET |",
        "| 要哪些读？ | **top-N + 自己的名次 + around-me** | ZRANGE / ZRANK，禁止 SCAN |",
        "| 同分怎么排？ | **先达成靠前**（复合 score） | 不要默认 player id 字典序 |",
        "| DAU 大概多少？ | 教学：**约 1000 万** | 用来估写分和内存，不是某款游戏的内部数 |",
        "",
        "面试官说「你定」时，把假设写上去：",
        "",
        "> 「我假设：默认游戏分数榜，不是推荐。服务端校验后 ZADD。全球榜 + 赛季榜，按 `game/season/region` 拆 Redis key。读 top-N 和自己附近名次。同分用分数加反向时间戳。先按这个画，不对你打断我。」",
        "",
        "问到好友榜或公会榜：**承认差别，立刻收口。** 「好友榜是小集合，可以另开一张 ZSET 或读时过滤；本场主线是大众赛季榜。」问到实时推送 / WebSocket：top-N 短 TTL 缓存即可，推送不是 hard part。问太多超过 10 分钟也是 red flag。黄金线还是那条：**问关键问题 → 自己给假设 → 写白板 → 继续。**",
      ].join("\n"),
    },
    {
      id: "sec-estimate",
      heading: "粗估",
      secNum: "23.2",
      related: ["ch03"],
      body: [
        "公式细节在 Ch03。这里只要数量级，证明你知道 **这题 bottleneck 是写分打在同一张榜的热 key，以及「我排第几」不能全表扫。** 下面用白板做**教学假设**，不是某厂内部数字，也不是某款游戏公开的 DAU。",
        "",
        "假设：约 **1000 万 DAU**；每人每天约 **5 次**分数更新、约 **3 次**打开排行榜（一次 top-N，可能再看自己附近）。",
        "",
        "| 项 | 怎么估 | 量级（教学假设） |",
        "|---|---|---|",
        "| 写分 QPS | 1e7 × 5 / 86400 | **约 6e2**；峰值 ×5 仍是 **千级** |",
        "| 读榜 QPS | 1e7 × 3 / 86400 | **约 3e2**；峰值约 **2e3**；其中 top-N 高度重复 |",
        "| 单榜成员 | 一个赛季活跃进榜 | **千万级** 量级；按榜拆开，不要全历史堆一张 |",
        "| 内存 | 每成员约 100–150 B（skip list + hash 开销） | 两千万成员一张榜 **约 2–3 GB**；单机往往够，先裂的是热 key |",
        "| SQL 求名次 | `COUNT(*) WHERE score > ?` | 写频繁时是 **O(N) 扫**，不是实时答案 |",
        "",
        "写看起来「才千 QPS」。贵的是：**千 QPS 打在同一个 Redis key**（一个热赛季），以及 **每个人都要自己的名次**（不能靠缓存一张全球 top-100 糊弄）。top-N 读可以短 TTL；around-me 必须定位到那个人。",
        "",
        "**面试怎么说：**",
        "",
        "> 「千万 DAU 白板：写分日均几百、峰值千级；真正怕的是打在一张赛季 ZSET 上。top-N 可缓存，自己的名次走 ZRANK。内存按成员数 × 百字节估，GB 级。不会拿某款游戏的公开峰值当内部数。」",
        "",
        "常见算错：把某游戏宣传 DAU 当成自己的事实 QPS；或只报读 top-10、假装「我排第几」免费。教学用数量级，并标**假设**。",
      ].join("\n"),
    },
    {
      id: "sec-arch",
      heading: "高层架构",
      secNum: "23.3",
      related: ["ch37", "ch38"],
      body: [
        "从左到右只画 **一条写/读共用的控制面**：Client → Board API → Redis ZSET（热路径）+ DB（持久化底稿）。不要在这张图上扇出 Flink、推荐、多 Region。分数权威在游戏服校验之后的 API；ZSET 是有序热视图（Ch38）；DB 是恢复和冷读（Ch37）。面试官 buy-in 之后再拆并列和分片。",
        "",
        d2(`
direction: right
app.class: go
app: "Client"
api.class: step
api: "Board API"
zset.class: store
zset: "Redis ZSET"
db.class: store
db: "DB persist"
app -> api
api -> zset
api -> db
`),
        "",
        "**本图引用**：Ch38 缓存与 CDN · Ch37 存储选型",
        "",
        "**为什么服务端设分：** 客户端直接报分，挂代理就能改。白板默认：对局在游戏服结算 → 调 board API `ZADD`。server-authoritative 的玩法（服务端本来就知道谁赢）甚至不用客户端调「加分」。反作弊点到这一句就停，不要改成安全专章。",
        "",
        "**schema（够用就停）：** Redis key 例如 `lb:{game}:{season}:{region}`，member = `player_id`，score = 复合分。DB 存 `player_id, board_id, score, updated_at` 供重建。玩家展示名 / 头像不进 ZSET，读 top-N 后再 hydrate。不要在白板上画五张宽表。",
        "",
        "**写路径：** API 鉴权 + 校验这局合法 → `ZADD` 热 ZSET → 200；分数 **write-behind** 进 DB（或短间隔批量）。**不要**在请求线程里跑数仓作业。累加积分才用 `ZINCRBY`；「本局最高分 / 覆盖总分」用 ZADD。",
        "",
        "**读路径：** top-N：`ZRANGE 0 N-1 REV WITHSCORES`（Redis 6.2+；旧名 `ZREVRANGE` 面试也能讲）。自己的名次：`ZRANK member REV`。附近：rank ± k 再 `ZRANGE`。top-N 可加几秒缓存；个人名次默认打 Redis。",
        "",
        "要不要 MQ？分数 **只服务于这张榜** → 不用。还要推送 / 分析再进队列——分析不是本章，点到即停。",
        "",
        "高层图到这里就该停，问一句：「方向 OK 吗？接下来挖 ZSET 怎么建模，然后是多榜分片，最后写热点和自己的名次。」",
        "",
        "**面试怎么说：**",
        "",
        "> 「热路径就是 Redis Sorted Set。API 后面 ZADD / ZRANGE / ZRANK。DB 只做底稿和恢复，不当实时 `ORDER BY`。按赛季拆 key。」",
      ].join("\n"),
    },
    {
      id: "sec-zset",
      heading: "深入 · ZSET 模型（分数、并列、top-K）",
      secNum: "23.4",
      related: ["ch38"],
      body: [
        "第一个 hard part。**排行榜要的是：成员唯一、按分有序、插入后立刻在正确位置、任意成员能 O(log N) 问出名次。** 关系库一张 `score` 表能存，但实时名次不是 `ORDER BY` 能白给的。2026 白板默认：**Redis Sorted Set**（hash 表 + skip list）：`ZADD` O(log N)，`ZRANGE` O(log N + K)，`ZRANK` O(log N)，因为 skip list 节点带着 span，名次是沿路求和，不是扫全表。",
        "",
        d2(`
direction: right
zadd.class: go
zadd: "ZADD 写分"
zrank.class: step
zrank: "ZRANK REV"
zrange.class: ok
zrange: "ZRANGE REV"
zadd -> zrank -> zrange
`),
        "",
        "**本图引用**：Ch38 缓存与 CDN",
        "",
        "| | 关系库 `ORDER BY` | Redis ZSET（**默认**） |",
        "|---|---|---|",
        "| 写分 | UPDATE 一行；索引抖 | `ZADD` 就地改序，O(log N) |",
        "| top-K | `LIMIT K` 还行，仍吃写抖 | `ZRANGE 0 K-1 REV` |",
        "| 任意人名次 | `COUNT(*) WHERE score>` 近 O(N) | **ZRANK** O(log N) |",
        "| 面试 | 用来对比，不当实时答案 | **2026 第一答案** |",
        "",
        "Redis 6.2 起统一成 `ZRANGE … REV`、`ZRANK … REV`；`ZREVRANGE` / `ZREVRANK` 仍能说，别在命令别名上耗时间。member 必须唯一：同一玩家再 `ZADD` 是改分，不会出现两行。",
        "",
        "**并列：** 同分时 Redis **按 member 字符串字典序**（`REV` 时反向字典序），**不是**插入顺序，也不是「谁先达成」。放任 player id 当 tie-break 是产品事故。白板默认把 tie-break **编进 score**：`composite = score * scale + (MAX_TS - achieved_at)`，先达成者分数略高。注意 IEEE 754 整数精确到 2^53：scale 和时间戳要算过，别把两头都挤爆。另一种：member 用 `playerId#seq` 后缀，同分走字典序。应用层再读 Hash 比时间——多一趟，并发下还要对齐，不如一次复合 key。",
        "",
        "**dense vs skip：** 一句话定展示——dense 是 1,1,2（并列后不跳号），skip 是 1,1,3。`ZRANK` 给的是唯一下标（0-based）；并列规则是产品层，别假装 Redis 会帮你选。",
        "",
        d2(`
grid-columns: 2
podium: {
  label: "top-N"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "ZRANGE 头K"
  b.class: ok
  b: "可短缓存"
}
aroundMe: {
  label: "around-me"
  class: groupOk
  grid-columns: 2
  c.class: ok
  c: "先 ZRANK"
  d.class: ok
  d: "再切一段"
}
`),
        "",
        "top-N 是头部一小段，读多、变更相对慢，**可以短 TTL 缓存**（甚至 `ZRANGESTORE` 物化一份 head）。around-me 必须先定位这个人再切 ±k，**禁止 SCAN 全表找**。不要把「取附近」画成遍历。",
        "",
        "**面试怎么说：**",
        "",
        "> 「ZSET 是默认。ZADD 写，ZRANGE 取 top-K，ZRANK 取自己。同分编进 score 或 member 后缀。展示 dense 或 skip 先说一句。附近名次禁止 SCAN。」",
        "",
        "trade-off：复合 score 换一次排序、少一趟读，但要守住浮点精度；把时间戳放到旁路 Hash，读路径变复杂。SQL 当权威存档可以，当实时名次引擎不行——写越热，ORDER BY 越抖。",
      ].join("\n"),
    },
    {
      id: "sec-shard",
      heading: "深入 · 分片与多榜",
      secNum: "23.5",
      related: ["ch37", "ch38"],
      body: [
        "第二个 hard part。**扩展的第一刀不是把一个全球 ZSET 按分数切十段，而是不要把所有游戏、所有赛季、所有区服塞进同一把 key。** 2026 默认：一张榜一个 Sorted Set，key 里带 **leaderboard id / season / region**。旧赛季 TTL 或归档到 DB，别让历史成员在热 Redis 里长生。",
        "",
        d2(`
grid-columns: 2
byBoard: {
  label: "按榜拆 key · 默认"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "赛季一 key"
  b.class: ok
  b: "区服一 key"
}
oneSet: {
  label: "一张永生 ZSET"
  class: groupBad
  grid-columns: 2
  c.class: bad
  c: "全游戏一锅"
  d.class: bad
  d: "永不换 key"
}
`),
        "",
        "**本图引用**：Ch37 存储选型 · Ch38 缓存与 CDN",
        "",
        "按榜拆开之后，写入天然散到不同 Redis key（Cluster 下也是不同 slot）。全球榜、赛季榜、区服榜是 **多视图**：一局结算可以 ZADD 两三次（全球 + 本赛季），不要发明一个「万能集合」再每次过滤。好友榜是小集合，另开或读时 filter，本场不展开社交图。",
        "",
        "单榜仍然太大 / 太热时，再谈 **同一张榜内部**怎么切。两种常见方案都要能讲 trade-off，白板不要假装只有一种：",
        "",
        "| | 按榜 / 赛季 / 区服拆（**先做这个**） | 玩家哈希分片 | 分数段分片 |",
        "|---|---|---|---|",
        "| top-K | 打那一张榜的 ZSET | 每片取 K 再 merge（scatter-gather） | 头部往往在最高分段 |",
        "| 自己的名次 | **ZRANK 一次** | 要跨片 `ZCOUNT` 或近似 | 本地 rank + 更高段 `ZCARD` |",
        "| 写 | 打对应 key | 按 user 散，单榜写被摊开 | 改分可能跨段迁移 |",
        "| 坑 | 热赛季仍可能单 key 热 | 精确全球名次变贵 | 分数分布不均会热点在高分段 |",
        "| 面试 | **2026 第一刀** | 单榜写爆了再上 | 原书爱讲；现在当第二刀 |",
        "",
        "哈希切玩家：写简单，读 top-K 要 fan-out，**精确「第 N 名」要对每片数比自己高的人数**——规模上去往往改口「头部精确、尾部百分位」，那是产品决策，不是默默丢掉 ZRANK。分数段：top-K 好看，成员升段要删旧加新，还要 user→score 路由。**先按榜拆**，多数面试规模到这里就够；再往上才物化一份小的 head ZSET 给 top-N 读，避免每次 scatter-gather。",
        "",
        "不要为了「全球精确到第 1200001 名」把 Flink 窗口、离线数仓拉进来。那是分析题。本场 DB 只做 **热 ZSET 的底稿**（Ch37），不是再造一条实时流水线。",
        "",
        "**面试怎么说：**",
        "",
        "> 「先按 game、season、region 拆 ZSET，旧赛季过期。单榜再热才哈希或分数段。top-N 可以物化 head。不把所有游戏堆一张 key。」",
        "",
        "trade-off：多 key 换隔离和可过期，代价是一局可能写多张榜。哈希切玩家摊写、复杂化名次。分数段让头部局部性好，迁移和倾斜是新的 bottleneck。一张永生全球 ZSET 看起来省事，赛季结束你删不动、写也打在同一把锁上。",
      ].join("\n"),
    },
    {
      id: "sec-hot",
      heading: "深入 · 写热点与自己的名次",
      secNum: "23.6",
      related: ["ch38", "ch37"],
      body: [
        "第三个 hard part。热赛季的那把 key 是 **写 hotspot**：所有 `ZADD` 进同一个 Sorted Set，Cluster 里也落在同一个 slot。读分两路——top-N 可以挡在缓存前面；**自己的名次必须定位到这个 member**，不能靠 SCAN，也不能假装 top-100 缓存能回答「我第 4 万名」。",
        "",
        d2(`
shape: sequence_diagram
cli: "Client"
api: "Board API"
rds: "Redis"
db: "DB"
cli -> api: "POST score"
api -> rds: "ZADD"
api -> db: "write-behind"
cli -> api: "GET my rank"
api -> rds: "ZRANK REV"
api -> cli: "rank + around"
`),
        "",
        "**本图引用**：Ch38 缓存与 CDN · Ch37 存储选型",
        "",
        d2(`
grid-columns: 2
hotkey: {
  label: "热 key · 问题"
  class: groupBad
  grid-columns: 2
  a.class: bad
  a: "全服一 key"
  b.class: bad
  b: "SCAN 找人"
}
spread: {
  label: "拆开 · 默认"
  class: groupOk
  grid-columns: 2
  c.class: ok
  c: "按榜散写"
  d.class: ok
  d: "ZRANK 定位"
}
`),
        "",
        "写路径：同一玩家短时间连更，可以 **合并成最后一次 ZADD**（last-write 即可，排行榜不是账本）。不要每条战斗日志同步打 Redis。读 top-N：本地 LRU 或 Redis 短 TTL，stampede 合并回源（Ch38）。个人名次：`ZRANK` 打主；从副本最终一致，刚写完立刻读自己可能差一名——能接受就读从，不能就读主。",
        "",
        "**持久化是 trade-off，不是再买一个数仓。** Redis 是热视图：副本 failover 挡节点挂。进程全没了要对着底稿重建。",
        "",
        "| | Redis 当唯一真相 | 热 ZSET + DB write-behind（**默认**） |",
        "|---|---|---|",
        "| 写延迟 | AOF always 会拖 ZADD | API 先 ZADD 再异步落库 |",
        "| 丢数据窗口 | AOF everysec 仍可能丢一秒 | flush 前 crash 丢一段增量 |",
        "| 恢复 | 等 RDB/AOF | 从 DB 的最新分数 `ZADD` 重建该榜 |",
        "| 面试 | 小榜可以 | **热 + 底稿**；承认窗口 |",
        "",
        "重建按 **当前分数快照** 灌回 ZSET，不要回放「每一局 +1」除非你真把流水当账本——那是支付题（Ch24），不是排行榜。AOF / 短间隔只缩小窗口，不能假装和同步双写一样耐久。",
        "",
        "**面试怎么说：**",
        "",
        "> 「热赛季是单 key 写。先按榜拆；top-N 短缓存。自己的名次 ZRANK，附近再 ZRANGE。Redis 热、DB 底稿，接受短暂丢失窗口。不 SCAN。」",
        "",
        "trade-off：write-behind 换写延迟，接受丢失和「重启后榜慢几分钟重建」。每条 ZADD 同步事务写 DB 会把热路径拖成关系库题。为单 key 上全球多 Region CRDT 是 over-engineering——本场单 Region 热榜 + 分 key 就够讲完。",
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
        "Xu 把关系库 `ORDER BY` 为什么撑不住、ZSET = hash + skip list、`ZADD` / 范围读 / 个人名次、以及「太大了要分片」讲清楚了，这些机制仍成立。过时的是把 **5M DAU 单机、500M 才按分数段切** 当唯一扩展故事，以及把笔记里的云 SKU、Dragonfly 倍数、Flink / t-digest 数仓当成第一答案。",
        "",
        "| 原书或笔记 | 现在怎么答 |",
        "|---|---|",
        "| 单 Redis 撑「书上那个 DAU」，更大才分片 | **先按榜 / 赛季 / 区服拆 key**；不要全游戏一张永生 ZSET |",
        "| 固定分数段 vs 哈希 scatter-gather 当第一刀 | 多榜分片是默认；单榜再热才分数段或物化 head |",
        "| 口令绑死 `ZINCRBY` + `ZREVRANGE` | 覆盖总分用 **ZADD**；Redis 6.2+ **ZRANGE REV / ZRANK REV** |",
        "| 同分另存 Hash 再二次排 | **复合 score 或 member 后缀** 一次排定 |",
        "| 挂了就遍历每条赢局 `ZINCRBY` 重建 | **当前分快照** write-behind 回灌；流水账是支付题 |",
        "| 大规模只能 percentile / lookup table 银弹 | 先 **ZRANK**；尾部才近似。不当百分位专章 |",
        "| Lambda + 托管 Redis 清单当架构 | 白板讲 ZSET + DB 底稿；**不背云 SKU** |",
        "| 客户端轮询 vs 必须 WS 推送 | top-N 短缓存即可；推送不是 hard part |",
        "| 实时数仓 / Flink 更新榜 | **不是这题** |",
        "",
        "原书仍能用：服务端设分、ZSET 复杂度、top-K 与个人名次、副本 failover。过时的是把「一张全球 ZSET + 分数段」当唯一扩展，以及把分析栈、产品清单做成主线。",
        "",
        "</details>",
      ].join("\n"),
    },
    {
      id: "sec-traps",
      heading: "追问陷阱",
      secNum: null,
      related: ["ch37", "ch38"],
      body: [
        "1. **「分数榜还是推荐？」** → 默认游戏分数榜。推荐 / Feed / 数仓是别的题。",
        "2. **「为什么不能客户端报分？」** → 可篡改。游戏服结算再 ZADD。",
        "3. **「为什么不用 SQL ORDER BY？」** → 写热时名次接近全表计数。ZSET 的 ZRANK 是 O(log N)。",
        "4. **「ZADD 还是 ZINCRBY？」** → 覆盖 / 最高分用 ZADD；累加用 ZINCRBY。别只会一个。",
        "5. **「同分谁靠前？」** → Redis 默认字典序。要用复合 score 或 member 后缀表达「先达成」。",
        "6. **「dense 还是 skip？」** → 产品一句话。ZRANK 是唯一下标，并列规则在展示层。",
        "7. **「around-me 怎么查？」** → ZRANK 再 ZRANGE ±k。**禁止 SCAN。**",
        "8. **「一张 ZSET 装全世界？」** → 按 `game/season/region` 拆。旧赛季 TTL。",
        "9. **「哈希切玩家好不好？」** → 写散、top-K 要 merge、精确名次变贵。先按榜拆。",
        "10. **「Redis 挂了榜没了？」** → 热视图 + DB 底稿重建。承认 write-behind 窗口。",
        "11. **「要不要 Flink？」** → 不要。这不是实时数仓章。",
        "12. **终图已经很大了还往上堆？** → 推荐、CRDT 跨区、云 SKU、百分位课都不是本章。讲透三条 hard part 比画 20 个框得分高。",
      ].join("\n"),
    },
    {
      id: "sec-next",
      heading: "wrap-up 与下一步",
      secNum: null,
      related: ["ch24"],
      body: [
        "收尾不要说完美。三个 bottleneck 口播：",
        "",
        "| bottleneck | 你怎么接 |",
        "|---|---|",
        "| 单 key 写热 / 永生全球 ZSET | 按榜、赛季、区服拆 key；top-N 短缓存 |",
        "| SQL 实时名次 | Redis ZSET；ZADD + ZRANK，不要 `ORDER BY` 当热路径 |",
        "| SCAN 找自己 / 无底稿 | around-me = ZRANK + ZRANGE；DB write-behind 重建 |",
        "",
        "自测：合上这一页，用 30 秒开场 + 白板高层，把 ZSET 并列、按榜分片、ZRANK 不 SCAN 讲给空气听。哪句卡，回哪一节。数仓和推荐只点到就停。",
        "",
        "下一道题是 **Ch24 · 支付系统**。排行榜允许短暂不准和丢失窗口；支付反过来：**正确性大于 QPS**，账本、幂等键、对账——从「内存有序」切到「一分钱不能错」。",
      ].join("\n"),
    },
  ],
  reviewMd: `# Ch23 · 记忆闪卡

| # | 正面 | 背面 |
|---|---|---|
| 1 | 排行榜三个 hard part？ | ZSET 模型（分数、并列、top-K）；按榜分片；写热点 + 自己的名次。不是数仓、不是推荐。 |
| 2 | 默认范围？ | **游戏分数榜**：全球/赛季 top N + around-me。不是 Feed、不是推荐。 |
| 3 | 白板默认数据结构？ | Redis **Sorted Set**。\`ZADD\` / \`ZRANGE REV\` / \`ZRANK REV\`。 |
| 4 | 为什么不用 SQL 名次？ | 写热时 \`COUNT/ORDER BY\` 近全表。ZSET 名次 O(log N)。 |
| 5 | 同分怎么破？ | 复合 score 或 member 后缀。**不要**默认 player id 字典序。 |
| 6 | dense vs skip？ | 展示层一句话：1,1,2 或 1,1,3。ZRANK 是唯一下标。 |
| 7 | around-me？ | **ZRANK 再 ZRANGE ±k**。禁止 SCAN。 |
| 8 | 怎么分片？ | **按 leaderboard id / 赛季 / 区服拆 key**。不要一张永生全球 ZSET。 |
| 9 | 哈希切玩家？ | 写散、top-K scatter-gather、精确名次贵。先按榜拆。 |
| 10 | 热 key 怎么挡？ | 多榜散写；top-N 短缓存；个人名次打 ZRANK。 |
| 11 | Redis 和 DB？ | Redis **热**；DB **write-behind 底稿** 供恢复。承认丢失窗口。 |
| 12 | 这题最大的 over-engineering？ | Flink 数仓、推荐漏斗、云 SKU、一张 ZSET 装所有游戏。讲透三条 hard part。 |`,
});
