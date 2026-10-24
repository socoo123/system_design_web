# Ch42 独立复核

结论：**通过，开放问题0。** 本轮独立提出的1项P2已由作者修复并复核关闭；未发现新增P0/P1。复核按GPT-6.1-Sol + Max任务约定进行，未另派agent，未修改目标页面、examples、PLAN或公共资源，未提交部署。

最终HTML SHA256：`fb1e571cbdad8aee2674a29cdf4864dbc20fa4841d0409d81b60388cbe446323`。页面及全部8份examples文本源签署见 [final](./ch42-independent-final.json)。

## 独立范围与版本

先记录 [初始源码哈希](./ch42-independent-before-hashes.json)，通读完整中英页面、各组标题/描述/图注，以及README、全部伪代码、Java和SQLite适配器/检查脚本。未用作者报告替代复核。

初始HTML为`d5c538a5…`。复核期间作者只改HTML和`retry.pseudo`来关闭下述P2；Java、SQL适配器与其余源文件逐字节未变。实际Java/SQLite新夹具运行在修改前后相同的实现字节上；修改后的伪代码另做条件/轨迹复查，最终浏览器及46帧截图均绑定最终HTML哈希。

## 发现与关闭

| 项目 | 处理与独立结论 |
|---|---|
| P2：定时重试唤醒只泛称重查deadline，未明确再次保留250ms尝试和50ms返回预算 | 作者在唤醒处重算remaining，少于300ms停止；取token与非阻塞舱后临发前再次核300ms，不足则归还未启动permit并停止。正文双语同步，5段同源检查、最终复制/布局与独立轨迹复算通过，关闭。 |
| 父代理此前修复的NULL复合主键漏洞 | 使用作者实际DDL和`apply`，以全新scope/event/account输入及直接NULL SQL重新验证，未复现，见下文。 |
| 父代理此前修复的迟调度I/O启动漏洞 | 新夹具刻意阻塞CF超时调度线程，使Future仍未完成但deadline已过；放行worker后实际I/O启动数仍为0。独立确认显式deadline检查生效。 |
| 作者main曾共享IoGate造成测试竞态 | 已读最终main：各case使用独立gate并等待释放。本轮另写独立探针，未依赖作者main的断言结果。 |

## 实际运行的新输入

运行入口：

```sh
PYTHONDONTWRITEBYTECODE=1 python3 docs/reviews/ch42-independent-checks.py
PYTHONDONTWRITEBYTECODE=1 python3 docs/reviews/ch42-independent-contracts.py
PYTHONDONTWRITEBYTECODE=1 python3 examples/ch42/check_sources.py
node docs/reviews/ch42-independent-browser.mjs
node docs/reviews/ch42-independent-render.mjs after
node docs/reviews/ch42-independent-narrow.mjs
node tools/audit-chapter.mjs ch42
```

[独立运行结果](./ch42-independent-check-results.json)使用作者`check_effect.py`中实际的`executescript` DDL，未重建更强的审阅版schema；直接调用其`apply`，SQL仍从原`effect.pseudo`读取。初始账户eastern=731、western=19，scope含Unicode字符，事件使用invoice-0091、capture-0092等新身份。

- 正常+同身份重放只加31一次；同身份换账户或delta均报IDENTITY_CONFLICT，任何表不改变；另一个可信effect scope可代表独立义务。
- 分别把scope、event、account设为NULL、空、空白、带首尾空白或非字符串，全部在写入前拒绝。直接绕过handler向作者原inbox/ledger插NULL身份也被NOT NULL挡住，空/空白scope被CHECK挡住。确认的不只是“复合PK会唯一”。
- 在余额UPDATE上加审阅用触发器，使错误发生在inbox、ledger已写之后：三者完整回滚。缺失目标账户也不留去重或账本残片。
- 两连接以Barrier同时处理parallel-0095，双方均得到APPLIED，但western只加64一次。
- 子进程调用原`apply(..., fault='after_commit')`，真实COMMIT后`os._exit(42)`、没有发送回执；原capture-0092重放不再加53，所有表快照不变。

Java17以`--release 17`编译原`Resilience.java`和[新探针](./ch42-independent-Probe.java)，产物放临时目录：

- fetched=`[204,207,211,401]`、batchNext=1000、generation=13。211先完成不能提交；204完成可到207；generation12的通知无效；全部完成才到1000；revoke后无候选位点。验证的是实际拉取前缀，不是整数连续性或最大完成offset。
- A舱cap2的两份真实本地I/O分别让调用方超时，两个许可仍被占用，第三份A拒绝；独立B舱仍返回。真实结束后准确归还2份许可。已过deadline的调用不开始I/O，也不丢许可。
- 另阻塞JDK的CF超时触发线程，确保迟调度worker获准运行时Future尚未完成、但50ms原deadline已经过去。worker自己的deadline检查直接给TimeoutException，I/O启动计数0，许可准确归还1。此fixture区别于单纯等待Future先超时再放行worker。

## 重试、排空与来源复查

[合同与算式结果](./ch42-independent-contract-results.json)明确是伪代码检查/人工轨迹，未冒充实际重试调度器或Kubernetes集群试验。

新deadline轨迹：总deadline=800ms，唤醒450ms、临发开销15ms时还剩335ms，250+50后在765ms预算内结束；晚醒550ms只剩250ms，应先停；恰剩300ms但取token等又耗1ms时，第二道检查归还未启动permit并停。额外流量token保守不退，仍不能使未知写变得幂等。

排空复查：preStop与TERM进入同一幂等任务，在HTTP准入同一锁内关门并固定一次monotonic cutoff；TERM不能续期。端点传播与本地退出并行，迟到流量靠本地门拒绝。poll线程继续维护paused消费者，只有效果持久回执才能完成记录，且只提交仍归属的安全前缀。截止、revoke或commit未知不会把未完成记录标done；新owner以原scope/event重放。close/exit必须使用预留预算，SIGKILL或节点隔离仍可能留下未决副作用。

独立重新打开了Kafka4.1 Javadoc/Design、SQLite事务/NULL主键说明、Java17 CF、Kubernetes终止流程与调度/探针文档，支持范围列在 [sources](./ch42-independent-sources.json)。其中Kafka明确offset可有空洞，提交应带next位置及leader epoch；SQLite明确复合身份列需显式NOT NULL；Kubernetes明确preStop计入宽限、端点更新并行、过期可强停。未把这些文档当成生产适配器已经正确实现的证明。

主要复算全部成立：324,000积压、净600/s排空540s；全天载荷模型2.17728TB；时间预算750≤800ms；均值在途8→200、cap20/2s=10/s；三层三次为27倍，一层10%额外预算为110/s；8×3=24探针；Ready容量750→500/s，缺口100/s；同预算独立节点N−1需4份。

## 图与真实页面

独立渲染并实际打开D1/D3/D5/D7完整双主题接触表：6+5+6+6=23帧，两主题共46画面，逐帧检查标签/边界/连线/状态。D1效果提交再推进来源、D3净排空、D5本地I/O许可、D7Scheduler/API/kubelet角色和Ready边界均与代码正文一致，未发现遮字、线穿标签或裁切。另打开D2/D4/D6终帧核回程、DLQ与三态含义。

真实320/390/768/1440×两主题×zh/en/both的24布局通过，展开内容后无整页横溢出；5段代码复制、播放、键盘翻帧、闪卡与已读/主题/语言持久化通过。D1/D3/D5/D7在320/390的横向滚动均可到两端，实际打开了代表性的窄屏左右视图及代码截图。这些布局检查与上述图内目视分别记录。

证据：[browser](./ch42-independent-browser-results.json)、[frames](./ch42-independent-frames.json)、[narrow](./ch42-independent-narrow-results.json)；截图在`screenshots/ch42-independent-{frames,layouts,narrow}/`。原7组40帧、ID和帧序保留。

## 结论的范围

已验证本地数据库原子性和Java局部生命周期、来源与算式及页面交互；未验证真实Kafka再均衡/leader epoch提交、远端HTTP取消、生产重试预算控制器、Kubernetes端点传播或硬件掉电。正文已显式保留这些适配合同，没有以进程锁或本地测试冒充分布式保证。

最后源码哈希与浏览器/帧/窄屏证据一致，开放问题为空，可以交主代理验收。
