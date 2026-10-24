# Ch39 · 交叉独立复核

2026-10-24。复核者为Ch38作者，GPT-6.1-Sol (`gpt-6.1-sol`) + Max (`max`)，不是Ch39作者，未另派agent。
**独立复核通过：实施期旧drain代次P1已用新输入独立关闭；本次发现的D3标签遮线P2已由原作者修复并独立关闭。无剩余已知P0/P1或阻读P2。** 主代理仍负责批次最终验收。

## 范围与源码签署

完整阅读当前章节、3段Java摘录与完整类、README、作者测试、14张中英网格闪卡、全部7组37帧；核对请求/回复、生命周期、授权/幂等失败条件与中英文对应。只写 `ch39-independent-*` / 本报告及专属截图目录，没有修改章节、作者示例、共享文件或PLAN。

[初始5份源码哈希](ch39-independent-source-before.json)保留原页面 `159e446e8475ae89990dbd8a32a28d3b0e5d05597816993642a053e92b70f9ee`。
发现P2后原作者改标签；[修后阶段](ch39-independent-source-after-label-fix.json)和[最终5份源码签署](ch39-independent-source-after.json)均为当前：

`chapters/ch39.html` → `59e9e8abbb166377636ff8d396b6a39df5996ac9d05b59589da5e2cd61d73a7c`

其余 `LoadBalancing.java` / `LoadBalancingTest.java` / README / sync 的4份哈希全程未变；没有覆盖初始before假称整次复核无修改。最终12项命令期间5份源码前后相同，最终浏览器/数字/渲染记录都核对当前HTML。

## 独立正常路径与关键反例

正常路径从Client→L7→所选App→Session authority，再逐跳返回。READY/healthy只是可陈旧候选快照；P2C只比较两个不同候选的入口观测attempt，不能发放全局资源额度。所有入口在选中App的同一Gate准入，再启动handler；真实完成只释放自己的permit一次。会话缺席/过期与查会话不可用分开，敏感写仍需实际权威版本边界。

[独立Java17新输入](ch39-independent-GateProbe.java)实际 **53项断言**，详见[结果](ch39-independent-runtime-results.json)与[完整输出](ch39-independent-java-output.txt)：

- 过滤READY+healthy后再抽样，检查随机上下界 `3,2`；三候选只选实际抽中的两个，不伪装全局最小。WARMING/DRAINING/UNHEALTHY或不健康目标排除，无目标返回null，未沿用Envoy panic回退。
- **旧drain P1独立关闭**：新Gate102持有当前工作，旧101命令被拒，102仍可准入；Gate201已DRAINING/revision73，旧200同revision命令仍在幂等返回前被拒。新门的当前permits未被清除或误关。
- 独立20个入口线程争同一App最后3个额度，恰好3者成功；相同陈旧观测不能绕过App权威门。真实handler线程保持执行时，另一次准入仍被拒；只有该线程真实结束调用finish才归还。
- 同revision重复drain保留原截止；不同revision不能重启生命周期。错误代次/版本ACK拒绝；ACK+真实归零才CLEAN_EXIT；到原截止仍有工作则FORCE_REQUIRED，active保持不变。零active但没ACK仍不能提前干净退出。
- 旧ready/unhealthy/ACK与外Gate完成回调不改变新Gate；UNHEALTHY/DRAINING不会由迟到成功probe复活。重复finish不释放另一笔仍活跃工作。
- 独立真实线程阻塞在实现锁上，推进时钟后分别验证准入过期、drain相对预算从锁后开始、pollDrain跨截止；另验负tick、正tick与有符号环绕下的五组合法相对deadline。所有距离遵守README `<2^62` 契约，未将原始nanoTime跨机器传输。

这些是本地实现不变量测试，不是53次网络/分布式实验。接口不能自行验证探测、预热、真实业务完成或all-ingress ACK；这些明确由外部可信适配器保证。Gate保护一台App incarnation，不能通过同进程另建Gate抹掉旧工作；共享Store额度仍须另管。

另单列实际执行作者 **39项**测试，没有计入53项独立新输入。[作者runner输出](ch39-independent-author-runner-output.txt)。
“DB提交→丢201→换App”额外手推明确保持UNKNOWN，原身份查结果/按持久防重契约重放；未运行真实业务数据库，也没用LB重试冒充幂等事务。

## 数字与来源

[36处独立复算](ch39-independent-numeric-results.json)由独立脚本计算，未引用作者numeric结果作为答案：

- 1,000×60%=600/s；正常最少10台；12台独立机器失1台剩6,600/s，规划利用率约90.9%。发布停1台再失1台只剩6,000/s；三机各4实例失1机只剩4,800/s，缺1,200/s或原始到达20%。10%原始请求各多一次attempt恰好6,600/s。
- 一条流1,200/1,000=120%，两台合计2,000不能拆单流。Little均值6,000×0.05=300不证明p99，也不能直接设并发limit。
- 12 MB/s请求、120 MB/s响应=960 Mb/s；代理每个方向约132 MB/s=1.056 Gb/s，双向I/O不是单链路2.112 Gb/s要求。会话裸记录256 MB/份、两份512 MB。
- 固定起始探测节拍2s×2+0.3s超时+0.2s传播=4.5s；500×4.5=2,250是均匀稳态暴露估计，非严格随机路由上界或最终用户失败数。
- 65,537×4=262,148 B≈256.004 KiB；两份524,296 B≈512.008 KiB；1,000表262.148 MB/份。槽宽为教学假设，不借Java对象布局声称实际内存。

独立重新打开/查找全部13个一手引用，支持点与版本适用范围见 [sources](ch39-independent-sources.json)：
[HTTP/2 §6.8](https://www.rfc-editor.org/rfc/rfc9113.html#section-6.8)确认GOAWAY的可能处理边界，较大stream ID可重试，≤边界不凭缺回复推断未执行；[HTTP语义§9.2.2](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2)支持代理重试限制。
[Envoy P2C](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/load_balancers)、[panic](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/panic_threshold)和[drain](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/operations/draining)分别支持等权两候选/非等权分支、panic例外、默认shutdown与协议相关排空。本次取到的latest页标头为1.41.0-dev-7d393e，未把本地Gate当完整Envoy实现。
[Kubernetes终止](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-termination)中kubelet退出与EndpointSlice变更并行；从其异步行为及接口范围推得本章自定义all-relevant-ingress ACK需额外协议，未称K8s默认已有该屏障。
[Maglev原论文](https://www.usenix.org/system/files/conference/nsdi16/nsdi16-paper-eisenbud.pdf)核对DSR、仅过期ConnTrack逐出与§5.3默认M；[Envoy Maglev](https://www.envoyproxy.io/docs/envoy/latest/api-v3/extensions/load_balancing_policies/maglev/v3/maglev.proto)明确minimal disruption非绝对保证。[Redis复制](https://redis.io/docs/latest/operate/oss_and_stack/management/replication/)核对WAIT不能消除提升丢撤销风险；gRPC客户端选择、OWASP会话轮换与Karger的Web-cache原始动机也分别抽核。

## 发现、修复与逐图确认

本次新增 **1项P2家族**：D3 s4–s6 `load-based` (376,162) 被x385/x395/x415竖线穿过，新增y88水平线又穿过旧 `sticky` (438,92)。作者未改图形路径与字号，而将sticky全组稳定放到(438,116)、load-based放到(438,74)。初始finding及3帧SVG保留在 [initial-finding](ch39-independent-initial-finding.json)；初始原尺寸截图也保留，未被最终图覆盖。

独立先打开14张两主题全帧接触表及原尺寸D3s4，完整看过37帧两主题。修后重新渲染74幅原尺寸画面，实际再打开D3两张全6帧接触表，确认新标签位于独立留白，无缩字、节点跳动或线路穿字；另看真实390px双语中段/右端，P2关闭。D4灰RR是之前策略，不能绕过准入；D5的close+remove与ACK+idle分开，修复→新incarnation WARMING→READY与代码“不复活旧Gate”一致。STOPPED由外部supervisor观察，代码没有把FORCE_REQUIRED等同物理退出。

[最终目视和哈希](ch39-independent-visual-review.json)记录 **27张实际打开图像**。修前后74幅单帧PNG中**62幅逐字节相同、12幅仅D3变化**，因此已看过的其余31帧两主题与最终画面相同，没有借新source哈希复用不同图像结论。全部原7组37帧、74动画ID保留。[最终帧清单](ch39-independent-final-frames.json)含当前SVG哈希。

## 真实浏览器与最终检查

修前 [initial-browser](ch39-independent-initial-browser-results.json)单独保留；其结构/交互通过不代表当时D3标签正确。
修后 [最终浏览器](ch39-independent-browser-results.json)重新执行320/390/768/1440×两主题×zh/en/both **24组合**，实际innerWidth与文档scrollWidth一致，展开details无整页横溢。通过浏览器实际按钮处理器到达全部37帧，共 **888次帧定位**，另有真实指针/键盘前后、播放/速度/循环、表格/代码/图内横滚、闪卡与进度/设置持久化。三段实际剪贴板逐字一致，资源/页面错误0。这个数是控制器状态验证，不冒称逐幅截图新增目视次数。

独立实看最终10张窄屏章节头/排空代码/复制头/闪卡/图中右端截图；[焦点补验](ch39-independent-focus-results.json)包含真实390px D3左中右与320px排空代码头。Copy单行且可达；320双语公共顶栏较高换行沿用原UI，不影响本章阅读。图只在自己的容器内滚动，未用CLI裁切冒充手机。

[12项最终命令及源码前后](ch39-independent-checks.json) / [完整输出](ch39-independent-checks.txt)全部通过：全站check、本章audit、3段同源、36复算、OracleJava17 `--release17`编译与53独立/39作者两套runner、3份独立浏览脚本语法及diff检查。最终源码签署、浏览器、数字与全帧哈希一致。

## 未做事项

没有真实Envoy/Redis/Kubernetes部署、服务发现或ACK网络实现、HTTP/2/GOAWAY网络实验、Session Store/业务幂等数据库、敏感写撤销协议、生产负载/p99/故障恢复可用性证明。探测/身份/预热、可信协调器确认、物理完成/退出、跨机器预算转换和业务持久回执仍是章节显式外部前提。没有将本地锁或53项断言扩成分布式容量保证。
