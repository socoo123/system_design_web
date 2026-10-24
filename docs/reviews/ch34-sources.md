# Ch34 一手来源核验

2026-10-24 实际通过 web 工具重新打开以下官方页/原论文。只支持列明的机制，A1–A12、具体SQL/状态机/数字均为本章教学设计；未运行这些框架或真实云服务。不引用 SDK 当前默认步数，也不把博客视为吞吐实测。

| 页面 / 本章引用 | 实际支持的说法 | 适用边界 |
|---|---|---|
| [Anthropic — Building effective agents](https://www.anthropic.com/research/building-effective-agents) [1] | workflow 预定代码路径，agent 动态选择流程/工具 | 2024-12-19原文现有2026工具变化提示；仅引用路径控制区别和简单方案，未引用旧框架清单/API。旧 engineering URL 实际跳转 research。 |
| [ReAct 原论文 v3](https://arxiv.org/abs/2210.03629) [2] | 推理、行动和环境观察交织 | v3 2023-03-10；本章不要求保存模型私有思考，也未采用论文性能数字。 |
| [LangGraph — Persistence](https://docs.langchain.com/oss/python/langgraph/persistence) [3] | checkpointer保存线程图状态；store跨线程应用数据 | 旧 durable-execution URL 当前重定向本页；不把本页作为所有重放行为的出处。 |
| [LangGraph — Interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts) [4] | 同thread恢复，interrupt节点从头重跑，前置代码可能再次执行 | 不能理解为保存进程栈/仅从某行继续；本章自己审批grant/状态/数据库事务不是LangGraph默认能力。 |
| [AI SDK — Loop Control](https://ai-sdk.dev/docs/agents/loop-control) [5] | stopWhen停止条件、prepareStep逐步准备 | 当前文档显示v7；本章只讲机制，12次是教学假设。未复制默认值/API代码。源码没有导入AI SDK。 |
| [PostgreSQL 18 — Constraints](https://www.postgresql.org/docs/18/ddl-constraints.html) [6] | 非空/唯一约束限制重复身份 | 仅同库唯一，不保证远端副作用一次；本地执行用SQLite，并未假称PG18运行。 |
| [PostgreSQL 18 — Transaction Isolation](https://www.postgresql.org/docs/18/transaction-iso.html) [7] | Read Committed并发UPDATE等待后复查WHERE | 必须检查影响行数，不把先SELECT后无条件UPDATE当CAS；隔离级别/多行不变量需独立设计。 |
| [AWS — Transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html) [8] | 同事务状态+事件处理双写窗口，投递会重复须幂等 | 本章outbox与READY扫描属于自己的方案；不把发送外部消息和本库事务说成跨库原子。 |
| [Microsoft — Compensating Transaction](https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction) [9] | 当前并发工作需保留，补偿依业务，顺序未必完全逆序；补偿可失败/需人工 | 页面返回完整正文（同时有站点通用授权提示），实际读到Solution段落；没有将退款后释放推广为通用规则。 |
| [Kleppmann — Distributed locking](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html) [10] | 长暂停/延迟包可能越过租约，fence必须资源端检查 | Run Store拒旧owner不能阻止已发包；本章远端保障依Ch33业务key与条件，不单凭header里的epoch。 |
| [LangGraph — Checkpointers](https://docs.langchain.com/oss/python/langgraph/checkpointers) [11] | Replay从旧checkpoint重新执行后续LLM/API/interrupt；之前节点跳过。sync每步前同步，async下一步并行落盘，exit退出才持久 | 本设计复用已存step输出是自己的契约，不能推广为所有LangGraph time-travel/replay模式。文档关于durability的差异已就近放在正文。 |
| [SQLite Transactions](https://www.sqlite.org/lang_transaction.html) / [RETURNING](https://www.sqlite.org/lang_returning.html) / [3.38.0](https://www.sqlite.org/releaselog/3_38_0.html) [12] | 一时一个写事务；BEGIN IMMEDIATE先占写事务；RETURNING返回已改行但不等于事务已提交。unixepoch在3.38加入 | SQL实际在Python SQLite运行。最低版本更正为3.38（RETURNING本身从3.35支持），不能只按RETURNING写3.35。 |
| [SQLite Date/time](https://www.sqlite.org/lang_datefunc.html) 适配核查 | unixepoch('now')由SQLite VFS当前时间产生，同statement取值一致 | 测试在获得写锁后取库时钟；不声称时钟单调或生产多地域时钟问题已验证。 |

## 跨章对齐

Ch33 已验收页面要求完整 tenant/actor/Agent/intent/tool/route/arguments/resource/policy/expiry 绑定；本章审批/role handoff 与之对齐。批准不是执行，参数或Agent变化不继承原grant。UNKNOWN回执缺失不能证明旧网络请求不在途；恢复保留原key/route/绑定，不用新key补做。取消后可靠迟到成功必须入账；补偿不同key但绑定原效果。

本地测试的Gateway是窄化可信fixture，没有签名/身份验证、完整schema、真实MCP或支付API。它只用两个独立SQLite库演示本地checkpoint与业务回执的间隙；不冒充以上项目的实际运行验证。
