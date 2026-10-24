# Ch30 独立来源抽核 · 2026-10-24

复核者独立用web读取以下一手官方文档/原论文，未把作者来源表当作免审依据。
抽核结论没有发现引用误用，产品版本与章内自设合同分开。

| 来源 | 直接支持的结论与限制 |
|---|---|
| [Elastic RRF](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/reciprocal-rank-fusion) | 逐路按1/(k+rank)累加，rank从1开始，缺席不加；rank_constant默认60。章内80上限/去重/权限是自行设计。 |
| [pgvector v0.8.0固定README](https://github.com/pgvector/pgvector/blob/v0.8.0/README.md#filtering) | 近似索引扫描之后再过滤，结果可不足；0.8.0迭代扫描到足够或扫描上限。未当成所有引擎的过滤顺序。 |
| [Microsoft security-filter pattern](https://learn.microsoft.com/en-us/azure/search/search-security-trimming-for-azure-search) | principal字符串过滤自身不负责认证/授权；与该站另列的native ACL能力不同。章内明确讨论普通过滤。 |
| [ALCE原论文§3.3](https://aclanthology.org/2023.emnlp-main.398.pdf) | citation recall判断引用段落是否支持陈述，precision识别无关引用；使用NLI及人评。合法ID并不证明支持，符合正文。 |
| [RAGAS原论文§3](https://aclanthology.org/2024.eacl-demo.16.pdf) | 拆陈述后估计上下文支持；不是检索Recall或源内容真实性保证。章内没有套用后来API名称。 |
| [Elastic refresh API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-indices-refresh) | refresh使近期写入可被搜索；不能由此推出跨原文库/双索引原子发布或所有服务读者永久可见。正文正确保留适配契约。 |
| [Microsoft chunking guidance](https://learn.microsoft.com/en-us/azure/search/vector-search-how-to-chunk-documents) | 内容结构/大小/重叠需按语料评测；512/25%是建议起点。章内512/64及12.8%膨胀均为自设例。 |

本轮复核不测厂商引擎、ANN召回、LLM支持准确率或生产tokenizer。
权限、published-manifest角色检查、全包撤销、check/send与迁移屏障是本章设计，
不能因这些论文/文档存在就宣称实现得到分布式实证。
