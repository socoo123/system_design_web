# Ch44 独立复核

复核者：原 Ch43 作者，GPT-6.1-Sol / max。只读检查 Ch44 页面与 examples；仅写本独立前缀的探针、报告和截图。未改目标、共享 UI/PLAN，不提交部署。

最终状态：**独立复核通过，openFindings=[]**。R44-01已由原作者修复并经本复核新输入关闭；最终页面 `fbfcc49ad8d5cba4ca65daf60e0077bfc98b3e1ee54926ba721e775d12e7d5fa` 与全部examples签名已在签字前复算。

## 阅读与独立重走范围

已完整读中英正文、4 段展示与全部 examples 源码、7组36帧图意/图注、13张闪卡。没有沿用作者 main 作为独立结论。

正常受理按 tenant/operation/K 与规范化 payload，在一事务写 intents、orders、outbox、result；201 只表示持久 ACCEPTED。独立新输入用16个并发连接竞争相同K，得到同一order/result，三表只增一份。另让同K不同payload同时竞争，只有一方提交，另一方冲突；tenant和operation改变分别形成不同身份。提交后调用方丢弃ACK、结果裁剪后保留K映射都不会新建订单。

正常消费把唯一 (tenant,consumer,event_id) 与本地积分同事务；独立16连接重复一个 +7 事件只加一次。更换 account_id 或 delta 的同事件冲突，缺账户、COMMIT前中断都回滚 inbox；另一个 tenant/consumer 的同 event ID 有自己的范围。最终独立账面为905/523/1000，orders/intents/outbox/inbox各5份。[SQL新探针](./ch44-independent-transactions.py) / [结果](./ch44-independent-transactions-results.json)。这是SQLite文件事务检查，未冒充PostgreSQL18、真实鉴权或网络故障。

## 独立发现与返修

| ID | 级别 | 触发、后果 | 作者修复与独立重验 |
|---|---|---|---|
| R44-01 | P1 | 原 retry.pseudo:16 在 worker 已领 slot/ticket 后调用共享额度，但 try 从19行才开始；额度解析/SDK异常跳过finish/release，CLOSED第二次attempt即可漏槽位 | 作者把检查、额度、I/O全部包在外层try/catch/finally，finally去重finish(IGNORED)+release；额度同一attempt_end，最多10ms且不得吃掉100ms有用窗口；已独立调用新增实际Java guardedBody重验通过，最终源签名已核，关闭 |

原始控制流模型使用实际 Breaker，额度抛异常时看到槽位0、票据未完成；证据 [before](./ch44-independent-quota-before.json)、[原探针](./ch44-independent-quota-probe.java)、[原伪码](./ch44-independent-retry-before.pseudo)。它不是完整RPC执行。最初HALF_OPEN夹具只验证一般worker状态：固定800ms总死线、1s冷却下，同请求第二次attempt通常来不及等到一次新半开；可达CLOSED槽位泄漏已足以构成P1。这个可达性区分明确记录于 [reachability](./ch44-independent-quota-reachability.json)，没有把夹具冒充完整800ms时序。

修后新输入直接调用实际 `guardedBody`、`Breaker` 与 `remainingAttempt`，36条断言覆盖：CLOSED额度异常、HALF_OPEN通用收尾、下一次冷却可探测、DENIED/UNKNOWN无Inventory派发、额度返回后迟调度、transport本地异常、已归因FAILURE与成功不被finally降级、Error仍走finally、仍在运行的额度线程被cancel后继续占槽直到真正退出。[修后探针](./ch44-independent-quota-after-probe.java) / [结果](./ch44-independent-quota-after.json)。额度RPC、完整retry调度器仍是伪代码契约，没有虚构网络验证。

## 死线、熔断与额度的独立检查

[新Java探针](./ch44-independent-probe.java) 对作者实际类作64条断言，含48线程半开竞争、旧代次成功不能关闭新探针、重复finish无效、未派发探针重新冷却、两个实例各有自己的probe，以及真实JVM中 Future.cancel/done 早于忽略中断的工作退出。修后再次编译执行，结果收于 [quota-after](./ch44-independent-quota-after.json)。

独立正常时序采用不同输入：本地80ms；第一调用在81ms真正派发，余219ms；280ms得到终态临时错误；退避39ms，第二次319ms准入，410ms真正派发余129ms，500ms完成，再留140ms，640ms在800ms内。旧“须剩完整220ms”问题没有重现。

核心反例逐步对照源码：

- 第二次319ms准入后，439ms临发恰剩100ms允许；440ms只余99ms拒绝。第一次准入到调度的耗时没有重置。
- 只剩250ms再退避40ms，仅余70ms可用于I/O（另留140ms），拒绝补调。额外额度返回后再次核同一attempt_end，迟恢复也不能续命。
- caller await超时就取消并STOP；`local_io_terminal` 未确认时不进入第二次，finally要等本地额度/I/O实际退出才归还slot。远端是否停止另有合同。
- 网络错误由inventory适配器归一为依赖FAILURE；鉴权、业务冲突、本地准入和额度故障不统计为依赖坏。epoch和一次性ticket防旧完成污染新状态，范围明确是单进程。
- 共享权威以权威时间固定一秒窗口、条件used<20；它是每200原始准入最多20额外准入，不是每台20/s。相邻窗口可在很短时间内合计40次；页面没有声称滑动窗口或物理发送均匀。该权威服务未实现，属于明确外部依赖，不计为实际执行测试。

## 算术与引用

[独立复算](./ch44-independent-calculations.json)：200×0.1=20平均在途；200×180=36,000条/36MB；净300−200=100/s、追平360s；3×2+1=7s探测预算另加耗时；80+220+40+220+140=700ms、余100ms；20次额外/220总准入；7天×200×86,400×1KB=120.96GB逻辑结果；两台幸存2×600=1,200/s≥1,000；10%×1,000=100/s；5×80=400ms与理想并行80ms；3⁵=243。平均在途、阶段帽与P99没有混用。

复核时重新浏览一手来源，精确支持范围见 [独立来源记录](./ch44-independent-sources.md)。重点确认：gRPC默认无deadline、传播扣耗时与应用取消责任；PostgreSQL18 READ COMMITTED每语句新快照以及DO NOTHING可遇到插入快照不可见的竞争；唯一约束必须另有NOT NULL；Stripe v1首次结果/参数比较/裁剪后可重执行，v2不同；Consul passing默认false；RFC9110的201资源创建与202未完成。七天/永久K、100/220/140ms、三次/一秒、共享20窗口都是章内教学合同，没有归给厂商。

## 页面与动画

独立真实Chrome/Playwright：320/390/1440 × 双主题 × zh/en/both共18布局，144次翻帧、4段复制、键盘/自动播放、速度/循环、闪卡点击/Enter/Space与进度/主题/语言持久化均通过。展开内容后无整页横溢；代码Copy与标签不重叠，EN代码无中文，闪卡为网格。[浏览器脚本](./ch44-independent-browser.mjs) / [结果](./ch44-independent-browser-results.json)。这些检查已在最终冻结版本重新执行，页面签名与最终清单一致。另以真实320/390 × 双主题 × both/en补8组合，实测代码/图内横向滚动并保存24张窄屏截图：[补测结果](./ch44-independent-mobile-results.json)。

已独立渲染7组36帧×两主题=72张截图，并实际打开14张接触表覆盖全部画面；代码返修后最终版本再渲染72张，62画面与已目视接触表逐像素相同，D6两主题10张有栅格差异，已另生成并实际打开两张最终接触表重看，全部可读（SVG内容仍与基线相同）。[像素对照与补看记录](./ch44-independent-visual-consistency.json)。改动D5的全部5帧×两主题均逐帧看过。D5同一死线、只读Inventory、重试上限与阶段帽标识清楚，标签没有挤入节点或箭头。其余六组的事务/ACK/UNKNOWN/回程与文本一致。节点、留白和路径可读，未把自动几何结果当目视结论。[帧脚本](./ch44-independent-frames.mjs) / [清单](./ch44-independent-after-frames.json)；截图位于 `screenshots/ch44-independent/`。

公共320both导航逐字折行是已知PLAN F04，基线相同且可操作，留Q统一处理；本复核未改公共UI。窄屏表、代码、图使用内滚动，桌面与390实际页面截图已打开。

## 限制与签字

未做真实RPC、共享额度服务、PostgreSQL18并发、Broker故障、生产压测或分布式数据库故障实验；取消/超时没有被说成撤销远端提交。R44-01的代码异常/资源收尾通过实际本地Java与明确标注控制流模型验证，源适配器的网络结束契约仍须由真实实现兑现。

最终签字：[ch44-independent-final.json](./ch44-independent-final.json)，`passed=true`、`openFindings=[]`。当前页面/全部examples文件（排除`__pycache__`）共9份SHA256与作者冻结清单相同；SQL、Java返修、最终浏览器/窄屏/帧证据均已核相应源身份。无新增未解决P0/P1或阻碍阅读P2，不自动扩到Q。
