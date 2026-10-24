# C 第十四批 · Ch43 / Ch44 / Ch45 验收

2026-10-24。用户授权“重构下一波 用3个agent.”；三位明确选择的 GPT-6.1-Sol（`gpt-6.1-sol`）+ Max（`max`）各实施一章，再轮换只读独立复核。主代理统一登记锁、整合检查与落必要修复。**实施、交叉独立复核与主代理验收通过；无未关闭P0/P1或阻碍阅读P2。C累计42/42，Q尚未开始。**

## 范围与交付

授权前保存 2,314 份工作区文件哈希、三章原稿与动画清单：[基线](./ch43-ch44-ch45-baseline.json)。既有Ch19–42等未提交成果保持；本轮只改三章、其examples与专属证据、PLAN。共享UI/首页/工具和其他42章由[范围检查](./ch43-ch44-ch45-scope-results.json)核对。

| 章节 | 实施结果 | 独立复核者 |
|---|---|---|
| Ch43 超大规模数据 | 3段同源实现：有界外排、有限fan-in归并、自定义Catalog提交；明确全表3列37.5GB/租户4列50GB、pin/GC与next-offset连续前缀 | Ch45作者轮换：[独立报告](./ch43-independent-review.md) / [签字](./ch43-independent-final.json) |
| Ch44 微服务与服务治理 | 4段同源实现：受理事务、inbox事务、有限重试、进程内熔断；统一deadline、quota与资源收尾，Stripe引用限定API v1 | Ch43作者轮换：[独立报告](./ch44-independent-review.md) / [签字](./ch44-independent-final.json) |
| Ch45 DDD与领域建模 | 4段同源实现：不可变根方法、命令CAS/回执、收款决定与事件、消费事务；分别保护投递身份、资金事实与状态版本 | Ch44作者轮换：[独立报告](./ch45-independent-review.md) / [签字](./ch45-independent-final.json) |

作者记录：[Ch43](./ch43.md)、[Ch44](./ch44.md)、[Ch45](./ch45.md)。共新增11段关键代码，中文、英文、图注和闪卡同步；没有新增装饰图或重建共享组件。

## 已发现问题与返修

主代理在实施期发现并督促修复：外排仅枚举目录可能漏掉已完成run；retry在调度前固定220ms后又要求剩余完整220ms，拒绝正常正调度延迟；失败出口须归还本地槽位并收尾票据。异常类型用例P2也已纠正。旧版未动态捕获的发现按静态审查记录，没有把修后通过冒充修前失败：[阶段记录](./ch43-ch44-ch45-early-findings.json)。

交叉独立复核发现4项P1，全部保留初始反例并修后重验：

| 问题 | 修复与实证 |
|---|---|
| Ch43 单run无归并时，文件已丢仍返回不存在的候选 | 返回前实际打开/读候选；原B9/F2/3行反例现抛NoSuchFileException。仅证明交接可读，后续保留/发布fence另有责任。[反例](./ch43-independent-pre-single-run-fix.json) |
| Ch44 quota调用在try/finally外，异常漏资源收尾 | worker所有已持资源路径纳入外层try/catch/finally；quota同预算有界，未知不发I/O。实际Breaker/Semaphore控制流探针验证释放、代次与活I/O占槽；不冒称运行真实RPC。[修前](./ch44-independent-quota-before.json) / [修后](./ch44-independent-quota-after.json) |
| Ch45 SQLite版本溢出转REAL并成功提交 | 主代理加精确整数/64位递增前置检查与schema类型约束；max-1可到max、旧回执可恢复，max新写/收款整笔回滚。[初始反例](./ch45-independent-initial-probes.json) / [13项回归](./ch45-independent-regression-results.json) |
| Ch45 CAS=0被误归为业务隔离 | 主代理改RetryableConflict，整笔回滚且无可ACK结果；同事件可重入，关单后按唯一退款义务处理。CAS=0为受控分支注入，未声称真实PG竞态。证据同上 |

## 动画与真实页面

原21组110帧、220个title/desc标识和顺序完整保留。Ch43局修D2/D3/D4/D5/D7：全表授权/匹配spec、冲突与本地UNKNOWN区分、D4拥挤说明、D5贴Worker底注、半开位点区间；Ch44仅D5说明/desc同步实际发I/O前重查；Ch45全部37个SVG字节不变，仅图注纠错。

主代理对6个修改组的全部31帧生成62份双主题画面，实际打开12张原尺寸接触表，修后重新渲染有栅格变化时重新打开核对；另开改前全部末帧与代表真实窄屏，共22张不同路径实际图像，哈希见[目视记录](./ch43-ch44-ch45-root-visual-review.json)、[逐帧清单](./ch43-ch44-ch45-frames.json)。边框/字体bbox相交仅作候选，未机械改可读store主副标签；D4/D5实际拥挤已局修，最终无裁切或穿节点候选。[几何辅助](./ch43-ch44-ch45-geometry-after.json)不是目视替代。

最终真实Playwright矩阵：320/390/768/1440 × 双主题 × zh/en/both × 三章＝72布局；实际innerWidth=scrollWidth，展开折叠区后仍无整页横溢；440次翻帧、11段精确复制、播放/键盘/速度循环、闪卡点击与Enter/Space、已读和语言主题持久化通过，0页面/资源错误：[浏览器](./ch43-ch44-ch45-browser-results.json)。

320px both导航仍为约203px高，改前改后相同，按钮可用且740px视口余约537px阅读区；F04留Q，不扩本批公共UI。[基线对照](./ch43-ch44-ch45-header-results.json)。

## 整合与验证边界

最终25条整合命令通过、运行期间来源不变：[命令与输出](./ch43-ch44-ch45-checks.json)。覆盖45章结构审计、17项校验器回归、共享JS与批次脚本语法、三章代码同源、Java17编译/运行、真实SQLite本地事务与正常/失败反例。主代理另加27项Java新输入/竞争检查及20项存储新轨迹，共47项；独立复核者各有自己的输入、引用抽核和逐帧证据，不只重跑作者main。[Java](./ch43-ch44-ch45-root-java-results.json) / [存储](./ch43-ch44-ch45-root-storage-results.json)。

主代理独立复算53处容量、带宽、成本、重试、金额和积压算术：[复算](./ch43-ch44-ch45-numeric-review.json)；一手引用抽核的具体支持句见[主代理来源](./ch43-ch44-ch45-root-sources.json)及各章独立sources。

所有结果限于声明的本地外排、Java策略/对象规则、SQLite合同、控制流模型与真实浏览器。没有完整Parquet/Iceberg引擎、分布式Catalog、PostgreSQL、真实RPC/Broker/PSP、断电/网络故障或压测。候选、确认、取消、UNKNOWN与跨边界保证按各自合同解释。

最终源文件与测试/独立签字/目视/范围的逐项绑定（最终172项通过）见[证据一致性](./ch43-ch44-ch45-evidence-consistency.json)。Q尚未开始，未提交、推送或部署。
