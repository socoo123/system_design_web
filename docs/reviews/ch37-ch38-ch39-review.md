# C第十二批 · Ch37 / Ch38 / Ch39

2026-10-24。用户授权“重构下一波 用3个agent.”。
三位GPT-6.1-Sol（`gpt-6.1-sol`）+ Max（`max`）各实施一章，再轮换只读独立复核，没有另派agent。
**三章实施、交叉独立复核与主代理验收通过；3项P1、图内标签P2及测试夹具问题全部关闭。**

## 内容与实现

| 章节 | 本批交付 | 作者 / 独立复核 |
|---|---|---|
| Ch37 存储选型 | 访问路径、原子不变量与成功承诺；SQLite结账/savepoint/条件扣减、完整对象证明发布CAS、固定manifest的Java17准确SUM | [作者](ch37.md) / [Ch39作者复核](ch37-independent-review.md) |
| Ch38 缓存与CDN | 固定内容年龄与HTTP剩余寿命、本进程singleflight、缓存端跨进程floor/token/epoch原子守卫；授权分流、304与purge边界 | [作者](ch38.md) / [Ch37作者复核](ch38-independent-review.md) |
| Ch39 负载均衡与无状态 | 请求/连接粒度、等容量P2C、App本地原子准入、代次绑定排空与真实完成；幸存容量、Maglev/DSR与未知写结果 | [作者](ch39.md) / [Ch38作者复核](ch39-independent-review.md) |

三章原无pre，本批新增**10段同源代码**（3/4/3）。长假设和细算按需展开，关键路径、代码与失败边界就近；正文、英文、图注和网格闪卡同步。
没有新增静态图：原终帧可承担本章总图；没有为图数配额增加或替换动画。

Ch37限定Dynamo式quorum、Bigtable2006与Dremel2010路径，避免由KV/行列布局推断所有产品能力。W=2不自动表示两个持久ACK，图中明确本教学场景的持久前提；本地WAL、异步复制和灾难RPO分开。
Ch38将等待者超时、共享任务实际结束和资源释放分开；硬年龄不被L1复制、HTTP重新包装、软刷新失败或旧304延长。
Ch39区分入口观测负载与App额度，零队列饱和即拒绝；停止选择、移除确认、实际handler完成和物理退出各有边界。

## 问题、返修与关闭证据

| 级别 / 触发 | 修复与证据 |
|---|---|
| P1 · Ch37仅version/size/checksum的证明可把同内容B对象发布到A会话 | [实际首版输入与归档源码](ch37-ch38-ch39-root-initial-findings.json)复现。proof现绑定caller/upload_id/含存储命名空间的object_key/version/size/checksum；函数拒错会话，SQL核准确key，已提交重试也核完整身份。作者、主代理新输入与Ch39作者独立新fixture均确认修复。 |
| P1 · Ch39旧代次下线指令可关闭地址复用后的新Gate | 同份[首版Java17证据](ch37-ch38-ch39-root-initial-findings.json)复现。`beginDrain`第一项锁内检查绑定expectedIncarnation，早于重复revision返回或状态修改；新Gate正常准入，旧代次同revision快捷路径也拒绝。作者、主代理与独立复核均重验。 |
| P1 · Ch38把5秒负记录直接估为100/5=20次权威读/s，漏算2秒时钟余量 | Ch37作者[30,000次实际claim](ch38-independent-initial-finding.json)复现：当前L2每3秒一波，500/15≈33.3/s。20现明确只是不计全部安全余量的理想值；A9、D5s3–s5、中英、README和第15张卡同步。独立37-key/24s、11-key/18s与主代理[7-key/12s新fixture](ch37-ch38-ch39-root-negative-cache-results.json)均确认N/3；HTTP发送资格不足2秒及503分支另列，未把33.3当端到端上界。 |
| P2 · Ch39 D3s4–s6新路线穿过sticky/load-based标签 | Ch38作者独立原尺寸目视发现，[初始finding](ch39-independent-initial-finding.json)与修前图像/哈希保留。作者只移标签坐标，不缩字号或改路径；sticky全组六帧位置一致，load-based置于线上方留白。作者、独立复核与主代理重看D3全部六帧两主题，真实390px中/右段及最终浏览器矩阵通过。 |

其他同步澄清包括Ch37上传终帧COMMITTED、全片扫描字节与WA分子，Ch38负证据5秒/正值20秒和最后发送余量的代码一致性，Ch39准确探测估计、ConnTrack表满与恢复新代次。
这些不冒称额外生产故障实验。

主代理最终整合另实跑出一个测试夹具竞态：SingleFlight.main的瞬时loader可能在cancel前完成，原isCancelled断言并非必然。[实际失败suite与旧源](ch37-ch38-ch39-pre-cancel-fixture-checks.json)保留。作者只将测试改为受控executor先排队，取消私有waiter后再执行同一leader并验证另一个waiter成功；核心join与页面摘录逐字未变。主代理[20个新JVM重复](ch37-ch38-ch39-flight-fixture-results.json)、作者4并发JVM×20次及独立复核相关Java均通过，不把重复数计为独立新用例。

## 动画与实际目视

原**21组113帧、全部226个动画title/desc ID和帧序保留**。Ch37改20/38份SVG，Ch38改13/38份，Ch39改14/37份；其余66份SVG逐字不变。
最终修改14组共77帧，两主题为154个原尺寸画面，保存在[修改组全帧清单](ch37-ch38-ch39-frames.json)中。

[主代理实际目视](ch37-ch38-ch39-root-visual-review.json)记录49张图及哈希：28张修改组全帧表、6张改前和6张最终终帧表、2张真实320px导航对照、3张390px代码页，以及Ch39标签初始/最终原尺寸图各两主题。
主代理初次接触表检查漏掉了D3穿线，独立复核发现后已重新打开验收；[原观察记录](ch37-ch38-ch39-pre-label-root-visual-review.json)与原图保留，没有沿用初次“未见遮挡”的结论。
最终重渲染中，原43张图的39张逐字相同，4张Ch39 D3/终帧表变化，已全部重新打开查看；新增的原尺寸对照也已实际打开。
负缓存返修后再实际打开D5全部五帧两主题，增加两张全帧表，并重看两主题终帧表。此前47张图有44张逐字相同，3张变化已重看；其中D3浅色SVG源码完全相同而重建raster有差异，也已重新打开全六帧核看，没有用旧哈希代替新画面。

几何只定位候选，不替代字形/箭头/连线目视。作者及独立复核还检查图内左右横滚，未用Chrome CLI裁切冒充手机。

## 主代理实际检查

[36条最终整合命令](ch37-ch38-ch39-checks.json)与[完整输出](ch37-ch38-ch39-checks.txt)通过，命令执行期间当前章节/示例/公共JS来源不变。
包括全站结构/本地资源、17项校验器回归、三章audit与10段同源、作者实际契约、Oracle Java17编译运行、JS语法与diff检查。

- [结账与对象发布48项新输入](ch37-ch38-ch39-root-storage-results.json)：完整请求和caller绑定、重复SKU、稳定失败回执、部分回滚、最后库存/同键并发、真实进程退出、完整proof身份和清扫/发布边界。
- [缓存29项新输入](ch37-ch38-ch39-root-cache-results.json)：旧token、floor乱序、epoch、丢元数据、负记录类型寿命、8连接争lease及真实写锁等待后时间。
- [Java新输入](ch37-ch38-ch39-root-cache-java-results.json)：AgeBudget/SingleFlight 26项；另有[Gate 28项](ch37-ch38-ch39-root-gate-java-results.json)与[准确SUM 10项](ch37-ch38-ch39-root-sum-java-results.json)。五类共141项，断言不等于141次独立分布式实验。
- [65处独立复算](ch37-ch38-ch39-numeric-review.json)：十进制容量/页写/热点锁、条件命中/负缓存/jitter/失效预算、故障域/重试/Little均值/探测暴露与表内存。输入均为声明的教学假设。
- [最终真实Chrome矩阵](ch37-ch38-ch39-browser-results.json)：320/390/768/1440×两主题×三语言，72个不同布局；展开details、代码标题/复制单行、452次翻帧、10段逐字复制、播放/键盘/闪卡/进度/设置持久化通过，页面/资源错误0。标签修后只重跑Ch39的24组合，负缓存修后只重跑Ch38的24组合；保留[标签修前矩阵](ch37-ch38-ch39-pre-label-browser-results.json)及[容量修前矩阵](ch37-ch38-ch39-pre-capacity/ch37-ch38-ch39-browser-results.json)。
- [主代理一手来源抽核](ch37-ch38-ch39-root-sources.json)：PostgreSQL条件更新/读视图、RFC9111年龄与验证、Envoy等权/非等权分支、Kubernetes异步终止。作者与独立复核另核相关论文和逐句适用前提。

## 交叉独立复核

三份报告均正式签署通过，最终全部章节/示例哈希已与当前源码逐一核对。

- Ch39作者复核Ch37：[71项SQLite/16项SUM新输入、37复算、24布局/152翻帧/3复制](ch37-independent-review.md)；六修改组33帧双主题实际目视，proof串用P1独立关闭。全部文本源码before/after相同，观察到的pycache移除另列，没有伪称缓存文件也未变化。
- Ch37作者复核Ch38：[51项SQLite/27项Java、32复算及两个新负缓存周期](ch38-independent-review.md)；7,896次实际claim吻合N/3并独立关闭P1，取消夹具修复后相关Java及10次重复通过；最终24布局/152翻帧/96复制，五修改组27帧双主题已看。初始bf3f→最终a90与SingleFlight主测试阶段变化如实保留，九份after签署当前源码。
- Ch38作者复核Ch39：[53项Java新断言、36复算、24布局/888帧定位/3复制](ch39-independent-review.md)；旧drain P1与D3标签P2独立关闭，全37帧两主题已看，返修后D3与390px横滚重新核看；初始159e→最终59e9及四份未变示例的记录完整。

作者runner、重复执行和手推都与上述独立新输入分列；没有把更高档位、模型名称或自检通过当独立证据。

## 范围、限制与交接

[授权前1929份文件基线](ch37-ch38-ch39-baseline.json)与[范围检查](ch37-ch38-ch39-scope-results.json)确认其他42章、公共UI/首页/工具和全部既有未提交代码/文字证据保持授权前哈希。
全部本批PNG留在已忽略的screenshots目录，未改`.gitignore`，未忽略的新图片为0。[最终273项源码与证据一致性](ch37-ch38-ch39-evidence-consistency.json)通过，最终来源与作者/独立签署见[冻结清单](ch37-ch38-ch39-final-source-hashes.json)。

F04为真实320px对照模式的既有公共导航排版：品牌中文逐字换行、导航203.15625px高。三章改前/改后完全相同、按钮可用、无整页横溢，740px视口仍约537px阅读区；[独立基线对照](ch37-ch38-ch39-header-results.json)已记录，作为非阻碍P2留Q统一处理，本批未扩改公共UI。

实际执行的是Java17本地并发、SQLite文件事务/多连接/子进程退出与真实Chrome。
没有真实PostgreSQL/复制切主、S3验证/权限/迟到上传、Redis集群/CDN/HTTP缓存服务、全局失效/时钟同步、Envoy/Kubernetes/GOAWAY/入口确认、业务支付/撤销、物理取消/退出或生产压测。
完整权威manifest和可信叶子、对象证明与不可变版本、健康时钟/HTTP栈、回源总预算与物理完成、发现屏障和业务幂等仍是逐章写明的外部前提。

全站仍为45章、276组、1411帧，现183段代码。C累计**36/42**章已验收，全部本批任务锁清除；Q仍未开始，F04留Q。仅交付本批，未自动延伸Ch40。
未提交、推送或部署。
