# Ch37 独立一手抽核（2026-10-24）

独立复核者实际浏览，未用作者来源报告代替。以下支持关键结论，不把论文历史吞吐当本章容量。

- [PostgreSQL18 WAL](https://www.postgresql.org/docs/18/wal-intro.html)：相应日志先持久再刷数据页；提交不要求逐笔刷完所有数据页。[Standby](https://www.postgresql.org/docs/18/warm-standby.html)：异步未送达事务可在灾难主库故障丢失；remote_write仅到远端OS，remote_apply等指定同步副本回放。正文没有由单纯持久ACK推出任意副本新快照可见。
- [PostgreSQL18隔离](https://www.postgresql.org/docs/18/transaction-iso.html)：Read Committed更新等待后重验WHERE，Repeatable Read保留快照。独立SQLite旧快照fixture验证“当前主库”仍需新读视图；没有把SQLite单写者当PostgreSQL行锁实验。
- [SQLite Transactions](https://www.sqlite.org/lang_transaction.html)与[WAL](https://www.sqlite.org/wal.html)：同一DB单写者、BEGIN IMMEDIATE写事务及读快照。[RETURNING §2.3](https://www.sqlite.org/lang_returning.html)：返回行只是连接内变更，不等于提交。[3.38.0](https://www.sqlite.org/releaselog/3_38_0.html)明确新增unixepoch。SQLite模型范围与版本要求准确。
- [Dynamo原论文（作者站点PDF）](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf)：§4.6 sloppy quorum/hinted handoff扩大实际成员；§6.1描述主存缓冲写及耐久/延迟取舍。独立重走W={N1,N4}与R={N2,N3}不相交；图上durable ACK是额外教学约定，W数不自动定义落盘。
- [Bigtable2006原论文](https://storage.googleapis.com/gweb-research2023-media/pubtools/4443.pdf)：§2行/列/时间戳映射、tablet连续行范围；§3单行读改写与不提供通用跨行事务；§6 Bloom。正文显式限定2006论文，不把历史能力泛化到所有现代KV/宽表产品。
- [Dremel2010原论文](https://www.vldb.org/pvldb/vol3/R29.pdf)：只读嵌套数据、列条带与多级执行树。它支持本章分析例子的布局/树，不支持“所有列式引擎不能更新/事务”。manifest、去重与worker可信计算是本章另外声明的契约。
- [S3条件写](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html)：If-None-Match检查当前键，版本化桶也只看当前版本；策略可强制条件，不能由这一个头推出永久不可变。完整session/object_key（含namespace）与version证明由本章可信验证器提供，适配没有伪造真实HEAD/权限实验。
- [RocksDB Basic Operations](https://github.com/facebook/rocksdb/wiki/Basic-Operations)：默认非sync、OS缓冲与持久sync、默认进程/机器故障差别。[Write Stalls](https://github.com/facebook/rocksdb/wiki/Write-Stalls)：memtable/L0/待合并字节可以减速或停写。正文将WA分子定义为引擎设备写含WAL/flush/compaction，另排NAND内部放大，并提示产品指标口径可能不同。

本轮未重新打开LSM1996、OSFA2005及Spanner2012全文；这三处仅抽查正文的局部限定/链接，未声称全14条引用逐句复核。上述独立抽核已覆盖本轮结账、持久、对象发布、KV、布局/聚合和引擎关键事实。
