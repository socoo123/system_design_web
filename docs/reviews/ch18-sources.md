# Ch18 · 一手来源核验

2026-10-23 实际联网打开官方页面并搜索具体语义。以下是来源支持的范围；本章QPS、时间、保留和容量数字均是教学假设，不来自这些产品的压测。

| 引用 | 一手来源 | 支持的具体声明与边界 |
|---|---|---|
| [1] | [PostgreSQL 18 Transaction Isolation](https://www.postgresql.org/docs/18/transaction-iso.html) §13.2.1 | Read Committed已定位行遇并发UPDATE时等候，提交后对新版本重新检查WHERE；ON CONFLICT DO NOTHING可能因原语句快照看不见的并发提交不插入，因此后续新语句回读。不是任意跨行规则自动串行化。 |
| [2] | [PostgreSQL 18 Constraints](https://www.postgresql.org/docs/18/ddl-constraints.html) §5.5.2–5.5.3 | UNIQUE约束列组合；默认NULL彼此相异，因此本章身份列需非空。唯一约束本身不保证应用副作用已经完成，必须与回执/义务同事务。 |
| [3] | [Stripe Idempotent requests](https://docs.stripe.com/api/idempotent_requests) | 现文档明确区分API v1/v2。API v1在端点执行开始后保存第一份状态码/响应（含500）、比较重试参数、键至少24小时后可清理；验证/并发冲突且未开始执行的请求不保存该结果。正文与D4图注改为限定v1，未把24小时当订单寿命，也未把v1重放套到v2。 |
| [4] | [Stripe Webhooks](https://docs.stripe.com/webhooks) Event ordering / Handle duplicate events / Verify webhook signatures | 可能重复且不保证顺序；重复事件有事件ID，另一个Event也可能代表同对象/类型；官方库要求原始body、signature header与端点secret验证并含时间戳防重放。完整持久inbox再2xx是本章接收设计，不是Stripe替商户提供的事务。 |
| [5] | [Stripe Advanced error handling](https://docs.stripe.com/error-low-level) Network errors / Server errors | 网络恢复不说明原请求是否成功；500结果也可能含副作用，未解决原结果不换新键；v1缓存500重放。正文2秒/5秒/15分钟只是等待和业务预算；未知首次对象超保留窗转对账是本章选择。 |
| [6] | [AWS Transactional outbox pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html) | 同事务业务写与outbox避免数据库/通知双写漏发；事务回滚不发事件；消费者需处理重复。正文进一步明确broker ACK后才sent，消费inbox+Job同事务；不声称外部发货exactly-once。 |
| [7] | [Azure Compensating Transaction pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction) | 补偿须考虑并发变化，不能恢复旧快照覆盖新工作；补偿也可能失败，需可恢复且幂等。RefundDue按capture持久、未知结果查原操作是本章责任模型，不证明退款已到账。 |
| [8] | [PostgreSQL 18 Explicit Locking](https://www.postgresql.org/docs/18/explicit-locking.html) §13.3.4 | 多对象一致锁序可避免典型死锁；被死锁中止的事务需整体重试。正文先订单、再本单预留、再排序SKU库存为本章统一访问协议，须所有写路径遵守，不涵盖未知旁路写者。 |

适配层的“服务端专用不可变attempt标记、owner、配置账户/环境、金额/币种通过才绑定一次对象”是本章依赖契约，不能从Webhook签名独自推出。真实渠道集成必须核对所用API/SDK及字段可修改权限；本地模型只模拟可信边界输入，没有调用Stripe或执行签名算法。
