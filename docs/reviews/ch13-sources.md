# Ch13 一手资料核验 · 2026-10-23

执行时通过 web 工具重新打开官方原文；下表记录支持的具体结论。未把教学数字当作厂商性能数据。

| 正文引用 | 官方原文 | 实际核对点 |
|---|---|---|
| [1] | [Stanford IIR · Processing Boolean queries](https://nlp.stanford.edu/IR-book/html/htmledition/processing-boolean-queries-1.html) | 原有引用，本轮 web 原站、www-nlp 别名和官方 PDF 均超时；curl 也遇到 SSL 失败。没有宣称重新下载成功。双指针每步至少推进一个位置，最多 x+y；[2,5,9] 与 [5,9,12] 的交/并集在本章独立推理。 |
| [2] | [Elastic · Index and search analysis](https://www.elastic.co/docs/manage-data/data-store/text-analysis/index-search-analysis) | 索引与查询通常使用同一分析器以匹配 token；前缀 autocomplete 可以使用不同规则。本章写“兼容”，没有绝对化成“必须完全相同”。 |
| [3] | [Lucene 9.12.1 · BM25Similarity](https://lucene.apache.org/core/9_12_1/core/org/apache/lucene/search/similarities/BM25Similarity.html) | 固定版本默认 k1=1.2、b=0.75；IDF 见该 API 的方法说明。另打开官方 9.12.1 BM25Similarity.java，确认 scorer 使用省去共同常数因子的 TF 表达式。1 与 1.57 是本章等长、教科书 TF 饱和因子的相对演算，不冒充 Lucene 原始完整分数。 |
| [4] | [Elastic · Paginate search results](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/paginate-search-results) | 深 from/size 加大各片保留候选；默认窗口 10,000；PIT 内 _shard_doc 唯一且不变；下一轮保留 query/sort、使用最新 PIT ID 和完整 sort 数组。 |
| [5] | [Elastic · Near real-time search](https://www.elastic.co/docs/manage-data/data-store/near-real-time-search) | refresh 打开搜索可读段，区别于磁盘提交。原文周期一秒默认附最近 30 秒有搜索的条件；3 秒/33 秒为本章目标预算，且新代码绝对期限不被迟到回填续长。 |
| [6] | [Elastic · Search API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-search)；[Search shard routing](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/search-shard-routing) | query_then_fetch 本地 term/doc 统计；dfs_query_then_fetch 全局统计多一轮。allow_partial_search_results 默认 true；本章显式关闭并检查 timed_out、分片失败。路由在每个逻辑片选择一份副本，不把副本当独立文档分区。 |
| [7] | [Elastic · Index API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-index) | external 只接受严格更大版本；相同或更小触发 409；external_gte 可覆盖相同版本，不能用来掩盖载荷冲突。正文逻辑墓碑是本章设计，不声称 ES 物理 DELETE 永久保留版本。 |
| [8] | [Lucene 9.12.1 · FSTCompletion](https://lucene.apache.org/core/9_12_1/suggest/org/apache/lucene/search/suggest/fst/FSTCompletion.html) | 前缀查找、最多 num、权重离散桶；不是本章 Trie 里精确热门 top-5 的同义实现。80 MB 与 O(m+k) 均为自行推导。 |
| [9] | [Elastic · Delete API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-delete) | 物理删除版本仅短期保留，期限由 index.gc_deletes 决定。因此代码用同 ID 的 deleted=true INDEX 记录，跨重放和重建保留，不将永久保证建立在 DELETE 元数据上。 |
| [10] | [Elastic · Get API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-get) | GET 默认 realtime，不受搜索 refresh 的近实时可见性限制；正文仍处理不可用/异常状态，不把 read-before-write 当原子裁决。 |
| [11] | [Elastic · Open PIT API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-open-point-in-time) | 创建时缺片也必须失败；后续搜索沿用最新 PIT ID，不另指定 index/routing/preference。旧段、文件句柄、删除状态跟踪有资源代价；keep_alive 是下一轮所需续期，并不要求一开始覆盖整次遍历。 |

永久逻辑墓碑、源端完整事件/版本、规范摘要检查、失败停源分区、100 个候选扫描预算、权威过滤、配置世代捕获及 HTTP 400/410/503 均为教学设计/适配器契约。它们通过本地探针验证了状态轨迹，不等同于对线上 Elasticsearch、业务数据库、Redis 或权限服务进行了故障实验。

数字复算见 `ch13-code-results.json`：925.9259 平均 QPS、9259.259 峰值；4K/片、16K 聚合；200 GB 逻辑索引/600 GB 三份；40,080 候选/1,282,560 B，对比 80 候选/2560 B 为 501 倍；0.99⁴=0.96059601；120,000 积压按净 400/s 需 300 秒；前缀 ID 数组 80 MB。
