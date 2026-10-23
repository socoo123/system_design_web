# Ch09 独立复核 · ch04_author / Astra High

2026-10-22。只读复核章节、专属实现与图，没有代改作者文件、公共资源或PLAN。最终独立复核通过；发现的2项P1与1项P2均已由作者修复并复验，未发现剩余P0/P1或阻碍阅读的P2。章节冻结SHA256：`0400858acae36caaf007d5cdd3f1fb3b73057f349e65f4dd1992a064e1f2e862`。

## 发现与闭环

| 等级 | 位置与反例 | 作者修复 | 独立确认 |
|---|---|---|---|
| P1 | 英文读路径曾写“At every layer ... key absent ... The first may be negative-cached”。Local/Redis miss并不证明Link不存在，按此实现会缓存假404，与中文/伪代码冲突。 | 英文明确只有成功、空结果的主库读取才可负缓存；缓存miss继续下一级。 | 已核对现稿英文与redirect.pseudo，闭环。 |
| P1 | create.pseudo曾无条件插入active，但正文承诺高风险链接先pending；按示例执行会直接提供Location。 | 服务端可信风险准入产生initialStatus，active/pending写入同一事务并存响应；拒绝403、依赖错误503。 | 已确认入库字段、回执状态及pending→200待审页无Location三者一致；新增模型轨迹通过，闭环。 |
| P2 | 故障段曾笼统说aliases和redirect都需要健康Mapping Store，与fresh cache独立服务冲突。 | 依赖限定alias创建和redirect cache miss；fresh cache仍能独立跳转。 | 中英均已核对，闭环。 |

已复核主代理先前指出的pending不能笼统410、SQL绑定参数/快照字段引用、expires_at检查到发出延迟问题：当前pending为200待审页，SQL示例声明绑定参数；redirect后半段统一引用snapshot.row；到期判断使用安全时间上界+1秒发出预算，超时需重查。无新增未关闭P0/P1；不把模型测试当真实数据库证明。

## 独立路径与反例

1. **正常创建**：认证owner+key、规范化整份参数摘要、查无旧回执，可信风险策略允许后选候选。READ COMMITTED事务插入Link与Idempotency；只有确认COMMIT才返回201与保存的响应快照。读回后active、未过业务到期及快照截止，302经过Redirect→Edge→Client，Click队列不参与确认。
2. **同alias、同key并发**：A/B都快查miss。A的Link+Idempotency提交；B可能先撞link_pkey。B必须先ROLLBACK再发新主库SELECT才能看见A回执；同摘要重放201，不同摘要409。不同候选但相同key竞争也会回滚输家的Link，不留下孤儿映射。PostgreSQL默认非延迟唯一约束与同库事务覆盖这段保证。
3. **随机碰撞**：已有X，另一请求候选X，唯一键拒绝后整笔回滚；查不到自己owner/key回执才换新候选。最多5次，未覆盖旧X；连续5碰撞返回503。同alias不同key没有回执胜者，直接409。
4. **COMMIT unknown**：已提交但回执丢失时丢弃连接并返回unknown503，不能声称ROLLBACK撤销了提交。相同key重试恢复原回执；旧事务仍在途时新事务由唯一索引等待或超时。原链接后来撤销，创建重试仍重放原创建回执，而非重建链接。承诺依赖幂等保留与已确认写不会在切主丢失的部署前提。
5. **expiry与freshness**：fresh active且expires_at已过→410；snapshot已过valid_until而主库不可达→503，即便缓存中的expires_at也已过，因为权威可能续期。安全上界+1秒防止检查后排队发出过期302；提前一点拒绝是明确保守取舍。pending与blocked分别200/410，均无Location。
6. **撤销旧回填**：t=0读v7，t=1提交v8+outbox，t=2删除，t=3旧v7回填。删除本身无记忆；原子比较version floor与当前value.version后才能写，已见v8拒绝v7，当前v9也不能被v8倒退。事件、floor丢失仍不能刷新原valid_until；t=7复制的t=0快照在t=8失效。读开始→截止8秒，加生产/消费合计1秒时钟误差与1秒发出预算，得到≤10秒；异步副本不能直接伪装成新权威快照。
7. **撤销事务/出站事件**：条件UPDATE version=expected与Outbox INSERT同事务，插事件失败应整体回滚；并发预期v7只有一个改成v8。relay先发布再记成功允许重投；乱序/重复v7不得降低v8 floor。此处没有声称Redis原生提供Memcache租约或Exactly-once统计。

## 数字与代码检查

独立重算：62⁶=56,800,235,584，约35.725 bit；生日半碰撞点280,609.8；365M占用下下一候选碰撞0.642603%、期望1.0064676次，5次独立碰撞1.0958×10⁻¹¹。六位理想空间约155.617年；62¹⁰&lt;2⁶³&lt;62¹¹，Snowflake最大需11位。

峰值11,600 / 600向上取整20，掉一台只有11,400；N−1需21，幸存20台12,000。10×流量正常194、N−1为195。182.5GB逻辑行/年、三份547.5GB、出口5.8MB/s、21台本地热集2.1GB。95%/90%命中分别580/1,160回源；整层故障最多800、拒绝10,800、无保护为14.5倍；每日错误10,000预算在峰值故障下约0.9259秒。10K号段/58约172.414秒，312/58约5.379秒。计算与中英、图注、闪卡一致。

`node examples/ch09/sync.mjs --check`：4份页面片段与源码一致。独立执行作者契约模型当前21项通过；执行时仅将结果输出重定向至[独立结果](screenshots/ch09-independent/contract-results.json)，没有改作者源码/结果文件。另用Python独立计算上述数字，未依赖模型的既有常量结论。模型假定事务唯一性/回滚/可见性，并不运行PostgreSQL、Redis、HTTP缓存或网络故障实验。

## 抽核一手来源

- [PostgreSQL 18 Read Committed](https://www.postgresql.org/docs/18/transaction-iso.html)：每条语句的新快照、ON CONFLICT DO NOTHING可能受当前快照不可见的并发事务影响；支持冲突后新语句读取胜者的必要性。
- [PostgreSQL 18 Transactions](https://www.postgresql.org/docs/18/tutorial-transactions.html)：同库事务all-or-nothing与中间状态不可见。
- [AWS幂等API](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)：调用方请求身份、参数变化、身份记录与副作用原子提交；24h是本章假设。
- [RFC9111 no-store](https://www.rfc-editor.org/rfc/rfc9111.html#section-5.2.2.5)与[RFC9110](https://www.rfc-editor.org/rfc/rfc9110.html)：HTTP缓存约束与重定向状态语义，不提供内部缓存一致性或撤回已披露URL的能力。
- [Snowflake原始代码](https://github.com/twitter-archive/snowflake/blob/snowflake-2010/src/main/scala/com/twitter/service/snowflake/IdWorker.scala)：worker5+datacenter5+sequence12与回拨拒绝。
- [Scaling Memcache at Facebook §3.2.1](https://www.usenix.org/system/files/conference/nsdi13/nsdi13-final170_update.pdf)：stale-set反例和lease思想。本章明确Redis floor协议是自行设计，未把原论文机制直接归为Redis默认能力。

## 独立页面验收与范围

实际Chrome/Playwright加载http://127.0.0.1:8765/chapters/ch09.html，在1440视口点击逐帧控件并截取真实SVG；7组34帧两主题全看，截图在`docs/reviews/screenshots/ch09-independent/`。原始授权基线与现稿比较确认34帧ID/顺序无减少。已检查create回程、Redirect旁路、旧回填/Outbox fan-out、故障状态与量纲、信任边界。最终SHA下再次打开实际页面并复看D1/D2/D7全部帧两主题，确认Analytics内边距与两处回程折线的最后调整，不遮挡标签/节点；D3/D4/D5/D6沿用同一次独立检查且最后差异未改这些图。

独立390真实viewport抽查淡绿对照与Dracula英文，innerWidth=scrollWidth=390，图能左右横滚；[移动记录](screenshots/ch09-independent/mobile-results.json)。目视两种模式的首屏与D5末帧两端，未见全页溢出或被迫缩小图中文字。完整24组合与复制/导航/进度交互由作者及主代理另验，本报告不冒称自己全部执行。

未验证：真实PostgreSQL执行/并发锁等待与提交故障，真实Redis floor脚本，生产时钟偏移、复制切换、SSRF网络防护、HTTP缓存客户端行为、吞吐与SLO。测试范围内的模型通过不等于这些部署保证已实现。

## 最终冻结确认

最终页面、4份源码同步、21项契约模型再次通过。最后差异除上表三项修复外，补明随机码占用统计的alias/保留码前提、fresh expired限定active；If-Match失败同步为412，已核对RFC9110 §13.1.1/§13.2.2与SQL及模型。未重新扩写其他内容。

最终重点全帧目视：[D1浅](screenshots/ch09-independent/final-d1-parchment-all.png)/[深](screenshots/ch09-independent/final-d1-dracula-all.png)，[D2浅](screenshots/ch09-independent/final-d2-parchment-all.png)/[深](screenshots/ch09-independent/final-d2-dracula-all.png)，[D7浅](screenshots/ch09-independent/final-d7-parchment-all.png)/[深](screenshots/ch09-independent/final-d7-dracula-all.png)。其余独立全帧图保存在同目录D3–D6各theme-all。

主代理的[两章集成结果](ch04-ch09-browser-results.json)另覆盖48视口主题语言组合、236次帧导航与9段代码复制、播放/键盘/闪卡/进度持久化；这部分属于主代理证据，不与本人的只读复核混记。

核验源码SHA256：
- `schema.sql`：`49e4c5c188c71de27761f4fd0b7e3159759aff4725082243e2b36c56f802e4b9`
- `create.pseudo`：`36f1807901189c955a13dd582178c2d8772d8f3a1fc4ab6ed746fe4403c395c5`
- `redirect.pseudo`：`5e6ab745449edb98982f114929227617484866e523df26ce3547ade67eab1d72`
- `revoke.sql`：`453a2ffc75058c7d645861bb1c9ac1dc42408e56737a4e75f0dd35db73cfc0ca`
- `verify.mjs`：`68338f51b466bf39443c81f7215b5bdbfc9a1f5f57ec713b9284cd8c9d3a32c6`
