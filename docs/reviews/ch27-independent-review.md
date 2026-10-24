# Ch27 即时配送 · 交叉独立复核

2026-10-24，按 GPT-6.1-Sol (`gpt-6.1-sol`) + Max (`max`) 约定只读复核。**独立复核通过；发现的1项P2已由原作者修复并独立关闭，无未关闭P0/P1或阻碍阅读P2。** 主代理整合验收另行记录。复核者没有修改Ch27页面、示例、公共文件或计划，未提交/推送/部署。

最终HTML SHA256：`a0446b2ed9e76745ae9eb794392e50eff4319f27ac2b077fc20269b7cf2bb1a6`。初审为`d464e99898d60c1ede161fb421106bc5c12cce6635f54b21791840aa66faf82f`；[完整before/after源码字典](ch27-independent-source-hashes.json)各含页面及12份示例。唯一源码变化是原作者修D4F1双语图注，12份示例逐字不变，因此首次完成的独立适配器探针对最终代码仍适用，未冒称重新执行了被修改的实现。

## 问题与关闭

| 级别/位置 | 独立发现 | 作者修复与独立关闭 |
|---|---|---|
| P2 · `chapters/ch27.html:501`，D4F1中英图注 | 旧图注称“手机重连可以继续序号”/“Reconnect preserves sequence”，与正文每次重连换epoch、清点重采样及`start_session`的seq=-1契约不一致。读者可能把重连理解为复用旧session。 | 图注明确每次重连服务端换新epoch、清旧点后重新采样，seq仅同epoch比较，seq41仅为当前会话示例。独立核对中英、正文和伪代码；实际探针证明epoch递增/清点/seq0可用、旧epoch上报与迟到断线无效；D4整组双主题与390图注重验通过。 |

[图注关闭证据](ch27-independent-caption-recheck.json)记录修前/后SHA与最终图注。复核者用最终HTML仅替回实际观察到的旧图注，重建SHA精确等于初审SHA，独立证明其余正文、31份SVG与示例均无静默变化。

## 独立技术执行

[新写探针](ch27-independent-probes.py)直接调用实际`examples/ch27/model.py`，执行**88项检查**，没有调用作者`check`函数或复制其测试结果。使用真实SQLite文件、多线程分别打开连接；结果见[ch27-independent-model-results.json](ch27-independent-model-results.json)。

- 正常路径：pending→offered占槽→accept保持一槽→pickup凭据→deliver释放槽位、generation递增。未取餐的deliver拒绝，完成后历史accept/offer回原回执和当前终态，不复活占位；错骑手/错绑定/换凭据拒绝。
- 双方竞争：已有一单后，两订单抢骑手最后一个槽位只一笔成功；两骑手抢一单只一笔成功。`occupied`、槽位、当前attempt和状态的实际不变量均检查。
- accept/expire：截止前119秒accept胜出；等于120秒到期胜出，释放一次。另执行accept/cancel、expire/cancel、pickup/cancel与并发重复deliver，状态与槽位同一结果。
- 实物与旧代次：GPS/租约失效不能充当release，错绑定的`VerifiedRelease`拒绝；可信交接后generation推进但原匹配期限/尝试预算不重置。新attempt建立后旧accept/pickup仅返回历史与当前快照，旧deliver不影响新执行者。
- 真实回滚：预占插入槽位后故障全回滚；送达删除槽位后故障恢复原picked_up/槽位，不留半状态。
- 新鲜候选：Routing耗尽原validUntil直接拒绝；实际SQLite写锁阻塞reserve后推进时钟到126秒，锁后读取过期而不创建offer；accept等锁跨deadline也拒绝。validUntil取等号时与候选年龄上界一致。
- 恢复与补偿：三次未接耗尽但期限不重置；丢队列重扫持久pending；到期扫描重复不重复失败事件。未知建单先fence上游身份再补偿，迟到create被拒绝；create/cancel_creation并发不能留下栅栏后的可派订单；已有offered时窄补偿入口拒绝，未伪造“没有实物”。
- 位置：epoch保留超过点TTL，重连清点重置序号；旧断线/旧epoch、旧seq/重复seq、较高seq旧采集均被正确处理，重复不刷新任何时间/TTL。年龄25秒可用、26秒不可用，即使60秒清理TTL尚存；漏索引与跨格旧投影经当前epoch/seq检查和扫描修复。
- ETA：到店/备餐并行为14分钟，取餐后只剩送达；有效缓存低可信，错上下文、缺失元素、到期路耗或旧位置均不变成零时长成功。

位置与资格是进入预占事务前的可信读时快照。锁后validUntil检查缩短陈旧窗口，但不能将它描述成跨库原子实时撤权；之后仍可能断线或资格变化。实际容量和履约归属才由同一事务权威控制。`VerifiedRelease`是显式可信适配输入，构造dataclass不证明实物交接；GPS不替代它。这些前提在页面/README中有说明。

[独立Java/Redis脚本](ch27-independent-external.py)另外实际执行：

- Oracle JDK **17.0.10**编译实际`LocationGate.java`及[新写driver](ch27-independent-LocationReview.java)，**23项**毫秒边界、坐标/精度、NaN/Infinity、未知时钟、空点和大时间值通过。class只写临时目录。
- 新起并终止自己的Redis **7.2.5** Unix socket实例，**7项**GEO半径召回、COUNT、独立键TTL、详情过期仍有GEO成员、整个GEO到期清全成员通过。没有连接或关闭共享Redis。两者结果见[ch27-independent-external-results.json](ch27-independent-external-results.json)。

作者70项原校验另以`--output docs/reviews/ch27-independent-author-check.json`运行通过；这是补充回归，与88项独立新探针分开记录，没有覆盖作者证据。

## 算术与来源

[26项独立Decimal推导](ch27-independent-numeric-results.json)通过：订单5.787…/s、10倍57.870…/s；20人召回1157.407…人次/s、8×1得到462.962…路耗元素/s（约463，非HTTP调用数）。位置2000/s、突发10000/s，0.4MB/s=3.2Mb/s；最新详情5MB、全量点34.56GB/天；履约1GB/天、30天三份90GB。观看600推送/s、120KB/s，13000连接另算；A成本6、B为4.4，ETA=max(4,6)+8=14；积压8/s时600/(20−12)=75秒，借2/s后仍6/s、同初始空位100秒。均是教学假设的十进制计算，恒定速率排队例不冒充生产界限。

[独立来源抽核](ch27-independent-sources.md)已直接打开PG行锁/时间、Redis GEO/EXPIRE、Google Routes及WHATWG。尤其确认[gRPC矩阵流不保证顺序、REST不支持该流式方式](https://developers.google.com/maps/documentation/routes/compute_route_matrix#grpc_stream_results)，与正文一致；[SSE Last-Event-ID](https://html.spec.whatwg.org/multipage/server-sent-events.html#the-last-event-id-header)不替应用实现持久历史与业务去重。

## 动画与真实浏览器

[独立动画核对](ch27-independent-animation-results.json)直接比较授权前HTML与最终HTML：原**6组31帧、全部title/desc ID和顺序完整保留**，仅D4F5和D5F5共2份SVG变化，另29份逐字不变。无整组替换。

[独立渲染](ch27-independent-after-render-results.json)绑定最终HTML，实际Chrome输出62张双主题帧图；目视全部31帧浅色，以及D4/D5修改组全部帧两主题。D4F5说明移到留白，未进入Cell Index；D5F5红线明确为API本地timer，不伪装Routing回复，正常路线作为另一分支保留。另放大核对D2F5预占/回程，标签与线条可区分。没有用无横溢或几何扫描代替图内目视。

[最终独立浏览](ch27-independent-browser-results.json)：**390/1440 × 两主题 × zh/en/both，共12个不同组合**通过，展开details前后实际innerWidth=scrollWidth；31个原ID保留、124次翻帧、7段逐字复制、15张cards-grid、播放器键盘/播放暂停/倍速循环、闪卡点击/Enter/Space、已读及主题/语言偏好持久化通过，页面/资源错误0。D4/D5每帧两主题左/中/右共60个390实视口位置均截图并目视，包括最终D4F1双语图注。

- [D4最终深色全帧](screenshots/ch27-independent/frames/after/d4-dracula-contact.png)
- [D5最终浅色全帧](screenshots/ch27-independent/frames/after/d5-parchment-contact.png)
- [D4重连图注真实390](screenshots/ch27-independent/browser/d4-f1-2-parchment-narrow.png)
- [D5本地timer真实390](screenshots/ch27-independent/browser/d5-f5-5-dracula-narrow.png)

[独立命令检查](ch27-independent-check-results.json)中的7段同源、chapter audit、本章diff空白与审阅浏览/渲染脚本语法均退出0。

## 范围与未验证边界

本次仅写`docs/reviews/ch27-independent*`与忽略的`screenshots/ch27-independent/`。最终[13份after源码SHA](ch27-independent-source-hashes.json)匹配作者最新冻结；除已授权作者图注修复外未改源码。

未运行真实PostgreSQL行锁/复制切主、跨机授时、Redis Cluster或生产权限部署；SQLite为更粗单写者。没有接真实骑手/GPS、资格撤销、地图Routing、SSE/WebSocket服务或实体交接，未做生产压测。可信认证、支付事实、候选快照、±5秒误差与实物凭据仍为适配前提；Java/Redis/SQLite测试不证明这些依赖或生产及时性。独立结论限于页面所声明教学模型和本轮实际验证。
