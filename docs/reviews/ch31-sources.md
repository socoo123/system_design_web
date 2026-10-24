# Ch31 · 一手来源核对

2026-10-24 通过 web 工具实际打开并核对。以下是正文支持句子的映射；
参数、机器、2 s 可选上界与吞吐均为本章假设。未引用厂商性能成绩。

| 页内编号 | 来源与版本 | 支持的本章说法 / 核对位置 |
|---|---|---|
| 1 | [Faiss indexes](https://github.com/facebookresearch/faiss/wiki/Faiss-indexes)，项目 live wiki，页面显示最近修订 2025-07-28，访问 2026-10-24 | Summary 表的 float32 `4*d`、PQ `ceil(M*nbits/8)`、IVFPQ 额外 8 B ID；Cell-probe 说明 nlist/nprobe；IndexHNSW Supported operations 明确不支持移除向量。只对 Faiss 限制，不泛化到所有 HNSW 引擎。 |
| 2 | [MetricType and distances](https://github.com/facebookresearch/faiss/wiki/MetricType-and-distances)，项目 live wiki，访问 2026-10-24 | METRIC_L2 是平方欧氏距离；cosine 可通过建索引和查询两端归一化映射到最大内积。本章再定义 canonical 低值优先 distance；该输出约定是设计选择。 |
| 3 | [HNSW paper](https://arxiv.org/abs/1603.09320v4)，arXiv v4，2018-08-14 | 随机指数衰减层级、上层导航与底层探索。图中距离是教学值；不移植论文规模、复杂度常数或吞吐。 |
| 4 | [Faiss Implementation notes](https://github.com/facebookresearch/faiss/wiki/Implementation-notes)，项目 live wiki，访问 2026-10-24 | Precomputed tables in IVFPQ 的 residual 编码与查表距离；Reranking 节的候选细化。rescore 不能恢复候选生成没找到的点是本章基于机制的推导。 |
| 5 | [ACORN](https://arxiv.org/html/2403.04871v1)，arXiv v1，2024-03-07 | §5.3：查询时展开一跳/两跳邻居，再过滤/截断；§5 的小选择率 pre-filter fallback；§6.3 Connectivity 明确无任意数据集图连通性理论保证。图只借两跳思路，不冒充完整 ACORN-1，不搬性能倍数。 |
| 6 | [pgvector README](https://github.com/pgvector/pgvector/blob/v0.8.0/README.md)，固定 tag v0.8.0 | Filtering/Iterative Index Scans：近似索引扫描之后过滤；v0.8.0 可启用继续扫描直到够数或 `hnsw.max_scan_tuples` / `ivfflat.max_probes`。不将 strict_order 解读为精确 Recall 保证；不声称使用 ACORN。 |
| 7 | [Milvus Timestamp](https://milvus.io/docs/v2.6.x/timestamp.md)，固定 v2.6.x 文档，访问 2026-10-24 | Guarantee_timestamp 的更新包含前提；Service_timestamp 连续完成水位；低于 Guarantee 时等待。只支持“追齐再读”的类比，不把最低水位当固定 cut，也不把本章 bundle、2 s 或跨片语义归给 Milvus。 |
| 8 | [SQLite Isolation](https://www.sqlite.org/isolation.html) 与 [Transaction](https://www.sqlite.org/lang_transaction.html)，官方文档，访问 2026-10-24；实际库 3.51.0 | 独立连接只见已提交事务；SQLite 单写者串行化；BEGIN IMMEDIATE 在开始时尝试写事务，其他写者可 BUSY。示例 timeout=10 s，有明确 COMMIT/ROLLBACK。不能证明独立向量库与 SQLite 同事务，也未验证电源/复制故障。 |

旧版 11 份引用整理为以上 8 份；移除无核心正文落点的 DiskANN/FreshDiskANN、
Milvus Data Processing 和 Qdrant 产品行为旁支，Milvus Timestamp 与 pgvector 重排编号，新增
SQLite 原子边界来源。所有动画 title/desc ID 保留；ref-* 为引用锚点的重排，非删动画。

本章自己的实现/协议：schema registry、WAL durable/search-ready 分离、不可变 JSON/MVCC 根、
全分片 bundle、alias seq CAS、query pin、attempt/gather 与 rollback barrier；
这些是教学设计与本地模型结果，不宣称为任何向量产品的实际内部协议。
