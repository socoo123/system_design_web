# Ch10 / Ch11 / Ch12 本批整合验收

用户授权“重构下一波，用3个agent”，按 PLAN §7 处理 Ch10 通知系统、Ch11 新闻 Feed、Ch12 聊天系统。三位子 agent 派发均明确设置 `model: "gpt-6.1-sol"`、`reasoning_effort: "max"`。**2026-10-23已完成实施、交叉独立复核与主代理验收；本批审阅范围无未关闭P0/P1或阻碍阅读P2。**

## 范围与基线

[授权前基线](ch10-ch11-ch12-baseline.json)记录 5,349 个既有文件的工作区哈希、未提交状态和三章动画清单；[原始 HTML](ch10-ch11-ch12-baseline/)保留用于逐帧对比。Ch10 为 6 组 31 帧、Ch11 为 6 组 32 帧、Ch12 为 6 组 30 帧，共 18 组 93 帧。Ch10 原有两段为 HTTP/数据模型展示，Ch11 / Ch12 原无代码块。

三位作者各写一章，再交叉只读复核：Ch11 作者复核 Ch10，Ch12 作者复核 Ch11，Ch10 作者复核 Ch12；修复回到原作者，主代理维护共享文件与最终验收。修改范围限三章、专属示例/图和本批审查证据；不修改其他章节及共享 UI，不提交、推送或部署。

## 实施结果

| 章节 | 内容与关键实现 | 详细记录 |
|---|---|---|
| Ch10 通知系统 | 接受事务与持久幂等；端点领取代次、发送与结果事务；未知接受证据、渠道退避与补偿扫描；6段代码，其中4段新增关键实现 | [作者](ch10.md) / [独立复核](ch10-independent-review.md) |
| Ch11 新闻 Feed | 发布/relay、持久输出后检查点、完整来源集和固定视图；Java有界归并读页；缓存服务端安装截止与固定TTL；5段同源代码 | [作者](ch11.md) / [独立复核](ch11-independent-review.md) |
| Ch12 聊天系统 | 会话行锁与提交序号、消息/回执/outbox事务；本地连续前缀；各设备回执与用户Read；持久路由epoch；5段同源代码 | [作者](ch12.md) / [独立复核](ch12-independent-review.md) |

三章中文主线删去重复解释，完整假设移入可展开区域，关键算式、前提与反例保留在机制旁；英文、图注与统一网格闪卡同步。没有增补重复总图或D2，原18组93帧保持。三章16段代码，其中15段从专属文件逐字同步/检查，1段HTTP数据例保留在页面内；全站由36段增加至50段，净增14段关键实现/约束。统计不作为代码质量或篇幅配额。

## 主代理独立预审

[算术与反例记录](ch10-ch11-ch12-numeric-review.json)复算投递扇出、积压排空、Feed 写放大/回源预算及聊天连接/恢复预算。Ch12 正常 30 台每台计划 60,000 连接；失去一台后为原始 100,000 上限的约 62.07%，若仍要求 60% 则需 31 台。数值容量与实际握手、补齐能力分别讨论。

主代理独立抽核 [PostgreSQL 18 事务隔离](https://www.postgresql.org/docs/18/transaction-iso.html)、[sequence](https://www.postgresql.org/docs/18/functions-sequence.html)、[行比较](https://www.postgresql.org/docs/18/functions-comparisons.html)、[RFC 6455](https://www.rfc-editor.org/rfc/rfc6455.html)、[FCM 错误码](https://firebase.google.com/docs/cloud-messaging/error-codes)、[FCM 发送与重试建议](https://firebase.google.com/docs/cloud-messaging/scale-fcm)和[APNs设备推送响应](https://developer.apple.com/documentation/usernotifications/handling-notification-responses-from-apns)。重点对应sequence不能充当无洞提交序号、tuple游标条件、应用ACK边界，以及渠道特定的超时/退避。APNs设备推送响应与broadcast错误文档的路径不同，已提醒作者纠正引用。更细的事实与来源对应见各章记录。

预审与返修重点：

- Ch10补偿扫描原先直接比较可能为NULL的`last_woken_at`，会漏掉首次到期任务。模型改为NOT NULL默认数据库时间，接受路径显式初始化。[独立SQL反例](ch10-ch11-ch12-code-probes.py)与[结果](ch10-ch11-ch12-root-probes.json)实际验证NULL比较漏选、非空初始化命中及显式NULL被拒绝；这是SQLite谓词/约束适配验证，不是PG行锁或队列故障实验。
- Ch10旧worker只能更新自己的Attempt，不能覆盖新领取代次的调度状态；failed/expired之后的迟到accepted仍作为独立已知证据展示，不重开调度。APNs失效需检查被尝试的登记版本及时间，无法可靠比较时转登记核查，避免盲删新登记。
- Ch12 Receipt svc保留为独立服务，Receipt Store明确为conversation/member同库同权威分区的逻辑表组；成员检查、序号边界与回执更新的同事务要求没有假装跨库执行。
- Ch11独立复核发现D5F5图注把所有不足20条的短页都称为partial，代码本来正确。已窄修双语图注，明确预算耗尽且还有候选才标partial；确认来源耗尽允许正常短页。SVG与代码未改，最终图注由复核者独立复验。

## 独立复核与返修

复核阶段处理1项P1与3项P2（D1/D2入口标签按同类问题家族计）；预审与实施纠错另见上文及作者记录。

| 问题 | 修复与复验 |
|---|---|
| Ch10 · P1，FCM普通可重试失败缺10s下界 | 原FCM500无header可落到普通SMS的0–1s重试。源码明确FCM所有retryable failure至少failure后10s，429再叠加Retry-After/无header60s与整体/topic配额下界；OTP剩余不足就过期。作者补4例，独立复核38项probe含216个实际纯plan输入组合通过，关闭。 |
| Ch10 · P2家族，入口标签穿事务边界 | 主代理实际看到D2的202+id穿过x128边界，并[测得](ch10-ch11-ch12-label-probe.json)右沿133.478；复核者逐帧再发现D1同类问题。D1/D2全部11帧入口标签中心统一至94，线路/节点保持；[修后测量](ch10-ch11-ch12-label-probe-after.json)最小间距分别18.0399/10.5217，全部帧两主题与390左右中视图目视复验关闭。 |
| Ch11 · P2，partial图注遗漏来源未耗尽条件 | 作者仅改D5F5中英图注，SVG/代码不动。独立JDK17分别复验“来源耗尽正常短页”和“100/101删除候选预算耗尽partial页”，并在最终hash做图注浏览器复查，关闭。 |
| Ch12 · P2，旧seq修订应用与变更发现范围 | cursor108后106变rev2，seq>108不会发现106。中英正文/README明确模型只应用已收到修订，完整传播另需新日志位置的控制事件或独立change cursor，本例未实现。30帧SVG、5段代码与算法不动；作者18组合定点复验通过，独立JDK17复现“不会自行发现”与“收到后正确应用”并核对最终说明，关闭。 |

独立证据包括：Ch10正常接受→领取→started→供应商接受→结果提交→ACK、旧代次/外部未知重复/终态迟到接受/首次补偿等；Ch11真实JDK17种子11311的200组来源、1,496次分页排序oracle，27项协议/SQL/数字检查及输出后检查点的真实双SQLite崩溃反例；Ch12最终30项独立SQLite/协议检查、8项独立JDK17前缀/修订边界probe，以及指定组两主题全帧和390左右中阅读位置。各复核记录说明自己实际执行的范围，未将作者报告当成独立证据。

## 验证、视觉与范围

[主代理浏览器脚本](ch10-ch11-ch12-browser.mjs)与[最终结果](ch10-ch11-ch12-browser-results.json)覆盖三章×320/390/768/1440×两主题×zh/en/both，72个不同真实浏览器组合全部通过。记录实际innerWidth/scrollWidth，不用CLI裁切图冒充手机。390/1440对照模式两主题共372次翻帧；16段代码复制、键盘/自动播放、倍速/循环、统一网格闪卡、语言/主题和已读持久化通过，无页面/资源错误。返修只重验受影响章，汇总结果每章保留24个不同组合。

主代理使用真实JDK17.0.10编译执行FeedPageTest的16项与ChatContracts的15项，代码本体在文字P2返修中保持；Ch10是伪代码/SQL，没有编造Java执行结果。[代码执行与15份文件同源](ch10-ch11-ch12-code-results.json)、[最终11项静态检查](ch10-ch11-ch12-checks.txt)及[证据一致性](ch10-ch11-ch12-evidence-consistency.json)全部通过，三章页面hash、浏览器、代码源与检查记录一致。全站45章/276组/1,411帧/50代码块，剩3条既有迁移提示来自本批之外；三章audit没有迁移提示。

主代理实际目视Ch10浅色D2、深色D1/D3终帧及390浅色发送代码，Ch11浅色D2、深色D5终帧与390浅色代码，Ch12浅色D1、深色D6终帧与390深色代码。Ch10入口标签[改前](screenshots/ch10-ch11-ch12-root/ch10-parchment-deck2-last-before-label-fix.png)与[改后](screenshots/ch10-ch11-ch12-root/ch10-parchment-deck2-last.png)有保留。布局组合与几何统计不替代目视检查；作者全部帧及独立复核受影响组的逐帧证据分别保留。

[范围检查](ch10-ch11-ch12-scope.mjs)与[结果](ch10-ch11-ch12-scope-results.json)对照授权前5,349文件哈希。仅PLAN、三章、专属示例/局部图源及本批证据变化，其他42章、共享CSS/JS、首页、工具和既有文档资源保持基线，无越界新增/删除。93帧ID/组序保持；Ch10的D1–D3共16帧局部变化，Ch11为11帧、Ch12为10帧，其余56帧SVG逐字节不变。

## 最终源码与限制

- Ch10：`fd8d0fd98baeb5aae540f47b3cbb4e00cab29dce4d9a57de8a3c8d9863e1a45f`
- Ch11：`8ad7f22ec98006fd51731ddbfdf88c57ec6f4e575236567c49fbbd6a0a9b4258`
- Ch12：`58da6191abc8c56750711fe3b45932e641a4c136eb5cca2b17e0c870fe376428`

没有运行真实PG/Kafka/Graph/缓存lease或共识集群，没有生产压测、网络/切主/磁盘掉电/时钟故障注入。SQLite采用writer序列化/适配时间类型，不能证明PG行锁；Java验证所列纯内核，不能实现供应商幂等、变更发现、认证或复制耐久保证。A5存储、缓存端硬截止、完整粉丝快照、回调认证等前提仍需对应实际服务实现。

共享UI的两项既有表现继续记录：320px对照品牌会竖向换行但控件可达；大图滚到右侧会将同一slide内图注一起移走，滚回可读。本批未扩大公共UI修改范围。

PLAN已更新至C阶段9/42，三章任务锁已清除。未提交、推送或部署，不自动推进下一批。
