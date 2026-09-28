import { writeChapter } from "./write-chapter.mjs";

const d2 = (src) => {
  const body = src.trim();
  const sized = /style\.font-size/.test(body) ? body : `style.font-size: 12\n${body}`;
  return "```d2\n" + sized + "\n```";
};

writeChapter({
  id: "ch08",
  num: "08",
  title: "分布式锁",
  kind: "brick",
  relatedChapters: ["ch41"],
  sections: [
    {
      id: "intro",
      heading: "",
      secNum: null,
      related: ["ch41"],
      body: [
        "> **预计**：45–55 分钟 ｜ **前置**：复制/超时见 Ch41",
        "> **目标**：Redis SET NX + fencing；**不要把 Redlock 当默认**；看门狗与业务超时。",
        "",
        "分布式锁是 M2 第五块砖，也是骨架车道的收束：多实例抢同一份库存、同一条定时任务、同一段临界区，进程内 `synchronized` 看不见隔壁机器。面试官要的不是五种锁实现平均默写，而是三句能落地的话：**效率锁默认 Redis `SET key token NX PX ttl` + Lua 比对再删；临界区写存储就加 fencing token；不要把 Redlock 当默认。**",
        "",
        "hard part（最该挖的那块）就是这三块：**SET NX + TTL + 安全解锁**；**fencing token vs Redlock**；**看门狗续期 vs GC pause / 业务超时**。可重入（同一 owner token + 引用计数）可选，点到即可。共识 lease（etcd / ZK / Chubby）在「正确性锁、已经有协调服务」时再抬出来，**不要把本章写成 Raft 课**——复制与超时机制见 **Ch41**。",
      ].join("\n"),
    },
    {
      id: "sec-answer",
      heading: "面试怎么答",
      secNum: null,
      related: ["ch41"],
      body: [
        "### 开场 30 秒",
        "",
        "> 「先分清效率锁还是正确性锁。防重复干活、偶尔双跑可接受：Redis `SET key token NX PX ttl`，解锁用 Lua compare-and-del。临界区要写库、双写会坏数据：必须加 fencing token——锁服务发单调递增号，存储拒绝旧号。不要把 Redlock 当默认：独立 Redis 节点上的多数派不是共识，还吃时钟。要共识 lease 用 etcd / ZK / Chubby。hard part 是 TTL 和业务超时：看门狗挡不住 GC pause 超过 TTL；业务必须短于锁 TTL，否则锁过期了人还在干活。」",
        "",
        "说完按这条链走，别一上来画五台独立 Redis 当「高可用锁」。",
        "",
        d2(`
direction: right
s1.class: go
s1: "1 效率/正确"
s2.class: step
s2: "2 SET NX"
s3.class: ok
s3: "3 fencing"
s4.class: warn
s4: "4 TTL/超时"
s1 -> s2 -> s3 -> s4
`),
        "",
        "| 时间盒 | 你在做什么 |",
        "|---|---|",
        "| 3–5 min | 澄清：效率 vs 正确；写不写存储；业务多久；可重入 |",
        "| 2 min | 粗估：锁 QPS（不是业务 QPS）；TTL vs 业务 P99 |",
        "| 8–12 min | 高层：Redis SET NX vs etcd lease；否掉 Redlock 默认 |",
        "| 10–15 min | deep dive：安全解锁、fencing、看门狗 vs GC / 业务超时 |",
        "| 2–3 min | wrap-up：唯一约束往往更好；failover 双持有靠 fencing |",
        "",
        "**red flag：** 把 Redlock 当第一答案；`SETNX` 再 `EXPIRE`（中间崩溃锁永不释放）；解锁直接 `DEL`（删掉别人的锁）；不提 fencing 却保证「绝对互斥」；业务可能跑 60 秒却把 TTL 设成 10 秒还说没问题。",
      ].join("\n"),
    },
    {
      id: "sec-clarify",
      heading: "澄清问题清单",
      secNum: "8.1",
      related: ["ch41"],
      body: [
        "没问清「坏了会怎样」，后面的 Redis 和 etcd 都是空的。问 5–7 个就停，其余写假设。Raft / 复制拓扑丢给 **Ch41**，本章只定锁的语义。",
        "",
        "| 你问 | 为什么问 | 写到白板上的默认假设 |",
        "|---|---|---|",
        "| 双跑是浪费还是坏账？ | 效率锁 vs 正确性锁；决定要不要 fencing / 共识 | 「调度去重 = 效率；扣库存 / 记账 = 正确」 |",
        "| 临界区写不写共享存储？ | 写存储才必须 fencing；只挡重复计算可以不 fence | 「会写 DB → 带 fencing token」 |",
        "| 业务大概多久？P99？有没有硬超时？ | 定 TTL；业务必须短于锁，或看门狗 + 仍要 fence | 「P99 2 秒，TTL 10 秒，硬超时 8 秒」 |",
        "| 同一进程会不会重入？ | 可重入 = 同一 owner + 引用计数，可选 | 「先不可重入；要可重入再加计数」 |",
        "| 已经有 Redis，还是已经有 etcd / ZK？ | 别为效率锁新开协调集群 | 「已有 Redis → SET NX；正确性且已有 etcd → lease」 |",
        "| 抢不到是重试、失败，还是排队？ | 锁不是队列；秒杀库存另有题 | 「tryLock 失败就返回，不在锁上排队」 |",
        "",
        "面试官说「你来假设」时写上去：",
        "",
        "> 「假设：多实例抢同一资源。调度类当效率锁，Redis SET NX + Lua 解锁。扣库存 / 写账本当正确性锁，同一套 Redis 加上 fencing token，存储拒旧号。业务 P99 2 秒，TTL 10 秒。不要 Redlock。能用 DB 唯一约束的，先问能不能不用锁。」",
        "",
        "对方一说「保证绝对互斥、钱不能花两次」，**立刻把 fencing 或唯一约束写上**，不要只加长 TTL。对方说「就是防两个 worker 领同一条 cron」，效率锁即可，上五节点 Redlock 是 over-engineering。",
      ].join("\n"),
    },
    {
      id: "sec-estimate",
      heading: "粗估：锁 QPS 与 TTL",
      secNum: "8.2",
      related: [],
      body: [
        "这章的 back-of-envelope 要证明两件事：**加锁 QPS 通常远小于业务 QPS**；以及 **TTL 不是拍脑袋，要和业务超时对齐**。数字是教学用，不是某厂容量规划。",
        "",
        "教学假设：入口 **1 万 QPS**，真正争同一把锁的是热点 SKU / 分片任务，全局加解锁约 **1 千次/秒**；单把热锁串行，有效吞吐被临界区长度卡住。",
        "",
        "| 项 | 口算 | 面试怎么用 |",
        "|---|---|---|",
        "| 加解锁 QPS | 1 千 acquire/s，不是 1 万 | Redis SET 单实例十万级，**锁服务通常不是 bottleneck** |",
        "| 热锁吞吐 | 临界区 20 ms → 约 50/s | **同一把锁串行**才是顶；拆 key，不要先上集群 |",
        "| TTL | **10 s** | 崩溃后最多卡 10 秒；太长 failover 慢 |",
        "| 业务 P99 | **2 s** | 余量 5×；P99 若到 12 s → 锁先过期 |",
        "| 硬超时 | **8 s** 砍请求 | 业务超时 < 锁 TTL，这是硬约束 |",
        "| 看门狗 | 租约 30 s，约 10 s 续一次 | 挡「活着但跑得久」；**挡不住 STW 超过剩余 TTL** |",
        "",
        "余量怎么说：TTL 要盖住 P99 + 同城 RTT + 一点抖动，但不要盖住「可能跑一分钟」——那是把死锁窗口拉长。业务有硬超时（8 s abort）比把 TTL 调到 5 分钟更干净。看门狗把租约续在「进程还活着」上，代价是崩溃后别人要等一个租约；这是 trade-off，不是免费午餐。",
        "",
        "**面试怎么说：**",
        "",
        "> 「一万 QPS 里真正打锁的大概一千。Redis SET 不是这题 bottleneck，同一把热锁才是。TTL 十秒，业务 P99 两秒、硬超时八秒——业务必须短于锁。看门狗续三十秒租约，但 GC 卡住超过 TTL 仍可能双持有，所以写库还要 fencing。」",
        "",
        "不要从「Redis 很快」反推成「所以上 Redlock 五节点」——那是 over-engineering。",
      ].join("\n"),
    },
    {
      id: "sec-arch",
      heading: "高层：Redis SET NX vs etcd lease",
      secNum: "8.3",
      related: ["ch41"],
      body: [
        "白板先摆两格：**效率锁 Redis；要共识 lease 再 etcd / ZK。** Redlock 不是第三列默认，放 why-not。",
        "",
        d2(`
grid-columns: 2
rds: {
  label: "Redis SET NX"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "快、已有栈"
  b.class: warn
  b: "写库要 fence"
}
lease: {
  label: "etcd / ZK lease"
  class: group
  grid-columns: 2
  c.class: step
  c: "共识租约"
  d.class: step
  d: "revision/zxid"
}
`),
        "",
        "本图引用：Ch41 复制、分片、事务",
        "",
        "热路径：Worker `SET lock:sku token NX PX 10000` 成功 → 干活 → Lua 确认 value 仍是自己的 token 再 `DEL`。etcd：把 key 挂在 **lease** 上，`KeepAlive` 续租；会话死了 key 没。ZK：临时顺序节点，最小序号持锁。Chubby 同族（锁世代号当 fence）。共识怎么选主、怎么复制 **点到 Ch41**，白板不要展开 Raft 日志。",
        "",
        "| | Redis SET NX（效率默认） | etcd / ZK lease |",
        "|---|---|---|",
        "| 语义 | 带 TTL 的租约，不是永久互斥 | 会话 / lease，心跳断了才丢 |",
        "| 延迟 | 亚毫秒～1 ms | 通常 5–20 ms 量级 |",
        "| 正确性 | AP；主从 failover 可能短暂双持有 | 线性一致租约；仍建议 fencing |",
        "| fence 从哪来 | 另做 `INCR` 单调号，或存储版本 | etcd **revision** / ZK **zxid** |",
        "| 适合 | 已有 Redis、去重、短临界区 | 已有协调集群、选主、正确性锁 |",
        "",
        "why-not 两句就停：",
        "",
        "1. **Redlock（五台独立 Redis 多数派）**：独立节点 ≠ 共识；依赖有界时钟和有界 pause；UUID **不能**当 fencing token。不当默认，争议进折叠。",
        "2. **能用 DB 唯一约束就别加锁。** `INSERT … 唯一键` 失败 = 别人已占坑。幂等键、库存行 `UPDATE … WHERE version=` 往往比分布式锁更短、更硬。锁是协调，约束才是存储自己的互斥。",
        "",
        "**面试怎么说：**",
        "",
        "> 「效率锁 Redis SET NX。正确性锁同一套 Redis 加 fencing，或者已经有 etcd / ZK 就用 lease，revision / zxid 当 fence。Redlock 不当默认。能 unique / CAS 的先不用锁。」",
        "",
        "高层到这里停，问一句：「两格 OK 吗？下面先写安全加解锁，再讲为什么 Redlock 不是默认，最后讲看门狗和业务超时。」",
      ].join("\n"),
    },
    {
      id: "sec-setnx",
      heading: "深入 · SET NX + TTL + 安全解锁",
      secNum: "8.4",
      related: [],
      body: [
        "第一个 hard part：**加锁必须一条命令带过期；解锁必须比对 owner，不能裸 DEL。**",
        "",
        "错误拆成两步 `SETNX` 再 `EXPIRE`：中间进程被杀，key 没有 TTL → **死锁**。2026 白板只写一条：",
        "",
        "`SET lock:sku <token> NX PX 10000`",
        "",
        "`NX` = 不存在才写；`PX` = 毫秒过期。`token` 是这次持有者的随机串（UUID），**不要写成 1**。成功才进临界区；失败就是没抢到。",
        "",
        d2(`
shape: sequence_diagram
w: "Worker"
r: "Redis"
s: "Store"
w -> r: "SET NX PX"
r -> w: "OK token"
w -> s: "干活"
w -> r: "Lua 比对删"
`),
        "",
        "解锁：`GET` 再 `DEL` 中间别人可能已经因 TTL 拿走这把锁——你会删掉**下一任**的 key。Lua 在 Redis 里串行：",
        "",
        "```",
        "if redis.call('GET', KEYS[1]) == ARGV[1] then",
        "  return redis.call('DEL', KEYS[1])",
        "else",
        "  return 0",
        "end",
        "```",
        "",
        "pipeline 多条命令之间仍可被插队，**不要把 pipeline 说成 Lua 的替代品**（和 Ch04 限流同一句话）。",
        "",
        d2(`
direction: right
acq.class: go
acq: "SET NX token"
hold.class: step
hold: "同一 owner"
unl.class: ok
unl: "Lua 比对删"
acq -> hold -> unl
`),
        "",
        "可重入（可选，不是默认）：同一 owner token 再抢成功则 **引用计数 +1**，解锁 -1，到 0 才 DEL。Redisson 这条生产常见。面试先不可重入，被问再加计数——不要一上来讲可重入可重入锁全家桶。",
        "",
        "主从 failover 一句：锁写在内存主上、未复制就 failover，新主没有这把锁，另一客户端 `SET NX` 成功 → **双持有**。WAIT replica、或接受窗口并靠 fencing。展开复制进 **Ch41**。",
        "",
        "**面试怎么说：**",
        "",
        "> 「一条 `SET token NX PX`。token 标识持有者。解锁 Lua：值还是我才 DEL。SETNX+EXPIRE 和裸 DEL 都是 red flag。可重入就同一 token 加计数。」",
      ].join("\n"),
    },
    {
      id: "sec-fence",
      heading: "深入 · fencing token vs Redlock",
      secNum: "8.5",
      related: ["ch41"],
      body: [
        "第二个 hard part：**锁过期了，持有者可能还活着。** 这不是实现 bug，是租约的定义。Kleppmann（2016，《How to do distributed locking》）把这叫 lease：GC pause、网络延迟、STW，客户端以为自己还持锁，Redis 已经把 key 删了，B 拿到锁，A 醒来照写。",
        "",
        "fencing token：每次成功加锁发一个**严格单调递增**的整数。写存储时带上这个号；存储记下见过的最大号，**更小的一律拒绝**。A 是 33，过期后 B 是 34；A 的写带着 33，存储已经见过 34 → 拒。僵尸写被 fence 在门外。",
        "",
        "Redis 侧：单独 `INCR lock:sku:fence`（这把 key **不要**跟锁一起过期），或 etcd revision / ZK zxid。存储侧：`UPDATE … WHERE last_fence < $token`。**资源必须配合**——第三方 API 不能条件写，fencing 就落不了地，锁最多是尽力而为。",
        "",
        d2(`
grid-columns: 2
rl: {
  label: "Redlock 不当默认"
  class: groupBad
  grid-columns: 2
  a.class: bad
  a: "时钟+pause"
  b.class: bad
  b: "无 fencing"
}
ft: {
  label: "fencing token"
  class: groupOk
  grid-columns: 2
  c.class: ok
  c: "单调递增"
  d.class: ok
  d: "存储拒旧号"
}
`),
        "",
        "本图引用：Ch41 复制、分片、事务",
        "",
        "Redlock（Antirez）：向 **N 台独立 Redis**（常 5）并行 `SET NX PX`，拿到多数（≥3）且耗时仍小于 TTL 才算持锁；有效期还要减 clock-drift。它解决的是「单 Redis 挂了锁丢了」，**没有**给出可比较的 fencing 号——值是随机 UUID，存储无法判断谁更新。独立节点多数派 **不是** Raft / Zab：没有复制日志、没有同一份状态机。正确性还假设网络延迟、进程暂停、时钟漂移都相对 TTL 很小——真实 STW 和 NTP step 会打破这个同步模型。",
        "",
        "所以 2026 白板：**不要把 Redlock 当默认答案。** 效率锁一台 Redis 足够；正确性锁要 fencing，或改 etcd/ZK 共识 lease。五台独立 Redis 当「更正确」是 red flag。Antirez 的答辩（《Is Redlock safe?》）承认应用单调时钟、强调相对计时在机房里够用——**两边都知道**，面试站 Kleppmann 这一侧当正确性默认即可，细节进折叠。",
        "",
        "**面试怎么说：**",
        "",
        "> 「租约会过期，过期后原持有者仍可能写。fencing token 让存储拒旧号，这是写库时的默认补丁。Redlock 没有单调 token，还吃时钟，独立节点不是共识。不当默认。」",
      ].join("\n"),
    },
    {
      id: "sec-watchdog",
      heading: "深入 · 看门狗 vs GC pause / 业务超时",
      secNum: "8.6",
      related: ["ch41"],
      body: [
        "第三个 hard part：**业务超时必须短于锁 TTL；看门狗续的是「进程还活着」，不是「我还没写完所以永远安全」。**",
        "",
        "固定 TTL 的两难：太短 → 活着的工作没做完锁没了；太长 → 崩溃后别人要干等到期。看门狗（Redisson `lockWatchdogTimeout` 默认 30 s，约每 TTL/3 续一次）在**未指定 leaseTime** 时后台把 TTL 续满：进程活着就能跑完长任务；进程死了续不上，锁自行过期。指定了 leaseTime 就**不再续**——那是你自己保证临界区短于租约。",
        "",
        d2(`
grid-columns: 2
wd: {
  label: "看门狗续期"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "活着就续"
  b.class: ok
  b: "崩溃则过期"
}
dead: {
  label: "过期仍在干活"
  class: groupBad
  grid-columns: 2
  c.class: bad
  c: "GC 超 TTL"
  d.class: warn
  d: "业务 > TTL"
}
`),
        "",
        "看门狗**和业务线程一起停**。Full GC / 机器 pause 超过剩余 TTL：Redis 照样到期，B 抢到锁，A 醒来以为续过、继续写。续期线程救不了「整个 JVM 没在跑」。所以：**pause 超过 TTL 必须当成锁已丢**，写库仍靠 fencing；不要吹「有看门狗就绝对互斥」。",
        "",
        "业务超时是另一条轴，常被漏：",
        "",
        "| 规则 | 为什么 |",
        "|---|---|",
        "| **业务硬超时 < 锁 TTL**（无看门狗时） | 否则锁没了人还在临界区，这就是双写窗口 |",
        "| 有看门狗：仍设业务硬超时 | 避免任务跑飞；崩溃等待上限仍是一个租约 |",
        "| 临近 TTL 就 abort，不要再写存储 | 比「再续一次碰运气」干净 |",
        "| 超时后的补偿 / 回滚 | 锁不管事务；Outbox / 状态机见 **Ch41** |",
        "",
        "教学口播：TTL 10 s，硬超时 8 s，P99 2 s。看门狗 30 s 租约只给「偶发超过 10 s 但进程健康」的活。钱相关路径：**看门狗 + fencing**，不要二选一。",
        "",
        "**面试怎么说：**",
        "",
        "> 「无看门狗：业务超时必须小于 TTL。看门狗续的是活着的进程，GC 卡住超过 TTL 仍会双持有。到期还在干活是这题真正的 hard part，写库靠 fencing，不要靠把 TTL 调到五分钟。」",
      ].join("\n"),
    },
    {
      id: "sec-2026",
      heading: "2026 vs 原书",
      secNum: null,
      related: ["ch41"],
      body: [
        "<details>",
        "<summary>Redlock 原博客 vs Kleppmann；Antirez 答辩进这里</summary>",
        "",
        "本章无对应 Xu 专章，按 2026 后端面试重建。网上仍大量把 Redlock 当「Redis 锁的正确打开方式」——那是 2010 年代文档惯性，不是现在的白板默认。",
        "",
        "| 当时怎么讲 | 现在怎么答 |",
        "|---|---|",
        "| Redis 文档 Redlock：5 独立节点、多数派、减 clock-drift | **不当默认。** 效率锁单 Redis SET NX；正确性要 fencing 或 etcd/ZK |",
        "| Kleppmann 2016：Redlock 吃同步假设、**没有 fencing token** | **正文采信这一侧**做正确性答案 |",
        "| Antirez《Is Redlock safe?》：相对计时够用、应改单调时钟 API | 折叠里承认争议；面试正确性仍不把 Redlock 当第一句 |",
        "| `SETNX` + `EXPIRE` 教程满天飞 | **一条 `SET NX PX`**。两步是死锁窗口 |",
        "| 看门狗 = 锁永远正确 | 只解决「活着但慢」；**STW > TTL 仍双持有** |",
        "| 可重入当必讲 | **可选**：owner + 引用计数 |",
        "| 为互斥先上协调集群 | 能 **UNIQUE / CAS** 先不用锁 |",
        "",
        "仍成立的骨架：锁是租约、必须带 TTL、解锁要比对持有者、临界区写共享状态要 fence。过时的是**把 Redlock 当高可用默认**，以及**不把「过期仍在干活」当 hard part**。",
        "",
        "生产一句（仅本折叠）：Redisson `RLock` 看门狗；较新的 `RFencedLock` 加锁返回单调 token——**存储仍要检查**，API 不是魔法。etcd lease / ZK ephemeral 的 fencing 用 revision / zxid，机制链 **Ch41**。",
        "",
        "</details>",
      ].join("\n"),
    },
    {
      id: "sec-traps",
      heading: "追问陷阱",
      secNum: null,
      related: ["ch41"],
      body: [
        "1. 「为什么不用 SETNX 再 EXPIRE？」→ 两步中间崩溃，锁没有 TTL，死锁。一条 `SET NX PX`。",
        "2. 「为什么解锁不直接 DEL？」→ TTL 过了别人已持有，你会删掉下一任。Lua：GET == 我的 token 才 DEL。",
        "3. 「为什么不把 Redlock 当默认？」→ 独立 Redis ≠ 共识；吃时钟和 pause；UUID 不能 fence。效率锁单节点够；正确性要 fencing 或 etcd/ZK。",
        "4. 「什么是 fencing token？」→ 每次加锁单调递增的号；写存储带上；存储拒小于已见最大值的写。",
        "5. 「Redlock 的随机值能不能当 fence？」→ 不能。无序，资源分不出新旧。",
        "6. 「看门狗是不是就安全了？」→ 只续「进程活着」。GC / pause 超过 TTL，看门狗也停，仍可能双持有。",
        "7. 「业务比 TTL 长怎么办？」→ 硬超时砍在 TTL 内；或看门狗 + **仍然 fencing**。不要只把 TTL 调到五分钟。",
        "8. 「和 DB 唯一约束比？」→ 能 `INSERT` 唯一键 / `UPDATE … WHERE version` 就先不用分布式锁。锁是协调，约束是存储互斥。",
        "9. 「可重入怎么做？」→ 同一 owner token + 引用计数，到 0 再 DEL。可选，不是开场。",
        "10. 「Redis 主从 failover？」→ 未复制的锁会丢，新主上别人 SET NX 成功 → 双持有。WAIT 或 fencing。复制细节 Ch41。",
        "11. 「什么时候 etcd / ZK？」→ 已有协调服务、要共识 lease、选主。revision / zxid 天然能当 fence。别为效率锁新开集群。",
        "12. 「保证绝对互斥？」→ 租约做不到绝对。写共享状态靠 fencing 或唯一约束。吹「Redlock 绝对安全」是 red flag。",
      ].join("\n"),
    },
    {
      id: "sec-next",
      heading: "下一步",
      secNum: null,
      related: ["ch09"],
      body: [
        "收尾不要说完美。三个 bottleneck 口播：",
        "",
        "| bottleneck | 你怎么接 |",
        "|---|---|",
        "| 过期仍在干活 | fencing；业务超时 < TTL；pause 超 TTL 当丢锁 |",
        "| 热锁串行 | 拆 key / 缩小临界区；不要先上 Redlock 集群 |",
        "| failover 双持有 | 复制窗口 + fencing；机制见 Ch41 |",
        "",
        "自测：合上页，30 秒开场；写出 `SET NX PX` 和 Lua 比对删；说出 Redlock 为什么不是默认；fencing token 一句话；看门狗 vs GC；业务超时为什么必须短于 TTL。哪句卡，回哪一节。",
        "",
        "**M2 经典构件到此结束。** 设计题从 **Ch09 · 设计短链服务** 已在站内（case 样板）；你可以现在去 Ch09 开 M3，或等主线把 M3 后续题读完。骨架车道（Ch02–Ch08）收束，下一章不是再写一块砖。",
      ].join("\n"),
    },
  ],
  reviewMd: `# Ch08 · 记忆闪卡

| # | 正面 | 背面 |
|---|---|---|
| 1 | 分布式锁开场 30 秒说什么？ | 效率锁 Redis SET NX PX + Lua 解锁；写存储加 fencing token；不要把 Redlock 当默认；TTL 对齐业务超时。 |
| 2 | 加锁为什么必须一条 SET NX PX？ | SETNX 再 EXPIRE 中间崩溃会没有 TTL → 死锁。NX+PX 原子。 |
| 3 | 解锁为什么要用 Lua 比对 token？ | 裸 DEL 可能删掉 TTL 过期后别人持有的锁。GET==我的 token 才 DEL。 |
| 4 | token 存在 key 里干什么？ | 标识持有者。可重入就同一 token + 引用计数。不要存 1。 |
| 5 | 什么是 fencing token？ | 每次加锁单调递增的号；写存储带上；存储拒绝小于已见最大值的写。 |
| 6 | 为什么不要把 Redlock 当默认？ | 独立节点多数派不是共识；吃时钟和 pause；随机 UUID 不能 fence。 |
| 7 | 效率锁 vs 正确性锁？ | 双跑只浪费 → 单 Redis 即可。双跑坏数据 → fencing 或 etcd/ZK lease。 |
| 8 | 何时用 etcd / ZK 而不是 Redis？ | 已有协调集群、要共识 lease、选主。revision / zxid 当 fence。别为去重新开集群。 |
| 9 | 看门狗续期解决什么、不解决什么？ | 活着的长任务续 TTL；崩溃则停续。GC pause 超过 TTL 时它也停，仍可能双持有。 |
| 10 | 业务超时和锁 TTL 什么关系？ | 业务硬超时必须 < 锁 TTL（无看门狗时）。到期还在干活是 hard part。 |
| 11 | 什么时候不该用分布式锁？ | 能用 UNIQUE / CAS / 幂等键解决互斥时。锁是协调，约束才是存储互斥。 |
| 12 | Redis 主从 failover 和锁？ | 未复制的锁会丢，新主上别人可 SET NX → 双持有。靠 WAIT 或 fencing。Ch41。 |
| 13 | 热锁的 bottleneck 是什么？ | 同一把锁串行，吞吐 ≈ 1/临界区。拆 key，不要先上五节点 Redlock。 |
| 14 | 这题典型的 over-engineering？ | Redlock 当第一答案；为效率锁上 etcd；把 TTL 调到五分钟假装解决过期双写。 |`,
});
