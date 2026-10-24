# Ch20 分布式消息队列 · 交叉独立复核

2026-10-23 · GPT-6.1-Sol (`gpt-6.1-sol`) / Max · Ch19作者只读复核Ch20。

**结论：通过。发现1项P2，原作者返修后独立重验关闭；当前无未关闭P0/P1或阻碍阅读P2。**
未改目标章节、examples、作者报告/结果、PLAN、公共文件或整合证据，未提交/推送/部署。

最终HTML：`c06c7619512b783f07334dc7f075bf2e29fe728ba724e688648ae8dc5253199e`。
Java核心：`cb65e4d91faf345dda4d267edd1082796282e79c83d16e412358f558761384f8`，返修未改。
[完整before/after源码哈希](ch20-independent-source-hashes.json)覆盖chapter和examples全部文件；
唯一变化为原作者获主代理授权返修的HTML、README、rebalance.pseudo三文件，其余目标源码不变。

## 发现与独立关闭

| 编号/级别 | 原问题与反例 | 原作者修正与复验 |
|---|---|---|
| I20-01 · P2 · 已关闭 | `onPoll`的for-p只包注册/dispatch，随后在循环外读tracker[p]/写map[p]。当前poll空时p未定义；多区只剩最后p。暂停区等待worker时，正会反复收到空poll和完成邮箱，例A/B均已暂停、nextOffsets为空但B已完成。 | 现在每轮含EMPTY poll先应用邮箱，再注册本次工作，从ALL current-owned ACTIVE trackers建safeMap并实际commitSync；revoked单独取本次still-eligible tracker，lost不交。无本次terminal时省略未知epoch，UNKNOWN不虚构回滚，跨分配不重用旧map。最终页面/README/源码逐字对齐；新Java实际A/B轨迹与字面作用域探针通过。 |

[初版HTML/伪码/README](ch20-independent-initial/)保留原文，初版HTML为
`e540916e78557851d39a802023135feaf23d5974e31a45a87dcb35ce090bc85f`。
[原作用域反例与返修结果](ch20-independent-adapter-results.json)明确区分：原伪码的机械作用域转写在空poll抛UnboundLocalError、两分区只得B；
不是宣称执行过Kafka适配器。返修的遍历条件来自实际伪码，所用tracker轨迹直接执行真实PartitionProgress。

## 直接执行与正常/反例轨迹

复核者先读全部Java、伪码、DDL、双语正文、闪卡及30帧title/desc/标签；未将作者自检叙述当执行结果。
[独立探针](ch20-independent-probes.py)从实际`apply-event.pseudo`提取INSERT/SELECT/UPDATE，
从实际Java类调用方法，输出只写[独立结果](ch20-independent-probe-results.json)，没有运行会覆盖作者结果的check.py。
最终源码上 **34项独立检查通过**：25项SQL/失败/并发、6份页面同源、实际Java新探针/隔离作者suite及算术。

[新Java探针](ch20-independent-ProgressReview.java)在Java17.0.10真实编译运行，**15,153断言、500个新随机稀疏批**：

- 每批1–13条，独立布尔前缀oracle按实际交付顺序核对所有随机完成序；半数先进入DRAINING再完成，不把整数空洞当未做工作。
- 新轨迹[903,1500,9999]终点10040：先完成9999仍停903，再完成903才到1500，全完成才10040；过滤后空批可推进到12000。
- 未完成时即使空批也拒绝新注册；坏尾、重复/回退offset、终点不合法、超预算全部不改变既有状态。
- CLOSED无可提交快照，重复/空/旧ticket被拒；新assignment相同offset不接受旧tracker身份；靠近Long.MAX_VALUE也不做offset+1溢出。
- 直接执行A=[105,109]终点120、B=[211]终点240：本次空poll时邮箱先完成A109/B211，遍历所有拥有tracker得到{A:105,B:240}；A105完成后为{A:120,B:240}；B关闭后仅A。未用本轮nextOffsets集合限制完成提交。

作者Java123断言另在临时编译目录隔离执行，也通过；不覆盖其code-results。上述均为本地tracker，不能提供Kafka所有权或远端调用取消。

实际SQLite执行使用新账户zephyr/tao、负增量和稳定handler/event：

- 正常900−175=725；新事件+12后重放原事件仍回725；同ID换账户/改delta均拒绝。
- 插inbox后、更新ledger后失败均回滚；实际SQL receipt UPDATE触发器报错也回滚已做的ledger/inbox。
- COMMIT完成而回执丢失，原身份/意图重试回原结果；不存在账户不留inbox。
- 32并发同事件仅一份APPLIED/同一回执；24并发不同事件无丢增量。
- 负控制实际证明：改变handler或过早删除inbox会再执行，符合稳定命名空间/保留期前提；单独提交NULL结果的inbox会阻断缺失副作用，不能靠重试补回。

SQLite使用BEGIN IMMEDIATE粗粒度写锁，不是PostgreSQL行锁/READ COMMITTED实验。
没有借本地唯一键声称覆盖Kafka、PSP或HTTP。正文把远端责任持久化为job、目标端幂等与UNKNOWN核对，范围清楚。

## 复制、事务、数字与来源

独立重走RF3/acks/min2正常及故障路径：稳定ISR2时Follower后续Fetch报告进度才允许HW42/ack41；
ISR3仍等三份；ISR降至1不能确认新acks-all写，strict minISR阻止HW继续推进。
ELR0只限定安全选举候选，不把4.1.2HW算法退回旧版。图假定无待加入ISR/重分配；
源码真实算法另考虑maximal ISR/可加入副本。acks-all不等于每副本逐条fsync，相关失效依赖已在正文保留。

Kafka纯transform事务与DB路径分别核对：整批成功才用本次nextOffsets，位点暂存ACK与Produce ACK不是最终事务成功；
commit超时保留同一决定或close/init恢复，不转abort、不声称UNKNOWN已失败。部分完成元数据省略未知leader epoch，
整批才复用terminal metadata。正常revoked可有界排空，lost不交，成员自己的epoch与producer epoch分别负责fencing。

[独立来源抽核](ch20-independent-sources.md)记录实际重新打开的Kafka4.1/clients4.1.2、tag4.1.2源码与PG18文档。
其中Producer API commit/abort、ConsumerRecords/OffsetAndMetadata、RebalanceListener和Partition.scala均直接核对具体段落，
没有把历史提案或新版本导航当4.1.2契约。

用Fraction独立复算20项输入/结果，详见独立结果numeric：平均1,157.407407/s，峰值11,574.074074/s；
七天RF3 2.1504TB，每份716.8GB、每台2TB的35.84%；入口11.851852MB/s、常规出口47.407407、
混合出口87.407407MB/s=699.259259Mb/s、写55.555556MB/s；热key2,314.814815/s=单成员预算2.893519倍；
一分钟积压214,444.444444，净排空4,425.925926/s需48.451883秒；月9.216TB、年112.128TB；取模迁移1/2及48/49。
15是聚合吞吐必要下界，正文部署32成员/48区，未把它当实际离散分区均衡或压测容量保证。

## 独立浏览器与目视

[独立脚本](ch20-independent-browser.mjs) / [结果](ch20-independent-browser-results.json)绑定最终HTML哈希，
独立风险覆盖 **390/768/1440 × 两主题 × en/both=12组合**。默认与全部details展开后，实际innerWidth=scrollWidth；
全部30个frame IDs/6组、6段代码与14张cards-grid一致，无非法SVG数值/破损TOC，页面和资源错误0。
主代理另承担全批72组合，本报告不冒领它们。

D2/D4修改组的全部5帧×两主题实际目视：20张桌面原帧；真实390视口每帧左/中/右60张figure，
[原生截图与8张接触表](screenshots/ch20/independent/)均保留。D2 SDK框尺寸连续、底部迁移线接在收紧框底；
unsafe:N96可辨为设计风险；D4 join/heartbeat、每成员epoch和旧C2被拒路径与双语图注一致。
未见文字压线、跨节点/边界、无意义绕线或裁切；横滚只发生在自己的图/代码容器内。

独立执行40次D2/D4翻帧，6段逐字复制；键盘、播放/暂停、速度/循环、14卡点击/Enter/Space、
已读和主题/语言/播放器偏好重载通过。实际目视390英文Java、返修伪码、SQL和Kafka事务代码，两主题可读。

首次播放探针在Playwright点击后将D4推到top≈−400，仅约25%图可见，公共IntersectionObserver按设计暂停；
[初次结果](ch20-independent-browser-initial.json)和[定位轨迹](ch20-independent-playback-results.json)保留。
居中到top≈278再播放，2→3帧正常；修正复核脚本的定位后仅重验交互通过，12个已通过布局/截图未重复统计。
这不是目标章节缺陷，也没有修改公共播放器。

## 运行与限制

可复运行：

```sh
PYTHONDONTWRITEBYTECODE=1 python3 docs/reviews/ch20-independent-probes.py
node docs/reviews/ch20-independent-browser.mjs
python3 docs/reviews/ch20-independent-contacts.py
```

独立probe和browser结果都为最终HTML c06c761…3199e；源码清单对照显示仅原作者授权的三文件返修。
未执行Kafka broker/副本掉电、真实再均衡/consumer adapter、Kafka事务或PostgreSQL服务；未做生产压测。
所有容量/时效都是教学假设。伪码作用域探针、适配器遍历和事务控制流核对分别按其性质记录，
没有冒充真实分布式测试。当前通过结论限本次章节内容/实现/修改图与上述实际检查范围。
