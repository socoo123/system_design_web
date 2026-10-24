# Ch19 · 独立交叉复核

2026-10-23，GPT-6.1-Sol（`gpt-6.1-sol`）+ Max，由Ch21作者独立只读复核。**通过；未发现未关闭P0/P1或阻碍阅读P2。** 本报告是新输入、实际源码与页面证据的判断，不以作者测试数量代替复核。

审阅目标HTML SHA256：`d0f36e35c7fd8aedd59e98641015aa0ec8e58bd574882c29374195beffd8b6f0`。完整阅读正文、中英说明、五段页面源码、全部图注与10张闪卡，直接读 `Nearby.java`、三个伪代码与SQLite模型。没有改目标章节/示例、作者报告或作者结果；[before/after清单](ch19-independent-source-hashes.json)确认chapter与examples全部10文件哈希完全相同。

## 独立技术检查

[独立Java源码](ch19-independent-NearbyReview.java)直接调用作者实际 `Nearby`，JDK17.0.10实际编译运行，**115,331断言、40个独立球面圆通过**，见[结果与命令](ch19-independent-java-results.json)。目的点用独立3D切向量旋转计算，距离oracle用向量叉积/点积atan2，不复用作者测试的正向纬度公式。

| 面 | 正常与反例 | 结论 |
|---|---|---|
| 覆盖/模型 | 第比利斯、孟买、乌斯怀亚、反经线两侧、南北高纬/触极区等10中心×4允许半径；每度方位×4径向比例，另以独立bin计算检验成员格。正好格数预算通过，减1必须Unavailable；精度6极区小预算明确失败。 | 没有采样漏格，预算不截断。覆盖与测距使用同一个显式球面R；这不是椭球/GPS真值证明，也不是Redis极点能力。 |
| 全局排序 | 新的120实体混合闭店、删除、类型、公开/受众与移动端；重复成员取最大版本，独立向量距离排序后比较完整top20。 | 全集筛选/最终距离先于limit；不是每格任意取20。距离桶在排序后输出，移动端坐标隐藏。 |
| 权威/权限 | 已召回id的最新坐标移到圈外则剔除，再移到3m则进入第一；缺Map键、版本落后、错id均失败，Optional.empty才是确认空。探针的当前权威行为mover=true、published=true、空audience，按本实现移动端分支剔除；非移动公开地点另走published分支。 | 旧索引距离不提前丢id，旧候选也不决定可见权限。当前实现对mover=true始终检查authority.audience，即使published=true；mover=false的公开地点可由当前published=true直接开放。未召回id仍无法由权威Map补回，异步index_as_of边界保留。 |
| 年龄/发送 | sendBy=2,000,000、observed=1,970,250、clockError=250恰好30秒通过；发送晚1ms或误差多1ms剔除，未来样本越界拒绝。 | 读到的权威状态/受众是快照决定；发送逾期必须重验由调用层实现，不能把本地函数当发送器。 |

[独立模型探针](ch19-independent-model-review.py)导入实际 `model.py`，**40项SQLite/协议条件/算术与契约轨迹通过**，见[结果](ch19-independent-model-results.json)。不是重跑作者verify.py，也未覆盖作者证据。

- 新实体84/85/86/87、owner302与新会话/坐标：正常pending、原回执先于样本/额度检查；同身份换意图拒绝，属主先于回放。两真实SQLite线程争第四个rolling-window额度仅一胜；10同键重试只一版本/额度/outbox。恰一分钟边界淘汰最老额度，提前1ms仍拒绝。真实引擎outbox触发器异常后，最新行、额度、回执均回滚；原键可重试。
- A→B新格写后崩溃保留重复LIVE，再重放完成旧格墓碑；v11重返后迟到v10删除和v9加/删均不能复活或删除新归属。同格移动只增一次revision。缺revision提交注入失败使成员和revision一起回滚；同版本不同payload拒绝。
- 无孩子位置的v13墓碑复制四个孩子均挡旧复制；v19广泛墓碑不覆盖已到v20的LIVE重放。
- 三分区向量起点99/239/579，A看到102/101却缺100时不能cutover；补100才连续推进。缺一分区仍拒绝。切换后仍双投影；只有旧路由过期或只有旧读者结束都不许回收，AND满足后才retire，重复CAS拒绝。
- 缓存绝对期限只做**合同及错误轨迹**：start=1000、not_after=3000、2999才回填，只剩1ms，不能改为4999；4000若沿回填TTL会错误放行。原章没有声称提供可运行缓存实现，因此这里不冒充实际缓存测试。Java发送年龄边界另由实际函数执行。

SQLite `BEGIN IMMEDIATE`比PG实体/格行锁粗；注入now/clock_error是可信测试输入，不证明设备时钟或生产接受时刻。`Migration`只验证协议条件，不是真实CDC、日志、租约、目录CAS或存储epoch执行器。两个投影屏障、完整父格快照、before/after点、全部相关分区、宽限期双投影、AND回收及存储代次拒迟到者在中英伪代码/正文中一致。

## 数值与来源

独立复算结果：六位局部格宽高 `0.9341777328×0.6097412109km`；1/2/5/50km盒上界20/48/216/18,094，五位5km范围16；约0.126839编辑/s、1,111.111查询/s；热格id约35.555556MB/s，完整快照142.222222MB/s；移动写5,333.333/s，历史44.2368GB/天，3秒上报221.184GB/天；60km/h下2秒33.333m、30秒500m；单父四分稳态23、迁移24。与正文/英文/图注一致，均为本章假设推导。

2026-10-23重新打开以下官方一手来源，抽核支持边界：

- [PostGIS ST_DWithin](https://postgis.net/docs/ST_DWithin.html)确认为geography米单位、默认椭球与可利用空间索引的bbox预筛。没有运行PostGIS或查询计划。
- [Redis GEOSEARCH](https://redis.io/docs/latest/commands/geosearch/)确认ASC与COUNT ANY早停不能保证最近集合；后置营业/权限过滤可能缺第21家是本章推论。[GEOADD](https://redis.io/docs/latest/commands/geoadd/)确认52位、内部覆盖、纬度范围与约0.5%球面误差，不能证明固定六位九格或本章球面等于GPS真值。
- [H3 traversal](https://h3geo.org/docs/api/traversal/)确认gridDistance为最少相邻跳数、gridDisk无输出顺序保证；[cell statistics](https://h3geo.org/docs/core-library/restable/)确认每层12个五边形和面积随位置变化。
- [Debezium3.7 outbox](https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html)确认事件id可去重、aggregateid为分区key；正文没有由此推导relay天然有序或exactly-once。
- [W3C 2026-03-26 Geolocation §3.2](https://www.w3.org/TR/2026/CR-geolocation-20260326/#privacy-for-recipients-of-location-information)明确non-normative；距离桶可交叉推断是本章分析，不当匿名/法律保证。

## 图、双语与浏览器

[独立渲染脚本](ch19-independent-render.mjs)实际渲染受影响D3/D4/D5全15帧×两主题=30帧，已逐帧目视[原图与接触表](screenshots/ch19/independent/frames/)。D3的MERGE→AUTHORITY→FILTER→TOP20、D4的committed-event独立通道与replay-safe、D5的all applied[p]≥W[p]与AND回收均与代码/正文相符，无文字压线或裁切。原6组29帧及全部title/desc ID由浏览器对授权前基线逐项确认。

[独立浏览器](ch19-independent-browser.mjs) / [结果](ch19-independent-browser-results.json)覆盖 **390/1440×两主题×zh/en/both=12个实际组合**，未把主代理/作者的24个组合计入自己数量。默认与展开全部details后innerWidth=scrollWidth=目标宽度，无pageerror或资源错误；116次翻帧、5段逐字复制、键盘/播放暂停/速度循环、闪卡click/Enter/Space、已读与语言主题重载持久化通过，10卡实际grid，英文模式代码无中文。

D3/D4/D5全部帧在真实390视口下左/中/右横滚，共90张完整figure截图，已逐帧按六张[手机接触表](screenshots/ch19/independent/browser/)目视。接触表仅裁掉图外长图注供浏览，原始完整截图保留，实际viewport记录为390；不是CLI桌面裁切手机图。另看390双语深色代码与1440双语代码，代码在容器横滚可读。共享UI已有图注随slide横滚表现，滚回可读，未改共享文件。

只读同源/audit和两个独立JS语法检查均通过，[日志](ch19-independent-checks.txt)。没有运行会覆盖作者结果的verify.py。可复运行：

```sh
python3 docs/reviews/ch19-independent-run-java.py
PYTHONDONTWRITEBYTECODE=1 python3 docs/reviews/ch19-independent-model-review.py
node docs/reviews/ch19-independent-browser.mjs
node docs/reviews/ch19-independent-render.mjs
```

## 结论与限制

通过当前冻结版本；无未关闭分级发现。未验证真实PG/PostGIS、Redis集群、CDC/relay/消息队列、跨机epoch/租约、真实授权/设备时钟、生产负载或SLO。球面采样不是数学穷尽证明，协议/缓存轨迹不是分布式运行实验；异步未召回窗口、权限快照后撤回和已发副本的限制已经正文说明。

最终目标哈希仍为 `d0f36e35c7fd8aedd59e98641015aa0ec8e58bd574882c29374195beffd8b6f0`；chapter+examples全部10文件before/after一致，未生成目标范围class或__pycache__。未提交、推送或部署。
