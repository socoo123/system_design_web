# 第3批 Ch09–Ch12 示例代码排版

日期：2026-10-29。状态：**Ch09–Ch12已验收，四作者、轮换独立复核及主代理全部交接，活动锁清空**。累计 **13/45**，下一批Ch13–Ch16。本次仅此一批，未提交、推送或部署。

## 基线与授权

- 实际主代理：`ses_e77fee873ffe66XPhI2Ohdz661`，会话API确认 `openai/gpt-6.1-sol#max`；外层路由不实施、不复核、不写PLAN。
- 已实际读取完整AGENTS/PLAN、Ch39两个Java文件、页面pick/admit/drain三块、样板及第2批验收记录；根AGENTS为全仓唯一入口。
- 基线：`/private/var/folders/5k/y6qh6sfd2g30js0v0qrv4mfr0000gn/T/opencode/code-format-batch-03-44a1tuqt`。HEAD `fd61a122399c786edc8b169e8f62d5c8ec829de4`，main ahead 1；`baseline.json`记录2,547个已有文件SHA-256、执行前状态、四页仅遮罩code内容后的哈希，`files/`备份四章完整维护目录、页面及已有计划/记录。
- 既有AGENTS/PLAN、Ch01–Ch08、Ch39与历史记录全部保留。允许本批维护源码、直接配套测试、页面既有code内容和主代理记录变化；README、sync工具、图源、正文/属性/结构、公共CSS/JS、历史结果保护。
- 实际模型列表确认 `openai/gpt-6.1-sol` active且有max。当前无专用subagent工具，实际阅读OpenCode技能、V2 API文档、本机`/openapi.json`及CLI帮助后，以官方session API创建4个linked child；逐一验证parentID、模型及max，不猜API。

## 分工与任务锁

| 作者 | 独占范围 | 会话（均 `openai/gpt-6.1-sol#max`） | 轮换只读复核 | 状态 |
|---|---|---|---|---|
| A | Ch09 schema/create/redirect/revoke、verify.mjs、页面既有code | `ses_e77fdbe6fffe32wdLkGj7vY4Qg` | A审Ch10，D审Ch09 | 作者及审Ch10 PASS均交接，succeeded/idle，无活动锁 |
| B | Ch10 model/accept/claim/deliver/retry、verify.py、页面既有code | `ses_e77fdbe6cffeIa6kbJddMGXpmc` | B审Ch11，A审Ch10 | 作者及审Ch11 PASS均交接，succeeded/idle，无活动锁 |
| C | Ch11 schema/publish/fanout/cache、FeedPage.java、FeedPageTest.java、verify.mjs、页面既有code | `ses_e77fdbe6effdsi8Ogg9uVZhZR0` | C审Ch12，B审Ch11 | 作者及审Ch12 PASS均交接，succeeded/idle，无活动锁 |
| D | Ch12 schema/submit/receive/receipt/route、ChatContracts.java、verify.py、页面既有code | `ses_e77fdbe6effe6SBstQpqS44eJd` | D审Ch09，C审Ch12 | 作者及审Ch09 PASS均交接，succeeded/idle，无活动锁 |

共享记录仅主代理写。作者全部交接后复用同4会话交叉只读复核，返修仅原作者修改、原复核者确认最终hash；不能自编自审。注释/字符串原文（包括内部空白）、原条件表达式结构和短路顺序、锁/事务/时间采样/更新/异常顺序必须保留。

## 交接流水

- 核对实际工作区及前批4会话，均succeeded/idle，无遗留任务；已保存本批基线并建立同模型团队，尚未开展实施验收。
- 四作者已通过 `opencode run --session … --model openai/gpt-6.1-sol#max --format json --auto` 后台派发；22:15:40一次性派发审计确认4会话均running、模型/max精确一致，实际支持本次四并发，非主动轮询。证据为基线目录 `dispatch-evidence.json`；提示和命令输出保存在 `A/B/C/D-author-prompt.txt`、`*-author.jsonl`。
- 主代理已从保存的修改前文件运行隔离基线：19块同源、Ch09 21项、Ch10 52项、Ch11 18项契约＋16项Java、Ch12 49项契约＋15项Java均通过；JDK17以`--release 17 -g:none -encoding UTF-8`编译，保存Ch11 11个/Ch12 3个class原字节hash。四个验证入口均写历史JSON/txt，全部结果只落临时副本。
- 首次隔离运行在Ch10缺少旧验收基线`docs/reviews/ch10-ch11-ch12-baseline/ch10.html`处失败，属于主代理隔离副本漏拷依赖，未修改断言；补拷并核对受保护依赖hash后，新隔离目录完整12条命令通过。失败原始输出保留`main-baseline-first-missing-dependency.json`，通过证据`main-baseline-validation.json`，不隐去失败、不将其计通过。
- 主代理阶段核对：18份SQL/伪代码含注释/原始字面量token完全一致，2份Python完整AST与原始字符串/数值/注释一致；2份JS用仓库既有Babel parser核对，仅新增安全单语句控制体括号（Ch09 16对、Ch11 12对），规范化AST、原始字面量和注释一致；3个Java文件仅安全控制体括号与排版。主代理已读源码diff及当前状态测试内容，四页代码外保护、2个内联HTTP数据块原样、全部2,517个范围外已有文件通过阶段保护。作者仍持锁，本次阶段检查不计最终验收，交接后统一重跑。
- C作者后台完成通知已送达并正式交接Ch11：8文件最终hash与实际文件完全一致，5块同源、两版18项契约＋16项Java、11个class原字节、JS AST/45条原断言、SQL/伪代码token与控制层级通过；原sync两空格区域标记及工具后缀保护。主代理实际读`author-C/report.json`、`manual-review.md`及最终交接，写锁释放，Ch11置待复核；待其他作者全部交接再统一轮换。
- B作者后台完成通知已送达并正式交接Ch10：7文件最终hash、5块同源、两版52项契约、Python完整AST/3条assert/48处check、SQL/伪代码token与控制层级通过；原工具协议/结果写入区及无源HTTP块保持。主代理实际读`author-B/report.json`、`manual-review.md`及最终交接，Ch10置待复核并释放B写锁；A/D仍在作者收尾，累计仍9/45。
- A作者后台完成通知已送达并正式交接Ch09：6文件最终hash、4块同源、两版21项契约、JS AST/56条原断言/16对安全控制体括号、SQL/伪代码token与缩进控制层级通过；HTTP数据及工具协议保持。主代理实际读`author-A/report.json`、`manual-review.md`及最终交接，Ch09置待复核并释放A写锁。仅D的Ch12作者任务未交接，未提前派发复核或计完成。
- D作者后台完成通知已送达并正式交接Ch12：8文件最终hash、5块同源、两版49项契约＋15项Java通过；另运行仓库已有Java8项/Python30项探针，两版4个含探针class原字节一致，没有新增镜像测试。Python完整AST与45处check、SQL/伪代码token/层级保持；主代理实际读`author-D/report.json`、`manual-review.md`及最终交接，D写锁释放，Ch12置待复核。
- 四作者全部交接后主代理实际API确认4会话succeeded/idle、模型/max一致；29目标hash逐一与全部作者报告及实际文件精确绑定。证据`author-handoff-sessions.json`、`review-dispatch-hashes.json`；同4会话轮换只读复核提示已准备，不建立新团队。
- 已派发同四会话执行A→Ch10、B→Ch11、C→Ch12、D→Ch09独立只读复核，继续显式指定`openai/gpt-6.1-sol#max`，不自编自审。主代理在全部作者写锁释放后启动最终验证和浏览器；累计保持9/45直到独立复核与主验收全部通过。
- 作者全部交接后的主代理最终检查：12条编译/既有主测试/同源命令全通过；Ch09 21项、Ch10 52项、Ch11 18项契约＋16项Java、Ch12 49项契约＋15项Java保持，14个class原始字节及各main stdout相同。最终Babel AST、Python完整AST/字面量/注释、18份SQL/伪代码token、四页保护与两个HTTP原样检查通过，29hash与派发一致。独立复核仍在执行，本项不替代独立结论。
- 最终真实Chrome48组合通过，运行时异常0；主代理已逐一通过`functions.read`实际查看54张最终PNG，图片hash核对后逐文件清理。29源hash在作者/独立派发/主验证/浏览器及截图实看后闭环一致，仓库历史结果保持；证据`browser.json`、`screenshot-review.json`。主代理最终全站/四章结构/diff也已重跑通过。
- C、B、D、A的复核完成通知先后送达；主代理逐份实际读`review-*/report.json`、`manual-review.md`、最终交接和独立命令原始输出，全部对最终8/8/6/7hash签发PASS，无返修、无仓库写入。每份主代理接受记录`review-*/main-read-and-accepted.json`绑定报告SHA与精确目标hash。
- B复核的首轮仓库外`semantic.py`把Java的`i--`误识别为SQL行注释，退出1；仅修正临时辅助脚本的Java词法规则后严格复跑通过，原失败记录保留，未改仓库工具/断言。主代理读取命令审计时首次机械要求“所有历史命令全0”也因此中止，核对明确失败原因和成功复跑后接受，不将失败抹去或当成通过。原同源/既有测试/编译/结构检查从未失败。
- 全部复核交接后最终实际API确认四子会话均succeeded/idle，主代理及四子会话模型均为`openai/gpt-6.1-sol#max`；`handoff-sessions.json`已保存状态和精确模型。作者/复核锁全释放，仅主代理进行最后范围与证据封存，封存前仍9/45。
- 最终封存实际通过：四独立报告精确hash、29目标文件、主测试/既有探针/AST-token、48浏览器组合、54张已read/验hash/清理截图及全量范围闭环一致。主代理据此将四章置已完成，累计13/45；全部任务锁清空，下一批第4批Ch13–Ch16，本次停止。

## 验证与最终证据

以下结果均为作者全部交接后重新执行，中间版本及历史证据不冒充本次结果。四章verify均写历史JSON/txt，实际在保留相对目录的批准临时根副本运行，原工具和断言未改，仓库历史输出保持。

| 主代理实际命令 / 检查 | 结果 |
|---|---|
| `node examples/ch09/sync.mjs --check`、`python3 examples/ch10/sync.py --check`、`node examples/ch11/sync.mjs --check`、`node examples/ch12/sync.mjs --check` | 4＋5＋5＋5＝19块全部精确同源 |
| 四章原verify（隔离副本，原参数） | Ch09 21项、Ch10 52项、Ch11 18项契约＋16项Java、Ch12 49项契约全部通过 |
| JDK17.0.10 `javac --release 17 -g:none -encoding UTF-8 -d <仓库外>`；运行`FeedPageTest`、`ChatContracts` | 16项/15项通过；Ch11 11个＋Ch12 3个class两版原始字节相同，stdout相同 |
| 原样既有`docs/reviews/ch12-independent-probe.java`及`.py`（隔离两版） | Java各8项、Python各30项通过；含探针的4个class原字节相同；Python完整结果除独立绑定页面SHA外相同，未新增测试 |
| 基线/最终原始输出比较 | Ch09/Ch11/Ch12结果原字节相同；Ch10全部52项/细节相同，仅分别独立绑定各版页面SHA |
| 两份Python完整AST与原始字符串/数值/注释 | 完全一致，原assert/check内容与顺序保持；Ch10移除23个语句分号，Ch12移除14个并加36个可选尾逗号 |
| 两份JS以既有Babel parser解析 | 仅安全单语句控制体加块（16/12对）；其他AST、原始字面量与注释相同，没有改工具前后缀/断言 |
| 18份SQL/伪代码含注释、字面量token及源码人工阅读 | token完全相同，分号也未改；条件/短路、时间采样、更新、锁/事务/异常边界保持 |
| `node tools/check.mjs` | 45章、276组图、1411帧、206代码块，退出0 |
| `node tools/audit-chapter.mjs ch09 ch10 ch11 ch12` | 各7/6/6/6组图、34/31/32/30帧、5/6/5/5代码块，退出0 |
| `git diff --check` | 退出0，无输出 |

实际argv、cwd、环境、退出码及原始输出：基线目录`main-baseline-validation.json`、`main-final-validation.json`、`main-final-structure.json`、`main-source-semantics.json`、`main-js-semantics.json`、`main-ch12-probes.json`。这些验证不证明真实PostgreSQL并发、复制共识、供应商/网络、故障切换、设备断电耐久或吞吐；不扩展教学模型保证。

### 页面保护与真实浏览器

遮罩仅原有pre/code内部后，四页与本批基线逐字节相同，正文/图/属性/结构/块数保持，两个无源HTTP/JSON示例原样：

| 页面 | 代码外HTML SHA-256（主代理统一占位算法） |
|---|---|
| Ch09 | `2d40c1e6a283436ee8593131797677629bab65ae62ccae50601ec79c38a88a0b` |
| Ch10 | `a9ada35e8d9b5881c4094fc126282adf77c67f675dafd1ca88090c9f906da1b9` |
| Ch11 | `c128f58f25f1f83dfaedf561d603c2cf53e29974322e56500025e12c07605935` |
| Ch12 | `41ed20a4e90cfe9b0c8484c41fc48fa4c36da7e26a184b68d4d4fd5685535bf2` |

真实Chrome/156.0.8078.48＋CDP，使用临时只读HTTP服务：

- 四章×1440×1000 / **真实320×900 viewport**×parchment/dracula×zh/en/both，共**48/48组合**；主题/语言显示、21块浏览器真实代码文本与HTML解码文本完全相同，运行时异常0。
- 桌面全部代码可读，无永久裁断；手机整页宽度严格320，全部code容器clientWidth=252，`white-space:pre`、`overflow-x:auto`，均可实际横滚到最右并显示提示，不造成整页溢出。
- 手机scrollWidth按页面顺序：Ch09 **669/748/777/697/611**；Ch10 **423/676/697/625/762/734**；Ch11 **546/589/697/596/604**；Ch12 **611/604/611/575/618**。
- **54张PNG均由主代理通过functions.read逐一实际查看**：21块桌面浅色＋21块手机深色，各章一个代码块桌面深色/手机浅色的8张，加4章各一张320px右滚整视口图。缩进、阶段空行及控制边界清楚。手机部分长标题/复制按钮沿用既有换行样式，不属源码排版改动；公共CSS未改。
- 全部54张图片hash核对后逐文件清理，未留仓库截图；`browser.json` SHA-256 **`9a3da850f4271352368b32ca924a2141f995a8b78e625caf490a5b5294894b72`**，图片hash/实际查看/清理证据`screenshot-review.json`。临时HTTP/Chrome在finally中结束，最终封存时再核对残留。

## 排版与展示指标

仅展开原独立语句、控制体、合理换行与逻辑阶段空行。Ch10原`if d == NO_CLAIM: ACK(wake); return`成为：

```text
if d == NO_CLAIM:
    ACK(wake);
    return  # durable work / repair scan remains
```

原分号与注释原文、ACK先于return均保留；`current.lease_epoch != … or … or …`仍是原单个if、同一短路顺序。Ch11消费指针仍按`last`→`scanned++`→读取下一候选→去重/正文过滤的顺序，未借排版改算法。Ch12回滚/耐久提交与ACK边界显式展开但位置保持。

| 章节 / 页面块（原顺序） | 行数 前→后 | 最长列 前→后 |
|---|---|---|
| Ch09 schema / HTTP / create / redirect / revoke | 28→30 / 10→10 / 35→45 / 27→44 / 14→21 | 82→87 / 98→98 / 96→102 / 89→91 / 79→79 |
| Ch10 HTTP / model / accept / claim / deliver / retry | 10→10 / 26→30 / 36→48 / 22→34 / 48→68 / 32→47 | 53→53 / 88→88 / 92→91 / 79→81 / 114→100 / 106→96 |
| Ch11 schema / publish / fanout / cache / page core | 23→31 / 29→35 / 20→23 / 20→24 / 33→51 | 70→70 / 72→76 / 83→91 / 75→77 / 77→78 |
| Ch12 route / schema / submit / receive / receipt | 22→27 / 28→42 / 24→36 / 18→24 / 21→27 | 79→79 / 78→78 / 77→79 / 69→74 / 77→80 |

两个无源HTTP/JSON块核验原样保留；Ch09深层单个三元返回102列保留tuple结构，不为参考列宽改表达式。Java/Python的原长注释、SQL/说明字符串内部空白原样。Ch11原`  // BEGIN/END PAGE SNIPPET`两空格区域标记保留以兼容既有sync切片，未改工具。

## 最终章节文件 SHA-256

29个章节维护/直接测试/页面文件均实际有排版变化。以下最终hash已精确绑定全部作者报告、四份独立PASS、主代理最终验证和最终浏览器，未用中间版本替代最终确认。

| 文件 | SHA-256 |
|---|---|
| `chapters/ch09.html` | `b4db1b363304a52a9b4aad76148d60b57281a7ea5143fed03c7bf72bfe2da197` |
| `chapters/ch10.html` | `584f9bd3a05e471f8ec41f167a9f12fd875cf5b68711268f4e049073946b125d` |
| `chapters/ch11.html` | `4b3f6e3a99e6abf240ba660ca47f0b80b404a25329b806c750654a587b4a3b9d` |
| `chapters/ch12.html` | `46d70d5a99f692bb8c0ee244800191a6d9c1e22470b037b2a95d064fe005eeb6` |
| `examples/ch09/schema.sql` | `e1a7c52c1c2992479fb08b390308c87c7f991e3026f248089b5c0ccec64c9e36` |
| `examples/ch09/create.pseudo` | `87b38500841df6c229b3ab206677f862c4c3824498623d43c66dd8ac9f25abf5` |
| `examples/ch09/redirect.pseudo` | `6546ef8684633821cd97ad71aa896ce5c62bcc048eb74d434605f98a7fb58206` |
| `examples/ch09/revoke.sql` | `41fc8ff6144951c5c45ae06439b28aa68a613493219aae4f26551696921456bf` |
| `examples/ch09/verify.mjs` | `095a72fbf2fac59a93f3a257a63f13c4c86bc8f3c4e166e33c570fec540382d1` |
| `examples/ch10/model.pseudo` | `ef5172656b45a35bed3f50c4c6b53ec1dcf0210d7c2f7c917a98dad293a2f76e` |
| `examples/ch10/accept.pseudo` | `2492636bee7e83d0955f6c6993b67ae5b2ecf7d5e9b7f3443acfc9ac09ed70e8` |
| `examples/ch10/claim.sql` | `4ab3f4147752f968a2705e3856cb021aa421f269f17633cac33ef5b919f7a09e` |
| `examples/ch10/deliver.pseudo` | `b9cd2968f1a2bdf0abd92c4bf5c426b137076e977f6ec5c2e4b1a4bc63537731` |
| `examples/ch10/retry.pseudo` | `97a673542f2f63f52a3befd0fa1d1cbc09a546529cd0c5de3b389bb52454e5fa` |
| `examples/ch10/verify.py` | `b3c4e92527decbc961df7d48358ce6350497828aa67313d47c11e1984e20a469` |
| `examples/ch11/schema.sql` | `79c5d2c7623bcdd0976472fd5706aafe9f20b9284c5f8ccb8f90638728289dde` |
| `examples/ch11/publish.pseudo` | `fa8c950f5768f7b0c83491b83c5189b123a32c3484dd8b611471d24d0113df89` |
| `examples/ch11/fanout.pseudo` | `cae9ad78d05b09677889c1283c857082a8d75eeb4a09f8d0aef8fe8d1e19e51e` |
| `examples/ch11/cache.pseudo` | `7381c201fd5d48781d258fdcd7154790fb6b6fed6fa945ddc3cca579a1279d0d` |
| `examples/ch11/FeedPage.java` | `722970759aeb1a8c05272c408ffe105d717a3109a75b04df45078eec1ca84171` |
| `examples/ch11/FeedPageTest.java` | `ebdffc728c5b4f2c76dc33272b6d1974ab62374d63342910f21d73636caad62d` |
| `examples/ch11/verify.mjs` | `4f533fb86aff9c659ff7243753a54b0e05b051429628093b2099c5ac8414d4bc` |
| `examples/ch12/schema.sql` | `4d53e28836434beebb3f54353de2572a5cfef3572a939efa8273dd562a214383` |
| `examples/ch12/submit.pseudo` | `a3637a57a1c4c296d1771c89aa3dbc726583765999eb05b9e0aee4c1346c61d5` |
| `examples/ch12/receive.pseudo` | `c98d01e22d2094e35e987223a623c82b4ef546db5becc64a0f6c99afd263bd1f` |
| `examples/ch12/receipt.pseudo` | `093032ca7dc2975d10c42207a3b1707a8ddb6b19ae488f614a10f564e42ad8e4` |
| `examples/ch12/route.sql` | `5dc7d0a9a6d3040288457b0b98d10762cea6220da4ad59e492bb48e3845e37b8` |
| `examples/ch12/ChatContracts.java` | `0b80e3ff5436fa79a0e53dfa5de8abba6cdac635974b05c20957158fdc6b2289` |
| `examples/ch12/verify.py` | `fba487ca0587510afe26364e715d6aca08c5becf0e2b60bae1b33a3ee3cac3f0` |

## 独立复核与最终范围

| 复核者 → 章节 | 对应最终文件的独立结论 | 证据（本批基线目录下） |
|---|---|---|
| A → Ch10 | PASS，7hash；两版52项、Python完整AST/48处check/3条assert、SQL/伪代码控制树、5块同源及页面保护 | `review-A/report.json`、`manual-review.md`、`commands.json`，10条命令全部退出0 |
| B → Ch11 | PASS，8hash；两版18契约＋16 Java、11class原字节、JS AST/45条assert、伪代码控制祖先与5块同源/页面保护 | `review-B/report.json`、`manual-review.md`、`commands.json`，20条日志含1次已修正临时lexer失败，其余及最终检查退出0 |
| C → Ch12 | PASS，8hash；两版49契约＋15 Java及既有Java8/Python30探针，3/4class原字节、Python完整AST/45处check、5块同源/页面保护 | `review-C/report.json`、`manual-review.md`、`commands.json`，23条命令全部退出0 |
| D → Ch09 | PASS，6hash；两版21项、JS仅16安全控制体块/56原断言、SQL/伪代码控制树、4块同源及HTTP/代码外保护 | `review-D/report.json`、`manual-review.md`、`commands.json`，14条命令全部退出0 |

主代理实际阅读四份报告、人工diff结论和关键命令原始输出；不以作者自测、主代理检查或旧证据替代真实独立复核。没有仓库返修、模型阻塞或新发现需另列的实质技术问题；保留教学模型原有局限。

最终范围：相对本批2,547个已有文件的实际工作区基线，仅**29个章节文件及PLAN**改变，新增本记录；其余**2,517个已有文件逐字节保持**。包括AGENTS、Ch01–Ch08/Ch39已有成果、其他章节、公共CSS/JS、全部图源、README、原同步工具、既有独立探针及所有历史JSON/txt。HEAD保持`fd61a122399c786edc8b169e8f62d5c8ec829de4`，未暂存/提交/推送/部署；未留仓库截图、class、pyc、__pycache__或新镜像测试，无本批Chrome/HTTP服务残留。

证据封存：基线目录`final-seal.json`保存四独立报告SHA、29目标hash与全部闭环断言；`final-hashes.json`为29个修改文件最终hash；`handoff-sessions.json`保存四会话succeeded/idle及主代理/子会话精确模型；`scope-final.json`保存2,517个受保护文件路径/hash及四页代码外HTML保护。四份`review-*/main-read-and-accepted.json`保存主代理实际阅读、命令审计和对应精确版本接受记录。

## 恢复位置

本批全部验收、四子任务交接闲置且锁已清，**13/45**。下一批 **第4批Ch13–Ch16**，本次未启动；由用户或外部控制器清空上下文后再发PLAN §7提示词。恢复先读PLAN §0与实际工作区及本记录；临时基线失效时按最终hash/Git/工作区重建证据，不能还原用户改动。

本次未提交、推送或部署；报告后停止，不在本上下文开启下一批。
