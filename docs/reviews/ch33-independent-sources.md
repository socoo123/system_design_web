# Ch33 · 独立一手来源抽核

2026-10-24，独立复核者直接打开官方页面；没有仅沿用作者核验日期。

| 页面与固定范围 | 实际核对 | 与本章的关系 |
|---|---|---|
| [MCP Tools 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) | tools/list支持分页；tools/call调用；工具annotations来自不可信服务时不能当权威；isError属于工具执行错误，协议不强制一种特定UI | 正文分别处理发现、schema、资源权限和默认写审批。isError不证明业务没有效果是本章对证据边界的推论，不是协议提供的事务保证 |
| [MCP Lifecycle 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle) | 初始化协商能力与版本先于正常操作 | 图D2中的Adapter不是未经协商直接发现/执行 |
| [MCP Transports 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) | stdio/Streamable HTTP；客户端消息POST，请求回复可JSON/SSE；server可分配MCP-Session-Id，已分配时后续请求必须携带；断连接不解释为取消 | 与正文固定修订、可选服务端session和独立业务intent一致；不外推最新版行为 |
| [MCP Cancellation 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/cancellation) | 普通notifications/cancelled；task-augmented必须tasks/cancel；接收方可忽略已完成/不可取消；发送方应忽略迟到响应，双方处理竞态 | 本章保留可靠业务结果是应用层核账/状态查询，不把普通取消通知说成事务回滚或远端终止证明 |
| [MCP Security Best Practices 2025-11-25](https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/security_best_practices) | 受众错误token passthrough、confused deputy、SSRF是独立风险 | registered route/credential范围是本题适配器前提；这些规范不替该示例实现生产签名/授权 |
| [Stripe Idempotent requests](https://docs.stripe.com/api/idempotent_requests) | 当前官方页明确分v1/v2：v1保存首次执行后status/body包括500；至少24h后可清理；清理后同key是新请求，参数变化报错；v2会继续尝试失败/部分失败工作 | 作者已限定API v1，没有把24h和500重放套给全部Stripe/全部工具；平台自己的UNKNOWN墓碑不能依赖下游永远保留 |
| [JSON Schema object](https://json-schema.org/understanding-json-schema/reference/object) | properties本身不使字段必填或关闭额外字段，required/additionalProperties分别表达约束 | 本例实现固定平面schema，不把Python类型检查冒充通用JSON Schema/标准canonical JSON |
| [Claude Tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview) | 区分由应用执行的client tools与供应商执行的server tools | 正文没有“一切工具都由客户端执行”的绝对说法，未使用当前型号/定价/性能 |
| [RFC 9110 §13.1.1](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.1) | If-Match在效果前判断，条件false不执行；已执行状态变化可返回已有成功 | 本章BusinessDB仍需条件写/回执同事务；HTTP头名称本身不提供SQL原子性 |

正文的5分钟grant、24小时平台窗口、2次attempt、8秒、64槽和审计体积均为自设契约/推导。
不能从上述来源推出签名发行、端到端exactly-once、取消完成或分布式配额已经实现。
实际模型把身份、审批会话、时钟与认证Adapter envelope作为可信fixture；审批binding反例只验证本库绑定，不证明生产认证。
