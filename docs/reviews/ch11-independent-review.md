# Ch11 · 独立交叉复核

2026-10-23。复核者 ch12_author，GPT-6.1-Sol (`gpt-6.1-sol`) + Max (`max`)。只读章节、示例和共享文件；本复核只新增 `ch11-independent-*` 证据与 `screenshots/ch11-independent/`，未改作者源码、PLAN 或站点，未提交部署。

**结论：通过。** 独立发现1项P2图注条件遗漏，作者已修，复验关闭；本次范围内未发现未关闭的P0/P1或阻碍阅读P2。最终审阅 HTML SHA256：`8ad7f22ec98006fd51731ddbfdf88c57ec6f4e575236567c49fbbd6a0a9b4258`。初轮技术/逐帧检查版本是 `c5457bb2f8869f2874e5d1386ed97bf4df558b8f55f8c36969a68333a70118a4`；最终仅D5F5双语图注改变，代码与SVG机制未变。

## 范围与逐项核对

完整阅读当前章节、中英/图注/11张闪卡、全部 `examples/ch11/*`、基线HTML、作者记录及PLAN §§4–8。没有将作者的通过结论当作本复核证据。

- **发布：** 主键 `(author_id,idem_key)` 与同作者分片 Post/PublishKey/Outbox 同事务；唯一冲突先回滚再主库新语句读胜者，摘要冲突409，commit unknown保持同键，未把Queue纳入本地事务。201故障耐久性另要求真实副本配置，未把DDL当部署证明。正常路径手推两个先查miss的同键请求，一个提交、另一个唯一冲突后新语句恢复原post_id；无第二Post/Outbox。PG竞争没有实际执行。
- **扇出：** 稳定可保留粉丝快照、模式代际、持久唯一输出、输出确认后CAS检查点，任务与输出库没有被假装成跨库原子事务。将任务模式/快照留存及过期修复作为适配器契约，不能用broker offset或published_at替代完成。
- **模式/关注/完整来源：** 模式行的发布共享锁与切换排他锁封住最终旧代际提交位点，尾追完再激活，旧来源保留；新关注pending先纳入未来事件，再补保留历史/追提交位点/激活follow_version。K>8仍读完整源集；重视图不可变且绑定user/version/snapshot，缺源503，版本变409，快照过期410；构建时间不替代物化水位。严格历史完整性与刷新才能看到的迟到扇出区别已写清。
- **分页：** SQL非空tuple与Java比较器均为 `(created_at,post_id)`；来源同排他上界、保留窗和完整集合。复制行也消耗扫描预算；过滤行前移，未消费预取不推进；每页最后重检权限版本，包括空页。缓存正文、签名cursor均不能赋予权限。Sources/Bodies/View的分布式/认证适配器范围明确，Java仅是归并内核。
- **缓存/删除：** 缓存执行端同时检查epoch、generation和安装deadline，失效原子撤代次/删值，重启/元数据淘汰不得复用旧token；API超时不撤销远端排队SET。新主库语句、2s安装、固定25s且不续期、取值至发出响应≤2s共同支持约29s目标；timeline另按0.5+0.5。立即撤权走权威校验，不能沿用普通删除宽限。

## 问题与关闭证据

| 编号 | 级别 / 位置 | 实际反例 | 修复与复验 |
|---|---|---|---|
| IR11-01 | P2，`chapters/ch11.html:890`，D5F5双语图注 | 原图注把“未满20条”直接说成partial=true。Java实际按 `more && out.size()<limit`。独立运行只有1条deleted候选且来源耗尽，得到posts=0、next=null、partial=false，是正常短页。 | 作者仅改图注：“预算耗尽且仍有后续候选时”才partial；确认耗尽可正常短页。最终Java再分别验证来源耗尽与100/101候选预算耗尽，结果与新图注一致。最终320/390/1440×两主题共6组合检查了双语文案、布局并目视390浅色/1440深色，关闭。 |

[独立反例与oracle源码](ch11-independent-probe.java) / [Java日志](ch11-independent-java.txt) / [最终图注浏览器脚本](ch11-independent-recheck.mjs) / [最终hash及6组合结果](ch11-independent-recheck-results.json)。代码无需修改。

## 独立运行与计算

**真实JDK17.0.10** 编译 `FeedPage.java`、原16例和独立probe，输出保存在 [ch11-independent-java.txt](ch11-independent-java.txt)。独立probe种子 **11311**，200组固定源集，1,496次分页，用“拍平来源后全排序”的参考结果对照堆归并：输出、实际消费条数、next边界、partial、跨页严格前进与逻辑帖无漏无重全部通过。包括同毫秒、重复来源、删除与权限过滤。另显式检查空结果仍重检权限版本。

[独立检查程序](ch11-independent-check.py) / [机器结果](ch11-independent-check-results.json) / [可读结果](ch11-independent-check-results.txt)：27项检查与精确有理数复算通过。

- 用两个真实SQLite文件分别存Timeline输出和任务检查点，`synchronous=FULL`。写入2个目标后关闭/重开，检查点仍0；重放稳定3人快照得到恰好3行，重复行保留原时间；CAS旧游标仅一方能推进。故意先把检查点写到末尾、只完成1个目标，恢复后实际丢2人。它验证输出/检查点顺序及唯一约束，**不是PG行锁/Kafka/真实Graph故障实验**。
- 事件推演覆盖变化受众OFFSET漏项、固定快照、错误晚登记关注漏并发帖、pending→历史/水位→activate闭合、模式最终旧代际屏障。缓存用精确时间轨迹证明旧主库读的填充/TTL/响应预算上界；远端SET延至100s时，仅API超时可违反约29s，缓存端安装deadline必须拒绝。没有声称实现lease服务。
- 5份HTML代码与源码独立解码一致；32帧ID/顺序保留，只11帧SVG与基线不同，均在作者解释范围；D1/D3/D6全组逐字节不变。`sync.mjs --check`、本章audit及专属JS语法检查另行运行通过。

| 独立复算 | 结果 |
|---|---:|
| 日帖 / 平均 / 峰值 | 1M / 11.574074/s / 57.870370/s |
| 按发帖加权F=200的指针 / 平均 / 峰值 | 200M日 / 2,314.814815行/s / 11,574.074074行/s |
| 百万粉单任务 / 独占整层 | 100.5s / 33.833333s |
| 25k处理+排队+timeline阶段预算 | 0.5+2.5+1+1=5s |
| 峰值利用率 / 净余量 / 60k排空理想下限 | 38.580247% / 18,425.925926行/s / 3.256281s |
| 纯pull平均作者探测 / K8峰值尾读 | 462,962.962963/s / 92,592.592593/s |
| 指针工作集 / 正文复制 / 年正文三份 | 128GB / 2TB（15.625倍） / 1.095TB |
| 稳态点查 / 95%命中时普通页点查 | 3,474.814815/s / 11,574.074074/s |
| 缓存故障想要点查 / 相对4k预算 | 231,481.481481/s / 57.870370倍 |
| 20条 / 50条完整页回源上限 | 200页/s / 80页/s，另取Timeline限制 |
| 200k日错误预算在固定峰值耗尽 | 17.583849s |
| 正文驻留 / 响应删除界限 / timeline年龄 | 27s / 29s / 1s |

这些是教学假设推导，既不代表实测p99，也不能由整层平均余量推断单片健康或N−1容量。

## 独立图形与真实视口

[自有浏览器脚本](ch11-independent-browser.mjs) / [初轮结果](ch11-independent-browser-results.json)从初冻结版本独立生成D2/D4/D5**全部16帧×两主题=32张SVG截图**；390px同组每帧另外保存实际viewport的左右滚动截图，共64次桌面/窄屏翻帧。1440/390×两主题四组合均实际`innerWidth=scrollWidth=设定宽度`，无pageerror。作者窄修仅图注后，本复核再用最终hash做了6组合图注验证。

已逐组目视全部上述32张桌面图及390px两主题左右通道联系表，非只看几何计数：D2缩小柱体后标签/徽标不挤线；D4安装截止与TTL说明可读，失效/回填/权威返回方向正确；D5 bound标签与竖线留开，Merge/Hydrate各帧连续，复杂折线用于请求/返回避让，未发现须继续返修的遮字、裁切或错误绕线。窄屏中图保持自身横滚，控件可达；图注随同一slide横滚的公共行为仍存在，滚回可读。

代表：[D2浅色全帧](screenshots/ch11-independent/d2-parchment-sheet.jpg)、[D4深色全帧](screenshots/ch11-independent/d4-dracula-sheet.jpg)、[D5深色全帧](screenshots/ch11-independent/d5-dracula-sheet.jpg)、[390深色D5各帧左右](screenshots/ch11-independent/390-d5-dracula-boards.jpg)、[修后390双语图注](screenshots/ch11-independent/recheck-390-parchment-caption.png)。完整原始viewport PNG均保留；联系表裁剪副本仅便于比较，没有用裁切图冒充手机viewport。

## 一手来源抽核

2026-10-23重新浏览原文，并核对实际支持句：

- PostgreSQL18 [INSERT](https://www.postgresql.org/docs/18/sql-insert.html) / [READ COMMITTED](https://www.postgresql.org/docs/18/transaction-iso.html)：唯一索引冲突与新语句快照，支持回滚后读胜者；不等于本机已执行PG竞争。
- PostgreSQL18 [Row comparisons](https://www.postgresql.org/docs/18/functions-comparisons.html#ROW-WISE-COMPARISON) / [LIMIT/OFFSET](https://www.postgresql.org/docs/18/queries-limit.html)：非空tuple逐字段比较、唯一排序、被OFFSET跳过的行仍计算。100/250扫描预算由本章自定。
- Redis [ZADD](https://redis.io/docs/latest/commands/zadd/) Details：同score按二进制字节序，double精确整数范围±2^53；不证明持久inbox或cache lease API。
- Kafka4.1 [Message Delivery Semantics](https://kafka.apache.org/41/design/design/#message-delivery-semantics)：外部目标需协作，Kafka topic事务不能自动包住全部分片inbox。
- [Memcache论文](https://www.usenix.org/system/files/conference/nsdi13/nsdi13-final170_update.pdf) §3.2.1：delete撤销每key lease token，阻止旧SET；epoch、安装硬截止和29s属于本章额外契约，非论文数字。
- [TAO论文](https://www.usenix.org/system/files/conference/atc13/atc13-bronson.pdf) §§3.1–3.4：对象/有向关联/逆边/按time排序的关联列表；不将其最终一致性当作本章权威权限检查实现。
- [原transactional outbox模式](https://microservices.io/patterns/data/transactional-outbox.html)：业务/消息同事务、独立relay、发布后标记前重复窗口；没有引申为免费exactly-once。

## 限制与最终状态

未运行真实PostgreSQL、Kafka、Graph或cache lease实现；没有生产压测、复制/提升、磁盘掉电、权限服务线性化或真实网络断开试验。Java证明所列归并轨迹，SQLite证明所列输出/检查点执行顺序，事件模型只核对协议前提；均不建立生产分布式保证。完整24组合公共交互的最终批次回归由主代理另行负责，本报告不占用其结果冒充独立操作。

IR11-01已关闭；最终源码hash与修后6组合、27项检查及Java重跑一致。可交主代理最终验收，不延伸其他章节。
