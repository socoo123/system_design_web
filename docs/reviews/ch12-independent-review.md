# Ch12 · 独立只读复核

2026-10-23。复核者 ch10_author，GPT-6.1-Sol / Max。
**结论：通过。P0/P1未发现；1项P2范围表述已由作者修正并独立复验关闭。**
最终页面SHA256：`58da6191abc8c56750711fe3b45932e641a4c136eb5cca2b17e0c870fe376428`。
仅新增本复核证据与 `screenshots/ch12-independent/`，没有修改作者页面、源码、
公共文件或PLAN；未提交、推送、部署。不以作者自检或主代理集成代替本结论。

## 独立检查与实际执行

完整读取最终中英页面、图注/闪卡、5份共享源、Java17模型、作者说明与
PLAN §§4–8，核对HTML中的5份源逐字一致、6组30帧原ID/帧序保留。

[独立probe](ch12-independent-probe.py)只AST载入作者未修改的SQLite函数定义，
不执行会覆盖作者证据的顶层测试；使用独立输入与断言，另作小型本地SQL轨迹。
**30项通过**，结果在[ch12-independent-probe-results.json](ch12-independent-probe-results.json)。
本次额外输入包含20个并发不同请求/两个发送者、16个同键不同正文争用，
并非单纯复述作者的24个同键重复测试。

- 正常提交106；提交成功但响应丢失返回UNKNOWN，同键恢复107；中途失败全回滚，
  下一笔仍为108。20个不同请求得到109…128连续集合，message/receipt/outbox
  数量一致；同键不同正文争用仅一份意图得到129，其余摘要冲突拒绝。
- 成员移除事务先占权威写锁，排在后面的新发送被拒；移除后的发送者仍能恢复
  自己已经提交的最小回执，不借此返回正文。页面明确所有发送与成员/策略变更
  先持同一conversation行锁到提交，普通head与相关四类写入同事务。
- desktop连续D/R=129，phone的D=105/R=129被拒；迟到desktop D=107不降任何列，
  phone仍105。新view授权基线119、旧view拒绝、越head拒绝、私有Read不产生公开行。
  Receipt Store为同权威分区/同库逻辑表的契约已写明，不假装跨库FOR SHARE。
- 新设备epoch替换后旧close/heartbeat均更新0行；关闭后当前旧路由不能再续约，
  新登记继续递增epoch。此条件保护路由状态，不证明可暂停旧网关或收回在途字节。
- 真正本地SQLite事务写106/107并改cursor后回滚，重读仍只有已存108与cursor105；
  后续完整同事务补齐才推进108。故意删除send_receipt再送迟到旧键实际产生第二条
  同意图消息，支持“不GC回执，或先建立可验证关闭窗口”的必要边界。

独立Java程序[源码](ch12-independent-probe.java)与作者原Java一起由
JDK17.0.10 `javac --release 17`编译，**8项通过**：108先到不跨孔、认证省略107
与106补齐、重复108、旧seq修订应用/旧版本不复活、无新delta不能发现旧106变化、
伪造OMITTED拒绝、reset view拒绝旧包。日志在[ch12-independent-java-results.txt](ch12-independent-java-results.txt)。
Java是不可变算法模型，未冒充真实本地耐久事务；SQLite写锁比PG行锁更粗。

## P2发现与关闭

初始冻结版 `da019b…47bb` 的 `chapters/ch12.html:416–433` 定义按
`(cursor,H]`补齐，并说明撤回位置可返回tombstone；`receive.pseudo:8–9`及
Java模型能应用更高revision，却没有说明已越过位置的变更发现协议。

直接反例：设备cursor=108后离线，服务端把106改成rev2；请求`seq>108`没有106，
本地merge空批次仍保留106 rev1。收到106 rev2后才会应用，合并能力不能发现变更。
本章没有承诺完整编辑/撤回产品，故定P2范围表述，不要求扩建新协议。

作者在正文中英与README窄补限制：只应用已收到修订；本例不实现旧seq的
编辑/撤回传播，完整离线同步需新日志位置的控制事件或独立change cursor。
5份代码/Java/SVG不改。最终版该双语段落已重新阅读，独立Java第4/5项分别
复现“不会自行发现”和“收到后正确应用”；真实浏览器亦确认双语限制可见。
**P2关闭**。其他已读、前缀、去重、撤权与容量闪卡没有相反承诺。

## 容量独立复算

数字用Fraction重算并保存于独立JSON，没有复用作者结果JSON作为预期值：

- 10M×50%×20=100M/天，平均1,157.407/s、5倍峰5,787.037/s。
- 10M×15%×1.2=1.8M连接；每台100k×60%=60k，正常30台；同预算N−1需31。
  30→29只剩1.74M规划容量，原始利用率62.069%已超过60%预算。
- 1.8M×16,000B=28.8GB；100GB/天、36.5TB/年、三份109.5TB是明确排除额外项的
  载荷估算。全连接1MB缓冲上限为1.8TB，不能只拿增量连接内存估容量。
- 2×1.2接收设备倍率给13,888.889帧/s、111.111Mb/s载荷；心跳60k/s；
  故障恢复4k握手/s、最多400k补齐行/s需分别准入。
- 小群20×200=4k指针/s、预算40%，不留余量数学上限500人；大群50k/500
  目标倍率100；健康presence窗口90+5=95s仅从最后有效心跳起算。

## 图、语言与真实视口

[独立浏览器脚本](ch12-independent-browser.mjs)在最终SHA上重新打开实际页面，
1440/390×两主题×对照模式共**4组合**，实际innerWidth=scrollWidth=目标宽度。
按要求独立看了D1/D4/D6全部15帧的两主题桌面图与390px左/中/右阅读位置；
**60次帧访问、30张桌面图和90张窄屏图**，无pageerror/资源错误。结果在
[ch12-independent-browser-results.json](ch12-independent-browser-results.json)，
完整PNG与contact sheets在 `screenshots/ch12-independent/`。

- D1全帧位置连续；F5的30正常/31同预算N−1与原始62.1%含义正确，标签可读。
- D4全帧回执经收端→Receipt svc→逻辑Store持久化，再ACK/发送者补读；
  F5明确各列D/R独立max，不能把Read当另一设备cursor。
- D6全帧epoch在通道上方留白内，Presence svc缩窄后仍容得下标签；
  心跳/返回/观察查询路线可追踪，没有新遮字、裁切或无用途绕线。

代表：[D1两主题分组](screenshots/ch12-independent/d1-parchment-desktop.jpg)、
[D4深色各列水位](screenshots/ch12-independent/d4-dracula-desktop.jpg)、
[D6窄屏epoch](screenshots/ch12-independent/d6-parchment-narrow1.jpg)。
只在图容器内横向滚动；图注也随slide移动是共享既有方式，恢复左端可读。
独立确认15张闪卡保留cards-grid、5段代码已标性质。完整24组合/复制/播放等
由主代理另外验证，本复核不重复宣称自己执行了那一批。

`node tools/audit-chapter.mjs ch12`通过；本复核脚本语法/空白检查通过。

## 一手资料抽核与限制

执行时实际重新浏览并核对：

- [PG18行锁](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS)：
  FOR UPDATE持续到事务结束，FOR SHARE阻止成员行更新；
  [sequence](https://www.postgresql.org/docs/18/functions-sequence.html)明确nextval回滚不回收，
  不提供无洞序列。支持本地并发边界，不支持“DDL自动满足A5”。
- [Raft原论文§5.3–5.4](https://raft.github.io/raft.pdf)：当前term提交、多数与领导者安全
  必须一起看，不是任意两个ACK即提交。聊天的跨表事务决定另需数据库层。
- [AWS幂等](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)：
  caller request ID、迟到请求与记录保留取舍。无期限去重是本章选择，不是AWS通用默认。
- [Matrix v1.11](https://spec.matrix.org/v1.11/client-server-api/)的Syncing/Receipts：
  limited timeline能留gap、需另补；read-up-to与private receipt互相区分。
  本章整数连续seq/Delivered/view协议是自定义，正文没有冒称Matrix互通。
- [Redis通知](https://redis.io/docs/latest/develop/pubsub/keyspace-notifications/)明确断线丢Pub/Sub、
  expired在实际删键时产生；[RFC6455](https://www.rfc-editor.org/rfc/rfc6455.html)的帧/Ping/Pong
  不提供应用耐久ACK。presence未知不应阻断消息提交。

未部署PG/CockroachDB/Raft、未实测主从/共识切换、磁盘掉电、认证/OMITTED签名、
真实设备IO、撤权网关屏障、时钟异常或生产吞吐。SQLite/Java的通过不证明这些能力。
epoch持久不回退、同权威事务、可信当前服务端时间和诚实客户端仍是明确契约。
本轮仅抽核关键一手段落，没有重复审计所有文档内的第三方链接/性能图。

在以上范围与限制下，最终SHA可交主代理验收；没有待关闭P0/P1或阻碍阅读的P2。
