import { writeChapter } from "./write-chapter.mjs";

const d2 = (src) => {
  const body = src.trim();
  const sized = /style\.font-size/.test(body) ? body : `style.font-size: 12\n${body}`;
  return "```d2\n" + sized + "\n```";
};

writeChapter({
  id: "ch06",
  num: "06",
  title: "键值存储",
  kind: "brick",
  relatedChapters: ["ch36", "ch37", "ch41"],
  sections: [
    {
      id: "intro",
      heading: "",
      secNum: null,
      related: [],
      body: [
        "> **预计**：50–60 分钟 ｜ **前置**：Ch05 环；CAP 机制 Ch36",
        "> **目标**：Dynamo 风格 AP + quorum；冲突默认 **LWW**；写路径 LSM。向量时钟只进折叠。",
        "",
        "键值存储是 M2 第三块砖：Ch05 只回答「key 去哪台」；本章在分区之上加复制、quorum、冲突和节点内存储，拼出一道 **Dynamo / Cassandra 风格的面试 KV**。面试官要的不是 Dynamo 论文全家桶，而是三条能手算的话：**为什么这题默认 AP；N/W/R 怎么配、W+R>N 为什么能读到新值；冲突生产用 LWW，写路径用 LSM。**",
        "",
        "hard part（最该挖的那块）就是这三句。CAP / PACELC 机制进 **Ch36**；B+Tree vs LSM、何时不该用 KV 进 **Ch37**；复制拓扑、failover、反熵进 **Ch41**。Gossip、hinted handoff、Merkle 点到即可，不要和 quorum / LWW / LSM 并列成四根柱子。",
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
        "> 「我按 Dynamo / Cassandra 风格的 AP KV 讲。value 小、要高可用、一致性可调。分区用一致性哈希（上一题的环），每 key 放 N=3 副本。一致性用 quorum：默认 N=3、W=2、R=2，W+R>N 则读写集合必有交集。冲突生产默认 Last-Write-Wins，按时间戳或版本号。节点里写路径是 LSM：WAL → memtable → SSTable。CAP 细节在一致性那章；引擎对比在存储选型。Redis Cluster 是另一条产品：hash slot + 每 slot 一个 primary，偏 CP 的分片，不是这张白板。」",
        "",
        "说完按这条链走，别一上来默写 Gossip + hinted handoff + Merkle + 因果关系图。",
        "",
        d2(`
direction: right
s1.class: go
s1: "CAP 选 AP"
s2.class: step
s2: "分区+副本"
s3.class: step
s3: "quorum"
s4.class: ok
s4: "LSM 写路径"
s1 -> s2 -> s3 -> s4
`),
        "",
        "| 时间盒 | 你在做什么 |",
        "|---|---|",
        "| 3–5 min | 澄清：AP 还是 CP；value 大小；单 DC；读:写 |",
        "| 2 min | 粗估：key 量、裸容量 × N、写 QPS 带复制 |",
        "| 8–12 min | 高层：Client → Coordinator → N 副本；环点到 Ch05 |",
        "| 10–15 min | deep dive：quorum 手算、LWW、LSM 写/读 |",
        "| 2–3 min | wrap-up：热点 key、时钟偏斜、写放大；故障修复丢给 Ch41 |",
        "",
        "**red flag：** 把论文四件套平均画满白板；冲突第一答案不是 LWW；一上来画 20 节点环；把 Redis Cluster 或 Spanner 当成这题的默认实现。",
      ].join("\n"),
    },
    {
      id: "sec-clarify",
      heading: "澄清问题清单",
      secNum: "6.1",
      related: ["ch36"],
      body: [
        "没问清 CAP 和 value 形态，后面的 quorum 和 LSM 都是空的。问 5–7 个就停，其余写假设。机制定义丢给 **Ch36**，本章只定「这道 KV 站哪一侧」。",
        "",
        "| 你问 | 为什么问 | 写到白板上的默认假设 |",
        "|---|---|---|",
        "| 要高可用还是强一致？账户余额吗？ | AP 才走 Dynamo 风格；钱和配置是 CP | 「社交 / 会话 / 购物车 → AP」 |",
        "| value 多大？会不会是 blob？ | <10KB 才是 KV；大对象走对象存储 | 「value 约 1KB，上限 10KB」 |",
        "| 单 DC 还是多 DC？ | 多 DC 的 quorum 延迟和 LOCAL 策略不同 | 「先单 DC；跨城点到 Ch41」 |",
        "| 读:写大概多少？ | 写多才默认 LSM；读极多要提读放大 | 「写多或混合；教学 5:1 读」 |",
        "| 允许读到旧值吗？可调吗？ | 决定 W/R；W+R≤N 就是 eventual | 「可调；默认 W=2 R=2 N=3」 |",
        "| 有没有超级热 key？TTL？ | 环和 quorum 都不解单 key 打满 | 「均匀；热点要拆 key」 |",
        "",
        "面试官说「你来假设」时写上去：",
        "",
        "> 「假设：分布式 KV，get/put，value 小。要在分区时继续服务，选 AP。N=3，默认 quorum W=2 R=2。冲突 LWW。节点内 LSM。不是 Redis Cluster，也不是 Spanner。」",
        "",
        "对方一说「这是配置中心 / 账户余额 / 跨洲强一致」，改口 **CP**（etcd / TiKV / Spanner 一类），**立刻停**——那是 Ch36 + Ch41，不要把本章改写成共识课。",
      ].join("\n"),
    },
    {
      id: "sec-estimate",
      heading: "粗估：容量与复制放大",
      secNum: "6.2",
      related: ["ch37", "ch41"],
      body: [
        "这章的 back-of-envelope 要证明两件事：**裸数据 × N 才是落盘下限**；以及 **LSM 还有空间放大，口算再乘一截**。公式在 Ch03；数字是教学用，不是某厂容量规划。",
        "",
        "教学假设：k = **1 亿** key，平均 value **1KB**，元数据忽略；读:写 = **5:1**；峰值写 **1 万 QPS**、读 **5 万**；副本 **N=3**。",
        "",
        "| 项 | 口算 | 面试怎么用 |",
        "|---|---|---|",
        "| 裸容量 | 1e8 × 1KB = **100GB** | 先报这个，再乘副本 |",
        "| 复制后 | ×3 ≈ **300GB** | 漏乘 N 是 red flag |",
        "| LSM 空间放大 | 教学再 ×2 ≈ **600GB** 量级 | compaction 前多版本；不是精确系数 |",
        "| 写进集群 | 1 万 × 1KB ≈ **10MB/s** | 再 ×N 才是副本间复制量 |",
        "| 复制带宽 | ×3 ≈ **30MB/s** | 同城可吃；跨洲要另说 |",
        "",
        "读流量 5 万 × 1KB ≈ 50MB/s 出站，通常不是第一 bottleneck；第一是 **单 key 热点** 和 **quorum 的尾延迟**（等最慢的那次 ACK）。",
        "",
        "**面试怎么说：**",
        "",
        "> 「一亿条、1KB，裸 100GB；三副本 300GB；LSM 我再按大约两倍空间放大口算到 600GB 量级。写一万 QPS 复制后约 30MB/s。数字为了证明要乘 N，不是报价单。」",
        "",
        "机器台数不要从 600GB 反推成「所以要 20 台 NVMe」——那是 over-engineering。说「先按容量和写 QPS 估分片数，环在 Ch05」就够。",
      ].join("\n"),
    },
    {
      id: "sec-arch",
      heading: "高层：Coordinator + N 副本",
      secNum: "6.3",
      related: ["ch41"],
      body: [
        "白板画 **Client → Coordinator → 三个副本**。环怎么找节点已经在 Ch05，**不要再画 20 个点的几何圆**。任一节点都可当 Coordinator：哈希出 preference list，把 put/get 转给这 N 台。",
        "",
        d2(`
direction: right
cli.class: go
cli: "Client"
coord.class: step
coord: "Coordinator"
a.class: store
a: "Replica A"
b.class: store
b: "Replica B"
c.class: store
c: "Replica C"
cli -> coord -> a -> b -> c
`),
        "",
        "本图引用：Ch41 复制、分片、事务",
        "",
        "规则就四句：",
        "",
        "1. API 就是 `get(key)` / `put(key, value)`。",
        "2. 客户端打到任意节点；该节点当 Coordinator。",
        "3. 用 Ch05 的环定位，**顺时针取 N 个不同物理机**（vnode 可能连续落同一台，要跳过）。",
        "4. Coordinator **并行**把写发到这 N 个副本（图摊成 preference list 一条链，避免三路扇出竖塔），**等 W 个 ACK** 再对客户端成功；其余异步赶。",
        "",
        "N=3 是白板默认。副本尽量跨 rack；跨 DC 的放置和 failover 细节在 **Ch41**。集群无中心主：每个节点职责相同，这是 Dynamo 风格和「一个 primary + 一串 replica」的差别。",
        "",
        "**面试怎么说：**",
        "",
        "> 「去中心化：谁接到请求谁协调。环上取三个不同物理机。我画 Client 到 Coordinator 再到 A/B/C，不重画哈希环。」",
        "",
        "| | Dynamo 风格 KV | Redis Cluster（对照一句） |",
        "|---|---|---|",
        "| 分片 | 一致性哈希 + vnode | **16384 hash slot** |",
        "| 复制 | N 副本都可写，靠 quorum | 每 slot **一个 primary** |",
        "| 面试定位 | **本章默认** | 另一产品；偏 CP 的槽表，点完即停 |",
        "",
        "高层到这里停，问一句：「Coordinator 和三副本 OK 吗？下面手算 quorum，再补冲突和 LSM。」",
      ].join("\n"),
    },
    {
      id: "sec-quorum",
      heading: "深入 · quorum N/W/R",
      secNum: "6.4",
      related: ["ch36", "ch41"],
      body: [
        "第一个 hard part：**可调一致性是三个整数，不是口号。** N 副本数，W 写成功所需 ACK 数，R 读成功所需响应数。",
        "",
        d2(`
grid-columns: 2
strong: {
  label: "W+R>N"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "读写必交"
  b.class: ok
  b: "可读到新值"
}
eventual: {
  label: "W+R≤N"
  class: groupBad
  grid-columns: 2
  c.class: warn
  c: "可无交集"
  d.class: warn
  d: "可能读旧"
}
`),
        "",
        "本图引用：Ch36 Trade-off · Ch41 复制、分片、事务",
        "",
        "W+R>N：写确认了 W 台有新值，读问了 R 台。两个集合大小相加超过 N，**必有交集**（鸽巢）。Coordinator 在读结果里取时间戳最高的那份，就能看到这次写。W+R≤N：读写可以完全错开，eventual，可能 stale。",
        "",
        "手算：N=3，W=2，R=2。写 ACK 了 A、B。读 B、C。B 在两个集合里 → B 有新值 → 返回。",
        "",
        "更准的口播（别和线性一致混）：这是 **quorum 相交带来的新鲜度**，不是实时全序。PACELC、线性一致进 **Ch36**。交集之上若时钟乱了，仍可能按错时间戳覆盖——下一节 LWW。",
        "",
        d2(`
shape: sequence_diagram
cli: "Client"
coord: "Coord"
a: "Replica A"
b: "Replica B"
cli -> coord: "PUT k=v"
coord -> a: "write"
coord -> b: "write"
a -> coord: "ACK"
b -> coord: "ACK"
coord -> cli: "200 W=2"
`),
        "",
        "本图引用：Ch41 复制、分片、事务",
        "",
        "上图 W=2、N=3：等 A、B 两台 ACK 就返回。**C 仍会写，只是不阻塞客户端。** 这是最常见的追问：",
        "",
        "> 「W=1 不是只写一台。N 台都会写；W 是 Coordinator **等几份 ACK 才 200**。其余异步。」",
        "",
        "| 配置 | 行为 | 白板定位 |",
        "|---|---|---|",
        "| **N=3 W=2 R=2** | 丢 1 台仍可读写；相交 | **默认** |",
        "| W=1 R=1 | 最快；可 stale | 缓存型、要 eventual |",
        "| W=3 R=1 | 写等齐；读任意一台 | 读多写少 |",
        "| W=1 R=3 | 写快读慢 | 写多；读要扫齐 |",
        "| W=3 R=3 | 最慢；一台挂就停 | 几乎没了 AP，少用 |",
        "",
        "N=3、W=2 允许 **一台** failover 后仍凑齐 W。两台同时挂，严格 quorum 会写失败——要分区两边都继续写，才是 sloppy quorum + 事后交还，细节 **Ch41**，白板先把严格 quorum 讲完。",
        "",
        "**面试怎么说：**",
        "",
        "> 「默认 3/2/2。W+R>N 所以读写必交，读时取最新时间戳。W 是 ACK 数不是写入台数。面试常说强一致，我补一句：这是 quorum 新鲜度，不是线性一致。」",
      ].join("\n"),
    },
    {
      id: "sec-lww",
      heading: "深入 · 冲突默认 LWW",
      secNum: "6.5",
      related: ["ch36"],
      body: [
        "第二个 hard part：分区或并发 put 时，同一 key 在不同副本上变成两份。**2026 白板生产默认是 Last-Write-Wins**：每条 mutation 带时间戳（或单调版本），读/修复时留戳更大的那份。Cassandra 这条线公开就是 LWW（含删除的 tombstone 也靠戳），不要把因果关系图当第一答案。",
        "",
        "冲突从哪来：A 把 `name=SF`，B 把 `name=NY`，两边都达到了各自的 W，网络恢复后两份都「合法」。LWW 比戳，只留一个。",
        "",
        "| | LWW（默认） |",
        "|---|---|",
        "| 比什么 | 客户端或 Coordinator 的时间戳 / 版本 |",
        "| 赢的 | 戳更大的那次 put |",
        "| 代价 | **丢掉**并发里输掉的那次写 |",
        "| 时钟 | NTP 偏斜、客户端乱报戳 → 可能盖错 |",
        "| 适合 | 可覆盖的状态、会话、资料字段 |",
        "| 不适合 | 不能丢的并发更新（要应用层合并或 CRDT，点到即停） |",
        "",
        "quorum 只保证你读到**某个写过的副本**；**谁赢**由 LWW 决定。所以「W+R>N 就不会丢更新」是错的：并发写加上偏斜的戳，仍可能覆盖因果上更晚的那次。Jepsen 一类分析讲过 LWW 在分区恢复时吞 ACK 过的写——面试承认这句，比假装 LWW 等于无损合并更加分。",
        "",
        "**面试怎么说：**",
        "",
        "> 「冲突我默认 LWW，Cassandra 生产就是这条。能覆盖的状态够用。会丢输掉的并发写，时钟要靠谱。计数器或要合并的结构再提 CRDT / 应用层 merge，不在这题展开。」",
        "",
        "red flag：把冲突方案讲成必须客户端实现复杂 merge 协议；或者反过来把 LWW 吹成永不丢数。敏感字段（库存、余额）根本不该用这道 AP KV 当权威——回澄清，改 CP，见 **Ch36**。",
      ].join("\n"),
    },
    {
      id: "sec-lsm",
      heading: "深入 · LSM 写 / 读路径",
      secNum: "6.6",
      related: ["ch37"],
      body: [
        "第三个 hard part：副本**节点内部**怎么把 put 做快。这题默认 **LSM**（Cassandra / RocksDB 一族）：把随机改页换成顺序追加。和 B+Tree 的完整对比在 **Ch37**，这里只留写/读两条链。",
        "",
        d2(`
direction: right
wal.class: go
wal: "WAL"
mem.class: step
mem: "memtable"
sst.class: store
sst: "SSTable"
wal -> mem -> sst
`),
        "",
        "本图引用：Ch37 存储选型",
        "",
        "写：",
        "",
        "1. **WAL**（Cassandra 叫 commit log）：顺序追加，崩溃用它恢复。",
        "2. **memtable**：内存里有序结构，put 直接改内存。",
        "3. memtable 到阈值 → **flush** 成不可变 **SSTable**（磁盘上有序 KV 文件）。",
        "4. 后台 **compaction** 合并文件、丢掉旧版本（正文图只画前三步，compaction 口播一句）。",
        "",
        "所以写快：热路径是 **顺序盘 + 内存**，没有 B+Tree 那种改一行可能动页。trade-off 立刻跟上：**写吞吐高，不等于写放大低**——compaction 会把同一 key 重写多遍。别把两个词混成一个。",
        "",
        "读：",
        "",
        "1. 先查 memtable。",
        "2. 再从新到旧看 SSTable；用 **Bloom filter** 跳过肯定没有该 key 的文件（说「不在」就真不在；说「可能在」才打开文件）。",
        "3. 多层文件 = **读放大**。compaction 就是在用写放大换读放大。",
        "",
        "| | LSM（本题默认） | B+Tree（对照，Ch37） |",
        "|---|---|---|",
        "| 写 | 顺序 WAL + 内存 | 原地改页，随机 IO |",
        "| 读 | 多层 SSTable，要 Bloom | 一次查找更稳 |",
        "| 放大 | 写放大、空间放大都明显 | 写放大来自整页 + WAL |",
        "| 适合 | 写多的 AP KV | OLTP、点查延迟严 |",
        "",
        "**面试怎么说：**",
        "",
        "> 「节点内默认 LSM。put 先 WAL 再 memtable，满了 flush 成 SSTable。读先内存再 Bloom 再文件。我用顺序写换吞吐，用 compaction 还读放大。和 InnoDB 比怎么选，留给存储选型那章。」",
        "",
        "热点 key 仍然打满一台的 CPU 和 memtable 抖动——LSM 不解这个，应用层拆 key，和 Ch05 同一句。",
      ].join("\n"),
    },
    {
      id: "sec-2026",
      heading: "2026 vs 原书",
      secNum: null,
      related: [],
      body: [
        "<details>",
        "<summary>原书 / 笔记当时怎么讲 · 向量时钟、Gossip/Merkle 全家桶进这里</summary>",
        "",
        d2(`
grid-columns: 2
lww: {
  label: "LWW 生产默认"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "时间戳决胜"
  b.class: ok
  b: "Cassandra"
}
vc: {
  label: "向量时钟"
  class: groupBad
  grid-columns: 2
  c.class: bad
  c: "原书核心"
  d.class: bad
  d: "生产少用"
}
`),
        "",
        "| 原书 / 笔记 | 现在怎么答 |",
        "|---|---|",
        "| 向量时钟当冲突核心，手算祖先/兄弟 | **正文默认 LWW**。向量时钟：客户端要写 merge、时钟会膨胀；Cassandra 公开不用。Riak 一类才真用。M6 讲 Dynamo 论文时可展开，仍标明生产多用 LWW |",
        "| Gossip + hinted handoff + Merkle 与 quorum 并列四大支柱 | 白板 **quorum + LWW + LSM**。故障：检测 / 临时移交 / 反熵各一句，机制 **Ch41** |",
        "| W+R>N 直接等于线性一致 | 说 **quorum 新鲜度**；线性一致 / PACELC 进 Ch36 |",
        "| 不提 Redis Cluster | **一句对照**：16384 slot、每 slot 一个 primary，偏 CP 分片，不是本章 |",
        "| 不提 Spanner / TiKV | **CP 对照一句**；TrueTime / Raft 不在这题展开 |",
        "| Dynamo 论文当实现说明书 | 2026 面试是 **Cassandra 风格 AP + 可调 quorum**；DynamoDB 已演变成托管 + 可选强读，不当 AWS 清单 |",
        "",
        "原书骨架仍成立：要分区、要 N 副本、要 quorum、LSM 写路径。过时的是**把向量时钟当生产默认**，以及**把故障三件套画成和 quorum 同等篇幅**。",
        "",
        "向量时钟（仅本折叠）：每个副本一份 `[节点 → 计数]`，用来区分「A 是 B 的祖先」还是「并发兄弟」。兄弟才需要应用 merge。优雅，但写路径常要先读、向量还要截断——这就是生产改 LWW 的原因。",
        "",
        "</details>",
      ].join("\n"),
    },
    {
      id: "sec-traps",
      heading: "追问陷阱",
      secNum: null,
      related: ["ch36", "ch37", "ch41"],
      body: [
        "1. 「为什么这题选 AP？」→ 分区时仍要 get/put（会话、购物车、timeline）。账户/配置改 CP，点到 Ch36。",
        "2. 「CA 为什么不谈？」→ 分布式必有分区，P 不是可选项。机制 Ch36。",
        "3. 「W+R>N 为什么能读到新值？」→ 读写集合必有交集；读侧取最高时间戳。",
        "4. 「W=1 是只写一台吗？」→ **不是**。写 N 台，W 是 ACK 数。",
        "5. 「那是线性一致吗？」→ 不是。是 quorum 新鲜度。PACELC 进 Ch36。",
        "6. 「冲突怎么解？」→ **LWW**。会丢输掉的并发写；时钟偏斜会盖错。不要把论文里的因果关系图当默认。",
        "7. 「一台挂了还能写吗？」→ N=3 W=2 可以。两台挂，严格 quorum 不行；sloppy 是 Ch41。",
        "8. 「LSM 为什么写快？写放大是不是也小？」→ 顺序 WAL + 内存所以吞吐高；compaction 让**写放大高**。别混淆。",
        "9. 「读怎么不扫全部文件？」→ memtable → Bloom → SSTable。Bloom 说不在就跳过。",
        "10. 「Redis Cluster 不也是 KV 吗？」→ hash slot + primary，另一产品。不要改写成 Redis 课。",
        "11. 「Gossip / Merkle 不讲吗？」→ 点名：故障检测、临时移交、反熵。展开 Ch41，否则 over-engineering。",
      ].join("\n"),
    },
    {
      id: "sec-next",
      heading: "下一步",
      secNum: null,
      related: ["ch07"],
      body: [
        "收尾不要说完美。三个 bottleneck 口播：",
        "",
        "| bottleneck | 你怎么接 |",
        "|---|---|",
        "| 单 key 热点 | 环和 quorum 都不解；拆 key / 单独池 |",
        "| LWW + 时钟偏斜 | 承认可丢并发写；不能丢就别用这套 AP KV |",
        "| LSM 写放大 / 读放大 | compaction 调层级；读多再对比 B+Tree（Ch37） |",
        "",
        "自测：合上页，30 秒开场；手算 N=3 W=2 R=2 为什么相交；说出 W 不是写入台数；LWW 丢什么；WAL → memtable → SSTable。哪句卡，回哪一节。",
        "",
        "下一章 **Ch07 · 分布式唯一 ID**：KV 里的 key 从哪来；Snowflake、UUID、号段，以及时钟回拨。",
      ].join("\n"),
    },
  ],
  reviewMd: `# Ch06 · 记忆闪卡

| # | 正面 | 背面 |
|---|---|---|
| 1 | KV 开场 30 秒说什么？ | Dynamo/Cassandra 风格 AP；环上 N=3；quorum 默认 3/2/2；冲突 LWW；节点内 LSM。Redis Cluster 点一句即停。 |
| 2 | 这题为什么默认 AP？ | 分区时仍要服务。账户/配置改 CP（etcd/TiKV/Spanner），机制 Ch36。 |
| 3 | N、W、R 各是什么？ | N 副本数；W 写成功要等的 ACK；R 读要等的响应。默认 N=3 W=2 R=2。 |
| 4 | W+R>N 保证什么？ | 读写集合必有交集，读能拿到写过的副本。是 quorum 新鲜度，不是线性一致。 |
| 5 | W=1 是只写一台吗？ | **不是**。仍写 N 台；W 只是 Coordinator 等几份 ACK 就 200。 |
| 6 | W+R≤N 呢？ | 读写可错开 → eventual，可能 stale。 |
| 7 | 冲突生产默认？ | **LWW**：时间戳/版本大的赢。Cassandra 这条。 |
| 8 | LWW 的 trade-off？ | 丢掉并发里输掉的写；时钟偏斜可能盖错。不能丢的数据不要用这套。 |
| 9 | LSM 写路径？ | WAL → memtable → flush 成 SSTable；后台 compaction。 |
| 10 | 为什么写快、写放大却高？ | 热路径顺序写+内存（吞吐）；compaction 重写多遍（放大）。两码事。 |
| 11 | LSM 读路径？ | memtable → Bloom filter → SSTable。Bloom 说不在就跳过。 |
| 12 | 高层图画什么、不画什么？ | Client → Coordinator → N 副本。不重画 20 节点环（Ch05）。 |
| 13 | Redis Cluster 一句？ | 16384 hash slot，每 slot 一个 primary，偏 CP 分片。不是本章默认。 |
| 14 | 这题典型的 over-engineering？ | 论文故障全家桶和 quorum 平均用力；把因果关系图当生产默认；把本题改成 Redis 或 Spanner。 |`,
});
