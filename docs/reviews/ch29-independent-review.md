# Ch29 LLM推理服务 · 独立复核

2026-10-24，GPT-6.1-Sol（gpt-6.1-sol）+ Max。复核者为Ch30作者，未编写Ch29实施；未派子agent，未修改Ch29页面/示例或作者证据。**独立复核通过：1项P1家族的两个失败窗口及2项P2均由原作者修复并独立关闭，无未关P0/P1或阻碍阅读P2。** 主代理仍负责整批验收，未提交、推送或部署。

最终HTML SHA256：`3c9b62a786f7f89a9836b1c77d21df75d8b50696ba32cd86489eec839fc3f499`。[完整before/after源码字典](ch29-independent-source-hashes.json)在开审前冻结初始页面`8c822c41…`及8份examples，最终after覆盖页面及11份examples。原始发现、初次返修和最终修复分别保留，没有把作者自检或一次返修冒充独立关闭。

## 发现、修复与关闭

| 级别/位置 | 独立反例 | 作者修复与独立关闭 |
|---|---|---|
|P1 · 持久配额清理，窗口一|已有RESERVED配额→global100/tenant25满→直接OVERLOADED；原enqueue未持久终态/结算意图，可能漏退预留。同key在容量恢复后的行为也不明确。[初始轨迹](ch29-independent-initial-findings.json)。|新增第7段reject.pseudo：原Attempt终态429与SettlementOutbox同事务，quota服务按attempt RESERVED→RELEASED一次，丢ACK重放；同key只取原429。首次GPU前ASSIGNED→RUN_GRANTED与拒绝串行，不能把已执行/未知请求当全未消费退款。|
|同P1 · 窗口二|第一次返修a53b版on_release先charged.remove/退本地计数，再持久终态/Outbox；事务失败或结果未知后重复通知已找不到待办。[第二轨迹](ch29-independent-release-finding.json)。|最终先charged.get，确认/查回同attempt的持久结果后才remove/退计数，失败保留待办并重试。独立以两条本地charge同时存在，分别注入回滚、commit后回包未知，再逐条恢复；重复B通知不能退A的计数或退成负数，quota最终均只结算一次。|
|P2 · 总量简写|queued_total/active_total没有明示是派生总和还是独立计数器。|头注释明确sum(queue sizes)/sum(per-tenant active counts)，不隐藏计数维护。|
|P2 · 新代码窄屏标题|91eb版新增代码元标题过长，真实390px EN的Copy按钮挤成“Cop / y”。[原截图](screenshots/ch29-independent-browser/pre-label-reject-390-dracula.png)。|作者只缩短data-language为`Pseudocode · durable rejection`；最终390/1440×两主题4个受影响代码布局重新实测和目视，Copy恢复单行。页面除此一处属性逐字不变，代码/SVG/示例不变。|

[最终问题状态](ch29-independent-findings-final.json)与[19项证据一致性](ch29-independent-evidence-results.json)绑定最终HTML。首次P1及余窗的记录保持为历史open发现，最终关闭结论单独记录，未覆写原始失败材料。

## 独立技术证据

[新Java17探针](ch29-independent-KvProbe.java)直接编译作者真实`KvLedger.java`，83项断言通过。输入不同于作者577断言：三请求同batch、共享块双pin、A取消而B/C EOS、整batch验证失败不部分pin、信用满但仍有空物理页、旧ticket/slot incarnation、新boot numeric ticket碰撞、12次双读者真实CPU取消/EOS竞争。正常与危险轨迹都确认全部相关访问退休前不释放信用/引用，重复完成不影响新owner。

[独立SQL/复算探针](ch29-independent-probes.py)通过20项SQLite谓词/事务检查和31项数字/指标反例：两连接bind只胜一人、canonical hash冲突、已确认RUN_GRANTED恢复、未知claim/bind/finish按原键取结果、旧boot/generation不覆盖、活跃行不被终态TTL清理、NOT NULL。**这是对伪代码SQL条件的独立SQLite翻译，并未执行PostgreSQL。** [执行结果](ch29-independent-probe-results.json)保留运行时源码哈希。最终返修未改Java类或这些Attempt谓词，按字节哈希复用既有执行结果，没有冒称最终又运行全部577断言。

[40项返修独立探针](ch29-independent-quota-probes.py)直接调用作者实际双SQLite适配：不同owner、队列满后丢HTTP、容量恢复同key仍429、事务回滚、释放丢ACK与多次重放、8个新grant/reject竞争；实际持有quota库写锁时，Attempt/Outbox pending仍可读且未假ACK，解锁后同一事件单次结算；新增两个本地charged在持久失败/未知结果后的恢复与单次退计数。[结果](ch29-independent-quota-results.json)40项通过。作者53项实际双库检查另存[独立重跑结果](ch29-independent-author-quota-results.json)，未覆盖其原证据。

逐段核对准入/iteration/attempt：队列与活动上限分开；ready但尚未首次prefill仍受原600ms期限；输出到cap先stop；progress仅在唯一ticket complete接受后应用一次；charged只有持久清理确认后才退出。deficit/游标跨轮保留，profile/fits是测量适配契约，不据此宣称GPU p99保证。RUN_GRANTED在读取、finish/retry和拒绝分支对应一致。正常实际使用量结算仍是显式依赖，窄模型只执行全未消费的释放，不假装完整计费工程。

独立复算覆盖128KiB/token、2MiB/页、160页/320MiB信用、128/第129、Little同边界60/180与18.75/56.25GiB、8.4req/s、4副本/同预算N−1五副本、256MiB/26.8435ms/8.053GB/s、长上下文37、255间隔/5.1s与8MiB缓冲。独立构造TTFT与最大worker ITL各99%但联合98%的100请求集合；20ms token-ready与60ms客户端flush间隔也验证分报必要性。C=12明确是未测的联合达标约束下最高接纳率，未当成排队μ或goodput直接替代总完成率。

[7份一手来源抽核](ch29-independent-sources.md)重新web读取固定vLLM v0.15.1 design/features/tuning、CUDA13.4 events、DistServe原论文、PG18和WHATWG SSE。正文/英文/表格/闪卡对128信用、首token后255间隔、TTFT/workerITL/客户端块间隔、联合达标、同key中断、共享页和传输接受边界一致；没有把论文速度倍数、事件id或CPU锁扩大为服务容量/恢复保证。

## 真实页面与图

[独立headless Chrome](ch29-independent-browser-results.json)执行390/1440×两主题×zh/en/both共12组合，展开details前后实际innerWidth=整页scrollWidth；124次翻帧、7段逐字复制、播放/键盘/倍速/循环、13闪卡、设置/已读持久化通过，页面/资源错误0。没有操作用户Chrome。

D1六帧、D3五帧在实际页面双主题逐帧目视，另看真实390的左/中/右横滚。D1边界已避开POST/SSE；D3F5屏障说明位于B/t+2留白，未压D prefill；节点/箭头/字形清楚，没有用生成截图或几何自动判定代替目视。

- [D1浅色全帧](screenshots/ch29-independent-browser/contact-page-d1-parchment.png)、[深色](screenshots/ch29-independent-browser/contact-page-d1-dracula.png)
- [D3浅色全帧](screenshots/ch29-independent-browser/contact-page-d3-parchment.png)、[深色](screenshots/ch29-independent-browser/contact-page-d3-dracula.png)
- [D1真实390横滚](screenshots/ch29-independent-browser/contact-phone-d1-dracula.png)、[D3横滚](screenshots/ch29-independent-browser/contact-phone-d3-parchment.png)
- [最终390新代码头](screenshots/ch29-independent-browser/reject-390-dracula.png)、[桌面](screenshots/ch29-independent-browser/reject-1440-parchment.png)

12组合在91eb版通过。最终3c9版只改一个代码标题属性，已用[精确差异和最终4个代码布局](ch29-independent-evidence-results.json)重验；未重复无关全部组合。所有31份SVG、7份pre代码正文及全部示例逐字不变；实际已目视13份接触表/代码图的哈希随证据保存。修改图终帧/全组不是只看计数后放行。

最终同源7段、chapter audit、`git diff --check`通过；主代理继续整批结构/范围和完整浏览器整合。复核期间只写`ch29-independent-*`和相应截图，没有修改作者实现。

## 适用边界

没有真实CUDA、KV payload、采样/tokenizer、跨stream事件、网络送达、PG复制/隔离、GPU死亡或生产吞吐实验。Java手工complete只证明CPU账本分支；SQLite写锁更粗，quota暂停用本地锁模拟；源码时序推演与实际执行分别记录。持久重试依赖健康恢复，不提供故障期固定退款秒数保证；已启动使用量结算为适配契约。这些限制已在页面/README明确，不妨碍本章教学保证的独立复核通过。
