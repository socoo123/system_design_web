import { writeChapter } from "./write-chapter.mjs";

const d2 = (src) => {
  const body = src.trim();
  const sized = /style\.font-size/.test(body) ? body : `style.font-size: 12\n${body}`;
  return "```d2\n" + sized + "\n```";
};

writeChapter({
  id: "ch35",
  num: "35",
  title: "大模型基础架构",
  kind: "ai",
  relatedChapters: ["ch29", "ch32", "ch42"],
  sections: [
    {
      id: "intro",
      heading: "",
      secNum: null,
      related: [],
      body: [
        "> **预计**：50–70 分钟 ｜ **前置**：单次推理在 Ch29；网关 Ch32",
        "> **目标**：模型仓库、GPU 调度、灰度回滚、多租户。本章是**平台**，不重讲 PagedAttention。",
        "",
        "面试官说「设计 LLM 平台 / 模型基础设施 / 你们怎么管 GPU 和模型版本」，不是让你再讲一遍单卡怎么 decode，也不是开一张加速卡报价单。",
        "",
        "**谁托管谁：** **Ch32** 网关按 `model` 别名把流量打进来。本章是后面的 **平台**：registry 里有哪几个不可变版本、调度器把哪几张卡编成池、池里跑的是一队 **Ch29 worker**。引擎怎么分页 KV、怎么 continuous batching，已经在 Ch29——这里把它们当成 **有状态的 replica 舰队**。",
        "",
        "**hard part** 是三块：**模型版本 / registry**（权重不可变、别名可切、LoRA 只点一句）、**GPU 调度 + 集群级显存/批策略**（binpack vs spread；KV 命中和批配额是调度策略，不是内核）、**多租户隔离 + canary / rollback**（配额、noisy neighbor、数据隔离；新权重要能灰、能撤）。画一个「GPU 集群」框却讲不清这三块，是 red flag。",
        "",
        "本章边界：",
        "",
        "- **PagedAttention / continuous batching / TTFT vs TPS / prefill–decode** → 已在 **Ch29**；点到即可，不重讲 kernel",
        "- **路由、TPM 计费、语义缓存** → 已在 **Ch32**；网关**消费**本平台托管的模型",
        "- **工具 / MCP / HITL / Agent 循环** → Ch33 / Ch34；不是本章主线",
        "- **训练平台 / 全套 MLOps** → 选修暂停。Fine-tune / LoRA 最多一句",
        "- **推荐漏斗** → 禁止",
        "",
        "M5 铁律：**只做 LLM + Agent 基建。** 2026 默认：面试「设计 LLM 平台」= registry + GPU pool scheduler + isolation + rollout。",
      ].join("\n"),
    },
    {
      id: "sec-pitch",
      heading: "面试怎么答（30 秒）",
      secNum: "35.1",
      related: [],
      body: [
        "开场不要画机房拓扑，也不要报某家加速卡型号表。先把评分信号打出来：这是 **控制面 + 加速器池**，hard part 不在 logo。",
        "",
        "> 「这是 **大模型基础架构**，不是再设计一遍 Ch29。默认 **model registry**：权重不可变版本 + `prod` / `canary` 别名；可选 LoRA 是绑在某个 base 上的小 artifact。**GPU 调度**对在线推理默认 binpack 提高利用率，对延迟敏感副本 spread 防单点。集群策略管 **KV 亲和路由** 和 **每 replica 的批/并发配额**——分页怎么做是 Ch29。发版 **canary 新权重**，SLO 破了 **rollback 别名**。多租户用 **quota + 槽位隔离**，敏感数据不要共用 prefix cache。Ch32 打别名，本平台托管舰队。」",
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
        "| Step 1 澄清 | 几个模型、是否多租户、在线 vs 批、灰度对象（prompt 还是权重）、回滚 SLO |",
        "| Step 2 高层 | registry → scheduler → GPU pool → Ch29 workers；网关消费别名 |",
        "| Step 3 deep dive | ① registry / 版本 ② 集群调度 + 显存批策略 ③ 隔离 + canary/rollback |",
        "| Step 4 wrap-up | 无版本乱覆盖、无回滚、租户抢槽、把本题答成 PagedAttention 或训练平台 |",
        "",
        "**red flag：** 把 Ch29 kernel 再讲一遍；K8s YAML 当架构；A100/H100 价目表；绑死一家云 SKU；报某厂内部卡数；上推荐。",
      ].join("\n"),
    },
    {
      id: "sec-clarify",
      heading: "澄清问题",
      secNum: "35.2",
      related: ["ch29", "ch32"],
      body: [
        "没问清「几个模型、几家租户、灰度的是 prompt 还是权重」就画 GPU 拓扑 = Jimmy。大约 6–8 个问题，其余自己假设写白板。",
        "",
        "| 你问 | 为什么问 | 典型假设（面试官说「你定」时） |",
        "|---|---|---|",
        "| 同时服务几个 **model id**？要不要多版本并存？ | 决定池怎么切、registry 有没有别名 | **2 个 chat 模型**；每个至少 `prod` + 可选 `canary` |",
        "| 单团队内部，还是 **多租户** 平台？ | 隔离和配额是不是 hard part | **多租户**：内部业务线，不是公有云超大规模 |",
        "| 流量是交互聊天，还是离线批？ | binpack / 池隔离 / SLO 会分叉 | **在线为主**；批走另外的低优先级池 |",
        "| 发版灰度的是 **权重**、**prompt**，还是两者？ | prompt 灰便宜；权重灰要占 GPU | **都能灰**；默认先 prompt，再 10% 权重 canary |",
        "| 回滚要多快？旧版本 replica 能不能立刻放掉？ | 权重加载是分钟级，空池 rollback 会裸奔 | **保留 v1 直到 v2 稳定**；SLO 破了切回别名 |",
        "| 租户数据能不能进共享 prefix cache？ | 决定 KV 亲和能不能跨租户 | **默认隔离**：共享池只共享槽位，不共享敏感前缀 |",
        "| 这题包不包括训练、单请求引擎内核？ | 防止画成 MLOps 或 Ch29 | **不包括**；LoRA 一句；kernel 指 Ch29 |",
        "",
        "话术：",
        "",
        "> 「我假设：内部多租户平台，两三个在线模型，registry 管不可变版本。调度 binpack 利用率、关键副本 spread。发版先 canary 再切别名，能 rollback。引擎舰队是 Ch29，网关是 Ch32。方向 OK 吗？」",
      ].join("\n"),
    },
    {
      id: "sec-estimate",
      heading: "粗估（不要假装精确）",
      secNum: "35.3",
      related: ["ch42"],
      body: [
        "这题的 back-of-envelope 是让面试官听见：**账在 GPU 张数和 replica 槽位，不在 page table。** 禁止编造某厂内部卡数，禁止报加速卡价目。单卡 KV 怎么分页是 Ch29。",
        "",
        "教学假设（写白板）：和 Ch32 对齐，聊天峰值 **20 req/s**。平均一次生成占 replica **~8 s** → 大约 **160** 条并发序列（in-flight，不是裸 QPS）。",
        "",
        "> 集群给每个 Ch29 worker 设 **slot 预算**（例如 `max_num_seqs ≈ 32`）：这是平台 SLO，不是引擎内部怎么切页。160 / 32 ≈ **5** 个 prod replica。canary 再加 **1** 个 v2 replica（约 10% 容量对 10% 流量）。第二个小模型另开 **2** replica。关键池 spread 到 ≥2 台机器。",
        "",
        "| 量 | 教学数 | 面试怎么开口 |",
        "|---|---|---|",
        "| 峰值请求 | **20 /s** | 和网关同一量级；别套万级 CRUD |",
        "| 并发序列 | **~160** | 占着 KV 槽的会话；QPS 会骗人 |",
        "| 每 replica 槽位 | **~32** | 平台配额；打满就排队/429，不靠超订 |",
        "| **prod replica** | **~5** | 一个热模型的舰队 |",
        "| **canary 额外** | **+1** | 发版窗口多占卡；稳定后再收回 v1 |",
        "| **教学 GPU 规模** | **8–16** | 两模型 + 灰度头 + 故障域；不是「买两张卡跑 vLLM」 |",
        "",
        "加载 70B 级权重往往是 **分钟级**（Ch29 已经说过）。粗估时要说：**扩容来不及挡突发，所以预留 canary/HA 头，而不是假设 Pod 秒扩。** 弹性细节链 Ch42。",
        "",
        "话术：",
        "",
        "> 「按并发序列除以每卡槽位估 replica。教学就说八到十六张卡量级的小平台。钱在并发槽和发版双跑，不在某张卡的标价。」",
      ].join("\n"),
    },
    {
      id: "sec-arch",
      heading: "高层架构",
      secNum: "35.4",
      related: ["ch32", "ch39", "ch42"],
      body: [
        "要 buy-in：**一张链讲清平台，不要把 PagedAttention 画进来。** Ch32 打别名；本平台登记版本、排卡、拉起 Ch29 舰队。",
        "",
        d2(`
direction: right
reg.class: go
reg: "registry"
sch.class: step
sch: "scheduler"
pool.class: store
pool: "GPU pool"
wk.class: ok
wk: "Ch29 workers"
reg -> sch -> pool -> wk
`),
        "",
        "**本图引用**：无状态的是网关不是 worker（Ch39）；池的弹性、排队、慢加载（Ch42）。网关怎么路由/计费是 Ch32，本图不重画。",
        "",
        "| 件 | 干什么 | 面试怎么说 |",
        "|---|---|---|",
        "| **registry** | 不可变权重 + 别名 + 元数据 | 热路径读别名，不读「最新文件名」 |",
        "| **scheduler** | 把 replica 放到卡/节点上 | binpack 或 spread；不是 round-robin HTTP |",
        "| **GPU pool** | 按模型/优先级切开的加速器集合 | 在线池和批池不要混 SLO |",
        "| **Ch29 workers** | 真正跑推理的引擎 replica | 有状态：KV 在卡上；当舰队管 |",
        "| **Ch32** | 业务看到的 API | **消费** 别名；本平台 **托管** 模型 |",
        "",
        "和单次推理路径怎么拆（面试主动画这张，避免跑题）：",
        "",
        d2(`
grid-columns: 2
one: {
  label: "Ch29 单次路径"
  class: group
  grid-columns: 2
  a.class: step
  a: "PagedAttention"
  b.class: step
  b: "continuous batch"
}
plat: {
  label: "Ch35 平台"
  class: groupOk
  grid-columns: 2
  c.class: ok
  c: "registry"
  d.class: ok
  d: "GPU fleet"
}
`),
        "",
        "话术：",
        "",
        "> 「registry 出版本，scheduler 排卡，池里是一队 Ch29 worker。网关只认别名。方向 OK 的话我挖版本、调度和灰度隔离。」",
      ].join("\n"),
    },
    {
      id: "sec-registry",
      heading: "Deep dive ①：模型仓库与版本",
      secNum: "35.5",
      related: ["ch37"],
      body: [
        "2026 默认：**权重是不可变 artifact，别名才是可变指针。** 热路径禁止「覆盖同一个 `model.safetensors`」。公开 registry 心智（MLflow Model Registry / Hugging Face revision、KServe 的 model name + 版本）都是这个 pattern，白板不要写产品名当组件。",
        "",
        "最少字段：`model_id`、**content hash**、存储 URI（对象存储，链 Ch37）、dtype / 上下文窗口、谁批准上线、兼容的推理镜像。别名：`prod`、`canary`、`staging`。切流量 = 改别名或改权重（下一节），**不是** SSH 去 replica 上拷文件。",
        "",
        "LoRA / adapter：**一句就够**——adapter 当独立小版本，必须 pin 到某一个 base checkpoint（量化、rope、dtype 不一致会静默出垃圾）；能热挂在已加载的 base 上，不必为每个客户重装 70B。不要把本章答成训练平台。",
        "",
        "Prompt 也是版本：系统提示、工具 schema、解码参数可以和权重解耦。**先灰 prompt 再灰权重**通常更便宜——prompt 不占第二份 GPU。Gateway API Inference Extension 一类公开设计还把 **LoRA adapter 的增量 rollout** 当成一等公民：同一 base 舰队上切 adapter，比换 base 便宜。",
        "",
        "| | 做什么 | 不要做什么 |",
        "|---|---|---|",
        "| 权重 | 不可变 + hash；加载前校验 | 原地覆盖 prod 文件 |",
        "| 别名 | `prod` / `canary` 可原子切 | 客户端写死 replica IP |",
        "| adapter | 绑 base；单独版本号 | 假设任意 base 都能插 |",
        "| prompt | 独立版本，可先灰 | 把 prompt 和权重绑成一次大爆炸发布 |",
        "",
        "面试怎么说：",
        "",
        "> 「registry 里版本不可变，prod 只是别名。LoRA 是可选小包，必须钉死 base。prompt 可以单独灰。不要覆盖正在服务的文件。」",
      ].join("\n"),
    },
    {
      id: "sec-sched",
      heading: "Deep dive ②：GPU 调度与集群批策略",
      secNum: "35.6",
      related: ["ch39", "ch42"],
      body: [
        "卡很贵，所以调度的第一句 trade-off 是 **binpack vs spread**。K8s 心智：LeastAllocated 偏 spread，MostAllocated 偏 pack——面试说策略，不写 YAML、不上 DRA 细节。",
        "",
        d2(`
grid-columns: 2
bp: {
  label: "binpack"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "fill node"
  b.class: ok
  b: "high util"
}
sp: {
  label: "spread"
  class: group
  grid-columns: 2
  c.class: step
  c: "HA first"
  d.class: step
  d: "more nodes"
}
`),
        "",
        "| | binpack | spread |",
        "|---|---|---|",
        "| 目标 | 填满已有节点，少开机器 | replica 散开，单机挂了不团灭 |",
        "| 何时 | 内部利用率优先、同 SLO 的在线池 | 延迟关键、要跨故障域 |",
        "| 坑 | noisy neighbor、维修面集中 | 碎片多、空卡烧钱 |",
        "",
        "教学默认：**同一模型的 prod 舰队 spread 到 ≥2 节点**；同一节点上的小模型 / 批任务 **binpack**。不要全站只选一个极端。",
        "",
        "**MIG / fractional GPU：** 一句——MIG 把一张卡切成硬件隔离的小实例，适合多租户小模型；time-slicing / 软分数隔离弱，只适合开发或可抢占批。不要把分数 GPU 讲成生产聊天的默认。",
        "",
        "显存与批处理在本章是 **集群策略**，不是 Ch29 的分页实现：",
        "",
        "1. **每 replica 槽位上限**（`max_num_seqs` 一类）由平台发布成容量。超了排队或 429，禁止靠超订 KV「再塞一条」。",
        "2. **KV / prefix 亲和：** 公开 serving 栈（Gateway API Inference Extension、llm-d Endpoint Picker）把请求送到 **已经有这段 prefix KV 的 replica**，减少重复 prefill。这是 **路由政策**。页怎么分配仍是 Ch29。",
        "3. **池隔离：** 长上下文 / 批 / 延迟敏感不要挤同一个 batch 槽——否则交互被长 prefill 拖死。分开池，比在一张卡上调 kernel 旋钮更像平台题。",
        "4. 换模型或换 LoRA 后，旧 KV **作废**；调度器不能把请求粘在已经卸载的版本上。",
        "",
        "面试怎么说：",
        "",
        "> 「在线关键副本 spread，利用率用 binpack。槽位是集群配额。KV 亲和是为了命中 prefix，不是再讲 PagedAttention。MIG 只给需要硬隔离的小模型。」",
      ].join("\n"),
    },
    {
      id: "sec-rollout",
      heading: "Deep dive ③：灰度回滚与多租户隔离",
      secNum: "35.7",
      related: ["ch32", "ch42"],
      body: [
        "换权重不是发个 jar。新 replica **先加载再接流量**；加载失败不得切 `prod`。公开实践（KServe LLMInferenceService canary）：两个版本并存，**按权重切流量**，随时把权重打回去；文档还提醒 **不要用 weight=0 的 dark 部署再突然拉高**——网关可能没预热后端。教学就说：**canary 至少吃真实的一小撮流量。**",
        "",
        d2(`
shape: sequence_diagram
ctl: "control"
v1: "v1 fleet"
v2: "v2 fleet"
ctl -> v2: "load weights"
ctl -> v2: "canary 10%"
ctl -> v1: "rollback 100%"
`),
        "",
        "观测按 **版本** 拆：TTFT、错误率、拒绝率、KV 占用。只看集群均值会把坏 canary 淹掉。Rollback = 把别名/权重指回 v1，**不是**在坏 replica 上热修权重文件。v1 舰队在窗口内不要缩到 0，否则回滚还要重新 load。",
        "",
        "Prompt 灰 vs 模型灰（省卡的那条路）：",
        "",
        d2(`
direction: right
a.class: go
a: "prompt gray"
b.class: step
b: "10% model"
c.class: warn
c: "ramp 50%"
d.class: ok
d: "full cut"
a -> b -> c -> d
`),
        "",
        "先对一部分租户或内部员工切 **prompt / 解码参数**（几乎零 GPU）；再对 10% 流量切 **新权重**；再 ramp；最后 full cut 并收回 v1。跳过 canary 直接全切是 red flag。",
        "",
        "多租户隔离——GPU 上的 batch 槽是稀缺资源，没有「操作系统公平调度」自动救你：",
        "",
        d2(`
grid-columns: 2
qt: {
  label: "quota"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "token quota"
  b.class: ok
  b: "GPU slots"
}
iso: {
  label: "isolation"
  class: group
  grid-columns: 2
  c.class: warn
  c: "noisy neighbor"
  d.class: warn
  d: "data split"
}
`),
        "",
        "| 面 | 平台做什么 | 和 Ch32 怎么分 |",
        "|---|---|---|",
        "| **quota** | 每租户 GPU 槽 / 并发序列；打满拒或降级池 | 网关 TPM/RPM 是 token 账；槽位是卡账，两层都要 |",
        "| **noisy neighbor** | 共享 replica 时一条租户占满 `max_num_seqs` 会拖高别人延迟 | 高优租户单独池，或硬上限 per tenant |",
        "| **data isolation** | 敏感租户 **专用 replica**；共享池不要跨租户复用 prefix KV（侧信道 / 串数据） | 网关鉴权解决不了卡上 cache |",
        "",
        "面试怎么说：",
        "",
        "> 「新权重 canary 10%，盯分版本 SLO，不行就把别名打回 v1，旧舰队留着。租户既要 token 配额也要槽位配额。敏感数据不要跟别人共用 KV 前缀。」",
      ].join("\n"),
    },
    {
      id: "sec-2026",
      heading: "2026 vs 「买几张卡跑 vLLM」",
      secNum: null,
      related: [],
      body: [
        "<details>",
        "<summary>单机 docker 跑引擎 —— 现在默认怎么答</summary>",
        "",
        "2023–2024 很多团队的第一版就是：买几张卡、`docker run` 一个引擎、文件名当模型、重启即发版。能跑通 demo，**不能当 2026 平台题正文**。",
        "",
        "| 当时 / 早期工程 | 现在上场 |",
        "|---|---|---|",
        "| 一张卡一个容器即「集群」 | **registry + GPU pool + Ch29 舰队** |",
        "| 覆盖权重文件再重启 | **不可变版本 + 别名**；canary 再切 |",
        "| round-robin 到所有 replica | **槽位配额 + prefix/KV 亲和路由**（政策层） |",
        "| 全员共享同一 batch | **租户配额**；敏感租户单独池 |",
        "| 发版即全切，坏了再手停 | **加权 canary + 一键 rollback**（KServe 一类公开 API 就是这个心智） |",
        "| 把本题答成 PagedAttention | kernel 在 **Ch29**；本章是控制面 |",
        "| 训练平台 / 全套 MLOps | 选修暂停；LoRA 一句 |",
        "",
        "正文第一答案用现在这套。折叠只防止你把「买卡跑引擎」讲成终稿。",
        "",
        "</details>",
      ].join("\n"),
    },
    {
      id: "sec-traps",
      heading: "追问陷阱",
      secNum: null,
      related: ["ch29", "ch32"],
      body: [
        "1. **这不就是再讲 vLLM 吗？** → Ch29 是单次路径。本章是 registry、排卡、发版、租户。",
        "2. **PagedAttention 怎么实现？** → **Ch29。** 本章只订槽位和 KV 亲和政策。",
        "3. **网关路由 / TPM 呢？** → **Ch32。** 网关消费别名；平台托管权重。",
        "4. **为什么不能覆盖 prod 文件？** → 无法回滚、无法 canary、hash 对不上。版本必须不可变。",
        "5. **LoRA 要不要单独一章？** → 一句：小包 pin base。不要答成训练。",
        "6. **为什么不全部 binpack？** → 单机故障团灭。关键副本要 spread。",
        "7. **为什么不全部 spread？** → 空卡烧钱。小模型和批可以 pack。",
        "8. **MIG 是不是必须？** → 只要硬隔离的小模型。大 chat replica 通常整卡。",
        "9. **round-robin 有什么问题？** → 打散 prefix KV，prefill 重复烧卡。亲和是集群政策。",
        "10. **坏版本怎么撤？** → 切别名回 v1；窗口内留着旧舰队。不要热改文件。",
        "11. **token 限流不够吗？** → 不够。槽位才是 GPU。noisy neighbor 发生在 batch 里。",
        "12. **共享 KV 不行吗？** → 吞吐好，但跨租户有串数据和侧信道。敏感租户专用 replica。",
      ].join("\n"),
    },
    {
      id: "sec-next",
      heading: "下一步",
      secNum: null,
      related: ["ch36"],
      body: [
        "合上页，用 30 秒口播 + 平台链（registry → scheduler → GPU pool → Ch29 workers）走一遍。能讲清 **版本为何不可变、卡怎么 pack/spread、槽位和 KV 亲和是政策、canary 如何回滚、租户如何隔离**，这题就过关。",
        "",
        "M5 到此结束。下一章进入 **M6 基础深读**：**Ch36 · Trade-off：CAP / PACELC / SLO**。平台题里的「SLO 破了就 rollback、错误预算怎么花」会用到那套语言；主线设计题也可以反过来引用。",
        "",
        "自测：白板左列假设（多租户、两模型、8–16 卡教学规模），中列四步链，右列三个 deep dive 的 trade-off。不要把 Ch29 的 kernel 图画回来。",
      ].join("\n"),
    },
  ],
  reviewMd: `# Ch35 · 记忆闪卡

| # | 正面 | 背面 |
|---|---|---|
| 1 | 设计 LLM 平台，30 秒怎么开口？ | registry 不可变版本 + 别名；GPU 调度 binpack/spread；槽位与 KV 亲和是集群政策；canary/rollback；多租户配额。舰队是 Ch29，网关是 Ch32。 |
| 2 | 这题 hard part 是什么？ | ① 模型版本/registry ② GPU 调度 + 集群显存/批策略 ③ 租户隔离 + canary/rollback。 |
| 3 | 和 Ch29 / Ch32 怎么划？ | Ch29 = 单次推理路径（分页、凑批、TTFT）。Ch32 = 路由计费，消费别名。本章 = 托管平台。 |
| 4 | 该澄清哪几件事？ | 几个模型、是否多租户、在线 vs 批、灰 prompt 还是权重、回滚要多快、KV 能否跨租户。 |
| 5 | 教学怎么估 GPU 张数？ | 并发序列 ÷ 每 replica 槽位 → prod replica；加 canary 头和第二模型。教学 **8–16** 卡，不报价目。 |
| 6 | registry 最小心智？ | 权重不可变 + hash；\`prod\`/\`canary\` 别名可切。禁止覆盖正在服务的文件。 |
| 7 | LoRA 在这题说哪一句？ | adapter 独立版本，必须 pin 兼容的 base；可热挂，不必当训练章。 |
| 8 | binpack vs spread？ | pack 填节点、利用率高；spread 跨故障域。关键在线副本 spread，小模型/批 pack。 |
| 9 | MIG / fractional GPU？ | MIG 是硬件隔离的小实例；软分数/time-slicing 隔离弱，生产聊天不要当默认。 |
| 10 | KV cache 在本章指什么？ | 集群政策：槽位上限、prefix 亲和路由、换版本作废旧 KV。分页实现在 Ch29。 |
| 11 | canary 怎么走？ | 新舰队先 load，吃一小撮真实流量，分版本盯 SLO；破了把别名打回 v1。 |
| 12 | 为什么留下 v1？ | 权重加载慢。窗口内缩光 v1，rollback 会裸奔。 |
| 13 | 为什么先灰 prompt？ | 几乎不占第二份 GPU。再 10% 权重 → ramp → full cut。 |
| 14 | 多租户三件事？ | token 配额（Ch32）+ GPU 槽位；防 noisy neighbor；敏感数据不要共享 prefix KV。 |
| 15 | 2026 vs 买卡跑 vLLM？ | 现在默认 registry、舰队、亲和路由、canary、隔离。单容器覆盖文件是 demo。 |`,
});
