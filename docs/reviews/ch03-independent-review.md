# Ch03 独立复核

复核日期：2026-10-22。复核者：Ch05 作者，Astra / gpt-6-astra，High。复核范围为只读 Ch03 页面、Java、图、双语/闪卡与一手来源；未修改 Ch03 HTML 或示例。

复核起点：`chapters/ch03.html` SHA256 `db6a313778115fa0913300b1a64ae8b3df094dfe84a80714288f72de9a70ef3b`；Java SHA256 `6f78cbc169de40342fa5fb92b7835a16453cd9bed60ef0a204be0b60460c5c54`。这已经包含 D5 全组 separate time SLI 的澄清。

## 发现与结论

- **P0：无。P1：无。** 正常容量、失败容量、带宽/字节、留存/副本、延迟与错误预算均独立复算，没有复用作者报告作为证明。
- **P2-1：D1S3 标签 `comfortable 1,000/s`。** 新正文清楚区分基准1000与60%计划预算600，旧标签仍把1000称为comfortable。要求最小改成 `baseline 1,000/s`，不改坐标或结构。
- **P2-2：D1S5 SVG title 的旧 headroom 结论。** `Why 60 percent: one instance down still leaves headroom` 不够准确地对应新图注的“故障后超60%预算”。要求改成明确预算反例的无障碍标题，保留数字、节点、线条。

以上两项已向主代理和作者报告，最终关闭状态见文末返修复验。

## 独立推演与复算

### 正常路径和最关键失败反例

读取完整中英文正文、26帧图注、SVG内所有数字/标签/标题，以及8张闪卡后，直接按假设重算：

1. 200M读 + 10M写，共210M日工作量；乘3/86400得到7291.666667/s；每台预算1000×60%=600/s。向上取整正常13台。
2. **13台失1台：12×600=7200 < 7291.666667，缺91.666667/s。** 仍有原始12000/s能力不等于符合60%预算。14台失1后13×600=7800满足目标。
3. 白板读6000/s得到10/11；白板等成本读写6300/s得到11/12；精确仅读6944.444444/s得到12/13。这四种口径与正文表格、图前警示、图注、代码及闪卡一致。
4. 改写成本为读的5倍，则日工作量200M+5×10M=250M，精确峰值8680.555556/s，正常15、N−1为16。这是额外独立反例，说明不能丢弃“小比例写”。

### 带宽、存储和延迟

| 复算 | 独立结果 | 对照结论 |
|---|---:|---|
| 86400/100000 | 0.864 | 白板QPS低估13.6%，不是安全余量 |
| 6000×20KB×8 | 960Mb/s | 白板响应体；未含协议开销 |
| 精确读×20KB×8 | 1.111111Gb/s | 1Gb/s标称链路已不够净荷 |
| 6000×500KB×8 | 24Gb/s | 媒体直达CDN，不算App必经流量 |
| 精确读×500KB×8×10% | 2.777778Gb/s | 90%明确为字节命中率 |
| 90个1KB命中、10个1MB miss | 请求命中90%，字节命中仅0.891972% | 额外反例证明请求命中不能直接当字节命中 |
| 10M×1000B×365 | 3.65TB | 单份恒定新增行 |
| ×3 | 10.95TB | 含主库共三份，不是主库外再加三份 |
| 10.95×1.5/0.7 | 23.464286TB | 教学放大/填充后聚合空间，仍不含备份/WAL/重建 |
| 10M×200KB×365 | 730TB | 对象单份逻辑量，冗余独立估 |
| 20+.5+.5 | 21ms | 串行命中路径，20ms已是RTT |
| 21+.5+10 | 31.5ms | 图中约32ms，未把100ns当缓存RPC全耗时 |
| 300/(100×.6) | 5盘 | 图中3盘是100%忙的理论下界 |
| 20,000B×8/1Gb/s | .16ms | 发送净荷时间不是RTT/完整延迟 |

串行分支预算、并行取最长分支、不能直接相加各服务p99的表述合理；历史机械盘/网络数值明确标成2009年数量级，不是今日性能承诺。副本图的ACK没有被正文误称为三副本持久化。

### 错误预算与短链交叉核验

- 200M×.001=200000错误/日；四个9为20000。SLO为合格Feed读请求比例，不混写请求或总调用量。
- 独立Cache错误时，正常miss与错误fallback合计6000×(.001+.999×.05)=305.7/s；约306为保守口算。不能用6/s单独比较100/s。
- Cache全挂、无合格旧值、回源100/s都成功时：200000/5900=33.898305s；精确读峰值下200000/(6944.444444−100)=29.220779s。它是可用完整日预算下的速率推演，不是恢复保证。
- 三个独立串行依赖：.9995³×100=99.8500749875%；互斥失败应累加错误率得到99.85%，并非同一统计假设。
- 365天时间指标的99.9%=8.76小时，99.99%=52.56分钟；D5全组现标 `separate time SLI`，图注/正文/闪卡均不再把请求失败换算为实际停机。
- Ch09短链：100M×10/86400=11574.074074/s，取11600；正常20、N−1为21，19×600=11400失败。额外115.740741写/s仍不跨台数阈值；响应46.4Mb/s，三份记录547.5GB。与已验收Ch09口径一致。

## Java 独立验证

实际命令：

```sh
javac --release 17 -d /tmp/ch03-independent-java examples/ch03/CapacityEstimate.java
java -cp /tmp/ch03-independent-java CapacityEstimate
```

JDK21.0.2、Java17目标编译；输出原10个有效case、7个拒绝输入和N−1反例全部PASS。阅读核心代码后确认使用精确分数乘法、`divideAndRemainder`取整，最后`intValueExact`不会悄悄截断。零需求返回0的特殊合同和不预设热池已在双语正文声明。

另用JShell反射调用实际方法（未另写镜像算法）：

- `instances(250000000,3,1000,60,1) = 16`，独立检验5倍写成本。
- `instances(Long.MAX_VALUE,Integer.MAX_VALUE,Long.MAX_VALUE,100,1) = 24857`，中间乘积超过long仍能得到可表示的结果，没有提前溢出。

独立从页面提取code并与Java的BEGIN PAGE/END PAGE去缩进片段逐字比较，通过。代码只证明算术，未当作负载测试、故障转移能力或生产SLO证明。

## 一手来源抽核

2026-10-22独立浏览并定位：

- [NIST binary prefixes](https://physics.nist.gov/cuu/Units/binary.html)：二进制前缀、GiB/GB、1B=8bit。
- [Google SRE Handling Overload](https://sre.google/sre-book/handling-overload/) 的QPS局限段：不同请求成本、CPU/资源衡量；不为教学1000或60%背书。
- [Dean LADIS 2009原始PDF](https://www.cs.cornell.edu/projects/ladis2009/talks/dean-keynote-ladis2009.pdf) 第24页：100ns内存、500000ns同机房RTT、10000000ns寻道、150000000ns CA→NL→CA。此次浏览工具直接读取成功，不借第三方转载。
- [Service Level Objectives](https://sre.google/sre-book/service-level-objectives/)：SLI/SLO/SLA及后果条款。
- [Implementing SLOs](https://sre.google/workbook/implementing-slos/)：共同依赖/失败域破坏独立性，不能简单靠两区多得几个9。
- [Availability Table](https://sre.google/sre-book/availability-table/)：8.76小时与52.6分钟取整、变化负载下请求比例与停机长度的差别。

这些来源支持定义和边界；所有业务量/容量仍标为教学假设，计算由本次独立复算完成。

## 图、语言和真实视口

独立读取全部SVG文字，并用Playwright Chrome重新渲染D1和D5全部帧，两主题桌面20张SVG截图；390px分别向图左/右滚动查看，实际 `innerWidth=scrollWidth=390`，1440px亦相等。截图见[本次独立目录](screenshots/ch03-independent/)与[布局记录](screenshots/ch03-independent/results.json)。手机图提示横滚，代码独立滚动；图注随slide滚动，回到左侧可读，没有整页横向溢出。没有用CLI裁切冒充手机。

目视证据：[D1S5浅色](screenshots/ch03-independent/parchment-d1s5.png)、[D1S5深色](screenshots/ch03-independent/dracula-d1s5.png)、[D5S1独立指标](screenshots/ch03-independent/parchment-d5s1.png)、[D5S4回源深色](screenshots/ch03-independent/dracula-d5s4.png)、[D5S5降级](screenshots/ch03-independent/parchment-d5s5.png)、[手机左侧和图注](screenshots/ch03-independent/390-parchment-d5s4-left.png)、[手机右侧](screenshots/ch03-independent/390-dracula-d5s4-right.png)、[手机英文代码](screenshots/ch03-independent/390-dracula-code-en.png)。文字与箭头/节点没有新重叠；新D5顶部指标文字完整位于画布内。

独立对26个SVG剥除title/desc/text内容后，与本批基线逐字比较所有结构/属性，全部一致，帧数5/5/5/6/5不变。正文中英、图注和闪卡逐项匹配。没有重跑所有公共交互；主代理的72组合整合结果作为补充，未代替上述独立技术审阅。

## 限制与返修复验

本次未进行生产压测、跨区真实故障或DB持久性测试；单机容量、均匀负载、等请求成本与分布独立性均是明示假设。只评估当前静态教学内容与可运行算术，不承诺真实系统达到该台数或SLO。

作者已完成两项最小修订：D1S3 为 `baseline 1,000/s` 且 desc 同步区分1000基准/600预算；D1S5 title 为 `One failure exceeds the 60 percent budget`。复核者重新读取并核对最终 SHA `f9f0d5851b7749b6f37f58b2877a35fdd437a92be694d8bb1cbe08156a97fa02`，26帧几何/属性比较仍通过；D1S3两主题重新截图并目视，标签清楚且未遮挡：[淡绿](screenshots/ch03-independent/parchment-d1s3-final.png)、[深色](screenshots/ch03-independent/dracula-d1s3-final.png)。代码未改，无须重复不相关测试。

**独立复核结论：通过。P0/P1为0，P2-1/P2-2均关闭，无未解决阻断项。** 本报告仅确认以上最终SHA及列出的验证范围；未提交或部署。
