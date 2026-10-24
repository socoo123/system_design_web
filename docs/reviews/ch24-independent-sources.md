# Ch24 独立来源抽核

2026-10-23，独立复核者重新实际打开下列一手资料，未以作者来源表代替核验。以下为具体支持范围，不引用厂商契约证明自建实现已具备分布式保证。

| 来源 | 独立核对结论 |
|---|---|
| [Stripe API idempotency](https://docs.stripe.com/api/idempotent_requests) | 当前页明确区分v1/v2；v1执行开始后保存第一次status/body，含500；至少24h后可清理，参数变化拒绝。v2不是相同重放语义。章节限定API v1正确。 |
| [Stripe error handling](https://docs.stripe.com/error-low-level) | 原请求后前24h同键/参数恢复，超窗未知停止重放并查询/核实；500可已经产生副作用，v1缓存500不会因再次请求自动变成确定成功。章节保留UNKNOWN、禁止换key/渠道逃逸符合该范围。 |
| [Stripe API v2](https://docs.stripe.com/api-v2-overview#idempotency) | v2同API/account或sandbox/30天条件下，可能重新执行未完成工作并给更新响应。章节没有把v1的24h/首响应缓存套给v2。该页仅用来验证版本差异，不把v2作为本章付款接口实现。 |
| [Stripe webhooks](https://docs.stripe.com/webhooks) | 官方要求原始body验签，允许异步处理，事件可重复/乱序，两个Event可描述相同对象。durable inbox后ACK和financial-effect gate是本章自己的设计；fixture verified=True没有实际验签能力。 |
| [Stripe refunds](https://docs.stripe.com/refunds) | 一次charge可多次部分退款但总额不能超过原额；pending/failed状态与资金不足相关。本地reserved/UNKNOWN规则为本章的并发控制设计，不是PSP替本地保留额度。 |
| [Stripe currencies](https://docs.stripe.com/currencies) | amount按minor unit，JPY为零小数；HUF/TWD等对不同操作有特例。章节CNY100.00→10000/JPY100→100与“不经float”的本地实现要求一致。 |
| [PG18 constraints](https://www.postgresql.org/docs/18/ddl-constraints.html) | 非空/唯一适用于身份；普通CHECK不能依赖其他行保证跨分录SUM。本次实际raw-DML负例也显示示例schema不能独立保证完整账，正文已明确受控Posting/权限前提。 |
| [PG18 WAL](https://www.postgresql.org/docs/18/runtime-config-wal.html) | 配置同步standby时，on等待对应standby flush；remote_write不足以保证standby OS崩溃耐久，remote_apply另等apply。正文没有把“三份副本”或“耐久”等同“立即可查询”。 |
| [TigerBeetle accounting](https://docs.tigerbeetle.com/coding/financial-accounting/) | 固定平台视角，资产/费用借增、负债贷增；capture借PSP应收贷商户应付，未结算退款反向合理。费用例子是另行分录，不把商户款当收入。未引入/推荐该数据库。 |
| [Adyen settlement report](https://docs.adyen.com/reporting/settlement-reconciliation/transaction-level/settlement-details-report/) | 报告面向已结算/出款的交易与费用，账户/批次/时区是范围条件；不是某日全部受理请求的最终全集。正文保留报告完整性、修订和匹配cutoff，并将W定义为可重现数据集正确。 |
| [AWS outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html) | 本库状态与消息意图同事务关闭双写窗口，重复投递仍需消费幂等。章节未将PSP或订单跨库副作用包进本地TX。 |

文档核验和本地SQLite反例，不等于验证真实渠道验签、API运行环境/保留窗、运输/时钟上界、PostgreSQL复制/权限配置、支付合规、实际会计落地或生产资金操作。没有发起真实资金请求。
