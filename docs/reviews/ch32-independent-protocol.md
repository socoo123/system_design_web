# Ch32 · 独立协议推演

以下为对 `route.pseudo` / `stream.pseudo` 的人工控制流复核，**没有执行 provider、
HTTP/SSE、tokenizer、真实 parser 或 SDK**。实际 SQLite 新输入另见 probe-results。

| 输入/失败时刻 | 独立推演与判定 |
|---|---|
| 正常 miss | 身份与当前权限 → 固定 plan/eligible → 共享组准入 → Ledger 唯一 request+hold+intent → 原 created=True 调用者单次 dispatch → selected owner 的 claim_commit → 公共头/role/数据 → 来源绑定的最终 usage → 完整终止/关闭/允许复用才缓存。图 D1 最后一行的旧 hold/admission 顺序与该代码相反，本次已报 P2，由作者改成代码顺序。 |
| 首公共字节前 DISPATCH_TIMEOUT | a1 的成本记 UNKNOWN 且 hold 保留。仅当错误类别在白名单、读任务与额外成本获准、总 deadline 仍有余量且备用共享组准入成功，才 reserve a2 的新 hold；a1 不转账给 a2。旧 a1 迟到只可核账，不能获得 selected=2 的交付权。该 Ledger 部分以不同于作者的 1700+900 新输入实际执行。 |
| precommit 取消、断连、解析/超大事件、schema、权限与安全拒绝 | 这些类别均不在 {RATE_TRANSIENT, SERVER_TRANSIENT, DISPATCH_TIMEOUT}。成本仍可能 UNKNOWN；它不是 fallback 许可。关闭/返回错误而不换池，UNKNOWN hold 和远端 credit 不自动释放。未将这段伪代码冒充实测错误分类器。 |
| claim_commit 提交成功但 ACK 丢失 | Edge 在成功回执前尚不发头。COMMITTED 已落盘时再次 claim 返回 false，不能靠查询到 flag 重发。即使异常路径尝试 fallback，持久 committed 检查仍拒绝；若 authority 不可用，reserve 也不能放行。SQLite 新输入实际验证重复 claim 不再授权，网络 ACK 丢失是协议推演。 |
| role/heartbeat/空成功终止 | Adapter 的 normalized.public_output 契约必须覆盖这些事件；正文显式要求它们先过同一屏障。首可见文字不是边界。实际 Adapter 未实现，因此没有声称跑了空流网络测试。 |
| COMMITTED 后 provider error、写堵塞、断连 | 不改已经发送的 HTTP 状态，不拼另一个模型，不伪造成功 DONE，不缓存半答；尝试声明的错误事件，否则 EOF，并尽力取消。关闭本地 socket 不证明远端停止，usage/远端并发额度保守保留。 |
| 最终 usage 缺失/晚到 | 没证据不记零。D3F5/F6 现显示 held3000/pending 与条件 if verified；不是上一帧成功 usage 的600释放。晚 a1/a2 的 usage 各按自己的 upstream id/model 结算，仍进原 period。实际探针验证 a2 已关闭后 a1 晚到及跨 period。 |
| exact/semantic hit 与撤权 | 完整请求+access scope+版本 namespace 仍需当前权限/到期/served model/dependency 验证；同 rid 服务记录竞争者不能再发送。语义 0.96 只召回，否定/实体不同拒绝。缓存记录与当前授权是明确未实现适配，不以 miss Ledger 的成功测试替代。 |
| 有界流载荷 | 读块/未完整事件/编码输出/正在写的数据各最多16KiB且不预取，可给应用载荷64KiB的设计上界。TLS/socket、对象、Unicode表示、整份可缓存答案另计。源码只声明 bounded parser/translate/await 契约，真实库是否遵守没有执行验证。 |

34 项实际 SQLite 新输入与29项复算均独立编写，没有复制作者 check.py 的断言数；
作者的68项结果仅阅读其报告，本复核没有重跑会写回作者证据的 check.py。
