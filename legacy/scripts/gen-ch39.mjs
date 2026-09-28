import { writeChapter } from "./write-chapter.mjs";

const d2 = (src) => {
  const body = src.trim();
  const sized = /style\.font-size/.test(body) ? body : `style.font-size: 12\n${body}`;
  return "```d2\n" + sized + "\n```";
};

writeChapter({
  id: "ch39",
  num: "39",
  title: "负载均衡与无状态",
  kind: "foundation",
  relatedChapters: ["ch02", "ch05", "ch12", "ch17"],
  sections: [
    {
      id: "intro",
      heading: "",
      secNum: null,
      related: ["ch05", "ch40"],
      body: [
        "> **预计**：90–120 分钟 ｜ **前置**：Ch05 哈希环；Ch02 加 LB",
        "> **目标**：L4/L7；会话 sticky vs 无状态；Maglev vs 一致性哈希 LB。不去云购物。Ch05 环的细节不重讲。",
        "",
        "这是 **M6 第四块基础芯片**，不是又一道 4 步设计题。主线里 Ch02 第 3 集加 LB、第 6 集无状态，Ch17 网关按 path 路由，Ch12 长连接会碰到「必须粘在一台」——本章把 **L4 还是 L7、会话放哪、后端怎么选**讲透。设计题里只引用，不在白板上开 LB 课。Ch05 的环 + vnode 已经会了，这里只对照 **LB 选后端** 怎么用哈希，不重讲查找与迁移手算。",
        "",
        "**一句话：** 无状态应用前面放 LB：L4 按**连接**转发，L7 按**请求**转发；会话默认 **外置（Redis）** 而不是 sticky；线速 L4 的后端选择用 **Maglev 查表**，不要把 Ch05 的 KV 环当包转发默认。",
        "",
        "三个 hard part（最该挖的那块）：",
        "",
        "1. **L4 vs L7 怎么开口** —— connection vs request；TLS 在 L7 终止；gRPC / HTTP2 要 L7 才能按 RPC 拆",
        "2. **会话：sticky vs 无状态** —— 默认 stateless + 外部 session store；sticky 是真有内存态时的兜底",
        "3. **Maglev vs 一致性哈希 LB** —— 对照 Ch05：环给分区，查表给 LB；面试就这一句",
        "",
        "本章**不讲**：云厂商 ELB / ALB / NLB SKU 目录、K8s Service YAML、把 Ch05 虚拟节点再讲一遍当脊柱、Maglev 填表的 C++ 实现、DNS 专章。Anycast / DNS 只点到「流量怎么进机房」。东向西 Mesh 一句丢给 **Ch44**。协议细节（REST / gRPC / WS）在 **Ch40**。",
      ].join("\n"),
    },
    {
      id: "sec-pitch",
      heading: "一句话定义 · 面试 20 秒开口",
      secNum: "39.1",
      related: ["ch02", "ch05"],
      body: [
        "先把评分信号打出来：你会分连接和请求，默认无状态，知道 Maglev 是 LB 查表不是又画一个环。",
        "",
        "> 「加完机器，请求发给哪一台是 LB：流量分发 + 健康检查 + failover。先选 **L4 还是 L7**：L4 看连接（5-tuple），快，不解析 HTTP，TLS 过身；L7 看请求，能终止 TLS、按 path / header 路由。gRPC / HTTP2 一条 TCP 上多路 RPC，L4 会把整条连接钉死一台，要 L7 按请求拆。会话默认 **无状态应用 + Redis（或 JWT）**，不要第一句 sticky。sticky 是进程里真有态、搬不走时的兜底。后端选择：同构短请求轮询就够；L4 线速、要连接少重置，用 **Maglev 查表**。环 + vnode 是 Ch05 给 KV / 缓存分区的，不是包转发默认。下线先 **connection draining**。跨机房点 Anycast 或 DNS，不当成 DNS 课。」",
        "",
        "整章按这一条链走。上场 20 秒念完就停，让面试官决定要挖 L4/L7、会话还是 Maglev。",
        "",
        d2(`
direction: right
l47.class: go
l47: "L4 vs L7"
sess.class: step
sess: "会话"
mag.class: ok
mag: "Maglev"
l47 -> sess -> mag
`),
        "",
        "本图引用：Ch02 加 LB / 无状态 · Ch05 哈希环（对照，不重讲）",
        "",
        "| 面试官问法 | 你落在哪一截 |",
        "|---|---|",
        "| 「L4 和 L7 差在哪？」 | 连接 vs 请求；TLS 谁卸；gRPC 为什么必须 L7 |",
        "| 「session 怎么保持？」 | 默认外置；sticky 的代价主动说 |",
        "| 「一致性哈希做 LB？」 | Ch05 环给分区；Maglev 查表给后端选择 |",
        "",
        "**red flag：** 一上来报云产品名；第一句 sticky；把 vnode 环默写成 L4 转发；为 gRPC 画一台 L4 就宣布负载均匀了。",
      ].join("\n"),
    },
    {
      id: "sec-l4l7",
      heading: "机制 · L4 vs L7（连接还是请求）",
      secNum: "39.2",
      related: ["ch17", "ch40"],
      body: [
        "第一个 hard part。**2026 面试里，会背 OSI 层号不如会说「我看见的是连接还是请求」。**",
        "",
        "L4（传输层）只看 **IP + 端口**，常见再加协议，合成 **5-tuple**（src IP / src port / dst IP / dst port / protocol）。它把一条 **TCP / UDP 连接**钉到一台后端，包内容当字节转发。不解析 HTTP，也就看不见 URL、Cookie、gRPC method。",
        "",
        "L7（应用层）终止客户端连接，**读懂请求**：path、header、cookie、HTTP/2 stream。然后自己再连后端。客户端到 LB 是一跳，LB 到 App 是另一跳——这就是反向代理。网关（Ch17）是在这层加认证、限流、协议转换；本章只取「按请求选后端」这一刀。",
        "",
        d2(`
grid-columns: 2
l4: {
  label: "L4 连接"
  class: group
  grid-columns: 2
  a.class: step
  a: "5-tuple"
  b.class: step
  b: "不拆 HTTP"
}
l7: {
  label: "L7 请求"
  class: groupOk
  grid-columns: 2
  c.class: ok
  c: "解析 HTTP"
  d.class: ok
  d: "可卸 TLS"
}
`),
        "",
        "| | **L4** | **L7** |",
        "|---|---|---|",
        "| 看见什么 | 连接：IP + Port（5-tuple） | 请求：path / header / cookie / RPC |",
        "| 决策粒度 | **整条连接** 进同一台后端 | **每个请求**（HTTP/2 上每条 stream）可换后端 |",
        "| TLS | 默认 **passthrough**（不解包） | 常在 LB **termination**；内网可再加密 |",
        "| 延迟 / CPU | 便宜，可线速 | 解析和加解密更贵 |",
        "| 典型用途 | 吞吐优先的 TCP/UDP、TLS 过身 | HTTP API、按路径灰度、gRPC |",
        "",
        "白板链路先画直的，不要扇出三台 App。",
        "",
        d2(`
direction: right
cli.class: go
cli: "Client"
lb.class: step
lb: "LB"
app.class: ok
app: "App"
cli -> lb -> app
`),
        "",
        "本图引用：Ch17 API 网关（L7 加料）· Ch40 协议选型（HTTP / gRPC 在那章展开）",
        "",
        "**TLS 终止为什么多在 L7：** 要看 HTTP，必须先解开 TLS。证书和私钥落在 LB，后端可以是明文或再套一层内网 TLS（re-encrypt）。L4 过身则证书在 App 上，LB 当字节管道——合规「证书不能出应用」时用，代价是 LB 变瞎。面试怎么说：",
        "",
        "> 「要按 path 路由或看 header，TLS 在 L7 卸。只要过身、证书必须在应用里，才用 L4 passthrough。」",
        "",
        "**gRPC / HTTP2 是送命题。** 一条长连接上 multiplex 很多 RPC。L4 只看见这一条连接，所有 RPC 进同一进程——多副本等于没分到。L7 终止 HTTP/2，按 **stream / RPC** 选后端。Ch40 讲协议；这里只要求：题里出现 gRPC，开口就是 L7 awareness，不要把 L4 当答案。",
        "",
        "L7 上一次请求长什么样（参与者就 Client / L7 / App）：",
        "",
        d2(`
shape: sequence_diagram
cli: "Client"
lb: "L7 LB"
app: "App"
cli -> lb: "TLS req"
lb -> app: "forward"
app -> lb: "200"
lb -> cli: "200"
`),
        "",
        "L4 没有「forward 这一次 GET」这一层：握手之后，这条连接上的字节都进同一台，直到断开。",
        "",
        "生产常见是 **两级**：前面 L4 / VIP 抗包、做健康与 failover；后面 L7 做路由。面试画 Client → LB → App 就够，被问再拆两级。不要一上来画 Mesh 全家桶——东西向 sidecar 是 **Ch44**。",
        "",
        "面试怎么说：",
        "",
        "> 「L4 按连接，L7 按请求。HTTP API 和 gRPC 我默认 L7；纯 TCP 吞吐或 TLS 必须过身才 L4。TLS 要在能看见 HTTP 的那一层卸。」",
        "",
        "**red flag：** 用 OSI 七层背诵代替决策；声称 L4「也能看 URL」；gRPC 只画 L4 还说负载均匀；把网关、WAF、Mesh 三套都画上却讲不清连接 vs 请求。",
      ].join("\n"),
    },
    {
      id: "sec-session",
      heading: "机制 · 会话：sticky vs 无状态",
      secNum: "39.3",
      related: ["ch02", "ch12"],
      body: [
        "第二个 hard part。Ch02 第 3 集加完 LB 立刻出现：session 若在某台 Web 内存里，水平扩展是假的。**2026 第一答案不是 sticky，是把态搬出进程。**",
        "",
        d2(`
grid-columns: 2
sticky: {
  label: "Sticky"
  class: groupBad
  grid-columns: 2
  a.class: warn
  a: "钉死一台"
  b.class: bad
  b: "挂机丢会话"
}
stateless: {
  label: "无状态"
  class: groupOk
  grid-columns: 2
  c.class: ok
  c: "任意一台"
  d.class: ok
  d: "Session 外置"
}
`),
        "",
        "| | **Sticky**（亲和） | **无状态 + 外置 store** |",
        "|---|---|---|",
        "| 请求去哪 | 同一用户尽量同一 App | **任意**健康实例 |",
        "| 态在哪 | 进程堆 / 本地磁盘 | **Redis**（或 DB）；或 JWT 放客户端 |",
        "| 扩缩 / 挂机 | 新机器是冷的；那台挂了会话没了 | 实例可扔；下一跳从 store 读回 |",
        "| LB 要记什么 | cookie 或源 IP → 节点 | 可以完全不管用户是谁 |",
        "| 何时开口 | 真有搬不走的内存态（对局、长连接 presence） | **默认** |",
        "",
        "无状态链路多一跳 store，不要把三台 App 扇出去：",
        "",
        d2(`
direction: right
cli.class: go
cli: "Client"
lb.class: step
lb: "LB"
app.class: ok
app: "App"
sess.class: store
sess: "Redis"
cli -> lb -> app -> sess
`),
        "",
        "本图引用：Ch02 第 6 集无状态 · Ch12 聊天（长连接是例外，不是默认）",
        "",
        "**为什么默认 Redis 而不是 sticky：** 自动扩缩、滚动发布、一台 OOM，用户不该掉登录。LB 自己也可以水平扩——它不必存会话表。代价是每请求一次 RTT（毫秒级，还可本地短 TTL 挡热点）。这是 trade-off，不是免费。",
        "",
        "JWT / 加密 cookie：态在客户端，App 仍无会话存储。作废、续期、体积是另一笔账——Ch02 点过，这里不把 token 课展开。购物车、登录态要能踢人、要服务端失效，仍偏向 Redis。",
        "",
        "Sticky 两种实现，开口就要说缺点：",
        "",
        "| 做法 | 怎么粘 | 立刻要说的坑 |",
        "|---|---|---|",
        "| **Cookie affinity** | LB 种 cookie，指向某实例 | 用户清 cookie 就换机；实例没了 cookie 失效 |",
        "| **Source IP** | 同一客户端 IP 进同一台 | **NAT / 公司出口 / CDN** 一个 IP 上万人，全挤一台——典型 bottleneck |",
        "",
        "一致性哈希把 `user_id` 打到实例，比「随便 sticky」少抖动，仍是**把态留在进程里**。实例挂了，那一截用户的内存态还是没了。要保态，还是外置；哈希此时只是「谁处理这个用户的长连接」，不是 session 备份。",
        "",
        "**真有状态的例外（主动讲，免得被追问打懵）：** 多人游戏对局、语音房、Ch12 那种连接上就有 presence / 推送槽的网关。这时：",
        "",
        "1. 先问能不能把态外置（多数 HTTP 业务能）。",
        "2. 不能，再用哈希或 sticky **钉连接**，并承认 failover 会断、要重连或迁移协议。",
        "3. 不要口头无状态、图上却把购物车画在 Web 堆里——那是 red flag。",
        "",
        "面试怎么说：",
        "",
        "> 「默认无状态：App 可扔，session 在 Redis。sticky 不是第一答案。源 IP 亲和在 NAT 后面会变成单机热点。IM / 对局这种内存态，我才用哈希钉连接，并说挂了要重连。」",
        "",
        "**over-engineering：** 无状态已经够用，却上 sticky + 会话复制 + 本机缓存三套，还讲不清谁是权威。",
      ].join("\n"),
    },
    {
      id: "sec-maglev",
      heading: "机制 · Maglev vs 一致性哈希 LB（对照 Ch05）",
      secNum: "39.4",
      related: ["ch05"],
      body: [
        "第三个 hard part。Ch05 已经把环、顺时针、vnode、`hash % N` 讲完。**本章禁止把那一章再讲一遍。** 这里只回答：同样叫 consistent hashing，**KV 分区**和 **LB 选后端** 为什么不是同一套作业。",
        "",
        d2(`
grid-columns: 2
ring: {
  label: "Ch05 环"
  class: group
  grid-columns: 2
  a.class: step
  a: "KV 分区"
  b.class: step
  b: "O log n"
}
mag: {
  label: "Maglev 表"
  class: groupOk
  grid-columns: 2
  c.class: ok
  c: "LB 选后端"
  d.class: ok
  d: "O(1) 查表"
}
`),
        "",
        "本图引用：Ch05 一致性哈希（环 + vnode 在那边；这里只对照）",
        "",
        "**面试用哪一句（背这一段就够）：**",
        "",
        "> 「Ch05 的环给 **缓存 / KV 分区**：节点有名字、会任意上下线，查找可以 O(log n)，加减期望只动 k/n。Maglev（NSDI 2016）给 **L4 LB 选后端**：预计算一张固定大小查找表（论文常用素数 **M = 65537**），用连接的 5-tuple 哈希成下标，**O(1) 取出 backend**。每台 Maglev 用同一份健康后端集合独立算出**同一张表**，所以路由器 ECMP 把包打到哪台 Maglev 都选同一个后端，不必集群同步连接表。Karger 那条线优先少迁移；Maglev 论文写明：环要在几百 backend 上极均匀，表会大到不适合线速，所以改查表、**优先均分**，迁移大约仍是 1/N 量级，但不是同一套数据结构。」",
        "",
        "查一次后端就三条叶子：",
        "",
        d2(`
direction: right
tup.class: go
tup: "5-tuple"
tab.class: step
tab: "Lookup"
be.class: ok
be: "Backend"
tup -> tab -> be
`),
        "",
        "表怎么来的，面试点到即可，**不要默写置换代码：** 每个 backend 有一个对 0..M−1 的偏好顺序（名字哈希出 offset / skip）；大家轮流占领还空着的槽，直到填满。所以份额接近均分；加权就改变「轮到几次」。加减一台就**整表重算**，约 1/N 的槽换主人——和环上「只切一段」是同一数量级的故事，实现不是 vnode 环。",
        "",
        "| | **环 + vnode（Ch05）** | **Maglev 查表** |",
        "|---|---|---|",
        "| 作业 | 数据 / 缓存 **分区** | 每包 **选哪台 App** |",
        "| 查找 | 有序点上二分 | 下标一次，**O(1)** |",
        "| 节点 | 任意名字，可摘中间一台 | 任意 backend 集合 |",
        "| 均匀 | 靠大量 vnode | 靠表够大（素数 M）+ 轮流占槽 |",
        "| 论文动机 | 少迁移、热门网页缓存 | 线速、多 Maglev **无共享状态**仍一致 |",
        "| 白板 | KV / 缓存默认 | 「软件 L4 LB / Envoy maglev」 |",
        "",
        "Maglev **不是**纯无状态转发：稳定时靠表；表变了或 ECMP 把流打到另一台 Maglev 时，靠本机 **connection tracking** 尽量不把已建立的 TCP 重置。跟踪 miss 才重新查表。这和「App 无状态」不是一件事——LB 为了连接不掉可以记 5-tuple，App 仍然不该把购物车放堆里。",
        "",
        "回程一句：**Direct Server Return**（封装到 backend，响应直回客户端）让 LB 不吃回程带宽。点到为止，不要开成隧道课。",
        "",
        "Envoy / 数据面里的 `maglev` vs `ring_hash`：前者就是这张表；后者才是 Ch05 那条环。题是网关后面的软件 LB、每秒大量连接，说 Maglev；题是 Redis 分片，说环。**Jump Hash** 仍是 Ch05 那句：省内存但不能任意删桶，不是 L4 默认。",
        "",
        "面试怎么说：",
        "",
        "> 「分区走环。LB 走 Maglev 查表：O(1)，各 LB 独立算同一张表。我不会在 KV 题里填 Maglev 表，也不会在包转发里手画 vnode。」",
        "",
        "**red flag：** 把 Maglev 讲成「Google 版虚拟节点」然后开始手算 0–99 环；默写 Pseudocode 1；说一致性哈希已经过时或「很少用」（那是旧书对 `% N` 哈希的偏见，不是 2026）。",
      ].join("\n"),
    },
    {
      id: "sec-choose",
      heading: "选型表",
      secNum: "39.5",
      related: ["ch02", "ch17", "ch44"],
      body: [
        "白板先填层和态，再谈算法。轮询不是耻辱；五层 LB 才是 over-engineering。",
        "",
        "| 场景 | 默认 | 不要 |",
        "|---|---|---|",
        "| 无状态 HTTP API | L7；轮询或 least-request；session 在 Redis | 第一句 sticky |",
        "| 按 path / header 灰度 | L7 | 幻想 L4 看见 URL |",
        "| gRPC / HTTP2 | L7，按 RPC | L4 钉死一条连接 |",
        "| 纯 TCP / UDP 吞吐、TLS 过身 | L4 | 为「智能」强行解析应用层 |",
        "| 线速 L4、多 LB 无共享、少重置 | Maglev 查表 | 把 Ketama 环当每包默认 |",
        "| Redis / KV 分片 | **Ch05** 环 + vnode | Maglev 填表当分区作业 |",
        "| 对局 / 长连接 presence | 哈希或 sticky 钉连接；承认 failover | 口头无状态、态在堆里 |",
        "| 发布、缩容 | 健康检查 + **connection draining** | 直接杀进程上的连接 |",
        "| 跨机房入口 | Anycast VIP 或 DNS 把用户打进就近 Region | 在本章设计权威 DNS 与 TTL 全书 |",
        "| 服务间（东西向） | 点到 sidecar / 客户端 LB，细节 **Ch44** | 复制一张南北向大图当 Mesh |",
        "",
        "算法只留三句，不当目录：请求耗时均匀 → 轮询；耗时差、长连接 → 看当前连接/请求数（least-conn / least-request，这是**动态**的，不是静态表）；要亲和且后端集合会变 → 哈希（L4 线速用 Maglev，分区用环）。",
        "",
        "健康检查和 draining 点到：",
        "",
        d2(`
direction: right
probe.class: go
probe: "Probe"
sick.class: bad
sick: "Unhealthy"
drain.class: warn
drain: "Drain"
out.class: step
out: "Out of pool"
probe -> sick -> drain -> out
`),
        "",
        "**Health check：** 主动探测（TCP 通、HTTP 200、gRPC health）。连续失败摘出池，成功再加回。被动（看真实请求 5xx）可补一句，不要替代主动探测。摘了之后新连接不要再去；**已有连接**要 draining：停止调度新请求，等 in-flight 结束或超时，再下线。滚动发布不会 drain 就是把错误预算一次性花光。",
        "",
        "**Anycast / DNS（不是 DNS 章）：** 同一 VIP 从多个机房宣告，包进最近入口——这是 Anycast。DNS 把域名解析到不同 Region 是另一条进机房的路，TTL 和缓存会让切流变慢。面试各点一句，机制深挖留给网络/Ch02 第 7 集，不要在这里画解析链。",
        "",
        "面试怎么说：",
        "",
        "> 「无状态 HTTP 用 L7 + 外置 session。gRPC 必须 L7。L4 线速选后端用 Maglev。下线 drain。进机房 Anycast 或 DNS 点到为止。」",
      ].join("\n"),
    },
    {
      id: "sec-papers",
      heading: "论文与经典系统",
      secNum: "39.6",
      related: ["ch05"],
      body: [
        "M6 要能点名。下面 2 篇必读、2 篇选读。**面试用哪一句**写在表里；不背页码，不编造内部 pps。",
        "",
        d2(`
direction: right
kar.class: go
kar: "Karger 97"
ana.class: step
ana: "Ananta 13"
mag.class: ok
mag: "Maglev 16"
kar -> ana -> mag
`),
        "",
        "时间线只帮助记忆：先有「集合一变少搬家」的哈希，再有云上的软件 L4，再有 Google 把查表写进 NSDI。不是说你要实现三套。",
        "",
        "| | 文献 | 必读 / 选读 | 面试用哪一句 |",
        "|---|---|---|---|",
        "| 1 | **Eisenbud et al.**，NSDI 2016，*Maglev: A Fast and Reliable Software Network Load Balancer* | 必读 | 商品 Linux 上的软件 L4；ECMP 进 Maglev；**查找表**（常用 M=65537）O(1) 选后端；各实例独立算同一张表。连接跟踪挡重置。**环在极均匀 + 几百 backend 时表太大**，所以不走 Ketama。生产从 2008 用到论文发表 |",
        "| 2 | **Karger, Lehman, Leighton, Panigrahy, Levine, Lewin**，STOC 1997，*Consistent Hashing and Random Trees: Distributed Caching Protocols for Relieving Hot Spots on the World Wide Web* | 必读 | 名字就写在 **Web 热点 / 缓存**上：机器集合变，对象尽量还在原来那台。LB 场景 = 用哈希做亲和、少把流量打散。**环怎么画回 Ch05**，这里只取「少重映射」这一句 |",
        "| 3 | **Karger et al.**，WWW 1999，*Web Caching with Consistent Hashing* | 选读 | 把 STOC 想法接到缓存阵列：浏览器/代理用同一哈希选 cache。用来证明 CH 从一开始就是 **调度请求到哪台缓存**，不只是后来 Dynamo 的分区 |",
        "| 4 | **Patel et al.**，SIGCOMM 2013，*Ananta: Cloud Scale Load Balancing* | 选读 | 另一篇云软件 L4：控制面可靠、数据面水平扩，**DSR** 让回程不穿 LB。和 Maglev 一起说明「商品机 L4」是 2010 年代正统，不是某云购物清单 |",
        "",
        "**Maglev 再收三拳（不要第四拳去写 C++）：**",
        "",
        "1. **同一张表：** 后端集合相同 → 每台 Maglev 表相同 → ECMP 无共享状态仍选同一 backend。",
        "2. **均分优先：** 占槽轮流来，不是「vnode 再撒一遍」。",
        "3. **跟踪是兜底：** 表或 Maglev 亲和变了，本地 5-tuple 表尽量保住 TCP。",
        "",
        "Karger 1997 的 random trees / 热点网页协议不要展开——面试要的是 consistent hashing 这四个词的出处，以及它和 Maglev **目标函数不同**（少搬家 vs 线速均分）。",
      ].join("\n"),
    },
    {
      id: "sec-used",
      heading: "哪些设计题会用到",
      secNum: "39.7",
      related: ["ch02", "ch05", "ch12", "ch17", "ch29"],
      body: [
        "主线先做题，卡壳再跳进本章。回链不是把 M6 读完再开写。",
        "",
        "| 章 | 会用到哪一句 |",
        "|---|---|",
        "| **Ch02** 扩展 | 第 3 集托管 LB；第 6 集 **无状态**，sticky 当反例 |",
        "| **Ch05** 哈希 | 环给分区；Maglev **点到本章**，不要在那边填表 |",
        "| **Ch04** 限流 | 常做在 L7 / 网关；不是 L4 5-tuple 能看的配额 |",
        "| **Ch09** 短链 | Web 无状态；读路径缓存是 Ch38，不是 sticky |",
        "| **Ch11** Feed | 无状态 hydrate；不要把 timeline 钉在一台 Web 内存 |",
        "| **Ch12** 聊天 | 长连接 / presence：**可以**哈希钉网关；failover 要重连。HTTP 业务不要照抄 |",
        "| **Ch17** 网关 | L7 路由、TLS、限流；和「纯 L4 VIP」分层 |",
        "| **Ch18 / Ch24** 订单支付 | API 无状态；幂等键在存储里，不在某台 Tomcat session |",
        "| **Ch29** LLM 推理 | 请求级调度；gRPC 流式要 L7 / 专用调度，不要 L4 钉死 GPU 进程还以为在负载均衡 |",
        "| **Ch32** LLM 网关 | 和 Ch17 同一层：按请求，不是按连接 |",
        "| **Ch44** 微服务 | 东西向谁来 LB；本章只提供南北向词汇 |",
        "",
        "游戏对局、语音房：和聊天同类——有内存态就别装无状态。排行榜、对象存储的数据面不是靠 sticky 扩出来的。",
      ].join("\n"),
    },
    {
      id: "sec-2026",
      heading: "2026 vs 笔记 / 原书",
      secNum: null,
      related: [],
      body: [
        "<details>",
        "<summary>原书 / 笔记当时怎么讲 · 云购物和 vnode 重讲进这里</summary>",
        "",
        "笔记对应 AWS 书负载均衡章：反向代理全家桶、静态/动态算法长表、硬件 vs 软件、Nginx upstream、再补 Mesh / eBPF / 云 SKU。**那不是本章正文。** 2026 上场只带 L4 vs L7、无状态默认、Maglev 对照 Ch05。",
        "",
        "| 原书 / 笔记 | 现在怎么答 |",
        "|---|---|",
        "| ALB / NLB / CLB / GWLB 对照当主线 | **托管 L4 / L7**；不报型号 |",
        "| 「哈希很少用」因为 `% N` 重映射 | **过时。** 分区用环（Ch05）；L4 LB 用 Maglev |",
        "| 最少连接放进静态算法 | **动态**（看运行时连接数） |",
        "| sticky 写成正统方案 | **过渡 / 例外**；默认 Redis 或 JWT |",
        "| 把 vnode 环再推导一遍 | **禁止。** 只对照查表 vs 环 |",
        "| Maglev 填表作业 / 内核旁路 pps | 名字 + 表 + 同一张表；数字不背 |",
        "| K8s Service YAML、Cilium eBPF 主叙事 | 心智一句；YAML 不是面试答案 |",
        "| Service Mesh 必须画进本章 | 东西向 **Ch44**；本章南北向 |",
        "| DNS / GSLB / 证书巡礼 | Anycast 或 DNS **点到**；专章不是本章 |",
        "| Nginx 配置当脊柱 | 机制用口播；不贴 upstream 块 |",
        "",
        "正文第一答案用现在这套。折叠只防止你把 SKU 和环的手算搬上白板。",
        "",
        "</details>",
      ].join("\n"),
    },
    {
      id: "sec-traps",
      heading: "追问陷阱",
      secNum: null,
      related: ["ch05", "ch12", "ch17", "ch40"],
      body: [
        "1. **L4 和 L7 一句话？** → L4 按连接，L7 按请求。",
        "2. **为什么 gRPC 不能只靠 L4？** → HTTP/2 多路复用，L4 看见的是一条连接，所有 RPC 进同一后端。",
        "3. **TLS 在哪终止？** → 要看 HTTP 就在 L7 卸；证书必须留在 App 就 L4 过身。",
        "4. **默认 session 方案？** → 无状态 App + Redis（或 JWT）。不是 sticky。",
        "5. **sticky 最大的坑？** → 挂机丢态；源 IP 在 NAT 后挤爆一台。",
        "6. **无状态的代价？** → 多一跳 session store。这是 trade-off。",
        "7. **Maglev 和 Ch05 环差在哪？** → 环给分区、O(log n)；Maglev 给 LB、O(1) 查表。目标：少迁移 vs 线速均分。",
        "8. **为什么多台 Maglev 不用同步连接表？** → 同一后端集合算出同一张表；ECMP 打到谁都选同一 backend。",
        "9. **查找表多大？** → 论文常用素数 **65537**。当教材锚，不编内部配置。",
        "10. **Maglev 完全无状态吗？** → 选后端靠表；保 TCP 靠本机 connection tracking。",
        "11. **健康检查失败了？** → 摘池。下线还要 draining，别杀 in-flight。",
        "12. **Anycast 是什么？** → 同一 VIP 多地宣告，包进近的入口。不要展开 DNS 课。",
        "13. **轮询是不是太弱？** → 同构短请求够用。装 Maglev 却讲不清 5-tuple 是 over-engineering。",
        "14. **网关和 LB？** → LB 是分发；网关是 L7 加认证限流（Ch17）。常是同一层软件。",
        "15. **东西向谁做 LB？** → 点到 sidecar / 客户端；细节 Ch44。",
        "16. **Karger 1997 面试一句？** → Web 缓存热点：集合变，尽量不把对象换机器。",
        "17. **下一步为什么是协议？** → L7 看见的就是 HTTP/gRPC/WS；怎么选在 **Ch40**。",
      ].join("\n"),
    },
    {
      id: "sec-next",
      heading: "下一步",
      secNum: null,
      related: ["ch40"],
      body: [
        "合上页，用 20 秒口播走一遍：L4 连接、L7 请求；TLS 在能看见 HTTP 的地方卸；gRPC 要 L7；session 默认 Redis 不是 sticky；Maglev 是查表选后端，环留给 Ch05；probe 摘病、drain 再下线。能把网关、聊天长连接、KV 分区分别放回 Ch17 / Ch12 / Ch05，这一章就过关。",
        "",
        "下一章 **Ch40 · 协议选型**：REST / gRPC / WebSocket / SSE / QUIC。L7 已经假定你「看得见请求」——下一章决定请求长什么样。SSE 给 LLM 流打地基，深讲仍在 Ch29 / Ch32。Maglev 不要在那边再开一课。",
        "",
        "自测：左列 L4 vs L7 三句，中列 sticky 为什么不是默认，右列 Maglev vs 环那一句。不要把云 SKU 和 vnode 手算默写回去。",
      ].join("\n"),
    },
  ],
  reviewMd: `# Ch39 · 记忆闪卡

| # | 正面 | 背面 |
|---|---|---|
| 1 | 20 秒怎么开口？ | L4 连接 vs L7 请求；TLS 在 L7 卸；gRPC 要 L7。默认无状态 + Redis，不是 sticky。L4 选后端用 Maglev 查表；环是 Ch05 分区。Health + drain。Anycast/DNS 点到。 |
| 2 | 三个 hard part？ | ① L4 vs L7 怎么开口 ② sticky vs 无状态 ③ Maglev vs 一致性哈希 LB（对照 Ch05）。 |
| 3 | L4 看见什么？ | 连接：IP+Port / 5-tuple。不解析 HTTP。整条连接进同一后端。 |
| 4 | L7 看见什么？ | 请求：path、header、cookie、RPC。可终止 TLS。 |
| 5 | 为什么 gRPC 要 L7？ | HTTP/2 一条连接多路 RPC。L4 钉死一台，副本分不到。 |
| 6 | TLS 终止默认在哪？ | 要看 HTTP 就在 L7。过身则证书在 App，LB 变瞎。 |
| 7 | session 默认方案？ | **无状态 App + 外部 store（Redis）**。JWT 是另一变体。 |
| 8 | sticky 为什么不是第一答案？ | 挂机丢会话；扩缩冷机；源 IP + NAT 挤爆一台。 |
| 9 | 源 IP 亲和的 bottleneck？ | 公司出口 / CDN 共用 IP，所有人进同一实例。 |
| 10 | 何时才 sticky / 哈希钉实例？ | 真有内存态：对局、长连接 presence（Ch12）。并承认 failover。 |
| 11 | Maglev vs Ch05 环？ | 环：KV/缓存分区，O(log n)。Maglev：LB 查表 O(1)，优先均分。 |
| 12 | Maglev 表一句？ | 固定素数表（常用 65537）；5-tuple → 下标 → backend。 |
| 13 | 多台 Maglev 为何不用同步连接表？ | 同一后端集合 → 同一张表；ECMP 打到谁都选同一 backend。 |
| 14 | Maglev 论文（面试）？ | Eisenbud et al.，**NSDI 2016**，*Maglev: A Fast and Reliable Software Network Load Balancer*。 |
| 15 | Karger 1997 一句？ | STOC：*Consistent Hashing and Random Trees…* 给 Web 缓存热点；少重映射。环的画法在 Ch05。 |
| 16 | 健康检查 + draining？ | 探测失败摘池。下线先停新连接、等 in-flight，再杀进程。 |
| 17 | Anycast 点到哪句？ | 同一 VIP 多地宣告，包进近的入口。不要开成 DNS 章。 |
| 18 | 轮询够不够？ | 同构短请求够。least-conn 是动态算法。装 Maglev 却讲不清 5-tuple 是 over-engineering。 |
| 19 | 网关 vs LB？ | LB 分发；网关 L7 加料（Ch17）。常同一层。 |
| 20 | 下一步？ | **Ch40 协议选型**。东西向 Mesh → Ch44。 |`,
});
