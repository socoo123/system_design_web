# Ch23 · 一手来源核验

核验日期：2026-10-23。浏览实际一手页面，不以旧章节引用日期作为证据。HTML 中的 `[1]`–`[17]` 就近落在相关说明旁；所有流量、内存、分桶和恢复数字均为自设教学输入，不来自产品基准。

| 编号 | 一手来源 | 支持的范围 |
|---|---|---|
| 1 | [Redis ZADD](https://redis.io/docs/latest/commands/zadd/) | 成员唯一；GT/CH 的区别；score 的整数精度边界。复合 C 由本章自行推导。 |
| 2 | [Redis ZRANK](https://redis.io/docs/latest/commands/zrank/) | 升序 rank 语法没有 REV。 |
| 3 | [Redis ZREVRANK](https://redis.io/docs/latest/commands/zrevrank/) | 降序、零基序号与 O(log N)。 |
| 4 | [Redis ZRANGE](https://redis.io/docs/latest/commands/zrange/) | Redis 6.2 加入 REV；逆字节序 tie；两端包含、负索引和 BYLEX 的同 score 前提。 |
| 5 | [Redis Scripting with Lua](https://redis.io/docs/latest/develop/programmability/eval-intro/) | 脚本执行期间服务端活动被阻塞，命令组合不会被其他客户端插队。11 人上界为本章选择。 |
| 6 | [AWS Transactional outbox pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html) | 数据与 outbox 同事务，重投需接收端幂等；未借此宣称跨系统共享事务。 |
| 7 | [Redis Persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/) | AOF everysec 的典型一秒左右故障损失窗口，不是排行榜持久事实来源。 |
| 8 | [Redis Cluster specification](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/) | 16,384 slots、key 分布和 hash tags；单 key 不自动按成员切分。 |
| 9 | [PostgreSQL 18 WAL settings](https://www.postgresql.org/docs/18/runtime-config-wal.html#GUC-SYNCHRONOUS-COMMIT) | fsync、配置同步副本后 synchronous_commit=on 的本地/副本 WAL flush 边界。原章节仅链接 WAL tuning 页不够直接，已换为此节。 |
| 10 | [Redis MEMORY USAGE](https://redis.io/docs/latest/commands/memory-usage/) | 采样 key 的数据与管理内存；160 B/成员为假设。 |
| 11 | [Redis ZCOUNT](https://redis.io/docs/latest/commands/zcount/) | 分数范围计数及复杂度，不自动计算同 C 的 member tie。 |
| 12 | [Redis Sorted sets](https://redis.io/docs/latest/develop/data-types/sorted-sets/) | 有序集合机制与复杂度；没有用操作复杂度证明吞吐。 |
| 13 | [Redis transaction rollback article](https://redis.io/blog/you-dont-need-transaction-rollbacks-in-redis/) | 脚本/事务隔离与 SQL 式回滚的区别；实际 Redis 错误后留写反例另有运行证据。未沿用原章未经重新核对的文章年份。 |
| 14 | [PostgreSQL 18 Indexes and ORDER BY](https://www.postgresql.org/docs/18/indexes-ordering.html) | 匹配 B-tree 索引可直接取 ORDER BY/LIMIT 前 N，不能笼统说 SQL 必须扫全表。 |
| 15 | [PostgreSQL 18 row locking](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS) | FOR SHARE 可并行并与更新/排他锁冲突；本章用来说明赛季 gate 与关闭的互斥。 |
| 16 | [PostgreSQL 18 exported snapshots](https://www.postgresql.org/docs/18/logicaldecoding-explanation.html#LOGICALDECODING-EXPORTED-SNAPSHOTS) | 逻辑槽导出基线快照与随后变更流的无缝边界；本章没有实现该适配器。 |
| 17 | [Redis ZLEXCOUNT](https://redis.io/docs/latest/commands/zlexcount/) | 所有元素 score 相同时的词典范围计数；额外全序索引只是扩展方案。 |

命令实际执行版本 Redis 7.2.5，Java 实际执行版本 17.0.10。PostgreSQL 18 原子约束通过文档核验与真实 SQLite 行为探针分别说明；没有把 SQLite BEGIN IMMEDIATE 的写锁替代成 PostgreSQL 行锁/同步复制测试。独立 authority 的完整累计快照、冻结 manifest、目录健康/fencing、变更流保留、游标签名与奖励下游均为明确依赖，不能从本地代码推出其实现已验证。
