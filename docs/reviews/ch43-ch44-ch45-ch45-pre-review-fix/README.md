# Ch45：模型、持久边界与验证

依赖：Java17标准库、Python3标准库、Node.js。页面两段 Java 摘录来自 `DomainModel.java` 的标记区；两段伪代码来自 `edit.pseudo` / `consume.pseudo`。`sync.mjs --check` 检查逐字一致，伪代码本身不冒充可编译Java。

```sh
PYTHONDONTWRITEBYTECODE=1 python3 examples/ch45/run.py
node examples/ch45/sync.mjs --check
```

默认 JDK 为 `/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home`，可用 `CH45_JAVA_HOME` 指向其他 JDK17。`javac --release 17` 的类文件生成在自动清理的临时目录。运行结果写 `docs/reviews/ch45-code-results.json`，绑定页面与全部本目录源文件哈希。

`DomainModel.java` 是可运行的不可变对象规则示例：Money绑定币种并检查整数溢出；行集合不能逃逸修改；编辑/冻结/接纳/关单返回候选，失败不污染原对象。候选版本和领域事件只有持久提交后才能对外发布。Java没有数据库、网络、仓储或跨进程锁，也不证明持久CAS或幂等。

伪代码 `edit.pseudo` 的一笔事务覆盖根、明细与命令结果。数据库唯一键是 `(tenant,order_id,key)`；摘要绑定命令种类、预期版本和业务参数，用固定版本的类型化规范编码。事务内占位行不单独提交，成功后结果不可变。只有确认已中止的事务可以有界整体重试；COMMIT回执未知须查原键。允许重试/回放期间不能删除幂等身份。

`consume.pseudo` 的一笔事务覆盖 inbox、capture_result、必要的订单CAS、退款义务和Outbox。inbox按`(consumer,source,event_id)`防重投递，capture_result按`(tenant,payment_id)`防同业务事实被不同事件重复应用，比较摘要后返回原结论。退款工作`UNIQUE(tenant,payment_id)`只分配一次r17，并绑定金额/币种；领域事件只是候选，由提交事务翻译到公开合同。无订单变化的退款分支也不能先ACK再发内存消息。

这是一个明确缩小的业务模型：每个payment_id只有一次全额capture，金额/币种/当前尝试必须匹配；partial capture、分次捕获与退款累积额度不由本例实现。Pay的持久关联须在可信适配层查证；浏览器order_id或payload tenant不能授予权限。退款PSP执行仍依赖提供商幂等/查询合同，UNKNOWN不自动过期。

`schema.sql` / `verify.py` 在真实SQLite临时本地文件上执行唯一约束、事务回滚、同键两连接竞争、v9两连接CAS，以及lost-response/re-delivery的可复现合同轨迹。SQLite会串行化写者；**没有运行PostgreSQL，不用SQLite结果证明PostgreSQL的MVCC、行锁或隔离级别**。并发CAS探针只证明该文件数据库的一条条件更新最多一个胜出，不是完整结账或资金服务。源码内显式区分它与正常消费事务。

消费夹具以已认证消息为前提，只验证持久绑定表与业务字段，不实现PSP验签。Quarantine持久接管之后才视为可ACK；临时读失败应重试，不等同于查不到。`verify.py`里的故障是事务内注入Python异常与回滚，lost-response是故意丢弃返回值后重新连接查询，不是真实断电或网络故障。没有真实Broker、PSP、Relay租约、压测、PostgreSQL驱动或生产API。
