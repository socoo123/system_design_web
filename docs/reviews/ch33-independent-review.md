# Ch33 · 交叉只读独立复核

2026-10-24，GPT-6.1-Sol (`gpt-6.1-sol`) + Max (`max`)。复核者为Ch32作者，未参与Ch33实施；不派子agent。

**结论：通过。未发现未关闭P0/P1或阻碍阅读P2。** 对本章声明的教学契约，正常路径、资源竞争、两库故障、取消/到期后的迟到效果和墓碑均成立。
复核不把可信fixture当作生产认证，不把本地SQLite、源码阅读或图形渲染冒充真实MCP/分布式服务运行。

签署当前HTML：`d65d5a631d5cba7d0bade87a4a13d4cb567765042f7675704cbd8cfe6b4bdbb7`。
[完整before/after源码字典](ch33-independent-source-hashes.json)覆盖HTML及examples全部7份文本，**unchanged=true**；没有修改作者源码、其他章、PLAN、共享UI或工具。

## 独立阅读与实现核对

读完整章节、32帧title/desc/图注、三份伪代码、`model.py`全部363行、`check.py`全部302行、README和作者报告。
沿 Runtime → Tool GW → Adapter → Tool API 回程检查：Registry固定工具/route契约，ExecutionDB保存批准/intent/事件，BusinessDB才拥有条件效果与回执。

- 参数校验不授权资源。新输入使用非默认bob/review-helper、T-77/v23，合法资源通过，类型错/重复键/额外endpoint/非法编码/超深参数拒绝；合法形状的外租户T-2仍拒绝。
- 批准绑定主体、Agent、intent、工具/revision、route、policy、规范参数、资源/version、grant、expiry与replay_until；改变任一字段的binding被拒绝，grant不消耗。SHA是绑定指纹，授权仍来自可信审批会话。
- 批准/claim用真实本库写事务；九个独立连接批准只有一条approved事件，九路claim只有一个发出资格。等待审批不持有真实RPC槽；槽位是另行实现的准入契约。
- 锁等待跨过精确到期点：持有ExecutionDB写锁时，阻塞批准没有提前采样clock；释放锁后读到expiry，DENIED且grant仍未消费。不存在先读旧时间再等待锁放行的窗口。
- 不同intent批准同一资源v23后并发效果：一笔SUCCEEDED、一笔FAILED_KNOWN，业务version仅增一次，分别保留两份结果。
- 业务新效果与回执同一BusinessDB事务；已有同key回执先于当前version/expiry判断。正文、图、伪代码与可运行适配一致，没有用本库唯一键跨过网络。
- current permission在claim和backend两侧各检查；更强跨服务瞬时撤销不在模型保证内。固定route与不可替换参数来自可信Adapter前提，不是模型自报URL。

## 独立新输入、作者重跑与手推

[独立探针源码](ch33-independent-probes.py)直接加载作者实际model，结果见 [63项检查](ch33-independent-probe-results.json)，其中13项为精确容量/单位复算。
其余包含固定schema、实际双SQLite正常/并发/故障断言；数量不等同63种分布式实验。

关键新轨迹：

| 轨迹 | 实际观察 |
|---|---|
| 新身份/资源/Unicode理由的正常批准→claim→效果→本地record | T-77由OPEN/v23变CLOSED/v24；本地仅记录一次终态，同key读原批准期限，不续期 |
| 两笔不同intent竞争同一v23 | 一成功一已知条件失败，两个回执、一个version增量 |
| 批准更新后插入审计事件失败 | grant消费与APPROVED一起回滚，仍PENDING/consumed=0；移除触发器后同一批准可完成 |
| BusinessDB条件写后回执插入失败 | 真实触发器ABORT导致业务修改回滚；无回执；仍获准时同key重放可恢复原窗口 |
| 查不到回执→取消→换epoch→到期→旧请求迟到 | 缺回执保持UNKNOWN；取消/过期阻止再发送，但已经发出的旧请求仍可成功；旧epoch不能写本库，远端效果不被撤销 |
| 远端已成功，本地更新终态后审计插入失败 | 本地事务整笔回滚到UNKNOWN，远端回执保留；去掉故障后新epoch查询恢复SUCCEEDED，并保留cancel_requested |
| 结果正文压缩后，业务行恢复到原匹配version/OPEN | 原key的墓碑仍返回历史SUCCEEDED，业务行保持OPEN/v23，不再执行一次 |

[作者110项检查重跑](ch33-independent-author-rerun.json)另列，结果输出写入独立文件，没有覆盖作者报告，也不算成独立新输入。
[5项命令与证据核对](ch33-independent-evidence-results.json)包括同源、chapter audit、全站check、diff、独立浏览脚本语法，均通过。

手推而未执行：MCP初始化/list分页/协议session、真实授权/签名、8秒deadline传递、SDK合计2次计数、64个分布式远端槽位、真正取消完成和archive导出。
已分别检查这些契约的图、正文、英文与12张闪卡：无证据时UNKNOWN不清理；已发请求可在到期后完成；只查状态不重新授权效果；远端额度不因本地超时释放。
三份页面代码明确标pseudocode，可运行适配只验证本地状态/事务，不声称实现上述网络控制。

## 数字与一手来源

独立用Fraction复算：60逻辑调用/s；0.3秒均值18在途；10%各一次重试给66/s、19.8；8秒分片；12次批准/s×30秒=360稳态pending；
2,000×60×86,400=10,368,000,000B=10.368GB≈9.656GiB；热7天两份145.152GB、冷30天两份622.08GB；64×64KiB=4MiB。
这些分母/量纲与假设表一致。≤2N只约束同一动作集合，不是任意秒120/s上界；稳态与峰值全天场景就地注明。

[独立来源抽核](ch33-independent-sources.md)实际打开MCP 2025-11-25 Tools/Lifecycle/Transports/Cancellation/Security、Stripe、JSON Schema、Claude Tool use、RFC9110。
特别核对可选MCP session分配后的必带、断连接非取消、tasks/cancel与普通通知区别、不可信annotations、isError不证明无副作用，以及**Stripe API v1限定**的500/24h/清理后新请求；没有混用v2。
单次批准、5分钟/24小时、UNKNOWN与墓碑是本题策略，不标成协议内置保证。

## 真实页面与全帧目视

[独立浏览器](ch33-independent-browser-results.json)：真实390/1440×两主题×EN/both=**8组合**；innerWidth/scrollWidth等于设定值，展开details仍无整页横溢；
128次翻帧、3段逐字复制、键盘/播放/速度循环、闪卡与进度/设置持久化通过；页面/资源错误0。
使用Playwright真实viewport，没有CLI裁切。未用根的72组合或作者24组合代替本次检查。

[独立渲染](ch33-independent-frames.json)重新生成全部32帧×两主题，共64帧；12张完整接触表都实际看过，包含修改组D1/D4/D5/D6的每一帧：

| 组 | 浅色全帧 | 深色全帧 |
|---|---|---|
| D1 | [parchment](screenshots/ch33-independent-frames/changed-frames/ch33-parchment-d1-all.png) | [dracula](screenshots/ch33-independent-frames/changed-frames/ch33-dracula-d1-all.png) |
| D2 | [parchment](screenshots/ch33-independent-frames/changed-frames/ch33-parchment-d2-all.png) | [dracula](screenshots/ch33-independent-frames/changed-frames/ch33-dracula-d2-all.png) |
| D3 | [parchment](screenshots/ch33-independent-frames/changed-frames/ch33-parchment-d3-all.png) | [dracula](screenshots/ch33-independent-frames/changed-frames/ch33-dracula-d3-all.png) |
| D4 | [parchment](screenshots/ch33-independent-frames/changed-frames/ch33-parchment-d4-all.png) | [dracula](screenshots/ch33-independent-frames/changed-frames/ch33-dracula-d4-all.png) |
| D5 | [parchment](screenshots/ch33-independent-frames/changed-frames/ch33-parchment-d5-all.png) | [dracula](screenshots/ch33-independent-frames/changed-frames/ch33-dracula-d5-all.png) |
| D6 | [parchment](screenshots/ch33-independent-frames/changed-frames/ch33-parchment-d6-all.png) | [dracula](screenshots/ch33-independent-frames/changed-frames/ch33-dracula-d6-all.png) |

核对Execution/Business DB标题与副标题、D4F6两行末注、D5F4丢回包、D6取消箭头/审计闭环，文字与线条可区分，节点不跳动。
另实际查看手机EN/both双主题接触表、4份桌面顶部、两主题代码、D4F6双主题右侧和D5F4浅色中部/深色右侧横滚。
全部**23张实际查看图片的具体路径及哈希**在 [evidence](ch33-independent-evidence-results.json)；没有把几何判定或生成截图当作目视。

## 验证限制与最终签署

实际为Python/SQLite本地双文件、独立连接与SQL触发器故障；同步只覆盖单文件事务，时钟/身份/审批session/认证Adapter均为可信fixture。
没有运行PG、真实MCP/HTTP工具、生产签名验证、分布式配额、外部邮件/支付副作用、网络取消终止证明、复制切主或压测。
普通工具文本不作为权威业务回执；public状态/结果披露需要另做当前授权，这在README中明确。

最终 [source-hashes.after](ch33-independent-source-hashes.json) 与当前HTML/全部examples逐项一致，完整before保留；无作者源码变动，unchanged=true。
本复核没有待作者返修项；主代理可据上述边界收口本章验收。
