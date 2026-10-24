# Ch34 独立官方来源抽核（2026-10-24）

本轮通过web重新打开官方原文，不采用作者报告代替抽核。未运行LangGraph SDK或LangSmith服务。

| 官方页与定位 | 本次核对的具体支持语句（转述） | 对本章的判断 |
|---|---|---|
| [LangGraph Persistence](https://docs.langchain.com/oss/python/langgraph/persistence)，Persistence / Checkpointer vs store | checkpointer保存thread内图状态，store保存应用数据并跨thread共享；InMemorySaver重启不持久 | 章节分清checkpoint与跨线程store职责成立；本章自己的权威SQLite状态不是由MemorySaver提供耐久性。 |
| [LangGraph Checkpointers](https://docs.langchain.com/oss/python/langgraph/checkpointers)，Replay | 指定旧checkpoint会执行其后的节点，包含LLM、API和interrupt；之前已存结果的节点跳过 | 章节明确“本设计复用已存输出”与显式LangGraph replay不同，没有错误宣称所有checkpoint恢复都不重调外部服务。 |
| 同页 Durability modes | exit仅退出时写，async与后继执行重叠，sync先持久后推进 | 正文准确保留三者边界，不将异步落盘或进程内状态当作同样恢复保证。 |
| [LangGraph Interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts)，Resume / Key points | 需checkpointer与同一thread_id；恢复时中断所在节点从头执行，interrupt前代码可能重跑 | 正文和暂停伪代码保存持久身份并从权威决定恢复成立；未把暂停描述成进程栈被冻结在某行。 |

旧 `durable-execution` URL本次重定向到persistence，replay和三种落盘模式实际在checkpointers页抽核。文档未为本章12步、8工具、120秒、token预算、15秒租约、5分钟grant或容量数字背书；这些是教学假设。外部副作用的防重、资源fence、授权复查仍由独立业务端契约负责，checkpoint不替代它们。
