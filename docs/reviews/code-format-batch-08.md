# 第8批 Ch29–Ch32 示例代码排版

日期：2026-11-02。状态：**Ch29–Ch32全部验收并收口，累计33/45，剩12章**。未提交、推送、部署，不启动Ch33–Ch36。

## 基线与范围

- 实际主代理`ses_e681ae856ffec5AeNtFF2lz6K6`经本机API确认`openai/gpt-6.1-sol#max`；外层Astra仅路由，不实施/复核/写共享记录。
- 已实际读AGENTS、PLAN §0–5、Ch39完整源码/测试/页面三段、样板与第7批验收记录。第7批四会话均succeeded/idle，无遗留子任务。
- 基线`/private/var/folders/5k/y6qh6sfd2g30js0v0qrv4mfr0000gn/T/opencode/code-format-batch-08-j9QepHAI`；HEAD`fd61a122399c786edc8b169e8f62d5c8ec829de4`，main ahead 1；保存2,552个Git可见文件hash、原状态及四页代码外HTML，备份265个本批/相关历史证据/共享文件；另封存完整文件系统12,636个受保护文件/符号链接。旧批与用户未提交改动全部保留，本批原无改动。
- 已读四章README、sync和check入口。四页7/6/3/4共20块均使用原同源入口；原入口部分写历史结果，统一使用仓库外隔离副本。README、sync、历史证据及公共工具原样。
- 已加载OpenCode skill、官方V2 API及官方schema，明确使用linked child、异步`POST /api/session/{id}/prompt`与官方wait；模型列表实际确认Sol有max。主代理独占本记录和PLAN，子任务只改分配章代码/直接测试及原页面代码内容。

## 分工与锁

| 角色 | 章节 | 会话（均Sol＋max，parent为实际主代理） | 轮换只读复核 | 状态 |
|---|---|---|---|---|
| A | Ch29 | `ses_e681740d5ffdfxIb9GwPdkG6BW` | A审Ch30，D审Ch29 | 作者及审Ch30独立PASS均已正式接收，succeeded/idle，无写锁或活动复核 |
| B | Ch30 | `ses_e681740d5ffeJVZl9Gt3s2UL76` | B审Ch31，A审Ch30 | 作者及审Ch31独立PASS均已正式接收，succeeded/idle，无写锁或活动复核 |
| C | Ch31 | `ses_e681740d3ffdP9KwsWgTAT0PBc` | C审Ch32，B审Ch31 | 作者及审Ch32独立PASS均已正式接收，succeeded/idle，无写锁或活动复核 |
| D | Ch32 | `ses_e681740d3ffesje77F5Csr5yHy` | D审Ch29，C审Ch32 | 作者及审Ch29独立PASS均已正式接收，succeeded/idle，无写锁或活动复核 |

允许范围以基线`allowed_chapter_files`列明27文件为准（Ch29/30/31/32分别10/8/4/5）；不改README、sync、既有历史结果、其他章或共享文件。作者交接后复用原四会话轮换只读复核，不自编自审，不另开团队。

## 交接与恢复

以下按发生顺序保留阶段状态与失败恢复；最终状态以上表及收口节为准。

- 四linked child创建后已逐一确认精确模型/max、目录与parentID；异步派发后的`author-dispatch-sessions.json`确认四会话均实际running，服务支持四并发。使用macOS kqueue等正式handoff文件事件，再用原认证CLI官方wait确认idle，避免长请求客户端超时或轮询。主代理接续原入口基线验证，作者自验不替代独立PASS。
- 主代理基线21命令全部退出0：20块同源；Ch29 Java577项/配额SQLite53项，Ch30 SQLite51项＋数值21项＋Java20项，Ch31 SQLite48项＋Java18项，Ch32 SQLite68项；既有Ch29协议/配额及Ch32独立Python探针52/40/34项通过。三个既有Java oracle83/14/16项通过；同JDK17.0.10的31个`-g:none`class和六份stdout已封存供最终比较。实际argv/env/cwd/退出/原始流及报告见`main-baseline-{validation,commands}.json`；所有写结果只留隔离副本，不覆盖历史证据。
- D/Ch32完整report、manual-review、handoff已由主代理实际读完并接收：最终5hash匹配，17命令全0/34份原始流hash绑定；两版原入口68项、既有SQLite34项与两份数值29/29项通过。完整Python AST与3,618非布局token、伪代码token/人工控制父链及四块同源/页面保护通过。API确认原会话Sol/max且succeeded/idle，作者写锁释放；待C独立复核，不计完成。作者首次页面patch原子失败后修正精确边界，未改断言/同步器。
- C/Ch31完整report/manual/handoff已实际读完并接收：4hash匹配、22命令/44份原始流绑定；21命令退出0，一次仓库外token辅助器把readline返回值误作可调用对象而TypeError，已只修辅助器重跑成功，旧失败留证。两版原SQLite48项、既有SQLite36＋17项、Java18＋16＋12项通过；11class原字节/三份Java输出、完整Python AST与615原字面量/数值/注释token、12分号/区域标记/三块同源及页面保护保持。API确认Sol/max且succeeded/idle，C作者写锁释放；待B独立复核，尚不计完成。
- A/Ch29完整report/manual/handoff已实际读完并接收：10hash匹配、23命令全0/46份原始流绑定；两版Java577项、quota53项、既有协议52/Java83/配额40/数值37项通过。11class原字节、8组stdout、完整Python AST与2,205非布局token、四伪代码token/控制父链/分号/标记/七块同源及页外字节保持。作者包装器并行写同一commands.json曾覆盖三条结构检查聚合元数据，依据实际工具退出0与始终保留的原始流补回并透明单列，不冒称重跑；主代理与独立者仍各自做最终结构检查。API确认Sol/max且succeeded/idle，A写锁释放，待D独立复核；仅B/Ch30保留作者锁。
- B/Ch30完整report/manual/handoff已实际读完：源码已冻结、两版原check（SQLite51/数值21/Java20项）、既有Python61/Java14项、10class原字节及语义/同源均有完整证据，尚待主代理hash/原始流正式绑定。末尾final流的`provider.transport: Timed out waiting for response data`后，重试又发生`provider.auth: Operation timed out after '30s'`，API实际为failed/idle，不冒称成功。wait包装器因此断言退出1，原失败留存；这不是源码测试失败。中断恢复快照确认原四会话均idle且Sol/max，没有重复派发。仅恢复B原会话做只读确认，不重编、不换模型、不创建新团队。
- B原会话仅重发只读交接确认，未改任何文件/报告或重跑测试；官方wait返回204，主代理正式接收8hash、19命令全0与38原始流，API确认原parent、Sol/max、succeeded/idle。原provider失败没有抹除或伪称未发生。B证据包装器也有一次并行日志条目竞争，仅恢复实际diff辅助命令条目且明确时间未留存，原流保持；不改仓库工具。四作者合计81命令（80退出0，C一次辅助器旧失败后重验）、162原始流已hash绑定。
- 作者交接后27文件冻结为`final-hashes.json`，复用原四会话轮换只读复核；主代理接续最终验证、浏览器和范围，全部通过前未提前计章节完成。
- 原四会话轮换派发后的`review-dispatch-sessions.json`确认A→Ch30、B→Ch31、C→Ch32、D→Ch29均实际running且精确Sol/max，无第二团队。主代理最终21命令全0、31class原始字节与六份Java stdout保持，Python AST及原字面量/注释/分号、Java/伪代码token和原区域标记检查通过；10条真实工作区全站/audit/同源/diff检查通过。恢复冻结范围检查2,524个Git可见受保护文件、12,636个完整文件系统文件/链接及四页非代码原字节保持。
- 最终真实Chrome156.0.8078.76的48组合全部通过、异常0，52张截图已经生成，尚待主代理实际逐张read后按manifest清理，不能仅据截图生成宣称已实看。
- 主代理已逐一`functions.read`实看全部52张最终PNG（20块桌面浅色＋20块手机深色、8张反主题代表、4张手机右端整视口），缩进/分段与容器横滚可读；按manifest逐张验hash后精确清理，截图残留0、HTTP/Chrome均退出，27文件hash仍与冻结版本匹配。`browser.json` SHA-256=`3537b0a257e32152815466220a71860a0c7db5f3c4da0d3513753409c2a77128`；实际实看/清理见`screenshot-review.json`与`runtime-cleanup.json`。

## 主代理最终验证

基线与最终隔离副本各21条命令均退出0，相关既有入口/断言原样。原始argv、受控env、cwd、退出码和stdout/stderr见`main-{baseline,final}-{commands,validation}.json`；历史结果没有写回仓库。

| 实际入口 | 最终结果 |
|---|---|
| 四章原`node examples/chNN/sync.mjs --check` | 7＋6＋3＋4＝20块同源通过 |
| `python3 examples/ch29/check.py`、`quota_check.py` | Java577项、配额SQLite53项通过 |
| `python3 examples/ch30/check.py` | SQLite51＋数值21＋Java20项通过 |
| `python3 examples/ch31/check.py` | SQLite48项通过 |
| `python3 examples/ch32/check.py` | SQLite68项通过，含真实多连接及进程退出/重开 |
| 原Ch29协议/配额与Ch32独立Python探针 | 52/40/34项通过；不新增镜像测试 |
| JDK17.0.10原Java main及三个既有Java oracle | 原main577/20/18项、既有oracle83/14/16项通过；31个`-g:none`class两版原字节相同，六份stdout相同 |

- 真实工作区`node tools/check.mjs`、四章audit、四章原同源及`git diff --check`共10条通过，原始流在`main-final-structure.json`。
- `main-semantics.json`：9份完整Python AST含docstrings/type_comments相同；原字面量/数值/注释/分号保持，续行新增无语义括号由AST辅助；Java仅安全语句块括号差异、伪代码完整token与源区域标记保持。不是简单删空白比较。
- `main-manual-review.json`：主代理补充实际阅读4份关键完整diff共1,081行，以及8份核心文件两版源码，核对准入/pin/retire、锁后时钟、事务/CAS/更新、全包复查/发送与流提交/备用父链。完整逐文件独立人工复核由轮换四会话承担，不冒称主代理读过全部测试/页面diff。
- 最终真实Chrome以1440×1000与真实320×900视口、parchment/dracula两主题、zh/en/both三语言共48组合通过，DOM代码与页面原摘录逐字一致，整页无横向溢出，长代码在容器内横滚且右端可达，异常0。52张截图已实际查看并清理；Ch30原同步器的Java两空格根缩进契约保留。

## 独立复核接收（全部PASS）

- B→Ch31：完整report/manual/handoff已实际读完；正式接收4hash、22命令全0和44份原始流，原Sol/max及parent确认、succeeded/idle。两版原SQLite48、既有36＋17、Java18＋16＋12项通过，11class原字节一致；完整1,100行diff与两版源码/三段页面已独立核对，无返修或阻断项。report SHA-256=`49aedfb1ec1284c0f8be589e90a2349a34cc2be8c286be82f2a6c11f833d1a2e`。
- C→Ch32：完整report/manual/handoff已实际读完；正式接收5hash、12命令全0和24份原始流，原Sol/max及parent确认、succeeded/idle。两版原68、既有34＋21项通过；完整909行diff与Python事务/伪代码父链、四块页面已独立核对，无返修或阻断项。report SHA-256=`96ba231382734ef343e417d3fb5c1a5602fc4350ad7a07fbf50a821fdc7712d1`。
- A→Ch30：完整657行report、manual/handoff已实际读完；正式接收8hash、17命令全0和34份原始流。两版原SQLite51＋数值21＋Java20、既有Python61/Java14项通过，10class原字节和五组stdout相同；源码/测试1,071行及六段页面271行diff独立核对，条件/短路、锁后时钟、两段事务及发送父链保持，无本轮返修。report SHA-256=`170a937abf45017c936fe1ec6d44d6bd32992a4ca669ab4aec90241c66c4dc82`。非阻断旧表述缺口见下文。
- D→Ch29：完整918行report、manual/handoff已实际读完；正式接收10hash、22命令全0和44份原始流。两版原Java577/配额53、既有协议52/Java83/配额40/数值37项通过，11class原字节及八组stdout相同；完整1,335行diff和两版七段代码已独立核对，pin/retire、持久结算后本地扣减、锁/事务/时钟位置保持，无返修或阻断。report SHA-256=`108545cbce97f9296677b1b9df8b90c3383303f64c550bd499326128cb0c010e`。
- 四份独立复核共73命令全部退出0、146份原始流hash已绑定；四会话均精确`openai/gpt-6.1-sol#max`、原parent且succeeded/idle。作者和复核的27hash与主验证、浏览器、最终真实文件一致，复核期间无源码修改，未再派任务或新建团队。

## 排版对照

仅示意实际变化，不设改动量或列宽硬指标。Ch29显式展开单语句块；Ch30展开事务体；Ch31将候选筛选、精确重算和发布阶段分隔；Ch32展开流提交失败出口，保留原分号与注释。

`examples/ch29/KvLedger.java`：

```diff
-            if (attempt == null || attempt.isBlank() || generation <= 0 || boot == null || boot.isBlank())
+            if (attempt == null || attempt.isBlank() || generation <= 0
+                    || boot == null || boot.isBlank()) {
                 throw new IllegalArgumentException("Invalid owner");
+            }
```

`examples/ch30/model.py`：

```diff
-        with self.tx(): self.db.execute('UPDATE clock SET ms=?', (ms,))
+        with self.tx():
+            self.db.execute('UPDATE clock SET ms=?', (ms,))
```

`examples/ch32/stream.pseudo`：

```diff
-            if not won: abort_upstream(); stop         # stale/unknown ACK: never send
+            if not won:
+                abort_upstream();
+                stop         # stale/unknown ACK: never send
```

原SQL/字符串/注释不为列宽拆改；Ch30同步器与Java区域标记的两空格根缩进契约保持，页面没有整页格式化。

## 最终文件SHA-256

本批27个允许文件全部有排版变化；四章分别10/8/4/5文件，页面7/6/3/4块。以下同版也由`final-hashes.json`、四作者/独立接收及`batch-final.json`绑定：

```text
chapters/ch29.html  8adf3855e68c0b77dba43d9e5cb6260d78d836271bd96dab9f0973f5a1dc454e
examples/ch29/KvLedger.java  9a17311a54d1686553ad99fc71448ba919d24623202312bdd4e775c4e4e68692
examples/ch29/KvLedgerCheck.java  10bf5d00480b6b6ae53faaf351e41cc47fddd13fb91ea1bb123f3fd3de4e828d
examples/ch29/admission.pseudo  19d853b1a686a0638b42566d1260872bdc80d7732bcdfde8cc1e7bb80aeb379e
examples/ch29/attempt.pseudo  a87b0c648ebbca4e9b60157ad71e45aad79d440f1a0b73fc6d17386e4cd36d8c
examples/ch29/check.py  8f4bbf861d6eb8ed551b29e44914b5ea24724ba8360d8d460a02c95a943b78b4
examples/ch29/iteration.pseudo  9318b00d6a47dc1dff82fffa6242269daf09d6d532e65e875b4331f86c8e7e34
examples/ch29/quota_check.py  cb185769494b218e5ec105182821033ac7c9ab1c10b5ee196fbf413fe7201a87
examples/ch29/quota_model.py  39464376e630445992ee988d3d582ef1d5e9a6606205a519d0a2734885a3cc22
examples/ch29/reject.pseudo  61e0bc650c783c83f6429a212de23b0514e6d76110f25f2b59bcdb465cc1a40f
chapters/ch30.html  37d370f4813fac2f3caeda48a3cf7d0af5d474823f9e18a7655aced3509a42e7
examples/ch30/RagCore.java  4ee70992d88be48bce96c01f7d5bbcca80b7d8d0cbc59e13f018ee68a423199c
examples/ch30/check.py  ab5b93efbe124bb3aebbd21a2e8b3a7bc850620895f4e7120eafc8f36c17a70d
examples/ch30/ingest.pseudo  38f7505ae45bb0dad3449a294e864ddea202b0166d47b5146fce9400a494ba52
examples/ch30/migration.pseudo  ae2e41e7bb41599fdd8fce6f413d2ed47c54bc8450d1eebeddac784ceb5e865b
examples/ch30/model.py  a7126f2b9471a50de04f41907c194d3cf69a4b363eff992f9a7b151cfe0270d3
examples/ch30/query.pseudo  3262a2ada3787c5592096df4ca033316b075cc2dd0c9584db05b67b24b1a1461
examples/ch30/release.pseudo  a178a11a0dbf6c4a22593210431ab301db98c9824089dd3a9c5249403170e235
chapters/ch31.html  889adf3cc5283a1fd14a950db26906bcfa46232ca81120d3a93a346a7d2394a8
examples/ch31/VectorCandidates.java  6893c0522264e93aa171d639c7e261f3d04f9cbbcafbfb5f714074a5bda35591
examples/ch31/catalog.py  0ee61c6aa0a799b330ab1d57c79376c7f4bfde4d90795ca261a40af56672c6b1
examples/ch31/check.py  776f806f9935571d9738a5d96b45e5fccd6b94e88335bcf6c394c6df6476b3dd
chapters/ch32.html  1d35a00019e553fb9b82e5cf41ad1625390d66fdadd30fffa4976a1edeffef6e
examples/ch32/check.py  b1de0918866807618f8d2fe60a8845bdd31808b14e38a386fd23e15264db356d
examples/ch32/ledger.py  f64ac4ccfb91a676905ec03b48ef62906ec14cbfeba91ab714680ddaff591efa
examples/ch32/route.pseudo  6a848d24affb356adde68ba557ecdeae3cc6559843c4a49b432f502ba274b56c
examples/ch32/stream.pseudo  a3f089389d4bb7bd1552e312923e81c691d30b4d2e6e8665b3ba0b10e776fc54
```

## 最终范围封存与交接

- 最终`scope-check.py final`及`git diff --check`通过：2,524个Git可见受保护文件、完整文件系统12,636个保护项及四页非代码字节保持；四章27文件以外只更新PLAN和本记录，全部旧批及用户未提交改动保留，HEAD未变。
- 最终会话快照`final-sessions.json`确认原四会话精确模型/max、原parent、succeeded/idle且无活动任务；主代理精确模型见`main-final-session.json`。全部作者、复核及共享记录锁释放。
- 仓库外`batch-final.json`绑定27hash、八份正式交接接收、主验证/语义/结构、浏览器/实看清理、会话、范围，以及收口后的PLAN和本记录hash；封存不重跑已通过的源码测试或浏览器。

## 遗留事项与下一步

- **无本轮排版返修或阻断。** 单列原有技术表述缺口：`examples/ch30/ingest.pseudo:2–6`在BEGIN之后的重复event分支直接return，未显式说明事务结束。逐句移植到手写事务时须明确成功早退如何提交/释放锁；实际`Catalog.accept`的`with self.tx()`会提交，不是可运行模型回归。本批保持原逻辑，另行技术返修需明确授权。
- CPU ledger/本地SQLite/fixture不等于真实GPU、PostgreSQL行锁或分布式故障、ANN/BM25/LLM生产验证；Ch30原check/send间隙保留。已有README及历史证据原样，不扩大成功含义。
- provider超时、作者辅助器一次旧失败及日志聚合竞争均已如实留证和恢复，不计作源码失败或抹除失败记录；四独立复核未出现失败命令。
- `PLAN.md`已更新四章完成、**33/45，剩12章**；下一批 **Ch33–Ch36**。本次停止，不开始下一批，不提交、推送、部署。临时证据若失效，先据本记录、当前文件与Git恢复，不还原用户改动。
