import { writeChapter } from "./write-chapter.mjs";

const d2 = (src) => {
  const body = src.trim();
  const sized = /style\.font-size/.test(body) ? body : `style.font-size: 12\n${body}`;
  return "```d2\n" + sized + "\n```";
};

writeChapter({
  id: "ch25",
  num: "25",
  title: "任务调度系统",
  kind: "case",
  relatedChapters: ["ch42", "ch08", "ch41"],
  sections: [
    {
      id: "intro",
      heading: "",
      secNum: null,
      related: [],
      body: [
        "> **预计**：50–60 分钟 ｜ **前置**：锁 Ch08；事务 Ch41",
        "> **目标**：分片抢锁、错过补偿、DAG 点到。本章是后端 cron/延迟任务，不是 Agent 编排（Ch34）。",
        "",
        "支付把「一笔钱怎么对」讲完；这题换成 **定时 / 延迟任务怎么在集群里只跑一次、错过怎么补**。默认是后端的 **cron + 延迟任务**：对账、关单、失败重试。不是 K8s CronJob YAML，不是 Airflow 产品课，也不是 Ch34 的 multi-agent loop。",
        "",
        "系统看起来就是到点开火、worker 干活。三个 hard part：**分片 + 抢锁避免双发**、**错过补偿 / misfire**、**和 Ch34 的边界**。面试官要看的不是某调度平台公开 QPS、不是 crontab 语法课、不是把 Redlock 整章搬进来（Ch08 已讲），而是：两个节点会不会对同一 `job_id` + 同一时间槽火两次；调度器挂了一小时回来是 skip 还是 catch-up；以及你有没有把「无模型的后端作业」答成 Agent runtime。",
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
        "> 「这是后端 cron / 延迟任务，不是 K8s YAML，不是 Airflow 课，不是 Ch34 Agent 循环。三个 hard part：分片抢锁避免双发、misfire 错过补偿、和 Agent 编排的边界。多 worker，按 `job_id` / time wheel 分片；抢锁或 fencing（Ch08）保证同一火点只跑一次。misfire 显式选 skip 还是 catch-up，别默默补出风暴。延迟用 time wheel / delay queue，别跟 cron 混成一种扫描。白板默认 **独立 job**；DAG 点到工作流引擎。handler 必须幂等，副作用走 Outbox（Ch41）。」",
        "",
        "然后按 4 步走，别一上来画 XXL-JOB 全家桶、Airflow DAG 编辑器、K8s CronJob manifest。",
        "",
        d2(`
direction: right
s1: "1 澄清范围"
s2: "2 粗估触发"
s3: "3 高层调度"
s4: "4 分片补偿"
s1 -> s2 -> s3 -> s4
`),
        "",
        "| 时间盒 | 你在做什么 |",
        "|---|---|",
        "| 3–10 min | 澄清：cron/延迟 vs DAG vs Agent、双发坏不坏、misfire 策略、有没有 Redis/DB |",
        "| 接着 2 min | back-of-envelope：job 定义量；触发 QPS 很小；怕的是双发和补偿风暴 |",
        "| 10–15 min | 高层：Scheduler → Lock → Worker；元数据在库 |",
        "| 10–25 min | deep dive：分片+锁+fencing、misfire skip/catch-up、延迟 vs cron；DAG / Ch34 点到 |",
        "| 3–5 min | wrap-up：3 个 bottleneck（双发、misfire 风暴、把本题答成 Agent） |",
        "",
        "**red flag：** 还没问范围就画 Airflow / Temporal 产品架构；单机 Spring `@Scheduled` 当集群答案；上来 Redlock 五节点；catch-up 默认补光所有错过；把 Ch34 的 ReAct loop 画进 cron；拿某厂调度 QPS 当自己的事实。那是 over-engineering，或把邻章 / 产品课整段搬进来。",
      ].join("\n"),
    },
    {
      id: "sec-clarify",
      heading: "澄清问题清单",
      secNum: "25.1",
      related: ["ch34"],
      body: [
        "没问清楚就画图 = Jimmy。调度这题 5–7 个问题就停，其余自己假设写白板。**第一问必须是范围。**",
        "",
        "| 你问 | 典型回答 / 你自己的假设 | 它改什么 |",
        "|---|---|---|",
        "| cron、延迟、DAG 工作流，还是 Agent？ | **后端 cron + 延迟**（对账、关单、重试） | DAG 点到；Agent 是 **Ch34** |",
        "| 双发是浪费 CPU，还是会关两次单、对两次账？ | 写存储 → **正确性锁 + fencing**（Ch08） | 只去重可以效率锁 |",
        "| 已有 Redis，还是只有 DB？ | **已有 Redis + 任务表** | SET NX 或 `SKIP LOCKED` 认领到期行 |",
        "| 错过一小时怎么补？ | **按 job 配**：巡检 skip，对账 catch-up / 补一次 | 禁止全局默默补风暴 |",
        "| 要不要 job 之间的依赖？ | 白板 **独立 job** | DAG 丢给工作流引擎，不自研拓扑 |",
        "| 大约多少条 job 定义？ | 教学：**约 1 万条** | 证明 bottleneck 不是触发 QPS |",
        "",
        "面试官说「你定」时，把假设写上去：",
        "",
        "> 「我假设：后端 cron + 延迟任务，不是 K8s YAML，不是 Airflow 产品，不是 Ch34。对账、关单、重试这类独立 job。多实例按 `job_id` 分片，到期抢锁，写库带 fencing。misfire 默认 skip，对账类 job 单独 catch-up 或 fire-once-now。延迟走 time wheel / delay queue。handler 幂等 + Outbox。先按这个画，不对你打断我。」",
        "",
        "问到 Airflow / Temporal / K8s CronJob / Agent：**承认差别，立刻收口。** 「真 DAG 用工作流引擎，本场不设计调度器里的拓扑。K8s CronJob 是容器化独立周期任务，YAML 不是本题，也不保证恰好一次。模型多步调工具是 Ch34。本场把分片抢锁和 misfire 讲透。」问太多超过 10 分钟也是 red flag。黄金线还是那条：**问关键问题 → 自己给假设 → 写白板 → 继续。**",
      ].join("\n"),
    },
    {
      id: "sec-estimate",
      heading: "粗估",
      secNum: "25.2",
      related: ["ch03"],
      body: [
        "公式细节在 Ch03。这里只要数量级，证明你知道 **这题 bottleneck 是双发和 misfire 风暴，不是「全国任务 QPS」。** 下面用白板做**教学假设**，不是某调度平台内部数字，也不是某厂公开峰值。",
        "",
        "假设：约 **1 万条** job 定义；多数是小时 / 天级 cron；延迟任务（关单）跟订单创建同数量级，但扫描路径和 cron 不同。",
        "",
        "| 项 | 怎么估 | 量级（教学假设） |",
        "|---|---|---|",
        "| 若 1 万条全是每分钟 cron | 1e4 / 60 | **约 170 fire/s** 上界；真实混合远低于此 |",
        "| 更常见的小时 / 天级 | 触发稀疏 | **个位数～几十 /s**；任何正经 DB 轮询都吃得住 |",
        "| 延迟关单 | 跟创单同数量级（教学） | 贵的是到期精度和只火一次，不是峰值 |",
        "| 元数据存储 | 每条 job ~1 KB；run 历史另算 | **GB 级**；按 `job_id` / 时间槽分片（Ch41） |",
        "| 对比「海量调度」宣传 | 面试现场不要编某厂 QPS | **本场不靠吞吐得分** |",
        "",
        "调度器自己很少是 bottleneck；worker 池和 **同一火点被两个节点领走** 才是。misfire 若 catch-up 一分钟粒度挂了两小时，会突然丢出约 120 次执行——那是补偿风暴，不是你估漏了 QPS。",
        "",
        "**面试怎么说：**",
        "",
        "> 「万级 job 定义白板：触发通常几十 QPS 量级。时间花在分片抢锁、fencing、misfire 策略上。不会拿某厂调度峰值当内部数。」",
        "",
        "常见算错：把数据平台 DAG 的 task 并发当成 cron fire QPS；或只报定义条数、假装每个 tick 都全表扫描还说没问题。教学用数量级，并标**假设**。",
      ].join("\n"),
    },
    {
      id: "sec-arch",
      heading: "高层架构",
      secNum: "25.3",
      related: ["ch08", "ch41", "ch42"],
      body: [
        "从左到右只画 **一条调度控制面**：Scheduler → Lock → Worker。不要在这张图上扇出 Airflow Web UI、K8s Operator、Agent runtime。元数据（cron、`next_run_at`、misfire 策略）在任务表；到期认领要互斥；worker 跑幂等 handler。面试官 buy-in 之后再挖分片和补偿。",
        "",
        d2(`
direction: right
sch.class: go
sch: "Scheduler"
lk.class: step
lk: "Lock"
wk.class: ok
wk: "Worker"
sch -> lk -> wk
`),
        "",
        "**本图引用**：Ch08 分布式锁 · Ch41 复制、分片、事务 · Ch42 消息、弹性",
        "",
        "**写路径（注册 / 改 cron）：** API 写入 job 行（`job_id`、cron 或 `delay_until`、`shard`、`next_run_at`、`misfire_policy`）→ 所属分片的 scheduler 把下次火点放进扫描窗口或 time wheel。不要每个业务服务自己 `@Scheduled`——集群里会每人火一次。",
        "",
        "**触发路径：** 分片所有者扫描 `next_run_at <= now`（或推进 time wheel）→ **抢锁 / 认领** 这一火点 → 落一条 `runs` 行（`run_id` UNIQUE，建议 `(job_id, scheduled_at)`）→ 投递 worker（内存线程池或队列，Ch42）→ handler 跑完 CAS `success`，算出下一次 `next_run_at`。副作用（关单、发邮件、打账）同事务写 **Outbox**，不要在 handler 里同步 RPC 再标成功。",
        "",
        "**读路径：** 控制台查 job / 最近 run。不是 Feed，不必 CDN。监控看：滞后（该火未火）、持锁过久、失败重试、DLQ。",
        "",
        "**schema（够用就停）：** `jobs`（job_id、cron 或 delay_until、shard、next_run_at、misfire_policy、timeout）；`runs`（run_id、job_id、scheduled_at UNIQUE、fence、status、lease_until）；`outbox`。不要在白板上画 Quartz 那二十张 `QRTZ_*` 表。",
        "",
        "公开实现只当 **pattern 名字**，不当架构：XXL-JOB 调度中心用 DB 锁保证集群一次触发、2.1 后用 time wheel 替掉 Quartz；Quartz 集群靠 `QRTZ_LOCKS` + JDBC JobStore。白板画 Scheduler → Lock → Worker，不要默写产品表结构。",
        "",
        "高层图到这里就该停，问一句：「方向 OK 吗？接下来挖分片和抢锁，然后是 misfire，最后延迟队列和为什么这不是 Ch34。」",
        "",
        "**面试怎么说：**",
        "",
        "> 「Scheduler 看到期点，Lock 保证只火一次，Worker 跑幂等 handler。元数据在库。队列可有可无，锁不能没有。」",
      ].join("\n"),
    },
    {
      id: "sec-shard",
      heading: "深入 · 分片抢锁避免双发",
      secNum: "25.4",
      related: ["ch08", "ch41"],
      body: [
        "第一个 hard part。多实例为了 HA 都会去看同一张到期表。没有分片和认领，**同一 `job_id` 在同一分钟会跑两遍**——关单关两次、对账入两笔，都是事故。exact-once 投递做不到；能做的是 **at-least-once 触发 + at-most-once 业务效果**（幂等 handler + 唯一 run）。",
        "",
        "两层，别混：",
        "",
        "| 层 | 干什么 | 典型手段 |",
        "|---|---|---|",
        "| **分片** | 每个 scheduler 只扫自己那一份，降低冲突和全表扫描 | `hash(job_id) % N`，或按 time wheel 槽归属 |",
        "| **抢锁 / 认领** | 同一分片仍可能有主备两个节点 | Redis `SET NX`（Ch08）；或 `SELECT … FOR UPDATE SKIP LOCKED`；或 `(job_id, scheduled_at)` UNIQUE |",
        "",
        "分片不是「分了就永远不会双发」：failover 时两个节点可能短暂都认为自己拥有同一 shard（split-brain）。所以 **分片减冲突，锁 / 唯一约束收口双发。** 写存储的 job 再加 **fencing token**（Ch08）：锁过期后旧 worker 带着旧号写 `runs` / 业务表，存储拒。不要在这张白板重讲 Redlock——效率锁单 Redis 即可；正确性靠 fence 或 DB 约束，不靠五节点。",
        "",
        d2(`
direction: right
shard.class: go
shard: "hash 分片"
lock.class: step
lock: "抢锁"
fence.class: warn
fence: "fencing"
once.class: ok
once: "只火一次"
shard -> lock -> fence -> once
`),
        "",
        "**本图引用**：Ch08 分布式锁 · Ch41 复制、分片、事务",
        "",
        d2(`
shape: sequence_diagram
sch: "Scheduler"
lk: "Lock"
wk: "Worker"
sch -> lk: "抢锁 SET NX"
lk -> sch: "OK fence"
sch -> wk: "run once"
wk -> lk: "Lua 释放"
`),
        "",
        "认领到期行（DB 当队列时）：`WHERE next_run_at <= now() AND status='waiting' FOR UPDATE SKIP LOCKED LIMIT n`——各实例领不同行，不必另起协调集群。Airflow 一类调度器用的就是这个思路。任务表仍要索引 `(status, next_run_at)` / 分片键，否则每秒全表扫才是真 bottleneck。",
        "",
        "长任务：锁是租约。handler P99 必须短于 TTL，或看门狗续租 + **仍然 fencing**（Ch08）。另加 `lease_until` 心跳：worker 死了，别人才能重试同一 run。业务超时砍在租约内。不要「任务可能跑十分钟就把 TTL 调到一小时」还保证不了双写。",
        "",
        "XXL-JOB 的分片广播、Quartz `@DisallowConcurrentExecution` 只点名字：广播是 **大数据切片并行**，跟「同一 cron 只火一次」不是同一句话；禁止并发是 **同一 job 重叠跑**，挡不住你忘了集群锁。白板先把「这一火点只领一次」讲对。",
        "",
        "**面试怎么说：**",
        "",
        "> 「按 job_id 分片减冲突。同一火点 SET NX 或 SKIP LOCKED 认领，runs 唯一键兜底。写库带 fencing。不讲 Redlock。」",
        "",
        "trade-off：唯一键把「领了两次」变成第二次插入失败，换来绝不双跑；代价是要定义什么叫同一火点（建议墙钟对齐到 cron 槽，不要用「现在」当键）。全程无锁只靠「各机器 crontab 错开」是 red flag。",
      ].join("\n"),
    },
    {
      id: "sec-misfire",
      heading: "深入 · 错过补偿 / misfire",
      secNum: "25.5",
      related: ["ch41"],
      body: [
        "第二个 hard part。调度器挂了、线程池堵了、分片 failover 慢了，`next_run_at` 已经落在过去。醒来时要有 **misfire 策略**，不能假装时间没停过。公开实现里：Quartz 有 `misfireThreshold`（文档默认 60s 量级）和 skip / fire-now 等 instruction；XXL-JOB 用「下次触发 + 5s 仍落后于 now」判定 misfire，策略是忽略或立即补偿一次。白板记 **策略，不记产品常量当 SLA**。",
        "",
        d2(`
grid-columns: 2
sk: {
  label: "skip"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "只跑下次"
  b.class: ok
  b: "巡检/缓存"
}
cu: {
  label: "catch-up"
  class: group
  grid-columns: 2
  c.class: warn
  c: "补每一档"
  d.class: warn
  d: "对账/计费"
}
`),
        "",
        "| 策略 | 醒来做什么 | 适合 | 坑 |",
        "|---|---|---|---|",
        "| **skip** | 丢掉错过的槽，只排下一个未来点 | 缓存刷新、巡检、心跳 | 对账 / 计费会漏窗口 |",
        "| **catch-up** | 按 cron 把错过的每一档都跑 | 必须覆盖每个业务日的作业 | **补偿风暴**：挂 2 小时、分钟级 job ≈ 120 次连发 |",
        "| **fire-once-now** | 立刻补 **一次**，然后跳到未来 | 多数业务默认的折中（XXL-JOB 可配） | 不是「每一档都补」；要在策略里写清 |",
        "",
        "2026 白板默认：**策略按 job 配，系统默认偏 skip / fire-once-now，不要全局 catch-up。** 公开事实：Airflow 2.x 曾默认 `catchup=True`，3.0 起默认改成 `False`——说明「补风暴」已经是行业踩过的坑。本场 **不讲 Airflow 产品**，只借这一句证明 skip 当默认更常见。",
        "",
        "对账类（Ch24 日切）往往要 **补窗口而不是补 cron 拍数**：挂了就跑「从上次成功 watermark 到 now」的一段对账，比把每分钟 trigger 重放 120 遍更干净。这是 catch-up 的业务版，键是 **业务日期 / watermark**，不是 misfire 计数器。",
        "",
        "判定 misfire 的阈值要大于 failover / 锁等待，否则正常切主会被当成错过。Quartz 文档口径：`misfireThreshold` 应大于集群 checkin，避免假 misfire。白板说「阈值盖住 failover RTT + 一个锁 TTL」，不要背配置项。",
        "",
        "补偿本身必须走 **同一条认领 + 幂等路径**：补跑也要抢锁、写同一 `(job_id, scheduled_at)`。对账作业对文件幂等（Ch24）。不要「misfire 了就无锁连火」。",
        "",
        "**面试怎么说：**",
        "",
        "> 「misfire 按 job 选 skip 或补一次。对账用 watermark 补窗口。默认不 catch-up 全档，避免风暴。补跑也要锁和幂等。」",
        "",
        "trade-off：skip 丢窗口、换来系统能起来；catch-up 正确覆盖、换来延迟和风暴。把「调度器要可靠所以永不 misfire」当设计目标，是没理解租约和故障。",
      ].join("\n"),
    },
    {
      id: "sec-delay",
      heading: "深入 · 延迟任务、DAG 点到、与 Ch34",
      secNum: "25.6",
      related: ["ch42", "ch34", "ch41"],
      body: [
        "第三个 hard part 是边界：时钟驱动的后端作业，不是模型驱动的 Agent。顺手把 **延迟 vs cron** 和 **DAG 点到** 收口——这两项常被画成另一套产品，其实仍是「何时火、火几次」。",
        "",
        "**cron vs 延迟：** cron 是表达式 → 算出下一个 `next_run_at`，跑完再算下一次。延迟是 **一次性**（30 分钟后关单、指数退避重试）。不要用「每分钟扫全部订单」冒充延迟——订单变多，扫描就是 bottleneck。",
        "",
        d2(`
direction: right
enq.class: go
enq: "入队 delay"
wh.class: step
wh: "time wheel"
due.class: step
due: "到期 slot"
fire.class: ok
fire: "触发一次"
enq -> wh -> due -> fire
`),
        "",
        "**本图引用**：Ch42 消息、弹性",
        "",
        "| | 扫到期行 | time wheel | delay queue / ZSET |",
        "|---|---|---|---|",
        "| 怎么找 due | `next_run_at <= now` 轮询 | 内存环槽，每 tick 只看当前格 | 队列/有序集合按分数弹出 |",
        "| 精度 | 最差一个 poll 间隔 | 槽宽（常见 1s） | 视中间件 |",
        "| 故障 | DB 仍在，重启即扫 | **要从 DB 重建轮** | 看持久化；仍建议 DB 是权威 |",
        "| 面试 | 万级 job **够用** | 火点密、要降低扫表时再上 | 关单 / 重试很常用（Ch42） |",
        "",
        "2026 常见组合：**DB 权威 + 分片 time wheel 加速**（XXL-JOB 离开 Quartz 之后走的就是轮）。重启有几秒冷启动窗口——这窗口按 misfire 策略处理，不要假装内存轮永不丢。延迟关单也可以：下单时写 `delay_until`，或丢一条延迟消息；**业务效果仍靠订单状态 CAS + 幂等**，调度只负责叫醒。",
        "",
        "**DAG 点到（停）：** 白板默认 **独立 job**。真有「对账成功才出报表」这种边，那是 **工作流引擎**（Airflow / Temporal 一类）的拓扑，不是 cron 调度器里自研邻接表。XXL-JOB 父子任务是轻量触发，知道即可。面试官追问 DAG：承认引擎存在，**不要把本题答成数据平台编排课。** 把开放任务画成十二节点 DAG，是 over-engineering；把关单做成 Agent loop，是答错章。",
        "",
        d2(`
grid-columns: 2
cron: {
  label: "本章 · cron/延迟"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "时钟触发"
  b.class: ok
  b: "无模型"
}
agent: {
  label: "Ch34 · Agent"
  class: group
  grid-columns: 2
  c.class: step
  c: "模型选步"
  d.class: step
  d: "run 落库"
}
`),
        "",
        "| | 本章（cron / 延迟） | Ch34 Agent 编排 |",
        "|---|---|---|",
        "| 谁决定下一步 | **时钟 / cron / delay** | 模型（bounded loop）或 **代码边**（workflow） |",
        "| 有没有 LLM | **无** | 每步可能打 Ch32 |",
        "| 双发 | 分片 + 锁 + fencing | `run_id` + 补偿；不是抢 cron 槽 |",
        "| 工作流 | **点到**；默认独立 job | loop vs state machine 是那章 hard part |",
        "| HITL / handoff | 没有 | 那章才有 |",
        "",
        "Ch34 可以 **调用** 本章：例如「每夜跑对账」仍是 cron 叫醒一个无模型 job；job 里面不要嵌 ReAct。反过来，Agent run 的超时重试是工具层（Ch33）和补偿，不是再实现一套 XXL-JOB。**一张对照表就停，不重写 Agent runtime。**",
        "",
        "副作用收口（两章共用陈词，机制在 Ch41）：handler **幂等**（关单 CAS、对账按日 UNIQUE）；本地事务改 run 状态 + Outbox 再通知。at-least-once 投递不可消灭，只能把效果做成 at-most-once。",
        "",
        "**面试怎么说：**",
        "",
        "> 「延迟用轮或延迟队列，别每分钟扫全表。DAG 点到引擎，默认独立 job。Ch34 是模型循环，本章是时钟。handler 幂等加 Outbox。」",
        "",
        "trade-off：扫表实现快、job 变多会打满 DB；time wheel 快、要重建和 misfire。把 K8s CronJob YAML 画满白板，不得分。",
      ].join("\n"),
    },
    {
      id: "sec-2026",
      heading: "2026 vs 网上旧答",
      secNum: null,
      related: [],
      body: [
        "<details>",
        "<summary>无 Xu 专章 · 不要把单机 cron / 某厂 QPS 当第一答案</summary>",
        "",
        "Alex Xu 两卷没有「设计任务调度」专章。网上旧答大量是：单机 Spring `@Scheduled`、只背 Quartz API、K8s CronJob YAML、Airflow 截图、或把 Redlock 当集群唯一解。**正文按 2026 公开面试（分布式 crontab / XXL-JOB / Quartz 集群口径）重写**，不是笔记润色，也不是产品手册。",
        "",
        "| 网上旧答 / 早期工程 | 现在怎么答 |",
        "|---|---|---|",
        "| 单进程 `@Scheduled` / crontab | **多 worker + 分片 + 抢锁**；单机在集群里就是双发 |",
        "| Quartz 表结构默写当架构 | **Scheduler → Lock → Worker**；Quartz 集群锁只当 pattern |",
        "| XXL-JOB 菜单 / 路由策略清单 | 记 DB 锁、time wheel、misfire 两策略；不当产品课 |",
        "| 默认 catch-up 补光 | **按 job**；系统默认 skip / fire-once-now；对账用 watermark |",
        "| Airflow 当第一张图 | DAG **点到**；白板独立 job。Airflow 3 默认不再 catchup 只作旁证 |",
        "| K8s CronJob YAML | 容器化独立周期可以点一句；**不保证恰好一次**，不是本题 |",
        "| Redlock 五节点 | **Ch08**：效率锁 SET NX；写库 fencing。本章不重写 |",
        "| 每分钟扫全表当延迟 | **time wheel / delay queue**；DB 仍是权威 |",
        "| 和 Agent 编排画在一起 | **对照表一句**；模型循环是 Ch34 |",
        "| 某厂调度 QPS / 内部分片数 | **禁止**；只用教学数量级 |",
        "| handler 里同步 RPC 再标成功 | **幂等 + Outbox**（Ch41） |",
        "",
        "仍成立的骨架：到期要互斥认领、handler 要幂等、错过要有策略、延迟和 cron 不是同一种数据结构。过时的是单机定时器当分布式答案，以及把工作流产品 / Agent runtime 画进第一张图。",
        "",
        "</details>",
      ].join("\n"),
    },
    {
      id: "sec-traps",
      heading: "追问陷阱",
      secNum: null,
      related: ["ch08", "ch34", "ch41"],
      body: [
        "1. **「和 Ch34 什么关系？」** → 本章无模型，时钟触发。Ch34 是 bounded loop / workflow。对照表一句，不重写 runtime。",
        "2. **「为什么不能每台机器各写一个 crontab？」** → 每台都会火。必须分片或抢锁，再加 run 唯一键。",
        "3. **「分片了还要锁？」** → failover / split-brain 时两个节点会抢同一 shard。分片减冲突，锁和 UNIQUE 收口。",
        "4. **「为什么要点 fencing？」** → 锁是租约，过期后旧 worker 可能还在跑（Ch08）。写 `runs` / 业务表拒旧号。不重讲 Redlock。",
        "5. **「SKIP LOCKED 算不算锁？」** → 算认领。行锁保证各实例领不同到期行。写业务仍建议 UNIQUE + 幂等。",
        "6. **「misfire 默认补全？」** → 不要。skip / fire-once-now 当系统默认；对账用 watermark。catch-up 会风暴。",
        "7. **「挂了两小时、每分钟的 job？」** → catch-up ≈ 120 次。说数字，然后改策略或改成补窗口。",
        "8. **「延迟关单为什么不每分钟 SELECT 未关订单？」** → 订单变多扫描就是 bottleneck。`delay_until` / wheel / 延迟队列。关单本身 CAS。",
        "9. **「要不要 DAG？」** → 默认独立 job。真依赖用工作流引擎，点到即停。不要 Airflow 课。",
        "10. **「K8s CronJob？」** → 独立周期容器可以。YAML 不是本题；文档也不保证恰好一次。",
        "11. **「XXL-JOB / Quartz 哪个对？」** → 都是 pattern：中心锁或 DB 锁、misfire 策略、可选 time wheel。白板不绑产品。",
        "12. **「副作用失败了？」** → handler 幂等；Outbox 投递（Ch41）。不要触发成功但下游 RPC 失败却不留痕迹。",
        "13. **终图已经很大了还往上堆？** → 分片算法论文、K8s Operator、多 Region 调度、Agent 工具循环都不是本章第一答案。讲透三条 hard part 比画 20 个框得分高。",
      ].join("\n"),
    },
    {
      id: "sec-next",
      heading: "wrap-up 与下一步",
      secNum: null,
      related: ["ch26"],
      body: [
        "收尾不要说完美。三个 bottleneck 口播：",
        "",
        "| bottleneck | 你怎么接 |",
        "|---|---|",
        "| 两节点双发 | 分片减冲突；SET NX / SKIP LOCKED 认领；`(job_id, scheduled_at)` UNIQUE；写库 fencing（Ch08） |",
        "| misfire 风暴或漏窗口 | 按 job：skip / fire-once-now / watermark 补段；禁止默默 catch-up 全档 |",
        "| 答成 Agent 或 DAG 产品 | 本章是时钟 + 独立 job；DAG 点到引擎；模型循环是 Ch34 |",
        "",
        "自测：合上这一页，用 30 秒开场 + 白板 Scheduler → Lock → Worker，把分片、抢锁、fencing、skip vs catch-up、延迟轮、和 Ch34 的对照讲给空气听。哪句卡，回哪一节。不要开口重讲 Redlock，不要画 Agent loop。",
        "",
        "下一道题是 **Ch26 · 红包系统**。调度把「到点只跑一次」讲完；红包换成 **拆包、库存、防超发、对账**——和支付 / 订单的边界会再咬一口。",
      ].join("\n"),
    },
  ],
  reviewMd: `# Ch25 · 记忆闪卡

| # | 正面 | 背面 |
|---|---|---|
| 1 | 任务调度三个 hard part？ | 分片抢锁避免双发；misfire 错过补偿；和 Ch34 Agent 编排的边界。 |
| 2 | 默认范围？ | **后端 cron + 延迟**（对账、关单、重试）。不是 K8s YAML、不是 Airflow 课、不是 Ch34。 |
| 3 | 高层三个框？ | **Scheduler → Lock → Worker**。元数据在库；handler 幂等 + Outbox。 |
| 4 | 为什么要分片还要锁？ | 分片减扫描和冲突；failover 仍可能双持同一 shard，靠抢锁 / UNIQUE / fencing 收口。 |
| 5 | 同一火点怎么只跑一次？ | 认领：SET NX 或 SKIP LOCKED；\`runs(job_id, scheduled_at)\` UNIQUE；写库带 fencing（Ch08）。 |
| 6 | 为什么不把 Redlock 当本章默认？ | 锁章已否。效率锁单 Redis；正确性靠 fence 或 DB 约束。本章不重写。 |
| 7 | skip vs catch-up？ | skip 只排下次（巡检/缓存）；catch-up 补每一档（易风暴）；折中 fire-once-now。按 job 配。 |
| 8 | 对账 misfire 怎么补更干净？ | **watermark / 业务日窗口**，不要把每分钟 trigger 重放一百遍。 |
| 9 | 延迟关单为什么不用每分钟扫全表？ | 订单变多即 bottleneck。time wheel / delay queue / \`delay_until\`；关单 CAS 幂等。 |
| 10 | DAG 在白板怎么点？ | 默认 **独立 job**。真依赖用工作流引擎，点到即停。不自研拓扑、不讲 Airflow 产品。 |
| 11 | 和 Ch34 怎么切？ | 本章时钟、无模型。Ch34 模型选步或代码边 + run 落库。对照表一句。 |
| 12 | 这题最大的 over-engineering？ | 单机 cron 当集群解、Redlock、全局 catch-up、K8s YAML、Agent loop、某厂 QPS。 |`,
});
