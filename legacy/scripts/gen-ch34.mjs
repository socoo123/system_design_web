import { writeChapter } from "./write-chapter.mjs";

const d2 = (src) => {
  const body = src.trim();
  const sized = /style\.font-size/.test(body) ? body : `style.font-size: 12\n${body}`;
  return "```d2\n" + sized + "\n```";
};

writeChapter({
  id: "ch34",
  num: "34",
  title: "设计 Agent 编排与运行时",
  kind: "ai",
  relatedChapters: ["ch33", "ch25", "ch32", "ch42"],
  sections: [
    {
      id: "intro",
      heading: "",
      secNum: null,
      related: [],
      body: [
        "> **预计**：50–70 分钟 ｜ **前置**：Ch33 工具平面；Ch32 调模型；Ch25 是 cron 不是本章",
        "> **目标**：多步循环、handoff、工作流 vs 自由循环、HITL、失败补偿。不绑 SDK，不重讲 MCP。",
        "",
        "面试官说「设计 Agent 编排 / runtime / 让模型多步调工具」，不是让你在服务里 `while True` 调模型，也不是背 LangGraph / OpenAI Agents 的 class 名。",
        "",
        "**谁跑循环：** runtime 持有一次 **run**。每步经 **Ch32** 调模型；模型若吐 `tool_call`，经 **Ch33** 执行，observation 写回 run。工具网关、MCP、allowlist、单跳幂等已经在 Ch33——本章**调用**那一层，不重讲。",
        "",
        "**hard part** 是三块：**loop vs workflow**（路径未知用有界 ReAct，路径已知用 state machine）、**run state + handoff**（落库、挂起、换 agent 不丢上下文）、**HITL + 失败补偿**（写工具审批；副作用用 compensating action，不是 retry forever）。画一个「Agent 循环」框却讲不清这三块，是 red flag。",
        "",
        "本章边界：",
        "",
        "- **工具网关 / MCP / 单跳超时幂等** → 已在 Ch33；这里只把 `tool_call` 交出去",
        "- **cron / 延迟作业 / 无模型 DAG** → Ch25；一张对照表，不重写调度器",
        "- **模型路由 / TPM** → 已在 Ch32；每步 LLM 都打那扇门",
        "- **GPU 集群 / 训练平台** → 预告 Ch35，不要在这张白板画机房",
        "- **RAG 管道 / 推荐 / PagedAttention** → 不是本章",
        "",
        "M5 铁律：**只做 LLM + Agent 基建，禁止推荐漏斗。** LangGraph、OpenAI Agents 只当 **pattern 例子**，不当架构。",
      ].join("\n"),
    },
    {
      id: "sec-pitch",
      heading: "面试怎么答（30 秒）",
      secNum: "34.1",
      related: [],
      body: [
        "开场不要画 LangGraph 全家桶，也不要报某家 Agents SDK 的 Runner 配置。先把评分信号打出来：这是 **model-in-the-loop 的运行时**，hard part 不在 logo。",
        "",
        "> 「这是 **Agent 编排与运行时**，不是再设计 Ch33，也不是 Ch25 的 cron。默认 **bounded ReAct/tool loop**：plan → tool_call → observe → 重复；**max steps** + stuck 检测；**run state 落库**。路径已知（退款、入职）用 **state machine / workflow**，模型只活在节点里。写工具 **HITL** 把 run 挂起。副作用失败走 **compensating action**（saga-like），不是对写路径 retry forever。每步 LLM 走 Ch32，工具走 Ch33。不绑 SDK。」",
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
        "| Step 1 澄清 | 路径是否已知、写不写数据、步数预算、单 agent 还是 handoff、失败补偿还是给人 |",
        "| Step 2 高层 | run store + bounded loop；一步经 Ch32 再经 Ch33；停条件在 runtime |",
        "| Step 3 deep dive | ① loop vs workflow ② run state + handoff ③ HITL + compensate |",
        "| Step 4 wrap-up | `while True`、无 max steps、写路径盲重试、一上来多 agent、把本题答成 cron 或 GPU |",
        "",
        "**red flag：** 无界循环；把 LangChain class 当架构；把 Ch33 MCP 再讲一遍；把 Ch25 调度器搬过来当 Agent；上 RAG / 推荐；报某厂内部 run QPS。",
      ].join("\n"),
    },
    {
      id: "sec-clarify",
      heading: "澄清问题",
      secNum: "34.2",
      related: ["ch33", "ch25", "ch32"],
      body: [
        "没问清「路径清不清楚、会不会改数据、步数谁砍」就画多 agent 图 = Jimmy。大约 6–8 个问题，其余自己假设写白板。",
        "",
        "| 你问 | 为什么问 | 典型假设（面试官说「你定」时） |",
        "|---|---|---|",
        "| 任务路径是开放探索，还是已知步骤（退款 / 入职）？ | 决定 loop 还是 workflow | **混合**：客服探索用 bounded loop；退款走 state machine |",
        "| 有没有写工具？HITL 谁批、批完怎么 resume？ | 写必须能把 run 挂起 | **有写**；写默认审批；批准后 runtime 从 checkpoint 续跑 |",
        "| 单次 run 的 step 预算、墙钟？ | 无界循环会打爆 Ch32 RPM | **max_steps = 12**；墙钟按分钟；stuck 则停 |",
        "| 一个 agent + 工具就够，还是必须 handoff？ | 过早拆多 agent 是 over-engineering | **先单 agent**；只有指令 / 工具 / 策略真不同才 handoff |",
        "| 中途失败：重试、补偿，还是丢给人？ | 副作用不能靠「再跑一遍」 | 读：有界重试（Ch33）；写：compensate 或 HITL，不 retry forever |",
        "| run 要不要跨进程恢复？ | 决定要不要持久化 | **要**；每步落 run store；HITL / 崩溃都能 resume |",
        "| 这题包不包括工具网关实现、GPU 集群？ | 防止画成 Ch33 / Ch35 | **不包括**；工具经 Ch33，模型经 Ch32，机房是 Ch35 |",
        "",
        "话术：",
        "",
        "> 「我假设：默认 bounded loop + 落库。退款这类已知路径用 workflow。写工具 HITL 挂起。失败对副作用 compensate。先单 agent，handoff 是可选。工具和模型网关不重画。方向 OK 吗？」",
      ].join("\n"),
    },
    {
      id: "sec-estimate",
      heading: "粗估（不要假装精确）",
      secNum: "34.3",
      related: ["ch32", "ch42"],
      body: [
        "这题的 back-of-envelope 是让面试官听见：**账在并发 run 和 step 预算，不在 GPU。** 禁止编造某厂内部数字。显存 / 批处理是 Ch35 的账。",
        "",
        "教学假设（写白板）：用户回合峰值 **20 /s**（和 Ch32 聊天 QPS 对齐）。平均每回合 **5** 次 LLM step（有的 1 次就停，有的打到 cap）。",
        "",
        "> 内环 LLM QPS ≈ 20 × 5 = **100**。Ch32 若按 20 chat QPS 估 TPM，Agent 题要把内环乘进去——**max_steps 是容量开关**，不是礼貌。工具次数仍可按 Ch33：平均每回合 ~3 次 → ~60 tool QPS。",
        "",
        "| 量 | 教学数 | 面试怎么开口 |",
        "|---|---|---|",
        "| 用户回合 | **20 /s** 峰值 | 和聊天同一量级；别套万级 CRUD |",
        "| 平均 LLM step | **5** | 1～cap 之间；用平均 |",
        "| **内环 LLM QPS** | **~100** | 打到 Ch32；无界循环会先打爆 RPM |",
        "| **max_steps** | **12** | 公开 SDK 常见默认约 20；面试按任务调 8–20 |",
        "| 热路径占用 | 5 × ~2s ≈ **10s** | 同步占 worker；HITL parked 不占 |",
        "| **并发 in-flight** | 20 × 10s ≈ **200** | 热循环里的 run；审批中的另计 |",
        "",
        "不要用 GPU / TTFT 撑场面。runtime 的 bottleneck 通常是：**内环 RPM（Ch32）、工具限额（Ch33）、run store 每步写入、HITL 队列深度。** 弹性细节链 Ch42。",
        "",
        "话术：",
        "",
        "> 「20 回合/秒、每回合 5 步，大约 100 次 LLM 调用。并发大约两百个热 run。步数预算先砍内环。存储是 run checkpoint，不是显存。」",
      ].join("\n"),
    },
    {
      id: "sec-arch",
      heading: "高层架构",
      secNum: "34.4",
      related: ["ch32", "ch33", "ch42"],
      body: [
        "要 buy-in：**一张图讲清有界循环，不要把 MCP 集群和 GPU 画进来。** 模型在 Ch32，工具在 Ch33，停条件在 runtime。",
        "",
        d2(`
direction: right
pl.class: go
pl: "plan"
ac.class: step
ac: "act"
ob.class: store
ob: "observe"
sp.class: ok
sp: "stop"
pl -> ac -> ob -> sp
`),
        "",
        "四个叶子就是一次 run 的骨架：模型 plan（经 Ch32）；act 是 `tool_call`（经 Ch33）；observe 写回 messages；**stop 是 runtime 的条件，不是模型自觉。** observe 之后若未停，下一拍再 plan——图画成链，避免 12 步 ReAct 塔。",
        "",
        "停条件叠在一起（面试按这个说）：",
        "",
        "1. 模型不再吐 `tool_call`（正常结束）",
        "2. **max_steps** 用尽（教学 12）",
        "3. **stuck**：同一 `(tool, args)` hash 连续约 3 次，或 observation 无进展",
        "4. 墙钟 / 错误预算打满",
        "5. HITL deny、用户取消、补偿结束",
        "",
        "公开实现里，Vercel AI SDK 一类默认 `stepCountIs(20)`；OpenAI Agents 的 Runner 也是「调模型 → tool 或 handoff → 再跑」直到最终输出。面试第一答案是 **有界循环 + 持久化 run**，不要把默认数字当 SLA。",
        "",
        "一步穿过两张已有网关（本图不重画 MCP）：",
        "",
        d2(`
shape: sequence_diagram
rt: "runtime"
llm: "LLM GW"
gw: "tool GW"
rt -> llm: "chat step"
llm -> rt: "tool_call"
rt -> gw: "invoke"
gw -> rt: "observe"
`),
        "",
        "**本图引用**：弹性（Ch42）。LLM GW 是 Ch32；tool GW 是 Ch33。runtime 每步前后写 run store，图上省略以免超 4 个参与者。",
        "",
        "| 件 | 干什么 | 面试怎么说 |",
        "|---|---|---|",
        "| **runtime** | 步进、停条件、挂起、handoff | 唯一持有 loop 的地方 |",
        "| **run store** | messages、step、agent id、副作用栈 | 崩溃 / HITL 都能 resume |",
        "| **Ch32** | 每步一次 chat | 内环 QPS 走它的 TPM/RPM |",
        "| **Ch33** | 执行一跳工具 | allowlist / 幂等 / 单跳 HITL 策略在那边 |",
        "",
        "### 和 Ch25 任务调度对照",
        "",
        "Ch25 是 **后端 cron / 延迟作业 / 无模型 DAG**。本章每一步都可能调模型。一张表就够，不要把抢锁调度器再设计一遍。",
        "",
        "| | Ch25 任务调度 | 本章 Agent runtime |",
        "|---|---|---|",
        "| 触发 | cron、delay、事件 | 用户回合 / API 开一个 `run_id` |",
        "| 每步 | 确定代码 | **调模型**（Ch32），再可能调工具（Ch33） |",
        "| DAG | 作业依赖、错过补偿 | 已知路径才用 **state machine**（节点里仍可有 LLM） |",
        "| 失败 | 重跑作业、错过补跑 | 步数预算；副作用 **compensate** |",
        "| 状态 | job row | **run state**（messages + step + agent） |",
        "",
        "话术：",
        "",
        "> 「runtime 跑有界循环。每步打 Ch32，工具打 Ch33。停条件在 runtime。run 落库。Ch25 是没模型的 cron，别混。方向 OK 的话我挖 loop vs workflow、handoff、HITL 和补偿。」",
      ].join("\n"),
    },
    {
      id: "sec-loop",
      heading: "Deep dive ①：loop vs workflow",
      secNum: "34.5",
      related: ["ch25"],
      body: [
        "2026 默认面试答案：**路径未知 → bounded ReAct/tool loop；路径已知 → state machine / workflow。** 两者都能在节点里调模型，差别是 **谁决定下一步**。",
        "",
        "- **Loop：** 下一步由模型选工具。适合诊断、检索、开放客服——设计时画不出固定边。必须有 max steps / stuck / 墙钟，否则 token 和副作用都会漂。",
        "- **Workflow：** 边是代码。适合退款、入职、关单：先核单 → 资格 → 打款 → 通知。模型活在节点里（抽字段、分类、写话术），**不能跳过合规边**。失败走确定的补偿边，而不是让模型再「想一下」。",
        "",
        d2(`
grid-columns: 2
lp: {
  label: "bounded loop"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "path unknown"
  b.class: ok
  b: "max steps"
}
wf: {
  label: "workflow"
  class: group
  grid-columns: 2
  c.class: step
  c: "path known"
  d.class: step
  d: "state machine"
}
`),
        "",
        "| | bounded loop | workflow / state machine |",
        "|---|---|---|",
        "| 谁选下一步 | 模型 | **代码 / 边** |",
        "| 何时用 | 探索、工具顺序事先不知道 | 退款、入职、关单、合规清单 |",
        "| 停 | max steps + stuck + 最终答案 | 到达终态；超时进补偿或人工 |",
        "| 测试 | 难；靠 trace 和预算 | 节点可单测；边可穷举 |",
        "| 坑 | 无界 = RPM 炸弹；写路径乱跑 | 把开放任务画成 12 节点 DAG = 脆 |",
        "",
        "LangGraph 一类把「有状态的图 + checkpoint + interrupt」做成库；OpenAI Agents 的 Runner 则是 loop + 可选 handoff。面试说 **pattern**：持久化图 / 有界循环，**不要**把 `StateGraph` / `AgentExecutor` 写在白板上当组件名。手写十几个状态、不需要跨天审批时，硬上图引擎是 over-engineering。",
        "",
        "生产里常见 **杂交**：外层 workflow（必须经过的门），某个节点内部再开一小段 bounded loop（那个子问题路径未知）。外层仍保证退款不会跳过资格检查。",
        "",
        "和 Ch25 的 DAG：那边节点是 **无模型作业**。这边 workflow 的节点经常 **还要调 LLM**。别说「所以我用任务调度系统跑 Agent」——那是把 model-in-the-loop 塞进 cron worker，HITL 和 step 预算都会别扭。",
        "",
        "面试怎么说：",
        "",
        "> 「默认有界 loop + 落库。退款这种边写得清的用 state machine，模型不准改边。别把开放任务画成大 DAG，也别让退款靠模型自觉。」",
      ].join("\n"),
    },
    {
      id: "sec-handoff",
      heading: "Deep dive ②：run state 与 handoff",
      secNum: "34.6",
      related: ["ch37", "ch42"],
      body: [
        "无持久化的 loop 只能当 demo：进程一死，HITL 一隔夜，上下文就没了。2026 默认：**每个 `run_id` 一行（或一篇文档）**，每步写完再调下一拍模型。",
        "",
        "最少字段：`run_id`、tenant、status（`running` / `paused_hitl` / `compensating` / `done` / `failed`）、`step_count`、`current_agent`、messages（或对象存储指针）、最后一次 tool fingerprint（stuck 用）、**副作用栈**（补偿用）。热路径按 `run_id` 查；这是存储选型题，链 Ch37，不要在这张白板选品牌。",
        "",
        "**先单 agent + 工具。** 公开编排指南（OpenAI Agents 一类）也是：指令、工具、策略没有实质分叉就不要拆。过早多 agent = 更多 prompt、更多 trace、更多审批面，是 over-engineering。",
        "",
        "真要拆，分清两种 **ownership**（名字当 pattern，不绑 SDK）：",
        "",
        "- **handoff：** 专科拿走对话。账单问题交给 billing agent，它对用户说话。runtime 改 `current_agent`，**同一个 `run_id`**。",
        "- **agent-as-tool：** 经理仍对用户负责，专科只做摘要 / 分类这种有界任务，结果回经理。控制权不转。",
        "",
        d2(`
direction: right
aA.class: go
aA: "agent A"
rs.class: store
rs: "run state"
aB.class: ok
aB: "agent B"
aA -> rs -> aB
`),
        "",
        "handoff 走 **共享 run state**，不是把整段 transcript 盲拷到另一个进程。过滤：丢掉对方不该看见的工具结果、收窄 messages、换一套 allowlist 投影（投影规则仍在 Ch33，runtime 只换角色）。盲传全部历史会把策略隔离打穿。",
        "",
        "| | 做什么 | 不要做什么 |",
        "|---|---|---|",
        "| 单 → 多 | 指令 / 工具 / 政策真的分叉再拆 | 一上来画 8 个专家 |",
        "| handoff | 改 `current_agent`；同一 run | 新开 run 丢副作用栈 |",
        "| 上下文 | 过滤后再交给 B | 整包 transcript + 对方的密钥 scope |",
        "| as-tool | 经理合成最终回答 | 用户被来回甩锅还不记账 |",
        "",
        "崩溃恢复：worker 无状态，lease 一个 `running` 的 run，从最后 checkpoint 续。和 Ch25「抢作业」像，但续的是 **带模型上下文的步进**，不是重跑整个 cron。lease 超时要能接走——别让两个 worker 同时步进同一 `run_id`（fencing / 版本号，心智链 Ch42 / 锁的章）。",
        "",
        "面试怎么说：",
        "",
        "> 「run 每步落库。先单 agent。handoff 是换 current_agent、共用 run state，要过滤上下文。别把多 agent 当默认架构。」",
      ].join("\n"),
    },
    {
      id: "sec-hitl",
      heading: "Deep dive ③：HITL 与失败补偿",
      secNum: "34.7",
      related: ["ch33", "ch41"],
      body: [
        "写工具的审批策略在 **Ch33**（`approval_required`、批准 token、没 token 不执行）。本章的 hard part 是 **runtime 怎么停、怎么续、副作用已经发生了怎么办。**",
        "",
        d2(`
grid-columns: 2
au: {
  label: "auto"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "read tool"
  b.class: ok
  b: "keep looping"
}
ap: {
  label: "approve"
  class: groupBad
  grid-columns: 2
  c.class: warn
  c: "write tool"
  d.class: warn
  d: "pause run"
}
`),
        "",
        "HITL 不是 prompt 里写「请谨慎」。网关返回 `pending` 时，runtime 把 status 打成 `paused_hitl`，checkpoint 已写入，**释放 worker**。人批 / 改 / 拒之后带短 TTL token 再唤醒。拒绝 = 本跳不执行，模型看到规范化 `denied`，可以改计划或结束——不要把拒绝当 5xx 去重试写工具。",
        "",
        "不可逆动作（对外打款、已发送邮件）把 **interrupt 放在副作用之前**。先 HITL 再 invoke，比先发出去再补偿便宜。",
        "",
        "失败分类（和 Ch33 对齐，不重讲网关）：",
        "",
        "- **瞬时 + retry_safe：** 有界重试（Ch33 已经限次数）。runtime 不要再套一层无限重试。",
        "- **schema / 权限 4xx：** 回给模型或停；不要重放。",
        "- **已经产生的副作用：** **compensate**，不要「把整段 loop 再跑一遍」。",
        "",
        d2(`
grid-columns: 2
ry: {
  label: "retry"
  class: group
  grid-columns: 2
  a.class: ok
  a: "transient"
  b.class: bad
  b: "not writes"
}
cp: {
  label: "compensate"
  class: groupOk
  grid-columns: 2
  c.class: ok
  c: "side effect"
  d.class: ok
  d: "undo action"
}
`),
        "",
        "这是 saga-like（论文与业务细节在 Ch41）：每个写工具在 registry 里配对 **compensating action**（下单↔取消、预扣↔释放、收费↔退款）。失败从副作用栈 **逆序** 补偿。补偿自己也要走 Ch33 的 **idempotency key**——crash 会重放补偿，不能补两次变成新事故。",
        "",
        "| | 做什么 | 不要做什么 |",
        "|---|---|---|",
        "| retry | 瞬时、只读、已标幂等 | 对未幂等 POST / 已成功的写 **retry forever** |",
        "| compensate | 逆序 undo；补偿也幂等 | 假装 2PC 能跨 CRM 和支付 |",
        "| 不可逆 | 事先 HITL；或只能正向致歉 | 以为能 unsend 邮件 |",
        "| 补偿失败 | 记 DLQ / 人工；status=`failed` | 吞掉，假装 run 成功 |",
        "",
        "Agent 没有跨 SaaS 的分布式事务。补偿是 **语义上往回走**，不是原子回滚。超时后不知道下游成没成功——所以 Ch33 的幂等键两边都要：forward 和 compensate 都可能再来一次。",
        "",
        "面试怎么说：",
        "",
        "> 「写工具 HITL：runtime 停 run、放 worker，批完再续。已发生的副作用走 compensating action，逆序、幂等。不要对写路径 retry forever。单跳幂等在 Ch33。」",
      ].join("\n"),
    },
    {
      id: "sec-2026",
      heading: "2026 vs 「while True 调模型」",
      secNum: null,
      related: [],
      body: [
        "<details>",
        "<summary>进程里死循环调模型 —— 现在默认怎么答</summary>",
        "",
        "早期 demo（以及很多 2023–2024 教程）默认是：`while True` 调 completion，解析一段 Thought/Action，本地函数直连生产。能跑通，**不能当 2026 正文**。",
        "",
        "| 当时 / 早期工程 | 现在上场 |",
        "|---|---|---|",
        "| `while True` 调模型 | **bounded loop**；max steps + stuck hash + 墙钟 |",
        "| messages 只在内存 | **run state 落库**；HITL / 崩溃可 resume |",
        "| 路径未知也硬画大 DAG / 已知路径也纯 ReAct | 未知 → loop；已知 → **workflow**；可杂交 |",
        "| 一上来多 agent 群聊 | **先单 agent + 工具**；handoff 共用 run state |",
        "| 写失败就再跑一遍 loop | **compensating action**；写路径不 retry forever |",
        "| 写工具自动跑 | **HITL** 挂起 run（策略在 Ch33，暂停在本章） |",
        "| 绑死 LangChain class / 某家 Runner | pattern：有界循环、checkpoint、handoff；**不绑 SDK** |",
        "| 把本题答成 cron 或 GPU 池 | 无模型作业是 Ch25；机房是 Ch35 |",
        "",
        "正文第一答案用现在这套。折叠只防止你把「while True 调模型」讲成终稿。",
        "",
        "</details>",
      ].join("\n"),
    },
    {
      id: "sec-traps",
      heading: "追问陷阱",
      secNum: null,
      related: ["ch33", "ch25", "ch32"],
      body: [
        "1. **这不就是 while 调模型吗？** → 差在停条件、落库、HITL 挂起、补偿。无界循环是 RPM 与副作用事故。",
        "2. **为什么不一切都用 ReAct？** → 退款 / 入职边是合规。模型不能改边。已知路径用 workflow。",
        "3. **为什么不一切都用 DAG？** → 开放任务画死边会脆。那是 over-engineering。",
        "4. **这不就是 Ch25 调度吗？** → 调度无模型。本章每步都可能打 Ch32。对照表一句，不要重写抢锁。",
        "5. **MCP / allowlist 呢？** → **Ch33。** 本章只 invoke。",
        "6. **模型路由 / TPM 呢？** → **Ch32。** 内环 QPS 乘 step 预算。",
        "7. **为什么先单 agent？** → 没分叉就拆，prompt 和审批面膨胀。handoff 要 ownership 真的转。",
        "8. **handoff 为什么不新开 run？** → 副作用栈和审批挂在同一个 `run_id`。拆 run 容易补漏。",
        "9. **失败为什么不一直重试？** → 写路径会双花。瞬时只读才 retry；其余 compensate 或 HITL。",
        "10. **LangGraph 是不是标准答案？** → 它是 checkpoint + interrupt 的一个实现。白板画 pattern，不画 class。",
        "11. **GPU 怎么扩？** → **Ch35。** 本章并发的是 run，不是卡。",
      ].join("\n"),
    },
    {
      id: "sec-next",
      heading: "下一步",
      secNum: null,
      related: ["ch35", "ch33", "ch25"],
      body: [
        "合上页，用 30 秒口播 + 两张图（plan→act→observe→stop、一步经 Ch32/Ch33）走一遍。能讲清 **何时 loop、何时 workflow、run 为何落库、写路径为何 HITL 和补偿**，这题就过关。",
        "",
        "下一题预告：**大模型基础架构**（模型仓库、GPU 集群调度、显存与批处理、灰度回滚、多租户）。本章只把 **一次 run 的循环** 跑在控制面上；卡怎么排是 Ch35。",
        "",
        "自测：白板左列假设（混合 loop/workflow、有写工具、max_steps=12），中列有界循环 + 一跳时序，右列三个 deep dive 的 trade-off。",
      ].join("\n"),
    },
  ],
  reviewMd: `# Ch34 · 记忆闪卡

| # | 正面 | 背面 |
|---|---|---|
| 1 | 设计 Agent 编排与运行时，30 秒怎么开口？ | bounded ReAct/tool loop + 落库；已知路径用 workflow；写工具 HITL；副作用 compensate。工具 Ch33，模型 Ch32。不绑 SDK。 |
| 2 | 这题 hard part 是什么？ | ① loop vs workflow ② run state + handoff ③ HITL + 失败补偿。 |
| 3 | 该澄清哪几件事？ | 路径是否已知、写不写、步数/墙钟、单 vs handoff、补偿还是给人、要不要持久化。 |
| 4 | 和 Ch33 / Ch32 / Ch25 / Ch35 怎么划？ | Ch33 执行一跳。Ch32 每步 LLM。Ch25 无模型 cron。Ch35 才是 GPU 平台。 |
| 5 | 默认为什么是 bounded loop？ | 路径未知时模型选工具。必须有 max steps、stuck、墙钟，否则 RPM 和副作用失控。 |
| 6 | 何时改用 workflow？ | 退款、入职等边写得清。模型只活在节点，不能跳过合规边。 |
| 7 | 教学 20 回合/秒怎么估？ | 平均 5 LLM step → ~100 内环 QPS；热占用 ~10s → ~200 并发 run。账在 step 预算，不在 GPU。 |
| 8 | 停条件有哪些？ | 无 tool_call、max_steps、stuck hash、墙钟/错误预算、HITL deny、补偿结束。 |
| 9 | stuck 怎么检？ | 同一 (tool, args) hash 连续约 3 次，或 observation 无进展。再加步数也救不了。 |
| 10 | 为什么 run 要落库？ | HITL 隔夜、进程崩溃、handoff 都要同一 checkpoint。内存 loop 是 demo。 |
| 11 | 何时 handoff，何时单 agent？ | 先单 agent + 工具。指令/工具/策略真分叉才转 ownership。as-tool 则经理仍答用户。 |
| 12 | handoff 传什么？ | 同一 run_id 上改 current_agent；过滤 messages 和 allowlist。不要盲拷 transcript、不要新开 run 丢副作用栈。 |
| 13 | HITL 时 runtime 做什么？ | status=paused_hitl，放 worker；批准 token 后续跑。拒绝回模型，不把 deny 当写路径 5xx 重试。 |
| 14 | 失败为什么不 retry forever？ | 写会双花。瞬时只读走 Ch33 有界重试；已发生副作用走 compensating action（saga-like，幂等键仍在 Ch33）。 |
| 15 | 2026 vs while True？ | 现在默认有界循环 + 落库 + 已知路径用图 + HITL + 补偿。死循环直连生产是 demo。 |`,
});
