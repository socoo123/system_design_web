# Ch24 支付系统 · 交叉独立复核

2026-10-23，GPT-6.1-Sol（`gpt-6.1-sol`）+ Max。结论：**通过；本次发现的2项P1与2项P2均由原作者返修并经独立重验关闭，没有未关闭阻塞项。** 只读复核完整页面、30帧图/图注、双语、14闪卡和所有示例源码/README；未修改目标HTML、示例、作者报告、PLAN或共享资源。仅写本文件与 `ch24-independent-*` 专属证据。

最终页面SHA256：`813ed6d22b42b442ede14fd1d131809a7496927982b53a33188676d7ee413428`。[完整before/after源哈希](ch24-independent-source-hashes.json)含初始/最终14文件映射及两次原作者授权返修链；最终after逐字节匹配当前文件与批冻结。来源表仅作背景，下面的代码、浏览和引用均独立执行/核验。

## 发现、反例与关闭

| 级别/位置 | 初始问题与反例 | 原作者修复和独立重验 |
|---|---|---|
| P1 · `create.pseudo`原第3/10行 | 直接把 `body.businessVersion`用于摘要和业务意图键，而 `verifyOrderAndPrice`调用点没有显式比较授权版本。原正文却承诺浏览器不能加版本。相同order quote、换header并改body版本可在伪代码中绕到另一业务意图身份。原Store.create已声明是trusted fixture，任意调用其version参数不能被当作真实API漏洞证明。 | raw入口先核quote所属环境/商户、order、严格整数版本与method；意图键、摘要、冻结参数只取quote。新增VerifiedQuote/create_request。复核者用新授权版本7、5299 CNY/hosted-card测试：body改8、改方法/订单、True对版本1、异商户/环境quote均拒绝且四表无新增；换header仍同pay，额外客户端金额/币种/商户字段不改变冻结事实。关闭。 |
| P2 · 容量details | 将约162/s取整后写十分钟“上界/at most97,200”，原推导实际162.037…/s，回调数还是平均值。 | 两语改为名义持续到达率与取整条件下的估算，明确非硬上界；97,200/338/约288保留。独立Fraction复算并核对双语。关闭。 |
| P1 · D5F4/F5 SVG/desc/图注 | timeout红线原从PSP `(872,110)`回Pay worker，desc明确“failure returns PSP to Pay worker”。PSP已执行退款但回复丢失时，只有worker本地timer到期，不存在PSP返回的timeout消息。 | 两帧改worker自身timer回环，两端 `(680,110)`/`(612,110)`均在worker顶部；F4普通回复淡化并标no reply，desc/双语明确本地UNKNOWN与保留2000；F5淡化本地timer，恢复真实权威成功回程。独立重渲染/目视D5全部5帧双主题与真实390全部左右/中间，模型UNKNOWN/晚成功额度转换重跑。关闭。 |
| P2 · D2F5图注 | 只说确认“没扣款”可开新尝试，弱于正文/代码已要求的“旧命令不会未来执行”。 | 两语补旧对象/命令永久不可再执行且新尝试须授权，和主线一致；逐帧及图注核验关闭。 |

两次授权返修分别为 `1e3e6659… → 19763e35…`（quote/名义估算）和 `19763e35… → 813ed6d2…`（本地timer/新尝试前提）。第二次只有HTML变化，示例代码与quote冻结相同。定位与关闭记录见 [findings](ch24-independent-initial-findings.json)。

## 独立实际代码探针

[独立脚本](ch24-independent-probes.py)实际导入当前 `Store`/SQL执行 **67项**新输入/反例，结果：[model results](ch24-independent-model-results.json)。未执行作者check.py冒充新复核，未覆盖作者默认结果文件。每次调用前后14源码hash一致。

- 新输入19007、sandbox/review-merchant/review-acct，受理→同header/换header仍同意图；不同商户同文本身份分开；冻结摘要不变。
- SENT先持久；模拟缓存AMBIGUOUS_500与丢响应，固定777秒窗口不被99999秒新参数延长；在原截止点拒发且UNKNOWN不变，成功后迟到超时/失败不能覆盖CONFIRMED。
- 无效验真fixture不能进入inbox；同event重投一行，不同event指向同capture两行；同接收身份换body保留异常。`verified=True`仅为上游已验证契约，没有声称实际SDK验签。
- capture在第一分录后注入崩溃，header/entry/aggregate/outbox全回滚。错环境、渠道、账户、币种或19006金额拒绝；平衡模板错额拒绝。正常19007生成两条完整分录/一个paid事件；同scope外部效果不能绑定另一个payment，第二distinct capture不新增账。异常资金的完整suspense流程仍属明确排除范围。
- 预留5003与4001、UNKNOWN维持9004；同退款key不二占，换数量拒绝。成功转换5003后reserved4001/refunded5003、余量10003。将同external refund交给第二local refund，真实UNIQUE异常使整事务回滚，第二笔仍RESERVED，未再结转金额/通知。
- 两个独立SQLite连接同时争最后7000额度，只有一胜；未知额度不供新退款花用。最终无退款释放一次；重复成功/迟到矛盾失败不改变已成功额度，并留Review。退款首分录故障也整体回滚。
- 对账补记6173，注入“posting已提交、case未关闭”崩溃；重跑原效果键只关闭case，不二记、不新扣款。历史UPDATE被触发器拒绝，逐posting/currency检查全账平衡、聚合预算界限成立。
- 负对照实际证明：持有裸SQLite连接的调用者可绕受控过程提交单边分录。正文明确生产必须限制raw INSERT/走Posting或可靠延迟约束；这不是schema本身保证，也没有把该未实现权限部署当已验证。

模型是本地SQLite BEGIN IMMEDIATE串行化，不能证明PG行锁/复制切主或渠道幂等保留/时钟/网络界限。ProviderFixture没有真实资金、签名、HTTP和30天/v1窗口执行器。

## 复算与一手引用

创单峰115.7407/s，成功81.0185/s，回调162.0370/s；名义162/s时积压97200、净338/s、约287.574秒即约288秒。年度365 GB +102.2 GB +511 GB=978.2 GB，三份2.9346 TB；只覆盖所列三类原始数据，未含索引/WAL/退款等。退款图10000−3000−2000=5000，成功后10000−5000−0仍5000。手续费例净应收9700+费用300=应付10000，平台视角/未结算和未出款前提明确。

[11份一手来源独立核验](ch24-independent-sources.md)包含Stripe API v1/v2、24h/500未知、raw-body/重复与乱序、退款/币种，PG18 CHECK/WAL，TigerBeetle借贷方向、Adyen结算范围及AWS outbox。当前官方页支持v1首响应含500缓存与前24h重放指导；v2有不同语义/30天条件。网页事实与本章设计的inbox、预留、W、safeReplayWindow分开，未拿厂商契约证明自建系统。

## 浏览与逐帧复核

[独立浏览器](ch24-independent-browser.mjs) / [最终结果](ch24-independent-browser-results.json)：最终813ed6…上 **12组合**（真实390/1440×两主题×zh/en/both），默认及全部details展开后innerWidth=scrollWidth=设定宽度；无pageerror/资源错误，目录锚点有效。14闪卡实际统一grid，8源码块逐字匹配并全部复制校验；键盘/播放暂停、闪卡、主题语言与已读重载通过。320/768和整批共享回归由主代理另做，不算本复核已测。

独立重走全部6组30帧，120次实际翻帧，并重渲染全部帧×两主题60张，按12份接触表逐帧目视；D2/D4/D5三修改组另实测真实390下每帧左右/中间横滚，共90张。图内标签无压线遮挡，节点与帧序连续。9帧SVG局部变更，只有D5F4/F5几何改变，其余21帧SVG逐字保留；60个title/desc ID完整保留。[动画对比](ch24-independent-animation-results.json)。几何对比只用于保留核对，没有替代目视。

代表：[D5误图原帧](screenshots/ch24-independent/d5s4-parchment-frame-before-timeout.png) / [最终浅色全组](screenshots/ch24-independent/d5-parchment-contact.jpg) / [最终深色全组](screenshots/ch24-independent/d5-dracula-contact.jpg)、[D5真实390](screenshots/ch24-independent/d5-parchment-mobile-contact.jpg)、[D2真实390](screenshots/ch24-independent/d2-dracula-mobile-contact.jpg)、[D4真实390](screenshots/ch24-independent/d4-dracula-mobile-contact.jpg)、[最终手机退款代码](screenshots/ch24-independent/390-dracula-refund-code.png)。公共UI既有图注随横滚移动，左滚回可读，未越权改共享CSS。

最终[证据一致性结果](ch24-independent-results.json)与[只读检查日志](ch24-independent-checks.txt)核对14源码before/after/批冻结、67探针、12布局、120翻帧、60渲染、90窄屏图、8复制与全部关闭记录。

未验证：真实PSP/SDK签名与时钟容差、固定窗的实际渠道保证/任意进程暂停/延迟运输、生产Posting角色权限、PG同步复制/切主、报告完整性生成器/真实一致快照、部分capture/出款/争议/完整suspense、生产压测或真实资金。均为正文/README已列的实现前提与范围，不将本地验证冒充生产可靠性。本次未提交、推送或部署。
