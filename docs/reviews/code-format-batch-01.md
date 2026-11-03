# 第1批 Ch01–Ch04 示例代码排版

日期：2026-10-29。状态：**Ch01–Ch04已验收，作者、轮换复核与主代理验收均已交接，活动锁清空**。累计 **5/45**；下次第2批Ch05–Ch08。本次仅此一批，未提交、推送或部署。

## 基线与授权范围

- 主代理：`ses_e78a7fa15ffe2gQOc85mHp2Ioo`，实际会话 API 确认为 `openai/gpt-6.1-sol#max`。外层路由会话不承担编写、复核或验收。
- 已实际读取根 `AGENTS.md`、完整 `PLAN.md`、Ch39 源码/测试与页面三段样板、`docs/reviews/code-format-ch39.md`；全仓查找仅有根 AGENTS，无下级指令。
- 执行前 HEAD：`fd61a122399c786edc8b169e8f62d5c8ec829de4`；分支 `main...origin/main [ahead 1]`。
- 已有修改保留：`AGENTS.md`、`PLAN.md`、`chapters/ch39.html`、`examples/ch39/LoadBalancing.java`、`examples/ch39/LoadBalancingTest.java`；已有未跟踪 `PLAN.archive-2026-10-29.md`、`docs/reviews/code-format-ch39.md`。
- 本批基线：`/private/var/folders/5k/y6qh6sfd2g30js0v0qrv4mfr0000gn/T/opencode/code-format-batch-01-kygy0bvy`。`baseline.json` 保存 HEAD、状态、2,545个已有文件哈希及页面受保护部分哈希；`files/` 备份本批文件及原记录。基线不以 Git HEAD 代替当前用户工作区。
- 页面只允许修改已有 `<pre><code>` 内容；所有正文、图、属性、结构和代码块数保持。共享文件仅主代理写入；作者不改共享同步/结构验证工具、README、测试结果记录或其他章节，本章直接配套测试仅排版、不改变断言。

## 盘点与分工

| 作者 | 章节 / 范围 | 源码与摘录 / 既有入口 | 会话（均 `openai/gpt-6.1-sol#max`） | 状态 |
|---|---|---|---|---|
| A | Ch01：页面代码、`product-read.pseudo`、`verify_traces.py` | 1块伪代码；虽无 data-source，但测试严格逐字核对维护源码；`python3 examples/ch01/verify_traces.py` | `ses_e78a69d3affeJXQLxKwRdYvYRu` | 作者交接；D审Ch01 PASS；A审Ch02最终PASS，均已结束 |
| B | Ch02：页面3块代码、`ReadPath.java`（内含测试） | Java `BEGIN PAGE` 摘录＋事务/outbox与故障切换伪代码；Java17编译并运行 `ReadPath`；无同步脚本 | `ses_e78a69d3affdc40ypC3wdxflBG` | 作者/返修交接；A确认最终PASS；B审Ch03 PASS，均已结束 |
| C | Ch03：页面1块代码、`CapacityEstimate.java`（内含测试） | Java `BEGIN PAGE` 摘录；Java17编译并运行 `CapacityEstimate`；无同步脚本 | `ses_e78a69d39ffeKYaJSPvg6RYlBw` | 作者交接；B审Ch03 PASS；C审Ch04 PASS，均已结束 |
| D | Ch04：页面代码、`token-bucket.lua`、`verify.py` | Lua＋2块伪代码＋HTTP数据；Lua有维护源码，测试严格逐字核对；`verify.py <redis-server>` 会写原有结果JSON，只在仓库外隔离副本运行 | `ses_e78a69d3affcH0bFmFIC36eb1M` | 作者交接；C审Ch04 PASS；D审Ch01 PASS，均已结束 |

派发入口已核实为本机 OpenCode V2 官方 session API（当前工具目录无直接 task 工具）；四个 linked child 创建时显式指定 provider、model、variant，并逐一核对 API 返回值。通过 `opencode run --session … --model openai/gpt-6.1-sol#max --format json` 派发；19:11:30 的实际会话 API 确认四位作者同时为 running，模型均精确匹配，证据为基线目录 `dispatch-evidence.json`。复用这四会话进行 **A审Ch02、B审Ch03、C审Ch04、D审Ch01** 的只读复核；不另建第二组，不自编自审。

## 交接流水与任务锁

- 四位作者、B返修、四个轮换只读复核与主代理均已交接；无子任务、章节写锁或共享记录维护锁。实际API确认四个子会话均succeeded/idle，模型精确保持，见基线 `handoff-sessions.json`。
- A作者交接Ch01：伪代码3处阶段空行，21→24行；Python用例参数换行、展开单行if，最长行119→98。作者运行11例与其余契约断言、章节结构、diff空白检查通过；Python AST及含注释/字符串的非布局token相同，页面唯一代码块严格同源、代码外逐字节相同。三文件哈希见 `A-author.jsonl`；作者交接时未提前计完成。
- B作者交接Ch02：Java摘录24→41行；两个伪代码初稿原样保留。两版Java17编译与main自测通过、13个class逐字节一致；仅新增9对安全大括号，其他token含字符串/注释相同；同源、代码外HTML、全站与章节结构、diff空白检查通过。随后进入A独立复核，并对伪代码另行最小返修，见下文。
- C作者交接Ch03：唯一摘录20→28行，最长行74列；普通编译及两版main通过，`-g:none`的1个class逐字节一致；精确同源、代码外HTML、章节/全站结构与diff检查通过。最终2文件哈希见 `C-author.jsonl`，随后由B独立复核。
- D作者交接Ch04：Lua保留两空格惯例，展开单行if与分段；Python展开多语句、分支及长参数，AST、11条断言与字面量/注释原文保持；2块伪代码只增空行，HTTP数据逐字节保留。隔离副本真实Redis7.2.5既有7/7组通过，页面严格同源、代码外HTML、结构与diff检查通过；原历史JSON未变。最终3文件哈希见 `D-author.jsonl`，随后由C独立复核。
- 主代理已重跑Ch01最终11例与AST/token、同源及页面保护检查通过；已编译运行Ch02/03基线。Redis未预装，官方源码urllib下载曾403，改用curl HTTPS成功并在仓库外构建Redis7.2.5；基线Ch04既有7组检查通过，原历史JSON保持未动。构建与隔离测试证据均在本批基线目录。
- B对Ch03独立签发PASS并交接：最终2文件哈希精确匹配，Java token仅新增4对安全大括号；独立两版编译/原main通过、1个class原字节一致；同源、代码外HTML、章节/全站结构与diff检查通过。未改仓库文件，无返修。
- 主代理独立最终检查：Ch02的13个class与Ch03的1个class均与基线逐字节一致，两个main通过；Ch04 Python AST相同，非布局token只移除语句分号并为回拨assert增加一对分组括号，字面量与注释原文保持；Lua token含注释/字符串完全相同，HTTP逐字节保持，既有Redis最终7/7组通过（并发1允许/19拒绝、等待115000ms、TTL219999ms）。原历史结果SHA-256仍为 `91178e3ef91400ea6fa53a4eb0db82a413d3e2e5b2246de8ebbfb8b4afbd9081`。
- 辅助检查说明：主代理首次严格Python token比较报告上述新增assert分组括号；已结合完整AST及具体上下文确认仅为安全换行，并单独记录两个插入token，不把所有括号或字符串空白忽略。没有改共享同步/结构验证工具，也没有改变项目断言内容。
- 阶段范围检查：除本批10个章节文件、PLAN及新增本记录之外，2,534个已有文件与本批基线逐字节相同；含原Ch39、AGENTS、全部公共代码、图源、其他章节、README与历史结果。
- A对Ch02首轮结论 **NEEDS_CHANGES**：第三块 `promote candidate; publish new routing generation`、`resume writes; rebuild an independent replica` 每行仍含两项独立操作，不符合§2.2。其余Java/行为/范围/同源及13个class字节检查全部通过。主代理已退回原B，仅将两行拆四行，保留原文、分号和顺序；A不代改，待B交接后由原A确认最终hash。未将初稿计为完成。
- B最小返修交接：严格仅第三代码块2行拆4行，原分号/文字/顺序保持，Java及其他内容未变；同源/HTML保护、章节结构与diff检查通过。页面最终SHA-256改为 `a0fae7be246d500bc994b62889407c83a73a149a447398a7a120e674f28e1ab7`，Java仍 `7f6ff747cd7d04bed1698ff716685f1f6ed29d7977da573007dfc6be8ee0c5fc`；随后原A确认最终PASS，浏览器只验此新版本。
- D对Ch01独立签发PASS并交接：最终3文件hash精确匹配，伪代码仅3处空行、其余非空行逐字一致；Python AST及674个含注释/字符串的非布局token完全相同，11例与全部契约断言通过；同源、代码外HTML、全站/章节结构及diff通过。未改仓库文件，无返修。
- C对Ch04独立签发PASS并交接：最终3文件hash精确匹配，Lua346个token含字符串/注释/数值完全一致；Python AST、11条断言保持，token差异精确为移除19个语句分号与新增一对分组括号；独立隔离副本Redis7/7组通过（1允许/19拒绝，等待115000ms、TTL220000ms）。HTTP与历史JSON逐字节保持；同源、代码外HTML、结构与diff均通过。证据位于 `/private/var/folders/5k/y6qh6sfd2g30js0v0qrv4mfr0000gn/T/opencode/ch04-independent-review-98t8084g/`。
- 原A对Ch02返修最终版签发PASS并交接：相对首轮严格仅2行拆4行，其余页面与Java未变；新页面hash精确匹配，保留分号及顺序，返修项关闭。Java源码hash不变，明确引用首轮13个class/原main证据而未声称重编译；最终同源、代码外HTML、章节结构及diff通过，见本批基线 `A-review-ch02-final.jsonl`。
- 作者完成后须交接实际变化、命令结果、最终 SHA-256 和遗留问题，释放写锁；之后才安排轮换只读复核。
- 独立复核、主代理测试、同源、结构、真实浏览器/截图实看与最终范围检查全部通过后，才将四章标完成，累计 **5/45**。

独立复核原始证据（均在上述批准临时目录的同级目录）：

| 复核 | 证据目录 / 文件 |
|---|---|
| A审Ch02 | `code-format-ch02-review-A-snpwha1r/report.json`、`followup-final.json`；首轮返修关闭对应最终新页面hash |
| B审Ch03 | `code-format-ch03-independent-pynzhh9a/report.json`；最终2文件hash确认 |
| C审Ch04 | `ch04-independent-review-98t8084g/static-review.json`、`run-evidence.json`；最终3文件hash确认 |
| D审Ch01 | `code-format-ch01-review-d-6un7sm94/report.json`；最终3文件hash确认 |

主代理已实际读取这些报告与关键命令输出，不以作者自测代替独立复核。

## 少量前后对照

Ch02的 `if (!budget.admit()) throw new Unavailable("origin budget");` 展开为可见语句块，表达式及字符串保持：

```java
if (!budget.admit()) {
    throw new Unavailable("origin budget");
}
```

切主片段由 `promote candidate; publish new routing generation`、`resume writes; rebuild an independent replica` 拆为四行，原分号与顺序保留。Ch04的 `if raw then state = cjson.decode(raw) end` 按Lua两空格惯例展开；HTTP块核验原样保留。

| 展示代码 | 行数前→后 | 最长列数前→后 |
|---|---:|---:|
| Ch01伪代码 | 21→24 | 76→76 |
| Ch02 Java / 切主伪代码 | 24→41 / 12→14 | 90→86 / 74→74 |
| Ch03 Java | 20→28 | 74→74 |
| Ch04 Lua | 32→42 | 75→75 |
| Ch04两块伪代码 / HTTP | 8→10、17→21 / 6→6 | 74→74、77→77 / 71→71 |

Ch02事务/outbox块21行原样保留。没有最低改动量或强制重写要求。

## 验证与最终证据

### 最终章节文件 SHA-256

以下10个文件为本批实际变化范围；主代理另更新 `PLAN.md` 与本记录。已有Ch39、AGENTS和历史归档/结果不纳入本批改动。

| 文件 | SHA-256 |
|---|---|
| `chapters/ch01.html` | `1e1f15d16fdbbd26a60ae546af1e63fa5c873193c3415fa9088302a6d23afcb9` |
| `chapters/ch02.html` | `a0fae7be246d500bc994b62889407c83a73a149a447398a7a120e674f28e1ab7` |
| `chapters/ch03.html` | `9b0dee5439a4f39c49da6e026dd7492d5ecbcd3f13cbfff7992c6ead1cd751fa` |
| `chapters/ch04.html` | `270d914a2cf98b5a9439ced20a9f60e7bcd44cd28bf43e0f2abcc46966282093` |
| `examples/ch01/product-read.pseudo` | `da1b2b0fba38d7df3cf65f5cf9ffa134d7c457c1690f64fec15e65fc0f5885cc` |
| `examples/ch01/verify_traces.py` | `44e598bd24e2c242d9ffc88d318f8bb4989c27ff1bc3b2aaa5f2dd3691b86d3c` |
| `examples/ch02/ReadPath.java` | `7f6ff747cd7d04bed1698ff716685f1f6ed29d7977da573007dfc6be8ee0c5fc` |
| `examples/ch03/CapacityEstimate.java` | `c87e3699d5c1d8ec38c195af351640a8bacc4fcdfd4f67f7d77735a09c5e2033` |
| `examples/ch04/token-bucket.lua` | `2a1c2dcd914f9d221ec6a7169051d66f8b6b49ffa674637763c4e4c37d3fc008` |
| `examples/ch04/verify.py` | `a6f21ef4c36f2ea7d5a7e254846b797aaee304d7e8d92954e1794b0c3dafd0aa` |

### 主代理最终结构与同源

- `node tools/check.mjs`：退出0，45章、276组图、1,411帧、206代码块，结构/资源/无障碍/双语/动画保护通过。
- `node tools/audit-chapter.mjs ch01 ch02 ch03 ch04`：全部通过，代码块分别1/3/1/4，图和帧统计保持。
- `git diff --check`：退出0，无输出。
- 4/4维护源码映射精确同源：Ch01伪代码、Ch02保留源码4空格摘录、Ch03按既有规则去公共4空格、Ch04 Lua含末尾换行；无同步脚本的章节只精确替换代码内容。
- 四章页面仅遮罩代码内容后与基线逐字节一致；Ch02事务/outbox块完全保持，切主伪代码严格只拆指定2行；Ch04 HTTP数据完全保持。
- 最终命令、各块前后指标与上述10文件哈希：基线目录 `main-final-validation.json`、`final-hashes.json`。Java辅助证据为 `main-baseline-java.json`、`main-final-java.json`；Ch01与Ch04实际检查为 `main-ch01.json`、`main-ch04.json`。

### 页面验收

使用本机真实 **Chrome/156.0.8078.48**，通过CDP `Emulation.setDeviceMetricsOverride` 设置真实视口、本地只读HTTP服务加载最终页面：

- 4章 × **1440×1000 / 320×900** × parchment/dracula × zh/en/both，**48/48最终组合通过**；运行时异常0。不是将桌面页面裁成320px。
- 9块代码在桌面均无需横向滚动；320px整页宽度严格为320，无整页溢出。代码各自容器 `overflow-x:auto`、`white-space:pre`，可到达最右端并显示横向滚动提示；浏览器实际文本与HTML源码解码后精确一致。
- 手机代码容器clientWidth=252；各块scrollWidth：Ch01=589；Ch02=661/690/575；Ch03=575；Ch04=582/575/596/553。滚动发生在代码容器内，不扩宽页面。
- 主代理通过 `read` **逐一实际查看40张最终PNG**：9块×2尺寸×2主题的36张，以及每章各1张真实320px右滚到行尾的整视口图。缩进、条件/异常边界及逻辑分段清晰；两主题可读，代码未被永久裁断。
- 补充整视口截图初次曾因平滑滚动与CSS scroll-margin未定位到代码；临时拍摄脚本改用绝对位置瞬时滚动，保留可见位置断言后重新跑全部48组合。未修改仓库CSS/JS或放宽任何项目检查，只采用最终重跑证据。
- 浏览器前后及实际查看后，10个章节文件hash均与作者/最终独立复核一致。40张PNG实际查看并核对哈希后已逐文件清理；全部图片hash及查看/清理记录留在基线 `screenshot-review.json`，布局/主题/语言数据与截图清单在 `browser.json`。
- 最终 `browser.json` SHA-256：`7b75595b50417726bd2e8d22d8e083372a77b89c7a6318be1d4aec8b9a330e0b`。中间结果不作为最终验收证据。

四张已实际查看并清理的真实320px右滚整视口图：

| 图片 | SHA-256 |
|---|---|
| `ch01-scroll-right-320-dracula.png` | `59ff3385a4c3f6efc952926a170f053cd7b2c3ed807ef7c2df7f689ad3a4104c` |
| `ch02-scroll-right-320-dracula.png` | `13479602a8766d1cd43dfb55db9ab2564c821ce9aa9f4f7a9a98cd37539e9a7b` |
| `ch03-scroll-right-320-dracula.png` | `0fa17efa931426b81b9c44c035bd4610af4a77cb2f212fc45df03f521626bed7` |
| `ch04-scroll-right-320-dracula.png` | `4c3439e1218437c604b9189be7fbb1f0a529f1af1505777695513d89c77e8988` |

## 最终范围与遗留事项

相对本批实际工作区基线，仅10个章节文件和 `PLAN.md` 改变，新增本记录；其余 **2,534个已有文件逐字节保持**，含AGENTS、Ch39全部成果、其他40章、公共CSS/JS、全部图源、README、同步/验证工具和历史测试结果。未留下仓库内编译产物或截图，HEAD未变。

无未关闭返修项、模型阻塞或新发现的实质技术问题。既有测试仍是教学契约/算术模型；Ch04没有新增故障切主、复制丢失、系统调时、驱逐或吞吐量验证，Ch01也不证明生产分布式限流或时钟保证。没有借排版改变算法或扩大范围。

## 恢复位置

本批结束并清锁，**5/45**；下一批 **第2批 Ch05–Ch08**，本次没有启动。由用户或外部控制器清空上下文后再发送PLAN §7提示词，不在当前上下文继续下一批。恢复先读PLAN §0、实际Git状态及本记录；临时基线失效时按最终hash与Git/工作区重建证据，不还原用户改动。

本次未提交、推送或部署。后续运行Ch04既有测试时仍须隔离会写结果的副本，不能覆盖原有历史JSON；不得放宽验证断言取得通过。
