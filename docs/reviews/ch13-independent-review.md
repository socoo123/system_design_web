# Ch13 · 交叉独立复核

2026-10-23，复核者为 Ch15 作者，GPT-6.1-Sol (`gpt-6.1-sol`) + Max (`max`)。只读 Ch13 页面/示例，写入仅本独立记录、`ch13-independent-*` 与对应截图；没有修改 Ch13 页面、示例、共享文件、PLAN，未提交部署。

结论：**本次复核通过。1 项代码性质/运行入口 P2 已关闭，未发现未关闭 P0/P1 或阻碍阅读 P2。** 最终页面 SHA256：`7c4911d8868730bb15844a7c1a3d877b3ed7eb26064188a5bfd76113f6757369`。结论限于以下检查与显式依赖，不等于部署过真实 Elasticsearch 或生产可靠性验证。

## 发现与返修关闭

| 级别 | 发现 / 正常与反例 | 关闭证据 |
|---|---|---|
| P2 | 主代理提示后独立确认：页面 Java 块只含 `BEGIN PAGE` 的 record/方法，没有 imports 与外层 `SearchMerge` 类，但标记为 `runnable merge core` / `data-kind=runnable`；完整文件能运行，复制页面块本身不能独立 javac。 | 作者改为 `Java 17 · teaching excerpt` / `teaching`，邻近双语链接完整 `SearchMerge.java` 与 README 编译命令。独立检查标签、两个目标 HTTP 200 且内容与本地同 hash，完整类使用 JDK17 编译并执行自写 oracle；代码核心未改。[P2结果](ch13-independent-p2-results.json)、[3视口补验](ch13-independent-p2-layout-results.json)。 |

初读版本为 `842f8d6f34413e1250801ba9c73c9963cb3b6395fcab89cf4f032b696d70a595`。标签返修后复验上述最终 hash，未用旧浏览器结果替代最终页面。

## 独立执行：从算法到关键反例

先完整读取正文、中英/图注、三份代码源及 15 张闪卡，再写独立验证器。没有复用作者的 `verify.py`、Java 测试用例或其结果文件作为通过依据。

1. **可运行合并：**[自写 Java oracle](ch13-independent-MergeOracle.java) 与未修改的 `examples/ch13/SearchMerge.java` 一起由本机 `javac --release 17` 编译，在 Java 17.0.10 执行。四片各 0–2 文档、分数三种取值（含负数/同分）、每个 k=1…4，穷举 28,561 份语料。局部 top-k 与直接排全语料对照，反转回复顺序；并检查缺片、显式 partial 排除失败片候选、重复副本、无穷分数和逆序片。**228,493 次断言通过。**[实际输出](ch13-independent-java-results.txt)。这只证明约定 score/tie 总序下的合并，不证明本地 BM25 统计等于全语料 BM25。
2. **版本/删除：**[独立 Python/SQLite](ch13-independent-probe.py) 真正执行一个条件 UPSERT，把版本比较与整行替换绑定。正常 v12→删除 v13；迟到 v12 不能复活，v13 同摘要可重放、异摘要停止；写成功丢 ACK 不推进确认，重放恢复。24 种乱序/重复事件排列及两个连接并发竞争都保留 v13 tombstone、清旧正文。刻意物理删掉版本记录后，旧 v12 实际重新插入，确认负例存在。
3. **最关键分页反例：**独立实现扫描预算模型，前 100 条都被权威过滤，返回空页+推进到 100 的 cursor+truncated；下一页仍找到 101–105，再真正耗尽。只用最后返回文档会没有锚点，负例被实际重现。刷新轮次保留最新 PIT 标识；缓冲几条后权威未知、第二轮缺片均抛整页失败，不泄露成功结果/游标。
4. **同源/数字：**独立解析 HTML 的三个 `<pre>`，与两个完整伪代码和 Java marker 区间逐字核对。协议/SQLite/同源与数字共 **142 次断言通过**，[结果](ch13-independent-probe-results.json) / [日志](ch13-independent-probe-log.txt)。此本地模型不替代真实 ES 的版本、复制和 PIT 实现。

主要数字重新计算：平均925.9259、峰9259.2593/s后向上规划10K；60%整体命中→4K回源、每片4K、整层16K任务；三份正常各1333.333，坏一份各2000；40%命中时坏一份各3000，超假设预算。100M×2000 B=200GB，三份倒排600GB；10K×20KB=200MB/s；4×10020=40080候选、1,282,560B，对比80/2560B为501倍；0.99⁴=0.96059601；120000积压÷净400/s=300s；Trie ID数组80MB；等长TF3因子1.5714286。没有发现单位或故障余量混用。

## 一手来源抽核与内容对应

2026-10-23 实际重新浏览以下官方资料，不只复述作者来源表：

- [Elastic Index API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-index)：external 严格更大才替换，等/小版本409。页内409后核摘要与更高版本覆盖的分支一致；durable ACK 是另一个适配器契约，未将普通API成功假称共识部署实验。
- [Elastic Delete API](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-delete)：删除版本保留受 `index.gc_deletes` 限制，因此同 ID 逻辑 `deleted=true` 与保留/重建约束有必要。
- [Elastic 分页文档](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/paginate-search-results)：默认窗口10000、PIT内 `_shard_doc` 唯一稳定、同 query/sort/完整sort值与最新PIT ID。图中80是一轮候选、不是所有posting扫描；正文和闪卡已明确授权补取增加工作量。
- [Elastic Open PIT](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-open-point-in-time)：打开时拒缺片、后续取最新ID、旧段/句柄/删除跟踪资源代价。60s与产品410仍明确标为本章选择，旧PIT不冻结当前权限。
- [Lucene 9.12.1 BM25Similarity](https://lucene.apache.org/core/9_12_1/core/org/apache/lucene/search/similarities/BM25Similarity.html)：默认k1=1.2/b=0.75，与本章等长相对TF演算相符；图上1/1.57未冒充完整原始分数。

IIR 原站未由本复核重新获取；作者已如实注明失败，双指针复杂度与自造集合例由推理核对。其余6个引用未逐页重开，不将本抽核写成全引文独立认证。

## 真实浏览器与目视

[独立脚本](ch13-independent-browser.mjs) / [结果](ch13-independent-browser-results.json)：24 个真实 320/390/768/1440×两主题×zh/en/both，details全部展开后 `innerWidth=scrollWidth=目标宽度`。原6组30帧ID完全一致，15张闪卡网格，3段复制逐字相同、键盘和最后一张翻卡通过，异常/资源错误0。共84次帧导航：改动组D1/D4/D5全帧，两种宽度两主题；其余组首/末帧。

独立截取并实际目视 D1/D4/D5 全部15帧×两主题共30张桌面SVG，以及真实390的左/中/右90张容器截图与接触表，重点复看D1回填标签、D4版本/refresh/墓碑、D5最后帧的失败说明与回程。未见遮字、误接、裁切或阻碍阅读的新问题。D5F5失败说明在底部留白，与成功 hits/cursor 标签分开；浏览器宽度统计不替代上述目视。

代表：[D1深色全帧](screenshots/ch13-independent/d1-dracula-desktop-sheet.jpg)、[D4浅色全帧](screenshots/ch13-independent/d4-parchment-desktop-sheet.jpg)、[D5最后帧深色](screenshots/ch13-independent/d5s5-dracula-desktop.png)、[390最后帧左端](screenshots/ch13-independent/d5s5-parchment-390-left.png)、[390 D5全帧](screenshots/ch13-independent/d5-dracula-390-sheet.jpg)、[P2中文/对照入口](screenshots/ch13-independent/p2-320-parchment-both.png)、[P2英文入口](screenshots/ch13-independent/p2-390-dracula-en.png)。完整证据在 `screenshots/ch13-independent/`。

窄屏图在自身容器滚动，右滚会暂时带走同slide图注，滚回可读；320/both共享品牌竖排换行但控件可达。这是已有共享UI行为，本次没有越权修改。未使用CLI裁切截图冒充手机。

## 限制与交接

没有运行 Elasticsearch 集群、业务CDC、Redis缓存、真实权限服务、复制切主、故障注入、PIT资源压力或200ms负载实验。单ID条件写、存储耐久性、带期限RPC、权威读及token密码学是明确适配器/部署契约。代码和本地探针未被包装成这些分布式保证的实测。

最终静态/同源检查记录在 `ch13-independent-checks.txt`。页面与示例保持只读；已把P2关闭与本复核结论交主代理，由主代理统一收口验收。
