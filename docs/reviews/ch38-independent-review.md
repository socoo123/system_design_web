# Ch38 · 独立只读复核

2026-10-24。复核者为Ch37作者，GPT-6.1-Sol（`gpt-6.1-sol`）+Max（`max`）；没有参与Ch38实施，没有另派agent。**独立复核通过：发现的A9容量口径P1已由原作者修正并独立关闭；主代理发现的SingleFlight测试夹具竞态也已检查修复、重跑通过。未发现遗留本章P0/P1或新增阻读P2，主代理最终验收另行收口。**

只写本报告、`ch38-independent-*`与专属[screenshots/ch38-independent](screenshots/ch38-independent)截图；没有修改作者页面/examples、公共CSS/JS、工具、首页、PLAN或批次文件。作者负责所有返修。

## 发现、返修和独立关闭

**P1：hard5s不等于可完整复用5s，原A9漏扣安全余量。**原A9、图5s3中英图注与正文写100重复key、2,000/s、负记录5s；忽略查询/淘汰即100/5=20次权威检查/s。但实际`claim`要求`hard>now+2000`，即使用同一个无偏差受控时钟，也只有不足3s的负命中区间。

我用初始真实SQLite适配执行100key×20请求/s×15秒，共30,000次claim；瞬时新primary负证据、无淘汰，t=0/3/6/9/12s各100个leader，共500fill，500/15=100/3≈33.3/s。不是墙钟压测，是按受控时间推进的真实数据库调用计数。[原始finding及初始源哈希](ch38-independent-initial-finding.json)与[初始源码副本](ch38-independent-initial/)保留，未覆盖成修后结果。

原作者保留5s硬期限和安全guard，改A9、D5s3/s4图注与s3–s5图内说明、正文/英文/README/数字runner，并增加第15张网格闪卡。现在区分：

- 20/s只是不计查询、淘汰和**所有安全余量**的理想TTL模型。
- 本例L2扣2s，瞬时填充、持续复用时约N/3；这是L2层条件示例，非峰值或端到端上界。
- Java `canSend`再扣1s，负证据年龄须不足2s；L2在2.5s仍可HIT不代表能发404。当前HTTP伪代码年龄不安全直接503，不自动重读；持续成功需另定刷新/验证策略并计入总回源预算。

修后用不同键数和周期再次执行：[37键/24s/125ms](ch38-independent-negative-rate-results.json)共7,104次claim、296fill=37/3次/s；11键/18s/250ms共792次claim、66fill=11/3次/s。两种新输入都吻合3s守卫，未把主代理7键实验或作者100键实验当成我的独立输入。安全逻辑`cache.py`哈希未变；图/中英/代码解释/新闪卡已逐项核对，P1关闭。

**SingleFlight.main夹具竞态，非核心join缺陷证据。**主代理最终suite发现原测试`join(instantLoader); cancel(); isCancelled`可能先完成后取消，导致偶发断言失败。原作者只改main：受控Executor先保留唯一待执行leader，创建两个私有waiter，确认一项待执行→取消其中一项→另一项仍pending→执行leader→幸存waiter成功。检查/写入顺序可靠，展示`flight`区域与页面逐字不变。最终JDK17重编译后，作者main41项及我的27项新输入通过；另外相同41项夹具连续10次通过，**10次重复不是410个独立案例**。[针对复验](ch38-independent-final-java-checks.json)。

## 独立新输入与边界

[51项SQLite新fixture](ch38-independent-cache-results.json)使用临时文件、独立连接与多进程，未复制作者runner断言集合：

- 正常冷miss→新源证据→另一连接HIT，原observed/hard不变；2s命中余量的前1ms/精确边界；表示key与跨key票据隔离。
- 乱序revision序列9/3/11/0/7/11只保留最大floor；已撤销票即使带伪大版本仍拒绝，新票低于floor拒绝；同票成功后重复fill拒绝。
- 缺席需权威revision，不得在高floor后猜0；真实墓碑负证据可入，创建撤销旧缺席，5s/20s混用与过老/过未来证据拒绝。
- metadata丢失、重建票据、另一连接重启epoch、已知floor保留、事务异常同时回滚floor与值。
- 三轮真实进程fill/invalidate竞争最终不保留旧值；四进程复用同一HIT证明；claim和fill分别在真实SQLite写锁后读取受控时钟跨过租约期限。不是网络分区或真实时钟故障实验。

另显式执行“新票+结构合格但编造的版本”会被缓存接受的输入，验证它**不能替代可信loader/新primary快照证明**；这与正文、README公开声明的外部信任前提一致，不把这种输入当成防伪机制已实现。缺席revision和metadata保留/回收协议也不是TTL凭空提供。

[27项Java17独立新输入](ch38-independent-java-results.json)覆盖正20s/负5s、L1反复拷贝不续hard、n向下取整、n=0仍须canSend、精确3s发送余量边界、29个有效时钟角落分支、负version拒绝；singleflight用阻塞loader证实等待者timeout/cancel甚至手动complete只影响自己的future，真实在途和唯一loader保留，后到者仍共享；真实结束后可重载，异常/执行器拒绝后可再试，另一Group独立，直接执行器正常清理。实际SQL许可回收仍需存储适配器的完成/取消确认，Java假loader不是生产Store实验。

## 手推、数字与来源

[32处独立复算](ch38-independent-numeric-review.json)覆盖A2条件miss的8,000/4,000/2,000与95%、A3的4,000和92.5%最低命中、每进程240MB/总7.2GB、热点8000/30及稳定L1条件下6get/s、四副本2,000/s、A9理想20/实际L2 100/3/HTTP不足2s、jitter14.4–17.6/3.2s/312.5与6,250、L2单层失效1,000/s及全部冷37,000/s拒绝、68→保守24s、SWR15/SIE25。数字都是教学假设；平均值不是峰值界，3,000/s与100在途不是已压测容量。

[独立一手抽核与6条手推](ch38-independent-sources.json)重新打开RFC9111/9110/5861/8246、NSDI13原论文、Go singleflight、CloudFront失效/API与SQLite事务文档。核对Authorization共享例外与本章更严pass、Vary不鉴权、Age累计、GET弱ETag/列表/*、fresh共享缓存可回答浏览器条件请求、private/no-store/no-cache区别、304到App才取新primary证明、302/404缓存语义、独立SWR/SIE窗口、key-bound lease/delete撤销、单Group范围、immutable新鲜期限制与purge接受/完成/浏览器副本边界。不是HTTP解析/CDN或生产网络实测。

## 图、正文和真实浏览器

[动画核对](ch38-independent-animation-review.json)确认原7组38帧、全部76个title/desc ID与帧序保留。返修后D1/D3/D4/D5/D7共27帧为修改组；原作者初版四修改组22帧，A9返修使D5新增为第五修改组。

独立实际查看全部38帧两主题：初始14张全帧表覆盖76幅；A9返修后重新渲染当前五修改组54幅，其中D1/D3/D4/D7的44幅与已目视初始PNG逐字节相同，[相同比较](ch38-independent-render-comparison.json)明确保留来源；D5全部5帧两主题重新实际打开。不是只查页面无横溢或只看终图。[当前54帧](ch38-independent-final-frames.json)、[实际打开35份图像/哈希](ch38-independent-visual-review.json)。

实际核看D1 guarded SET标签留白、D3控制回执/EdgeB短回程、D4 writer提交并行竖线与拒绝标记、D7失败第三通道；方向和图注与正文一致。D5新增硬5s/L2不足3s说明、发送资格图注在390px两主题实际可读；新第15张卡在320px两主题完整展开且保持cards-grid，1440px仍为网格。

[最终独立真实浏览器](ch38-independent-browser-results.json)：320/390/768/1440×两主题×三语言，24布局、152次实际翻帧、96次逐字剪贴板复制；details全展开无整页横溢，播放/方向键、翻卡click/Enter/Space、阅读进度、主题/语言/播放偏好持久化通过，页面/资源错误0。实际innerWidth/scrollWidth均等于目标宽度，不是Chrome CLI裁切。修前[矩阵](ch38-independent-browser-initial-results.json)与browser-initial图像保留，没有拿初始bf3f哈希冒充最终a90。

[补充当前页面](ch38-independent-supplement.json)单独检查320/390/1440的新增A9卡及390px D5s3/s4两主题。公共320both topbar较高竖排为既有F04/Q事项；图注随共享slide横滚移出右侧后向左可恢复，均非本章新增，不扩大公共UI修改。

## 实跑与最终签署

A9修后[13条检查](ch38-independent-post-a9-check-results.json)通过：全站check、本章audit、4段同源、作者runner84项（含26数字与原100-key/30,000claim复现）、我的51项SQLite和两种新周期、JDK17编译与作者Age16/当时Flight38/我的27、验证JS语法及diff检查。**作者runner与其测试不计为独立新输入。**

SingleFlight夹具随后修改，按影响范围追加[6条最终检查与10次针对重复](ch38-independent-final-java-checks.json)：当前4段同源、OracleJDK17`--release17`重新编译，Age16/Flight41/独立27通过，diff通过，最新九份源码检查前后稳定。页面与代码展示区未变，因此没有为main测试夹具修改重跑手机矩阵。

[初始九份before](ch38-independent-source-before.json)对应页面`bf3f382315440b12b9f679973bfe63b302e45caf374af64da28b03086d803894`。[最终九份after](ch38-independent-source-after.json)逐文件签署当前全部页面/examples，页面为：

`a90ba925d7960aa004fd786d6f38a0ae58c398798e770103d89b9457220c1659`

SingleFlight当前为`891b16c90da68ede14324613886e60b012291fab0b149a57e1d695f55b8447fd`。[变化清单](ch38-independent-source-diff.json)如实保留五个文件经作者修改、四个不变；Age/Flight两个展示实现区和cache安全guard均逐字不变。A9修后、夹具修前的after与检查另存`ch38-independent-source-post-a9-before-test-fix.json`/`ch38-independent-post-a9-check-results.json`，没有覆盖原before声称全程未改。

我的两个测试配置更正也留档：物理年龄保守包络误用严格小于，纠正为允许边界相等，[记录](ch38-independent-test-correction.json)；新卡由14增至15后的reviewer矩阵配置更新，[记录](ch38-independent-browser-config-correction.json)。两者不是作者缺陷。

未实现真实HTTP解析/Date-Age栈、CDN/Redis复制与切主、业务Store/outbox网络、全局准入服务、权限/时钟健康/真实Store取消、生产压测或灾难实验。本地SQLite/Java只验证文中所列契约；不能据此宣称生产分布式可靠性。当前独立发现P1已关闭，测试夹具问题已稳定复验；未提交、推送或部署。
