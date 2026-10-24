# Ch36 一手来源核对（访问 2026-10-24）

通过 web 工具本轮重新打开下列原文。下列“支持语句”为转述，不把教学算例或模型测试写成论文数据。页面相关结论均就近链接到编号。最初误试 Brewer2.pdf 实际是2012综述，随后确认并使用 Brewer6.pdf 原始论文；Yale旧PACELC地址超时，使用作者现UMD原文成功读取。

| 页面编号与一手原文 | 原文定位 / 具体支持语句（转述） | 本章使用与限制 |
|---|---|---|
| [1] [Gilbert / Lynch 2002](https://groups.csail.mit.edu/tds/papers/Gilbert/Brewer6.pdf) | §2.1 atomic / linearizable；§2.2非失败节点的请求最终终止且无时限；§2.3任意丢消息；§3 Theorem1含公平执行；§4.2构造先写完成后另一侧读 | CAP C/A/P与实时反例。x=0/1为本章重放；快速拒绝没有完成寄存器语义，理论活性与一秒SLO不等同。不是性能测量。 |
| [2] [Eric Brewer 2012 原文授权转载](https://www.infoq.com/articles/cap-twelve-years-later-how-the-rules-have-changed/) | Partition management / Partition recovery：按操作管理限制，恢复时既修复状态又处理分区期外部化结果 | 用于操作范围与恢复，不引用2012产品标签为当前默认行为。 |
| [3] [Daniel Abadi 2012 作者论文](https://www.cs.umd.edu/~abadi/papers/abadi-pacelc.pdf) | p41 PACELC段：P分支A/C、Else正常时L/C；紧接段明确ELC讨论复制系统。p42说明品牌标签与基线配置不等于所有设置 | 仅设计框架。3/7/83、8/84ms来自本章固定耗时假设。同步持久ACK不是完整EC/线性一致证明；已修D4图中文字。 |
| [4] [Amazon Dynamo SOSP2007](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf) | §4.4版本化/应用辅助冲突处理；§4.5读写协调；§4.6暂时故障及sloppy quorum/hinted handoff | 支持可分叉与恢复机制。union只用于本章纯加入购物车；有删除/数量减少必须换规则。固定N交点公式不能套到任意偏好集合外临时节点。 |
| [5] [Raft Extended Version 2014](https://raft.github.io/raft.pdf) | §5.2–5.4任期/选举/日志/当前任期提交；§8客户端唯一序号和回执；p13只读须了解当前提交且验证领导权，租约替代另需时钟界限 | 共识为显式外部依赖。伪代码不实现Raft；同一复制状态机内效果/回执是本章前提，不能跨库凭空原子。 |
| [6] [etcd3.6 API guarantees](https://etcd.io/docs/v3.6/learning/api_guarantees/) | KV / Linearizability：默认线性一致，serializable可相对quorum旧；Watch段明确不保线性一致；Operation completed说明超时可能不确定 | 明确KV范围与读模式；没有运行etcd集群或泛称所有API强读。 |
| [7] [Google SRE Service Level Objectives](https://sre.google/sre-book/service-level-objectives/) | Service Level Terminology / Indicators / Objectives / Agreements：测量、目标、带后果协议不同 | 一秒、30天、99.9%是本章A6/A8；客户端最终感知与服务端代理覆盖率需另量。 |
| [8] [Google SRE Workbook Implementing SLOs](https://sre.google/workbook/implementing-slos/) | What to Measure: Using SLIs：推荐good事件/总事件，示例含期限和新鲜度；后续政策讨论把目标用于决策 | 本章按checkout_id合并重试、原始起点完整cohort、整事件floor和30天窗均为明确教学口径，不声称Google规定该实现。 |
| [9] [Google SRE Workbook Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/) | §6 Multiwindow Multi-Burn-Rate，表5-8及规则：1h AND5m >14.4，6h AND30m >6；2%/5%起点。Low-Traffic段说明单次失败可主导低流量 | 阈值来自原文；AND/OR与严格>逐项检查。2%/5%换算假设事件速率稳定。代码只实现零分母，样本政策仍需按业务选。 |
| [10] [Google SRE Workbook Example Error Budget Policy](https://sre.google/workbook/error-budget-policy/) | SLO Miss Policy：preceding four-week window，超预算后限制变更并保留P0/security例外；背景为示范政策 | 本章明确改成30天完整cohort与整数余额≤0冻结功能，保留经审查紧急/安全修复通道。此函数只返回门控结果，不自动部署/验证回退安全。 |

自设推导：quorum未完成写的先新后旧历史、100个请求的nearest-rank p99例、所有事件/流量/依赖算式与测试输入，均非生产测量。代码与图不会被用于声称真实分布式正确性已证明。
