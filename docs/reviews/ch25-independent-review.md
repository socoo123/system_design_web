# Ch25 交叉独立复核

复核者：Ch26作者，同一GPT-6.1-Sol + Max；只读目标源码，不另派agent。

**最终结论：通过；初审发现的1项P1已由原作者修复并独立重验关闭，无未关闭P0/P1或阻碍阅读P2。** 最终页面SHA256：`e3bb03a3b594c3ee0eb5830481f2a07d5e0d41ef259514a7ebf3265ea89d6560`。

初审页面SHA256：`afa962970eb033777718e0c501e0886bc3432eca712d92c551b816d459ff8b33`。11份审前/审后完整哈希分别位于 [source-hashes](ch25-independent-source-hashes.json) 的 `before` / `after`；两者差异来自主代理明确交回原作者的修复，复核者未写目标源。保留初次失败证据，未用修后结果覆盖它。

## 独立发现

| 级别 | 位置与反例 | 后果与最小修复 | 状态 |
|---|---|---|---|
| P1 | 初审 `examples/ch25/model.py:124,142`：materialize把60s内迟到视为live；recover却按now求first_live且无共享阈值。fire=0、interval=60s、skip、now=90s，实际SQLite审计skip[0,120s)，游标120s；而相同定义60s火点在正常materialize会执行。 | 30s迟到的live火点被恢复器丢弃。原作者新增一致的非负lateness_ms；新pass按now−tolerance/原相位求cutoff，已有cutoff续页。伪代码、schema、中英、假设与闪卡同步限定零容忍例。 | **已独立关闭**：原反例现在游标60s，正常路径随后执行60s火点；三策略−1/等号/+1ms及偏移/尾页均过。 |

[最初失败JSON](ch25-independent-initial-probe-results.json)保留模型SHA和实际审计/游标/normal对照；[最终独立探针](ch25-independent-final-probe-results.json)记录66项新输入/算术/实际SQLite检查通过。不是从作者测试报告复述的问题。

## 已完成的独立工作

完整阅读页面中英、六段同源SQL/伪代码及全部 `examples/ch25/` 文件；[新探针脚本](ch25-independent-probes.py)直接import真实适配。重走T1→claim→独立Order DB T2→complete与独立Sink DB投递；覆盖旧代次、实际SQLite锁等待后过期complete拒绝、unknown T2原键重放、有限五次尝试、运行中取消留review、回滚、早期关单不缓存no-op及不同键载荷冲突。修后再检查三策略的容忍边界−1/等号/+1ms、17s起始/45s间隔相位、30s起始且60s容忍、100+1分页在now继续推进时不扩cutoff、后续新pass处理新增遗漏。66项全部通过。未运行真实PostgreSQL、Java或Redis；本章没有把伪代码标成可运行Java。

独立复算：10,000/60=166.666…/s；56槽；ceil(10,000/56)=179轮，每轮0.2s为35.8s；5s理想400槽，同60%预算667；14.4M run/天、七天20.16GB原始、三份60.48GB；定义10MB；十job的1200旧火点/余量20/s=理想60s；1800秒为60槽轮的30圈。精确分数留在独立探针JSON。

6组31帧/全部title/desc ID与帧序、六段代码、14张统一网格闪卡均核对。D2/D4/D5修改组全部15帧双主题目视，另看D1/D3/D6所有帧。D5 commit标签到两侧节点净距分别14.27SVG单位，未发现短线挤字/错误绕线/帧跳。与授权前基线相比只修改原声明的10份SVG，其余21份逐字不变；P1返修前后31份SVG又逐字比较一致，修后仍重新渲染全部62主题帧。

[最终浏览](ch25-independent-browser-final-results.json)在390/1440×双主题×三语言12布局重新执行：details展开前后无整页横溢、124次翻帧、6段逐字复制、播放器键盘/播放/倍速/循环、闪卡/已读/设置持久化通过，资源与pageerror为0；D2/D4/D5每帧两主题在真实390分别左/中/右横滚，共90截图位置。实际截图位于 `screenshots/ch25-independent/`。此结论结合图内目视，不用整页不溢出或几何扫描代替它。

[静态核验](ch25-independent-static-results.json)通过6项；[最终几何](ch25-independent-geometry-results.json)无裁切/边界穿文字框，净距只作为目视辅助。六段同源检查与章节audit通过。另将作者原检查器完整重跑108项，结果单独保存为 [author-final-results](ch25-independent-author-final-results.json)，未覆盖作者默认JSON。最终源码/所有证据绑定的9项核对见 [final-results](ch25-independent-final-results.json)。

## 一手来源抽核

- PostgreSQL 18的 [SELECT锁定说明](https://www.postgresql.org/docs/18/sql-select.html#SQL-FOR-UPDATE-SHARE)支持SKIP LOCKED适合队列消费者且视图不完整，只跳行锁；不能证明本章吞吐或跨事务执行租约。
- [Quartz 2.3.0 JobStoreTX](https://www.quartz-scheduler.org/documentation/quartz-2.3.0/configuration/ConfigJobStoreTX.html)明确默认misfireThreshold=60000ms，是迟到容忍；[Airflow 3.0.0 DAG Runs](https://airflow.apache.org/docs/apache-airflow/3.0.0/core-concepts/dag-run.html#catchup)明确默认不catchup，显式catchup按区间补齐。页面均正确限定版本，没有外推行业默认。
- [Netty 4.1 HashedWheelTimer](https://netty.io/4.1/api/io/netty/util/HashedWheelTimer.html)定位近似I/O超时；[Kubernetes CronJob](https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/#job-creation)说明近似调度可能重复/缺失、应幂等，并发策略只覆盖同CronJob。
- [AWS幂等API原文](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)支持调用方意图身份、同键不同参数冲突、去重与效果原子记录、考虑迟到请求的保留范围。页面没有把它当任意邮件接口恰好一次证明。

## 验证边界

SQLite是实际多连接事务与更粗写锁；fixture_clock是受控持久行，不是实机授时。calendar适配只含UTC固定间隔/一次性，不证明cron/DST；服务授权、可信业务结果、共享限速及资源侧fence是显式依赖。直接方法调用代表RPC窗口，没有真实网络/生产吞吐/多主切换测试。

初审命令碰到原作者正在返修的中间态（schema已改、页面/旧测试预期未同步），相关 `ch25-independent-author-check-results.json` 与初审浏览JSON留存为过程证据，未把它们当最终失败；最终冻结后重新运行以上全部受影响命令，均通过。无未关闭项。
