# Ch44 一手来源与支持句

2026-10-24 重新用 web 打开核对。以下“支持句”是本章使用范围的转述，
不是长引文；教学数字与本地算法政策不作为产品事实。页面在对应机制旁引用。

| 页内编号 / 原始来源 | 具体支持句与范围 |
|---|---|
| [1] [Lewis / Fowler, Microservices](https://martinfowler.com/articles/microservices.html) (2014), Componentization / Business Capabilities | 服务可分别部署、按业务能力组织；变更跨服务接口仍有协调成本。没有据此声称任意拆分必然独立、按QPS拆分或数据量阈值。 |
| [2] [AWS Transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html), Intent / Issues / relational outbox | 业务库写入与消息通知有双写失败窗口；业务与outbox同本地事务保投递意图，重复投递仍需幂等消费者。仅支持该边界，未采纳页面中FIFO可“exactly once”泛称来证明外部业务效果。 |
| [3] [Consul Discover services](https://developer.hashicorp.com/consul/docs/discover), Introduction | 登记后catalog存地址及健康检查信息，可经DNS或发现查询找候选。图中的client-side直接RPC是本章选项，不宣称所有Consul数据面都同一形态。 |
| [4] [Consul Health API](https://developer.hashicorp.com/consul/api-docs/health), List Service Instances / passing | `passing`布尔默认false；设true只返回所有checks均passing的节点。2s/3次/1s/5s均为A5教学策略。 |
| [5] [gRPC Deadlines](https://grpc.io/docs/guides/deadlines/), Client / Server / Propagation | 默认未设置deadline；传播可扣已耗时，部分语言默认启用、部分需配置；服务应用负责停止自己派生的工作。800/700ms不是gRPC默认值。 |
| [6] [gRPC Cancellation](https://grpc.io/docs/guides/cancellation/), Client cancellation | 库通常不能强行中断应用handler；长任务须协作检查取消，传播有语言差异。未由取消推出业务回滚或远端工作已结束。 |
| [7] [Stripe Idempotent requests](https://docs.stripe.com/api/idempotent_requests), API v1 paragraphs | 当前文档区分v1/v2：v1保存执行开始后的首次状态/响应（包括500），同键参数不符拒绝；至少24h后可清理，清理后复用会新执行；v2恢复失败/部分失败语义不同。页面严格限定v1的参数比较与首响应事实；本章7天+永久K映射非Stripe承诺。 |
| [8] [PostgreSQL18 Constraints](https://www.postgresql.org/docs/18/ddl-constraints.html), Unique / NOT NULL | 组合唯一约束覆盖同一组合值；身份列显式NOT NULL避免NULL唯一语义漏洞。 |
| [8] [PostgreSQL18 Transaction isolation](https://www.postgresql.org/docs/18/transaction-iso.html#XACT-READ-COMMITTED), Read Committed | 每条语句新快照；ON CONFLICT DO NOTHING可因另一事务结果而不插入，即便该结果不在INSERT快照中。随后新SELECT能看已提交结果。本章映射不删除，DB/锁等待另有死线；未执行真实PG实例。 |
| [8] [PostgreSQL18 CREATE TABLE](https://www.postgresql.org/docs/18/sql-createtable.html), DEFERRABLE / INITIALLY DEFERRED | 可把外键检查延到事务结束，允许先写意图映射、后写订单但同事务提交。示例只标延迟FK，不把唯一K约束改成延迟约束。 |
| [9] [W3C Trace Context](https://www.w3.org/TR/trace-context/), 2021 Recommendation / traceparent | traceparent带trace-id与parent-id用于跨进程关联。每attempt独立span与业务K、权限边界是本章设计，不由trace字段提供幂等或鉴权。 |
| [10] [Fowler Strangler Fig](https://martinfowler.com/bliki/StranglerFigApplication.html), 2024-08-22 | 以渐进功能替代和过渡架构降低整体替换风险。未据此声称切Gateway路由完成数据迁移。 |
| [11] [OWASP API1:2023](https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/), Prevention | 每个使用客户端对象ID访问记录的函数都需判断当前主体对该对象动作的权限。身份合法/K已知/trace_id存在不能替代它。 |
| [12] [AWS REL05-BP03](https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_mitigate_interaction_failure_limit_retries.html), anti-patterns / steps | 限重试数、退避与jitter；多层重试复合放大，应选一个层级；非幂等和永久错不盲重试。3⁵=243及200+20=220为本章算术。旧reliability-pillar URL已改成核实的framework URL。 |
| [13] [AWS Circuit breaker](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/circuit-breaker.html), Motivation / Multithreaded / architecture | 持续失败时停止转发并探测恢复；并发拒绝不应无休止推迟同一OPEN到期。连续3次、1秒、单进程1探针、票据代次为本地教学算法，未宣称AWS实现参数。 |
| [14] [RFC9110 §§15.3.2–15.3.3](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.3.2) | 201表示请求创建了资源；202表示已接受但处理未完成并可提供状态监视信息。持久ACCEPTED订单与付款/拒绝状态是本章业务合同，不是HTTP资金保证。 |

正文中的容量推导另由作者本地复算，结果记录于 `ch44-check-results.json`。
来源只能支持其具体机制，不能替代生产压测、真实远端幂等或跨服务故障演练。
