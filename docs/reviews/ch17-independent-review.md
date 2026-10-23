# Ch17 API 网关 · 独立只读复核

2026-10-23 · 复核者：Ch16 作者，GPT-6.1-Sol (`gpt-6.1-sol`) / Max。

**结论：通过。发现 1 项 P1，已由 Ch17 作者修复并经本复核者实际重验关闭；没有未关闭 P0/P1 或阻碍阅读的 P2。**
只写本独立报告、`ch17-independent-*` 证据与 `screenshots/ch17-independent/`；未修改作者 HTML、示例、报告或共享文件。

最终复核绑定：

- HTML：`213c360c3a126a8fc2ccc75b2879e7ac7c7ff126279e9256d80817cc7b9f3b0c`
- `GatewayPolicy.java`：`68aa31ba7031a16e5db039acf931378e7d89a65b5a2778af5d412701ade7b6a4`
- 其余示例源码 SHA 与独立静态命令见 [final checks](ch17-independent-final-checks.json)。

## P1：锁外时间参数使十秒队列错误保留旧样本 · 已关闭

初始 HTML `f2efdf823761fc63469699b1255b4014d091f69b3870626946c7c24aabd50154`、
Java `28ea3ded34d268b89e466a3a1c7c879d401f5f976e1b1be898a030d37b4b6fe1` 中，
`Breaker.complete(ticket,ok,nowMs)` 接收调用方采样的时间，把样本追加队尾，仅从队首剔除过期项。
单 JVM 的单调时钟不保证跨线程进入 synchronized 时，锁外已采样的参数仍按时间排序。

独立真实 Java 反例：先创建 99 个旧 ticket；在 10001ms 处理一个新成功样本；
再处理这些时间参数为 0ms、因回调/锁等待而晚到的 99 个失败。当前十秒窗本应只含那个新成功，
队列却把旧失败留在新样本后方并触发 OPEN。该反例不是靠复述作者自检得到。
初始页/核心/测试已原样存档于 [initial archive](ch17-independent-initial/GatewayPolicy.java)，
[独立探针](ch17-independent-GatewayReview.java) 与 [实际运行输出](ch17-independent-java-results.json)
仍能用归档核心重现原缺陷；没有因新 API 改动抹掉旧证据。

作者选定并落实的是**新的、明确的观察时间语义**：

- `enter()`、`complete(Ticket,boolean)` 均删除锁外时间参数；在同一 monitor 内调用注入的单调 `LongSupplier`。
- 十秒窗记录 `observedMs`，五秒冷却也从锁内观察时点起算。默认时钟取 `nanoTime` 减本地私有 origin 的差值。
- 晚到的物理完成按回调真正被锁内观察时计入；调度延迟可以推迟健康信息。正文、英文、README、D6 图注和闪卡均明确了这个代价。

**因此原来那 99 个物理旧回调若都在 10001ms 才被新实现观察，可以合法触发 OPEN。**
本复核没有把新语义错误验成“仍必须 CLOSED”，也没有声称它实现了原始网络完成事件的时间窗。

新的 [独立 Java 探针](ch17-independent-FixedReview.java) / [执行结果](ch17-independent-fixed-java-results.json)
实际编译最终核心并验证：每次时钟读取 `Thread.holdsLock(breaker)` 必须成立；反射确认 API 不接收外部时间；
9999ms 仍计数、10000ms 精确过期；真实线程阻塞在 monitor 后才采样，probe 入场与失败冷却均使用出锁后观察时间；
重复/旧代回调不能改变新状态。另用全表过滤的独立 oracle 检查 1800 步单调观察轨迹，覆盖多次开路/恢复。
P1 在上述最终 HTML/Java hash 关闭。

## 独立读源与正常/失败路径

先完整读取章节正文、图注与闪卡，以及 `examples/ch17/` 的完整 Java、两份伪代码、README、同步和验证脚本；
对照本批原始 Ch17 与 PLAN §4–8。作者报告和来源表随后用于交叉定位，没有代替判断。

| 路径 | 独立核对结果 |
|---|---|
| 快照与身份正常路径 | 请求只抓一次不可变快照，route/audience/scopes/quota/cohort/目标版本共同固定。控制面换 v43 后，已有请求仍用 v42；后续请求才换版。原始身份头/Forwarded/canary 不产生 InternalContext。 |
| JWT 与权限边界 | issuer/key 来源受控，audience/用途/签名/时间/算法均是验证适配器契约。无效凭证 401+challenge、scope 不足 403、验证基础设施不可用 503。mTLS 还需被授权的 Gateway/BFF 对端与受限入口；Orders 仍查对象归属。没有把“私网”当身份。 |
| UNKNOWN 已扣额反例 | Redis 可能已在 2ms 扣额、5ms 等待端选 UNKNOWN、10ms ALLOW 才到。风险接口 503，不重扣/退款；晚到结果不能再发下游。获准公开安全读也只能选一次紧急桶路径。此项是明确的适配器终态契约，未伪称真实 Redis 客户端已实现。 |
| 紧急桶与重启 | 四个不重叠 owner、每份 100/s+100 容量，新建/重启从实际本地时点空桶开始，不随故障切换重置。转交须先停旧 owner，无法确认就拒绝降级。区间界为 400Δ+400，而非任意一秒最多 400 次。 |
| 期限与重放 | 一次收包期限，政策后只算一次 upstreamEnd；跨机器不比较绝对 nanoTime。GET/HEAD 还须请求体可重放、响应未开始、原本地传输已终止、只重试一次及剩余预算。POST 即使带业务键也不绕过该代理政策。 |
| 额外尝试与资源 | 20 个原始准入赚 1 信用，初始空、每台最多 125，消费不返、重试不赚。全生命周期累计 R≤O/20，并非滑动秒比率。permit 与实际本地流终止绑定，逻辑 504 不释放；旧流未终止不启动 hedge。远端事务仍需自己的并发保护。 |
| 健康与探针 | 限流/并发拒绝与业务 4xx 不当成上游健康失败。固定最终观察窗，至少 100 次且 50% 失败才开路；本地一个 probe，不宣称全局一个。probe 不重试、占实际资源直到终止；epoch/done 拒迟到和重复完成。 |
| BFF 与版本 | 可选 Comments 失败标 unavailable，必需 Orders 失败不伪造空列表。并行例是同次执行预算。cohort 的用户占比不是请求占比；回滚不撤销已提交写，也不把未知 v2 写自动重放到 v1。 |

上述 JWT/HTTP/mTLS/Redis/部署路径没有实际后端，正常与 UNKNOWN、快照替换等轨迹是手工契约推演，
与下面实际执行的 Java 核心区分。没有为这些未实现适配器虚构“已通过真实故障测试”。

## 实际编译执行与数字复算

JDK 17.0.10，临时编译目录在完成后删除。

- 初始归档核心：作者原 42 断言实际通过；本复核另写的 **8968 项 oracle/并发断言**通过，随后实际打印上述 P1 反例。断言数主要来自随机输入循环，不解释为 8968 种基础设施场景。包括 1500 组固定期限/重试边界、独立信用模型、12 真线程同时赚取/消耗信用、80 真线程争 20 个剩余槽、32 真线程重复终止、60 真线程争单 probe。
- 最终核心：作者更新的 **50 项断言**实际重跑；本复核新增 **5119 项固定时钟/窗口 oracle/并发断言**通过。它们针对新观察语义和修改后的实际类，未把旧 API 的反例机械改成成功用例。结果绑定最终 hash。
- 独立 [contracts.py](ch17-independent-contracts.py) / [结果](ch17-independent-contract-results.json) 复算全部主要数字，并用 exact rational 桶做 500 个随机区间断言。该文件另外明确标注五条手工适配器轨迹，未混为真实网络实验。
- 五段页面代码同源检查、章节审计、全站结构、本独立浏览器脚本语法和 scoped diff 检查通过，命令在 final checks。全站 3 条既有迁移/复核 note 不作为本章新增缺陷。

| 推导 | 独立结果与适用条件 |
|---|---|
| Gateway 数与 N−1 | ceil(10000/4000)+1=4；三台剩 12000。原始流量占预算 83.33%，按初始假设不含重试。把稳态额外 500/s 计入则为 87.5%，仍小于预算；没有把初始 83.3% 偷换成含重试值。 |
| 双侧网络 | 每方向 10000×(2000+4000)=60 MB/s=480 Mb/s；四台 120、三台 160 Mb/s/台/方向。外侧响应 320 Mb/s 不是完整 NIC 预算。 |
| 验签/状态/限流在途 | 10000×0.2ms=2 aggregate cores；百万桶×100B×2=200MB 名义下限；10000/s×2ms=20 次在途。其余 CPU/索引/分配器/复制开销仍待测。 |
| 个人桶与错误复制 | rate20、burst40；四台各给全额会变 rate80、burst160。10万人×20/s=200万/s，不能靠用户公平替代总容量门。 |
| BFF/cohort | 80+40+120+20=260ms；max(80,40,120)+20=140ms，非合成 p99。相同用户请求率前提下，10% cohort 对应约1000/s。 |
| 重试 | 20+80+20+80=200ms；三层各两次为8次；稳态每秒赚10000/20=500信用，固定四台可积500，非任意秒10500硬界。 |
| 在途与日志 | 假设持续10K/s且全慢240ms，约2400上游工作，四台600/台、三台800/台；完整300ms约3000。不能据此证明任意突发或远端事务上限。300B×10K=3MB/s、峰值一小时10.8GB。 |

## 动画、真实视口与交互

独立与原始 HTML 比对：6 组 30 帧、每组 5 帧，title/desc ID 与顺序保持；
本轮原始→作者初稿有 15 帧 SVG 局部修改，另 15 帧逐字节不动，见 [animation](ch17-independent-animation.json)。
P1 返修**全部 30 帧 SVG 与独立初审时逐字节相同**，只改相邻说明/图注与代码，final checks 已断言。

独立实际看过全部 30 帧两主题原尺寸截图与 12 张逐组接触表；重点检查修改的 D2/D3/D4/D6：
D2 的 verified context 位于 private 边界前通道，字体与边界不相压；D4 压缩 BFF 后各分支仍独立，
Profile 的 get/rows 不再落在 Orders 回线上；D3 的 token/per-original 标签与限流一次契约一致；
D6 的累计额度/在途说明不再伪装成瞬时速率上限。未发现阻碍阅读的图内文字重叠或裁切。

[独立浏览器脚本](ch17-independent-browser.mjs) 直接使用实际 Chrome/Playwright，
从冻结 HTML 字符串履行页面请求，避免作者修复时混入不同字节：

- 初始 f2ef… 与最终 213c… **分别**执行 320/390/768/1440×两主题×三语言 **24 组合**；最终实际 innerWidth=scrollWidth=目标宽度，展开假设表亦成立。
- 每阶段 390/1440 两主题对照模式逐一访问全部30帧，共120次翻帧。最终5段复制与剪贴板原文一致，键盘、播放/暂停、倍速/循环、12卡网格与翻卡、已读和主题/语言 reload 持久化通过；错误资源/页面异常0。
- D2/D4 全组在**真实390×1000**视口两主题分别左/中/右截图，共60张完整 figure PNG；全部逐帧目视，4张窄图接触表仅从这些真实页面截图派生，不以CLI裁切代替手机。
- P1 新语义的 D6F4 图注补看两主题390实际 figure；最终代码与闪卡网格也单独目视。初审与最终截图分别在 `screenshots/ch17-independent/initial/`、`final/`。

最终 [浏览器结果](ch17-independent-browser-final-results.json) 绑定 213c…；
代表：[390 最终代码](screenshots/ch17-independent/final/390-dracula-code.png)、
[D2 窄屏右端](screenshots/ch17-independent/final/d2s4-dracula-right-390.png)、
[D4 窄屏右端](screenshots/ch17-independent/final/d4s5-parchment-right-390.png)、
[D6 新图注](screenshots/ch17-independent/final/d6s4-parchment-caption-390.png)、
[闪卡网格](screenshots/ch17-independent/final/cards-grid-dracula.png)。
320 对照顶栏品牌竖排及横滚时图注跟随 slide 是共享 UI 既有表现，本章未改共享实现。

## 一手来源抽核与未验证事项

本复核另行浏览并检查原文，不仅看作者来源表：

- [RFC 9110 §9.2.2](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2) 确认代理不得自动重试非幂等请求；本章 GET/HEAD 子集与 POST 业务恢复的分界成立。
- [RFC 9068 §4](https://www.rfc-editor.org/rfc/rfc9068.html#section-4) 确认两种 typ、issuer/audience 等资源侧检查；[RFC 8725](https://www.rfc-editor.org/rfc/rfc8725.html) 支持算法/用途/受控密钥来源；这些规范不提供本章0.2ms测量。
- [RFC 6750 §3.1](https://www.rfc-editor.org/rfc/rfc6750.html#section-3.1) 区分 malformed credential request 的400、invalid token的401、insufficient scope的403；本章解析器先拒歧义输入，依赖不可用503是自设政策。[RFC 6585 §4](https://www.rfc-editor.org/rfc/rfc6585.html#section-4) 允许429附等待提示，不规定本文算法。
- [RFC 7239 §8.1](https://www.rfc-editor.org/rfc/rfc7239.html#section-8.1) 确认客户端可修改Forwarded，控制前缀及链路保护有必要；头本身不能证明身份。
- [Envoy v1.36 xDS](https://www.envoyproxy.io/docs/envoy/v1.36.0/api-docs/xds_protocol#ack-and-nack-semantics-summary) 支持ACK不等于成功应用；[resource circuit breaking](https://www.envoyproxy.io/docs/envoy/v1.36.0/intro/arch_overview/upstream/circuit_breaking.html) 区分连接、pending、active requests/retries，且实际连接上限有例外，不应冒充本Java精确semaphore。本次无扩展名URL间歇取回失败，`.html`入口成功取回全部正文。
- [Redis replication](https://redis.io/docs/latest/operate/oss_and_stack/management/replication/) 支持异步复制与丢已扣额风险；[Java17 nanoTime](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/System.html#nanoTime()) 只支持同JVM差值，不能为跨机器绝对截止背书。

未验证真实 HTTP parser/代理、JWT密码学、IdP/JWKS、mTLS、Redis调用/复制切换、控制面发布、owner交接、
跨机时钟/传输界、取消/网络分区和生产负载。Java并发证明局部状态，不证明全球配额或业务副作用会随超时回滚。
锁内观察窗会受调度延迟影响；逐样本队列仍是教学实现，生产需要有界高效统计且保持相同语义。

最终验收与 PLAN 由主代理收口。独立复核通过不包含提交、推送或部署授权。
