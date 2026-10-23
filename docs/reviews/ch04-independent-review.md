# Ch04 独立复核 · 通过

2026-10-22；复核者 `ch09_author`，Astra / `gpt-6-astra`，High。独立阅读正文、代码、图注、中英闪卡，重算数字、重新浏览一手资料，独立运行隔离 Redis 和浏览器。**未发现未关闭的 P0/P1 或阻碍阅读的 P2，可由主代理验收。** 没有修改 Ch04 页面、实现、作者报告、公共文件或 PLAN。

绑定版本：

- 页面 SHA256：`7bc07a67e9db72660b098e095a39feb9bc0814e31b493536dc4d4057b6983573`
- Lua SHA256：`d7f0b1c9b1df45dda7f105f60800bb7b29a5074f892d4d4a0e490cfce9956626`
- 审阅开始、测试结束后 hash 一致；结构审计与限定 diff 检查通过。保留5组25帧。

## 技术与反例

| 独立核对 | 结论 |
|---|---|
| t=10/20/25正常路径 | 满桶60000信用，t10三次后15000；t20先补10000，允许一次后10000，再一次拒绝且等待5000ms；t25补5000后扣至0。与动态图及闪卡一致 |
| 最后一个token竞争 | 20客户端对真实Redis执行原Lua与真实TIME：仅1 allow、19 deny。读补判写均在EVAL内，Gateway不预读余额；本地互斥不会被当作跨进程保证 |
| 100秒回拨与TTL | 原Lua、预置future-last：返回`[0,0,115000]`，PTTL=220000ms，last保留。TTL包含欠时，不会在尚未追平且补满前重建满桶；向前跳钟、驱逐与切主丢失限制已明说 |
| 回拨追平独立追加场景 | 空桶last=t20：t19返回`[0,0,16000]`；t20返回`[0,0,15000]`；t35返回`[1,0,0]`，没有把回拨时间重复补入 |
| 全成本独立追加场景 | cost=4在t0允许且剩0；同刻再试拒绝、等待60000ms；t60允许且剩0。cost>B是参数错误，不是无限等待 |
| JSON/参数与部分写失败 | false/null/错误版本/越界等在写前报错。ACL拒绝唯一SET时状态不变且无allow。唯一SET PX同时写余额和TTL；没有把Lua隔离性写成自动回滚 |
| 回执丢失 | 丢弃实际执行回复后重试，信用45000→30000，确实会双扣。正文明确未知扣减不自动重试/退款；不把限流判定幂等混同业务幂等 |
| 严格滚动窗口 | 七次t59加一次t90：估计0+7×0.5+1=4.5允许，真实(30,90]为8应拒绝。精确日志保留获准请求、唯一member，串行删/数/加；前提包含时间与状态不丢 |
| 降级边界 | 四桶各B50/r500，上界200+2000T只覆盖fallback；1s为2200，不证明总Service吞吐。正常流量仍经过权威，Service另控正常+降级总量与在途；成员、重启、抖动重复初始化风险已覆盖 |
| 数字/HTTP | B+r×60=8；6.5+1=7.5>7；1M×200B×2=400MB十进制。429确认规则拒绝，503用于无法检查敏感请求/应急容量耗尽；等待向上取整秒且不预留未来额度。中英与12张闪卡相符 |

实际运行作者验证程序的临时副本，仅把ROOT/报告输出位置改到独立目录，避免覆盖作者证据；额外加入上述cost=4和回拨追平两组检查。**9组全部通过**，本次原始返回见 [独立Redis结果](screenshots/ch04-independent/code-results.json)。Redis 7.2.5为`/tmp/redis-7.2.5/src/redis-server`，测试启用临时Unix socket、关闭持久化，结束后关闭进程。正常时间轴和追加边界仅替换TIME取时点，最后令牌竞争/100秒future-last/ACL/丢弃回复使用原Lua。

## 独立视觉与页面

重新从绑定HTML渲染D1、D5全部5帧×两主题，共20帧并逐帧目视；另渲染并目视D2/D3/D4末帧×两主题。检查了Redis柱形节点两行与圆弧、请求标签、拒绝/配置回路、超时与降级说明、并发时序、窗口刻度：可辨认，无文字被线路/节点盖住；没有只依赖作者几何结论。

- [D1F5浅色](screenshots/ch04-independent/d1s5t-parchment.png) / [深色](screenshots/ch04-independent/d1s5t-dracula.png)
- [D5F5浅色](screenshots/ch04-independent/d5s5t-parchment.png) / [深色](screenshots/ch04-independent/d5s5t-dracula.png)
- [严格窗口末帧](screenshots/ch04-independent/d4s5t-parchment.png)

独立打开1440/390真实viewport、两主题，浅色用both、深色用en；四组`innerWidth=scrollWidth`均成立。实际查看桌面英文Lua全段、手机对照导读、手机故障图左右滚动，节点与播放器在自身容器可访问。证据：[桌面代码](screenshots/ch04-independent/page-1440-dracula-code.png)、[手机对照](screenshots/ch04-independent/page-390-parchment-top.png)、[手机图右侧](screenshots/ch04-independent/page-390-dracula-d5-right.png)、[视口数据](screenshots/ch04-independent/page-results.json)。主代理的48组合完整交互测试见本批浏览器报告；本复核不声称独立再跑全部48组合。

## 来源抽核与限制

本次实际浏览并比对：

- [RFC3290附录A](https://www.rfc-editor.org/rfc/rfc3290.html)：补充/扣减和R×t+B包络；正文的毫秒计量误差已单独声明。
- [Redis Lua](https://redis.io/docs/latest/develop/programmability/eval-intro/)、[EXPIRE](https://redis.io/docs/latest/commands/expire/)、[复制](https://redis.io/docs/latest/operate/oss_and_stack/management/replication/)：隔离执行、绝对时间过期、WAIT不等于强一致切主，结论对应。
- [Cloudflare原文](https://blog.cloudflare.com/counting-things-a-lot-of-different-things/)：明确上一采样期恒定速率假设，非严格滑窗保证；反例是章节自设。
- [Envoy全局限流](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/other_features/global_rate_limiting)、[RFC6585](https://www.rfc-editor.org/rfc/rfc6585.html#section-4)与[RFC9110](https://www.rfc-editor.org/rfc/rfc9110.html)：本地预检后仍查全局、429/Retry-After/503语义一致。

未运行OS调时、复制丢失、切主、驱逐、吞吐/p99或多地域实验。预置future-last不等于调系统时钟，丢弃已读回复不等于网络故障注入；真实Redis并发只验证该单主脚本的隔离，不证明持久性。精确滑动日志与Service总量保护属于解释清楚的伪代码/依赖契约，非完整生产实现。剩余限制均在章节/作者记录中已明确，不阻碍本轮教学样板验收。
