# Ch22 对象存储：可执行边界

本目录对应 `chapters/ch22.html` 的四段同源代码。`publish.pseudo`、`multipart.pseudo`、`gc.pseudo` 是 PG18 风格教学伪代码，明确 Metadata 的本地事务与 Data RPC 的分界；不是可直接运行的 SQL 后端。

`model.py` / `schema.sql` / `verify.py` 用 Python3 标准库 SQLite 执行状态、身份、同事务发布、并发及清理反例。`BEGIN IMMEDIATE` 把所有写串行化，锁粒度比正文的单名字分片/行锁更粗。Data 由显式内存适配器模拟回执、冗余计数、不可变 blob 与在途 writer；不实现 fsync、跨 AZ 复制、加密签名、共识 Metadata、网络、时钟偏差或真实磁盘删除。六块测试仅验证确认门槛计数，不验证 Reed–Solomon 编解码和放置域。

```sh
python3 examples/ch22/verify.py
python3 examples/ch22/run_java.py
node examples/ch22/sync.mjs --check
```

Java 无外部依赖，使用 `javac --release 17` 验证语言/API 基线。若机器运行 JDK21，记录为“以 release17 编译并在 JDK21 运行”，不能写作实际 JDK17 运行。`VerifiedRead.java` 是完整可编译类，页面只展示标记区域的方法；Identity/Expected/Record 的定义位于完整源码。`VerifiedReadTest.java` 注入正常、坏内容、错租户/版本/布局/块、失败副本和未知结果，不发送网络请求。

教学协议的前提：

- 名字身份是 tenant、bucket 身份和未经改写的 key。初始化同 scope/principal/request_id 唯一，意图绑定长度、已知整对象 SHA-256、期望 generation 和冗余策略；重试不可变更意图。未知长度/未知摘要流不在本模型范围。
- 完成清单是所有当前登记 parts 的有序精确集合；part_number 不是物理身份。每次尝试新 blob_id，part_generation 用 CAS 替换。FINALIZING 冻结后不接受新登记、普通取消或普通超时 GC。
- Data 回执须可信、绑定精确物理内容与策略。生产适配层需提供不可变与耐久回执、权限验证和持久 fence；内存对象相等检查不代替签名验真。
- version、current 与固定结果同事务。COMMIT 未知查询原身份。终态回执不重新读取 Data，因此合法旧版本 GC 后仍可重放原结果，且不会把 current 改回旧版。REJECTED 的固定结果与清理状态分别保留。
- 删除 marker 只隐藏无版本 GET；保留版本依策略继续授权。GC 条件转换到 RECLAIMING，拒绝新解析/续租，等旧读租约耗尽。单次最长60秒来自同一教学 authority 时钟；生产要实现可信的时间界限、Data 能力有效期和续租协议。
- 未发布 GC 先权威 fence，Data 持久关闭旧写入口并确认已接收 writer 排空，再重复扫尾。Data 未确认 drain 或 Metadata 不可读时保留字节。示例显式制造“claim 后晚落”的物理孤儿。
- 已完成的未选中 part 尝试单独按 immutable blob_id 回收；选中 parts 不可回收。模型不做跨版本去重/共享 pack；正文的共享 pack 还需所有记录级引用/租约耗尽。
- FINALIZING 崩溃恢复只使用已冻结清单。本目录验证固定清单重试；生产的接管调度器、终止审批/权限和 owner fence 仍需实现。普通过期扫描不能猜测终止它。
- grants 表只模拟可信鉴权结果。read lease 绑定 principal；Data grant 的签名、issuer/audience、范围、ACL 在线撤销均是未实现适配契约。既有读可到租期结束，不承诺即时撤销已发出的字节。
- 示例的 `delete_marker()` 仅验证逻辑删除与旧版本关系，未实现 DELETE 请求回执/去重；正文不以此例宣称完整 API 实现。请求结果保留窗口之外的重新准入/墓碑清理策略亦未实现。

结果写入 `docs/reviews/ch22-code-results.json` 和 `ch22-java-results.json`。可运行模型是契约/故障时序验证，不是生产对象存储的可靠性证明；没有吞吐、真实故障恢复或耐久率测量。
