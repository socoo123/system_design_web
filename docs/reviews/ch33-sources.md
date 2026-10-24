# Ch33 一手来源核验

核验日期2026-10-24，通过web读取官方页面；不以旧报告日期代替本轮访问。MCP固定2025-11-25，不声称该修订是最新版。下列是来源支持范围；本题策略与推导另列。

| 来源/版本 | 本轮核验的实际支持 | 本题没有从来源推出的保证 |
|---|---|---|
| [Anthropic Tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)，当前官方文档 | 应用执行client tools并回tool_result；server tools可由供应商基础设施执行。 | 不使用产品型号、性能或“模型永不接工具”的概括。 |
| [MCP Tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)，2025-11-25 | tools/list分页、tools/call、input/output schema；不可信服务的annotations不能直接信任；isError是工具执行错误。 | isError不证明业务事务已回滚；schema和annotations不等于授权。默认逐笔写审批不是协议强制UI。 |
| [MCP Lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)，同修订 | 初始化先于正常操作、协商协议版本与能力。 | 不混用后来修订或宣称任意服务器自动兼容r7。 |
| [MCP Transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)，同修订 | stdio与Streamable HTTP；POST消息、JSON/SSE响应；服务可分配session ID，分配后客户端须带；断连接不表示取消。 | transport session既不替代intent，也不提供业务幂等/安全重放。 |
| [MCP Cancellation](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/cancellation)，同修订 | 普通notifications/cancelled可因已完成/不可取消等被忽略；task-augmented请求用tasks/cancel；双方处理竞态。 | 通知发出不等于终止回执、业务回滚或远端额度已释放。 |
| [JSON Schema object](https://json-schema.org/understanding-json-schema/reference/object)，官方living reference，页面使用2020-12相关术语 | properties本身不要求字段/关闭额外字段；required、additionalProperties、unevaluatedProperties有各自作用。 | 模型只实现固定平面schema；不冒充完整JSON Schema验证器或通用canonical JSON实现。 |
| [MCP Security Best Practices](https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/security_best_practices)，2025-11-25文档路径 | token passthrough、confused deputy、SSRF和受众检查是具体安全问题。 | 完整动作grant格式、审计关联标识与网络出口架构是本题选择，不宣称标准提供本题授权实现。 |
| [RFC 9110 §§9.2.2/13.1.1](https://www.rfc-editor.org/rfc/rfc9110.html)，2022 | 非幂等重试需已知幂等语义或原请求未应用的证据；If-Match在操作前判断，false不应执行。 | RFC不保证业务端SQL实现原子性；本题显式在业务事务条件更新。两attempt和8秒是教学预算。 |
| [PostgreSQL 18 Constraints §5.5.3](https://www.postgresql.org/docs/18/ddl-constraints.html)，固定18文档 | 唯一约束只约束该数据库内的列组合。 | 不把一个本库唯一键说成跨数据库/网络副作用保证；未运行PG。 |
| [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests)，**API v1限定**，当前页面 | v1首次执行后保存结果含500；参数比较；至少24h后可清理；清后同key变新请求。页面当前另列v2恢复语义。 | 旧稿没有API版本限定，本轮纠正；既不推广到v2，也不推广到任何MCP工具。 |
| [AWS transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)，当前官方Prescriptive Guidance | 状态/事件同事务、导出可能重复、消费者需防重。 | archive确认/checkpoint具体流程是本题设计；outbox不让远端业务副作用自动只发生一次。 |
| [SQLite transactions](https://www.sqlite.org/lang_transaction.html)，运行库版本见[ch33-code-results.json](ch33-code-results.json) | 多读者/单写者、BEGIN IMMEDIATE本库事务与锁；事务不能靠应用本地锁扩大到另一文件。 | 两文件独立提交；不是复制耐久/网络故障实验，未把线程barrier当原子机制。 |

自设数字A1–A12、本题规范编码、grant绑定/5分钟、24小时平台重放期、UNKNOWN/墓碑、64槽远端占用策略均标教学假设或方案。schema不保权限、取消不证明回滚、查不到回执不排除迟到请求、两个本地事务不原子等是由明确边界推导，不伪称来源逐字提供一套实现。
