# Ch43 独立复核

2026-10-24，复核者 GPT-6.1-Sol / max（Ch45作者轮换）。**最终通过；独立发现1项P1已由Ch43作者修复并独立重验，未留P0/P1或阻碍阅读P2。** 本复核只写`ch43-independent-*`证据与截图，未改目标页面/examples、作者证据、PLAN或共享文件；未派agent、提交或部署。

最终签字页面SHA256：`b947b12c5ca36deddf1156da2fcec99311f2220889ce0eba977a6193170bfb63`。页面及全部5份examples源文件的哈希见[final](./ch43-independent-final.json)，排除`__pycache__`；签字前与实际文件、作者冻结清单、独立行为/浏览器/帧证据逐一核对。

## 独立发现与关闭

| 编号 | 反例与实际结果 | 修复与重验 |
|---|---|---|
| R43-01 / 作者A10，P1 | `B=9,F=2`，3行只产生run-0；最后一次`input.hasNext()`删除该run后返回false。旧实现`count=1`跳过归并，仍返回不存在的候选路径，违反完整候选交接合同 | 作者在交接前打开并读候选一字节，页面同步。原独立Probe不换输入重验，现抛`NoSuchFileException`；`singleRunMissingCandidate=false`。检查只证明交接时可读，后续保留仍由owner/发布/GC fence负责 |

初始失败有[持久证据](./ch43-independent-pre-single-run-fix.json)，没有把后来修复写成初次通过。主代理此前指出的多run DirectoryStream漏算也重新做了自己的输入：11行、B2/F3，在run-2落盘后删除它，实际打开期望路径失败，没有返回少算SUM。不是沿用作者或主代理结论。

## 自己执行的技术路径

[Probe](./ch43-independent-Probe.java)与[独立运行器](./ch43-independent-check.py)直接调用本章源码，而非另写聚合实现；Oracle独立使用BigInteger。

- **Java17共38条定向检查**：随机种子624、1543行/31键，B={1,5,71,1600}×F={2,5,9}的12组均与Oracle一致，并检查成功后只保留最终run；跨run负数/零和、负向溢出、最终可抵消但中间溢出、33字符key、非法预算、缺中间/唯一run、损坏记录、第二读者打开失败、目标文件已存在均覆盖。另在`-Xmx16m`下流式处理65,003个独特key并逐行核结果，未把所有输入/输出载入内存。此实测与源码中O(B)块、O(F)读者/队列/路径相互印证，不声称生产字节预算已解决。
- **Catalog共14项新检查**：sales/m100及新batch，正常提交后指针推进m102，重试原batch仍找回m101且不回退current；同batch换摘要拒绝、跨表身份隔离、旧基线冲突、唯一身份插入触发器强制失败时指针回滚；两连接同batch竞争不同候选返回同一结果。还暂停实际`publish`函数于指针UPDATE之后/accepted INSERT之前，另一连接看见旧指针且查不到身份，释放后原事务仍能提交，实际说明“查无记录不是终态”。
- **24处数值独立复算**：1TB/天、365TB/年、均值11574/s；36500→3740成本单位/约89.8%；获全表授权三列37.5GB与需要tenant_id第四列50GB分开，独占18.75/25s、双并发37.5/50s；800倍是字节比；文件数、576GB/天独立场景、1.024GB重写与净追赶12500s/约3.47h、期间250GB均一致。
- **位点与生命周期另作协议推演**：新乱序完成序列212/210/214/211/213，从next=210得到210/211/211/213/215；不取最大已完成位点。手走pin晚于过期时必须拒绝并重规划、GC删除集必须阻止旧writer以后发布、v2在H={p0:215,p1:71}持久覆盖且记录续接责任后才切读取入口。它们是文中明确要求的协议合同推演，未冒称有真实GC/流引擎实验。

Catalog、算式和位点合计39项检查，Java38项单列，重复运行未累计新用例。[完整命令/结果/sourceHashes](./ch43-independent-check-results.json)。SQL仅真实SQLite局部事务，未据此外推分布式Catalog隔离或对象耐久。

完整读过中英文正文、3段代码及全部辅助源码、37帧title/description/中英图注、15卡。源码同源与结构audit也实际重跑。Java不可变输入前提、快照过滤/删除已应用、保守溢出失败、候选不等于表发布、accepted保留窗口、UNKNOWN不清理、CAS不代替DELETE/rewrite语义验证均有明确说明。

## 浏览器与实际目视

在最终页面实际运行320/390/1440×两主题×zh/en/both共18组合，折叠展开后`innerWidth=scrollWidth`。148次翻帧、3段复制逐字一致、播放/键盘、速度/循环、闪卡点击/Enter/Space、进度及语言主题持久化通过，0页面/资源错误。[browser](./ch43-independent-browser-results.json)

额外320/390×两主题×both/en共8组合实际横向滚动代码及D4F6，保存24张截图；作者未替我执行。实际打开其中8张代码和D4左右端阅读图。[mobile](./ch43-independent-mobile-results.json)

独立渲染两主题全部74画面并实际打开14张接触表，覆盖D2/D3/D4/D5/D7所有修改帧及其同组前后帧，也覆盖D1/D6。D4F6的冲突、UNKNOWN、metadata PUT说明区分清楚；D5F4/F5的field IDs/applicable deletes底注与Worker留有空间；无短线遮字、穿节点或裁切。7组37帧/74ID及顺序保持。

单run代码返修后再次渲染最终页面；后续D3–D7有52张截图栅格字节变化，未假称它们逐字节一致，而是重新生成并实际打开10张接触表复看全部52画面。D1/D2栅格哈希仍相同，之前已目视。[frames](./ch43-independent-after-frames.json) / [目视连续性](./ch43-independent-visual-continuity.json)

- [D2淡绿](./screenshots/ch43-independent/after/contact-parchment-d2.png) / [深色](./screenshots/ch43-independent/after/contact-dracula-d2.png)。
- [D4淡绿](./screenshots/ch43-independent/after/contact-parchment-d4.png) / [深色](./screenshots/ch43-independent/after/contact-dracula-d4.png)。
- [D5淡绿](./screenshots/ch43-independent/after/contact-parchment-d5.png) / [深色](./screenshots/ch43-independent/after/contact-dracula-d5.png)。
- [D7淡绿](./screenshots/ch43-independent/after/contact-parchment-d7.png) / [深色](./screenshots/ch43-independent/after/contact-dracula-d7.png)。

## 来源与边界

独立抽核10份引用中的9份一手原文，具体支持范围见[sources](./ch43-independent-sources.json)。Dremel PDF的web读取失败后直接取原PDF并以pdftotext核对T1、0.5TB/87TB和Figure10，未沿用作者“已看过”的声明；Iceberg1.10.0的重试验证/分区演进/维护、living spec中的v2删除规则、Parquet元数据、列存论文、Kreps重放与S3跨键非原子说法相符。Lakehouse引用[8]本轮未单独打开，不冒称全引用复核。

既有320px both导航F04与基线相同，非本章阻碍，留Q。没有真实对象存储、分布式Catalog、完整Iceberg引擎、回放协调器、GC、故障网络或生产压测；本地外排、SQLite事务、协议推演和浏览器检查的保证分别记录。未开展Q或扩章。
