# Ch41 独立复核

2026-10-24，GPT-6.1-Sol / `gpt-6.1-sol` + `max`。结论：**通过；开放 P0/P1/P2 为0，发现的1项阶段表达P2已由作者修复并独立关闭。**

最终签署页面 SHA256：`a9553dbd8f4bccd6310f62d9d0db263dc1809fcda88da09a2490bc91a99dd753`。签署清单为 [ch41-independent-final.json](./ch41-independent-final.json)，包含章节及 `examples/ch41/` 全部文本源的 `sourceHashes`，并带 `passed` / `openFindings`。

复核直接读完整中英页面、8组动态图文本/图注及全部9份示例文本源，没有用作者报告代替技术复核。只读 Ch41 页面/示例；所有新增文件为 `ch41-independent-*` 或已忽略的独立截图。没有提交、推送、部署，也没有另派 agent。

## 发现与关闭

| 编号 | 初次发现 | 作者修复 | 独立关闭 |
|---|---|---|---|
| IR41-P2-01 | D5S4已经标明 Source fenced at H，但图注紧接60−20=40MB/s，容易把切前持续写的速度套在fence后 | 中英图注明确：切前追赶60−20=40；fence后该范围新增0，固定H后尾追 | 作者把初读版本`4116f087…`修为最终`a9553dbd…`；浏览器新断言读取并验证最终英文限定，复核重读中英；两组全帧两主题目视完成 |

作者在正式测试前已完成该修复，因此独立新夹具、同源与浏览器结果全部绑定最终`a955…`，没有拿旧hash冒充最终签署。补漏前的`542a…`未用于签名。

## 直接调用原实现的新输入

可复现命令：

```sh
PYTHONDONTWRITEBYTECODE=1 python3 docs/reviews/ch41-independent-probes.py
node docs/reviews/ch41-independent-browser.mjs
```

结果：[独立运行](./ch41-independent-probes-results.json)、[独立浏览器](./ch41-independent-browser-results.json)。没有运行作者 `verify.py` 作为本次独立执行证据；它被完整阅读以区分哪些路径已有覆盖。Java17编译的是原 `ReadGate.java`，Python导入原 `storage.py`，并使用原 `submit.sql`。

| 新夹具 | 实际路径与反例 | 结论 |
|---|---|---|
| ReadGate的另一组历史/位点 | `billing-east / branch-44 / 987654`，精确追平、差1、旧快照伪装Long.MAX_VALUE、另一集群、branch-45分叉、拒绝回主；另测0和Long.MAX_VALUE边界 | 10条新断言通过。只有可信同历史新快照可读；主库角色或数值更大不能弥补丢失token，WAIT仍是显式调用方预算策略 |
| 多件订单与成功响应快照 | order-α 数量3、版本8，扣库存10→7，提交版本9；之后业务状态改为CANCELLED/version10，再用原key/version8查回 | 返回原SUBMITTED/version9响应且无第二次扣库存/事件；同key换version拒绝，改key不能提交CANCELLED状态。同caller/key/order文本在另一个已鉴权tenant独立 |
| 成功结果最后一条写失败 | 在 `request_result` 插入点触发真实SQLite约束错误，此时订单、库存和outbox已经写过 | 原适配器传播错误并回滚所有表；移除故障后相同请求可提交。不是把任意unique/constraint错误吞成重复成功 |
| 同幂等key绑定不同请求的进程竞争 | 两个真实进程、相同tenant/caller/key，分别提交left数量2或right数量4，初始库存20 | 一个SUCCESS，一个KEY_CONFLICT；仅赢家扣库存，outbox与result均只有1条 |
| 在途旧写回滚后fence | range revision8、原value3；一个旧写事务先改成41但不提交，另进程调用原freeze(8) | fence必须等待；旧事务回滚后才成功FROZEN，value保持3；旧rev7和frozen rev8都被原guard拒绝。证明的是同一个SQLite文件的仲裁域 |
| Shipping权威状态反例见证 | 另建复核者SQL见证，枚举取消先赢与发货先赢，两者均以READY/version5 CAS | 取消先赢拒绝迟到旧版发货；发货先赢不能再伪装取消成功。此处是文本合同的可执行见证，**不是原章Saga实现或跨服务集成实验** |

Python运行记录共24条断言/检查，其中包含源码/清单与进程退出检查，不把它们夸大为24种业务故障场景。Java10条是独立调用原类的新夹具。旧测试的重复运行没有累计为新增用例。

## 正确性判断与外部前提

**复制与可见性。** 默认异步仍等待本地WAL持久，正确区别于PostgreSQL `synchronous_commit=off`；远端flush与apply分开。强耐久指定确认副本，副本不可用不静默降级，提升还需承诺前缀和fencing。PG17官方说明同步standby配置是远端保证的前提，`remote_write/on/remote_apply`含义与页面相符。[PostgreSQL WAL配置](https://www.postgresql.org/docs/17/runtime-config-wal.html#GUC-SYNCHRONOUS-COMMIT)

ReadGate只做资格判定，`FreshView`被明确标为引擎取得、绑定查询快照/连接的可信证明；代码不假称能从一个replay仪表盘制造可见性。Repeatable Read旧快照反例成立，重连/换库需重新检查。token仅接受相同history是有意保守的合同，不能用大LSN跨timeline比较。[PG17隔离说明](https://www.postgresql.org/docs/17/transaction-iso.html#XACT-REPEATABLE-READ)

**迁移与prepared。** shared guard持到业务提交，freeze在同一写权威的排他锁后取得最终H；源端FROZEN持久后才证明目标完整copy、删除和同历史连续apply。目录CAS/目标grant、同moveId持久幂等恢复与旧源保持隔离都写明。进程锁或Router预检查不被冒充为存储fence。PG prepared仍持锁，因此未解决prepared不能越过drain；SQLite不能实测prepared，本项是原文机制核对与时序推演。[PG17 PREPARE](https://www.postgresql.org/docs/17/sql-prepare-transaction.html)、[Vitess22切流](https://vitess.io/docs/archive/22.0/reference/vreplication/reshard/)

**条件提交、幂等与重试。** 规范请求绑定可信tenant/caller作用域下的key，数量/SKU由带版本草稿决定；草稿修改递增version是明确前提。订单CAS、库存、outbox和成功响应同事务；0行或任一步失败全回滚。已知40001/40P01重试整个事务及其读取决策，UNKNOWN COMMIT查原key；伪代码显式rollbackAttempt，唯一冲突按类别处理。真实执行覆盖SQLite本地语义，未声称实测PostgreSQL重试。[PG17完整事务重试](https://www.postgresql.org/docs/17/mvcc-serialization-failure-handling.html)、[SQLite事务](https://www.sqlite.org/lang_transaction.html)

**Outbox与Saga。** 页面把MQ durable ACK后推进relay cursor、inbox+effect同事务后消费ACK分开；稳定ID、摘要、去重保留及外部效果另行恢复，图/正文/闪卡相符。Saga预占deadline不自动释放，旧hold回执不能绕过新状态；仅Shipping权威终态取消/失败且拒绝迟到release，才有未发货证明。发货赢的取消走售后，UNKNOWN先查同一操作，不能凭run超时退款。该跨服务合同不是本章可运行示例，不把SQL见证外推为真实Shipping可靠性。[Transactional Outbox原作者](https://microservices.io/patterns/data/transactional-outbox.html)、[Sagas原论文](https://www.cs.cornell.edu/andru/cs711/2002fa/reading/sagas.pdf)

抽核的一手出处和定位见 [independent-sources](./ch41-independent-sources.json)。明确使用章节声明的PG17/MySQL8.4/Vitess22版本，没有默认为这些就是最新产品版本。

## 数字、图与页面

主要算式独立用Decimal复算，保留在执行结果：12/86ms串行预算、2,000风险写、每片1,000/s、条件总量9,600/s、热片3,200/s超预算2,000/s、8桶理想400/s、全量4,000s、切前追赶3,000s、1h裸暂存3.6GB及重投1.1MB/s均成立。另用“同样120GB backlog且fence后新增0”的反事实计算2,000s，正好说明不能混淆两个阶段；它不是对实际迁移尾追时长的新增承诺。

原8组40帧/80 title-desc IDs保持，四份页面代码逐字等于当前源文件。独立浏览器覆盖320/390/768/1440×两主题×三语言24布局，打开折叠后仍无整页横溢。390/1440 both两主题160次翻帧、4段代码逐字复制、键盘/播放、闪卡、已读及设置持久化均通过；资源与页面错误为0。

独立截取D5/D8每帧两主题20幅SVG，实际打开下面四张接触表，检查全部帧的模块比例、回程、短线标签、fence/补偿路线，没有沿用作者的“图无问题”结论：

- [D5浅色](./screenshots/ch41-independent-browser/contact-parchment-d5.png) / [D5深色](./screenshots/ch41-independent-browser/contact-dracula-d5.png)。
- [D8浅色](./screenshots/ch41-independent-browser/contact-parchment-d8.png) / [D8深色](./screenshots/ch41-independent-browser/contact-dracula-d8.png)。

另实际打开 [320px英文SQL浅色](./screenshots/ch41-independent-browser/ch41-parchment-320-en-sql.png)、[深色](./screenshots/ch41-independent-browser/ch41-dracula-320-en-sql.png)、[390px对照ReadGate](./screenshots/ch41-independent-browser/ch41-390-parchment-code.png)、[1440px对照ReadGate](./screenshots/ch41-independent-browser/ch41-1440-dracula-code.png)。代码保持容器内横滚及Copy，双语说明与闪卡事实一致。全站既有窄屏导航F04仍由Q处理，不是本章新增问题。

## 签署限制

未运行真实PostgreSQL/MySQL副本、PREPARE恢复、Vitess迁移、持久目录CAS、MQ、PSP、Shipping或硬件断电实验；也没有压力、跨地域灾难和端到端p99测量。已执行的原类/SQLite检查、独立合同SQL见证、标准核对和手工时序推演分别记录，没有把局部模型当分布式保证证明。

当前已知开放问题为0，独立复核通过；最终批次验收与PLAN状态由主代理决定。
