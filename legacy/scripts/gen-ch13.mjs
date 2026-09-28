import { writeChapter } from "./write-chapter.mjs";

const d2 = (src) => {
  const body = src.trim();
  const sized = /style\.font-size/.test(body) ? body : `style.font-size: 12\n${body}`;
  return "```d2\n" + sized + "\n```";
};

writeChapter({
  id: "ch13",
  num: "13",
  title: "设计搜索系统",
  kind: "case",
  relatedChapters: ["ch38", "ch37", "ch43"],
  sections: [
    {
      id: "intro",
      heading: "",
      secNum: null,
      related: [],
      body: [
        "> **预计**：50–60 分钟 ｜ **前置**：Ch01 4 步法；缓存 Ch38",
        "> **目标**：倒排索引 + BM25 级相关性 + 分页；自动补全（Trie / debounce）只作为读路径一节。不讲双塔推荐。",
        "",
        "搜索是第五道完整 case。聊天把消息推到人；这题反过来：**用户打几个词，从已有 corpus 里召回并排好一页。** 面试官要看的不是你能不能画出网页爬虫 + 推荐漏斗 + 精排模型，而是：**倒排怎么建、词法相关性怎么打、分页别翻崩，自动补全只当读路径 sidecar。**",
        "",
        "Xu 原书这章几乎只讲 typeahead。本场倒过来：主线是**查询路径上的搜索**；补全是搜索框旁边那条更快的读。文档从哪来？默认 **已有 corpus / 业务库同步**，不是再开一道爬虫题（爬虫在选修，整段暂停）。",
      ].join("\n"),
    },
    {
      id: "sec-answer",
      heading: "面试怎么答",
      secNum: null,
      related: [],
      body: [
        "**开场 30 秒（直接说）：**",
        "",
        "> 「搜索三个 hard part：倒排索引加 analyzer、BM25 级相关性和分页、自动补全当读路径 sidecar。我先确认是站内/业务搜索，不是网页爬虫；排序用词法分，不上推荐漏斗。规模按千万 DAU 白板：搜索 QPS 千到万，热查询走缓存。架构：业务库同步进倒排；查询 client → search API → 热查询缓存 → 倒排。打分 BM25 / TF-IDF 这一档。浅翻可用 offset，深翻 cursor。自动补全单独一条：debounce + Trie / 前缀索引 top-k。」",
        "",
        "然后按 4 步走，别一上来画终图。",
        "",
        d2(`
direction: right
s1: "1 澄清估算"
s2: "2 高层查询"
s3: "3 倒排打分"
s4: "4 补全"
s1 -> s2 -> s3 -> s4
`),
        "",
        "| 时间盒 | 你在做什么 |",
        "|---|---|",
        "| 3–10 min | 澄清：站内 vs 全网、文档量、新鲜度、补全、要不要个性化 |",
        "| 接着 2 min | back-of-envelope：千万 DAU；搜索千到万 QPS；索引百 GB 量级 |",
        "| 10–15 min | 高层：client → search API → cache → inverted index；ingest 点到同步 |",
        "| 10–25 min | deep dive：analyzer + posting list、BM25 + 分页、Trie + debounce |",
        "| 3–5 min | wrap-up：3 个 bottleneck（热词 posting、深分页、补全打满 QPS） |",
        "",
        "**red flag：** 还没问是不是站内搜就画爬虫集群；还没讲倒排就上双塔 / 精排；把整章做成 Trie 课；每个按键打后端、不提 debounce。那是 over-engineering，或把推荐 / 爬虫 / 自动补全单题整章搬进来。",
      ].join("\n"),
    },
    {
      id: "sec-clarify",
      heading: "澄清问题清单",
      secNum: "13.1",
      related: [],
      body: [
        "没问清楚就画图 = Jimmy。搜索这题 5–7 个问题就停，其余自己假设写白板。",
        "",
        "| 你问 | 典型回答 / 你自己的假设 | 它改什么 |",
        "|---|---|---|",
        "| 站内/业务搜索，还是网页搜索？ | **站内**；corpus 已在业务库 | ingest = 同步，不设计爬虫 |",
        "| 文档量大概多少？ | 教学：**千万到亿级** 文档 | 倒排要分片；不是单机 LIKE |",
        "| 写入后多久可搜到？ | **近实时**（秒到分钟） | refresh；不保证写完立刻可见 |",
        "| 要自动补全吗？ | **要**；前缀 top-k | 搜索框 sidecar，不是主索引 |",
        "| 排序要个性化 / 推荐式吗？ | **本场不做** | BM25 级词法分；精排另一道题 |",
        "| 分页长什么样？ | 前几页可跳；也可能一直下翻 | offset 浅翻 + cursor 深翻 |",
        "",
        "面试官说「你定」时，把假设写上去：",
        "",
        "> 「我假设：站内搜索，已有 corpus 从业务库同步。相关性用 BM25 这一档，不做推荐漏斗。要自动补全，前缀匹配，客户端 debounce。分页浅翻 offset，深翻 cursor。先按这个画，不对你打断我。」",
        "",
        "问到爬虫 / 全网索引：**承认差别，立刻收口。** 「那是另一道题，爬虫本课选修暂停。本场按已有 corpus 的查询路径讲。」问到双塔 / 精排同样收口。问太多超过 10 分钟也是 red flag。黄金线还是那条：**问关键问题 → 自己给假设 → 写白板 → 继续。**",
      ].join("\n"),
    },
    {
      id: "sec-estimate",
      heading: "粗估",
      secNum: "13.2",
      related: ["ch03"],
      body: [
        "公式细节在 Ch03。这里只要数量级，证明你知道 **读 QPS 在查询，贵的是 posting list 扫描和热查询，不是把 Google 日均搜次背出来。** 下面用公开量级做白板假设，不是某厂内部数字。",
        "",
        "假设：约 **1000 万 DAU**；人均每天约 8 次搜索；峰值约 10 倍。corpus 约 **1 亿** 篇，篇均正文约 2 KB。",
        "",
        "| 项 | 怎么估 | 量级 |",
        "|---|---|---|",
        "| 搜索 QPS | 1e7 × 8 / 86400 | **约 1e3**；峰值 ×10 **约 1e4** |",
        "| 补全 QPS | debounce 后每次搜索约 3–5 次前缀请求 | **约 3e3–5e3**；峰值万到数万 |",
        "| 正文体积 | 1e8 × 2 KB | **约 200 GB** 文本 |",
        "| 倒排体积 | 带 tf / position，大约正文的 0.5–1.5× | **约 100–300 GB**；再加副本 |",
        "| 热查询 | Zipf：少数 query 吃掉大量读 | **query cache** 能砍一截（Ch38） |",
        "",
        "补全不要按「每个按键一次请求」去乘：那是没 debounce 的自伤。白板先乘 3–5，再在 deep dive 用 debounce 把峰值按回去。",
        "",
        "**面试怎么说：**",
        "",
        "> 「千万 DAU 白板：搜索日均千 QPS、峰值万级。索引按亿级文档是百 GB 量级，要分片，但不是互联网全网那道题。这题 bottleneck 先是热词 posting 和热查询，不是把爬虫带宽算进本场。」",
        "",
        "常见算错：把某搜索引擎公开日查询量当成自己的内部数字；或把整站 HTML / 图片算进倒排。倒排吃的是 **analyzer 之后的 term**，不是原始对象存储。",
      ].join("\n"),
    },
    {
      id: "sec-arch",
      heading: "高层架构",
      secNum: "13.3",
      related: ["ch38", "ch37", "ch43"],
      body: [
        "从左到右只画 **查询路径**：Client → Search API → 热查询缓存 → 倒排。ingest 用一句话挂在旁边：业务库同步进索引，不要在这张图上展开爬虫。面试官 buy-in 之后再拆倒排和打分。",
        "",
        d2(`
direction: right
app.class: go
app: "Client"
api.class: step
api: "Search API"
cache.class: store
cache: "Query cache"
idx.class: store
idx: "Inverted idx"
app -> api -> cache -> idx
`),
        "",
        "**本图引用**：Ch38 缓存与 CDN · Ch37 存储选型 · Ch43 超大规模数据",
        "",
        "**ingest（点到就停）：** 已有 corpus / 业务库变更（CDC 或定时拉取）→ 同一套 analyzer → 写倒排。近实时靠 refresh 间隔，**不保证**事务提交的同一毫秒可搜到。这不是 WAL 课，也不是爬虫课。",
        "",
        "**schema（够用就停）：** 正排 `doc_id` → 标题 / 正文 / 字段；倒排 `term` → posting list（`doc_id`、tf、可选 position）。查询缓存 key = 规范化后的 query 字符串（加 locale 若有）。自动补全是另一份前缀结构，别和主倒排画成同一个框。",
        "",
        "Elasticsearch / OpenSearch 在面试里只当 **倒排 + analyzer + BM25 的例子**，不要背节点角色、分片数魔法、插件目录。",
        "",
        "一条查询怎么走（命中缓存则短路，图里画 miss 才完整）：",
        "",
        d2(`
shape: sequence_diagram
c: "Client"
api: "Search API"
idx: "Inv index"
rk: "Ranker"
c -> api: "q=docker"
api -> idx: "analyze"
idx -> rk: "postings"
rk -> api: "BM25 topk"
api -> c: "一页结果"
`),
        "",
        "**本图引用**：Ch38 缓存与 CDN",
        "",
        "高层图到这里就该停，问一句：「方向 OK 吗？接下来挖倒排和 analyzer，然后是 BM25 加分页，最后补全这条 sidecar。」",
        "",
        "**面试怎么说：**",
        "",
        "> 「查询路径 client → API → 热查询缓存 → 倒排。文档从业务库同步，不设计爬虫。补全另走前缀索引。打分先 BM25。」",
      ].join("\n"),
    },
    {
      id: "sec-index",
      heading: "深入 · 倒排索引与 analyzer",
      secNum: "13.4",
      related: ["ch37", "ch43"],
      body: [
        "第一个 hard part。**正排是文档 → 词；倒排是词 → 文档。** 查询不能扫 1 亿篇，只能拿 query 里的 term 去取 posting list，再求交 / 求并。",
        "",
        d2(`
direction: right
raw.class: go
raw: "doc body"
an.class: step
an: "Analyzer"
term.class: step
term: "term"
pl.class: store
pl: "posting list"
raw -> an -> term -> pl
`),
        "",
        "**本图引用**：Ch37 存储选型 · Ch43 超大规模数据",
        "",
        "**analyzer（索引和查询必须同一套）：** tokenize → 小写 → 可选停用词 → 词干 / 业务分词。`Docker` 和 `docker` 打成同一个 term，倒排才碰得上。中文要分词器，白板假设「有分析器」，不要把本章写成 NLP 课。",
        "",
        "posting list 按 `doc_id` 有序：多 term 求交可以双指针扫，不必把一侧载入 HashSet 再撞。列表里常带 **tf**（这篇出现几次）和 **position**（短语 / 邻近：「new york」要相邻）。只做 OR 关键词可以不存 position，省空间；短语查询没有 position 就只能事后读正排验证——那是用 IO 换索引体积的 trade-off。",
        "",
        "| | 按 term 分片 | 按 doc 分片（常见默认） |",
        "|---|---|---|",
        "| 一片里有什么 | 一部分 term 的完整 posting | 一部分文档的整棵倒排 |",
        "| 查询 fan-out | 只打到这些 term 所在片 | **几乎每片都要打**（scatter-gather） |",
        "| 热词 | `the` / 业务热词把一片打满 | 热文档均摊，查询尾延迟看最慢那片 |",
        "| 面试 | 讲清 hotspot | **教学默认**；点名 ES 也是 doc shard |",
        "",
        "按 doc 分片时，每片本地取 posting、打 BM25、交自己的 top-k，coordinator 再合并。p99 被最慢那片拖住——这是 Ch43 的 scatter-gather，点到即可，不要展开对冲请求论文。",
        "",
        "热 term 的 posting 可能比内存预算长：跳表 / skip pointer、压缩（delta 编码 doc_id）一句就够。单机塞不下就分片 + 副本，别假装一张 HashMap 能扛亿级。",
        "",
        "**面试怎么说：**",
        "",
        "> 「倒排是 term → posting list。analyzer 索引和查询同一套。多词求交走有序 posting。分片我默认按文档切，查询 scatter-gather；热词分片的 hotspot 要主动讲。」",
        "",
        "trade-off：带 position 的倒排更大、短语准；不带则省空间、短语贵。为了「一个节点搞定所有 term」把整表放一台，是 over-engineering 的反面——直接单点 bottleneck。",
      ].join("\n"),
    },
    {
      id: "sec-rank",
      heading: "深入 · 相关性与分页",
      secNum: "13.5",
      related: ["ch38"],
      body: [
        "第二个 hard part。召回之后还要 **排**：用户只看第一页。本场相关性停在 **BM25 / TF-IDF 这一档**，可解释、白板能讲完。不要把召回 / 粗排 / 精排漏斗画进来。",
        "",
        d2(`
grid-columns: 2
lex: {
  label: "BM25 · 本场默认"
  class: groupOk
  grid-columns: 3
  a.class: ok
  a: "TF 有饱和"
  b.class: ok
  b: "IDF 稀词重"
  c.class: ok
  c: "长度归一"
}
ml: {
  label: "ML 精排 · red flag"
  class: groupBad
  grid-columns: 3
  d.class: bad
  d: "双塔"
  e.class: bad
  e: "推荐漏斗"
  f.class: bad
  f: "另一道题"
}
`),
        "",
        "BM25 白板三句话，不必默公式：",
        "",
        "1. **TF 饱和**：词在文中出现越多越好，但第 10 次加分远小于第 1 次。",
        "2. **IDF**：越稀有的 term 越能区分文档（`docker` 比 `the` 有用）。",
        "3. **长度归一**：长文不能靠堆词赢。",
        "",
        "TF-IDF 是同一家族的简化版；面试说「BM25 是带饱和和长度归一的 TF-IDF」即可。多字段（标题加权 > 正文）用加权和，仍是词法分，不是模型课。",
        "",
        "热查询：规范化 query → 整页结果进缓存（Ch38）。Zipf 下少数 query 贡献大量 QPS，cache 是读路径第一刀。失效跟文档更新走短 TTL 或主动删，别保证搜和主库同一毫秒一致。",
        "",
        d2(`
grid-columns: 2
off: {
  label: "offset · 浅翻"
  class: group
  grid-columns: 3
  a.class: step
  a: "跳到第 3 页"
  b.class: warn
  b: "深翻变慢"
  c.class: warn
  c: "from + size"
}
cur: {
  label: "cursor · 深翻"
  class: groupOk
  grid-columns: 3
  d.class: ok
  d: "search_after"
  e.class: ok
  e: "从锚点续"
  f.class: ok
  f: "不能跳页"
}
`),
        "",
        "| | offset / `from+size` | cursor（`search_after`） |",
        "|---|---|---|",
        "| UI | **能跳到第 N 页** | 只适接下翻 / 滚动 |",
        "| 成本 | 越深越要排完前面的命中 | 从上一页最后一个 sort key 继续 |",
        "| 插入新文档 | 页可能重复或漏 | 锚在 `(score, doc_id)`，更稳 |",
        "| 面试 | 前几页可以 | **深翻默认**；ES 点名 `search_after` |",
        "",
        "和 Ch11 Feed 不同：搜索产品经常要「第 2、第 3 页」，offset 不是立刻的 red flag。**red flag 是深翻仍用巨大 from**，或声称能便宜地跳到第 10000 页。白板：前几页 offset；无限下翻、导出、深页改 cursor，锚在 `(BM25 分, doc_id)`。",
        "",
        "**面试怎么说：**",
        "",
        "> 「打分 BM25：TF 饱和、IDF、长度归一。不上双塔。热查询整页缓存。浅翻 offset，深翻 cursor，别 from=10000。」",
      ].join("\n"),
    },
    {
      id: "sec-ac",
      heading: "深入 · 自动补全（读路径 sidecar）",
      secNum: "13.6",
      related: ["ch38"],
      body: [
        "第三个 hard part，**只占这一节**。补全是搜索框上「还没按回车」的读：延迟比搜结果更紧，QPS 也更容易被键盘打满。它不是第二套倒排，更不是推荐。",
        "",
        d2(`
direction: right
k.class: go
k: "keystroke"
db.class: step
db: "debounce"
tr.class: store
tr: "Trie / prefix"
tk.class: ok
tk: "top-k"
k -> db -> tr -> tk
`),
        "",
        "**本图引用**：Ch38 缓存与 CDN",
        "",
        "**debounce 先做。** 每个按键打 API 是自伤：QPS 按词长放大，而且倒数第二次的响应可能后到，把列表闪乱。客户端等 **约 200–300ms** 无新按键再发；最短前缀 2–3 个字符，避免打 `a` 就扫半棵树。服务端对同一连接旧请求取消或丢弃乱序响应。",
        "",
        "**前缀结构：** 教学默认 **Trie**（前缀树）。根是空串，边是字符，路径是前缀。查询：走到前缀节点，取该节点上缓存的 **top-k**（按全局热度）。两个优化要主动说：① 限制最大前缀长度（用户很少打超长）；② **每个节点存好 top-k**，查询接近 O(1)，用空间换延迟。热度来自搜索日志异步聚合，**不要**每条线上查询都去改 Trie——读极重、写极轻，收集和查询分开。",
        "",
        "替代方案各一句：Lucene 用 FST 压前缀，和 Trie 同一类；小数据也可用 Redis ZSET 按字典序扫前缀。点到为止，不要开数据结构课。",
        "",
        "| | 主搜索倒排 | 补全 Trie / 前缀索引 |",
        "|---|---|---|",
        "| 输入 | 整句 query，analyzer 成 term | **前缀字符串** |",
        "| 输出 | 文档页 + 分数 | 5–10 条建议 query |",
        "| 延迟 | 百毫秒量级可接受 | 更紧，内存结构 + 缓存 |",
        "| 更新 | 文档同步 / refresh | 日志批处理重建或分层更新 |",
        "",
        "浏览器 HTTP 缓存 / CDN 对「同一前缀」也很香：`do` 的 top-k 对所有人几乎一样（本场不做个性化）。这又是 Ch38，别把补全做成用户画像系统。",
        "",
        "**面试怎么说：**",
        "",
        "> 「补全是 sidecar：客户端 debounce，最短前缀，Trie 或前缀索引，节点缓存 top-k。热度异步聚合。不和 BM25 倒排画成同一个服务，更不上个性化精排。」",
        "",
        "trade-off：节点缓存 top-k 让读变 O(1)，更新一个词要动祖先节点，所以倾向批量重建而不是逐键实时改。为每个用户维护一棵个性化 Trie 是 over-engineering。",
      ].join("\n"),
    },
    {
      id: "sec-2026",
      heading: "2026 vs 原书",
      secNum: null,
      related: [],
      body: [
        "<details>",
        "<summary>原书 / 笔记当时怎么讲（不要当第一答案）</summary>",
        "",
        "Xu 这一章标题就是自动补全：Trie、频率、节点缓存 top-k、收集服务和查询服务分离。这些对 **typeahead 这一节** 仍然成立。过时的是把整道「设计搜索」答成只有 Trie，以及把网页爬虫当必画主图。",
        "",
        "| 原书或笔记 | 现在怎么答 |",
        "|---|---|",
        "| 整章自动补全 | **主线是倒排查询路径**；补全只作为 sidecar 一节 |",
        "| 没讲 BM25 / 倒排 | **BM25 / TF-IDF + posting list** 进正文 |",
        "| 网页爬虫当搜索前半段 | 本场 **已有 corpus / 业务库同步**；爬虫选修暂停 |",
        "| 笔记补个性化 + ML 排序 | **折叠即可**；本场第一答案仍是词法分 |",
        "| 笔记补 CJK 拼音、GDPR | 追问各一句；不要展开成另一套系统 |",
        "| 补全 QPS 写成某厂 24K | 用千万 DAU 白板数量级；不背内部数字 |",
        "| 没提 debounce | **客户端 debounce** 是补全第一刀 |",
        "",
        "原书仍能用：Trie 前缀、节点 top-k、读多写少、异步建树。过时的是用它代替倒排，以及把精排模型当搜索题的默认终图。",
        "",
        "</details>",
      ].join("\n"),
    },
    {
      id: "sec-traps",
      heading: "追问陷阱",
      secNum: null,
      related: ["ch38", "ch37", "ch43"],
      body: [
        "1. **「倒排和正排有什么区别？」** → 正排 doc → 词；倒排 term → posting。查询走倒排。",
        "2. **「为什么要 analyzer？」** → 索引和查询同一套分词 / 小写，否则对不上。",
        "3. **「多词怎么召回？」** → 各 term 的有序 posting 求交（AND）或求并（OR）。",
        "4. **「BM25 和机器学习精排？」** → 本场 BM25。双塔 / 推荐漏斗是另一道题，不画。",
        "5. **「怎么分片？」** → 默认按文档切，查询 scatter-gather；按 term 切要讲热词 hotspot。",
        "6. **「分页用 offset 行不行？」** → 前几页可以；深翻改 cursor / `search_after`。不要 from=10000。",
        "7. **「热查询怎么扛？」** → 规范化 query 整页缓存（Ch38）。Zipf。",
        "8. **「写入后立刻能搜到吗？」** → 近实时 refresh，不保证和主库同一毫秒。",
        "9. **「自动补全怎么做？」** → debounce + 最短前缀 + Trie/前缀索引 top-k。不是再扫一遍倒排。",
        "10. **「每个按键都请求吗？」** → 不要。debounce；否则 QPS 和乱序响应都是 red flag。",
        "11. **「要不要爬虫？」** → 本场已有 corpus。爬虫另一道题，选修暂停。",
        "12. **「中文拼音 / GDPR / 个性化？」** → 拼音是另一套前缀；查询日志别当永久画像。一句收口，不展开。",
        "13. **终图已经很大了还往上堆？** → ES 运维课、推荐漏斗、全网爬虫都不是本章。讲透三条 hard part 比画 20 个框得分高。",
      ].join("\n"),
    },
    {
      id: "sec-next",
      heading: "wrap-up 与下一步",
      secNum: null,
      related: ["ch14"],
      body: [
        "收尾不要说完美。三个 bottleneck 口播：",
        "",
        "| bottleneck | 你怎么接 |",
        "|---|---|",
        "| 热词 posting / 分片尾延迟 | 有序 posting + 按文档分片 scatter-gather；热查询缓存 |",
        "| 深分页 | 浅翻 offset；深翻 cursor，别巨大 from |",
        "| 补全把读打满 | debounce + 最短前缀 + 内存 Trie top-k；异步重建热度 |",
        "",
        "自测：合上这一页，用 30 秒开场 + 白板高层，把倒排 + analyzer、BM25 加分页、补全 debounce 讲给空气听。哪句卡，回哪一节。",
        "",
        "下一道题是 **Ch14 · 设计视频系统**。搜索是词 → 文档；视频切到转码、切片和 CDN——从「倒排召回」变成「大文件怎么播」。",
      ].join("\n"),
    },
  ],
  reviewMd: `# Ch13 · 记忆闪卡

| # | 正面 | 背面 |
|---|---|---|
| 1 | 搜索三个 hard part？ | 倒排 + analyzer；BM25 级相关性 + 分页；补全 Trie + debounce（sidecar）。 |
| 2 | 文档从哪来？ | **已有 corpus / 业务库同步**。不设计网页爬虫。 |
| 3 | 高层查询路径？ | Client → Search API → 热查询缓存 → 倒排。 |
| 4 | 倒排存什么？ | term → posting list（doc_id、tf、可选 position）。 |
| 5 | analyzer 为什么同一套？ | 索引和查询同一套分词 / 小写，term 才能命中。 |
| 6 | 按 term 分片 vs 按 doc 分片？ | term 片有热词 hotspot；**默认按文档切**，查询 scatter-gather。 |
| 7 | BM25 三句话？ | TF 饱和、IDF 稀词、长度归一。不是双塔 / 精排。 |
| 8 | 热查询怎么扛？ | 规范化 query 整页缓存（Ch38）。Zipf。 |
| 9 | offset 还是 cursor？ | 浅翻 / 跳页可用 offset；深翻 cursor / search_after。 |
| 10 | 补全和倒排是同一个服务吗？ | 不是。sidecar：debounce + Trie/前缀 top-k。 |
| 11 | 为什么要 debounce？ | 避免每键一请求；降 QPS、防乱序闪烁。 |
| 12 | Elasticsearch 在这题怎么提？ | 倒排 + analyzer + BM25 的例子。不背集群插件清单。 |`,
});
