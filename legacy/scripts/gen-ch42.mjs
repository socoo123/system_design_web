import { writeChapter } from "./write-chapter.mjs";

const d2 = (src) => {
  const body = src.trim();
  const sized = /style\.font-size/.test(body) ? body : `style.font-size: 12\n${body}`;
  return "```d2\n" + sized + "\n```";
};

writeChapter({
  id: "ch42",
  num: "42",
  title: "消息、弹性、容器心智",
  kind: "foundation",
  relatedChapters: ["ch20", "ch25", "ch28", "ch44", "ch41", "ch17"],
  sections: [
    {
      id: "intro",
      heading: "",
      secNum: null,
      related: ["ch20", "ch41", "ch44"],
      body: [
        "> **预计**：90–120 分钟 ｜ **前置**：消息队列 Ch20；Outbox Ch41；治理 Ch44（可后读）",
        "> **目标**：投递语义、积压、熔断降级；K8s 心智。Kafka 题在 Ch20。不去云购物、不写 YAML。",
        "",
        "这是 **M6 第七块基础芯片**，不是又一道 4 步设计题。主线里通知、Feed、订单副作用、网关超时、调度重试都会点到「消息丢不丢、积压怎么办、下游挂了怎么活、进程跑在哪」——本章把 **投递语义、积压与重试风暴、熔断 / 舱壁 / timeout，以及容器与 Pod 的心智**讲透。设计题里只引用。Kafka 的分区、消费者组、ISR、exactly-once 实现、KRaft 是 **Ch20**，这里只回收「语义怎么落地」，不当消息课。拆服务标准、服务发现、mesh 清单是 **Ch44**，这里只接到弹性。",
        "",
        "**一句话：** 白板默认 **at-least-once + 幂等消费者**；exactly-once 贵，跨 DB 仍要 **Outbox（Ch41）**。积压看 **lag**，毒消息进 **DLQ**，超时重试会放大。同步调用先钉 **timeout**，再 **bulkhead** 和 **circuit breaker**。K8s = **期望态**，调度单元是 **Pod**，不是 YAML 课。",
        "",
        "三个 hard part（最该挖的那块）：",
        "",
        "1. **投递语义怎么落地** —— at-most / at-least / exactly-once；白板默认 at-least-once + 幂等；EOS 贵、跨 DB 仍要 Outbox",
        "2. **积压与重试风暴** —— lag、毒消息 / DLQ、超时重试放大、背压",
        "3. **熔断降级 + 容器心智** —— timeout / bulkhead / circuit breaker；K8s = 期望态，调度单元是 Pod",
        "",
        "本章**不讲**：把 Ch20 再写成一章（分区 / ISR / KRaft / 消费者组只一句回链）、把 Ch44 拆服务标准 / 发现全书搬来、K8s YAML / Dockerfile 教程、Karpenter / Argo / WASM 产品巡礼、AWS SQS / SNS / EKS 购物清单、Hystrix 当 2026 默认。mesh / mTLS 点到即停。",
      ].join("\n"),
    },
    {
      id: "sec-pitch",
      heading: "一句话定义 · 面试 20 秒开口",
      secNum: "42.1",
      related: ["ch20", "ch41", "ch44"],
      body: [
        "先把评分信号打出来：你会选投递语义、会治积压、会先 timeout 再熔断，K8s 只讲心智不写 YAML。",
        "",
        "> 「消息我默认 **at-least-once + 消费幂等**：处理完再提交 offset，崩溃会重放，所以副作用必须幂等。at-most-once 是先提交再处理，可能丢，只给指标 / 日志。exactly-once **贵**：Kafka 事务只管 topic 到 topic；写出到 DB 或 HTTP 仍要幂等，跨库双写走 **Outbox（Ch41）**。积压看 **lag**；组内并行上限是分区数——怎么分区是 Ch20。毒消息有界重试后进 **DLQ**，别堵死分区。超时齐步重试会打出风暴，要预算和 jitter。同步调用先钉 **timeout**，再用 **bulkhead** 隔离、**circuit breaker** 半开探测；2026 不把 Hystrix 当默认。K8s：容器是进程隔离，调度单元是 **Pod**，你声明期望态，控制循环去对齐。运行时开口 **containerd**。」",
        "",
        "整章按这一条链走。上场 20 秒念完就停，让面试官决定要挖语义、积压还是弹性。",
        "",
        d2(`
direction: right
del.class: go
del: "投递语义"
lag.class: step
lag: "积压"
res.class: ok
res: "弹性+容器"
del -> lag -> res
`),
        "",
        "本图引用：Ch20 分区与组（机制在那边）· Ch41 Outbox（跨库仍要）· Ch44 治理最小集（超时/重试/幂等，熔断深挖在本章）",
        "",
        "| 面试官问法 | 你落在哪一截 |",
        "|---|---|",
        "| 「能 exactly-once 吗？」 | 先说实践默认 at-least + 幂等；EOS 边界和代价 |",
        "| 「消费者赶不上怎么办？」 | lag；并行有上限；毒消息 DLQ；不要无限重试 |",
        "| 「下游挂了怎么活？」 | 先 timeout，再隔离舱和熔断半开；降级用开关 |",
        "| 「容器和 K8s 讲一下？」 | 进程隔离 vs VM；Pod 是调度单元；期望态 |",
        "",
        "**red flag：** 把 exactly-once 说成免费默认；开口背分区 / ISR / KRaft 当本章；无限重试当弹性；Hystrix 当 2026 第一答案；把 Docker 当 K8s 运行时默认；开始写 YAML / 画 EKS 购物。",
      ].join("\n"),
    },
    {
      id: "sec-delivery",
      heading: "机制 · 投递语义（at-most / at-least / exactly-once）",
      secNum: "42.2",
      related: ["ch20", "ch41"],
      body: [
        "第一个 hard part。**2026 面试里，会背三个英文词不如会说 offset 何时提交、EOS 覆盖到哪一层。** 分区怎么切、组怎么再均衡、ISR 和 KRaft——**Ch20**，这里不重讲。本章问的是：**broker 和消费者之间，丢和重复谁先赢。**",
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
  c: "Kafka 闭环"
  d.class: step
  d: "跨库 Outbox"
}
`),
        "",
        "本图引用：Ch20 exactly-once 开口（幂等 producer + 事务，贵）· Ch41 Outbox（跨 DB 双写）",
        "",
        "三条合同，先钉再谈实现：",
        "",
        "| 语义 | 怎么落地 | 会怎样 | 白板给谁 |",
        "|---|---|---|---|",
        "| **at-most-once** | 处理前就提交 offset / 发出去不等 ACK | **可能丢**，不重复 | 指标、日志、可抽样的遥测 |",
        "| **at-least-once** | 处理成功后再提交；失败重试 | **不丢，可能重复** | **默认**：订单、通知、入账通知 |",
        "| **exactly-once** | broker 事务 + 消费幂等，或业务去重键 | 效果上看一次；**贵、边界窄** | Kafka 内 read-process-write；不要当所有链路免费 |",
        "",
        "面试最爱挖的时序：**处理成功、提交 offset 之前进程死了。**",
        "",
        d2(`
shape: sequence_diagram
brk: "Broker"
cons: "Consumer"
db: "DB"
brk -> cons: "deliver"
cons -> db: "upsert"
cons -> cons: "crash"
brk -> cons: "redeliver"
`),
        "",
        "这就是 at-least-once：broker 不知道你是「做完了没来得及 ACK」还是「根本没做」。它必须再投一次。所以 **幂等消费者**不是加分项，是默认合同：按业务键 / 事件 id upsert，或条件写「只从 pending 改成 paid」。先提交再处理 = at-most-once，崩溃就丢——账本路径不要选。",
        "",
        "**白板默认就这一句：** at-least-once + 幂等。自动提交 offset 好看、生产容易在处理失败时丢或重；面试说清选手动、处理后再 commit。",
        "",
        "**exactly-once 贵在哪、贵完还剩什么。** Kafka 的 EOS 是 **幂等 producer**（同会话同分区不因重试双写）加上 **事务**（consume–process–produce 把 offset 和输出绑在一次 commit 里，消费者 `read_committed`）。这套 **只在 Kafka 闭环里**成立。一旦消费者打了 HTTP、写了外部 DB、发了短信，broker 事务罩不住外面那一跳——那边仍是 at-least-once，仍要幂等。跨库「写订单行 + 发事件」不是 Kafka EOS 能买的，是 **Outbox + CDC（Ch41）**：同行本地事务，再投递；投递本身还是至少一次。",
        "",
        "Ch20 已经把 ISR、`acks=all`、KRaft 钉完。这里只收口：**耐久是复制的事，语义是提交点和幂等的事。** 不要把两章焊成一节。",
        "",
        "面试怎么说：",
        "",
        "> 「默认 at-least-once，消费者按业务键幂等。EOS 只覆盖 Kafka 到 Kafka，贵。写出到库或渠道仍要幂等；和 DB 同事务走 Outbox，不假装 exactly-once 免费。」",
        "",
        "**red flag：** 「Kafka 支持 exactly-once 所以业务不用幂等」；at-most-once 当支付默认；把分区 / 消费者组 / KRaft 整节搬进来当本章。",
      ].join("\n"),
    },
    {
      id: "sec-backlog",
      heading: "机制 · 积压与重试风暴",
      secNum: "42.3",
      related: ["ch20", "ch04", "ch17"],
      body: [
        "第二个 hard part。**积压不是「再加十台消费者」就能消失的口号。** 先定义，再谈毒消息和超时放大。",
        "",
        d2(`
direction: right
prod.class: go
prod: "Producer"
log.class: store
log: "Log"
cons.class: step
cons: "Consumer"
prod -> log -> cons
`),
        "",
        "本图引用：Ch20 分区并行上限（组内一分区一个消费者）· Ch41 事件从哪来（Outbox 不解决积压）",
        "",
        "**lag** = 日志末端 − 已提交 offset（或队列深度）。它量的是「还没处理完的工作」，不是 QPS 海报。面试不要编某厂内部吞吐；说清：**生产者持续快于消费者，lag 就涨。** 涨到业务死线（通知晚一小时、对账隔夜）才是事故。",
        "",
        "并行有硬顶。日志型总线里，**一组内同时处理同一分区的只有一个成员**——顺序和这个绑在一起（Ch20）。消费者数 > 分区数，多出来的空转。lag 降不下去时，加实例只能加到分区数；再要吞吐就 **加分区**（接受 key 重映射）或拆 topic，不是再开 200 个空进程。这是 parallelism cap，不是调参玄学。",
        "",
        d2(`
grid-columns: 2
poi: {
  label: "毒消息"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "有界重试"
  b.class: ok
  b: "DLQ"
}
stm: {
  label: "重试风暴"
  class: groupBad
  grid-columns: 2
  c.class: bad
  c: "超时齐步"
  d.class: bad
  d: "无限重试"
}
`),
        "",
        "**毒消息（poison）：** 一条记录怎么处理都会失败（坏 schema、违反不变量、下游永久 4xx）。如果消费者卡在这一条死磕，**整分区停住**，后面健康消息全堵。对策不是「再试一晚上」：",
        "",
        "1. **有界重试**（教学直觉：1–2 次，不是 10），退避 + **jitter**，避免所有实例同一毫秒打回去。",
        "2. 仍失败 → **DLQ / dead-letter topic**，主路径继续走。DLQ 要有人看、能重放、能告警；不是一个叫 `trash` 的黑洞。",
        "3. 可恢复的错（下游 429 / 短暂 5xx）才重试；校验失败不要重试。",
        "",
        "面试最爱挖的第二条时序：**超时导致的重试放大。**",
        "",
        d2(`
shape: sequence_diagram
cli: "Client"
gw: "Gateway"
dep: "Downstream"
cli -> gw: "POST"
gw -> dep: "call"
gw -> cli: "timeout"
cli -> gw: "retry"
gw -> dep: "again"
`),
        "",
        "下游已经慢了，调用方 timeout 后立刻再打——原来 1 个慢请求变成 2、3 个，到达率被自己抬上去。积压越深，超时越多，重试越多，这是正反馈。网关 **不要**对非幂等 `POST` 自作主张连打三次（Ch17）。同步链上的重试预算算进同一条 **timeout** 死线，不是额外再买 10 秒。",
        "",
        "**背压（backpressure）：** 下游慢时，上游必须变慢或拒绝，而不是用无限内存队列把信号吞掉。日志总线的 **pull** 本身就是消费者控速。入口侧：队列深度 / lag 过阈值就 **429 / 503**，带 `Retry-After`；限流是 **Ch04**。无限 in-memory retry 队列看起来「不丢」，其实是把 backlog 藏进堆，直到 OOM。恢复期更危险：故障修好后，积压 + 重试一起涌出，把刚活过来的下游再打挂——恢复要限速排空，不要「全面放开」。",
        "",
        "面试怎么说：",
        "",
        "> 「积压先看 lag，不是先报加机器。并行有分区上限。毒消息有界重试再 DLQ。超时重试会放大，要 jitter 和预算。入口用背压，不要无限内存队列。」",
        "",
        "**red flag：** 「加消费者就能线性加速」却讲不出分区顶；毒消息死循环占分区；超时后立刻齐步重试；用无限重试当可用性。",
      ].join("\n"),
    },
    {
      id: "sec-resilience",
      heading: "机制 · 熔断降级 + 容器心智",
      secNum: "42.4",
      related: ["ch17", "ch28", "ch44", "ch25"],
      body: [
        "第三个 hard part 两截：**同步依赖怎么失败得起**，以及 **进程跑在什么隔离单元上**。治理最小集（发现 + 超时/重试/幂等）Ch44 已经钉过；本章深挖 timeout 之后的舱壁和熔断，再加上容器心智。不要把拆服务标准再讲一遍。",
        "",
        "### timeout → bulkhead → circuit breaker",
        "",
        "**2026 第一句是 timeout，不是熔断器品牌。** 没有超时的调用会占满线程和连接，把下游的慢变成自己的雪崩。超时打在 **HTTP 客户端**（connect / read），短于上游死线。网关门口也要有（Ch17）。Resilience4j 一类库的 TimeLimiter **罩不住同步阻塞调用**——别以为贴了注解就有超时。",
        "",
        d2(`
direction: right
to.class: go
to: "timeout"
bh.class: step
bh: "bulkhead"
cb.class: ok
cb: "circuit"
to -> bh -> cb
`),
        "",
        "本图引用：Ch17 网关门口超时 · Ch44 有界重试与幂等（写请求不要盲目重试）· Ch28 降级开关",
        "",
        "| 构件 | 干什么 | 不干什么 |",
        "|---|---|---|",
        "| **timeout** | 单次调用有死线，线程能回来 | 不负责「连续失败就别打了」 |",
        "| **bulkhead（隔离舱）** | 每个依赖独立线程池 / 信号量，一个慢舱沉不了整船 | 不替代超时；舱的大小仍要算 |",
        "| **circuit breaker** | 失败率 / 慢调用率过线 → **Open** 快速失败，给下游喘气；过一会儿 **Half-open** 放几支探针，好了才 **Closed** | 不是超时器；Open 期间要有降级，不是空 500 |",
        "",
        "半开是关键：一直 Open 则永远不知道对面好了；一开就灌满则刚恢复又被打挂。探针次数要少。失败率窗口要有 **最小调用数**，否则 2 次里 1 次失败就跳闸是误伤。",
        "",
        "**降级：** Open 之后用户还在等。可选依赖（推荐、积分展示、第三方头像）返回缓存、默认值或干脆省略；开关走 **Ch28**。核心路径（扣款、下单）降级通常是失败 + 明确错误，不要静默「当成功」。熔断是保护自己和邻居，不是把业务对账取消。",
        "",
        "**2026 默认库：timeout + 隔离 + 半开。** Java 向面试口 **Resilience4j**（或等价：客户端超时 + 舱 + 熔断）。**Hystrix 已停止维护**，不当第一答案；原书写 Hystrix 线程池隔离的细节进折叠。不要开口 Istio retry/outlier 插件表——mesh / mTLS 点到「边车可以代做超时和 mTLS，白板仍要会讲机制」，清单在 Ch44 也不展开。",
        "",
        "### 容器心智：不是 YAML 课",
        "",
        "面试要的是三句话，不是 Deployment 字段。",
        "",
        d2(`
grid-columns: 2
ctr: {
  label: "容器"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "共享内核"
  b.class: ok
  b: "进程隔离"
}
vm: {
  label: "VM"
  class: group
  grid-columns: 2
  c.class: step
  c: "独立内核"
  d.class: step
  d: "隔离更强"
}
`),
        "",
        "1. **进程隔离 vs VM。** 容器共享宿主内核，用 namespace 看不同的 PID/网络/挂载，用 cgroups 限 CPU/内存。启动快、密度高。VM 有自己的内核，隔离更强、更重。多租户不信任代码，VM 或沙箱仍有位置；普通无状态服务 2026 默认容器。",
        "2. **调度单元是 Pod，不是容器。** Pod 是一组共享网络和存储、一起调度的容器。app + sidecar 必须同节点、localhost 互通，所以抽象在 Pod。一个 Pod 里通常一个主容器；多容器是 sidecar，不是「把微服务塞进一个 Pod」。",
        "3. **声明式期望态。** 你说「这个服务 3 个副本」；控制循环比较实际和期望，差了就调度、拉起、替换。自愈是 **reconcile**，不是报警等人 SSH。kubelet 在节点上把 Pod spec 对齐到运行时。",
        "",
        d2(`
direction: right
spec.class: go
spec: "期望态"
sch.class: step
sch: "Scheduler"
pod.class: ok
pod: "Pod"
cri.class: store
cri: "containerd"
spec -> sch -> pod -> cri
`),
        "",
        "本图引用：Ch25 任务调度（那是 cron/延迟作业，不是本图的 Pod 调度）· Ch39 无状态副本 · Ch44 发现（Service 稳定入口点到即可）",
        "",
        "**2026 开口 containerd，不要把 Docker 当 K8s 运行时默认。** Kubernetes 1.24 起移除 dockershim；kubelet 经 **CRI** 跟 **containerd**（或 CRI-O）说话。你在笔记本用 Docker 构建的镜像仍是 **OCI**，集群照样拉。一句话就够，不要开运行时实现课。",
        "",
        "K8s **不是**业务作业调度器。对账、关单、misfire 是 **Ch25**。把 CronJob YAML 当调度题答案，两边都答偏。有状态稳定身份（StatefulSet 一类）点到「数据库通常不靠 Deployment 随便替换」即停，不要开存储卷教程。",
        "",
        "面试怎么说：",
        "",
        "> 「同步先 timeout，再隔离舱，熔断半开探测；降级用开关。Hystrix 不当 2026 默认。容器共享内核；K8s 调度的是 Pod；我声明期望态，循环去对齐。运行时 containerd，镜像仍是 OCI。」",
        "",
        "**red flag：** 没超时先画熔断；Hystrix 当现行默认；无限线程池当隔离；把 Docker 画进 kubelet 当运行时；开口写 YAML / Karpenter / 某云 EKS SKU；把 Ch25 的 cron 和 Pod 调度混成一题。",
      ].join("\n"),
    },
    {
      id: "sec-choose",
      heading: "选型表",
      secNum: "42.5",
      related: ["ch20", "ch41", "ch17", "ch28", "ch44"],
      body: [
        "白板先钉默认。三套语义、两套调度、一打云产品一起画上是 over-engineering。",
        "",
        "| 场景 | 默认 | 不要 |",
        "|---|---|---|",
        "| 业务事件（下单、通知） | **at-least-once + 消费幂等** | at-most-once；假装 EOS 免费 |",
        "| 指标 / 可丢日志 | at-most-once 可以 | 把账本也改成可丢 |",
        "| Kafka 内流处理要无重复输出 | EOS（事务 + `read_committed`），承认贵 | 说完 EOS 就不做幂等 |",
        "| 写库 + 发事件 | **Outbox（Ch41）** | 请求里裸 send；用 Kafka 事务罩外部 DB |",
        "| 积压 | 看 **lag**；并行 ≤ 分区数 | 「再加 100 消费者」 |",
        "| 永远失败的消息 | 有界重试 → **DLQ** | 死循环占分区 |",
        "| 超时后的调用 | 预算 + jitter；只重试幂等 | 齐步立刻再打非幂等 POST |",
        "| 入口过载 | 背压 / 限流（Ch04）；429 + Retry-After | 无限内存队列吞信号 |",
        "| 同步下游 | **timeout 必开** → bulkhead → circuit | 先报 Hystrix；没超时先熔断 |",
        "| 熔断 Open | 降级（缓存/默认/省略）；开关 Ch28 | 空 500；核心扣款静默当成功 |",
        "| 进程怎么跑 | 容器；调度单元 **Pod**；期望态 | YAML 当口播；Docker Engine 当 K8s 运行时 |",
        "| 定时对账 / 关单 | **Ch25** 作业调度 | K8s CronJob 当恰好一次 |",
        "",
        "默认口播再收一次：",
        "",
        "> 「语义默认 at-least + 幂等。积压看 lag 和 DLQ。弹性先 timeout。K8s 讲 Pod 和期望态。分区和 ISR 去 Ch20，拆服务去 Ch44。」",
      ].join("\n"),
    },
    {
      id: "sec-papers",
      heading: "论文与经典系统",
      secNum: "42.6",
      related: ["ch20", "ch44"],
      body: [
        "M6 要能点名。下面 2 篇必读、2 篇选读。**面试用哪一句**写在表里；不背页码，不把 Borg 当 YAML 作业。",
        "",
        d2(`
direction: right
kf.class: go
kf: "Kafka 11"
ri.class: step
ri: "Release It"
bg.class: ok
bg: "Borg 15"
kf -> ri -> bg
`),
        "",
        "时间线只帮助记忆：先有「日志当真相、消费者只是 offset」，再有「超时、舱壁、熔断让失败局部化」，再有「集群按期望态调度任务」。不是说你要实现三套。",
        "",
        "| | 文献 | 必读 / 选读 | 面试用哪一句 |",
        "|---|---|---|---|",
        "| 1 | **Kreps, Narkhede, Rao**，NetDB 2011，*Kafka: a Distributed Messaging System for Log Processing* | 必读 | 消息是 **append-only 日志**；消费者是 **offset**。可重放、多组独立。分区 / ISR 的工程细节在 **Ch20**，本章用这句支撑 at-least-once：提交点决定丢还是重 |",
        "| 2 | **Nygard**，*Release It!*（2007；第二版 2018） | 必读 | **timeout、bulkhead、circuit breaker** 三件套：先有死线，再隔离依赖，连续失败则快速失败并半开探测。2026 换库名（Resilience4j），模式没换。Hystrix 是后来的一个实现，已 EOL |",
        "| 3 | **Kreps**，LinkedIn Engineering 2013，*The Log: What every software engineer should know about real-time data's unifying abstraction* | 选读 | 日志是统一抽象：DB、MQ、复制都能看成 log。用来帮腔「先有 log 再谈语义」，不要把这篇当 Kafka 配置手册 |",
        "| 4 | **Verma et al.**，EuroSys 2015，*Large-scale cluster management at Google with Borg* | 选读 | 大规模集群：声明要跑什么，管理者放到机器上并维持。K8s 的期望态 / Pod 心智从这条线来。面试停在「调度单元 + reconcile」，不要默写 Borg 内部名词 |",
        "",
        "Fowler 的 Circuit Breaker 短文（2014）是模式目录，不是论文；用来对上 Nygard 即可。Kubernetes 文档不是论文：dockershim 移除、CRI、containerd 用工程事实开口，不要编会议。",
        "",
        "经典系统只当钉子：Kafka 日志 → 本节语义与积压；Resilience4j / 等价库 → 熔断实现；K8s → Pod 与期望态。Rabbit / SQS 点「也是 at-least-once，同样要幂等和 DLQ」，不要开产品对照表。",
      ].join("\n"),
    },
    {
      id: "sec-used",
      heading: "哪些设计题会用到",
      secNum: "42.7",
      related: ["ch20", "ch25", "ch28", "ch44", "ch17", "ch10"],
      body: [
        "主线先做题，卡壳再跳进本章。回链不是把 M6 读完再开写。",
        "",
        "| 章 | 会用到哪一句 |",
        "|---|---|",
        "| **Ch02** 扩展 | 加 MQ 削峰；削完仍要消费，否则 backlog 把延迟送进用户路径 |",
        "| **Ch04** 限流 | 入口背压；积压时 429，不要只加队列 |",
        "| **Ch10** 通知 | 渠道失败：有界重试 + DLQ；不要同步串三个运营商 |",
        "| **Ch11** Feed | fan-out 异步；落后可认，重试不要打爆写扩散 |",
        "| **Ch14** 视频 | 转码队列 lag；毒文件进 DLQ，别堵整条 pipeline |",
        "| **Ch16** 评论 | 审核队列；超时重试不要变成刷屏风暴 |",
        "| **Ch17** 网关 | 门口 timeout；非幂等 POST 不盲目重试 |",
        "| **Ch18** 订单 | 副作用 Outbox（Ch41）发出后，消费幂等；关单重试有界 |",
        "| **Ch20** MQ | 分区、组、ISR、EOS、KRaft 在那边。本章要语义落地、lag、DLQ |",
        "| **Ch21** 秒杀 | 异步下单队列会积压；售罄后的重试是风暴温床 |",
        "| **Ch24** 支付 | 回调至少一次 → 入账幂等；不要用 EOS 口号代替对账 |",
        "| **Ch25** 调度 | misfire / 补偿风暴和消息重试是同一类放大；不是 K8s CronJob 题 |",
        "| **Ch28** 配置 | 熔断后的降级开关、超时值，走配置中心，不写死在镜像里 |",
        "| **Ch39** 无状态 | 副本可替换，和 Pod 期望态是同一句话 |",
        "| **Ch41** 事务 | 事件从库里出来；本章管出来之后丢不丢、堵不堵 |",
        "| **Ch44** 微服务 | 发现和拆分在那边；超时/重试/幂等最小集那边点过，熔断深挖在本章 |",
        "",
        "聊天、短链：同步读路径少用队列。**一旦有「做完再通知别人」**，就把本章三句带上。",
      ].join("\n"),
    },
    {
      id: "sec-2026",
      heading: "2026 vs 笔记 / 原书",
      secNum: null,
      related: [],
      body: [
        "<details>",
        "<summary>原书 / 笔记当时怎么讲 · Hystrix、Docker 运行时、云购物进这里</summary>",
        "",
        "笔记对应 AWS 书容器章：Dockerfile、对象清单、Karpenter、GitOps、WASM、Mesh 目录，再加一串云 SKU。弹性几乎不在那份笔记里。**那不是本章正文。** 2026 上场只带投递语义、lag/DLQ、timeout 优先的熔断、Pod 与期望态。",
        "",
        "| 原书 / 笔记 / 旧口播 | 现在怎么答 |",
        "|---|---|",
        "| exactly-once 当免费默认 | **at-least-once + 幂等**；EOS 贵且只管 Kafka 闭环 |",
        "| 分区 / ISR / KRaft 写进本章 | **Ch20** |",
        "| 积压 = 加消费者 | **lag + 分区并行上限 + DLQ** |",
        "| 无限重试当弹性 | 有界、jitter、超时会放大 |",
        "| **Hystrix** 线程池当标准答案 | 已 EOL。先 **timeout**（打在 HTTP 客户端），再 bulkhead + 半开。库名 Resilience4j 一类 |",
        "| 没超时先画熔断 | 熔断管的是连续失败后的快速失败，不是死线本身 |",
        "| K8s 运行时画 Docker Engine | **1.24 起 dockershim 已移除**；开口 **containerd / CRI**。Docker **镜像**仍是 OCI，能用 |",
        "| Dockerfile / YAML / Service 类型表 | 心智三句：进程隔离、Pod、期望态 |",
        "| Karpenter / Argo / WASM / eBPF 巡礼 | **禁止**当脊柱；知道名字即可，不进正文 |",
        "| EKS / SQS / SNS / Fargate 购物 | 机制用通用词：托管日志、对象存储、容器平台 |",
        "| 拆服务 / 发现 / Istio filter | **Ch44**；mesh 点到即停 |",
        "| CronJob 当作业调度 | **Ch25** |",
        "",
        "正文第一答案用现在这套。折叠只防止你把容器全书和已死的 Hystrix 搬上白板。",
        "",
        "</details>",
      ].join("\n"),
    },
    {
      id: "sec-traps",
      heading: "追问陷阱",
      secNum: null,
      related: ["ch20", "ch41", "ch44"],
      body: [
        "1. **默认哪种投递？** → at-least-once + 幂等消费者。",
        "2. **at-most-once 何时？** → 可丢的指标/日志。先提交再处理，崩溃即丢。",
        "3. **处理完没提交就挂？** → 重放。所以必须幂等。",
        "4. **Kafka exactly-once 免费吗？** → 不。贵；且只覆盖 topic→topic。",
        "5. **写出到 DB 还 EOS 吗？** → 不。外部仍要幂等或 **Outbox（Ch41）**。",
        "6. **为什么不在这讲分区 / ISR / KRaft？** → 那是 **Ch20**。本章是语义和弹性。",
        "7. **lag 是什么？** → 日志末端 − 提交位点。积压的尺子。",
        "8. **加消费者为什么不线性？** → 并行上限 = 分区数。",
        "9. **毒消息怎么办？** → 有界重试，失败进 **DLQ**，别堵分区。",
        "10. **超时重试为什么危险？** → 慢请求被复制，到达率自己抬上去。",
        "11. **背压一句？** → 下游慢则上游减速或拒绝；无限内存队列会吞掉信号。",
        "12. **弹性第一句？** → **timeout** 必开，打在客户端，短于上游死线。",
        "13. **bulkhead？** → 每依赖一舱（线程池/信号量），一个慢舱不沉整船。",
        "14. **熔断三态？** → Closed 放行 → Open 快速失败 → Half-open 探针。",
        "15. **2026 还讲 Hystrix 吗？** → 不当默认。已 EOL；口 Resilience4j / 等价机制。",
        "16. **容器 vs VM？** → 容器共享内核、进程隔离；VM 独立内核、更重更强隔离。",
        "17. **为什么是 Pod 不是容器？** → 调度和生命周期绑在一起；sidecar 要同节点。",
        "18. **K8s 和 Docker？** → 运行时 **containerd**（CRI）；镜像仍是 OCI。dockershim 已移除。",
        "19. **期望态？** → 声明副本数；控制循环把实际拉回去。",
        "20. **和 Ch44 / Ch25？** → 拆服务和发现去 Ch44；cron 作业去 Ch25。本章不写 YAML。",
      ].join("\n"),
    },
    {
      id: "sec-next",
      heading: "下一步",
      secNum: null,
      related: ["ch43", "ch44", "ch45"],
      body: [
        "合上页，用 20 秒口播走一遍：语义默认 at-least-once + 幂等；EOS 贵、跨库 Outbox；积压看 lag、毒消息 DLQ、超时重试会放大；弹性先 timeout，再隔离舱和半开熔断；K8s 讲 Pod 和期望态，运行时 containerd。能把消息题放回 Ch20、治理放回 Ch44、Outbox 放回 Ch41，这一章就过关。",
        "",
        "**车道 A（Ch38–Ch42）到此收束。** 缓存、负载均衡、协议、复制事务、本章，主线用得到的那几块 M6 芯片已经写完。后面的词典 **Ch43 超大规模数据、Ch44 微服务、Ch45 DDD** 已经在站里，设计题用芯片跳转即可——不要把本章当成还要接着写 YAML 或大数据的序章。",
        "",
        "自测：左列投递与幂等，中列 lag / DLQ / 重试风暴，右列 timeout–bulkhead–circuit + Pod 期望态。不要把 Hystrix 和 Docker-as-runtime 默写回去。",
      ].join("\n"),
    },
  ],
  reviewMd: `# Ch42 · 记忆闪卡

| # | 正面 | 背面 |
|---|---|---|
| 1 | 20 秒怎么开口？ | at-least-once + 消费幂等。EOS 贵、跨库 Outbox。lag + DLQ。先 timeout，再 bulkhead / circuit。K8s：Pod + 期望态，containerd。 |
| 2 | 三个 hard part？ | ① 投递语义落地 ② 积压与重试风暴 ③ 熔断降级 + 容器心智。 |
| 3 | 白板默认哪种投递？ | **at-least-once + 幂等消费者**。处理后再提交 offset。 |
| 4 | at-most-once 怎么丢的？ | 处理前就提交。崩溃 = 丢。只给可丢指标。 |
| 5 | 处理完没 ACK 就挂？ | broker 再投。必须幂等。 |
| 6 | EOS 覆盖到哪？ | Kafka topic→topic（事务）。外部 DB/HTTP **不算**。 |
| 7 | 跨库双写？ | **Outbox（Ch41）**，不是 Kafka EOS。 |
| 8 | 分区 / ISR / KRaft？ | **Ch20**。本章不重讲。 |
| 9 | lag 是什么？ | 日志末端 − 已提交位点。积压尺子。 |
| 10 | 为什么加消费者有顶？ | 组内并行 ≤ **分区数**。 |
| 11 | 毒消息？ | 有界重试 → **DLQ**，别堵分区。 |
| 12 | 重试风暴？ | timeout 后齐步再打，到达率被自己放大。jitter + 预算。 |
| 13 | 背压一句？ | 下游慢则减速或拒绝。无限内存队列会吞信号。 |
| 14 | 弹性第一句？ | **timeout** 必开（HTTP 客户端），短于上游死线。 |
| 15 | bulkhead？ | 每依赖一舱，一个慢舱不沉整船。 |
| 16 | 熔断三态？ | Closed → Open（快失败）→ Half-open（探针）。 |
| 17 | 2026 还用 Hystrix？ | 否，已 EOL。Resilience4j / 等价；先 timeout。 |
| 18 | 容器 vs VM？ | 容器：共享内核、进程隔离。VM：独立内核、更重。 |
| 19 | 为什么是 Pod？ | 调度单元；同生命周期、可 sidecar。不是 YAML 课。 |
| 20 | K8s 运行时 2026？ | **containerd**（CRI）。dockershim 已移除。Docker 镜像仍是 OCI。 |`,
});
