# Ch37 存储选型 · 交叉独立复核

2026-10-24，Ch39作者以GPT-6.1-Sol + Max进行只读复核，未另派agent。**在正文明确的本地数据库、可信对象验证器及完整manifest/正确worker前提下通过；未发现新增P0/P1或阻碍阅读的P2。实施期对象proof串用P1已用独立新输入确认关闭。** 主代理负责最终整合验收。

开始前保存[全部初始文件哈希](ch37-independent-before-source-hashes.json)；完整读中英正文、3段展示源、适配/schema/README、12张网格闪卡，以及7组38帧title/desc/图内关系。结束时[全部当前哈希](ch37-independent-after-source-hashes.json)确认章节与全部文本源码hash始终相同；期间原有__pycache__/storage.cpython-311.pyc被外部移除，原before条目保留，[快照差异](ch37-independent-snapshot-diff.json)如实记录，未伪称全部文件从未改变。复核设置PYTHONDONTWRITEBYTECODE，不在作者目录生成缓存；只写独立前缀证据和 `screenshots/ch37-independent/`。

## 独立重走与结果

不是作者57/16项或主代理48/10项的重述。以下输入由本复核新建并真实运行，脚本和细项见[验证总记录](ch37-independent-validation.json)。

| 机制 | 独立输入与证据 |
|---|---|
| 完整请求绑定 | 新caller、Unicode投递点及重复`red:west`数量2+3，与蓝色SKU同提交；重排/合并等价请求复用原结果，换投递点/数量冲突。零/负/布尔/float/text/过量、空/额外字段/33行等拒绝且不落幂等记录。 |
| 原子结账 | 第二个排序SKU缺货后，前一个库存和订单/明细全撤销，稳定OUT_OF_STOCK被持久化；补货同键仍拒绝，新意图新键可成功。6独立连接争最后稀缺SKU且先更新普通SKU，仅一单且失败者全回滚；5连接同键只扣一次，4个参数版本仅一个绑定胜出。 |
| 提交/回执/快照 | 本地WAL文件中，主库旧读事务得到0/0，新视图得到1；丢回复后原键读同一order_id不重扣。真实子进程exit23在COMMIT前、exit24在后退出，再打开DB分别看到回滚/持久，并同键恢复一单。不是断电或复制切主实验。 |
| 对象proof P1关闭 | 新owner、上传alpha/beta、37字节同内容、bucket-eu/us fixture：原3字段证明拒绝；完整B证明不能发布A，改caller/upload或只改namespace/object_key/size/checksum均不能提交A。准确A proof可提交/重试；COMMITTED下换version/key/size/checksum冲突。 |
| 对象CAS竞争 | 过期发布失败，6连接发布/清扫竞争仅一者得到ABORTED删除权；重复清扫不再获权，迟到发布不复活。4连接相同证明发布同一对象结果。另真实SQLite写锁阻塞发布跨unixepoch截止，锁释放后SQL采样拒绝，仅清扫可赢。 |
| 完整准确SUM | 新查询/快照/manifest、3片含退款负数与远超long的BigInteger；乱序和重复不多加，缺片/零回复INCOMPLETE，5个绑定字段逐一变更、未知片、冲突部分和均拒绝。已验证空manifest为0，空manifest收到额外贡献拒绝。 |
| 外部信任边界 | 刻意让worker给错sum但保持hash时，本地协调者会接受；刻意把“可信manifest”漏掉片时也不能自行发现。两个边界用实际输入确认，正文/README已明确不覆盖，未当代码缺陷或分布式正确性证明。 |

[独立SQLite脚本](ch37-independent-contracts.py)真实跑 **71项**，结果[JSON](ch37-independent-contract-results.json)；[独立Java17 probe](ch37-independent-ExactSumProbe.java)编译原ExactSum并跑 **16项**，结果[JSON](ch37-independent-sum-results.json)。计数是断言，不等于87次独立分布式实验。没有借用作者runner的断言计入独立数字。

## 数字、事实与图文对应

[37处独立复算/集合检查](ch37-independent-numeric-results.json)：40×8=320、年1,261,440,000笔；快照1.89216TB+两索引0.1009152TB=1.9930752TB/份；四份7.9723008TB、活旧版本模型10.9619136TB。三页模型7,864,320B/s与16.384倍，热点96/s×10ms=0.96；聊天0.8MB/s/最近20KB、posting1.6KB、金额10.09152GB/加状态11.35296GB及187.5裸字节比；WA6/12分别60/120MB/s。没有把裸字节比当提速，WA分子明确含WAL/flush/合并。

[一手抽核](ch37-independent-sources.md)覆盖PostgreSQL18 WAL/复制/隔离、SQLite单写者/RETURNING/unixepoch、Dynamo缓冲写/sloppy成员、Bigtable2006单行与限定符、Dremel2010只读分析、S3条件写及RocksDB sync/stalls。对应图2 ACK标为额外假设，KV与列存能力均按该例/历史论文限定；本地WAL不冒充远端回放或灾难RPO。

结账代码与D1同一事务边界；D4直传与HEAD/元数据两库边界、准确proof和CAS对应；D7缺片红线与INCOMPLETE对应。EN、图注和闪卡同步这些边界，未发现核心事实互相冲突。

## 实际页面与逐帧目视

原7组38帧、76个动画ID与帧序保留。独立比较发现20份SVG改变、18份逐字不变；修改组D1/D2/D4/D5/D6/D7共33帧。独立Chrome渲染全部38帧×两主题，**实际打开六修改组12张全帧接触表，覆盖33×2=66画面**，另看未改D3浅色全组与真实390px代码/列扫描右段，共15张实际查看图片及哈希列于验证总记录。D1 WAL注释/返回标签、D2新旧成员与额外ACK前提、D4条件发布、D5posting注释/故障回程、D6 WA/Bloom与D7完整片段/失败均可追踪，未见新增遮字或语义误线。

[独立浏览器结果](ch37-independent-browser-results.json)：320/390/768/1440×两主题×三语言共24不同组合，真实innerWidth/scrollWidth一致，展开details仍无整页横溢；152次翻帧、3段实际逐字复制，播放/键盘、倍速循环、12张闪卡网格、已读和设置持久化通过，0页面/资源错误。320both共有topbar约203px为主代理已记录F04的既有非阻碍P2，本复核不改共享UI；手机验证是Playwright真实viewport。

实际执行的命令、退出码和证据索引见验证总记录：独立Python、原Java+新probe、37处复算、作者同源校验、本章audit、diff检查及独立render/browser均通过。Java二进制为Oracle JDK17.0.10，Python3.11.8，SQLite版本记录在JSON。未只看终帧或用页面溢出检查代替图内验收。

## 签署与限制

当前章节SHA256：`2a5a4663abc4f6329d24465ed182ffceaec704d06bd4c4be47c536967585b505`；全部章节/示例文件签署字典在after JSON，before原样保留；全部文本源码hash未变，缓存移除另列差异。复核没有修改作者页面、示例、PLAN、共享文件或批次证据。

没有真实PostgreSQL/RocksDB/S3/Bigtable/Dynamo/列文件服务、远端worker验签、分布式快照、断电、复制提升或生产压测。本地进程退出不能证明硬件持久，hash不能证明worker算术，CAS不能原子化对象/元数据两库；这些限制均已在正文和README明示，不影响本次教学契约范围内通过。
