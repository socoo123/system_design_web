# 第4批 Ch13–Ch16 示例代码排版

日期：2026-10-29。状态：**Ch13–Ch16已验收，四作者、轮换独立复核及主代理全部交接，活动锁清空**。累计 **17/45**，下一批Ch17–Ch20。本次仅此一批，未提交、推送或部署。

## 基线与授权

- 实际主代理 `ses_e77dd669dffe16mxIzJDFqhq2Y`，本机会话API确认 `openai/gpt-6.1-sol#max`。外层只读路由，不实施、不复核、不写共享记录。
- 已亲自读取AGENTS/PLAN全篇、Ch39源码及直接测试、页面pick/admit/drain三块、样板与第3批记录；仓库只有根AGENTS入口。模型列表实际确认Sol active且有max，前批四会话succeeded且不在active列表中。
- 基线：`/private/var/folders/5k/y6qh6sfd2g30js0v0qrv4mfr0000gn/T/opencode/code-format-batch-04-u9yo2imh`。HEAD `fd61a122399c786edc8b169e8f62d5c8ec829de4`，main ahead 1；`baseline.json`保存2,548个已有文件hash、原状态、四页代码外HTML hash，`files/`备份44个本批文件与原共享记录。Ch13–Ch16执行前无改动；前批及用户未提交工作全部保护。
- 已实际读取四章README与同步脚本，确认18块均有源；Ch13 Java沿原两空格BEGIN/END PAGE标记精确切片，其余文件整段同步。保留sync/README/历史结果，测试写输出仅在隔离临时副本执行。
- 当前无专用子代理工具；已加载OpenCode技能、读取官方V2 API/CLI文档及本机API schema、CLI帮助，已通过官方session API建立4个linked general child并显式指定模型/max，复用同四会话轮换只读复核。

## 分工与任务锁

| 作者 | 独占范围 | 会话（均`openai/gpt-6.1-sol#max`） | 轮换只读复核 | 状态 |
|---|---|---|---|---|
| A | Ch13两个Java、ingest/page.pseudo、verify.py及页面code | `ses_e77dbb4b9ffeGBPO4ljs6RUQLj` | A审Ch14，D审Ch13 | 作者及审Ch14独立PASS均交接，succeeded/idle，无活动锁 |
| B | Ch14五个pseudo、verify.py及页面code | `ses_e77dbb4b9ffc8zWgYH9fZE3YR6` | B审Ch15，A审Ch14 | 作者及审Ch15独立PASS均交接，succeeded/idle，无活动锁 |
| C | Ch15 schema.sql、四个pseudo、check.py/check-tenants.py及页面code | `ses_e77dbb4baffe4UqF0RfZcEthMV` | C审Ch16，B审Ch15 | 作者及审Ch16独立PASS均交接，succeeded/idle，无活动锁 |
| D | Ch16两个SQL、三个Lua、两个pseudo、verify.py及页面code | `ses_e77dbb4b9ffdgr0s1aIanQSISB` | D审Ch13，C审Ch16 | 作者及审Ch13独立PASS均交接，succeeded/idle，无活动锁 |

主代理是PLAN及本记录唯一写入者。四作者只改各自声明源码、直接测试和页面既有code内容，不能写共享工具/记录/其他章节。作者交接后A审B、B审C、C审D、D审A；返修交原作者，复核者只读并确认最终hash。

## 交接流水

- 已建立并逐一核对4个linked general会话的parentID与精确模型/max；以显式`--model openai/gpt-6.1-sol#max`派发作者。派发后一次性API审计确认4位作者均running且模型/max精确一致，实际支持四并发，证据`dispatch-evidence.json`；无最终验收结论。
- Ch16 README默认Redis旧路径现已不存在；实际找到并复用第1批保留的既有Redis7.2.5二进制，显式设置`REDIS_SERVER`，不安装或修改依赖/工具。已将路径告知D作者；原port0独立socket隔离及清理契约保留。
- 主代理从保存的修改前文件完成隔离基线11条命令：18块同源，Ch13 37项契约＋Java112项、Ch14 77项、Ch15 65项＋租户27项、Ch16 67项均通过。JDK17以`--release 17 -g:none -encoding UTF-8`编译，保存5个class原字节及stdout；所有历史JSON仅写临时副本。证据`main-baseline-validation.json`/`main-baseline-commands.json`。
- 主代理阶段范围检查确认2,517个范围外已有文件及四页代码外HTML保持；作者尚持写锁，不计最终验收。临时完整token辅助快照在Ch14原`COMMIT; return`拆行时发现分号被删而退出1，已只向原B/C/D作者发出精确保留原分号的排版指示（前一语句行末保留即可），未修改或放宽任何工具/断言；等待作者最终交接后重新验证。原失败保留`main-semantics-interim-command.json`。
- 主代理还从原样受保护的既有Ch13/14/15独立探针运行修改前隔离基线，分别142/41/40项通过；原Ch13 Java oracle遍历28,561个corpus、228,493项通过，保存5个含oracle class字节。未新增镜像测试。证据`main-baseline-probes.json`/`main-baseline-probe-commands.json`；最终版本待相同命令重跑。
- B完成通知及正式交接已收到；主代理实际读作者报告、人工语义结论和最终交接，7个最终hash与实际文件一致。两版77项、5块同源、完整Python AST/原始字面量/注释、五份伪代码1,428token及150条逻辑操作父链保持。Ch14置待复核，B写锁释放，仍不计入完成。B曾修正仅临时浏览器探针的桌面滚动条宽度比较，失败与重跑如实保留，仓库工具未变；主代理最终浏览器另行重跑。
- C完成通知及正式交接已收到：8个最终hash与实际文件一致，两版65＋27项及既有40项探针、5块同源、完整Python AST/原始字面量/注释、SQL/伪代码token与102条控制轮廓保持；主代理实际读人工语义结论和最终交接。Ch15置待复核，C写锁释放。
- A完成通知及正式交接已收到：6个最终hash与实际文件一致，两版37项＋Java112项、5class原字节、3块同源、完整Python AST/原始字面量/注释及两份伪代码token/66条层级记录保持；原两空格Java区域标记保留。主代理实际读人工语义结论和最终交接，Ch13置待复核并释放A写锁；只有D的Ch16作者任务未交接，累计仍13/45。
- D完成通知及正式交接已收到：9个最终hash与实际文件一致，两版67项、5块同源、完整Python AST/原始字面量/注释、SQL/Lua/伪代码1,501token及55条伪代码层级保持。作者私有深路径碰到macOS socket长度上限，失败/启动stdin目录失败均保留，最终用fd指向同一批准目录执行原入口成功，不改源码/测试/断言；主代理原argv在短批准TMPDIR已通过，无需该适配。Ch16置待复核，D写锁释放。
- 全部作者交接后实际API确认四会话succeeded/idle、精确模型/max保持；30个目标hash与全部作者报告和实际文件逐一绑定。证据`author-handoffs.json`、`author-handoff-sessions.json`、`review-dispatch-hashes.json`。同四会话以显式模型/max轮换只读复核A→Ch14、B→Ch15、C→Ch16、D→Ch13，不另建团队；主代理开始最终验证及48组合浏览器，仍保持13/45。
- 轮换派发后一次性API核对四会话全部running、仍为精确Sol/max（`review-dispatch-sessions.json`）。主代理在全部作者写锁释放后最终11条编译/既有主测试/同源、5条既有额外探针、五份Python完整AST/原始字面量/注释、19份SQL/Lua/伪代码完整token及Java非块token均通过；两版主测试5class、含oracle5class逐字节相同。30hash与全部作者/复核派发完全一致。
- 最终真实Chrome48组合通过，运行异常0；主代理已经以`functions.read`逐一实际看完48张最终PNG，核对图片hash后逐个删除。手机整页320px、代码容器252px，横滚均可达右端，缩进/逻辑阶段/事务与控制边界可读。源码hash在浏览器与实看清理后均未变；主代理最终全站/四章结构/diff与2,517个保护文件检查通过。独立复核仍在执行，不据此提前计完成。
- C、B、A、D的独立复核完成通知及正式交接均已收到；主代理逐份实际读取人工完整diff结论、报告、命令清单及关键原始测试stdout，并逐项验证9/8/7/6最终hash、日志文件hash和实际文件。四份均PASS、无返修/阻断，无仓库写入；15/25/10/19条独立命令各全部退出0。接受证据`review-*/main-read-and-accepted.json`绑定报告SHA、命令审计及精确最终版本。
- 全部复核交接后实际API确认四子会话succeeded/idle、主代理和四子会话仍精确Sol/max，且linked children恰为原四会话，没有第二套团队；`handoff-sessions.json`保存状态。所有作者/复核任务锁已清，仅主代理最后封存共享记录，封存前仍13/45。
- 最后范围检查与六条全站/四章/diff命令重跑通过，无本批Chrome/隔离Redis进程、仓库构建产物或未清截图。主代理临时PNG广扫曾把Chrome profile内置Web Application图标误当截图而中止；检查剩余路径后确认294个都是三个独占profile的默认图标，不是截图，逐个hash列入`runtime-cleanup-final.json`。48张截图manifest路径仍逐一确认已删除，未放宽仓库测试或删除无关图标。
- 最终封存`final-seal.py`实际通过：四份独立报告/接受记录、30hash、主测试/既有额外探针/AST-token/class、48浏览器组合、48张实看验hash清理截图、2,517保护文件、API四任务闲置及运行清理证据全部闭环。主代理据此将Ch13–Ch16置已完成，累计17/45，全部锁清空，下一批第5批Ch17–Ch20；本次停止。

## 主代理最终验证

以下命令均在四作者正式交接后重跑，未沿用中间文件结果。所有会写历史JSON的入口只在保留相对目录的批准临时副本运行；仓库历史结果、同步工具及断言原样保护。

| 实际命令 / 检查 | 结果 |
|---|---|
| `python3 examples/ch13/sync.py --check`、Ch14/Ch16同名入口；`node examples/ch15/sync.mjs --check` | 3＋5＋5＋5＝18块全部精确同源 |
| 四章原verify/check；Ch15另含`check-tenants.py` | Ch13 37、Ch14 77、Ch15 65＋27、Ch16 67项均通过；基线同样通过 |
| JDK17.0.10 `javac --release 17 -g:none -encoding UTF-8 -d <仓库外>`；`java … SearchMergeTest` | 两版112项通过，5个class原始字节和stdout相同 |
| 原样`docs/reviews/ch13-independent-probe.py`、Ch14/Ch15同名探针 | 两版142/41/40项通过，全部检查与非版本身份结果相同；各版页面/源码hash分别精确绑定，SQL提取仅布局差异 |
| 原样`docs/reviews/ch13-independent-MergeOracle.java` | 两版28,561个corpus、228,493项通过，含oracle的5个class原始字节和stdout相同；没有新增镜像测试 |
| 主测试结果比较 | Ch13/14/15主结果、Ch16结果原始字节相同；Ch15租户27项及细节相同，仅各版分别绑定源码hash、提取SQL原始空白不同 |
| 五份Python完整AST、原始STRING/NUMBER/COMMENT | 全部相同，docstring/SQL/RESP/HLS等字面量内部空白保持，原断言/条件/事务/异常结构未改 |
| 19份SQL/Lua/伪代码完整非布局token；两份Java非块token | 原注释、字面量、分号、标识和顺序完全一致；Java只加7＋1对安全控制体括号，原条件结构及短路不拆合 |
| `node tools/check.mjs` | 45章、276组图、1,411帧、206代码块，退出0 |
| `node tools/audit-chapter.mjs ch13`（Ch14/15/16各自运行） | 四章各6组图/30帧，3/5/5/5代码块；全部退出0 |
| `git diff --check` | 退出0，无输出 |

原argv/cwd/环境/退出与stdout/stderr在基线目录`main-final-validation.json`、`main-final-commands.json`、`main-final-probes.json`、`main-final-probe-commands.json`、`main-final-structure.json`；语义、结果比较、主代理人工核对分别为`main-semantics.json`、`main-probe-comparison.json`、`main-manual-review.json`。现有教学模型不能据此证明真实Elasticsearch/PostgreSQL复制/行锁、S3/CDN/编解码、故障切主、设备耐久或生产负载。

### 页面保护与真实浏览器

仅遮罩原有18个pre/code内容，四页代码外HTML与本批基线逐字节一致，原标签/属性/区域标记/块数、正文、图注、闪卡和图源全部保护：

| 页面 | 代码外HTML SHA-256（主代理统一占位算法） |
|---|---|
| Ch13 | `e3212643fafb5662d740e028ba362e49e549ad30bbfe61a2542ee3aa50f864e0` |
| Ch14 | `a527c83874d33977e1f9c7bd5485a7f929d410d577971d51a1bbeb14bd1b99fd` |
| Ch15 | `18e81c79d7884bb60a0f8c29539226c6eb73c29292d862fd21bd3cd5e59ac7cf` |
| Ch16 | `ac203170df9df24d6a291e31bfa7f80f6a6512ef1406a4f57550002db85ad377` |

真实Chrome/156.0.8078.48＋CDP，临时只读HTTP服务：

- 四章×1440×1000 / **真实320×900 viewport**×parchment/dracula×zh/en/both，共**48/48组合**；语言显隐、主题和18块浏览器实际文本与HTML解码文本逐字一致，运行异常0。
- 桌面18块均完整可读，无永久截断；手机整页严格320px，所有pre容器252px，`white-space:pre`、`overflow-x:auto`，逐块实际滚到最右并显示提示，不产生整页溢出。
- 手机scrollWidth依页面顺序：Ch13 **705/661/661**；Ch14 **618/596/596/676/712**；Ch15 **640/676/726/683/683**；Ch16 **719/582/575/654/676**。
- **48张PNG均由主代理以functions.read逐一实际查看**：18块桌面浅色＋18块手机深色、每章一个代码块桌面深色/手机浅色共8张、四章各一张320px右滚整视口图。缩进、分段、控制/事务/提交和返回边界清晰。长标签令中文复制按钮换行是原公共UI，不改标签或CSS。
- 全部48张图片hash核对后逐文件清理，未留仓库截图。`browser.json` SHA-256 **`62d6d455140b7ffdb0ef3d11f6ddf2fea8443ddc44ed6f6063b85238b64ae4c4`**；图片hash/实看/清理证据`screenshot-review.json`。HTTP/Chrome在finally结束，最终收口再核对无残留。

## 排版指标与保留项

| 章节 / 页面块（原顺序） | 行数 前→后 | 最长列 前→后 |
|---|---|---|
| Ch13 Java merge / ingest / PIT page | 37→65 / 32→39 / 36→45 | 89→92 / 82→86 / 83→86 |
| Ch14 complete / claim / build / publish / grant | 31→36 / 25→32 / 29→33 / 34→42 / 35→40 | 77→80 / 74→77 / 75→77 / 84→88 / 87→93 |
| Ch15 schema / pin / complete / changes / GC | 26→40 / 31→38 / 39→46 / 19→22 / 29→34 | 83→83 / 84→88 / 93→95 / 85→89 / 85→89 |
| Ch16 page SQL / like / flush / moderate / cache | 35→40 / 28→46 / 19→26 / 29→42 / 28→37 | 92→94 / 86→75 / 74→74 / 81→85 / 84→88 |

Ch14原`COMMIT; return NO_CLAIM`变为两行，原分号留在COMMIT行末；Ch15原Change/Outbox合行拆开但仍在同一事务、同一顺序；Ch16单行Lua if/then/return/end展开，不改原单次HSET。Java成员与Python按4空格，已有清楚的函数/事务体核验后保留；原长字符串、注释及Ch13两空格PAGE标记保留，不为约100列参考改内容或工具。

## 最终章节文件 SHA-256

30个章节维护/直接测试/页面文件均有排版变化。以下hash已绑定全部作者交接、四份独立PASS、主代理最终验证、浏览器及截图实看后版本；没有用中间版本代替最终确认。

| 文件 | SHA-256 |
|---|---|
| `chapters/ch13.html` | `0a17c26a0dac652ed633db15f0f02a1fd72acbd09d288e0c559965962cb3f29f` |
| `chapters/ch14.html` | `882d6f16356710d3ce10a86a28894eac0b496230c382408c986889f2985d4179` |
| `chapters/ch15.html` | `02fc0a22f67ebc7712269456822577fdd680d5dcfe56fe550476a68a01bca5eb` |
| `chapters/ch16.html` | `0b8cba3eaa74446bc1e646e3803979f5950a9020fbe23914f7904e26c944dc4b` |
| `examples/ch13/SearchMerge.java` | `2d856574e967d757890cbdf740849fecb445d88d8cf2b2d1d5549d9207b477bf` |
| `examples/ch13/SearchMergeTest.java` | `bcf0a4c72e6e92d7f3d16ba507150376ed3aacf2ed285f099b1b9830acfdf775` |
| `examples/ch13/ingest.pseudo` | `d995ee671af9eba976197f4e060314253228a7dd0143cec6cea6551b71ae469b` |
| `examples/ch13/page.pseudo` | `95c13791783fb55b77d6718bb340e8a535f19d38f9e10155ec2e0fb749bec187` |
| `examples/ch13/verify.py` | `0a838cc01d0cfacebe4c8b0a6effff608f6b772adee74faacdbe685f9e3dc3f5` |
| `examples/ch14/complete.pseudo` | `099e38cafb8ccf69a4a0686b0f1133659229c493e24a388bc8de999be2a172d0` |
| `examples/ch14/claim.pseudo` | `1909ff01505e4d241aee7af53769dd70aa24bc19a40c25ddeb8584bd1f9a2bd9` |
| `examples/ch14/build.pseudo` | `8006a5128a1be539e907d61996c3776f7949073808577eaf847d53b467bcb667` |
| `examples/ch14/publish.pseudo` | `0e4e7bbd85f2c6117d30561f78c10eb6caf1f81fc0cdecd28e7a878e0e149d6c` |
| `examples/ch14/grant.pseudo` | `aa9214cb1c47eee2cfb45f1520a894aa4bbda8efaf35ab7b100c93ed8d7ee49f` |
| `examples/ch14/verify.py` | `a8fbfedb1c24e486b5219088074f375dc09a372d121eceb5d6465c90038ad20f` |
| `examples/ch15/schema.sql` | `4fbb53f7ac78f8fe647380e437024d1f93812afb9a529c69a4ae11dd57fc7f47` |
| `examples/ch15/pin.pseudo` | `4ff4c77b75c61169df5ba1306016b57cd0f5740def352793ade0436072b3bdff` |
| `examples/ch15/complete.pseudo` | `de1772eaa9bd16efb36404aa1aef350b1fec235776bfd6686225df6b947b64a5` |
| `examples/ch15/changes.pseudo` | `b2dc2677d1a4ece21297aa97e511e7ee87ccfbd65f38b392e007f8d168fbba81` |
| `examples/ch15/gc.pseudo` | `28cc0a6b8d1a7a81997b56e4184341418db2efc314f52813e65090a5be9223c7` |
| `examples/ch15/check.py` | `084e27449da22ce98ac05cefcf9ef851e2cf06cd6ce5eebb0db697238e20e93e` |
| `examples/ch15/check-tenants.py` | `899ef6265efec92de84ad85464aa9f269fa786b596bfc36531874df3ebbba90d` |
| `examples/ch16/page.sql` | `06366912bf0d52c981b0620fd6a76a80b9281f32937b6cafce3916b341257d1d` |
| `examples/ch16/like.lua` | `acf92f9e4b282a430eebe7af5dd398758d4be8a481c734ed649374494d53af73` |
| `examples/ch16/flush.sql` | `82bab1c5395f8cd79c69f74235adf338d1e05fb722bb863bbc057f027f1ecc11` |
| `examples/ch16/moderate.pseudo` | `a04b4ea5c06348ae4288aa3673d19fa4480adaf8254a94d73cf4f935c3d7e744` |
| `examples/ch16/cache.pseudo` | `e0a9e8cbf35457756b74190e796b992f8b362e366e7a67bb791931c618a56aa4` |
| `examples/ch16/rotate.lua` | `32b51741f7d16554ee9796a337b43abae87afb6d5886a5f8d36941b7d53cb41b` |
| `examples/ch16/ack.lua` | `5d2c7ebc25a8798a044316271af6064b8658c6df0406f4f34217b88c5312dcdd` |
| `examples/ch16/verify.py` | `f7879d313665c48005ab35f0d872cdcc0f181b61b797cc1d8d57cf141674e936` |

### 工具限制与已有问题

- 没有发现需借本轮静默修复的实质技术问题；没有改公共CSS/JS、同步脚本、README或历史结果。
- Ch16当前README入口67项（含真实Redis7.2.5 Lua和SQLite并发）已以原argv在短批准TMPDIR通过。另有历史`docs/reviews/ch16-independent-probes.py`冻结旧HTML SHA；**本批修改前页面已不匹配该历史SHA**，并硬编码旧Redis路径/旧行切片。本批未运行/重绑定它，不能冒称其通过；保留原文件。独立工具迁移若日后获授权，应显式版本绑定、按AST/SQL形状提取并配置Redis路径，保持全部原断言；本批不扩大工具改造。证据`archived-probe-applicability.json`。

## 独立复核与最终范围

| 复核者 → 章节 | 对应精确最终文件的独立结论 | 证据（本批基线目录下） |
|---|---|---|
| A → Ch14 | PASS，7hash；两版77项、Python完整AST/原始token、五份伪代码及142条操作控制祖先、5块同源/页面保护 | `review-A/report.json`、`manual-review.md`、`commands.json`；15条命令全部退出0 |
| B → Ch15 | PASS，8hash；两版65＋27＋40项、两份Python完整AST/900原始字面量注释、1,184完整token/112控制记录、5块同源/页面保护 | `review-B/report.json`、`manual-review.md`、`commands.json`；25条命令全部退出0 |
| C → Ch16 | PASS，9hash；原argv两版67项、Python完整AST/字面量注释、1,501完整token及控制祖先、5块同源/页面保护 | `review-C/report.json`、`manual-review.md`、`commands.json`；10条命令全部退出0 |
| D → Ch13 | PASS，6hash；两版37＋Java112项、5class原字节、Python完整AST/token、66条伪代码控制祖先、3块同源/页面保护 | `review-D/report.json`、`manual-review.md`、`commands.json`；19条命令全部退出0 |

独立lexer把多字符操作符或时长分词的方式不同，token计数不互作门槛；每份均完整消费原文、前后同序、保留完整字面量/注释。HTML遮罩占位符不同也不混用hash；四页直接字节等同性已分别确认。主代理实际读完独立结论并核实对应精确hash，没有以作者自查、主代理检查或旧探针冒充本轮独立复核。

最终范围：相对本批2,548个已有文件的实际工作区基线，仅**30个章节文件及PLAN**改变，新增本记录；其余**2,517个已有文件逐字节保持**。包括AGENTS、Ch01–Ch12/Ch39既有成果、其他章节、公共CSS/JS、全部图源、README、原同步工具、既有独立探针及所有历史JSON/txt。HEAD保持`fd61a122399c786edc8b169e8f62d5c8ec829de4`，未暂存/提交/推送/部署。未留仓库截图、class、pyc、__pycache__或新镜像测试，无本批Chrome/隔离Redis/HTTP服务残留；外部临时profile默认图标不属于截图，未冒称全部PNG已删。

证据封存：基线目录`final-seal.json`保存四独立报告SHA、30目标hash及全部闭环断言；`final-hashes.json`为30个最终文件hash；`handoff-sessions.json`保存主代理与原四子会话精确模型/max、四子会话succeeded/idle及恰为原四linked child；`scope-final.json`保存2,517保护文件/hash和四页代码外保护。四份`review-*/main-read-and-accepted.json`保存主代理实际阅读、命令/原输出hash审计及精确版本接受记录。

## 恢复位置

本批全部验收、四子任务交接闲置且所有锁已清，**17/45**。下一批 **第5批Ch17–Ch20**，本次未启动；由用户或外部控制器清空上下文后再发PLAN §7提示词。恢复先读PLAN §0、实际工作区及本记录；临时基线失效时按最终hash/Git/工作区重建证据，不能还原用户改动。

本次未提交、推送或部署；报告后停止，不在本上下文开启下一批。
