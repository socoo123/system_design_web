import { writeChapter } from "./write-chapter.mjs";

const d2 = (src) => {
  const body = src.trim();
  const sized = /style\.font-size/.test(body) ? body : `style.font-size: 12\n${body}`;
  return "```d2\n" + sized + "\n```";
};

writeChapter({
  id: "ch02",
  num: "02",
  title: "从零扩展到百万用户",
  kind: "method",
  relatedChapters: [
    "ch03",
    "ch36",
    "ch37",
    "ch38",
    "ch39",
    "ch40",
    "ch41",
    "ch42",
    "ch43",
    "ch44",
    "ch45",
  ],
  sections: [
    {
      id: "intro",
      heading: "",
      secNum: null,
      related: [],
      body: [
        "> **预计**：50–60 分钟 ｜ **前置**：Ch01 4 步法",
        "> **目标**：能用「痛点 → 方案 → 新痛点」把单机讲到百万用户；不先画终图；知道每集该挂哪块 M6 芯片。",
        "",
        "Ch01 教你 45 分钟怎么打。本章教你**架构怎么长出来**。面试官说「设计一个能撑百万用户的系统」时，strong hire 的信号不是一张 20 节点终图，而是：**从单机开始，每次只加一个组件，并讲清它解决了什么、又引入了什么。**",
        "",
        "数字怎么算留给 **Ch03**。机制（CAP、缓存策略、分片事务、K8s）点到即止，深读在 M6。",
      ].join("\n"),
    },
    {
      id: "sec-answer",
      heading: "面试怎么答",
      secNum: null,
      related: [],
      body: [
        "### 开场 30 秒",
        "",
        "> 「我会从最简单的单机开始，先找 bottleneck，再逐步加组件。每一步说清楚：为什么现在要动、引入什么、解决了什么、新痛点是什么。整段演进我控制在 8–12 分钟，不先画终图。」",
        "",
        "然后按 8 集往下推。每集大约一分钟，边画边说。超过 12 分钟就是在 Step 2 里做 deep dive 了——那是 red flag。",
        "",
        "### 8 集节奏（嘴上要念出来）",
        "",
        "| 集 | 当前痛点 | 引入 | 新痛点 |",
        "|---|---|---|---|",
        "| 1 单机 | 还没有系统 | 一台机器跑完 web + DB | 抢资源；一台挂全挂 |",
        "| 2 拆层 | web 与 DB 抢 CPU/内存 | web / DB 分机 | DB 仍是单点 |",
        "| 3 LB | 单 web 扩不了 | 托管 LB + 多 web | DB 仍单点；若 session 粘在 web 上，水平扩展是假的 |",
        "| 4 主从 | 读把单库打满 | primary 写、replica 读 | failover 可能丢数据；读有延迟 |",
        "| 5 缓存 CDN | 读路径仍太慢 | cache-aside + CDN / 对象存储 | 缓存一致性；cache 自己也是 SPOF |",
        "| 6 无状态 | sticky session 卡住扩缩 | 共享 session 或 JWT | 依赖共享存储；token 作废要另做 |",
        "| 7 多机房 | 单 Region 故障、跨洲延迟 | geoDNS / Anycast + 多 AZ/Region | 跨 Region 写的 CAP 代价 |",
        "| 8 MQ · 分片 | 慢任务堵住主路径；单库写到顶 | 托管 Kafka；分片或分布式 SQL | 重复消费；reshard / 热点 / 跨片 join |",
        "",
        "**纪律：禁止一上来画最终大图。** 那是 over-engineering。面试官要的是推理过程，不是你默写生产拓扑。",
      ].join("\n"),
    },
    {
      id: "sec-clarify",
      heading: "澄清问题清单",
      secNum: null,
      related: ["ch03"],
      body: [
        "这章的题型是**扩展叙事**，不是「设计短链」那种功能题。Step 1 仍然先问，但问题收在三类：",
        "",
        "| 类 | 你问 | 为什么问 |",
        "|---|---|---|",
        "| 规模 | 百万是 DAU 还是注册总量？读 QPS 大概哪个数量级？ | 决定停在主从还是必须分片 |",
        "| 读写 | 读:写大概多少？有没有「写完立刻读」？ | 决定 replica、缓存、CDN 怎么摆 |",
        "| 区域 | 用户是否跨洲？能否接受单 Region？ | 决定要不要多 Region；Active-Active 很贵 |",
        "",
        "还可以补两个约束：延迟目标（同城毫秒 vs 跨洲百毫秒）；哪类数据要强一致（账户可以，点赞通常不要）。",
        "",
        "问 5–7 个就停。面试官说「你来假设」→ 写白板：「假设 100 万 DAU、读多写少、先单 Region，全球用户再加 geoDNS」。假设错了面试官会改，沉默等完美数字不会。",
      ].join("\n"),
    },
    {
      id: "sec-estimate",
      heading: "粗估（短）",
      secNum: null,
      related: ["ch03"],
      body: [
        "本章**不讲估算细节**。Step 2 前留 1–2 分钟 back-of-envelope 的位置，公式和 2026 延迟表在 **Ch03**。",
        "",
        "面试里够用的三句：",
        "",
        "1. 「先把 QPS / 存储数量级写上，再用它检查每一集加的组件撑不撑得住。」",
        "2. 「延迟主叙事用内存、NVMe、同城、跨洲，不要拿 HDD 当第一答案。」",
        "3. 「单机 NVMe + 大内存往往比直觉能扛更多读。别为了显得高级一上来就分布式——那是 over-engineering。」",
        "",
        "具体怎么乘 DAU、怎么算副本磁盘，翻 Ch03。",
      ].join("\n"),
    },
    {
      id: "sec-map",
      heading: "高层：8 集地图",
      secNum: null,
      related: ["ch37", "ch39", "ch38", "ch41", "ch36", "ch42"],
      body: [
        "先给面试官看路线，**不要**把终态架构当开场。下面这张图只回答「顺序是什么」。",
        "",
        d2(`
grid-rows: 2
early: {
  label: "第 1-4 集"
  class: group
  grid-columns: 4
  e1.class: go
  e1: "1 单机"
  e2.class: step
  e2: "2 拆层"
  e3.class: step
  e3: "3 LB"
  e4.class: step
  e4: "4 主从"
}
late: {
  label: "第 5-8 集"
  class: group
  grid-columns: 4
  e5.class: step
  e5: "5 缓存CDN"
  e6.class: step
  e6: "6 无状态"
  e7.class: step
  e7: "7 多机房"
  e8.class: ok
  e8: "8 MQ·分片"
}
`),
        "",
        "话术：",
        "",
        "> 「我按这条链演进。现在还在第 1 集。你如果想跳到多 Region 或分片，告诉我，我加速；否则我一集一集加。」",
        "",
        "下面按集走。每集都是**痛点 → 方案 → 新痛点**。架构图只拍三个快照：早期拆层、中期 LB+主从+缓存、后期多机房。MQ 与分片用文字推进，避免一张图塞 20 个节点。",
      ].join("\n"),
    },
    {
      id: "sec-early",
      heading: "第 1–3 集：单机 → 拆层 → LB",
      secNum: "2.1",
      related: ["ch37", "ch39", "ch40"],
      body: [
        "### 第 1 集 · 单机",
        "",
        "**痛点：** 还没有系统，但已经有用户要访问。",
        "",
        "**方案：** 一台机器跑 web 应用和数据库。用户经 DNS 拿到公网 IP，HTTP 打到这台机器。DNS 用第三方托管即可，当作已知外部服务；要会说「权威 DNS 以后还能做 geo 路由」，细节留到第 7 集。",
        "",
        "**新痛点：** web 和 DB 抢同一份 CPU / 内存 / NVMe；没有冗余，进程一挂全站挂；垂直加配有硬件天花板。",
        "",
        "### 第 2 集 · 拆 web / DB",
        "",
        "**痛点：** 单机抢资源，两边都不能独立扩。",
        "",
        "**方案：** 拆成两层。web 放业务逻辑；DB 单独一台。2026 默认先选关系库（PostgreSQL 一类）：有 schema、要事务、要 join，就不要为了「显得分布式」上 NoSQL。访问模式极端（纯 KV、纯时序、海量写入）再换专用存储——选型表在 **Ch37**。",
        "",
        d2(`
direction: right
app.class: go
app: "App"
web.class: step
web: "Web"
db.class: store
db: "DB"
app -> web -> db
`),
        "",
        "本图引用：Ch37 存储选型 · Ch40 协议选型（HTTP 读路径）",
        "",
        "**新痛点：** DB 仍是单点。web 也还是一台。",
        "",
        "### 第 3 集 · LB + 水平扩展",
        "",
        "**痛点：** 单 web 是 SPOF；只给这台加 CPU（scale up）有顶。",
        "",
        "**方案：** 水平加 web（scale out），前面放**托管 LB**。LB 做两件事：按健康检查摘掉坏节点（failover），以及把流量分到多台。机器同构用轮询就够；长连接再提最少连接。L4 vs L7、一致性哈希 LB 深读 **Ch39**，这里只说「入口用托管 LB，按内容路由再上 L7」。",
        "",
        "web 之间走内网。客户端只看见 LB 的公网入口。",
        "",
        "**新痛点：** DB 还是一台，读一涨就先死在库上。另外，如果 session 还在某台 web 内存里，LB 不得不 sticky——第 6 集再拆。现在先承认这是隐患，不要假装已经无状态。",
      ].join("\n"),
    },
    {
      id: "sec-mid",
      heading: "第 4–6 集：主从 → 缓存/CDN → 无状态",
      secNum: "2.2",
      related: ["ch41", "ch38", "ch39"],
      body: [
        "### 第 4 集 · 主从复制",
        "",
        "**痛点：** web 能加了，DB 仍单点；典型业务读多写少，读把 primary 打满。",
        "",
        "**方案：** 一台 primary 接写，若干 replica 接读。术语用 **primary / replica**（不要再用 master/slave）。三点收益要一次说完：读分散、数据多副本、库挂了还能切。",
        "",
        "复制默认先说**异步**（快，主挂可能丢未复制的写入）。需要更小的丢失窗口再提半同步（至少一个 replica 收到才 ACK）。同步等所有 replica 会把跨 AZ 延迟写进关键路径，金融可以谈，社交 timeline 通常不值得。机制在 **Ch41**。",
        "",
        "**新痛点：** primary failover 不是改个 DNS 就结束；replica 可能落后。用户写完立刻读 replica，可能读到旧值。这两点是本章 deep dive，先记在白板上。",
        "",
        "### 第 5 集 · 缓存与 CDN",
        "",
        "**痛点：** 读仍然太贵；头像、JS、视频反复打源站；跨洲用户首字节慢。",
        "",
        "**方案：** 热点读走缓存（**cache-aside** 必须会讲：读 miss 回源再回填；写库后**删**缓存，不要改缓存）。静态和大体量文件走 CDN + **对象存储**。TTL 必须有；cache 要多副本，否则只是把 SPOF 换了个地方。",
        "",
        "2026 可以补一句：多个派生数据（缓存、搜索索引）不想靠应用双写时，用 **CDC**（听 DB 的 WAL / binlog）去做失效或回填。面试会 aside 就能过；CDC 是加分，深读 **Ch38**。穿透 / 击穿 / 雪崩也在那章，这里只点名：空值 TTL、热点互斥、TTL 加抖动。",
        "",
        d2(`
direction: right
app.class: go
app: "App"
lb.class: step
lb: "LB"
web.class: ok
web: "Web xN"
cache.class: store
cache: "Cache"
pri.class: store
pri: "Primary"
rep.class: store
rep: "Replica"
app -> lb -> web -> cache
web -> pri -> rep
`),
        "",
        "本图引用：Ch39 负载均衡与无状态 · Ch38 缓存与 CDN · Ch41 复制、分片、事务",
        "",
        "**新痛点：** 缓存和 DB 不是一个事务，会短暂不一致。CDN 过期太长会 stale，太短会打爆源站。下一集如果还不把 session 从 web 里拿掉，加机器仍然痛。",
        "",
        "### 第 6 集 · 无状态 web",
        "",
        "**痛点：** sticky session 让「水平扩展」名存实亡——用户被粘在一台；那台挂了 session 没了；auto-scaling 还要搬家。",
        "",
        "**方案：** web **无状态**。session 放到共享存储（Redis 一类），或用 JWT（token 自包含，web 只验签）。任意一台都能接请求，托管 LB 不必粘滞。",
        "",
        d2(`
grid-rows: 2
sticky: {
  label: "sticky session"
  class: groupBad
  grid-columns: 3
  a.class: bad
  a: "session 在内存"
  b.class: bad
  b: "必须粘滞"
  c.class: bad
  c: "扩容要搬家"
}
stateless: {
  label: "stateless"
  class: groupOk
  grid-columns: 3
  d.class: ok
  d: "共享 session"
  e.class: ok
  e: "或用 JWT"
  f.class: ok
  f: "任意一台"
}
`),
        "",
        "本图引用：Ch39 负载均衡与无状态",
        "",
        "JWT 的代价：主动登出要黑名单或短 access + refresh。面试说「我知道这个 trade-off」比假装完美加分。",
        "",
        "K8s 只留心智一句：**无状态副本才能按指标加 Pod**；YAML、HPA 细节在 **Ch42**，本章不写。",
        "",
        "**新痛点：** 共享 session 成了新依赖。单 Region 挂了，前面这些都救不了跨洲用户。",
      ].join("\n"),
    },
    {
      id: "sec-late",
      heading: "第 7–8 集：多机房 → MQ → 分片",
      secNum: "2.3",
      related: ["ch36", "ch42", "ch41", "ch43", "ch44", "ch45"],
      body: [
        "### 第 7 集 · 多机房（Region / AZ）",
        "",
        "**痛点：** 单机房（现在叫单 Region）故障域太大；跨洲用户每次 RTT 都是百毫秒级。",
        "",
        "**方案：** 同一 Region 多 **AZ** 是 2026 默认高可用，不是加分项。真要容灾和就近访问，再上多 Region：入口用 **geoDNS 或 Anycast**，按位置 + 健康检查切流量。",
        "",
        "| | Active-Passive | Active-Active |",
        "|---|---|---|",
        "| 流量 | 一个 Region 接写，另一个热备 | 两个都接 |",
        "| failover | 分钟级切主 | 本来就活着 |",
        "| 数据 | 单向复制，冲突少 | 双向写，冲突是 hard part |",
        "| 成本 | 备可以降配 | 接近双份活资源 |",
        "",
        "Active-Active 不是免费的全球低延迟。跨洲同步要么加延迟（要一致），要么接受短暂分叉（要可用）。CAP / PACELC 怎么开口在 **Ch36**，这里只说：**按数据选，不要按整站选**——账户可以偏一致，Feed 可以偏可用。",
        "",
        d2(`
direction: right
app.class: go
app: "App"
dns.class: step
dns: "geoDNS"
ra.class: ok
ra: "Region A"
rb.class: ok
rb: "Region B"
obj.class: store
obj: "对象存储"
app -> dns -> ra -> obj
dns -> rb -> obj
`),
        "",
        "本图引用：Ch36 Trade-off（CAP / PACELC）· Ch42 消息、弹性、容器心智",
        "",
        "**新痛点：** 跨 Region 写同一行会冲突。常见逃法是 geo-sharding（用户固定写归属 Region），而不是一上来全球同步写。对象存储做跨 Region 复制相对好讲；数据库才是疼的。",
        "",
        "### 第 8 集上 · MQ",
        "",
        "**痛点：** 上传后转码、发通知、刷派生数据如果同步做，写路径被慢任务堵住；web 和 worker 死耦合，两边不能独立扩。",
        "",
        "**方案：** 写入先落到 **托管 Kafka**（或同类日志型 MQ），web 尽快返回；worker 自己扩。生产者与消费者解耦，积压就加消费者。",
        "",
        "投递语义点一句即可：生产主流是 **at-least-once**，所以消费方必须幂等（业务唯一键 + 唯一索引）。exactly-once 作为端到端口号很响，工程上多半是「至少一次 + 幂等」装出来的。深读 **Ch42**，Kafka 分区/ISR 在 **Ch20**。",
        "",
        "**新痛点：** 重复、乱序、积压、死信。MQ **解决不了**单库写入天花板。",
        "",
        "### 第 8 集下 · 分片（以及何时不手搓分片）",
        "",
        "**痛点：** 单库的写 QPS 和数据量到顶。主从只扩读。",
        "",
        "**方案：** 按**分片键**把数据拆到多 shard。键要高基数、分布均匀、常用查询能落到**一个** shard。`user_id` 通常可用；`gender`、单调自增时间戳当唯一键容易热点。",
        "",
        "2026 第一句要先说：**能用原生分布式 SQL 时优先**（存储层自己切 range、再平衡、多副本）。面试仍会问手搓分片，因为 hard part 没变：分片键、reshard、热点、跨片 join。一致性哈希怎么减迁移量在 **Ch05 / Ch41**；热温冷分层在 **Ch43**。",
        "",
        "跨片 join 和跨片事务优先**避免**：同一聚合的数据放一起（点到 **Ch45**）。真要跨服务长事务，Saga / Outbox 在 Ch41，本章不要展开 2PC。微服务怎么拆在 **Ch44**，不要在第 8 集突然画一张服务网格。",
        "",
        "**新痛点：** reshard 会迁移；明星 key 打爆一个 shard；跨片查询变成 scatter-gather。到这里演进叙事可以收住，转 Step 3 deep dive。",
      ].join("\n"),
    },
    {
      id: "sec-deep",
      heading: "深入三点",
      secNum: "2.4",
      related: ["ch41", "ch38", "ch36"],
      body: [
        "Step 3 在这题里，hard part（最该挖的那块）通常是下面三个。挑 1–2 个挖透，不要三个都浅。",
        "",
        "### 1. 主从 failover 与读延迟",
        "",
        "failover 口播五步：**探测**（连续健康检查失败）→ **选本**（复制位点最新的 replica）→ **对齐**（追上 primary 位点）→ **切路由**（应用 / LB 指向新 primary）→ **补副本**。",
        "",
        "异步复制下，主挂可能丢掉「ACK 了但还没进 replica」的写入。这就是 RPO。半同步缩小窗口，代价是写延迟。不要承诺「不会丢」；说你接受多大窗口、用什么复制模式买这个窗口。",
        "",
        "**写后立刻读（read-your-writes）** 是必追问。时序如下：",
        "",
        d2(`
shape: sequence_diagram
app: "App"
web: "Web"
pri: "Primary"
rep: "Replica"
app -> web: "POST write"
web -> pri: "INSERT"
pri -> web: "ACK"
web -> app: "200"
app -> web: "GET now"
web -> rep: "SELECT"
rep -> web: "stale"
web -> app: "old view"
`),
        "",
        "本图引用：Ch41 复制、分片、事务",
        "",
        "解法（面试说清 trade-off 即可）：",
        "",
        "| 做法 | 效果 | 代价 |",
        "|---|---|---|",
        "| 写后短时间读 primary | 该用户 read-your-writes | primary 读压力↑ |",
        "| 客户端带版本，replica 未追上则回 primary | 更精确 | 要暴露位点 / 版本 |",
        "| 半同步 | 缩短 stale 窗口 | 写变慢 |",
        "",
        "单调读（刷新后数据「变少」）：同一用户固定到同一个 replica，别让 LB 在落后程度不同的副本间乱跳。",
        "",
        "### 2. 缓存一致性",
        "",
        "cache-aside 标准写路径是 **先写 DB，再删缓存**。删是幂等的；「写库同时 SET 缓存」在并发下会把旧值盖回去。删完靠下次读回填；再加 TTL 当兜底。",
        "",
        "仍可能发生：读请求先拿到旧行，写请求删了空缓存，读请求再把旧行 SET 回去。工程上用 **短 TTL** 限制窗口；派生数据多（缓存 + 搜索 + 数仓）时，改由 **CDC** 听 WAL，统一失效或回填，应用不再双写。CDC 不是零延迟，是把「谁负责一致」从应用里拿出来。细节 **Ch38**。",
        "",
        "面试怎么选：能接受秒级 stale → aside + 删 + TTL。多个下游要跟库走 → 提 CDC，不要现场设计一套双写协议。",
        "",
        "### 3. 分片键与热点",
        "",
        "选键三问：分布匀不匀？点查能否落到单 shard？会不会把最新写入全堆在一个 range 上？",
        "",
        "热点（celebrity key）：读可用缓存顶；写要把一个逻辑键拆成子键（加盐）再聚合，或给超热 key 单独资源。单调主键的 range 分片会把插入打在最右一段——这是分布式 SQL 也要面对的，只是引擎可能自动 split；你仍要能说出「为什么这个键会烫」。",
        "",
        "reshard：`hash % N` 改 N 几乎全量搬家。所以面试会听到一致性哈希 / range split。能用原生分布式 SQL 就让存储层做再平衡；不能的话，提前说迁移窗口和双写切换，不要假装 `MOD 4` 能活到亿级。",
      ].join("\n"),
    },
    {
      id: "sec-2026",
      heading: "2026 vs 原书",
      secNum: null,
      related: [],
      body: [
        "<details>",
        "<summary>原书 / 笔记当时怎么讲 · 现在什么进正文、什么进折叠</summary>",
        "",
        "| 原书（约 2020） | 现在怎么答 |",
        "|---|---|",
        "| master / slave | primary / replica |",
        "| 延迟表以 HDD 为记忆锚点 | 正文用内存 / NVMe / 同城 / 跨洲；HDD 留给 Ch03 折叠 |",
        "| sticky session 写成可用方案 | 过渡或反例；正文默认无状态 + 共享 session 或 JWT |",
        "| 「多数据中心」几段带过 | Region / AZ、geoDNS 或 Anycast；Active-Active 要付 CAP 代价（Ch36） |",
        "| 缓存几乎只提 aside / 读穿透 | aside 仍必会；可点 CDC 失效，不把延迟双删当第一答案 |",
        "| 终局是手搓 MySQL 分片 | 分片键 / reshard / 热点仍必问；能用原生分布式 SQL 时优先 |",
        "| 按云厂商列 ALB、NLB、SQS | 说托管 LB、对象存储、托管 Kafka |",
        "| 几乎不提容器编排 | 无状态副本心智一句；不写 YAML（Ch42） |",
        "| 一张最终大图收尾 | 演进叙事收尾；终图当开场是 red flag |",
        "",
        "笔记里还有 SQL/NoSQL 大 fan-out、Service Mesh、边缘计算全家桶。那些可以在 wrap-up 提「下一曲线」，不要在第 2 集就画上去。",
        "",
        "</details>",
      ].join("\n"),
    },
    {
      id: "sec-traps",
      heading: "追问陷阱",
      secNum: null,
      related: ["ch36", "ch38", "ch41", "ch42"],
      body: [
        "1. 「为什么不直接画最终架构？」→ 因为面试考的是演进推理。终图开场 = over-engineering。",
        "2. 「写完立刻刷新看不到？」→ 读了落后 replica。写后短时间读 primary，或带版本回退。",
        "3. 「primary 挂了会丢数据吗？」→ 异步会。讲 RPO + 半同步 / 接受窗口，不要保证零丢失。",
        "4. 「缓存和库不一致怎么办？」→ aside 删缓存 + TTL；下游多就提 CDC。不要承诺强一致缓存。",
        "5. 「sticky 不也能扩容吗？」→ 能撑一阵。挂机丢 session、缩容搬家。正解是无状态。",
        "6. 「多 Region 怎么又快又一致？」→ 做不到免费两者都要。按数据选；机制 Ch36。",
        "7. 「消息重复了？」→ at-least-once 下消费方幂等，唯一键兜底。",
        "8. 「分片键怎么选？」→ 高基数、均匀、点查单片。再问热点和 reshard。能用分布式 SQL 先说优先，仍要把键讲清楚。",
        "9. 「流量 ×10？」→ 先找哪一层先炸（LB / 缓存 / primary 写 / 热点 shard），再决定加副本还是分片，不要只加机器。",
      ].join("\n"),
    },
    {
      id: "sec-next",
      heading: "下一步",
      secNum: null,
      related: ["ch03"],
      body: [
        "合上页，用 8 集把「百万用户」讲一遍，每集三句话：痛点、方案、新痛点。卡在数字上就进 **Ch03 · 粗略估算**。第一道带 4 步法的小题是 **Ch04 限流器**。",
        "",
        "自测：能不能在不画终图的前提下，让面试官在第 4 集就听懂 failover 和读延迟。能，这一章就算过。",
      ].join("\n"),
    },
  ],
  reviewMd: `# Ch02 · 记忆闪卡

| # | 正面 | 背面 |
|---|---|---|
| 1 | 扩展题为什么不能一上来画终图？ | 考的是痛点→方案→新痛点的推理。终图开场是 over-engineering。 |
| 2 | 8 集顺序？ | 单机 → 拆层 → LB → 主从 → 缓存/CDN → 无状态 → 多机房 → MQ/分片。 |
| 3 | 这章 Step 1 必问哪三类？ | 规模、读写下、是否多区域。 |
| 4 | 估算公式在哪一章？ | Ch03。本章只留 back-of-envelope 的位置。 |
| 5 | 拆 web/DB 之后新痛点是什么？ | DB 仍是单点；web 也还是一台。 |
| 6 | LB 解决什么、不解决什么？ | 解决 web 的 failover 与水平扩展。不解决 DB 单点。 |
| 7 | 主从异步 failover 会丢数据吗？ | 可能。未复制到 replica 的 ACK 写入会进 RPO。 |
| 8 | 写完立刻读不到怎么讲？ | 读了落后 replica。写后短时间读 primary，或版本未追上则回 primary。 |
| 9 | cache-aside 写路径为什么删缓存？ | 删是幂等的；并发 SET 容易把旧值写回。TTL 当兜底。 |
| 10 | 2026 什么时候提 CDC？ | 多个派生数据要跟库走时。aside 仍是必须会的基线。 |
| 11 | sticky session 为什么当反例？ | 粘在一台：挂机丢会话、扩缩要搬家。无状态用共享 session 或 JWT。 |
| 12 | Active-Active 的代价？ | 双向写冲突 + 跨洲延迟。按数据选一致还是可用，点到 Ch36。 |
| 13 | MQ 主流投递语义？ | at-least-once；消费方幂等。MQ 不解单库写天花板。 |
| 14 | 分片键怎么选？热点呢？ | 高基数、均匀、点查单片。热点用缓存/加盐/单独资源。能用分布式 SQL 优先。 |`,
});
