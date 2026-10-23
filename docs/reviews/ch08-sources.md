# Ch08 一手来源核验 · 2026-10-22

实际用浏览工具打开并查找正文，以下只记录支持的具体边界；数字例子及客户端状态机是本章教学设计。链接也在章节相关结论附近。

| 页内引用 | 实际核验来源 | 支持的说法 / 不延伸的说法 |
|---|---|---|
| 1 | [Redis SET](https://redis.io/docs/latest/commands/set/) | NX 和 PX 同一命令；不把 OK 当业务提交 |
| 2 | [Redis Lua](https://redis.io/docs/latest/develop/programmability/eval-intro/) | 脚本在单实例原子执行、阻塞其他命令；不是跨 Redis/SQL 事务 |
| 3 | [Redis WAIT](https://redis.io/docs/latest/commands/wait/) | 同连接前序写、返回实际副本数；超时不撤销 SET；即使复制确认仍可能切主丢写；不是强一致 |
| 4 | [Redisson locks](https://redisson.pro/docs/data-and-services/locks-and-synchronizers/) | 看门狗默认 30 s；leaseTime；Fenced Lock 要资源检查 token；本章字符串 Lua 不冒充其 hash/重入实现 |
| 5 | [RenewalTask.java @ dc4cdf0](https://github.com/redisson/redisson/blob/dc4cdf096589a21c990b117a1ad0d1634dd84685/redisson/src/main/java/org/redisson/renewal/RenewalTask.java) | schedule 使用 internalLockLeaseTime / 3；查 master 后通过提交 API 固定到文件最近提交，再打开固定链接复核；不是硬实时承诺 |
| 6 | [etcd v3.6 concurrency](https://etcd.io/docs/v3.6/dev-guide/api_concurrency_reference_v3/) | 成功 Lock 返回 ownership key；lease 失效释放；相同 lease 重入视为同一获取，故独立申请不可共用该身份 |
| 7 | [etcd API guarantees](https://etcd.io/docs/v3.6/learning/api_guarantees/) | KV completed operations durable、严格可串行化、revision 总序；外部库验证与灾备 incarnation 不由此自动实现 |
| 8 | [PostgreSQL 18 Constraints](https://www.postgresql.org/docs/18/ddl-constraints.html) | UNIQUE/PK/NOT NULL/CHECK；约束不定义重复请求自动返回成功 |
| 9 | [Kleppmann 2016](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html) | 效率/正确性、暂停与晚到包、33/34 fencing、资源参与；不是所有业务都必须外部锁 |
| 10 | [Antirez 2016](https://antirez.com/news/101) | Redlock 答辩的相对计时与耗时模型；标记技术争议，不用作者观点冒充行业定论 |
| 11 | [Redis Distributed Locks](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/) | 异步复制切主双跑；5 独立主、3 成功、有效窗口扣耗时/漂移；失败释放所有尝试；TTL 墙钟限制；fencing 提醒；8.4 DELEX |
| 12 | [PG 18 Transaction Isolation](https://www.postgresql.org/docs/18/transaction-iso.html) / [INSERT](https://www.postgresql.org/docs/18/sql-insert.html) | READ COMMITTED UPDATE 对并发更新后的行重检 WHERE；DO NOTHING 可能与本语句不可见的新行冲突，后续独立 SELECT 使用新快照；这支撑事务伪代码，而非实际 PG 故障测试 |

未采用公开吞吐数字、固定协调器延迟排行榜或 P99 当硬最大值。所有流量、成功率、TTL 预算、库存、业务版本号与幂等事务控制流都明示为教学假设。
