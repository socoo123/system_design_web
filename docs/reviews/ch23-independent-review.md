# Ch23 游戏排行榜 · 交叉独立只读复核

2026-10-23，GPT-6.1-Sol + Max。结论：**独立复核通过；本次发现的1项P1与D1标签家族P2均经原作者返修并独立重验关闭，当前无未关闭P0/P1或阻碍阅读P2。** 未修改Ch23页面、示例、作者报告、PLAN或共享文件；仅写本独立报告与`ch23-independent-*`证据。未运行会覆盖作者结果的`examples/ch23/check.py`。

## 冻结对象与变更链

完整阅读HTML的中英正文、全部图注/闪卡，以及10份示例文件（模型、schema、两Lua、Java类/测试、伪代码、同步器、检查器、README）。先核11份授权目标与冻结一致，最后再次逐字节核11份目标。

| 阶段 | HTML SHA256 | 核对结果 |
|---|---|---|
| 初始复核 | `33c34c0a389972f2170abc519d45e316854244a4da1d327aaa7b29a963c89385` | 11文件匹配初始冻结；定位时间乱序P1 |
| P1修复 | `4f62d620249a9d2945cd05569a6a04bfe1f3ec5e76b8c76d36217c60a697c085` | 直接调用修正Model重验，继续图形复核 |
| D1图形收口 | `a11d47a087fb24fa0dc961055f50e325aadb0653d7e162766140aa576c71dac2` | 最终11文件匹配新冻结；10份示例与P1修复版字节不变 |

完整映射与前后链见 [ch23-independent-source-hashes.json](ch23-independent-source-hashes.json)。算法/SQL/Lua/Java实证绑定其精确源码哈希；最后仅D1 HTML文字位置改变，不重复无变化的算法测试。最终页面已重新运行浏览器检查和D1定向验证。

## 发现、复现与关闭

| 级别/位置 | 可复现反例 | 作者修正与独立结论 |
|---|---|---|
| **P1** `model.py`原第58行、`settle.pseudo`原第23行 | v1=(100,t10)、v2=(200,t20)、v3处罚=(100,t30)。原1→2→3得(3,100,30)，1→3→2却得(3,100,10)；接收端按自己已见同分历史保留时间，导致同一权威最高版本名次不收敛。 | 完整来源快照携带score和achieved_second，更高版本一起覆盖；连续同分保持时间由来源在规范顺序计算。原两路反例和额外六排列均独立通过；正文/EN/README/闪卡一致，**关闭**。 |
| **P2 · D1标签家族** 全5帧入口、F5说明 | 主代理指出match/result尾字被x120权威虚线穿过；复核者另在真实F5看见x648橙色竖线穿“ACK checkpoint only after apply”。初始独立PNG保留。 | match/result左移20，F5说明移x385/y261。独立重新渲染D1全部5帧两主题，实际390×两主题×三语言逐帧检查；文字与线分离，**关闭**。 |

P1初始失败证据：[ch23-independent-time-order-counterexample.json](ch23-independent-time-order-counterexample.json)。修复后新数据v31=(812,71)、v32=(1234,99)、v33处罚=(812,121)全部6种排列都得到(33,812,121)；不是复述作者相同输入的PASS。

D1图形定向证据：[ch23-independent-d1-recheck-results.json](ch23-independent-d1-recheck-results.json)。真实字体边界match右界108.23、result105.45，距x120线分别约11.77/14.55；F5说明右界627.64，距x648线约20.36。数值只辅助定位，实际看过两主题全组与390左右/中间图。

- 初始F5：[仍压线的实图](screenshots/ch23-independent/after/d1s5-parchment.png)。
- 最终D1：[浅色全帧](screenshots/ch23-independent/d1-recheck/d1-parchment-contact.png)、[深色全帧](screenshots/ch23-independent/d1-recheck/d1-dracula-contact.png)、[390入口](screenshots/ch23-independent/d1-recheck/390-parchment-d1s5-left.png)。

## 新输入直接验证源码

| 实证 | 本次独立动作与结果 | 边界 |
|---|---|---|
| SQLite/算术 **28项** | 直接调用作者Model：正常原回执/双目的地、同身份改序号/时间冲突、actor隔离、lost COMMIT ACK、原回执不改写、更高revision降分、较旧完整前缀拒绝、事务中断回滚、跨season身份、六排列收敛、原P1两路、首零分/连续同零分与来源明确时间更正、赛季关闭后重放/拒新、逐目的地ACK和高版本ACK仍留前方真实任务缺口。 | SQLite事务真实执行；上游完整前缀真实性、PostgreSQL行锁/同步副本与控制器未实现。 |
| Redis7.2.5 **42项断言** | 在独立port0 Unix socket实例运行未改的project.lua/around.lua；新23成员同分样本，居中ordinal12/11人、首尾6人、PENDING/UNRANKED、同版本异C冲突不变、更高版本降分/旧版本STALE、epoch读写隔离、FROZEN/LOADING门、缺一半状态拒绝。用ACL仅拒HSET使真实project.lua在ZADD后出错，实证ZADD保留而member state没有写；冻结后不再应用。 | 42含23个建立样本的插入断言。只启动本复核临时进程，不接触其他Redis。未做Cluster、OOM、复制、健康控制器或故障提升实验。 |
| Java17 **21项** | 直接编译作者Leaderboard.java与独立Probe。用独立(score↓,second↑,ASCII-ID↓)oracle核对157成员/3桶、K=1/3/7/100；拒缺桶、错routing/snapshot、partial、错K、未排序和重复玩家；不可变页遍历13页恰等完整排序，源列表清空无影响，跨snapshot/order/offset和到期边界拒绝。 | 本地函数不证明远端complete字段、分片冻结存储、游标签名或访问鉴权。 |

证据：[独立模型/算术](ch23-independent-model-results.json)、[独立Redis](ch23-independent-redis-results.json)、[独立Java](ch23-independent-java-results.json)。运行程序为`ch23-independent-model.py`、`ch23-independent-redis.py`、`ch23-independent-Probe.java`；Java产物只在临时目录，Python禁止写作者缓存。

复算：写2,893.5185/s、读1,736.1111/s、两视图投影5,787.0370/s；头部约1,388.8889/s；20M×160×2=6.4GB；按名义5,787新增，20M÷94,213≈212.285秒；10倍全球单key按10k预算需3桶，全球/一热区服共6桶。最大C=3,000,004,000,000＜2⁵³，一分优势大于完整时间tie范围。数值/假设/单位与两语言、图注和闪卡一致。

## 真实页面与全部修改组

独立帧渲染共94张：授权前D1/D4/D6共16帧×两主题32张，P1修复后全部31帧×两主题62张。逐组目视D1/D4/D6全部帧两主题；D1后续改标签另重渲染10张并全组再次看。保留6组31帧与ID，未删帧。

D6F5/6的`snapshot at W`与改前实图对照：从x555移至530后不再撞橙竖线；仍是原快照步骤，没有改成新流程。独立前后图：[改前F5](screenshots/ch23-independent/before/d6s5-parchment.png)、[改后F5](screenshots/ch23-independent/after/d6s5-parchment.png)、[改后F6](screenshots/ch23-independent/after/d6s6-parchment.png)。D4全桶/混时间/缺桶失败和同快照前提与代码一致。

最终 [ch23-independent-browser-results.json](ch23-independent-browser-results.json)：390/1440×两主题×三语言 **12组合**，124次翻帧、6段复制及播放/键盘/闪卡/已读/偏好持久化通过；真实innerWidth=scrollWidth，无展开details整页横溢出，资源与页面错误为零。D1定向另有390×两主题×三语言6组合、30次翻帧与逐帧横滚；图和长代码使用现有容器内横滚提示。

一手来源抽核见 [ch23-independent-sources.md](ch23-independent-sources.md)。Redis命令/tie/精度/无回滚、PostgreSQL共享锁与导出快照支持相应结论；来源完整前缀、快照manifest、控制器健康隔离与游标签名仍明确标为依赖。六段源代码同源检查通过。

## 实证结论及未验证

正常路径可以从同身份原回执到两目的地独立投影，再到原子附近读或不可变快照分页；最关键的乱序时间反例已在源码修复后收敛，Lua部分写和缺桶/混快照等错误均没有被误报为精确成功。当前复核范围内无未关闭的核心正确性或阅读阻碍问题。

未运行真实来源计分账本、PostgreSQL复制/切主/CDC槽、Redis Cluster/OOM/主从故障、健康检测/暂停恢复/fencing控制器、签名游标、奖励渠道或压测。没有把SQLite全库写锁、Java内存列表或临时单Redis证明为这些分布式保证。
