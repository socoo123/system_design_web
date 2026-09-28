import { writeChapter } from "./write-chapter.mjs";

const d2 = (src) => {
  const body = src.trim();
  const sized = /style\.font-size/.test(body) ? body : `style.font-size: 12\n${body}`;
  return "```d2\n" + sized + "\n```";
};

writeChapter({
  id: "ch04",
  num: "04",
  title: "设计限流器",
  kind: "brick",
  relatedChapters: ["ch39", "ch42"],
  sections: [
    {
      id: "intro",
      heading: "",
      secNum: null,
      related: [],
      body: [
        "> **预计**：50–60 分钟 ｜ **前置**：Ch01 4 步法；Ch03 估算（阈值从哪来）",
        "> **目标**：按 4 步把限流器讲完；默认答 **令牌桶或滑动窗口** + **Redis + Lua** 保证分布式原子性；限流放 **API Gateway**（Envoy / Kong / nginx / 云网关），不要每个服务 copy-paste；超限 **429** + RateLimit / X-RateLimit-* headers。",
        "",
        "限流器是 M2 第一块砖。范围小，但能把算法选型、分布式竞态、架构位置一次考完。面试官要的不是你背五种算法名字，而是：**选一个主方案、说清 trade-off、把计数放到共享存储里原子地做完。**",
        "",
        "hard part（最该挖的那块）是两件：**读-判-写的竞态**（不原子就会超发），以及 **放哪**（客户端可绕过；每服务一份是 over-engineering）。漏桶、固定窗口、滑动日志拿来对比后丢掉，不要五种并列「都必须实现」。",
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
        "> 「我先确认粒度：user / IP / API key / endpoint，以及超限是 429 还是排队。算法我默认 **令牌桶**（允许突发）；如果面试官要严格窗口、不能吃边界双倍，就改 **滑动窗口计数**。实现上限流放 **API Gateway**，计数进 **Redis + Lua**，保证多实例共享且原子。超限返回 429，带 RateLimit 头和 Retry-After。Service mesh sidecar 能做服务间限流，这题入口层先讲网关就够。」",
        "",
        "说完按 4 步走，别一上来默写五种算法流程图。",
        "",
        d2(`
direction: right
s1.class: go
s1: "1 澄清粒度"
s2.class: step
s2: "2 算法选型"
s3.class: step
s3: "3 网关+Redis"
s4.class: ok
s4: "4 429+监控"
s1 -> s2 -> s3 -> s4
`),
        "",
        "| 时间盒 | 你在做什么 |",
        "|---|---|",
        "| 3–8 min | 澄清：粒度、突发、429 vs 排队、单 Region |",
        "| 2 min | 粗估：峰值 QPS、活跃 bucket 数、Redis 内存量级 |",
        "| 8–12 min | 高层：Client → Gateway → Redis Lua → 业务服务 |",
        "| 10–20 min | deep dive：令牌桶 vs 滑动窗口、Lua 原子性、时钟、fail-open |",
        "| 3–5 min | wrap-up：Redis 热点、规则太严/太松、限流 vs 熔断 |",
        "",
        "**red flag：** 五种算法平均用力；限流写在每个 microservice 里当默认；GET counter 再 INCR 却不提竞态；还没问粒度就画「全局一个桶」。",
      ].join("\n"),
    },
    {
      id: "sec-clarify",
      heading: "澄清问题清单",
      secNum: "4.1",
      related: [],
      body: [
        "粒度没问清，后面的 key 设计和算法都是空的。问 5–7 个就停，其余写假设。",
        "",
        "| 你问 | 为什么问 | 写到白板上的默认假设 |",
        "|---|---|---|",
        "| 按 user、IP、API key 还是 endpoint？ | 决定 Redis key；常要多层叠加 | 「user + endpoint；登录另按 IP」 |",
        "| 要不要允许突发？ | 令牌桶 vs 漏桶的分水岭 | 「允许短突发 → 令牌桶」 |",
        "| 超限拒绝还是排队？ | 429 同步拒，还是入队延后 | 「同步 429；下单类再谈队列」 |",
        "| 单机还是多实例？多 Region 吗？ | 本地计数在无状态层无效 | 「多实例、先单 Region」 |",
        "| 规则谁改、要不要按套餐分档？ | 配置 vs 写死；免费/付费不同 QPS | 「网关读配置；先一个默认档」 |",
        "| 限流失败时放行还是拒绝？ | Redis 挂了的 failover 策略 | 「读 API fail-open；登录/短信 fail-close」 |",
        "",
        "面试官说「你来假设」时写上去：",
        "",
        "> 「假设：公开 HTTP API，按 user_id + endpoint 限；登录额外按 IP。允许多实例，先单 Region。超限 429。允许突发，所以算法用令牌桶。」",
        "",
        "问「要不要精确到每一次都不超」再决定要不要从令牌桶改成滑动窗口。不要默认上滑动日志——那是内存换精度，多数 API 是 over-engineering。",
      ].join("\n"),
    },
    {
      id: "sec-estimate",
      heading: "粗估",
      secNum: "4.2",
      related: [],
      body: [
        "公式在 Ch03。这里只要证明：**这不是存储题，bottleneck 在热点 key 和 Lua 的 QPS。** 下面是教学假设，不是某厂报表。",
        "",
        "假设：入口峰值 **1 万 QPS**（日常平均再低一个数量级）；同时活跃 bucket（user×endpoint）**100 万**；每个 bucket 一个 Redis hash，约 **100 B**（tokens + 时间戳 + TTL）。",
        "",
        "| 项 | 怎么估 | 量级 |",
        "|---|---|---|",
        "| 网关峰值 | 教学假设 | **~1 万 QPS** |",
        "| Redis 内存 | 100 万 key × 100 B | **~100 MB**，再加 replica 仍是百 MB 级 |",
        "| 单次判定延迟 | 同城 Redis + Lua | **亚毫秒～1 ms**；比一次业务查询便宜 |",
        "| 热点 | 一个爆款 user / 一个登录 IP | 单 key 打满 Redis 单线程；要本地预检或拆维度 |",
        "",
        "**面试怎么说：**",
        "",
        "> 「内存可以忽略。限流器的规模问题是：每个请求都要原子判定，热点 key 会打在同一个 Redis 分片上。我用网关挡入口，计数放 Redis；不是先上分片集群。」",
        "",
        "规则数字也用教学档，方便后面手算：登录 **5 次/分钟/IP**；读 API **100 次/分钟/user**；写 **20 次/分钟/user**。被问「阈值从哪来」→ 从 Ch03 的峰值 QPS 和下游容量反推，再留余量；不要编内部压测值。",
      ].join("\n"),
    },
    {
      id: "sec-place",
      heading: "限流放哪",
      secNum: "4.3",
      related: ["ch39", "ch42"],
      body: [
        "2026 默认：**入口放 API Gateway**，计数共享。客户端只能当辅助；业务进程里手写一份当默认是 red flag。",
        "",
        d2(`
grid-columns: 2
avoid: {
  label: "别当默认"
  class: groupBad
  grid-columns: 2
  client.class: bad
  client: "客户端可绕过"
  app.class: bad
  app: "每服务拷贝"
}
put: {
  label: "2026 默认"
  class: groupOk
  grid-columns: 2
  gw.class: ok
  gw: "API Gateway"
  redis.class: ok
  redis: "共享 Redis"
}
`),
        "",
        "本图引用：Ch39 负载均衡与无状态 · Ch42 消息、弹性、容器心智",
        "",
        "**面试怎么说：**",
        "",
        "> 「限流放网关：Envoy、Kong、nginx 或云厂商 API Gateway，规则集中，业务服务无状态。客户端限流可减流量，但不能信。每个服务 copy-paste 一套 Redis 客户端，规则会漂、漏配，是 over-engineering。」",
        "",
        "| 位置 | 优点 | 缺点 | 面试怎么用 |",
        "|---|---|---|---|",
        "| 客户端 | 早挡、省带宽 | **不可靠**，可伪造、可关 | 辅助；永不作唯一防线 |",
        "| 应用内 | 算法完全自定义 | 每个服务重写；和 LB 无状态冲突 | 网关插件不够用时再下沉 |",
        "| **API Gateway** | 统一、和鉴权/路由在一起 | 受网关支持的算法限制 | **默认**；Kong / Envoy / nginx / 云网关 |",
        "",
        "nginx `limit_req` 更接近漏桶（恒定泄出）。要令牌桶，选网关插件或自研 Lua，不要假定「放了 nginx 就是令牌桶」。",
        "",
        "服务间调用还可以在 sidecar（Envoy / Istio）再限一刀——**一句就够**，展开去讲 mesh 是 rabbit hole。业务 API 入口仍是网关；LLM 入口的限流计费在 Ch32，网关产品化在 Ch17。",
      ].join("\n"),
    },
    {
      id: "sec-arch",
      heading: "高层架构",
      secNum: "4.4",
      related: ["ch39", "ch42"],
      body: [
        "从左到右：Client → API Gateway → Redis（Lua 判定）→ 放行才到业务服务。面试官 buy-in 之后再挖算法和竞态。",
        "",
        d2(`
direction: right
cli.class: go
cli: "Client"
gw.class: step
gw: "API Gateway"
rds.class: store
rds: "Redis Lua"
svc.class: ok
svc: "业务服务"
cli -> gw
gw -> rds
gw -> svc
`),
        "",
        "本图引用：Ch39 负载均衡与无状态 · Ch42 消息、弹性、容器心智",
        "",
        "口播路径：",
        "",
        "1. 网关从请求取出 key（user / IP / API key + endpoint）。",
        "2. `EVAL` 一段 Lua：补 token 或滑窗计数，原子地允许或拒绝。",
        "3. 允许 → 转发下游；拒绝 → **当场 429**，不打业务。",
        "4. 响应带配额头，方便客户端自己降速。",
        "",
        "为什么是 Redis 不是 DB：判定在请求关键路径上，要内存 + TTL；DB 一次往返就把限流本身变成 bottleneck。网关无状态（Ch39），同一用户会被打到任意实例，所以计数必须集中，**不要 sticky session** 来「把用户钉在一台限流器上」——那和扩缩容打架。",
        "",
        "规则（谁 100/min、谁 5/min）来自配置，不是写死在 Lua 里。工业模板可以提一句 Lyft 开源的 ratelimit（Envoy 常接它）——点到为止，不要变成 YAML 课。",
        "",
        "高层图到这里停，问一句：「方向 OK 吗？接下来比算法，再写 Redis 竞态。」",
      ].join("\n"),
    },
    {
      id: "sec-algo",
      heading: "深入 · 令牌桶 vs 滑动窗口",
      secNum: "4.5",
      related: [],
      body: [
        "第一个 hard part：**先选主算法，再点名淘汰项。** 2026 面试默认二选一——要突发用令牌桶，要窗口平滑用滑动窗口计数。",
        "",
        d2(`
grid-columns: 2
tb: {
  label: "令牌桶 · 常作默认"
  class: groupOk
  grid-columns: 3
  a.class: ok
  a: "允许突发"
  b.class: ok
  b: "两参数"
  c.class: ok
  c: "内存一个桶"
}
sw: {
  label: "滑动窗口计数"
  class: group
  grid-columns: 3
  d.class: step
  d: "压边界双倍"
  e.class: step
  e: "近似平滑"
  f.class: step
  f: "大流量友好"
}
`),
        "",
        "### 令牌桶（主答案 A）",
        "",
        "两个参数：`capacity`（桶深，突发上限）和 `rate`（每秒补多少）。请求来了先按时间补齐，再扣：",
        "",
        "`tokens = min(capacity, tokens + rate * dt)`",
        "",
        "有 token 就放行并减 1，否则拒绝。桶满时可以瞬时放出 `capacity` 个——这就是突发。公开文档里 Amazon API Gateway、Stripe 都按令牌桶讲配额。",
        "",
        "手算（教学）：capacity 4，rate = 4/分钟，离散补齐方便演；生产是连续补 `rate * dt`。t=0 桶满 4；10s 来 3 个，剩 1；20s 来 2 个，只放 1 个，拒 1 个。面试演算用离散，补一句「线上按经过时间连续补」。",
        "",
        "调参口播：`rate` ≈ 平均允许 QPS；`capacity` ≈ 峰值可持续的秒数 × rate。capacity 开太大等于没限突发；开成 1 又退化成漏桶。",
        "",
        "### 滑动窗口计数（主答案 B）",
        "",
        "当前窗计数 + 上一窗计数 × 重叠比例，得到一个近似「任意滚动窗」用量。固定窗口在整分边界能放双倍；滑动计数把上一窗的尾巴折进来，边界尖峰被压住。假设上一窗请求均匀——这是近似，不是精确日志。Cloudflare 公开写过用近似滑动窗口做边缘限流：内存省、适合大流量。",
        "",
        "教学：限额 7/分钟；上一窗 5，当前窗已 3，新请求落在当前窗 30% 处 → `3 + 5 × (1 - 0.3) = 6.5`，≤ 7 则放行。",
        "",
        "**面试怎么说：**",
        "",
        "> 「API 限流我默认令牌桶，因为产品通常允许短突发。若面试官强调不能在分钟边界翻倍、要窗口公平，我改滑动窗口计数。两者都只要每个 key 几个整数，适合 Redis。」",
        "",
        "### 对比后丢掉（不要五种并列实现）",
        "",
        "| 算法 | 突发 | 精确 | 内存 | 面试定位 |",
        "|---|---|---|---|---|",
        "| **令牌桶** | 允许 | 中 | 低 | **默认 A**：API 配额 |",
        "| **滑动窗口计数** | 平滑 | 高（近似） | 低 | **默认 B**：要压边界双倍 |",
        "| 漏桶 | 强制平滑 | 中 | 低 | 出站要恒定速率；nginx `limit_req` 近亲 |",
        "| 固定窗口 | 边界可双倍 | 低 | 最低 | 演示用；当唯一方案是 red flag |",
        "| 滑动日志 | 精确 | 最高 | **高**（每个请求一个时间戳） | 合规极严才上；多数题 over-engineering |",
        "",
        "漏桶：队列恒定泄出，突发要么排队要么拒新的——适合「下游只能吃固定 QPS」。滑动日志：Redis sorted set 记下每次时间戳，任意窗精确，但拒绝的请求也占内存，QPS 一高就贵。被问「还有哪些」用上面三行收掉，立刻回到 A 或 B。",
      ].join("\n"),
    },
    {
      id: "sec-lua",
      heading: "深入 · Redis + Lua 原子性",
      secNum: "4.6",
      related: ["ch42"],
      body: [
        "第二个 hard part。多网关实例共享计数时，**GET → 判断 → SET/INCR 不是原子的**：两个请求都读到「还能过」，都放行，限额被突破。",
        "",
        d2(`
shape: sequence_diagram
cli: "Client"
gw: "Gateway"
rds: "Redis"
svc: "Service"
cli -> gw: "GET /api"
gw -> rds: "EVAL Lua"
rds -> gw: "allow=1"
gw -> svc: "转发"
svc -> gw: "200"
gw -> cli: "200+RL头"
cli -> gw: "GET /api"
gw -> rds: "EVAL Lua"
rds -> gw: "allow=0"
gw -> cli: "429"
`),
        "",
        "本图引用：Ch42 消息、弹性、容器心智",
        "",
        "Redis 执行 Lua 时对该脚本串行：读 tokens、按 `dt` 补充、判断、写回，中间插不进别的命令。这是分布式限流的标准答法，不是「用了 Redis 就原子」。pipeline 里多条命令之间仍可能被别的客户端打断，**不要把 pipeline 说成 Lua 的替代品**。",
        "",
        "令牌桶在脚本里就是那一行：`tokens = min(capacity, tokens + rate * dt)`，够则减 `cost`，HMSET + EXPIRE。滑动窗口则是 INCR 当前窗 key、读上一窗、按重叠比例估算。面试白板写清步骤比默写 40 行 Lua 加分。",
        "",
        "**时钟：** `dt` 不要用各网关 pod 的本地时钟相减——NTP 偏差会让补 token 忽快忽慢。Lua 里用 `redis.call('TIME')` 取 Redis 自己的秒（和微秒），同一实例上单调、一致。跨 Redis 主从 failover 后 TIME 仍以新主为准；极端时钟回拨极少见，点一句「以 Redis TIME 为准」即可，不要展开成分布式时钟课。",
        "",
        "**面试怎么说：**",
        "",
        "> 「多实例必须把读-判-写放进 Redis Lua。时间用 Redis TIME，不用网关本地 now。允许就转发并带剩余配额；拒绝直接 429，下游根本看不见。」",
        "",
        "| | Lua 脚本 | 客户端 GET+INCR |",
        "|---|---|---|",
        "| 原子性 | 整段串行 | 竞态，会超发 |",
        "| 时钟 | Redis TIME | 各 pod 本地钟，有 skew |",
        "| 运维 | 要管脚本版本 | 看起来简单 |",
        "| 何时够用 | **分布式默认** | 单机演示、或已用 INCR 且能接受超发 |",
        "",
        "集中 Redis 会不会成为单点：先 replica + failover；再按 key 分片（user id hash）。还不够就加下一节的本地预检。多 Region 各有一套 Redis、接受短暂超限，比强行全球同步一个桶更常见——全球精确一个桶往往是 over-engineering。",
      ].join("\n"),
    },
    {
      id: "sec-headers",
      heading: "深入 · 两层判定与 429",
      secNum: "4.7",
      related: ["ch39", "ch42"],
      body: [
        "第三个 deep dive：热点下别让每个请求都打满 Redis；超限怎么跟客户端说话；Redis 挂了怎么办。",
        "",
        d2(`
direction: right
req.class: go
req: "请求"
local.class: step
local: "本地预检"
rds.class: store
rds: "Redis 权威"
out.class: ok
out: "放行或429"
req -> local -> rds -> out
`),
        "",
        "本图引用：Ch39 负载均衡与无状态 · Ch42 消息、弹性、容器心智",
        "",
        "### 本地 + Redis",
        "",
        "网关进程内先做一层很紧的令牌桶：明显超速的请求直接 429，不占 Redis。过了本地的再问 Redis 权威桶。本地可以略松或略紧，**允许少量误差**换掉单 key 热点。权威仍在 Redis，多实例总和才是配额。",
        "",
        "| | 仅本地 | 仅 Redis | 本地 + Redis |",
        "|---|---|---|---|",
        "| 正确性 | 多实例各算各的，全局必破 | **全局准** | 准；本地只是滤尖峰 |",
        "| 延迟 / 负载 | 最快 | 每次同城 RTT | 热点少打 Redis |",
        "| 代价 | 无状态扩容即失效 | Redis 成 bottleneck | 多一档参数 |",
        "",
        "**面试怎么说：**",
        "",
        "> 「默认 Redis 权威。QPS 或热点起来，网关加本地预检，容忍少量超限。只做本地等于没做分布式限流。」",
        "",
        "### 429 与 headers",
        "",
        "同步拒绝用 **429 Too Many Requests**。排队延后（订单进 MQ）是另一条产品决策，要面试官点头再改；默认不要把限流器画成消息队列。",
        "",
        "头要让客户端能自己减速：",
        "",
        "- **IETF 草案** `draft-ietf-httpapi-ratelimit-headers`（2026 仍是 Internet-Draft）：`RateLimit-Policy` 描述配额（如 `q` 额度、`w` 窗口秒），`RateLimit` 描述当前剩余（`r` 剩余、`t` 有效窗秒）。例：`RateLimit: \"default\";r=0;t=12`。",
        "- **事实标准**（GitHub / Stripe 等仍大量在用）：`X-RateLimit-Limit`、`X-RateLimit-Remaining`、`X-RateLimit-Reset`。Reset 有的是 Unix 时间，有的是秒数——这正是草案要统一的。",
        "- 429 时加 **Retry-After**（秒或 HTTP 日期），客户端最好认这个。",
        "",
        "面试默认：**429 + Retry-After + 同时给草案 RateLimit 头和 X-RateLimit-***，兼容老 SDK。不要只背 X- 前缀假装 2026 只有这一种。",
        "",
        "### Redis 挂了：fail-open vs fail-close",
        "",
        "| | fail-open | fail-close |",
        "|---|---|---|",
        "| 行为 | Redis 超时则**放行** | 超时则 **429** |",
        "| 保护谁 | 可用性、用户请求 | 下游、防刷 |",
        "| 适用 | 读多的公开 API | 登录、短信、支付、发券 |",
        "",
        "不说清这一句，限流器在故障时要么把整个站点打满，要么把整个站点拒绝。默认口播：读路径 fail-open + 告警；有钱/有验证码的路径 fail-close。熔断是下游已经出错时快速失败（Ch42），限流是入口还没打满时拒超量——别把两个词混成一个框。",
      ].join("\n"),
    },
    {
      id: "sec-2026",
      heading: "2026 vs 原书",
      secNum: null,
      related: [],
      body: [
        "<details>",
        "<summary>原书 / 笔记当时怎么讲 · 五种算法并列和只提 X-RateLimit 进这里</summary>",
        "",
        "| 原书 / 笔记 | 现在怎么答 |",
        "|---|---|---|",
        "| 五种算法（令牌桶 / 漏桶 / 固定窗 / 滑动日志 / 滑动计数）平均篇幅 | **先定一个主答案**：令牌桶或滑动窗口计数。其余对比后丢掉 |",
        "| 位置只说 API Gateway；笔记把 Service Mesh 写成「2026 两层标配」 | **默认仍是网关**。sidecar 一句；展开 mesh 是 rabbit hole |",
        "| Lua / sorted set 点名，竞态图不透 | 必须讲清 GET+INCR 超发，以及 **Lua + Redis TIME** |",
        "| 超限头只有 `X-Ratelimit-*` | 补 IETF `RateLimit` / `RateLimit-Policy`（草案，2026 仍未成 RFC）+ 仍发 X- 兼容 |",
        "| sticky session 当可选项 | 无状态网关下 **不要** 用粘滞会话当限流方案 |",
        "| Cloudflare 节点数当 trivia | 不要背节点数；要的是「边缘用近似滑动窗口」这一句 |",
        "| 多级限流写成必须三层代码 | 澄清里说清 user / IP / endpoint 维度即可，实现仍是同一套 Lua、不同 key |",
        "",
        "原书骨架仍能用：要限流、要分布式计数、要 429。过时的是**五种必须都会写**和**不谈网关默认**。笔记里的 Lua 全文、Shopify 漏桶、330+ 城市，不当正文第一答案。",
        "",
        "</details>",
      ].join("\n"),
    },
    {
      id: "sec-traps",
      heading: "追问陷阱",
      secNum: null,
      related: ["ch42"],
      body: [
        "1. 「令牌桶和漏桶区别？」→ 令牌桶允许突发（桶满可瞬间放 capacity）；漏桶强制平滑输出。API 默认前者。",
        "2. 「固定窗口有什么问题？」→ 窗口边界可双倍放量。用滑动窗口计数或令牌桶，不要把固定窗口当生产默认。",
        "3. 「高并发计数不准？」→ Redis Lua 原子脚本；不要 GET 再 INCR。pipeline ≠ 原子。",
        "4. 「时间用谁的？」→ Redis TIME。网关本地钟有 clock skew，补 token 会漂。",
        "5. 「Redis 挂了怎么办？」→ 读 API 常 fail-open + 告警；登录/短信 fail-close。说清保护谁。",
        "6. 「限流和熔断区别？」→ 限流是入口防超量；熔断是下游挂了快速失败。点到 Ch42。",
        "7. 「为什么不放每个服务里？」→ 无状态扩容、规则漂移。默认网关；自定义算法再下沉。",
        "8. 「nginx 不就有 limit_req？」→ 近漏桶。要令牌桶别假装已经买到。",
        "9. 「多 Region 一个全球桶？」→ 通常各 Region 限额 + 可接受短暂超。全球精确同步一个桶常是 over-engineering。",
        "10. 「滑动日志不是最准吗？」→ 准，但每个请求存时间戳。多数配额题用计数/令牌桶。极严合规再上。",
      ].join("\n"),
    },
    {
      id: "sec-next",
      heading: "下一步",
      secNum: null,
      related: ["ch05"],
      body: [
        "收尾不要说完美。三个 bottleneck 口播：",
        "",
        "| bottleneck | 你怎么接 |",
        "|---|---|",
        "| 热点 key 打满 Redis 单分片 | 本地预检 + 按 user 分片；不要 sticky |",
        "| 规则太严/太松 | 盯 429 比例和下游 CPU；阈值从容量反推 |",
        "| Redis 故障 | 按路径选 fail-open / fail-close，加告警 |",
        "",
        "自测：合上页，30 秒开场，画出 Client → Gateway → Redis，把令牌桶公式和「为什么要 Lua」讲给空气听。哪句卡，回哪一节。",
        "",
        "下一章 **Ch05 · 一致性哈希**：限流是控制速率；哈希是把 key 均匀分到多机——Redis 分片和后面的 KV 都会用到。",
      ].join("\n"),
    },
  ],
  reviewMd: `# Ch04 · 记忆闪卡

| # | 正面 | 背面 |
|---|---|---|
| 1 | 限流开场 30 秒说什么？ | 问粒度；默认令牌桶或滑动窗口计数；放 API Gateway；Redis + Lua；超限 429 + RateLimit 头。 |
| 2 | 2026 限流默认放哪？ | **API Gateway**（Envoy / Kong / nginx / 云网关）。客户端不可靠；每服务 copy-paste 是 red flag。 |
| 3 | 令牌桶两个参数？突发意味着什么？ | capacity + rate。桶满可瞬时放行 capacity 个。\`tokens = min(capacity, tokens + rate * dt)\`。 |
| 4 | 什么时候改用滑动窗口计数？ | 要压固定窗口的边界双倍、要窗口更公平。近似：当前窗 + 上一窗 × 重叠。 |
| 5 | 漏桶 / 固定窗 / 滑动日志为什么不当默认？ | 漏桶不许突发；固定窗边界双倍；滑动日志按请求存时间戳，内存贵。对比后选 A 或 B。 |
| 6 | 为什么必须 Redis + Lua？ | 多实例 GET-判-写会超发。Lua 在 Redis 里整段串行。pipeline 不保证原子。 |
| 7 | dt 用谁的时钟？ | **Redis TIME**。网关本地钟有 clock skew，补 token 会漂。 |
| 8 | 超限返回什么？头怎么说？ | **429** + Retry-After。草案 \`RateLimit\` / \`RateLimit-Policy\`；同时发 \`X-RateLimit-*\` 兼容老客户端。 |
| 9 | Redis 挂了 fail-open 还是 fail-close？ | 读 API 常 fail-open + 告警；登录/短信/支付 fail-close。要说清保护谁。 |
| 10 | 限流 vs 熔断？ | 限流：入口拒超量。熔断：下游已出错，快速失败，不拖垮自己。 |
| 11 | 本地 + Redis 两层的 trade-off？ | 本地滤热点、可少量误差；Redis 是权威。只做本地 = 全局配额作废。 |
| 12 | nginx limit_req 是令牌桶吗？ | 更近漏桶。要令牌桶用网关插件或 Lua，不要假定「有 nginx 就行」。 |
| 13 | Service mesh 要不要当主答案？ | 入口默认网关。sidecar 一句即可；展开 Istio 是 rabbit hole。 |
| 14 | 这题典型的 over-engineering？ | 五种算法都实现；sticky session；全球一个强同步桶；每服务自研一套。 |`,
});
