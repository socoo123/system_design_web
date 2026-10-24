# Ch21 一手来源核验 · 2026-10-23

逐项重新打开当前官方页面；下表记支持边界，不把教学规模、期限或 SQLite 结果归到厂商文档。

| 页面引用 | 官方来源 | 支持的具体结论及边界 |
|---|---|---|
| [1] | [PostgreSQL18 Transaction Isolation](https://www.postgresql.org/docs/18/transaction-iso.html) | Read Committed 的竞争 UPDATE 等候前驱结束后对更新后行重检 WHERE。`ON CONFLICT DO NOTHING` 可因 INSERT 快照不可见的并发结果不插入；另起 SELECT 读取赢家。不能推广为任意多行不变量。 |
| [2] | [PostgreSQL18 Constraints](https://www.postgresql.org/docs/18/ddl-constraints.html) | CHECK 为 NULL 不能替代 NOT NULL；普通 CHECK 不支持跨行/跨表保证。唯一约束与部分唯一索引适用于明确活跃谓词的占用。 |
| [3] | [PostgreSQL18 Transactions](https://www.postgresql.org/docs/18/tutorial-transactions.html) | 一个事务内全有/全无，SAVEPOINT 后的修改可局部回滚而保留此前身份。0行库存不足转业务拒绝由应用负责，非数据库自动推断。 |
| [4] | [Redis Scripting with Lua](https://redis.io/docs/latest/develop/programmability/eval-intro/) | 执行期间不允许其他命令交错，长脚本也阻塞其他工作。脚本异常不回滚此前写入另由本章实际 Redis 7.2.5 负例验证，不借“原子执行”推导关系事务回滚。 |
| [5] | [Redis Keyspace notifications](https://redis.io/docs/latest/develop/pubsub/keyspace-notifications/) | Pub/Sub 断线期间事件丢失；TTL 到零与 expired 事件实际生成可有间隔，不作为精确定时器。删键不替另一个计数增加。 |
| [6] | [Redis Persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/) | AOF every-second fsync 有最近写丢失窗口；不把准入ACK当库存最终事实。未自行实验AOF/切主。 |
| [7] | [Redis Cluster specification](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/) | 多键操作限定同槽，hash tag可强制同槽。示例采用单hash，未运行Redis Cluster，增加分片不能自动拆一份总库存约束。 |
| [8] | [AWS Transactional outbox pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html) | 本地业务记录与outbox同事务，发送可能重复，消费者需幂等。跨服务业务效果/Redis不是同一DB提交，不引用其中FIFO措辞主张端到端exactly-once。 |
| [9] | [PostgreSQL18 Current Date/Time](https://www.postgresql.org/docs/18/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT) | CURRENT_TIMESTAMP/now为事务开始时刻，clock_timestamp为真实当前时刻；本章在hold锁后取一次判定，允许提交时间晚于deadline。 |

自设数字另算：`5000*200*.7/3/86400 = 2.700617283950617/s`；`5000*10*365=18,250,000`行；`2000/800=2.5`；`500+200+50=750<800`；`500*.020=10`平均在途；`10000/500=20s`（每token1件且不回补重售的名义稳态等效时长；固定窗首尾突发不提供该墙钟硬下界）；`100*(1+2)=300`最多尝试。实际测试不实现800/s混合预算或分布式全局调度。

Ch18契约只读核对：页面原创建回执、不可变完整意图、HELD所有权、UNKNOWN不得当付款失败、capture独立退款/核对责任与本地Outbox边界。本章库存确认失败不复活已释放名额，也不宣称资金已退。
