# Ch02 独立交叉复核

2026-10-22；复核者 ch03-author（Astra High），非 Ch02 作者。结论：**发现1项P1，作者修正后已关闭；未发现未关闭P0/P1或阻碍阅读的P2，独立复核通过。** 未修改Ch02正文、示例或共享文件；仅新增本复核记录和专属证据。

最终审阅SHA256：

- `chapters/ch02.html`：`a58aa61d94271c4275cf02f2a8a57f8b45b308c62b47cae3deafd863928b7348`
- `examples/ch02/ReadPath.java`：`d4da4a8f06f5315e9ef69a786e5550d6ba4c3d4a69e05dab7e28fa2993d11589`

## 问题与返修

**R02-01 · P1 · 已关闭。** 原正文把`Budget.admit(): boolean`称为共享“速率与并发准入”。接口与所有返回/异常路径没有归还并发permit的生命周期，因此不能直接表达这个并发保证。已向作者及主代理报告。作者将中英文均缩小为共享速率准入，另明确真实Origin适配器通过有界执行/连接池管理并发并在finally释放，boolean不是并发permit。复核重新搜索全文及源代码说明，未残留混合承诺；示例的速率分支不需要修改。

## 独立技术判断

完整阅读双语正文、三个代码片段、所有23帧SVG title/desc/文字/图注与8张闪卡，未以作者报告代替内容审阅。

- **普通路径**：Cache miss消耗一次回源预算→副本返回旧快照→带剩余TTL回填→再次命中不访问原点；成功缓存命中不续期。
- **最关键反例**：缓存中h1=8，回执要求(h1,9)。即使`strong=false`，非空minPos也必须先分流绕缓存。h1=9成功；候选h2=100但h1=8或完全缺h1均不能满足回执。代码会抛Unavailable，不降级到旧缓存。新主只有保留原历史所需连续前缀才可满足；全局最新/线性一致不在此承诺内。
- **快照边界**：当前主库身份不等于查询快照覆盖已确认提交；文中要求新快照及其前缀证据，不复用旧长事务快照。`freshPrimary`尚为适配器合同，测试不冒充PostgreSQL实际证明。own-post合并说明数据库apply不等于异步Feed物化已完成。
- **TTL跨进程**：只传持续时间，缓存服务自己的时钟决定失效；App时钟起点偏移不会进入缓存截止值。慢加载耗尽TTL时不回填。网络写缓存延时、副本持续落后和失效/回填重排仍可能导致旧值，正文明确没有从DB提交开始的硬陈旧上限。
- **失效并发**：R拿旧值→W提交删除→R写回旧值仍可在弱读命中，这符合陈述；强读绕缓存避免依赖该键。lease是额外机制，不由普通GET/SET自动获得，并且不证明副本内容新鲜。
- **outbox**：Post/Outbox/RequestReceipt同本地事务；broker不在事务内。relay发布获ACK后、标记delivered前崩溃会重复投递；worker须用下游(eventId,followerId)幂等键，单纯本地seen标记不能原子保护外部发送。提交响应丢失保持同requestKey恢复，不能当成回滚。
- **切主**：timeout不能证明旧主死亡，先停写/有效fence再查持久前缀并apply。接受RPO只影响允许丢失的尾部，不授权双主；零已确认丢失要求成功前合格独立副本持久确认及提升时的覆盖证明。条件缺失时停写，与图E2/E5一致。

## 独立复算

| 项目 | 复算与判断 |
|---|---|
| 主请求量 | 1M×20/86400×10=2314.8148峰值；95%=2199.0741读、5%=115.7407写；后文统一取2199/116成立 |
| CPU与N−1 | 峰值×.004=9.25926核；单机8×.6=4.8，正常ceil=2，失一台仍同预算需要3 |
| 原点读 | (2199−116)×.1+116=324.3；70%命中为740.9，全Cache故障2199；强读不可同时算进缓存MISS分母 |
| 存储 | 5M注册×20行×2000B=200GB每份；两份400GB；每台2TB比较每份200GB |
| 通知 | 20×80ms=1.6s；3×80=240ms仍非整体p99证据 |
| 改写入场景 | 1M×50/86400×10≈5787/s；ceil(5787/800)=8理想前台下界；额外20等成本扇出事务时5787×21=121527，ceil(/800)=152 |
| 十倍基础流量 | 20830×.1+1160=3243回源/s；CPU约92.6核；没有漏乘强读 |

## 独立运行与目视证据

1. 用本机JDK21.0.2执行`javac --release 17 -d /tmp/ch02-independent-java examples/ch02/ReadPath.java`，再运行ReadPath，作者全部正常/故障/TTL用例PASS。声明为Java17目标编译，并非JDK17运行时压测。
2. 额外编写并运行[独立检查源](./screenshots/ch02-independent/ReadPathIndependent.java)：验证命中不续期、`strong=false`但有floor仍绕缓存、缺祖先历史拒绝、缓存put失败不抹掉成功弱读、旧值回填仍为允许的弱读反例。全部PASS。它检查合同分支，不验证真实分布式实现。
3. 逐字比较页面ReadPath代码与源`BEGIN PAGE`片段，PASS。`node tools/audit-chapter.mjs ch02` PASS，5组23帧、3代码块；数量不替代技术审阅。
4. 用[独立Playwright脚本](./screenshots/ch02-independent/browser.mjs)访问真实本地服务，390/1440×两主题×both共4布局；innerWidth/scrollWidth均为指定宽度；B/E每组5帧全部翻看，两主题桌面20张单帧截图与四张联系表已目视，390两主题两个组左右横滚截图已查看。无CLI裁切冒充手机。证据：[结果](./screenshots/ch02-independent/results.json)、[B浅色全帧](./screenshots/ch02-independent/parchment-deck2-contact.png)、[E深色全帧](./screenshots/ch02-independent/dracula-deck5-contact.png)、[390深色右侧](./screenshots/ch02-independent/dracula-390-d5-right.png)。
5. 另查看作者真实浏览器A2/C3/D4两主题单帧截图，独立核对拆库、outbox回路和分片图。新B3/B5分流说明清楚，E2/E5先隔离再提升的文字不压线；结构、图注、中英和闪卡相符。

## 抽核一手来源

- [PostgreSQL17 Transaction Isolation](https://www.postgresql.org/docs/17/transaction-iso.html)：Read Committed语句快照、Repeatable Read首个非事务控制语句快照；支持“不能先证明apply却复用旧事务快照”的边界。
- [PostgreSQL17 Failover](https://www.postgresql.org/docs/17/warm-standby-failover.html)：旧主恢复需防双主、failover工具不由数据库自动提供。
- [synchronous_commit](https://www.postgresql.org/docs/17/runtime-config-wal.html#GUC-SYNCHRONOUS-COMMIT)：on/remote_apply/remote_write的flush/apply/OS崩溃差异，以及同步副本配置前提。
- [MySQL8.4半同步](https://dev.mysql.com/doc/refman/8.4/en/replication-semisync.html)：relay log刷盘后ACK、超时会退回异步，正文未把半同步等同永不丢写。
- [NSDI2013原论文§3.2.1](https://www.usenix.org/system/files/conference/nsdi13/nsdi13-final170_update.pdf)：每键lease、删除使令牌失效、减少旧回填和惊群；不是所有memcached默认接口保证。
- [AWS Transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)：业务行与outbox同库事务、异步发布与重复消息处理。
- Dean2009原PDF第24页在本批Ch03调研中已从Cornell原地址成功获取并抽取，0.5ms是历史同机房RTT，不是SQL执行时间。

## 限制

独立检查未启动真实DB/Redis/队列，未做压测、故障注入、跨地域时钟或生产级安全验证；已明确示例只是可运行契约模型。24组合及全站公共交互有作者/主代理的另行证据，本记录只声明以上独立执行的4布局和核心图组。小屏右移整张slide后图注也随容器横移，需要回左读图注，这是现有公共播放器行为；本轮无新增整页溢出或阻断阅读，未改共享UI。未提交、未部署。
