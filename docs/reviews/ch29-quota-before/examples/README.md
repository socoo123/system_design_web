# Ch29 教学示例

页面的6段代码来自本目录。`sync.mjs`同步或逐字检查：

```sh
node examples/ch29/sync.mjs --check
python3 examples/ch29/check.py
```

`check.py`用Java17编译并运行`KvLedger.java`与`KvLedgerCheck.java`，输出到`docs/reviews/ch29-code-results.json`，可传第一个路径参数另存结果。默认JDK为`/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin`，可用`CH29_JAVA_BIN`指定其他Java17二进制目录；无第三方依赖。class产物位于临时目录，退出即删除。

## 输入与输出

- `admission.pseudo`：输入已在共享Attempt Store受理、且已预留租户token配额的请求；输出排队、过期或按tenant轮转上卡。每队列25、活动32、页信用5,120是本章策略示例。实际队列还受全局100、prompt上限、600ms等限制；离线另池。
- `KvLedger.java#admission`：输入owner身份、实际prompt长度与最大输出；输出本worker的完整页信用或拒绝。`admit`不分配物理页，`allocate`需要时才分配。full-block cache共享不降低每条请求的信用，避免把同一未来容量出售两次。
- `iteration.pseudo`：输入已准入请求、tenant deficit和经过工作负载测量的budget/profile；输出本轮batch/ticket。每轮只处理一次某条序列，有界prefill chunk与decode一步。`profile_cost`是可替换的工作量计费，`budget.fits`同时检查token数、序列数、上下文/工作区与预测时长；预测不构成真实GPU p99保证。
- `KvLedger.java#issue-stop`和`#retire`：输入owner/一轮ticket/停止原因；输出逐次状态与引用变化。方法用同一对象锁串行化一个worker的CPU账本。Ticket绑定worker boot、唯一launch ID和不可变owner+page快照；Handle再含slot incarnation，旧地址不能变成新对象。只有在`inFlight=0`才释放请求引用与信用。共享页即使一条请求退出仍可能被别条请求引用或pin。
- `attempt.pseudo`：一个权威数据库的唯一行、条件owner绑定和条件终态；同key返回元数据，无持久token日志/跨卡续写。此段是协议伪代码，未运行PostgreSQL或生产Attempt Store；报告保存正常和竞争窗口的手工推演。bind后尚未投递就崩溃可在隔离旧owner后失败关闭为INTERRUPTED，不承诺请求必执行。

## 依赖与失败边界

Java是**可运行的CPU内存状态模型**，没有tokenizer、CUDA、真实page payload、采样、HTTP、远程worker、分布式锁或持久Attempt Store。真实GPU适配器必须先以ticket pin快照，再提交全部kernel/copy/block-table访问；只有相关stream/event依赖全部完成后才能调用`complete`。本程序人为调用`complete`模拟这个证据，不验证CUDA事件本身。一次generation只允许一个在途iteration；可在同一batch中混合多条generation。模型固定16 token/page，只分享调用者已确认完成的完整不可变块；部分尾页共享和COW不在示例中。

`stop`只停止以后发批，不能中断已经提交的GPU工作。EOS与cancel以首个串行化停止原因获胜，完成ticket可重复而不重复释放。`workerDied`隔离旧账本；重启创建全新boot和全新池。检测到死亡后不能把旧池当正常空闲页继续复用；模型没有真实销毁device context。

共享Attempt Store必须用主体/key唯一约束、稳定正文哈希、同一持久row条件更新和可靠读结果，不能拿Java的`synchronized`实现跨进程身份。相同body但不同tokenizer/model参数也需计入canonical hash。队列进程崩溃不依赖内存队列恢复，按持久ASSIGNED身份查询旧worker或隔离后明确中断。输出和quota跨库时另需可恢复预留协议；本示例不声称跨库原子提交。

deficit cap至少容纳最大的合法chunk计费；每租户每请求游标跨轮保留，合法大chunk可缩短。即便如此，资源不足仍会让请求等待或到期，不能把公平解释成保证所有请求达标。无GPU压测、真实网络故障、CUDA故障实验或生产容量结论。
