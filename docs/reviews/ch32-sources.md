# Ch32 · 一手来源与适用版本

核验日 **2026-10-24**。本地先检索：项目与 OpenAI Docs 技能目录没有 provider API 实现/接口文档；
工具发现未提供直接官方文档 search/fetch，于是按技能通过官方 OpenAI 域名搜索并实际打开页面。
没有加载模型选择或迁移参考；本题为通用网关设计，没有 API key/真实 API 调用。

| 页面 | 本章使用的具体事实 | 版本/边界 |
|---|---|---|
| [OpenAI Chat Completions streaming events](https://developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events) | include_usage 的完整请求usage在尾chunk；中断/取消可能收不到。chunk数与token数不同 | 核验日可变API reference，仅Chat Completions；不推及所有接口 |
| [OpenAI Rate limits](https://developers.openai.com/api/docs/guides/rate-limits) | 请求/token限流、失败请求消耗、有效Retry-After与SDK重试设置需纳入总上限 | 没有引用账户值、模型价格或SDK默认次数；未安装/运行provider SDK |
| [Claude Streaming messages](https://platform.claude.com/docs/en/build-with-claude/streaming) | SSE命名事件，message_delta usage累计；流内error独立于非流HTTP码 | 核验日Messages API；不使用provider中途fallback beta。本章主动换池禁令是自设公共契约 |
| [Claude Rate limits](https://platform.claude.com/docs/en/api/rate-limits) | RPM/ITPM/OTPM分开，部分模型共享limit group；缓存类别也会影响计量 | 核验日API文档；不移植账户限额或各型号例外到统一TPM公式 |
| [OpenAI Counting tokens](https://developers.openai.com/api/docs/guides/token-counting) | 可见文本不覆盖所有生成token；max_completion_tokens/max_output_tokens包含不可见类别 | 没有执行生产tokenizer；输入安全上界是适配器前提 |
| [WHATWG HTML §9.2 SSE](https://html.spec.whatwg.org/multipage/server-sent-events.html) | text/event-stream、UTF-8、事件解析和EventSource构造参数 | 实际打开页标更新于2026-10-22；POST流使用fetch/SDK，本例无真实parser |
| [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html) | §9.2.2非幂等自动重试条件、§10.2.3 Retry-After | 2022标准；rid幂等/≤2次数是本题设计，不是POST自带保证 |
| [PostgreSQL 18 Explicit Locking](https://www.postgresql.org/docs/18/explicit-locking.html) | FOR UPDATE在事务内与修改互斥，结束后释放 | 固定PG18语义；未运行PG或复制切主；SQLite代码不能直接冒充PG实现 |
| [SQLite Transaction](https://www.sqlite.org/lang_transaction.html)、[Isolation](https://www.sqlite.org/isolation.html) | BEGIN IMMEDIATE取得写事务，多连接/进程数据库串行写，commit/rollback边界 | 实际Python3.11.8/SQLite3.51.0文件库、FULL synchronous；进程退出试验不是断电/磁盘损坏/网络分区试验 |
| [OpenAI Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching) | 输入前缀状态复用仍生成新输出，区别于完成答案复用 | 不引用最低前缀长度、保留时长、价格或命中率 |

Claude流页面首次实际打开成功；随后的按行定位/markdown请求曾分别超时或返回不支持的content-type，
官方域名定向搜索返回完整Event types/Error events内容，交叉核对相同累计/错误事实。
正文只采用上述稳定接口事实，不把beta或服务器内部fallback当成自建网关能力。

A1–A12全部为本章教学假设：20/s、2,000/400/1,000 token、2秒分片、50token/s、
200流、64KiB、10秒、60秒TTL、500/40/1验证集。0.96是玩具相似分数。
`ch32-numeric.py`复算并给跨窗口反例；未引入虚构当前价格、客户生产数据或厂商SLO。
