# Ch30 RAG后端 · 独立复核

2026-10-24，Ch28作者以GPT-6.1-Sol（`gpt-6.1-sol`）+ Max只读复核。
**本次独立复核通过；主代理先前实际发现的manifest成员身份P1已独立重验关闭，未发现新的P0/P1或阻碍阅读P2。**
只写`docs/reviews/ch30-independent-*`及对应截图，不改Ch30页面、examples或作者证据。
未提交、推送或部署。

最终页面SHA256：`5205cf760407050ce58aa561eaa91d688dac0e4ddc3e46b2444a348707a054bd`。
[完整before/after页面+全部9份示例字典](ch30-independent-source-hashes.json)逐文件一致，
读审期间没有代码变更。[汇总与图片哈希](ch30-independent-results.json)绑定相同冻结版本。

## 正常与关键反例

独立完整阅读正文、中英文、14张闪卡、六段教学源、Java完整类、SQLite适配及迁移伪代码。
没有只复述作者自检：新写[SQLite/数值探针](ch30-independent-probes.py)和
[Java输入](ch30-independent-Probe.java)，实际执行**61项新检查（40项事务/权限等，21项复算）及14项Java17断言，全部通过**。
[完整结果](ch30-independent-probe-results.json)保留实际输入与当前源码哈希。

| 核对点 | 独立轨迹和结论 |
|---|---|
| 正常发布/释放 | 持久接收后尚无published；text/bm25/dense任一部分回执均拒绝、仍running；完整manifest才发布。正常包、SUPPORTED、全包复查后实际send一次。 |
| 旧manifest P1关闭 | 主代理[初始失败](ch28-ch29-ch30-root-manifest-counterexample.json)中额外同tenant/rev/pool staging曾可pin。独立用更强新输入：额外ID与已发布child**同字节、同hash**，仍在indexed-child与parent/text两种入口均拒绝。合法已发布parent作为text可读，作为indexed child拒绝。关闭依赖精确ID/hash/角色，而非仅revision/pool。 |
| 父段ACL | 可读child与私密parent后半段共存时child通过、parent拒绝；一个单位的ACL覆盖空隙也拒绝。完整授权后published parent可正常读。 |
| 整包、未引用依赖 | 新线程实际暂停judge，回答只引用A但包含B；第二连接删除未引用B后，judge返回SUPPORTED仍阻断，无发送。 |
| 新ABA反例 | 慢judge期间B的ACL先撤销再授予相同staff、或成员移除再加回同组，表面权限恢复但epoch已变；两种均丢整份draft且无send。不是只检查当前allow或本句引用。 |
| claim/发布代次 | lease等号过期，新owner取得更大epoch；旧owner拿正确完整回执仍不能发布，新owner可以。target推进、锁内采样到lease等号亦拒绝。 |
| pool/current与全局拒绝 | alpha/beta分别持current。只发布beta新内容后alpha旧包仍可按其current复查，beta旧包失效；全局tombstone随后同时阻断两池，回退到旧池不恢复已删内容。 |
| 引用/支持 | 空/0/越界/bool/浮点引用ID均阻断，UNKNOWN不发。实体/数值/单位/条件规则与自由文本judge的局限逐行核对；实际模型支持正确率未测试。 |
| check/send空隙 | 在实际release的send回调中先由第二连接提交delete，再记录已批准发送，仍可发生。下一次检查拒绝。与正文明确的线性化点/已批准在途边界一致，没有把它误报为立即撤销承诺。 |
| RRF/装包 | 新Java输入核同路去重、保留原rank99、稳定tie、80上限；8×512正文因来源包装只能装7段，边界4,096/5,120/512正确；超大段跳过后可装小段，父子重叠保守去重。字符fixture不冒充生产tokenizer。 |

迁移的快照/保留日志/全源分区屏障、双路服务可见性、整bundle CAS、保留旧encoder、
切后双池继续喂数据、回退补齐含delete/ACL、日志缺口禁止假回退、drain后回收均逐行核对。
这些是**伪代码契约审阅**；没有假装本地模型实际执行源日志回放或分布式迁移。

## 数字与来源

21项数值独立复算采用逐块枚举和Fraction，未只复制作者期望值：
5块/尾208、2,256嵌入token、12.8%与12.5%分母、50万向量1.536GB≈1.431GiB、
双副本3.072GB/双池双副本6.144GB、3,200与20M pair/s/6,250倍、204,800输入和20,480输出token/s、
5,632上下文、500ms条件路径/200ms余量，以及每日5,000块/225.6万token和RRF的B>A。
均为教学假设推导，不是硬件/厂商实测。

独立web抽核7份一手文档/论文，见[来源记录](ch30-independent-sources.md)：
Elastic RRF/refresh、固定pgvector v0.8.0、Microsoft security filter/chunking、ALCE、RAGAS。
它们支持具体机制；没有把普通过滤等同认证，或把NLI判支持等同真值证明。
中英文/表格/闪卡与代码中的manifest、整包撤销、版本和token口径一致。

## 动画与页面

独立headless Chrome完成**24真实组合**（320/390/768/1440×两主题×三语言），
展开details前后innerWidth/整页scrollWidth一致；128次翻帧、6段逐字剪贴板复制、播放/键盘/倍速/循环、
闪卡、已读与主题/语言持久化均通过，资源/页面错误0。
[浏览结果](ch30-independent-browser-results.json)绑定最终源码，未操作用户Chrome。

原6组32帧/全部title ID保留。本次重新从**真实页面**捕获64主题帧；
实际打开D2全部6帧、D3全部5帧、D5全部5帧的两主题接触表，逐帧目视32主题帧。
另实际查看320EN、390代码、D2F6/D3F5/D5F4的窄屏中间/右侧图。
D2发布回程、D3父块同版本和权限说明、D5缩短标题及Gate回到RAG底边线路清楚，
没有标题顶框、短线压字、画布裁切或新绕线。D5不直接把模型流发送给Client；细图省略Gateway的图注/代码一致。
[12张实际已查看图片哈希](ch30-independent-results.json)将截图生成与人工目视分别记录。

## 命令与验证限度

- `PYTHONDONTWRITEBYTECODE=1 python3 docs/reviews/ch30-independent-probes.py`：61项新检查与14项Java通过。
- `node examples/ch30/sync.mjs --check`：6块逐字同源。
- 作者检查另存重跑：`python3 examples/ch30/check.py docs/reviews/ch30-independent-author-check-results.json`，51项SQLite、21项数值和20项Java通过；这与独立新输入分开记录。
- `node docs/reviews/ch30-independent-browser.mjs`：24组合/128翻帧/6复制通过。
- `node docs/reviews/ch30-independent-render.mjs`：64实际页面主题帧；生成后另行目视。
- `node tools/check.mjs`、`node tools/audit-chapter.mjs ch30`、本轮两份mjs语法和`git diff --check`通过；[检查输出](ch30-independent-checks.txt)。

SQLite实际多连接事务用BEGIN IMMEDIATE，锁比PG行锁更粗。可见性receipt、认证、源解析、支持judge和时钟是fixture；
未运行真实PG/Elasticsearch/BM25/ANN、源快照日志、生产tokenizer/embedding/LLM、集群切换、物理擦除/备份清理或压测。
本结论是所列源码与契约范围的独立通过，不是生产可靠性或自由文本无幻觉证明。
