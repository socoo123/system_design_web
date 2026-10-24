# Ch45 独立复核

2026-10-24，复核者为Ch44作者（GPT-6.1-Sol / max），独立检查Ch45。
**通过；当前未关闭P0/P1及阻碍阅读P2为0。** 本复核者未修改Ch45页面或examples；
两项P1由主代理修复后，复核者用新输入重验关闭。未提交、推送、部署或延伸Q。

最终签字与页面+全部8个examples文件哈希见
[ch45-independent-final.json](ch45-independent-final.json)；签字前与修后检查、存储探针、
回归三份来源清单逐一比对一致。页面SHA256：
`dbd8bd7f86bb4966e7d40edc6b8f08e9416eac4da4dbb032f2e6f9d37583b118`。

## 发现与关闭

| 发现 | 独立触发 / 影响 | 修后新输入与结论 |
|---|---|---|
| I45-1 · P1，版本耗尽后SQLite错误提交 | 将真实库version设Long.MAX_VALUE，再edit(...MAX,3)。旧适配器返回9223372036854775808，库中version变REAL且根/行/回执已提交；与Java精确版本合同相反。 | max−1可精确提交为max，同键原回执可恢复；max新命令与收款均OverflowError，所有表不变；schema拒绝REAL，布尔/浮点/负值被版本函数拒绝。关闭。 |
| I45-2 · P1，CAS=0误隔离有效事实 | 显式注入paid条件UPDATE的rowcount=0，旧consume返回QUARANTINED并持久CAS_CONFLICT，违背伪码整笔回滚、有界重载、耗尽不ACK。此为分支注入，不冒称真实PG竞态。 | 新RetryableConflict向外抛；全表保持原值，无inbox/capture/outbox/quarantine，也无成功消费结果。同message随后重入ACCEPTED；另一轨迹在冲突后真实写closed，再重入得到唯一退款且不复活。关闭。 |

[原始失败](ch45-independent-initial-probes.json)未覆盖；
[13条修后回归](ch45-independent-regression-results.json)保留新异常捕获、全表快照及恢复证据。
SQLite只证明本地事务，不能把这两项描述为已在PostgreSQL或PSP生产端复现。

## 独立路径与实现检查

完整阅读了中英正文、A1–A12、37帧title/desc与图注、4段代码和12张闪卡。
正常路径是根生成不可变候选，SQL以版本/状态条件提交根+明细+命令回执；
Pay事实由适配层验绑定，Order用投递event与业务capture两个身份提交接纳或退款义务。
关键反例是同一capture不同event、p9/p10竞争、关单先赢、commit回执未知，以及版本耗尽。
UNKNOWN保留原退款身份，不从TTL推出可重做；图、正文、代码与闪卡在这些条件上一致。

- [独立Java](ch45-independent-java-results.json)：20条新断言，使用EUR 4×125→7×125=500→875、v51→52→53→54；外部List修改不污染根；编辑/结账/收款/关单的max版本路径与跨行加总溢出均拒绝，原快照不变；accepted重复不发事件，另一支付产退款候选，closed不复活。
- [独立SQLite](ch45-independent-storage-results.json)：15条新断言，quantity5→16997、后续quantity8→25994后仍恢复原v8回执；两连接同capture不同event只一次业务效果；p9/p10竞争一笔ACCEPTED、一笔REFUND_REQUIRED，退款指向落败支付；UNKNOWN工作跨新event保留原ID，退款work/outbox/结果回滚同成同败。
- [独立检查](ch45-independent-check-results.json)：8条只读命令通过，包括同源、真实SQLite作者合同、章节/全站结构与独立JS语法。另用整数/Decimal复算12处：8000/10999，180ms与120ms余量，热点100/s和3s占用/s，净消化300/s、120s、欠产能增长50/s，51.84GB/天及七天三份1.08864TB。没有把重复跑作者用例计为新断言。

SQL适配器的BEGIN IMMEDIATE串行化写者；Java候选事件也不是已发布事件。
不把本地唯一键、对象锁或内存模型包装成跨服务恰好一次。

## 来源抽核

抽核的主要结论与原文一致：Vernon的持久版本拒绝旧写、外部聚合按ID引用及
有理由的多聚合事务例外；本章把Order/Stock同库作为显式例外，未说成数据库定理。
参见[Vernon I](https://www.dddcommunity.org/wp-content/uploads/files/pdf_articles/Vernon_2011_1.pdf)
与[Vernon II](https://www.dddcommunity.org/wp-content/uploads/files/pdf_articles/Vernon_2011_2.pdf)。

Outbox与消费者身份跟业务更新同事务的边界，符合
[Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html)与
[Idempotent Consumer](https://microservices.io/patterns/communication-style/idempotent-consumer.html)。
PostgreSQL条件重评估、冲突快照与整笔中止重试按
[18 · Transaction Isolation](https://www.postgresql.org/docs/18/transaction-iso.html)核对，未以SQLite代证。

Stripe保存首响应/参数比较/至少24h后可裁剪已明确限定API v1，裁剪后可新执行；
v2不同，UNKNOWN不自动过期。[Stripe幂等原文](https://docs.stripe.com/api/idempotent_requests)
也明确该区分。[Webhook原文](https://docs.stripe.com/webhooks)支持验原始body、重复event、
不同event对象描述同一业务对象及不保证生成顺序。具体支持范围另存
[ch45-independent-sources.json](ch45-independent-sources.json)，所有容量数值仍是教学假设。

## 浏览与实际目视

[独立浏览器](ch45-independent-browser-results.json)采用真实320/390/1440×两主题×三语言18组合；
innerWidth=scrollWidth，展开details也通过；148次翻帧、4段逐字复制、键盘/播放、
倍速/循环、闪卡、进度与设置持久化通过，页面/资源错误0。
[20条手机补验](ch45-independent-mobile-results.json)覆盖390px D6/D7左右端与代码；
320px为真实viewport，未用CLI裁切充当手机。

37个SVG与批次原稿逐字相同，7组37帧/74个title、desc ID全保留。
独立采了改前/后各74张，但没有把生成数量当目视：实际打开原7组末帧×两主题14画面，
再打开D2 F5/F6、D4 F6、D5 F4/F5、D6 F4/F5、D7 F5×两主题16画面。
D2竞争根与D7保存/回程的通道可追踪，D6红线为禁止复活而非第二条成功提交；
没有发现需机械改几何的短线遮字、穿节点或过大框。

实际打开的图像和哈希见[ch45-independent-visual.json](ch45-independent-visual.json)，
包括390px四种代码与D6/D7左中右两主题。一次深色长代码截图出现Chrome绘制块状背景，
在同源码的稳定重绘截图中消失；没有据此修改页面或共享UI。
既有320px对照导航F04仍为共享基线问题，按计划留Q。

## 验证限制

未运行真实PostgreSQL、PSP验签/退款、Broker/Relay、故障网络、断电、跨节点恢复、
发布或生产压测/p99；CAS=0是明确的分支注入，后续关单恢复才是真实SQLite写入。
部分/多次capture、退款累计额度与真实远端未知结果查询不由本例实现。
本结论只覆盖所列源码、输入和视觉范围，不把作者自检或主代理模型名称当独立证据。
