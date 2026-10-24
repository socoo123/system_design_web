# Ch25 一手来源核验

核验时间：2026-10-23–24（Asia/Shanghai）。原章11项链接全部通过 web 打开；新增 PostgreSQL 时间语义与 SQLite 事务边界。以下为支持范围的转述，不将教学数字或本章设计归于来源。

| 页面编号 | 一手来源 | 核验后采用的结论与限制 |
|---|---|---|
| [1] | [PostgreSQL 18 SELECT](https://www.postgresql.org/docs/18/sql-select.html#SQL-FOR-UPDATE-SHARE) | SKIP LOCKED 跳过当前拿不到的行锁，可用于队列式多消费者；返回不完整视图，只作用于行锁，仍可能取得表级锁。批量100不是产品保证。 |
| [2] | [PostgreSQL 18 Explicit Locking](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS) | 行锁在事务结束或相应savepoint回滚时释放；短事务行锁不是跨事务执行租约。 |
| [3] | [PostgreSQL 18 Constraints](https://www.postgresql.org/docs/18/ddl-constraints.html#DDL-CONSTRAINTS-UNIQUE-CONSTRAINTS) | 组合UNIQUE约束，默认NULL不等；本章火点三字段NOT NULL。约束只限制持久行，不限制handler调用次数。 |
| [4] | [Martin Kleppmann · How to do distributed locking](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html) | 暂停/网络延迟可超过租约；保护资源必须拒绝陈旧fencing token。文章不支持把每run代次直接当跨job共享资源令牌；41/42为本章示意。 |
| [5] | [Quartz 2.3.0 JobStoreTX Configuration](https://www.quartz-scheduler.org/documentation/quartz-2.3.0/configuration/ConfigJobStoreTX.html) | misfireThreshold默认60000ms=60s，是迟到容忍，不是本章SLO或租约TTL。旧版本事实明确标2.3.0，不称最新默认。 |
| [6] | [Apache Airflow 3.0.0 DAG Runs](https://airflow.apache.org/docs/apache-airflow/3.0.0/core-concepts/dag-run.html#catchup) | 文档默认catchup_by_default=False，显式catchup=True补data intervals；只描述该版本产品，不推导行业默认。 |
| [7] | [Netty 4.1 HashedWheelTimer](https://netty.io/4.1/api/io/netty/util/HashedWheelTimer.html) | 文档自称近似I/O超时调度，每tick检查此前到期任务；不保证业务准时、不提供持久恢复。页面显示4.1.139.Final，1s/60槽是本章假设。 |
| [8] | [AWS Builders’ Library · Making retries safe with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/) | 调用方操作身份表达意图；参数相同不必然同意图；去重身份与效果须原子记录；同key不同参数拒绝；保留期考虑迟到请求。close:o7与保存到订单归档为本章选择。 |
| [9] | [AWS Prescriptive Guidance · Transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html) | 同库业务状态与事件同事务关闭双写丢失；重复消息仍可能发生，消费者需幂等。本章没声称一次网络交付或无幂等邮件只发一封。 |
| [10] | [Kubernetes CronJob](https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/#cronjob-limitations) | 近似创建可重复/缺失，要求Job幂等；concurrencyPolicy仅约束同CronJob创建的Job。本章不把Kubernetes配置当自己的实现。 |
| [11] | [Quartz 2.5.x Cron Trigger Tutorial](https://www.quartz-scheduler.org/documentation/quartz-2.5.x/tutorials/crontrigger.html#notes) | Notes警告夏令时跳过/重复。该页不是本章calendar适配器、IANA/tzdb固定版本的实现证明；后者明确是设计契约。 |
| [12] | [PostgreSQL 18 Current Date/Time](https://www.postgresql.org/docs/18/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT) | now()/CURRENT_TIMESTAMP/transaction_timestamp固定事务起点；statement_timestamp固定语句起点；clock_timestamp取实际当前时间。本章明确锁后采样，不把取样判定说成物理COMMIT时刻保证。 |
| [13] | [SQLite Transaction](https://www.sqlite.org/lang_transaction.html) | 只有一个同时写者；BEGIN IMMEDIATE立即尝试写事务，可能BUSY。真实SQLite检查只证明本地事务/约束与适配器锁后取样顺序，不证明PostgreSQL行锁/SKIP LOCKED/切主。 |

容量、截止点与恢复预算均为教学假设并自行复算：56槽、179轮/35.8秒、20.16GB、60秒恢复下界与30圈。没有引用产品吞吐或生产实验结果；未将来源的宽泛描述外推到任意接收端。
