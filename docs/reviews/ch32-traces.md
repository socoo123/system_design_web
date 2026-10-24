# Ch32 · 协议手推与实际执行边界

2026-10-24，GPT-6.1-Sol Max。以下是对 `route.pseudo` / `stream.pseudo` 的**手工推演**，不冒充运行了 HTTP/SSE 或 provider。
SQLite 的实际执行另外见 `ch32-ledger-results.json`，精确算式见 `ch32-numeric-results.json`。

| 输入/事故 | 逐步决策 | 客户端/账本结果 |
|---|---|---|
| 正常，8k输入+1k输出预算、A窗口10k、B窗口4k | 先按权限/地域/能力/质量过滤，9k≤10k而9k>4k；仅A合格。miss后租户hold+共享组许可+intent，再dispatch | 不以便宜为由选B；usage属于A的精确attempt与request id/model |
| 同rid并发正文一致 | 两路缓存/miss可能竞跑，但缓存服务记录或miss预占都在同一个request唯一命名空间仲裁 | 仅创建者交付/dispatch；竞争者读原状态 |
| 同rid但route配置从p12变p13 | 摘要仅绑定稳定的完整用户请求；查原请求发生在重新路由之前 | 相同请求读取原p12状态，不趁配置更新重生成；改正文冲突 |
| a1发送后超时，允许额外费用 | failure_class=DISPATCH_TIMEOUT，成本=UNKNOWN；保留a1 hold，先过B共享限额，再另hold a2；同请求行切selected=2 | 只有a2可提交；a1晚usage仍单独结算，不拼流 |
| a1未知且只剩2000可用，新attempt需要3000 | 独立条件预算更新失败，整个a2事务回滚 | 不dispatch a2、不退a1、不用TTL伪造剩余额度 |
| Parse/oversize/schema/权限/安全拒绝 | 成本可未知，但受信failure_class不在备用白名单 | 终止或提交前错误；不能用“未知”绕过拒绝 |
| 首事件与备用竞争 | claim_commit检查selected+owner+未失败；备用检查同request行未committed并切selected | 最多一条获准；已提交a1则无a2，已选a2则a1拒绝交付 |
| 空成功、role或heartbeat先到 | 全部属于public_output，成功terminal也要验证完整输出并过屏障 | 不能以“没文字token”为由跳过COMMITTED |
| 屏障提交ACK丢失或提交后flush前崩溃 | 不能凭查询到COMMITTED重新授权flush；同rid读取原状态 | 保守失败；不自动重生成、不重发一条可能已发的流 |
| 已200后上游429/流内error | 内部提交已发生；错误逐跳经Adapter/GW/Edge | 声明的error或EOF；无HTTP503、无成功DONE、无第二模型拼接 |
| 客户端断开/写堵塞10s | 停止读下一事件，尽力abort；failure_class禁止备用 | 本地连接可关闭；UNKNOWN hold与远端槽位等待证据，不立即复用 |
| SSE字节在UTF-8字符/空行/JSON中间切开 | 增量解析保留不完整片段，read/event/encoded-event上限各16KiB，无预取，写完才继续读 | 超大单事件先拒绝；应用payload≤64KiB是接口前提，不证明HTTP库实现 |
| cache同tenant不同用户、撤权、模型/data版本漂移 | scope隔离；每次命中当前授权；served model/route/data metadata与键同时检查 | 无资格候选走miss；Ledger/上游额度仍准入；已经发字节不能收回 |
| FAQ“允许取消”/“不允许取消”，玩具cosine0.96 | 相似仅拿候选，否定/实体/日期/金额门拒绝，走正常生成 | 不把score当正确率；不缓存高风险动作的代替授权 |
| OpenAI尾usage缺失；Claude累计output20再40 | 缺失保留UNKNOWN；累计取最终40而非20+40 | 不把空值当0、不重复计量；绑定精确原attempt来源 |

`check.py` 的实际 SQLite 测试另外覆盖12连接最后一份预算/同rid、12连接重复结算、24轮提交/备用竞争、
真实子进程事务内退出与commit后退出、来源错配/重复来源绑定、迟到结算原周期、上界失效记录债务并封禁。
没有真实分布式事务、供应商执行、取消完成、网络解析或吞吐证据。
