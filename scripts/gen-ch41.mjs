import { writeChapter } from "./write-chapter.mjs";

const d2 = (src) => {
  const body = src.trim();
  const sized = /style\.font-size/.test(body) ? body : `style.font-size: 12\n${body}`;
  return "```d2\n" + sized + "\n```";
};

writeChapter({
  id: "ch41",
  num: "41",
  title: "复制、分片、事务",
  kind: "foundation",
  relatedChapters: ["ch06", "ch18", "ch20", "ch24"],
  sections: [
    {
      id: "intro",
      heading: "",
      secNum: null,
      related: ["ch06", "ch36"],
      body: [
        "> **预计**：90–120 分钟 ｜ **前置**：Ch06 quorum；Ch36 CAP 格子",
        "> **目标**：主从、分片键、Saga / Outbox / CDC；2PC 为何常被否。不去云购物。",
        "",
        "这是 **M6 第六块基础芯片**，不是又一道 4 步设计题。主线里 KV 的副本、订单库存、支付入账、消息和 DB 双写都会点到「数据怎么多放一份、怎么切开、跨服务怎么一致」——本章把 **主从复制、分片键、Outbox / CDC、Saga，以及 2PC 为什么常被否**讲透。设计题里只引用，不在白板上开分布式数据库课。Ch06 已经把 **无主 + quorum** 讲完；本章是 **有 Primary 的拓扑**，不重讲 LWW / 向量时钟。Kafka 分区是 **Ch20**，这里只回收「库表怎么切」，不当消息课。",
        "",
        "**一句话：** 读写默认 **Primary 写、Replica 跟**；切库先选 **高基数、均匀、对齐查询** 的分片键；跨服务双写默认 **Outbox + CDC**，长流程用 **Saga**；面向用户的路径 **不要自己画 2PC / XA**。",
        "",
        "三个 hard part（最该挖的那块）：",
        "",
        "1. **复制延迟 vs failover** —— 异步 200 不代表 Replica 已有；提升落后副本会丢已确认写",
        "2. **分片键怎么选** —— 基数、热点、默认不要跨分片 join",
        "3. **2PC 否决 + Outbox/Saga 默认** —— 阻塞 + 协调者；用户路径用本地事务 + 事件",
        "",
        "本章**不讲**：隔离级别百科当脊柱、Raft 论文 / C++ 默写、AWS DMS 购物、把 Ch06 Dynamo 再讲一遍、把 Kafka partition 当本章（Ch20）、Temporal / Step Functions 产品巡礼、NewSQL SKU 目录。etcd lease 回 **Ch08**。投递语义、积压回 **Ch42**。",
      ].join("\n"),
    },
    {
      id: "sec-pitch",
      heading: "一句话定义 · 面试 20 秒开口",
      secNum: "41.1",
      related: ["ch06", "ch18", "ch24", "ch36"],
      body: [
        "先把评分信号打出来：你会画主从、会选分片键、跨服务不先上 XA。",
        "",
        "> 「复制我默认 **Primary 写、Replica 异步跟**。写完立刻读 Replica 可能 stale，这叫 **replica lag**。failover 提升落后副本，会丢掉 Primary 已 200、Replica 还没追上的那截——**异步复制的 RPO 不是 0**。要 failover 几乎不丢，就同步（或半同步）等副本 ACK，用延迟换。数据超出单机就分片：键要 **高基数、打散热点、查询尽量落在一片**；跨分片 join 不当默认。同库事务够用就同库。跨服务双写默认 **Outbox + CDC**：业务行和 outbox 同一本地事务，再从日志发出去。长流程 **Saga**（本地事务链 + 补偿），协同或编排选一个。**2PC 面向用户常被否**：协调者挂了参与者阻塞在 prepared，渠道也不参加 XA。Raft 一句：写进 **多数派** 才 commit，只有 **leader** 接写——etcd / 很多共识库用这个，不是主从课。」",
        "",
        "整章按这一条链走。上场 20 秒念完就停，让面试官决定要挖复制、分片还是事务。",
        "",
        d2(`
direction: right
rep.class: go
rep: "复制"
shd.class: step
shd: "分片"
tx.class: ok
tx: "事务"
rep -> shd -> tx
`),
        "",
        "本图引用：Ch06 quorum（无主对照）· Ch36 PACELC Else（等不等副本）",
        "",
        "| 面试官问法 | 你落在哪一截 |",
        "|---|---|",
        "| 「主挂了数据还在吗？」 | 先问同步还是异步；异步看 lag 窗口 |",
        "| 「怎么水平拆库？」 | 先分片键，不先报云分片产品 |",
        "| 「订单和支付怎么一起提交？」 | 同库就本地事务；跨服务 Outbox / Saga，不 2PC |",
        "",
        "**red flag：** 一上来画 XA / 2PC 跨渠道；说「有副本所以 failover 不丢数」却不提 lag；按 `status` / 布尔值分片；把 Ch06 的 N/W/R 当主从口播；把 Kafka 分区当库表分片课。",
      ].join("\n"),
    },
    {
      id: "sec-repl",
      heading: "机制 · 复制（延迟 vs failover）",
      secNum: "41.2",
      related: ["ch06", "ch36", "ch02"],
      body: [
        "第一个 hard part。**2026 面试里，会背「三副本」不如会说 replica lag 和 failover 谁先赢。** 本章默认拓扑是 **单 Primary 接写、Replica 跟日志**（leader-follower / 主从）。Ch06 的 Dynamo 风格是 **无主 + quorum**，冲突用 LWW——**这里不重讲**。两边都叫复制，白板拓扑不一样。",
        "",
        d2(`
direction: right
app.class: go
app: "App"
pri.class: store
pri: "Primary"
rep.class: store
rep: "Replica"
app -> pri -> rep
`),
        "",
        "本图引用：Ch36 Else 枝（等副本 = 买 C 付 L）· Ch06 无主对照（不要把 N/W/R 套在这一条链上）",
        "",
        "写只打 Primary。Replica 靠复制流（WAL / binlog）追。读可以打 Replica 换吞吐，但一致性是另一句话。",
        "",
        "| | **异步** | **同步**（含半同步：至少等一个 ACK） |",
        "|---|---|---|",
        "| 写何时 200 | Primary 本地提交就回 | 等到 Replica 收到（或落盘）再回 |",
        "| 写延迟 | 低 | 叠上到副本的 RTT；跨 AZ / 跨洲很痛 |",
        "| replica lag | **常态**：秒级到更长 | 提交点上 Replica 已有这次写 |",
        "| failover 丢不丢已确认写 | **可能丢** lag 窗口内的写（RPO > 0） | 提升的那台已有提交，RPO 接近 0 |",
        "| 副本挂了 | 写仍可走（副本只是落后） | 写阻塞或降级成异步——要事先说清 |",
        "| PACELC | Else 偏 **L** | Else 偏 **C** |",
        "",
        "面试最爱挖的时序：**写完立刻读 Replica。**",
        "",
        d2(`
shape: sequence_diagram
app: "App"
pri: "Primary"
rep: "Replica"
app -> pri: "POST write"
pri -> app: "200"
app -> rep: "GET now"
rep -> app: "stale"
`),
        "",
        "200 只保证 Primary。Replica 还在追，GET 拿到旧行。这不是 bug，是异步的合同。要 read-your-writes：这次读打 Primary、或会话粘在 Primary、或等复制位点赶上。Feed 可以认 stale；「刚改的密码 / 刚扣的库存」不要默认 Replica。",
        "",
        "**failover 不是「把 Replica 改名成 Primary」就结束。** 检测 → 停写旧主 → 选一个 Replica 提升 → 客户端切过去。hard part 是和 lag 绑在一起：",
        "",
        "1. **异步 + 提升落后副本** = 客户端已经看见 200 的行，新主上没有。对账、补偿、用户重试，比假装 RPO=0 加分。",
        "2. **旧主没 fencing 还在接写** = split-brain，两边各写各的。提升之后必须让旧主拒绝写（STONITH / 租约过期 / 只读），不要只改 DNS。",
        "3. **同步换不丢，用延迟和可用性换。** 副本在对岸机房，每个 COMMIT 钉在跨洲 RTT 上——Ch02 / Ch36 已经说过按数据选。账本可以同步同城；timeline 异步跨洲。",
        "",
        "半同步（MySQL 一类：至少一台收到 event 再提交）是中间档：比纯异步少丢，比全同步少等所有人。开口点到即可，不要开复制插件课。",
        "",
        "Ch06 对照一句就停：**无主** 写 N 台等 W 个 ACK，没有「提升 Primary」这一跳，故障模型是 quorum 和 hinted handoff（那边点到 Ch41）。**主从** 有单写点，failover 是显式切换，lag 是第一风险。不要把 W+R>N 念成主从口播。",
        "",
        "面试怎么说：",
        "",
        "> 「主从默认异步：写快，读 Replica 可能旧。failover 我先问副本追上没有；没追上就承认丢 lag 窗口。要几乎不丢就同步，付延迟。我不会说有副本就永不丢数。」",
        "",
        "**red flag：** 「三副本所以主挂了零丢失」；failover 不提 fencing；把 quorum KV 和主从画成同一张图还共用 N/W/R；跨洲同步当免费强一致。",
      ].join("\n"),
    },
    {
      id: "sec-shard",
      heading: "机制 · 分片键怎么选",
      secNum: "41.3",
      related: ["ch05", "ch18", "ch20"],
      body: [
        "第二个 hard part。**分片是把一张逻辑表切到多台机器；键选错，加机器也不涨。** 一致性哈希怎么找节点是 **Ch05**。Kafka 的 partition 是日志并行单元，顺序只在区内——**Ch20**，不要在这里重做消息题。本章问的是：**行按哪个列切开。**",
        "",
        d2(`
grid-columns: 2
good: {
  label: "好键"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "高基数"
  b.class: ok
  b: "均匀"
}
hot: {
  label: "热点"
  class: groupBad
  grid-columns: 2
  c.class: bad
  c: "低基数"
  d.class: bad
  d: "热用户"
}
`),
        "",
        "三条口播，够用：",
        "",
        "1. **高基数。** 不同值要足够多，切片才能多。`status`、布尔、国家代码十几档，会把流量拍成几片——其中一片仍是单机。",
        "2. **均匀、避开热点。** 大用户、热 SKU、热门房间，所有写打进同一片。键再哈希也救不了「一个值占一片」。对策：拆热 key（后缀分桶）、该实体单独池、或接受这一片垂直扩。单调递增的 `order_id` 做 **range** 分片会让新写入永远砸在最新一片。",
        "3. **对齐查询，跨分片 join 不当默认。** 订单按 `user_id` 切，用户维度的列表落在一片，一次本地查询。按 `order_id` 切，查「某用户最近 20 单」要散到很多片再合并。跨片 join / 跨片事务是你在买分布式，不是 SQL 免费功能。需要两边都查，就 **双写一张按另一键组织的表**（或异步投影），不要第一句「全局 2PC join」。",
        "",
        "| 键 | 何时像对 | 何时翻车 |",
        "|---|---|---|",
        "| **`user_id` / `tenant_id`** | 请求天然带用户；订单、会话、配置 | 超大租户 / 网红账号打满一片 |",
        "| **`order_id` 哈希** | 点查订单号；写相对均匀 | 「我的订单列表」要 scatter-gather |",
        "| **时间 range** | 按日扫日志、冷热分层 | 当前分区被写爆；历史片空转 |",
        "| **`status` / 类型枚举** | 几乎从不 | 低基数热点，经典 red flag |",
        "",
        "实体要尽量 **同片**：订单行和订单项共用 `order_id`（或同一 `user_id`）落在一台，本地事务还能用。Helland 后来把这叫可重分区的 entity——面试说「一个聚合尽量一片」即可，不要开 DDD 课（Ch45）。",
        "",
        "哈希 vs range：哈希打散写；range 方便扫区间、也容易热在头尾。先问访问是点查还是扫段，再选。再平衡（分裂过热片、迁走）点到「键要允许以后拆」，不要画自动均衡产品。",
        "",
        "面试怎么说：",
        "",
        "> 「键先看基数和热点，再看查询能不能落在一片。跨片 join 我不当默认。热用户单独处理，不用 `status` 切片。」",
        "",
        "**red flag：** 按支付状态分片；吹「NewSQL 自动分片所以不用选键」却讲不出热点；把 Kafka `hash(key) % N` 整节搬进来当库表课。",
      ].join("\n"),
    },
    {
      id: "sec-tx",
      heading: "机制 · 事务 / Outbox / Saga（2PC 为何常被否）",
      secNum: "41.4",
      related: ["ch18", "ch24", "ch20"],
      body: [
        "第三个 hard part。**同库用本地事务；跨服务不要假装还在同一个 COMMIT。** 隔离级别（RC / RR / Serializable）知道名字即可——**禁止当本章脊柱**。白板默认：单库单片 ACID；跨库跨服务换 Outbox 和 Saga。",
        "",
        "**Dual-write：** 一次请求既写 DB 又发 MQ（或写第二个库）。先写库再 send：进程在 send 前崩溃 → 事件丢了。先 send 再写库：库回滚 → 外面已经有幽灵事件。两步不是一个原子。",
        "",
        d2(`
grid-columns: 2
bad: {
  label: "2PC 常否"
  class: groupBad
  grid-columns: 2
  a.class: bad
  a: "阻塞"
  b.class: bad
  b: "协调者"
}
ok: {
  label: "Outbox 默认"
  class: groupOk
  grid-columns: 2
  c.class: ok
  c: "同库事务"
  d.class: ok
  d: "CDC 发出"
}
`),
        "",
        "**2PC / XA 面试为什么常被否（用户路径）：**",
        "",
        "1. **阻塞。** 参与者投票 yes 之后进入 prepared，锁还拿着，等协调者 commit/abort。协调者此时崩溃，参与者 **in-doubt**：不能单方面提交也不能丢弃，直到协调者回来。用户请求还挂在超时上。",
        "2. **协调者。** 多一轮网络、所有人必须同时活着。支付渠道、短信网关 **不参加你的 XA**。Ch24：不要 2PC 到 PSP。",
        "3. **和重试打架。** 用户刷新、网关重试，2PC 的「刚好卡在 prepared」比本地事务 + 幂等难讲。",
        "",
        "库 **内部** 可以用 2PC / Percolator（NewSQL 跨分片）——那是引擎的事。面试否的是：**你在业务图上画一个协调者去锁订单库、支付渠道、库存服务。** 那是 red flag。",
        "",
        "**Outbox（2026 双写默认）：** 业务行和 `outbox` 行 **同一个本地事务** 写入。提交成功 = 事件至少已经落在库里。独立投递器再发到 MQ：轮询 outbox，或 **CDC** 读 WAL / binlog（少碰业务表）。发成功再标已投递或靠日志位点推进。消费者 **必须幂等**（Relay 会至少一次）。同聚合要保序时，用聚合 ID 当消息 key（进哪一分区是 Ch20，这里只点「别打乱同一订单」）。",
        "",
        d2(`
direction: right
app.class: go
app: "App"
db.class: store
db: "DB+Outbox"
cdc.class: step
cdc: "CDC"
mq.class: ok
mq: "MQ"
app -> db -> cdc -> mq
`),
        "",
        "本图引用：Ch18 订单副作用 · Ch24 入账后通知订单 · Ch20 消息投递（at-least-once，本章不展开积压）",
        "",
        "CDC 是「从日志捕获变更」：DB 仍是真相源。事件溯源是「事件当真相」——**不是同一句话**，点到就停。不要报 DMS / 某云迁移 SKU。",
        "",
        "**Saga：** 长流程拆成多个 **本地事务**，每步配 **补偿**（不是 DB rollback 跨服务）。1987 论文针对长事务占锁；2026 面试用在下单 → 扣款 → 占库存这类跨服务链。Ch18 关单还库存、关单后付款则退款，就是补偿，不必画编排引擎。",
        "",
        d2(`
grid-columns: 2
cho: {
  label: "协同"
  class: group
  grid-columns: 2
  a.class: step
  a: "事件链"
  b.class: step
  b: "无中心"
}
orc: {
  label: "编排"
  class: groupOk
  grid-columns: 2
  c.class: ok
  c: "中心指挥"
  d.class: ok
  d: "补偿集中"
}
`),
        "",
        "| | **协同 choreography** | **编排 orchestration** |",
        "|---|---|---|",
        "| 谁推进 | 每步做完发事件，下游自己订 | 一个编排器按序调每步 |",
        "| 补偿 | 散落在各服务的订阅里 | 编排器倒序调补偿 |",
        "| 适合 | 步少、边界清晰、要解耦 | 步多、要可视化、失败策略集中 |",
        "| 配套 | 事件不丢 → **Outbox** | 仍要每步本地事务；别把编排器当 2PC |",
        "",
        "一张格子就够。不要开工作流引擎购物。短冻结（扣款预留）可以点 **TCC** 一句：Try 占资源、Confirm 提交、Cancel 释放；长流程仍 Saga。Ch24 账本正确性不靠 Saga 教科书。",
        "",
        d2(`
direction: right
ord.class: go
ord: "下单"
pay.class: step
pay: "扣款"
ship.class: ok
ship: "发货"
ord -> pay -> ship
`),
        "",
        "成功链就三片叶子。失败则反向补偿（发货前失败 → 退款 / 释放库存），画在嘴里，不要再挂一条不等长的腿。",
        "",
        "面试怎么说：",
        "",
        "> 「跨服务我不用 2PC：会阻塞，渠道也不进 XA。双写 Outbox + CDC。长链路 Saga，步少协同、步多编排。同库能包进一个事务就不要拆。」",
        "",
        "**red flag：** 第一张图 XA 到 PSP；Outbox 却在事务外 send；Saga 当 BPM 产品演示；把隔离级别表背成 20 分钟。",
      ].join("\n"),
    },
    {
      id: "sec-choose",
      heading: "选型表",
      secNum: "41.5",
      related: ["ch06", "ch08", "ch18", "ch24"],
      body: [
        "白板先钉默认，再谈共识引擎。三套都画上是 over-engineering。",
        "",
        "| 场景 | 默认 | 不要 |",
        "|---|---|---|",
        "| 单库读写扩展读 | **Primary 写 + 异步 Replica 读** | 假装读 Replica 等于刚写完 |",
        "| 账本 / 刚写要立刻读到 | 读 Primary，或 **同步 / 半同步** | 跨洲同步当免费 |",
        "| 主挂切换 | 先问 lag；异步承认 RPO；**fencing 旧主** | 「有副本就不丢」 |",
        "| AP KV、无单主 | **Ch06 quorum**，不是本章主从 | 把 N/W/R 套在 Primary 上 |",
        "| 锁 / 配置多数派 | **Raft**（Ch08 etcd） | 用异步主从当锁权威 |",
        "| 表超过单机 | 先 **分片键**（基数、热点、查询对齐） | 按 status 切；跨片 join 当默认 |",
        "| 同库多表 | **本地事务** | 为「微服务洁癖」拆开再 2PC 拼回来 |",
        "| 写库 + 发事件 | **Outbox + CDC** | 请求线程里裸 send |",
        "| 跨服务长流程 | **Saga** + 补偿；步少协同、步多编排 | 用户路径 XA |",
        "| 和支付渠道 | 本地入账 + 幂等 + 对账（Ch24） | 2PC 到渠道 |",
        "",
        "Raft 只收口播，不在这张表展开实现：",
        "",
        d2(`
direction: right
cli.class: go
cli: "Client"
ldr.class: step
ldr: "Leader"
maj.class: ok
maj: "多数派"
cli -> ldr -> maj
`),
        "",
        "**面试用哪一句：** 客户端打 **leader**；条目复制到 **多数派** 才算 commit；少数派不能擅自当新主带着未提交分叉往前走。etcd、很多 NewSQL 的 Raft 组是这个模型。主从异步 **不是** Raft。不要默写选举超时、日志匹配证明、C++ 伪代码。",
        "",
        "默认口播再收一次：",
        "",
        "> 「主从先问同步还是异步。分片先问键。跨服务 Outbox / Saga。2PC 留给引擎内部，不留给用户请求。」",
      ].join("\n"),
    },
    {
      id: "sec-papers",
      heading: "论文与经典系统",
      secNum: "41.6",
      related: ["ch08", "ch36"],
      body: [
        "M6 要能点名。下面 2 篇必读、2 篇选读。**面试用哪一句**写在表里；不背页码，不把 Raft 当白板作业。",
        "",
        d2(`
direction: right
sg.class: go
sg: "Sagas 87"
hl.class: step
hl: "Helland 07"
rf.class: ok
rf: "Raft 14"
sg -> hl -> rf
`),
        "",
        "时间线只帮助记忆：先有长事务拆成可补偿的步骤，再有「大规模别靠分布式事务」的工程意见，再有可讲清楚的多数派复制日志。不是说你要实现三套。",
        "",
        "| | 文献 | 必读 / 选读 | 面试用哪一句 |",
        "|---|---|---|---|",
        "| 1 | **Ongaro & Ousterhout**，USENIX ATC 2014，*In Search of an Understandable Consensus Algorithm* | 必读 | Raft = 复制日志上的共识。**leader** 接写；条目在 **多数派** 上才 commit。为了比 Paxos 好讲，拆成选举 / 日志复制 / 安全。面试停在这一句；etcd 用它，不要默写论文算法 |",
        "| 2 | **Garcia-Molina & Salem**，ACM SIGMOD 1987，*Sagas* | 必读 | 长事务拆成一串可交错的本地事务；要么做完，要么跑 **补偿** 修正部分执行。2026 跨服务流程用这个名字，不是 2PC 的替代证明 |",
        "| 3 | **Helland**，CIDR 2007，*Life beyond Distributed Transactions: an Apostate's Opinion* | 选读 | 规模上去之后，跨实体的分布式事务经常被放弃；改成 **小实体上的本地事务 + 消息**。用来支撑「用户路径否 2PC」，不是骂事务无用 |",
        "| 4 | **Gray**，1978，*Notes on Data Base Operating Systems*（LNCS 60） | 选读 | 2PC / WAL / 锁的经典出处。面试用来解释 **prepared 阻塞**：协调者消失时参与者 in-doubt。知道来历即可，不要把 1978 当 2026 默认架构 |",
        "",
        "Transactional Outbox 是微服务里的 **模式**（业务 + outbox 同事务，再 CDC / Relay 发出），不是一篇同名 NSDI。CDC 是读事务日志的工程做法。两者靠机制得分，不要编会议论文。",
        "",
        "经典系统只当钉子：MySQL / Postgres 主从 → 本节复制；Cassandra 无主 → **Ch06**；etcd Raft → **Ch08**；Kafka 分区与 ISR → **Ch20**。Spanner / TiDB 内部可以跨分片提交——点「引擎可以，业务图不要画 XA 到渠道」就停。",
      ].join("\n"),
    },
    {
      id: "sec-used",
      heading: "哪些设计题会用到",
      secNum: "41.7",
      related: ["ch06", "ch18", "ch20", "ch24", "ch08", "ch02"],
      body: [
        "主线先做题，卡壳再跳进本章。回链不是把 M6 读完再开写。",
        "",
        "| 章 | 会用到哪一句 |",
        "|---|---|",
        "| **Ch02** 扩展 | 加 Replica 分担读；跨机房复制付 RTT；按数据选同步还是异步 |",
        "| **Ch05** 环 | 键路由；本章补「选哪个列当键」 |",
        "| **Ch06** KV | 无主 quorum；failover / 主从拓扑在本章。不要把 LWW 搬回来 |",
        "| **Ch08** 锁 | 正确性锁走 Raft 多数派；异步主从当锁会在 failover 丢锁 |",
        "| **Ch11** Feed | timeline 可读落后 Replica；fan-out 不必强同步 |",
        "| **Ch12** 聊天 | 会话按 `conv_id` 分片；热群是热点键 |",
        "| **Ch18** 订单 | 同库 CAS 预扣；副作用 **Outbox**；Saga 只点补偿，不画引擎 |",
        "| **Ch20** MQ | 和 DB 同事务 → Outbox 再 produce；分区课在那边 |",
        "| **Ch21** 秒杀 | 热 SKU 是分片热点；预扣仍要能回到权威行 |",
        "| **Ch24** 支付 | 入账本地事务；**不 2PC 到渠道**；Outbox 通知订单 |",
        "| **Ch36** CAP | 同步复制 = Else 买 C；异步 = 买 L。主从 failover 不是 CAP 海报 |",
        "| **Ch37** 存储 | 单机引擎选完才谈复制与分片 |",
        "| **Ch42** 消息弹性 | at-least-once、积压、重试；本章只保证事件从库里出来 |",
        "| **Ch45** DDD | 聚合边界 ≈ 尽量同片；领域事件常走 Outbox |",
        "",
        "短链、通知、评论：读路径可以 Replica；**计数扣减、未读权威** 问清能不能 stale。",
      ].join("\n"),
    },
    {
      id: "sec-2026",
      heading: "2026 vs 笔记 / 原书",
      secNum: null,
      related: [],
      body: [
        "<details>",
        "<summary>原书 / 笔记当时怎么讲 · 模式目录和云迁移进这里</summary>",
        "",
        "笔记对应 AWS 书架构模式章：CDC 四种实现、Pub-Sub、编排变体、Saga 定义一句、Outbox 一句、再加一串云服务。**那不是本章正文。** 2026 上场只带主从 lag、分片键、Outbox/CDC、Saga 一格、2PC 否决理由。",
        "",
        "| 原书 / 笔记 | 现在怎么答 |",
        "|---|---|",
        "| 复制 = 多副本口号 | **异步 vs 同步 + lag vs failover** |",
        "| 分片只说水平切 | **键：基数、热点、禁止默认跨片 join** |",
        "| 2PC 当跨服务标准答案 | **用户路径常否**；阻塞 + 协调者 + 渠道不参加 |",
        "| Outbox 一句带过 | **双写默认**；同事务 + CDC/Relay |",
        "| Saga 只给定义 / 工作流 SKU | **协同 vs 编排一张格子**；补偿；不巡礼 Temporal |",
        "| CDC = 云 DMS 购物 | 机制：读 WAL；不报型号 |",
        "| Kafka 分区写进本章 | **Ch20** |",
        "| Dynamo / 向量时钟 | **Ch06**；生产冲突默认 LWW 已在那边 |",
        "| 隔离级别长表 | 点到同库 ACID；不当脊柱 |",
        "| Raft 全文 / 实现 | **多数派 + leader** 一句 |",
        "| NewSQL / Aurora 目录 | 引擎内部可以跨片提交；业务图仍不画 XA 到 PSP |",
        "",
        "正文第一答案用现在这套。折叠只防止你把模式全书和云迁移搬上白板。",
        "",
        "</details>",
      ].join("\n"),
    },
    {
      id: "sec-traps",
      heading: "追问陷阱",
      secNum: null,
      related: ["ch06", "ch18", "ch20", "ch24"],
      body: [
        "1. **有副本，主挂了就不丢数？** → 异步看 lag。落后副本提升会丢已 200 的写。",
        "2. **为什么读 Replica 是旧的？** → 复制落后。read-your-writes 打 Primary 或等位点。",
        "3. **同步复制的代价？** → 写延迟叠 RTT；副本挂了写可能停。PACELC Else。",
        "4. **failover 还要说什么？** → fencing 旧主，防 split-brain。",
        "5. **这和 Ch06 quorum 有何不同？** → 那边无主 + N/W/R；这边单 Primary。别混口播。",
        "6. **分片键怎么选？** → 高基数、均匀、对齐查询。",
        "7. **为什么不能按 status 切？** → 低基数，热点片。",
        "8. **跨分片 join？** → 不当默认。改键、投影表，或接受 scatter-gather。",
        "9. **Kafka 分区是不是分片？** → 日志并行在 Ch20。本章是表怎么切。",
        "10. **为什么否 2PC？** → 协调者崩溃阻塞 prepared；渠道不进 XA；用户超时。",
        "11. **Outbox 解决什么？** → 写库和发事件的原子性。同事务落 outbox，再 CDC。",
        "12. **CDC 和事件溯源？** → CDC：DB 是真相。溯源：事件是真相。",
        "13. **Saga 两种？** → 协同事件链 vs 编排中心指挥。一张格子。",
        "14. **Saga 是不是 2PC？** → 不是。本地提交 + 补偿，最终一致。",
        "15. **Raft 面试哪一句？** → leader 写，多数派 commit。不是主从异步。",
        "16. **Sagas 哪一年？** → Garcia-Molina & Salem，**SIGMOD 1987**。",
        "17. **Raft 哪一篇？** → Ongaro & Ousterhout，**USENIX ATC 2014**。",
        "18. **下一步为什么是消息弹性？** → 事件出库之后的投递、积压、熔断在 **Ch42**。",
      ].join("\n"),
    },
    {
      id: "sec-next",
      heading: "下一步",
      secNum: null,
      related: ["ch42"],
      body: [
        "合上页，用 20 秒口播走一遍：主从先问异步还是同步；lag 和 failover 绑在一起；分片键看基数和热点；跨服务 Outbox + CDC，长链 Saga；2PC 面向用户常被否；Raft 一句多数派。能把订单 / 支付 / KV 分别放回 Ch18 / Ch24 / Ch06，这一章就过关。",
        "",
        "下一章 **Ch42 · 消息、弹性、容器心智**：投递语义、积压、熔断降级；K8s 心智。Kafka 题在 Ch20，本章不再展开分区。协议不再展开。",
        "",
        "自测：左列复制延迟 vs failover，中列分片键，右列 2PC 否决 + Outbox/Saga。不要把隔离级别表和云 DMS 默写回去。",
      ].join("\n"),
    },
  ],
  reviewMd: `# Ch41 · 记忆闪卡

| # | 正面 | 背面 |
|---|---|---|
| 1 | 20 秒怎么开口？ | Primary 写、Replica 跟；先问异步/同步与 lag。分片键：基数、热点、少跨片 join。跨服务 Outbox+CDC；长链 Saga。用户路径不 2PC。Raft：leader + 多数派。 |
| 2 | 三个 hard part？ | ① 复制延迟 vs failover ② 分片键怎么选 ③ 2PC 否决 + Outbox/Saga 默认。 |
| 3 | 异步复制 200 保证什么？ | Primary 已提交。**不保证** Replica 已有。 |
| 4 | replica lag 读到什么？ | 写后立刻读 Replica → **stale**。read-your-writes 打 Primary。 |
| 5 | 异步 failover 丢不丢数？ | 提升落后副本 → 丢 lag 窗口内已确认写（RPO>0）。 |
| 6 | 同步复制换什么？ | 副本已有这次写、failover 更稳；付写延迟 / 副本挂则写停。 |
| 7 | failover 除了提升还说什么？ | **fencing** 旧主，防 split-brain。 |
| 8 | 主从 vs Ch06 quorum？ | 主从单 Primary；Ch06 无主 + N/W/R。不要混。 |
| 9 | 分片键三条？ | **高基数**、**均匀避热点**、**查询落在一片**；跨片 join 不当默认。 |
| 10 | 为什么不按 status 切？ | 低基数 → 热点片。 |
| 11 | 单调 ID + range 分片？ | 新写砸在最新一片 → 热点。 |
| 12 | 2PC 为何常被否？ | **阻塞**（prepared 等协调者）+ **协调者**；渠道不参加 XA。 |
| 13 | dual-write 坑？ | 先库后 MQ 丢事件；先 MQ 后库出幽灵。 |
| 14 | Outbox 怎么原子？ | 业务行 + outbox **同一本地事务**；CDC/Relay 再发；消费者幂等。 |
| 15 | CDC 一句？ | 从 WAL/binlog 捕获变更；DB 仍是真相。不是云 DMS 课。 |
| 16 | Saga 是什么？ | 本地事务链 + **补偿**。协同=事件链；编排=中心指挥。 |
| 17 | Sagas 论文？ | Garcia-Molina & Salem，**SIGMOD 1987**，*Sagas*。 |
| 18 | Raft 面试一句？ | **leader** 接写；**多数派** 才 commit。ATC **2014**，Ongaro & Ousterhout。 |
| 19 | 订单/支付怎么用？ | Ch18 同库 CAS + Outbox。Ch24 不 2PC 到渠道。 |
| 20 | 下一步？ | **Ch42 消息、弹性、容器心智**。Kafka 分区 → Ch20。 |`,
});
