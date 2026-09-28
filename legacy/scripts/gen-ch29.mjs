import { writeChapter } from "./write-chapter.mjs";

const d2 = (src) => {
  const body = src.trim();
  const sized = /style\.font-size/.test(body) ? body : `style.font-size: 12\n${body}`;
  return "```d2\n" + sized + "\n```";
};

writeChapter({
  id: "ch29",
  num: "29",
  title: "LLM 推理服务",
  kind: "ai",
  relatedChapters: ["ch38", "ch39", "ch40", "ch42"],
  sections: [
    {
      id: "intro",
      heading: "",
      secNum: null,
      related: [],
      body: [
        "> **预计**：50–70 分钟 ｜ **前置**：Ch01 四步法；估算数量级（Ch03）会更顺",
        "> **目标**：能在白板上讲清 **单次推理路径 + GPU 服务**：显存、调度、流式、扩缩容。**不做** RAG、向量库、推荐、训练平台。",
        "",
        "这题现在很常见。面试官说「设计一个 LLM 推理服务」，不是让你背模型结构，也不是让你开一张云厂商 GPU 报价单。",
        "",
        "**hard part** 是：GPU 又贵又有状态（KV cache 长在卡上）；请求长短不一；交互要快、集群要饱。优化几乎全围着 **显存** 和 **吞吐**。",
        "",
        "本章边界（后面几章各管一块，这里只点到）：",
        "",
        "- **RAG / 切分 / 引用** → 预告 Ch30，不当本章主角",
        "- **向量引擎** → 预告 Ch31",
        "- **多模型路由、语义缓存、计费** → 网关深讲预告 Ch32；本章网关只留鉴权 / 限流 / 入队",
        "- **模型仓库、训练、多租户平台** → 预告 Ch35",
        "",
        "M5 铁律：**只做 LLM + Agent 基建，禁止推荐漏斗。**",
      ].join("\n"),
    },
    {
      id: "sec-pitch",
      heading: "面试怎么答（30 秒）",
      secNum: "29.1",
      related: [],
      body: [
        "开场不要画 20 个框。先把评分信号打出来：你知道钱在哪、优化围着什么、引擎和前面的队列各干什么。",
        "",
        "> 「最贵的是 **GPU**。所有优化围着 **显存** 和 **吞吐**。引擎层用 **PagedAttention** 管 KV cache、用 **continuous batching** 动态凑批；前面是队列 + 限流——**token bucket 按 token 计**，不要按请求个数。对用户走 **流式**，把 **TTFT** 体感压下来。SLO 要拆成 TTFT 和 TPS，别只报一个 QPS。」",
        "",
        "四步怎么填：",
        "",
        "| 步 | 这题落在哪 |",
        "|---|---|",
        "| Step 1 澄清 | 自建模型还是调 API、TTFT vs 总时长、上下文、是否多模型 / 多 LoRA、流式否、QPS 还是并发会话 |",
        "| Step 2 高层 | client → 网关 → 调度/队列 → GPU worker（推理引擎）→ 流式回；权重在对象存储，加载后常驻显存 |",
        "| Step 3 deep dive | ① KV cache + PagedAttention ② continuous batching ③ prefill/decode 分离 + 扩缩容 |",
        "| Step 4 wrap-up | 显存 OOM、排队、引擎挂了 failover、观测 TTFT/TPS/队列深度 |",
        "",
        "**red flag：** 一上来讲 RAG 召回、画推荐漏斗、报某厂内部 QPS、或把 K8s YAML 当架构。那是跑题。",
        "",
        "网关细节（多模型路由、语义缓存、降级）面试里点一句「前面有一层路由/计费，深讲可以另开」即可——完整 LLM 网关是后续章。",
      ].join("\n"),
    },
    {
      id: "sec-clarify",
      heading: "澄清问题",
      secNum: "29.2",
      related: [],
      body: [
        "没问清楚就画 vLLM 集群 = Jimmy。大约 5–7 个问题，其余自己假设写白板。",
        "",
        "| 你问 | 为什么问 | 典型假设（面试官说「你定」时） |",
        "|---|---|---|",
        "| 开源模型自托管，还是调外部 API？ | 自托管才有 GPU 池 / KV；API 题变成网关+配额 | 自托管，类 Llama 量级 |",
        "| 延迟 SLO 是 **TTFT** 还是整段生成时长？ | 交互 vs 离线摘要，架构会分叉 | 聊天：TTFT 要短；允许总时长数秒 |",
        "| 上下文多长？输入/输出各多少 token？ | KV cache 随长度涨；prefill 成本也涨 | 输入 2k–8k，输出几百 |",
        "| 几个模型？要不要多 LoRA？ | 显存布局、是否路由到不同 worker | 先单模型；多 LoRA 点到即可 |",
        "| 要不要流式？ | 决定 SSE / 短连接一次性 JSON | 要流式，聊天默认 |",
        "| 规模用 **QPS** 还是 **并发会话**？ | 一个会话可能占十几秒 GPU；QPS 会骗人 | 给并发会话 + 目标 TPS |",
        "",
        "两个延迟数字不要混：",
        "",
        d2(`
grid-rows: 2
ttftRow: {
  label: "TTFT 体感"
  class: group
  grid-columns: 3
  a.class: go
  a: "prefill 主导"
  b.class: go
  b: "交互要短"
  c.class: go
  c: "流式先出字"
}
tpsRow: {
  label: "TPS 吞吐"
  class: group
  grid-columns: 3
  d.class: step
  d: "decode 主导"
  e.class: step
  e: "批越大越饱"
  f.class: step
  f: "和延迟打架"
}
`),
        "",
        "**TTFT**（time to first token）= 用户等到第一个字。几乎由 **prefill**（整段 prompt 一次前向、写出 KV）决定。**TPS**（tokens per second）有两层：单用户看到的出字速度（和 TPOT / ITL 互为倒数），以及集群总吞吐（成本）。面试开口：**交互看 TTFT；产能看 TPS；二者 trade-off，没有同时最优的一个旋钮。**",
        "",
        "话术：",
        "",
        "> 「我假设自托管聊天：流式、TTFT 优先、上下文中等、先单模型。规模用并发会话而不是裸 QPS。方向 OK 吗？」",
      ].join("\n"),
    },
    {
      id: "sec-estimate",
      heading: "粗估（不要假装精确）",
      secNum: "29.3",
      related: [],
      body: [
        "这题的 back-of-envelope **不是精确到字节**。面试官听的是：你知道显存两块账、知道 KV 会随并发和上下文涨、知道限流单位是 token。",
        "",
        "### 权重显存",
        "",
        "数量级（公开、可心算）：参数量 × 每参数字节。",
        "",
        "| 精度 | 每参数 | 7B 权重大概 | 70B 权重大概 |",
        "|---|---|---|---|",
        "| FP16 / BF16 | ~2 B | ~14 GB | ~140 GB（要多卡） |",
        "| FP8 | ~1 B | ~7 GB | ~70 GB |",
        "| AWQ 等 INT4 权重量化 | ~0.5 B 量级 | 再砍一截 | 仍要给 KV 留空间 |",
        "",
        "量化（**AWQ** / **FP8**）面试点到即可：省的是**权重**；KV cache 仍可能是 FP16/FP8，长上下文时它才是大头。不要把量化讲成「模型变小就不会 OOM」。",
        "",
        "### KV cache 才是并发的天花板",
        "",
        "decode 时每个新 token 都要读历史 K/V。不缓存就要对着整段序列重复算 attention——所以必须 cache。它随 **层数 × KV 头 × 头维 × 序列长度 × 精度 × 并发** 涨。",
        "",
        "公开锚点（vLLM 2023 博客，不是某厂内部数）：LLaMA-13B **单条序列**的 KV 可以到 **~1.7 GB** 量级；现有系统若按最大长度连续预留，碎片 + 超订会浪费 **60%–80%** 显存。所以「卡还没满算力，已经 OOM」很常见。",
        "",
        "白板怎么说：",
        "",
        "> 「权重是固定租；KV 是变动租。上下文变长、batch 变大，KV 线性涨。我不敢报精确 GB，但并发上限先看 KV 能不能放下，再看算力。」",
        "",
        "### 流量不要用裸 QPS",
        "",
        "一次请求可能 prefill 几千 token、再 decode 几百 token、占着 GPU 好几秒。更有用的是：",
        "",
        "- **并发会话数**（同时占着 KV 的请求）",
        "- **输入 token/s**（prefill 压力）和 **输出 token/s**（decode 压力）",
        "- 限流：**token bucket 按 token/分钟**（可再拆 input/output），不要按「每秒几个 HTTP」",
        "",
        "禁止编造「某厂 10 万 QPS」。给假设、写白板、说数量级就够。",
      ].join("\n"),
    },
    {
      id: "sec-arch",
      heading: "高层架构",
      secNum: "29.4",
      related: ["ch39", "ch40", "ch42"],
      body: [
        "先画链路，要 buy-in 再挖引擎。网关这里只留「鉴权、按 token 限流、选一个模型池」；路由/计费/语义缓存的深讲留给 LLM 网关专章。",
        "",
        d2(`
direction: right
app.class: go
app: "Chat / SDK"
gw.class: step
gw: "网关限流"
q.class: ok
q: "调度队列"
eng.class: ok
eng: "GPU xN"
wt.class: store
wt: "权重"
app -> gw -> q -> eng
wt -> eng
`),
        "",
        "**本图引用**：负载均衡与无状态（Ch39）、协议选型 / SSE（Ch40）、弹性与队列（Ch42）。权重仓库与集群调度是平台问题，预告 Ch35。",
        "",
        "各层一句话：",
        "",
        "| 层 | 干什么 | 面试怎么说 |",
        "|---|---|---|",
        "| client | 发 prompt，收 token 流 | 聊天默认 `stream=true` |",
        "| gateway | 鉴权、token 限流、选池、超时 | 无状态水平扩；**不要**在这层存 KV |",
        "| 调度 / 队列 | 有空位才进引擎；过载排队或拒 | GPU 加载模型很慢，不能当无状态 web 那样秒扩 |",
        "| GPU worker | 推理引擎：PagedAttention + continuous batching | 有状态：KV 在卡上 |",
        "| 存储 | 权重在对象存储，启动时 load 进显存 | 热路径不读盘 |",
        "",
        "Step 2 可以主动列 3 个 endpoint（加分，不必写 schema）：",
        "",
        "- `POST /v1/chat/completions`（OpenAI 兼容是 2026 默认话术）",
        "- `GET /health`（引擎是否还能接请求）",
        "- 可选 `GET /metrics`（TTFT、TPS、队列深度、KV 占用）",
        "",
        "### 为什么要流式",
        "",
        "用户不等整段生成完。第一个 token 出来，体感就从「卡住」变成「在写」。**TTFT 被流式放大成产品体验**；总时长可以仍是数秒。",
        "",
        "协议：**SSE** 适合服务端单向推 token；需要双向（后面 Agent 工具打断）再上 **WebSocket**。怎么选协议、怎么重连，深读在 Ch40——本章只要说清 **为何要流**。",
        "",
        d2(`
shape: sequence_diagram
cli: "client"
gw: "gateway"
eng: "engine"
gpu: "GPU worker"
cli -> gw: "发 prompt"
gw -> eng: "鉴权入队"
eng -> gpu: "prefill"
gpu -> eng: "首 token"
eng -> gw: "SSE 推送"
gw -> cli: "先看见字"
eng -> gpu: "decode 一步"
gpu -> eng: "下一 token"
`),
        "",
        "**本图引用**：协议选型（Ch40）。gateway 无状态、engine 有状态——failover 别按普通无状态服务想（Ch39 / Ch42）。",
        "",
        "话术：",
        "",
        "> 「client 到网关无状态；网关按 token 限流后丢进队列；GPU worker 跑引擎并 SSE 往回推。权重从对象存储加载一次。KV 只活在 worker 上，所以扩缩容和 failover 都慢、都痛。方向 OK 的话我挖显存和凑批。」",
      ].join("\n"),
    },
    {
      id: "sec-kv",
      heading: "Deep dive ①：KV cache 与 PagedAttention",
      secNum: "29.5",
      related: ["ch38"],
      body: [
        "这是这题最该挖透的机制。面试官问「为什么会 OOM / 为什么换引擎吞吐翻倍」，答案几乎都在这。",
        "",
        "### 为什么必须有 KV cache",
        "",
        "自回归 decode：**每次只新算 1 个 token**，但 attention 要用到前面所有 token 的 K/V。把已算过的 K/V 留在显存，decode 才从「对全序列平方级重算」变成「读 cache + 算当前步」。",
        "",
        "代价：显存随序列变长。上下文从 4k 到 32k，**同一并发**下 KV 可以差一个数量级。这就是「上下文变长显存怎么涨」的直接答案——近似线性（attention 计算还有另一套复杂度，面试先抓显存线性账）。",
        "",
        "### 连续预留为什么碎",
        "",
        "早期做法：按 **max sequence length** 给每条请求预留一整块连续 KV。实际输出长短差极大，于是：",
        "",
        "- **内部碎片**：预留了 4k，只用了 200",
        "- **外部碎片**：空闲总量够，却找不到连续大块",
        "",
        "vLLM 公开结论：这种浪费可以到 **60%–80%**。算力还闲着，显存先爆，batch 上不去，吞吐就上不去。",
        "",
        "### PagedAttention 在干什么",
        "",
        "公开来源：Kwon et al.，SOSP 2023；vLLM 博客把 KV 比作 OS 虚拟内存。",
        "",
        "- 把每条序列的 KV **切成固定大小的 page / block**（一页装固定个 token 的 K/V）",
        "- 逻辑连续、物理可以不连续；靠 **block table** 映射（和进程页表同一心智）",
        "- **按需分配**：decode 多一步，再要一页；结束立刻还回空闲池",
        "- 浪费主要发生在 **最后一页没填满**——博客写实际浪费可到 **4% 以下**",
        "- 同一 prompt 的前缀、并行采样，可以 **共享物理页**（写时复制）",
        "",
        d2(`
direction: right
prompt.class: go
prompt: "prompt 进来"
page.class: step
page: "KV 按页切"
table.class: step
table: "填 block table"
decode.class: ok
decode: "decode 再要一页"
done.class: store
done: "结束归还页"
prompt -> page -> table -> decode -> done
`),
        "",
        "**本图引用**：缓存心智（Ch38）。KV 是 GPU 上的工作集，不是 Redis 旁路缓存；但「预留过大 / 碎片 / 共享前缀」和缓存是同一类直觉。",
        "",
        "面试怎么说：",
        "",
        "> 「PagedAttention 不是新的 Transformer，是 KV 的分页分配。连续预留会把显存碎片化，batch 上不去。分页之后才能把 continuous batching 的『随时进出』撑住。」",
        "",
        "### 前缀缓存（prefix caching）",
        "",
        "vLLM 的 Automatic Prefix Caching：对新请求，若 token 前缀和已算过的块哈希一致，**跳过那段 prefill**，直接复用 KV 页。系统提示词、多轮对话历史、同一文档反复问，这是 TTFT 的免费午餐。",
        "",
        "失效（追问高频）：",
        "",
        "1. **前缀字节变了**——系统提示改一个空格，哈希对不上，整段重算",
        "2. **页被挤出去**——显存紧时 LRU/策略驱逐，命中变 miss",
        "3. **模型或 LoRA 换了**——权重不同，旧 KV 不能用",
        "4. 它只加速 **prefill**，不缩短 decode 逐步出字（官方文档写明了这条 limit）",
        "",
        "前缀缓存和「语义缓存（缓存整段答案）」不是一回事。后者在网关层，预告 Ch32。",
      ].join("\n"),
    },
    {
      id: "sec-batch",
      heading: "Deep dive ②：continuous batching vs 静态批",
      secNum: "29.6",
      related: [],
      body: [
        "GPU 要靠 **batch** 才饱。但 LLM 的输出长度是随机变量：有人 20 个 token 结束，有人 2000。",
        "",
        d2(`
grid-rows: 2
staticRow: {
  label: "static batch"
  class: groupBad
  grid-columns: 3
  a.class: bad
  a: "等齐再开跑"
  b.class: bad
  b: "短的在空转"
  c.class: bad
  c: "吞吐被尾巴拖"
}
contRow: {
  label: "continuous"
  class: groupOk
  grid-columns: 3
  d.class: ok
  d: "逐步重排批"
  e.class: ok
  e: "结束立刻让位"
  f.class: ok
  f: "GPU 更饱和"
}
`),
        "",
        "**静态批（static / request-level batching）**：凑满 N 条，一起跑到最慢那条结束。短请求陪着长请求空转，p50/p99 都被尾巴拖死。早期服务和「固定 batch 的离线推理」就是这样。",
        "",
        "**continuous batching**（也称 iteration-level / in-flight batching）：公开源头是 Orca（OSDI 2022）；vLLM 把它做成默认调度。每一 **decode 步** 结束，调度器重看队列：",
        "",
        "- 刚 EOS 的序列立刻退出，KV 页归还",
        "- waiting 里的新请求可以马上占住空位（先 prefill，再加入 decode 批）",
        "- 批的组成每步都变，不用右 padding 等到齐",
        "",
        "Anyscale 对 continuous batching 的公开综述、vLLM 相对 HF Transformers / TGI 的吞吐数字（博客写过相对 HF 可到数十倍量级，相对当时 TGI 数倍）——面试用「数量级提升、别背某一天的图表」。",
        "",
        "和 PagedAttention 是一对：凑批在变，长度在变，连续大块分配会碎成灾难；分页让「进进出出」便宜。vLLM 的贡献是两者一起落地，而不只是论文里的 paging。",
        "",
        "| | static | continuous |",
        "|---|---|---|",
        "| 调度粒度 | 整请求 | 每个 token 步 |",
        "| GPU 空转 | 被最长序列绑住 | 空位立刻填 |",
        "| 对显存分配 | 预留大块更难 | 必须能碎片化分配 |",
        "| 延迟 | 排队等齐 + 陪跑 | 排队变成「等一步算力」 |",
        "",
        "**批越大是否总更好？** 不是。批大 → 算力利用率高、集群 TPS 高；但每步更慢，**单用户 TPS / TPOT 变差**，TTFT 也可能因为 prefill 挤在一起而变差。正确说法：在 SLO 下把批开到显存与延迟还能接受的最大。这是 trade-off，不是越大越高分。",
        "",
        "chunked prefill（把长 prompt 切段、和 decode 交错）是 **同卡 colocate** 时的缓解，避免一条超长 prefill 冻住所有 decode。它不是 P/D 分离，但面试可以当一句过渡。",
      ].join("\n"),
    },
    {
      id: "sec-pd",
      heading: "Deep dive ③：prefill/decode 分离与扩缩容",
      secNum: "29.7",
      related: ["ch42", "ch40"],
      body: [
        "### 两阶段为什么打架",
        "",
        "| 阶段 | 工作 | 硬件脾气 | 对应 SLO |",
        "|---|---|---|---|",
        "| **prefill** | 一次吃完整 prompt，写出 KV | 偏 **compute-bound** | **TTFT** |",
        "| **decode** | 逐步出一个 token，反复读权重+KV | 偏 **memory-bound** | **TPS / TPOT** |",
        "",
        "放在同一张 GPU 上（colocate + continuous batching）时：新来的大 prefill 要么打断正在 decode 的人，要么和 decode 挤在一个 iteration 里——公开系统论文把这叫 **prefill–decode interference**。你只能优先 TTFT 或优先 TPOT，或靠超配 GPU 两个都救。",
        "",
        "### 分离（disaggregation）是什么",
        "",
        "把 **prefill 池** 和 **decode 池** 拆开：prefill worker 算完 KV，经高速互连 **搬到** decode worker，再流式出 token。两池可以不同并行度、不同卡数、各自扩。",
        "",
        d2(`
direction: right
in.class: go
in: "prompt 入"
pf.class: step
pf: "prefill 池"
kv.class: store
kv: "搬 KV cache"
dc.class: ok
dc: "decode 池"
out.class: go
out: "流式 token"
in -> pf -> kv -> dc -> out
`),
        "",
        "**本图引用**：弹性与队列（Ch42）。KV 搬运依赖机房网络，不是普通 HTTP 重试能补上的。",
        "",
        "公开线索（2024–2026，可讲不可编内部数）：",
        "",
        "- **DistServe**（OSDI 2024）：拆开是为了 **goodput**（同时满足 TTFT 和 TPOT 的有效吞吐），而不是裸 TPS",
        "- **Splitwise**（Microsoft）：阶段拆分，还可以异构硬件",
        "- **2025**：NVIDIA **Dynamo**（GTC 2025）把 P/D worker 当一等公民；vLLM / SGLang 有 disagg 路径；Hao AI Lab 回顾写「2025 起大规模 serving 栈把 disaggregation 当成 playbook」",
        "- 反例也要会说：Dynamo 社区公开讨论过 **拆了不一定更快**——prefill 池太小、KV 传输差、或负载根本不干扰时，colocate 可能更好",
        "",
        "**2026 面试怎么摆位置：** 第一张图仍是「网关 + 队列 + 带 PagedAttention 的引擎」。问到规模、双 SLO、长上下文时，主动说 **prefill/decode 分离是加分项 / 大规模默认方向**。不要说「所有公司从小流量起就必须拆」。小集群：colocate + continuous batching + 可选 chunked prefill 仍然是正确第一答案。",
        "",
        "### 扩缩容、排队、批大小 vs 延迟 SLO",
        "",
        "GPU worker **不是无状态 web**。加载 70B 级权重往往是分钟级，扩容来不及挡突发。套路：",
        "",
        d2(`
direction: right
load.class: go
load: "负载上来"
q.class: step
q: "先排队"
batch.class: step
batch: "调批大小"
slo.class: warn
slo: "盯 TTFT TPS"
pool.class: ok
pool: "扩 GPU 池"
load -> q -> batch -> slo -> pool
`),
        "",
        "**本图引用**：弹性、队列、熔断（Ch42）；无状态的是网关不是引擎（Ch39）。",
        "",
        "| 手段 | 作用 | 坑 |",
        "|---|---|---|",
        "| 队列 | 平滑突发，保护已在跑的会话 | 队列一长，TTFT 先爆；要有超时和 429 |",
        "| 限制并发 / 批大小 | 守 TTFT/TPOT SLO | 集群 TPS 下降，成本变差 |",
        "| 预热 GPU 池 | 扩容有货可加 | 空池也烧钱；冷启动仍慢 |",
        "| P/D 分池扩 | TTFT 紧就加 prefill；出字慢就加 decode | 运维变复杂；要会搬 KV |",
        "",
        "wrap-up 口播：",
        "",
        "> 「扩缩容我按 GPU 池来，不按 Pod 秒级想象。突发先排队和降批；SLO 破了再加卡。观测四件套换成这题的版本：TTFT、TPS、队列深度、KV 占用。」",
      ].join("\n"),
    },
    {
      id: "sec-2026",
      heading: "2026 vs 原书",
      secNum: null,
      related: [],
      body: [
        "<details>",
        "<summary>2020 书空白 / 早期固定 batch —— 现在默认怎么答</summary>",
        "",
        "Alex Xu 那一代系统设计书 **几乎没有** LLM serving。笔记里的「持续学习」清单只有几行 KV / PagedAttention / continuous batching，不能当 2026 终稿。",
        "",
        "| 当时 / 早期工程 | 现在上场 |",
        "|---|---|",
        "| 无此题，或把「调一个 generate()」当服务 | 当成有状态 GPU 系统：队列、显存、流式、SLO 拆分 |",
        "| 静态 batch、按 max length 连续预留 KV | **PagedAttention** + **continuous batching** 是开源引擎默认话术（vLLM 一系） |",
        "| 只报 QPS、只报模型参数量 | 报 **TTFT vs TPS**、并发会话、token/分钟 |",
        "| 一次性 JSON 响应 | 聊天默认 **SSE 流式**（协议细节 Ch40） |",
        "| 2023–24 论文里的 P/D 分离还像研究点 | **2025–26 大规模栈可讲的加分项**（DistServe / Dynamo / 引擎一等公民）；小流量不必第一张图就拆 |",
        "| 量化当玄学 | AWQ / FP8 **点到**：省权重显存，KV 和调度仍在 |",
        "",
        "正文第一答案用现在这套。折叠只防止你把「固定 batch 的离线脚本」讲成生产默认。",
        "",
        "</details>",
      ].join("\n"),
    },
    {
      id: "sec-traps",
      heading: "追问陷阱",
      secNum: null,
      related: ["ch38", "ch39", "ch42"],
      body: [
        "1. **上下文变长，显存怎么涨？** → KV 近似随序列长度 × 并发线性涨；权重不变。先估 KV 能不能放下，再谈算力。",
        "2. **为什么会 OOM？** → 不是「模型 7B 所以 16GB 卡一定行」。权重 + 激活 + **KV × 并发**；碎片（没分页）会让你在利用率很低时就爆。",
        "3. **批越大是否总更好？** → 否。集群 TPS 升，单请求 TPOT/TTFT 往往降。按 SLO 盖帽。",
        "4. **前缀缓存何时失效？** → 前缀改了、页被驱逐、模型/LoRA 变了。只帮 prefill，不帮 decode。",
        "5. **引擎挂了如何 failover？** → KV 在那张卡上，**这条生成丢了**。网关断 SSE、客户端重试（可能换 worker、可能重算 prefill）。不要说「像无状态 API 那样无感切」。健康检查 + 把新流量打到活着的 replica；前缀缓存通常也不在另一张卡上。",
        "6. **限流为什么不按 QPS？** → 一条请求的 token 可以差 100 倍。token bucket 按 token（可拆 input/output）。",
        "7. **要不要一上来 P/D 分离？** → 小流量 colocate 就对；双 SLO + 大规模再拆。拆了还要付 KV 传输和运维复杂度。",
        "8. **多 LoRA / 多模型？** → 点到：可能要分池或 LoRA 热加载，显存账更乱。深挖是平台章，别在这题把训练和推荐塞进来。",
      ].join("\n"),
    },
    {
      id: "sec-next",
      heading: "下一步",
      secNum: null,
      related: ["ch38", "ch40", "ch42"],
      body: [
        "合上页，用 30 秒口播 + 四层图走一遍。能讲清 **KV 为什么占显存、分页为什么能凑更大的批、TTFT/TPS 为什么不能同一个旋钮拧满**，这题就过关。",
        "",
        "下一题预告：**RAG 后端**（检索 + 拼 prompt + 再走本章这条推理路径）。向量引擎、LLM 网关、训练平台都还在后面——本章不要提前写完。",
        "",
        "自测：白板左列假设（模型、TTFT、上下文、并发），中列四层图，右列三个 deep dive 的 trade-off。",
      ].join("\n"),
    },
  ],
  reviewMd: `# Ch29 · 记忆闪卡

| # | 正面 | 背面 |
|---|---|---|
| 1 | 设计 LLM 推理服务，30 秒怎么开口？ | 最贵是 GPU；优化围着显存和吞吐；PagedAttention + continuous batching；前面按 token 限流+队列；流式降 TTFT 体感。 |
| 2 | 这题 hard part 是什么？ | KV 显存与调度（凑批还不打爆延迟），不是微服务个数，也不是 RAG。 |
| 3 | 该澄清哪几件事？ | 自托管还是 API、TTFT vs 总时长、上下文、多模型/LoRA、流式否、QPS 还是并发会话。 |
| 4 | 显存两块账？ | 权重≈参数量×精度；KV 随并发和上下文涨，长上下文时经常是大头。 |
| 5 | 为什么必须 KV cache？ | decode 每步都要用历史 K/V；不缓存就要对整段重复算 attention。 |
| 6 | PagedAttention 解决什么？ | 按页分配 KV，逻辑连续物理可散；减少连续预留的 60%–80% 级浪费，才能把批做大。 |
| 7 | continuous batching 和静态批差在哪？ | 静态等齐、短请求空转；continuous 每 decode 步重排批，结束立刻让位。 |
| 8 | 批越大越好吗？ | 否。集群 TPS 升，TTFT/TPOT 往往变差。按 SLO 盖帽。 |
| 9 | TTFT vs TPS？ | TTFT≈prefill/体感；TPS≈decode 吞吐/成本。交互和产能不是同一个旋钮。 |
| 10 | 为什么要流式？ | 先出第一个 token，TTFT 变成体验；协议 SSE/WS 的深读在 Ch40。 |
| 11 | 限流按什么？ | token bucket 按 token（可拆 input/output），不要按裸 QPS。 |
| 12 | 前缀缓存何时失效？ | 前缀改了、页被驱逐、模型/LoRA 变了；只加速 prefill。 |
| 13 | 上下文变长为什么容易 OOM？ | KV 近似线性涨；再加碎片（没分页）和并发，权重还没变就会爆。 |
| 14 | 引擎挂了怎么办？ | 进行中 KV 没了，流会断；网关让客户端重试到别的 replica，不是无感 failover。 |
| 15 | P/D 分离什么时候讲？ | 大规模且要同时守 TTFT 和 TPOT 时加分；小流量 colocate + continuous batching 仍是第一张图。 |`,
});
