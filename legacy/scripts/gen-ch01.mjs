import { writeChapter } from "./write-chapter.mjs";

const d2 = (src) => {
  const body = src.trim();
  const sized = /style\.font-size/.test(body) ? body : `style.font-size: 12\n${body}`;
  return "```d2\n" + sized + "\n```";
};

writeChapter({
  id: "ch01",
  num: "01",
  title: "世界地图与 4 步法",
  kind: "method",
  relatedChapters: [],
  sections: [
    {
      id: "intro",
      heading: "",
      secNum: null,
      related: [],
      body: [
        "> **预计**：60–70 分钟 ｜ **前置**：无",
        "> **目标**：会用这个学习站；能按时间盒打完一场 45 分钟系统设计面试；卡住会自救。",
        "",
        "> 原书原话：*The final design is less important compared to the work you put in the design process.*",
        "",
        "你可能写过很多服务，但没在白板上被追问过「流量翻 10 倍怎么办」。这门课不是再教一遍 Spring，而是：**把你已经会的积木，按面试官听得懂的顺序拼出来，并讲清 trade-off。**",
        "",
        "很多人系统知识够，但面试挂，是因为没有框架：抢答、钻细节、中途死寂。本章一次讲完两件事——**这个站怎么读**，以及 **45 分钟怎么打**。后面每道题都往这个骨架上填，不必再开一章重复「面试是协作」。",
      ].join("\n"),
    },
    {
      id: "sec-essence",
      heading: "面试本质与评分",
      secNum: null,
      related: [],
      body: [
        "它不是让你 45 分钟造出微信，也不是知识竞赛。它是：**两个工程师协作，把一个模糊问题收成可落地的设计**。开放、没标准答案。**过程 > 终图。**",
        "",
        "面试官看的是：",
        "",
        "- 你会不会先问清楚再画图",
        "- 你会不会估算数量级（不是精确到字节）",
        "- 你会不会在两个合理方案里做 trade-off",
        "- 卡住时会不会出声、会不会要提示",
        "",
        "终图漂亮但过程沉默 = 低分。过程清楚、终图有意简化 = 高分。",
        "",
        d2(`
grid-columns: 2
signals: {
  label: "plus"
  class: groupOk
  grid-columns: 3
  tech.class: ok
  tech: "trade-off"
  collab.class: ok
  collab: "当队友"
  stress.class: ok
  stress: "卡住不慌"
  ambiguity.class: ok
  ambiguity: "先澄清"
  ask.class: ok
  ask: "问对问题"
}
reds: {
  label: "red flag"
  class: groupBad
  grid-columns: 3
  over.class: bad
  over: "over-engineering"
  jimmy.class: bad
  jimmy: "抢答"
  rabbit.class: bad
  rabbit: "rabbit hole"
  silent.class: bad
  silent: "沉默"
  stubborn.class: bad
  stubborn: "不听反馈"
}
`),
        "",
        "**最大的 red flag = over-engineering。** 面试官最怕你为「设计纯净」忽略 trade-off。主动说「这里我简化了，因为 X；生产要考虑 Y」，比堆砌高级组件得分高。",
        "",
        "**最大的 DON'T = 沉默思考。** 算法面试可以安静 5 分钟；系统设计绝对不行——面试官看不到思路 = 没信号 = 低分。画图时也要自言自语。",
      ].join("\n"),
    },
    {
      id: "sec-site",
      heading: "这个站怎么读",
      secNum: null,
      related: [],
      body: [
        "六大模块。主线是 **M1–M5**；**M6 后置**，不是开胃菜。",
        "",
        d2(`
direction: right
m1: "M1 方法"
m2: "M2 构件"
m3: "M3 经典题"
m4: "M4 进阶"
m5: "M5 Agent"
m6: "M6 基础"
m1 -> m2 -> m3
m4 -> m5 -> m6
m3 -> m4
`),
        "",
        "**第一次学的推荐路径：**",
        "",
        "1. 本章（地图 + 4 步法）",
        "2. **Ch02** 从零扩到百万 → **Ch03** 粗略估算",
        "3. M2 用小题目把 4 步法跑熟（限流、哈希、KV、ID、锁）",
        "4. M3 → M4 后端设计题（短链、Feed、搜索、订单、支付、调度……）",
        "5. **M5** 大模型推理 / RAG / Agent 基建（**不做推荐系统**）",
        "6. **M6 基础深读放最后**：机制 + 论文。设计题里出现「缓存 / 分片 / 微服务」可点引用芯片跳进去，也可以整段留到主线结束后再专心学。",
        "",
        "设计题**不唯那几本面试书**。书里没有的（订单、网关、红包、Agent 编排、DDD）按现在面试怎么问来写。",
      ].join("\n"),
    },
    {
      id: "sec-chips",
      heading: "引用芯片、D2 图、闪卡",
      secNum: null,
      related: [],
      body: [
        "- **引用芯片**：多数链到 **M6 基础深读**（偶尔链到相关设计题）。可以先不点；想打透再读，里面有论文节。",
        "- **D2 图**：横排最多 5 个框；超过就折行或竖排。主题切换图会跟着变。",
        "- **闪卡**：章末折叠。正面是面试官可能问的，背面 ≤ 3 行。能讲出来才算会。",
        "- **2026 vs 原书**：折叠里。正文是现在该怎么答；书里过时的（HDD 很慢、APNS 当主通道、向量时钟当生产默认）不要当第一答案。",
        "",
        "本课**没有**浏览器里写代码。系统设计面试是讲和画。",
      ].join("\n"),
    },
    {
      id: "sec-overview",
      heading: "4 步总览与时间盒",
      secNum: null,
      related: [],
      body: [
        "读完你要能：按 3–10 / 10–15 / 10–25 / 3–5 分钟走完四步；认出 red flag；卡住时用「退回高层 / 要提示 / 换方案」而不是沉默。",
        "",
        d2(`
direction: right
s1: "1 定范围\\n3-10 min"
s2: "2 高层图\\n10-15 min"
s3: "3 deep dive\\n10-25 min"
s4: "4 wrap-up\\n3-5 min"
s1 -> s2 -> s3 -> s4
`),
        "",
        "Ch02 教架构怎么长，Ch03 教怎么算，后面各章教具体题。**45 分钟怎么组织，就是这四步。** 估算公式在 Ch03，本章只要求你在 Step 2 前留出 back-of-envelope 的位置。",
      ].join("\n"),
    },
    {
      id: "sec-step1",
      heading: "Step 1 · 理解问题，定范围（3–10 分钟）",
      secNum: "1.1",
      related: ["ch03"],
      body: [
        "### 别当 Jimmy",
        "",
        "原书故事：班里有个叫 Jimmy 的孩子，问题一出就抢答。系统设计里**抢答零加分**。没搞清需求就给方案 = 巨大 red flag。",
        "",
        "### 问 4 类问题",
        "",
        d2(`
direction: right
ask: "先问清楚"
q1: "① 功能"
q2: "② 规模"
q3: "③ 约束"
q4: "④ 特殊"
ask -> q1 -> q2 -> q3 -> q4
`),
        "",
        "以「设计 News Feed」为例：",
        "",
        "| 你 | 面试官（典型） |",
        "|---|---|",
        "| 是 mobile、web 还是都要？ | 都要 |",
        "| 最重要的功能？ | 发帖 + 看 feed |",
        "| 按时间还是有权重排序？ | 简化，按时间倒序 |",
        "| 一个用户最多多少好友？ | 5000 |",
        "| 流量规模？ | 1000 万 DAU |",
        "",
        "目标：把「设计 X」收敛成**具体、可设计的边界**。问完后双方对「做什么、多大、约束」达成一致。",
        "",
        "面试官反问「你觉得呢？」时：**给出假设并写在白板上**，不要追问到烦。",
        "",
        "**必问清单（大约 5–7 个就停）：** 用户量级、核心功能、读:写比、延迟、一致性、可用性、是否多区域。",
        "",
        "问太少 → 设计跑偏（没问读:写比，缓存层会画错）。问太多超过 10 分钟 → 面试官烦。黄金线：**问关键问题 → 自己给假设 → 写白板 → 继续**。",
      ].join("\n"),
    },
    {
      id: "sec-step2",
      heading: "Step 2 · 高层设计，获得 buy-in（10–15 分钟）",
      secNum: "1.2",
      related: ["ch39", "ch38", "ch37"],
      body: [
        "四个动作：画初始蓝图 → 边画边问反馈 → 用 Ch03 back-of-envelope 验证撑得住 → 走 1–2 个用例。",
        "",
        d2(`
direction: right
you: "你 · 先画高层"
sketch: "client → LB → 服务 → 存储"
iv: "面试官 · 方向 OK?"
you -> sketch -> iv
`),
        "",
        "话术：",
        "",
        "> 「我先用 5 分钟画个高层图，确认方向对了再深入。client 这里……这层用 LB + 无状态 web……这一步方向 OK 吗？」",
        "",
        "这一步结束时**必须达成共识**。别自顾自往下走。",
        "",
        "要不要定义 API 和 schema？大题（「设计搜索」）可以先不写；中小题要写。拿不准就问：「要不要我先列 API？」2026 的虚拟面试里，**主动列 3–5 个 endpoint** 通常是加分。",
      ].join("\n"),
    },
    {
      id: "sec-step3",
      heading: "Step 3 · Deep dive（10–25 分钟）",
      secNum: "1.3",
      related: ["ch36"],
      body: [
        "全场最关键。此时你已经：范围共识、高层蓝图、知道面试官想挖哪块。",
        "",
        "怎么选要挖哪块：① **hard part**（这题最难、最该讲透的那块：短链 → 编码与跳转；聊天 → 连接与 fan-out）；② 面试官刚问的；③ 岗位级别（高级岗聊 bottleneck 和容错）。",
        "",
        d2(`
grid-columns: 2
choose: {
  label: "怎么选"
  class: group
  grid-columns: 3
  a.class: step
  a: "hard part"
  b.class: step
  b: "面试官"
  c.class: step
  c: "级别"
}
depth: {
  label: "挖多深"
  class: group
  grid-columns: 3
  junior.class: warn
  junior: "Junior · API"
  senior.class: warn
  senior: "Senior · bottleneck"
  staff.class: warn
  staff: "Staff · trade-off"
}
`),
        "",
        "**深度 > 广度。** 最隐蔽的失败是「大而全」：每个组件点名一遍，哪块都不深。限流器这题就应该把令牌桶 vs 滑动窗口挖透，而不是再画一遍 CDN。",
        "",
        "时间管理是命门。每 5 分钟看一次表。别花 15 分钟讲某个排序公式——那不证明设计能力。",
      ].join("\n"),
    },
    {
      id: "sec-stuck",
      heading: "卡住时怎么自救",
      secNum: "1.4",
      related: [],
      body: [
        "这决定你能不能 hold 住现场。原书几乎没写成清单，但面试里经常用到。",
        "",
        d2(`
direction: right
stuck: "卡住了"
s1: "① 说出来"
s2: "② 退回高层"
s3: "③ 要提示"
s4: "④ 换方案"
stuck -> s1 -> s2 -> s3 -> s4
`),
        "",
        "铁律：**卡住最忌讳沉默。** 「我理一下，目前卡在消息 fan-out」比安静 40 秒强。要提示不丢人——面试官期待协作，不是单打独斗。",
      ].join("\n"),
    },
    {
      id: "sec-step4",
      heading: "Step 4 · Wrap-up（3–5 分钟）",
      secNum: "1.5",
      related: ["ch42"],
      body: [
        "永远别说「我的设计完美」。挑 2–3 个方向讲：",
        "",
        "1. 找 bottleneck + 改进",
        "2. 错误处理（进程挂、网络分区）",
        "3. 可观测性（延迟、流量、错误、饱和）",
        "4. 下一曲线（1M → 10M 怎么改）",
        "5. 成本",
        "",
        "永远准备好 3 个 bottleneck 口播：",
        "",
        "| bottleneck | 改进 |",
        "|---|---|",
        "| 单点 | 副本 / failover |",
        "| 热点 key | 分片 / 本地缓存 |",
        "| 缓存与库不一致 | 过期 + 失效；或 CDC |",
        "",
        "白板建议三区：**左**需求与假设 / 估算；**中**架构与数据流；**右** deep dive 与 trade-off。虚拟面试用 Excalidraw / 共享文档同理——字写大，结构一眼能看清。",
      ].join("\n"),
    },
    {
      id: "sec-script",
      heading: "45 分钟剧本（可背）",
      secNum: "1.6",
      related: ["ch03"],
      body: [
        d2(`
direction: right
t1: "0-1 复述"
t2: "1-8 问需求"
t3: "8-10 estimate"
t4: "10-22 高层"
t5: "22-40 deep dive"
t6: "40-45 wrap-up"
t1 -> t2 -> t3
t4 -> t5 -> t6
t3 -> t4
`),
        "",
        "| 时间 | 动作 | 话术 |",
        "|---|---|---|",
        "| 0–1 | 复述 | 「我复述一下，你要的是……」 |",
        "| 1–8 | 问需求 | 「功能？规模？读:写？延迟？」 |",
        "| 8–10 | estimate | 「DAU × 次数 / 86400 × 峰值 ≈ QPS」 |",
        "| 10–22 | 高层图 | 「我画高层，你看方向对不对」 |",
        "| 22–40 | deep dive | 「这块是 hard part。方案 A……方案 B……我选 A 因为……」 |",
        "| 40–45 | wrap-up | 「三个 bottleneck：单点、热点、一致性。若有时间我会……」 |",
        "",
        "开场先确认时长。虚拟 onsite 常见 45–50 分钟，倒推时间盒。",
      ].join("\n"),
    },
    {
      id: "sec-dodont",
      heading: "DO / DON'T 与失败模式",
      secNum: null,
      related: [],
      body: [
        "**做：** 先澄清；出声思考；给多个方案再做 trade-off；高层达成共识再 deep dive；把面试官当队友；永不放弃。",
        "",
        "**不要：** 没问需求就画图；一开始钻单个组件；沉默；交完图就以为结束——面试官说完事才算完。",
        "",
        "| 失败模式 | 症状 | 解药 |",
        "|---|---|---|",
        "| 抢答 | Step 1 跳过 | 强制问 5–7 个问题 |",
        "| 钻牛角尖 | 一个细节 30 分钟 | 每 5 分钟看表 |",
        "| 大而全 | 每组件都浅 | 选 1–2 个核心挖到底 |",
        "| 沉默 | 思考不出声 | 全程自言自语 |",
        "| over-engineering | 堆组件不讲 trade-off | 每个组件说为什么用 / 不用 |",
      ].join("\n"),
    },
    {
      id: "sec-level",
      heading: "岗位差异",
      secNum: null,
      related: ["ch44", "ch45"],
      body: [
        "同一道题，级别不同，Step 3 挖的深度不同。别用资深岗的词堆给初级岗，也别用「能跑就行」打发高级岗。",
        "",
        "| 级别 | Step 3 偏向 | wrap-up 多提 |",
        "|---|---|---|",
        "| Junior | 组件、API、schema 能讲清 | 基本 bottleneck |",
        "| Senior | bottleneck、扩展、容错 | 观测、失败模式 |",
        "| Staff | trade-off、多区域、成本、组织边界 | 微服务怎么拆、领域怎么划（点到即可，深读在 M6） |",
        "",
        "后端岗被追问 LLM / Agent 时：先给传统方案，再给「如果加检索 / 工具调用怎么嵌」。细节在 M5，本章只要你知道**可能被问到，不要空白**。",
      ].join("\n"),
    },
    {
      id: "sec-2026",
      heading: "2026 vs 原书",
      secNum: null,
      related: [],
      body: [
        "<details>",
        "<summary>原书怎么讲 / 为什么现在要补几句</summary>",
        "",
        "| 原书（2020） | 现在怎么答 |",
        "|---|---|",
        "| 默认物理白板 | 虚拟白板（Excalidraw / 共享文档）是主流，提前练 |",
        "| 不太强调 API-first | 中小题在 Step 2 主动列 endpoint |",
        "| 评分五维 | 还看画图清晰度、时间把控、成本、可观测性 |",
        "| 几乎不提 AI | 可能追问「向量检索 / Agent 工具怎么嵌」——传统方案 + 增强方案两手准备，细节在 M5（不做推荐系统） |",
        "",
        "高级岗会问月成本量级、某组件挂了怎样、怎么观测。wrap-up 里主动提，显得 senior。",
        "",
        "</details>",
      ].join("\n"),
    },
    {
      id: "sec-traps",
      heading: "追问陷阱",
      secNum: null,
      related: ["ch36", "ch42", "ch02"],
      body: [
        "1. 「还有什么问题？」→ 2–3 个 bottleneck + 改进，永远不要说完美。",
        "2. 「流量翻 10 倍？」→ 分片、读写分离、缓存、CDN（回到 Ch02 第 8 集）。",
        "3. 「一个机房挂了？」→ 多区域 + CAP/PACELC trade-off（机制在 M6 Ch36，面试开口用本章 wrap-up）。",
        "4. 「怎么监控？」→ 四个黄金信号 + 追踪。",
        "5. 「为什么选 A 不选 B？」→ 必须有 trade-off 理由。",
        "6. 「画一下数据流？」→ 用时序图走一条写路径、一条读路径。",
      ].join("\n"),
    },
    {
      id: "sec-next",
      heading: "下一步",
      secNum: null,
      related: ["ch02"],
      body: [
        "直接进 **Ch02 · 从零扩展到百万用户**。那是一条「痛点 → 方案 → 新痛点」的故事。Ch03 把估算练熟。第一道具体设计题是 **Ch04 限流器**，范围小，正好把 4 步法跑通一遍。",
        "",
        "自测：合上这一页，对着空气把 45 分钟剧本走一遍。哪一步说不利索，就回哪一节。",
      ].join("\n"),
    },
  ],
  reviewMd: `# Ch01 · 记忆闪卡

| # | 正面 | 背面 |
|---|---|---|
| 1 | 系统设计面试主要考终图吗？ | 不是。考澄清、估算、trade-off、协作过程。 |
| 2 | 第一次学的推荐顺序？ | Ch01 → Ch02 → Ch03 → M2–M5。M6 后置，可芯片跳转。 |
| 3 | M5 学什么、不学什么？ | LLM 推理 / RAG / Agent 基建。不做推荐系统。 |
| 4 | M6 是什么？ | 基础深读（机制 + 论文，含大数据、微服务、DDD）。不是开胃菜。 |
| 5 | 4 步时间盒？ | 定范围 3–10；高层 10–15；deep dive 10–25；wrap-up 3–5。 |
| 6 | 最大 red flag 是哪两个？ | over-engineering；沉默思考。抢答（Jimmy）紧随其后。 |
| 7 | Step 1 问太多或太少怎么办？ | 5–7 个关键问题，其余自己假设写白板。 |
| 8 | Step 2 结束的标志？ | 面试官对高层图 buy-in，不是你自己画完。 |
| 9 | Step 3 深度还是广度？ | 深度。选 1–2 个 hard part 挖到底。 |
| 10 | 卡住第一件事？ | 把卡点说出来，禁止沉默。然后退回高层 / 要提示 / 换方案。 |
| 11 | wrap-up 能不能说设计完美？ | 永远不能。准备 3 个 bottleneck：单点、热点、一致性。 |
| 12 | 白板怎么分区？ | 左需求假设估算；中架构；右 deep dive 与 trade-off。 |
| 13 | 「流量 ×10」怎么接？ | 分片、缓存、CDN、读写分离，不要只加机器。 |
| 14 | 正文和「原书怎么讲」哪个当面试第一答案？ | 正文（2026）。折叠里是过时方案。 |`,
});
