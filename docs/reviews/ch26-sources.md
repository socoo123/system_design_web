# Ch26 一手来源核验

核验日期：2026-10-23。逐项通过 web 工具读取官方页面，下面记录支持的具体句子与不推出的保证。正文数字和算法归纳证明属于本章自设条件及推导。

| 位置 | 一手来源 | 支持说法与适用边界 |
|---|---|---|
| ref1 / 候选 Lua | [Redis · Scripting with Lua](https://redis.io/docs/latest/develop/programmability/eval-intro/) | 脚本执行窗口原子且阻塞其他服务活动；所有访问键必须显式 KEYS。不是跨 Packet DB 事务，也不是脚本错误回滚承诺。 |
| ref2 / 恢复 | [Redis replication](https://redis.io/docs/latest/operate/oss_and_stack/management/replication/) | 默认异步复制，等待副本仍不使 Redis 成为强一致 CP 系统；特定故障可能丢已确认写。 |
| ref3 / 资金/领取意图 | [AWS · Transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html) | 业务更新与 outbox 在同一事务；投递可重复，因此接收端幂等。没有把 AWS 文中简化“跨服务原子”说法当成跨库事务。 |
| ref4 / T_claim 与 close | [PostgreSQL 18 · Explicit Locking](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS) | FOR UPDATE 阻止其他写者/锁者直到事务结束；READ COMMITTED 等待后读取更新行。统一锁顺序降低死锁，不能支持 2 ms 吞吐数字。 |
| ref5 / 同槽 | [Redis Cluster specification](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/) | Hash tag 令多键同槽；resharding 中仍可能 TRYAGAIN。这里实际只跑隔离单机，未跑 Cluster。 |
| ref6 / WAIT | [Redis · WAIT](https://redis.io/docs/latest/commands/wait/) | 指定副本确认既往写并不构成强一致或切主不丢确认的保证，与 replication 的明确边界一致。 |
| ref7 / TTL | [Redis · EXPIRE](https://redis.io/docs/latest/commands/expire/) | 设置键到期与删除；本章“不能替代业务退款”是根据本地状态/资金事务划分作出的推论。 |
| ref8 / 唯一性 | [PostgreSQL 18 · Constraints](https://www.postgresql.org/docs/18/ddl-constraints.html) | 复合 UNIQUE 与 NOT NULL；分别用于请求、用户业务身份和份额身份。唯一性不能创造丢失的 Outbox。 |
| ref9 / 接口例子 | [Stripe · Idempotent requests](https://docs.stripe.com/api/idempotent_requests) | **API v1** 在执行开始后保存首状态码/响应体（含 500），核对参数，至少 24 h 后可 prune；原键被清理后复用会创建新请求。验证失败/正在并发执行的冲突不保存结果。**API v2** 可继续失败/部分失败的工作并返回更新结果。本章不使用 Stripe 作为真实资金后端，不把其期限写成内部账本承诺。 |
| ref10 / Redis 错误 | [Redis · Transactions](https://redis.io/docs/latest/develop/using-commands/transactions/) | 文档的错误处理与脚本事务性执行范围。脚本执行错误后的先前写入另外通过实际 Redis EVAL 设置键后 error 的反例验证，不从“原子”推导回滚。 |
| ref11 / DB 耐久性 | [PostgreSQL 18 · WAL](https://www.postgresql.org/docs/18/wal-intro.html) | 数据页变化须先有持久 WAL；不证明异步副本提升不回退已确认业务。 |
| ref12 / 时间 | [PostgreSQL 18 · Date/Time Functions](https://www.postgresql.org/docs/18/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT) | now()/CURRENT_TIMESTAMP 固定为事务开始，clock_timestamp() 反映调用时实际时间；锁后裁决的时间条件必须显式读取。跨机真实时钟治理没有验证。 |
| ref13 / 自检适配 | [SQLite · Transactions](https://www.sqlite.org/lang_transaction.html) | 同时只有一个写事务，BEGIN IMMEDIATE 立即开始写事务。SQLite 真事务反例不当成 PostgreSQL 行锁或切主证明。 |
| ref14 / 整数随机接口 | [Java 17 · RandomGenerator](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/random/RandomGenerator.html#nextLong(long,long)) | nextLong(origin,bound) 下含上不含；本章传 upper+1。固定种子是复现工具，均匀位置期望是条件数学推导，不构成真实抽签公平或不可预测性测试。 |

本章不提供现实资金产品、财务或监管建议。账本只是有限单币种内部余额教学模型；不声称实现渠道清算、争议处理、生产钱包或真实服务认证。
