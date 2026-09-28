import { writeChapter } from "./write-chapter.mjs";

const d2 = (src) => {
  const body = src.trim();
  const sized = /style\.font-size/.test(body) ? body : `style.font-size: 12\n${body}`;
  return "```d2\n" + sized + "\n```";
};

writeChapter({
  id: "ch15",
  num: "15",
  title: "设计网盘",
  kind: "case",
  relatedChapters: ["ch37", "ch41"],
  sections: [
    {
      id: "intro",
      heading: "",
      secNum: null,
      related: [],
      body: [
        "> **预计**：50–60 分钟 ｜ **前置**：对象存储 Ch37；Ch14 分块点到，本章讲断点续传",
        "> **目标**：分块去重、断点续传、版本。OT vs CRDT 只点到，不当 Docs 专章。",
        "",
        "网盘是第七道完整 case。视频是大文件怎么变成能播的流；这题反过来：**大文件怎么可靠地存、续传、同步，并且改一行不要重传整份。** 面试官要看的不是你能不能画出 Google Docs 实时协作专章 + 零知识加密课 + 某云 SKU 清单，而是：**块怎么切、hash 怎么去重、断了怎么续、版本和整文件冲突怎么收。**",
        "",
        "系统看起来就是拖进去、另一台电脑出现。难点在 metadata 与字节分层、content-addressed 块、以及整文件冲突别默默覆盖。",
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
        "> 「网盘三个 hard part：分块加 content hash 去重、断点续传 / multipart、版本和整文件冲突。我先确认纯文件还是实时协作 Docs——本场默认纯文件。协作只点到 OT/CRDT。规模按教学假设估存储 PB 和上传带宽，QPS 不是 bottleneck。架构：client → metadata → block svc → 对象存储。块用哈希当 key 做 CAS 去重；大文件 resumable；版本 copy-on-write；冲突用版本号 + last-write 或保留两份。」",
        "",
        "然后按 4 步走，别一上来画终图。",
        "",
        d2(`
direction: right
s1: "1 澄清估算"
s2: "2 高层分层"
s3: "3 分块续传"
s4: "4 版本冲突"
s1 -> s2 -> s3 -> s4
`),
        "",
        "| 时间盒 | 你在做什么 |",
        "|---|---|",
        "| 3–10 min | 澄清：纯文件 vs Docs、文件上限、多端同步、版本 |",
        "| 接着 2 min | back-of-envelope：存储 PB；上传带宽；QPS 只是百到千 |",
        "| 10–15 min | 高层：client → metadata → block svc → 对象存储 |",
        "| 10–25 min | deep dive：分块去重、resumable、版本 + 整文件冲突 |",
        "| 3–5 min | wrap-up：3 个 bottleneck（重传整文件、上传中断、默默覆盖） |",
        "",
        "**red flag：** 还没问纯文件/Docs 就画 OT transform；还没讲分块就上 E2E 零知识课；背某云 SKU；把转码/推荐塞进来。那是 over-engineering，或把 Docs/对象存储专章整章搬进来。",
      ].join("\n"),
    },
    {
      id: "sec-clarify",
      heading: "澄清问题清单",
      secNum: "15.1",
      related: [],
      body: [
        "没问清楚就画图 = Jimmy。网盘这题 5–7 个问题就停，其余自己假设写白板。**第一问必须是范围。**",
        "",
        "| 你问 | 典型回答 / 你自己的假设 | 它改什么 |",
        "|---|---|---|",
        "| 纯文件还是实时协作？ | **纯文件**（Drive / Dropbox）；Docs 只点到 | 整文件冲突；不是 OT/CRDT 专章 |",
        "| 文件有多大？ | 教学：GB 级常见；更大要续传 | 小文件 simple；大文件 multipart |",
        "| 要多端同步吗？ | **要** | notification + 拉缺块 |",
        "| 要版本历史吗？ | **要** | copy-on-write；共享不可变块 |",
        "| DAU 大概多少？ | 教学：**约 1000 万** | 用来估 PB 和带宽，不是某厂内部数 |",
        "| 加密 / 分享？ | at-rest + TLS；分享点到 ACL | E2E 零知识不展开 |",
        "",
        d2(`
grid-columns: 2
file: {
  label: "纯文件 · 默认"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "分块去重"
  b.class: ok
  b: "整文件冲突"
}
docs: {
  label: "Docs · 点到"
  class: group
  grid-columns: 2
  c.class: step
  c: "OT / CRDT"
  d.class: step
  d: "不展开"
}
`),
        "",
        "面试官说「你定」时，把假设写上去：",
        "",
        "> 「我假设：默认纯文件云盘，不是 Google Docs 专章。GB 级走 resumable。多端同步 + 版本历史。冲突按整文件：版本号 CAS，last-write 或保留两份。先按这个画，不对你打断我。」",
        "",
        "问到 Docs：**承认差别，立刻收口。** 「字符级并发才需要 OT 或 CRDT；本场按整文件讲，追问再点到。」问太多超过 10 分钟也是 red flag。黄金线还是那条：**问关键问题 → 自己给假设 → 写白板 → 继续。**",
      ].join("\n"),
    },
    {
      id: "sec-estimate",
      heading: "粗估",
      secNum: "15.2",
      related: ["ch03"],
      body: [
        "公式细节在 Ch03。这里只要数量级，证明你知道 **这题 bottleneck 是存储和带宽，不是上传开始的 QPS。** 下面用白板做**教学假设**，不是某厂内部数字，也不是某云盘真实占用。",
        "",
        "假设：约 **1000 万 DAU**；注册约 **5000 万**；每用户配额约 **10 GB**。每人每天上传约 **2 个文件**；日上传量按相册/文档估约 **100 MB/人**（2026 不再按人均 500 KB 当主叙事）。",
        "",
        "| 项 | 怎么估 | 量级（教学假设） |",
        "|---|---|---|",
        "| 配额上限 | 5e7 × 10 GB | **约 500 PB**；这是配额天花板，不是实际占用 |",
        "| 上传 QPS | 1e7 × 2 / 86400 | **约 2e2**；峰值 ×5 仍是千级 |",
        "| 日入站 | 1e7 × 100 MB | **约 1 PB/天** |",
        "| 读写 | 同步场景约 1:1 | 下载带宽同量级；钱在 GB，不在请求次数 |",
        "",
        "QPS 看起来很小，因为一次「保存」后面是 **MB–GB 的块传输**。原书用过人均 500 KB、上传 QPS 约 240——当教学对照可以提；2026 白板把平均文件拉到照片/文档后，**结论更硬：先算 PB 和带宽，再画分块。**",
        "",
        "**面试怎么说：**",
        "",
        "> 「千万 DAU 白板：配额是百 PB 量级；上传 QPS 只有几百。贵的是入站/出站带宽和对象存储。这题先分层和分块，不先堆 QPS。」",
        "",
        "常见算错：把播放级 CDN 账单搬过来；或把配额 500 PB 说成已经落盘的真实占用。教学用数量级，并标**假设**。",
      ].join("\n"),
    },
    {
      id: "sec-arch",
      heading: "高层架构",
      secNum: "15.3",
      related: ["ch37", "ch41"],
      body: [
        "从左到右只画 **一条写路径**：Client → Metadata → Block svc → 对象存储。不要在这张图上扇出 Docs OT、E2E 密钥、冷存 SKU。字节走对象存储（Ch37），**不要经 metadata API 中转整文件**——API 只签发、记目录和版本。面试官 buy-in 之后再拆分块和续传。",
        "",
        d2(`
direction: right
app.class: go
app: "Client"
meta.class: step
meta: "Metadata"
blk.class: step
blk: "Block svc"
obj.class: store
obj: "Object store"
app -> meta -> blk -> obj
`),
        "",
        "**本图引用**：Ch37 存储选型 · Ch41 复制、分片、事务",
        "",
        "**分层（必须说清）：** 元数据是小的、要事务的——目录树、版本、每版的块哈希列表，走关系库（Ch41：commit 是 CAS，parent 对不上就冲突）。字节是大的、写一次读多次——不可变块进对象存储。Block svc 的活是：收块、按 content hash 去重、告诉 metadata「这些 hash 已经耐久」。**先存块、再 commit 版本**，metadata 永远不要指向还不存在的字节。",
        "",
        "**读 / 同步：** 一端 commit 成功，notification 叫醒其他端；客户端拉新元数据，只拉本地没有的块。不要把同步画成「把整个文件夹再传一遍」。",
        "",
        d2(`
direction: right
edit.class: go
edit: "一端提交"
notify.class: step
notify: "Notification"
pull.class: step
pull: "拉元数据"
miss.class: store
miss: "拉缺块"
edit -> notify -> pull -> miss
`),
        "",
        "**本图引用**：Ch41 复制、分片、事务",
        "",
        "通知可以是 long poll、WebSocket 或移动端系统推送——白板说「有变更信号，客户端再 pull」即可，不要改成聊天专章。离线设备上线后补拉。图压成四叶子，是为了高度；不要再画 client 同时扇出三路存储。",
        "",
        "高层图到这里就该停，问一句：「方向 OK 吗？接下来挖分块去重，然后是断点续传，最后版本和整文件冲突。」",
        "",
        "**面试怎么说：**",
        "",
        "> 「元数据关系库，字节对象存储。client 问缺哪些 hash，块直传或经 block svc，最后 metadata commit。同步靠通知 + 拉缺块。Docs 和加密课不画进这张图。」",
      ].join("\n"),
    },
    {
      id: "sec-chunk",
      heading: "深入 · 分块、哈希与去重",
      secNum: "15.4",
      related: ["ch37"],
      body: [
        "第一个 hard part。**整文件当一个 blob 存**，改一个字就要重传整份，版本也没法共享旧字节。2026 默认：**切块 + 对每块做 content hash + 用哈希当对象 key（CAS）**。相同内容只存一份；新版本只多出改过的块。",
        "",
        d2(`
direction: right
file.class: go
file: "文件"
cut.class: step
cut: "切块"
hash.class: step
hash: "content hash"
cas.class: ok
cas: "CAS 去重"
obj.class: store
obj: "对象存储"
file -> cut -> hash -> cas -> obj
`),
        "",
        "**本图引用**：Ch37 存储选型",
        "",
        "白板块大小用**教学假设约 4MB**（Dropbox 面试常引这个量级）：太大，delta 收益差；太小，一块一条约元数据，1GB 文件会炸表。不必背成内部基准。哈希用 SHA-256 量级的强哈希当 key——内容相同则 key 相同，**天然去重**。客户端先算哈希列表，问服务器缺哪些，只 PUT 缺失块。",
        "",
        "| | 文件级 hash | 块级 CAS（**默认**） |",
        "|---|---|---|",
        "| 改一行 | 整文件 key 变，整份重存 | 只新增 1–2 块 |",
        "| 版本历史 | 每版一份全量 | 版本 = 哈希列表；旧块共享 |",
        "| 跨文件 | 只有完全相同才撞 | 安装包/模板大量共享块 |",
        "| 面试 | 对照 | **2026 第一答案** |",
        "",
        "**Delta sync** 是同一套机制的读法：本地再切再 hash，和当前版本的块列表做差，只上传差集。弱网下这是能用的原因，不是再发明一套 rsync 协议课。",
        "",
        "追问「文件头插一字节，定长块全变了」：**点到** content-defined chunking（按内容切边界，插入只搅乱邻近块），不要讲 Rabin 算法。白板仍以定长 4MB 开场，追问再升级一句。",
        "",
        "**面试怎么说：**",
        "",
        "> 「文件切块，每块 content hash 当对象 key。相同 hash 跳过。版本是哈希有序列表。改一行只传脏块。定长开场，头插字节再提 CDC。」",
        "",
        "trade-off：块越大请求越少、改动越浪费带宽；块越小 metadata 越胖。跨用户去重能省存储，但可用 hash 探测「别人是否存过这份文件」——企业盘常做成租户内去重。别在这里改上 E2E 课。",
      ].join("\n"),
    },
    {
      id: "sec-resume",
      heading: "深入 · 断点续传",
      secNum: "15.5",
      related: ["ch37"],
      body: [
        "第二个 hard part。GB 级几乎不可能一次 HTTP 成功。**小文件**可以 simple 一次 POST；**大文件默认 resumable / multipart**：先开会话拿到 upload id，再按块 PUT，每块有校验；中断后列出已收块，只补缺失的，最后 complete。Ch14 只点到分块；协议在这里讲完。",
        "",
        d2(`
shape: sequence_diagram
cli: "Client"
api: "Metadata"
blk: "Block svc"
cli -> api: "init upload"
api -> cli: "upload id"
cli -> blk: "PUT chunk"
blk -> cli: "ack"
cli -> api: "list parts"
api -> cli: "missing"
cli -> api: "complete"
`),
        "",
        "**本图引用**：Ch37 存储选型",
        "",
        "对象存储普遍暴露同一套三步（init → part → complete），白板讲机制即可，**不要背某云 API 名和 SKU。** part 可并行，吞吐上去；已 ack 的块不重传。complete 时带上块列表 / ETag 类校验，拼成逻辑文件对应的那些对象（或一个逻辑对象）。upload id 是会话：未 complete 的 part 会占临时空间，超时要 abort，别让垃圾堆满。",
        "",
        "| | Simple 一次传 | Resumable / multipart（**大文件默认**） |",
        "|---|---|---|",
        "| 中断 | 整份重来 | 只补缺失 part |",
        "| 并行 | 一条连接 | 多 part 同时 PUT |",
        "| 往返 | 最少 | 多一次 init / complete |",
        "| 面试 | 几 MB 内 | **GB 级第一答案** |",
        "",
        "2026 常见落地：客户端对缺失块拿 **预签名 URL**，字节直传对象存储，metadata 只在全部块耐久后 commit。Block svc 可以是「查 hash 是否已存在」的控制面，不必把 GB 再代理一遍——和视频题一样，**API 不被大文件打满。**",
        "",
        "**面试怎么说：**",
        "",
        "> 「小文件一次传。大文件 init 拿 upload id，分块 PUT，断了 list 已传再续，最后 complete。字节直传对象存储，commit 放最后。」",
        "",
        "trade-off：part 太小请求风暴；太大则一次失败浪费多。白板给「数 MB 到十几 MB 一级」即可，不要背某厂商 5MB–5GB 条款当唯一真理。会话过期策略要有，否则未完成 multipart 会漏计费。",
      ].join("\n"),
    },
    {
      id: "sec-version",
      heading: "深入 · 版本与文件级冲突",
      secNum: "15.6",
      related: ["ch41"],
      body: [
        "第三个 hard part。一版文件 = **有序块哈希列表（manifest）+ 父版本**。块不可变，新版本只追加改过的块、列表指向新旧混合——这就是高层的 **copy-on-write**；delta 是「相对上一版多了哪些 hash」，不必把 diff 算法讲成 Git 课。定期可做快照，避免无限细 delta 链，点到即可。",
        "",
        "两台设备都基于版本 N 编辑，后到的 commit 发现 parent ≠ 当前 head（Ch41 的 CAS）。整文件不能 silently merge 字节。两条收法都成立，要主动讲 trade-off：",
        "",
        d2(`
grid-columns: 2
lww: {
  label: "覆盖 / LWW"
  class: group
  grid-columns: 2
  a.class: warn
  a: "后写赢"
  b.class: warn
  b: "可能丢改"
}
keep: {
  label: "保留两份 · 常用"
  class: groupOk
  grid-columns: 2
  c.class: ok
  c: "冲突副本"
  d.class: ok
  d: "人不丢数据"
}
`),
        "",
        "| | last-write / 覆盖 | 保留两份（**常用默认**） |",
        "|---|---|---|",
        "| 用户看到 | 一份最新 | `report (冲突副本).docx` 这种第二份 |",
        "| 数据 | 可能丢掉另一端的整文件编辑 | **不丢**；人来选 |",
        "| 实现 | 时间戳或后到的 commit 当 head | CAS 失败 → 另存一版/一个路径 |",
        "| 面试 | 能说清风险 | **网盘产品常见答案** |",
        "",
        "离线编辑同一套：上线后用 parent 做 CAS；冲突不要当「合并 PDF 二进制」。分享 / ACL 点到：链接要够长，企业加域内限制——不是本章主路径。",
        "",
        "### 若面试官追 Docs（点到即停）",
        "",
        "整文件冲突粒度是「整个文件」；**Docs 是字符级并发**，每敲一个字都 LWW 会丢字。这时才提：",
        "",
        d2(`
grid-columns: 2
filec: {
  label: "文件网盘 · 默认"
  class: groupOk
  grid-columns: 2
  a.class: ok
  a: "版本 CAS"
  b.class: ok
  b: "整文件冲突"
}
collab: {
  label: "Docs · 点到即停"
  class: group
  grid-columns: 2
  c.class: step
  c: "OT 中心化"
  d.class: step
  d: "CRDT 可离线"
}
`),
        "",
        "**OT**：客户端交操作，中心服务器 transform 再广播；Google Docs 一类历史方案。**CRDT**：结构本身任意序 merge 都收敛；本地优先 / 长离线更顺（Figma、Yjs 一类）。差别一句话：要不要中心仲裁、离线久了栈会不会爆。**不要**手算 insert 变换，不要讲 G-Counter 论文。说完停，回到网盘。",
        "",
        "**面试怎么说：**",
        "",
        "> 「版本是块列表 + 父版本，CAS 提交。冲突要么 LWW 并承认可能丢改，要么保留两份让人处理。问 Docs 我只说 OT 中心变换、CRDT 可乱序 merge，本场不展开。」",
        "",
        "trade-off：保留两份永不丢用户字节，但目录变脏、要教育用户。LWW 目录干净，不适合当「协作文档」的答案。把 OT/CRDT 画进网盘主架构是 over-engineering。",
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
        "Xu 把 metadata / 块服务 / 对象存储分层、4MB 量级分块、notification 拉同步讲清楚了，这些机制仍成立。过时的是平均文件按 500 KB、只说「用对象存储」、冲突只给先到先得、以及把笔记里的 Docs OT 专章、E2E 零知识、云厂商清单当成第一答案。",
        "",
        "| 原书或笔记 | 现在怎么答 |",
        "|---|---|",
        "| 实时协作 out of scope | **本场仍默认纯文件**；追问 Docs 才点到 OT/CRDT，不当专章 |",
        "| 只说用对象存储 | **resumable / multipart 是大文件默认**；预签名直传 |",
        "| 去重 = hash 相同就跳过 | **CAS：content hash 当 key**；块级优于文件级 |",
        "| 冲突先到先得 | **版本 CAS**；LWW 或保留两份，保留两份更不丢数据 |",
        "| 版本 = 一张 file_version 表 | **COW：新列表共享旧块**；delta / 快照点到 |",
        "| 必须经 block server 流字节 | 控制面查缺块；**字节可直传对象存储** |",
        "| 人均 500 KB、QPS 中心 | **带宽和 PB 才是 bottleneck**；QPS 百到千 |",
        "| 加密三模式当主线 | **at-rest + TLS**；E2E 一句代价（去重/搜索没了） |",
        "| 云厂商 SKU / Glacier 清单 | 对象存储 + 冷热一句；不背产品名 |",
        "",
        "原书仍能用：字节与元数据分离、分块、通知后 pull、关系库扛目录事务。过时的是把 OT/CRDT 当网盘主架构，以及把笔记的加密课、SKU 表做成主线。",
        "",
        "</details>",
      ].join("\n"),
    },
    {
      id: "sec-traps",
      heading: "追问陷阱",
      secNum: null,
      related: ["ch37", "ch41"],
      body: [
        "1. **「纯文件还是 Docs？」** → 默认纯文件。Docs 才需要 OT/CRDT，点到即停。",
        "2. **「为什么不整文件上传？」** → 中断重传、改一行浪费带宽、版本无法共享块。",
        "3. **「为什么约 4MB 一块？」** → 教学假设：太大 delta 差，太小 metadata 爆。不是某厂内部数。",
        "4. **「去重怎么做？」** → content hash 当 key（CAS）。块级比文件级赚；跨用户去重有探测风险。",
        "5. **「头插一字节怎么办？」** → 定长块雪崩；点到 CDC，不讲 Rabin。",
        "6. **「上传断了怎么办？」** → upload id + list 已传 part，只补缺失，再 complete。",
        "7. **「为什么字节不经 API？」** → 和大文件视频同一原因：打爆 API。预签名直传对象存储。",
        "8. **「版本会不会存爆？」** → 块不可变 + COW 共享；限制保留份数；冷数据下沉只点到。",
        "9. **「两端同时改？」** → parent 做 CAS。LWW 或保留冲突副本。不要默默覆盖当唯一答案。",
        "10. **「Google Docs 怎么做？」** → OT 中心变换 vs CRDT 可乱序 merge。本场不手算、不改主架构。",
        "11. **「元数据用什么库？」** → 目录和版本要事务 → 关系库。对象存储只放块（Ch37）。",
        "12. **「通知用 WS 还是 long poll？」** → 有变更信号即可；客户端 pull 缺块。不要改成聊天题。",
        "13. **「加密？」** → at-rest + TLS 默认。E2E 则服务端难去重、难搜索——一句收口，不当零知识课。",
        "14. **终图已经很大了还往上堆？** → OT 算法、云 SKU、转码阶梯、推荐都不是本章。讲透三条 hard part 比画 20 个框得分高。",
      ].join("\n"),
    },
    {
      id: "sec-next",
      heading: "wrap-up 与下一步",
      secNum: null,
      related: ["ch16"],
      body: [
        "收尾不要说完美。三个 bottleneck 口播：",
        "",
        "| bottleneck | 你怎么接 |",
        "|---|---|",
        "| 整文件重传 | 切块 + content hash；只传脏块；CAS 去重 |",
        "| 上传中断 | resumable / multipart；list 缺块再续；最后 commit |",
        "| 默默覆盖 | 版本 CAS；LWW 或保留两份；Docs 才点到 OT/CRDT |",
        "",
        "自测：合上这一页，用 30 秒开场 + 白板高层，把分块去重、断点续传、版本冲突讲给空气听。哪句卡，回哪一节。问到 Docs 只点到就停。",
        "",
        "下一道题是 **Ch16 · 设计评论系统**。网盘把大文件同步讲完；评论换成楼中楼、计数和热点帖——从「文件怎么一致」变成「讨论怎么挂在对象上」。",
      ].join("\n"),
    },
  ],
  reviewMd: `# Ch15 · 记忆闪卡

| # | 正面 | 背面 |
|---|---|---|
| 1 | 网盘三个 hard part？ | 分块+content hash 去重；断点续传/multipart；版本+整文件冲突。OT/CRDT 只点到。 |
| 2 | 纯文件还是 Docs？ | **默认纯文件**（Drive/Dropbox）。协作只点到 OT/CRDT，不当专章。 |
| 3 | 高层管线？ | Client → Metadata → Block svc → 对象存储。字节不经 metadata API。 |
| 4 | 元数据 vs 字节？ | 目录/版本要事务 → 关系库。块走对象存储（Ch37）。先存块再 commit。 |
| 5 | 为什么切块？ | 中断可续、改一行只传脏块、版本共享不可变块。教学假设约 4MB。 |
| 6 | CAS / 去重？ | 块的 content hash 当 key；相同则跳过。块级优于整文件 hash。 |
| 7 | 定长块的坑？ | 头插字节会雪崩。追问点到 CDC，不讲 Rabin。 |
| 8 | 大文件怎么传？ | init → PUT parts → complete。断了 list 已传再续。可预签名直传。 |
| 9 | 同步怎么做？ | 一端 commit → notification → 他端拉元数据 → 只拉缺块。 |
| 10 | 版本怎么不爆？ | COW：新版本是新哈希列表，旧块共享。delta/快照点到。 |
| 11 | 整文件冲突？ | parent 做 CAS。LWW 可能丢改；**保留两份**更常见、不丢数据。 |
| 12 | 问到 Docs？ | OT=中心 transform；CRDT=乱序可 merge。点到即停，不改网盘主架构。 |`,
});
