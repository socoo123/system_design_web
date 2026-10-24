# C第十一批 · Ch34 / Ch35 / Ch36

2026-10-24。用户授权“重构下一波 用3个agent.”。
三位GPT-6.1-Sol（`gpt-6.1-sol`）+ Max（`max`）各实施一章，再交叉只读独立复核，没有另派agent。
**三章实施、交叉独立复核与主代理验收通过，追踪的5项P1及阅读/元数据P2全部关闭。**

## 内容与实现

| 章节 | 交付 | 作者 / 独立复核 |
|---|---|---|
| Ch34 Agent编排与运行时 | 持久接单/owner、固定外部输入与已存输出、两库恢复、审批/取消/补偿；真实SQLite领取SQL及3段同源伪代码 | [作者](ch34.md) / [Ch36作者复核](ch34-independent-review.md) |
| Ch35 大模型基础架构 | 完整bundle/整组READY、多维准入与物理退休、故障域预算、兼容发布/回退/drain；Java17及3段SQLite适配摘录 | [作者](ch35.md) / [Ch34作者复核](ch35-independent-review.md) |
| Ch36 CAP / PACELC / SLO | 操作承诺、quorum先新后旧反例、持久与读屏障、完整旅程cohort、整事件预算和双窗口放量门；4段同源代码 | [作者](ch36.md) / [Ch35作者复核](ch36-independent-review.md) |

三章原本没有pre，本批新增12段实现，均与examples逐字核对。假设/详细推导折叠，机制与代码就近，中英、图注及13/14/14张网格闪卡同步。
没有新建静态图：现有终帧足以承担总图，原动画继续播放。

Ch35明确C=4/s是未实测接纳容量假设，goodput不能直接充当C；9副本跨3机失1机后，同80%预算只有19.2/s。
若保持相同预算，三机均衡最少11副本（4/4/3），幸存22.4/s；12/20卡继续沿用允许故障降级的9副本方案。
Ch36把原一秒内已交付的错误/不持久终态定为bad，不能由后一次正确终态洗白；UNKNOWN/PENDING仍可在原期限内恢复。

## 发现、返修与独立关闭

| 级别 / 触发 | 修复与证据 |
|---|---|
| P1 · Ch34连续派发两动作，取消后先记一笔失败，另一笔仍在途却终止run | 主代理[真实初始轨迹](ch34-ch35-ch36-runtime-initial-issue.json)复现。加入串行dispatch门；遗留多在途优先CANCEL_REQUESTED，逐个核账。作者、独立复核与主代理新输入均关闭。 |
| P1 · Ch35写锁等待跨deadline，使用锁前传入时间 | 改为拿到BEGIN IMMEDIATE后调用clock。主代理新fixture和独立复核者四种真实monotonic跨锁测试，覆盖reserve/dispatch/consume/expire，锁等待时采样数0、锁后按新时间拒绝/到期。 |
| P1 · Ch34取消后回执SUCCESS，OBSERVED却写成COMPENSATING | 独立[初始事件证据](ch34-independent-observed-event-finding.json)。动作outcome与run下一状态分离，成功/已知失败/补偿事件逐项重验；事件、动作表和回执一致。 |
| P1 · Ch34先observe成功再cancel，无在途却卡在CANCEL_REQUESTED | 独立[初始恢复证据](ch34-independent-cancel-confirmed-finding.json)。cancel按pending/confirmed/no-effect分类，已确认效果直接COMPENSATING，重复终态取消保留语义；独立完整退款与主代理新输入关闭。 |
| P1 · Ch36同一旅程先给错误/不持久终态，后给正确终态被any-good洗白 | 独立[初始输入](ch36-independent-initial-finding.json)。原期限内已暴露坏终态否决good；观测时间明确为测量边界的实际交付。独立12种坏标志/前后顺序等新输入及主代理重验关闭。 |

阅读与定位修正也已关闭：Ch36 D2短线修复后的标签重叠、Ch34/Ch36真实320px代码标题挤坏Copy、Ch35两处无障碍说明残留benchmark措辞、Ch36 A10十倍流量明确为全失败分支。
Ch34另明确前置事务产生attemptVersion，结果提交不复用旧version，并将unixepoch所需SQLite最低版本统一为3.38+。
源码、正文、英文、图注与闪卡随对应修正同步。

## 动画与实际目视

原**20组106帧、全部212个动画title/desc ID及帧序保留**。Ch34改25/37份SVG，Ch35改20/33份（其中2份仅无障碍术语），Ch36改13/36份；48份SVG逐字保留。
没有删帧、换组或借图数配额增图。

[最终修改组全帧](ch34-ch35-ch36-frames.json)为14组76帧×两主题=152个画面，28张全帧接触表均由主代理实际打开查看；另看6张改前和6张最终终帧表。
[主代理目视记录](ch34-ch35-ch36-root-visual-review.json)保存40张图和3张真实390px代码页的当前哈希。
中途40张重渲染全部逐字相同；最终元数据/标题收口后，[38张相同、2张变化](ch34-ch35-ch36-final-render-comparison.json)，变化的Ch34浅色D1全帧及终帧表已重新打开核看，未沿用旧图结论。

Ch34局修圆柱行距、commit k9与恢复拒绝标签；Ch35局修入口边界、失效故障域、多维/派发门标签和直连热回退；Ch36局修拒绝/失联/故障回程、持久屏障名称及回退修复环。
[D2原重叠与修复](ch34-ch35-ch36-diagram-label-issue.json)保留实际错误截图，原作者、主代理与独立复核者均看过修后全部D2帧两主题。
几何只作定位；圆柱文字bbox的候选按实际字形核看，没有用“无页面溢出”代替图内验收。
作者及独立复核另实际检查窄屏图内左/中/右横滚，未用Chrome CLI裁切冒充手机。

## 主代理实际执行

[30项最终整合命令](ch34-ch35-ch36-checks.json)及[完整输出](ch34-ch35-ch36-checks.txt)通过，执行期间26份章节/示例/公共JS源码未变化。
包括全站结构/资源、17项校验器回归、三章audit/同源、实际示例、Oracle Java17编译/运行、JS语法与diff检查。
作者模型实跑Ch34的101项（含15复算）、Ch35的105项SQLite、Ch36的33项；这些断言不代表同等数量的独立分布式实验。

- [Runtime独立新输入](ch34-ch35-ch36-root-runtime-results.json)：27项，涵盖固定输入/token、串行/UNKNOWN、取消迟到成功、事件outcome、遗留多在途、已确认效果再取消、补偿及完整审批绑定。
- [Fleet独立新输入](ch34-ch35-ch36-root-fleet-results.json)：29项，涵盖tenant/rid隔离、5连接争最后KV信用、部分事务回滚、锁后时间、唯一派发、发布幂等/旧route/schema、旧流drain及可信物理完成通知后的唯一释放。
- [SLI独立新输入](ch34-ch35-ch36-root-slo-results.json)：23项，涵盖完整cohort/原期限/eligible、混合与重复输入、错误终态不洗白、UNKNOWN可恢复、整数预算及双窗口严格阈值/AND/OR。三类共79项。
- [62处独立复算](ch34-ch35-ch36-numeric-review.json)：模型内环流量/活跃与待批/增量留存，正常与故障预算/11副本/发布重叠，复制延迟/事件与时间预算/burn/依赖条件。
- [最终真实浏览器](ch34-ch35-ch36-browser-results.json)：320/390/768/1440×两主题×三语言，72个不同组合；展开details无整页横溢，424次翻帧、12段逐字复制、播放/键盘/闪卡/进度及设置持久化通过，页面/资源错误0。
- [320代码头专项](ch34-ch35-ch36-code-header-preview.json)：三章EN/both的4个按钮均为28.34375px。最终全矩阵也对320检查Copy物理单行；both的slash/Copy可形成同一行两个inline fragment，按top去重，未误作两行。
- [主代理一手来源抽核](ch34-ch35-ch36-root-sources.json)：LangGraph当前checkpoint/replay/durability、CAP作者综述、Google SRE、Kubernetes故障域及SQLite最低版本；作者和复核者另核原论文与各产品固定版本/适用边界。

修前通过的浏览器矩阵也保留为[旅程谓词修前](ch34-ch35-ch36-pre-slo-predicate-browser-results.json)及[短标题修前](ch34-ch35-ch36-pre-header-browser-results.json)，没有把布局/交互通过冒称技术正确。

## 交叉独立复核

Ch36作者复核Ch34：62项新输入、20复算、101项作者runner另列；最终24布局/148翻帧/4复制与37帧双主题目视通过，取消/事件问题均关闭。
Ch34作者复核Ch35：72项检查中含17项复算与实际Java17，105项作者runner另列；四类真实锁等待跨截止独立关闭P1，最终24布局/132翻帧及全33帧双主题目视通过。
Ch35作者复核Ch36：77项新输入、39复算，3次作者history函数调用与3项手推分列，33项作者runner另列；最终18布局/144翻帧/4复制与320/390专项通过，旅程谓词和2项P2关闭。

三份复核均完整核对中英、图、代码、闪卡和一手来源，且只写自己的复核证据。
Ch34最终签署九份before/after相同；早期错误源码与finding另留。
Ch35/Ch36初始before与after不同，如实保留作者返修过程；最终after均覆盖并匹配当前全部章节/示例源码，没有覆盖旧before假称全程没改。

## 范围与交接

[授权前1761份文件基线](ch34-ch35-ch36-baseline.json)与[最终范围核对](ch34-ch35-ch36-scope-results.json)确认：其他42章、公共UI/首页/工具和全部既有未提交代码/文字证据保持授权前哈希。
截图继续按既有规则保留本地；未改忽略规则。
[最终119项源码与证据一致性](ch34-ch35-ch36-evidence-consistency.json)通过，核对整合命令、浏览器、79项主代理新输入、62复算、实际目视图像和三份独立after字典。

实际运行Java17、Python标准库SQLite文件/多连接/进程退出、确定性SLI历史与真实Chrome。
没有真实LLM/工具审批/签名、供应商账单、GPU/CUDA/模型warmup、Kubernetes/TP、共识/复制切主、真实监控/时钟/客户端覆盖率、网络SSE或生产压测。
物理完成、当前授权、完整输入与计量证据、真实容量/质量及完整workflow迁移仍是逐章明确的外部前提；本地测试不证明生产可靠性。

全站仍为45章、276组、1411帧，现173段代码。C累计**33/42**章验收，三章任务锁清除；Q仍未开始。
仅交付本批，不自动延伸Ch37。未提交、推送或部署。
