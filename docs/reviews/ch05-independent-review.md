# Ch05 独立复核（2026-10-22）

结论：**通过；无未关闭P0/P1，发现的3项P2均经作者修正并复验。** 审阅者为本批Ch02作者，Astra / gpt-6-astra，High；不是Ch05作者。只读Ch05站点和源码；没有写入Ch05 HTML或示例，修复由Ch05作者完成。

最终审阅HTML SHA256：`5baa07bbccca58a57694f30757bd21c5aa0c41c37e2321caf38108450799af0f`。
初始审阅SHA：`807677d984db7974416d53fbae255a6f7eda28bdf74cebf68941e30163f6e321`。

## 独立检查范围与发现

完整阅读双语正文、25帧的标题/描述/图注、Java源码、handoff伪代码与Python契约模型、全部闪卡；独立推演边界、环回、碰撞、无符号排序、成员竞争、迁移和旧Router读写。

| 编号 | 级别 | 发现与作者修正 | 复验 |
|---|---|---|---|
| R05-1 | P2 | D5S4原图注“ready后Router激活ep8”未展开代码中的提交顺序；作者图注/desc明确控制记录COMMITTED→S3 ACTIVE→发布路由 | 与handoff.pseudo的commit→activate→publish顺序相同；两语言一致，关闭 |
| R05-2 | P2 | D5S5“复制期间失败保持ep7”没有限定冻结前，可能误读为冻结后自动恢复旧服务；作者限定仅冻结前准备失败继续ep7，冻结后保持FROZEN并按plan恢复 | 与正文/失败窗口表一致，关闭 |
| R05-3 | P2 | Ketama“同容量40×4=160”说得过于绝对；真实源码含float与floorf，某些相等容量的节点数也会取成39×4 | 独立C探针n=61得到156点。作者正文/引用/闪卡改为理想同权重160，实际核对浮点取整；A4明确教学预算仍为160，关闭 |

没有发现核心路径正确性缺陷。不能把这个结论解释为真实部署迁移协议已经实现或故障实验通过。

## 代码与正常/失败轨迹

实际使用Java17编译、运行作者示例：

```sh
/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin/javac --release 17 -d /tmp/ch05-independent-classes examples/ch05/ConsistentRing.java examples/ch05/ConsistentRingTest.java
/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin/java -cp /tmp/ch05-independent-classes ConsistentRingTest
python3 examples/ch05/check-source.py
python3 examples/ch05/check-handoff.py
```

结果：25项Java检查PASS、页面同源检查PASS、17条handoff契约轨迹PASS。

另外独立编写了线性扫描oracle，使用固定种子5022生成100个50点环，比较Java二分对全体token相等输入和随机64位输入的结果；加入一个新token后检查所有改变只能去NEW owner，不能旧机互换。累计**115,000次**检查PASS。独立测试证据源：[lookup-oracle.java.txt](screenshots/ch05-independent/lookup-oracle.java.txt)。这不是复制作者测试断言，另用有序过滤的参考实现检查边界。

独立推演：

- 正常迁移：快照包含k=v1，旧主快照后写v2和删除记录；freeze与serve共享序列化guard，barrier包含这些提交；新主追平数据、删除及幂等回执后，经control commit与activate再提供v2。
- 关键竞争：旧请求在Router看到ep7后延迟到freeze后；服务端在同一事务内检查guard，FROZEN拒绝，不能凭预检放行。ep8新写成功后旧Router读S1同样被拒绝，防止旧快照成功返回。
- 两个协调者不能同时迁同段：权威plan CAS串行，绑定range/owner/epoch；本地Router expected-epoch CAS仅防进程内覆写，正文没有把它冒充跨Router一致性。
- commit→activate响应丢失的窗口允许不可用，旧源保持FROZEN；同plan恢复，不盲目解冻。已在新owner发生的写必须迁回才能回滚。
- 空环和相同/不同owner的重复token拒绝；哈希等于token归该点；Java long使用unsigned比较；单点覆盖全环，hash64(abc)=ba7816bf8f01cfea。key哈希碰撞只共址，完整key仍为存储标识。

模型明确假设持久状态与串行化，未对真实DB、控制服务、日志追平或网络分区作集成实验；这些限制在页面与作者记录中已说明。

## 数字独立复算

- 固定旧桶ID，3→4完整周期12只有3项不变，移动9/12=75%；一般n→n+1为n/(n+1)。10→11约90.91%。
- 一致性环新增期望K/(n+1)、删除期望K/n，前提为独立均匀点、同权重、旧点保持；百万key加一台约90,909，删一台100,000。
- 三点环新增25：仅(10,25]改变，整数空间15/100；份额35/15/35/15。接着删S1，S2负责(25,75]为50%。
- 六点vnode环删S1的30与95：20位置归S2、15位置归S0，最终55/45；不是所有数据交同一邻居。
- 索引100×160=16000点，16000×16B=256000B=256KB十进制；14次二分比较数量级成立，对象开销另算。
- 90,909×1KB≈90.91MB；10MB/s理想约9.09s，未包含增量与复制放大。
- 热key4000/s+其余6000/10=4600/s；故障后平均10000/9≈1111/s不保证最大节点小于1500，正文保留了该条件。
- 冷新机10000/11≈909.09；旧机未命中10000×10/11×0.05≈454.55；合计1363.64/s，约2.73倍原500。
- 预热条件454.55+909.09×(1−h)≤800，h≥0.62。文中正确限定为静态均匀请求假设，未把key比例当QPS保证。

## 一手来源抽核

独立打开并核对，未仅沿用作者报告：

- [libketama原始C源码](https://raw.githubusercontent.com/RJ/ketama/master/libketama/ketama.c)：第401–425行包含float权重、floorf、每摘要4个32位点。按原表达式编译C探针得到`n=61 equal weights: ks=39, tokens=156`；[探针源码](screenshots/ch05-independent/ketama-rounding.c.txt)支持R05-3。
- [Jump Hash论文](https://arxiv.org/pdf/1406.2294)：连续编号限制、期望迭代次数&lt;ln(n)+1；Figure2的100点0.0996996、1000点0.0315723核对一致，作者未将相对标准差当最大偏差或请求SLO。
- [Dynamo论文](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf)：128位key标识、多个token、容量权重和副本选择跳过重复物理owner与页面一致。
- [Redis Cluster规范](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/)：16384 slots、MIGRATING/IMPORTING、ASK/MOVED与页面一致；页面明确自己的冻结模型不是Redis过程的原样实现。

其余引用未逐页完整复审；这是来源抽核而非全部参考文献真实性的无条件认证。

## 浏览器与视觉证据

独立Chromium Playwright进程访问本地HTTP服务，没有操作用户浏览器。证据脚本 [browser.mjs](screenshots/ch05-independent/browser.mjs)；数据 [results.json](screenshots/ch05-independent/results.json)。

- 390和1440真实viewport × 两主题 × both，各检查D5全部5帧，共20次帧访问。
- 每次记录`innerWidth == documentElement.scrollWidth == 指定宽度`；390图可横滚到S3与右边界，无整页横溢，不用CLI裁切冒充手机。
- 两主题D5全部10幅桌面帧及390左右视图已目视。节点尺寸、生命线、请求返回箭头和最终增量标签可读，改动未导致短线挤字；新s4/s5图注复验与代码一致。
- Ch05其他组的全主题逐帧作者检查与主代理72组合整合验证是额外证据；本独立复核没有冒称重新目视全部25帧×两主题。本站共享交互脚本未在本章修改，复制/播放/闪卡/进度由主代理统一验证。

Ch02作者仅新增本独立复核文档与专属证据目录；Ch05源文件由作者单写入。未提交、未推送、未部署。
