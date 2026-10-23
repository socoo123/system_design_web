# Ch10 独立复核 · 一手来源准备

日期：2026-10-23。准备人：`ch11_author`，GPT-6.1-Sol (`gpt-6.1-sol`) / Max。只读资料准备；Ch10作者尚在自检，本文没有将任何未冻结HTML当最终版本审阅，也不构成章节通过/不通过结论。没有改站点、作者源码、PLAN或共享文件，未派子agent。

## FCM：429与Retry-After

| 一手来源 | 支持的具体结论 | 不支持的推广 |
|---|---|---|
| [FCM Error Codes](https://firebase.google.com/docs/cloud-messaging/error-codes)，HTTP v1表的QUOTA_EXCEEDED / UNAVAILABLE | 429可由消息/设备/主题配额触发；全局消息和主题限额明确要求指数退避且初始至少1分钟。503若带Retry-After必须尊重。需读details区分配额范围 | 不能把所有429当同一种quota；不能只重试单条却不限制对应项目/设备/主题的总体发送率 |
| [FCM规模发送指南](https://firebase.google.com/docs/cloud-messaging/scale-fcm)，Handling retries → Errors / Exponential backoff | 429先等Retry-After；没有header默认60秒。该指南建议send超时至少10秒、失败重试间隔至少10秒，并用指数退避与jitter、及时丢弃已失效请求 | 不支持每种供应商错误都套本地1秒退避；jitter不能把供应商规定的最早重试时间提前。指南建议与协议强制语义需区分 |
| [RFC9110 §10.2.3 Retry-After](https://www.rfc-editor.org/rfc/rfc9110.html#name-retry-after) | HTTP通用Retry-After可表达为delay-seconds或HTTP-date。解析/时钟预算应由适配器明确 | 只解析一个整数不能宣称实现了通用HTTP Retry-After。若本章限定供应商提供整数格式，要明确适用范围 |

资料准备时FCM页面标注更新日期为2026-10-22 UTC。本章应写自己的版本/读取日期，不借用旧快照。

## APNs：正确的直接设备推送响应

设备推送依据：[Handling notification responses from APNs](https://developer.apple.com/documentation/usernotifications/handling-notification-responses-from-apns)。网页依赖JavaScript，web工具只见入口；官方Markdown成功读取：[同页Markdown](https://developer.apple.com/tutorials/data/documentation/usernotifications/handling-notification-responses-from-apns.md)。读取内容SHA256：`543cf17f4bc6a5168be11259af1b795c5de167b56cad6c13b7b5e962aaf4cac5`。

- 每个POST有响应；成功200的body为空，失败JSON有reason。timestamp只在410中出现，单位为Epoch毫秒，含义是APNs确认该token对该topic无效的时间。
- 410涉及设备token/topic；不能把timestamp当本次请求时间，更不能据一个旧attempt响应无条件删掉新注册token。后者是需结合本章存储条件验证的推论，非Apple给定SQL。
- 当前页要求5XX在15分钟后重试并可退避。429需区分TooManyRequests与TooManyProviderTokenUpdates；后者涉及提供者认证token轮换频率（不要短于20分钟），不是同一个设备发送频率故障。
- 该页列出BadDeviceToken、DeviceTokenNotForTopic、Forbidden、ExpiredToken、Unregistered、PayloadTooLarge等不应原样盲重试的reason；认证/参数错误应修复后处理。

不要误用：[Handling error responses from Apple Push Notification service](https://developer.apple.com/documentation/usernotifications/handling-error-responses-from-apns)。已独立读取其[官方Markdown](https://developer.apple.com/tutorials/data/documentation/usernotifications/handling-error-responses-from-apns.md)，其表包含BadChannelId、MissingChannelId、FeatureNotEnabled和broadcast说明；不是上面的直接设备token响应表，不能拿它支持410 timestamp契约。该页内容SHA256：`cf49c75a5cd0746292bb16a126152137fec512d5be5d661767bc8cda9f0756ec`。

补充：[Sending notification requests to APNs](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns)，[官方Markdown](https://developer.apple.com/tutorials/data/documentation/usernotifications/sending-notification-requests-to-apns.md)。apns-id用于标识/追踪；apns-collapse-id用于合并用户通知，长度≤64字节。两者均不能直接推出任意外部发送副作用端到端exactly-once。后一结论是保证范围推论，需要看产品/任务契约，不能声称Apple文档提供通用事务去重。

## 供应商接受、设备接收、展示与已读

[FCM Understanding message delivery](https://firebase.google.com/docs/cloud-messaging/understand-delivery)在Message delivery reports与BigQuery events中分别定义：Sends是入队或交给APNs；MESSAGE_ACCEPTED是FCM收到有效请求；MESSAGE_DELIVERED是到达设备FCM SDK。Received、Impressions、Opens各有平台/消息类型/前后台限制，数据有延迟。

据此可支持“供应商接受不等于设备收到，更不等于用户已读”。不能从accepted_at、provider_message_id或发送接口200直接写read_at；客户端回执也只能证明其约定动作，不能宣称人实际阅读。此为需对照最终状态模型的推论。FCM report的Open是通知打开事件，不是任意渠道的可靠业务已读证明。

## PostgreSQL：唯一冲突与新事务回读

| 一手来源 | 支持的具体结论 | 待对照代码的关键点 |
|---|---|---|
| [PostgreSQL 18 INSERT](https://www.postgresql.org/docs/18/sql-insert.html) | 唯一索引可使并发INSERT等待/冲突；ON CONFLICT提供替代行为，DO UPDATE保证原子插入或更新 | 幂等唯一键需覆盖业务作用域；本地Set/先查后插不裁决多实例并发。任何unique冲突都当“同意图成功”也不成立 |
| [Transaction isolation §13.2.1](https://www.postgresql.org/docs/18/transaction-iso.html) | READ COMMITTED的每条SELECT取语句开始时已提交快照；DO NOTHING可因当前语句快照不可见的并发事务而未插入 | 同一个CTE中INSERT DO NOTHING后SELECT可能仍找不到winner；要用新语句，在主库读取已提交胜者。REPEATABLE READ不能直接套用新语句刷新快照 |
| [Message Flow §54.2.2.1](https://www.postgresql.org/docs/18/protocol-flow.html) | 语句错误可留下failed transaction；需要另发ROLLBACK恢复可用，不能以同串后续ROLLBACK必执行为前提 | 普通唯一异常后先ROLLBACK，使用新的有效事务/语句回读；不要在aborted事务里查询幂等响应 |
| [Serialization Failure Handling §13.5](https://www.postgresql.org/docs/18/mvcc-serialization-failure-handling.html) | 23505在某些竞争可重试，也可能是永久业务冲突；需要重试完整事务逻辑 | 不能把所有23505永久吞掉；同key不同payload应冲突，其他唯一约束错误不能伪装幂等命中 |
| [Transactions §3.4](https://www.postgresql.org/docs/18/tutorial-transactions.html) | 同库事务对多个本地步骤提供all-or-nothing，未提交中间状态不对其他事务可见 | 任务、幂等回执、outbox哪些实际同事务应明确；本地提交不能覆盖外部供应商副作用 |

## 至少一次与外部结果未知窗口

[Kafka 4.1 Design / Message Delivery Semantics](https://kafka.apache.org/41/design/design/#message-delivery-semantics)区分Kafka内offset/topic事务与外部输出：外部目标需要协作。不能因开启Kafka事务或先写本地dedup行就宣称APNs/FCM/SMS端到端exactly-once。

[Transactional outbox原模式](https://microservices.io/patterns/data/transactional-outbox.html)支持同库业务变化+待发事件、独立relay；发送后尚未标记时崩溃会重复发布，消费者仍需幂等。它没有把“渠道已接受但本地尚未持久记录”窗口消除。

需在冻结版本独立重走的反例（当前不是对未冻结实现的缺陷判断）：

1. 供应商已接受，成功响应丢失；或worker收到成功后、持久accepted前崩溃。本地仍pending/unknown，再发可能重复；先标成功又可能漏发。若渠道没有可查询/幂等请求契约，应明确选重复风险还是漏发风险。
2. 执行租约过期，旧worker仍在供应商调用中。任务行generation/fence可拒绝旧worker回写，但不能撤销外部已发生发送；新worker重试仍可能双发。
3. 已明确accepted且持久化后，重复队列消息不应重发；user-read状态不得凭accepted推进。
4. Retry-After大于剩余业务TTL：应过期/终止或等待，不应为了“在TTL内送达”提前违反渠道限流下界。

## 资料读取与当前边界

网络读取均为只读。一手站点为Firebase、Apple、PostgreSQL、Kafka与outbox原作者；未使用二手博客论断。Apple Markdown由其页面官方入口指向，web读取工具不支持text/markdown，因此改用Python urllib读取相同官方URL，未执行站外脚本。没有运行供应商发送/数据库竞争或修改作者文件。

最终章节复核尚未开始，等待主代理提供Ch10作者ready与最终HTML SHA；届时再复算容量、逐段对照图/代码/双语/闪卡和实际验证记录。

## 正式复核补充核对（2026-10-23）

在最终章级复核阶段另独立浏览并核对：

- [RFC5321 §4.2.5 / §6.1](https://www.rfc-editor.org/rfc/rfc5321.html)：DATA结束后的正响应转移投递/报告责任；§4.5.3.2.6与§6.1也明确超时可导致重复。SMTP接手不等于用户已读。
- [RFC8058 §§3–4](https://www.rfc-editor.org/rfc/rfc8058.html)：一键退订HTTPS POST不得携cookie/HTTP认证或重定向；两个List-Unsubscribe头须在有效DKIM签名的h=中，缺失时邮箱不应提供一键退订。
- [RFC6376 §3.5](https://www.rfc-editor.org/rfc/rfc6376.html)：DKIM-Signature h=为签名覆盖的头字段列表。它不认证公开退订POST；入口另校验窄范围能力令牌。
- [The Tail at Scale作者PDF](https://www.barroso.org/publications/TheTailAtScale.pdf)：1%单机长尾在100路同步扇出约63%；按独立性1−0.99^100计算仅为例子，不能预测本章三个供应商。
- [FCM Message types](https://firebase.google.com/docs/cloud-messaging/customize-messages/set-message-type)：后台notification展示由SDK处理，data消息由应用处理，因此应用端先去重再展示的能力有范围。
- [PostgreSQL18 SELECT](https://www.postgresql.org/docs/18/sql-select.html)：SKIP LOCKED会给不一致的跳锁视图，适合多消费者队列表，不是普通一致读取承诺。
- [AWS transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)：业务状态和outbox同事务；relay仍可能重复，需要幂等消费。不是数据库与供应商端到端原子事务。
- [FCM HTTPv1 send](https://firebase.google.com/docs/cloud-messaging/send/v1-api)：短期OAuth2 bearer、成功响应JSON name；该name不证明设备展示或用户阅读。

复核中独立发现并报告FCM失败重试最短10秒条件遗漏，作者随后把该下界落到plan显式分支；“建议”准确归属Firebase规模指南，而非泛化成每种供应商协议硬编码规则。独立复验和问题闭环见最终review。
