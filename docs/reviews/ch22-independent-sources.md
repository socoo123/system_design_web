# Ch22 · 独立一手来源抽核

2026-10-23，基于当前正文重新浏览下列一手来源。没有只复述作者报告或把产品公开契约当成本地模型的实现证明。

| 章节主张 | 本次核验来源 | 结论与界限 |
|---|---|---|
| 单键更新原子，成功 PUT 后 GET/LIST 可见；本设计 LIST 较弱 | [AWS S3 consistency](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html#ConsistencyModel) | 官方列明单键 old/new 原子以及成功 PUT 后 GET/LIST；正文明确自设多片 LIST 无共同快照，没有冒称达到 S3 全部接口保证。 |
| delete marker 隐藏无版本读，旧版仍可显式访问 | [Working with delete markers](https://docs.aws.amazon.com/AmazonS3/latest/userguide/DeleteMarker.html) | 与正文的逻辑删除/保留版本区分一致；租约、RECLAIMING 和 GC 是本文方案。 |
| Abort 不能当作在途 part 一定已消失 | [AbortMultipartUpload](https://docs.aws.amazon.com/AmazonS3/latest/API/API_AbortMultipartUpload.html) | 官方说明在途上传可能成功，要重复 abort/ListParts 核查；正文先 fence/drain 后清理是设计协议，不冒称 S3 内部状态机。 |
| 初始 HTTP200 可能携带最终错误 | [CompleteMultipartUpload](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CompleteMultipartUpload.html) | 官方支持正文必须解析完整响应的说法；同页确认按 part number 递增拼接。 |
| 独立/乱序 parts，同编号替换，未完成上传需完成或终止 | [Multipart overview](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html) | 与正文公开协议比较一致；本设计要求所有已登记 part 精确清单，更严格且已声明。 |
| multipart ETag 不是通用整对象 MD5 | [Object integrity](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-upload.html) | 官方区分 full/composite 算法及 ETag；正文没有把 CRC32C 称 S3 默认，也没将 checksum 视为鉴权。 |
| 11 nines 是耐久设计目标，SLA 是月度可用率/抵扣 | [Data durability](https://docs.aws.amazon.com/AmazonS3/latest/userguide/DataDurability.html), [S3 SLA](https://aws.amazon.com/s3/sla/) | 实际页面仍有 99.999999999% 年耐久 design target；SLA 按月度率与 service credit。正文 A10 的99.9%是自设读SLO。 |
| 能力需要目标/方法/权限/期限绑定 | [Presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html) | 官方支持限时授权与签名参数；S3 已开始下载可跨 URL 到期继续，不能把本章自设读租约强行当成其内部实现。正文已区分。 |
| pack/offset 内存索引、追加日志恢复 | [Haystack §3.4](https://www.usenix.org/legacy/event/osdi10/tech/full_papers/Beaver.pdf) | §3.4.1–4 支持偏移定位、同步追加及从 volume/index 恢复；没有用历史数据说明当前生产容量，也没宣称随机 payload 读零 I/O。 |
| 热/温分层与编码成本、MDS 属性 | [f4 OSDI2014](https://www.usenix.org/system/files/conference/osdi14/osdi14-paper-muralidhar.pdf) | 原文有热/温隔离、RS 与修复代价，实际参数10+4；正文4+2明确是教学码，未误写成 f4/S3 参数。 |
| 数据库行锁边界 | [PostgreSQL18 explicit locking](https://www.postgresql.org/docs/18/explicit-locking.html) | FOR UPDATE 锁与事务释放支持名字/上传共片事务说明；不覆盖远端Data RPC，本地SQLite模型已声明更粗的锁粒度。 |

主要容量数字另外以 Decimal 重算，证据 `ch22-independent-numeric-results.json`。上述来源只支持接口/机制，不证明 Metadata 共识、Data fsync、跨 AZ 复制、真实 RS 编解码、读能力签名、时钟界限、生产 GC 或 SLA 达标。
