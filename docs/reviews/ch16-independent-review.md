# Ch16 评论系统 · 独立只读复核

2026-10-23，Ch18作者交叉只读复核，GPT-6.1-Sol (`gpt-6.1-sol`) + Max (`max`)；未派子代理。

**结论：通过。未发现未关闭的P0/P1或阻碍阅读的P2。** 结论绑定最终HTML SHA256：
`51ab82ad45b71a1b4e8660d188fd5b52a7c34046c058770012c06af9eb179eed`。

完整阅读当前正文/图注/英文/五段源码、支持Lua与验证器，比较原始基线及PLAN §4–8，再自构造新输入执行。未运行会覆盖作者报告的`verify.py`入口；仅加载其Redis协议客户端/Schema/flush定义，实际Lua和分页SQL来自作者原文件，探针与全部输出均另存`ch16-independent-*`。没有修改作者页面、示例、报告、共享文件或PLAN。

## 技术复核

| 核对面 | 独立重走与结论 |
|---|---|
| 真父子/root关系 | 根的parent为空且root=self，回复从已鉴权且当前visible父行继承root；父/root/排序字段不可变，同帖guard覆盖创建、编辑、删除、审核。复合外键不证明传递root关系，独立SQL负例确实可插入同帖错误root；正文明确把它作为应用层契约，没有把外键说成全部保证。 |
| 墓碑/隐私 | 从实际page.sql抽出root投影，在42个混合时间root及never-public pending/rejected/deleted、公开后删除/重审root上执行。前者全部不展示，后者只unavailable/结构ID/时间，body和author为NULL，私密body标记未泄漏。可见回复仍能归属旧容器；隐藏目标不再联出正文/profile/quote。 |
| 分页/每楼上限 | 实际root SQL按时间+ID续页不重。实际LATERAL子查询仅将`r.id`换成每楼绑定参数在SQLite执行，三楼各12条并列时间回复，各只取3条，续页从最后预览取得剩余9条且无交集。没有把它说成执行过PG LATERAL/计划。审核晚通过进入已越过区间必须刷新，正文、D3、英文与闪卡相同。 |
| 原Lua点赞 | 在独立Redis7.2.5中执行原脚本：97独立成员并发全部计入，71次并发重放同用户均delta0。冻结97后并发41次unlike仍进入delta−41，不能抢先冻结第二批；总数为56。延迟旧like覆盖unlike的接收顺序实际复现，页面没有许诺用户操作顺序。 |
| 冻结/ACK/账本 | 原rotate/ack Lua不变；实际SQLite执行作者flush函数的新batch/comment输入。先+97后−41得56，丢提交ACK重放不多加，错payload ACK不清批，变payload不改计数，underflow约束失败连账本一起回滚。ACK只清旧批，新delta仍在。PG CTE必须检查预建计数行和新语句payload，源码注释/正文均明示。 |
| 成员丢失恢复 | 缺key原Lua拒绝写。另故意违反初始化契约，保留ready=1/旧total但清空成员，旧用户重试会多加；这证明恢复栅栏不可省略。页面明确任何restart/failover/snapshot restore先停写，计数无法重建成员；只读或显式新代清零且隔离旧批，未宣称Lua自检/自动恢复。该负例是已声明前提的验证，不是未关闭缺陷。 |
| 审核/outbox | 正常提交将Comment/Receipt/审核outbox放同一post-shard guard事务，202仅接受。独立重演approve(v4)/delete/replay六种顺序，删除最终不复活且可见性事件至多一次；编辑升版本同样挡旧结果。状态与visibility outbox共提交，下游event_id+计数共事务。该部分是明确的伪代码契约轨迹，未伪称运行真实审核/队列。 |
| 缓存/撤回 | BUSY仅等待有效页或503，不旁路；CACHE_UNAVAILABLE才能在共享全层额度下回源且不填缓存。独立反例确认100个同键等待者只1次owner查源，12实例仍共享600额度；不是每实例600。旧token被失效拒绝，查询前开始的绝对not_after不随迟到fill续期；手工枚举删除/结束时点均符合5秒条件界。禁止旧事务/滞后副本，预留时钟与发送余量，已发客户端副本不在保证内；这些前提在双语中一致。 |

独立44项结果：[探针脚本](ch16-independent-probes.py)、[JSON](ch16-independent-probe-results.json)、[执行日志](ch16-independent-tests.txt)。本人的44项不等于作者67项复述。

复算：评论/点赞/列表峰值1,157.407/5,787.037/8,680.556每秒；热帖40%为3,472.222/s；95%命中回源434.028、余量165.972；全层缓存失效超额8,080.556/s、容量倍率14.4676；20+20×3=80；每日10–20GB、年3.65–7.30TB、三份10.95–21.90TB；1000脏键/10秒=100事务/s；十分钟审核积压94,444.444，20个100/s worker峰值利用57.870%。全是教学假设推导，未混用峰值与日增、页查询与全库事务能力。

## 图、双语和真实页面

[源比对](ch16-independent-source-results.json)：6组30帧及title/desc ID顺序保留；25帧局部变化，D2五帧逐字不变；没有NaN/undefined/Infinity。D3筛选标签改ever_public，D4说明一hash/一次HSET，D5完整意图而非仅正文，与实现和12张闪卡对应。

本人独立真实Chrome渲染全部30帧×两主题，[渲染脚本](ch16-independent-render.mjs)/[结果](ch16-independent-after-render-results.json)。实际目视所有变更组D1/D3/D4/D5/D6的完整5帧、两主题，共50帧；没有只看终帧或引用作者几何报告。入口response/accepted/202/200全部在分区留白，D6F5的503独立下移后不贴Edge；线/标签可追踪、帧间位置连续，未见短线挤字或需重画的大框。

本人另跑[浏览器脚本](ch16-independent-browser.mjs)/[结果](ch16-independent-browser-results.json)：320/390/768/1440×两主题×zh/en/both共24组合，展开details后全部`innerWidth=scrollWidth=目标宽度`；120次翻帧、5段复制逐字一致、键盘/播放暂停/速度循环、闪卡、已读与设置持久化通过，页面异常/资源错误为0。

真实390 viewport中，对D1/D3/D4/D5/D6全部帧两主题逐一左/中/右滚动，保留150张原figure截图，并目视10张从这些实际截图派生的接触表。派生表裁掉图外长图注只是便于检查；不是CLI窄图裁切模拟viewport。重点D1/D4/D5/D6入口家族逐帧左右中可达、标签留白足够，caption随slide横滚属于共享组件现行为，回左可读。

代表：[D1浅色逐帧](screenshots/ch16-independent/after/d1-parchment-sheet.jpg)、[D4深色逐帧](screenshots/ch16-independent/after/d4-dracula-sheet.jpg)、[D5深色终帧](screenshots/ch16-independent/after/d5s5-dracula.png)、[390 D6实际左端](screenshots/ch16-independent/browser/d6s5-parchment-left.png)、[390 D5实际中段](screenshots/ch16-independent/browser/d5s5-dracula-middle.png)。完整证据在`screenshots/ch16-independent/{after,browser}/`。

5块同源、chapter audit、独立JS语法与diff空白检查通过：[检查日志](ch16-independent-checks.txt)。未改共享工具或通过删检查掩盖问题。

## 引用与未验证边界

独立联网抽核的官方/原始资料：

- [PG18 LIMIT/OFFSET](https://www.postgresql.org/docs/18/queries-limit.html)支持唯一排序及跳过行工作；[PG18 LATERAL](https://www.postgresql.org/docs/18/queries-table-expressions.html#QUERIES-LATERAL)支持每输入行相关探测，不能把20探测算成1。
- [PG18隔离](https://www.postgresql.org/docs/18/transaction-iso.html)支持新语句快照、并发冲突后新语句回读；不支持cursor自动冻结跨页集合。
- [Redis Lua](https://redis.io/docs/latest/develop/programmability/eval-intro/)核短脚本隔离，[Redis事务](https://redis.io/docs/latest/develop/using-commands/transactions/)明确无rollback；实际Lua执行用于核对本章行为。[Redis持久化](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)区分RDB/AOF/no persistence，不证明本章接受后不丢。
- [AWS outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)支持同事务意图和重复安全消费者；不保证数据库+队列跨系统事务。
- [NSDI13原论文§3.2.1](https://www.usenix.org/system/files/conference/nsdi13/nsdi13-final170_update.pdf)确有key绑定租约token、delete使token失效、等待者减少惊群；本章5秒绝对期限和600配额是自己的假设，不取论文生产数。

未运行PostgreSQL LATERAL/行锁、Redis Cluster/复制/AOF/恢复部署、真实队列/审核、跨实例租约/全局限速、时钟漂移/慢输出或生产压测。SQLite、原Lua执行和独立契约轨迹分别记录，不能合称已验证生产分布式保证。

复核起止HTML都为上述冻结hash；本记录完成后停止写入，主代理负责最终验收状态。未提交、推送或部署。
