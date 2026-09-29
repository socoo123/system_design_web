# Opus 重构规范

> 状态：现行唯一的章节重构标准，取代已删除的 `CH09_REFACTOR_SPEC.md`。
> 来源：Opus 对 Ch02（review Grok 版）和 Ch03 的整章重构，2026-09-28 / 29。
> 样板页：`chapters/ch02.html`、`chapters/ch03.html`。
> 适用：Ch01–Ch45 的新写、重写和复审。已完成但没过 §8 验收的章，一律算「待复审」。

## 1. 为什么换规范

Grok 按旧规范写的 Ch02 能过 `node tools/check.mjs`：deck 数对、每张都有 `<title>`、中英节点相等、字数超标。但逐张渲染后，**几乎每一张图都有错**：

- 回程跳过中间节点：DB 直接回 Client，Cache 直接回 LB，Replica 直接回 Client。
- 从 d1 到 e5，LB 出来的箭头都指向空白；箭头尖戳进框里 12 px；有线没箭头。
- 图和正文讲的机制相反：正文讲 look-aside，图把 Cache 画在 App 和 DB 中间；正文警告双写，图上正好画了 App 直接 enqueue；正文说只有租约持有者回源，图上两个 App 都回源。
- 正文算错：5 个粉丝 × 80 ms = 400 ms 已超 300 ms 目标，却被当成阈值；「7.23 这个商小于 1」。
- 全站 `.store` 用的 `--drac-purple` 没定义，所有数据库圆柱都没有描边，没人发现。

Ch03 是同一类问题：Cache / App / Object store 直接回 Client，复制画成 A → B 接力，同一个库一会叫 Disk 一会叫 Primary，150 ms 箭头指向磁盘。

结论有三条，也是本规范的核心：

1. **静态检查只能证明格式，不能证明图对。** 必须把每一张 slide 渲染成图片，逐张看。
2. **手写坐标必然漂移。** 同一组 deck 的节点和连线必须由一份坐标定义生成，帧与帧之间只加不改。
3. **图、正文、数字、引用要互相核对。** 改了图就要回头改正文；每个数字重算一遍；每条引用打开原文找到那个数。

## 2. 执行流程（按顺序，不跳步）

1. **上锁**：在 `PLAN.md` §0 自己那一行写 `ChNN · 日期`。
2. **读**：`PLAN.md` §0–§2、本文件全文、样板 `ch02.html` / `ch03.html`（看 deck 和正文怎么对齐）、要改的章节全文。
3. **渲染现状**：`node tools/render-slides.mjs chNN`，逐张看 `/tmp/sd-render/chNN/*.png`。不要靠读 SVG 坐标猜。
4. **列 bug 清单**：按 §3 的图、§5 的正文、§6 的双语、§7 的引用逐项过，写成列表。分两级：
   - P0：语义错（回程跳跃、机制画反、算错、事实错、中英数字不一致）
   - P1：版面错（压线、穿框、越界、缺图例、名称漂移、帧间跳变）
5. **先定每组最后一帧**：最后一帧是完整、可口述的图。再倒推前面几帧，每帧只加一笔。
6. **写生成脚本**：`/tmp/sd-gen/chNN.mjs`，从 `tools/board-kit.mjs` 引入图元（§4）。所有坐标集中在每组一个对象里。
7. **预览循环**：`preview()` 写出单帧 HTML → `node tools/render-slides.mjs --dir=/tmp/sd-gen/chNN` 截图 → 看 → 改坐标 → 再截图，直到 §3 清单全过。
8. **拼回**：先确认章节文件的修改时间没被别人动过，备份到 `/tmp`，再 `splice()`。拼完 HTML 是唯一产物，生成脚本不进仓库。
9. **改正文**：逐段对照新图，按 §5 重算数字、修事实、补推导；同步英文。
10. **核引用**：按 §7 下载原文逐个找数字。
11. **验收**：按 §8 跑命令、看计数、截多模式图。
12. **解锁**：`PLAN.md` §0 清锁，已完成里追加章号，下一章改为车道内下一章。

## 3. 图：必查 bug 清单

每张图都要过下面每一项。例子都来自 Ch02 / Ch03 的实际修复。

| # | 检查项 | 错误例子 | 正确做法 |
|---|---|---|---|
| G1 | 回程逐跳返回 | DB → Client、Cache → LB、Object store → Client | 每一对相邻节点一条请求、一条回程：Cache → App → LB → Edge → Client |
| G2 | 箭头落在目标边框上 | LB 箭头指向空白；箭头尖戳进 pill 12 px | 终点取目标框的边；pill 取直边或圆端 cy 处；用 `arrow()`，线停在箭头底 |
| G3 | 每条线都有箭头，没有残桩 | 淡化线旁多一截实线 stub；缺箭头头 | 不再走的线整条加 `muted`，不留残段 |
| G4 | 图上机制和正文一致 | look-aside 画成 inline；outbox 画成 App 直接 enqueue；lease 两个 App 都回源；复制画成 A → B 链并有 B → Primary 回程 | look-aside：App 查 Cache，miss 时 App 自己查 DB 再回填。outbox：Primary 的 outbox 由 relay 发到 Queue。lease：只有持有者回源。复制：Primary 同时向各副本发异步日志，ack 只来自 Primary |
| G5 | 标签语义准确 | LB 标 “not stateless”（有状态的是 App）；150 ms 指向 Disk | 标签说的是它所在的那个组件；跨洲 150 ms 画成远端用户到 Edge |
| G6 | 同一节点全章同名 | d4 叫 Disk，d5 叫 Primary | 一个名字用到底；副标题可以变（`seek 10 ms` / `bypass read`） |
| G7 | 路由不误导 | App 1 只连 Primary、App 2 只连 Replica，像是按实例路由 | 按读类型路由就只画一台 App 的全部路径，图注说明其他实例相同 |
| G8 | 帧间连续 | 边界高度 250 → 320 跳变；a5 有的 App 2 → DB 到 b1 消失无说明 | 一组内节点位置和边界不动；要删的线先 `muted`，或在图注说明为什么不画 |
| G9 | 不压线、不穿框、不越界 | `GET /feed` 压在区域边界上；Primary 圆柱骑在边界上；副标题压底弧；badge 压圆柱和边界 | 标签离边界 ≥ 16 px；组件整体在边界内；两条路径不交叉，交叉就改道或删掉冗余路径 |
| G10 | 圆柱画法 | `ellipse + rect + ellipse` 三段，描边后盖顶出横线、底部有内弧 | 一条 path 画身 + 一个 ellipse 盖（`cyl()`） |
| G11 | 有图例 | 无图例，读者分不清同步 / 回程 / 异步 / 失败 | 每张底部固定图例（`legend()`，y = 400） |
| G12 | 故障线也逐跳 | 红线从 Cache 直接指向 Client | 红虚线 Cache → App → Edge → Client；停在哪一跳，就表示哪一层吸收了故障 |
| G13 | 组件都有去处 | Queue 没有 Worker；Worker 没有下游；Session 只连一台 App | 画进图的组件至少一条入线和一条出线，否则不画 |
| G14 | `title` / `desc` 与图一致 | 图改了，desc 仍描述旧路径 | desc 逐跳写出图上真实画的路径；改图必须同步改 desc |

### 3.1 deck 构图

- 每组 3–6 帧，`viewBox="0 0 960 420"`。组数按 `tools/check.mjs`：Ch01–Ch08 为 4–6 组，Ch09–Ch35 为 5–7 组，Ch36–Ch45 为 6–8 组。
- 累积绘制：`old` 是已经在板上的，`fresh` 是本帧新加的一笔，包在 `<g class="is-new">` 里。
- **最后一帧必须是完整图**，能在 60 秒内口述。被否决的方案用红虚线加 `reject:` 标签画进完整图，比单独画一张对比卡更好（例：Ch03 d2s5「图片经 App 返回」）。
- 至少 70% 的 deck 是架构、时序、状态或故障演化图；指标卡或左右对比卡最多 1 组。估算章也一样：Ch03 把「DAU → QPS → 台数」画成一条请求链逐帧长出 LB 和 10 台实例，而不是 5 张数字卡。
- 组件只在需要时出现：LB 在要扩到多台时才加（Ch03 d1s4），不要第一帧就画全。
- SVG 内文字一律英文（中文、EN、对照三种模式共用一张图）；中文解释放 figcaption。
- figcaption 回答「这一笔为什么加、改变了哪个决定」，要带算式；不要复述框里的字。

## 4. 画法：`tools/board-kit.mjs`

图元从 Ch02 / Ch03 的生成脚本抽出，输出和两章现有 SVG 逐字相同。类名对应 `assets/css/style.css` 的 `.board` 规则。

| 函数 | 画什么 | 语义 |
|---|---|---|
| `client(cx, cy, label)` | 圆头 + 肩弧 | client / 外部调用方 |
| `box(x, y, w, h, label, sub, cls)` | 圆角矩形 | 无状态服务；`box ok` / `box bad` 表示达标 / 过载或故障 |
| `pill(...)` | 胶囊 | Edge / LB / gateway |
| `cyl(cx, y1, y2, rx, label, sub, bad)` | path 身 + ellipse 盖 | 持久存储 |
| `cache(x, y, w, h, label, sub, bad)` | 双层矩形 | cache / CDN |
| `queue(x, y, w, h, label, bad)` | 胶囊 + 三道竖槽 | MQ / event stream |
| `frame(x, y, w, h)` | 虚线大框 | system / region / trust boundary |
| `arrow(pts, kind)` | 正交折线 + 箭头 | `''` 请求 · `reply` 绿色回程 · `async` 橙虚线 · `fail` 红虚线 · 可叠加 `muted` |
| `badge` / `text(..., 'clock')` | 徽标 / 等宽强调字 | 本帧强调的数字，如 `+0.5 ms` |
| `legend()` | 底部图例 | 每张都要 |
| `slideHTML` / `figureHTML` / `splice` / `preview` | 输出与拼接 | 见下 |

坐标约定（按这个来，基本不会压线）：

- **双车道**：同一对节点之间，请求在上（中心线 cy − 9），回程在下（cy + 9）。`client(44, 200)` 的端口是 `(70, 191)` 出、`(70, 209)` 进；框的左边同理。
- **标签**：请求标签在线上方 8 px（y − 8），回程标签在线下方 16 px（y + 16）。标签控制在 ~40 个字符内。
- **折线**只走水平 / 垂直，拐角半径 8 由 `arrow()` 自动处理。不要斜线穿过别的组件。
- **边界**底边 ≤ y 384，给 y = 400 的图例留空；边界标签在 `(x + 16, y + 20)`。
- **圆柱**有副标题时 `y2 − y1 ≥ 46`。
- **cache** 的箭头接前层矩形 `(x, y, w, h)`，后层只是阴影。

生成脚本骨架：

```js
// /tmp/sd-gen/ch04.mjs
import { text, arrow, box, pill, cyl, cache, client, frame, splice, preview } from "/Users/zy/ai_web_page/system_design_web/tools/board-kit.mjs";

const A = {                                   // 一组 deck 一个坐标对象，节点和连线只定义一次
  region: () => frame(120, 18, 824, 364) + text(136, 38, "RATE LIMITER · one region"),
  cl: () => client(44, 200),
  edge: () => pill(200, 170, 110, 60, "Edge", "TLS"),
  app: (sub = "stateless", cls = "box") => box(560, 160, 150, 80, "App", sub, cls),
  cE: (lab = "GET /api") => arrow([[70, 191], [200, 191]]) + text(160, 183, lab, "tiny", "middle"),
  eC: (lab = "200") => arrow([[200, 209], [70, 209]], "reply") + text(160, 225, lab, "tiny", "middle"),
};
const base = [A.region(), A.cl(), A.edge(), A.cE(), A.eC()];

const decks = [[
  { id: "a1", title: "…", desc: "逐跳写出图上画的路径", old: [], fresh: base, zh: "中文图注", en: "English caption" },
  { id: "a2", title: "…", desc: "…", old: base, fresh: [A.app()], zh: "…", en: "…" },
]];

if (process.argv[2] === "splice") console.log(splice("/Users/zy/ai_web_page/system_design_web/chapters/ch04.html", decks));
else console.log(preview(decks, "/tmp/sd-gen/ch04"));
```

`splice()` 按顺序替换章节里全部 `<figure class="deck">`，数量对不上会报错。`id` 用 `d1s1` 这类全章唯一的名字，它同时是 `aria-labelledby` 的前缀和截图文件名。

## 5. 正文：必查清单

| # | 检查项 | Ch02 / Ch03 的实际例子 |
|---|---|---|
| T1 | 每个数字重算，写出算式 | 5 × 80 ms = 400 ms 已超 300 ms，阈值改成 3 个粉丝（240 ms）；「7.23 商小于 1」改成 5,787 ÷ 6,000 ≈ 0.96 |
| T2 | 隐含假设说出来 | 336 次 Primary 读其实假设了所有 miss 都回 Primary，要写明是副本挂掉时的最坏情况 |
| T3 | 量级不同的两件事分开算 | 0.1% 零星 Cache 错误在峰值只有 6 次/秒，可以绕到 Primary；整层宕机是 6,000 次/秒，必须封顶约 100 次/秒，其余给 ≤ 30 s 旧值或 503，按 5,900 次/秒失败 34 秒花完一天预算 |
| T4 | 聚合和单台分清 | 960 Mb/s 是 10 台合计出口，每台约 96 Mb/s |
| T5 | 物理边界准确 | 「和数据库挤在同一个进程里」应为同一台机器 |
| T6 | 机制名和机制一致 | 见 §3 G4；正文里 look-aside、outbox、lease、复制的描述要和图一字不差地对上 |
| T7 | 解法真的能消掉问题 | 「Edge 靠近用户」消不掉跨洋 150 ms；要在用户附近放一套命中路径（Edge、App、Cache） |
| T8 | 例子本身成立 | 按用户分的 timeline key 不会单键 440 次/秒；热点键例子要换成共享对象（`post:9`） |
| T9 | 路由说法准确 | 「user 42 落在 00–7f」应为 `hash(user_id)` 的高位落在 00–7f |
| T10 | 单位和比例准确 | 1024 与 1000 在 KB 差 2.4%，GB 差 7.4%，TB 差 10%，不是笼统的「约 2%」 |
| T11 | 补上会翻车的边界 | 滞后副本回填缓存会把删帖前的旧 timeline 写回去；图片走签名 URL 直传，峰值上传 480 Mb/s 不经过 App |
| T12 | 假设表覆盖全部假设 | 图上用到的每个假设都要有一行并编号（Ch03 补了 CDN 命中率 90%、接入 RTT 20 ms + Cache 命中率 95%、SLO 99.9% + Cache 错误率 0.1%） |
| T13 | 改完图清旧说法 | grep 旧节点名和旧结论（`Disk`、「只在 Stanford 那份」），全部改掉 |
| T14 | 去翻译腔 | 「舰队」→「整层 App」；「磁盘只死一次」「字节数不够格」这类硬译重写成口语 |
| T15 | 结尾同步 | 翻车点表、追问、闪卡要收进新推导（Ch03 翻车点从 5 条补到 6 条，闪卡加 2 张） |

### 5.1 正文深度

- 图注只回答「这一笔改变了哪个决定」。每组图后至少写「正常路径、为什么这样选、替代方案、故障窗口、常见错误」五类里的三类，每类是有因果关系的段落。
- 每个方案按「约束 → 决策 → 代价 → 失败时行为」写。
- 数字至少展开一步计算，并写明它留下或删掉了哪个组件。假设要标成 assumption，不能写得像公开生产数据。
- 合格密度的样子：

> 峰值 6,000 读/秒，按 95% 命中（假设），5,700 留在 Cache，300 次/秒回 Primary，按每盘约 100 次寻道是 3 块盘。整层 Cache 一挂，6,000 次/秒全要寻道，约 60 块盘，所以绕路必须封顶，其余请求给旧值或 503。

- 字数门槛：方法章（Ch01–Ch03）中文 ≥ 5,500 汉字；其他章目标 6,500–9,000。只防压缩，不鼓励注水；重复图注、同义改写、堆云服务名不算。

## 6. 双语

- `lang-zh` 与 `lang-en` 节点数相等（`tools/audit-chapter.mjs` 会数）。
- 英文不逐句硬译，但事实、数字、结论逐项对应。改中文数字必须同时改英文。
- **对照模式重复英文**：表格的中文列里不能再夹 `lang-en` span；表头各用各的语言（Ch02 收尾表就错在这里）。
- **EN 模式露中文**：表格首列标签、`<th>` 也要包 `lang-zh` / `lang-en`（Ch02 假设表首列错在这里）。
- 专业词留英文；SVG 内一律英文。

## 7. 引用

- 首选标准、论文、项目原文、厂商工程原文。站内「见某章」不算引用。不确定的来源不写，禁止虚构论文。
- 正文就地标 `[n]`，页末 `<ol class="references">` 给作者 / 机构、标题、年份、可打开的链接，并用一句话写明本章用了它的哪个数字。
- **每个被引用的数字都要打开原文找到**。PDF 抽出文字后搜数字。Ch03 这样核过：Dean 两份幻灯片（Stanford CS295、LADIS 2009）的 100 ns / 0.5 ms / 10 ms / 150 ms / 20 µs；SRE 书的 52.56 分钟、250 次错误、0.0002% 占 20%；SRE Workbook 两个 99.9% 区域乘成 99.9999%；NIST 的 KiB / GiB / TiB。
- 出处写准版本：缩略图例子两份 Dean 幻灯片都有，不是只在 Stanford 那份；从磁盘顺序读 1 MB，LADIS 2009 写 20 ms，Stanford 写 30 ms，引用时要说明是哪一份。
- 引用只证明外部事实，本章自己的推导仍要在页内算给读者看。

## 8. 验收

### 8.1 命令

```sh
node tools/check.mjs                  # 站点格式
node --check assets/js/slides.js
git diff --check
node tools/audit-chapter.mjs chNN     # 本规范的计数，任何 FAIL 都要处理
node tools/render-slides.mjs chNN     # 护眼主题逐张截图，全部看过
node tools/render-slides.mjs chNN d4s5,d5s5 --theme=dracula                 # 深色抽查最密的帧
node tools/render-slides.mjs chNN --page --locale=both --section=4 --slide=5 # 整页：zh / en / both 各看一次
```

`audit-chapter.mjs` 检查：deck 数与每组帧数、每张 `title` + `desc`、图例、`is-new`、旧式三段圆柱为 0、`lang-zh` = `lang-en`、汉字数、重复 id、引用条数。它不能代替看图。

已知不算 bug：窄屏下图板横向滚动，是全站 `.board` 720 px 最小宽度造成的；headless Chrome 按 420 px 截图时右侧会被截断（改前的页面也一样），窄屏用 600 px 截。

### 8.2 一票否决

出现任一项即退回：

- 没有逐张渲染看过就交付
- 任何回程跳过中间节点；任何箭头指向空白、缺箭头或戳进框
- 图上画的机制与正文相反
- 同一节点在章内换名字
- 截图里能看到压线、穿框、组件越出边界
- 还有旧式三段圆柱；缺图例；`title` / `desc` 缺失或与图不符
- 任何数字算错，或最坏情况假设没说
- `lang-zh` ≠ `lang-en`；对照模式重复英文；EN 模式露中文
- 引用打不开、与结论不符或虚构
- 主体仍是名词方片，或违反 70% 规则
- 中文字数低于门槛，或主要信息只在图注 / 闪卡里
- 引入 D2、Mermaid、Canvas、外站 CDN；`check.mjs` 不通过

### 8.3 交付报告

写给用户，按这个顺序：

1. 结果：改了哪些文件，deck / slide 数从多少到多少，是否提交（默认不提交）。
2. 图的 bug：按 §3 编号归类，每类一句话 + 例子。
3. 正文的事实更正：原说法 → 新说法，附算式。
4. 新增内容：假设行、推导段、翻车点、闪卡、引用。
5. 引用核对：哪些原文下载核过。
6. 验收：§8.1 各命令结果、`audit-chapter.mjs` 关键数字、截图覆盖了哪些主题 / 语言 / 宽度。
7. 没做的和已知问题。

## 9. 并行与共享文件

- 只改自己车道、自己上锁的 `chapters/chNN.html`。
- `assets/css/style.css`、`assets/js/slides.js`、`tools/board-kit.mjs` 是共享文件，车道 agent 不改。发现全站 bug（如 Ch02 时发现的 `--drac-purple` 未定义）先报告，由用户或父代理决定。
- 写入前看目标文件的修改时间；如果刚被改过，说明有别的 agent 在写，先停下确认。
- 播放器已实现：1800 ms 基础节拍，0.5× / 1× / 1.5× / 2×，默认循环，`sd-deck-speed` / `sd-deck-loop` 持久化，60% 进入视口才播，同时只播一个 deck，`prefers-reduced-motion` 时关闭自动播放。章节不写自己的播放脚本，只在复杂时序图上按需设 `data-interval`。
- 不主动 commit / push。
