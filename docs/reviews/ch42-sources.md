# Ch42 一手来源核对

2026-10-24，作者实际通过网页工具重新打开下列原文，并针对核心段落查找定位。
链接在章节相关结论旁以 `[n]` 锚点出现；这里记录支持范围，不把教学参数写成厂商测量。

| 页内编号 / 原文 | 本轮核对的支持范围 |
|---|---|
| [1] [Kafka 4.1 Design](https://kafka.apache.org/41/design/design/) | Kafka输出/输入位点事务、read_committed和外部系统合作边界；share group在4.1为预览、可多人共享分区并逐记录确认。 |
| [2] [KafkaConsumer 4.1 API](https://kafka.apache.org/41/javadoc/org/apache/kafka/clients/consumer/KafkaConsumer.html)、[Consumer Configs](https://kafka.apache.org/41/configuration/consumer-configs/#group.protocol) | fetched/committed位置不同；offset可有空洞；nextOffsets、leader epoch、手动提交、pause/poll与max.poll.interval；API不线程安全。group.protocol的classic/consumer是协议选项。页上4.1 API实际显示4.1.2构建。 |
| [3] [Debezium Outbox Event Router](https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html) | 事件唯一id可用于接收端去重，aggregate key决定分区顺序；不声称outbox涵盖远端HTTP。 |
| [4] [Google SRE Handling Overload](https://sre.google/sre-book/handling-overload/) | 新流量/重试的过载保护、每请求与客户端预算、避免多层组合放大。原文的预算定义与本章A9“额外attempt≤原始流量10%”区分；110/s是按A9自行推导。 |
| [5] [Resilience4j Bulkhead](https://resilience4j.readme.io/docs/bulkhead) | SemaphoreBulkhead与有界队列/固定线程池；信号量不自动替用户配置执行资源。 |
| [6] [Resilience4j TimeLimiter](https://resilience4j.readme.io/docs/timeout) | 超时与是否调用Future取消的配置，不能据此推出socket停止。 |
| [7] [Resilience4j CircuitBreaker](https://resilience4j.readme.io/docs/circuitbreaker) | CLOSED/OPEN/HALF_OPEN、最少样本、阈值含等号、失败/忽略分类、半开全部许可完成再评估；窗口不限制执行并发。 |
| [8] [Netflix Hystrix README](https://github.com/Netflix/Hystrix) | 官方Status为maintenance mode，不再积极开发/发布；不改述为无法使用。 |
| [9] [Linux namespaces(7)](https://man7.org/linux/man-pages/man7/namespaces.7.html) | 资源视图隔离，包括PID、network、mount等。 |
| [10] [Linux cgroup v2](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html) | 分层管理进程与CPU/内存等资源限制；不提供本章吞吐数字。 |
| [11] [Kubernetes Pods](https://kubernetes.io/docs/concepts/workloads/pods/) | 一个或多个容器、共享网络/声明卷，不能泛化为全部namespace默认共享。 |
| [12] [Kubernetes Controllers](https://kubernetes.io/docs/concepts/architecture/controller/) | 通过API不断将当前状态向期望状态对齐。 |
| [13] [Kubernetes Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/) | startup/readiness/liveness职责及普通Service的Ready流量条件；不提供250req/s预算。 |
| [14] [Dockershim Removal FAQ](https://kubernetes.io/blog/2022/02/17/dockershim-faq/) | 1.24移除dockershim，兼容Docker构建镜像继续可用。 |
| [15] [kube-scheduler](https://kubernetes.io/docs/concepts/scheduling-eviction/kube-scheduler/) | 筛选节点与binding，执行由节点kubelet/CRI负责。 |
| [16] [Borg paper landing page](https://research.google/pubs/large-scale-cluster-management-at-google-with-borg/) | 2015年集群管理历史背景；页内保留为延伸来源，未以Borg数据支持任何Kubernetes容量结论。 |
| [17] [CompletableFuture Java 17](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/CompletableFuture.html) | cancel是异常完成；mayInterruptIfRunning在此实现不控制计算。orTimeout也不能证明底层任务终止。 |
| [18] [SQLite Transactions](https://www.sqlite.org/lang_transaction.html)、[UPSERT](https://www.sqlite.org/lang_upsert.html)、[Primary key NULL caveat](https://www.sqlite.org/quirks.html#primary_keys_can_sometimes_contain_nulls) | BEGIN IMMEDIATE、单写事务、BUSY与回滚、唯一冲突分支。普通rowid表复合主键需显式NOT NULL；本轮用真实SQLite 3.51.0核查本地约束。 |
| [19] [Pod Termination Flow](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-termination) | preStop计入同一个宽限、TERM与EndpointSlice处理并行、截止强停；端点状态不是所有入口撤路由的同步确认。 |
| [20] [Amazon Timeouts, retries, and backoff with jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/) | 超时可能已经产生副作用、单层重试与jitter/退避原则；100ms/250ms是A7，不是AWS默认配置。 |

页面A1–A12的流量、字节、deadline、permit、探针与副本数均为教学假设。
计算见[ch42-check-results.json](ch42-check-results.json)；没有生产压测或厂商容量引用。
