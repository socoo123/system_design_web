# Ch28 一手来源独立抽核

2026-10-24，独立打开原始论文与官方页面，不以作者验收表代替事实核对。

| 原始来源 | 本次核对 | 结论与限制 |
|---|---|---|
| [ZooKeeper 3.9.4 Programmer's Guide](https://zookeeper.apache.org/doc/r3.9.4/zookeeperProgrammers.html) | Watches / Things to Remember / Persistent Recursive Watches | standard watch为一次触发、重设有窗口；3.6.0起有persistent变体。正文限定standard，未把所有watch都说成一次性。 |
| [etcd 3.6 API guarantees](https://etcd.io/docs/v3.6/learning/api_guarantees/) | Strict serializability / Linearizability / Watch APIs | 默认KV线性化与可旧serializable区别成立；watch自身不提供线性化，按revision恢复依赖保留窗口。本文RESET是自己的应用协议，不是冒称etcd返回同名HTTP错误。 |
| [Raft原论文](https://raft.github.io/raft.pdf) | §5.3、§5.4.2与Figure 8 | 三节点多数为2，但旧任期不能仅数副本宣称提交；正文已把本地事务原子与多数派持久分开。未进行复制/断电实验。 |
| [PostgreSQL 18 row locks](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS) | Row-Level Locks | Current同row的FOR UPDATE串行写者；回执需等锁后复查。实际运行适配是SQLite粗写锁，未称测过PG行锁/复制。 |
| [SQLite Transaction](https://www.sqlite.org/lang_transaction.html) | §2.1–2.2 | 多读者/单写者与BEGIN IMMEDIATE适配限制；独立探针确实走多连接和真实本地事务。其通过不是PG隔离、etcd或跨机持久性证明。 |
| [Apollo Design](https://github.com/apolloconfig/apollo/blob/master/docs/en/design/apollo-design.md) | Config Service Notification Client Implementation / Client Design | 原文明确60秒long-poll无变化304、变更后另拉、默认5分钟拉取及本地文件恢复。本章自定义204另行说明，无错误归因。 |
| [Java17 System.nanoTime](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/System.html#nanoTime()) | nanoTime方法契约 | 只在同一JVM中计算经过时间差；不是跨重启证明。本文额外要求暂停计时或恢复前换era/清proof，此要求是适配义务而非nanoTime平台保证。 |

独立复算的333.333批请求/s、3,333.333 namespace正文/s、500批/s的200MB/s、N−1四节点/10,500连接，以及其他容量数值均源自教学假设；不把随机抖动窗口或单线程示例吞吐当成生产上界。安全确认也明确由可信transport/线性化选择适配提供，Java布尔参数不实现认证。
