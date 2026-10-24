# Ch20 一手资料与支持结论

2026-10-23 重新联网打开。固定 Kafka 4.1 文档，当前 4.1 JavaDoc 标为 clients 4.1.2；
没有把文档顶部的更新版本导航当成升级授权。以下按具体结论记录，容量/延迟/分区规划均是教学假设。

| 页面编号 | 本轮打开的一手来源 | 用于支持的具体说法 |
|---|---|---|
| [1] | [Kafka 4.1 Design](https://kafka.apache.org/41/design/design/) | 分区日志与 Pull；写先到 OS page cache，不必每条 flush；复制进度由副本 Fetch 报告，不是 Leader 发出响应即已存储。历史硬件例子不作为性能预算。 |
| [2] | [Producer Configs](https://kafka.apache.org/41/configuration/producer-configs/) | acks=all 等 ISR 全部；幂等要求 acks=all、retries>0、max.in.flight≤5；linger 的排队与反压，不能推出固定 p99。 |
| [3] | [Topic Configs](https://kafka.apache.org/41/configuration/topic-configs/) | minISR 包括 Leader；ISR3/min2 仍等3；可能 NotEnoughReplicasAfterAppend；retention 按段与字节/时间政策。低于 minISR 的水位条件另以 [16] 固定实现核对。 |
| [4] | [KafkaConsumer 4.1.2](https://kafka.apache.org/41/javadoc/org/apache/kafka/clients/consumer/KafkaConsumer.html) | poll position 与 committed position 分开；offset 不连续；单组分区分配与多线程限制；提交显式 map；read_committed 的 LSO 与事务过滤。 |
| [5] | [Consumer Rebalance Protocol](https://kafka.apache.org/41/operations/consumer-rebalance-protocol/), [ConsumerGroupHeartbeat](https://kafka.apache.org/41/design/protocol/#The_Messages_ConsumerGroupHeartbeat) | 新协议4.0起GA；4.1客户端 group.protocol=consumer opt-in；服务端管理 heartbeat/session；增量协议没有全组屏障，不意味着被移动区无停顿；member_epoch=0加入、响应返回该成员epoch，不能画成所有成员共享generation。 |
| [6] | [Consumer Configs](https://kafka.apache.org/41/configuration/consumer-configs/) | enable.auto.commit、auto.offset.reset=none 与 isolation.level；read_uncommitted 不等于读取 Leader 未复制尾部。 |
| [7] | [KafkaProducer 4.1.2](https://kafka.apache.org/41/javadoc/org/apache/kafka/clients/producer/KafkaProducer.html) | sendOffsetsToTransaction 发送组协调器，事务成功才提交；使用当前 consumer.groupMetadata；不额外交自动/手动位点。commitTransaction 超时只能重试同操作或 close，不能换 abort；abort 超时同理。initTransactions 解决先前实例事务，业务 resend 不由会话幂等包住。 |
| [8] | [Eligible Leader Replicas](https://kafka.apache.org/41/operations/eligible-leader-replicas/) | 4.1新集群默认开ELR；feature=0关闭；ISR之外可能有安全ELR；不把传统ISR禁选图推广到ELR开启。 |
| [9] | [KRaft](https://kafka.apache.org/41/operations/kraft/) | 3/5 controller与多数派；关键部署不建议 combined；控制面元数据与数据分区复制不同。 |
| [10] | [Basic Kafka Operations](https://kafka.apache.org/41/operations/basic-kafka-operations/) | 加分区不重新分布旧数据；分区限制组内并行。48→96/48→49 的比例是本章独立取模推导。 |
| [11] | [Transaction Protocol](https://kafka.apache.org/41/operations/transaction-protocol/) | 4.0起事务服务端防线与 transaction.version=2；4.0+客户端且服务端启用时使用，不把所有旧客户端当同一协议。 |
| [12] | [KIP-98](https://cwiki.apache.org/confluence/spaces/KAFKA/pages/66854913/KIP-98%2B-%2BExactly%2BOnce%2BDelivery%2Band%2BTransactional%2BMessaging) | 历史设计用于区分组位点暂存与事务决定/标记，避免汇总框误称同一broker；旧提案字段不作为4.1.2 API逐字段规范。 |
| [13] | [ConsumerRebalanceListener 4.1.2](https://kafka.apache.org/41/javadoc/org/apache/kafka/clients/consumer/ConsumerRebalanceListener.html) | 正常撤销先于接手；失联时可能先被接手再通知lost，onPartitionsLost不应提交；旧任务本地取消不能替远端去重。 |
| [14] | [ConsumerRecords.nextOffsets](https://kafka.apache.org/41/javadoc/org/apache/kafka/clients/consumer/ConsumerRecords.html#nextOffsets()), [OffsetAndMetadata](https://kafka.apache.org/41/javadoc/org/apache/kafka/clients/consumer/OffsetAndMetadata.html) | nextOffsets含本次poll推进位置与元数据，即使没有业务记录也可能推进；leaderEpoch属于last consumed record。教学局部前缀省略未跟踪epoch，整批才复用原元数据。 |
| [15] | PostgreSQL18 [INSERT](https://www.postgresql.org/docs/18/sql-insert.html), [Isolation](https://www.postgresql.org/docs/18/transaction-iso.html), [Transactions](https://www.postgresql.org/docs/18/tutorial-transactions.html) | DO NOTHING可因尚不在该语句快照的并发冲突而不插入；下一SELECT在READ COMMITTED取新快照；同库事务对inbox+ledger全有或全无；UPDATE等待后针对新行版本继续。不能据此声称覆盖Kafka/HTTP。 |
| [16] | Apache Kafka tag4.1.2 [Partition.scala](https://github.com/apache/kafka/blob/4.1.2/core/src/main/scala/kafka/cluster/Partition.scala), [raw](https://raw.githubusercontent.com/apache/kafka/4.1.2/core/src/main/scala/kafka/cluster/Partition.scala) | maybeIncrementLeaderHW先检查isUnderMinIsr并早退；这段没有ELR feature分支。循环另纳入maximalIsr或符合加入条件的副本；图只画稳定成员，不能称完整broker算法。源码不是本地集群验证。 |

重要纠错：原正文“失败则abort并重放”没有区分commit超时与提交前可中止错误，
现改为同一commit重试/关闭恢复；source [7] 的 commitTransaction 段明确禁止切换操作。
原有“acks不等于fsync”保留并具体写出page cache/相关掉电边界。
offset稀疏、正常revoked/lost及完整inbox意图是实现前提补全。
