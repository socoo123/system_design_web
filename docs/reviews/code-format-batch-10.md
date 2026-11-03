# 第10批 Ch37/38/40/41 示例代码排版

日期：2026-11-03。状态：**Ch37/38/40/41已验收并封存，四独立PASS已接收；累计41/45，全部任务锁已释放**。仅本批，不提交、推送或部署。

## 基线与范围

- 实际主代理`ses_e6143b40fffeK6VlVf4PbkKYrk`经本机API确认`openai/gpt-6.1-sol#max`；外层Astra仅路由，不实施/复核/写共享记录。
- 已实际读AGENTS、完整PLAN、Ch39源码/测试/页面三段、样板及第9批验收记录；第9批四会话均succeeded/idle，无遗留任务。已加载OpenCode skill、官方V2 API及本机schema，模型列表确认Sol支持max。
- 基线`/private/var/folders/5k/y6qh6sfd2g30js0v0qrv4mfr0000gn/T/opencode/code-format-batch-10-nuL9mTi8`；HEAD`fd61a122399c786edc8b169e8f62d5c8ec829de4`，main ahead 1。保存2,554个Git可见文件hash、原状态及四页代码外HTML；备份319个本批/历史证据/共享文件；完整文件系统另封存12,637个受保护文件/符号链接。此前未提交改动全部保留，本批四章原无改动。
- 精确允许28文件：Ch37/38/40/41分别8/7/4/9（含页面），页面共3＋4＋3＋4＝14块。Ch38/40用原sync；Ch37/41按原check_sources.py/verify.py精确映射。README、同步器、Ch37原check_sources.py、Ch40原run.py、历史证据、公共工具及代码外HTML保持。共享记录仅主代理写。

## 分工与任务锁

| 角色 | 作者章节 | 会话（均Sol＋max，parent为实际主代理） | 轮换只读复核 | 状态 |
|---|---|---|---|---|
| A | Ch37 | `ses_e6141c2cfffeTAHggOYKQ3Cphu` | A审Ch38，D审Ch37 | 作者及审Ch38独立PASS均已接收，succeeded/idle，无活动任务 |
| B | Ch38 | `ses_e6141c2cbffeJswCaKIYl1xJ0n` | B审Ch40，A审Ch38 | 作者及审Ch40独立PASS均已接收，succeeded/idle，无活动任务 |
| C | Ch40 | `ses_e6141c2cdffe7pnts4QvDnkYes` | C审Ch41，B审Ch40 | 作者及审Ch41独立PASS均已接收，succeeded/idle，无活动任务 |
| D | Ch41 | `ses_e6141c2c9ffe93KKaJxtDedBnN` | D审Ch37，C审Ch41 | 作者及审Ch37独立PASS均已接收，succeeded/idle，无活动任务 |

## 执行与恢复

- 四子会话均为实际主代理的linked child，精确模型、max、目录与parent已核验。作者任务仅本章精确范围；完成后复用这四会话轮换只读复核，不自编自审。
- 当前共享记录维护锁属于主代理；`author-dispatch-sessions.json`确认四原linked child均实际running，未假定三并发上限；暂无活动复核。验收前不标章完成、不增加计数。
- 主代理基线隔离副本15命令全部退出0：Ch37原3块同源、SQLite57项及Java16项；Ch38原4块同源、SQLite84项（含26数值/30,000实际claim）与Java16/41项；Ch40原run（40项Java及13项源码/SQLite/数值检查）；Ch41原verify（7组含实际进程/事务/Java）。Java17 `-g:none`共19class已封存；完整argv/cwd/env/退出及stdout/stderr见`main-baseline-commands.json`。所有写结果仅落隔离副本。
- C/Ch40完整report/manual/handoff已实读并接收：4hash、28命令全0/56原始流hash绑定；两版原40项Java/13项Python、既有31个Java claims/4段SQLite/10算式通过。完整Python AST/1,130非布局token及原字符串注释、Java原token与8class原字节、3块同源和页外HTML保持；无旧问题或本轮返修。C为原Sol/max、parent、succeeded/idle，作者写锁释放，待B独立复核，不计章节完成。
- D/Ch41 report（重复环境去重、路径可逆缩写后完整实读）、manual/handoff已接收：9hash、18命令/36原始流绑定，17退出0；首次仓库外语义辅助器误把StringIO.readline回调写成调用结果而TypeError，原失败脚本/日志保留，仅修回调，未改断言/源码求通过。原verify 7组、既有24项Python/10项Java通过，完整Python AST/原token（verify新增一对分组括号）、伪代码/SQL token与父链、5class原字节、4块同源及页外HTML保持。无旧实质问题或返修；原Sol/max、parent、succeeded/idle，写锁释放，待C独立复核。
- B/Ch38完整report（同样去重环境/可逆路径）、manual/handoff已实读并接收：7hash、28命令全0/56原始流绑定；原84项Python/Java16＋41，既有缓存51/29、Java27/26及负缓存实测探针通过。完整两份AST/3,425非布局token、两伪代码token与父链、3class原字节、4块同源及页外HTML保持，无本轮返修或旧实质问题；历史hash固定包装器未运行、不计PASS，实际探针原样运行。原Sol/max、parent、succeeded/idle，写锁释放，待A独立复核。
- A/Ch37完整report（同样去重环境/可逆路径）、manual/handoff已实读并接收：8hash、26命令/52原始流绑定，25退出0；一次临时封装路径误输在启动前退出2，实际双流已实读并保留，只有该失败的完整继承env未捕获，不能冒称完整。原57项SQLite/16项Java及既有71/48数据库、16/10 Java探针通过；完整两份AST/3,731非布局token、伪代码/SQL原token及父链、3class原字节、3块同源/页外HTML保持。publication.sql已清楚，原样保留；原Sol/max、parent、succeeded/idle，写锁释放，待D独立复核。
- 四作者共100条记录（98退出0，两次仓库外辅助失败如上）、200原始流已接收；未将作者自查计作独立PASS。28文件冻结于`final-hashes.json`，四原会话即将复用轮换只读复核。
- 四原会话已按A→Ch38/B→Ch40/C→Ch41/D→Ch37派发；`review-dispatch-sessions.json`确认全部原Sol/max、parent且实际running。主代理最终隔离副本15命令全部退出0，实际工作区全站check/四audit/两sync/diff共8命令也全0；真实Chrome验收已启动。未取得独立最终hash PASS前不增加计数。
- 主代理最终语义核验通过：7份完整Python AST（含docstrings/type_comments）、全部原字面量/数值/注释/分号与非括号token，8份Java原非语句块括号token、5份伪代码及4份SQL全部字符串/注释感知token保持。19class原始字节及5个Java入口stdout相同。主代理已实际读17份完整核心基线源码、16份有变化核心diff和14段基线页面代码；所有测试/HTML完整diff的独立人工复核仍由轮换会话负责，见`main-manual-review.json`。
- 主代理仓库外辅助器首次把Ch40 verify中的Python正则字符串`// BEGIN`误认为整行区域标记，导致临时marker断言失败；完整AST与字面量检查已先通过。保存`main-semantics.failed-v1.py`及实测错误转录`main-semantics-first-error.txt`，仅把识别范围改为行首注释标记，保留原字节标记比较及全部AST/token/class断言；复跑退出0，原工具/源码未改。首次是直接shell调用，没有独立捕获完整继承env/原始流，限制如实记录；最终命令/双流hash见`main-semantics-command.json`。
- `scope-frozen.json`确认2,525个Git可见保护文件、12,637个完整文件系统文件/符号链接、四页代码外原字节、HEAD及28冻结hash保持。最终真实Chrome156.0.8078.76的48组合通过、运行异常0；40张截图已逐一`functions.read`实看并按manifest验hash精确清理，PNG残留0、HTTP/Chrome均退出，28hash仍相同。`browser.json` SHA-256=`4dffa8b9fe3aeb0aa7e0f9b6cd58a6d6ee5bfb5a8bb72a3ea6d89f8cddb477de`，实看/清理见`screenshot-review.json`、`runtime-cleanup.json`。

## 主代理最终验证

基线/最终仓库外副本各15命令全部退出0；真实argv/cwd/env/退出与原始stdout/stderr及hash在`main-{baseline,final}-commands.json`，测试结果绑定源码hash在`main-{baseline,final}-validation.json`。写入式原入口未覆盖仓库历史记录。

| 原入口 | 最终实际结果 |
|---|---|
| `python3 examples/ch37/check_sources.py` | 3/3精确同源，原stock SQL精确文本断言保持 |
| `python3 examples/ch37/run_contracts.py --output docs/reviews/ch37-contract-results.json` | 原57项，真实连接/写锁/进程退出/对象身份合同通过 |
| `node examples/ch38/sync.mjs --check`、`python3 examples/ch38/run.py --out docs/reviews/ch38-format-contract-results.json` | 4/4同源；84项（26计算、30,000实际claim）通过 |
| `python3 examples/ch40/run.py` | 原4个子命令，Java40项及Python13项通过；changedFrames比较的是更早历史页，不是本批改图 |
| `python3 examples/ch41/verify.py` | 4/4同源、原7组实际事务/进程/本地fence/Java/数值检查通过 |
| Java17.0.10 `javac --release 17 -g:none -encoding UTF-8 -d <仓库外本章classes> <本章两份Java>`；运行`ExactSumTest`、`AgeBudget`、`SingleFlight`、`ProtocolContractsTest`、`ReadGateProbe` | 16/16/41/40项与ReadGate原探针通过；两版19class原始字节及5入口stdout相同 |

- 真实工作区`node tools/check.mjs`、四章`node tools/audit-chapter.mjs chNN`、Ch38/40原sync及`git diff --check`共8命令通过，见`main-final-structure.json`。全站仍45章/276组图/1,411帧/206代码块。
- 真实1440×1000与320×900，parchment/dracula、zh/en/both共48组合：代码DOM与原摘录完全相等，语言切换正确，整页不横溢；窄屏容器可横滚到右端、提示可见。40张实看覆盖14段桌面浅色＋14段手机深色、8张反主题代表及4张手机右端整视口；缩进、分段、异常/事务边界清楚。已清理，不留仓库截图或编译产物。

## 排版对照

Ch37保留2空格伪代码与原SQL精确相邻字符串，展开事务早退与累加块；Ch38展开SingleFlight完成/清理、Cache阶段及HTTP headers；Ch40展开writer拒绝/异常/清空边界；Ch41展开路由分支、迁移proof条件及提交失败分支。没有最低改行数要求；Ch37 publication两条SQL原样保留。

```diff
-      if prior.binding != binding: ROLLBACK; return KEY_CONFLICT
+      if prior.binding != binding:
+        ROLLBACK;
+        return KEY_CONFLICT
```

```diff
-            } catch (IOException failure) { abort(); throw failure; }
+            } catch (IOException failure) {
+                abort();
+                throw failure;
+            }
```

## 冻结文件SHA-256

28允许文件中27份变化；Ch37 `publication.sql`及对应页面SQL块核验保留，其他13个代码块有排版变化。

```text
chapters/ch37.html  72fb108082b333aab672a72e23ea4a2425f3d501c3278ad00f802d8ce127bf6e
chapters/ch38.html  e6afd9f430f748adb1ae513b5aa35e30c200c5fe3332248d15ece01fc5eb0ce4
chapters/ch40.html  5913989ebf0e55eeca4e813f3746354c70bf6d28bd2ac461c04fcb6f234f3772
chapters/ch41.html  9038fd34e9e73e7907d6b9a0153e013b5ca6778c0336cbacd97e624e4b9d8407
examples/ch37/ExactSum.java  11d4ab4eb5331a9a418c752f6f5588927fbf820edd305d2efb0ee3f79074c7a9
examples/ch37/ExactSumTest.java  e8c94b1fb37d88ecd9e36b5be609aec835bb47d21849af4017f6ad1e28e6f0f9
examples/ch37/checkout.pseudo  d65d242576c02ab9bc28dfa0f5380a143d3d7fb06ec3dbfb8e46e32b31948a65
examples/ch37/publication.sql  4a9decb56bddf634485508e38e802655bafd8bca55f49f1bf00373cb5eb8a309
examples/ch37/run_contracts.py  f6205dee14cd2bf3cd3d2e8510c351220cd3fd59d01c6cb2d6485eef72a40b75
examples/ch37/schema.sql  47ddce5ca31d788511d8e6632928fb07203f38cfe9ec582338fcfaffeb33e52d
examples/ch37/storage.py  5b3deb9444a6e80e6ef09d3db48efde8384a1ec8515562cf25f42c64f09850f7
examples/ch38/AgeBudget.java  ba9326f4210904310ee94988ccd6f6446a0b0447ba1af7a506c3dfc56e7432c0
examples/ch38/SingleFlight.java  0e7d7ea3f98610b9233ad0a6caf96210b8148ac525bd20b81445ff19205ddb23
examples/ch38/cache.pseudo  44e62e91ff0db17e516da203feb049abf1ccfcf95ebc7cc053b28a0e8907eb33
examples/ch38/cache.py  1849e36bfe823f1116ee236e3b80ac7dc157552100df78a2d34f41fa7d5a5f10
examples/ch38/http.pseudo  b364b484e129097aa8af99f94d153a7a85044dfa51a276649fded918f7d26ee6
examples/ch38/run.py  eab75a5c12591fa345d8377c8f21b7b099fa4c797824aa131d695a7bc97a35c8
examples/ch40/ProtocolContracts.java  c79680805ee625b8b82a81446d5b690edf1b29b5881961f1410f728f115b131f
examples/ch40/ProtocolContractsTest.java  16c300082e927cc02782031941778706231561e10228843e0a9f5cc0092031d8
examples/ch40/verify.py  364f1687da30032c429a9e2f3a5ed1f07a5972165162190503afe13273157b36
examples/ch41/ReadGate.java  dc7e1a03ad3d9f2b9b723c42e1c42314e5a09289f93fa39db7a777e88119ab70
examples/ch41/ReadGateProbe.java  3dde3b1f2deb4eaaba3b7919b3e28de6b26b70e7bb92e8d52ccc206f49480333
examples/ch41/migration.pseudo  cad2c18e39bd96a9b261f91b01d6f27db780a732ef6e2c9ad9ed5af19c9af9f3
examples/ch41/schema.sql  adf927c05a3a2741f96ad21f71ed7fe10242505cacefd302a551a9f22736b103
examples/ch41/storage.py  f0d42a2b254bd7f0918eebfa2f07d8e4cfc1a98e5f1183c7193c4a92bc47ab53
examples/ch41/submit.pseudo  81c1a031465d22ff11f8e8aa46f773d615816c0a54685a324854d68e1c2a5af9
examples/ch41/submit.sql  15e0bbf000b1555e8ad365e5aee9188e5e7176fd2dc04e17c993539051c4e9a0
examples/ch41/verify.py  77e2fbea0b5eeee788e3f93ee648dc75bd2510a31e9bd9908bdcd3e37ab368b1
```

## 独立复核接收

- A→Ch38：完整report（重复环境去重/可逆路径）及manual/handoff已实读，正式接收7hash、26命令全0与52原始流。独立通读936行完整diff、两版全部源码/四段页面；原84项、Java16/41、既有缓存51/29/负缓存及Java27/26通过，完整AST/全部原token、人工父链、3class原字节、同源/页外HTML保持，无本轮或旧实质问题。原Sol/max、parent、succeeded/idle；report SHA-256=`864126b42d0c54098fce924ea352c4f584f0bfd3f219f0c44e2135fc6c0c4c9e`。Ch38与主验收同版通过，累计38/45；其余三份复核待接收。
- B→Ch40：完整report（同样去重/可逆路径）及manual/handoff已实读，正式接收4hash、24命令/48原始流，23退出0；首次仓库外辅助器同样误传readline()，只修回调后严格重跑通过，原错误实读留证、未改断言或源码。独立通读632行完整diff与前后全部源码/三段页面；原40项Java/13项Python、既有31项Java/4段SQLite/10算式通过，完整AST/1,130非布局token与SQL字面量、8class原字节/同源/页外HTML保持，无返修或旧实质问题。原Sol/max、parent、succeeded/idle；report SHA-256=`80d05bc32df83528acb31b5745ae9e3183ce63bc661c3bf23ddf78aca050b5d2`。Ch40计入完成，累计39/45。
- D→Ch37：完整report（同样去重/可逆路径）及manual/handoff已实读，正式接收8hash、19命令全0/38原始流。独立通读826行源码diff、88行页面代码diff及两版所有源码/三段页面；原57项SQLite、既有71项/Java16项与两版原Java16项通过，完整AST/3,731原非布局token、伪代码/SQL token与父链、3class原字节、同源及页外HTML保持。无本轮/旧实质问题或辅助失败，确认publication原样；原Sol/max、parent、succeeded/idle；report SHA-256=`6e79aa07ed7b22a7ab880dadeb37bed85552fa96b189c2d5b3ba87ba2073f8d6`。Ch37计入完成，累计40/45。
- C→Ch41：完整report（同样去重/可逆路径）及manual/handoff已实读，正式接收9hash、15命令全0/30原始流。独立通读724行九份完整diff、两版全部源码/四段页面；原7组verify与既有24项/Java10项通过，完整两份AST/全部原token（verify仅新增一对分组括号）、伪代码/SQL token与父链、5class原字节、同源/页外HTML保持。无本轮/旧实质问题或复核辅助失败；原Sol/max、parent、succeeded/idle；report SHA-256=`77110869ce17f5beb7b4586d307779f01419d1cfee1ff4c865e0c7f479c5c26d`。Ch41计入完成，累计41/45。
- 四独立复核共84条命令记录（83退出0，B一次仓库外辅助器回调错误已解决并保留）、168原始流hash绑定。28hash与四作者、主验证及浏览器一致；四原会话均已succeeded/idle，无活动作者或复核任务，未发生章节返修。

## 遗留与证据限制

- 无本轮排版遗留、章节返修或新发现的旧实质技术问题。Ch38固定历史hash包装器未执行、不计PASS，所需实际缓存/负缓存/Java探针已原样执行。
- 作者A临时路径、作者D及复核B回调、主代理区域识别的仓库外辅助失败如上保留；均不是原章节入口失败，未以放宽原工具/断言求通过。A失败前未捕获完整继承env，主代理首失败为工具显示转录而非独立原始流；不夸大证据完整性。
- 所有通过结果仍限于原本地SQLite/Java合同与排版保持，不等于真实副本/共识、对象验证/IAM、生产HTTP/CDN、分布式迁移/PREPARED/PostgreSQL重试、MQ/PSP/Shipping、网络性能或硬件断电耐久性证明。

## 最终封存与停止位置

- 最终API快照`final-sessions.json`确认四原linked child仍为Sol/max、原parent和目录，全部succeeded且不在active中；四作者及四复核交接均已正式接收。`main-final-session.json`确认实际主代理模型/max、parent与目录不变。
- 最后`python3 scope-check.py final`与`git diff --check`均退出0；实际argv/cwd/env/退出及原始双流hash在`final-closure-commands.json`。2,525个Git可见保护文件、12,637个完整文件系统文件/链接、四页代码外HTML、HEAD与28冻结hash保持；记录内28hash表也精确一致。不重复已通过的测试或浏览器。
- 最终封存为基线目录的`batch-final.json`，绑定28hash、八份作者/复核接收、主验证/语义、浏览器与截图清理、最终范围/会话、收口命令及收口后PLAN/本记录hash；状态见`final-git-status.txt`。全部作者写锁、只读复核和共享记录维护锁释放。
- 累计41/45、剩余4章；下一批Ch42–45须清空上下文后另次明确执行。本次到此停止，不启动下一批，不提交、推送或部署；此前未提交改动全部保留。
- 最终需保存作者与独立复核最终hash、既有验证/语义/同源、真实桌面/320px×两主题×zh/en/both及截图实看清理、保护范围和会话封存；全部交接清锁后停止，下一批Ch42–45另次明确授权执行。
