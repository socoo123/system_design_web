# Ch12 · 一手资料核对

2026-10-23 实际通过浏览工具打开原文，并对照下列段落。数字、SLO、群阈值、租约时长与本章整数 seq/view 协议均为教学设计，未借用厂商性能数据。

| 来源 | 核对位置 | 支持本章哪些句子 / 不支持什么 |
|---|---|---|
| [RFC6455](https://www.rfc-editor.org/rfc/rfc6455.html) | §1，§5.5.2–3，§7.2.3 | WebSocket 在 TCP 上的双向帧、Ping/Pong、异常断开后的随机延迟与退避；不提供应用落库或 Read ACK，15 s 不是 RFC 恢复保证。 |
| [Amazon Builders’ Library: Making retries safe with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/) | Reducing client complexity；Retries and semantic equivalence；Late arriving requests；Same client request ID, different intent | 调用方请求键；幂等记录与所有业务变更须 ACID；同键恢复语义、不同意图拒绝、迟到请求边界。24 h 窗口和本例不 GC 为本章选择。 |
| [Raft extended paper](https://raft.github.io/raft.pdf) | §5.3–5.4，Figure 2 持久状态 | 提交日志的多数派规则必须连同 term/leader completeness；持久状态先写后响应；不能等同任意两个 ACK。不是分布式 SQL 跨表事务的实现证明。 |
| [AWS Transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html) | Issues and considerations；outbox table implementation | 业务数据与 outbox 同事务，独立服务读已提交 outbox，重复事件与幂等消费；没有据此声称 exactly-once。 |
| [Matrix Client–Server API v1.11](https://spec.matrix.org/v1.11/client-server-api/) | Syncing 中 limited timeline/gaps；Receipts 中 up-to markers / Private read receipts | next_batch 不代表完整历史，缺口另分页补；按 event ID 去重；公开/私有 read-up-to。整数连续 seq、view_epoch 和 Delivered 都是本章协议，不声称与 Matrix 互通。 |
| [Discord: How Discord Stores Trillions of Messages](https://discord.com/blog/how-discord-stores-trillions-of-messages) | 2023-03-06，Our Cassandra Troubles | channel + 固定时间 bucket 的分区键；单个热分区仍会造成延迟。50k 成员、M=500 不是 Discord 测量。 |
| [Redis keyspace notifications](https://redis.io/docs/latest/develop/pubsub/keyspace-notifications/) | 开头 Pub/Sub fire-and-forget；Timing of expired events | 断线期间 Pub/Sub 事件丢失；expired 发生在实际删键时，非 TTL 精确归零时；支持查询判租约和周期刷新。 |
| PostgreSQL18 [Row-level locks](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS) / [Isolation](https://www.postgresql.org/docs/18/transaction-iso.html) / [Sequence functions](https://www.postgresql.org/docs/18/functions-sequence.html) | §13.3.2、§13.2.1、§9.17 Caution | FOR UPDATE 互斥并持续到事务结束；READ COMMITTED 新语句快照；nextval 不因 abort 回收，不能提供无洞序列。SQL 本身不配置 A5 共识复制。 |
| CockroachDB [Transaction layer](https://docs.cockroachlabs.com/docs/stable/architecture/transaction-layer) / [Replication layer](https://docs.cockroachlabs.com/docs/stable/architecture/replication-layer) | Overview / Commits (phase 2)；Raft / leaseholder write consensus | 跨表/范围原子事务与 Raft 多数派复制是不同层；给 A5 一种可选承载方向，不声称本章部署了该数据库或将 PG DDL 自动变成多数派事务。 |

本轮只引用原文事实；所有协议具体动作、原子边界与失败行为在正文另行定义。未逐条验证上述站点所引用的第三方链接，也没有将官方性能图当成本题实测。
