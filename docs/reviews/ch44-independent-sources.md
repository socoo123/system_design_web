# Ch44 独立来源抽核（2026-10-24）

本记录来自复核者再次访问原始来源；不沿用作者的来源结论。以下为支持范围的转述。教学数字、具体状态机与自建事务协议仍是本章设计。

| 页内引用 | 独立读取位置 | 支持的具体说法与边界 |
|---|---|---|
| 1 | [Lewis/Fowler · Microservices](https://martinfowler.com/articles/microservices.html)，定义及Business Capabilities | 独立部署、业务能力边界；不推出某个QPS阈值必须拆服务 |
| 2 | [AWS Transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)，Intent / Issues | 同数据库事务保存业务与投递意图弥补双写窗口；仍可能重复消息，需要消费者幂等 |
| 3 | [Consul Discover](https://developer.hashicorp.com/consul/docs/discover)，Introduction | 目录保存实例地址与健康检查信息；本文Caller直连是所选数据面，不声称注册表代理RPC |
| 4 | [Consul Health HTTP API](https://developer.hashicorp.com/consul/api-docs/health)，List Service Instances参数 | passing为bool且默认false，true筛只含所有检查passing的节点；不保证下一次请求健康 |
| 5 | [gRPC Deadlines](https://grpc.io/docs/guides/deadlines/)，Client / Server / Propagation | 默认不设deadline，传播用扣已耗时的timeout，应用负责停止派生工作；不保证硬实时结束 |
| 6 | [gRPC Cancellation](https://grpc.io/docs/guides/cancellation/)，Overview / handler协调 | 取消通知表达不再等待，应用handler须配合停止；不证明业务效果回滚 |
| 7 | [Stripe Idempotent requests](https://docs.stripe.com/api/idempotent_requests)，API v1/v2条款 | v1保存执行开始后的首响应与参数比较，原键裁剪后可重执行；v2重试处理语义不同，不支持本章7天+永久K政策 |
| 8 | [PostgreSQL18 Constraints](https://www.postgresql.org/docs/18/ddl-constraints.html)与[READ COMMITTED](https://www.postgresql.org/docs/18/transaction-iso.html#XACT-READ-COMMITTED) | 唯一/复合键、NOT NULL；READ COMMITTED的DO NOTHING可受本INSERT快照未见竞争影响，后续语句取得新快照；测试运行的是SQLite，不冒充PG |
| 9 | [W3C Trace Context](https://www.w3.org/TR/trace-context/)，§3.2 / §4.3 | traceparent含trace-id/parent-id等字段，出站更新parent-id；业务K与attempt_id是另设身份 |
| 10 | [Fowler Strangler Fig](https://martinfowler.com/bliki/StranglerFigApplication.html)，2024更新正文 | 逐步替代遗留能力；不证明数据库所有权切流或回滚容量 |
| 11 | [OWASP API1:2023](https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/)，How to Prevent | 使用客户端对象ID访问记录的每个函数都应核对象权限；幂等K不是授权凭证 |
| 12 | [AWS REL05-BP03](https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_mitigate_interaction_failure_limit_retries.html)，Anti-patterns / guidance | 限重试、退避+jitter，多层重试放大，因此选择一个重试层；20窗口是本章额度 |
| 13 | [AWS Circuit breaker](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/circuit-breaker.html)，Intent / Implementation | 失败后阻断、后续恢复判断的模式；本文3次/1秒/本地epoch与一个probe不是AWS提供的固定参数 |
| 14 | [RFC9110 §§15.3.2–15.3.3](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.3.2) | 201创建资源，202接受但处理未完；持久ACCEPTED订单与PAID不同由业务合同明确 |
