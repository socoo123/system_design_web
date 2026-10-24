# Ch39 一手事实核对（2026-10-24）

本轮实际浏览以下标准、论文与项目官方页面。在线Envoy页为检查时的latest开发文档（页面标示1.40/1.41-dev），只引用明示机制/默认，不声称本章实现完整Envoy/Kubernetes行为。A1–A12数字另列为教学假设；没有下载/压测声明冒充本轮验证。

| 页内引用 | 一手来源与实际支持 | 本章使用边界 |
|---|---|---|
| [1] | [Maglev论文](https://www.usenix.org/system/files/conference/nsdi16/nsdi16-paper-eisenbud.pdf) §2.1的ECMP/GRE/DSR；§3.3本地连接跟踪、原后端仍能服务的前提、仅过期逐出/满表无法记录新绑定；§3.4填表与查表；§5.3默认65537与重映射 | D6只画选择，D7才画真实包路径；不搬论文pps或延迟充当本章容量。修掉“活表项被压力冲掉”的不准确泛化。 |
| [2] | [RFC9113](https://www.rfc-editor.org/rfc/rfc9113.html) §5多流复用；§6.8 GOAWAY的last-stream-id、不得再开流、较大ID未处理/可新连接重试 | 活动RPC不逐token换机；≤last-id只表示可能处理，不凭缺回复判没执行。 |
| [3] | [gRPC官方2017机制说明](https://grpc.io/blog/grpc-load-balancing/)与[当前Custom Load Balancing Policies](https://grpc.io/docs/guides/custom-load-balancing/)，Overview说明resolver地址、subchannel和每RPC picker | 不沿用历史产品清单，不声称任意语言默认round_robin；可信客户端可用该替代架构。 |
| [4] | [Envoy Supported load balancers](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/load_balancers)，Weighted least request说明等权N候选默认2，非等权动态权重/(active+1)^bias | 本例等容量、两个不同索引是自选教学政策，未复刻非等权算法；观测active不是后端权威额度。 |
| [5] | [Redis replication](https://redis.io/docs/latest/operate/oss_and_stack/management/replication/)，默认异步复制，WAIT不提供强一致且已确认写仍可能在failover丢失 | 会话外置不证明撤销耐久；A8要求当前权威或拒绝。没有Redis实例/切主实验。 |
| [6] | [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)，Cookie安全、权限变化轮换及服务端超时/登出失效 | 不从来源推出统一TTL；敏感写与撤销同串行化边界是本章额外契约。 |
| [7] | [Envoy Health checking](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/health_checking)，主动/被动检查、阈值/timeout与Health check identity | TCP连通不是业务就绪；2s/两败/0.3s/0.2s均为A9，4.5s不是Envoy默认或承诺。 |
| [8] | [Envoy Draining](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/operations/draining)，默认shutdown与预先graceful drain区别、过滤器/协议支持、HTTP1 close与HTTP2 GOAWAY | 本地close→移除确认→真实idle是本章协调器契约，不声称现成代理自动实现屏障。 |
| [9] | [RFC9110 §9.2.2](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2)，客户端非幂等自动重试的条件与代理不得自动重试非幂等请求 | A10重试一次是上限，不是自动重试授权；业务键/参数/效果/结果同库与保留期为Ch24依赖。 |
| [10] | [Karger等STOC1997原文](https://people.csail.mit.edu/karger/Papers/web.pdf)，Web缓存和集合变化时少改映射 | 环不是KV专用；没有把random trees的热点解决证明移植到单一LB哈希。 |
| [11] | [Envoy Maglev API](https://www.envoyproxy.io/docs/envoy/latest/api-v3/extensions/load_balancing_policies/maglev/v3/maglev.proto)，default65537、prime表及minimal disruption非绝对保证 | 4B/槽为A11；不能宣称全部改槽恰好1/N或任意故障零reset。 |
| [12] | [Kubernetes Pod termination](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-termination)，kubelet本地退出与EndpointSlice处理并发，terminating端点ready=false | 不把ready=false当所有入口确认，更不把删除API对象当物理进程已经结束。A10的30s为自设预算。 |
| [13] | [Envoy Panic threshold](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/panic_threshold)，可用比例过低时可以忽略health，默认阈值50% | Java候选为空即拒绝是显式fail-closed教学政策，未冒充Envoy默认。 |

浏览工具的定位已实际阅读：Maglev连接跟踪§3.3及默认表§5.3；RFC9113 §6.8和RFC9110 §9.2.2；gRPC当前指南Overview；Kubernetes Pod Termination Flow；Redis复制WAIT段；Envoy least-request、identity和drain/panic段。正文就近引用，末尾引用条目描述用途。
