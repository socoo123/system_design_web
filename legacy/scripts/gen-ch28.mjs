import { writeChapter } from "./write-chapter.mjs";

const d2 = (src) => {
  const body = src.trim();
  const sized = /style\.font-size/.test(body) ? body : `style.font-size: 12\n${body}`;
  return "```d2\n" + sized + "\n```";
};

writeChapter({
  id: "ch28",
  num: "28",
  title: "配置中心",
  kind: "case",
  relatedChapters: ["ch44", "ch42", "ch40"],
  sections: [
    {
      id: "intro",
      heading: "",
      secNum: null,
      related: [],
      body: [
        "> **预计**：50–60 分钟 ｜ **前置**：协议 Ch40；弹性 Ch42；治理 Ch44（可后读）",
        "> **目标**：推拉、版本、灰度、监听。服务发现只点到，不写成微服务章。",
        "",
        "设计配置中心是 M4 最后一道 case。即时配送把接单匹配讲完；这题换成 **应用运行时的动态配置怎么发下去**。默认是 **应用配置中心**：feature flag / 开关 / 超时和限流阈值一类 KV，不是 Git 当配置、不是 K8s ConfigMap YAML 教程、不是完整服务治理（Ch44）。",
        "",
        "面试官要看的不是 Nacos / Apollo 的 SKU 对照表，也不是把 GitOps 和 mesh 整章搬进来。三个 hard part：**推 vs 拉 / 监听**、**版本与一致性（改了谁能看见）**、**灰度发布配置**。Client **watch**：启动拉一次，变更再通知；通知薄、内容另拉。持久化 **DB + 缓存**，不要只内存。",
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
        "> 「配置中心三个 hard part：推 vs 拉怎么 watch、版本改了谁能看见、配置怎么灰度。默认是应用配置：feature flag、开关、超时和限流阈值，不是 Git、不是 ConfigMap YAML、不是微服务治理。Client 启动拉一次，然后 long-poll 或长连接 push；通知只带 key / 版本，再拉内容。服务端按 namespace / app / cluster / key 做版本，写用乐观并发。灰度按实例 / 标签 / 百分比，和 Ch17 流量 canary 想法像、对象不同。持久化 DB + 缓存。注册中心管实例列表，配置管 KV，深讲 Ch44。」",
        "",
        "然后按 4 步走，别一上来画终图或背产品名。",
        "",
        d2(`
direction: right
s1: "1 澄清范围"
s2: "2 粗估连接"
s3: "3 推拉监听"
s4: "4 版本灰度"
s1 -> s2 -> s3 -> s4
`),
        "",
        "| 时间盒 | 你在做什么 |",
        "|---|---|",
        "| 3–10 min | 澄清：应用配置 vs Git / ConfigMap、要不要灰度、watch 方式 |",
        "| 接着 2 min | back-of-envelope：发布 QPS 很小；贵的是 watch 连接和 notify fan-out |",
        "| 10–15 min | 高层：Client → Config API → Cache + DB；Admin 发布 |",
        "| 10–25 min | deep dive：推拉监听、版本谁能看见、配置灰度（点到 Ch44） |",
        "| 3–5 min | wrap-up：3 个 bottleneck（短轮询、只内存、全量一刀切） |",
        "",
        "**red flag：** 还没问范围就画 Git 仓库 / Ingress YAML / sidecar；纯 30 秒短轮询当唯一方案；配置只放内存；通知里默认塞整份 payload；把 Nacos vs Apollo 功能表背完；把配置灰度画成 Ch17 网关 90/10 流量；把注册发现讲成一章。那是 over-engineering，或把 Ch17 / Ch44 整章搬进来。",
      ].join("\n"),
    },
    {
      id: "sec-clarify",
      heading: "澄清问题清单",
      secNum: "28.1",
      related: [],
      body: [
        "没问清楚就画图 = Jimmy。配置中心这题 5–7 个问题就停，其余自己假设写白板。**第一问必须是范围。**",
        "",
        "| 你问 | 典型回答 / 你自己的假设 | 它改什么 |",
        "|---|---|---|",
        "| 应用动态配置，还是 Git / ConfigMap？ | **应用配置中心**（开关、阈值、flag） | 要 watch 和版本；不是重启滚 Pod、不是 Git pull |",
        "| 配什么？ | **feature flag / 超时 / 限流阈值** | KV + callback；不是业务订单数据 |",
        "| 推还是拉？ | **启动拉 + watch**（long-poll 或长连接） | 禁止纯短轮询当第一答案 |",
        "| 要不要灰度？ | **要**；按实例 / 标签 / 百分比 | 和 Ch17 流量 canary 分开讲 |",
        "| 和注册中心一起做吗？ | **常一起被问**；数据面不同 | 一句分工，深讲 Ch44 |",
        "| 规模大概多少？ | 教学：**约 1 万实例** | 用来估连接和 fan-out，不是某厂内部数 |",
        "",
        "面试官说「你定」时，把假设写上去：",
        "",
        "> 「我假设：应用配置中心，不是 Git、不是 ConfigMap。Client 启动拉全量，之后 long-poll 或 gRPC watch；通知只带 key，再 GET 内容。写走版本 CAS，历史可回滚。先按实例灰度再全量。配置中心挂了读本地快照。注册发现只点一句。先按这个画，不对你打断我。」",
        "",
        "问到 Nacos / Apollo：**承认差别，立刻收口。** 「它们是机制的例子：一个偏 HTTP 长轮询，一个 2.x 偏 gRPC 长连接。本场讲 watch、版本、灰度，不背 SKU。」问到 mesh / 服务发现整章：**一句划界。** 「配置是 KV；发现是实例列表。Ch44。」问太多超过 10 分钟也是 red flag。黄金线还是那条：**问关键问题 → 自己给假设 → 写白板 → 继续。**",
      ].join("\n"),
    },
    {
      id: "sec-estimate",
      heading: "粗估",
      secNum: "28.2",
      related: ["ch40", "ch42"],
      body: [
        "公式细节在 Ch03。这里只要数量级，证明你知道 **这题 bottleneck 是 hang 住的 watch 和一次发布的 notify fan-out，不是「配置读写 QPS」。** 下面用白板做**教学假设**，不是某厂内部数字，也不是某云控制台的公开峰值。",
        "",
        "假设：约 **1 万实例**；每实例 watch 约 **10** 份配置（namespace / dataId）；发布来自人和 CI，不是用户请求路径。",
        "",
        "| 项 | 怎么估 | 量级（教学假设） |",
        "|---|---|---|",
        "| 发布 QPS | 人 + 流水线 | **个位到百**；峰值仍远小于业务读 |",
        "| Watch 连接 | 1e4 实例各一条通道 | **约 1 万** 长轮询挂起或长连接（Ch40） |",
        "| 一次 fan-out | 热 key 被大量实例订阅 | 一次发布可能 **千到万** 次 notify；要能分批（Ch42） |",
        "| 启动拉 | 滚动发布时突发 | 每实例几 KB；平常几乎不打 |",
        "| 存储 | key 小 + 历史版本 | **GB 内**；不是对象存储题 |",
        "",
        "配置看起来「就是个 KV」。贵的不是磁盘，而是：**上万条闲置连接占着文件描述符和线程**，以及 **一改热开关，所有订阅者同时醒**。短轮询（每 5 秒 GET 一次）会把空转 QPS 乘上去——那是算错，也是 red flag。",
        "",
        "**面试怎么说：**",
        "",
        "> 「万实例白板：发布 QPS 可以忽略。真正怕的是 watch 连接和 notify 惊群。通知只带版本，内容按需拉。不会拿某云配置中心的公开峰值当内部数。」",
        "",
        "常见算错：把业务 API 的万级 QPS 安到配置读写上；或只报存储、假装连接免费。教学用数量级，并标**假设**。",
      ].join("\n"),
    },
    {
      id: "sec-arch",
      heading: "高层架构",
      secNum: "28.3",
      related: ["ch40", "ch42", "ch44"],
      body: [
        "从左到右只画 **一条控制面**：Client → Config API → Cache + DB。不要在这张图上扇出注册发现、mesh、GitOps。Admin / CI 发布走同一条 API 的写路径。面试官 buy-in 之后再拆推拉、版本、灰度。",
        "",
        d2(`
direction: right
cli.class: go
cli: "Client"
api.class: step
api: "Config API"
cache.class: store
cache: "Cache"
db.class: store
db: "DB"
cli -> api
api -> cache
api -> db
`),
        "",
        "**本图引用**：Ch40 协议选型 · Ch42 消息、弹性、容器心智 · Ch44 微服务与服务治理",
        "",
        "**存什么（够用就停）：** 键空间 `namespace / app / cluster / key`（有的实现叫 dataId + group）。值是文本 / JSON。每条发布有 **version**（或 MD5 / notificationId）。历史 Release 可回滚。灰度规则挂在同一条 key 上，不是另开一套系统。",
        "",
        "**读路径：** SDK 启动 `GET` 全量进内存，落一份 **本地快照**（配置中心挂了还能起）。然后 **watch**：long-poll 或长连接。变更到来 → callback → 业务刷新超时 / 开关 / 限流阈值。`getConfig` 读的是进程内缓存，不是每次打服务器。",
        "",
        "**写路径：** 鉴权 → 乐观并发（带上当前 version / MD5）→ 落 DB → 更新缓存 → 通知订阅者。不要在请求线程里同步 fan-out 上万客户端（Ch42：分批叫醒）。",
        "",
        "高层图到这里就该停，问一句：「方向 OK 吗？接下来挖推拉怎么听，然后是版本谁能看见，最后配置灰度，服务发现只划界。」",
        "",
        "**面试怎么说：**",
        "",
        "> 「Client 打 Config API，后面是缓存加 DB。启动拉、变更 watch。Admin 发布写出版本再通知。发现和 mesh 不画在这张图上。」",
      ].join("\n"),
    },
    {
      id: "sec-watch",
      heading: "深入 · 推拉与监听",
      secNum: "28.4",
      related: ["ch40", "ch42"],
      body: [
        "第一个 hard part。2026 默认不是「纯推一份大 JSON」，也不是「每 5 秒短轮询」。默认是 **启动拉 + 变更通知 + 再拉内容**。通道可以是 HTTP **long-poll**，也可以是 **gRPC / WebSocket 长连接**——都是 watch，差别在协议（Ch40）。",
        "",
        d2(`
grid-columns: 2
poll: {
  label: "长轮询 · HTTP"
  class: group
  grid-columns: 2
  a.class: step
  a: "挂起超时"
  b.class: step
  b: "304 或通知"
}
push: {
  label: "长连接 · 推"
  class: groupOk
  grid-columns: 2
  c.class: ok
  c: "gRPC 或 WS"
  d.class: ok
  d: "事件叫醒"
}
`),
        "",
        "**本图引用**：Ch40 协议选型",
        "",
        "**Long-poll（Apollo 客户端这条路的机制）：** Client 打 `/notifications`，带上当前 namespace 的 version / notificationId。服务端用异步结果把请求 **hold** 约 30–60 秒。没变更 → **304**；有变更 → 立刻返回 **变了哪个 key / 版本**，Client 再 `GET` 内容。LB 友好（仍是 HTTP）；延迟上界约一个 hold 窗口。",
        "",
        "**长连接 push（Nacos 2.x gRPC 这条路的机制）：** 双向流挂着，服务端主动推 **变更事件**（常见仍是三元组 / dataId，不带全文）。Client 标记失效，再批量对 MD5、按需拉。延迟到毫秒级；服务器要管连接生命周期、空闲超时、重连退避（Ch42）。WebSocket 是同类通道，不要把它和「必须上 WS」绑死。",
        "",
        "| | 短轮询 | 长轮询（**可默认**） | 长连接 push（**也可默认**） |",
        "|---|---|---|---|",
        "| 空转 | 每几秒一次 GET，QPS 假高 | 挂起，几乎无空转 | 一条连接，事件驱动 |",
        "| 延迟 | 最长一个周期 | 最长一个 hold | 变更即可推 |",
        "| 协议 / LB | 最简单 | HTTP，多数 LB 能过 | 要管 idle / 端口 / 粘滞（Ch40） |",
        "| 服务端状态 | 无 | 挂起的请求 | 连接表；断线要重订 |",
        "| 面试 | **red flag 当唯一方案** | 2026 标准答案之一 | 2026 标准答案之一 |",
        "",
        "**为什么通知不带全文？** 通知接口只负责「有没有变」；拉配置是另一条幂等 GET。通道薄、好重试、好对账。Apollo 的公开实现就是 notify 再拉；Nacos 2.x 的变更推送同样常是轻量 notify。把 200KB 的 JSON 塞进每一条叫醒，失败重试会放大，也难灰度（不同实例不该拿到同一份）。",
        "",
        "**兜底：** 再短的 push 也会丢。Client **定时对账**（分钟级拉 MD5 / 版本，没变 304）。配置中心宕机：读 **磁盘快照**，用旧值启动——多数开关 fail-open，鉴权 / 安全开关 fail-close。不要假装 watch 永不丢。",
        "",
        "**callback：** SDK `addListener`。收到新文本后，业务自己刷新：超时、限流阈值、feature flag。别在监听线程里做重活（Ch42）。改类结构、改序列化协议这种 **不能热更** 的项，要承认：那是发版问题，不是配置中心的锅。",
        "",
        "**面试怎么说：**",
        "",
        "> 「启动拉一次，然后 watch。Long-poll 或 gRPC 都行。通知只带 key，再拉内容。分钟级对账 + 本地快照。短轮询不当第一答案。」",
        "",
        "trade-off：长轮询实现简单、延迟有上界；长连接更实时，连接运维更重。纯短轮询浪费 QPS。通知带全文看起来少一次 RTT，接口职责糊、重试和灰度都变难。",
      ].join("\n"),
    },
    {
      id: "sec-version",
      heading: "深入 · 版本与一致性",
      secNum: "28.5",
      related: ["ch40", "ch42"],
      body: [
        "第二个 hard part。面试官问「改了谁能看见」，不要答「全集群同一毫秒」。配置的一致性是 **按 key 的版本时钟 + 每个 Client 自己拉齐**，中间必然有新旧并存。",
        "",
        d2(`
direction: right
pub.class: go
pub: "发布"
db.class: store
db: "落库"
ver.class: step
ver: "版本+1"
ntf.class: ok
ntf: "通知 watch"
pub -> db -> ver -> ntf
`),
        "",
        "**本图引用**：Ch40 协议选型 · Ch42 消息、弹性、容器心智",
        "",
        "**版本长什么样：** 每次成功发布生成一条 Release：单调 version / notificationId，或内容 MD5。Client 记住上次看到的号。GET 时带上本地 version，一样就 304。键空间是 `namespace / app / cluster / key`，灰度是同一 key 上的另一条 Release，不是改 key 名。",
        "",
        "**写路径用乐观并发：** 两人同时改同一份草稿，后写带旧 MD5 / version → **冲突拒绝**，而不是 silent last-write-wins。Nacos 公开接口里的 `casMd5` 就是这个机制的例子。控制台要有历史：回滚 = 把上一条 Release 再发布一次，不是 `DELETE` 当前行。",
        "",
        "**「谁能看见」分四段，不要混：**",
        "",
        "| 阶段 | 看见什么 | 面试怎么说 |",
        "|---|---|---|",
        "| 1. DB 提交 | 权威版本已在 | 只内存是 red flag；进程重启丢发布 |",
        "| 2. 服务端缓存 | Config API 读到新值 | 多节点可能有短暂 dump 延迟 |",
        "| 3. Notify | 订阅者被叫醒 | 只通知变了的 key；可分批，防惊群（Ch42） |",
        "| 4. Client callback | **该实例** 用上新值 | 舰队里一段时间 **新旧并存**——这是正常的 |",
        "",
        "所以：**不要承诺线性一致的全球同时生效。** 你承诺的是：每个实例最终看到同一条已发布版本；生效窗口是秒到数十秒，取决于 watch 通道和 fan-out。正因如此才要灰度——先让一部分实例看见 v2。",
        "",
        "服务端集群一句即可：配置数据通常比实例心跳更在乎「别丢、别分叉」，开源实现里配置常走更强的复制、发现常走最终一致。协议细节留给 Ch44，本场只要「DB 是底稿，缓存是热路径」。",
        "",
        "**面试怎么说：**",
        "",
        "> 「发布落库并 bump 版本，CAS 防覆盖。通知后每个 Client 自己拉。全舰队不会同一毫秒对齐；回滚走历史 Release。只内存不算配置中心。」",
        "",
        "trade-off：版本 + 历史换可审计、可回滚，换来存储和一次发布多一步。强行「所有实例事务提交才返回」会把发布 QPS 和可用性一起打死——配置不需要跨实例 2PC。",
      ].join("\n"),
    },
    {
      id: "sec-gray",
      heading: "深入 · 灰度发布与服务发现边界",
      secNum: "28.6",
      related: ["ch44", "ch42"],
      body: [
        "第三个 hard part。配置灰度是 **同一份代码、不同实例读到不同的值**。Ch17 的 canary 是 **网关把请求切到不同的代码版本**。想法像（先小后大、能回滚），对象不同——别在白板上复用那张 90/10 流量图当配置中心终图。",
        "",
        d2(`
grid-columns: 2
full: {
  label: "全量 · 后做"
  class: group
  grid-columns: 2
  a.class: warn
  a: "所有实例"
  b.class: warn
  b: "一刀切"
}
pct: {
  label: "灰度 · 先做"
  class: groupOk
  grid-columns: 2
  c.class: ok
  c: "IP 或标签"
  d.class: ok
  d: "百分比"
}
`),
        "",
        "**规则（够用就停）：** 按 **IP / instance id**（Apollo 灰度规则那种）、按 **tag**（机房、集群、canary 组）、按 **百分比**（`hash(instanceId) % 100 < n`）。命中 → 读灰度 Release；未命中 → 读正式版。灰度变更只叫醒命中的订阅者。看错误率和业务指标，再 **全量合并** 或 **停灰度**。用户维度的 flag：规则仍在配置里，**判定可以在应用内用 userId 算**——那是 feature flag 的客户端求值，不要和「服务端按实例下发两份 payload」搅成一张图。",
        "",
        "| | Ch17 流量 canary | 本章配置灰度 |",
        "|---|---|---|",
        "| 切什么 | 请求 → v1 / v2 **进程** | 实例 → v1 / v2 **KV** |",
        "| 谁执行 | 网关权重 / header | Config API 按客户端身份选 Release |",
        "| 代码 | 往往两套 artifact | **同一套代码** 读不同阈值 / 开关 |",
        "| 回滚 | 权重打回 100/0 | 停灰度或发回上一个 Release |",
        "",
        "危险项主动说：把「新旧协议不兼容」的开关拿去灰度，舰队会 **行为分裂**（一半序列化 A、一半 B）。那种要跟发版走，不跟配置灰度走。限流阈值、超时、可回退的 flag 才适合先灰。",
        "",
        d2(`
shape: sequence_diagram
adm: "Admin"
api: "Config API"
store: "Store"
cli: "Client"
adm -> api: "发布 v2"
api -> store: "落库"
api -> cli: "通知变更"
cli -> api: "拉取配置"
`),
        "",
        "**本图引用**：Ch42 消息、弹性、容器心智 · Ch44 微服务与服务治理",
        "",
        "时序就是那条环：**发布 → 落库 → 通知 → Client 再拉 → callback。** 四个角色停。不要再往上加注册中心、mesh、Git。",
        "",
        "配置中心常和注册中心 **一起被问**。一句话分工，然后停——不要写成微服务章。",
        "",
        d2(`
grid-columns: 2
cfg: {
  label: "配置中心 · 本章"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "KV 开关阈值"
  b.class: ok
  b: "版本可回滚"
}
disc: {
  label: "注册中心 · Ch44"
  class: group
  grid-columns: 2
  c.class: step
  c: "实例列表"
  d.class: step
  d: "心跳健康"
}
`),
        "",
        "**本图引用**：Ch44 微服务与服务治理",
        "",
        "| | 配置中心（**本章**） | 注册 / 发现（**Ch44**） |",
        "|---|---|---|",
        "| 数据 | 开关、阈值、文案、flag 规则 | `host:port`、权重、健康 |",
        "| 变更频率 | 人 / CI，低 | 心跳、上下线，高 |",
        "| 一致性口味 | 要历史、要 CAS、常更怕丢 | 更怕不可用；短暂脏列表可接受 |",
        "| watch 对象 | key | 服务名 |",
        "",
        "同一套产品（Nacos 是常见例子）可以两个数据面都做，**白板上仍是两张表**。Mesh / sidecar 怎么拿配置、怎么做 mTLS，点到 Ch44，本场不展开。",
        "",
        "**面试怎么说：**",
        "",
        "> 「配置灰度按实例或百分比下发另一份 Release，不是网关切流量。先灰再全量。注册中心管谁在、配置中心管开什么开关。发现细节去 Ch44。」",
        "",
        "trade-off：灰度换安全窗口，换来一段时间的行为分裂——只灰可回退的项。服务端按实例过滤，规则集中；客户端按 userId 求值，更适合「这个用户看见新文案」。两者都不要画成发布平台 YAML。",
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
        "Alex Xu 两卷没有「设计配置中心」。本章按 2026 国内/通用公开面试题和工程实践重建（长轮询 / 长连接 watch、版本 CAS、实例灰度、配置与发现分工），不是某本笔记的润色，也不是 Nacos / Apollo 产品手册。",
        "",
        "| 网上旧答 / 教程惯性 | 现在怎么答 |",
        "|---|---|---|",
        "| 每 5–30 秒短轮询当唯一方案 | **启动拉 + watch**；分钟级对账只是兜底 |",
        "| 通知里塞整份配置 | **先通知 key / 版本，再 GET** |",
        "| 只放内存 / 单机 Map | **DB + 缓存**；Client 再加磁盘快照 |",
        "| Git 仓库当配置中心 | Git 没 watch、没实例灰度、发布是 commit |",
        "| ConfigMap / 改完滚 Pod | 那是部署配置；本章是 **运行时热更新** |",
        "| 背 Nacos vs Apollo 功能表 | 当 **机制例子**（HTTP hold vs gRPC 流） |",
        "| 配置灰度 = 网关 90/10 | **同一代码不同 KV**；流量 canary 是 Ch17 |",
        "| UDP 推配置当 2026 默认 | 旧辅助手段；现在 long-poll 或长连接 |",
        "| 把注册发现、mesh 画满 | **一句分工**，深讲 Ch44 |",
        "| 某厂配置 QPS 当事实 | **教学假设**；只报数量级 |",
        "",
        "仍成立的骨架：集中存储、能动态更新、要版本和回滚。过时的是把短轮询、Git、Pod 重启和产品对照表当作白板第一答案。",
        "",
        "</details>",
      ].join("\n"),
    },
    {
      id: "sec-traps",
      heading: "追问陷阱",
      secNum: null,
      related: ["ch44", "ch42", "ch40"],
      body: [
        "1. **「Git 当配置中心行不行？」** → 能存，不能 watch、不能按实例灰度。运行时开关要用配置中心。",
        "2. **「ConfigMap 呢？」** → 改完常要滚 Pod。本章是进程内 callback 热更新。",
        "3. **「为什么不短轮询？」** → 空转 QPS、延迟等于周期。Long-poll 或长连接。",
        "4. **「推还是拉？」** → 启动拉；变更 **通知再拉**。纯推全文不是默认。",
        "5. **「WebSocket 必须吗？」** → 不是。HTTP 长轮询和 gRPC 流都是 watch 通道（Ch40）。",
        "6. **「通知为什么不带内容？」** → 接口分职、好重试、好灰度。Client 再 GET。",
        "7. **「改了所有机器同时生效吗？」** → 不会。每实例自己拉齐；中间新旧并存。",
        "8. **「两人同时改？」** → version / MD5 CAS，冲突拒绝。不要 last-write-wins。",
        "9. **「配置中心挂了？」** → 本地快照启动。多数 flag fail-open；安全项 fail-close。",
        "10. **「怎么灰度？」** → IP / 标签 / 百分比。不是 Ch17 网关切流量。",
        "11. **「和注册中心什么关系？」** → 配置是 KV，发现是实例列表。深讲 Ch44。",
        "12. **终图已经很大了还往上堆？** → mesh、GitOps、SKU 对照、微服务整章都不是本章。讲透三条 hard part 比画 20 个框得分高。",
      ].join("\n"),
    },
    {
      id: "sec-next",
      heading: "wrap-up 与下一步",
      secNum: null,
      related: ["ch43", "ch44"],
      body: [
        "收尾不要说完美。三个 bottleneck 口播：",
        "",
        "| bottleneck | 你怎么接 |",
        "|---|---|",
        "| 短轮询空转 / 通知塞全文 | 启动拉 + watch；通知只带版本，再 GET |",
        "| 只内存、无版本 | DB + 缓存；CAS；历史可回滚；快照兜底 |",
        "| 全量一刀切 / 和发现搅在一起 | 先实例灰度；KV vs 实例列表，发现去 Ch44 |",
        "",
        "自测：合上这一页，用 30 秒开场 + 白板高层，把 long-poll 或长连接 watch、版本谁能看见、配置灰度讲给空气听。哪句卡，回哪一节。服务发现只点到分工。",
        "",
        "M4 进阶业务到此收束。按主线目录，下一章是已写的 **Ch29 · 设计 LLM 推理服务**。本车道下一章是 **Ch43 · 超大规模数据**（foundation，不再套 case 的 4 步法）。",
      ].join("\n"),
    },
  ],
  reviewMd: `# Ch28 · 记忆闪卡

| # | 正面 | 背面 |
|---|---|---|
| 1 | 配置中心三个 hard part？ | 推 vs 拉 / 监听；版本与一致性（谁能看见）；配置灰度。发现只点到。 |
| 2 | 默认范围？ | **应用配置中心**（flag / 开关 / 超时限流阈值）。不是 Git、不是 ConfigMap YAML、不是微服务章。 |
| 3 | 2026 怎么 watch？ | **启动拉 + 变更通知 + 再拉内容**。Long-poll 或 gRPC/WS 长连接。短轮询不当第一答案。 |
| 4 | 通知带全文吗？ | **不默认带。** 只带 key / 版本，Client 再 GET。薄、好重试、好灰度。 |
| 5 | 长轮询 vs 长连接？ | Hold 30–60s，304 或叫醒 vs 事件推。都是 watch。协议 / 连接运维见 Ch40、Ch42。 |
| 6 | 改了谁能看见？ | 落库 bump 版本 → 通知 → **每实例自己拉**。舰队会短暂新旧并存，不是全球同时。 |
| 7 | 两人同时改？ | **乐观并发**（version / MD5 CAS）。回滚走历史 Release。 |
| 8 | 持久化？中心挂了？ | **DB + 缓存**，不要只内存。Client **本地快照**；多数 flag fail-open。 |
| 9 | 配置灰度 vs Ch17 canary？ | 灰度是同一代码不同 **KV**；Ch17 是网关切 **流量/代码版本**。按 IP、标签、百分比。 |
| 10 | 配置 vs 服务发现？ | 配置：KV、版本、可回滚。发现：实例列表、心跳。深讲 **Ch44**。 |
| 11 | callback 做什么？ | SDK listener 刷新超时 / 开关 / 阈值。不能热更的走发版。别堵监听线程。 |
| 12 | 这题最大的 over-engineering？ | SKU 对照、GitOps、mesh、发现整章、短轮询、只内存。讲透三条 hard part。 |`,
});
