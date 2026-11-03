# 第7批 Ch25–Ch28 示例代码排版

日期：2026-11-01。状态：**Ch25–Ch28全部验收并收口，累计29/45，剩余16章**。四作者及轮换独立复核均已交接，所有锁清空。本次不提交、推送、部署，不启动Ch29–Ch32。

## 基线与范围

- 实际主代理`ses_e68621b2affeQy0Ke7t06k8vbm`经本机API确认`openai/gpt-6.1-sol#max`；外层Astra仅路由，不实施/复核/维护共享记录。
- 已实际读本地AGENTS、PLAN、Ch39完整源码/测试/页面三段、样板及第6批验收记录。第6批四子会话均succeeded/idle，无遗留任务。
- 基线`/private/var/folders/5k/y6qh6sfd2g30js0v0qrv4mfr0000gn/T/opencode/code-format-batch-07-1tcxdc4h`，HEAD`fd61a122399c786edc8b169e8f62d5c8ec829de4`，main ahead 1；保存2,551个Git可见文件hash、原状态与四页代码外HTML，备份59个本批/共享文件；完整文件系统另封存12,620个受保护文件/符号链接。所有旧批和用户改动保护，本批原无改动。
- 已读四章README、sync与check完整入口：默认check均写历史结果，使用仓库外隔离副本；README、sync、公共工具原样。页面6/6/7/7共26块均有原同源入口。HTTP协议文本需原样核验。
- 已加载OpenCode skill、官方V2 API/原schema及CLI帮助；本机schema原CLI响应被截断、直接官网urllib请求403如实记录，随后以webfetch完整官方schema确认真实接口。使用V2 linked child与异步`POST /api/session/{id}/prompt`（V2不叫`prompt_async`），不假造工具或接口；原四作者会话复用轮换复核。

## 分工与锁

| 角色 | 章节 | 会话（均Sol＋max，parent为实际主代理） | 后续只读复核 | 状态 |
|---|---|---|---|---|
| A | Ch25 | `ses_e685d8fa2ffe2ORWved8ftRy6O` | A审Ch26，D审Ch25 | 作者及审Ch26 PASS已接收；succeeded/idle，无锁 |
| B | Ch26 | `ses_e685d8f98ffe0fwXmTCy79TAqp` | B审Ch27，A审Ch26 | 作者及审Ch27 PASS已接收；succeeded/idle，无锁 |
| C | Ch27 | `ses_e685d8f99ffeTrt8xUbYOl8Fqs` | C审Ch28，B审Ch27 | 作者及审Ch28 PASS已接收；succeeded/idle，无锁 |
| D | Ch28 | `ses_e685d8f9affeR0nfQKLMiTed8Y` | D审Ch25，C审Ch28 | 作者及审Ch25 PASS已接收；succeeded/idle，无锁 |

作者只能写基线`allowed_chapter_files`中本人章源码/直接配套测试与页面原code内容，证据写各自仓库外目录。主代理单写PLAN和本记录。独立复核只读、返修归原作者；不额外开启第二团队。

## 交接与恢复

- 四会话创建后已逐一核对真实模型/max、目录、parentID；异步派发后`author-dispatch-sessions.json`确认原四child均实际running，真实支持四并发，没有第二作者团队。分别以官方wait API阻塞等待idle并接收自动通知，不轮询进度。
- 实际验证现成Redis7.2.5及JDK17.0.10，使用原环境变量支持，不改仓库工具/系统路径。主代理开始隔离基线原入口及既有探针验证。
- 修改前主代理21条命令全部退出0：26块同源，Ch25原108项、Ch26原78项＋Java615项（含真实RedisLua）、Ch27原69项（**可选RedisTTL因缺redis-cli跳过，不是通过**）、Ch28原54项＋Java20,167断言；既有Ch25/27/28独立Python探针66/88/35项、Ch28六个时钟反例与Java324项均通过。原Java main及四份既有oracle共28个`-g:none`class原字节与七份stdout已封存；原始argv/env/cwd/退出与42份流见`main-baseline-validation.json`/`main-baseline-commands.json`。本记录早期误称69项含Redis，现已据实际JSON更正。未改历史证据或工具。
- 四个CLI `api .../wait`客户端因自身长请求TimeoutError退出1，未据此宣称子任务失败或完成，也未重新派发；同一服务直接HTTP等待401后立即停止该方案，不读取/绕过认证。原失败全部保留。仅修仓库外包装器：先用macOS kqueue文件事件等待正式handoff，再通过原认证CLI的官方wait接口确认idle，不以睡眠轮询或增加作者会话。
- 编写中阶段范围检查：2,508个Git可见受保护文件、12,620个完整文件系统受保护文件/链接及四页代码外HTML保持；不以此替代最终范围验收。
- A作者Ch25正式report/人工结论/handoff已实际读完；API确认succeeded。wait官方成功是204无内容，仓库外包装器原误按JSON解析导致通知退出1，仅修空响应处理，不误记为源码/测试失败。D同类通知已到，等待逐章接收；B/C原进程仍使用旧包装器，若同类退出以实际session/handoff为准，不重新派发。
- A/C/D三份作者完整report、manual-review和handoff已实际读完，API确认三会话精确Sol/max且succeeded/idle。Ch25九文件全改、Ch27十改/keys.sql原样、Ch28九改/api.txt原样；两版原入口108/69/54＋Java20,167通过，作者Python AST/token/控制父链与页面保护通过，Ch27两class/Ch28十六class原字节保持。正式hash/原始流绑定接收中，尚不计完成。
- C如实指出Ch27原入口可选Redis探针因同目录redis-cli缺失跳过；主代理核对自身原结果亦明确redisSkipped，PATH和批准临时目录也未找到已有cli。本章执行69项，不虚称全量Redis通过；不安装软件、不改工具/断言。Ch26必需RedisLua实际执行，二者不混淆。B独立复核需保留同样说明。
- A/C/D作者9/11/10hash全部与真实文件匹配，16/18/21命令均退出0、32/36/42份原始流实读并计算hash；三份`*-author-main-accepted.json`绑定正式report/manual/handoff与模型/idle证据。仅B保留Ch26作者锁，其他三章待复核，累计仍25/45。
- B完整report/manual/handoff已实际读并正式接收：12hash、21命令/42流全0；两版78项含实际隔离RedisLua＋Java615项，2class原字节、AST/token/四伪代码父链/六块同源与页外保护通过。四作者共76命令/152份原始流全部绑定，42hash正式冻结为`final-hashes.json`，四会话均succeeded/idle后才转轮换只读复核；无作者写锁、无新团队。
- 轮换派发后API确认原四会话均实际running且精确Sol/max，见`review-dispatch-sessions.json`。主代理最终21命令全退出0、28class原字节与七份Java stdout保持，10条真实工作区结构/同源/diff检查通过；Ch27可选Redis仍明确跳过。冻结范围检查仍保持2,508/12,620受保护身份及四页非代码字节。
- 首次浏览器包装器在首组合的辅助evaluate因换行转义不足SyntaxError退出1，尚未形成组合或截图证据；仅修仓库外脚本的双层转义，HTTP/Chrome原finally已退出，不改仓库或放宽任何布局断言。修正后重新运行完整最终浏览器检查，旧失败保留。
- 主代理临时token辅助器首次把原伪代码英文`tenant's`误判为字符串开头而报unterminated string；仅补正本地lexer对词内撇号的识别，真实引号字面量仍逐字比较、断言不变，未改仓库代码/工具。原失败留证，修正后重验。
- 第二次浏览器辅助验收在Ch28手机折叠HTTP块的滚动提示断言失败：先前脚本未展开details就测不可见块。已按真实阅读方式先展开包含code的details、等待既有ResizeObserver布局；不改站点、不放宽原滚动/溢出/提示断言，增加失败state诊断，再重新跑全部组合。中间截图不算最终证据，最终manifest生成后逐张实看。
- 修正后最终真实Chrome48/48组合通过、运行异常0；26块桌面浅色＋26块手机深色、8个反主题代表及4个手机右滚整视口共64张PNG，主代理逐一`functions.read`实际查看，再验hash按manifest逐文件清理。42hash在浏览器前后与实看清理后保持，HTTP/Chrome均已结束。`browser.json` SHA256为`21e2bfe75a1f1807c730a8a3cd4ed5157e61de1c9c7e03b89b303e9ea4c04a53`，详见`screenshot-review.json`/`runtime-cleanup.json`。
- D→Ch25、B→Ch27、C→Ch28三份独立完整report/manual/handoff已实际读完并接收，对应9/11/10hash；11/18/15命令全部退出0、22/36/30份原始流已绑定。D两版108项；B两版69项/2class原字节及可选Redis明确跳过；C两版54项＋Java20,167/16class原字节；AST/token/人工控制与事务父链、同源/页面保护均PASS，无源码返修。三会话succeeded/idle、原复核锁已释放；仅A→Ch26在办，尚不增加整批计数。
- A→Ch26最后一份完整report/manual/handoff已实际读完并正式接收：12hash、18命令/36份原始流全0；两版78项＋Java615项、真实隔离Redis7.2.5、2class原字节及语义/事务父链/保护均PASS，无返修。四份独立复核合计62命令/124份原始流，均对应冻结42hash。
- 最终`handoff-sessions.json`确认原四会话仍为精确`openai/gpt-6.1-sol#max`、原parent，全部succeeded且不在active映射；没有未交接子任务，不再派发。主代理汇总首次错误地要求作者状态也为PASS而触发辅助AssertionError；实际作者均明确“已交接待独立复核”，仅独立复核才要求PASS，按阶段正确核对后作者/独立两组42hash均闭环，未改报告或仓库断言。

## 最终范围与独立验收

维护源码和直接测试先整理，再用原同步入口更新四页原代码块；允许范围42文件，其中40文件改变。`examples/ch27/keys.sql`、`examples/ch28/api.txt`检查后原样保留。正文、图、闪卡、公共CSS/JS、README、同步器、历史结果及此前未提交工作均保持。

| 章节 | 作者 → 独立复核 | 允许/改变文件 | 同源块 | 最终结论 |
|---|---|---:|---:|---|
| Ch25 | A → D | 9/9 | 6/6 | PASS，租约/状态/事务及锁后时钟位置保持 |
| Ch26 | B → A | 12/12 | 6/6 | PASS，随机与Lua更新顺序、两次恢复事务边界保持 |
| Ch27 | C → B | 11/10 | 7/7 | PASS，条件/重试/容量释放/交接顺序保持；可选Redis跳过 |
| Ch28 | D → C | 10/9 | 7/7 | PASS，监视器/volatile/时钟及回调顺序保持；HTTP原字节保持 |

四份独立报告已由主代理完整阅读并接收，`*-review-main-accepted.json`绑定最终文件、report/manual/handoff、全部原始流及模型/idle证据。报告SHA-256：

```text
D → Ch25  e41369bd463e2f3b0db05de31115b8057dbc0c1a410076ee0809cdac7ccd2b58
A → Ch26  d5ab9d4d5ac5c3710a5433eb9694cbc65a61a32789d4c14b8ee941b2288be5bd
B → Ch27  c0523f7a842a93e94ef189fd8c56560c6d78a6de8a61ecb5b6bc1144b3bda2ef
C → Ch28  c8c0a0c58395a3b5fa08acbf451892a4d9590e30c98b881162d10a2fa4aca2ea
```

### 少量前后对照

Ch25 `claim.pseudo`：显式展开回滚/返回，原复合条件及分号不变。

```diff
-  if r is absent or r.cancel_requested: ROLLBACK; return NOT_CLAIMED
+  if r is absent or r.cancel_requested:
+    ROLLBACK;
+    return NOT_CLAIMED
```

Ch26 `candidate.lua`：展开早退、规范参数空格；不移动旧候选回放或TIME采样。

```diff
-if m[1] ~= ARGV[1] or m[2] ~= 'ACTIVE' then return {'RETRY','epoch or gate'} end
+if m[1] ~= ARGV[1] or m[2] ~= 'ACTIVE' then
+  return {'RETRY', 'epoch or gate'}
+end
```

## 实际验证与页面证据

以下命令在基线和最终隔离副本各执行一遍，主代理每版21条全部退出0；默认写入的结果仅留在副本。原始argv/cwd/env、stdout/stderr及结果见基线目录的`main-{baseline,final}-commands.json`、`main-{baseline,final}-validation.json`，没有重新生成或覆盖仓库历史结果。

| 实际入口 | 最终结果 |
|---|---|
| 四章各自`node examples/chNN/sync.mjs --check` | 6＋6＋7＋7＝26块通过 |
| `python3 examples/ch25/check.py` | 108项通过 |
| `python3 examples/ch26/check.py` | 78项通过，含真实RedisLua与Java615项 |
| `python3 examples/ch27/check.py` | 69项通过、失败0；可选Redis GEO/TTL明确跳过，不计通过 |
| `python3 examples/ch28/check.py` | 54项通过，Java20,167断言通过 |
| `python3 docs/reviews/ch25-independent-probes.py` | 既有66项通过 |
| `python3 docs/reviews/ch27-independent-probes.py` | 既有88项通过 |
| `python3 docs/reviews/ch28-independent-probes.py` | 既有35项及6个时钟反例通过 |
| JDK17.0.10 `javac --release 17 -g:none -encoding UTF-8`，三组源码及既有Java探针；各自原main与探针运行 | 28个class两版原始字节相同、七份stdout相同；SplitProbe306项、LocationReview23项、Ch28独立ReviewProbe324项通过 |

真实工作区另执行10条只读检查：`node tools/check.mjs`、四章各自`node tools/audit-chapter.mjs chNN`、四章原`sync.mjs --check`、`git diff --check`，均通过；完整命令及原始流见`main-final-structure.json`。收口后再次执行最终范围检查及`git diff --check`。

- `main-semantics.json`：8份Python完整AST（含docstring/type_comments）及3,231个原字面量/数值/注释token保持；Java除安全语句块括号外token不变，Lua/SQL/伪代码完整token保持，HTTP完整原字节保持。28class直接原始字节比较辅助确认，不用简单去空白冒充语义证明。
- `main-manual-review.json`：主代理实际阅读24份关键diff共1,549行，核对条件、锁后时钟、分支父链、提交/回滚、Redis验证与mutation、监视器与回调顺序；其余完整逐文件人工复核由四位独立复核者覆盖，不冒称主代理逐行读过所有diff。
- 最终真实Chrome156：四章×1440×1000桌面/真实320×900手机×parchment/midnight×zh/en/both＝48组合，全部通过、运行异常0。包含折叠块先展开；全页无横向溢出，长代码在容器内横滚并可抵达右端，提示及缩进可读。
- 64张最终PNG由主代理逐一实际`functions.read`查看，包含全部26块桌面浅色和手机深色、8个反主题代表、4张手机右滚整视口；核对manifest哈希后精确清理。`screenshot-review.json`确认64/64已实看并清理，`runtime-cleanup.json`确认HTTP/Chrome均退出、无截图残留。浏览器证据hash见前述；最终42hash始终相同。
- `scope-final.json`封存2,508个Git可见受保护文件、12,620个完整文件系统文件/链接及四页代码外完整字节，与基线一致。`final-seal.json`绑定最终范围、42hash、作者/独立接收、主测试、语义/人工/浏览器证据、会话快照和收口后PLAN/本记录。

## 最终文件 SHA-256

清单与作者交接、主代理验证、浏览器和独立复核绑定同版；仓库外`final-hashes.json`自身SHA-256为`b7faac24a8fcb81c89801b77402574f0e01caf75b85d5bc47a65565ce84128d5`。

```text
chapters/ch25.html  078e632d16daa6e306b5810be4dc0c12da5397b86eb965af88e8bfeb3e7b9567
examples/ch25/check.py  0b5ae5f5302231e0e0b0fffb9ff55bc28962f85a3e94b2a1564e483e92351364
examples/ch25/claim.pseudo  e56f052ae7586a8baf246c036e14eff500ddf49d72e5f621e56891fcc3c11d48
examples/ch25/close_order.pseudo  180bde9262fec8d46efd2761849e4abe49f4151a4a4c0c99fcb24e7fc0219ecb
examples/ch25/materialize.pseudo  a75e8ade24ea56e30fa2df4bb9268eadc242cfa6b65ba4401dd83779d3e5949b
examples/ch25/misfire.pseudo  474b8f2030f9be720f668012d7dd4278f8a0457c04c50c05133d01b005995ec1
examples/ch25/model.py  18b025510de29ce6e687f077ec225685437275661735f56f71ff501d0b93599b
examples/ch25/schema.sql  59f41aa661c704fd32afb9f628d340798260a6bde4b1977b5b9c553bb39a29d7
examples/ch25/transition.pseudo  6f7a91cb43c1218700630bc8dd40cdfd43a9e4019e7585588c16ee1486fa830c
chapters/ch26.html  0a47051789d00ee7c9c9b1f7022c7842ca1deb7948d0b80d212a71b7d54aa0a4
examples/ch26/SplitPlan.java  de212d9eea3091a63c41157e3d23bf7fbf5f80c23340a19a9ca0dde876d45208
examples/ch26/activate.lua  a33f48e23674f5691957976dcaf8f31565bf7c5ae5511900b8cb8ad5b9ca2805
examples/ch26/candidate.lua  8e1717a406e136b177fba6df00607327274e5f302b04065efe99e12eab3eac51
examples/ch26/check.py  5d9f4733376b08bf17eb99e5be8149a373227d6543100f720f9c6f07274206c6
examples/ch26/claim.pseudo  e31b9a14e4a705e977b99cd84fa16bbf4bcac90933ced51487879f193a80da3a
examples/ch26/expire.pseudo  4794a3f516b09956f8df7f68a2a66546f98abf9207a710acb8643f49991ebba4
examples/ch26/install.lua  b7443b3ad0fef90e6b41328254ee2ed4987f66a389904498745ff07e680ec2cc
examples/ch26/ledger.pseudo  8a7c8ed124c0d01d3275f750934c6f8d5790c7209e93dded32aa10a478597b4c
examples/ch26/model.py  3f4b23f262f4e30b16f43d7071f1ea08addfc910193560611dc6f0de19b2feb6
examples/ch26/recover.pseudo  d75c8525f89f778dd1c85c294a180a031461778cf01491843ad9d0e54577f9bf
examples/ch26/schema.sql  9b77bb9b5c8357c0078cdc2969b0ed00a6a2724c70bb6a7d7c17ebf4c7348abb
chapters/ch27.html  df68a5329b13784f3d24a7a708ffa8e99c1ab8bbd720e654eb16234789632821
examples/ch27/LocationGate.java  3cd373497b30229405dde71374b0688faa282e2b1a874c1272ecf65bd222815f
examples/ch27/check.py  27d8d2400386e8aaf36f699cf6265b517ddb4ee6a6ae3778120e928e4504011d
examples/ch27/decide.pseudo  59d41fc43480f808e6d82f204774ab7c35aaf620f87293f835812b086d9449f4
examples/ch27/keys.sql  ce0026f474dd1dd97c48877b757131bc7d158a6e853fe0a80e6af8a55fa1a4f0
examples/ch27/location.pseudo  d2f6d839dc363d4c739d93710283a339a2c74a305b3932a7a7d475997049feaf
examples/ch27/model.py  f1394ee51a33d4fb73a1af409bf04701d5ba7e4789bd4d5c653c01e4dd7c03b0
examples/ch27/recovery.pseudo  72ea67ae9dde4b24449633eef2436b5167ae2dcd2c6f7bb4cf7cd032545a8676
examples/ch27/release.pseudo  7c9172114c0c986a54d2a86e6d244a37a20948a5ace5cdf677246c5604a76bfb
examples/ch27/reserve.pseudo  e6dd095ba8124ad0dd9e0a6fb9d8fb64d4cce2fc7ffe7e8adbd96c69d37e623f
examples/ch27/schema.sql  fc75090a077496f06e9446461d4b391619b1cc15011dcd5633e63d86ee20cb5c
chapters/ch28.html  2f90b5aec71674b4643a665b206e782b0d21bb09762db387b048e54a655213f7
examples/ch28/Chapter28Checks.java  baa96ddf4b018a2416e9935f3f9d17a7add7107ec116acf3398572595ba6fb00
examples/ch28/Cohort.java  e40dfcc802b328d15d86c518cbc657175930529fae8bed75f6ac1d602457459c
examples/ch28/ConfigClient.java  08d3a7c66517b840e984723ab880f45bd9978d862501cf43826cf7992d6bd4b5
examples/ch28/WatchHub.java  1991b33acb510f694c04b96aa40698a7687c716ead739af0be106df7054f4940
examples/ch28/api.txt  b3810cbb3d314aab1e591b50e4bd935c35f02728b726cd74b2aa18549f75188c
examples/ch28/check.py  140e18894427ff2098adf7ca45ca6b925c48574081985eda095c942f956fab6e
examples/ch28/model.py  22723531912d5c6c079c46531e4e956cd6bee234ee516251b1bbbdffd460d5d0
examples/ch28/publish.pseudo  87a03a7e308625ba1ed874481f3fb5ea7dfc929ff01556bf5aff7f33d9ee8b98
examples/ch28/schema.sql  9ec9c473b2fbb8254a7f887159ecc0a132a2f4a6878e5e9dfd9dd5083ff21614
```

## 遗留限制与交接

- 无新增源码阻断、技术返修或未关闭复核项。Ch27可选Redis GEO/TTL因现成server同目录缺`redis-cli`而由原入口跳过；不安装软件、不改工具，不能将其列为通过。Ch26必需RedisLua已在实际隔离Redis7.2.5执行，不受此限制影响。
- 原README明示的SQLite粗粒度锁不等于PostgreSQL行锁/故障切换，独立Redis不等于Cluster/负载测试，认证、资金及真实配送等仍为本地fixture；未借排版扩展功能或改变承诺。
- `PLAN.md`已更新四章完成、29/45、剩16章；作者、只读复核和主代理共享记录锁全部释放。下一批 **Ch29–Ch32**，须由用户或外层清空上下文后重新明确执行。
- 本次到此停止；未提交、未推送、未部署，全部旧工作保持。临时基线若失效，先据本记录、当前文件和Git恢复证据，不还原用户改动。
