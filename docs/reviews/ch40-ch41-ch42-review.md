# C第十三批 · Ch40 / Ch41 / Ch42

2026-10-24。用户授权“重构下一波 用3个agent.”。
三位GPT-6.1-Sol（`gpt-6.1-sol`）+ Max（`max`）各实施一章后轮换只读独立复核，没有另派agent。
**三章实施、交叉独立复核和主代理验收通过；全部已知P0/P1及本批阻碍阅读或定位的P2已关闭。**

## 交付

| 章节 | 关键实现与正文主线 | 作者 / 独立复核 |
|---|---|---|
| Ch40 协议选型 | 原deadline预算、应用已持久游标与保留区间、非阻塞有界writer；EventSource恢复、QUIC迁移与early data边界 | [作者](ch40.md) / [Ch42作者复核](ch40-independent-review.md) |
| Ch41 复制、分片、事务 | 可信新快照读资格、权威存储fence与迁移、条件提交/库存/outbox/成功回执同事务、已知回滚和未知COMMIT | [作者](ch41.md) / [Ch40作者复核](ch41-independent-review.md) |
| Ch42 消息、弹性、容器心智 | 效果库原子幂等、真实已取记录的提交前缀、重试剩余预算、本地I/O许可生命周期、容器排空 | [作者](ch42.md) / [Ch41作者复核](ch42-independent-review.md) |

三章原无pre，本批新增**12段同源代码（3/4/5）**。完整Java17/SQLite适配器、伪代码及运行入口留在各自`examples/chNN/`；页面性质标签、依赖契约和失败语义就近说明。
长假设表按需展开，重复结论删除，核心路径和实现默认可读；中文、英文、图注、表格和闪卡同步。
现有终图已能承担总览，本批未为数量增加静态图或D2。

## 问题与修复

| 问题 | 修复与证据 |
|---|---|
| Ch40主动迁移的CID表述 | 原图将连接延续写成same connection ID。作者改为same QUIC connection；独立复核再指出具体换本地地址场景中的may rotate仍不足。最终D7S4/S5明确use a fresh CID，正文另述被动NAT rebinding的例外。[独立最终签署](ch40-independent-final.json)保留初版159f与最终b078及仅两帧变化，未把初次结论直接当最终验收。 |
| Ch41迁移状态与阶段 | D5停写后的旧源改fenced at H，目标发布后改writer rev8；写入与freeze在真实写权威的同一串行域仲裁。独立P2进一步把60−20MB/s明确为切前持续写预算，fence后仅尾追到H。 |
| Ch42迟调度后启动已到期I/O | 主代理以ThreadFactory闸门实际得到`callerExpired=true; actualIoStartedAfterDeadline=1`。[原源与初始结果](ch40-ch41-ch42-initial-findings.json)保留。worker现于真正调用前检查原deadline和reply状态；主代理新输入为0，且调用方超时仍持有许可。独立者另阻塞CF定时线程，在future尚未完成但deadline已过时放行worker，也不启动I/O。 |
| Ch42空身份绕过SQLite幂等 | 主代理实际调用同一NULL scope两次，得到balance34、两份效果。最终handler写前拒绝缺失/空白/非规范身份，inbox/ledger列显式NOT NULL及非空约束兜底。主代理和独立者以新scope/event/account核原适配器与原DDL，重复、摘要冲突和NULL均按合同处理。 |
| Ch42晚醒重试预算 | 独立P2要求定时唤醒及取得预算/非阻塞许可后的临发前，都重新检查250ms尝试+50ms返回余量；不足300ms即停止并归还未启动许可。token采取保守不退还合同，不冒充业务幂等。 |
| 测试夹具与其他同步 | IoGate的独立场景使用独立Gate，避免把permit归还等同于SynchronousQueue worker已等待；不靠sleep掩盖。Ch40明确标准Early-Data不可删除，Ch41明确预占deadline只唤醒恢复以及Shipping权威终态，Ch42区分本地I/O与远端效果、传统消费组与协议名称。 |

上述源码、图与合同的修正都不被冒称真实协议集群或生产故障实验。

## 动画与页面

原**22组116帧、232个动画title/desc ID和帧序全部保留**。28份SVG局部改标签/描述，另外88份逐字不变；没有删除或替换演示。
修改8组共44帧，两主题为88个原宽960px画面，见[修改组全帧清单](ch40-ch41-ch42-frames.json)。

[主代理目视记录](ch40-ch41-ch42-root-visual-review.json)保留实际打开的图像与SHA256。
已逐帧打开全部16张修改组双主题表，并看真实390px代码、320px导航前后对照及D7独立原尺寸图。
最终重渲染有4张表的字节变化（Ch40 D7、Ch41 D8两主题），已全部重新打开，其余表以相同图像哈希衔接。
最初原始接触表曾使主代理怀疑Ch42 D3裁切；真实deck截图和几何检查均否定了该疑点，已明确更正并通知作者，没有为误判改布局。

[最终真实浏览器矩阵](ch40-ch41-ch42-browser-results.json)：320/390/768/1440×两主题×zh/en/both共72个不同布局；展开details后仍无整页横溢。
464次翻帧、12段逐字复制、键盘/播放/倍速循环、闪卡和已读/设置持久化通过，页面与资源错误0。
所有语言/主题组合使用真实viewport，没有用Chrome CLI裁切冒充手机。

既有公共F04仍留Q：320px对照模式导航高203.15625px、品牌逐字换行，740px视口仍约536.84px阅读区，按钮可用且无整页横溢。
[三章前后独立对照](ch40-ch41-ch42-header-results.json)的指标完全相同；本批未改公共UI。

## 主代理实际验证

[24条整合命令](ch40-ch41-ch42-checks.json)及[完整输出](ch40-ch41-ch42-checks.txt)通过，运行期间来源不变：全站结构/资源、17项校验器回归、三章audit与同源、作者实际SQLite契约、Java17编译运行、相关JS语法和diff检查。

- [本地事务/身份新输入](ch40-ch41-ch42-root-storage-results.json)：29项，覆盖回执丢失、同键换资源/版本、部分回滚、实际多连接最后库存/同键竞争、写者与freeze仲裁，以及NULL身份的应用和数据库两层拒绝。
- [Java17新输入](ch40-ch41-ch42-root-java-results.json)：26条协议预算/游标/writer断言、12条读资格断言，另有受控迟调度许可/I/O反例。作者原用例与主代理新fixture分别记录，没有累计成新的分布式实验数。
- [主要算式](ch40-ch41-ch42-numeric-review.json)：43处独立复算，涵盖payload内存、期限、日志保留、复制/分片/迁移、积压与净排空、重试、探针和Ready容量；全为标明的教学假设。
- [主代理一手来源抽核](ch40-ch41-ch42-root-sources.json)：WHATWG、RFC8470/9000、PostgreSQL、Kafka、SQLite、Kubernetes。作者与独立者另保留具体结论与版本的来源记录。

## 交叉独立复核与最终签署

三份独立报告均已正式通过，开放问题0。独立者分别阅读完整页面和全部示例，执行自己的正常/反例新输入，复算数字并核图、来源及实际页面；没有以作者runner或模型档位代替证据。

- [Ch40独立复核](ch40-independent-review.md)：31条实际Java新claim、原SQLite函数4组新轨迹及同截面反例、10处复算；12布局及CID修后4个受影响布局，D4/D7全帧两主题逐帧目视。fresh CID的P1在最终b078版本关闭。
- [Ch41独立复核](ch41-independent-review.md)：原ReadGate10条新断言、原SQLite适配器的多件/旧回执/末写失败/同key异请求进程竞争/旧写回滚fence，13处主要数字复算；24布局、160翻帧、4复制及修改组20个双主题画面。切前与停写后预算的P2在最终a955关闭，Shipping SQL只被记为合同见证。
- [Ch42独立复核](ch42-independent-review.md)：原DDL及apply的新身份/摘要/回滚/并发/真实退出轨迹；原Java的offset空洞、隔离舱和阻塞CF定时线程反例，预算与排空另作合同推演；24布局及修改组46个双主题画面。重试预算P2在最终fb1e关闭。

[最终171项一致性核验](ch40-ch41-ch42-evidence-consistency.json)通过，三份独立签署覆盖[26份最终章节和示例源](ch40-ch41-ch42-final-source-hashes.json)，并与实际浏览器、修改组截图、整合检查和主代理新fixture逐一对上。
这171项核验是来源与证据关系检查，不被计为171个运行时或分布式故障用例。

## 范围与限制

[授权前2173份文件基线](ch40-ch41-ch42-baseline.json)与[范围核验](ch40-ch41-ch42-scope-results.json)保护其他42章、公共UI/首页/工具及此前未提交代码和文字证据。
所有PNG仍在已忽略目录，未改gitignore。当前全站仍45章、276组1411帧，现195段代码。

真实运行限于本地Java17、SQLite文件事务/多连接/进程退出和Chrome页面。
未部署EventSource/QUIC/gRPC服务、复制数据库/目录/2PC、Kafka、远端支付或Kubernetes；未验证真实代理缓冲、远端取消、全局fencing、供电故障或生产压测。
新快照及可信连续前缀、日志保留、目录授权、幂等外部效果、真实I/O结束和排空适配等外部前提均在章节写明。

C累计**39/42章已验收**，本批任务锁全部清除。Ch43–Ch45尚待用户安排，Q未开始，F04留Q。
本批未提交、推送或部署，也未延伸Ch43–Ch45或Q。
