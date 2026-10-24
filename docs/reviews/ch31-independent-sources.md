# Ch31 独立一手来源抽核

2026-10-24实际web读取。以下只支持对应机制，不转移论文吞吐或给示例加生产保证。

- [Faiss MetricType](https://github.com/facebookresearch/faiss/wiki/MetricType-and-distances)：核对平方L2、内积方向、库内和查询双方归一化的cosine；Java三种distance低值优先与正文一致。
- [Faiss indexes](https://github.com/facebookresearch/faiss/wiki/Faiss-indexes)：核对4d原向量字节、PQ/ID公式、nprobe/nlist近似受不均list影响；HNSW不支持移除向量的限制确在HNSW段，不能混读Flat的remove能力。没有把2M邻接槽位预算当完整内存公式。
- [HNSW arXiv v4](https://arxiv.org/abs/1603.09320v4)：固定2018修订；随机层次与逐层导航。图中上下层F同ID，ef_search不被当访问上限/召回保证。
- [Faiss Implementation notes](https://github.com/facebookresearch/faiss/wiki/Implementation-notes)：PQ距离表与IVFPQ默认残差编码；仅核对算法事实，没有套用当前内部启发式阈值。
- [ACORN v1 §5.3](https://arxiv.org/html/2403.04871v1)：实际读§5.3的一跳/两跳邻居扩展，再过滤并截断；正文“读取不合格X邻接找B、X不出结果”是局部示意，且明确不承诺任意谓词连通。
- [pgvector v0.8.0 README](https://github.com/pgvector/pgvector/blob/v0.8.0/README.md)：固定版本中近似扫描后过滤、可选iterative scans及max_scan_tuples/max_probes停止边界。正文没有把ACORN示意冒充pgvector实现。
- [Milvus v2.6.x Timestamp](https://milvus.io/docs/v2.6.x/timestamp.md)：Service_timestamp对比Guarantee_timestamp决定已包含/需等待；这一最低包含语义不同于本章不可变精确cut/bundle。正文明确本例无2秒时钟证明，未借此保证全局事务快照。
- [SQLite Isolation](https://www.sqlite.org/isolation.html)与[Transaction](https://www.sqlite.org/lang_transaction.html)：独立连接提交可见性、单写者及BEGIN IMMEDIATE。示例关闭read_uncommitted、同一authority库；不由SQLite推出远端索引加载或复制耐久保证。

算法/数据库出处与教学假设已区分。307.2GB、200/s、50ms、ef/M/PQ参数、5000点、120/s副本预算均为自设演算，独立复算另见numeric结果；本复核没有运行ANN、向量引擎或生产性能实验。
