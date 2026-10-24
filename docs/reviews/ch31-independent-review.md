# Ch31 独立只读复核

2026-10-24。复核者为本批Ch33作者，GPT-6.1-Sol + Max，未派子agent。
**通过：冻结版本未发现新增P0/P1/P2或阻碍阅读问题。** 作者自审的token/route身份和旧no-op版本冲突修复已用独立新输入重验。
本结论限章节/示例声明的教学边界，仍由主代理完成整合验收；未编辑作者页面/示例/PLAN/共享文件，未提交或部署。

## 阅读范围与最终版本

已完整阅读当前页面正文、图注、代码、引用、闪卡，以及`examples/ch31`的Java/Python/README/sync/check与作者报告。
复核开始时作者尚在收口；[完整before/after字典](ch31-independent-source-hashes.json)保留当时before及最终6份文本源码/说明after，`unchanged=false`如实记录HTML、README、catalog和check的作者变更。没有把初始版本判为最终通过。

最终页面SHA256：`3a4cdd13730731b8a92009bd124f491124c4aaf6119bdd10c9e8851751c6d632`；
catalog：`c3a170725835e1a5a9c25c8c890013d562e8cd18a3025aa62218bf5fadd6432b`。
已重新读最终catalog/README/apply摘录与检查尾部；最终新输入、Java执行与浏览器哈希均对应after。作者48项SQLite报告只作背景，没有当成我的新输入。

## 独立新输入与正常/反例

[36项SQLite新输入](ch31-independent-sql-results.json)、[独立程序](ch31-independent-probes.py)直接调用实际`Catalog/gather`，使用3维新向量、非连续分片集合`{0,2,7}`与不同模型/路由：

- 正常：写v1/v2/delete v3，先apply至3，再stage cut=1。历史root仍是v1及其原始归一化向量；发布cut=3后新pin是墓碑，旧query仍读v1。验证“最低token包含”不同于“本次固定实际cut”。
- 关键反例：另建同维度新模型space，epoch/LSN均恰好1；旧space token仍拒绝。space注册固定route，同space换路由拒绝，新路由必须新space/显式token处理。不是只核对作者宣称修复。
- 所有必需片包括空片7：少空片也UNAVAILABLE且无普通hits；显式PARTIAL保留covered/missing；旧query/旧attempt不补覆盖；相同attempt重复只计一次，矛盾重复拒绝；更大的移动cut即使满足最低位点也拒绝。
- 回退老bundle不能覆盖新barrier；保留旧pin禁止退休，释放后才删除。新鲜旧space roots的双连接并发回退只有一个CAS胜者，失败者published标志同事务回滚。
- 同版本异正文停止连续prefix；旧v6先作为v11之后的no-op，也保留seen_version，后续v6异正文拒绝且applied不跨过它。该新输入重验作者最后的自审修复。

[16项Java独立新输入](ch31-independent-java-results.json)、[探针](ch31-independent-VectorProbe.java)与实际`VectorCandidates.java`共同用Java17编译执行。新3维候选含更近的外租户/私有点、墓碑、旧版本、重复项；它们不进入结果但占预算。归一化cosine重算为0/0.2，k已满仍可漏最近点，真空允许集与预算短缺分开。model/schema/dims/零向量/非有限/溢出拒绝和三种metric方向通过。
同一个编译产物另重跑作者`main`的18项；这18项明确列为重跑，不计入16项独立新输入。

## 计算、来源与一致性

[33项独立复算](ch31-independent-numeric-results.json)使用有理数：307.2GB=286.1023GiB、每片71.5256GiB、89.6GiB热预算余18.0744GiB；PQ96B+8B ID共10.4GB；均匀list扫描8.125GB/s、原向量重算245.76MB/s；5000点15.36MB；WAL日峰35.38944GB。四片各200/s而非50/s，二副本各100/120=83.3%，N−1缺80/s；额外算三副本幸存240/s作为假设下的对照，没有把它当实测容量。`0.95^4=0.81450625`及Recall9/10=0.9成立。

[一手来源独立抽核](ch31-independent-sources.md)实际读取Faiss两页/Implementation notes、HNSW v4、ACORN v1、pgvector v0.8.0、Milvus v2.6.x与SQLite。核对了版本适用条件；没有推广论文性能、混淆Faiss HNSW/Flat删除能力，或把Milvus最低包含时间戳当本章精确cut实现。

正文/英文/闪卡/图的关键口径一致：ANN近似与scope精确分开；candidate ID/version先查固定live状态再读原向量；K_REACHED/允许集耗尽/短缺分开，complete仅为全片覆盖。固定片位点向量不等于单一跨片事务时刻；query先pin后验embedding模型，迁移要新向量，回退要旧space继续追当前barrier。示例gather只演示覆盖/attempt，生产还须汇总各片短缺状态，README已明确，没有将它误读成完整ANN服务。

## 浏览器与实际目视

[独立浏览器](ch31-independent-browser-results.json)新运行390/1440×双主题×EN/both，共**8个真实viewport**。各组合innerWidth=scrollWidth，展开details仍无整页横溢；132次翻帧、3段逐字复制与键盘/播放/闪卡/进度/设置持久化通过，资源和页面错误0。没有CLI裁切。

实际查看修改四组D1/D3/D5/D6全部帧的双主题8张根接触表（22×2帧），并查看自己本次生成的D2/D4末帧两主题、390 EN入口、1440深色代码、390 D5中段与D6拒绝/重试右侧，共**16张实际打开图片**；[路径与哈希](ch31-independent-final-results.json)逐项列出。D6F4/F5旧A成功回程灰显、红拒绝到Query svc、同root/fixed cut的B重试关系正确；D5 Manifest/圆柱字形、D1入口边界/标签与D3重算路线可读。没有用几何或截图数代替这些目视。

## 结论边界

[最终证据检查](ch31-independent-final-results.json)核对最终完整after、实际SQL/Java/浏览器源码hash、同源/audit/diff及图像。未发现需要作者返修的新增问题，不因“必须有发现”虚列缺陷。作者在收口前自审的修复有独立验证，不计作本复核新发现。

实际运行本地SQLite多连接与Java17 CPU模型；未运行HNSW/IVF/ACORN/真实ANN召回、外部root加载、复制故障、embedding、物理迁移、源游标覆盖或2秒新鲜度时钟证明。可信router、monotone版本、固定schema、已校验副本结果和外部加载适配是前提。无限期操作记录/pin可能泄漏，生产租约回收要先阻止旧worker；这些限制正文/README已明示，不能当成实现缺失的生产承诺。
