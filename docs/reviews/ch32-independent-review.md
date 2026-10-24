# Ch32 · 独立只读复核

2026-10-24，GPT-6.1-Sol (`gpt-6.1-sol`) + Max (`max`)；Ch31 作者交叉复核。
**最终通过。根已发现的 D3F5/F6 计量 P1 已独立关闭；本复核新增的 D1F5 顺序 P2 由作者修复并独立关闭。无未关闭 P0/P1 或阻碍阅读的 P2。**

签署最终页面 SHA256：`e2ec782378a79d939d453e99a5fada79592685628c73f8bf90b445bb2e48690e`。
本复核没有改章节、examples、作者报告、PLAN 或共享文件，没有派 agent 或提交/部署。

## 正常路径与关键保证

完整阅读本章中英正文、32帧图注、12张闪卡，以及 `examples/ch32/` 全部源码/README。
正常路径为可信身份/固定计划 → 硬条件过滤 → 共享组准入 → 唯一 request+hold+intent →
原 created=True 调用者 dispatch → selected owner 的 COMMITTED 屏障 → 公共头/数据 →
来源绑定的最终 usage → 完整终止与授权缓存。

实际 SQLite 新输入验证：137的 hold、79+12最终 usage、46净释放；
同 rid 不重获 dispatch 权，异正文冲突；claim_commit 重复不再授权 flush。
结果与图中的 request/attempt、持久 intent、Ledger 事务和正文说明一致。

关键反例使用不同于作者的输入：

- 三个真实连接竞争最后1999额度，只有一个事务成功，失败请求插入与预算一起回滚。
- 同 rid、不同正文的两连接竞争，一方创建、另一方 Conflict，没有共用错误结果。
- a1 UNKNOWN hold1700，备用 a2另hold900，未决合计2600；额度2599时备用拒绝且a1保持不变。
- a2已提交/关闭后 a1晚 usage 仍按自身 upstream id/model 和原 period结算；两次实际 usage合计1375。
- 错 served model、错 upstream id、将a1证据交给a2、未绑定的零usage、同pool复用一个远端调用ID均拒绝。
- 六轮三连接竞争 claim_commit / mark_failure+fallback / close，提交与备用不同时获准；
  已选a2时旧a1不能提交或关闭，旧owner也不能冒充a2发送。commit后close可以合法相继成功，未错误要求三方只能一个True。

[独立探针](ch32-independent-probe.py)直接调用实际 `ledger.py`，
[34项新输入结果](ch32-independent-probe-results.json)全部通过。
这不是34次分布式实验。没有重跑会写回作者证据的 check.py；作者68项只作背景阅读。

## 发现与关闭

| 级别/位置 | 独立证据与关闭 |
|---|---|
| P1 · D3F5/F6（根发现、作者在本复核前修） | 本人实际查看D3全部6帧双主题及真实390的F5/F6三位置。F4正常终态是3000→2400/释放600；F5/F6当前缺usage场景的正常usage线已淡化，明确held3000 pending evidence，报告回路标if verified。独立SQLite UNKNOWN/独立a2 hold/晚结算新输入支持该语义，未见缺usage退款或自动记零，确认关闭。未声称运行过旧错误版本。 |
| P2 · D1F5 Gate order（本复核新增） | 初始图写quota hold→upstream admission，同源route.pseudo却先shared_rate_and_concurrency.admit再reserve_first。已发根与作者，作者改为upstream admission→quota hold。[严格字面核对](ch32-independent-gate-recheck.json)确认整份HTML只有这一标签交换，所有examples字节不变。独立重新渲染D1全部5帧双主题、8个受影响布局/20翻帧，实际查看最终两主题接触表与390三位置；顺序与代码一致，无新遮挡，关闭。 |

缓存记录、当前授权、provider最终证据认证、共享速率/远端槽位、真正有界HTTP parser是明确适配契约。
本章没有把这些抽象说成SQLite实现。错误类别与成本UNKNOWN分开：只有白名单的暂时限流/服务器故障/dispatch timeout可在允许额外成本时备用，
取消、写堵塞、解析/超大事件、schema、权限、安全拒绝均不能换池。
公共role/heartbeat/空成功也要过屏障，旧COMMITTED或未知ACK不重新授权发送；这些网络路径为[独立协议手推](ch32-independent-protocol.md)，不是实际SSE执行。

## 数字、引用与页面

- [29项独立复算](ch32-independent-numeric-results.json)：1200 RPM、2.88M实际TPM、3.6M预留、
  2400调用/7.2M cohort工作量、9000上下文、1.9s/0.1s、399间隔/8.48s/169.6均值流、
  13,107,200 B=12.5MiB、600释放/4800双调用、FAQ8%/2.5%/0.2%与1.6/18.4均通过。
  新跨窗有限轨迹在每请求≤2调用、2s deadline内可形成一个秒窗60次dispatch，说明cohort次数不能推出瞬时40/s。
  这是算术轨迹；真实共享组准入仍须整形，1.9s是提出的SLO分配，不是调用次数保证。
- [一手来源抽核](ch32-independent-sources.md)实际核对OpenAI usage中断/不可见输出/重试/前缀缓存、
  Claude累计usage与三类速率、WHATWG UTF-8/事件/EventSource、RFC9110重试、SQLite事务。
  OpenAI使用OpenAI Docs技能的官方检索/打开顺序。Claude streaming主页面两次抓取超时，
  最终用实际打开的官方API primer及原页官方检索结果核对，未冒称整页抓取成功。
- [初始真实浏览器](ch32-independent-initial-browser-results.json)：390/1440×两主题×EN/both共8布局、
  128次翻帧、4段代码各两主题共8次逐字复制，展开details仍无整页横溢，页面/资源错误0。
  [最终D1局部浏览器](ch32-independent-gate-browser-results.json)覆盖同8布局、20次D1翻帧，0错误。
  这是同一8个布局的受影响部分复核，没有把它们加成16个不同组合。
- 实际目视修改五组的27帧×双主题，D3F5/F6与D6F6真实390横滚、未改D5末帧、SQLite/SSE代码与最终D1。
  [26张实际打开图像的路径/哈希](ch32-independent-visual-review.json)含2张修前D1证据；最终D1另用新目录保存。
  接触表来自Playwright实际viewport；未用CLI裁切、几何检查或作者截图代替目视。
- [最终4项结构/同源/语法/diff检查](ch32-independent-checks.json)通过。
  中英、图注、代码解释与闪卡对UNKNOWN/备用/提交/释放/容量的口径一致；未发现其他需要返修的问题。

## 最终字典与验证边界

[完整before/after字典](ch32-independent-source-hashes.json)覆盖HTML与全部6份示例文本，
`unchanged=false`如实记录上述一处P2；[最终重验完整after](ch32-independent-final-recheck-hashes.json)与当前文件逐字对应。
ledger SHA256为 `cd171b606a2f45b1ff142d8879c4840a8e6b284cec4841b1bf56c217fb513b82`。
代码修前修后哈希相同，因此复用已实际执行的34项新输入证据，未虚称又运行一遍。

实际执行范围是Python/SQLite本地文件库与独立连接；没有运行provider、网络SSE、
生产tokenizer/权限/签名系统、PG、复制故障或生产压测。没有把协议推演、作者重跑或主代理整合计为独立实际执行。
本结论签署当前最终版本，供主代理整合验收与清锁。
