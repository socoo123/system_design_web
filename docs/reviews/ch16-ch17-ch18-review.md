# Ch16 / Ch17 / Ch18 本批整合验收

2026-10-23，用户授权“重构下一波 用3个agent”。本批按 PLAN §7 处理 Ch16 评论系统、Ch17 API 网关、Ch18 电商订单。三位子 agent 派发均明确设置 `model: "gpt-6.1-sol"`、`reasoning_effort: "max"`；先各实施一章，再交叉只读独立复核，主代理负责共享文件和最终验收。

**已完成实施、交叉独立复核和主代理验收；复核发现的1项P1已修复并独立重验关闭，无未关闭P0/P1或阻碍阅读P2。** 不延伸其他章节，未提交、推送或部署。

## 范围和基线

[授权前基线](ch16-ch17-ch18-baseline.json)保存8,654个既有工作区文件的SHA256、未提交状态及三章动画清单。[原始HTML](ch16-ch17-ch18-baseline/)保存Ch16的6组30帧、Ch17的6组30帧、Ch18的6组25帧，共18组85帧。基线来自授权时的工作区，包含前批既有未提交成果；不以HEAD替代。

范围仅PLAN、三章HTML、对应examples/diagrams/assets/diagrams专属资源及本批审查证据。共享CSS/JS、首页、工具和其他42章须保持授权前哈希。[范围脚本](ch16-ch17-ch18-scope.mjs)用于核对。

## 主代理独立预审

[数字复算](ch16-ch17-ch18-numeric-review.json)从原章教学输入重新计算62项数值，使用Fraction保留精确值；数字均为假设与推导，不是生产测量。

- 评论：发评峰值1,157.407/s、点赞5,787.037/s、列表8,680.556/s；95%命中约434.028页/s回源，对600预算还剩165.972页/s。20楼各3预览最多80条正文。10个100/s审核worker在十分钟峰值下积压94,444.444条。全年三份正文10.95–21.90TB，另计索引等。
- 网关：四台各可用4,000QPS，N−1留下12,000；验签总计两核CPU；转发两侧合计每方向480Mb/s，正常每台120，N−1每台160。BFF并行示例140ms、串行260ms，均非组合p99。重试5%产生的500/s与10,500/s是稳态估算；允许额度积存时必须另说明突发，不能承诺任意一秒硬上限。
- 订单：创建峰值115.741/s，付款81.019/s，通知162.037/s，到期关单34.722/s。按口播116估十五分钟全未付最多104,400份预留；热门SKU预扣和终结合计约232次修改/s，高于5ms锁时长给出的理论200/s。事件积压139,200，持续新到1,160/s，净840/s需165.714秒。十分钟关单积压21,000，恢复净追赶35/s需600秒。

主代理重新抽核的一手来源及边界：

- [PostgreSQL18 LATERAL](https://www.postgresql.org/docs/18/queries-table-expressions.html#QUERIES-LATERAL)：关联子查询逐个外层行求值，支持每楼上限；不等于总工作量只有一次探测。
- [PostgreSQL18隔离](https://www.postgresql.org/docs/18/transaction-iso.html)：Read Committed的独立SELECT快照会变化；并发UPDATE等候后重查目标行WHERE。任意多行不变量仍需明确锁和事务。
- [RFC9110 §9.2.2](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2)：代理不能自动重试非幂等请求；应用幂等身份不由单个header自动兑现。
- [Envoy circuit breaking](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/circuit_breaking)：连接、待处理、在途与重试等资源限制，与教学健康三态分别描述。
- [Stripe幂等](https://docs.stripe.com/api/idempotent_requests)：首次响应重放和至少24小时后可清理属于API v1的具体约定；API v2行为不同，正文须限定。
- [Stripe webhook](https://docs.stripe.com/webhooks)：重复和乱序事件需要业务处理；事件身份与真实收款身份承担不同去重责任。

[原图终帧](screenshots/ch16-ch17-ch18-root/before/)保存18组两主题，主代理已目视三章接触表。[原图几何候选](ch16-ch17-ch18-geometry-before.json)另外定位Ch16 D1/D4/D5/D6入口标签跨boundary的问题家族，以及Ch18 D1F4、D4F4路径中的NaN。已反馈作者实际目视并局部修正；store标题/副标题字框候选须结合真实图判读，几何扫描不构成视觉合格结论。

## 实施结果

| 章节 | 最终主线与实现 | 作者证据 |
|---|---|---|
| Ch16 评论 | 曾公开root容器与脱敏墓碑、每root有界LATERAL与复合游标；同hash一次HSET的点赞目标态、冻结批次/ACK/唯一账本；同帖审核事务与版本、BUSY单飞和故障旁路、绝对发送期限。5段同源代码。 | [作者](ch16.md)、[示例契约](../../examples/ch16/README.md) |
| Ch17 网关 | 固定不可变政策/认证上下文、三值限流与固定池降级、单次期限和保守GET/HEAD重试；累计信用、真实本地流许可、epoch探针。2段伪代码+3段Java17教学节选。 | [作者](ch17.md)、[示例契约](../../examples/ch17/README.md) |
| Ch18 订单 | 请求/完整意图/原创建回执、整篮预留与HELD归属；稳定支付尝试与首次对象绑定、按capture接受/退款/核对责任；完整付款inbox、唯一履约任务与失败可再发现的扫描。6段同源伪代码。 | [作者](ch18.md)、[示例契约](../../examples/ch18/README.md) |

正文压缩重复复述，将完整假设和扩展问题按需展开，关键前提、算式与失败分支留在机制附近。中英、图注/desc、代码解释与38张统一网格闪卡同步。三章原无代码，本批增加16段，全站63→79段，数量仅作盘点；Java节选明确标teaching并链接可运行完整类，其余SQL/Lua/伪代码各自标识。

原18组85帧、帧序和title/desc ID全部保留，40帧SVG逐字节不变。Ch16改25帧局部边界/事实标签，入口问题按D1/D4/D5/D6家族修全；Ch17改15帧，压缩D2/D4节点并为分支标签留通道，纠正每original与累计重试预算；Ch18改5帧，仅D1F4和D4F4改变路径几何，另同步inbox事实标签。未新增重复总图或D2。[范围结果](ch16-ch17-ch18-scope-results.json)逐帧列出差异。

实施期还修正了以下代码/承诺缺口：无耐久点赞成员不能由持久整数重建，重启/切主/快照恢复必须有入口恢复栅栏；一评论仅一冻结批次in-flight避免负增量先于对应正增量刷库；缓存BUSY等待者不回源，故障旁路仍受总配额；支付对象首次绑定与未知attempt责任落地，晚REVIEW不覆盖已CAPTURED，恢复读取同一provider_binding字段。它们是实施期纠错，独立复核结论另列。

## 交叉独立复核

实施冻结后，Ch18作者复核Ch16、Ch16作者复核Ch17、Ch17作者复核Ch18；只读作者文件，问题由原作者返修，再由复核者重验。

- [Ch16独立复核](ch16-independent-review.md)通过：44项独立新输入，直接抽取实际SQL投影/续页、执行原Lua与冻结账本，核对恢复栅栏、审核与缓存契约；24真实布局/120翻帧/5复制，修改五组全帧两主题及真实390入口家族已目视，冻结hash保持。
- [Ch18独立复核](ch18-independent-review.md)通过：50项新输入直接调用实际SQLite模型，重跑作者99项（输出仅写独立证据），含另一单已重新预留后的迟到收款、507行跨批失败找回；24布局/100翻帧/6复制，全25帧两主题及修改组390实际目视，冻结清单保持。
- [Ch17独立复核](ch17-independent-review.md)通过：原8,968项oracle/并发检查后实际定位锁外时间乱序P1；最终另5,119项固定时钟/全窗oracle/真实monitor阻塞探针及作者50项通过，最终24组合/120翻帧/5复制、30帧两主题及真实390改动组目视完成，P1正式关闭。

Ch17复核者用实际Java定位1项P1：`complete`的时间参数在锁外采样后可能乱序入锁，队尾追加/仅从队首过期会把旧失败计入当前10秒窗并误OPEN。原反例与8,968项独立oracle/线程检查见[复核源码](ch17-independent-GatewayReview.java)及[结果](ch17-independent-java-results.json)，原页面与Java在[初版快照](ch17-independent-initial/)保留。作者已修为锁内观察时点的注入单调时钟，`enter()`与`complete(ticket,ok)`不再接收外部时间参数；样本与五秒冷却共用该时钟。迟到回调直到入锁才算被观察，因此旧物理事件在10001ms被观察可以合法OPEN，未把新定义套回原反例宣称原实现正确。正文/英文/README/图注/闪卡已同步。作者50项及主代理1,035断言/受影响24组合通过；独立复核者另5,119项窗口oracle/真实monitor阻塞探针及最终页面重验通过，P1在最终源码哈希关闭。

## 主代理整合验证与视觉

[运行器](ch16-ch17-ch18-validate.py)、[17项命令输出](ch16-ch17-ch18-checks.txt)和[源码哈希](ch16-ch17-ch18-checks.json)均已实际通过：全站结构、三章audit、播放器语法、diff、16段页面/源码逐字一致，Java17.0.10编译与作者50项、主代理1,035断言、评论67项实际Redis/SQLite及契约、网关41项适配器模型/算术、订单99项实际SQLite契约及[主代理28项新增输入](ch16-ch17-ch18-root-order-results.json)。Ch17返修后只重验受影响章节与整站结构/空白，其余章节保留已核验且哈希未变的结果。全站45章/276组/1,411帧/79代码块；3条既有迁移提示来自本批之外，三章audit无迁移提示。

主代理Java探针直接调用实际GatewayPolicy，覆盖截止前1ms/无刷新预算、POST保守拒重试、积存125信用突发、实际本地流终止才释放、旧普通/探针结果不改变新epoch，返修后还以Thread.holdsLock验证时钟在monitor内读取、99个迟到回调按观察入窗及精确十秒过期。其中800条是顺序持有许可至饱和，不是800线程压测。订单补充探针直接加载实际model，用不同作者测试的两SKU、Alice/Bob输入验证跨owner同key、部分终结回滚、另一单归属、过期报价下原回执重放、UNKNOWN、capture已提交而inbox未DONE、多事件/多收款/核对任务、付款胜出后禁止到期释放和库存守恒。

[浏览器脚本](ch16-ch17-ch18-browser.mjs)和[结果](ch16-ch17-ch18-browser-results.json)实际覆盖三章×320/390/768/1440×两主题×zh/en/both，共72个不同组合。默认及展开所有details后innerWidth=scrollWidth，340次翻帧、16段逐字复制、键盘/自动播放/速度/循环、闪卡点击/Enter/Space、已读与偏好重载持久化均通过；无页面或资源错误。使用Playwright真实viewport，没有用Chrome CLI裁切图冒充手机。

作者对全部85帧两主题逐帧目视；修改组另作真实390左/中/右视图。主代理目视前后18组终帧接触表，另单看Ch16 D6浅色、Ch17 D4深色、Ch18 D4深色及三章390代码截图；对照确认入口标签、BFF分支通道与ACK/inbox图义。Ch17返修后额外[4个局部预览](ch16-ch17-ch18-breaker-preview.json)覆盖390/1440两主题，实际目视新Java代码及中英观察窗解释。[几何辅助](ch16-ch17-ch18-geometry-after.json)无非法数值、文字裁切、boundaryCrossings或nodeCrossings；store标题/副标题字框候选在实际图中分行可读，未把几何候选机械当缺陷，也未用页面无溢出替代图内目视。

上述证据目前均绑定以下冻结HTML：

- Ch16：`51ab82ad45b71a1b4e8660d188fd5b52a7c34046c058770012c06af9eb179eed`
- Ch17：`213c360c3a126a8fc2ccc75b2879e7ac7c7ff126279e9256d80817cc7b9f3b0c`
- Ch18：`12d726880da511952ab0cb4cd66ff35bc2a4a55911ee30b13c8d680159add2bb`

## 验证边界与最终收口

未运行真实PostgreSQL行锁/复制、Redis集群/AOF/切主恢复、JWT密码学与HTTP代理、mTLS/部署转交、真实支付/验签/仓库/退款、跨机时钟/网络故障或生产压测。SQLite的BEGIN IMMEDIATE粒度更粗，Java仅是本地政策内核，适配器模型不能证明真实依赖已实现。所有容量/时效均为教学假设或依赖契约，没有声称生产SLO实测。

共享UI既有320/both品牌换行及大图横滚时图注随slide移动的表现保持。其他42章、公共CSS/JS、首页、工具与前批既有成果当前均匹配授权前哈希，无越界新增或删除。未提交、推送或部署。

[证据一致性脚本](ch16-ch17-ch18-evidence.py)与[结果](ch16-ch17-ch18-evidence-consistency.json)确认页面/示例、主代理检查、浏览器、几何、局部预览、作者和独立报告都对应上列最终源码哈希，无过时源文件。报告结论由主代理实际阅读判断，文件存在不构成通过。

本批任务锁已清，PLAN更新至C阶段15/42章已验收；后续章节等待用户下一次安排，未提交、推送或部署。
