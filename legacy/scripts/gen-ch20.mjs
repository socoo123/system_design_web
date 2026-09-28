import { writeChapter } from "./write-chapter.mjs";

const d2 = (src) => {
  const body = src.trim();
  const sized = /style\.font-size/.test(body) ? body : `style.font-size: 12\n${body}`;
  return "```d2\n" + sized + "\n```";
};

writeChapter({
  id: "ch20",
  num: "20",
  title: "分布式消息队列",
  kind: "case",
  relatedChapters: ["ch42", "ch41"],
  sections: [
    {
      id: "intro",
      heading: "",
      secNum: null,
      related: [],
      body: [
        "> **预计**：50–70 分钟 ｜ **前置**：事务/Outbox Ch41；弹性 Ch42（可后读）",
        "> **目标**：Kafka 分区、消费者组、ISR、exactly-once、KRaft。不是 Rabbit 手册，不是弹性全书。",
        "",
        "邻近服务把「附近怎么查」讲完；这题换成 **事件怎么可靠传**。默认是 **设计消息队列 / Kafka 风格日志**：append-only log、按分区并行、消费者组各自记 offset。不是 RabbitMQ 五种 exchange 全书，不是 Ch42 投递语义 / 积压 / 熔断专章，不是 Flink 作业。",
        "",
        "系统看起来就是 Producer 丢一条、Consumer 拉一条。三个 hard part：**分区与顺序**、**消费者组与再均衡**、**ISR / EOS / KRaft 开口**。面试官要看的不是你能不能背某厂日消息量、不是 AMQP 路由百科、不是流计算拓扑，而是：顺序保证到哪一层、组怎么扩、副本怎样才算不丢、exactly-once 贵在哪、协调面还要不要 ZooKeeper。",
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
        "> 「设计 Kafka 风格日志，不是 Rabbit 五种 exchange，不是弹性全书。三个 hard part：分区与顺序、消费者组再均衡、ISR / EOS / KRaft。顺序只在分区内，同 key 进同一分区。组内一分区一个消费者。复制靠 ISR，`acks=all`。exactly-once 贵，白板默认 **at-least-once + 消费幂等**。协调面 2026 默认 **KRaft**，ZooKeeper 进折叠。积压和重试风暴点到 Ch42；和 DB 同事务走 Outbox（Ch41）。」",
        "",
        "然后按 4 步走，别一上来画 Schema Registry、Connect、Flink 或五种 exchange。",
        "",
        d2(`
direction: right
s1: "1 澄清估算"
s2: "2 高层日志"
s3: "3 分区组"
s4: "4 ISR EOS"
s1 -> s2 -> s3 -> s4
`),
        "",
        "| 时间盒 | 你在做什么 |",
        "|---|---|",
        "| 3–10 min | 澄清：日志 vs 消费即删、保序范围、留存、语义、几个独立组 |",
        "| 接着 2 min | back-of-envelope：日消息量教学假设；怕的是热分区和积压，不是编某厂 QPS |",
        "| 10–15 min | 高层：Producer → Broker log → Consumer；KRaft 管元数据 |",
        "| 10–25 min | deep dive：key→分区、组再均衡、ISR + EOS 开口 + KRaft |",
        "| 3–5 min | wrap-up：3 个 bottleneck（热 key、再均衡停消费、acks 与 ISR 不一致） |",
        "",
        "**red flag：** 还没问范围就画 Rabbit exchange / Flink / 熔断降级全书；承诺全局 FIFO；把 exactly-once 说成免费默认；2026 仍把 ZooKeeper 当第一张图；编造 LinkedIn 日万亿当自己的事实。那是 over-engineering，或把邻章整章搬进来。",
      ].join("\n"),
    },
    {
      id: "sec-clarify",
      heading: "澄清问题清单",
      secNum: "20.1",
      related: [],
      body: [
        "没问清楚就画图 = Jimmy。消息队列这题 5–7 个问题就停，其余自己假设写白板。**第一问必须是范围。**",
        "",
        "| 你问 | 典型回答 / 你自己的假设 | 它改什么 |",
        "|---|---|---|",
        "| Kafka 风格日志，还是传统 MQ（消费即删）？ | **可重放的分区日志** | 不是五种 exchange；Rabbit 点到即停 |",
        "| 要全局顺序还是分区内顺序？ | **按 key 分区内 FIFO** | 全局顺序 = 单分区，吞吐崩 |",
        "| 留存多久？可重放吗？ | 教学：**约 7 天**；消费不删 | 磁盘按留存切 segment |",
        "| 交付语义？ | **at-least-once**；EOS 开口 | 消费必须幂等；事务另说 |",
        "| 几个独立消费者组？ | **≥2**（业务 + 审计一类） | 每组自己的 offset |",
        "| 日消息大概多少？ | 教学：**约 1e8 条/天** | 估分区和磁盘，不是某厂内部数 |",
        "",
        "面试官说「你定」时，把假设写上去：",
        "",
        "> 「我假设：Kafka 风格分区日志，不是 Rabbit 手册。顺序按 message key 保分区内 FIFO，不保全局。留存约 7 天，可重放。默认 at-least-once，消费者按业务键幂等。复制 RF=3、`acks=all`、ISR。协调面 KRaft。先按这个画，不对你打断我。」",
        "",
        "问到五种 exchange、延迟队列插件、Flink 窗口、熔断重试风暴：**承认差别，立刻收口。** 「AMQP 路由是另一类 broker；积压、毒消息、熔断是 Ch42。本场把分区、消费者组、ISR 和 KRaft 讲透。」问到和订单同事务：Outbox / CDC 点到 Ch41，不要改成 CDC 平台题。问太多超过 10 分钟也是 red flag。黄金线还是那条：**问关键问题 → 自己给假设 → 写白板 → 继续。**",
      ].join("\n"),
    },
    {
      id: "sec-estimate",
      heading: "粗估",
      secNum: "20.2",
      related: ["ch03"],
      body: [
        "公式细节在 Ch03。这里只要数量级，证明你知道 **这题 bottleneck 是热分区、再均衡和副本确认，不是「编一个某厂峰值」。** 下面用白板做**教学假设**，不是某厂内部数字，也不是公开的「日万亿条」当自己的 QPS。",
        "",
        "假设：内部事件总线约 **1e8 条/天**；均条约 **1 KB**；峰值约为日均的 **5–10 倍**；留存 **7 天**；副本 **RF=3**。压缩和批处理会再降网络，粗估先按未压缩。",
        "",
        "| 项 | 怎么估 | 量级（教学假设） |",
        "|---|---|---|",
        "| 日均写入 | 1e8 / 86400 | **约 1e3 QPS**；峰值 **约 1e4** |",
        "| 日存储（未压缩） | 1e8 × 1 KB | **约 100 GB/天** |",
        "| 7 天 × RF=3 | 100 GB × 7 × 3 | **约 2 TB** 量级 |",
        "| 并行度 | 组内并行 ≤ 分区数 | 预分 **几十到几百**；热 key 仍挤在一区 |",
        "| 积压 | lag = log end − committed | 加实例只能加到分区数；再多是空转 |",
        "",
        "日志看起来「磁盘随便写」。贵的是：**同一个 key 打满一个分区**，以及 **再均衡期间整组停消费、ISR 收缩导致 `acks=all` 写不进去**。把入口画成百万 QPS 却不讲分区和 ISR，是编数字，不是估算。",
        "",
        "**面试怎么说：**",
        "",
        "> 「亿条/天白板：日均千级 QPS，峰值万级。磁盘按留存和副本估 TB 级。真正怕的是热分区和组再均衡。不会拿某厂日消息量当内部数。」",
        "",
        "常见算错：把公开的「日万亿」当成自己的事实 QPS；或只报平均、假装所有 key 均匀。教学用数量级，并标**假设**。",
      ].join("\n"),
    },
    {
      id: "sec-arch",
      heading: "高层架构",
      secNum: "20.3",
      related: ["ch42", "ch41"],
      body: [
        "从左到右只画 **一条数据面**：Producer → Broker（分区 log）→ Consumer。不要在这张图上扇出 Schema Registry、Connect、Streams、Flink、五种 exchange、多 Region。Broker 持有 **append-only 分区**；消费者组各自在内部 topic 记 offset。**KRaft controller quorum** 管元数据（topic、分区 leader、ISR），不走业务字节。面试官 buy-in 之后再拆 key 怎么路由、组怎么再均衡。",
        "",
        d2(`
direction: right
prod.class: go
prod: "Producer"
brk.class: store
brk: "Broker"
cons.class: step
cons: "Consumer"
prod -> brk -> cons
`),
        "",
        "**本图引用**：Ch42 消息、弹性 · Ch41 复制、分片、事务",
        "",
        "**写路径：** 客户端库按 key 选分区、攒 batch（`linger.ms` / `batch.size`）→ 打到该分区 **leader** → leader 追加 WAL → follower 进入 ISR 后提交 **high watermark** → `acks=all` 才回成功。和 DB 必须同事务的事件：**先写 Outbox 再 produce**（Ch41），不要在请求线程里「先写库再裸 send」当唯一方案。CDC 从 binlog 进 topic 点到即可，不是本章。",
        "",
        "**读路径：** 消费者加入 **group** → 分到若干分区 → 从 committed offset **pull**（长轮询）→ 处理 → 提交 offset。消费不删除日志；过期靠留存删 segment。另一组可以从头重放。",
        "",
        d2(`
shape: sequence_diagram
prod: "Producer"
lead: "Leader"
foll: "Follower"
cons: "Consumer"
prod -> lead: "produce batch"
lead -> foll: "replicate"
lead -> prod: "ack commit"
cons -> lead: "fetch offset"
`),
        "",
        "吞吐靠 **顺序写 + 批 + pagecache / sendfile**，不是「消息必须进内存库」。延迟靠小批；日志聚合用大批。高层不要展开零拷贝课。",
        "",
        "积压、毒消息、重试风暴、熔断降级：**点到 Ch42**，本场不写成弹性百科。高层图到这里就该停，问一句：「方向 OK 吗？接下来挖分区和顺序，然后是消费者组再均衡，最后 ISR、exactly-once 和 KRaft。」",
        "",
        "**面试怎么说：**",
        "",
        "> 「Producer 打 Broker 的分区 log，Consumer 按组 pull。和库一致走 Outbox。协调面 KRaft，数据面不画 ZooKeeper。」",
      ].join("\n"),
    },
    {
      id: "sec-partition",
      heading: "深入 · 分区与顺序",
      secNum: "20.4",
      related: ["ch41"],
      body: [
        "第一个 hard part。日志的并行单元是 **partition**，不是 topic、也不是「整条总线一条 FIFO」。2026 白板第一句：**顺序只在分区内；同 key 哈希进同一分区。没有全局顺序。**",
        "",
        d2(`
direction: right
key.class: go
key: "message key"
hsh.class: step
hsh: "hash % N"
prt.class: store
prt: "partition"
ord.class: ok
ord: "FIFO offset"
key -> hsh -> prt -> ord
`),
        "",
        "**本图引用**：Ch41 复制、分片、事务",
        "",
        "**topic / partition / offset：** topic 是逻辑流；每个分区是一条 append-only 文件（切 segment）。写入只追加；位置是单调 **offset**。无 key 时客户端粘滞批到某一区（吞吐），**不保跨消息顺序**。有 key：`hash(key) % N`（Kafka 默认 murmur2）→ 同 key 同区 → **该 key 的事件 FIFO**。",
        "",
        "**不要轻易加分区。** N 变了，几乎所有 key 的路由都变，原先同区的顺序被拆到新区。Kafka 允许加、不允许减。2026 默认：**创建时预分足够多分区**（大于近期消费者数），扩吞吐优先 **加消费者**，不动 N。热点 key（大用户、热 SKU）再怎么加分区也挤在一区——这是分区模型的 trade-off，不是再哈希一次就能消失。",
        "",
        "| | 分区内 FIFO | 全局 FIFO | 无序 |",
        "|---|---|---|---|",
        "| 做法 | 同 key 同区 + 组内单消费者 | **单分区** | 无 key / 多区乱消费 |",
        "| 吞吐 | 随分区数水平加 | 等于一台 leader | 最高 |",
        "| 面试 | **默认承诺** | 只有审计总账才考虑 | 日志聚合可接受 |",
        "",
        "组内若两个消费者读同一分区，顺序必乱——所以 Kafka **一分区同时只派给组内一个成员**。这句接到下一节。分片键选业务顺序键（`user_id` / `order_id`），不要用随机 UUID 还承诺「用户事件有序」。",
        "",
        "**面试怎么说：**",
        "",
        "> 「顺序按 key 到分区。全局顺序就是单分区，别随口答应。分区数预留够，别为了扩容改 N 把顺序打乱。」",
        "",
        "trade-off：多分区分摊吞吐和磁盘文件，换来跨区无序、热 key 仍单区、改 N 破坏亲和。为「绝对全局序」把整个 topic 收成一区，是把消息队列做成单机队列。",
      ].join("\n"),
    },
    {
      id: "sec-group",
      heading: "深入 · 消费者组与再均衡",
      secNum: "20.5",
      related: ["ch42"],
      body: [
        "第二个 hard part。**consumer group** 同时表达点对点和发布订阅：同一组抢分区 = 一条消息组内只处理一次；**不同组各有 offset** = 同一日志被独立重放。组内并行上限 = 分区数；消费者多于分区，多余的 **空闲**。",
        "",
        d2(`
grid-columns: 2
ga: {
  label: "组 billing"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "P0 → C1"
  b.class: ok
  b: "P1 → C2"
}
gb: {
  label: "组 audit"
  class: group
  grid-columns: 2
  c.class: step
  c: "P0 → C3"
  d.class: step
  d: "P1 → C4"
}
`),
        "",
        "**本图引用**：Ch42 消息、弹性",
        "",
        "**怎么消费：** 默认 **pull**。消费者控速、好攒批；空日志用长轮询，不要空转打满 broker。Push 低延迟，但慢消费者会被灌爆——白板第一答案仍是 pull。offset 提交在处理后 = **at-least-once**（崩溃会重放）；先提交再处理 = at-most-once（可能丢）。自动提交好演示、生产容易在处理失败时丢或重，面试说清选手动。",
        "",
        "**再均衡：** 成员加入 / 离开 / 心跳超时，**group coordinator**（某台 broker，按 group id 定位）重分配分区。经典协议会 **stop-the-world**：全组暂停 fetch，直到分配完成。大组、频繁扩缩就是可见卡顿。2026 能开口：**cooperative / incremental** 只挪受影响分区；Kafka **4.0** 的新一代协议（KIP-848）服务端已就绪，客户端 **`group.protocol=consumer` opt-in**——别把 KIP 号讲成一章，别假装所有老客户端已经默认增量。",
        "",
        "积压：看 **lag**。水平加实例只能加到分区数；还不够就 **加分区**（接受 key 重映射）或拆 topic。消费者里同步 RPC + 无限重试会打出 **retry 风暴**——熔断、隔离、死信是 **Ch42**，本场点到即停。Share group（Kafka 4.0 EA，队列式抢单条）**不是白板默认**；仍画 consumer group。",
        "",
        "**面试怎么说：**",
        "",
        "> 「一组一分区一个消费者保序。多组各自 offset。再均衡经典会停消费；2026 开口增量协议。积压先看分区数，重试风暴去 Ch42。」",
        "",
        "trade-off：静态分区分配实现简单、顺序清晰，换来扩缩和滚动发布会触发再均衡。把每个请求当独立队列、放弃分区顺序，是另一道题（share group / 传统 MQ），不要中途改题。",
      ].join("\n"),
    },
    {
      id: "sec-isr",
      heading: "深入 · ISR、exactly-once 与 KRaft",
      secNum: "20.6",
      related: ["ch42", "ch41"],
      body: [
        "第三个 hard part 三句话开口：**ISR 决定什么时候算写成功、leader 从哪选；exactly-once 贵；控制面 2026 是 KRaft。** 不要把弹性、事务消息、CDC 写成邻章。",
        "",
        d2(`
direction: right
prod.class: go
prod: "Producer"
lead.class: step
lead: "Leader"
isr.class: store
isr: "ISR ack"
hwm.class: ok
hwm: "HWM"
prod -> lead -> isr -> hwm
`),
        "",
        "**本图引用**：Ch42 消息、弹性 · Ch41 复制、分片、事务",
        "",
        "**复制与 ISR：** 每分区 RF 常见 **3**。Producer 只写 leader；follower fetch。**ISR** = 在 `replica.lag.time.max.ms` 内跟上的副本。`acks=all`（Kafka 3.0+ 默认）要等 **当前 ISR** 都追加；消费者只读到 **high watermark**，避免读到可能被截掉的脏尾。`min.insync.replicas=2`：ISR 缩到 1 时，`acks=all` 会拒写——用可用性换不丢。leader 挂了 **只从 ISR 选**；打开 unclean leader election 可能丢已确认数据，白板默认关掉。ELR（KIP-966，4.0 preview）面试点到「ISR 里再筛可安全当 leader 的集合」即可，不展开。",
        "",
        d2(`
grid-columns: 2
prac: {
  label: "实践默认"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "at-least-once"
  b.class: ok
  b: "消费幂等"
}
eos: {
  label: "EOS 昂贵"
  class: group
  grid-columns: 2
  c.class: step
  c: "幂等 producer"
  d.class: step
  d: "事务"
}
`),
        "",
        "**exactly-once：** 幂等 producer（PID + 分区序号，**3.0+ 默认打开**，要求 `acks=all`）只保证 **同会话、同分区不因重试双写**。跨分区、consume–process–produce、把 offset 和输出绑在一起，才要 **transactional id + 事务协调器**，消费者 `read_committed`。这套端到端 EOS **只在 Kafka 闭环里**；写出到外部 DB 仍要业务幂等或 Outbox（Ch41）。面试：**EOS 贵（延迟、吞吐、运维），实践默认 at-least-once + 幂等消费者**；别把「Kafka 支持 exactly-once」说成所有链路免费正好一次。",
        "",
        d2(`
grid-columns: 2
kraft: {
  label: "KRaft · 默认"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "Raft 仲裁"
  b.class: ok
  b: "元数据日志"
}
zk: {
  label: "ZK · 原书折叠"
  class: group
  grid-columns: 2
  c.class: warn
  c: "外置协调"
  d.class: warn
  d: "4.0 已移除"
}
`),
        "",
        "**KRaft：** 控制器法定人数用 Raft 写内部 `__cluster_metadata`；broker **pull** 增量元数据。生产常见 **3 或 5 个专职 controller**，不要和重磁盘 broker 混部当第一答案。**Kafka 4.0（2025-03）起不再提供 ZooKeeper 模式**；3.x 还在 ZK 上必须先迁 KRaft 再上 4.x。原书全程 ZK：放折叠，不当 2026 第一张图。",
        "",
        "**面试怎么说：**",
        "",
        "> 「`acks=all` 等 ISR，新 leader 只从 ISR 选。EOS 是幂等 producer 加事务，贵；默认 at-least-once 加消费幂等。控制面 KRaft，不再画 ZooKeeper。」",
        "",
        "trade-off：ISR 越大、`acks=all` 越稳、延迟越高；缩 ISR 能写但弱化耐久。事务保 Kafka 内原子，换来协调器和 `read_committed` 延迟。为「绝对不丢」把 `min.insync` 等于 RF，一台 follower 抖动就会拒写。",
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
        "Xu Vol.2 把 topic/partition、WAL、消费者组、pull、leader/follower 讲完整了，分区保序和批处理仍成立。过时的是 **全程 ZooKeeper**、复制只说「3 副本 + 足够多」、语义只说「可配」、以及把某厂日消息量当背诵。笔记补过 ISR / EOS / KRaft，网页按 2026 默认重排，不把笔记当正文。",
        "",
        "| 原书或笔记 | 现在怎么答 |",
        "|---|---|",
        "| 协调面默认 ZooKeeper / etcd | **KRaft controller quorum**；ZK 仅折叠。Kafka **4.0 已移除 ZK 模式** |",
        "| 复制只讲 leader/follower | **ISR + HWM + `min.insync.replicas`** |",
        "| 交付语义「可配置」 | 开口 EOS = 幂等 producer + 事务；**实践默认 at-least-once + 消费幂等** |",
        "| 幂等 / 事务当 2026 补丁 | 幂等 producer **3.0+ 默认**；事务仍按需 |",
        "| rebalance 只有 stop-the-world | 开口 **incremental / KIP-848 opt-in** |",
        "| 五种 AMQP exchange 可当主图 | **本题 Kafka 日志**；Rabbit 点到 |",
        "| Pulsar 提了没讲 | 存算分离 **一句**；不改成本场主架构 |",
        "| 长留存全本地盘 | **tiered storage** 点到；不讲对象存储专章 |",
        "| 某厂 / LinkedIn QPS 当事实 | **教学假设**；只报数量级 |",
        "| Flink / Streams 作业 | **本场不做** |",
        "",
        "仍成立的骨架：分区是并行与顺序的单位、WAL 顺序追加、组内单分区单消费者、pull + 长轮询。过时的是把 ZooKeeper 画进 2026 主路径，以及把 exactly-once 说成零成本默认。",
        "",
        "</details>",
      ].join("\n"),
    },
    {
      id: "sec-traps",
      heading: "追问陷阱",
      secNum: null,
      related: ["ch42", "ch41"],
      body: [
        "1. **「这是 Rabbit 还是 Kafka？」** → 默认分区日志可重放。五种 exchange 不是本章。",
        "2. **「能保证全局顺序吗？」** → 只能分区内。全局 = 单分区。同 key 同区。",
        "3. **「分区数能随便加吗？」** → 加了 `hash % N` 变，顺序亲和打乱。预分够，扩容先加消费者。",
        "4. **「消费者比分区多？」** → 多余空闲。并行上限是分区数。",
        "5. **「push 还是 pull？」** → 默认 pull + 长轮询。慢消费者不被灌爆。",
        "6. **「rebalance 期间能消费吗？」** → 经典会停。开口 cooperative / 4.0 新协议 opt-in。",
        "7. **「leader 挂了丢不丢？」** → `acks=all` 且只从 ISR 选则已提交的不丢。unclean 选举会丢。",
        "8. **「exactly-once 怎么实现？」** → 幂等 producer + 事务。贵。实践默认 at-least-once + 幂等消费。跨 DB 仍要 Outbox（Ch41）。",
        "9. **「还要 ZooKeeper 吗？」** → **不要当 2026 默认。** KRaft；4.0 起无 ZK 模式。",
        "10. **「积压了怎么办？」** → 看 lag 和分区数。重试风暴、熔断、死信 → **Ch42**。",
        "11. **「为什么用磁盘不当纯内存？」** → 顺序追加 + pagecache，容量和留存。不是 HDD 延迟表。",
        "12. **终图已经很大了还往上堆？** → Registry、Flink、五种 exchange、弹性全书都不是本章。讲透三条 hard part 比画 20 个框得分高。",
      ].join("\n"),
    },
    {
      id: "sec-next",
      heading: "wrap-up 与下一步",
      secNum: null,
      related: ["ch21"],
      body: [
        "收尾不要说完美。三个 bottleneck 口播：",
        "",
        "| bottleneck | 你怎么接 |",
        "|---|---|",
        "| 热 key / 乱承诺全局序 | 分区内 FIFO；同 key 同区；预分 N，别乱加分区 |",
        "| 再均衡停消费 / 实例多于分区 | 组内一区一消费者；开口增量协议；积压看 lag（Ch42） |",
        "| 副本与语义讲不清 | ISR + `acks=all`；EOS 贵；默认 at-least-once；控制面 KRaft |",
        "",
        "自测：合上这一页，用 30 秒开场 + 白板高层，把分区顺序、消费者组、ISR、EOS 贵、KRaft 讲给空气听。ZooKeeper 只放折叠。Outbox 一句到 Ch41。积压和重试不要展开成弹性专章。哪句卡，回哪一节。",
        "",
        "下一道题是 **Ch21 · 酒店预订与秒杀库存**。消息队列是「事件怎么可靠传」；下一题换成库存预扣、幂等和下单尖峰——从 broker 日志回到交易正确性。",
      ].join("\n"),
    },
  ],
  reviewMd: `# Ch20 · 记忆闪卡

| # | 正面 | 背面 |
|---|---|---|
| 1 | 消息队列三个 hard part？ | 分区与顺序；消费者组再均衡；ISR / EOS / KRaft 开口。不是 Rabbit 手册，不是 Ch42 全书。 |
| 2 | 白板默认是什么？ | **Kafka 风格分区日志**（可重放）。不是五种 exchange，不是 Flink。 |
| 3 | 顺序保证到哪？ | **分区内 FIFO**；同 key 同分区。没有全局顺序（除非单分区）。 |
| 4 | 为什么别随便加分区？ | \`hash(key) % N\` 变了，亲和顺序打乱。预分够，扩容先加消费者。 |
| 5 | 消费者组怎么保序、怎么 pub-sub？ | 组内一分区一个消费者。多组各有 offset = 独立重放。 |
| 6 | 消费者多于分区？ | 多余空闲。并行上限 = 分区数。 |
| 7 | 再均衡痛点？ | 经典 stop-the-world。开口 incremental；Kafka 4.0 新协议客户端 opt-in。 |
| 8 | ISR / acks 怎么开口？ | ISR 跟上才算同步；\`acks=all\` 等 ISR；只从 ISR 选 leader；读到 HWM。 |
| 9 | exactly-once 面试怎么说？ | 幂等 producer + 事务，**贵**。实践默认 **at-least-once + 消费幂等**。跨 DB → Ch41。 |
| 10 | 2026 还画 ZooKeeper 吗？ | **不。** 默认 **KRaft**。Kafka 4.0 移除 ZK 模式。ZK 只进折叠。 |
| 11 | 和 DB 怎么一起提交？ | **Outbox / CDC 点到 Ch41**。不要假装 Kafka 事务覆盖外部库。 |
| 12 | 这题最大的 over-engineering？ | 五种 exchange、Flink、假某厂 QPS、EOS 当免费默认、把 Ch42 弹性全书搬进来。 |`,
});
