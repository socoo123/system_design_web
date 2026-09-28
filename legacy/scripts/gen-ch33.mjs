import { writeChapter } from "./write-chapter.mjs";

const d2 = (src) => {
  const body = src.trim();
  const sized = /style\.font-size/.test(body) ? body : `style.font-size: 12\n${body}`;
  return "```d2\n" + sized + "\n```";
};

writeChapter({
  id: "ch33",
  num: "33",
  title: "设计 Agent 工具平台",
  kind: "ai",
  relatedChapters: ["ch32", "ch25", "ch40", "ch42"],
  sections: [
    {
      id: "intro",
      heading: "",
      secNum: null,
      related: [],
      body: [
        "> **预计**：50–70 分钟 ｜ **前置**：Ch32 网关调模型；编排在 Ch34",
        "> **目标**：工具网关、MCP、超时重试幂等、权限护栏、会话审计。不绑某家 SDK，不讲多步编排。",
        "",
        "面试官说「给 Agent 接工具 / 设计 tool platform」，不是让你在循环里 `axios` 打生产 API，也不是背某一家 Agent SDK 的 class 名。",
        "",
        "**谁调谁：** 模型（经 Ch32）只吐 **JSON schema** 的 `tool_call`。真正碰 CRM、工单、支付、搜索的是 **tool gateway**。网关后面才是 MCP server 或普通 HTTP。**不要让模型直连生产 endpoint。**",
        "",
        "**hard part** 是三块：**工具网关 + schema**（allowlist、校验、凭据不出提示词）、**MCP vs 临时 HTTP**（model-facing 的 function calling ≠ server-facing 的 MCP）、**超时 / 有界重试 / 写路径幂等 + 权限护栏**。画一个「Agent 调工具」框却讲不清这三块，是 red flag。",
        "",
        "本章边界：",
        "",
        "- **模型路由 / TPM / 语义缓存** → 已在 Ch32；这里**调用**工具，不重讲怎么选模型",
        "- **多步循环、handoff、工作流** → 预告 Ch34，一句即可：**多步循环在 Ch34**",
        "- **cron / DAG 任务调度** → Ch25；工具调用是短的 RPC-like，不是调度平台",
        "- **RAG 管道 / 向量引擎 / PagedAttention** → 不是本章；检索最多当「又一个 read 工具」点到",
        "",
        "M5 铁律：**只做 LLM + Agent 基建，禁止推荐漏斗。** 厂商 SDK 不当架构。",
      ].join("\n"),
    },
    {
      id: "sec-pitch",
      heading: "面试怎么答（30 秒）",
      secNum: "33.1",
      related: [],
      body: [
        "开场不要画 LangGraph 全家桶，也不要报 Anthropic / OpenAI 某套 SDK。先把评分信号打出来：这是 **工具执行平面**，hard part 不在 logo。",
        "",
        "> 「这是 **Agent 工具平台**，不是再设计一遍 Ch32。模型只输出 `tool_call`（OpenAI function calling / 各家 tool use，都是 **model-facing schema**）。执行走 **tool gateway**：allowlist、校验 JSON schema、鉴权、超时、有界重试；写工具要 **idempotency key**，默认 **HITL**。后面接 MCP 或 HTTP——**MCP 是 server-facing 协议**，不绑某家 SDK。每次调用落 session + audit。多步循环在 Ch34。」",
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
        "| Step 1 澄清 | 哪些工具、读还是写、HITL、超时预算、凭据在谁手里、要不要 MCP |",
        "| Step 2 高层 | runtime → tool GW（schema + allowlist + 超时）→ MCP / HTTP；旁路 audit |",
        "| Step 3 deep dive | ① 网关 + schema ② MCP vs HTTP ③ 超时重试幂等 + 权限 |",
        "| Step 4 wrap-up | 模型直连生产、写路径盲重试、无审计、把本题答成编排或 cron |",
        "",
        "**red flag：** Agent 里直接 axios；把整张图绑死一家 SDK；把 Ch32 路由再讲一遍；把 Ch34 循环提前写完；上 RAG / 推荐；报某厂内部 tool QPS。",
      ].join("\n"),
    },
    {
      id: "sec-clarify",
      heading: "澄清问题",
      secNum: "33.2",
      related: ["ch32", "ch25"],
      body: [
        "没问清「会不会改数据、超时谁扛、凭据放哪」就画 MCP 集群 = Jimmy。大约 6–8 个问题，其余自己假设写白板。",
        "",
        "| 你问 | 为什么问 | 典型假设（面试官说「你定」时） |",
        "|---|---|---|",
        "| 工具是内部 HTTP、第三方 SaaS，还是 MCP server？ | 决定网关后面几种 transport | **混合**：内部 REST + 若干 MCP；对外 schema 统一 |",
        "| 有没有写工具（下单、发邮件、改工单）？ | 读可自动；写要 HITL + 幂等 | **有写**；写默认审批，读默认 allowlist 内自动跑 |",
        "| 单次工具超时预算？失败是重试还是回给模型？ | 挂住会卡住整轮；盲重试会双写 | 读 **5–8s**；写同样封顶；只对 retry_safe 有界重试 |",
        "| 生产凭据在 runtime 还是网关？ | 密钥进 prompt 是事故 | **网关 / vault**；模型只看见 name + JSON schema |",
        "| allowlist 按租户、角色还是按 Agent？ | 权限是这题护栏 | 按 **租户 × Agent 角色**；默认 deny |",
        "| 审计留多久？要不要按会话回放？ | 合规和排障 | 每次 tool call 落库；会话按 `session_id` 查 |",
        "| 这题包不包括多步 loop / 工作流？ | 防止画成 Ch34 | **不包括**；runtime 只把单次 `tool_call` 交给网关 |",
        "",
        "话术：",
        "",
        "> 「我假设：模型经 Ch32 吐 tool_call。执行全部进 tool gateway。读工具 allowlist 内自动跑，写工具 HITL + idempotency key。后面 MCP 和 HTTP 都能接，不绑 SDK。多步循环不在这张白板。方向 OK 吗？」",
      ].join("\n"),
    },
    {
      id: "sec-estimate",
      heading: "粗估（不要假装精确）",
      secNum: "33.3",
      related: ["ch42"],
      body: [
        "这题的 back-of-envelope 是让面试官听见：**账在 tool QPS 和审计体积，不在 GPU。** 禁止编造某厂内部数字。TPM / 模型路由是 Ch32 的账。",
        "",
        "教学假设（写白板）：峰值 **20** 轮 Agent 对话/秒（和 Ch32 聊天 QPS 同一量级）。平均每轮 **3** 次工具调用。",
        "",
        "> 工具 QPS ≈ 20 × 3 = **60 QPS**。这是短 RPC，不是 Ch25 那种分钟级 cron。读工具 p50 往往几十到几百毫秒；写 + HITL 是异步，不要按同步 60 QPS 去堆 GPU。",
        "",
        "| 量 | 教学数 | 面试怎么开口 |",
        "|---|---|---|",
        "| Agent 轮次 | **20 /s** 峰值 | 和聊天同一量级；别套万级 CRUD |",
        "| 每轮工具次数 | **3** | 有的轮次 0 次，有的 8 次；用平均 |",
        "| **tool QPS** | **~60** | 网关容量、超时线程、下游限额看这个 |",
        "| 在途调用 | 60 × 0.3s ≈ **20** | 读路径；写在等审批时不占这条 |",
        "| 审计 | ~2 KB/次 × 60 × 86400 ≈ **10 GB/天** | 截断大字段；热数据按 session 查 |",
        "",
        "不要用 GPU / TTFT 撑场面。工具平面的 bottleneck 通常是：**下游 API 限额、写路径审批队列、审计写入、错误重试把 QPS 放大。** 弹性细节链 Ch42。",
        "",
        "话术：",
        "",
        "> 「按 20 轮/秒、每轮 3 次工具，大约 60 tool QPS。超时按秒计。存储是 audit，不是显存。Ch32 的 TPM 是模型侧的账。」",
      ].join("\n"),
    },
    {
      id: "sec-arch",
      heading: "高层架构",
      secNum: "33.4",
      related: ["ch32", "ch40", "ch42"],
      body: [
        "要 buy-in：**一张图讲清执行平面，不要把 GPU 和多步状态机画进来。** 模型在上游（Ch32），循环在下游预告（Ch34）。",
        "",
        d2(`
direction: right
rt.class: go
rt: "agent RT"
gw.class: step
gw: "tool GW"
tool.class: ok
tool: "MCP / HTTP"
rt -> gw -> tool
`),
        "",
        "三格都是叶子：runtime 把模型给出的 `tool_call` 交给网关；网关校验、鉴权、带超时执行；后端是 MCP server 或普通 HTTP，对 runtime 长一样。凭据和 allowlist 只活在 GW。",
        "",
        "**本图引用**：协议（Ch40）、超时重试（Ch42）。上游 chat 走 Ch32；本图不画推理引擎。",
        "",
        "| 件 | 干什么 | 面试怎么说 |",
        "|---|---|---|",
        "| **agent runtime** | 收模型 `tool_call`，把结果塞回 messages | 本章只当调用方；loop 在 Ch34 |",
        "| **tool GW** | schema、allowlist、超时、重试、幂等、HITL | **唯一**能碰生产 API 的平面 |",
        "| **MCP / HTTP** | 真正做事的 server | transport 可混；策略不能混 |",
        "",
        "Step 2 可以主动列 endpoint（加分，不必写完整 schema）：",
        "",
        "- 模型侧：chat 请求里的 `tools` / `tool_calls`（**model-facing** JSON schema）",
        "- 网关：`POST /tools/invoke`（内部）、`GET /tools/catalog`（该 Agent 的 allowlist 投影）",
        "- MCP：`tools/list`、`tools/call`（**server-facing**；2026 远程 MCP 按普通 HTTP 负载均衡即可）",
        "- 审计：按 `session_id` / `tool_call_id` 查询",
        "",
        "和 Ch25：调度系统管 cron、延迟任务、错过补偿。工具调用是 **用户回合内的短 RPC**，超时以秒计，失败回给模型或 HITL，不要进作业队列当默认。",
        "",
        "话术：",
        "",
        "> 「runtime 不持有生产密钥。所有 tool_call 进网关：校验 schema、过 allowlist，再打 MCP 或 HTTP。方向 OK 的话我挖网关、MCP 边界、超时和写路径。」",
      ].join("\n"),
    },
    {
      id: "sec-gw",
      heading: "Deep dive ①：工具网关与 schema",
      secNum: "33.5",
      related: ["ch40", "ch44"],
      body: [
        "2026 默认：**模型不准碰生产。** 它只产出「想调哪个工具、参数是什么」。网关是唯一执行面：registry + allowlist + JSON schema 校验 + 鉴权。把检查散落到每个 axios 调用里，是过几个月就会漂的 over-engineering 反面——看起来简单，策略其实复制失败。",
        "",
        "Registry 每条工具至少有：`name`、JSON schema、transport（mcp / http）、`side_effect`（read / write）、超时、是否 `retry_safe`、是否 `approval_required`。模型只看见 **过滤后的** name + schema，看不见 URL、密钥、内部错误码。",
        "",
        "校验顺序（面试按这个说，别倒）：",
        "",
        "1. 工具在不在 registry（名字幻觉直接拒）",
        "2. 在不在该租户 / 该 Agent 的 **allowlist**（默认 deny）",
        "3. arguments 是否匹配 schema（缺字段、多字段、类型错 → 4xx 回模型，**不要**当 5xx 重试）",
        "4. 写工具：要不要 HITL；有没有 idempotency key",
        "5. 才执行，带超时",
        "",
        d2(`
grid-columns: 2
rd: {
  label: "read"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "allowlist"
  b.class: ok
  b: "auto run"
}
wr: {
  label: "write"
  class: groupBad
  grid-columns: 2
  c.class: warn
  c: "need HITL"
  d.class: bad
  d: "idemp key"
}
`),
        "",
        "| | read | write |",
        "|---|---|---|",
        "| 默认 | allowlist 内自动跑 | **approval_required**（HITL） |",
        "| 凭据 | 只读 scope | 更窄；能拆成 `ticket.close` 就不要 `ticket.update_anything` |",
        "| 失败 | 规范化错误回模型 | 未批准 = 不执行；超时作废，不要偷偷跑 |",
        "| 审计 | 记 args / 延迟 / 结果摘要 | 另记谁批准、批准 token |",
        "",
        "HITL 不是 prompt 里写「请谨慎」。策略引擎（规则，**不是**再调一次 LLM）返回 `allow` / `deny` / `approval_required`。批准前网关可以 202 + `pending`；runtime 暂停这一跳（怎么把 loop 挂起是 Ch34）。批准 token 短 TTL；没有 token 写工具永不执行。",
        "",
        "凭据：网关用 vault / 短时 token 调下游。Agent token 只能收窄、不能放宽（用户是 `repo:read`，Agent 不得变 `repo:write`）。密钥出现在 schema description 或日志明文，是 red flag。",
        "",
        "不要把公司内部每一个微服务都注册成工具。工具是 **给模型的产品面**：少、文档清楚、副作用标明白。一百个 endpoint 塞进 `tools` 数组会烧 prompt token，也放大误调用——那是 over-engineering。",
        "",
        "面试怎么说：",
        "",
        "> 「网关先 allowlist 再 schema。读自动、写 HITL。密钥留在网关。模型只看见 JSON schema。别让 Agent 直连生产。」",
      ].join("\n"),
    },
    {
      id: "sec-mcp",
      heading: "Deep dive ②：MCP vs HTTP（不要 SDK-lock）",
      secNum: "33.6",
      related: ["ch40"],
      body: [
        "面试爱问「那我们用 MCP 还是 function calling？」正确答法：**不是二选一，是两层。**",
        "",
        "- **Model-facing：** 各家模型的 tool / function calling。你把 JSON schema 放进 chat 请求，模型返回 `tool_calls`。OpenAI 叫 function calling，Anthropic 叫 tool use——形状都是「name + arguments」，字段名略不同（`parameters` vs `input_schema`）。**这一层是给模型看的。**",
        "- **Server-facing：** MCP（Model Context Protocol）是工具进程之间的开放协议：`tools/list` 发现、`tools/call` 执行。网关可以把它译成 HTTP JSON。**这一层是给工具 server 看的。**",
        "",
        "2025 年底 MCP 进了 Linux Foundation 旗下的 Agentic AI 基金会；2026 远程 MCP 的规格方向是 **协议层无 session**（不再靠握手 + sticky 才能打到同一实例），网关按方法名 / 工具名做路由和限流即可。面试第一答案仍然是「网关 + 开放协议」，**不要**把架构画成必须用某一家 Python/TS SDK。",
        "",
        d2(`
grid-columns: 2
mcp: {
  label: "MCP"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "tools/list"
  b.class: ok
  b: "std transport"
}
raw: {
  label: "raw HTTP"
  class: group
  grid-columns: 2
  c.class: warn
  c: "adhoc REST"
  d.class: warn
  d: "own schema"
}
`),
        "",
        "| | MCP | 临时 HTTP |",
        "|---|---|---|",
        "| 发现 | `tools/list`（可缓存） | 网关自己登记 schema |",
        "| 执行 | `tools/call` | `POST` 某个内部 endpoint |",
        "| 何时用 | 多客户端、要标准化、工具由别的团队提供 | **一两个内部 API**、暂时没有 MCP server |",
        "| 坑 | 不信任的 `tools/list` 要钉死 allowlist（防 tool 描述被换） | 每接一个就手写鉴权/超时，容易漏 |",
        "| 和模型 | 网关把 catalog **投影**成 function schema | 同样投影；模型看不见 URL |",
        "",
        "网关允许 **混接**：一部分后端 MCP，一部分 HTTP。Runtime 只认统一 invoke。这才是「不绑 SDK」：换模型只改 Ch32 那一侧的 schema 方言；换工具 server 只改网关 transport。",
        "",
        "临时 HTTP 不是原罪。三个内部读接口、没有跨产品复用，硬上 MCP 集群是 over-engineering。等工具要给多个 Agent、多个运行时共用，再把 HTTP adapter 收成 MCP server——网关的 allowlist 不用推翻。",
        "",
        "协议层的 session 和 **业务 session** 不是一回事。2026 远程 MCP 可以无协议 session；你仍要存 **对话 / 工具调用审计**（下一节）。别把「MCP 变无状态」理解成「可以不记谁调了写工具」。",
        "",
        "面试怎么说：",
        "",
        "> 「function calling 是模型方言；MCP 是工具运输。网关做翻译。一两个内部 HTTP 可以直接挂网关。不要把白板画成某家 SDK。」",
      ].join("\n"),
    },
    {
      id: "sec-retry",
      heading: "Deep dive ③：超时、重试、幂等与会话审计",
      secNum: "33.7",
      related: ["ch42", "ch37"],
      body: [
        "工具是短 RPC，必须有 **deadline**。模型会对同一意图再发一次 `tool_call`，网关自己也会在 5xx 时想重试——写路径上这是双花 / 双工单的来源。算法心智见 Ch42；本题特有的是 **retry_safe 位 + idempotency key**。",
        "",
        d2(`
shape: sequence_diagram
ag: "agent"
gw: "tool GW"
tl: "tool"
ag -> gw: "tool_call"
gw -> tl: "invoke 8s"
tl -> gw: "no reply"
gw -> ag: "timeout"
`),
        "",
        "超时：每条工具一个上限（教学 **8s** 读、写同样封顶）。到期 **abort 下游**，给 runtime 规范化 `tool_timeout`。不要把 Agent 回合卡在一个挂死的 HTTP 上。长任务不该伪装成同步工具——要么 MCP 侧返回 task handle（客户端再 poll），要么根本不是本章的短 RPC。",
        "",
        d2(`
grid-columns: 2
ry: {
  label: "retry"
  class: group
  grid-columns: 2
  a.class: ok
  a: "read 5xx"
  b.class: bad
  b: "not POST"
}
id: {
  label: "idempotency"
  class: groupOk
  grid-columns: 2
  c.class: ok
  c: "key on write"
  d.class: ok
  d: "replay same"
}
`),
        "",
        "| | 做什么 | 不要做什么 |",
        "|---|---|---|",
        "| **timeout** | 每调用必有上限；取消要传到下游 | 无限等；只超时 runtime 不杀连接 |",
        "| **retry** | 仅 `retry_safe`（只读 / 标了幂等）；**最多 1 次** + jitter | 对 4xx、对未标幂等的 POST 连打 |",
        "| **idempotency** | 写工具强制 key（调用方给，或 hash(session, step, name, args)） | 靠「模型应该不会重发」 |",
        "",
        "幂等存储：网关 `SET NX` key → 结果（成功体或错误码）+ TTL。同一 key 再来，**原样返回第一次结果**，不再打下游。HITL「批准两次」也走同一 key。这和支付题同一句话，只是调用方变成了会幻觉的模型。",
        "",
        "会话 / 审计和 MCP 协议 session 分开存：",
        "",
        d2(`
direction: right
rt.class: go
rt: "runtime"
gw.class: step
gw: "tool GW"
st.class: store
st: "audit sess"
rt -> gw -> st
`),
        "",
        "**本图引用**：存储选型（Ch37）、弹性（Ch42）。热路径可用 KV / 文档库按 `session_id` 查；冷路径对象存储或日志系统。",
        "",
        "每条 tool call 至少记：`session_id`、`tool_call_id`、tenant、工具名、args 摘要（脱敏）、策略结果（allow / deny / pending）、延迟、下游状态、幂等 key。这是排障和合规的最低盘。不要用「prompt 里的对话记录」代替——那会被截断，也进不了 SIEM。",
        "",
        "面试怎么说：",
        "",
        "> 「每个工具有超时。只对只读有界重试。写必须带 idempotency key。HITL 没 token 就不执行。审计按 session 落库，不是 MCP 握手 ID。」",
      ].join("\n"),
    },
    {
      id: "sec-2026",
      heading: "2026 vs 「Agent 里直接 axios」",
      secNum: null,
      related: [],
      body: [
        "<details>",
        "<summary>循环里 fetch 生产 API —— 现在默认怎么答</summary>",
        "",
        "早期 demo（以及很多 2024 教程）默认是：ReAct 循环里注册几个 Python 函数，函数内部 `axios` / `fetch` 打 CRM。能跑通，**不能当 2026 正文**。",
        "",
        "| 当时 / 早期工程 | 现在上场 |",
        "|---|---|---|",
        "| runtime 直连 URL + 一把 key | **tool gateway**；密钥和 allowlist 在网关 |",
        "| schema 写死在 prompt | 网关校验 JSON schema；catalog 按角色投影 |",
        "| 失败就再调一次 | 读才 retry_safe；写 **idempotency key** |",
        "| 写工具也自动跑 | 读自动、写 **HITL** |",
        "| 绑死一家 Agent SDK | model-facing 用各家 tool calling；server-facing 用 MCP 或 HTTP |",
        "| 不记调用 | session + audit；和 MCP 协议 session 分开 |",
        "| 把本题答成 cron 或编排 | 短 RPC 在本章；多步循环 Ch34；调度 Ch25 |",
        "",
        "正文第一答案用现在这套。折叠只防止你把「Agent 里直接 axios」讲成终稿。",
        "",
        "</details>",
      ].join("\n"),
    },
    {
      id: "sec-traps",
      heading: "追问陷阱",
      secNum: null,
      related: ["ch32", "ch25", "ch42"],
      body: [
        "1. **这不就是 API 网关吗？** → 鉴权/超时/审计和业务网关同构。特有的是 **模型给的 schema**、按 Agent 的 allowlist、HITL、以及模型会重复调用所以写路径必须幂等。",
        "2. **为什么不让模型直接 HTTP？** → 密钥、allowlist、超时、审计会漂到每个 runtime。一个幻觉参数就能打到生产。",
        "3. **MCP 和 function calling 选哪个？** → 两层。function calling 对模型；MCP 对工具 server。网关翻译。",
        "4. **为什么不全部用 MCP？** → 一两个内部 HTTP 硬上协议是 over-engineering。多客户端再收成 MCP。",
        "5. **失败为什么不自动重试？** → 4xx 是 schema/权限问题。未幂等的 POST 重试 = 双写。只读 + 有界。",
        "6. **这不就是 Ch25 调度吗？** → 调度是 cron/延迟/错过补偿。工具是回合内秒级 RPC。",
        "7. **模型路由呢？** → Ch32。本章假设 `tool_call` 已经从模型出来了。",
        "8. **多步 loop / handoff 呢？** → **多步循环在 Ch34。** 本章只执行一跳。",
        "9. **要不要语义缓存工具结果？** → 读可以短 TTL；写不要。别把 Ch32 语义缓存搬过来当正确性方案。",
        "10. **MCP 无状态了还要 session 库吗？** → 协议握手可以没。**业务审计 / HITL 挂起** 仍要存。",
      ].join("\n"),
    },
    {
      id: "sec-next",
      heading: "下一步",
      secNum: null,
      related: ["ch34", "ch32", "ch42"],
      body: [
        "合上页，用 30 秒口播 + 两张图（runtime → GW → MCP/HTTP、读/写对照）走一遍。能讲清 **网关为什么挡模型、两层协议、写路径为何要幂等和 HITL**，这题就过关。",
        "",
        "下一题预告：**Agent 编排与运行时**（多步循环、handoff、工作流、失败补偿）。本章只把一跳工具安全跑完。",
        "",
        "自测：白板左列假设（混合 MCP/HTTP、有写工具、8s 超时），中列三格链路，右列三个 deep dive 的 trade-off。",
      ].join("\n"),
    },
  ],
  reviewMd: `# Ch33 · 记忆闪卡

| # | 正面 | 背面 |
|---|---|---|
| 1 | 设计 Agent 工具平台，30 秒怎么开口？ | 模型只吐 tool_call；tool gateway 做 allowlist/schema/超时/幂等；MCP 或 HTTP 在后面；写路径 HITL。不绑 SDK。多步循环在 Ch34。 |
| 2 | 这题 hard part 是什么？ | ① 网关 + schema ② MCP vs HTTP（两层）③ 超时/有界重试/写路径幂等 + 权限。 |
| 3 | 该澄清哪几件事？ | 工具种类、读还是写、HITL、超时、凭据在谁手里、要不要 MCP、包不包括 loop。 |
| 4 | 和 Ch32 / Ch34 / Ch25 怎么划？ | Ch32 调模型。本章执行一跳工具。Ch34 才是多步循环。Ch25 是 cron，不是秒级 RPC。 |
| 5 | 为什么模型不能直连生产 API？ | 密钥、allowlist、超时、审计无法统一；幻觉参数会打到真系统。 |
| 6 | model-facing vs server-facing？ | function calling / tool use 给模型看 JSON schema。MCP 给工具 server。网关翻译。 |
| 7 | 教学 20 轮/秒怎么估工具 QPS？ | 每轮 3 次 → ~60 tool QPS。账在 RPC 和审计，不在 GPU。 |
| 8 | allowlist + schema 顺序？ | 先在不在 registry，再 allowlist（默认 deny），再 JSON schema，再 HITL/幂等，最后执行。 |
| 9 | 读 vs 写默认策略？ | 读：allowlist 内自动。写：HITL + idempotency key；没批准 token 不执行。 |
| 10 | 什么时候上 MCP，什么时候 HTTP？ | 多客户端、要标准发现 → MCP。一两个内部 API → HTTP 挂网关。混接合法。 |
| 11 | 超时和重试怎么说？ | 每调用有 deadline（教学 8s）。只对 retry_safe 有界重试。4xx 和未幂等 POST 不重试。 |
| 12 | 写工具为什么要 idempotency key？ | 模型和网关都可能重放。同一 key 返回第一次结果，避免双写。 |
| 13 | 审计存什么？是 MCP session 吗？ | session_id、调用、策略结果、延迟、脱敏 args。业务审计 ≠ 协议握手 ID。 |
| 14 | 2026 vs 循环里 axios？ | 现在默认网关 + 两层协议 + 写路径护栏。直连是 demo。 |
| 15 | 把每个微服务都注册成工具？ | red flag / over-engineering。工具是给模型的小产品面，不是 endpoint 目录。 |`,
});
