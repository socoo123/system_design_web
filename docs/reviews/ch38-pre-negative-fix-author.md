# Ch38 · 缓存与 CDN 作者交付

2026-10-24；实施模型 GPT-6.1-Sol (`gpt-6.1-sol`) + Max (`max`)。仅本章及 `examples/ch38/`、`docs/reviews/ch38-*`、授权的截图目录；没有修改共享UI/脚本/工具/PLAN，没有提交、推送或部署。
**作者自检完成，待交叉独立复核及主代理验收。**

## 更改与主线

先用三项决定定位：真实回源路径、固定内容年龄、不同流量放大分别治理。A1–A12 长前提表、替代方案和完整推导放进 `details.fold`，核心机制/失败边界默认展开。删除重复回程/年龄/恢复叙述和对本例无决策价值的 Facebook 实测数字，保留所有主要计算。中英正文、图注、代码解释及闪卡同步。

- 多级读按条件 miss：40,000 → Shield 8,000 → App 4,000 → Store 2,000/s；look-aside 的 Cache tier 不调用 Store。
- HTTP 先选择表示，查共享缓存前执行本章较严格的 Authorization/Cookie/pass 政策；区别 RFC 授权共享例外、Vary 与鉴权、未限定 private/no-store/no-cache。
- 浏览器 max-age=0 可以由仍新鲜的共享缓存回答条件请求；到 App 的条件验证才重新读 primary。ETag 覆盖内容/渲染器/表示；GET 条件解析、弱比较/列表/* 明确外部 RFC 栈承担。
- 更新行/outbox 同事务；回执含义取决于供应商，接受不冒充全部POP完成。CDN purge 不清浏览器缓存，也不能撤回已发内容。
- observedAt 在新 primary 查询开始前取，正值 hard=20s、负值 hard=5s，拷贝/失败软刷新不重设期限。HTTP n 同时扣2s跨节点时钟差和1s资格检查到最终发送预算。
- singleflight 只减少本进程工作；不同进程仍可能各有leader。等待者超时不取消共享任务，不释放仍在执行的 SQL 名额。
- floor/token/epoch 在缓存服务写端同一原子边界。缺失资格拒绝、重启换epoch；缺席也需权威revision/tombstone。新token后重读primary是可信loader前提，不能由缓存检查冒充事实证明。

## 四段同源关键实现

| 页面片段 | 完整来源与保证 | 验证/简化范围 |
|---|---|---|
| HTTP策略伪代码 | `examples/ch38/http.pseudo`；授权分流、权威304、Vary/weak ETag、剩余shared寿命、错误no-store | 策略不是HTTP解析器/CDN实现；Date/Age和请求控制由真实栈承担 |
| Java17固定年龄 | `AgeBudget.java:age`；原hard deadline、L1上限、canSend、sharedSeconds | 可运行Java17；时钟健康、证据可信、从检查到最终发送≤1s为外部契约 |
| Java17单进程合并 | `SingleFlight.java:flight`；私有等待future、异常/拒绝处理、真实loader返回后移除 | 可运行并发；无跨进程保证，物理查询结束/取消确认仍需存储适配器 |
| 缓存服务事务伪代码 | `cache.pseudo`；`cache.py` 用真实SQLite文件BEGIN IMMEDIATE实现claim/invalidate/fill | 独立App进程共享一个缓存写权威；不是Redis复制/切主实现，不跨业务Store事务 |

`sync.mjs --check` 对4段做逐字校验；Java摘录从明确BEGIN/END区域提取。完整依赖和命令见 [README](../../examples/ch38/README.md)。

## 发现与修正

| 问题 | 修正与复验 |
|---|---|
| 原文把leader总截止时间写成“终止”，容易误读为SQL已停 | 共享任务实际结束前保留在途；等待超时与真实取消分离，SQL并发名额仅在物理完成/确认取消归还。38项Java并发/结果测试覆盖等待超时不伤其他人。 |
| 原HTTP剩余寿命只展示2s时钟扣除，最终发送预算不够显式 | Java和HTTP策略统一扣2s+1s；同一个now做资格与n计算，整个检查到最终发送≤1s，否则放弃。原120s截止/114s当前得到3s，n=0也不能绕过canSend。 |
| 首版伪代码允许absent混用20s，与运行适配器不一致 | 按absent类型严格5s/20s；未来时间界限、state读取、claim内命中重查也与SQLite实现对齐。77项runner及同源复验通过。 |
| 缓存元数据/版本存在隐含前提 | 正文与README明确资格元数据不随值静默淘汰；丢元数据拒旧票，重启换epoch，可信新primary loader和缺席revision是条件。测试撤销/乱序floor/重建/重启/跨锁取时。 |
| D1字夹短线，D3/D4/D7简单回程绕路 | 下表局修，不改帧序与组件关系；改动组全部帧两主题目视。 |

## 动画与真实目视

原 **7组38帧、76个title/desc ID和帧序全部保留**。当前10份SVG变动、28份逐字不变；没有新增/删除静态或动态图。

| 组/帧 | 局修 |
|---|---|
| D1 s5 | guarded SET 标签从两条顶部线路中间移到两线上方，保留正反方向 |
| D3 s4–s6 | CDN control→Relay回执从画布外圈改走内侧短路径；s5/s6 Edge B purge 去掉无意义折返 |
| D4 s3–s5 | Store→Writer回执改成与提交请求平行的竖线，commit标签移到线右侧；s5“红字”改为两主题都成立的拒绝标记 |
| D7 s4–s6 | Budget→App、Edge→Client失败回程走第三条平行通道；不再绕过Edge上方形成大回形 |

改前全部38帧两主题已保存；作者先看7张浅色全帧接触表定位，再打开最终14张两主题全帧接触表，覆盖76幅画面，包含修改组22帧×2=44幅。另实际打开8张真实窄屏代码/卡片/章节头/图左端右端截图，共29张已打开图像的哈希见 [目视记录](ch38-visual-review.json)。Store圆柱title/subtitle几何候选按实际字形检查，行间可辨，未为bbox候选机械改图。

截图统一在已忽略的 `docs/reviews/screenshots/ch38-author/{baseline-frames,final-frames,browser}/`。非忽略清单与哈希见 [改前帧](ch38-baseline-frames.json)、[最终帧](ch38-final-frames.json)、[动画清单](ch38-animation-baseline.json)。真实320px双语顶栏沿用公共样式，会较高换行；控件可达、正文不横溢，本章未修改共享UI。图内横滚会将同一slide内图注移出右端视野，向左恢复；控件保持可用，未把该公共组件行为当成整页裁切。

## 实际验证

[12项最终命令](ch38-checks.json)与[完整输出](ch38-check-output.txt)全部通过，执行前后9份页面/示例源码哈希相同：

- `tools/check.mjs`、`tools/audit-chapter.mjs ch38`、同源检查、3份本章验证JS语法、`git diff --check`。
- 实际 Oracle Java **17.0.10**，`javac --release 17` 编译，AgeBudget **14项**、SingleFlight **38项**通过。测试含固定年龄/负期限/边界、同key共享、等待者超时仍在途、跨Group另有leader、异常/执行器拒绝/独立取消。
- `examples/ch38/run.py` **77项**，其中**24项教学数字复算**。真实SQLite **3.51.0** 文件事务、6独立进程争同一lease仅1 leader、另一进程失效后迟到fill拒绝；floor乱序单调、旧/重票、过期、epoch切换、资格丢失、负记录混用期限与未来证据拒绝、事务回滚，以及真实锁等待后再取时。[逐项结果](ch38-example-results.json)
- [最终真实浏览器矩阵](ch38-browser-results.json)：320/390/768/1440×淡绿/深色×zh/en/both **24组合**；记录实际innerWidth和scrollWidth，展开全部details仍无整页横溢。通过真实浏览器按钮事件处理器到达全部38帧，共**912次帧定位**；另实际指针/键盘prev/ArrowLeft、正常动态播放、速度/循环、表格/代码/图内横滚、闪卡、进度与主题/语言持久化通过。4段实际剪贴板逐字一致，页面/资源错误0。
- 最终浏览器sourceSha256与当前页面一致；窄屏采用Playwright真实viewport，未用Chrome CLI裁切冒充手机。全帧静态接触表为960×420阅读图；它不代替移动端交互。

一手来源于本轮重新打开/查找RFC9111/9110/5861/8246、NSDI原论文、Go/Redis/Fastly官方、TinyLFU作者稿PDF §4、SQLite事务与CloudFront文档。Fastly直接open遇服务端markdown类型错误，通过官方域搜索获取原正文。正文引用就近，支持的具体范围见 [sources](ch38-sources.json)。所有流量/容量/时钟/TTL数字是自设教学假设，不是来源的生产测量。

## 当前源码与未做事项

[当前9份源码SHA256](ch38-source-hashes.json)；页面：

`bf3f382315440b12b9f679973bfe63b302e45caf374af64da28b03086d803894`

未实现真实HTTP解析/Date-Age栈、CDN purge与回执网络、数据库业务row/outbox持久Relay、Redis复制/切主、全局速率预算服务、可信时钟健康检测、真实Store取消/并发名额回收协议、授权系统和Bloom增量同步。没有生产压测、真实网络分区、时钟故障、存储耐久/掉电实验；本地SQLite多进程与Java并发不能证明生产分布式可靠性。这些限制与本章契约在页面和README显式区分。

当前无作者已知未关闭P0/P1；独立复核尚未签署，不能把作者自检标为整章最终验收。
