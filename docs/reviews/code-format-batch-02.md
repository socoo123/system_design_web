# 第2批 Ch05–Ch08 示例代码排版

日期：2026-10-29。状态：**Ch05–Ch08已验收；四作者、轮换独立复核与主代理均已交接，全部锁清空**。累计 **9/45**，下一批Ch09–Ch12。本次仅此一批，未提交、推送或部署。

## 基线与授权

- 主代理：`ses_e78591ea9ffe0l1cIGheDf5cR1`，实际会话API确认模型为 `openai/gpt-6.1-sol#max`；外层路由会话不实施或复核。
- 已实际读取AGENTS、完整PLAN、Ch39的两个Java文件和页面pick/admit/drain三段、样板与第1批记录。根AGENTS为全仓唯一AGENTS。
- 基线：`/private/var/folders/5k/y6qh6sfd2g30js0v0qrv4mfr0000gn/T/opencode/code-format-batch-02-ls6x2ebc`；HEAD `fd61a122399c786edc8b169e8f62d5c8ec829de4`，`main...origin/main [ahead 1]`。`baseline.json`记录2,546个已有文件SHA-256、原工作区状态、四页仅遮罩允许代码内容的哈希；`files/`保存本批源、测试、页面和原计划/记录。
- 原有AGENTS/PLAN、Ch01–04、Ch39及历史记录的全部未提交工作保留。只允许四章维护源码、直接配套测试、页面既有code内容及主代理记录变化；README、同步工具、正文、属性、图源、公共CSS/JS和历史结果保护。
- 通过实际模型列表确认 `openai/gpt-6.1-sol` active且支持max；四个linked child创建时明确指定provider/model/variant，API逐一确认精确一致。当前无直接task工具，采用本机OpenCode V2官方session API与CLI派发，不假定并发上限。

## 分工与任务锁

| 作者 | 章 / 独占文件范围 | 会话（均 `openai/gpt-6.1-sol#max`） | 轮换只读复核 | 状态 |
|---|---|---|---|---|
| A | Ch05页面代码、ConsistentRing.java、ConsistentRingTest.java、handoff.pseudo、check-handoff.py；check-source.py原样使用 | `ses_e7857dd63ffesr9t9vUqWxAVX0` | A审Ch06；D审Ch05 | 作者及审Ch06 PASS已交接，无活动锁 |
| B | Ch06页面代码、VersionedKv.java、quorum-read/write.pseudo、直接测试check.py | `ses_e7857dd62ffdSmHhMcdm9P00Gb` | B审Ch07；A审Ch06 | 作者及审Ch07 PASS已交接，无活动锁 |
| C | Ch07页面代码、IdExample.java、segment.sql、window.pseudo、verify.py | `ses_e7857dd63ffd8Ydfq6eRGb453K` | C审Ch08；B审Ch07 | 作者及审Ch08 PASS已交接，无活动锁 |
| D | Ch08页面代码、LeaseBudget.java、LeaseBudgetTest.java、acquire/transaction.txt、fence/version.sql、renew/release.lua、verify.py | `ses_e7857dd62ffep96i38BlekybnR` | D审Ch05；C审Ch08 | 作者及审Ch05 PASS已交接，无活动锁 |

共享记录仅主代理写入；作者先读样板并盘点真实映射和验证入口，先源后页面，不改同步断言。全部作者交接后复用同四会话交叉复核；原作者返修、原复核者确认最终SHA-256。不得自编自审。

## 交接流水

- 基线、实际工作区与旧锁已核验，未发现未完成前批。四作者已通过 `opencode run --session … --model openai/gpt-6.1-sol#max --format json --auto` 派发。20:36:53一次性派发审计确认四个会话均running、模型与max一致，真实支持四并发；证据为基线目录 `dispatch-evidence.json`，非轮询进度。
- 主代理基线检查：Java17 `javac -g:none -encoding UTF-8`编译四章并运行既有main，Ch05 25项、Ch06 23场景、Ch07原main（4096耗尽/恢复与8线程4000唯一ID等）、Ch08 18项均通过；保存6/3/5/2个class哈希。Ch05原同源与17条handoff契约、Ch06 4块同源/9组quorum交集与7条协调事件、Ch07 3块同源/算术与预留契约通过。证据：`main-baseline-validation.json`。
- 主代理运行基线Ch08原verify.py：隔离备份页面/源码，`TMPDIR`指向批准临时根，真实Redis7.2.5的12组既有检查通过（含7块同源、20竞争者1胜、SQLite谓词与事务模型）；结果仅写临时副本，未覆盖仓库历史JSON。证据：`main-baseline-redis.json`。这不是复制/故障切换、PostgreSQL并发或吞吐实验。
- 主代理阶段检查：16个Java class与基线原字节一致，四个Python AST与字符串/注释/数值一致，17块同源、四页代码外HTML、既有测试及全站/章节/diff检查通过；全量Java和伪代码/SQL/Lua/测试diff已通读。作者仍持写锁，此阶段不能计最终验收。
- 首次提前浏览器检查在结束哈希保护处主动失败：作者B仍在格式化check.py，哈希由 `027b3e65…` 变为 `760db32a…`，页面本身未变。未放宽保护断言、未将该次结果计通过；待四作者交接后统一重跑全部最终浏览器组合和主代理检查。
- C作者已交接Ch07：修改5文件，3块摘录行数29→39、22→31、14→18；Java展开13对安全语句块，SQL/伪代码token保留，Python AST与原断言保持。同源、代码外HTML、既有编译/测试与结构/diff通过；证据目录 `ch07-format-C-JP0IMhm0/`，最终hash已交接。Ch07置待复核，C写锁释放并idle；待其余作者交接后统一轮换B审Ch07、C审Ch08。
- 主代理已实际阅读C的commands和语义证据：C编译的是本章5个class加仓库既有 `docs/reviews/ch07-independent-cases.java` 生成的1个独立用例class，合计6个均原字节一致；原main与既有12项独立用例两版均通过，没有新增镜像测试。
- B作者已交接Ch06：修改5文件，Java全部3class原字节一致，两版23场景（含64次LWW分组）、4块同源、9组quorum交集与7条事件通过；Python AST和12条断言保持，仅移除1个语句分号，伪代码控制流和含注释/字符串token保持。四页代码外保护及结构/diff通过，最终hash含check.py `760db32a…`已交接；证据目录 `code-format-ch06-author-B-6lpvK4sV/`。Ch06置待复核，B写锁释放idle，等待统一轮换。
- A作者已交接Ch05：修改5文件，Java25项、Python17条契约与3块严格同源通过；6个class原字节一致，Java仅实现7对/测试11对安全括号，Python AST与注释/字面量保持，仅移除4个语句分号。证据目录 `code-format-ch05-author-A-h1b_h8jz/`，最终hash已交接；check-source.py原样保留，Ch05置待复核、A写锁释放idle。
- D作者已交接Ch08：修改9文件，release.lua核验原样保留；7块同源、Java18项与两版2class字节一致、隔离Redis/SQL12组通过。Python AST/39条断言保持，仅移除28个语句分号并为长算术断言增加分组括号；Lua/SQL/伪代码含字符串和注释token保持。证据目录 `code-format-ch08-author-d-smp_o5_4/`，最终hash交接，Ch08置待复核、D写锁释放idle。
- 四作者已全部交接；主代理记录精确hash并已派发同四会话执行A→Ch06、B→Ch07、C→Ch08、D→Ch05只读复核，派发继续显式使用 `openai/gpt-6.1-sol#max`。累计仍5/45，等待最终复核与页面/范围验收；提示与hash为基线目录 `*-review-prompt.txt`、`review-dispatch-hashes.json`。
- 以下为实际交接流水；所有中间阶段均未提前计完成。
- B已对Ch07最终5hash独立签发PASS并交接：两版原main/既有12例、6class原字节、Python AST/8条断言、SQL49和伪代码140token、3块同源及页面保护均通过；无返修、无仓库写入。主代理已实际阅读 `review-B/report.json` 与 `manual-review.md`，B复核锁释放。
- A已对Ch06最终5hash独立签发PASS并交接：两版23场景、3class原字节、Python AST/12条断言、4块同源/9组交集/7事件及WAL顺序/页面保护通过；无返修。证据 `review-A/`，A复核锁释放。
- D已对Ch05最终5hash独立签发PASS并交接：两版25项/17条轨迹/3块同源、6class原字节、Python AST/字面量/注释、完整diff及页面保护通过；无返修。证据目录 `code-format-ch05-review-d-egx6x1k_/`，D复核锁释放。仅C审Ch08仍活动，未提前计完成。
- C已对Ch08最终10hash（含未改release.lua）独立签发PASS并交接：两版Java18项/2class原字节一致、隔离Redis/SQL各12组、7块同源、Python AST/39条断言、各语言token与事务/时钟/清理顺序均通过；无返修、无仓库写入。证据目录 `code-format-ch08-review-C-PGMqQhmU/`，C复核锁释放；四任务均已交接。
- 主代理已实际读取四份独立manual-review/report及关键命令原始输出；没有用作者自测替代独立复核。将最终确认四会话idle、25目标hash闭环、历史结果与受保护范围后统一置完成。
- 最终封存通过：21:00:49实际API确认四子会话全部succeeded/idle，主代理与四子会话模型均精确为 `openai/gpt-6.1-sol#max`；25目标文件hash与四独立报告、派发、浏览器及主代理证据闭环一致，72图已read/验hash/清理，无临时服务或仓库编译缓存残留。主代理据此验收四章，累计9/45并清锁。

## 排版与展示指标

仅展开语句、合理换行与阶段空行；无函数拆分、命名/算法更改。Ch05的 `if request.isRead: return readFullKey(request.key)` 展开为缩进的两行；Ch06的 `WAL.append(m); WAL.sync()` 拆两行，分号、注释和顺序保留。Ch08：

```java
renewalSent = now;
pending = true; // at most one renewal in flight
```

原为 `renewalSent = now; pending = true;`，续租状态更新顺序不变。`finishRenewal` 的 `!ok || !usable(now) || …` 仍是同一条件、同一短路顺序。事务伪代码的ROLLBACK先于retry/return，最终COMMIT未移动。

| 章节 / 页面摘录（原顺序） | 行数前→后 | 最长列前→后 |
|---|---:|---:|
| Ch05 ring / router / handoff | 28→39 / 18→24 / 30→37 | 80→80 / 73→74 / 81→81 |
| Ch06 write / read / lww / siblings | 22→29 / 17→25 / 16→29 / 33→50 | 80→80 / 76→76 / 94→79 / 78→76 |
| Ch07 window / next-id / segment | 29→39 / 22→31 / 14→18 | 77→77 / 81→78 / 78→78 |
| Ch08 acquire / release / fence / renew | 12→15 / 5→5 / 8→11 / 11→13 | 84→84 / 66→66 / 81→81 / 80→80 |
| Ch08 budget / transaction / version | 22→41 / 17→26 / 7→9 | 81→72 / 79→79 / 67→67 |

Ch08 `release.lua`本已清晰，源码和页面摘录逐字节保留；不设最低改动量。Ch07及部分Python测试的超100列原字符串/注释保持，未为了列数改写原文。

## 主代理最终验证

所有作者交接后已重新执行，不使用提前浏览器失败那次的结果：

| 命令 / 检查 | 最终结果 |
|---|---|
| JDK17.0.10 `javac -g:none -encoding UTF-8 -d <仓库外目录>` 编译四章；运行 `ConsistentRingTest` / `VersionedKv` / `IdExample` / `LeaseBudgetTest` | 全部通过；25项 / 23场景含64 LWW分组 / 原main各组含8线程4000唯一ID / 18项 |
| 四章与基线两版class原始字节比较 | 6＋3＋5＋2＝16个class全部相同，四个main stdout相同 |
| 编译既有 `docs/reviews/ch07-independent-cases.java` 并运行 `Ch07IndependentCases` | 两版各12项通过；包含它的6个Ch07 class原字节一致，不新增测试 |
| `python3 examples/ch05/check-source.py`、`python3 examples/ch05/check-handoff.py` | 3/3精确同源、17条契约轨迹通过 |
| `python3 examples/ch06/check.py` | 4/4同源、9对strict集合、7条事件及算术通过 |
| `python3 examples/ch07/verify.py` | 3/3同源、原8条断言/循环展开11次、预留/丢回复烧号等模型通过 |
| 隔离最终副本 `python3 examples/ch08/verify.py <Redis7.2.5>` | 12/12组通过，含7/7同源、1胜19拒绝、owner/TTL/SQLite谓词与事务契约；仓库历史JSON未写入 |
| 四个Python完整AST及字面量/注释/数值序列比较 | 完全一致；精确token差异为分别移除4/1/4/28个语句分号，Ch08额外一对长断言分组括号；未忽略字符串或缩进 |
| 四个Java源/测试字面量与注释比较、全量diff阅读 | 原文保持；条件/短路/时间采样/更新/锁/事务/异常边界顺序未变 |
| `node tools/check.mjs` | 退出0：45章、276组图、1411帧、206代码块，结构/资源/无障碍/双语/动画保护通过 |
| `node tools/audit-chapter.mjs ch05 ch06 ch07 ch08` | 退出0；分别5/6/5/5组图，25/30/26/26帧，3/4/3/7代码块 |
| `git diff --check` | 退出0，无输出 |

真实完整命令/退出码/输出：基线目录 `main-baseline-validation.json`、`main-final-validation.json`、`main-final-java.json`、`main-ch07-independent.json`、`main-baseline-redis.json`、`main-final-redis.json`。Ch08是独立单Redis、SQLite谓词/契约检查，不是PostgreSQL并发、复制切主、操作系统调时或吞吐验证。

### 页面保护哈希

仅用固定占位内容替换现有 `<pre><code>` 内部后，四页与本批基线逐字节一致；所有正文、SVG、图注、闪卡、HTML属性/结构、块数及其他页面内容保持：

| 页面 | 遮罩后SHA-256（主代理统一算法） |
|---|---|
| Ch05 | `d4067be84552d99e9d28588d8b223ff74cdf8e9ccdde42e1824ca6906ad5d6c8` |
| Ch06 | `c198b45ab5789dc07e7862bb671713a69db3872ca9a26209904c0741c87e7ee0` |
| Ch07 | `069655184e8c24f11c3be8b4c7072d36f7fc1ca088edc1de93d8c905da28c273` |
| Ch08 | `010e9f36a1c1eca50f0250a927bbd62d2bd521cc046a8e1086f62f78c7055231` |

作者或复核者若用不同遮罩字样，其哈希可不同；逐字节保护结论及最终原文件hash必须一致。

### 真实浏览器与截图实看

本机真实 **Chrome/156.0.8078.48**＋CDP，临时只读HTTP服务加载最终四页：

- 四章 × **1440×1000 / 320×900真实viewport** × parchment(light)/dracula(dark) × zh/en/both，**48/48组合通过**，运行时异常0；不是桌面裁成手机宽度。
- 浏览器实际代码文本与HTML解码后精确相同；两语言和对照显示均正确，17个代码块缩进、分段、边界清楚。桌面均无需横向滚动，无截断。
- 手机整页宽度严格320；所有代码容器clientWidth=252，`overflow-x:auto`、`white-space:pre`，均可实际滚至最右端，有“左右滑动查看完整代码”提示，不造成整页溢出。
- 各章手机代码scrollWidth按页面顺序：Ch05 **618/575/625**；Ch06 **618/589/611/589**；Ch07 **596/604/604**；Ch08 **647/517/625/618/560/611/524**。
- 主代理已通过 `functions.read` **逐一实际查看72张最终PNG**：17块×两尺寸×两主题的68张，加每章1张真实320px右滚整视口图。四页两主题均可读，长行是容器内横向滚动，不是永久裁断。
- 72张图SHA-256均与浏览器清单核对后逐文件清理；浏览器前后、截图实看后所有25个目标文件hash均与作者交接、最终主代理检查及独立复核派发hash精确一致。未在仓库留截图或编译产物。
- 最终布局与截图清单：`browser.json`，SHA-256 **`a1ada664da1767fcf27eb1f7f8dfbe6fb589c4271d8ee58e2fe08028672b93c6`**；72张图片hash、实际查看与清理记录：`screenshot-review.json`。临时HTTP服务和本批Chrome进程由脚本finally结束，最终收口另查残留。

## 最终章节文件 SHA-256

24个实际修改的章节文件如下；另由主代理更新PLAN和本记录。Ch08 `release.lua`、Ch05同源工具、README和所有历史结果保持基线。

| 文件 | SHA-256 |
|---|---|
| `chapters/ch05.html` | `bf87b424ae2537d08369c1ec58938ac81a48da42156504bffb0e44479907909d` |
| `chapters/ch06.html` | `c8b58574b33cbdab60a7f5ff1bc27172e023205087c5bb7940503bdb1489fd9b` |
| `chapters/ch07.html` | `71f62294ae86fd9fe92b78e96702e3c5793b6e56cda3ccccf067be7424b9aac7` |
| `chapters/ch08.html` | `4d625010a94b7e9c446286539ed08d524309f8bb217c9621329463ecf5c91116` |
| `examples/ch05/ConsistentRing.java` | `e082c5c15268c3809fac60f766ecb2d81e9d4b30edb548ac34537a7fdc91c6ca` |
| `examples/ch05/ConsistentRingTest.java` | `058387ac0bda7927c243b06fabb6ac49202409c539329cc49cf053e665d6a416` |
| `examples/ch05/check-handoff.py` | `b62b45f088165c9df5cfa5f398f03e39d33f7b1412cbca2ae9418504aeb7a2a9` |
| `examples/ch05/handoff.pseudo` | `14d75a192e2bbaa58b040dea719b2d9c1f77bbfb2705e27ceb32d4e966d50313` |
| `examples/ch06/VersionedKv.java` | `8434d150a697fe147163f48e7ecd246df823724a77b05de632d2b6c7dd07c39d` |
| `examples/ch06/check.py` | `760db32aca6f8a2e22ab938d0e363ef39dcced4aabc972065fd99a9cb43d5906` |
| `examples/ch06/quorum-read.pseudo` | `a7f5002bd20a6c4666be6e6f767b69c770a3cd36ae5b6c5423688d53b5cb1e25` |
| `examples/ch06/quorum-write.pseudo` | `991a994485e0a760e0b63e46e6fbb9980dbaafa921b4476121f4991cc86ceab0` |
| `examples/ch07/IdExample.java` | `0b1f4bf7d797ba0e3d7e85b0048ceeb95a8af6d68bef0df195db64c97e68c365` |
| `examples/ch07/segment.sql` | `959030b4cc9a9d5bee6cee4d542aa1fd62c18db2e8db928540ffee6846b284c9` |
| `examples/ch07/verify.py` | `4e74db96c3e1a87f835a362db4f6980d38806617e022e2a0151a68523f790e93` |
| `examples/ch07/window.pseudo` | `35c48e99534f49c9e0ea562715d6bf78f3506912eb133a2c23db68d6d6d482c5` |
| `examples/ch08/LeaseBudget.java` | `4cbc3a87f1e6b740f92024007ace6a883d389b99e32b8f8b1f3d95f733a4ec94` |
| `examples/ch08/LeaseBudgetTest.java` | `9c25b2de6e4a360a210bb492804041dee3a180f91396ade02d0b8d73e0b545b2` |
| `examples/ch08/acquire.txt` | `4c3c0ee14e0ffd7eba765be25744e47991eb0f762693842dbc2bc8605273fc24` |
| `examples/ch08/fence.sql` | `251557ea4105b2da40f85c1e1532d15a7474fd89e5c11e8e14f95ad1e690a266` |
| `examples/ch08/renew.lua` | `ea42f1752ab9f301f25d07e97ee07c5bb3d1a2fa9b66cf19eb85bfe9c5e19fc8` |
| `examples/ch08/transaction.txt` | `7456f56773df0a9668b0e1d2fba7b6abaddca042dad28fbf11c08c0c18b1054e` |
| `examples/ch08/verify.py` | `1f5f89052a3d6eebe2d08778da8a15386eacd613f2d32173f93dd3a41324fe37` |
| `examples/ch08/version.sql` | `7e05a632e4612c75bc99d8d0cd496db7ef8379ac9b37b3009260ef0ac29c8867` |

## 独立复核与最终范围

| 复核者 → 章节 | 最终结论 | 实际报告位置（基线目录或批准临时根下） |
|---|---|---|
| A → Ch06 | PASS，5文件精确hash；两版23场景、3class原字节一致，WAL/短路/伪代码嵌套保持 | 基线 `review-A/report.json`、`manual-review.md`、`final-seal.json` |
| B → Ch07 | PASS，5文件精确hash；原main＋既有12例、6class原字节一致，SQL/伪代码事务与时钟边界保持 | 基线 `review-B/report.json`、`manual-review.md` |
| C → Ch08 | PASS，10文件精确hash含未改release；18项、隔离Redis/SQL12组、2class及39条原断言保持 | 临时根 `code-format-ch08-review-C-PGMqQhmU/report.json`、`manual-review.md`、`commands.json` |
| D → Ch05 | PASS，5文件精确hash；25项、17轨迹、6class原字节一致，CAS快照及handoff事务边界保持 | 临时根 `code-format-ch05-review-d-egx6x1k_/report.json`、`manual-review.md`、`commands.json` |

主代理已实际阅读上述四份报告、人工diff结论与关键命令输出。四份独立检查分别执行10/17/10/12条命令，全部退出0；没有自编自审或复核者代改。全部最终文件精确对应上表SHA-256，不以中间版本结果代替最终确认。没有返修项、模型阻塞或新发现的实质技术问题；保留教学模型本身的局限，不借排版扩展保证。

最终范围：相对本批2,546文件实际工作区基线，仅24个章节文件和PLAN改变，新增本记录；其余 **2,521个已有文件逐字节保持**（2,520个受保护文件＋授权范围内原样保留的release.lua）。包括AGENTS、Ch01–Ch04与Ch39已有成果、其他全部章节、公共CSS/JS、全部图源、README、同源工具、既有独立测试和历史JSON。Ch08历史结果SHA-256仍为 `ce6244aaaa4a5d5f3085408de64bd98c7d6f16a2e70893cc578aa5991f354c95`。HEAD未变；没有仓库内截图、class、pyc或新镜像测试，无本批临时HTTP/Chrome/Redis服务残留。

证据封存：基线 `final-seal.json` 保存四独立报告SHA、25目标hash及所有闭环断言；`handoff-sessions.json`保存四会话succeeded/idle及五会话精确模型；`scope-final.json`保存最终受保护路径/hash范围检查，`final-hashes.json`为24个修改文件最终哈希。

## 恢复位置

本批全部验收、四子任务交接闲置且锁已清，**9/45**。下一批 **第3批Ch09–Ch12**，本次未启动；由用户或外部控制器清空上下文后再发PLAN §7提示词。恢复先读PLAN §0与实际工作区、此记录；临时基线失效时按最终hash/Git/工作区重建证据，不能还原用户改动。

本次未提交、推送或部署；按用户要求报告后停止，不在本上下文开启下一批。
