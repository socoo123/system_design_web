import { writeChapter } from "./write-chapter.mjs";

const d2 = (src) => {
  const body = src.trim();
  const sized = /style\.font-size/.test(body) ? body : `style.font-size: 12\n${body}`;
  return "```d2\n" + sized + "\n```";
};

writeChapter({
  id: "ch38",
  num: "38",
  title: "缓存与 CDN",
  kind: "foundation",
  relatedChapters: ["ch09", "ch11", "ch13", "ch14", "ch16", "ch32"],
  sections: [
    {
      id: "intro",
      heading: "",
      secNum: null,
      related: ["ch37", "ch32"],
      body: [
        "> **预计**：90–120 分钟 ｜ **前置**：Ch37 存储；设计题里的读路径",
        "> **目标**：Cache-Aside / Through / Back；穿透击穿雪崩；CDN。语义缓存点到 Ch32。不去云购物。",
        "",
        "这是 **M6 第三块基础芯片**，不是又一道 4 步设计题。主线里短链 redirect、Feed timeline、搜索前缀、评论计数、视频字节都会点到「热路径别每次打权威」——本章把 **Cache-Aside 默认怎么写、三种失败怎么开口、CDN 在 HTTP 读路径上干什么**讲透。设计题里只引用，不在白板上开缓存课。LLM 网关的 **语义缓存 / embedding cache** 一句回到 **Ch32**，这里不重讲。",
        "",
        "**一句话：** 读多写少的 API 默认 **Cache-Aside**（lazy load）：应用管 miss 回填，**DB 是 source of truth**，写后 invalidation + **TTL** 收口。Write-Through / Write-Back 是 trade-off，不是三种都要实现。CDN 是边缘上的 HTTP 缓存，不是视频转码课。",
        "",
        "三个 hard part（最该挖的那块）：",
        "",
        "1. **Aside vs Through vs Back** —— 谁写、谁为准、挂了会怎样",
        "2. **穿透 / 击穿 / 雪崩怎么开口** —— bloom 或 negative cache；single-flight；TTL jitter；热点 replica",
        "3. **CDN 在读路径上干什么** —— Client → Edge → Origin；**cache key / origin shield / stale-while-revalidate** 点到",
        "",
        "本章**不讲**：云厂商 CloudFront / ElastiCache SKU 目录、Redis vs Memcached 骂战当主文、CDN 产品巡礼、把 Ch32 语义缓存再讲一遍、K8s YAML、七大概念全书、Belady / FIFO / MRU 淘汰百科、延迟双删当银弹。视频 / blob 回 **Ch14 / Ch22**。",
      ].join("\n"),
    },
    {
      id: "sec-pitch",
      heading: "一句话定义 · 面试 20 秒开口",
      secNum: "38.1",
      related: ["ch37", "ch32"],
      body: [
        "先把评分信号打出来：你有默认策略，知道三种失败各说哪一句，知道 CDN 是 HTTP 边缘而不是再买一家云。",
        "",
        "> 「读多写少默认 **Cache-Aside**：应用查缓存，miss 打 DB 再回填；**DB 是 source of truth**，写库之后 **invalidation**（删 key），**TTL** 兜底 stale。Write-Through 同步双写、换写延迟买热缓存；Write-Back 先写缓存再异步刷库，吞吐高但可能丢数——按一致性选，不要三种都画上。穿透：不存在的 key 用 bloom 或 negative cache；击穿 / **stampede**：single-flight；雪崩：TTL jitter；特别热的 key 再 replica。CDN 是 Client → Edge → Origin 的 HTTP 缓存，点 **cache key、origin shield、stale-while-revalidate**。语义缓存回 Ch32。」",
        "",
        "整章按这一条链走。上场 20 秒念完就停，让面试官决定要挖策略、三击还是 CDN。",
        "",
        d2(`
direction: right
st.class: go
st: "策略"
th.class: warn
th: "三击"
cdn.class: ok
cdn: "CDN"
st -> th -> cdn
`),
        "",
        "本图引用：Ch37 存储（DB 是权威）· 语义缓存 Ch32（一句，不展开）",
        "",
        "| 面试官问法 | 你落在哪一截 |",
        "|---|---|",
        "| 「系统里怎么用缓存？」 | 先 Cache-Aside + TTL + 写后删；再说要不要 Through / Back |",
        "| 「缓存挂了 / 热点过期怎么办？」 | 穿透 / 击穿 / 雪崩三句，不要混成一个词 |",
        "| 「要不要上 CDN？」 | 静态和可缓存 HTTP 走边缘；个性化 JSON 仍是应用缓存 |",
        "",
        "**red flag：** 一上来报云产品名；把三种写入策略都「实现一遍」当加分；把穿透、击穿、雪崩背成同一句「加锁」；把 CDN 画成视频转码或边缘函数展销会；把 Ch32 embedding cache 在这里重讲。",
      ].join("\n"),
    },
    {
      id: "sec-aside",
      heading: "机制 · Cache-Aside / Through / Back",
      secNum: "38.2",
      related: ["ch37", "ch09"],
      body: [
        "第一个 hard part。**2026 面试里，会背六种策略不如会选默认。** 读多写少的 API，开口就是 **Cache-Aside**（也叫 lazy load / lookaside）。Write-Through、Write-Back 是你主动讲的 trade-off，不是清单作业。",
        "",
        d2(`
grid-columns: 3
aside: {
  label: "Cache-Aside"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "lazy load"
  b.class: ok
  b: "DB 为准"
}
through: {
  label: "Write-Through"
  class: group
  grid-columns: 2
  c.class: step
  c: "同步双写"
  d.class: step
  d: "写更慢"
}
back: {
  label: "Write-Back"
  class: groupBad
  grid-columns: 2
  e.class: warn
  e: "先写缓存"
  f.class: bad
  f: "可能丢数"
}
`),
        "",
        "| | **Cache-Aside** | **Write-Through** | **Write-Back** |",
        "|---|---|---|---|",
        "| 读 | 应用查缓存；miss 自己打 DB 再 SET | 读缓存（写路径已预热） | 读缓存 |",
        "| 写 | **写 DB**，再 **DEL** 缓存 | 缓存与 DB **同步**都写完才返回 | **只先写缓存**，异步刷 DB |",
        "| 权威 | **DB 是 source of truth** | 双写成功才算写完 | 短窗口里缓存是权威，危险 |",
        "| 缓存挂了 | 变慢，读仍正确 | 要定义双写失败怎么回滚 | **未刷盘的写可能丢** |",
        "| 何时开口 | **读多写少默认** | 写完立刻要读到新值，可接受写延迟 | 计数 / 指标，可丢几秒 |",
        "",
        "**为什么默认 Aside：** 缓存是加速器，不是第二个账本。挂了可以穿透到 DB——这是 graceful degradation，不是单点正确性。只缓存真正被请求过的 key，冷数据不占内存。写路径 **删而不是改**：并发下「读旧 → 写新 → 慢请求把旧值 SET 回去」更常见；删了让下一拍 miss 回填。不一致窗口用 **TTL** 封顶。",
        "",
        "Read-Through 和 Aside 差在**谁去填**：缓存库自己回源 vs 应用自己打 DB。面试仍说 Aside——大多数 Redis / Memcached 用法就是应用管。Write-Around（写绕过缓存）只点一句：写一次几乎不读的数据别污染热集。Refresh-ahead / 预热不是第三种写入策略，是冷启动手段。",
        "",
        "读 miss 链路就三条叶子。命中时停在 Cache，不要把 DB 画成每次必经。",
        "",
        d2(`
direction: right
app.class: go
app: "App"
cache.class: store
cache: "Cache"
db.class: store
db: "DB"
app -> cache -> db
`),
        "",
        "本图引用：Ch37 存储选型（DB 是权威；缓存不是又一种数据库）",
        "",
        "miss 时序（参与者就是 App / Cache / DB）。写路径口播：`UPDATE` DB → `DEL` key；不要在这张图上再叠一条 Through。",
        "",
        d2(`
shape: sequence_diagram
app: "App"
cache: "Cache"
db: "DB"
app -> cache: "GET key"
cache -> app: "miss"
app -> db: "SELECT"
db -> app: "row"
app -> cache: "SET + TTL"
`),
        "",
        "一致性怎么开口（Aside）：",
        "",
        "> 「DB 是 source of truth。缓存允许 stale。写成功后删 key；TTL 防止漏删把脏数据留太久。我不保证线性一致，Feed / 短链这够用。钱和库存的权威不放缓存里当账本。」",
        "",
        "**Through 的 trade-off：** 写延迟变成「缓存 + DB」两跳；读后立即新。缓存会被写但永不读的 key 污染。双写仍可能一半成功——不要吹成分布式事务。",
        "",
        "**Back 的 trade-off：** 写吞吐和合并更新（同一个计数刷一次 DB）很香。面试官问丢数：你要自己说出口——进程挂、节点没持久化，未 flush 的写就没了。账本、订单、余额 **red flag**。可接受的例子：播放次数、点赞粗计数、监控指标。",
        "",
        "面试怎么说：",
        "",
        "> 「这题读多写少，我用 Cache-Aside + TTL + 写后 invalidation。需要写完立刻读到新、且写 QPS 不高，再考虑 Through。Back 只给可丢的计数。三种不是满分套餐。」",
        "",
        "**over-engineering：** 白板上同时画 Aside、Through、Back、CDC、延迟双删、本地 + Redis + CDN 五层，却讲不清 DB 是不是权威。",
      ].join("\n"),
    },
    {
      id: "sec-stampede",
      heading: "机制 · 穿透 / 击穿 / 雪崩",
      secNum: "38.3",
      related: ["ch09", "ch11"],
      body: [
        "第二个 hard part。国内大厂几乎固定三连问。**先把三个词拆开**，再各给一句默认方案。英文里 stampede / thundering herd 多对应**击穿**（热点 key 一过期，并发一起回源）。",
        "",
        d2(`
grid-columns: 2
prob: {
  label: "三种打法"
  class: groupBad
  grid-columns: 3
  a.class: bad
  a: "穿透"
  b.class: bad
  b: "击穿"
  c.class: bad
  c: "雪崩"
}
fix: {
  label: "默认开口"
  class: groupOk
  grid-columns: 3
  d.class: ok
  d: "Bloom / 空值"
  e.class: ok
  e: "single-flight"
  f.class: ok
  f: "TTL jitter"
}
`),
        "",
        "| | **穿透** | **击穿**（stampede） | **雪崩** |",
        "|---|---|---|---|",
        "| 发生什么 | 查**根本不存在**的 key，缓存和 DB 都没有 | **一个热点** key 过期，并发一起 miss | **一批** key 同时过期，或缓存集群宕掉 |",
        "| bottleneck | DB 被无效查询打满 | 单 key 回源打满 DB | 回源面积从 1 变成 N，或缓存层消失 |",
        "| 面试默认 | **negative cache**（空值短 TTL）或 **bloom** | **single-flight** / 锁，只让一个回源 | **TTL jitter**（基础 TTL + 随机） |",
        "| 加一句 | bloom 说不在就一定不在；假阳性才回源 | 特别热再 **hotspot replica** | 集群宕机要限流 / 降级，不只改 TTL |",
        "",
        "**穿透：** 恶意随机 id、已删资源、拼错的短码——缓存永远 miss，每次都打 DB。空值也要缓存，TTL 比正常短（例如几十秒），避免「不存在」永久占着。bloom：说没有就拦截；说可能有才查库。bloom 要随写入更新，否则刚插入的合法 key 会被误杀——这是你要主动讲的 trade-off，不是把 bloom 当魔法。",
        "",
        "**击穿 / stampede：** 和穿透相反——key **存在且极热**，TTL 一到，N 个请求同时打 DB 再同时 SET。默认 **single-flight**：同一进程合并，跨进程用短锁（SET NX + 过期，别拆成 SETNX 再 EXPIRE）。没抢到锁的人等几十毫秒再 GET，或业务允许就读旧值。逻辑过期（key 本身不 TTL，value 里带 expireAt，一个线程异步刷新）是「可 stale」时的升级版，和 Facebook 论文里 serve stale 一个意思。热点再 **replica**：把同一个 key 复制到多个缓存节点，打散单分片 CPU——短链爆款、Feed 大 V outbox 都是这个形状（Ch09 / Ch11 点过，这里不把题重做一遍）。",
        "",
        "**雪崩：** 批量预热时写了同一个 TTL，整点一起死；或 Redis 集群 failover 期间所有读穿透。jitter：`TTL = base + random(0, 0.1×base)` 一类即可，不要背具体函数。缓存层本身要有副本 / failover；再往下是限流和降级（Ch04 / Ch42），本章点到：TTL 解决「同时过期」，解决不了「集群没了」。",
        "",
        "面试怎么说：",
        "",
        "> 「穿透是不存在的 key，我用空值短 TTL，流量大再加 bloom。击穿是热点过期，single-flight 只让一个回源，特别热再 replica。雪崩是同时过期或缓存挂了，TTL jitter 打散过期；挂了要限流，不能只靠改 TTL。」",
        "",
        "**red flag：** 三个词共用一句「加分布式锁」；穿透用永不过期；雪崩只说「Redis 高可用」却解释不了同时过期；为了防击穿把所有 key 永不过期当唯一答案（那是热点特例，不是全局策略）。",
      ].join("\n"),
    },
    {
      id: "sec-cdn",
      heading: "机制 · CDN 在读路径上干什么",
      secNum: "38.4",
      related: ["ch14", "ch22", "ch09"],
      body: [
        "第三个 hard part。CDN 是把 **可缓存的 HTTP 响应**放到离用户近的 **edge**，降低 RTT、挡住源站。本章讲的是 **HTTP 边缘缓存**，不是转码、切片、对象存储内部。视频字节、大 blob 的存储与播放协议在 **Ch14 / Ch22**——这里只说：浏览器 / App 拿到的 URL 往往先打到 edge。",
        "",
        d2(`
direction: right
cli.class: go
cli: "Client"
edge.class: step
edge: "Edge"
shield.class: warn
shield: "Shield"
orig.class: store
orig: "Origin"
cli -> edge -> shield -> orig
`),
        "",
        "本图引用：Ch14 视频 · Ch22 对象存储（blob 不在本章设计）",
        "",
        "读路径口播：Client 问最近的 Edge；**hit** 直接返回。**miss** 不要每个 PoP 都打 Origin——中间加一层 **origin shield**（区域汇聚缓存），把全球 miss **折叠**成少数次回源。这和击穿的 single-flight 是同一件事，只是发生在 HTTP 边缘。",
        "",
        "面试要能点的三句话（点到为止，不要开产品课）：",
        "",
        "| 点 | 干什么 | 讲错会长什么样 |",
        "|---|---|---|",
        "| **cache key** | 决定「什么算同一份对象」：路径、选定 query、选定 header（`Vary`） | 登录页用共享 key → 串用户；`utm_*` 全进 key → 命中率归零 |",
        "| **origin shield** | edge miss 先打中心缓存，再打源 | 每个边缘节点各自回源，源站被 stampede |",
        "| **stale-while-revalidate** | 过期后先吐旧的，后台再验证（**RFC 5861**） | 当成「可以永远脏」；或不配 **stale-if-error** 就声称源挂了也没事 |",
        "",
        "**cache key** 是正确性开关：该进 key 的（语言、编码、登录态）漏了会串数据；不该进的（广告 click id）塞进去会把缓存打成雪花。个性化 API 默认 **private / 不共享缓存**；短链 **302** 不要在 CDN 里长期缓存——效果约等于 Ch09 的 301，Analytics 没了。",
        "",
        "**stale-while-revalidate：** `Cache-Control` 里 `max-age` 管新鲜，过期后一段窗口仍可先返回旧响应、同时回源更新。兄弟指令 **stale-if-error**：源 5xx 或超时，继续用旧的换可用。两者都是「故意的 stale」，要和业务一致窗口对齐，不是免费的 CAP 魔法。",
        "",
        "Pull vs Push 一句：面试默认 **pull**（第一次 miss 回源再填边缘）。预推（push）是片源进边缘的视频题，留给 Ch14，不要在这里画全球预热拓扑。",
        "",
        "和应用缓存怎么拆：",
        "",
        "| | **应用缓存**（进程 / Redis） | **CDN edge** |",
        "|---|---|---|",
        "| 缓存什么 | 对象、计数、渲染过的 JSON | HTTP 响应、静态字节、可公开的 API |",
        "| 谁失效 | 应用 `DEL` / TTL | TTL、purge、改 cache key 版本 |",
        "| 个性化 | per-user key 可以 | 共享 edge **不要**缓存带 cookie 的私人页 |",
        "",
        "面试怎么说：",
        "",
        "> 「CDN 挡的是 HTTP 读路径：Client → Edge，miss 经 shield 折叠后再打 Origin。正确性看 cache key；源要活看 shield 和 SWR。JSON 业务数据仍用 Cache-Aside；图床 / JS / 可公开的 GET 才上边缘。视频怎么切片是 Ch14。」",
        "",
        "**red flag：** 把 CDN 答成某云 SKU 对比；在 Feed / 短链白板上设计全球 PoP 和证书；把边缘计算 Workers 当本章主线；声称「有 CDN 就不需要 Redis」。",
      ].join("\n"),
    },
    {
      id: "sec-choose",
      heading: "选型表",
      secNum: "38.5",
      related: ["ch02", "ch09"],
      body: [
        "白板先填这一张，再决定画几层。层数不是分数。",
        "",
        d2(`
grid-columns: 2
local: {
  label: "进程内"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "微秒"
  b.class: warn
  b: "不共享"
}
remote: {
  label: "远程 Redis"
  class: group
  grid-columns: 2
  c.class: step
  c: "跨实例"
  d.class: step
  d: "网络 RTT"
}
`),
        "",
        "| | **进程内**（Caffeine / 本地 LRU） | **远程**（Redis / Memcached） |",
        "|---|---|---|",
        "| 延迟 | 微秒，无网络 | 同城毫秒 RTT |",
        "| 共享 | 只服务本进程；发布瞬间每台都是冷的 | 所有副本共享一份热集 |",
        "| 失效 | 难：每台都要删或等 TTL | 一处 `DEL`，大家 miss |",
        "| 容量 | 受单机堆限制 | 可分片 |",
        "| 面试怎么用 | 挡 **hotspot** 的第一拳（Ch09 爆款码） | 默认的跨实例缓存 |",
        "",
        "常见组合是 **L1 本地 + L2 Redis**，不是五层俄罗斯套娃。本地只放极热、可 stale 的只读；写路径仍以 Redis / DB 的 invalidation 为准——本地必须短 TTL，否则每台各执一份旧值。这是 trade-off：少一次 RTT，换失效变难。",
        "",
        "| 场景 | 默认 | 不要 |",
        "|---|---|---|",
        "| 读多写少 API、对象缓存 | Cache-Aside + TTL + 写后 DEL | 三种策略叠满 |",
        "| 写完立刻读新、写 QPS 低 | 考虑 Through | 用 Back 假装强一致 |",
        "| 粗计数、可丢 | Back 或异步队列 | 把余额做成 Back |",
        "| 不存在的 id 被扫 | 空值 / bloom | 只加锁 |",
        "| 热点 key | single-flight + 本地 L1 + replica | 无限 TTL 当全局策略 |",
        "| JS / 图 / 公开 GET | CDN + 正确 cache key | 把登录 JSON 放共享 edge |",
        "| LLM 相近问句 | **Ch32** exact 默认，语义可选 | 在本章展开 embedding |",
        "",
        "Redis vs Memcached：**不要骂战。** 面试要数据结构、TTL、持久化、集群就 Redis（或协议兼容的 fork）；只要纯 KV、多线程内存、lookaside，Memcached 仍是 Facebook 论文里的那块砖。选型一句就够，不要开许可证课。",
        "",
        "淘汰：远程缓存 LRU / 近似 LRU 够开口；进程内 Java 常见 **W-TinyLFU**（Caffeine）抗扫描污染，选读论文一句话，不要把 Belady 最优当实现。",
      ].join("\n"),
    },
    {
      id: "sec-papers",
      heading: "论文与经典系统",
      secNum: "38.6",
      related: ["ch09", "ch32"],
      body: [
        "M6 要能点名。下面 2 篇必读、2 篇选读。**面试用哪一句**写在表里；不背页码，不编造内部数字。",
        "",
        d2(`
direction: right
web.class: go
web: "Web"
mc.class: store
mc: "Memcache"
db.class: store
db: "MySQL"
web -> mc -> db
`),
        "",
        "Facebook 的图和 Cache-Aside 读 miss 是同一条链：memcache **不知道** DB 的存在，应用 miss 后自己填——论文称为 **demand-filled lookaside**。",
        "",
        "| | 文献 | 必读 / 选读 | 面试用哪一句 |",
        "|---|---|---|---|",
        "| 1 | **Nishtala et al.**，NSDI 2013，*Scaling Memcache at Facebook* | 必读 | memcache 是 **demand-filled lookaside**（就是 Cache-Aside）；写库后 **delete**。**leased get**：miss 时发 lease，防 **stale set** 和 **thundering herd**；允许短暂 **stale**。白板说 single-flight 时可以点这句 |",
        "| 2 | **Nottingham**，RFC 5861（2010），*HTTP Cache-Control Extensions for Stale Content* | 必读 | **stale-while-revalidate**：先吐旧的再后台验证。**stale-if-error**：源出错仍可用旧响应。CDN 那一截用这个，不要报产品名 |",
        "| 3 | **Einziger, Friedman, Manes**，ACM TOS 2017，*TinyLFU: A Highly Efficient Cache Admission Policy*（W-TinyLFU） | 选读 | 进程内缓存：**准入**看频率，不是只会 LRU。Caffeine 走这条。抗扫描污染。不是 Redis 必答题 |",
        "| 4 | **Nygren, Sitaraman, Sun**，ACM SIGOPS OSR 2010，*The Akamai Network: A Platform for High-Performance Internet Applications* | 选读 | CDN 是把对象放到离用户近的边缘、用 DNS 映射选点。用来证明「edge HTTP cache」是正经系统，不是购物车。不要背服务器台数 |",
        "",
        "**Memcache 论文再收一口（面试就这三拳）：**",
        "",
        "1. **Lookaside：** 应用 `get` → miss 则读 MySQL → `set`；更新则 SQL 然后 `delete`。缓存不是 source of truth。",
        "2. **Lease：** miss 带 64-bit token，`set` 要带上；中途若已 `delete`，token 作废，挡住慢请求把旧行写回（stale set）。同一 key 的 token 限速发放，其余客户端被告知稍后重试——这就是 stampede 控制。论文还写：删了之后可以把旧值留在一边当 **stale**，等租约持有者填新。",
        "3. **不要展开：** UDP get、region pool、mcrouter 拓扑——点名「他们还按工作负载分 pool、热 key 复制」即可，留给深挖。",
        "",
        "语义缓存、GPTCache、embedding 近邻 **不是这篇论文，也不是本章**——一句：**Ch32**。",
      ].join("\n"),
    },
    {
      id: "sec-used",
      heading: "哪些设计题会用到",
      secNum: "38.7",
      related: ["ch02", "ch09", "ch11", "ch13", "ch14", "ch16", "ch32"],
      body: [
        "主线先做题，卡壳再跳进本章。回链不是把 M6 读完再开写。短链、Feed 的业务 hard part 已经在各 case 里，这里只回收 **缓存 / CDN 那一句**。",
        "",
        "| 章 | 会用到哪一句 |",
        "|---|---|",
        "| **Ch02** 扩展 | 读路径先缓存再 CDN；不要第一步画全球边缘 |",
        "| **Ch09** 短链 | 读多写少 → Aside；热点码 L1+L2；**302 不要长期放 CDN**；stampede 合并回源 |",
        "| **Ch11** Feed | timeline / hydrate 是应用缓存；媒体 URL 走 CDN，不在这题设计 PoP；大 V 是 hot key |",
        "| **Ch13** 搜索 | 自动补全、热 query 可缓存；倒排本身不是 Redis 能替代的权威 |",
        "| **Ch14** 视频 | **HTTP 边缘 + 切片**在那章；本章只提供 shield / cache key / SWR 词汇 |",
        "| **Ch16** 评论 | 计数、热帖楼层 Aside；删帖要 invalidation，不要只靠长 TTL |",
        "| **Ch22** 对象 | blob 在对象存储；CDN 缓存的是 GET 字节，不是再做一套存储 |",
        "| **Ch32** LLM 网关 | **exact cache** 默认；语义缓存正确性 vs 命中率在那章，这里不重讲 |",
        "",
        "聊天、通知、订单：会话和未读数可以缓存；**余额、库存扣减的权威**仍在 DB / 账本（Ch18 / Ch24）。按数据拆，不要全站一个 Redis 当数据库。",
      ].join("\n"),
    },
    {
      id: "sec-2026",
      heading: "2026 vs 笔记 / 原书",
      secNum: null,
      related: [],
      body: [
        "<details>",
        "<summary>原书 / 笔记当时怎么讲 · 六种策略全书和云购物进这里</summary>",
        "",
        "笔记对应 AWS 书缓存章：淘汰策略长表、六种读写策略、进程内/间/远程、Push/Pull CDN、Memcached vs Redis 对照，再补穿透击穿雪崩、Valkey、边缘 Workers、语义缓存、延迟双删。**那不是本章正文。** 2026 上场只带 Aside 默认、三击三句、CDN 三个点。",
        "",
        "| 原书 / 笔记 | 现在怎么答 |",
        "|---|---|",
        "| 六种策略当目录（aside / through / around / back / read-through / refresh-ahead） | **默认 Cache-Aside**；Through / Back 当 trade-off；其余点一句 |",
        "| 穿透击穿雪崩原书没有、笔记当 2026 补丁 | **国内面试固定三连**，正文必须会开口 |",
        "| Memcached vs Redis 长表 + 许可证 / Valkey 主叙事 | 一句选型；**禁止骂战**；lookaside 经典仍是 Memcache 论文 |",
        "| CloudFront / ElastiCache / 某家 Workers 目录 | **HTTP edge + 远程 KV** 当机制；不当购物清单 |",
        "| CDN 只讲静态，或把边缘计算当主线 | 本章是 **edge HTTP cache**；Workers 不是 hard part |",
        "| 语义缓存 / GPTCache / embedding 命中 | **一句 Ch32** |",
        "| 延迟双删 / CAN / CDC 当唯一正确答案 | Aside = 写库 **DEL** + TTL；lease / single-flight 防 stale set 与 stampede |",
        "| Belady / FIFO / MRU / ARC 全书 | LRU 够开口；进程内 W-TinyLFU 选读 |",
        "| 「2026 必须选 Valkey」 | 协议兼容的远程缓存即可；不要把许可证当系统设计答案 |",
        "",
        "正文第一答案用现在这套。折叠只防止你把策略百科和云目录搬上白板。",
        "",
        "</details>",
      ].join("\n"),
    },
    {
      id: "sec-traps",
      heading: "追问陷阱",
      secNum: null,
      related: ["ch09", "ch14", "ch32", "ch39"],
      body: [
        "1. **默认用哪种策略？** → Cache-Aside。不是三种都做。",
        "2. **Aside 写完为什么删缓存而不是更新？** → 避免慢读把旧值 SET 回去。下一拍 miss 回填。TTL 封顶漏删。",
        "3. **DB 和缓存谁说了算？** → Aside 下 **DB 是 source of truth**。",
        "4. **Through 和 Aside 差别？** → Through 写路径同步双写、读更常命中；写更慢，仍不是分布式事务。",
        "5. **Back 丢数怎么办？** → 先承认会丢。可丢才用。要持久就别 Back，或接受 RPO。",
        "6. **穿透 vs 击穿？** → 穿透：key 从不存在。击穿：热点存在但过期，stampede 回源。",
        "7. **雪崩只改 TTL 够吗？** → jitter 管同时过期。集群宕机还要限流 / 降级 / 多副本。",
        "8. **为什么要 TTL jitter？** → 同一批 key 同一过期 → 同时 miss。加随机打散。",
        "9. **single-flight 和分布式锁？** → 先进程内合并；跨进程短锁。锁不是穿透的答案。",
        "10. **热点为什么 replica？** → 单分片 CPU / 网卡是 bottleneck。复制热 key，打散读。",
        "11. **CDN 和 Redis 谁替代谁？** → 不替代。边缘是 HTTP；Redis 是应用对象。",
        "12. **cache key 错了会怎样？** → 串用户，或命中率碎成粉末。`utm_` 不要进 key；私人响应不要共享。",
        "13. **origin shield 干什么？** → 把多 edge 的 miss 折叠成少次回源，防源站 stampede。",
        "14. **stale-while-revalidate 哪篇？** → RFC 5861。先旧后刷新。源挂了靠 stale-if-error。",
        "15. **短链 302 能放 CDN 吗？** → 不要长期缓存，否则变相 301，Ch09 Analytics 没了。",
        "16. **Facebook Memcache 面试一句？** → demand-filled lookaside；leased get 防 herd 和 stale set。",
        "17. **语义缓存呢？** → **Ch32**。本章不讲 embedding cache。",
        "18. **下一步为什么是负载均衡？** → 缓存解决读热路径；无状态 + LB 解决水平扩（**Ch39**）。",
      ].join("\n"),
    },
    {
      id: "sec-next",
      heading: "下一步",
      secNum: null,
      related: ["ch39"],
      body: [
        "合上页，用 20 秒口播走一遍：Aside 默认、DB 为准、TTL + 写后删；穿透空值/bloom、击穿 single-flight、雪崩 jitter；CDN 是 Client → Edge → Origin，点 cache key / shield / SWR。能把短链 302、Feed 媒体、LLM 缓存分别放回 Ch09 / Ch11 / Ch32，这一章就过关。",
        "",
        "下一章 **Ch39 · 负载均衡与无状态**：L4 / L7、会话、Maglev vs 一致性哈希 LB。缓存让单机读得快；无状态让你可以加机器。两边一起才是 Ch02 那条扩展链上的「web 可水平扩」。Maglev 论文在那边，这里不要提前开。",
        "",
        "自测：左列三句 hard part，中列 Aside 读 miss 时序，右列三击各一句默认。不要把云 SKU 和六种策略默写回去。",
      ].join("\n"),
    },
  ],
  reviewMd: `# Ch38 · 记忆闪卡

| # | 正面 | 背面 |
|---|---|---|
| 1 | 20 秒怎么开口？ | 读多写少默认 Cache-Aside；DB 为准；写后 DEL + TTL。Through/Back 是 trade-off。穿透空值/bloom；击穿 single-flight；雪崩 TTL jitter。CDN：cache key / shield / SWR。语义缓存 Ch32。 |
| 2 | 三个 hard part？ | ① Aside vs Through vs Back ② 穿透/击穿/雪崩怎么开口 ③ CDN 在 HTTP 读路径上干什么。 |
| 3 | 为什么默认 Cache-Aside？ | 应用管 miss；只缓存被请求的 key；缓存挂了仍正确（变慢）。lookaside = lazy load。 |
| 4 | Aside 下谁是 source of truth？ | **DB**。缓存允许 stale。TTL + 写时 invalidation。 |
| 5 | 写完为什么删而不是更新缓存？ | 慢请求可能把旧值 SET 回去。删了下一拍回填。 |
| 6 | Write-Through 一句？ | 同步写缓存和 DB。读新、写慢；双写失败仍要处理。 |
| 7 | Write-Back 一句？ | 先写缓存再异步刷库。吞吐高，**可能丢数**。只给可丢的计数。 |
| 8 | 穿透 vs 击穿 vs 雪崩？ | 不存在的 key；**一个**热点过期（stampede）；**一批**同时过期或缓存挂了。 |
| 9 | 穿透默认方案？ | negative cache（空值短 TTL）或 bloom。bloom 无假阴性「不在」。 |
| 10 | 击穿默认方案？ | single-flight / 短锁只让一个回源；可 stale 则逻辑过期。热点 **replica**。 |
| 11 | 雪崩默认方案？ | TTL jitter。集群宕机还要限流/降级，不只改 TTL。 |
| 12 | 进程内 vs Redis？ | 本地微秒、不共享、失效难。远程跨实例、有 RTT。L1 只挡极热。 |
| 13 | CDN 读路径怎么画？ | Client → Edge →（Shield）→ Origin。hit 停在边缘。 |
| 14 | cache key 错了？ | 漏 Vary/登录态会串用户；utm 进 key 会打碎片。私人响应不要共享。 |
| 15 | origin shield？ | 折叠各 edge 的 miss，保护源站，类似 stampede 控制。 |
| 16 | stale-while-revalidate？ | RFC 5861：过期先吐旧、后台再验证。stale-if-error 管源出错。 |
| 17 | 短链 302 和 CDN？ | 不要长期缓存 302（Ch09），否则变相 301，Analytics 丢失。 |
| 18 | Memcache NSDI 2013 一句？ | demand-filled lookaside；leased get 防 stale set 和 thundering herd；可 serve stale。 |
| 19 | 语义缓存在哪讲？ | **Ch32**。本章不讲 embedding cache。 |
| 20 | 视频 / blob 呢？ | 存储与播放 **Ch14 / Ch22**。本章只提供 HTTP 边缘词汇。 |`,
});
