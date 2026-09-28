import { writeChapter } from "./write-chapter.mjs";

const d2 = (src) => {
  const body = src.trim();
  const sized = /style\.font-size/.test(body) ? body : `style.font-size: 12\n${body}`;
  return "```d2\n" + sized + "\n```";
};

writeChapter({
  id: "ch12",
  num: "12",
  title: "设计聊天系统",
  kind: "case",
  relatedChapters: ["ch39", "ch40", "ch37"],
  sections: [
    {
      id: "intro",
      heading: "",
      secNum: null,
      related: [],
      body: [
        "> **预计**：50–60 分钟 ｜ **前置**：Ch01 4 步法；协议见 Ch40、无状态/LB 见 Ch39",
        "> **目标**：默认 **WebSocket**；讲清消息状态、群聊分片、在线状态。不把 E2EE / 语音做成主线。",
        "",
        "聊天是第四道完整 case。Feed 是一对多的异步时间线；这题反过来：**低延迟双向**，连接还是有状态的。面试官要看的不是你能不能画出 MQTT 协议课 + Signal + 百万语音频道，而是：**协议问清、有状态连接讲清、三个 hard part（这题最该挖透的三块）讲透。**",
        "",
        "系统看起来就是发一条、对面秒到。难点在长连接怎么挂、消息怎么不丢不乱、大群别把一台机器打穿。",
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
        "> 「聊天三个 hard part：协议和有状态连接、消息不丢不乱和状态、群聊分片加在线状态。我先确认单聊还是群聊、要不要已读和多端。规模按千万 DAU 白板：并发是百万级长连接，消息 QPS 千到万。架构默认 **WebSocket**；chat 服务 **有状态**，要 conn registry / 服务发现（Ch39）。消息按会话 + seq 进 KV；**at-least-once + 客户端 seq 幂等**。小群写时 push，大群按 `group_id` 存一份、读时 pull。presence 心跳 + pubsub。」",
        "",
        "然后按 4 步走，别一上来画终图。",
        "",
        d2(`
direction: right
s1: "1 协议 + 估算"
s2: "2 高层 WS"
s3: "3 消息 / 群"
s4: "4 presence"
s1 -> s2 -> s3 -> s4
`),
        "",
        "| 时间盒 | 你在做什么 |",
        "|---|---|",
        "| 3–10 min | 澄清：单聊/群聊、多端、已读、群规模、E2EE 先不做 |",
        "| 接着 2 min | back-of-envelope：千万 DAU；百万级 WS；消息千到万 QPS |",
        "| 10–15 min | 高层：client → WS / chat → msg store + presence |",
        "| 10–25 min | deep dive：有状态连接、消息状态、群聊分片 + heartbeat |",
        "| 3–5 min | wrap-up：3 个 bottleneck（长连接 failover、大群 fan-out、presence 抖动） |",
        "",
        "**red flag：** 还没问单聊/群聊就画 Discord 语音；还没估连接数就讲 C10M 论文；默认 long-poll；声称 exactly-once；E2EE / QUIC 当主架构。那是 over-engineering，或把 Ch40 / 语音题整章搬进来。",
      ].join("\n"),
    },
    {
      id: "sec-clarify",
      heading: "澄清问题清单",
      secNum: "12.1",
      related: [],
      body: [
        "没问清楚就画图 = Jimmy。聊天这题 5–7 个问题就停，其余自己假设写白板。",
        "",
        "| 你问 | 典型回答 / 你自己的假设 | 它改什么 |",
        "|---|---|---|",
        "| 单聊、群聊，还是都要？ | **都要**；群先按小群，大群单独挖 | 小群 push vs 大群 pull |",
        "| 要多端同步吗？ | **要**（手机 + 桌面） | 每端一个 cursor，不是一份连接 |",
        "| 已读回执？ | **要**；大群不做全员已读 | sent / delivered / read |",
        "| 群规模上限？ | 教学：小群几百；大群万级以上改 pull | 写放大 vs 读聚合 |",
        "| 端到端加密？ | **本场不做** | 服务器可见明文；追问再一句 |",
        "| 图/视频？语音？ | 媒体只存 URL；**语音另一道题** | 不设计 CDN / WebRTC |",
        "",
        "面试官说「你定」时，把假设写上去：",
        "",
        "> 「我假设：单聊 + 群聊都要；多端；已读回执。小群几百人内写时 fan-out，更大按 `group_id` 存一份再 pull。E2EE 和语音本场不展开。先按这个画，不对你打断我。」",
        "",
        "问到语音 / 百万麦序：**承认差别，立刻收口。** 「那是另一道题，这里不设计 WebRTC。本场按文本 IM + WebSocket 讲。」问太多超过 10 分钟也是 red flag。黄金线还是那条：**问关键问题 → 自己给假设 → 写白板 → 继续。**",
      ].join("\n"),
    },
    {
      id: "sec-estimate",
      heading: "粗估",
      secNum: "12.2",
      related: ["ch03"],
      body: [
        "公式细节在 Ch03。这里只要数量级，证明你知道 **IM 的 bottleneck 先是长连接数，再是消息 QPS。** 下面用公开量级做白板假设，不是某厂内部数字。",
        "",
        "假设：约 **1000 万 DAU**；峰值约 15% 同时挂着 WS；活跃用户日均发约 20 条。",
        "",
        "| 项 | 怎么估 | 量级 |",
        "|---|---|---|",
        "| 并发连接 | 1e7 × 15% | **约 1e6–2e6** 条 WS |",
        "| 发消息 QPS | 1e7 × 0.5 活跃 × 20 / 86400 | **约 1e3**；峰值 ×5 **约 5e3–1e4** |",
        "| 读 | 单聊约 1:1；群聊按人数放大 | 白板仍是万级，大群改 pull 截断 |",
        "| 文本存储 | ~200 B × 1e8 条/天 | **约 20 GB/天**；权威在会话 KV |",
        "| 连接内存 | 2e6 × 数 KB～十几 KB | **集群十几到几十 GB**；不是单机塞满 |",
        "",
        "2026 不要背 2010 年那句「1 万连接 = 10 GB」。事件驱动下每条连接是 KB 级；**单机能挂多少是运行时问题，面试要讲的是集群：conn registry、机器挂了怎么迁、别对全体成员在一台盒子上 fan-out。**",
        "",
        "**面试怎么说：**",
        "",
        "> 「千万 DAU 白板：峰值百万级长连接，消息日均千 QPS、峰值万级。这题 bottleneck 先是有状态连接，不是把消息 QPS 算成短链那种读多写少。存储按会话 + seq，一天几十 GB 文本量级。」",
        "",
        "常见算错：只报消息 QPS，假装这是唯一负载；或把某产品真实日消息量当自己的内部数字。教学用数量级，阈值到 deep dive 再说。",
      ].join("\n"),
    },
    {
      id: "sec-arch",
      heading: "高层架构",
      secNum: "12.3",
      related: ["ch39", "ch40", "ch37"],
      body: [
        "从左到右：Client → WS gateway / chat svc（**有状态**）→ 消息存储 + presence。登录、资料仍走无状态 HTTP。面试官 buy-in 之后再拆协议和消息路径。",
        "",
        d2(`
direction: right
app.class: go
app: "Client"
chat.class: step
chat: "WS / Chat"
msg.class: store
msg: "Msg store"
pres.class: store
pres: "Presence"
app -> chat
chat -> msg
chat -> pres
`),
        "",
        "**本图引用**：Ch39 负载均衡与无状态 · Ch40 协议选型 · Ch37 存储选型",
        "",
        "**为什么 chat 有状态、API 无状态（必答）：** WebSocket 是持久连接，socket 住在某一台 chat 上。那台机器内存里有「用户 A 的连接」。换一台 = 断线重连。所以 chat 层要 **conn registry**（user → server / connection），扩缩和 failover 都比无状态 Web 贵——细节回 Ch39，不要把本章讲成 LB 课。登录 / 改资料继续 HTTP + LB，别把所有 endpoint 塞进 WS。",
        "",
        "**schema（够用就停）：** `message`（conv_id、seq、from、body、client_seq）；小群可选 `inbox`（user_id、seq、msg_ref）；`presence`（user_id、online、last_seen，TTL）；conn registry（user_id → chat 节点）。消息按 **会话 + 单调 seq** 进 KV / 宽列（Ch37），不要用关系库当海量聊天主存。",
        "",
        "离线走推送（点到 Ch10），媒体只存对象存储 URL。协议对比和有状态路由是下一个 deep dive；这里先停，问一句：「方向 OK 吗？接下来挖 WebSocket 为什么有状态、消息三态，以及群聊分片。」",
        "",
        "**面试怎么说：**",
        "",
        "> 「双向聊天我默认 WebSocket。chat 有状态，旁边一张 conn registry；消息按 conv + seq 落 KV；presence 单独一条腿。HTTP 只做登录资料。」",
      ].join("\n"),
    },
    {
      id: "sec-protocol",
      heading: "深入 · 协议与有状态连接",
      secNum: "12.4",
      related: ["ch40", "ch39"],
      body: [
        "第一个 hard part。**服务器怎么把消息推到客户端？** 这是协议问题；推到哪一台是有状态问题。两者绑在一起。",
        "",
        d2(`
grid-columns: 2
old: {
  label: "Poll / Long-poll"
  class: group
  grid-columns: 3
  a.class: step
  a: "空转或 hold"
  b.class: step
  b: "半双工"
  c.class: step
  c: "演进史"
}
ws: {
  label: "WebSocket · 默认"
  class: groupOk
  grid-columns: 3
  d.class: ok
  d: "双向推"
  e.class: ok
  e: "低开销"
  f.class: ok
  f: "有状态"
}
`),
        "",
        "| | Poll | Long-poll | WebSocket（**默认**） |",
        "|---|---|---|---|",
        "| 推 | 客户端定时问 | 服务器 hold 到有消息 | 服务器随时推 |",
        "| 双向 | 否 | 否（发另走 HTTP） | **全双工** |",
        "| 开销 | 大量空查询 | 超时就要重开请求 | 一次握手，帧很小 |",
        "| LB | 无状态好做 | 收发可能不在同一台 | 连接绑死一台 |",
        "| 面试 | 演进史，一句话 | 防火墙兜底 | **2026 第一答案** |",
        "",
        "**SSE** 是服务器 → 客户端单向流，适合通知和 LLM token（Ch40）。聊天要发也要收，用 SSE + POST 等于两条通道，不当默认。**MQTT** 一句：移动端省电推送可以走。**QUIC** 一句：弱网切 Wi-Fi / 蜂窝时连接迁移更稳。两句点到为止，不要开协议课。",
        "",
        "Long-poll 为什么不够：HTTP 无状态，LB 一轮询，A 的发送打到 server 1，B 的 hold 可能在 server 2——server 1 **不知道转给谁**。WebSocket 把连接钉在一台，再靠 registry 跨机转发。",
        "",
        "| | 无状态 HTTP API | 有状态 chat |",
        "|---|---|---|",
        "| 扩缩 | 任意切 | 切了连接断，要迁或重连 |",
        "| LB | round-robin | sticky，或先服务发现再连（Ch39） |",
        "| 内存 | 请求结束就没 | socket + 路由表 |",
        "",
        "客户端不要对 chat 层无脑 round-robin。流程：认证 → 发现一台合适的 chat（地域 / 容量）→ 升级 WS → 登记 user → 这台。机器挂了：客户端重连，从 KV 把 seq 之后的消息补回来——**消息不丢靠存储，不靠那根 socket 永不断。**",
        "",
        "**面试怎么说：**",
        "",
        "> 「Poll / long-poll 当演进。默认 WebSocket。chat 有状态，要 registry，不能当无状态 Web 切。SSE 单向，MQTT / QUIC 各一句场景，不展开。」",
        "",
        "trade-off：有状态让推送简单，换来 failover 贵。为了「每台都能处理任何人」把每条消息广播到全部 chat 节点，是 over-engineering。",
      ].join("\n"),
    },
    {
      id: "sec-msg",
      heading: "深入 · 消息可靠性、顺序与状态",
      secNum: "12.5",
      related: ["ch37"],
      body: [
        "第二个 hard part。用户要的是：**不丢、会话内有序、对勾状态对。** 白板默认 **at-least-once + 客户端 seq 幂等**，不要假装跨设备 exactly-once。",
        "",
        d2(`
shape: sequence_diagram
a: "Client A"
chat: "Chat svc"
kv: "Msg store"
b: "Client B"
a -> chat: "send + seq"
chat -> kv: "persist"
chat -> a: "ACK sent"
chat -> b: "push"
`),
        "",
        "**本图引用**：Ch37 存储选型",
        "",
        "**先持久化再推。** B 的连接当时不在，消息已经在 KV 里；B 上线按 seq 拉取。推失败不等于丢。离线再走 Push（Ch10），那是唤醒，不是权威通道。",
        "",
        "| | at-most-once | at-least-once + 幂等（**默认**） | exactly-once |",
        "|---|---|---|---|",
        "| 丢 | 可能 | 重试补 | 端到端极难 |",
        "| 重 | 不重 | 可能，靠 `client_seq` 去重 | 跨连接做不到免费 |",
        "| 面试 | IM 不能丢 | ACK + 重试；服务端按发送方 + seq 去重 | over-engineering |",
        "",
        "客户端发出去带 `client_seq`（或 client_msg_id）；服务端首次受理才分配会话内 `seq` 并落库，重复提交返回同一个 `seq`。会话内顺序 = **服务器提交序**，不要用 `created_at`（同一秒撞车）。A↔B 的序不必和 C↔D 比——不需要全局有序。",
        "",
        "多端：每个设备自己一个 cursor（见过的最大 seq）。落后的设备上线拉缺口。发送也由服务端发号，多端不会撞 ID。",
        "",
        d2(`
grid-columns: 2
states: {
  label: "三态 · 默认"
  class: groupOk
  grid-columns: 3
  a.class: ok
  a: "Sent 已发"
  b.class: ok
  b: "Delivered"
  c.class: ok
  c: "Read 已读"
}
traps: {
  label: "别搞错"
  class: groupBad
  grid-columns: 3
  d.class: bad
  d: "大群别全员读"
  e.class: bad
  e: "回执会丢"
  f.class: bad
  f: "状态不倒退"
}
`),
        "",
        "| 状态 | 含义 | 谁触发 |",
        "|---|---|---|",
        "| **Sent** | 服务端收到并落库 | 给 A 的 ACK |",
        "| **Delivered** | 对端设备收到 | B 的 ACK |",
        "| **Read** | 对端打开了会话 | B 的已读回执 |",
        "",
        "回执也是一条消息，走同一条 WS，type 不同。回执 **at-least-once**：只允许状态向前（Read > Delivered > Sent），重复包不能把蓝勾打回灰勾。大群不要给每个人广播「全员已读」——那是写放大；每人自己记 last_read 即可。",
        "",
        "**面试怎么说：**",
        "",
        "> 「先落库再推。at-least-once，客户端 seq 去重。会话内 seq 定序。对勾是 sent / delivered / read，回执幂等、不倒退。大群不做全员已读。」",
      ].join("\n"),
    },
    {
      id: "sec-group",
      heading: "深入 · 群聊分片与在线状态",
      secNum: "12.6",
      related: ["ch39", "ch37"],
      body: [
        "第三个 hard part。群消息和 presence 都是 fan-out；**小群写时推，大群读时拉。** 分片键是 `group_id`，别让名人群的在线推送打在同一台盒子上。这和 Ch11 的 hybrid 是同一类 trade-off。",
        "",
        d2(`
grid-columns: 2
small: {
  label: "小群 · push"
  class: groupOk
  grid-columns: 3
  a.class: ok
  a: "写时 fan-out"
  b.class: ok
  b: "每人 inbox"
  c.class: ok
  c: "读 O(1)"
}
large: {
  label: "大群 · pull"
  class: group
  grid-columns: 3
  d.class: step
  d: "按 group_id"
  e.class: step
  e: "只存一份"
  f.class: step
  f: "读时拉"
}
`),
        "",
        "| | 小群 push（写时 fan-out） | 大群 pull / inbox（读时） |",
        "|---|---|---|",
        "| 写 | 复制到每个成员 inbox，写 = N | 按 `group_id` 只写一行 |",
        "| 读 | 扫自己的 inbox | 打开群再按 seq 拉 |",
        "| 在线推 | 对在线成员推一条 | **只推当前在看的人**；其余上线再拉 |",
        "| 失败模式 | 万人群把 chat / KV 打满 | 冷成员打开稍慢 |",
        "| 教学线 | 几百人内 | 过线就停全员 fan-out |",
        "",
        "存储和连接都按 `group_id` 分片：同一群的消息落同一分区，查询是一次范围扫。名人群 = 热 key，但 **不要在一台机器上对全部在线成员做 fan-out**——在线列表本身就可能比单机连接预算大。大群：消息一份；推送只打「此刻打开这个群」的连接；其他人用 cursor 补。",
        "",
        "白板阈值说 **大约几百人** 当教学线，并补一句「生产看写放大和 p99，不是魔法数」。不要把这题做成 Discord 语音频道。",
        "",
        d2(`
direction: right
c1.class: go
c1: "Client ping"
c2.class: step
c2: "续 TTL"
c3.class: warn
c3: "超时离线"
c4.class: store
c4: "pubsub"
c1 -> c2 -> c3 -> c4
`),
        "",
        "**本图引用**：Ch39 负载均衡与无状态",
        "",
        "presence 不要跟消息权威路径绑死。心跳续 Redis TTL；窗口内没续上才判离线——**滞后是为了抗抖**（地铁闪断别让绿点狂闪）。好友列表用 pubsub 推状态；万人群 **进群 / 刷新再拉**，不做全员实时广播。",
        "",
        "| | 心跳短 | 心跳长 |",
        "|---|---|---|",
        "| 实时 | 绿点准 | 离线发现慢 |",
        "| 成本 | 费电、打 presence | 省电 |",
        "| 白板 | Web 可 10s 量级 | 移动端拉长，配合 TTL 窗口 |",
        "",
        "`last_seen` 可以持久化；「现在是否在线」丢了也能靠重连重建，不必进消息 KV。",
        "",
        "**面试怎么说：**",
        "",
        "> 「小群写时 fan-out 进 inbox；大群按 `group_id` 存一份，读时 pull，别对全体在线成员在一台机器上推。presence 心跳 + TTL 防抖，好友用 pubsub，大群进群再拉。」",
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
        "原书把 poll → long-poll → WebSocket 讲得很完整，骨架仍对。过时的是把演进史当主答案、以及连接估算还停在「1 万连接 10 GB」。",
        "",
        "| 原书或笔记 | 现在怎么答 |",
        "|---|---|",
        "| 三种协议讲很细 | **WebSocket 默认**；poll / long-poll 各一句演进；SSE 单向不当聊天默认 |",
        "| 没提 MQTT / QUIC | 各 **一句**：移动推送省电 / 弱网切网。不开展成协议课 |",
        "| chat 用 ZooKeeper 发现 | 点到服务发现即可；etcd / Consul / 自研都行，细节 Ch39 |",
        "| 1 万连接 = 10 GB | 2026：每连接 KB 级；讲 **集群 failover + registry**，不写 C10M 论文 |",
        "| 群聊只讲小群 inbox | **小群 push、大群 pull**；按 `group_id` 分片 |",
        "| 没讲 sent / delivered / read | **三态 + 回执幂等** 进正文 |",
        "| E2EE / 语音写得很深 | 本场不主线；E2EE 一句陷阱，语音另一道题 |",
        "",
        "原书仍能用：客户端不直连、chat 有状态、历史进 KV、先存再推。过时的是把 long-poll 当终局、以及单机内存算术当架构。",
        "",
        "</details>",
      ].join("\n"),
    },
    {
      id: "sec-traps",
      heading: "追问陷阱",
      secNum: null,
      related: ["ch39", "ch40", "ch37"],
      body: [
        "1. **「WebSocket 还是 HTTP？」** → 收发默认 WS；登录资料仍 HTTP。别全塞进一条 socket。",
        "2. **「为什么不用 poll / long-poll？」** → 空转或 hold；long-poll 收发可能不同机。WS 是 2026 默认。",
        "3. **「SSE 行不行？」** → 单向。聊天要双向，不当默认（Ch40）。",
        "4. **「消息怎么不丢不重？」** → 先落库再推；at-least-once；`client_seq` 幂等。不假装 exactly-once。",
        "5. **「顺序怎么保证？」** → 会话内服务端 seq，不用 `created_at`。不需要全局有序。",
        "6. **「已读怎么做？」** → sent / delivered / read；回执也是消息，状态不倒退。大群不做全员已读。",
        "7. **「群聊怎么 fan-out？」** → 小群写时 push 进 inbox；大群按 `group_id` 存一份、读时 pull。",
        "8. **「名人群把一台打挂？」** → 分片 `group_id`；不要对全体在线成员在单机 fan-out。",
        "9. **「在线状态怎么不抖？」** → 心跳 + TTL 窗口；没续上才离线。大群进群再拉，不全员广播。",
        "10. **「E2EE 怎么做？」** → 服务器只见密文，搜/审核做不了。本场不展开 Signal；要做是隐私 vs 可审计的 trade-off。",
        "11. **「chat 挂了消息丢吗？」** → 不该丢。权威在 KV；客户端换机重连，拉 seq 缺口。",
        "12. **终图已经很大了还往上堆？** → MQTT 课、C10M、语音频道都不是本章。讲透三条 hard part 比画 20 个框得分高。",
      ].join("\n"),
    },
    {
      id: "sec-next",
      heading: "wrap-up 与下一步",
      secNum: null,
      related: ["ch13"],
      body: [
        "收尾不要说完美。三个 bottleneck 口播：",
        "",
        "| bottleneck | 你怎么接 |",
        "|---|---|",
        "| 百万长连接 / 有状态 failover | WS + conn registry；机器挂了重连，消息从 KV 补 |",
        "| 大群写放大 | 小群 push；大群 `group_id` 一份 + pull；别单机全员 fan-out |",
        "| presence 抖动 / 大群广播 | 心跳 TTL 防抖；好友 pubsub；大群惰性拉 |",
        "",
        "自测：合上这一页，用 30 秒开场 + 白板高层，把 WebSocket 有状态、三态回执、小群/大群 fan-out 讲给空气听。哪句卡，回哪一节。",
        "",
        "下一道题是 **Ch13 · 设计搜索系统**。聊天是低延迟双向；搜索切到倒排和前缀补全——从「推到人」变成「输入即查」。",
      ].join("\n"),
    },
  ],
  reviewMd: `# Ch12 · 记忆闪卡

| # | 正面 | 背面 |
|---|---|---|
| 1 | 聊天三个 hard part？ | 协议 + 有状态连接；消息不丢不乱和状态；群聊分片 + presence。 |
| 2 | 2026 默认协议？ | **WebSocket**。poll / long-poll 是演进；SSE 单向不当默认。 |
| 3 | MQTT / QUIC 怎么提？ | 各一句：移动省电推送 / 弱网切网。不开展成协议课。 |
| 4 | 为什么 chat 有状态？ | WS 绑在一台；要 conn registry。不能当无状态 Web round-robin（Ch39）。 |
| 5 | 高层链路怎么画？ | Client → WS / chat → msg store + presence。HTTP 只做登录资料。 |
| 6 | 消息怎么不丢不重？ | 先落库再推；**at-least-once** + \`client_seq\` 幂等。不假装 exactly-once。 |
| 7 | 顺序靠什么？ | 会话内服务端 seq，不用 created_at。不需要全局有序。 |
| 8 | 消息三态？ | Sent（服务端 ACK）→ Delivered（对端设备）→ Read（打开会话）。回执不倒退。 |
| 9 | 小群 vs 大群？ | 小群写时 fan-out 进 inbox；大群按 \`group_id\` 存一份、读时 pull。 |
| 10 | 名人群注意什么？ | 分片 \`group_id\`；不要在一台机器上对全体在线成员 fan-out。 |
| 11 | presence 怎么做？ | 心跳续 TTL 防抖；好友 pubsub；大群进群再拉。 |
| 12 | 问到 E2EE？ | 服务器只见密文，搜/审核做不了。本场不展开 Signal。 |`,
});
