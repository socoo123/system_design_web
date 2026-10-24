# Ch36 独立来源抽核

2026-10-24，复核者直接通过web重新打开原文，未以作者sources.md替代来源审阅。无产品性能/生产数据引用。

- [Gilbert/Lynch原始CAP证明](https://groups.csail.mit.edu/tds/papers/Gilbert/Brewer6.pdf)，§2.1–2.3（PDF页2–3）、Theorem1及其公平执行条件：C为atomic/linearizable，非失败节点请求最终终止而没有固定时限，网络可丢任意多消息。现章把写OK严格早于读调用且无中间写钉住，x=0旧读是具体反例；快速拒绝未完成寄存器操作，不能拿HTTP快速返回满足CAP A。已区分定理与本地反例程序，未声称程序是证明。
- [Abadi作者PACELC论文](https://www.cs.umd.edu/~abadi/papers/abadi-pacelc.pdf)，印刷p41/PDF第5页PACELC段及后接复制条件：分区时A/C、正常复制时L/C。现章只把同步远端持久ACK列作持久屏障，不把“多等一个ACK”直接等同EC/线性一致；7/83ms是A4条件算术，未冒称论文测量。没有把2012品牌分类用作当前默认配置。
- [Google SRE Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/)，§6原规则与表5-8：1h/5m都严格超过14.4，或6h/30m都严格超过6；2%/5%是完整预算/相应长窗、且流量稳定时的起点。Low-Traffic部分说明少量事件会放大burn，现章代码只管零分母并明确未实现最小样本政策，未泛称参数通用。
- [Google SRE Example Error Budget Policy](https://sre.google/workbook/error-budget-policy/)，SLO Miss Policy：原文是前四周、超预算后限制变更并保留P0/security例外。现章30天、整数余额≤0冻结功能是明确自选的更保守发布线；函数返回门控，不自动部署或核验回退兼容。这层差异已经就地说明。
- [etcd3.6 API Guarantees](https://etcd.io/docs/v3.6/learning/api_guarantees/)，KV线性一致/serializable与Watch章节：默认KV保证与可选旧读分开，Watch另有语义；操作超时可能结果未知。现章未把所有API写成强读，也未运行集群。
- [Raft扩展论文](https://raft.github.io/raft.pdf)，§8客户端交互/只读屏障：客户端身份/序号和最近回执避免副作用重复；只读要当前提交位点并验证leader，随后本地至少应用到该位点。现章Consensus是完整外部协议，其同状态机效果/回执前提写明，未声称跨另一业务库原子。伪代码不实现Raft。

以上六份抽核只支持相应定义和机制。副本图、SLI聚合和budget本地程序仍是教学模型；没有外部共识/监控存储/真实用户覆盖率或性能实验。
