# Ch35 一手来源与支持说法

重新联网核对：2026-10-24。下列内容均通过web打开一手原文，并针对关键词检索；不是把旧2026-10-07标签改日期。固定版本与可变页分开，未引用产品容量、价格或性能倍数。全文无直接长引文。

| 页面编号 / 一手来源 | 本次核到的机制 | 页面如何使用 / 不据此承诺 |
|---|---|---|
| [1] [MLflow Model Registry Workflows](https://www.mlflow.org/docs/latest/ml/model-registry/workflow/) · 可变在线页 | alias可以经UI/API重指向model version；部署用alias引用版本 | 解释prod不是内容身份。原子快照、发布CAS、完整bundle和审计是本章协议，不是MLflow默认保证。 |
| [2] [HF Hub Download](https://huggingface.co/docs/huggingface_hub/en/guides/download) · 可变在线页 | revision可以固定完整commit hash；snapshot_download按给定revision下载仓库 | 同一版本固定所有文件。未据此宣称manifest必定完整、签名可用或120s加载性能。 |
| [3] [Kubernetes Resource Bin Packing](https://kubernetes.io/docs/concepts/scheduling-eviction/resource-bin-packing/) · 可变在线页 | NodeResourcesFit的MostAllocated偏向已分配资源较高的节点，按资源权重评分 | fit约束之后的评分，不是GPU显存隔离、设备组原子预留或幸存吞吐证明。 |
| [4] [Kubernetes Topology Spread](https://kubernetes.io/docs/concepts/scheduling-eviction/topology-spread-constraints/) · 可变在线页 | topologyKey识别域；DoNotSchedule在硬约束无法满足时不调度，ScheduleAnyway不同 | 本文硬spread须明确配置。跨机器不自动意味着跨机架/电源/地域，仍要复算最大故障损失。 |
| [5] [Gateway API Inference Extension Introduction](https://gateway-api-inference-extension.sigs.k8s.io/) · 可变在线页 | Gateway是代理/LB，EPP是Inference Router实现，按模型指标/能力作端点选择 | 白板合并选择与代理是本文选择；不得将EPP误称token代理或持久准入权威。 |
| [6] [vLLM v0.15.1 Optimization](https://docs.vllm.ai/en/v0.15.1/configuration/optimization/) · 固定版本 | KV不足会重计算；max_num_seqs/max_num_batched_tokens和并行度影响KV与性能；并行有同步/延迟代价 | 解释slots不等于req/s，权重/KV/计算预算不同。32槽、C=4、80%和显存数全是教学假设。该调参页不支持本章取消/退休协议。 |
| [7] [NVIDIA GPU Operator 24.9.1 GPU Sharing](https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/24.9.1/gpu-sharing.html) · 固定版本 | time-sliced replica共享底层GPU且无其间显存/故障隔离；MIG提供相应硬件层隔离 | GPU Operator的replica不等于本章完整模型副本。本文不把MIG扩展成宿主机/网络/整服务隔离，也不使用卡价。 |
| [8] [vLLM stable Security](https://docs.vllm.ai/en/stable/usage/security/) · 本次可见页日期2026-10-12 | Multi-Tenant Deployments说明共享进程不隔离租户；前缀命中TTFT可泄露存在性；同秘密salt才能共享相应前缀块 | cache_salt是风险缓解/复用边界，不保证硬件、进程或公平隔离。不引用攻击AUC/成功率。v0.15.1安全页本次未找到该节，因此没有把新安全说明冒称为v0.15.1产品保证。所有外部KV connector仍需独立验证namespace一致，本章未使用connector。 |
| [9] [KServe Next Canary Rollout](https://kserve.github.io/website/docs/next/model-serving/generative-inference/llmisvc/canary-rollout) · Next可变文档 | 相对权重9:1=90/10，9:9=50/50；零权重转正有backend预热提醒；force-stop promotion把v1 pod缩到0并释放GPU，恢复须重启等待READY | 本文选继续保留旧9副本热容量，刻意不照搬force-stop；“资源还在”不能证明热回退。未采纳文档开头“instant”作为分布式撤销保证。 |
| [10] [Kubernetes Controllers](https://kubernetes.io/docs/concepts/architecture/controller/) · 可变在线页 | 控制器反复比较desired与current，并驱动/报告状态；多控制器协作 | 解释desired/observed回路。稳定replica identity、epoch/设备唯一预占和5s扫描是教学设计，未运行Kubernetes。 |
| [11] [SQLite Transaction](https://www.sqlite.org/lang_transaction.html) · 可变在线页 | 同时可多读但仅一个写事务；BEGIN IMMEDIATE先争写事务，竞争可BUSY；COMMIT/ROLLBACK定义事务边界 | 实际SQLite 3.51.0多连接/进程退出验证；没有用本地锁冒充分布式保证，也没有运行PG或声称SQLite为生产fleet首选。 |
| [12] [CUDA Runtime API 13.4 Events](https://docs.nvidia.com/cuda/cuda-runtime-api/cuda_runtime_api/group__CUDART__EVENT.html) · 当前手册13.4 | cudaEventRecord捕获当时stream工作，之后工作不自动加入；Query/Sync仅确认captured work | 实际引擎适配必须覆盖所有kernel/copy/stream依赖并阻止后续访问。SQL release只接收可信适配通知；测试不证明CUDA/物理退休。 |

训练/在线预算、不可变bundle、MiB严格信用、有限快照、先intent后send/launch、API/checkpoint兼容拒绝、expand/contract次序与热回滚策略是本文设计/推导。只以对应原语支撑适用部分，没有宣称来源为本教学组合提供端到端保证。

所有数字：A1–A12，资源分解80−40−8−8=24 GiB，以及SQLite 4/8 MiB小fixture，都不是生产测量。容量C是固定负载/SLO约束下最高接纳率的**待测假设**；goodput只计达标完成，不直接作总完成率或准入率。来源不支持任何实际吞吐/延迟保证。
