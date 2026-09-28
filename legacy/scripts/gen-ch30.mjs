import { writeChapter } from "./write-chapter.mjs";

const d2 = (src) => {
  const body = src.trim();
  const sized = /style\.font-size/.test(body) ? body : `style.font-size: 12\n${body}`;
  return "```d2\n" + sized + "\n```";
};

writeChapter({
  id: "ch30",
  num: "30",
  title: "设计 RAG 后端",
  kind: "ai",
  relatedChapters: ["ch31", "ch29", "ch38", "ch37"],
  sections: [
    {
      id: "intro",
      heading: "",
      secNum: null,
      related: [],
      body: [
        "> **预计**：50–70 分钟 ｜ **前置**：Ch01 四步法；生成走哪条路见 Ch29；估算数量级（Ch03）会更顺",
        "> **目标**：能在白板上讲清 **检索 + 生成后端**：切分、hybrid 检索、rerank、引用、评测、新鲜度。**不做** 推荐、双塔、精排；不挖向量引擎内部；不把 MCP/Agent 工具讲进来。",
        "",
        "这题现在和短链、Feed 一样常见。面试官说「设计一个 RAG 系统」，不是让你画一个向量库框，也不是让你背 LlamaIndex / LangChain 的 class 名。",
        "",
        "**hard part** 是三块：**切分质量**（召回单元对不对）、**hybrid 检索**（稀疏 BM25 + 稠密向量，不是纯 ANN）、**引用 / 评测 / 新鲜度**（答得像真的不算过关）。画完「embedding → 向量库 → LLM」却讲不清这三块，是 red flag。",
        "",
        "本章边界（后面几章各管一块，这里只点到）：",
        "",
        "- **生成 / PagedAttention / 流式** → 走推理服务，深讲已在 Ch29",
        "- **向量存储引擎（HNSW / IVF / PQ）** → 预告 Ch31；本章当「检索服务」用，不调索引参数",
        "- **多模型路由、语义缓存、计费** → 预告 Ch32",
        "- **MCP / Agent 工具网关** → 预告 Ch33，本章不讲",
        "",
        "编排框架（LlamaIndex / LangChain）是**可选胶水**，不要绑死 SDK，更不要当架构图中心。",
        "",
        "M5 铁律：**只做 LLM + Agent 基建，禁止推荐漏斗。**",
      ].join("\n"),
    },
    {
      id: "sec-pitch",
      heading: "面试怎么答（30 秒）",
      secNum: "30.1",
      related: [],
      body: [
        "开场不要画 20 个框。先把评分信号打出来：你知道这是检索+生成后端、ingest 和 query 分开、hard part 不在「选哪个向量库 logo」。",
        "",
        "> 「RAG 是 **检索 + 生成**。ingest 把文档切成 chunk、embedding、写入 **hybrid 索引**（BM25 + 稠密向量）；query 两条召回融合（RRF），**rerank**（cross-encoder / 晚交互）放在召回之后，再拼 prompt 走推理服务。答案要带 **citation**，用检索指标 + faithfulness 评测。向量怎么存、HNSW 怎么调是下一题；生成怎么 batched 是上一题。」",
        "",
        "四步怎么填：",
        "",
        "| 步 | 这题落在哪 |",
        "|---|---|",
        "| Step 1 澄清 | 文档类型/更新频率、延迟 SLO、要不要引用、多租户、是否允许上网、语言 |",
        "| Step 2 高层 | **ingest 管道** vs **query 路径** 两张图；生成走推理服务；索引当黑盒 |",
        "| Step 3 deep dive | ① 切分 ② hybrid + rerank ③ 引用 / 评测 / 新鲜度 |",
        "| Step 4 wrap-up | 幻觉、删改文档、换 embedding 模型、观测 Recall@k + faithfulness |",
        "",
        "**red flag：** 一上来画推荐漏斗 / 双塔 / 精排；说「纯向量 top-k 就够」；把 LangChain 当架构；展开 PagedAttention 或 HNSW 参数；报某厂内部 QPS。那是跑题。",
        "",
        "向量引擎、LLM 网关、Agent 工具面试里点一句「深讲可以另开」即可。",
      ].join("\n"),
    },
    {
      id: "sec-clarify",
      heading: "澄清问题",
      secNum: "30.2",
      related: [],
      body: [
        "没问清楚就画「embedding + 向量库 + GPT」= Jimmy。大约 6–8 个问题，其余自己假设写白板。",
        "",
        "| 你问 | 为什么问 | 典型假设（面试官说「你定」时） |",
        "|---|---|---|",
        "| 文档是什么？PDF / wiki / 代码 / 表格？ | 切分策略完全不同；表格和代码不能当散文切 | 内部 wiki + PDF 手册，以段落为主 |",
        "| 更新频率？分钟级、日更、还是几乎静态？ | 决定增量索引 vs 夜间全量；删除必须级联 chunk | 日更为主，允许分钟级延迟 |",
        "| 延迟 SLO？交互问答还是离线报告？ | rerank 和生成占大头；交互要盖帽候选集 | 交互：端到端数秒；TTFT 仍走流式 |",
        "| 要不要 **citation**？必须可追溯到原文吗？ | 架构多一列 chunk id；评测多一项引用是否真实 | 要引用；找不到就说不知道 |",
        "| 多租户？索引隔离还是 metadata filter？ | 隔离更安全、更贵；filter 省运维、有漏的风险 | 先按 tenant_id filter；强隔离再分 collection |",
        "| 是否允许上网？闭库还是加搜索？ | 开网等于多一路检索，幻觉和新鲜度模型都变 | **闭库 RAG**，不搜公网 |",
        "| 语言？中英混合、专有名词、货号多不多？ | 专有名词是 BM25 存在的理由；embedding 也要能覆盖语言 | 中英混合，术语多 |",
        "",
        "闭库还是开网，先钉死——后面 hybrid 和评测都围着这个假设转：",
        "",
        d2(`
grid-columns: 2
closedRow: {
  label: "闭库 RAG"
  class: groupOk
  grid-columns: 3
  a.class: ok
  a: "只搜内部库"
  b.class: ok
  b: "引用可追溯"
  c.class: ok
  c: "不许瞎编"
}
openRow: {
  label: "可上网"
  class: group
  grid-columns: 3
  d.class: warn
  d: "多一路搜索"
  e.class: warn
  e: "新鲜度不同"
  f.class: warn
  f: "幻觉更凶"
}
`),
        "",
        "话术：",
        "",
        "> 「我假设闭库企业问答：wiki+PDF、日更、要引用、中英术语多、交互数秒、先单租户 filter。生成走已有推理服务。方向 OK 吗？」",
      ].join("\n"),
    },
    {
      id: "sec-estimate",
      heading: "粗估（不要假装精确）",
      secNum: "30.3",
      related: ["ch37"],
      body: [
        "这题的 back-of-envelope 是让面试官听见：你知道 chunk 数量从哪来、向量体积怎么估、QPS 的 bottleneck 通常不在 embedding。禁止编造某厂 QPS。",
        "",
        "公开假设（写白板，不是内部数）：**10 万篇**文档，篇均 **~2k token** → 语料约 **2 亿 token**。",
        "",
        "### chunk 数",
        "",
        "起步切分：目标块大约 **256–512 token**，相邻 **overlap 约 10%–15%**（512 块大约 overlap 50–80 token）。步长 ≈ 块长 − overlap，于是：",
        "",
        "> 2 亿 token / ~450 token 步长 → **大约几十万 chunk**（数量级 10⁵–10⁶）。父子块（小块检索、大块进 prompt）会再乘一个系数，先按「几十万向量」往下算。",
        "",
        "### embedding 体积",
        "",
        "点到维度即可，不要变成模型课。公开锚点：",
        "",
        "| 例子（公开） | 维度 | 每向量 float32 |",
        "|---|---|---|",
        "| 开源 BGE-base 量级 | 768 | ~3 KB |",
        "| BGE-M3 量级 | 1024 | ~4 KB |",
        "| text-embedding-3-small | 1536 | ~6 KB |",
        "| text-embedding-3-large 默认 | 3072 | ~12 KB |",
        "",
        "五十万条 × 6 KB ≈ **~3 GB** 原始稠密向量。HNSW 图还有一份开销（常见再乘一个小系数），精确算法留给 Ch31。float16 能砍半。面试说「GB 量级、先别怕存储，怕的是召回质量和生成账单」就够。",
        "",
        "稀疏 BM25 倒排是另一份索引，体积通常比稠密向量小一截，但必须算进「hybrid 不是免费的」。",
        "",
        "### QPS 和钱在哪",
        "",
        "自己假设交互 **10–50 QPS**（写清是假设）。每条 query 大致：",
        "",
        "1. **query embedding** 一次（几十到几百 token）——便宜",
        "2. **hybrid 召回**（倒排 + ANN）——毫秒到几十毫秒量级，细节 Ch31",
        "3. **rerank** 几十到一两百对（cross-encoder）——往往比 ANN 贵、比 LLM 便宜",
        "4. **LLM 生成**——通常是延迟和成本的 bottleneck（Ch29）",
        "",
        "ingest 侧 embedding 是一次性（加增量）：2 亿 token 全量，按公开 API 价大约是「美元到几十美元」量级，远小于天天生成的账单。自托管 embedding 换成 GPU 时间。**不要把 embedding 模型课上成这题的主角。**",
        "",
        "pgvector vs 专用向量库一句：**百万级以内、要和业务表同事务，pgvector 常常够用；过了这个量级、要原生 hybrid / 独立扩副本，交给专用引擎——细节 Ch31。**",
        "",
        "话术：",
        "",
        "> 「我按 10 万篇、几十万 chunk、1536 维估，稠密向量 GB 量级。QPS 我假设几十；bottleneck 是生成和 rerank，不是把向量塞进内存。」",
      ].join("\n"),
    },
    {
      id: "sec-arch",
      heading: "高层架构",
      secNum: "30.4",
      related: ["ch37", "ch38", "ch29", "ch31", "ch40"],
      body: [
        "要 buy-in：**ingest 和 query 必须分开画**。禁止一张 20 节点终图把切分、HNSW、GPU、网关、Agent 全塞进去。",
        "",
        "### ingest 管道",
        "",
        d2(`
direction: right
src.class: go
src: "文档源"
chk.class: step
chk: "切分"
emb.class: step
emb: "embedding"
idx.class: store
idx: "hybrid 索引"
ok.class: ok
ok: "可查询"
src -> chk -> emb -> idx -> ok
`),
        "",
        "**本图引用**：存储选型（Ch37）。稀疏倒排 + 稠密向量可以是两个组件，也可以是同一引擎的两路索引；怎么排内存/磁盘是 Ch31。",
        "",
        "各步一句话：",
        "",
        "| 步 | 干什么 | 面试怎么说 |",
        "|---|---|---|",
        "| 文档源 | 对象存储 / wiki 导出 / 同步 | 保留 **doc_id + 版本/hash**，后面删除靠它 |",
        "| 切分 | 按标题/递归切，带 overlap | 召回单元在这里定，错了后面全错 |",
        "| embedding | 块 → 向量；模型名写入 metadata | 换模型 = 换坐标系，不能原地覆盖混搜 |",
        "| hybrid 索引 | 稠密 ANN + BM25 倒排 | 2026 默认两路都建，不是「先向量以后再说」 |",
        "",
        "### query 路径",
        "",
        d2(`
direction: right
app.class: go
app: "用户问题"
rag.class: step
rag: "RAG 后端"
hyb.class: store
hyb: "hybrid 召回"
rr.class: step
rr: "rerank"
inf.class: ok
inf: "推理服务"
app -> rag -> hyb -> rr -> inf
`),
        "",
        "**本图引用**：缓存心智（Ch38）、存储选型（Ch37）。**推理服务**是 Ch29 那条链路（网关 / 队列 / GPU），这里只点「生成走它」。多模型路由、语义缓存留给 Ch32。",
        "",
        "query 时序（rerank 在召回之后，不要画成和 ANN 并行打全库）：",
        "",
        d2(`
shape: sequence_diagram
cli: "client"
rag: "RAG"
idx: "index"
inf: "infer"
cli -> rag: "提问"
rag -> idx: "BM25+向量"
idx -> rag: "融合 top-n"
rag -> inf: "rerank 后拼"
inf -> rag: "SSE token"
rag -> cli: "答案+引用"
`),
        "",
        "**本图引用**：协议选型 / SSE（Ch40，生成流式）；无状态的是 RAG 编排层，索引和 GPU worker 都有状态。",
        "",
        "Step 2 可以主动列 endpoint（加分，不必写 schema）：",
        "",
        "- `POST /v1/rag/query`（问题、tenant、要不要引用）",
        "- `POST /v1/rag/ingest`（文档 upsert；内部异步）",
        "- `POST /v1/rag/delete`（按 doc_id 级联删 chunk）",
        "- 可选 `GET /metrics`（Recall 抽样、faithfulness、ingest lag）",
        "",
        "话术：",
        "",
        "> 「ingest 是切分 + 两路索引；query 是 hybrid 召回 → rerank → 拼 prompt → 推理服务流式回，并带 citation。向量引擎当检索服务调，不在这张图里调 HNSW。方向 OK 的话我挖切分和 hybrid。」",
      ].join("\n"),
    },
    {
      id: "sec-chunk",
      heading: "Deep dive ①：切分",
      secNum: "30.5",
      related: ["ch37"],
      body: [
        "切分决定「检索的原子是什么」。块切错了，后面 hybrid、rerank、引用全是在给错段落擦粉。这是这题真正的 hard part 之一。",
        "",
        "### 2026 起步，不是玄学默认",
        "",
        "公开工程共识（LlamaIndex / 各家 RAG 指南，当实践不是当 SDK）：",
        "",
        "- **先按结构切**：标题、小节、列表；PDF 尽量保留页码和 heading",
        "- 结构不够用再 **递归字符切**（段落 → 句 → 词），目标块 **256–512 token**",
        "- **overlap 10%–15%**，降低「答案卡在边界上」",
        "- 固定 token 一刀切、从句子中间断开，是常见 red flag——BM25 的词频和稠密向量的语义都会伤",
        "",
        d2(`
grid-columns: 2
badRow: {
  label: "red flag"
  class: groupBad
  grid-columns: 3
  a.class: bad
  a: "固定切断句"
  b.class: bad
  b: "块过大灌水"
  c.class: bad
  c: "无 overlap"
}
okRow: {
  label: "起步默认"
  class: groupOk
  grid-columns: 3
  d.class: ok
  d: "按标题切"
  e.class: ok
  e: "256-512 token"
  f.class: ok
  f: "overlap 10-15%"
}
`),
        "",
        "语义切分（embedding 找边界）可以抬稠密召回，但块大小不稳定，BM25 有时更难受。面试默认：**结构切 + 递归** 当第一答案；语义切当分领域实验，不要一上来 over-engineering。",
        "",
        "### 块太小 vs 太大",
        "",
        "| | 太小 | 太大 |",
        "|---|---|---|",
        "| 检索 | 精度高、上下文残缺 | 语义含糊、BM25 被灌水 |",
        "| 生成 | prompt 要拼很多块才够 | 窗口被无关句子占满 |",
        "| 引用 | 定位准 | 用户难核对「哪一句」 |",
        "",
        "**父子块 / small-to-big**（公开模式）：索引和小块检索（例如 ~256 token），命中后把 **parent**（整节 / ~1k–2k token）送进 prompt。检索精度和生成上下文解耦。实现要多维护一层 parent_id，ingest 更烦——规模小可以先不做。",
        "",
        "代码、表格、API 文档：**不要当散文切**。函数/表尽量整块；实在太长再按符号切，并在 metadata 里留下路径、标题、页码。",
        "",
        "每个 chunk 至少带：`doc_id`、`chunk_id`、`source`（路径或 URL）、`heading`、`version/hash`、`embedding_model`。引用和删除都靠这些字段，不是靠「向量长得像」。",
        "",
        "面试怎么说：",
        "",
        "> 「我先按标题切到 256–512 token，带 10%–15% overlap。切分是召回质量的上限。向量库再快，块切错了也救不回来。」",
      ].join("\n"),
    },
    {
      id: "sec-hybrid",
      heading: "Deep dive ②：hybrid 检索 + rerank",
      secNum: "30.6",
      related: ["ch31", "ch38"],
      body: [
        "2026 默认话术：**稀疏 BM25 + 稠密向量，召回后再 rerank。** 「纯向量 top-k 拼 prompt」可以当折叠里的旧答案，不能当第一张图。",
        "",
        "### 为什么纯向量不够",
        "",
        "稠密向量擅长改写、同义、跨语言「意思靠近」。它经常打不过：",
        "",
        "- **专有名词、货号、错误码、人名**——用户就打那几个字",
        "- **精确短语 / 引号查询**",
        "- **新词、内部缩写**——embedding 训练集里可能没有",
        "",
        "BM25（倒排 + 词频）吃的就是这些。两路互补，不是「向量时代倒排过时了」。",
        "",
        "### 融合：不要把分数加起来",
        "",
        "BM25 无界正分，余弦在 [-1, 1]。直接加权平均是 red flag。公开默认是 **RRF（Reciprocal Rank Fusion）**：只看排名，经典常数 **k = 60** 当起点，再用自己的 query 集调。",
        "",
        "两路并行召回（例如各取 50–100），RRF 合成一条短名单（常见再取 **50–200**），交给下一阶段。",
        "",
        d2(`
direction: right
q.class: go
q: "query"
hyb.class: step
hyb: "BM25+稠密"
rrf.class: step
rrf: "RRF 融合"
rr.class: ok
rr: "rerank"
ctx.class: store
ctx: "top-k 进 prompt"
q -> hyb -> rrf -> rr -> ctx
`),
        "",
        "**本图引用**：向量引擎怎么做 ANN / 过滤（Ch31）；query embedding 可缓存（Ch38），和「缓存整段答案」不是一回事（后者预告 Ch32）。",
        "",
        "### rerank 放在召回之后",
        "",
        "**cross-encoder**（query 和 chunk 一起进模型）或 **晚交互**（ColBERT 一类 token 级 MaxSim）：比 bi-encoder 更准，也更贵。所以：",
        "",
        "- **不要**对全库跑 cross-encoder",
        "- 只对融合后的几十到两百个候选打分",
        "- 最后 **3–8 块**进 prompt（看窗口和延迟 SLO）",
        "",
        "交互 SLO 紧：缩小候选、换更小 reranker、或先不上 rerank——用评测说话，不要口头承诺「一定 200 个再精排」。这不是推荐系统的粗排/精排漏斗，不要借用那套词。",
        "",
        "| 阶段 | 干什么 | 典型规模 |",
        "|---|---|---|",
        "| 召回 | BM25 ∥ 稠密 ANN | 各几十到一百 |",
        "| 融合 | RRF | 合成 50–200 |",
        "| rerank | cross-encoder / 晚交互 | 出 3–8 |",
        "| 生成 | 推理服务 | 1 次 LLM |",
        "",
        "metadata filter（tenant、时间、产品线）尽量 **在召回时就带上**，不要召回后再手工丢——否则 hybrid 的 top-n 会被别的租户污染。引擎侧怎么做 pre-filter，Ch31。",
        "",
        "面试怎么说：",
        "",
        "> 「纯向量会在货号和专有名词上翻车。默认 BM25 + 稠密、RRF 融合，再对短名单 rerank。rerank 是精度层，不是第二套全库扫描。」",
      ].join("\n"),
    },
    {
      id: "sec-cite",
      heading: "Deep dive ③：引用、评测、新鲜度",
      secNum: "30.7",
      related: ["ch37", "ch41", "ch38"],
      body: [
        "生成「听起来对」在这题不够。面试官会追：引用是不是真的、怎么知道改切分有用、文档删了为什么还能搜到。",
        "",
        "### 引用（citation）和幻觉",
        "",
        "做法要工程化，不要只在 system prompt 里写「请注明来源」：",
        "",
        "1. 送进模型的每块带稳定 **chunk_id / source**（方括号编号即可）",
        "2. 要求模型只引用这些编号；**答案里的 id 必须能在本轮 retrieved set 里找到**",
        "3. 找不到依据就明确说不知道——闭库 RAG 的产品约定，不是礼貌",
        "4. 后处理丢掉「编造的编号」；引用要点回原文片段，方便人点开",
        "",
        "**幻觉**在这题主要是：陈述无法被 retrieved context entail（不忠实），或引用了根本没召回的文档。有引用 ≠ 忠实；模型很会「写一个看起来像脚注的东西」。",
        "",
        "### 评测：检索一层 + 生成一层",
        "",
        "公开框架 **RAGAS**（及同类）点到即可，不要背公式。白板分两列：",
        "",
        "| 层 | 看什么 | 面试用哪一句 |",
        "|---|---|---|",
        "| 检索 | Recall@k / MRR / nDCG | 相关段落有没有进短名单 |",
        "| 生成 | **faithfulness**（忠实）、答案相关性 | 句子能否被 context 支持 |",
        "| 引用 | citation 是否落在 retrieved set | 编号不是编的 |",
        "",
        "RAGAS 的 faithfulness 和人标更齐；**context 相关性更噪**。所以改切分/hybrid 时，先看检索指标，再看 faithfulness——不要只看一个「RAG 总分」自我感觉良好。最终仍要一小份 **golden query**（人标相关段落 + 可接受答案）。",
        "",
        "延迟和成本也要进评测：rerank 候选 ×2，faithfulness 可能不动，p95 已经破 SLO。这是 trade-off，不是分越高越好。",
        "",
        "### 新鲜度：增量、删除、换模型",
        "",
        d2(`
direction: right
chg.class: go
chg: "文档变更"
hash.class: step
hash: "hash 比对"
re.class: step
re: "重切重嵌"
sw.class: ok
sw: "按 doc 替换"
chg -> hash -> re -> sw
`),
        "",
        "**本图引用**：存储与版本（Ch37）；变更传播像 CDC / 增量同步（Ch41）。别做成「每晚 drop index 全量重建」当唯一方案。",
        "",
        "| 事件 | 正确做法 | 翻车 |",
        "|---|---|---|",
        "| 文档改了 | 按 **content hash** 跳过未变；变了则删旧 chunk 再写新块 | 只 insert 不 delete → 新旧段落一起被召回 |",
        "| 文档删了 | 按 **doc_id 级联删除** 所有 chunk | 向量还在，引用一篇幽灵文档 |",
        "| 日更/小时更 | 增量索引 + 定期全量对账（抓漏删） | 只信增量、从不对账 |",
        "| **换 embedding 模型** | 新空间、双写、回填、校验 Recall、**原子切流** | 两套向量混在一个 ANN 里搜 |",
        "",
        "换模型 = **换坐标系**。query 用新模型、库里还是旧向量，余弦没有原来的意义。把它当成 schema migration：新 collection / 新 named vector，query **只打一个版本**。回填期间旧查询仍走旧索引。",
        "",
        "观测：ingest lag（源更新到可搜到的时间）、删除是否真正 0 命中、换模型前后 golden set 的 Recall@k。",
        "",
        "面试怎么说：",
        "",
        "> 「引用要校验 id 在本轮检索集合里。评测拆成检索 + faithfulness。更新按 hash 增量，删除按 doc_id 级联。换 embedding 当迁移，不当 overwrite。」",
      ].join("\n"),
    },
    {
      id: "sec-2026",
      heading: "2026 vs 原书",
      secNum: null,
      related: [],
      body: [
        "<details>",
        "<summary>笔记极简清单 / 纯向量 top-k —— 现在默认怎么答</summary>",
        "",
        "Alex Xu 那一代书 **没有 RAG 专章**。笔记 `ch1_16` 只有一张「query → embedding → 向量库 → 拼 prompt → LLM」和一行「hybrid 是主流」。那是清单，**不能当 2026 正文**。",
        "",
        "| 当时 / 早期工程 | 现在上场 |",
        "|---|---|",
        "| 纯向量 ANN top-k 直接拼 prompt | **BM25 + 稠密** 并行，**RRF** 融合 |",
        "| rerank「可选、有空再做」 | 召回后的 **cross-encoder / 晚交互** 是默认精度层（受 SLO 约束） |",
        "| 固定 512 token 一刀切 | **按标题/递归**，256–512 + overlap；父子块是加分项 |",
        "| 向量库框 = 架构 | ingest vs query 两张图；引擎细节留给 Ch31 |",
        "| 相信模型自己写的来源 | **citation 校验** + 「不知道」 |",
        "| 不评测或只看「好不好用」 | Recall@k **和** faithfulness；golden set |",
        "| 全量重建 / 只 insert | hash 增量、级联删除、换模型当 migration |",
        "| 把 LangChain 图画成生产 | 编排可选；服务边界仍是 ingest / retrieve / generate |",
        "",
        "正文第一答案用现在这套。折叠只防止你把笔记那张极简图讲成终稿。",
        "",
        "</details>",
      ].join("\n"),
    },
    {
      id: "sec-traps",
      heading: "追问陷阱",
      secNum: null,
      related: ["ch31", "ch29", "ch37"],
      body: [
        "1. **为什么不能纯向量？** → 货号、专有名词、精确短语；BM25 补稀疏信号。hybrid 是默认，不是进阶彩蛋。",
        "2. **chunk 越大越好吗？** → 否。太大灌水、引用变糊；太小缺上下文。用结构切 + overlap；父子块是解耦手段。",
        "3. **rerank 为什么不打全库？** → cross-encoder 太贵。先召回再短名单，这是延迟/成本 trade-off，不是推荐精排。",
        "4. **分数怎么融合？** → 不要把 BM25 和余弦加权加。用 RRF（或引擎提供的 rank fusion）。",
        "5. **换 embedding 能直接 overwrite 吗？** → 不能。坐标系变了；双写、回填、按版本切流。",
        "6. **删了文档还能搜到？** → chunk 没按 doc_id 级联删。ingest 必须能 delete，不能只有 upsert。",
        "7. **有引用就不会幻觉？** → 否。要校验编号落在 retrieved set，并看 faithfulness。",
        "8. **pgvector 还是专用库？** → 百万级 + 要跟行数据同事务 → pgvector 常够；更大、要独立扩 hybrid → 专用引擎（Ch31）。",
        "9. **生成延迟怎么办？** → 走推理服务（Ch29）流式；RAG 这层盖帽 rerank 候选和进 prompt 的块数。",
        "10. **要不要上 Agent / MCP？** → 本题是检索+生成后端。工具网关是 Ch33，别把题做飘。",
      ].join("\n"),
    },
    {
      id: "sec-next",
      heading: "下一步",
      secNum: null,
      related: ["ch31", "ch29", "ch38"],
      body: [
        "合上页，用 30 秒口播 + 两张图（ingest / query）走一遍。能讲清 **切分为什么是上限、为什么 hybrid、引用和换模型怎么做**，这题就过关。",
        "",
        "下一题预告：**向量检索服务**（HNSW / IVF / PQ、过滤、复制）。本章把它当检索后端调；下一章才打开盒子。生成路径已经在 Ch29。",
        "",
        "自测：白板左列假设（语料、SLO、要引用、闭库），中列两条管道，右列三个 deep dive 的 trade-off。",
      ].join("\n"),
    },
  ],
  reviewMd: `# Ch30 · 记忆闪卡

| # | 正面 | 背面 |
|---|---|---|
| 1 | 设计 RAG 后端，30 秒怎么开口？ | 检索+生成，不是向量库框。ingest 与 query 分开；hybrid（BM25+稠密）+ 召回后 rerank；答案带 citation。生成走推理服务。 |
| 2 | 这题 hard part 是什么？ | 切分质量、hybrid 检索、引用/评测/新鲜度。不是画推荐漏斗，也不是调 HNSW。 |
| 3 | 该澄清哪几件事？ | 文档类型与更新频率、延迟 SLO、要不要引用、多租户、是否允许上网、语言。 |
| 4 | 粗估怎么开口？ | 文档量→chunk 数；维×4B 估向量 GB 量级；QPS 自设。bottleneck 常是生成和 rerank。 |
| 5 | 切分 2026 起步？ | 按标题/递归，256–512 token，overlap 约 10%–15%。避免固定切断句。 |
| 6 | 为什么要 overlap / 父子块？ | overlap 防答案落在边界。父子：小块检索、大块进 prompt，精度和上下文解耦。 |
| 7 | 为什么必须 hybrid？ | 稠密吃语义；BM25 吃货号、专有名词、精确词。纯向量 top-k 不是 2026 默认。 |
| 8 | RRF 解决什么？ | BM25 与余弦分数不可比。按排名融合；k=60 当起点。 |
| 9 | rerank 放哪？ | 召回+融合之后的短名单（约 50–200），cross-encoder 或晚交互，再留 3–8 块进 prompt。 |
| 10 | 引用怎么做才不算摆设？ | chunk 带稳定 id；模型只能引本轮 retrieved set；编造编号丢掉；没依据就说不知道。 |
| 11 | 评测看哪两层？ | 检索：Recall@k / MRR / nDCG。生成：faithfulness（RAGAS 等）+ 引用是否真实。 |
| 12 | 文档更新/删除怎么做？ | hash 增量；变则删旧 chunk 再写。删除按 doc_id 级联。定期全量对账。 |
| 13 | 换 embedding 模型？ | 新坐标系：双写、回填、校验、原子切流。禁止两套向量混搜。 |
| 14 | pgvector vs 专用库？ | 百万级内、要跟行数据同事务 → pgvector。更大/要独立扩 hybrid → 专用引擎（Ch31）。 |
| 15 | 和 Ch29 / Ch31 边界？ | 生成与 KV 在 Ch29；HNSW/IVF/PQ 在 Ch31。本章是检索+拼 prompt+引用。 |`,
});
