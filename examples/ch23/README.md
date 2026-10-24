# Ch23 · 游戏排行榜的代码与边界

页面六段代码由同一源码同步：`settle.pseudo`、`project.lua`、`around.lua`，以及 `Leaderboard.java` 的 `order` / `merge` / `page` 三个区域。完整 Java 类无第三方依赖，基线 Java 17；SQL 事务片段是 PostgreSQL 18 风格伪代码，不冒充可直接运行的 SQL 程序。

```sh
PYTHONDONTWRITEBYTECODE=1 python3 examples/ch23/sync.py --check
PYTHONDONTWRITEBYTECODE=1 python3 examples/ch23/check.py
```

默认 JDK 为本机 `/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home`，可用 `JAVA_HOME_CH23` 覆盖。默认 Redis 为已存在的 `/tmp/redis-7.2.5/src/redis-server`，可用 `REDIS_SERVER` 指定 Redis 7+ 二进制。检查器只启动自己的无 TCP 端口 Unix socket 实例，使用临时目录并退出清理，不接触其他 Redis 服务。结果写入 `docs/reviews/ch23-code-results.json`；截图和浏览器结果另见作者记录。

- `settle.pseudo`：权威游戏服提交完整绝对总分。事件身份是 `(game,season,player,match_id,kind,revision)`，规范化意图绑定 `authority_seq,absolute_score,achieved_second,comparator`。`authority_seq` 对同一 game/season/player 持久单调，更高值必须覆盖此前已接纳对局；生产者故障切换也不能重置。这个累计前缀责任由上游账本提供，本例不实现它。独立对局增量必须逐局去重求和，不能直接丢弃较旧增量。
- 原回执、玩家分数与各目的地 outbox 同库事务；同身份异载荷冲突，同身份同载荷回原结果。新 revision 可以降低绝对分。完整权威快照同时携带 score 与 achieved_second，接收端以更高版本一起覆盖，禁止根据接收端当前同分记录猜时间。上游在规范顺序中连续同分才保留秒，分数改变后返回旧值时按修订重新确定时间；首个零分也由权威给出真实秒。未知 COMMIT 重试原身份。global 与 region 各有自己的 ACK，不共享完成位。
- `schema.sql` / `model.py`：真实 SQLite 事务探针，`BEGIN IMMEDIATE` 串行所有写者，锁粒度与 PostgreSQL 行锁不同。覆盖并发重复结算、回执丢失、完整快照乱序、降分、事务回滚与截止。关闭探针使用已接受 outbox 身份的有限集合，不把最大数字当连续流前缀；没有实现生产 CDC、主从持久确认或控制器。
- 去重不做 TTL/GC。只有旧赛季永久停止接纳、允许重放与恢复路径均被栅住且在途排空后才可按归档政策清理；game/season 身份不得复用。未知旧身份只能查询/拒绝。epoch 是可重建存储布局代次，不是新赛季，也不是不可变数据集 ID。
- `project.lua`：实际 Redis 7+ 两键脚本，scores 为 ZSET，state 为 Hash。两键的完整 board/bucket/epoch tag 必须相同，由受信适配器路由。控制器先写 `__scope`、`__epoch`、`__mode`，业务 ACL 不准修改控制字段；`p:member` 存 `version:C`。LOADING/SERVING 允许写，FROZEN 不允许。旧版本无覆盖、相同版本不同 C 冲突；现存版本与 ZSET 不一致要求隔离重建，不能 ACK 成功。输入 C 来自已提交并校验的本章编码，非不受信客户端。
- Lua 隔离执行不等于出错回滚。坏类型与范围预检在写前完成；运行时写错误或投影 failover 必须隔离整个 epoch、暂停服务与 checkpoint，由持久控制器核对/重建，再发布健康 epoch。未知网络结果用同事件重试。脚本不能自行证明故障后所有成员仍在：两份成员状态一同丢失时，要靠先隔离后核验的外部健康协议，不能拿两个空读认定未上榜。已记录 checkpoint 不证明新主保住了投影。
- `around.lua`：健康、完整且可读 epoch 的一次主节点原子观察；rank/range/本人成员版本一起读取，最多 11 人。明确区分 UNRANKED、PENDING、错误；不会用不存在成员的 nil 生成第 1 名。它不是持久快照，不包含跨桶协议；副本读增加复制滞后。
- `Leaderboard.java`：完整 Java 17 类只实现纯函数。全序是分数降序、达成秒升序、逆 12 位 ASCII ID；C 最大 3,000,004,000,000，小于 2⁵³。`topK` 验证受信不可变 manifest 的 scope、snapshot、routing、order 和全部桶，各桶适配器须真实提供前 min(K,N) 条；本地 Java 不证明远端的 complete 字段真实。`page` 只处理已固定、已排序、已保留的快照，过期 410。HTTP 层须验证游标签名、访问权限和完整绑定；本例不实现签名或快照存储。

验证包含 12 个真实 SQLite 并发写者只产生一个原回执与两目的地记录；v1=(100,10)、v2=(200,20)、v3处罚回(100,30)的六种到达排列，SQLite与真实Redis全部收敛于v3=(100,30)；首个零分和来源连续同零分携带同一秒。还覆盖真实 Redis 的版本重放/降分、epoch 门、附近边界、部分状态损坏和写后脚本错误；Java 的 50 轮固定种子高并列 topK 与完整排序对照、缺桶/混快照拒绝、活榜分页重复反例和不可变分页。数字预算都是教学假设。

未验证：PostgreSQL 主从/故障提升、上游账本、真实 CDC/槽保留、Redis Cluster/OOM/主从失效、暂停/恢复控制器、租约 fencing、签名游标、奖励渠道及性能压测。没有把 SQLite 锁、Java 内存列表或单个 Redis 进程宣称为这些分布式保证的实现。
