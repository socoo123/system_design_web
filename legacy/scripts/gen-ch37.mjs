import { writeChapter } from "./write-chapter.mjs";

const d2 = (src) => {
  const body = src.trim();
  const sized = /style\.font-size/.test(body) ? body : `style.font-size: 12\n${body}`;
  return "```d2\n" + sized + "\n```";
};

writeChapter({
  id: "ch37",
  num: "37",
  title: "存储选型",
  kind: "foundation",
  relatedChapters: ["ch06", "ch09", "ch13", "ch14", "ch15", "ch22", "ch23", "ch31"],
  sections: [
    {
      id: "intro",
      heading: "",
      secNum: null,
      related: ["ch06", "ch36"],
      body: [
        "> **预计**：90–120 分钟 ｜ **前置**：Ch06 KV/LSM；Ch36 CAP 格子",
        "> **目标**：关系 / KV / 文档 / 列式 / 图 / 对象 / 时序 / 向量怎么选；B+Tree vs LSM。向量引擎细节回 Ch31。不去 AWS 购物。",
        "",
        "这是 **M6 第二块基础芯片**，不是又一道 4 步设计题。Ch36 告诉你偏 AP 还是偏 CP；本章告诉你**模型和引擎怎么接这格**。主线里短链、搜索、视频、网盘、KV 都会点到「用什么库」——这里把选型语言讲透，设计题里只引用，不在白板上开购物课。",
        "",
        "**一句话：** 先问访问模式，再选模型；需要 **事务 + join + 约束** 就默认关系库，不是因为「SQL 过时了才换 NoSQL」。引擎看 **B+Tree（读优）vs LSM（写优）**。宽列、分析列存、对象、向量是四件不同的东西，不要都叫「列式」。",
        "",
        "三个 hard part（最该挖的那块）：",
        "",
        "1. **访问模式决定模型** —— point lookup / range / join / scan / 多跳 / ANN，先于产品名",
        "2. **B+Tree vs LSM** —— 读优化 vs 写优化；compaction 税；写放大 / 读放大怎么开口",
        "3. **宽列 vs 分析列存 vs 对象 vs 向量 别混** —— Cassandra 不是 ClickHouse；blob 不是向量",
        "",
        "本章**不讲**：云厂商 SKU 目录、隔离级别百科（那是 **Ch41**）、块/文件/对象当硬件课当脊梁、把 Ch06 的 quorum / hinted handoff / 向量时钟再讲成一章、把 Ch31 的 HNSW / IVF 再讲成一章、GNN、HTAP / NewSQL 展销会、Mongo vs PG 骂战、K8s YAML。NewSQL 只留一句「SQL + 分布式共识这条线存在」。向量时钟仍折叠；生产冲突默认 **LWW**（已在 Ch06）。",
      ].join("\n"),
    },
    {
      id: "sec-pitch",
      heading: "一句话定义 · 面试 20 秒开口",
      secNum: "37.1",
      related: ["ch06", "ch36"],
      body: [
        "先把评分信号打出来：你按访问模式选，不按海报和品牌选。",
        "",
        "> 「存储先问**怎么读写**，再选模型。要事务、join、外键/约束 → **关系库默认**，不是 SQL 过时。只要 `get/put`、会话、cache-aside 搭档 → **KV**（Ch06）。JSON 形态在变 → **文档**，但 schema 仍在应用层。写重宽行 → **宽列 + LSM**。分析扫列 → **列存 OLAP**，别和宽列混。多跳路径才上图；blob / 视频 / 备份走**对象**，元数据往往仍是关系库。时序是追加 + 降采样，不是通用库。RAG / ANN 才上向量，引擎细节 Ch31。引擎：点查稳、OLTP → **B+Tree**；写吞吐、AP KV → **LSM**，compaction 是税。」",
        "",
        "整章按这一条链走。上场 20 秒念完就停，让面试官决定要挖选型、引擎还是「别混」。",
        "",
        d2(`
direction: right
acc.class: go
acc: "访问模式"
mod.class: step
mod: "数据模型"
eng.class: store
eng: "存储引擎"
acc -> mod -> eng
`),
        "",
        "本图引用：Ch06 键值存储 · Ch36 CAP 格子（模型怎么接 AP/CP）",
        "",
        "| 面试官问法 | 你落在哪一截 |",
        "|---|---|",
        "| 「这题用什么数据库？」 | 先问 **point / join / scan / ANN**；再报模型 |",
        "| 「SQL 是不是太老了？」 | 要事务 + join + 约束就仍是默认；不是年代问题 |",
        "| 「Cassandra 和数仓不都是列式吗？」 | **宽列 LSM ≠ 分析列存**；对象、向量再另开 |",
        "| 「引擎呢？」 | 读延迟严 → B+Tree；写重 → LSM + compaction 税 |",
        "",
        "**red flag：** 一上来报云产品名；把关注关系画成图就上 Neo4j；把 Cassandra 和列存 OLAP 说成同一种「列式」；把 blob 塞进 KV；为 RAG 还没问规模就上专用向量集群。",
      ].join("\n"),
    },
    {
      id: "sec-access",
      heading: "机制 · 访问模式决定模型",
      secNum: "37.2",
      related: ["ch06", "ch09", "ch14", "ch15", "ch31"],
      body: [
        "第一个 hard part。**2026 面试里，会背八种数据库不如会问访问模式。** 模型是查询形状的答案，不是购物清单。",
        "",
        d2(`
grid-columns: 2
oltp: {
  label: "点查 / 关系"
  class: groupOk
  grid-columns: 2
  p.class: go
  p: "point get"
  j.class: ok
  j: "join 事务"
}
spec: {
  label: "扫描 / 近邻"
  class: group
  grid-columns: 2
  s.class: warn
  s: "列存 scan"
  n.class: store
  n: "向量 ANN"
}
`),
        "",
        "本图引用：Ch06 点查 · Ch31 ANN（join 默认关系库；scan 不是宽列）",
        "",
        "问法就这一串：这条路径是 **单 key**、**范围**、**多表 join**、**扫大量列做聚合**、**图上走几跳**、还是 **高维近邻**？答完模型几乎定了。底下介质可以说「块存储扛库盘、文件共享挂载、对象放 blob」——**不当本章目录**。",
        "",
        d2(`
grid-columns: 2
relkv: {
  label: "关系 / KV"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "事务+join"
  b.class: step
  b: "点查高 QPS"
}
docw: {
  label: "文档 / 宽列"
  class: group
  grid-columns: 2
  c.class: step
  c: "JSON 演化"
  d.class: warn
  d: "写重宽行"
}
`),
        "",
        "图只钉 OLTP 四格（并排，避免四组叠成塔）。图、对象、时序、向量下面用段落收。",
        "",
        "### 关系库：事务 + join + 约束时的默认",
        "",
        "订单、库存、支付账本、网盘目录——要 **原子提交、跨表一致、唯一/外键**，第一答案仍是关系库。不是「SQL 老了所以换」。隔离级别不要开课：生产常见默认是 **SI / MVCC**（PostgreSQL 默认这条线；MySQL InnoDB 也是 MVCC 主路径）。脏读 / 幻读对照表进 **Ch41**。",
        "",
        "| 白板怎么开口 | 一句就停 |",
        "|---|---|",
        "| 默认隔离 | **SI / MVCC**：读看不到未提交；写冲突用版本 / 锁 |",
        "| 需要 Serializable | 代价是吞吐；钱相关路径可以谈，不要全站默认 |",
        "| 读未提交 | 面试几乎不选；别当「优化」 |",
        "",
        "分片、跨库事务、Saga / Outbox 是 **Ch41**。NewSQL（SQL 接口 + 分布式共识）**存在**，用来回答「还想要 SQL 又要水平扩」——不要开成产品巡礼。",
        "",
        "### KV：point get/put，会话与 cache-aside 搭档",
        "",
        "`get(key)` / `put(key, value)`，value 小。会话、购物车、短链映射（**Ch09**）、高 QPS 点查。AP 那条线的机制已经在 **Ch06**（quorum、LWW、写路径 LSM）——本章只回答 **何时选它**：没有 join、没有跨 key 事务当权威。它也常当关系库前面的 **cache-aside** 搭档（展开 **Ch38**），不是第二份账本。Redis Cluster 是另一条产品（hash slot + primary），不要和 Dynamo 风格 AP KV 画成同一个框。",
        "",
        "### 文档：JSON 在变，不是永远没有 schema",
        "",
        "嵌套文档、字段按租户/品类分叉、演进快 → 文档模型合适。**schemaless 不是许可证：** 约束从库里挪到应用层，脏数据更容易进。后来的校验 / 可选 schema 说明「软 schema」才是实话。真要频繁 join 多集合，你其实想要关系库。多文档事务如今不少引擎有，仍不要把文档库当万能 OLTP。",
        "",
        "### 宽列：写重、稀疏宽行（Cassandra 风格）",
        "",
        "分区键 + 聚簇键，一行可以很宽、很稀疏；写追加友好，引擎几乎总是 **LSM**。适合时间序宽表、按主键范围扫**这一行里的列**。行内原子常见，**跨行 ACID 不是它的卖点**。别把它和分析列存当成一种「列式」——下一张别混表专门拆。",
        "",
        "### 图：理由是多跳，不是白板上有「关注」",
        "",
        "`user follows user` 一跳、两跳，关系库 join / 闭包表经常够用。上图库的理由是 **反复多跳、路径、变长遍历** 会把 join 打成 bottleneck。不要因为画了两个圆圈和一条边就写 Neo4j。GNN / 图神经网络**不是本章**。",
        "",
        "### 对象：blob；元数据仍常走关系库",
        "",
        "视频源片与分片（**Ch14**）、网盘块（**Ch15**）、备份、静态资源——不可变字节走对象存储；目录、ACL、时长、版本号走小库。**专章是 Ch22。**",
        "",
        d2(`
direction: right
app.class: go
app: "App"
obj.class: store
obj: "对象存储"
meta.class: store
meta: "元数据库"
app -> obj -> meta
`),
        "",
        "本图引用：Ch14 视频 · Ch15 网盘 · Ch22 对象存储",
        "",
        "顺序要说清：**先落字节，再 commit 元数据**，库里不要指向还不存在的对象。API 不中转 GB。块存储 / 文件存储只点一句：库盘常见挂块设备；多机共享目录才是文件；对象是 HTTP 语义的 blob，不是 POSIX 盘。",
        "",
        "### 时序：追加 + 降采样，不是通用 DB",
        "",
        "指标、IoT、监控：几乎只 append，按时间窗聚合、降采样、过期删除。专用 TSDB 的价值在压缩、保留策略、按时间分区。不要拿它存订单。Cassandra 能塞「有点像时序的宽行」，仍不是时序引擎。",
        "",
        "### 向量：有 ANN / RAG 才选；何时 vs pgvector vs 不要",
        "",
        "查询是「和这条 embedding 最像的 k 条」才需要向量索引。细节（HNSW / IVF / 过滤）**整章在 Ch31**，这里只定 **何时**：",
        "",
        "| | 选它 | 别选 |",
        "|---|---|---|",
        "| **pgvector 一类** | 数据已在关系库、百万级、要和行一起 join | 亿级 float32 + 严过滤当主路径 |",
        "| **专用向量服务** | ANN 就是产品；规模/过滤/副本是 bottleneck（Ch31） | 还没问条数就上集群 |",
        "| **不要向量** | 精确 id、关键词、SQL LIKE | 把倒排（Ch13）或 KV 换成「语义」装门面 |",
        "",
        "面试怎么说：",
        "",
        "> 「我先问访问模式。账本关系库；短链 KV；视频字节对象 + 元数据关系库；没有多跳不上图；没有 ANN 不上向量。宽列和分析列存我分开讲。」",
      ].join("\n"),
    },
    {
      id: "sec-engine",
      heading: "机制 · B+Tree vs LSM",
      secNum: "37.3",
      related: ["ch06"],
      body: [
        "第二个 hard part。Ch06 已经画过 **WAL → memtable → SSTable**；本章要能 **推导 trade-off**，而不是再背一条链。",
        "",
        d2(`
grid-columns: 2
bt: {
  label: "B+Tree 读优"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "点查稳"
  b.class: ok
  b: "原地改页"
}
lsm: {
  label: "LSM 写优"
  class: group
  grid-columns: 2
  c.class: step
  c: "顺序追加"
  d.class: warn
  d: "compaction 税"
}
`),
        "",
        "本图引用：Ch06 键值存储（写路径在那边讲过；这里挖放大）",
        "",
        "**B+Tree（读优化默认）：** 数据在页里，查找沿根到叶，高度通常很小，点查和范围（叶节点有序链接）都稳。更新是 **原地改页** + **WAL** 保崩溃。随机写页是代价：改 100 字节也可能刷整页。InnoDB / PostgreSQL 索引走这条家族。适合 OLTP：读延迟严、有事务、原地更新多。",
        "",
        "**LSM（写优化默认）：** 热路径不改旧页。写先顺序进 **WAL**，再进内存 **memtable**；满了 **flush** 成不可变 **SSTable**。后台 **compaction** 合并文件、丢掉旧版本。写吞吐高，因为盘上是顺序追加。Cassandra / RocksDB / LevelDB 一族。Ch06 的 AP KV 节点内默认就是它。",
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
        "本图引用：Ch06 键值存储（compaction 口播，图只画热路径）",
        "",
        "### 推导：写放大、读放大、compaction 税",
        "",
        "**写放大（write amplification）：** 用户写 1 字节，盘上实际写了多少。",
        "",
        "- B+Tree：WAL 记一条 + 脏页回刷。页远大于行 → 已经有放大；但**没有**「同一 key 被合并六层」那种后台重写。",
        "- LSM：同一 key 从 memtable flush 到 L0，再被 compaction 推到更深的层。层数越多、层间倍率越大，**同一条记录会被重写多遍**。这就是 **compaction 税**：用额外写换回更少的文件数、更干净的读。",
        "",
        "所以「LSM 写得快」说的是 **热路径吞吐**（顺序 + 内存），**不是**写放大低。两个词混成一句是 red flag。Ch06 教学容量还会再乘一截空间放大——compaction 前多版本占盘。",
        "",
        "**读放大（read amplification）：** 一次 point get 碰了多少文件 / 页。",
        "",
        "- B+Tree：大约树高次页读，可预期。",
        "- LSM：memtable + 若干部 SSTable。文件越多越疼。**Bloom filter** 一句：过滤器说「不在」，这个 SSTable **可以跳过**（没有假阴性）；说「可能在」才打开文件（允许假阳性）。compaction 用写放大换读放大：合并完，要查的层变少。",
        "",
        "| | **B+Tree** | **LSM** |",
        "|---|---|---|",
        "| 写热路径 | 改页 + WAL，随机 IO 多 | WAL + 内存，顺序 IO |",
        "| 读热路径 | 树高次查找，稳 | 多层 + Bloom；未 compact 时读放大高 |",
        "| 税 | 页级写放大 | **compaction 税** + 空间放大 |",
        "| 适合 | OLTP、点查/范围、事务 | 写重 AP KV、宽列 ingest |",
        "| 面试钉子 | 关系库默认引擎家族 | Ch06 节点内默认 |",
        "",
        "读极多、写很少、延迟 SLO 紧 → 别只因为「互联网公司都用 LSM」就上 RocksDB 当主 OLTP，那是 over-engineering（或错配）。写极多、可接受 compaction 毛刺和短暂多层读 → LSM。混合负载会把旋钮拧到 compaction 策略上，白板点到「用写放大换读放大」即可，不要开成调参课。",
        "",
        "面试怎么说：",
        "",
        "> 「B+Tree 读稳、原地改页；LSM 热路径顺序写，税在 compaction。写得快 ≠ 写放大小。读靠 Bloom 跳过文件。短链那种读多写少，权威映射用 KV 也行，但引擎我会问读写比——读极严可以是 B+Tree 家族。」",
      ].join("\n"),
    },
    {
      id: "sec-compare",
      heading: "选型表：一张总表 + 别混",
      secNum: "37.4",
      related: ["ch06", "ch13", "ch22", "ch23", "ch31"],
      body: [
        "白板不要开数据库展销会。总表按访问模式钉模型；第二张专治「列式」一词多用。",
        "",
        "| 模型 | 访问模式 | 选它因为 | 别选如果 |",
        "|---|---|---|---|",
        "| **关系** | join、事务、约束 | 账本、订单、元数据权威 | 只有单 key、或 blob 当行 |",
        "| **KV** | point get/put | 会话、短链、高 QPS 点查（Ch06/Ch09） | 需要 join / 跨 key 事务当权威 |",
        "| **文档** | 嵌套 JSON、字段分叉 | 形态在变的档案 | 想永久零 schema、或重 join |",
        "| **宽列** | 写重、稀疏宽行、按主键扫列 | Cassandra 风格 ingest | 把分析扫表当成它 |",
        "| **图** | **多跳** 遍历 | 路径本身是查询 | 关注关系两跳以内（join 即可） |",
        "| **对象** | 大 blob、写一次读多次 | 视频/网盘/备份（Ch14/15/22） | 把目录树只放对象、没有元数据库 |",
        "| **时序** | append + 降采样 | 指标 / IoT | 当通用业务库 |",
        "| **向量** | ANN / RAG | 相似度是查询（何时见上节；引擎 Ch31） | 精确匹配、关键词搜索 |",
        "| **倒排** | 词 → 文档 | 站内搜索（Ch13） | 当通用 DB 或推荐漏斗 |",
        "",
        "排行榜（**Ch23**）常是：权威在库，热列表用有序结构（ZSET 一类）做读路径——那是 **访问模式 = 范围 top-k**，不是「再买一个图数据库」。",
        "",
        d2(`
grid-columns: 2
cols: {
  label: "宽列 vs 列存"
  class: group
  grid-columns: 2
  a.class: step
  a: "宽列 LSM"
  b.class: ok
  b: "分析列存"
}
blob: {
  label: "对象 vs 向量"
  class: group
  grid-columns: 2
  c.class: store
  c: "blob 对象"
  d.class: warn
  d: "ANN 向量"
}
`),
        "",
        "本图引用：Ch22 对象存储 · Ch31 向量检索（宽列 ≠ 列存 OLAP）",
        "",
        "| 别混 | 存什么 | 查询是什么 | 面试钉子 |",
        "|---|---|---|---|",
        "| **宽列 LSM** | 稀疏行，列按行键聚在一起 | 按分区键点查 / 短范围 | Cassandra / HBase 谱系；写引擎是 LSM |",
        "| **分析列存** | 一列连续放，利于压缩 | **扫列做聚合**（数仓 / OLAP） | Parquet、ClickHouse 一类；**不是**宽列 |",
        "| **对象** | 不可变字节 + object id | GET 整段或 Range | 元数据在关系库；不是「列式」 |",
        "| **向量** | embedding + 可选 payload | **ANN** top-k | 有相似度才选；HNSW 细节回 Ch31 |",
        "",
        "把 Cassandra 和 Redshift / ClickHouse 都叫「列式」而不加限定，是本章最大的用词 red flag。宽列的「列」是稀疏行上的动态列；分析列存的「列」是把同一字段竖着排以便扫描。对象没有「列」。向量的索引不是 B+Tree 点查。",
        "",
        "面试怎么说：",
        "",
        "> 「总表按访问模式填。列式我先问：写重宽行，还是 OLAP 扫列。对象放 blob，向量放 ANN。倒排是搜索题，不塞进这张购物表当第九种万能库。」",
      ].join("\n"),
    },
    {
      id: "sec-papers",
      heading: "论文与经典系统",
      secNum: "37.5",
      related: ["ch06", "ch31", "ch36"],
      body: [
        "M6 要能点名。下面 3 篇必读、2 篇选读。**面试用哪一句**写在表里；不要背页码，不要编造内部结论。教学链按「AP KV → 写引擎 → 宽列系统」串，**不是发表年表**（LSM 1996 早于 Bigtable 2006 早于 Dynamo 2007）。",
        "",
        d2(`
direction: right
dyn.class: go
dyn: "Dynamo"
lsm.class: step
lsm: "LSM-tree"
bt.class: ok
bt: "Bigtable"
dyn -> lsm -> bt
`),
        "",
        "| | 文献 | 必读 / 选读 | 面试用哪一句 |",
        "|---|---|---|---|",
        "| 1 | **DeCandia et al.**，SOSP 2007，*Dynamo: Amazon's Highly Available Key-value Store* | 必读 | **AP KV**：分区时仍要 put。论文里有 sloppy quorum、**hinted handoff**、向量时钟。白板生产冲突默认 **LWW**（Ch06）；不要把论文全家桶讲成实现说明书 |",
        "| 2 | **O'Neil, Cheng, Gawlick, O'Neil**，1996，*The log-structured merge-tree (LSM-tree)*，Acta Informatica | 必读 | 为高插入设计：内存组件 + 盘上组件，**merge 成顺序写**。读可能更贵。今日 SSTable / compaction 的祖先 |",
        "| 3 | **Chang et al.**，OSDI 2006，*Bigtable: A Distributed Storage System for Structured Data* | 必读 | 稀疏、分布式、多维有序 map；（row, column, timestamp）→ 字节。tablet + **memtable / SSTable**。宽列谱系，**不是**分析列存、不是关系库 |",
        "| 4 | **Stonebraker & Çetintemel**，ICDE 2005，*\"One Size Fits All\": An Idea Whose Time Has Come and Gone* | 选读 | punchline：**一种引擎打天下的时代过了**；流、数仓、OLTP 会裂成专用引擎。用来收口本章选型 |",
        "| 5 | **Corbett et al.**，OSDI 2012，*Spanner: Google's Globally-Distributed Database* | 选读 | **一句：** TrueTime 暴露时钟不确定度，用来做 **external consistency**（提交顺序和真实时间对齐）。不要开成 Spanner 专章；CAP 格子在 Ch36 |",
        "",
        "Dynamo 论文可以点 hinted handoff（故障时把写交给别的节点、稍后交还），**不要**把 quorum 手算、Merkle、Gossip 再讲一遍——那是 Ch06 / Ch41。向量时钟：论文用来找因果并发版本；**2026 生产默认 LWW**，Ch06 已钉死。",
        "",
        "Bigtable 的 SSTable 和 LSM 论文对得上：不可变有序文件 + 内存表。HBase 是这条公开谱系。分析型列存（C-Store / 后来的列存 OLAP）是另一篇故事，不要塞进 Bigtable 一句里。",
        "",
        "向量索引论文（HNSW 等）**不在本章必读**——链 **Ch31**。",
      ].join("\n"),
    },
    {
      id: "sec-used",
      heading: "哪些设计题会用到",
      secNum: "37.6",
      related: ["ch06", "ch09", "ch13", "ch14", "ch15", "ch22", "ch23", "ch31"],
      body: [
        "主线先做题，卡壳再跳进本章。回链不是把 M6 读完再开写。",
        "",
        d2(`
grid-columns: 3
kv: {
  label: "KV 点查"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "Ch06 引擎"
  b.class: ok
  b: "Ch09 短链"
}
obj: {
  label: "对象 blob"
  class: group
  grid-columns: 2
  c.class: store
  c: "Ch15 网盘"
  d.class: store
  d: "Ch22 对象"
}
vec: {
  label: "向量 ANN"
  class: group
  grid-columns: 2
  e.class: warn
  e: "Ch30 RAG"
  f.class: warn
  f: "Ch31 引擎"
}
`),
        "",
        "本图引用：Ch06 / Ch09 · Ch15 / Ch22 · Ch30 / Ch31",
        "",
        "| 章 | 会用到哪一句 |",
        "|---|---|",
        "| **Ch06** KV | 何时用 KV；节点内 LSM；和 B+Tree 对照在本章加深 |",
        "| **Ch09** 短链 | `code → url` 是 point get；KV + 缓存，不需要 join |",
        "| **Ch13** 搜索 | 倒排不是通用库；正文/对象另存；索引是 term → posting |",
        "| **Ch14** 视频 | 字节对象存储；元数据小库；API 不中转 GB |",
        "| **Ch15** 网盘 | 块走对象 + CAS；目录/版本走关系库；先块后 commit |",
        "| **Ch22** 对象存储 | 本章的对象模型专章展开（上传、元数据、一致性） |",
        "| **Ch23** 排行榜 | 热列表是有序 top-k 读路径，不是图库；权威分仍可在库 |",
        "| **Ch30 / Ch31** | RAG 才要向量；专用引擎 vs pgvector 在本章「何时」；HNSW 回 Ch31 |",
        "| **Ch18 / Ch24** | 订单/支付：关系库默认；不要用 AP KV 当账本 |",
        "| **Ch34** | Agent run state 是「按 id 点查 + 要持久」的选型，不要在编排白板选品牌 |",
        "",
        "聊天、Feed、评论：时间线可以宽表或 KV；**账户、权限、钱**仍偏关系库。按数据拆，不要全站一个引擎。",
      ].join("\n"),
    },
    {
      id: "sec-2026",
      heading: "2026 vs 笔记 / 原书",
      secNum: null,
      related: [],
      body: [
        "<details>",
        "<summary>原书 / 笔记当时怎么讲 · AWS 品牌目录和「都叫列式」进这里</summary>",
        "",
        "笔记对应 AWS 书存储两章：块/文件/对象三件套对云盘 SKU、RDS/Aurora 购物、四大 NoSQL + 一串产品名。**那不是本章正文。** 2026 上场只带访问模式 → 模型 → 引擎。",
        "",
        "| 原书 / 笔记 | 现在怎么答 |",
        "|---|---|",
        "| EBS / EFS / S3 / RDS / Aurora / DynamoDB 表当目录 | **块存储 / 文件 / 对象**；**托管关系库 / 托管 KV** 当机制例子，不当购物清单 |",
        "| 隔离级别五种当主线 | **一句 SI/MVCC 默认**；百科 **Ch41** |",
        "| 文件/块/对象当本章脊梁 | 对象作为**模型**讲 blob；硬件课不当目录 |",
        "| CAP 三选二海报选库 | 格子在 **Ch36**；本章接模型和引擎 |",
        "| Cassandra 和 Redshift 都叫「列式」 | **宽列 LSM vs 分析列存** 必须拆开 |",
        "| 向量时钟当冲突核心 | 论文可点；生产 **LWW**（Ch06） |",
        "| Dynamo 论文当实现说明书 | 面试是 AP KV + 可调一致性；handoff 点名即可 |",
        "| Mongo vs PG 谁赢 | 访问模式；禁止骂战 |",
        "| GNN / HTAP 产品巡礼 | **不是本章**；NewSQL 一句存在 |",
        "| 没讲向量 / 或只报托管向量 SKU | **何时**用向量 vs pgvector vs 不要；引擎 Ch31 |",
        "",
        "正文第一答案用现在这套。折叠只防止你把云目录和「列式」一词搬上白板。",
        "",
        "</details>",
      ].join("\n"),
    },
    {
      id: "sec-traps",
      heading: "追问陷阱",
      secNum: null,
      related: ["ch06", "ch31", "ch41"],
      body: [
        "1. **「为什么还用关系库？」** → 要事务、join、约束。不是年代。账本不要用 AP KV 当权威。",
        "2. **「访问模式怎么问？」** → point / range / join / scan / 多跳 / ANN。答完再报模型。",
        "3. **「文档库是不是不用 schema？」** → 约束在应用层。脏数据风险；不是永久零 schema。",
        "4. **「宽列和分析列存区别？」** → 宽行稀疏 + LSM ingest vs 列连续存放给 OLAP scan。别都叫列式。",
        "5. **「关注关系要不要 Neo4j？」** → 一两跳用 join。多跳路径才是图的理由。",
        "6. **「视频为什么不放 KV？」** → blob 太大；对象 + 元数据小库。KV 假设 value 小（Ch06）。",
        "7. **「时序能不能当业务库？」** → 不能。append + 降采样专用。",
        "8. **「向量什么时候上？pgvector 够不够？」** → 有 ANN 才上。已在 PG、百万级、要 join → pgvector。亿级 + 过滤主路径 → Ch31 专用引擎。",
        "9. **「B+Tree 和 LSM 谁更快？」** → 看读写。读稳 B+Tree；写吞吐 LSM。写得快 ≠ 写放大小。",
        "10. **「compaction 是什么税？」** → 后台把同一 key 重写多遍，用写放大换更少文件、更低读放大。",
        "11. **「Bloom filter 干什么？」** → 说不在就跳过 SSTable；没有假阴性。说可能在才读盘。",
        "12. **「Dynamo 论文冲突怎么解？」** → 论文向量时钟 / 应用合并；**生产默认 LWW**（Ch06）。hinted handoff 点名，不展开成故障课。",
        "13. **「Bigtable 是不是数仓？」** → 不是。稀疏宽表 + tablet + SSTable。分析列存另一条。",
        "14. **「One Size Fits All 什么意思？」** → Stonebraker：一种通用引擎打天下过时了，所以本章才按访问模式拆。",
        "15. **「Spanner 一句？」** → TrueTime + **external consistency**。不是本章展开；CP 格子 Ch36。",
        "16. **「隔离级别呢？」** → 默认 SI/MVCC。Read Uncommitted 别当优化。细表 Ch41。",
      ].join("\n"),
    },
    {
      id: "sec-next",
      heading: "下一步",
      secNum: null,
      related: ["ch38"],
      body: [
        "合上页，用 20 秒口播走一遍：访问模式 → 模型；关系库何时默认；B+Tree vs LSM 和 compaction 税；宽列 / 分析列存 / 对象 / 向量四格不混。能把短链、网盘、RAG 放进格子，这一章就过关。",
        "",
        "下一章 **Ch38 · 缓存与 CDN**：aside / through / back、穿透击穿雪崩、CDN。存储章解决「权威数据放哪」；缓存章解决「热路径别每次打权威」。短链的 Redis、视频的 CDN、搜索的 query cache 都在那边展开。语义缓存点到 Ch32，不要提前开。",
        "",
        "自测：左列三句 hard part，中列总表四行（关系 / KV / 对象 / 向量），右列 B+Tree vs LSM 各一句税。不要把云 SKU 默写回去。",
      ].join("\n"),
    },
  ],
  reviewMd: `# Ch37 · 记忆闪卡

| # | 正面 | 背面 |
|---|---|---|
| 1 | 20 秒怎么开口？ | 先访问模式再模型。事务+join+约束 → 关系库默认。KV 点查；文档仍有应用 schema。引擎 B+Tree 读优 / LSM 写优。宽列 ≠ 分析列存 ≠ 对象 ≠ 向量。 |
| 2 | 三个 hard part？ | ① 访问模式决定模型 ② B+Tree vs LSM（compaction 税）③ 宽列 / 列存 OLAP / 对象 / 向量别混。 |
| 3 | 访问模式问哪几类？ | point lookup、range、join、scan、图多跳、ANN。先于产品名。 |
| 4 | 何时默认关系库？ | 需要**事务 + join + 约束**。不是「SQL 没过时所以将就」。账本/订单/元数据权威。 |
| 5 | 隔离级别本章怎么说？ | 默认 **SI / MVCC**。百科在 Ch41。不要开五种级别课。 |
| 6 | 何时 KV？ | 高 QPS point get/put、会话、短链、cache-aside 搭档。无 join。机制 Ch06。 |
| 7 | 文档库可以没有 schema 吗？ | **不可以当许可证。** 约束在应用层；脏数据风险。形态在变才适合文档。 |
| 8 | 宽列 vs 分析列存？ | 宽列：稀疏宽行 + LSM 写重。分析列存：列连续放、OLAP scan（Parquet / 列存 OLAP）。别都叫「列式」。 |
| 9 | 何时上图库？ | **多跳路径**是查询。关注关系一两跳用 join。不要看白板有圆圈就上。 |
| 10 | 对象和元数据怎么拆？ | blob → 对象存储；目录/ACL/版本 → 关系库。**先落字节再 commit。** Ch14/15/22。 |
| 11 | 时序库是通用 DB 吗？ | **不是。** append + 降采样 + 保留。别存订单。 |
| 12 | 向量何时选？pgvector vs 专用？ | 有 ANN/RAG 才选。百万级已在 PG → pgvector。亿级+过滤主路径 → Ch31。精确匹配不要向量。 |
| 13 | B+Tree vs LSM 一句？ | B+Tree：读稳、原地改页。LSM：热路径顺序写。写得快 ≠ 写放大小。 |
| 14 | compaction 税是什么？ | 后台把同一 key 重写多遍（写放大），换更少 SSTable、更低读放大。 |
| 15 | Bloom filter 一句？ | 说「不在」就跳过该 SSTable（无假阴性）；「可能在」才打开文件。 |
| 16 | Dynamo 论文面试一句？ | SOSP 2007，AP KV。hinted handoff 可点名。生产冲突 **LWW**（Ch06），不把向量时钟当默认。 |
| 17 | LSM-tree 论文？ | O'Neil 等 1996 Acta Informatica：高插入、内存+盘 merge、顺序写。SSTable 祖先。 |
| 18 | Bigtable 面试一句？ | OSDI 2006：稀疏多维 map + tablet + memtable/SSTable。宽列谱系，不是数仓。 |
| 19 | Stonebraker One Size？ | ICDE 2005：一种通用引擎打天下过时了 → 按负载拆引擎。选读 punchline。 |
| 20 | Spanner 一句？ | OSDI 2012：TrueTime → **external consistency**。不在本章展开。 |`,
});
