# Ch20 · 消息队列教学实现

2026-10-23；Java 17 无外部依赖。Kafka 文档固定 4.1 系列，API/源码核对到 4.1.2；
教学集群显式 ELR=0、unclean=false。没有启动 Kafka 集群，也没有执行真实 rebalance/事务客户端。

```sh
python3 examples/ch20/check.py
node tools/audit-chapter.mjs ch20
node docs/reviews/ch20-browser.mjs
node docs/reviews/ch20-frames.mjs after
node docs/reviews/ch20-contact.mjs after
```

`check.py` 直接调用固定的 Java 17.0.10 的 javac/java，在临时目录编译运行完整类；
用 Python 标准库 SQLite 执行从页面同源伪代码提取的 SQL，并保存结果到
`docs/reviews/ch20-code-results.json`。不会在仓库生成 class 或 `__pycache__`。
页面 6 个代码块和下面文件逐字对齐，Java 节选由 region 标记提取。

| 文件 | 输入 → 输出 | 保证和提供者 | 失败与简化 |
|---|---|---|---|
| `capacity.txt` | 教学规模 → 字节/秒与留存乘法 | 精确算术；没有实测吞吐保证 | MB/TB 十进制，payload 1,024 B；索引、增长等另算 |
| `PartitionProgress.java` | 一批实际升序 offsets、本次 poll 终点、完成 ticket → safe next | 本地有界队列只越过已完成交付记录；全部方法由单一 poll 线程调用 | 不是 Kafka 所有权/持久性；worker 只向 poll 线程邮箱投递结果；不把整数缺口当任务 |
| `rebalance.pseudo` | poll/成功回调/撤销或丢失 → 显式提交 map、暂停/恢复/关闭 | Kafka coordinator 提供成员 epoch fencing；tracker 只做本地前缀 | 最多一批/区；新分配新 tracker；LOST 不提交；部分完成 `new OffsetAndMetadata(safe)` 省略未跟踪 epoch，整批才复用原 nextOffsets 元数据 |
| `schema.sql` / `apply-event.pseudo` | 稳定 handler/event ID、完整 account/delta → 原结果或首次结果 | 权威 PostgreSQL 的唯一键、同库事务和 UPDATE 行锁提供原子去重/增量 | 已知 SQL 错误回滚；COMMIT 未知重试原身份/意图；同事务不包含 Kafka/HTTP；要求仅此事务写 inbox，且不提前删除 |
| `kafka-transaction.pseudo` | 纯整批 transform → Kafka 输出与组 next offsets 共用事务结果 | Kafka 4.1.2 客户端/协调器契约；current groupMetadata 与稳定 transactional.id | 不是可编译 Java；无真实集群验证；提交超时只重试同一 commit 或 close，不能转 abort；新实例 initTransactions 解决旧结果 |
| `contracts.txt` | 概念 API 与状态键 | 用于白板定位，不是生产协议 schema | 省略授权、配额、网络字段 |

`PartitionProgress.register()` 先验证全部输入再改队列：最多500条、严格升序、不低于安全位置、
均小于该次 poll 终点；整个分区在前一批未完成时不得再注册下一批。每键串行保证业务顺序，
不同键可以并行，但提交必须跟随实际交付顺序的完成前缀。只有确认持久副作用成功或读到已提交去重结果
才调用 `completed()`；UNKNOWN 不完成。Java 内存是可丢的，重启按 Kafka 已提交位置重放。

正常轨迹是 `[41,42,43] → 完成41 → safe42 → 完成43仍safe42 → 完成42 → safe44`。
稀疏轨迹 `[41,45,50]` 终点53，先完成50不会越过41；完成41后是45，全部完成才到53。
新旧 tracker 用对象身份分离；关闭旧 tracker 能拒绝旧回调，不能撤销旧 worker 已发出的 DB/HTTP。
每轮含空 poll 都先应用完成邮箱，注册新工作，再从所有当前 ACTIVE trackers 建显式 map 并实际 commitSync；
不能依赖新 poll 的分区集合，否则暂停区的完成会漏交。无新批次时元数据可省略，不能引用未定义的批尾。
`onPartitionsRevoked` 有界排空后提交本次仍可提交分区安全 map，最终关闭；`onPartitionsLost` 直接关闭不提交。
取消与时钟期限只限制本地等待，不证明远端副作用停止。

账本示例仅是整数分增量，不声称实现完整财务账本、余额下限、会计分录或支付。
完整意图只有 `account_id` 与 `delta_cents`，因此逐字段比较；扩展效果后必须把所有决定副作用的字段一并比较。
handler 是稳定副作用命名空间，不能靠改 group.id 再执行同一个付款。
去重保留期覆盖人工重放、备份恢复、relay 重试等全部允许窗口；删除记录后该事件的去重承诺结束。
备份还原必须使 ledger 与 inbox 一致。

执行探针覆盖正常加30、位点失败后的重复、余额又变后仍返回原回执、不同意图拒绝、
插 inbox 后/更新 ledger 后的事务回滚、提交成功但回包丢失、缺账户回滚和12个实际 SQLite 重复争用。
负例故意单独提交 inbox，随后验证副作用无法靠重试补回；这不是推荐实现。
SQLite 使用 `BEGIN IMMEDIATE` 全局写锁，**不等于 PostgreSQL 的行锁、READ COMMITTED 快照、复制与掉电语义**。
PostgreSQL 的并发结论来自官方文档；本环境没有实际 PostgreSQL 实验。

Kafka 事务示例把 begin/stage 与 commit 阶段分开：提交前明确可中止错误可尝试 abort，未确认则关闭；
fatal producer error 停止；commit 超时只重试 commit，预算耗尽关闭两客户端，不开始下一批。
恢复须先用同一逻辑任务的 transactional.id 执行 initTransactions，再从可靠 committed offsets 恢复。
该初始化既可能完成已有提交，也可能中止未完成事务，不能把 UNKNOWN 统一称为失败/中止。
输入与下游输出都用 read_committed，普通自动提交和额外 commitSync 均关闭。

本地检查不证明 Kafka broker 复制、磁盘 fsync、事务标记可见性、真实再均衡、消息故障注入或生产 SLO。
来源逐结论记录见 [ch20-sources.md](../../docs/reviews/ch20-sources.md)。
