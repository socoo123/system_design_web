# Ch40 · 轮换只读独立复核

2026-10-24，Ch42作者轮换复核Ch40，GPT-6.1-Sol（`gpt-6.1-sol`）+ Max。
本复核只写`docs/reviews/ch40-independent-*`与已忽略的
`screenshots/ch40-independent-author42/`；未改Ch40页面/示例、共享UI、计划或其他章。
Ch42在主代理另行授权下由本agent局修自己的retry P2，和本只读范围分别留证。

**结论：发现1项P1，作者修复后独立关闭；当前无开放P0/P1或阻碍阅读P2，可交主代理整合验收。**
最终Ch40 HTML SHA256：
`b078f477d020e9c9f9b7e4e3173a2ad05cebd30636750242f1ac3afb907a9f68`。
[最终签署JSON](ch40-independent-final.json)含相对路径`sourceHashes`，覆盖章节和
`examples/ch40/`全部文本源，`passed=true`、`openFindings=[]`。

## 发现、修复与来源

| 级别 | 独立发现 | 作者修复与复验 |
|---|---|---|
| P1 · CH40-I1 | 首审hash `159f939686664c249a7baf84a72c6760a7b5990828e8569f6b39fe741680095d` 的D7 F4/F5写“Wi-Fi → mobile: validate new path; CID may rotate”。具体主动换本地地址却把CID更换写成可选，与正文MUST NOT和RFC9000 §9.5不一致。 | 作者改“New local address: validate path; use a fresh CID”，保留same QUIC connection；同步描述、中英图注与最后闪卡。独立重看D7全5帧双主题、390px图中段及末卡；字样完整、关系一致。只这2份SVG发生本次修复变化，3段pre和全部Java/Python示例与首审字节一致，故不重跑无关算法测试。 |

发现时已同时通知作者与主代理，由作者落修，复核者未直接改页面。
规则按[RFC9000 §9.5](https://www.rfc-editor.org/rfc/rfc9000.html#section-9.5)重新定位：
主动从不同本地地址发送不能复用CID；被动NAT rebinding不等同主动本地地址变更。
最终图、正文与闪卡没有再以“同一连接”推出“固定CID”。

其他重点抽核：

- [WHATWG SSE §9.2.6](https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation)：浏览器在派发handler前更新传输last-event-ID，不证明应用事务完成。章节另用持久applied cursor，失败close旧流、generation、串行handler收敛后重建，和标准边界一致。
- [gRPC Deadlines](https://grpc.io/docs/guides/deadlines/)：传播扣除已耗时的duration，派生工作需配合取消。代码是本地策略，适配器临发前设置剩余时间并受入站context限制，没有跨机器传nanoTime起点。
- [gRPC Flow Control](https://grpc.io/docs/guides/flow-control/)：write返回可以只是框架接收。章节明确sink非阻塞/有界、上游限拉/额外staging与TLS预算，未拿本地写证明已出网。
- [RFC8470 §5.1–5.2](https://www.rfc-editor.org/rfc/rfc8470.html#section-5.1)：已有标准Early-Data不得删除，425重试不得再用early data；章节只清伪造内部信任头，保留前跳风险，并把拒绝放在dispatch前。
- [RFC9114](https://www.rfc-editor.org/rfc/rfc9114.html)：B字节与解码依赖齐备且丢包不含B才可独立推进；共享拥塞/QPACK/业务依赖仍在。UDP阻断后的TCP尝试不等于重新执行未知POST。
- [WHATWG WebSockets §5](https://websockets.spec.whatwg.org/#ping-and-pong-frames)：浏览器JS不直接暴露Ping/Pong，与页内服务端/协议库Ping前提一致。

这是机制抽核，不是以“已打开网页”代替判断。未逐一重新审所有REST/schema延伸来源；本次结论不扩展为全站事实复核。

## 实际执行的新输入

完整可复现输入在[Java fixture](ch40-independent-Probe.java)，
执行入口为[ch40-independent-check.py](ch40-independent-check.py)，
完整输出及首审前后源码hash见[独立运行结果](ch40-independent-check-results.json)。
没有执行或import会覆盖作者证据的`run.py`/`verify.py`顶层。

| 对象 | 本次独立执行 |
|---|---|
| 实际Java类 · Budget | 新411ms预算、95ms已耗、31ms预留得到285ms；第二次仍用原实例剩余80ms；不安全未知写/第三次attempt/恰到预留边界均拒绝；短时间跨度跨`long`符号回绕仍算正确。 |
| 实际Java类 · resume | 新scope `events:t9`、epoch v4、保留[71,91]：70可补71，69 RESET，91仅tail，92拒绝；旧epoch数值不比较而RESET，越权/错scope拒绝；空区间18/17只允许已应用17尾读；不连贯边界拒绝。 |
| 实际Java类 · BoundedWriter | 使用新cap13与不同字节串，部分写保留余量，两块队列按2字节片段准确有序排出；零写不续时、恰到stall关闭、空队列不计时、再次非空重新计时、精确满额/溢出与关闭不可复活；IOException发生在移动源后仍清空；错误字节计数拒绝。 |
| trickle反例 | 每1.9s写1字节，15.2s后仍开且有5字节待发，证明此代码是无进展上限而非总deadline；停写再过恰2s才关闭。页内已明确需另设总run期限/最低吞吐，未误称两秒总时长。 |
| 作者实际SQLite apply函数 | 从`verify.py` AST提取该函数本体到独立命名空间，用真实文件DB、全新scope/epoch/seq/generation运行：17/710 → 正常24/711；投影更新后异常仍回滚24/711；旧generation拒绝、缺口713拒绝、712重放后31/712，重复不再加7。不是镜像实现，也不是内存atomic模拟。 |
| 同截面反例 | 另建真实WAL文件与两个连接：一个读事务看到state10/seq80，另一连接提交11/81后该读事务仍得10/80；事务外另采最新seq则组合出10/81，确实会跳过中间更新。此实验只证明本地一致读截面，日志保留pin/recheck仍是外部集成合同。 |

Java新输入共31条定向claim，SQLite记录4组相关轨迹；这些是对上述机制的断言/状态，不是31次独立网络或分布式实验。
十处主要算式用Decimal新算：400回源/s、240ms、1,310,720,000B与1.220703125GiB、
30,000条/6,000,000B、600ms首事件、399/50=7.98s、末事件8.58s、12.5MiB。
数字、量纲、原始payload排除项与中英/闪卡一致，均为教学假设。

## 图与真实页面

[独立浏览结果](ch40-independent-browser-results.json)对应首审源码：真实320/1440px×两主题×三语言12组合；
展开details后innerWidth=scrollWidth，3个代码栏无标签/复制遮挡，12张卡为统一网格。
实际逐字复制3段代码、翻卡、已读/主题/语言持久化通过。另以真实390px滚到D4/D7右侧。
本次未把采样写成全24组合；作者/主代理的全矩阵验收各自留证。

修改组D4 6帧与D7 5帧，两主题共22个真实页面画面均重新截图，实际打开4张全组接触表逐帧目视。
D4 log回程标签位于独立通道，Snapshot回程不压字；D7 Gate、Path Check、正常/拒绝条件路径可追踪。
首审另实际打开320px两主题writer、390px图右侧、1440px代码等5张阅读图；既有公共F04导航高条仍在，未擅改共享UI。

P1局修后只重验受影响范围：[finalize脚本](ch40-independent-finalize.mjs)验证pre/示例不变、
D7全5帧双主题10画面、390/1440两主题both 4布局和新末卡。实际打开修后2张接触表、
2张390px卡图与2张390px图中段图；fresh CID完整可读，未用自动bbox代替目视。
首审画面和hash保留，修后重复画面不累计成额外独立覆盖。
实际打开图像路径/哈希记入[ch40-independent-final.json](ch40-independent-final.json)。

## 手推及未实测边界

手推并对照正文/图：补历史50后才注册listener会漏51；同一持久日志tail或注册后复核可避免夹缝。
分类后oldest若推进仍必须pin或再查，不能让纯`resume`判定冒充持久日志服务。
旧EventSource handler收敛前不能创建可写新generation；projection与applied cursor本地同事务不涵盖外部副作用。
写入数组由offer成功方独占、非阻塞sink和无隐藏无界队列属于适配契约，fixture没有证明真实框架履约。

未部署EventSource/gRPC服务、真实持久Event Log、网络背压/取消、TLS/QUIC丢包或迁移、
跨节点早期数据重放、真实代理缓冲、生成模型或压测。未验证端到端p99和生产可靠性。
本轮只读复核完成，无开放问题；最终发布/提交/部署仍由主代理按用户授权处理。
