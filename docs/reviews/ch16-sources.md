# Ch16 primary-source verification · 2026-10-23

All URLs below were fetched through web browsing during this implementation. Living Redis/AWS
documentation was rechecked; PostgreSQL links deliberately pin version 18. These sources
support mechanisms, not our assumed QPS, hit rate, five-second SLO or worker performance.

| Page/reference | Supports | Does not establish |
|---|---|---|
| [1 · PostgreSQL 18 LIMIT/OFFSET](https://www.postgresql.org/docs/18/queries-limit.html) | Unique ORDER BY is needed for deterministic pages; OFFSET's skipped rows are computed. | Timestamp alone being unique, constant physical scan work or this chapter's throughput. |
| [2 · PostgreSQL 18 Indexes and ORDER BY](https://www.postgresql.org/docs/18/indexes-ordering.html) | Matching B-tree order can satisfy ORDER BY/LIMIT without sorting the entire candidate set. | That the planner chooses our index for all distributions or every query visits only 20 rows. |
| [3 · PostgreSQL 18 LATERAL](https://www.postgresql.org/docs/18/queries-table-expressions.html#QUERIES-LATERAL) | A correlated LATERAL is evaluated per preceding input row; LEFT JOIN preserves a root with no replies. | Turning 20 probes into one, global LIMIT fairness or measured bounded execution time. |
| [4 · Redis Lua introduction](https://redis.io/docs/latest/develop/programmability/eval-intro/) and [transactions](https://redis.io/docs/latest/develop/using-commands/transactions/) | Scripts execute without command interleaving; all key names must be supplied; Redis transactions lack rollback. The actual Lua failure probe separately verifies retained earlier writes. | SQL-style rollback, disk durability or script persistence. |
| [5 · Redis Cluster specification](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/) | Multi-key operations need a shared slot; hash tags co-locate keys. Acknowledged writes can be lost with asynchronous replication. | Sharding one hot comment automatically, or zero-loss failover. |
| [6 · AWS transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html) | Business mutation plus delivery intent removes the direct dual-write gap; consumers still need duplicate handling. | Exactly-once transport or a transaction spanning database and queue. |
| [7 · PostgreSQL 18 constraints](https://www.postgresql.org/docs/18/ddl-constraints.html) | Composite unique/primary keys and self-referential foreign keys; key enforcement and reference ownership. | Parent/root transitive agreement, immutable relation policy, or automatic tree cycle prevention. Those remain application contracts. |
| [8 · Nishtala et al., NSDI13 §3.2.1](https://www.usenix.org/system/files/conference/nsdi13/nsdi13-final170_update.pdf) | Key-bound lease tokens arbitrate fills; deletes invalidate tokens; waiting clients reduce herds. | This chapter's independent absolute-expiry design or reuse of Facebook capacity numbers. |
| [9 · PostgreSQL 18 transaction isolation](https://www.postgresql.org/docs/18/transaction-iso.html) | Each Read Committed SELECT sees its statement snapshot; successive SELECTs can differ. ON CONFLICT DO NOTHING may wait for an insert absent from its original snapshot, so the batch payload is reread in a new statement. | Cross-page stable snapshots, or treating a long Repeatable Read transaction as a fresh source for five-second expiry. |
| [10 · Redis persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/) | RDB snapshots, AOF and no-persistence options have different durability windows. | Our ten-second flush period being a permanent maximum loss window or exact membership recovery from count alone. |

The SQL uses PostgreSQL 18 semantics, but no PostgreSQL executable was available locally.
SQLite actually exercised equivalent indexed per-root queries and transactional ledgers;
the local Redis 7.2.5 instance actually executed the scripts. Neither is reported as a
production deployment or a PostgreSQL/Redis-cluster experiment.
