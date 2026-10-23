# Ch07 独立复核

2026-10-22；复核者 ch08_author，Astra High。先独立阅读 `chapters/ch07.html` 和 `examples/ch07/` 全部文件，手工追踪正常/失败路径，再读取作者报告。未修改作者文件或共享文件。

**结论：本次范围内通过。未发现待关闭的 P0/P1 或阻碍阅读的 P2；无需作者返修。** 这不是生产可靠性认证。

最终审阅 HTML SHA256：`04a168ec0801e492342d186e2d4d3103292d8e4efcf957566b9aa71b33e2029d`。

## 独立重走的机制

- 正常本地发号：单个 Window `(worker=7,lo=1000,hi=1030)` 内先验范围，再在同一个 synchronized 临界区比较 last、递增/reset sequence、记录 last、拼接。重读同一毫秒不会重新发 seq0。
- 回拨：作者示例的 `(last=1000,seq=42,now=998)` 重读到1000发43。额外独立测试回拨4ms，恢复相等后 nextId 只增1；恰好达到5ms预算时永久HALTED，未默许在截止点复活。单调预算不包含锁外队列/线程暂停，正文已说明。
- 重启/克隆反例：同一 Window 复制成两个新 Generator 会发出相同 ID，作者特意断言此反例；正文明确单授权仅一个活状态机、禁止快照克隆、重启新领窗，未把本地 synchronized 当分布式证明。
- 旧 owner 迟到：旧窗 `[1000,1030)` 的旧调用返回时间可能晚于新进程，但 ID 的时间字段仍是1000；新窗 `[1030,1060)` 从1030发号，数值域不重合。独立代码再运行此例。这里不承诺拒旧业务副作用或按响应时间排序。
- 分配与续窗竞争：独立枚举两种行锁顺序。旧续窗先提交，则旧H=1060，新进程从1060领取；新领取先提交，则旧H=1030，新进程从1030领取，旧 generation 续窗失败。两顺序均无重叠，见 [独立交错和算术](ch07-independent-math.json)。迟到的旧续窗成功结果最多扩大到它已先行持久预留的范围，不侵入后来领取的新窗。
- 授权持久性：窗口高水位/代数与号段 high 都必须在所有允许的故障切换后保留。回退到异步旧副本可以重复授予范围，正文和测试均把它当反例，未宣称仅有 row lock 即保证切主安全。
- 未知提交：窗口/号段响应不确定即烧掉该结果后重新申请；不能恢复旧 grant 并重置计数。即使第一次实际提交，后续从持久高水位之后申请也只是产生空洞。号段 RETURNING 必须等 COMMIT 确认才消费，正文/伪代码一致。
- 整数边界：Window 拒 worker−1/1024、lo=0、空窗和 hi>2^41；t≥1确保正ID，最高合法 Snowflake 元组为 Long.MAX_VALUE。号段使用排他上界与 `high <= Long.MAX_VALUE-step`，永不溢出回绕；该表示在最大端保留最后一个不可表示排他界后的号码，不影响唯一性契约。

## 实际运行与复算

重新使用 JDK17.0.10 编译作者原文件到独立 `/tmp/ch07-independent-java`，运行 `IdExample` 通过；8线程4000个ID、4096槽耗尽/恢复、重启重复反例与Long上界均实际执行。

另写并运行 [独立Java边界检查](ch07-independent-cases.java)，**12项**通过：无效域、正数最小时间、上界HALTED不可逆、4ms回拨恢复、5ms截止、旧owner迟到。该文件仅引用作者类，未更改其实现。

重跑 `python3 examples/ch07/verify.py`：3块页面/源码逐字一致；作者算术与模型均通过。复核者另算：

| 项 | 独立结果 |
|---|---:|
| 2^41 ms / 365.25日年 | 69.682842027年 |
| 10,000 / 4096 与 5000 / 4096 向上取整 | 3片 / 2片 |
| 4095−42 与除以5000/s | 4053槽 / 0.8106s |
| 30ms预取×5000/s | 至少150个，另留尾延迟余量 |
| 已提交1100 / 正常5000、接管10000 | 0.22s / 0.11s |
| 仅100现存号 / 正常5000、接管10000 | 0.02s / 0.01s |
| 60s库存正常/接管 | 300,000 / 600,000 |
| 正数Long.MAX_VALUE的base62位数（整除循环） | 11 |
| 100M×8B×(主键1份+二级索引3份) | 3,200,000,000B |

`node tools/audit-chapter.mjs ch07` 独立重跑通过。算术模型没有冒充数据库集成测试。

## 一手来源抽查

本次实际重新浏览核对，而非只读作者引用清单：

- [Twitter固定源码](https://raw.githubusercontent.com/twitter-archive/snowflake/b3f6a3c6ca8e1b6847baa6ff42bf72201e2c2231/src/main/scala/com/twitter/service/snowflake/IdWorker.scala)：5+5+12位、22位移、synchronized、回拨拒绝、新毫秒等待；本章明确小回拨等待为自定策略，未冒充历史原实现。
- [PostgreSQL17 UPDATE](https://www.postgresql.org/docs/17/sql-update.html)：RETURNING 使用更新后字段，支持返回 `[high-step,high)`；不代表提交确认。
- [PostgreSQL17 行锁](https://www.postgresql.org/docs/17/explicit-locking.html#LOCKING-ROWS)：FOR UPDATE 与 UPDATE 等同一行冲突操作等待事务结束，支持窗口申请/续窗的串行边界；未以此推导副本耐久。
- [RFC9562](https://www.rfc-editor.org/rfc/rfc9562.html#section-5.7)：128位、v4的122随机位、v7高48位Unix毫秒；正文不把时间前缀当跨进程严格顺序。

## 动图、双语与真实页面

使用 [独立浏览脚本](ch07-independent-browser.mjs)，结果 [JSON](ch07-independent-browser-results.json)。真实 Chrome viewport 320/390/1440 × 两主题 × both，共6组合；全部 `innerWidth==scrollWidth`，页面错误0。

亲自查看了第3组全部5帧、每帧两主题，另查看各组终帧中的密集/故障图（D1提交路径、D2位布局、D4回拨、D5号段耗尽），共18张独立截图。新窗/extend/generation/H/停发/重启图示与正文、代码前提一致；标签没有新增遮挡，帧间位置稳定。

390px两主题实际查看D3末帧左右滚动截图，右侧Registry和H解释可达。Java代码保持容器内横滚并有提示。320/both顶栏竖排和图注随图横滚是主代理已确认的共享局限，本次只记录，不修改共享组件。

截图在 `screenshots/ch07-independent/`：例如 [D3浅色终帧](screenshots/ch07-independent/parchment-d3s5.png)、[D3深色终帧](screenshots/ch07-independent/dracula-d3s5.png)、[手机代码](screenshots/ch07-independent/dracula-390-java.png)。中英正文、图注、闪卡中“窗口不是30s实时租约”“新窗不恢复旧授权”“0.22/0.11库存”“唯一不等于幂等”口径一致。

## 发现、关闭、残留

- 新增阻塞性发现：0；返修关闭项：0；未关闭P0/P1/阻碍阅读P2：0（限本次复核范围）。
- 已知共享局限：320/both顶栏较高；横滚图时图注一起离开左视区，回滚可见。无整页横向溢出，不影响本章正确性结论。
- 未验证：真实PostgreSQL并发、Registry/号段故障切换、持久化配置、真实进程克隆或网络延迟注入、生产吞吐。Java只实现单对象固定窗；前提条件需要实际系统实现。独立复核未提交或部署。
