# Ch21 · 预订归属与准入闸

页面七段来自本目录：`create.pseudo`、`finish.pseudo`、`admit.lua`、`resolve.pseudo`、`receipt.lua`、`recover.pseudo`、`delivery.pseudo`。伪代码明确标识，不冒充 Java 或可部署 SQL；Lua 是实际 Redis 7+ 教学脚本。

```sh
node examples/ch21/sync.mjs --check
python3 examples/ch21/check.py
```

测试只用 Python 3 标准库。`REDIS_SERVER` 可指定 Redis 7+ 二进制，默认使用本次环境的 `/tmp/redis-7.2.5/src/redis-server`。脚本启动隔离的 Unix socket Redis，不更改机器服务；临时数据库与进程测试结束自动清理，结果写入 `docs/reviews/ch21-code-results.json`。执行时禁用模块字节码缓存。

`schema.sql`、`model.py`执行真实 SQLite 唯一约束、条件 UPDATE、SAVEPOINT、事务回滚和并发线程。`BEGIN IMMEDIATE` 串行化全库写者，比正文 PostgreSQL18 的 fence共享锁、hold排他锁、有序库存行锁更粗；这些测试不证明 PG 行锁、复制和故障切换。模型在 SQL 中调用注入的 `model_now()`，在取得写锁后采样；它是可控测试时间，不是实际 DB 时钟同步实验。生产伪代码使用拿锁后的 `clock_timestamp()`。

库存输入是认证 owner、非空请求键，以及完整意图 `{scope, items, order_id, policy_version}`。资源排序去重、数量为正整数，摘要绑定 owner、操作和完整意图。价格/渠道收款由 Ch18 绑定；若本接口承诺价格，需将可信报价、金额和币种加入摘要。token 是服务端对 `(owner, CREATE_HOLD, key)` 的稳定摘要，不是鉴权。`requests` 的中间 CLAIMED 从不单独提交；定库存不足通过 SAVEPOINT 撤销所有库存和 hold 后，保留原身份提交 REJECTED。非预期异常整笔回滚。成功重放原 HELD 回执（含原 deadline），当前状态从独立查询读取；拒绝或取消身份不会变成新创建。

`finish.pseudo` 从不可变 hold 归属查 scope，再锁 fence、hold并复核归属。完整预期明细、每条 scope、数量和 HELD 状态证明本单所有权；聚合 reserved 只是额外防损检查。计数、终态与 outbox 共事务。确认资格在拿锁后判定，等于 deadline 已过期；已释放不得被迟到收款复活。命令认证、Ch18 的真实收款验证与 owner/order/hold 绑定是显式适配契约，模型仅检查传入绑定，不执行密码学验证、支付网络、退款或履约。

`admit.lua` 和 `receipt.lua` 都在一个 `gate:{scope}:epoch` hash 内读判，再以一次 HSET 写入；未核销 token 不设 TTL。脚本原子性是同进程无交错，不是脚本异常回滚、跨库事务或 AOF 保证。测试实际执行“先写后脚本报错”负例，确认此前写入仍保留。Redis入口由可信 API 使用，不能给客户端执行权限；模型 create 接受可信适配层给出的 epoch，不冒充验证 Redis 签发证明。真实 API 将 principal/digest/quantity/token 绑定到同一意图，DB 保留条件库存终审。

Lua 的 500 是每 Redis 计时秒的新 token 上限，固定窗口边界允许突发，回拨不重开桶。`10000/500=20s` 仅为每token一件且不回补重售的名义稳态等效时长；首尾固定窗边界可突发，不能推出20秒墙钟硬下界。外层 DB 调度器须对全部创建尝试（含重复和冲突重试）实施预算与硬并发保护；确认、释放、查询也要独立预算。本例没有实现分布式全层调度器、账号限购或公平排队。若要限购，DB 增加活动×用户的权威约束，Redis标记只过滤。

`receipt.lua` 仅接受可信 DB Outbox 收据，校验 epoch、token 所有权、principal、完整摘要、q、状态与版本。允许终态先于 HELD 抵达；旧版本加零次，同版本异状态或终态冲突报错。CONFIRMED 不回补；RELEASED/REJECTED/CANCELLED 各自最多恢复其一次准入。无 token 也不造配额。DB提交未知只查询/同身份串行取消；原 CREATE 与 CANCELLED墓碑争同一唯一身份，先关闭迟到创建，再由已知终态收据修闸。

暂停版恢复使所有库存转换遵守同 scope fence。写者共享锁持到提交，恢复排他锁 `active=false, epoch+1` 排空旧事务。快照包含全部 HELD（含过期未释放）和 CONFIRMED，核对库存聚合与归属，导入仍需保留的请求/终态身份。`snapshot` 字段保存快照内容摘要。示例从不清理请求、tombstone、outbox/inbox；生产保留须覆盖最大可重放窗及在途排空，删除身份还要有可验证的签发有效期，旧键只能查询或拒绝。

`install.lua` 验证完整快照，再在新 epoch 键上置 ready=0、分块写入、最终 ready=1。中途普通运行错误留下的部分数据保持关闭；同一未开放快照可继续，已开放同快照重放只读，不能重置已经变动的 free。不同或损坏快照保持关闭，换新 epoch。安装器限制 20,000 身份、4MB，超过拒绝；实际跑过 5,000 身份快照，未测生产停顿。所有 Lua 仍运行一个进程，不是 Cluster/AOF/崩溃耐久实验。

新 epoch 使用独立 key；旧安装器/收据最多写旧 key，不能改当前闸。控制器在 DB 中核对 recovery_id、epoch、已确认安装摘要后恢复 DB，再发布当前 epoch/开入口。未知安装 ACK 重试同快照，不 DEL/重装已开放状态。旧 epoch 已落库但仍 HELD 的 hold导入新闸，其将来转换用当前 epoch 收据；旧效果不能再次加入快照。测试运行 pause、快照、实际 Redis安装、元数据 ACK 验证、resume、旧写拒绝与旧 hold 的新 epoch释放。

Outbox显式分型：`HOLD_STATE`有真实hold_id，发送OrderAPI完整hold投影，若有闸也发Redis；`REQUEST_TERMINAL`是无hold的REJECTED/CANCELLED，只给有闸请求安排Redis任务，不投递hold投影。无闸请求的终态记录保留作本地查询/审计；认证owner用原请求身份查询固定拒绝/取消回执，不捏造hold身份。`event()`验证类型与状态/归属组合。hold消费者在任何inbox提交/ACK之前验证kind、非空hold_id/event_id、正整数版本与合法hold状态；`projections.hold_id`显式NOT NULL，SQLite不能用多个NULL掩盖PostgreSQL主键语义。实际探针保留两用户独立库存不足及无身份/错类型拒ACK反例。

HOLD_STATE下游inbox与完整投影更新同事务，旧版本不能覆盖新状态。它不实现增量计费、发货/退款 exactly-once。模型消费者在独立临时 DB 验证。Redis 与 Order API 是不同目的地/ACK；`deliveries(event_id,destination,sent)` 分别保留每个投递任务。实际 relay 在事务外发送，持久 ACK 后只标当前目的地；执行了发出后崩溃、同 event 重投、消费去重和 Redis未ACK仍pending。真实网络/持久ACK由适配器契约提供。到期扫描契约为固定 cutoff 连续分页、失败仍保留 HELD/due、下一轮从最老到期重启；扫描调度器仅在伪代码说明，未实现生产调度服务。

没有执行真实 PostgreSQL、Redis Cluster/AOF/切主、支付验签/网络、生产压测、在线不停写恢复；没有把内存/SQLite契约或单进程Lua测试冒充上述保证。
