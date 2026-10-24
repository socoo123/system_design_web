# Ch35 独立来源抽核

2026-10-24，独立重新打开官方文档；没有把作者的来源报告当作本次访问证据。抽核下列7份，未验证其运行环境/API，也未引用吞吐实测。

| 官方页 | 独立核到的事实与本章边界 |
|---|---|
| [CUDA Runtime API 13.4 Events](https://docs.nvidia.com/cuda/cuda-runtime-api/cuda_runtime_api/group__CUDART__EVENT.html) | Query/Sync只覆盖event captured work；Record之后新增stream工作不加入；尚未record的空event也可能返回Success。因此本章release必须由覆盖全部kernel/copy/stream依赖的可信适配器调用，SQL测试不证明GPU停止。 |
| [vLLM v0.15.1 Optimization](https://docs.vllm.ai/en/v0.15.1/configuration/optimization/) | KV不足会触发重计算；sequence/batch-token限制与TP/PP内存/同步代价分别讨论。文档没有本章C=4/32槽/80%的性能证明，页面已标假设。 |
| [HF Hub Download](https://huggingface.co/docs/huggingface_hub/en/guides/download) | revision能固定完整commit hash；snapshot_download按一个revision下载仓库。不能从中推出120秒性能或整个平台原子发布。 |
| [Kubernetes Topology Spread](https://kubernetes.io/docs/concepts/scheduling-eviction/topology-spread-constraints/) | topologyKey定义域；DoNotSchedule不满足约束就保持pending，ScheduleAnyway不同。域分散不能代替故障后容量复算。 |
| [NVIDIA GPU Operator 24.9.1 GPU Sharing](https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/24.9.1/gpu-sharing.html) | time-sliced replicas没有显存/故障隔离，MIG有对应硬件边界。本章未扩大成主机/网络/端到端隔离承诺。 |
| [KServe Next Canary Rollout](https://kserve.github.io/website/docs/next/model-serving/generative-inference/llmisvc/canary-rollout) | 权重相对；9:1是90/10，force-stopping旧服务会释放GPU，零权重转正有backend预热提醒。本章保留旧热容量是不同部署策略，不能照搬释放GPU再声称热回滚。 |
| [vLLM stable Security](https://docs.vllm.ai/en/stable/usage/security/) | 实际页显示2026-10-12；同进程不隔离租户。cache_salt限定共享相同prefix块并缓解特定timing风险；盐需不可猜。本章没有把该可变页能力说成固定v0.15.1保证。 |

独立手推的边界：goodput只计达标完成，不等于总接纳率。C=4只能作为固定负载/SLO条件下的待测准入容量假设。Little定律必须同一稳定准入到物理释放边界；32槽是信用上限，不是req/s。异构与TP要逐设备并按完整group失效，11副本结论仅针对本章三机均衡分配、单副本一卡、C×80%口径。
