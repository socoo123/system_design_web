import { writeChapter } from "./write-chapter.mjs";

const d2 = (src) => {
  const body = src.trim();
  const sized = /style\.font-size/.test(body) ? body : `style.font-size: 12\n${body}`;
  return "```d2\n" + sized + "\n```";
};

writeChapter({
  id: "ch32",
  num: "32",
  title: "设计 LLM API 网关",
  kind: "ai",
  relatedChapters: ["ch04", "ch17", "ch29", "ch38"],
  sections: [
    {
      id: "intro",
      heading: "",
      secNum: null,
      related: [],
      body: [
        "> **预计**：50–70 分钟 ｜ **前置**：Ch04 限流、Ch29 推理、Ch38 缓存",
        "> **目标**：多模型路由、token 限流计费、语义缓存、降级。对照 Ch17 业务网关，不重讲 GPU。",
        "",
        "面试官说「设计一个 LLM 网关 / 模型路由层」，不是让你背 LiteLLM / Portkey 的 SKU，也不是把 nginx 反代到某一个 provider key 就交差。",
        "",
        "**谁调这个 API：** 业务服务、聊天后端、内部 Agent。它们只认一份 **OpenAI-compatible** 的 `POST /v1/chat/completions`。网关后面才是 OpenAI、Anthropic、本地 vLLM 这类推理（Ch29）。",
        "",
        "**hard part** 是三块：**路由策略**（model id / 成本 / 延迟怎么选后端）、**token 记账 + 限流**（TPM / RPM + 配额，input/output 分开）、**语义缓存的正确性 vs 命中率**。画完一个「AI Gateway」框却讲不清这三块，是 red flag。",
        "",
        "本章边界：",
        "",
        "- **限流算法 / Redis Lua** → 已在 Ch04；这里只谈按 token 怎么套",
        "- **业务 REST 网关**（鉴权、灰度、熔断）→ Ch17；本章对照，不重讲",
        "- **GPU、KV cache、TTFT 在引擎里怎么优化** → 已在 Ch29；网关**调用**推理，不重设计引擎",
        "- **工具 / MCP** → 预告 Ch33，不要把工具协议塞进这张白板",
        "- **RAG 管道 / 向量引擎** → Ch30 / Ch31；语义缓存最多说「可能调一次 embedding」",
        "",
        "M5 铁律：**只做 LLM + Agent 基建，禁止推荐漏斗。** 厂商名最多当机制的例子。",
      ].join("\n"),
    },
    {
      id: "sec-pitch",
      heading: "面试怎么答（30 秒）",
      secNum: "32.1",
      related: [],
      body: [
        "开场不要画 20 个框，也不要报一家托管网关的报价单。先把评分信号打出来：这是 **LLM 控制面**，hard part 不在 logo。",
        "",
        "> 「这是 **LLM API 网关**，不是 Ch17 那种业务 REST 网关。对外 **OpenAI-compatible**，`model` 当路由键，打到 OpenAI / Anthropic / 本地 vLLM。限流按 **TPM + RPM**，配额按 token 记账，**input / output 分开**。缓存默认 **exact-match**；语义缓存能抬命中率，但会拿错过的答案。主模型挂了 **fallback** 到更小/更便宜的，全挂再 503。对用户 **SSE** 流式。GPU 怎么跑是 Ch29，网关不存 KV。」",
        "",
        "四步怎么填：",
        "",
        d2(`
direction: right
s1.class: go
s1: "Step 1 澄清"
s2.class: step
s2: "Step 2 架构"
s3.class: store
s3: "Step 3 深入"
s4.class: ok
s4: "Step 4 wrap-up"
s1 -> s2 -> s3 -> s4
`),
        "",
        "| 步 | 这题落在哪 |",
        "|---|---|",
        "| Step 1 澄清 | 外部 API 还是自托管、几个模型、按 id / 成本 / 延迟路由、429 vs 排队、缓存能不能脏、是否允许降质 |",
        "| Step 2 高层 | client → LLM GW（router + limiter + cache）→ inference；SSE 透传 |",
        "| Step 3 deep dive | ① 路由策略 + fallback ② TPM/RPM + 记账 ③ 语义缓存正确性 |",
        "| Step 4 wrap-up | 429 风暴、静默降质、缓存拿错答案、流被缓冲、观测实际 served model |",
        "",
        "**red flag：** 把这题答成 nginx 反代；把 Ch04 令牌桶再推导一遍；把 Ch29 引擎再设计一遍；上 RAG / 推荐；绑死一家 vendor；报某厂内部 $/token。",
      ].join("\n"),
    },
    {
      id: "sec-clarify",
      heading: "澄清问题",
      secNum: "32.2",
      related: ["ch17", "ch29"],
      body: [
        "没问清「几个后端、超限怎么办、答案能不能脏」就画网关 = Jimmy。大约 6–8 个问题，其余自己假设写白板。",
        "",
        "| 你问 | 为什么问 | 典型假设（面试官说「你定」时） |",
        "|---|---|---|",
        "| 只调外部 API，还是混合本地推理？ | 纯 API 题是配额+路由；有 vLLM 才有「本地兜底」 | **混合**：默认云端 + 本地 OpenAI-compatible 引擎 |",
        "| 客户端要兼容几家 SDK？ | 决定要不要做协议翻译 | 对外只暴露 **OpenAI-compatible**；Anthropic 在网关后翻译 |",
        "| 按什么路由？调用方指定 model，还是网关策略？ | 路由是这题 hard part 之一 | 先 **model id / 别名**；再叠加成本、延迟、健康 |",
        "| 超限是 **429** 还是排队？ | 交互聊天排队会打爆 TTFT | 聊天 **同步 429**；离线批另走进队 |",
        "| 要不要语义缓存？答错的代价？ | 命中率 vs 正确性 | 默认 **exact**；FAQ 类才开语义，高风险路径关掉 |",
        "| 主模型挂了，允许质量变差吗？要不要告诉调用方？ | 静默降质是生产事故 | **允许 fallback** 到更小/更便宜；响应里带回实际 model，打点告警 |",
        "| 要不要流式？ | SSE vs 一次 JSON；网关能不能缓冲 | **要 SSE**；网关透传，禁止攒完再发 |",
        "",
        "话术：",
        "",
        "> 「我假设：对外 OpenAI-compatible，后面多家模型含本地 vLLM。聊天 SSE。超限 429。缓存先 exact。主挂了降到小模型，但要记 served model。方向 OK 吗？」",
      ].join("\n"),
    },
    {
      id: "sec-estimate",
      heading: "粗估（不要假装精确）",
      secNum: "32.3",
      related: ["ch04"],
      body: [
        "这题的 back-of-envelope 是让面试官听见：**chat completions 的 QPS 很小，token 带宽才是账。** 禁止编造某厂内部 QPS 或 $/token。",
        "",
        "教学假设（写白板）：峰值 **20 QPS** 的 `chat/completions`（中型聊天产品，不是 REST 那种万级）。每条 **2k input + 400 output ≈ 2.4k tokens**。",
        "",
        "> RPM = 20 × 60 = **1,200 RPM**。TPM ≈ 20 × 2.4k × 60 ≈ **2.9M TPM**。同一条 TPM，一条 32k 的长 prompt 可以顶十几条短聊天——所以 **只限 RPM 是 red flag**。",
        "",
        "| 量 | 教学数 | 面试怎么开口 |",
        "|---|---|---|",
        "| chat QPS | **20**（峰值） | 别套 1 万 QPS 的 CRUD 语感 |",
        "| 每条 token | 2k in + 400 out | 长上下文会把 TPM 先打满 |",
        "| **RPM** | ~1,200 | 请求个数；agent 小环会把它打爆 |",
        "| **TPM** | ~2.9M | 真正的容量和钱；再拆 input TPM / output TPM |",
        "| SSE 带宽 | 20 × 400 token × 数字节 | 通常不是 bottleneck；钱在 token |",
        "",
        "input / output **必须分开估**：公开价目里 completion 往往比 prompt 贵一截（具体数字随模型变，面试报「分开乘单价」，不要背某一天的价牌当事实）。预扣用 `estimated_input + max_tokens`，响应里的 `prompt_tokens` / `completion_tokens`（或 Anthropic 的 `input_tokens` / `output_tokens`）再 **settle**。",
        "",
        "和 Ch29 对上：网关看到的是 **token/分钟** 和并发流；引擎侧才是 TTFT / GPU。两边单位不要混。",
        "",
        "话术：",
        "",
        "> 「我按 20 QPS、每条 2.4k token 估，大约 1200 RPM、两三百万 TPM。限流两个维度都要。长 prompt 先打满 TPM，agent 小请求先打满 RPM。」",
      ].join("\n"),
    },
    {
      id: "sec-arch",
      heading: "高层架构",
      secNum: "32.4",
      related: ["ch17", "ch38", "ch39", "ch40", "ch29"],
      body: [
        "要 buy-in：**一张图讲清网关三件套，不要把 GPU 集群画进来。** 推理是下游（Ch29），网关无状态，前面可以挂 L7 LB（Ch39）。",
        "",
        d2(`
direction: right
cli.class: go
cli: "client"
lim.class: warn
lim: "limiter"
cch.class: store
cch: "cache"
rt.class: step
rt: "router"
inf.class: ok
inf: "inference"
cli -> lim -> cch -> rt -> inf
`),
        "",
        "三件套在 **同一个无状态 LLM GW 进程**里，图上按真实顺序摊开：先限流，再查缓存，miss 才路由。前面可以挂 L7 LB（Ch39）。",
        "",
        "**本图引用**：缓存（Ch38）、负载均衡与无状态（Ch39）、协议 / SSE（Ch40）。inference 是 Ch29 的引擎或外部 API，**不是**网关的一部分。限流算法见 Ch04。",
        "",
        "三件套各一句话：",
        "",
        "| 件 | 干什么 | 面试怎么说 |",
        "|---|---|---|",
        "| **router** | 按 model 别名 + 策略挑后端 | OpenAI / Anthropic / 本地 vLLM 对客户端长一样 |",
        "| **limiter** | RPM + TPM + 租户配额 | 先估 token 再放行；超限 429 |",
        "| **cache** | 命中则不调推理 | 默认 exact；语义是可选且危险 |",
        "",
        "### 和 Ch17 业务网关对照",
        "",
        "Ch17 是 **REST 业务入口**：鉴权、按 QPS 限流、路由到微服务、灰度、超时熔断。本章复用「入口统一、网关无状态」这句，但 **计费单位和路由键都变了**。一张对照表就够，不要把 Ch17 重讲一遍。",
        "",
        d2(`
grid-columns: 2
biz: {
  label: "Ch17 业务网关"
  class: group
  grid-columns: 3
  a.class: step
  a: "鉴权路由"
  b.class: step
  b: "QPS 限流"
  c.class: step
  c: "熔断灰度"
}
llm: {
  label: "Ch32 LLM 网关"
  class: groupOk
  grid-columns: 3
  d.class: ok
  d: "token 记账"
  e.class: ok
  e: "模型路由"
  f.class: ok
  f: "语义缓存"
}
`),
        "",
        "| | Ch17 业务网关 | 本章 LLM 网关 |",
        "|---|---|---|",
        "| 路由键 | path / host / header | **model id** + 成本/延迟策略 |",
        "| 限流单位 | 请求数（QPS / RPM） | **TPM + RPM**；配额是 token |",
        "| 缓存 | 偶发 HTTP 缓存 | exact prompt；可选 **语义缓存** |",
        "| 失败 | 熔断、重试、503 | 另加 **模型降级**（质量会变） |",
        "| 协议 | JSON 一次性为主 | 聊天默认 **SSE** 透传 |",
        "| 下游 | 无状态微服务 | 有状态 GPU 或外部 LLM API |",
        "",
        "Step 2 可以主动列 endpoint（加分，不必写 schema）：",
        "",
        "- `POST /v1/chat/completions`（**2026 默认 lingua franca**；`stream=true` 走 SSE）",
        "- `POST /v1/embeddings`（语义缓存或调用方自用；不是 RAG 管道）",
        "- `GET /v1/models`（别名列表）",
        "- 可选 `GET /metrics`（TPM 使用、429 率、fallback 率、cache hit、实际 served model）",
        "",
        "### 流式：网关这一层怎么说",
        "",
        "聊天默认 **SSE**（OpenAI / Anthropic / Gemini 公开接口都是这个形状）：client POST 一次，服务端单向推 token。**WebSocket** 留给真正双向的场景（中途打断、语音，预告 Ch33 / 深读 Ch40）。本章不要把协议课再上一遍。",
        "",
        "网关 hard part 是 **透传、别缓冲**：代理或网关若把 `text/event-stream` 攒满再发给客户端，TTFT 直接烂掉。客户端取消要 **abort 上游**，否则还在烧 token。",
        "",
        "话术：",
        "",
        "> 「client 只打 OpenAI-compatible。网关做路由、按 token 限流、查缓存，再转发到推理。流用 SSE 透传。和 Ch17 的差别是 token 记账和模型路由器。方向 OK 的话我挖路由、记账、缓存。」",
      ].join("\n"),
    },
    {
      id: "sec-route",
      heading: "Deep dive ①：路由策略与降级",
      secNum: "32.5",
      related: ["ch29", "ch39"],
      body: [
        "2026 面试默认：对外一份 **OpenAI-compatible** schema，**`model` 字段是路由键**。网关把别名映射到具体 deployment（某家 API、某个 Azure/Bedrock 区域、某组本地 vLLM）。不要让每个业务服务自己塞三套 SDK——那是 over-engineering。",
        "",
        "策略叠在 id 上面，不是三选一互斥。先命中别名，再在候选池里用成本 / 延迟 / 健康挑一个。",
        "",
        d2(`
grid-columns: 3
mid: {
  label: "model id"
  class: group
  grid-columns: 2
  a.class: step
  a: "别名映射"
  b.class: step
  b: "显式指定"
}
cost: {
  label: "cost"
  class: group
  grid-columns: 2
  c.class: warn
  c: "便宜优先"
  d.class: warn
  d: "盯配额"
}
lat: {
  label: "latency"
  class: groupOk
  grid-columns: 2
  e.class: ok
  e: "挑快的池"
  f.class: ok
  f: "跳过不健康"
}
`),
        "",
        "| 策略 | 做什么 | 何时用 | 坑 |",
        "|---|---|---|---|",
        "| **model id / 别名** | `gpt-class` → 具体 deployment | **默认第一层**；调用方稳定、后端可换 | 别名和真实 model 不一致要在响应里写清 |",
        "| **cost** | 同类任务走更便宜的候选 | 配额紧、批处理、内部工具 | 质量悬崖；别把推理题默默换小模型 |",
        "| **latency / least-busy** | 挑近期 TTFT 低、未打满 TPM 的池 | 多副本、多 region、多 key | 需要健康检查；别把探针当负载 |",
        "",
        "本地 vLLM（或同类引擎）也暴露 OpenAI-compatible：网关看来就是又一个 base URL。**不要在这层重讲引擎怎么分页 KV。**",
        "",
        "### Fallback：primary → 更小/更便宜 → 503",
        "",
        "主路径 429 / 5xx / 超时之后，按名单试下一个模型，而不是对同一 deployment 死重试把 TPM 打穿。公开网关（LiteLLM Router 一类）就是 **有序列表**：先主模型，再 fallback group。",
        "",
        d2(`
direction: right
pri.class: go
pri: "primary"
sec.class: step
sec: "cheaper"
out.class: bad
out: "503"
pri -> sec -> out
`),
        "",
        "三条规则，面试加分：",
        "",
        "1. **链要短。** 每跳再乘 `num_retries`，一次失败可以变成一串付费空请求。默认 **一次短重试 + 一个 fallback**；第三条几乎总是 over-engineering。",
        "2. **降质不能静默。** fallback 成功仍是 200，但答案可能明显变差。日志和响应元数据必须带 **实际 served model**；fallback 率要告警。质量敏感路径（生成要引用、要结构化）宁可 503，不要偷偷换小模型。",
        "3. **按错误类分叉。** 上下文超长不要落到一个更小窗口的模型上硬截；429 适合换 key / 换供应商 / 换小模型；内容策略拒绝不要当成「再试一次同模型」。",
        "",
        "| | 做什么 | 不要做什么 |",
        "|---|---|---|",
        "| 5xx / 超时 | 换 deployment 或小模型 | 对同一 5xx 无 jitter 连打 |",
        "| 上游 429 | 换 key、换供应商、或本网关先 429 | 立刻原样重放同一条 |",
        "| 全挂 | **503** + Retry-After | 无限排队把 TTFT 打死 |",
        "",
        "面试怎么说：",
        "",
        "> 「路由先看 model 别名，再在池里用成本和延迟挑。fallback 是有序短链，成功也要记 served model。全挂 503。别把降级讲成免费高可用。」",
      ].join("\n"),
    },
    {
      id: "sec-limit",
      heading: "Deep dive ②：token 记账、限流、配额",
      secNum: "32.6",
      related: ["ch04"],
      body: [
        "算法怎么实现——令牌桶、滑动窗口、**Redis + Lua**、多实例竞态——已经在 **Ch04**。本章不重推导公式。这里的 hard part 是：**桶里装的是什么、超了是 429 还是排队、账怎么和流式对上。**",
        "",
        "公开 LLM API（OpenAI / Anthropic 一类）同时限 **RPM** 和 **TPM**，响应头带 remaining requests / remaining tokens。你的网关要对**租户 / API key / 模型**再做一层，免得一个团队把共享 upstream 打成 429 风暴。",
        "",
        "| 维度 | 计什么 | 谁先爆 |",
        "|---|---|---|",
        "| **RPM** | HTTP completion 次数 | agent 小环、分类短请求 |",
        "| **TPM** | input + output token（最好再拆） | 长 RAG prompt、大 `max_tokens` |",
        "| **并发流** | 同时开着的 SSE | 聊天占着连接；和 RPM 不是一回事 |",
        "| **配额** | 日/月 token 预算（租户或 key） | 月底突然 402/403，不是 429 |",
        "",
        "限流 ≠ 配额。限流是滑动窗口里的速率；配额是累计预算。两套桶、两套拒绝码，别混。",
        "",
        "### 预扣再结算",
        "",
        "放行前用 tokenizer 或保守启发式估 `input + max_tokens`。不够就 **本网关 429**，尽量不要把流量送到上游再吃 429——上游配额是共享的、也更贵。",
        "",
        "流结束后用 usage 回写：估多了把预扣还回去，估少了补扣。**SSE 的 usage 常常在最后一帧**；预算检查如果只看流中途，会被绕过——这是公开网关踩过的坑，面试提一句加分。",
        "",
        "input / output **分开单价、分开桶** 是 2026 默认话术：同一条 2k+400 的请求，钱和 TPM 压力主要可能在某一侧。不要用「平均 2k token × 一个价」糊弄。",
        "",
        "### 429 vs 排队",
        "",
        "| | 429 同步拒 | 排队 |",
        "|---|---|---|",
        "| 何时 | **交互聊天**（默认） | 离线批、可延迟摘要 |",
        "| 为什么 | 调用方还握着 SSE；队列一长 TTFT 先爆 | 工作有 deadline、过载是短暂的 |",
        "| 队列要 | — | **有界** + 超时；满了仍 429/503 |",
        "",
        "对同步调用方，无界队列是把速率问题变成内存问题。交互路径：**本网关 429 + Retry-After**。需要排队就另开批处理入口，不要和聊天共用一个队列。",
        "",
        "Ch04 的「超限默认 429」在这里仍然成立；只是 cost 从「1 个请求」变成「估出来的 token」。Redis key 按 `tenant:model:rpm` 和 `tenant:model:tpm` 分，Lua 仍然一次原子扣。",
        "",
        "面试怎么说：",
        "",
        "> 「Ch04 那套 Redis Lua 还在，cost 换成 token。RPM 和 TPM 两个桶，input/output 分开记账。聊天超限 429，不要在网关里给 SSE 排队。预扣再按 usage 结算。」",
      ].join("\n"),
    },
    {
      id: "sec-cache",
      heading: "Deep dive ③：语义缓存 vs exact cache",
      secNum: "32.7",
      related: ["ch38"],
      body: [
        "网关缓存的是 **整段模型答案**（或流的拼接结果），不是 Ch29 引擎里的 KV / 前缀页。心智见 Ch38（cache-aside、TTL、失效）；本题特有的 trade-off 是 **近似命中会返回错误答案**。",
        "",
        "**2026 默认：exact-match 先上；语义缓存可选，且默认危险。** 面试把语义缓存当第一答案、却不谈正确性，是 red flag。",
        "",
        d2(`
grid-columns: 2
ex: {
  label: "exact cache"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "哈希即命中"
  b.class: ok
  b: "正确性高"
}
sem: {
  label: "semantic"
  class: group
  grid-columns: 2
  c.class: warn
  c: "命中率高"
  d.class: warn
  d: "会拿错答案"
}
`),
        "",
        "| | exact-match | 语义缓存 |",
        "|---|---|---|",
        "| 键 | hash(model + 温度 + 全量 messages + tenant) | 上述硬字段 **精确相等**，只对**最后一句用户话**做 embedding 近邻 |",
        "| 命中 | 字面完全相同 | 改写、同义问也能中 |",
        "| 正确性 | 高（仍可能 **stale**：知识变了） | 阈值一松就答非所问 |",
        "| 成本 | 几乎零；自然语言命中率往往很低 | 每次 miss 先付一次 **embedding** |",
        "| 何时开 | 内部工具、相同 prompt 重放、评测回放 | FAQ、文档问答、允许偶尔脏 |",
        "| 何时关 | — | 个性化、实时数据、高风险、要工具调用（Ch33） |",
        "",
        "语义缓存 **不是** Ch30 RAG：它不检索知识库再生成，只是「以前有没有回答过意思相近的问题」。需要向量时调 embedding API 或本网关的 embeddings 端点，**不要把 HNSW 集群画进这张图**（引擎在 Ch31）。",
        "",
        "阈值是整条工程决策：公开讨论里常见把 cosine **0.9+** 当起点——再低命中率好看、错答上升。按路由分阈值（FAQ 松一点、交易话术更严）比全局一个魔法数正经。",
        "",
        "硬字段必须 exact：model、system prompt、历史多轮、temperature、tenant。只对 last user message 做相似，是为了避免「同一句人话、完全不同的系统设定」被折叠。这是正确默认。",
        "",
        "### miss 路径（流式）",
        "",
        d2(`
shape: sequence_diagram
cli: "client"
gw: "LLM GW"
cch: "cache"
inf: "inference"
cli -> gw: "POST chat"
gw -> cch: "lookup"
cch -> gw: "miss"
gw -> inf: "forward"
inf -> gw: "SSE token"
gw -> cli: "SSE token"
`),
        "",
        "**本图引用**：缓存（Ch38）；SSE 透传见 Ch40。lookup 在语义模式下内部可能先 embed，图上不单开参与者。",
        "",
        "失效：",
        "",
        "- **TTL**：短 TTL 换新鲜，命中率下降；长 TTL 省钱，FAQ 改了仍用旧答案",
        "- **版本键**：system prompt / 工具定义 / 文档版本进 hash，一改全失效",
        "- 不要用语义缓存当「知识库更新通道」——那是 RAG 新鲜度（Ch30），不是网关缓存",
        "",
        "命中时：若原请求要 SSE，仍按 SSE 把缓存答案推出去（或明确降级成一次性 JSON），别让客户端卡在 `stream=true` 上等首包。",
        "",
        "面试怎么说：",
        "",
        "> 「默认 exact cache，键含 model 和 tenant。语义缓存用 embedding 近邻换命中率，阈值是正确性旋钮。高风险路径关掉。它不是 RAG，也不是 GPU 上的前缀缓存。」",
      ].join("\n"),
    },
    {
      id: "sec-2026",
      heading: "2026 vs 「只做反向代理」",
      secNum: null,
      related: [],
      body: [
        "<details>",
        "<summary>nginx 反代一个 provider key —— 现在默认怎么答</summary>",
        "",
        "Alex Xu 那一代书 **没有** LLM 网关专章。早期工程默认常常是：应用直连 OpenAI、或前面架一层 nginx / Envoy 反代、一把 API key、按 QPS 限流、不记账、不降级。那是实验室接入，**不能当 2026 正文**。",
        "",
        "| 当时 / 早期工程 | 现在上场 |",
        "|---|---|---|",
        "| 直连一家 SDK，或 nginx 反代 | **OpenAI-compatible** 统一入口；后面多家 + 本地 vLLM |",
        "| 只限 QPS | **TPM + RPM** + 租户 token 配额；input/output 分开 |",
        "| 超限把 429 原样丢给用户 | 本网关先挡；交互 429，批处理才排队 |",
        "| 无缓存或只缓存 HTTP GET | exact prompt cache；语义缓存可选且谈正确性 |",
        "| 上游挂了就 502 | **短 fallback 链**到更小/更便宜；全挂 503；记 served model |",
        "| 一次性 JSON | 聊天 **SSE 透传**，禁止网关缓冲 |",
        "| 把这题答成 Ch17 | 对照一张表：token 记账 + 模型路由 + 语义缓存 |",
        "",
        "正文第一答案用现在这套。折叠只防止你把「反代 + 一把 key」讲成终稿。",
        "",
        "</details>",
      ].join("\n"),
    },
    {
      id: "sec-traps",
      heading: "追问陷阱",
      secNum: null,
      related: ["ch04", "ch17", "ch29", "ch38"],
      body: [
        "1. **这不就是 API 网关吗？** → 鉴权/路由/熔断和 Ch17 同构。LLM 特有的是 **token 记账、模型路由、语义缓存、降质 fallback**。一张对照表说完。",
        "2. **为什么不按 QPS 限？** → 一条请求的 token 可以差 100 倍。RPM 和 TPM 都要；长 prompt 打 TPM，小环打 RPM。算法见 Ch04。",
        "3. **超限为什么不排队？** → 聊天握着 SSE，队列一长 TTFT 先爆。默认 429；批处理另开入口。",
        "4. **语义缓存不是稳赚吗？** → 命中率升、正确性降。阈值、TTL、硬字段 exact。高风险关掉。不是 RAG。",
        "5. **和引擎前缀缓存什么关系？** → 前缀缓存加速 **prefill**（Ch29）。网关缓存的是 **答案**。两层，别混。",
        "6. **fallback 成功为什么还要告警？** → 200 可能是更差的模型答的。不记 served model = 静默降质。",
        "7. **为什么不把三家 SDK 写进每个服务？** → 密钥、限流、记账、降级会漂。统一网关；业务只打一份 schema。",
        "8. **SSE 为什么不能在网关攒一下？** → 攒完再发等于毁掉 TTFT。透传；取消要 abort 上游。",
        "9. **为啥不 WebSocket？** → 单向出 token 用 SSE 就够，走现有 HTTP/代理。双向再 WS（Ch40 / Ch33）。",
        "10. **工具调用 / MCP 呢？** → 下一章 Ch33。本章网关只到 chat completions 和模型后端。",
      ].join("\n"),
    },
    {
      id: "sec-next",
      heading: "下一步",
      secNum: null,
      related: ["ch33", "ch29", "ch38"],
      body: [
        "合上页，用 30 秒口播 + 两张图（三件套链路、Ch17 对照）走一遍。能讲清 **怎么路由、TPM/RPM 怎么限、语义缓存为什么危险、降级为什么不能静默**，这题就过关。",
        "",
        "下一题预告：**Agent 工具平台**（工具网关、MCP、超时重试幂等、权限护栏）。本章只把 chat 打到模型；工具协议不要提前写完。",
        "",
        "自测：白板左列假设（混合后端、20 QPS、429、exact 默认），中列 client → GW → inference，右列三个 deep dive 的 trade-off。",
      ].join("\n"),
    },
  ],
  reviewMd: `# Ch32 · 记忆闪卡

| # | 正面 | 背面 |
|---|---|---|
| 1 | 设计 LLM API 网关，30 秒怎么开口？ | OpenAI-compatible 入口；model 路由到多家/本地 vLLM；TPM+RPM；exact cache 默认；fallback 到小模型；SSE 透传。不是 Ch17。 |
| 2 | 这题 hard part 是什么？ | ① 路由策略 ② token 记账+限流 ③ 语义缓存正确性 vs 命中率。不是 GPU，不是 RAG。 |
| 3 | 该澄清哪几件事？ | 外部还是混合、路由键、429 vs 排队、缓存能不能脏、降质是否可见、是否流式。 |
| 4 | 和 Ch17 差在哪？ | Ch17：鉴权、QPS、灰度、熔断。本章：token 记账、模型路由、语义缓存、模型降级。 |
| 5 | 2026 对外协议默认？ | **OpenAI-compatible** \`/v1/chat/completions\`。Anthropic 等在网关后翻译。 |
| 6 | 路由三层怎么说？ | 先 model 别名，再在候选池用 cost / latency / 健康挑。不要每服务三套 SDK。 |
| 7 | 教学 20 QPS 对应多少 RPM/TPM？ | 每条 2.4k token → ~1200 RPM、~2.9M TPM。长 prompt 先打满 TPM。 |
| 8 | 为什么 input/output 分开记账？ | 单价和 TPM 压力两侧不同；预扣 input+max_tokens，usage 再 settle。 |
| 9 | 429 vs 排队？ | 聊天默认 429。排队只给有 deadline 的批处理，且必须有界。 |
| 10 | exact vs 语义缓存？ | exact：哈希，正确性高、命中率低。语义：embedding 近邻，命中率高、会拿错答案。 |
| 11 | 语义缓存键要注意什么？ | model / system / 历史 / 温度 / tenant **exact**；只对最后一句用户话做相似。 |
| 12 | fallback 的 red flag？ | 链太长乘上重试；成功 200 却静默换小模型；不记 served model。 |
| 13 | 全后端都挂了？ | **503** + Retry-After，不要无界排队。 |
| 14 | SSE vs WS？ | 单向 token → SSE 透传。双向（打断/工具）再 WS。网关禁止缓冲。 |
| 15 | 和 Ch29 / Ch33 边界？ | Ch29 是推理引擎。本章调用它。工具/MCP 是 Ch33。 |`,
});
