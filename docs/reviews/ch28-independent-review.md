# Ch28 配置中心 · 独立复核

2026-10-24；GPT-6.1-Sol (`gpt-6.1-sol`) + Max (`max`)。复核者为Ch29作者，未写Ch28页面、示例或作者证据。作者正式冻结后核对最终HTML与完整`examples/ch28/`，结论：**通过；本次发现的1项P1与1项P2已由原作者修复并独立关闭，无未关闭P0/P1或阻碍阅读P2。**

最终HTML SHA256：`d6ae3dd76e33ba7fef42b862a5b808e56722f622c755cb8905a1610954bbab20`。ConfigClient SHA256：`d00d42a1fc3509174da330bc577e43e6bbab44e9b109033282c65d9130dfc7a5`。[最终一致性摘要](ch28-independent-final-results.json)与完整[before/after字典](ch28-independent-source-hashes.json)包括页面和全部示例；审查过程中变化仅作者的页面、ConfigClient、作者测试与README。

## 实际发现与关闭

| 级别 | 独立反例/问题 | 原作者修复与独立重验 |
|---|---|---|
| P1 · 时钟故障后旧请求恢复资格 | 实跑旧ConfigClient：t0确认；t1000发pending；t1100 clock不可信，gate拒绝并清proof；t1200恢复trusted同era，旧pending却confirmed=true，重新allow。另一个轨迹proof从1000起，已经观察t20000后回拨到1500（仍大于proof start），gate仍true。 | 锁内集中observeClock，失信、era变化或相对lastClock回拨同时清proof和pending；confirmed先观察再比较pending，gate先观察再捕获视图。[原始6探针](ch28-independent-initial-clock-results.json)保留3次失败断言；完全相同输入的[最终6探针](ch28-independent-clock-final-results.json)全部通过。新的请求可恢复，普通快照保留，原请求不能复活。 |
| P2 · D5F4原则旁注与F5回退次序 | F4文字提5%→20%且说规则推进g，但图还在g42/5%；下一帧g43回退，读者可能理解已经扩围却未增加代次。 | F4中英图注明确“本帧仍g42/5%，5→20只是原则旁注；实际扩围需新g；下一帧直接g42→g43/R17”。逐帧实际页面两主题及390左右/中间滚动核对，F5两组确为g43/R17，P2关闭。 |

初始失败不是作者自检结论的复述；[原始独立Java探针](ch28-independent-initial-Probe.java)与结果对应原ConfigClient哈希`ce1a84c7b4eac1786aa5699d510fc1582a692c2391b969cd51f8246aa7ef551b`。最终结论在作者正式冻结通知后绑定当前hash。

## 独立路径与新输入

运行：`PYTHONDONTWRITEBYTECODE=1 python3 docs/reviews/ch28-independent-probes.py`。[实际结果](ch28-independent-probe-results.json)：**35项SQLite/跨语检查、324项Java断言、原6条时钟探针及23项数值复算通过**。直接调用作者实际Store/ConfigClient/WatchHub/Cohort，而非复制其实现或仅重跑作者20,167断言。

- 发布700→701正常；另一编辑推进702后，丢201原key仍返回原701，且不倒退Current。重排JSON键仍同意图；同key改percent/reason/salt/expected_g/cluster冲突；历史回执也重新鉴权。
- 两个真实SQLite连接相同expected_g/不同key只有一胜者；相同key/相同语义得到同一704；相同key/不同语义只一发布，另一方是Conflict。四个事务注入点逐一确认Release/Current/Publication/Receipt/ChangeLog整体回滚。
- 全量快照到重新watch之间发生新发布可查到707；其间再裁剪日志，原cursor得到RESET而非跳过；重拉最新后exact floor/current可停等，ahead请求SYNC_REQUIRED。Java另跑40次实际线程登记/relay竞争，以及前后登记、停等中compaction、timeout清理。
- SDK捕获的旧bundle在后续swap后仍内部一致；同release但更大g也清proof。旧nonce/超时响应不能续权；1999ms响应可接收，2000ms拒绝；整包新视图、同g新身份选择、旧身份慢响应、同g摘要分叉、g更大选回旧内容、缺失allow、重启、长暂停计时和era变化均按契约处理。
- 新输入使用`finance/prod/risk`、g701+、新的实例/中文salt。固定salt小cohort在扩围后仍包含；cluster与percentage用AND。独立Python对UTF-8长度前缀/SHA256取无符号前64位向量交叉核对，没有假设取模后不同输入一定不同桶。

核心算术独立复算：333.333**批请求/s** × 每批10个namespace =3,333.333正文包/s；400KB/批，500批/s=200MB/s；总冷拉4GB、30秒平均133.333MB/s≈1.067Gb/s。每节点3,500计划连接，正常3、同预算N−1四节点，剩余10,500。500接收者/0.25s=2,000接收者/s，20批保守5秒，与500十包响应/s单位不同。50次全量发布/s需20GB/s=160Gb/s。其余数字在结果JSON列出，均为教学假设而非测得吞吐。

## 页面、图和事实

[独立浏览器](ch28-independent-browser-results.json)：390/1440 × 两主题 × zh/en/both共**12组合**，实际innerWidth=scrollWidth，展开details仍无整页横溢；124次翻帧、6段默认展开实现代码逐字复制、播放/键盘/倍速/循环、闪卡与设置/已读持久化通过，页面/资源错误0。折叠HTTP契约作为第7段标识与同源检查通过，未把6次默认展开复制说成已复制7段。作者及主代理另覆盖320/768等布局。

另外用独立真实1440页面逐帧拍摄D5/D6全部10帧×两主题，共20帧，已实际目视；未只用单独SVG或几何计数判图。390对两组全部帧导航并左右/中间滚动共60位置，目视F4/F5密集/故障帧的24位置接触表。节点/标签/连线可读、帧序连贯，图在自身容器横滚，正文不横溢。

- [D5全组浅色实际页面](screenshots/ch28-independent/d5-parchment-desktop-contact.png)、[D5全组深色](screenshots/ch28-independent/d5-dracula-desktop-contact.png)。
- [D6全组深色](screenshots/ch28-independent/d6-dracula-desktop-contact.png)、[D5窄屏F4/F5](screenshots/ch28-independent/d5-parchment-narrow-contact.png)、[D6窄屏F4/F5](screenshots/ch28-independent/d6-dracula-narrow-contact.png)。
- [实际帧/图注结果](ch28-independent-frames-results.json)、[静态/同源/audit/diff检查](ch28-independent-static-results.json)均对应最终HTML；原6组31帧ID与顺序符合授权前基线。

抽核[7类一手机制与SQLite适配说明](ch28-independent-sources.md)：ZooKeeper standard/persistent区别、etcd KV与watch保证、Raft当前任期提交、PG行锁、Apollo 60秒/304与5分钟对账、Java nanoTime同JVM边界。正文、英文、闪卡、图和代码关于提交/应用、同g身份变化、证明起点、普通保留与危险拒绝的事实一致。

## 验证边界

SQLite实际执行本地事务和多连接，但写锁比PG行锁更粗；没有运行PG、Raft/etcd集群、复制切主、磁盘断电、真实HTTP/认证/nonce、OS休眠或生产压测。Java只验证一个进程的状态转换/线程竞争；trusted authority、已验证prepared View与暂停计时/恢复hook仍是明确适配契约。allow只授权动作入场，不原子覆盖之后的远程副作用或长任务。以上限制没有被包装成“生产安全已证明”。
