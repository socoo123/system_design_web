# Ch29 independent source audit · 2026-10-24

The reviewer reopened the sources below through the web tool and compared the
specific claims with the authored page, beyond reading its source report. No
version-sensitive API or vendor runtime behavior was assumed from memory.

| Primary source | Independent support check | Boundary |
|---|---|---|
|[vLLM v0.15.1 APC design](https://docs.vllm.ai/en/v0.15.1/design/prefix_caching/)|Cache identity, completed blocks, per-request salt and refcount were checked. Server-chosen trust domains are compatible with the mechanism.|The Java ledger accepts already selected full-block handles; it does not implement token/model/tenant cache lookup or enforce tenant identity itself.|
|[vLLM v0.15.1 optimization](https://docs.vllm.ai/en/v0.15.1/configuration/optimization/), Chunked Prefill|The documented token budget changes the ITL/TTFT tradeoff.|The chapter's deficit/tenant limits and strict full-output credits are teaching policy, not this version's default scheduler.|
|[CUDA Runtime13.4 Event Management](https://docs.nvidia.com/cuda/cuda-runtime-api/cuda_runtime_api/group__CUDART__EVENT.html), EventRecord/Query|The event covers captured stream work at recording time, beyond arbitrary future submissions. Unrecorded events represent empty work.|The chapter correctly requires all relevant stream/copy/block-table dependencies; manually completing a Java ticket is not CUDA verification.|
|[DistServe original OSDI2024 paper](https://www.usenix.org/system/files/osdi24-zhong-yinmin.pdf), abstract/definition of goodput|Targets both latency phases and attained-request rates; its reported attainment/experimental hardware are specific to the paper.|C=12 and ≥99% joint maximum-worker-ITL target are explicitly unmeasured chapter assumptions, not a paper performance result or queue service μ.|
|[vLLM v0.15.1 APC feature](https://docs.vllm.ai/en/v0.15.1/features/automatic_prefix_caching/), Limits|Repeated-prefix reuse saves prefill work, beyond unchanged suffix generation steps.|No measured speedup is inferred for this workload.|
|[WHATWG SSE](https://html.spec.whatwg.org/multipage/server-sent-events.html), EventSource/Last-Event-ID|The interface provides event parsing/reconnect cursor behavior.|It does not supply application persistence or restore GPU KV; a successful write is not a client display acknowledgement.|
|[PostgreSQL18 INSERT](https://www.postgresql.org/docs/18/sql-insert.html), ON CONFLICT|Unique arbitration is the adapter basis for one attempt row; conditional updates preserve the chosen owner.|Independent execution uses real SQLite with coarser write locking. It does not prove PostgreSQL isolation, cluster durability or actual commit-unknown recovery across a network.|

Independent arithmetic includes a disjoint-violation set: TTFT passes99/100,
worker max-ITL passes99/100, but only98/100 satisfy both. A separate token-ready
20ms timeline with60ms client flush gaps confirms these metrics need separate
endpoints. No benchmark, production reliability, real GPU transfer, tokenizer or
sampling claim was validated.
