# Ch22 一手来源复核

2026-10-23 实际浏览以下文档。产品契约不证明自设计内部协议；PG 固定18版；论文使用原始版本。章节就近引用，所有自设容量、lease、quarantine、复制/EC确认策略均标教学参数。

| 编号 | 一手来源 | 本章使用的具体事实及限制 |
|---|---|---|
| 1 | [AWS S3 consistency](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html#ConsistencyModel) | 单key更新原子、成功PUT后的GET/LIST读取已写值；没有跨key原子更新。本章hash LIST无全局共同快照，明确弱于公开契约；不借厂商契约证明自建共识或publication。 |
| 2 | [Haystack, OSDI2010 §3.4](https://www.usenix.org/legacy/event/osdi10/tech/full_papers/Beaver.pdf) | 多记录大文件、内存offset映射和可恢复索引；索引checkpoint可以异步。借pack机制，未照搬历史规模或零I/O结论。记录不可变布局/GC是本章自己的机制。 |
| 3 | [f4, OSDI2014 §5](https://www.usenix.org/system/files/conference/osdi14/osdi14-paper-muralidhar.pdf) | 热/温BLOB分层，RS以更低存储开销换修复与吞吐代价，MDS性质。论文实际cell参数与地理保护不等于本章4+2/三AZ教学放置；读四写一是普通单缺块推导。 |
| 4 | [AWS AbortMultipartUpload](https://docs.aws.amazon.com/AmazonS3/latest/API/API_AbortMultipartUpload.html) | 已在途part可能继续成功/失败；可能要重复abort并通过ListParts为空核对。不是一次取消即物理清空；我们的fence/drain/sweep并非S3内部实现。 |
| 5 | [AWS Multipart overview](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html) | Init/part/complete、parts独立与乱序、同编号新part替换旧part、完成按提供清单的编号拼接、未完成upload无自动过期。我们要求全部登记parts入清单，是更强教学假设；60秒租约非S3默认。 |
| 6 | [AWS integrity](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-upload.html) | 校验算法/full与composite区别；multipart ETag不等于整体MD5。示例SHA-256块/整对象与CRC32C附加校验是本章选择，不宣称厂商默认。 |
| 7 | [AWS durability](https://docs.aws.amazon.com/AmazonS3/latest/userguide/DataDurability.html) | Standard等类别跨至少三个AZ；99.999999999% durability是年度designed-to目标。OneZone等类别不同；不将目标算成本设计实测耐久率。 |
| 8 | [AWS S3 SLA](https://aws.amazon.com/s3/sla/) | 月度可用比例/错误率定义与抵扣条款；与年度durability设计目标不同。本章未复制厂商SLA百分比当自设承诺。 |
| 9 | [AWS delete markers](https://docs.aws.amazon.com/AmazonS3/latest/userguide/DeleteMarker.html) | versioning-enabled bucket简单DELETE创建marker、表现为删除；保留旧版本。我们的读lease/GC撤销流程为自设，不冒充产品内部。 |
| 10 | [PostgreSQL18 explicit locks](https://www.postgresql.org/docs/18/explicit-locking.html) / [isolation](https://www.postgresql.org/docs/18/transaction-iso.html) | FOR UPDATE等待/锁与事务结束释放，Read Committed下锁后处理当前行。正文规定共同name锁与固定顺序，全部调用方遵循；不把跨服务Data纳入PG事务。运行模型用SQLite BEGIN IMMEDIATE，不声称实测PG分布式行为。 |
| 11 | [AWS presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html) | URL能力受签发者权限/方法/对象/期限约束，可持有使用；短TTL不意味着即时撤销。内部Data grant的version/layout/lease/fence要求是自设计契约。 |
| 12 | [AWS CompleteMultipartUpload](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CompleteMultipartUpload.html) | 必须提供完整parts清单、按编号升序拼接；初始HTTP200之后可出现embedded error，直接客户端解析最终body，SDK执行错误处理。该行为与本设计固定回执/单赢家状态机分别说明。 |

没有浏览并据此宣称真实磁盘、真实PG/共识、S3/RS代码、跨AZ故障、即时ACL撤销或生产吞吐已验证。文档支持API/机制事实；具体实现保证仍依赖正文列出的authority与Data契约。
