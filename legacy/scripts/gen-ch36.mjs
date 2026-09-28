import { writeChapter } from "./write-chapter.mjs";

const d2 = (src) => {
  const body = src.trim();
  const sized = /style\.font-size/.test(body) ? body : `style.font-size: 12\n${body}`;
  return "```d2\n" + sized + "\n```";
};

writeChapter({
  id: "ch36",
  num: "36",
  title: "Trade-off：CAP / PACELC / SLO",
  kind: "foundation",
  relatedChapters: ["ch02", "ch03", "ch06", "ch08", "ch11", "ch24"],
  sections: [
    {
      id: "intro",
      heading: "",
      secNum: null,
      related: ["ch03", "ch06"],
      body: [
        "> **预计**：90–120 分钟 ｜ **前置**：Ch03 几个 9；Ch06 AP quorum",
        "> **目标**：纠正 CAP 海报误读；PACELC；SLO 与错误预算。不把 aws 开篇全书搬进来。",
        "",
        "这是 **M6 第一块基础芯片**，不是又一道 4 步设计题。主线里 Ch02 多机房、Ch06 KV、Ch11 Feed、Ch24 支付都会点到「一致还是可用、几个 9 够不够」——本章把那套 **trade-off 语言**讲透，设计题里只引用，不在白板上开课。",
        "",
        "**一句话：** CAP 只约束**分区发生时**；无分区时看 PACELC 的延迟 vs 一致；几个 9 要用 SLO 和 **error budget** 花掉，而不是堆到 5 个 9。",
        "",
        "三个 hard part（最该挖的那块）：",
        "",
        "1. **CAP 误读** —— CA / AP / CP 海报把 CA 当成日常第三种模式",
        "2. **PACELC 日常延迟** —— 分区罕见，平时每次写都在付 L vs C",
        "3. **SLO + error budget 怎么开口** —— SLI / SLO / SLA 分清；30 天预算怎么花、花完怎么办",
        "",
        "本章**不讲**：七大概念全书、Deutsch 八谬误当目录、Chaos Engineering、平台工程、可观测四支柱、某云 Well-Architected 清单。八谬误只在论文节点一句。延迟表、年停机表已经在 **Ch03**——这里不把那张表再抄八行当正文。",
      ].join("\n"),
    },
    {
      id: "sec-pitch",
      heading: "一句话定义 · 面试 20 秒开口",
      secNum: "36.1",
      related: ["ch03", "ch06"],
      body: [
        "先把评分信号打出来：你知道海报是错的，知道平时真正在买的是延迟，知道 9 是预算不是勋章。",
        "",
        "> 「CAP 只在**分区**时成立：不能同时要线性一致、和每个非失败节点都给非错误响应。平时不是在 CA / AP / CP 三张海报里选一张——**CA 不是分布式第三种模式**。分区时选 **CP**（少数派拒绝写，etcd / Spanner）还是 **AP**（继续服务，Dynamo / Cassandra 风格）。无分区看 **PACELC** 的 Else：延迟 vs 一致。SLO 是内部目标，SLI 是怎么测，SLA 是合同。**error budget = 1 − SLO**；99.9% 在 30 天大约 43 分钟，预算内继续发版，耗尽就冻功能发版。5 个 9 常常是 over-engineering。年停机表我按 Ch03，这里讲怎么花预算。」",
        "",
        "整章按这一条链走。上场时 20 秒念完就停，让面试官决定要挖 CAP、PACELC 还是 SLO。",
        "",
        d2(`
direction: right
cap.class: go
cap: "CAP 误读"
pac.class: step
pac: "PACELC"
slo.class: ok
slo: "SLO"
cap -> pac -> slo
`),
        "",
        "本图引用：Ch03 几个 9 · Ch06 AP quorum（机制在后面两节展开）",
        "",
        "| 面试官问法 | 你落在哪一截 |",
        "|---|---|",
        "| 「这系统 CAP 怎么选？」 | 先问**有没有分区、坏了能不能停**；再 CP vs AP |",
        "| 「那平时不分区呢？」 | PACELC Else：同步复制换一致，异步换低延迟 |",
        "| 「要几个 9 / SLA 多少？」 | 先 SLI，再 SLO，SLA 更松；开口 error budget |",
        "",
        "**red flag：** 一上来画 CAP 三角形三选二；把 CA 写成「无分区所以选 CA」当架构选型；把 SLA 和 SLO 混成一个词；全站 5 个 9 却讲不出预算怎么花。",
      ].join("\n"),
    },
    {
      id: "sec-cap",
      heading: "机制 · CAP 误读（海报不是定理）",
      secNum: "36.2",
      related: ["ch06", "ch08"],
      body: [
        "第一个 hard part。2026 面试里，**会背「三选二」不如会拆海报。**",
        "",
        "Brewer 2000 在 PODC 上提出的是**猜想**（后来俗称 Brewer 定理）。**Gilbert & Lynch 2002** 把它证成定理：在异步网络里，一个读写寄存器不能同时提供 **atomic consistency**（线性一致：读一定读到最近一次已完成的写）、**availability**（非失败节点必须给响应）、以及 **partition tolerance**（网络可以丢掉任意多消息）。",
        "",
        "定理管的是**分区正在发生时**的保证，不是「系统出生证上盖 CA / AP / CP 其中一个戳」。",
        "",
        d2(`
grid-columns: 2
poster: {
  label: "海报误读"
  class: groupBad
  grid-columns: 2
  a.class: bad
  a: "平时三选二"
  b.class: bad
  b: "CA 当第三种"
}
correct: {
  label: "正确读法"
  class: groupOk
  grid-columns: 2
  c.class: ok
  c: "只在分区时"
  d.class: ok
  d: "CP 或 AP"
}
`),
        "",
        "**CA 为什么不是第三种模式：** 单机没有分区，谈 CAP 没有意义。一旦有副本、有网络，分区**不是可选项**——光纤会断、交换机有 bug、机房会裂。所谓「选 CA」= 分区时系统不当分布式系统用（停写、或缩成一台），这不是日常架构档位。Brewer 2012 自己写过：*2 of 3* 海报一直在误导；无分区时 C 和 A 可以同时要，你付的是延迟。",
        "",
        "分区来了，只剩两档：",
        "",
        d2(`
grid-columns: 2
cp: {
  label: "分区选 CP"
  class: group
  grid-columns: 2
  a.class: step
  a: "少数派拒绝"
  b.class: warn
  b: "Spanner etcd"
}
ap: {
  label: "分区选 AP"
  class: groupOk
  grid-columns: 2
  c.class: ok
  c: "继续应答"
  d.class: ok
  d: "Dynamo 风格"
}
`),
        "",
        "本图引用：Ch06 键值存储 · Ch08 分布式锁",
        "",
        "| | **CP** | **AP** |",
        "|---|---|---|",
        "| 分区时做什么 | 少数派**拒绝写 / 阻塞读**，避免两边各写各的 | 两边继续接请求，承认暂时分叉 |",
        "| 恢复之后 | 没有分叉要对账（或只有未提交的失败） | 要合并：LWW / 读修复；可能丢并发写 |",
        "| 面试例子 | etcd / ZK lease、Spanner、多数派共识 | Dynamo / Cassandra 风格 KV（Ch06） |",
        "| 典型业务 | 锁、配置、账本、库存预扣 | 会话、购物车、timeline 缓存 |",
        "",
        "Gilbert & Lynch 的 C 比「副本最终一样」严：**线性一致**。Ch06 的 W+R>N 是 **quorum 新鲜度**，不是这一定理里的 C。面试点破这一句，比把 KV 说成「所以我们是 CP」加分。",
        "",
        "**按数据选，不要按整站选。** Ch02 已经说过：账户可以偏一致，Feed 可以偏可用。一张海报盖全站是 red flag。",
        "",
        "面试怎么说：",
        "",
        "> 「我不选 CA。分布式必有分区。这题的数据在分区时是宁可拒绝，还是宁可 stale？锁和钱走 CP；Feed 和会话走 AP。无分区时的延迟，我用 PACELC 讲。」",
      ].join("\n"),
    },
    {
      id: "sec-pacelc",
      heading: "机制 · PACELC：分区罕见，延迟天天付",
      secNum: "36.3",
      related: ["ch06", "ch41"],
      body: [
        "第二个 hard part。CAP 对**无分区**几乎不说话。Abadi 的 **PACELC**（读 pass-elk）：**if Partition then A vs C，Else Latency vs Consistency。**",
        "",
        "分区少见；复制却天天在。每次写等几个副本 ACK，就是在 Else 枝上买 C、付 L；写完就返回、后台追平，就是买 L、付短暂不一致。这才是白板上真正的日常 trade-off。",
        "",
        d2(`
grid-columns: 2
whenP: {
  label: "P then"
  class: group
  grid-columns: 2
  a.class: warn
  a: "A 继续服务"
  c.class: step
  c: "C 拒绝分叉"
}
els: {
  label: "Else 无分区"
  class: groupOk
  grid-columns: 2
  l.class: ok
  l: "L 低延迟"
  e.class: step
  e: "C 等副本"
}
`),
        "",
        "本图引用：Ch06 quorum · Ch41 复制、分片、事务",
        "",
        "四个格子怎么记（**例子不是数据库目录**）：",
        "",
        "| PACELC | 分区时 | 平时 | 面试用哪句 |",
        "|---|---|---|---|",
        "| **PA/EL** | 要可用 | 要低延迟 | Dynamo / Cassandra 默认：异步复制、可调 quorum，W=1 更偏 L |",
        "| **PC/EC** | 要一致 | 仍要一致 | Spanner：Paxos / TrueTime；etcd：Raft 多数派，少数派不写 |",
        "| **PA/EC** | 分区偏可用 | 平时仍等一致 | 少见；别为凑表硬编 |",
        "| **PC/EL** | 分区偏一致 | 平时追低延迟 | 也不要当默认档位背 |",
        "",
        "和 Ch06 对上：默认 N=3 W=2 R=2 是 **PA 底色上的可调**——分区掉一台还能写；平时多等一个 ACK，就是 Else 上往 C 挪了一格，延迟和尾延迟都会上去。W=1 更 EL。把 W+R>N 说成「线性一致 / 我们是 CP」是 red flag。",
        "",
        "跨 AZ / 跨 Region 把 Else 放大：同城 RTT 还可以同步；跨洲同步等于把用户延迟钉在光速上。Ch02 第 7 集那句在这里落地：**按数据选**——账本跨洲也要 EC；timeline 跨洲用 EL + 最终一致。",
        "",
        "面试怎么说：",
        "",
        "> 「CAP 只覆盖分区。PACELC 补上平时：要不要等副本。Feed 我默认 PA/EL；支付账本 PC/EC。Ch06 的 W/R 就是在 EL 和偏 C 之间拧旋钮，不是换定理。」",
      ].join("\n"),
    },
    {
      id: "sec-slo",
      heading: "机制 · SLO 与 error budget（9 怎么花）",
      secNum: "36.4",
      related: ["ch03"],
      body: [
        "第三个 hard part。Ch03 已经让你背 **3 / 4 / 5 个 9 对应年停机**（约 8.8 小时 / 53 分钟 / 5 分钟）。本章不把那张表再抄一遍。这里要把 9 变成**可消费的预算**，并用公开 SRE Workbook 的教法开口——**禁止报某厂内部 SLO 数字。**",
        "",
        d2(`
direction: right
sli.class: go
sli: "SLI 测什么"
slo.class: step
slo: "SLO 目标"
sla.class: warn
sla: "SLA 合同"
sli -> slo -> sla
`),
        "",
        "| 词 | 是什么 | 面试怎么用 |",
        "|---|---|---|",
        "| **SLI** | 怎么测：成功请求 / 有效请求；或「用户能完成结账的比例」 | 先定义事件和窗口，再谈 9 |",
        "| **SLO** | 内部目标：例如 30 天窗口成功请求 ≥ 99.9% | 工程对着它排期、告警、冻发版 |",
        "| **SLA** | 对客户的合同，通常**松于** SLO，破了有钱/券 | 别把合同数字当日常目标 |",
        "| **error budget** | `1 − SLO`：允许失败的比例或时间 | 预算 = 创新配额；花完就转向稳定 |",
        "",
        "链是单向的：**SLI → SLO → SLA**。没有 SLI 的 9 是口号。SLO 紧、SLA 松，是为了在赔钱之前自己先踩刹车。",
        "",
        "### 手算：30 天预算怎么花",
        "",
        "教学窗口用 **30 天**（SRE Workbook 常见口径；不要说成某家内部报表）。",
        "",
        "`30 × 24 × 60 = 43,200` 分钟。",
        "",
        "| SLO | error budget（时间） | 教学请求口径（假设 1000 万有效请求） |",
        "|---|---|---|",
        "| **99.9%** | `43,200 × 0.001 ≈ 43` 分钟 | 允许 **1 万** 次失败 |",
        "| **99.99%** | ≈ **4.3** 分钟 | 允许 **1 千** 次 |",
        "| **99.999%** | ≈ **26** 秒 | 一次稍长的故障就烧光 |",
        "",
        "年停机对照回 **Ch03**。这里只强调：**窗口换成 30 天，数字才像排期。** 一次 20 分钟事故，在 99.9% 里还能剩一半预算；在 99.99% 里已经超支。",
        "",
        "串并联只留一句手算（别开成可用性课）：两个 99.9% 的依赖**串联**，`0.999 × 0.999 ≈ 99.8%`，整条用户路径掉了一个 9。并联独立副本是 `1 − 0.001×0.001`，纸面上 9 很多——**相关故障（同 AZ 电源）会把这条数学废掉**，所以不要靠口算宣称 6 个 9。",
        "",
        d2(`
grid-columns: 2
spend: {
  label: "预算内"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "继续发版"
  b.class: ok
  b: "灰度实验"
}
freeze: {
  label: "预算耗尽"
  class: groupBad
  grid-columns: 2
  c.class: bad
  c: "冻结功能"
  d.class: warn
  d: "只修稳定"
}
`),
        "",
        "公开教法（不是内部政策原文）：预算还在 → 正常发版、灰度、受控实验；**预算烧光 → 冻结功能发版**，只合可靠性 / 安全修复，直到窗口把预算还回来。Ch35 说「SLO 破了就 rollback」——那就是在花（或抢救）这笔预算。",
        "",
        "**5 个 9 常常是 over-engineering。** 核心支付路径可以谈 4 个 9；边缘只读、内部工具 3 个 9 就够。全站 5 个 9 = 多 Region 双活 + 演练 + 拒绝发版，用户往往感知不到，团队却不敢动。面试主动把 SLO **按用户旅程拆开**，比报一个全站 9 更像 strong hire。",
        "",
        "面试怎么说：",
        "",
        "> 「我先定 SLI：结账成功 / 有效结账。SLO 用 99.9%、30 天，error budget 大约 43 分钟。预算内继续发；烧光冻功能。SLA 若对外 99.9%，对内 SLO 会更紧一档。5 个 9 我只给真正不能停的路径，不当全站默认。」",
      ].join("\n"),
    },
    {
      id: "sec-compare",
      heading: "选型表：题怎么落到格子里",
      secNum: "36.5",
      related: ["ch06", "ch08", "ch11", "ch24"],
      body: [
        "白板不要开数据库展销会。用两张对照把 **构件** 和 **业务题** 钉死。",
        "",
        d2(`
grid-columns: 2
ap: {
  label: "AP KV Ch06"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "Dynamo 风格"
  b.class: ok
  b: "分区仍服务"
}
cp: {
  label: "CP 锁 Ch08"
  class: group
  grid-columns: 2
  c.class: step
  c: "etcd lease"
  d.class: warn
  d: "少数派拒绝"
}
`),
        "",
        "本图引用：Ch06 键值存储 · Ch08 分布式锁",
        "",
        d2(`
grid-columns: 2
feed: {
  label: "Feed Ch11"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "可短暂 stale"
  b.class: ok
  b: "PA/EL"
}
pay: {
  label: "支付 Ch24"
  class: group
  grid-columns: 2
  c.class: warn
  c: "账本要对上"
  d.class: step
  d: "PC/EC"
}
`),
        "",
        "本图引用：Ch11 新闻 Feed · Ch24 支付系统",
        "",
        "| 题 / 构件 | 分区时 | Else | SLO 怎么开口 |",
        "|---|---|---|---|",
        "| **Ch06 KV**（会话、购物车） | AP：掉一台仍 get/put | EL：默认 quorum，可把 W/R 拧紧 | 可用性 SLO；允许短暂 stale |",
        "| **Ch08 锁**（扣库存临界区） | CP：少数派不要发锁 | EC：等多数派 / fencing | 正确性 > 锁服务 QPS |",
        "| **Ch11 Feed** | 粉丝可以晚几秒看到 | EL：异步 fan-out | 读路径延迟 SLO；不要全球同时 |",
        "| **Ch24 支付** | 分区宁可拒绝扣款 | EC：账本、幂等、对账 | 成功入账 / 对平；4 个 9 可以谈，5 个 9 要讲代价 |",
        "| **Ch02 多 Region** | 按**数据**拆，不要整站一张海报 | 跨洲同步 = 买 C 付 L | 就近读可以用 EL；写归属 Region |",
        "",
        "同一题里也可以混：Feed 的 **timeline 缓存** AP/EL，**账户 / 关注关系** 可以更紧。支付里 **营销展示** 3 个 9，**账本** 另一条 SLO。这就是「按数据选」。",
        "",
        "面试怎么说：",
        "",
        "> 「KV 和 Feed 我按 AP + 低延迟；锁和支付按 CP + 平时也等一致。SLO 拆旅程，不报一个全站 5 个 9。」",
      ].join("\n"),
    },
    {
      id: "sec-papers",
      heading: "论文与经典系统",
      secNum: "36.6",
      related: ["ch06"],
      body: [
        "M6 要能点名。下面 3 篇必读、2 篇选读。**面试用哪一句**写在表里；不要背页码，不要编造内部结论。",
        "",
        d2(`
direction: right
br.class: go
br: "Brewer 2000"
gl.class: step
gl: "Gilbert 2002"
ab.class: ok
ab: "Abadi PACELC"
br -> gl -> ab
`),
        "",
        "| | 文献 | 必读 / 选读 | 面试用哪一句 |",
        "|---|---|---|---|",
        "| 1 | **Brewer**，PODC 2000 猜想；2012 *CAP Twelve Years Later* | 必读 | 分区时不能同时要 C 和 A；**海报 2 of 3 是误读**，无分区时 C+A 可行、付的是延迟 |",
        "| 2 | **Gilbert & Lynch**，2002，*Brewer's Conjecture and the Feasibility of Consistent, Available, Partition-Tolerant Web Services* | 必读 | 这是**证明**；C = atomic / 线性一致，不是「过一会儿一样」 |",
        "| 3 | **Abadi**，PACELC（2010 短文，2012 *IEEE Computer* 成文） | 必读 | if P then A vs C；**Else L vs C**。CAP 只覆盖罕见分区 |",
        "| 4 | **Deutsch**，分布式计算八谬误 | 选读 | 点一句：**网络不是可靠的、延迟不是零** → 所以 P 不是可选项。不要把八条当本章目录 |",
        "| 5 | **SRE Book / SRE Workbook**（公开：Implementing SLOs、Error Budget Policy） | 选读 | SLI → SLO → SLA；**error budget 花完冻功能发版**。只用公开教法，不报 Google 内部 9 |",
        "",
        "经典系统只当**格子里的钉子**，展开实现留给别章：Dynamo / Cassandra → Ch06；Raft / 复制拓扑 → **Ch41**；B+Tree vs LSM、何时不该用 KV → **Ch37**。Spanner 在面试里一句 TrueTime + 多数派即可，不要开 TrueTime 课。",
      ].join("\n"),
    },
    {
      id: "sec-used",
      heading: "哪些设计题会用到",
      secNum: "36.7",
      related: ["ch02", "ch03", "ch06", "ch08", "ch11", "ch18", "ch24"],
      body: [
        "主线先做题，卡壳再跳进本章。回链不是把 M6 读完再开写。",
        "",
        "| 章 | 会用到哪一句 |",
        "|---|---|",
        "| **Ch02** 扩展 | 多机房 / Active-Active：按数据选 C 还是 A；跨洲同步不是免费的 |",
        "| **Ch03** 估算 | 几个 9 的年停机表在那边；本章把它变成 30 天 error budget |",
        "| **Ch06** KV | 默认 AP + 可调 quorum；W+R>N ≠ 线性一致 |",
        "| **Ch08** 锁 | 正确性锁走 CP / fencing；效率锁不要吹成 CAP 定理 |",
        "| **Ch11** Feed | 秒级最终一致、PA/EL；不要全球同时可见 |",
        "| **Ch18** 订单 | 状态机与库存：钱相关路径偏 CP；展示可以松 |",
        "| **Ch20** MQ | at-least-once 下的「可用」不是账本一致；对账在支付/订单 |",
        "| **Ch21** 秒杀 | 预扣可以 AP 缓存，对账与扣减要能收回；最终以账为准 |",
        "| **Ch24** 支付 | 正确性 > QPS；账本 PC/EC；SLO 看入账与对平 |",
        "| **Ch29 / Ch35** | SLO 破了 rollback = 在花 error budget；平台题也用同一套词 |",
        "",
        "短链、通知、聊天：读路径可以 EL；**未读数、余额、已读回执**哪条必须更紧，当场问清。别给整站贴一张 PACELC 标签。",
      ].join("\n"),
    },
    {
      id: "sec-2026",
      heading: "2026 vs 笔记 / 原书",
      secNum: null,
      related: [],
      body: [
        "<details>",
        "<summary>原书 / 笔记当时怎么讲 · 七大概念全书和堆 9 进这里</summary>",
        "",
        "笔记对应 AWS 书开篇：七大概念、八谬误、CAP 海报、可用性 nines 长表。**那不是本章正文。** 2026 上场只带三条 trade-off 语言。",
        "",
        "| 原书 / 笔记 | 现在怎么答 |",
        "|---|---|",
        "| 三选二海报；CA 写成一种分布式模式 | **只在分区时 CP vs AP**；CA 不是第三档 |",
        "| CAP 讲透，PACELC 一句话 | **PACELC 补上平时 L vs C**；分区罕见、延迟天天付 |",
        "| 可用性 = 堆 9，追求 5–6 个 9 | **error budget**；5 个 9 常是 over-engineering；年停机表见 Ch03 |",
        "| 七大概念 + 八谬误当开篇目录 | 本章只讲 CAP / PACELC / SLO；八谬误选读一句 |",
        "| 可观测四支柱 / Chaos / 平台工程 / Well-Architected | **不是本章** |",
        "| 云产品目录（某家全球表 vs 某家监控） | 用 Dynamo / Cassandra vs Spanner / etcd 当格子，不当购物清单 |",
        "| W+R>N 直接等于 CAP 的 C | quorum 新鲜度；线性一致是 Gilbert & Lynch 那套 |",
        "",
        "正文第一答案用现在这套。折叠只防止你把开篇全书搬上白板。",
        "",
        "</details>",
      ].join("\n"),
    },
    {
      id: "sec-traps",
      heading: "追问陷阱",
      secNum: null,
      related: ["ch03", "ch06"],
      body: [
        "1. **CAP 是三选二吗？** → 海报说法。定理管分区时；无分区不是在放弃 P。",
        "2. **为什么不能选 CA？** → 有网络就会分区。选 CA = 分区时不当分布式系统。",
        "3. **Brewer 和 Gilbert & Lynch 谁算数？** → 猜想 vs **2002 证明**。面试说「定理」时指后者的 C/A/P 定义。",
        "4. **CAP 和 PACELC 区别？** → CAP ⊂ 分区枝；PACELC 加上 Else 的 L vs C。",
        "5. **Cassandra 是 AP 所以没有一致？** → 可调。默认偏 PA/EL；W/R 拧紧是在买延迟。仍不是线性一致。",
        "6. **etcd 挂了半数还能写吗？** → 多数派才能写，这就是 CP。",
        "7. **SLO 和 SLA 哪个严？** → 对内 SLO 通常更紧；SLA 是合同。",
        "8. **99.9% 一个月能挂多久？** → 教学：30 天约 **43 分钟**。年停机约 8.8 小时在 Ch03。",
        "9. **为什么不追 5 个 9？** → 预算只剩约 26 秒/30 天；全站做是 over-engineering。按旅程拆。",
        "10. **error budget 花完还发版？** → 公开教法：冻功能，只修稳定。继续堆功能是 red flag。",
        "11. **可靠性和可用性一样吗？** → 不一样。可靠 = 少出错；可用 = 需要时给响应。SLO 要两者都进 SLI，不是同义词。",
        "12. **两个 99.9% 串联还是 99.9%？** → 约 99.8%。用户路径上的依赖在吃你的 9。",
        "13. **Feed 要不要强一致？** → 默认不要。Ch11 秒级最终一致。钱和锁另说。",
      ].join("\n"),
    },
    {
      id: "sec-next",
      heading: "下一步",
      secNum: null,
      related: ["ch37"],
      body: [
        "合上页，用 20 秒口播走一遍：海报错在哪、分区如何 CP vs AP、PACELC 的 Else、43 分钟预算怎么花。能手算 `0.999×0.999` 和 30 天 99.9%，并能把 Feed / 支付 / KV 放进格子，这一章就过关。",
        "",
        "下一章 **Ch37 · 存储选型**：关系 / KV / 文档 / 列式 / 对象……以及 B+Tree vs LSM。CAP 格子告诉你「偏 AP 还是偏 CP」；存储章告诉你**引擎和模型怎么接这格**。Dynamo 论文、LSM、Bigtable 在那边展开，这里不要提前开目录。",
        "",
        "自测：左列三句 hard part，中列 PACELC 四格（只填你真用得上的两格），右列一条用户旅程的 SLI / SLO / 预算。不要把七大概念默写回去。",
      ].join("\n"),
    },
  ],
  reviewMd: `# Ch36 · 记忆闪卡

| # | 正面 | 背面 |
|---|---|---|
| 1 | 20 秒怎么开口？ | CAP 只在分区时；不选 CA。分区 CP vs AP。Else 看 PACELC 的 L vs C。SLI→SLO→SLA；error budget=1−SLO；5 个 9 常是 over-engineering。 |
| 2 | 三个 hard part？ | ① CAP 海报误读 ② PACELC 日常延迟 ③ SLO + error budget 怎么开口。 |
| 3 | CAP 何时生效？ | **只在分区时**。无分区不是「选了 CA」。 |
| 4 | CA 海报错在哪？ | 有副本就有分区。CA 不是分布式第三种日常模式。 |
| 5 | Brewer vs Gilbert & Lynch？ | Brewer 2000 猜想；**2002 证明**成定理。C 是线性一致 / atomic。 |
| 6 | 分区时 CP 做什么？ | 少数派拒绝或阻塞，避免分叉。例子：etcd、Spanner。 |
| 7 | 分区时 AP 做什么？ | 继续应答，承认分叉，恢复时合并。例子：Dynamo / Cassandra 风格。 |
| 8 | Ch06 的 W+R>N 是 CAP 的 C 吗？ | **不是。** 是 quorum 新鲜度，不是线性一致。 |
| 9 | PACELC 一句话？ | if Partition then A vs C；**Else Latency vs Consistency**（Abadi）。 |
| 10 | 为什么 Else 更常考？ | 分区罕见；每次写等不等副本是天天在付的延迟。 |
| 11 | Dynamo 风格 vs Spanner 格子？ | 前者典型 PA/EL；后者 PC/EC。当例子，不当数据库目录。 |
| 12 | SLI / SLO / SLA？ | 测什么 → 内部目标 → 合同（通常更松）。 |
| 13 | error budget 公式？ | \`1 − SLO\`。30 天 99.9% ≈ **43 分钟**（43,200×0.001）。 |
| 14 | 99.99% 和 99.999% 的 30 天预算？ | 约 **4.3 分钟**；约 **26 秒**。后者一次故障就烧光。 |
| 15 | 预算内 vs 耗尽？ | 内：继续发版 / 灰度。耗尽：**冻结功能发版**，只修稳定。 |
| 16 | 为什么 5 个 9 常是 over-engineering？ | 成本陡升、发版冻结、用户无感。按旅程拆 SLO；全站 5 个 9 是 red flag。 |
| 17 | 两个 99.9% 串联？ | 0.999×0.999≈**99.8%**，用户路径掉一个 9。并联口算别假装相关故障不存在。 |
| 18 | Feed vs 支付？ | Ch11：可 stale，PA/EL。Ch24：账本要对上，PC/EC。 |
| 19 | KV vs 锁？ | Ch06 AP + 可调 quorum。Ch08 正确性锁走 etcd 一类 CP。 |
| 20 | 年停机表在哪？ | **Ch03**。本章只把窗口改成 30 天讲怎么花。 |`,
});
