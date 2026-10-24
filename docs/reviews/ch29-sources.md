# Ch29 原始来源复核

核验日期2026-10-24。通过web打开/查找论文与官方文档；下列是支持的具体事实，不把本章的严格信用、租户限制、状态机或假设数字说成产品默认保证。未复制长段原文。

| 来源 | 核验位置与支持内容 | 本章适用边界 |
|---|---|---|
| [Orca, OSDI 2022](https://www.usenix.org/system/files/osdi22-yu.pdf) | §3 p5，iteration-level scheduling / selective batching；新请求在当前iteration完成后可被考虑 | 可考虑不等于保证最多等一轮；不用论文吞吐倍数估算本站GPU |
| [PagedAttention, SOSP 2023](https://arxiv.org/pdf/2309.06180) | §4，非连续逻辑/物理块；p6 parallel sampling的引用计数与块级COW | 本示例只共享完整不可变块；严格全输出信用为本章策略，非vLLM必须如此 |
| [DistServe, OSDI 2024](https://www.usenix.org/system/files/osdi24-zhong-yinmin.pdf) | prefill/decode干扰；§4的达标比例、goodput与互连条件 | 联合请求目标单独定义；不把论文90%达标参数当本站p99或使用其加速倍数 |
| [FlashAttention, 2022](https://arxiv.org/pdf/2205.14135) | 摘要与IO-aware attention，HBM/SRAM间数据访问 | 内核优化区别于调度、租户公平和取消生命周期 |
| [vLLM v0.15.1 APC design](https://docs.vllm.ai/en/v0.15.1/design/prefix_caching/) | hash组件、full-block缓存、cache_salt、ref_cnt以及allocate/free/eviction | 版本固定；服务器按信任域赋salt是本章设计，不能信任客户端任选他人的salt |
| [vLLM v0.15.1 APC feature](https://docs.vllm.ai/en/v0.15.1/features/automatic_prefix_caching/) | Limits明确减少prefill，不减少decode步数 | 命中不能旁路输出额度；miss不是生成失败 |
| [vLLM v0.15.1 tuning](https://docs.vllm.ai/en/v0.15.1/configuration/optimization/) | Chunked Prefill / max_num_batched_tokens，较小/较大token预算的ITL/TTFT取舍 | 本章tenant deficit政策不是该版本默认策略；没有固定20ms运行保证 |
| [CUDA Runtime 13.4 types](https://docs.nvidia.com/cuda/cuda-runtime-api/cuda_runtime_api/group__CUDART__TYPES.html) | cudaErrorNotReady、cudaErrorIllegalAddress、cudaErrorLaunchTimeout | 非法访问使进程不一致并需重启；不能推广成任何OOM都只失败一条 |
| [CUDA Runtime 13.4 events](https://docs.nvidia.com/cuda/cuda-runtime-api/cuda_runtime_api/group__CUDART__EVENT.html) | cudaEventRecord捕获调用时stream工作；cudaEventQuery只判captured work；未record事件表示空工作 | 所有关联stream/copy都必须纳入完成证据。Java手工complete不验证真实CUDA适配器 |
| [WHATWG SSE](https://html.spec.whatwg.org/multipage/server-sent-events.html) | EventSource URL接口、Last-Event-ID与事件解析；页面更新时间2026-10-22 | 不提供服务器日志/GPU恢复；fetch POST解析SSE是本章选择；chunk到达不冒充token-ready ITL |
| [PostgreSQL 18 INSERT](https://www.postgresql.org/docs/18/sql-insert.html) / [row locks](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS) | ON CONFLICT、唯一索引竞争、FOR UPDATE行锁和UPDATE锁 | attempt伪代码需权威单库和条件更新；本轮未运行PG，不宣称分布式故障实验 |

本章所有容量/时延/tenant上限/缓冲/保留期/带宽均为教学假设或假设下的推导。C=12现指≥99%请求联合达标下的最大接纳率（未实测），不把goodput直接当总完成率。TTFT用客户端时间轴，ITL/TPOT用worker token-ready时间轴，客户端内容块间隔另报。
