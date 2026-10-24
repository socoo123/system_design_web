# Ch24 一手资料核验 · 2026-10-23

均通过实际浏览工具重新打开，不沿用原章“2026-10-06 已核验”的结论。

| 来源 | 本轮核对与用途 |
|---|---|
| [Stripe Idempotent requests](https://docs.stripe.com/api/idempotent_requests) | 当前文档明确区分API v1/v2。v1在endpoint开始执行后保留首个status/body，包括500；同键参数比较；至少24h后可清理键。验证/并发冲突在未开始执行时不缓存。正文限定v1，没有将该窗口外推至v2。 |
| [Stripe Advanced error handling](https://docs.stripe.com/error-low-level) | 当前指导：API v1在首个请求后前24h内同键同参数重试，窗口结束仍未知则停止并核实；500为indeterminate，新键不能绕过原未知结果；v2 replay与30天窗不同。 |
| [Stripe Webhooks](https://docs.stripe.com/webhooks) | raw body与服务端endpoint secret验签；尽快2xx、异步；交付可能重复，两个Event也可描述同对象；不保证事件顺序，created秒级不能排序。durable inbox和业务Posting门是本章设计推导。 |
| [Stripe Currencies](https://docs.stripe.com/currencies) | API金额用minor unit；JPY零小数；ISK/HUF/TWD等操作特例说明不能所有币种机械乘100。 |
| [Stripe Refunds](https://docs.stripe.com/refunds) | 可多次部分退款，总额不超原charge；退款可能pending/failed。预留与聚合锁是本地设计，非声称提供商替我方跨库原子。 |
| [PostgreSQL18 Constraints](https://www.postgresql.org/docs/18/ddl-constraints.html) | 非空和唯一；普通CHECK不支持依赖其他行，不能用行CHECK宣称跨分录SUM永远平。实际可执行例为SQLite，另外显式验证其TEXT主键必须NOT NULL。 |
| [Adyen Settlement details report](https://docs.adyen.com/reporting/settlement-reconciliation/transaction-level/settlement-details-report/) | 旧reconciliation路径访问失败，改当前官方reporting路径；报告涵盖已结算/出款交易与费用，按账户/批次及指定报告生成方式，不是当天全部受理请求最终清单。文档提供gross/net currency与modification reference，支持按动作对象区分。 |
| [AWS Transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html) | 状态/消息意图本地同事务关闭双写窗口；消息仍可重复，消费者要幂等。未将渠道资金动作说成本地事务的一部分。 |
| [TigerBeetle Financial accounting](https://docs.tigerbeetle.com/coding/financial-accounting/) | 固定平台视角：资产/费用借增，负债贷增。借贷平衡必要但不证明业务来源/金额正确；没有引入该数据库或推荐购买。 |
| [PostgreSQL18 WAL configuration](https://www.postgresql.org/docs/18/runtime-config-wal.html) | synchronous_commit=on在配置同步standby时等持久flush；remote_write不等操作系统崩溃下持久，remote_apply才额外等apply可见。正文保留fsync、同步standby、提升节点与旧主fence前提。 |

本章数值是教学假设。渠道适配、对象绑定、不可再执行终态、重放时限与运输/时钟界限均写为依赖契约；SQLite本地模型与fixture不会证明真实PSP或复制切主行为。未给法律或财务建议。
