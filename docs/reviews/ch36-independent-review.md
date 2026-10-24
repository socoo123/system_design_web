# Ch36 独立只读复核

2026-10-24，GPT-6.1-Sol (`gpt-6.1-sol`) + Max。**结论：通过；本次发现的1项P1、2项P2均已由原作者修复并独立关闭，无未关闭P0/P1或阻碍阅读的本章P2。** 最终页面SHA：`1e39fcc2845046ca2da2b39146aa1c97720b976ed7031feaa865ed61695051d7`。

复核者为同批Ch35作者，与Ch36原作者独立；只写本报告及`ch36-independent*`证据，没有修改Ch36页面、examples或共享文件。已读完整正文/英文、四段实现、全36帧title/desc与14张闪卡，再实际调用源码、重算数字并联网抽核。没有以作者runner或主代理早期结果代替新输入。

## 发现与关闭

[结构化清单](ch36-independent-findings.json)。

| 项 | 原始证据 | 作者修复与独立关闭 |
|---|---|---|
| **I1 · P1：已暴露错误/不持久终态被重试洗成good** | [初始实跑](ch36-independent-initial-finding.json)：同id、start0，100ms错误但durable的APPROVED，900ms正确durable的DECLINED，原counts返回(1,0)；不持久APPROVED后正确响应也返回good。与“错误/不持久终态不是good”矛盾。 | 改为原一秒窗内任何实际交付的错误/不持久APPROVED或DECLINED否决good；`observed_ms`明确为测量边界实际交付。UNKNOWN/PENDING/可重试非终态失败仍能在原期限内恢复。独立用77/888ms的两种终态×三种坏标志×两种前后顺序共12条新边界，加exact1000ms否决、UNKNOWN恢复及迟到/重设期限检查均通过。中英/README/闪卡同步。**关闭**。 |
| **I2 · P2：A10十倍事故流量的失败分支未点明** | 原段先列10%失败和全失败，后说只提事故流量十倍，却给12M bad/461.04%；只有全失败分支才得该值。 | 中文增加“在全失败分支再把”，英文对应full-failure branch。独立复算全失败12M与10%另分支1.2M，分母同为2,602,800,000。**关闭**。 |
| **I3 · P2：320代码头挤坏Copy** | [原始测量](ch36-independent-copy-results-initial.json)：320 EN/both两主题4块均高48.6875px，实际为Cop/y；390为正常28.34375px。首轮独立浏览因此真实失败，原结果保留于[ch36-independent-browser-results-initial.json](ch36-independent-browser-results-initial.json)，未说成通过。 | 原作者仅缩四个`data-language`为Pseudocode · contract / Python 3.10+，kind/正文解释保留。[精确差异](ch36-independent-label-proof.json)重建旧标签后哈希与实测旧页完全一致，证明代码/SVG/其他HTML不变。独立8组合32个代码头均28.34375px，EN/both两主题单行；最终18完整浏览组合通过。**关闭**。 |

主代理此前发现的D2标签P2不是本复核新发现：复核者已重新看D2全部5帧双主题，尤其F3–F5，`no messages`位于x575/y236，红虚线y248，`write / strong read`在下方独立留白。实际390中部横滚也可辨，两主题未重叠，**独立确认已关闭**。

## 实际新输入与作者runner分开

命令：`PYTHONDONTWRITEBYTECODE=1 python3 docs/reviews/ch36-independent-probes.py`。结果[ch36-independent-probe-results.json](ch36-independent-probe-results.json)绑定最终页和全部examples源码哈希。

**77项独立新输入断言**直接调用`slo.counts/budget/feature_gate`，没有导入作者run.py或numeric脚本来生成期望值：

- 完整cohort取`now3500/W2000`，原起点范围(500,2500]：左端排除、左端+1/右端包含、右端+1未成熟；保留无回包入口、期限相等/迟到、不持久/错误/202/起点前结果及非eligible记录。混合输入得到(9,6)，打乱/重复不改结果；推进1ms后旧good离窗且无回包旅程成熟，变(9,7)。
- 改原起点或eligible报数据质量错误；start37在1037ms完成可救、1038ms不能救。已暴露错误或不持久终态不能洗白，而UNKNOWN后999ms正确持久响应仍可good。
- E=7231、B=6/7/8的whole-event允许7、余额1/0/−1，另验1999/2001/1个事件。burn用有理数检查，零分母不当100%，非法计数拒绝。
- 以每短窗E=25,000的新输入跑16种高/低组合：快窗361 bad为14.44×、慢窗151为6.04×；每对AND、两对OR成立。另验14.4和6恰等于阈值不触发，两侧任一恢复都能解除那一对；有正月余额仍可HOLD_BURN。
- 四个短窗分别零分母、月窗零、telemetry不完整，均不放量；E7777/B7正好整数余额0仍按本章政策冻结，B8继续冻结；未审核/坏canary拦住下一档。缺窗/非法窗抛输入错误，调用方须视为测量失败，未冒称函数会自动处理监控缺失。

**另列3次作者无参history函数调用**：`cap_trace/quorum_without_writeback/percentile_example`重新执行得到对应输出，不把这3次重复场景算成新参数覆盖。**另列3项手工历史断言**：改成R1读A/C、R2读B/C仍有交点C却先1后0，枚举pending写在两读前/之间/后的三种顺序，无一得到(1,0)。这是本地历史推演，不是运行共识。

**作者runner独立重跑33项**，结果[ch36-independent-author-runner-results.json](ch36-independent-author-runner-results.json)；不把它们计入77新输入。[四片段逐字同源检查](ch36-independent-same-source.json)也独立读取页面与源码区域完成。

## 正常、失败与主要算式

重新推演一笔当前任期写：A本地持久→B持久ACK→完整协议判多数派提交/应用→A/API/Client成功；孤立C不能补成功，强读须当前leader/commit屏障且本地应用到位。写回包丢失返回UNKNOWN并查原id/payload，同状态机效果+回执前提明确；不能把伪代码借给另一业务数据库。add-only购物车两边local success、union并写回双方成立；删除/减量不在并集保证内。CAP正常/分区路径和quorum先新后旧反例的实时顺序都已对照图和伪代码。

**39项自行复算**在同一probe结果的numeric数组：3/7/83与串行8/84ms、20ms剩13/超63；30天43,200分钟，对应43.2/4.32分钟及25.92秒；10M事件允许10K、余额4K/40%、达成率99.94%；稳态2,592M eligible、2.592M allowance、20分钟10%坏120K/4.63%、全坏46.30%；十倍全失败分支分母2,602.8M、allowance2.6028M、12M bad/461.04%；独立串行99.8001%和冗余99.9999%；burn10、3天、剩40%约1.2天；14.4/6阈值与完整预算2%/5%。均是教学条件计算，没有实际p99、生产请求或故障注入数据。

[六份一手来源抽核](ch36-independent-sources.md)：CAP原始证明、Abadi原文、Google SRE告警/政策、etcd3.6、Raft扩展论文已在本轮直接联网复核。定义/原语和本章自设数字、30天/余额≤0政策分开，未引用2012品牌标签为当前产品默认保证。

## 动画、双语和真实浏览器

独立[最终渲染记录](ch36-independent-render-results.json)绑定最终hash，7组36帧全部原ID和顺序保留。已逐帧目视五个修改组D1/D2/D4/D5/D7的**26帧×两主题=52幅**：D1拒绝直回，D2短失败线与标签分离，D4持久ACK未冒称强读，D5错误沿Ledger/API/Edge/Client逐跳，D7安全回退与repair/review反馈线清楚。没有只看终帧或拿几何计数代替目视。

- [D2浅色全部帧](screenshots/ch36-independent/after/d2-parchment-contact.png) / [深色](screenshots/ch36-independent/after/d2-dracula-contact.png)
- [D5浅色全部帧](screenshots/ch36-independent/after/d5-parchment-contact.png) / [深色](screenshots/ch36-independent/after/d5-dracula-contact.png)
- [D7浅色全部帧](screenshots/ch36-independent/after/d7-parchment-contact.png) / [深色](screenshots/ch36-independent/after/d7-dracula-contact.png)

[独立真实Chrome最终结果](ch36-independent-browser-results.json)：**320/390/1440 × 两主题 × zh/en/both，共18组合**，actual innerWidth=scrollWidth，展开details仍不整页横溢；144次翻帧、4段复制逐字、键盘/播放/倍速/循环、闪卡与进度/设置持久化通过，pageerror/HTTP错误0。EN可见代码没有整段中文，14张卡均在网格内。320与390是真实Playwright viewport，没有CLI裁切。

另[8个Copy定向组合](ch36-independent-copy-results.json)覆盖320/390 × 两主题 × EN/both，共32个代码头单行。实际目视[320 EN修复后](screenshots/ch36-independent/copy/320-parchment-en-code1.png)、[桌面counts与新谓词](screenshots/ch36-independent/browser/1440-dracula-code3.png)、[390 D2中部](screenshots/ch36-independent/browser/d2s4-parchment-middle.png)、[D7右侧](screenshots/ch36-independent/browser/d7s6-dracula-right.png)。窄屏图在slide内横滚，横滚中图注也随既有容器移动，回左可完整阅读，不当缺字故障。

[最终检查](ch36-independent-check-results.json)：全站check、本章audit、git diff --check通过。复核起点[source-hashes](ch36-independent-source-hashes.json)的before是2d48bd…，after是1e39fc…，**unchanged=false属实**：期间原作者修了上述逻辑/文字/标签4份文件，复核者未写它们。另[最终冻结后独立阶段字典](ch36-independent-final-source-hashes.json)记录全部六份源码before/after相等、**unchanged=true**，并与作者final-hashes逐项匹配；没有通过覆盖原before伪造全程没改。

## 仍未执行的范围

没有真实共识/etcd集群、网络分区、磁盘/复制、业务账本、跨机时钟、真实用户/客户端覆盖率、迟到watermark、监控后端、发布/回退或生产压测。correct/durable/telemetry_complete由可信外部测量提供；本地函数发现不了根本未输入的入口记录。已交付终态的原一秒SLI与更晚业务错误审计是不同责任，不能用good旅程替代完整财务/业务正确性审查。低流量最小样本、紧急修复批准和schema安全检查仍是明确外部政策。

最终本章可以进入主代理整合验收；本报告不代表提交、推送或部署授权，也不扩展其他章。
