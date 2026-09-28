import { writeChapter } from "./write-chapter.mjs";

const d2 = (src) => {
  const body = src.trim();
  const sized = /style\.font-size/.test(body) ? body : `style.font-size: 12\n${body}`;
  return "```d2\n" + sized + "\n```";
};

writeChapter({
  id: "ch10",
  num: "10",
  title: "设计通知系统",
  kind: "case",
  relatedChapters: ["ch40", "ch42", "ch04"],
  sections: [
    {
      id: "intro",
      heading: "",
      secNum: null,
      related: [],
      body: [
        "> **预计**：50–60 分钟 ｜ **前置**：Ch01 4 步法；Ch04 限流、Ch42 消息语义可后读",
        "> **目标**：按 4 步法把通知讲完；Push 默认答 **FCM HTTP v1**；能说清 **at-least-once + 幂等**，不要假装 exactly-once。",
        "",
        "通知是第二道完整 case。短链是读多写少的 KV；这题是 fan-out 和投递。面试官要看的不是你能不能画出「全球多 Region + 数仓漏斗」，而是：**通道问清、规模估对、三个 hard part（这题最该挖透的三块）讲透。**",
        "",
        "系统看起来人人都会发一条 push。难点在通道异构、不丢不重、不把用户炸醒。",
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
        "> 「通知三个 hard part：通道异构、不丢不重、不骚扰。我先确认通道（Push / SMS / Email）、事务还是营销、单发还是群发。规模按千万 DAU 白板估：Push 日均千级 QPS，营销突发受三方速率限制。架构是业务方 → 通知 API → MQ → 分通道 worker → 三方。Push 主叙事用 **FCM HTTP v1** 覆盖 Android 和 Web；iOS 仍走 APNS，但不当唯一答案。可靠性声明 at-least-once + `notification_id` 幂等，不假装 exactly-once。」",
        "",
        "然后按 4 步走，别一上来画终图。",
        "",
        d2(`
direction: right
s1: "1 通道 + 估算"
s2: "2 高层 MQ"
s3: "3 可靠 / 通道"
s4: "4 wrap-up"
s1 -> s2 -> s3 -> s4
`),
        "",
        "| 时间盒 | 你在做什么 |",
        "|---|---|",
        "| 3–10 min | 澄清：通道、事务 vs 营销、单发 vs 群发、可靠性、静默/退订 |",
        "| 接着 2 min | back-of-envelope：千万 DAU、Push 千级 QPS、营销突发受三方限速 |",
        "| 10–15 min | 高层：client → API → MQ → 分通道 worker → 三方 |",
        "| 10–25 min | deep dive：幂等/DLQ、FCM 与 token 生命周期、限流/静默 |",
        "| 3–5 min | wrap-up：3 个 bottleneck（三方限速、失效 token、营销堵事务） |",
        "",
        "**red flag：** 还没问通道就只画 APNS；还没问事务/营销就讲 Kafka 分区和 ISR；声称 exactly-once；营销群发在 API 里 for 循环千万用户。那是 over-engineering，或把 Ch20 / Ch04 整章搬进来。",
      ].join("\n"),
    },
    {
      id: "sec-clarify",
      heading: "澄清问题清单",
      secNum: "10.1",
      related: [],
      body: [
        "没问清楚就画图 = Jimmy。通知这题 5–7 个问题就停，其余自己假设写白板。",
        "",
        "| 你问 | 典型回答 / 你自己的假设 | 它改什么 |",
        "|---|---|---|",
        "| 哪些通道？ | Push + SMS + Email；Web Push 算 Push | worker 分 topic；协议各不同 |",
        "| 事务还是营销？ | **两者都有** | 优先级队列；营销走静默/退订 |",
        "| 单发还是群发？ | 事务单发；营销可群发 | fan-out 异步；API 不循环用户 |",
        "| 能不能丢 / 能不能重？ | 验证码不能丢，可偶尔重 | 先落库 + 重试；幂等去重 |",
        "| 静默时段 / 退订？ | 营销要；事务（验证码/支付）除外 | 偏好表；quiet hours 延后不丢弃 |",
        "| 要不要打开率漏斗？ | 点到即可 | payload 带 id；这题不是数仓课 |",
        "",
        "面试官说「你定」时，把假设写上去：",
        "",
        "> 「我假设：Push / SMS / Email 都要；事务和营销都有；验证码不能丢；营销要静默和退订。Push 用 FCM HTTP v1 做 Android / Web 主通道。先按这个画，不对你打断我。」",
        "",
        "问太多超过 10 分钟也是 red flag。黄金线还是那条：**问关键问题 → 自己给假设 → 写白板 → 继续。**",
      ].join("\n"),
    },
    {
      id: "sec-estimate",
      heading: "粗估",
      secNum: "10.2",
      related: ["ch03"],
      body: [
        "公式细节在 Ch03。这里只要数量级，证明你知道**这是中等吞吐、强合规**，难点不在把单机打满。下面用公开量级做白板假设，不是某厂内部数字。",
        "",
        "假设：约 **1000 万 DAU**；每人每天约 10 条 Push。",
        "",
        "| 项 | 怎么估 | 量级 |",
        "|---|---|---|",
        "| Push 日均 QPS | 1e7 × 10 / 86400 | **约 1e3**；峰值打 5 倍大约几千 |",
        "| SMS | 贵，占比小；白板 ~10 万条/天 | **个位数到十级 QPS** |",
        "| Email | 批量为主；白板 ~100 万/天 | 平均十级，窗口内更高 |",
        "| 营销突发 | 1e7 用户 / 10 分钟 | **约 1e4/s 量级**，但被三方速率卡住 |",
        "| 存储 | 日志约 0.5 KB × 1 亿条/天；留 30 天 | 约 **TB 级**（含副本） |",
        "| 带宽 | 单条 payload KB 级，不是视频 | 出站主要卡在**三方 QPS 配额** |",
        "",
        "**面试怎么说：**",
        "",
        "> 「按千万 DAU 白板：Push 日均千级 QPS，存储 TB 级。营销可以把瞬时 QPS 拉到上万，但 FCM / SMS 聚合商会限速——所以必须 MQ 削峰。这题 bottleneck 不是算力，是送达和别骚扰。」",
        "",
        "常见算错：把营销突发的 1e4/s 当成你必须同步打进三方的数字。worker 按三方配额漏，API 只负责入队。不要编某厂投递率精确百分比。",
      ].join("\n"),
    },
    {
      id: "sec-arch",
      heading: "高层架构",
      secNum: "10.3",
      related: ["ch40", "ch42"],
      body: [
        "从左到右：业务方 → 通知 API → MQ → 分通道 worker → 三方。面试官 buy-in 之后再拆写路径和反馈。",
        "",
        d2(`
direction: right
biz.class: go
biz: "业务方"
api.class: step
api: "通知 API"
mq.class: store
mq: "MQ"
wk.class: ok
wk: "通道 worker"
tp.class: store
tp: "FCM / SMS / ESP"
biz -> api -> mq -> wk -> tp
`),
        "",
        "**本图引用**：Ch40 协议选型 · Ch42 消息、弹性",
        "",
        "**为什么用 MQ（必答）：** 解耦（三方调用慢，API 先返回）；削峰（营销突发）；重试（三方抖一下不丢）；**通道隔离**（SMS 慢不能拖死 Push）。点到为止：topic 按通道（再按优先级）拆。Kafka 分区 / ISR / exactly-once 留给 Ch20，这里不要讲成消息队列课。",
        "",
        "**schema（够用就停）：** `notification`（id、user_id、channel、status、template_id）；`device`（user_id、token、platform、status）；`user_preference`（channel、opt-in、quiet hours）。用户对设备是一对多。不要在白板上画五张宽表。",
        "",
        "写路径：**先持久化 intent（PENDING），再入 MQ，再发。** API 校验、请求级幂等、查偏好之后 fan-out 到各通道 topic。营销群发不要在请求线程里扫千万用户——单独的 fan-out 任务往 MQ 灌。",
        "",
        "投递路径用时序。以 Push 为例（FCM HTTP v1）；SMS / Email 同构，只是三方和回执不同。",
        "",
        d2(`
shape: sequence_diagram
api: "通知 API"
mq: "MQ"
wk: "Push worker"
fcm: "FCM v1"
api -> mq: "PENDING 入队"
mq -> wk: "消费"
wk -> fcm: "HTTP v1 send"
fcm -> wk: "message_id"
`),
        "",
        "**本图引用**：Ch42 消息、弹性 · Ch40 协议选型",
        "",
        "worker 按通道独立池：每条腿的速率、重试、鉴权都不一样。SMS 按条计费要严控并发；FCM 吞吐高但要处理 token 失效。混成一个池，慢通道会拖垮全部。",
        "",
        "高层图到这里就该停，问一句：「方向 OK 吗？接下来挖可靠性、通道和防骚扰。」",
      ].join("\n"),
    },
    {
      id: "sec-reliable",
      heading: "深入 · 不丢不重（不要假装 exactly-once）",
      secNum: "10.4",
      related: ["ch42"],
      body: [
        "第一个 hard part。通知默认 **at-least-once**：MQ 会重投，worker 会重试。用户体感「只收一次」靠幂等，不是免费的 exactly-once。",
        "",
        d2(`
grid-columns: 2
als: {
  label: "at-least-once + 幂等"
  class: groupOk
  grid-columns: 3
  a.class: ok
  a: "先落库"
  b.class: ok
  b: "notification_id"
  c.class: ok
  c: "重试 / DLQ"
}
exo: {
  label: "假装 exactly-once"
  class: groupBad
  grid-columns: 3
  d.class: bad
  d: "跨三方做不到"
  e.class: bad
  e: "over-engineering"
  f.class: bad
  f: "2PC 不值"
}
`),
        "",
        "| 半边 | 做法 |",
        "|---|---|",
        "| **不丢** | 先写 DB（PENDING）再入 MQ；失败指数退避 + jitter；N 次后 **DLQ** + 告警 |",
        "| **不重** | 请求级：`notification_id`（业务方或 UUID）Redis `SET NX`，TTL 如 24h；业务级：`user + template + 窗口` 防连点 |",
        "",
        "端到端 exactly-once 跨 FCM / APNS / SMS **做不到**：网络会重试，三方自己也会重。2PC / 事务消息把延迟和运维成本拉上去，通知不值。声明 at-least-once，服务端按 id 去重，客户端按 id 再滤一次——这是面试标准答案。投递语义细节在 Ch42。",
        "",
        "**面试怎么说：**",
        "",
        "> 「我保证 at-least-once：先落库再发，失败重试，耗尽进 DLQ。重复用 `notification_id` 幂等挡。不会说 exactly-once——三方重试我控制不了。」",
        "",
        "验证码比营销更怕丢：独立高优 topic，重试更积极，必要时 SMS 聚合商 failover。营销丢一条可以接受，但不要用「能丢」当借口不做落库。",
      ].join("\n"),
    },
    {
      id: "sec-channel",
      heading: "深入 · 通道异构与 device token",
      secNum: "10.5",
      related: ["ch40"],
      body: [
        "第二个 hard part。一条 intent 按设备 / 偏好 fan-out；**每个通道的协议、速率、回执、成本都不一样。** 2026 白板：Android / Web Push 主叙事是 **FCM HTTP v1**（OAuth 短票，legacy server key 已停）。iOS 仍是 APNS（HTTP/2 + p8 JWT），可以直连，也可以让 FCM 代发——但不要把 APNS 画成整张图的唯一出口。",
        "",
        d2(`
grid-columns: 2
fcm: {
  label: "FCM HTTP v1 · 主叙事"
  class: groupOk
  grid-columns: 3
  a.class: ok
  a: "Android / Web"
  b.class: ok
  b: "OAuth 短票"
  c.class: ok
  c: "UNREGISTERED"
}
apnsOnly: {
  label: "只画 APNS · 不够"
  class: groupBad
  grid-columns: 3
  d.class: bad
  d: "只有 iOS"
  e.class: bad
  e: "无正向回执"
  f.class: bad
  f: "不当默认答案"
}
`),
        "",
        "| 通道 | 三方 | 你要记住的差异 |",
        "|---|---|---|",
        "| Push（Android / Web） | **FCM HTTP v1** | 免费、吞吐高；鉴权是 OAuth 不是永久 server key；部分错误码可清 token |",
        "| Push（iOS） | APNS | 免费、尽力而为；**没有「设备已收到」正向回执**；失效常见 `410` |",
        "| SMS | 聚合商 | **按条计费**；有 DLR 回执；国内签名/模板；worker 必须节流 |",
        "| Email | ESP | 便宜、适合营销；看 bounce / complaint，退订必须听 |",
        "",
        "SMS 不自建短信中心，走**聚合商**：按国家 / 运营商 / 价格 / 成功率选路，失败熔断切备用。DLR 异步回调 webhook，用 `msg_id` 对账——这是 SMS 比 Push 好统计投递的原因。协议对比见 Ch40，这里不要把 SMPP 讲成一节课。",
        "",
        "**device token 不是永久的。** 卸载、重装、关权限、FCM 轮换、设备很久不上线，都会失效。继续往死 token 推 = 浪费配额、拉低可达、还可能被平台限流。这是生产头号坑。",
        "",
        "反馈环用时序：FCM 返回 `UNREGISTERED`（HTTP 404 一类）就删；iOS 直连时常见 `410 Gone`。同一套反馈处理器写回 `device.status = inactive`，后续不再推。",
        "",
        d2(`
shape: sequence_diagram
wk: "Push worker"
fcm: "FCM v1"
fb: "反馈处理器"
db: "device 表"
wk -> fcm: "POST send"
fcm -> wk: "UNREGISTERED"
wk -> fb: "token 失效"
fb -> db: "标 inactive"
`),
        "",
        "**本图引用**：Ch40 协议选型",
        "",
        "App 侧 token 刷新要回写设备表。用户多设备：按 `user_id` 挂多条 token，不要把 token 当用户主键。过期很久未活跃的 token 也可以定期扫掉，但**发送失败回调是主路径**。",
        "",
        "**面试怎么说：**",
        "",
        "> 「Android / Web 我走 FCM HTTP v1；iOS 走 APNS。token 会失效，FCM `UNREGISTERED` 或 APNS `410` 必须清掉。不会把 APNS 当整题默认通道，也不会拿已废弃的 FCM legacy key。」",
      ].join("\n"),
    },
    {
      id: "sec-anti",
      heading: "深入 · 防骚扰：限流、优先级、静默、退订",
      secNum: "10.6",
      related: ["ch04"],
      body: [
        "第三个 hard part。通知发得出去不等于该发。营销把验证码堵住、凌晨把人叫醒、退订了还发——都是 red flag。",
        "",
        d2(`
direction: right
user: "用户级限流"
ch: "通道级限流"
quiet: "静默时段"
send: "发送或延后"
user -> ch -> quiet -> send
`),
        "",
        "**本图引用**：Ch04 设计限流器",
        "",
        "限流器算法（令牌桶 / 滑动窗口、Redis + Lua）在 **Ch04**。这里只说**放哪一层、事务和营销为什么要分开**，不要把本章讲成限流课。",
        "",
        "| 层 | 挡什么 |",
        "|---|---|",
        "| 用户级 | 每人每天 / 每小时上限，防连轰 |",
        "| 通道级 | SMS 最严（贵 + 合规）；Push 松一些 |",
        "| 模板级 | 同模板短窗口去重（业务级 dedup） |",
        "| 全局 / 三方 | 保护 FCM / 聚合商配额 |",
        "",
        "**优先级：** 验证码 / 支付走独立高优 topic + worker，不被营销群发堵死。社交通知可合并（10 个赞合成一条）。营销可延迟、可限速。",
        "",
        "**静默时段（quiet hours）：** 营销进窗口则**延后到时段结束**，不要默默丢（除非产品明确说丢）。事务通知（验证码、安全）立即发。按时区存 IANA，在发送路径上判，不要只按机房当地时间。",
        "",
        "**退订 / opt-out：** 营销必须可退；退订后该通道不再发。验证码通常仍允许。偏好读多，缓存短 TTL，源在 DB。",
        "",
        "**面试怎么说：**",
        "",
        "> 「用户级和通道级限流，算法细节按 Ch04。验证码单独高优队列。营销看静默时段和退订，到点再发而不是扔掉。不会为了『必达』把用户叫醒。」",
        "",
        "trade-off：防骚扰会压低营销到达；可靠性会增加重复风险。白板要主动说这组张力，而不是只画更多箭头。",
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
        "| 原书或笔记 | 现在怎么答 |",
        "|---|---|",
        "| FCM legacy server key | **HTTP v1 + OAuth**。legacy 发送接口 2024 已停 |",
        "| **APNS 当主通道**画在图中央 | **FCM HTTP v1** 做 Android / Web 主叙事；iOS 才是 APNS |",
        "| device token 当永久 | 会失效；`UNREGISTERED` / `410` 必须清理 |",
        "| 去重一笔带过 | 请求级 `notification_id` + 窗口级业务去重 |",
        "| 不自觉暗示 exactly-once | 声明 at-least-once；跨三方 exactly-once 是 over-engineering |",
        "| SMS 只提某一家云或单一厂商 | 聚合商路由 + failover；国内还要签名 / 模板 / 退订 |",
        "",
        "原书作为入门骨架仍然能用：多通道、API → MQ → worker。过时的是 **FCM legacy**、**把 APNS 当默认主通道**、以及过浅的去重。",
        "",
        "</details>",
      ].join("\n"),
    },
    {
      id: "sec-traps",
      heading: "追问陷阱",
      secNum: null,
      related: ["ch04", "ch42", "ch40"],
      body: [
        "1. **「怎么保证精确发一次？」** → 端到端 exactly-once 做不到。at-least-once + `notification_id` 幂等 + 客户端按 id 去重。",
        "2. **「为什么不用 APNS 当主通道？」** → APNS 只覆盖 Apple。Android / Web 默认 **FCM HTTP v1**。iOS 可以直连 APNS，或 FCM 代发。",
        "3. **「token 失效怎么办？」** → FCM `UNREGISTERED`、APNS `410` → 反馈处理器标 inactive，停推。继续推是浪费配额。",
        "4. **「FCM 还用 server key 吗？」** → 不要。legacy 已停。HTTP v1 + OAuth（service account）。",
        "5. **「营销 1000 万怎么打？」** → fan-out 任务入 MQ，worker 按三方速率漏。不要 API 同步循环。别展开 Kafka ISR。",
        "6. **「三方挂了？」** → 重试 + DLQ；SMS 多聚合商 failover + 熔断。Push 没有第二家「等价 APNS」。",
        "7. **「怎么防骚扰？」** → 用户/通道限流（Ch04）+ 优先级 + 静默延后 + 退订。验证码例外。",
        "8. **「静默时段的验证码发不发？」** → 事务立即发；营销延后。不要一刀切丢弃。",
        "9. **「worker 为什么要分通道？」** → 速率、鉴权、重试、计费都不同。SMS 慢不能拖死 Push。",
        "10. **终图已经很大了还往上堆？** → 这题 over-engineering 的典型。漏斗、推荐、分区重平衡都不是本章。讲透三条 hard part 比画 20 个框得分高。",
      ].join("\n"),
    },
    {
      id: "sec-next",
      heading: "wrap-up 与下一步",
      secNum: null,
      related: ["ch11"],
      body: [
        "收尾不要说完美。三个 bottleneck 口播：",
        "",
        "| bottleneck | 你怎么接 |",
        "|---|---|",
        "| 三方速率 / 营销突发 | MQ 削峰；worker 按配额漏；SMS 更严 |",
        "| 失效 token 仍推 | 反馈环清理；这是可达的最大杠杆 |",
        "| 营销堵验证码 | 高优独立 topic；静默只约束营销 |",
        "",
        "自测：合上这一页，用 30 秒开场 + 白板高层，把 FCM HTTP v1、at-least-once + 幂等、失效 token 讲给空气听。哪句卡，回哪一节。",
        "",
        "下一道题是 **Ch11 · 设计新闻 Feed**。通知是服务 → 用户的 fan-out；Feed 是反向的聚合与推拉。",
      ].join("\n"),
    },
  ],
  reviewMd: `# Ch10 · 记忆闪卡

| # | 正面 | 背面 |
|---|---|---|
| 1 | 通知三个 hard part？ | 通道异构；不丢不重；不骚扰。 |
| 2 | Push 2026 主叙事是什么？ | **FCM HTTP v1**（Android / Web）。OAuth，不是 legacy server key。 |
| 3 | APNS 放在哪？ | iOS 通道。可以直连或 FCM 代发。不当整题默认主通道。 |
| 4 | 高层链路怎么画？ | 业务方 → 通知 API → MQ → 分通道 worker → 三方。先落库再入队。 |
| 5 | 为什么声明 at-least-once？ | MQ 重投 + 三方重试。exactly-once 跨三方做不到，是 over-engineering。 |
| 6 | 幂等怎么做？ | \`notification_id\` SET NX；再加 user+模板+窗口去重。客户端按 id 再滤。 |
| 7 | token 失效信号？ | FCM \`UNREGISTERED\`；APNS 常见 \`410\`。反馈处理器标 inactive，停推。 |
| 8 | 为什么要分通道 worker？ | 速率、鉴权、重试、计费不同。SMS 慢不能拖死 Push。 |
| 9 | 营销突发怎么处理？ | fan-out 入 MQ，按三方配额漏。不要 API 里循环千万用户。 |
| 10 | 静默时段怎么处理？ | 营销延后到时段结束；验证码/支付立即发。按用户时区判。 |
| 11 | SMS 和 Push 回执差在哪？ | SMS 有 DLR；APNS 无设备正向回执。可达不要编精确投递率。 |
| 12 | 限流讲到什么深度？ | 用户级/通道级放哪、事务与营销分开。算法回 Ch04，不要整章变限流课。 |`,
});
