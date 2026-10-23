# Ch18 独立只读复核

2026-10-23，复核者为Ch17作者，GPT-6.1-Sol + Max，非Ch18作者。
**结论：本次范围通过；无未关闭P0/P1或阻碍阅读P2。**
绑定HTML SHA256：`12d726880da511952ab0cb4cd66ff35bc2a4a55911ee30b13c8d680159add2bb`。
作者[冻结清单](ch18-final-hashes.json)中页面与全部示例哈希均在复核结束重新比对，保持一致。
本复核没有改作者HTML、示例、报告、共享文件或PLAN，仅新增独立报告/脚本/证据。

## 独立阅读与判断

完整阅读本轮页面的正文、六段伪代码、英文、图注/desc、14张闪卡，
对照原`ch16-ch17-ch18-baseline/ch18.html`，以及实际`schema.sql`、`model.py`、
全部`.pseudo`、README、同步与自检程序。先按源码重走，再读作者改动清单核对遗漏。
原同库预留/终结/UNKNOWN/资金责任/outbox主线保留，新增实现没有以本地锁冒充分布式保证。

关键提交边界成立：

- 请求身份、订单、完整购物篮、按单归属、创建回执和outbox共同提交；唯一冲突后新语句读取赢家，拒绝缺货不会持久成功身份。
- 支付与关单在同一订单锁下选择一个终结，完整本单HELD集合与明细匹配后才改聚合库存，任何不变量/SQL错误回滚外层全部写入。
- 外调身份先持久化，PSP调用在DB锁外；UNKNOWN/PREPARED/OBSERVED_REVIEW不允许盲开另一笔。首次对象绑定必须有受控渠道查询/服务端标记/归属/金额等外部契约，页面没有声称签名本身就证明这些条件。
- 每个capture独立承担接受、退款或核对责任；同capture不同event不会重复履约，不同capture不会被order_id去重吞掉。正常关单冲突写RefundDue，真正失败保留完整inbox恢复。
- PaymentInbox完整输入先持久再2xx；capture责任提交与inbox DONE的间隙可重放。下游inbox与唯一Job同事务，不把“一个持久任务”写成外部仓库exactly-once。
- 扫描固定cutoff连续分页，失败保留pending/expire_at，下一轮从最老到期重启。锁内复查阻止读出候选后的付款赢家被释放。

D2中的“hold committed”指创建事务已提交的预留；本章Reservation状态仍是HELD，
付款后才COMMITTED。正文、D3与代码明确这个区别，未发现实际双扣/多释放路径。

## 自拟输入：实际调用作者源码

[独立探针](ch18-independent-probes.py)加载实际`examples/ch18/model.py`，
标准库SQLite执行真实事务/约束；新输入为user-17、JPY、两SKU C/D、3101/4600最小单位价格，
不复制作者测试的alice/CNY/A/B案例。**50项独立断言通过**，
[逐项结果](ch18-independent-code-results.json)。重点包括：

| 正常/反例 | 真实执行结果 |
|---|---|
| 首次空库12路同用户同键同意图同时起跑 | 只有一单/一篮预留；总价10802，全部回执相同。报价过期、订单已paid后仍返回原创建回执。 |
| 同一新键、不同数量的两个并发意图 | 一份完整赢家、一份冲突；输家不留第二份预留。另测同键换地址冲突。 |
| C先更新成功、D缺货及C预留后注入异常 | 请求行、订单/明细、全部预留、库存和outbox一起回滚。 |
| 一单取消、另一单仍HELD后重放前单close | 不改变另一单库存/归属。修改本单预留数量制造不变量损坏，收款应用全部回滚，完整inbox仍READY；修复后同输入恢复。 |
| UNKNOWN及首对象尚未绑定 | 不允许新尝试；错误金额只写REVIEW且不绑定对象，仍挡新尝试。合法渠道契约输入可绑定一次并接受；后来的别对象进REVIEW，不能降级CAPTURED。 |
| 付款先提交 | 后续关单不释放任何货。 |
| 关单先提交，释放货已被另一单重新预留，再收到旧单钱 | 旧单保持closed，迟到钱只写RefundDue，不消费另一单的HELD。 |
| 额外3个真实capture、每个2个event | 3份独立RefundDue/退款outbox；整体仍只有1份履约outbox。原capture字段冲突不能当重复成功，完整冲突inbox保持READY。 |
| 完整inbox提交后、capture提交与DONE之间崩溃 | 回调输入和责任都可恢复，重放不新增履约。消费事务失败不留空inbox，重复和另一event描述同order均只一Job。 |
| 507单连续分页，在第0/499/500/末行注入失败 | 本轮仍遍历507行/完成503行；下一轮准确找回4个失败单，全部完成。 |

另实际重跑作者99项断言，**99通过**；只将输出报告路径重定向到
[ch18-independent-author-suite-results.json](ch18-independent-author-suite-results.json)，
未修改其源码或作者结果文件。本轮SQLite线程付款/关单竞态确实观察到两种赢家；
这仍不是PostgreSQL行锁或真实支付并发实测。

## 数字与来源重新核验

独立算术：百万单/日为11.574/s，×10为115.741/s，口述约116；
付款约81/s、重复通知约162/s、到期约35/s；4KB/单为1.46TB/年、三份4.38TB；
15分钟峰值占货104400份、每份3件313200件；
事件停120秒积139200，净排空2000−1160=840/s，向上166秒；
扫描停600秒积21000，净70−35=35/s、600秒追赶；
每分钟2100至少5批；10M×1KB×7×3=210GB；
5ms热门行理论200次修改/s，116预留+116终结=232已越界。
这些均与正文教学口径一致，未视为负载测量或恢复SLO证明。

本次独立重新联网打开一手文档并检查相关段落：

- [Stripe幂等请求](https://docs.stripe.com/api/idempotent_requests)：v1执行开始后保存首状态/响应含500，至少24小时后可清理，同键参数比较；v2是另一语义。章节限定正确。
- [Stripe错误处理](https://docs.stripe.com/error-low-level)：500仍可能产生副作用，未知结果不换新键；超过保留窗不盲用旧键/新键另建。首次对象未知与对账边界符合原文支持范围。
- [Stripe Webhooks](https://docs.stripe.com/webhooks)：原始字节验签、时间戳、异步处理、可能重复/不同Event代表同对象及无顺序承诺。完整inbox后2xx是本章自己的持久接收设计；真实SDK、账户凭据、不可修改marker不是本地模型已实现能力。
- [PostgreSQL18 Read Committed](https://www.postgresql.org/docs/18/transaction-iso.html)：定位行并发更新后重新判WHERE；DO NOTHING可因本语句快照不可见竞争而不插入，后续新语句再读合理。章节没有把它泛化为跨行自动串行化。
- [PostgreSQL18锁](https://www.postgresql.org/docs/18/explicit-locking.html)：固定多对象锁序、死锁整体重试；不应在事务内长等网络。章节统一先订单/本单预留/有序库存，外调在提交后。
- [AWS Outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)：业务与outbox共同事务、只发布已提交行和重复消费处理。没有据此推导真实外部发货exactly-once。

## 图与真实浏览器

[独立动画/范围检查](ch18-independent-scope-results.json)：
原**6组25帧**、帧序、title/desc ID保持；20帧逐字不变，5帧局部变化
（D1F4、D4F1–F4），最终所有SVG无NaN/undefined/Infinity。
直接比较路径确认D1F4为API→Client正常回复通道的红色直线，
D4F4保留必要的ACK上方避让并去除退化NaN曲线；其标签明确是durable inbox ACK。

[独立全帧渲染](ch18-independent-animation-after.json)50张：
**全部25帧两主题实际目视**，包括作者改动组D1/D4的全部8帧两主题，
没有仅凭DOM不溢出宣布图内合格。
代表：[D1双主题终帧](screenshots/ch18-independent/after/d1s4-dracula.png)、
[D4 ACK](screenshots/ch18-independent/after/d4s4-parchment.png)、
[完整D4深色](screenshots/ch18-independent/after/d4-dracula-all.png)。

[真实390结果](ch18-independent-narrow-results.json)为全部25帧×两主题×左/中/右，
共150张实际viewport截图；其中**修改组D1/D4的48张，4张逐组contact sheet已全部目视**。
innerWidth=scrollWidth=390，内部横滚可追踪完整节点和标签，未见修复箭头截断或压字。
其他组已在全尺寸两主题逐帧检查，未声称每张窄屏截片都额外人工复查。
代表：[D1手机左](screenshots/ch18-independent/narrow/d1s4-parchment-left.png)、
[D4手机右](screenshots/ch18-independent/narrow/d4s4-dracula-right.png)。

[独立浏览器脚本](ch18-independent-browser.mjs) / [结果](ch18-independent-browser-results.json)：
**24真实组合**（320/390/768/1440×两主题×zh/en/both）全部无整页横溢，
假设details展开同样通过。390/1440两主题对照模式**100次翻帧**、6段逐一剪贴板复制、
14张闪卡grid/翻卡、键盘、播放/暂停、倍速/循环、已读和偏好reload持久化通过，资源/pageerror为0。
实看[1440中文](screenshots/ch18-independent/browser/1440-parchment-zh-top.png)、
[1440英文capture代码](screenshots/ch18-independent/browser/capture-1440-dracula-en.png)、
[390中文capture代码](screenshots/ch18-independent/browser/capture-390-parchment-zh.png)。
代码有清楚的Pseudocode性质标识，长行在代码容器滚动，英文代码不夹整段中文。

`node examples/ch18/sync.mjs --check`六段逐字同源，`audit-chapter.mjs ch18`结构通过，
独立新增文件diff空白检查通过。最终各独立JSON均对应本报告上方冻结HTML哈希。

## 限制与交接

执行的是作者的真实SQLite契约模型及独立新输入，而非真正PG18事务/复制故障、Stripe
签名/网络请求、broker持久性、仓库/退款RPC或生产压测。代码中的可信渠道证据、服务端不可改
attempt标记、全层100/s限速等仍是明确外部依赖。真实退款最终到账、已确认提交不丢和分布式
恢复SLO没有在本次验证中证明。本章没有Java，不宣称Java编译结果。

本轮未发现需返修的新P0/P1/P2；没有以主代理28项或作者99项替代这份独立判断。
Ch18的只读复核已完成，可交主代理最终验收；未提交、推送或部署。
