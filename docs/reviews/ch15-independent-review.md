# Ch15 网盘 · 交叉独立复核

2026-10-23。复核者：Ch14作者，GPT-6.1-Sol / Max。
只读页面与示例；本次只写`ch15-independent-*`及专属截图，没有直接修Ch15。
最终结论：**通过。1项P1与1项P2均已独立复验关闭，没有剩余P0/P1/P2。**
最终SHA256：`39385aea292a15a9f37a7482ed82725a18e913183b1eb4415a7e325af780eb61`。

## 发现与复验

| 编号 | 级别 | 证据 / 修复与结果 |
|---|---|---|
| R1 · tenant范围家族 | P1 | 初版`complete`的`UPDATE tenant_guard`没有WHERE，GC末句只有generation条件，但DDL主键是(tenant,generation)。原schema创建A/B，两者拥有同generation；照原SQL执行，A完成同时把B从(head=501,used=70)改成(502,78)，GC把B的READY也改为DELETED。guard锁不会自动给后续SQL加过滤。作者已对所有本地键/SQL/辅助函数显式绑定认证tenant。独立复跑原SQL负例与修后从源码提取的相同输入，B保持(501,70)和READY；关闭。 |
| R2 · D1入口标签 | P2 | 全5帧`session / version`在真实Chrome的bbox为x112.328..207.672，穿过x120边界；`init / commit`左端123.719只留3.72单位。作者仅将两个标签中心x160→180，线路/节点保持。独立复验两主题全5帧与真实390左中右30图，20个bbox最小左距12.328125、最小右距22.328125，实际目视留白成立；关闭。 |

R1按问题家族计一次，不把guard、File、Session、pins、GC分别凑问题数。
已逐段核对修复后的schema/pin/complete/changes/gc与相邻中英说明：

- 所有辅助函数、逻辑键、Version/VersionBlock、Receipt、Change/Outbox绑定tenant。
  File、Session、SessionBlock、tenant_guard、GC代际与DeleteJob更新显式tenant谓词；
  durable delete job在对象DELETE前以(tenant,generation)重新加载，不能信消息带来的任意key。
- 相关目录/ACL、SessionBlock pin、版本引用和GC目录都在同一Metadata权威；
  所有写者先锁tenant guard直到事务结束。这个串行化契约有热租户代价，没有跨库锁承诺。
- 上传先读取精确staging物理版本核摘要/长度，再确认不可变final generation；
  UNKNOWN不晋升READY。复用必须来自当前可读版本，提交再次检查来源读权；裸hash不授予采用权。
- 完成先恢复owner/key/intent最小回执，再判父版本；同会话一结果。撤权后可回自己最小状态，
  不返回manifest/URL；新提交和内容访问仍判当前ACL。全部保留版本的逻辑长度计费与`used+=size`一致。
- 变更计数是guard内普通行，事务回滚同时回滚计数；不是nextval分号。固定H包括H=0，
  授权过滤在原日志分页之后，空可见页也推进扫描位置。ACL epoch/floor失效必须重建快照。
- GC先同事务标DELETING并留精确DeleteJob，外部删除后才标DELETED；UNKNOWN留DELETING。
  新同摘要对象另用新generation，旧DELETE没有指向新key的机会。读pin覆盖URL和有界在途排空，
  不是把URL过期当读取结束；真实排空层明确未实现。

## 独立正常与反例执行

脚本：[ch15-independent-probe.py](ch15-independent-probe.py)；
结果：[ch15-independent-probe-results.json](ch15-independent-probe-results.json)。
**40项检查通过。** 没有把作者65项报告复述成自己的执行结果：脚本仅用AST加载
作者模型定义作为被测实现，不执行其顶层测试或覆盖其输出，再用新数据/场景测试。
临时数据库自动清理；关键旧SQL/新SQL与查询结果留在结果JSON，能从仓库重跑。

实际走过：4MiB完整块加短尾的正常提交、缺ordinal、UNKNOWN最终PUT后的恢复、
同键不同会话、成功响应丢失后撤权/到期最小回执、当前ACL拒绝新提交、复用后撤源权限、
同样字节的第二保留版仍收完整逻辑配额；两线程父版7竞争只有一个v8与一个412。
另外实际在普通计数已递增且Change已插入后注入回滚，确认两者都回滚，再提交仍取102。
GC先赢与pin先赢、UNKNOWN DELETE、迟到旧DELETE后新generation仍可提交；H=0在之后写入后
保持固定，隐藏原日志空页推进cursor，ACL epoch变化RESET。

多租户探针**原样执行schema.sql**；仅为把伪代码转成SQLite表达式而替换参数、枚举文字、
表名以及checked_add注册函数，保持tenant谓词不动。旧负例复现上述A/B同时被改；
修复源码提取的guard与generation UPDATE只改A。其余tenant局部操作逐句核查显式谓词/契约。
这验证SQL作用域，不声称运行了真实PostgreSQL行锁、RLS或复制切主。

## 数字与一手资料抽核

独立使用Fraction复算，精确值和小数留在probe结果：

- 20M保存/天，峰值1157.407/s；1PB/天对应峰入站462.963Gb/s。
- 两份恰好50MB时每文件12块，峰13888.889 PUT/s；总字节加每文件尾块上界14954.779/s。
- 10GB×50M账户是500PB配额天花板；1PB×30天是新增逻辑上界，三份90PB，不是全站总量。
- 256MiB/20Mb/s为107.374s，1GiB为429.497s；4MiB块的摘要8KiB，64KiB块摘要512KiB。
  COW两版24MiB逻辑、16MiB唯一、省1/3；1%放弃上传48小时20TB，未含冗余。

执行日重新浏览抽核的原文（其余引用已核对页面位置/适用范围，不宣称独立全文复查所有论文）：

| 一手来源 | 独立核对的句子 / 限制 |
|---|---|
| [Dropbox Content Hash](https://docs.dropboxapi.com/dropbox-api/docs/technical-reference/content-hash) | 4,194,304 B分块；逐块SHA256二进制摘要拼接后再hash，空文件无块。页面没有把它推成Dropbox内部去重布局。 |
| [tus 1.0.0](https://tus.io/protocols/resumable-upload) | HEAD取offset，PATCH必须匹配，错误409不改资源；本章独立块会话不是其单顺序offset协议。 |
| [S3 multipart limits](https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html) | 非末part至少5MiB，末part例外；本章4MiB独立PUT不是multipart part。 |
| [RFC9110 If-Match](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.1) | 强比较，不满足不能执行修改；新请求412，已知先前成功可回成功，与回执先行一致。 |
| [PG18 sequences](https://www.postgresql.org/docs/18/functions-sequence.html) | nextval原子分号但回滚不退号；不能据号序推提交序。guard普通行是本章设计。 |
| [S3 version deletion](https://docs.aws.amazon.com/AmazonS3/latest/userguide/DeletingObjectVersions.html) | 普通DELETE产生marker，精确versionId才永久删对应版本；从不复用generation额外防旧DELETE。 |
| [Drive changes](https://developers.google.com/workspace/drive/api/guides/manage-changes) / [push](https://developers.google.com/workspace/drive/api/guides/push) | 保存page token取changes；files/changes通知body为空，需要另外读取。页面没把厂商opaque token说成整数。 |

## 浏览器与视觉

[独立浏览器](ch15-independent-browser.mjs)实际运行320/390/768/1440 × 两主题 × zh/en/both，
24组合`innerWidth=scrollWidth=目标宽度`；展开details后仍无全页横溢。
120次逐帧访问、5段复制逐字核对、键盘、播放/暂停、速度/循环、17闪卡grid/翻卡、
已读与主题语言持久化通过，页面与资源错误0。
证据：[browser结果](ch15-independent-browser-results.json)。

所有30帧已在两主题原尺寸查看；D2共享引用线、D3 staging/验证/后提交的图注和无障碍描述、
D6缩小模块及DELETING标记与代码一致。D4/D5保留图也逐帧查看，提交成功/冲突和设备应用顺序成立。
技术修复版D1/D2/D3/D6在真实390视口逐帧左/中/右120图已拍摄，D2/D3/D6六张接触表实际目视；最后D1返修再独立补30图，并查看全部5帧两主题原尺寸/窄屏接触表。未以自动统计代替图形检查。
图片位于`screenshots/ch15-independent/{after,narrow,browser}/`，
[最终D1窄屏30图结果](ch15-independent-narrow-results.json) / [此前120图结果](ch15-independent-narrow-prelabels.json) / [最终帧结果](ch15-independent-animation-after.json)。

最终只改D1的10处标签坐标：独立把这10处反向恢复后，全文SHA精确回到技术修复版072019…，证明其他25个SVG、正文与全部代码字节未变，见[独立范围证据](ch15-independent-label-scope.json)。因此此前D2/D3/D6目视仍适用于最终页。最终D1全组的20个标签测量及最小边距见[独立标签结果](ch15-independent-label-results.json)。最终browser、probe、frame、D1窄屏与标签JSON均对应上方最终SHA。

## 限制

SQLite的整库写锁比PG的tenant行锁更粗，独立模型不是分布式原子性的证明。
没有真实S3/IAM、对象持久化、共识切主、设备fsync/rename、快照服务、下载排空、跨地域
或压测实验。本章这些适配器/前提均明确，未把模拟通过写成生产验证。
320对照品牌竖排与图注随图滚动为既有共享UI，控件可达且无整页溢出；本次未改公共UI。
服务8765曾临时不可达，后用本轮自建8914完成独立浏览器；这不计为页面资源故障。
未提交、推送或部署，仍由主代理作最终批次验收。本轮自建8914辅助服务已关闭；主代理8765预览保留并实测HTTP 200。
