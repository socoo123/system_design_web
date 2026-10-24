# Ch22 · 对象存储 · 独立复核

2026-10-23，GPT-6.1-Sol (`gpt-6.1-sol`) + Max。**独立复核通过：未发现未关闭 P0/P1 或阻碍阅读的 P2。** 阅读了当前完整 HTML 与 `examples/ch22/` 全部11文件，自写新输入探针；没有调用会覆盖作者结果的 `verify.py` / `run_java.py`，没有修改目标页面、例子、作者报告、PLAN或共享文件。

目标 HTML SHA256：`be0f18cd3f39d2c41de4cc8f6a8ebf48c243237642ad1d32ac624b7ec32c9eb3`。12份页面/示例的审前、审后完整映射一致：[source-hashes](./ch22-independent-source-hashes.json)。作者报告只作背景，结论来自下述直接代码/运行/浏览证据。

## 正常路径与关键反例

[独立探针](./ch22-independent-probes.py) 直接调用作者 Authority/Data 模型，在真实临时SQLite中执行 **52 项新边界检查**，输出[probe-results](./ch22-independent-probe-results.json)。Data仍是作者显式内存契约适配器，没有据此证明远端签名/耐久。

- 名字/请求身份：同一个 operation text 对空格、大小写、NFC/NFD 和内嵌NUL六个名字分别分配身份；不同principal与bucket也独立。异意图、跨租户与同桶其他owner被拒。验证的是模型中精确保留的UTF-8字符串序列，不是额外实现任意二进制键编码协议。
- 正常 binary multipart：`00 ff 41 42 43 44 80 0a`，稀疏但递增编号2/7、六份确认，冻结前不对外可见。提交前注入错误没有版本或回执；提交成功而ACK丢失表现UNKNOWN，查询同身份返回原allocated version；固定manifest按顺序得到原始二进制内容。
- 完成回执与合法GC：先发布v1、固定读租约，再发布v2，撤销v1保留引用并claim。159秒仍有租约，160秒到期才删真实模型blob；原v1完成回执仍可重放且current仍是v2。换清单被拒，撤权后不能借旧回执绕过新鉴权；恢复权限后可在无旧字节情况下回原结果。
- 条件拒绝回执：expected_generation失配持久CONFLICT；后续marker改变名字、候选fence/GC之后仍回同一CONFLICT，不复活current或字节。marker隐藏无版本GET，显式保留版本按权仍可读。
- complete/abort：8轮真实两线程竞争均只有一个胜者；本次调度实际都是abort先赢，结果如实保留。另走相反顺序：先冻结FINALIZING，后abort冲突，完成者仍只发布原精确清单。没有把“运行过竞争”冒称所有调度均已遍历。
- 上传回收：599秒不能claim，600秒可claim；claim同fence重试稳定。Data已有writer时sweep返回False，晚到写可落但不能登记/发布，新旧代次写被拒；排空后再扫掉精确晚到blob。
- 不完整冗余与未知drain：五份不能满足六块策略，仍FINALIZING且无发布回执；注入Data drain UNKNOWN，物理字节保留待重试。已完成上传的未选中晚到attempt可按immutable blob_id删，选中blob仍在且不能作extra删除。

这些反例重走了正文真正的边界：名字权限/owner、version/current/原回执同事务、COMMIT未知、冻结清单/part代次、回执不依赖payload寿命、fence不等于drain、租约不等于无限保留。没有发现代码与双语/闪卡的相反承诺。

## Java、算术与来源

[独立Java输入](./ch22-independent-VerifiedRead.java) 与目标 `VerifiedRead.java` 用**实际JDK17.0.10**编译/运行，8项断言通过：[java-results](./ch22-independent-java-results.json)。新例子先排除错误current版本和同长度坏字节，验证binary正确副本与返回buffer隔离；current变化后第二块仍用旧版manifest，拼出的整对象摘要仍是原版。空格/NFC-NFD/块名差异均不能被同内容绕过。该方法只做块身份/长度/摘要检查，调用者先取得可信manifest与有效租约的责任没有被Java替代。

18项独立 Decimal 复算通过：[numeric-results](./ch22-independent-numeric-results.json)。包括100MB加权平均、8TB小对象与99.992PB大对象、180PB混合冗余、1TB/15.625GB元数据、96Gb/s每方向与N−1需21台、19与1.5的压缩I/O、2000/8000秒理想修复下界、联合双缺块读2TB、80parts/20名义轮次/625GiB未完成量、6400候选，以及全小对象时每片156.25TB元数据。数字都是假设下算术，没有性能/耐久测量。

重新浏览核对AWS GET/LIST原子与可见性、delete marker、Abort在途part、Complete初始200/最终错误、multipart/checksum、durability设计目标/SLA、presigned权限；另核Haystack§3.4与f4分层/RS/MDS。与当前正文引用用途吻合：[独立来源记录](./ch22-independent-sources.md)。没有引用官方S3契约来替作者代码宣称等价实现。

## 动画、语言与真实浏览器

原6组30帧与ID均保留，读了全部图题/可访问描述/双语图注。修改组D1/D2/D3/D4/D6的**全部25帧**已在真实页面两主题桌面看过，另看过每帧390px左/中/右，共150个滚动位置；D5保留组也逐帧翻看。联系表仅用于汇总原始截图，不当作手机viewport本身。

- D1：图和图注明确PUT先Data回执再Metadata发布，GET先解析Metadata再读固定版本；本地超时不是Metadata未提交的证明。
- D2：已检查CAS7→8和committed两标签分通道，复制/指针切换/读租约排空退休顺序一致；共享pack要求全部记录引用与租约清零，模型未实现共享pack并已声明。
- D3：Data直接扇出三份、各自ACK，不是接力；C无ACK时失败由Data本地产生，原成功路径淡化。API publication gate不把字节回执误当最终成功。
- D4：收紧Data框及port spine属于同服务，文字未压框/线路；B0坏字节由Data检出，B1–B4用于解码，B5未用淡化，替换放置/fence说明与正文一致；每AZ两块与可丢区域数量未混淆。
- D6：同一OPEN只能冻结或abort，固定结果重放与不同清单拒绝明确；末帧按fence→Data drain→sweep，无“取消即已删光”的承诺。

[浏览器脚本](./ch22-independent-browser.mjs) / [结果](./ch22-independent-browser-results.json)：**1440/390 × 两主题 × zh/en/both =12布局**，实际innerWidth与scrollWidth均相等，展开details也无整页横溢；120次翻帧、4段逐字复制、15张统一网格卡片、键盘/播放/设置/进度持久化通过，页面异常/资源错误为零。不是Chrome CLI裁切。`node examples/ch22/sync.mjs --check`四段一致，`audit-chapter.mjs ch22`结构检查通过。

截图位于 `screenshots/ch22-independent/browser/`：每修改组有两主题 `contact-dN-*` 与真实390来源的 `contact-mobile-dN-*` 全帧联系表，原始完整figure截图也保留。代表：[D2末帧](./screenshots/ch22-independent/browser/d2s5-parchment.png)、[D4失败帧深色](./screenshots/ch22-independent/browser/d4s5-dracula.png)、[390 D6中部](./screenshots/ch22-independent/browser/390-dracula-d6s5-middle.png)。

## 限制与结论

本次未启动真实Data/PG服务、共识Metadata、跨AZ故障、持久签名/fence、时钟同步、真实读能力/续租、共享pack压缩、RS编解码、生产迁移或压测；未证明SLO/SLA或十一nines。正文/例子已经把这些适配责任与本地可运行范围分开，未发现以本地锁/内存模拟冒充保证的未关闭问题。Ch22通过本次独立复核；最终全批整合/验收由主代理执行。
