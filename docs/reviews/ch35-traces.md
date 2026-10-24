# Ch35 正常与失败轨迹

## 实际执行：SQLite权威边界

`examples/ch35/check.py`的105项断言覆盖下列窄模型，原子性由真实SQLite事务而非内存锁实现。结果见`ch35-code-results.json`；线程/进程数量不是生产分布式实验数。

| 输入/窗口 | 已执行的安全结果 |
|---|---|
| 正常reserve→dispatch→consume→retire→release | `(tenant,rid)`唯一；两笔sequence/KV信用同时扣/退；只有原首次dispatch/consume调用获执行权 |
| 8个独立连接争最后1槽；8连接争8 MiB而每笔5 MiB | 各只有1个成功；失败不留permit、不部分扣tenant |
| 8个连接重放同key | 一次created，其余原身份；不同请求/信用冲突，终态不会重开 |
| tenant扣后注入异常；replica不足 | 整事务回滚，tenant与permit不泄漏 |
| 原caller提交DISPATCHING后丢回包 | 新caller的begin_dispatch=False；expire不能退DISPATCHING信用 |
| consume提交后丢回包 | 同worker/epoch/bundle再consume=False，不再授权GPU启动；旧epoch/错误bundle也拒绝 |
| cancel仅开始RETIRING | running不能直接release；取消后仍计占用；可信完成匹配身份后唯一退还，重复通知不再退 |
| 20次dispatch/expire两连接竞争 | 至多一条边赢；dispatch先赢时不能TTL释放；expiry先赢不再dispatch |
| 进程在BEGIN/部分UPDATE后os._exit(17) | SQLite恢复未提交事务；计数回原值 |
| 进程reserve提交后、返回前os._exit(18) | 重连重放原hold，不重复扣信用 |
| 另一连接持写锁，准入时钟199→201，deadline200 | 等锁期间clock调用0次，获得事务后才调用1次并拒绝，无permit/信用；真实等待约50ms，不是SQL外旧时间判断 |
| 发布写snapshot/control/publication后、audit前注入异常 | 当前revision、快照、结果和audit全部回滚 |
| 两发布者竞争expected_rev；发布回包未知重放 | 只一位发布新rev；同幂等key回原结果，改内容冲突 |
| 回退指回旧bundle；新bundle持久state schema不兼容 | 回退revision增大；schema不符拒绝，不只比较权重 |
| 新版上线时旧v1 RUNNING/HELD/DISPATCHING并存 | active仍绑v1；撤路由后drain清未派发hold，RUNNING/UNKNOWN阻unload；已授派发可在原deadline内消费，不能忽略它 |
| drain中试图热回退，或卸载后仅artifact还在 | 元数据ready/draining门拒绝；物理完成可信通知之后信用归零才可卸载 |

## 保留的危险反例：手工协议推演，非真实GPU/网络实验

1. **只看队列提示**：A/B都读`used_kv=0, cap=8`，各接受5 MiB，再分别写计数，实际需求10>8。安全实现的条件更新和unique permit在一个数据库写事务，只一方获准。
2. **TTL退款UNKNOWN**：DISPATCHING提交→RPC送达但ACK丢→worker kernel仍用资源→TTL退信用→B获同一资源，物理重叠。正确做法保留旧信用、禁止重复发送/启动，核查/隔离或完成后退休。测试只验证保留账，不伪造kernel结果。
3. **查询到RUNNING就补启动**：原consume已提交并启动，ACK丢失；恢复者查RUNNING再enqueue，会产生两次工作。代码只允许原`consume=True`的caller启动。提交后、启动前崩溃会保守丢进度，不能用恰好一次完成宣传。
4. **发布前切流再加载**：route选择v2，而v2仍缺shard/warmup失败，request落空。先封存→register→desired→完整READY，再原子发布；snapshot写入但audit失败也不能部分提交。
5. **只回权重，旧reader读新状态**：v2写s2 checkpoint、v1只读s1→切alias回v1→状态不可读。模型拒绝不兼容schema；跨版本KV/会话状态不自动迁移。扩展兼容reader/格式跨热窗保留，旧writer与流drain后才删除旧格式。
6. **把warm对象当warm设备**：force-stop后对象仍可查，但旧GPU已释放，新版全流量出错；改alias不能凭空生成旧服务容量。保留旧热副本才承诺快退；冷回退至少等待加载，真实时间未测。
7. **把控制器失联当任何权威都可失联**：路由快照仍新鲜、Ledger连接已断，Router本地私发permit会绕过跨Router额度。本文在Ledger不可达时关闭新hold；Fleet/Registry API故障且Ledger可达是另一情况。
8. **只少一张卡算N−1**：一个TP group跨4设备，一rank坏而其余3卡还在；不能把3卡当3/4副本容量。故障域移除所有触及它的完整group，再按同profile容量重算。教学单卡9副本3/3/3掉机器损3，80%预算19.2而非25.6/s。

物理完成、真实tokenizer/签名、容量/质量门、跨库结算、真实Kubernetes设备预留均是适配前提，未执行。本章引用CUDA仅限定event覆盖范围，不能把上述账本测试说成GPU无重叠证明。
