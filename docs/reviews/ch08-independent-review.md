# Ch08 独立复核

2026-10-23；Ch06 作者 Astra High 独立只读复核，先读完整章节与 examples 源码，再读作者报告。结论：**本次范围通过，未发现须返修的 P0/P1 或阻碍阅读 P2**。未改 Ch08 页面、示例、作者证据、共享文件或 PLAN；只写独立证据。

复核最终 HTML SHA256：`98d1c69a4f26a1a2e02a9bd90897d77bb25f82391dc6afa996130ca86f982f96`。

## 独立路径与关键反例

1. 正常获取：新随机 owner 一条 SET NX PX，明确 OK 后仍扣获取耗时；业务写直达 Primary；释放只比较本次 owner。未知获取不执行业务；清理失败允许等到期，不能裸 DEL。
2. 旧 owner 反例：A过期，B获取；A的 release/renew在隔离Redis7.2.5上实际返回0，不删/延长B。另执行不安全GET→过期→B→DEL，确实删掉B，验证Lua原子边界必要性。
3. 续租边界：独立新增9条断言（[源码](ch08-independent-probe.java)、[结果](ch08-independent-probe-results.txt)）。9.0s发送、9.799s收到OK可续到18.8s，18.8s精确失效；9.8s才到的OK不能跨旧截止点复活；abandon后OK也无效；nanoTime跨signed long边界时差值仍按短时间窗口工作。此类只限制本地派发，代码与正文没有冒充远端所有权/撤回写。
4. fencing：原SQL精确执行，32/qty2接受34/amount1后得到34/qty1；旧33和重复34各影响0行。若34仅被发行但尚未安装，33仍可成功；库存不足也不会提升fence。正文明确这一边界与先安装再current_fence=f的更强合同；图max_fence与列last_fence已对应。
5. 错误发号交错：A获取→在INCR前暂停/过期→B获取100→A拿101，旧任会更大。正文要求成功持有与可靠世代绑定，说明单节点原子也不保证切主保序；etcd返回持有key及独立lease前提有一手依据。
6. 幂等未知提交：同库claim、qty扣减、receipt必须同事务；COMMIT结果丢失后同op_id重放读取原回执，不重复扣；载荷不等拒绝；提交前异常整体回滚；不同op仍受qty/version约束。SQLite轨迹通过，但没有谎称它证明PG并发。

## 实际执行

- Java17真实编译运行作者 `LeaseBudgetTest`：18断言通过；另外编译运行独立probe：9断言通过。
- 运行作者核心 `verify.py` 时仅把输出目标重定向至独立报告，并固定ROOT（临时包装文件在/tmp）；没有修改被审代码或作者结果。隔离Unix socket Redis、TCP禁用、独立临时目录，结束清理。12类测试全通过，见 [独立执行结果](ch08-independent-code-results.json)。SQLite确实执行页面两条SQL谓词；事务伪代码用模型轨迹，不是PG实测。
- 单独数出页面7个data-source块，逐字同源检查通过。`node tools/audit-chapter.mjs ch08`通过（5组26帧，7段代码，中英各160）。
- 手工独立复算：10,000×0.1=1,000；成功800次需800次释放，合计1,800；200失败者各3次且全部busy→+600=2,400；60/10=6；1/0.020=50/s；100×0.020=2；10−0.1−0.2=9.7s；9.7−8=1.7s；10+30=40；45−11=34>40−11=29。与正文/图注/闪卡相符，未将p99当上限。

## 一手来源独立抽核

- [Redis WAIT](https://redis.io/docs/latest/commands/wait/) 的 Details 与 Remarks：同连接此前写、返回实际副本数，超时仍返回数目；明确不是强一致，多副本确认仍可能切主丢写。支持本文边界。
- [Redis distributed locks](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/)：单命令NX/PX及owner删除、异步切主反例、Redlock独立主多数与时间预算、8.4 DELEX，以及TTL使用墙钟/需要fencing的提醒。未看到本文把争议写成已证明的无条件互斥。
- [PostgreSQL18 isolation](https://www.postgresql.org/docs/18/transaction-iso.html) §13.2.1：UPDATE等并发更新者提交后重检WHERE；ON CONFLICT DO NOTHING可因原语句快照不可见的冲突行而跳过，后续独立SELECT得到新语句快照。支撑代码的同请求并发处理说明，不能推广为整个多语句事务串行化。
- [etcd3.6 concurrency](https://etcd.io/docs/v3.6/dev-guide/api_concurrency_reference_v3/)：Lock返回ownership key用于同etcd事务校验，lease失效释放；同lease重入视为同次获取。本文明确独立申请不共享lease/key，外部资源仍要验号。
- [Redisson官方指南](https://redisson.pro/docs/data-and-services/locks-and-synchronizers/)及[固定提交RenewalTask.java](https://github.com/redisson/redisson/blob/dc4cdf096589a21c990b117a1ad0d1634dd84685/redisson/src/main/java/org/redisson/renewal/RenewalTask.java)：30s默认与timeout/3调度，正文标明不是硬实时，字符串Lua不冒充重入hash协议。

## 页面与图形

独立真实Chrome/Playwright：[脚本](ch08-independent-browser.mjs)、[结果](ch08-independent-browser-results.json)。320/390/1440 × 两主题 × both共6组，实际innerWidth=scrollWidth；无页面异常。390px代码可局部横滚，图右侧Primary可达。

对7个修改帧d1s2–5、d3s4–5、d5s5逐帧重截图并目视两主题；另看d2s5、d4s4–6，共22帧。确认b0→新b区别、提升后才NX、CAS标签靠真实请求线；fence拒绝回程、暂停34s/余29s及旧renew拒绝不矛盾。图4s6明确是错误客户端反例，新Java helper会先LOST，因此没有图代码互相承诺相反行为。

[浅色修改帧](screenshots/ch08-independent/parchment-changed-sheet.jpg) / [深色修改帧](screenshots/ch08-independent/dracula-changed-sheet.jpg) / [深色故障帧](screenshots/ch08-independent/dracula-faults-sheet.jpg)。原尺寸PNG也保存；未用几何统计替代目视。全文英文段落和闪卡抽核与代码一致。

## 残留与未验证

本章无新增未关闭问题。320/both品牌竖排、手机横滚图时图注随同移动为已知共享UI局限，本次只记录，未改共享文件。Java区块相邻文本已明确为完整可运行类的节选，不能独立复制成完整类。

未实测Redis复制切主、系统墙钟调整、PG并发/掉电、etcd灾难恢复或外部副作用；没有吞吐压测。本次结果只支持教学轨迹与界面，不证明生产分布式互斥。作者修改后若HTML SHA变化，须重核差异再引用本结论。
