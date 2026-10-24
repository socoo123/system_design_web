# Ch20 · 独立复核来源抽核

2026-10-23由复核者重新联网打开。下列为实际阅读的原文位置与支持范围；没有用作者报告代替来源。

| 来源 | 独立确认的具体结论 |
|---|---|
| [Kafka4.1 Producer Configs: acks](https://kafka.apache.org/41/configuration/producer-configs/#acks) | acks=all等待ISR全部，不是minISR任选若干票；未把此回执解释成每副本逐条fsync。 |
| [Kafka4.1 Topic Configs: min.insync.replicas](https://kafka.apache.org/41/configuration/topic-configs/#min.insync.replicas) | 包含Leader；ISR3/min2仍等三份；不足门槛可有NotEnoughReplicas或AfterAppend错误。 |
| [Kafka tag4.1.2 Partition.scala](https://github.com/apache/kafka/blob/4.1.2/core/src/main/scala/kafka/cluster/Partition.scala), `maybeIncrementLeaderHW` | 实际代码先检查under-min并return false，循环另考虑maximalIsr/符合加入条件的副本；该处没有ELR feature判断。正文“成员稳定”简化与源码边界相符。 |
| [Kafka4.1 Eligible Leader Replicas](https://kafka.apache.org/41/operations/eligible-leader-replicas/) | 新4.1集群默认开ELR，feature0关闭；不能把本文传统ISR候选限制泛化到ELR开启。 |
| [Kafka4.1 Design: replication / unclean election](https://kafka.apache.org/41/design/design/) | 不依赖每次写都fsync；数据安全依赖安全副本仍存活，相关失效需另处理。 |
| [KafkaConsumer4.1.2](https://kafka.apache.org/41/javadoc/org/apache/kafka/clients/consumer/KafkaConsumer.html), offsets / transactional reads / endOffsets | 实际offset可稀疏；position不是committed；默认可读尾是HW，read_committed还取LSO并过滤中止事务；不能把read_uncommitted理解成Leader未复制尾部。 |
| [ConsumerRecords4.1.2 nextOffsets](https://kafka.apache.org/41/javadoc/org/apache/kafka/clients/consumer/ConsumerRecords.html#nextOffsets()) | 记录本次poll推进的分区位置，不能以records.partitions或后续position替代。 |
| [OffsetAndMetadata4.1.2](https://kafka.apache.org/41/javadoc/org/apache/kafka/clients/consumer/OffsetAndMetadata.html) | leaderEpoch属于前一条已消费记录。部分前缀不跟踪epoch时省略是明确简化，不把整批尾epoch错贴。 |
| [ConsumerRebalanceListener4.1.2](https://kafka.apache.org/41/javadoc/org/apache/kafka/clients/consumer/ConsumerRebalanceListener.html) | 正常revoked先于接手；lost时可能已被接手，不能再当正常撤销提交。 |
| [Consumer Rebalance Protocol4.1](https://kafka.apache.org/41/operations/consumer-rebalance-protocol/), [ConsumerGroupHeartbeat wire fields](https://kafka.apache.org/41/design/protocol/#The_Messages_ConsumerGroupHeartbeat) | 新协议4.0起GA且客户端显式group.protocol=consumer；无全组同步屏障。协议member_epoch=0表示加入，字段属于成员，不是全组共用generation。 |
| [KafkaProducer4.1.2](https://kafka.apache.org/41/javadoc/org/apache/kafka/clients/producer/KafkaProducer.html), init/sendOffsets/commit/abort | 暂存位点ACK不等于事务提交；当前groupMetadata参与fencing。commit超时只继续同一commit或close，不能换abort；init解决同transactional.id前一实例尚未确定的事务，不能统称UNKNOWN被中止。 |
| [PostgreSQL18 INSERT](https://www.postgresql.org/docs/18/sql-insert.html), [READ COMMITTED](https://www.postgresql.org/docs/18/transaction-iso.html) | DO NOTHING可能受本语句快照外的并发胜者影响；下一SELECT用新语句快照。UPDATE会在等待后作用于新行版本。只有同库inbox/ledger事务，不覆盖Kafka/HTTP。 |

以上为文档/源码核验，未启动Kafka或PostgreSQL。SQL实际运行仅是本次独立SQLite探针；复制/磁盘/组协议结论不是本地集群实验结果。
