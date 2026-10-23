# Ch10 通知系统 · 独立交叉复核

复核人：`ch11_author`，GPT-6.1-Sol (`gpt-6.1-sol`) / Max。日期：2026-10-23。

初始作者冻结页：`3705ad219555d3bc64d9e823a3b24115649bf14a99578d20de1ebc0cdc666ef9`。FCM / D2返修中间版本：`d6fca16a358510cc85e4eb56283a1bc503f526f9e39591f510462df7ec03487f`。

最终复核SHA：`fd8d0fd98baeb5aae540f47b3cbb4e00cab29dce4d9a57de8a3c8d9863e1a45f`。

结论：**独立复核通过**。本独立复核发现的1项P1与D1/D2同类入口标签P2家族已全部返修、复验关闭；当前审阅范围内无未关闭P0/P1或阻碍阅读的P2。最终批次验收由主代理收口。

## 独立范围与方法

完整阅读PLAN §§4–8、冻结页、`examples/ch10/`五份教学源/README/同步器/验证模型、作者记录/来源记录及本批原始HTML。未以作者“38/42项通过”代替独立审阅。没有改页面、作者源码或证据、共享样式/工具、其他章、PLAN；只写本独立记录、probe与专属截图。不派子agent，未提交推送部署。

独立浏览Firebase、Apple直接设备推送官方Markdown、PostgreSQL18、Kafka4.1、RFC5321/8058/6376、作者原论文和AWS outbox；具体链接、支持范围与不支持的推广见[ch10-independent-sources.md](./ch10-independent-sources.md)。Apple旧error-responses页是broadcast，未用于设备token410判断。

独立执行的[ch10-independent-probe.py](./ch10-independent-probe.py)采用最小SQLite事务/谓词和确定性时序，避免建立完整镜像后端；对FCM闭环另只提取作者`verify.py`里的纯plan定义，执行独立设计的216个provider/status/header/quota/outcome组合，不运行作者测试入口、不覆盖作者结果。所有输入/输出留在[ch10-independent-probe-results.json](./ch10-independent-probe-results.json)。这不证明PostgreSQL行锁并发或供应商实际行为。

## 正常路径与关键失败窗口

| 独立走查 | 复核结果 |
|---|---|
| 接受：同tenant/key同摘要，提交intent、Delivery与ready outbox后回202 | 原子边界在同一权威库；外部正文/受众引用先耐久。两个先查miss由唯一键裁决，唯一异常先ROLLBACK再新主库语句读胜者；异摘要409，不吞其他唯一错误 |
| COMMIT未知 | 接受结果未知保持同key恢复；claim或started准备的COMMIT未知不开始新调用、不ACK。丢连接/ROLLBACK不能证明已提交未发生 |
| 领取与发送 | queued/retry_due或过期lease在行锁内领取、epoch前移；30s DB租约不等于队列可见性。持久started与尝试预留计数后才调用，发送前重检当前epoch/status/有效期和本地剩余预算 |
| 正常接受结果 | provider明确接受后，Attempt、当前代次Delivery与retry/DLQ outbox同结果事务落库，再ACK；正常probe实际走此顺序，重投终态不重发 |
| 外部成功、本地未知 | 供应商已经收下但结果未落库，started恢复为timeout_unknown且uncertain保留。独立轨迹允许继任者重试并观察到两次外部接受；这正是页面公开的重复风险，不被epoch掩盖 |
| late accepted与旧代次 | 旧worker只能落自己的Attempt证据，不能覆盖新代次任务。独立probe让调度failed后旧Attempt迟到accepted，观察仍可查询、任务不复活。调度状态与外部观察分开是必要的 |
| lost ACK与未来任务 | 已落库接受的重复唤醒不重发；retry_wait尚未到期不因早来的旧唤醒提前调用。NO_CLAIM可ACK，因为工作/未来计划和扫描仍耐久 |
| 首次queued/expired lease修复 | last_woken_at在接受时初始化为非空DB时间；独立在非零接受时间100、首次未补偿的queued与expired lease上查询恢复。future/terminal排除，NULL拒绝，repair wake与wake_no回滚一致 |
| 命名空间 | ready/retry/repair/dlq的unique_key带kind；相同delivery/数字的retry与repair不冲突。稳定Attempt ID仅对应自身外部尝试，Receipt认证/关联失败保持孤立证据，不按手机号猜配 |
| 发送门 | accepted证据先查，营销偏好/时区/频次/配额在调用前判定，依赖失败暂缓。DEFERRED给未来时间、不占外部调用次数；OTP只绕过营销规则，仍查过期、反滥用与供应商额度 |
| token与APNs时间 | 所有重新登记递增token_version，旧结果条件更新不得停用新版本。APNs410需把Epoch毫秒规范化后核对登记时间与已知误差界；不具备安全比较条件就REGISTRATION_RECHECK，超时不删token |
| 缓存与退订 | 偏好TTL从权威读开始、不因迟到回填延长；失效outbox与偏好同事务。DKIM由邮箱验证头覆盖，公开入口校验窄能力。正文正确保留并发退订/在途副作用窗口，不承诺“最多多发一条” |

本章是教学片段。pre_send_gates、配额存储原子扣减、回调认证/关联、render/解密与时间换算仍是明确的适配器契约；不是现成生产服务。没有以本地Set、队列ACK、SQLite串行化或名字叫transaction就宣称分布式exactly-once。

## 问题与关闭证据

### P1：FCM可重试失败的10秒下界未覆盖500无header

发现人：本独立复核者。初始位置：`examples/ch10/retry.pseudo`原第2–3、12–13行，页面原约949行及README。发送HTTP timeout已同步10秒，但只列FCM429/APNs5xx适配下界，其他provider_not_before可缺省now；普通SMS一秒起步被误用于FCM500。

可复现反例：now=100、send_count=1、FCM500且没有Retry-After，原已写明的缺省下界允许due=100.5，低于Firebase规模指南的失败重试至少10秒建议。独立probe保留此原版反例与初始SHA；这不是声称FCM协议对所有供应商具有同一规则。

作者在d6fca1版本把FCM retryable_failure显式取`max(provider_floor, now+10s)`，429再叠加Retry-After/无header60s及overall/topic至少60s；结果事务now晚于观测失败时间，保守加等待。中英正文、README、来源及共享代码同步，普通SMS策略未被一起改成10秒。

独立复验：500无header等待≥10s；剩余OTP不足10s直接expired；429无header≥60s；长Retry-After不被60s本地cap截短；APNs15min使五分钟OTP过期。另216个实际作者纯plan输入组合全部通过，provider/status/header/quota/outcome覆盖FCM500/503/429及timeout_unknown，均未提前。P1关闭。

### P2家族：D1/D2入口标签挤到x128虚线边界

- D2由主代理先目视并测量：原POST只余2.0399 SVG单位；202+id右沿133.4783，越x128边界5.4783。作者将D2全部帧POST/202+id中心110→94，节点线路不动；本独立复核者对全部6帧两主题及390左右中视图复验，修后最小间隔10.5217，目视清楚，D2关闭。
- D1由本独立复核者逐帧目视发现：5帧POST仍中心116，依同字体字宽右沿约131.9601，穿边界约3.9601；202也紧挨边界。源码初始第68/81/99/126/167行和独立390左视图均可定位。已报告主代理和作者，要求同组全部入口POST/202中心116→94，保持帧连续与节点线路。

D1改前证据：[浅色全帧](./screenshots/ch10-independent/before-d1-parchment-frames.png)、[深色全帧](./screenshots/ch10-independent/before-d1-dracula-frames.png)、[390深色全部左中右](./screenshots/ch10-independent/before-d1-dracula-390.png)。D2原问题亦可对照主代理[ch10-ch11-ch12-label-probe.json](./ch10-ch11-ch12-label-probe.json)。作者在最终fd8d0f版本将D1五帧入口标签116→94；本独立复核重新检查D1+D2全部11帧×双主题和390左/中/右视图。D1最小间隔18.0399、D2最小10.5217 SVG单位，入口文字不再触碰边界，帧间一致，节点/线路不动。该P2家族全部关闭。

## 独立容量复算

使用Fraction，从假设重新计算，不读取作者已算出的numbers作为输入：

| 项目 | 独立值/结论 |
|---|---|
| 日常端点 | 140M/86400=1,620.370370/s；五倍峰值8,101.851852/s |
| 活动独占 | 14M/2000=7,000s=1.944444h；十分钟完成需23,333.3333/s |
| 活动共享 | 余量2000−1620.370370=379.629630/s；14M/余量=10.243902h |
| 突发恢复 | (8101.851852−2000)×600=3,661,111.1111；回到平均后需2.678862h排空 |
| 状态存储 | 140M×500B=70GB/天，30天2.1TB原始、三份6.3TB；十进制，正文/索引/Attempt等另计 |
| 分页/分区/邮件 | 10M/1000=10k页；2k/500=4消费分区，8只是余量建议；3M/200=15k秒=4.166667h |
| 优先级预算 | OTP占用200/s时营销只余1800/s，独占活动下界变2.160494h，不能再套1.94h |
| 同步扇出尾部 | 1−0.99^100=0.63396766，只是独立性例子；页面未误当三供应商的预测 |

平均输入、消费/供应商能力、API QPS与端点调用数量有区分。四个分区支持2k排水不证明接得住8.1k输入；正文也承认持续超载需要扩容或拒绝。发布p99与供应商接受p95分开，未把局部时延相加当整链p99。

## 动画与真实页面独立检查

本批基线6组31帧（5/6/5/5/5/5），所有原title/desc ID和顺序保留，无删帧。本独立浏览器脚本[ch10-independent-browser.mjs](./ch10-independent-browser.mjs)读取固定HTML字节并在真实本地URL使用相同冻结响应，资产仍由8765实际服务；避免作者返修期间混用两个版本。每次结果记录对应HTML SHA。

对d6fca1版本已独立渲染全部31帧两主题（62张），全部目视；D1/D2/D3修改组16帧×两主题×390左/中/右共96视图也看过，发现上面的D1标签问题。D3 10s文字无遮挡、供应商回程回worker，持久结果后ACK；D2 INSERT/查找返回/commit独立通道可追踪。未凭几何或页面无溢出替代目视。

真实320/390/1440 × 两主题 × zh/en/both共18组合，实际innerWidth=scrollWidth，18张闪卡保持grid，6代码块和目录存在，页面/资源错误为0。复制、播放、进度完整交互由作者/主代理另行覆盖，本独立脚本不冒称又跑了一次那些交互。最终fd8d0f版本已完整重跑以上62帧截图、96窄视图与18布局组合，全部通过；重新目视受影响的D1/D2全部帧、两主题与390左右中视图。D3的10s标签与其余图形未因最后入口文字修复变化。最终结果见[ch10-independent-browser-results.json](./ch10-independent-browser-results.json)，与当前HTML SHA一致。

## 限制与结论范围

未连接真实PostgreSQL、供应商或broker，未做PG锁并发、崩溃进程/网络分区、时钟失步、吞吐/配额/p99实验。SQLite仅验证简化本地事务谓词与时序，PostgreSQL unique/READ COMMITTED/行锁语义依据重新核对的一手文档。显示代码是伪代码/SQL教学片段，没有Java服务，所以不编造Java编译结果。

技术、数字、英文、闪卡和引用的独立核对已完成；最终38项独立probe（含216个实际纯plan输入）及5份同源、audit均通过。所有本轮发现已关闭，独立复核通过。未提交、推送或部署。

## 最终复验与可复现证据

- 独立probe最终页面SHA、浏览器最终页面SHA与当前HTML均为`fd8d0fd98baeb5aae540f47b3cbb4e00cab29dce4d9a57de8a3c8d9863e1a45f`。38项独立检查、216个FCM纯plan输入、31原帧ID/顺序及5源块逐字一致。
- `python3 examples/ch10/sync.py --check`：5份共享代码一致；`node tools/audit-chapter.mjs ch10`：PASS，6组31帧、6代码块、zh/en各222。只运行其只读检查入口，未覆盖作者结果。
- 最终浏览器实际结果：62张双主题原尺寸SVG、96个390左/中/右视图、18个320/390/1440×双主题×三语言真实布局组合；D1/D2共22个帧/主题入口标签集合全部留有正间隙，无页面脚本/资源错误。
- 独立最终代表图：[D1浅色全帧](./screenshots/ch10-independent/d1-parchment-frames.png)、[D1深色全帧](./screenshots/ch10-independent/d1-dracula-frames.png)、[D1 390深色](./screenshots/ch10-independent/d1-dracula-390.png)、[D2深色全帧](./screenshots/ch10-independent/d2-dracula-frames.png)、[D2 390浅色](./screenshots/ch10-independent/d2-parchment-390.png)、[D3 390深色10s](./screenshots/ch10-independent/d3-dracula-390.png)。
- 320对照顶栏品牌竖排与图注随大图横滚为共享UI既有行为，作者已记录，本轮未新增/隐瞒，也未以CLI裁切图冒充窄屏。

```sh
python3 docs/reviews/ch10-independent-probe.py
PLAYWRIGHT_MODULE=/Users/zy/ai_web_page/js_web/examples/inventory/04-react/node_modules/@playwright/test/index.mjs CH10_EXPECTED_SHA=fd8d0fd98baeb5aae540f47b3cbb4e00cab29dce4d9a57de8a3c8d9863e1a45f node docs/reviews/ch10-independent-browser.mjs
python3 docs/reviews/ch10-independent-contact.py
```
