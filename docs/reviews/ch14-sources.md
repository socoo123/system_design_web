# Ch14 一手资料重新核验

2026-10-23，通过web浏览官方/原作者页面。编号与最终正文一致；没有把本章
规模、价格、速率或节省率归给厂商。Apple JS页面的正文使用其官方Markdown
endpoint通过curl读取；该工具读入成功，web正文抓取因content-type失败。

| 编号 / 一手来源 | 核对结论和本章适用边界 |
|---|---|
| [1] [S3 presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html) | 方法、key、期限受限；URL到期前可多次使用。不能据“预签名”推导一次性写入或物理不可变。15min是本章输入。 |
| [2] [S3 multipart](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html) | 每part为连续字节，可独立重试；完成按part number拼接；完成/abort前会持续占存储；ETag不一定是完整对象MD5。上传块与播放随机访问点无关。 |
| [3] [S3 events](https://docs.aws.amazon.com/AmazonS3/latest/userguide/EventNotifications.html) | 设计为至少一次，通常秒级但可能一分钟或更久；不能当排队/转码延迟上界。 |
| [4] [RFC8216](https://www.rfc-editor.org/rfc/rfc8216.html) | §4.3.4清单层次，§4.3.5.1独立片，§6客户端/服务端行为。4秒与0.8吞吐系数是本章策略。 |
| [5] [Apple authoring spec](https://developer.apple.com/streaming/hls-authoring-specification-for-apple-devices.html) | 重新核对时通用§8.22为SHOULD对齐音视频档边界，tvOS修订§8.22为MUST对齐视频档；§7.4视频片以IDR开始。原章泛称Apple全设备必须对齐已按范围修正。规范也推荐6秒片，因此不把本文4秒写成Apple常数。 |
| [6] [Apple CMAF](https://developer.apple.com/documentation/http-live-streaming/about-the-common-media-application-format-with-http-live-streaming-hls) / [官方Markdown](https://developer.apple.com/tutorials/data/documentation/http-live-streaming/about-the-common-media-application-format-with-http-live-streaming-hls.md) | HLS与DASH可引用共同addressable media；switching set、初始化、音视频分轨、profile/加密仍有约束。A4一次合并GET只是算例，CMAF分轨会增加请求，正文已明说。 |
| [7] [Netflix per-title](https://netflixtechblog.com/per-title-encode-optimization-7e99442b62a2) | 2015原作者工程文：按title复杂度选择码率/分辨率配方，不照搬某场实验节省百分比。 |
| [8] [CloudFront Origin Shield](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/origin-shield.html) | 共享缓存和同对象并发合并，最低可到一次源请求。1000不同key不能合成1次；1000与100Gb/s均本章假设。 |
| [9] [CloudFront signed cookies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-signed-cookies.html) | 验签/策略检查后才以正常缓存方式服务，custom policy可授权多资源。GET缓存命中不跳过验权；OPTIONS有官方例外，本章每次请求验权明确指私有媒体GET。 |
| [10] [Netflix AV1 on TVs](https://netflixtechblog.com/bringing-av1-streaming-to-netflix-members-tvs-b7fc88e42320) | 2021原作者工程文讨论能力测试、需求排序与QoE；不支持“未来某年才可用”“固定省30%”或强制GPU。25%、$6、8000都是本文教学假设/推导。 |
| [11] [S3 versioning](https://docs.aws.amazon.com/AmazonS3/latest/userguide/versioning-workflows.html) | versionId由S3生成且不可编辑，同key后续PUT保留旧物理版本。它不防有权限主体删版本，也不替代GC引用保护。已启用且传播完成、持续启用、精确GET和删除权限限制是本文前提。 |
| [12] [S3 conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html) | If-None-Match:*存在当前对象时412；并发删除可引发409。单PUT409可重试，CompleteMultipartUpload409须重新启动multipart。删除标记可能允许新写，所以worker无删除权限，GC还需元数据发布门。 |
| [13] [S3 upload integrity](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-upload.html) | multipart完整校验支持CRC64NVME/CRC32/CRC32C，SHA256为COMPOSITE。本例源明确选CRC32/FULL_OBJECT并在worker同算法复算；产物SHA256是完整GET字节摘要。没有把HEAD复合摘要与整文件SHA256直接比较。 |
| [14] [PostgreSQL18 row locks](https://www.postgresql.org/docs/18/explicit-locking.html) | FOR UPDATE覆盖冲突行直至事务结束；网络期间不持锁。多表事务与既定锁序支持本文的条件提交，但未实际运行PG并发或切主实验。 |
| [15] [PostgreSQL18 READ COMMITTED](https://www.postgresql.org/docs/18/transaction-iso.html) | 唯一冲突可来自语句快照不可见的并发赢家。幂等创建先回滚，再用新语句查赢家；不在已失败事务里继续SELECT。 |

发布/GC状态门、隔离epoch前缀、引用保留和原子ready/DONE是**本章推导的设计**，
不是S3/CloudFront提供了跨对象存储与数据库的事务。引文仅支持相应底层语义。
