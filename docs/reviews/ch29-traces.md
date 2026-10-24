# Ch29 关键路径推演

这是作者对伪代码的手工推演，**不是执行结果或真实DB/GPU实验**。Java实际执行另见`ch29-code-results.json`。队列/iteration/attempt伪代码依赖真实适配器，未编译。

| 片段 | 正常路径 | 直接针对承诺的反例与结果 |
|---|---|---|
| admission.pseudo | 租户A、B分别入队，均未占KV；A、B轮转，各受理一个head，记录charged(owner)，再入ready | A head需160信用而只余100时continue，B的较小head仍可考虑；全局100或租户25直接拒绝。等于600ms到期先撤销其quota。ready已有信用但尚未首次prefill，iteration仍检查同一wait_deadline并stop；on_release仅charged.remove成功一次才减tenant计数。 |
| Java admission | prompt16/output1向上取整2页信用，暂时实占0；allocate后只实占1 | 40GiB/2MiB=20,480页，128×160填满信用但物理页仍全空；第129条拒绝。Java真实执行。 |
| iteration.pseudo | t A/B/C，B EOS并经ticket退休/on_release；D在下轮取得信用，按chunk上限prefill；后轮每次decode一步 | 同一请求每轮至多选一次；token预算只剩0则n=0，跳过而不发空kernel；decode若不适合profile也不强发。大prefill的deficit跨轮积累，cap至少容最大合法chunk；游标/tenant起点轮换；无可用资源仍可到期，不能声称硬公平/SLO。输出count到max_output时先stop而不再发decode；重复ticket不应用进度。 |
| Java issue/stop/retire | 先snapshot/pin，GPU证据成立后complete；普通EOS也退休、refs/credits归还 | A kernel仍读P7时cancel：state=RETIRING，refs=1/pins=1，信用保留，B不能获准。fence后才能复用P7；重复旧ticket无效，旧Handle incarnation无效。共享A/B同页时A退出仍留B的refs/pins。Java真实执行，100次CPU EOS/cancel竞争。 |
| attempt.pseudo | claim唯一行→bind仅1行→按同boot/generation投递→finish同owner条件终态→同key返回元数据 | 两bind争抢只一条CLAIMED→ASSIGNED；另一条UPDATE=0必须取原行。claim提交回包未知同key读；正文不同冲突。bind后投递前死机不换owner重发，查询旧worker或隔离后INTERRUPTED。终态未知同key查询；旧boot/generation终态WHERE不匹配，不能覆盖新状态。未运行真实PostgreSQL。 |
| worker死亡/流 | worker死→隔离旧池/拒绝新准入→原attempt INTERRUPTED→显式新key+新prefill | 网关write37后断连接：客户端可能收到36/37/部分事件；原记录无token日志，不能从write次数恢复送达。只有网关失联不证明worker死，旧owner可能仍在执行；不盲开第二份。Java仅执行boot隔离，网络/送达是协议推演。 |

真实适配契约：完成证据覆盖全部kernel/copy/block-table访问；实际结果只在`complete`接受唯一ticket后应用一次，并核owner以及非CANCEL/DEADLINE。租户配额结算按attempt幂等，不由本地锁提供跨库原子性。模型只允许完整不可变块共享，不实现尾页COW。

## 独立复核P1返修

原admission输入quota已预留，队列满却直接返回OVERLOADED，确实缺少持久终态与释放职责。旧冻结保存在`ch29-quota-before/`，不把原577项Java检查冒称覆盖此缺口。现所有未启动满队列/等待超时由`reject_unstarted`写终态与唯一结算Outbox；同key始终回放原429。Quota释放与Outbox ACK分两库，丢回包/ACK均按attempt幂等重试。首次GPU提交的RUN_GRANTED门与ASSIGNED拒绝同一权威row竞争；终态拒绝不能启动，已启动不全退。`queued_total/active_total`明确为派生总和。

新增实际双SQLite适配的53项检查见`ch29-quota-results.json`；这是协议适配验证，不是生产跨库故障/远程配额服务实验。

第二窗口：on_release原先先删charged再持久化，DB失败会丢待办；现持久确认前保留charged，提交未知查同attempt，确认后才退本地tenant计数。两条新增实际路径分别注入事务失败与commit已成但回包丢失，再重复释放通知，均恢复唯一终态/outbox且不二次退计数。a53b版原源在ch29-release-before/。
