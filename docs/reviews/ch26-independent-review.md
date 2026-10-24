# Ch26 红包系统 · 交叉独立只读复核

2026-10-24，Ch27 作者以同一 GPT-6.1-Sol（`gpt-6.1-sol`）+ Max 独立复核。**通过本次审阅范围；没有新增已确认的 P0/P1 或阻碍阅读的 P2。** 不为凑数提出问题，也不把本地检查扩张为生产保证。

最终 HTML SHA256：`e85e427afce2c94f904d7b842e4f15d076da42f3d4839d4c33bc92b4d38417ee`。页面及全部 13 个示例文件（含 README、check.py、sync.mjs）的完整字典见 [审前](ch26-independent-source-hashes.json.before)与[审后](ch26-independent-source-hashes.json.after)，14 项逐字一致。未修改 Ch26、共享文件或 PLAN，也未执行会覆盖作者 JSON 的 `examples/ch26/check.py`；作者/主代理证据没有被本复核脚本写入。

## 新输入与实际执行

没有照抄作者结论。先完整阅读正文、六段页面代码及所有示例，再用 [独立探针](ch26-independent-probes.py)直接调用实际 `Store`、`Ledger`、三份 Lua 与 `SplitPlan`，新数据包括 800 分四份 `257/13/31/499`、退款先到的 `113+887`、最后份额 `73/43/47/67` 和晚确认资金 `37`。

[106 项实际 SQLite/Redis/整合探针](ch26-independent-probes-results.json)全部通过：

| 轨迹 | 复核的具体结果 |
|---|---|
| fund → initializing → READY → DB OPEN → Redis ACTIVE → candidate → claim → credit | 未确认资金不能领取；READY/DB 已开放但未激活时不能给新候选。实际 Lua 给 sA=257，DB 保存领取、两维库存、请求与 Outbox，账本最终给接收人 257。 |
| 同用户/键与业务身份 | 同用户换七个键仍汇聚为一个领取；同键换内部候选返回原领取；同用户同键换包冲突，另一用户同 header 独立。创建同键改计划或 deadline 冲突。内部候选不是浏览器可选金额。 |
| 最后一份竞争 | 九个真实 SQLite 连接争一份，只有一个持久领取；十三个真实 Redis 客户端争一份，只有一个候选。最后领取先赢则关闭退款为零且无零金额命令；关闭先拿锁并提交后，排队的最后领取被拒。 |
| 时间和事务回滚 | 实际 SQLite 写锁等待跨过 deadline，解锁后的 Store.now 判定拒绝，库存未扣。预占/领取部分写入失败回滚请求、库存和领取；账本写一条分录后失败也回滚余额、分录和 inbox。 |
| 退款与 pending credit | 已确认 113、未领 887，先提交退款而资金回复丢失，源保留 expiring；查询原键后只退 887、escrow 留 113。EXPIRED 后仍能给领取人入账 113。金额/份数及钱包+escrow 均守恒。 |
| 身份与资金效果 | 改金额、收款人、币种、packet、任意新 effect/operation ID 都不能通过持久原 grant。重复资金命令只留下两条平衡分录，不重复入账。可信认证和 grant 查询仍是显式 fixture。 |
| 原截止点后的资金确认 | 原资金命令已提交但响应丢失，源仍 pending_fund；同键确认后 initializing 无法开放，但可以关闭并退全部 37。该缺口由主代理实施期提出、作者在审前修好，本次用新输入独立验证，未冒称为本复核新发现。 |
| 旧 epoch / 迟到安装 | 当前代次重建排除已领份额；旧安装和激活只影响旧键空间，旧 ACTIVE 候选仍不能越过 DB epoch。旧 publisher 和截止后 READY 安装均不能重开已关闭包。 |
| Lua 错误边界 | 同 token 不补回已消费 List；空剩余安装可返回 EMPTY；重复份额/零金额/孤儿键/错误类型在对应验证门拒绝。真实 SET 后 Lua error 保留 SET，未将脚本隔离称为出错回滚。 |

每个相关生命周期阶段分别核对 `total = claims + remaining + refund_pending + refund_applied`、`count = claimed + remaining_n + closed_unclaimed_n`，以及账本每笔两腿和为零、总钱包加 escrow 等于初始 50,000 分。实际 SQLite 为本地单写者事务，不是 PostgreSQL 行锁/复制证明。

[独立 Java 探针](ch26-independent-SplitProbe.java)与原 `SplitPlan.java` 一同用 **JDK 17.0.10、--release 17** 编译，运行 306 个断言。新测试强制抽上下界，覆盖最低额紧边界、99/100 份、1 万亿分、均分余数、Long.MAX_VALUE/非法输入和不可变结果；没有只调用作者 main，也没有宣称统计随机公平性得到证明。

## 数字与一手来源

[24 项 Decimal/整数独立复算](ch26-independent-numeric-results.json)通过：确认均值约 115.74/s、十倍约 1,157/s；点击约 578.70/s、十倍约 5,787/s；2 ms→500/s、60%→300/s、100/s 为理论 20%；热点至少 99% 无份；七天 21 GB、三份 63 GB、金额本体 80 MB/天；拆分 U=500/466/299、带最低额 12 的新例 U=15；原业务窗口 24 h=86,400,000 ms。所有速率与尺寸仍是教学假设。

[独立来源记录](ch26-independent-sources.md)重新浏览 Stripe、Redis 与 PostgreSQL 一手文档：

- [Stripe](https://docs.stripe.com/api/idempotent_requests)确实区分 v1 首结果/含 500、至少 24 h 后可清理、参数比较和 v2 可继续失败/部分工作。页面没有把外部有限窗口套给内部资金去重。
- [Redis 脚本](https://redis.io/docs/latest/develop/programmability/eval-intro/)、[事务错误/回滚](https://redis.io/docs/latest/develop/using-commands/transactions/)与 [WAIT](https://redis.io/docs/latest/commands/wait/)支持隔离、不提供事务回滚、WAIT 不产生强一致或切主不丢写保证的边界。实际探针只运行独立单机 Redis 7.2.5，未伪称做了复制切换实验。
- [PostgreSQL 行锁](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS)与[实际时间函数](https://www.postgresql.org/docs/18/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT)支持共同裁决点及锁后 clock_timestamp。页面明确判定点在持锁校验时刻，提交可稍晚，没有误用事务开始时间。

## 动画、双语与真实浏览器

六组 31 帧与全部 title/desc ID 保留，与本批授权前清单一致。独立渲染 [62 份双主题帧](ch26-independent-render-results.json)，完整查看全部 31 帧两主题；D1/D4/D6 修改组逐帧核对节点、标签、请求/回复与状态。

D1 把 funded 与 open 分开，投递结果回到 Relay 再保存；D4F5 的红线是 Relay 自己的 timer，没有把本地等待超时画成渠道回复；D6 新旧代次与当前 DB gate 相符。保留图的末帧也与正文、代码、英文和闪卡一致。未看到新的短线穿字、裁切或阻碍追踪的问题；这个结论来自实际帧和窄屏查看，不是“整页没横溢”的替代判断。

[12 个真实浏览组合](ch26-independent-browser-results.json)：390/1440 × 两主题 × zh/en/both，展开细节前后实际 innerWidth 与整页 scrollWidth 一致，124 次翻帧、6 段逐字复制、键盘/播放/速度/循环、闪卡点按/键盘、进度与设置持久化通过，页面/资源错误 0。D1/D4/D6 每帧两主题分别看真实 390 左/中/右，共 **90 个横滚截图位置**；图和代码在自己的容器中滚动。截图位于本地已忽略的 `screenshots/ch26-independent/`。

额外只读运行 `node examples/ch26/sync.mjs --check` 与 `node tools/audit-chapter.mjs ch26` 均通过。最初浏览器辅助脚本的基线文件名替换错误在导航前即报 ENOENT；修正独立脚本后完整 12 组合通过，没有把它计为章节缺陷或隐去页面失败。

## 结论与范围

[最终证据绑定](ch26-independent-final-results.json)确认所有结果对应同一最终 HTML 和完整未修改源码。此次独立复核无新返修要求，审前已修的 INITIALIZING 到期出口在新输入下成立。

未验证实际 PostgreSQL 行锁/复制/切主、Redis Cluster/复制故障、真实 PSP 或钱包授权、签名 SDK、进程断电耐久、跨机时钟和生产压测。身份、群资格、不可变资金 grant、APPLIED 结果真实性、恢复 token/READY 适配与不回退已确认行仍是明确依赖；本地事务与样例反例通过不证明这些生产前提。复核未提交、推送或部署。
