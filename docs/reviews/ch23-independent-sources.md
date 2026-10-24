# Ch23 独立引用抽核 · 2026-10-23

以下由复核者实际打开官方页面核对；不以作者“已核验”代替检查。

- [Redis ZADD](https://redis.io/docs/latest/commands/zadd/)：ZSET一个member只存一次，分数可改；整数在±2^53内精确。本章最大C=3,000,004,000,000在该范围内，GT与CH的作用区分成立。
- [Redis ZRANGE](https://redis.io/docs/latest/commands/zrange/)：端点包含，REV反转分数与同分member字节序；BYLEX要求同分，不能直接对不同score的主ZSET做词典范围查询。本章命令与额外全序token索引的前提一致。
- [Redis ZREVRANK](https://redis.io/docs/latest/commands/zrevrank/)：降序零基索引、O(log N)，本章加1为唯一ordinal；实际Lua检查r=0时没有误判为不存在。
- [Redis原文：You Don’t Need Transaction Rollbacks in Redis](https://redis.io/blog/you-dont-need-transaction-rollbacks-in-redis/)：执行隔离与错误回滚不同。复核另外用真实Redis7.2.5、未修改的project.lua及只拒HSET的ACL用户复现ZADD保留、state未写，独立支持本章隔离epoch而不ACK的故障边界。
- [PostgreSQL18 Explicit locking](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS)：FOR SHARE互相兼容，但阻止UPDATE/FOR UPDATE等。赛季gate共享锁与截止独占修改的原理成立；SQLite BEGIN IMMEDIATE并不实现或证明这种行锁并发，报告与页面均明确这一点。
- [PostgreSQL18 Exported snapshots](https://www.postgresql.org/docs/18/logicaldecoding-explanation.html#LOGICALDECODING-EXPORTED-SNAPSHOTS)：逻辑槽创建导出的快照给出状态与后续变化流无遗漏衔接的适配契约；普通SELECT快照后猜MAX(outbox_id)不具备该保证。适配器未实现，不声称CDC/failover得到测试。

QPS、6.4GB、212.3s和分桶数在独立模型/算术结果中重新计算，均为教学假设。数据集不可变、路由manifest真实完整、签名游标、来源完整前缀、控制器隔离/fencing等是本章声明的依赖，未把纯函数/单机脚本当成其实现。
