# Ch14 · 交叉只读独立复核

2026-10-23，复核者 ch13，GPT-6.1-Sol / Max。按主代理授权只读 Ch14 页面/示例，
仅写本报告、`ch14-independent-*` 和 `screenshots/ch14-independent/`。
没有直接修改 Ch14 作者页、示例或共享文件；未提交、推送、部署。

首次阅读 HTML：`02a413f21010d5261ddf42f3f0b6d3ad132d56bfb31941315c14695632958a76`。
前两项 P2 修后：`d51bdda919260ced7e6a25a9f1982717f88bc1c07e32670227c10e56162cc677`。
D6图义修后：`04bfc6cccc88eb8b1e849394ca7ec17150cb26a9538715d648f7b90680abd715`。
最终 HTML：`a6df2e3090d1e7bf9a0a441e6b6ae0417c3871d321c12a9eeb6011c2646b39db`。
最终结论：**交叉独立复核通过。1项P1（会话准入/GC）与3项图文P2均由作者修复并经独立复验关闭，未发现未关闭P0/P1或阻碍阅读P2。** 结论限于本报告证据与显式依赖，不等于真实云服务/编码器可靠性实验。

## 实际发现

| 编号 | 级别与位置 | 发现、作者修复与复验 |
|---|---|---|
| R1 | P2，D1F4/F5 Metadata 状态 | HEAD/提交后的 desc、右侧 `then state=UPLOADED`、代码和图注都说已固定源，但 Metadata 内仍写 UPLOADING。已由作者仅两帧改为 UPLOADED；独立源码检查和两主题真实页面截图确认，关闭。该问题主代理也在预审指出。 |
| R2 | P2，D3F2 双语图注 | “先有可播低档 / Provide the low rung first”容易与基线全三档 READY 门槛混淆。作者改为“先生成低档 / Generate the low rung”，不改显式 BASE/FULL 变体；中英独立核对关闭。 |
| R3 | P2，D6F5 拒绝 AV1 | 低于8K时文案说不做 AV1，但橙色 Codec policy→AV1→Origin 仍激活，红拒绝箭头也进入 encoder，视觉像拒绝后仍编码。已向作者/主代理报告，建议只在该帧淡化 AV1 支路，让拒绝线停于明确阻断处。修前证据在 [浅色](screenshots/ch14-independent/before-p2/d6s5-parchment.png)/[深色](screenshots/ch14-independent/before-p2/d6s5-dracula.png)。作者已将AV1节点/两条支路淡化，红线在encoder前的阻断X结束，补SKIP AV1并同步desc；独立重新查看D6全部5帧两主题及390左中右，已关闭。 |
| R4 | P1，播放会话准入与GC引用交集 | 普通读旧ready→切新ready→旧Build无引用且过留存，GC标DELETING→迟到播放API才签发/登记旧root能力→GC删精确对象。只规定GC/发布锁不足以阻止新会话迟到建立引用。已要求发放/续期同锁序重查PUBLISHED且非DELETING，先持久化grant与保留期限、确认提交再签能力；UNKNOWN恢复grant。作者已新增同源grant.pseudo：同锁重读ready/所选Build并要求PUBLISHED，先同事务持久grant/保护上界，再恢复同key且核intent、以固定root/expiry签发。续期已提交prior优先于旧grant过期校验。独立两种GC交错、UNKNOWN/异intent、固定过期与排空界限重验通过，关闭。 |

## 独立走读的保证与反例

完整阅读中英文正文、最终五份伪代码、README 与作者验证程序；没有把作者的检查项数量
当作独立通过证据。独立编写并实际执行 [probe](ch14-independent-probe.py)，
**41 项**本地契约见证通过，其中15项覆盖新增grant/GC与恢复边界；同时对照最终实际grant源及执行顺序，不只运行拟议模型，[原始结果](ch14-independent-probe-results.json)。

1. **正常上传到发布。**精确物理源版本的大小和 CRC32/FULL_OBJECT 通过后，同一数据库
   事务写 SourceBinding 与唯一 Job。领取得到 epoch1，逐份写并解析实际 root→leaf→media
   字节闭包，再同事务发布 Build、ready 与 DONE，最后才能 ACK。
2. **上传回执丢失与 key 被再次 PUT。**已绑定 source 的 versionId 不跟随 current key。
   本地对象映射后移，重试仍读原固定字节；试图给已绑定上传换新版本被拒。异 owner、null
   versionId、同长损坏字节、COMPOSITE 类型冒充 FULL_OBJECT 均拒绝。
3. **源绑定到 Job 的故障窗口。**在绑定后、Job INSERT 前注入异常，SQLite 实际回滚，
   不留下只绑定源而无耐久任务的半状态。唯一任务约束是持久工作，不是消息 ID 去重。
4. **旧 worker 继续运行。**epoch1 超时后 epoch2 的 key/version 身份完全分离。旧结果
   即使物理字节已经完整，也不能越过 RUNNING/epoch/lease/target/BUILDING 发布条件。
   后续 DONE 只确认 Job.result，不把当前已换到新源的 ready 指针恢复旧值。
5. **清单闭包不能只信 worker 清单。**独立 probe 从真实本地清单内容递归取 URI；少报
   inventory、child 缺自己的 versionId、未允许的 host 均失败。opaque versionId 的 `+`/`/`
   需要编码，不能继承父 query。本地 parser 是简化 HLS closure，不声称完整媒体语法/解码。
6. **验证与 GC 之间的竞争。**独立执行两种顺序：GC先提交 DELETING，发布再检查拒绝；
   发布先提交 ready，GC看到引用拒绝。最少24小时之后仍有 session引用也拒绝；全部界限过后
   才允许退休。租约过期不是立即删除许可，源与受管产物也不能被旁路生命周期规则删除。
7. **UNKNOWN、ACK与扫描。**代码把 COMMIT回包丢失当未知，重连读 receipt/result；正文明确
   数据库错误不 ACK，NO_CLAIM 的唤醒可 ACK，因为 Job与扫描仍在。独立注入 ready/DONE 中途
   失败，实际回滚后不暴露完成状态；当前有效领取的重复唤醒不会创建并行同代次。

`parse_transitive_references_by_exact_GET`、完整 rung/timeline/decode 验证、源/输出权限策略、
预算与时钟、同库行锁和声明的恢复路径是明确适配器/部署契约；伪代码没有冒充完整后端。
未执行真实 PostgreSQL 并发锁、S3、CDN、broker、编码器或权限集成，不将本地见证升级为
生产可靠性证明。所有五段页面代码与源文件逐字相同。

## 主要数字独立复算

用 Fraction 从输入重新计算，未抄作者结果。

| 项目 | 独立结果 |
|---|---|
| 上传峰值 | 500K×300MB×8×5÷86400 = 69.4444 Gb/s |
| 媒体 GET 峰值 | 25M×(600÷4)×5÷86400 = 217,013.8889/s，取217,014 |
| 播放峰值出口 | 25M×0.3GB×8×5÷86400 = 3,472.2222 Gb/s |
| 三档与存储 | 60+150+300=510MB；源+产物405TB/天，365天147.825PB逻辑量 |
| worker预算 | ceil(500K×10÷1440÷0.7)=4,961槽；只满足平均预算 |
| 回源限制 | 95%有效字节命中仍约173.6111Gb/s；100Gb/s需至少97.12%命中 |
| 弱网下一片 | 0.8Mb/s×4s÷1Mb/s=3.2s；缓冲8−3.2+4=8.8s |
| AV1回本 | $6÷(0.3GB×25%×$0.01)=8,000次未来合格观看 |
| 长尾变体 | 80%×210+20%×510=270MB/片，135TB/天，少120TB/天 |

0.3GB/600s=4Mb/s，对应最高档的教学交付假设，不是宣称ABR始终多档同时下载。
媒体GET假定一次合并请求，音视频分轨、init、清单、拖动和重试均另计；本轮未发现量纲错误。

## 一手来源抽核

执行时独立打开并核对下列原文，所支持的机制与正文相符：

- [S3完整校验](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-upload.html)：
  CRC32支持FULL_OBJECT与COMPOSITE，multipart SHA256为COMPOSITE；必须比较算法、类型和值，不能拿ETag当整文件摘要。
- [S3条件写](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html)：
  当前对象存在则412；单PUT的409可重试，multipart完成的409需重建上传。create-only还要控制删除和策略权限。
- [S3版本工作流](https://docs.aws.amazon.com/AmazonS3/latest/userguide/versioning-workflows.html)：
  物理versionId由S3分配，新PUT保留旧版本；版本化本身不取消删除权限。正文有启用后传播完成和持续开启前提。
- [PostgreSQL18行锁](https://www.postgresql.org/docs/18/explicit-locking.html)：
  FOR UPDATE与冲突修改互斥到事务结束；发布/GC共享锁顺序是作者的应用设计，不能据此声称跨S3/数据库事务。
- [CloudFront signed cookies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-signed-cookies.html)：
  先验签/策略再走正常cache/origin服务，custom policy可覆盖多个文件；正文明确私有GET，未把OPTIONS例外概括进去。
- [Apple HLS规范](https://developer.apple.com/streaming/hls-authoring-specification-for-apple-devices.html)：
  通用8.22是SHOULD边界对齐，tvOS修订是MUST视频档对齐；7.4要求IDR起片。4秒是本章选择。
- [RFC8216 §4.3.5.1](https://www.rfc-editor.org/rfc/rfc8216.html#section-4.3.5.1)：
  independent segments不依赖其他片信息；正文没有把上传multipart字节块误当播放GOP。

其余Netflix/CMAF/Shield引用未在本独立轮全量重查；作者已有具体原文记录。
本轮独立资料核验没有遇到影响核心结论的冲突，不以来源数量替代代码/反例审阅。

## 真实页面和视觉证据

[独立浏览器](ch14-independent-browser.mjs)/[结果](ch14-independent-browser-results.json)：
320/390/768/1440×两主题×zh/en/both，24组合；innerWidth/scrollWidth分别为
320/320、390/390、768/768、1440/1440。全部30帧在390/1440双主题对照模式访问，
共120次翻帧；5段复制与剪贴板一致，键盘/播放/倍速/循环/闪卡/已读/设置持久化通过。
资源与脚本异常0。最终grant修复后对a6df2e…重跑24组合、120翻帧及5段复制。不是仅看无溢出统计：已实际逐组查看全部帧两主题接触表。

独立保存 `screenshots/ch14-independent/after/` 的60张帧PNG及12张接触表；
`narrow/` 在真实390×1000视口对D1/D2/D4/D5/D6全部帧两主题保存左/中/右，
50个主题/帧组合、150张页面PNG，10张裁切接触表。D1/D2/D4/D5已逐帧目视，
D6拒绝线返修后亦整组复看完成；三项P2视觉已关闭。结果见 [窄屏记录](ch14-independent-narrow-results.json)。
代码/长图自有横滚，页面不横溢；320对照品牌竖排与图注随横滚移动是既有共享行为。

[静态与同源检查](ch14-independent-check-results.json)/[命令输出](ch14-independent-checks.txt)
确认6组30帧ID/顺序保留、5份源码一致、audit/check及独立脚本语法通过。
D6修后24布局/120翻帧/150窄屏图已重验并对齐04bfc6…；R4若仅改正文/契约，不改变这些SVG图内证据。R4最终只新增正文/代码/闪卡，未改这些SVG；最终新内容的布局/复制/交互另以a6df2e…重验，R4已关闭。

## R4 最终恢复分支复验

- 新会话在Video锁后选当前ready；续期锁定owner的旧grant对应Build，并与GC共享Video→Job→Build边界。源中明确要求PUBLISHED，DELETING不能复活。grant/保护期限先提交，签名是之后的外部动作。
- 独立两种交错：GC先赢则迟到旧ready读不能发放；grant先赢则即便随后ready换新，持久引用阻止删除。令牌过期之后，clock skew + read drain + manifest window 的存储保护界限仍阻止GC，超过全部界限才可退休。
- COMMIT成功但回执丢失时不预先签名；重读同(viewer,key)后仍核intent。独立注入A事务回滚、B以同key异renew意图后来提交，A恢复必须拒绝，不误签B的能力。
- 续期在旧grant活跃时已提交，但续期响应丢失；重试时旧grant已到期、新prior仍活跃。源码prior优先选Build，只有prior absent才校验旧grant期限，因此正确恢复新prior，不误拒已提交续期。
- 签名采用原存储绝对expiry，延迟重试不续命；过期prior不能重新生五分钟。grant与保护界限中途失败同回滚，未确认receipt不产生能力。
- 独立检查结果记录prior/old校验顺序、恢复g.intent、INSERT/COMMIT/sign先后以及保护上界/固定expiry。其余四段核心代码和D6图形没有在R4中改动。

本轮仍未实测PostgreSQL并发、S3策略、CDN时钟/下载排空或真实解码；本地SQLite和字节/清单见证只核对已声明状态转移。部署必须兑现clock_skew_bound、read_drain_bound与manifest_window；无法给出排空界限时保留引用直至确认排空，不能假设令牌到期即所有读完成。
