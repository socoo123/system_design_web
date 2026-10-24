# Ch21 独立复核 · 通过

2026-10-23，GPT-6.1-Sol（gpt-6.1-sol）+ Max。复核者为 Ch20 作者，直接读取实际 Ch21
页面、model/schema、三份 Lua、七段伪代码、图注/英文/闪卡；没有调用会覆盖作者结果的 check.py。
只写本章 independent 证据与截图，未修改 Ch21 作者文件、作者报告/结果、PLAN 或共享资源。
期间主代理另行授权的 Ch20 原作者局部返修不属于 Ch21 写入。

**两项 P1 均由原作者返修、由本复核者独立重验关闭。无未关闭 P0/P1 或阻碍阅读 P2。**
[总结果](ch21-independent-results.json)与[审阅前后全文件哈希](ch21-independent-source-hashes.json)
保留初版、作者返修链及最终冻结前后相同的 chapter+examples 哈希。

最终 HTML：`e516022df2f8522cbe274ffa0d3873af6a3ac025dfef4700a8632a6c595e9547`；
model：`fd44dd36fbb6a1b4378522e86d05713b8b7bbc52faec1f0af5a01ea4fd4359e9`；
schema：`459125f52c3a18e0e1c95634fe308a70966266b88a13c5ffa379a234ac67ae33`。

## 分级发现与关闭

| 发现 | 实际反例 | 作者修改与独立重验 |
|---|---|---|
| P1-1：将10000/500=20秒称严格最短时间 | 原HTML `8a9d0e4d…` 的D4F5/正文称至少20秒，但Lua按固定Redis计时秒。独立运行**未修改实际Lua**，每固定秒500、q1、无回补，10000个token首末实际Redis TIME跨度**18.372040秒**；原硬下界被推翻。 | 图内nominal、中英图注/正文/预算闪卡与README改成名义稳态等效20秒，固定窗无该墙钟硬下界；最终逐项检索及两主题D4全帧/390目视一致。没有虚构无突发调度器，Lua原hash不变。正式关闭。 |
| P1-2：无hold请求终态被ACK成NULL投影 | 原model `9fc5041f…` 为两个新用户的REJECTED各建orders任务，实际relay调用consume后均SENT；SQLite留下两条 `(NULL,1,REJECTED)`，失去请求归属。原schema的TEXT PRIMARY KEY容许NULL，未模拟PG主键非空。 | 显式HOLD_STATE/REQUEST_TERMINAL路由；无hold拒绝/取消仅对有闸请求送Redis，无闸由权威请求回执查询。hold接收器先验类型/真实非空hold_id、id、正整数版本/合法状态；投影PK显式NOT NULL。独立两用户拒绝+取消、无闸查询、错路由不存在、NULL/空/空白/错型/布尔版本均不ACK/不写inbox；有效hold双目的地投递/ACK丢失仍正确。正式关闭。 |

[初版发现证据](ch21-independent-initial-findings.json)保存旧hash、两用户实际payload/NULL投影、
原容量说法与窗口反例。不是按新定义宣称旧版本正确。

## 直接执行实际模型与Lua

[独立模型探针](ch21-independent-model.py) / [85项逐条结果](ch21-independent-model-results.json)
直接导入最终 model.py，执行实际SQLite唯一约束、条件更新、SAVEPOINT、事务和线程：

- 新三夜库存 `[4,2,3]`、q2全部成功；q3第二夜不足、缺最后一夜与第二次更新后异常均全撤销。
  确定拒绝保留原回执，未知异常不留CLAIMED。资源顺序归一化重放；数量/日期/order/policy改变均冲突。
- 13个真实SQLite线程争三夜中间cap2，只两笔成功，所有日期守恒。确认后重试仍读原HELD创建回执，当前态另查。
  错owner/order/kind拒绝；释放后另一单重新预占，旧释放/迟到确认都不夺他单库存。
  注入跨scope hold_items归属错误，即使聚合reserved足够也拒绝，状态/计数不变。
- 用真实SQLite写锁堵住确认线程，在锁等待期间将注入DB模型时钟从deadline前推进到等号；线程拿锁后
  返回EXPIRED_NOT_CONFIRMED并保留HELD，证明没有提前采样资格时刻。此时钟是模型时钟，未冒称真实PG实验。
- 在途CREATE已认领身份，取消线程确实等待；旧CREATE故障回滚后，墓碑胜出并挡迟到创建。
  另执行COMMIT成功后丢回包的模型故障，同身份查询/重试取原回执；resolve不撤销已存在HELD、不回补。
- 真实权威快照包含已过期未释放HELD、CONFIRMED、RELEASED、REJECTED、CANCELLED五身份。
  暂停挡创建/确认/释放；**模型快照→实际install.lua→实际Redis元数据→resume**成立。
  安装回包未知通过同份只读重放解决，未确认ready不能恢复；旧epoch创建/收据与旧恢复控制器拒绝。
  e7旧hold在e8释放发当前e8收据，实际receipt.lua将free10加4到14，重复/旧收据加零次。
- 有效HOLD_STATE经orders接收已提交后、发送端标记前崩溃，重投同event去重；仅标orders，Redis仍pending。
  接收器副作用失败回滚inbox，原事件重复不再执行，旧版本不倒退，同event不同完整body拒绝。
- 连续 `(deadline,id)` 分页每页3条实际扫描11个due hold；首行注入释放失败，后续页照常到末尾，下一轮
  从最老位置重新找到该HELD并补成功。这里只验证扫描契约，没有声称实现生产扫描调度服务。

[独立Redis探针](ch21-independent-redis.py) / [46项结果](ch21-independent-redis-results.json)
启动隔离Unix socket Redis7.2.5，EVALSHA的内容为实际 admit/receipt/install 三份源，均未修改：

- 新cap17/q3准入与同身份不二扣、owner/digest/q冲突无写入；终态先到、旧HELD后到、重复终态、
  终态冲突、无token、确认不回补、旧epoch、无TTL；17个实际Redis客户端争两件恰好两次准入。
- ready0部分基线拒绝准入；1307个保留身份实际分块安装，ready1以后重试同快照不重置已变化free。
  安装后检查失败的实际反例仍保留ready0，无法开放半份基线；新epoch另键能恢复。
- 容量反例真实跑完20个固定计时秒桶、10000个单件token，未手动修改TIME/sec/used、未释放重售。
  18.372秒是**反驳硬下界的轨迹，不是吞吐基准或生产SLO**。

正常与关键失败路径由实际源执行；本地模型/Redis单进程无法证明真实PG锁粒度、复制、支付或跨系统原子性。

## 数字与引用抽核

用Fraction独立复算：`5000×200×0.7÷3÷86400=875/324≈2.700617/s`；
库存行18,250,000；入口/DB=2.5；创建+确认+释放=750&lt;800；平均在途10；冲突最多300次。
20秒保留为名义等效算式，附上述实际边界反例；未把峰值/预算当生产实测。

本轮独立重新打开官方原文，核对具体边界：

- [PG18隔离](https://www.postgresql.org/docs/18/transaction-iso.html)支持竞争UPDATE等待后的WHERE重检、
  DO NOTHING冲突行不一定在同一语句快照可见；新语句读赢家成立，不能扩成跨行保证。
  [PG18事务](https://www.postgresql.org/docs/18/tutorial-transactions.html)支持整笔全有/全无和SAVEPOINT局部回滚。
- [PG18时间](https://www.postgresql.org/docs/18/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT)
  区分事务开始时刻和clock_timestamp当前时刻；正文明确hold锁后判定，提交可晚于deadline。
  [PG18约束](https://www.postgresql.org/docs/18/ddl-constraints.html)支持主键非空与CHECK不能证明跨表所有权。
- [Redis Lua](https://redis.io/docs/latest/develop/programmability/eval-intro/)支持执行期间不交错；
  [Cluster](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/)支持多键同槽/hash tag，
  未据此宣称单进程脚本就有集群耐久。
- [Keyspace通知](https://redis.io/docs/latest/develop/pubsub/keyspace-notifications/)与
  [持久化](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)支持通知丢/晚和every-second AOF窗口；
  [AWS outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)
  支持本地状态与事件同事务及接收幂等，未用作Redis+DB或付款exactly-once证明。

## 实际浏览器与图文一致

[独立脚本](ch21-independent-browser.mjs) / [结果](ch21-independent-browser-results.json)：
390/1440 × 两主题 × en/both共**8个风险组合**，展开details后innerWidth=scrollWidth；
14卡实测grid，7段代码×两主题共14次逐字复制，键盘、播放/暂停、倍速/循环、Enter/Space翻卡、
已读和偏好重载通过，页面/资源错误0。初次脚本在reduced-motion下尝试点隐藏播放设置，
属于测试设置问题；改为仅交互阶段模拟no-preference后完整重跑通过，没有修改产品。

D4全部5帧两主题**10张桌面图**及真实390视口左/中/右**30张**均已目视：标签、节点、箭头无遮挡，
单hash标记与名义20秒正确，帧间位置稳定。没有CLI裁切冒充手机。
[浅色桌面](screenshots/ch21/independent/d4-parchment-desktop-contact.png)、
[深色桌面](screenshots/ch21/independent/d4-dracula-desktop-contact.png)、
[390浅色](screenshots/ch21/independent/d4-parchment-narrow-contact.png)、
[390深色](screenshots/ch21/independent/d4-dracula-narrow-contact.png)。

另目视[D5F4对照图注](screenshots/ch21/independent/d5f4-caption-parchment-both.png)、
[英文图注](screenshots/ch21/independent/d5f4-caption-dracula-en.png)、
[390英文新接收器代码](screenshots/ch21/independent/events-390-dracula-en.png)，
终态回补/HELD与CONFIRMED不加配额、事件分型/拒绝无身份ACK与正文相符。
[动画清单](ch21-independent-animation-results.json)确认原6组29帧ID/顺序保留，
仅D4F4/F5文字变化，所有path/rect/circle/ellipse/polygon几何逐字不变。

`node examples/ch21/sync.mjs --check`七段逐字匹配，章节audit通过（6组29帧/7代码）；
专属Python AST和浏览器JS语法通过，无新字节码文件。主代理负责最终全批72组合，本复核未重复其全部矩阵。

## 结论与限制

两个P1正式关闭，最终版本独立复核通过。没有发现剩余P0/P1或阻碍阅读P2。
未测试PostgreSQL行锁/复制/切主、Redis Cluster/AOF/故障恢复、真实支付认证/退款/履约、生产负载或在线恢复；
SQLite的BEGIN IMMEDIATE更粗，注入clock只是模型时间，确认命令/安装ACK/网络耐久仍是明确适配契约。
最终chapter+examples在本次冻结复核前后哈希相同；未提交、推送或部署。
