# Ch06 独立复核

复核者：Ch07作者，Astra High；2026-10-23。先独立读取 Ch06 页面、四份 examples 源文件并运行反例，再阅读作者报告。仅写独立复核证据，未改 Ch06、共享文件或 PLAN。

结论：**通过独立复核，发现的三项 P1 均已关闭**。无 P0、无残留 P1；未发现新的阻碍阅读 P2。默认不实施墓碑 GC、因果 writer 的严格输入契约和真实存储/网络未验证范围均已明确。

## 发现及关闭条件

1. **P1：APPLY 校验晚于持久日志。** 初版在 `winner(...)` 前 append/sync，而 Java winner 会拒绝相同版本不同内容。错误记录已进入 WAL，恢复重放可再次抛错。主代理先指出此项，我独立检查并用原顺序模型复现。已修为同一 epoch/key guard 内 compute/validate → WAL append/sync → publish；重跑新增负例确认被拒绝记录不入日志。关闭。
2. **P1：共享 actor 的递增 counter 不能保留客户端并发。** 两客户端都读 `[A:1]`，共享 B 先后领 1、2，生成 `[A:1,B:1]` 与 `[A:1,B:2]`。前者被错误当成祖先而丢失。独立 Java probe 在原实现上复现。作者选择收窄教学契约：actor 为单一串行因果 writer，每次携带自己全部历史；并发 writer 使用不同 actor，禁止共享 Coordinator ID。双语正文/代码注释/闪卡明确前提，并加入共享 actor 负例和独立 actor 正例。复跑成立；纯函数仍不验证调用方完整历史，该限制已写明。关闭。
3. **P1：修复全部副本后仍可能被迟到客户端复活。** 所有副本已保存 DEL@300、相关旧 SST 已清理，清掉全部墓碑后，超时客户端或在途 RPC 重放 PUT@200。`winner(ABSENT,PUT@200)` 复活，即使副本修复曾成功。原回放边界只列旧备份/hint/退役副本；需覆盖客户端重试/在途请求，且没有旧消息终止证明时不得完整清墓碑。作者已补全客户端/在途 RPC 输入并明确本章默认保留墓碑、不实现GC；所有旧 mutation 必须受强制寿命/排空/入口拒绝协议限制，否则不能完整清除删除历史。持久删除水位仍属于压缩墓碑，本例未实现。Java 增加全副本已修好后晚到客户端复活反例，23场景复跑通过，双语与闪卡一致。关闭。

独立反例源码：[ch06-independent-probe.java](ch06-independent-probe.java)。其中 `ORIGINAL APPLY order` 明确保留原错误顺序作历史证据，后段同时验证修正顺序；并非声称当前页面仍按旧顺序执行。

## 独立技术轨迹

- 正常完成写：固定 U={A,B,C}，W={B,C} 写 v2 后，枚举任意两元素读集合都读到 v2；9 对读写集合最小交集为1。前提为同一成员 epoch、记录未丢、正确版本排序、没有更高版本覆盖，页面均有声明。
- 未完成少数写：仅 A 有 v2，AB 读 v2；修复尚未执行时 BC 读 v1。两次 R=2 仍回退。页面没有把异步修复写成 Cassandra 默认，更没有据此宣称线性一致。
- ACK：独立事件模型按 (node,epoch,key,mutation_id,durable) 过滤。重复 A、D 临时副本、错 epoch、错 key、错 mutation、非耐久响应均无法凑 W=2。B 已持久化但回包丢失仍只能 UNKNOWN。ID绑定不可变 mutation 是明确输入契约，不由 Set 实现。
- LWW：DEL300 胜 PUT200；旧 hint 保留200不会复活，重打400则复活；1200快钟 X 胜过真实后发生但戳1100的Y；两个读10写11不会得到12。确定性收敛与业务意图/实时先后区分正确。
- 向量：不可比 `[A2]`、`[A1,B1]` 保留；合法上下文合并 `[A2,B2]` 支配已见兄弟，未见 `[A3]` 仍并发。共享actor反例与上述限制一并验证，未将本地纯函数当完整因果存储。
- 墓碑：删除并非ABSENT；全副本修复和本地旧文件覆盖必须有实际证据。`2+1<7`只是操作余量；任意旧输入仍可到来时，完整移除删除信息不安全（见第3项）。

独立模型和数值代码：[ch06-independent-model.py](ch06-independent-model.py)，输出：[ch06-independent-results.txt](ch06-independent-results.txt)。模型不代表真实磁盘/网络故障实验。

## 独立数字复算

- 1亿×1000B=100GB；3副本300GB；SST系数2得600GB；80%预算需750GB。
- 写10MB/s，三目的地合计30MB/s=240Mb/s；Coordinator本身是副本时额外网络两份20MB/s，页面有区分。
- 读出口50MB/s，两份完整value到Coordinator为100MB/s。
- 50k×2/10=10k副本读/机/s；热点20%=10k，固定两副本各为80k/10+10k=18k，相对12k超50%；三份均摊仍为8k+20k/3≈14,666.67。
- SST输出10MB/s×3×10=300MB/s；WAL同载荷另加30MB/s，不是网络带宽。
- Bloom阴性候选期望多读10×1%=0.1；独立假阳性至少一次1−0.99^10≈9.5618%；每key10bit给125MB/份、三份375MB。
- 864000s=10天；7−(2+1)=4天余量，不能当GC充分证明。

## 一手来源抽核

本次实际打开并阅读：

- [Cassandra 5.0 Read repair](https://cassandra.apache.org/doc/latest/cassandra/managing/operating/read_repair.html)：默认BLOCKING、失败少数写后避免quorum读回退；阻塞到相应CL。页面已准确区分本章异步策略。
- [Cassandra 5.0 Tombstones](https://cassandra.apache.org/doc/latest/cassandra/managing/operating/compaction/tombstones.html)：Zombies、10天默认、相关旧SST覆盖、only_purge_repaired_tombstones额外限制。文档不能替本章证明客户端重试寿命，故独立补出第3项。
- [Cassandra Hints](https://cassandra.apache.org/doc/latest/cassandra/managing/operating/hints.html)：三副本等待两份、原mutation时间戳、max_hint_window的3h生成窗口；与本章1h保留假设区分正确。
- [RocksDB Basic Operations](https://github.com/facebook/rocksdb/wiki/Basic-Operations)：Synchronous/Non-sync Writes区分OS缓存与持久存储，sync=true；本章选择同步而非声称产品默认。
- [Dynamo SOSP2007](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf) §§4.1、4.4：get返回冲突对象及context，put携context、祖先/兄弟关系与应用合并。单一writer的收窄实现是本章教学契约，不应把共享Coordinator计数直接视为完整因果跟踪。

## 视觉与浏览器独立抽查

原始title IDs与顺序30/30保留；独立SHA比较只发现第26–30个SVG（d6）变化，前25个SVG与授权前基线逐字节相同。

目视第6组全部5帧两主题，以及d2s5读修复、d3s5分区/sloppy、d5s6后台反压密集/故障帧。B ACK与C timeout/C ACK分离后归属清楚；节点稳定，箭头路径/主题颜色可辨；未见新增遮挡裁切。独立截图见 `screenshots/ch06-independent/`。

[ch06-independent-browser.mjs](ch06-independent-browser.mjs) 实际执行320/390/1440 ×两主题×both共6组；展开所有details后依然 `innerWidth=scrollWidth`，48次实际翻帧（每组合d6全部5帧及d2/d3/d5末帧），无页面脚本错误。窄屏图内部可滚动到右侧；已知共享顶栏320双语逐字折行、图注随slide横滚而离屏均复现并登记，不修改共享UI。

代码与核心检查：Java17完整类及独立probe编译运行，作者最新23场景通过；四块源码/页面同源检查通过；独立模型通过；`audit-chapter.mjs ch06`通过。最终复验覆盖三项返修；源码/页面同源与独立probe均通过。

## 未验证

未实施真实持久存储掉电、跨节点并发/网络分区、成员切换、墓碑GC生产协议或吞吐压测。纯函数、日志轨迹和有限集合模型只验证列出的教学条件。没有把这些结果报告为生产可靠性证明。未提交、推送或部署。

## 最终版本

`chapters/ch06.html` SHA256：`92fb5decebb8378f0afb4cb0cb61e6cade738bfd9d996b01b9593777a5035583`。最终独立浏览器结果见 [ch06-independent-browser-results.json](ch06-independent-browser-results.json)，包含同一SHA、6个实际视口主题组合与48次帧访问。
