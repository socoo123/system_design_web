from pathlib import Path
import re, html

target = Path('chapters/ch29.html')
original = Path('docs/reviews/ch28-ch29-ch30-baseline/ch29.html').read_text()
assert target.read_text() == original, 'Chapter changed since baseline; inspect before writing'
decks = re.findall(r'<figure class="deck">[\s\S]*?</figure>', original)
assert len(decks) == 6
# D1: keep every node and edge, move only the enclosing dashed boundary.
decks[0] = decks[0].replace('x="120" y="18" width="824"', 'x="148" y="18" width="796"').replace('x="136" y="38"', 'x="164" y="38"')
# D3F5: use the empty B / t+2 cell for the red-barrier explanation.
decks[2] = decks[2].replace('<text x="505" y="359" text-anchor="middle" class="tiny">reject: D waits for all of A</text>', '<text x="762.5" y="177" text-anchor="middle" class="tiny">rejected barrier:</text><text x="762.5" y="197" text-anchor="middle" class="tiny">D waits for all of A</text>')
table = re.search(r'<table>[\s\S]*?</table>', original).group()
table = table.replace('生产页 16 token', '本章页大小 16 token').replace('16 tokens/production block', '16 tokens/design block')
table = table.replace('TTFT p99 ≤ 800 ms；相邻输出间隔 ITL p99 ≤ 50 ms', '每请求TTFT≤800 ms且最大worker ITL≤50 ms；联合达标≥99%')
table = table.replace('TTFT p99 ≤ 800 ms; inter-token latency ITL p99 ≤ 50 ms', 'Per-request TTFT≤800 ms and maximum worker ITL≤50 ms; joint attainment≥99%')
table = table.replace('A5 · 用户侧目标','A5 · 延迟观测目标').replace('A5 · client-side targets','A5 · latency observation targets')
table = table.replace('统计相邻间隔；平均 TPOT 单独报告', '另报客户端块间隔与请求联合达标比例').replace('Measure individual gaps; report average TPOT separately', 'Also report client chunk gaps and joint request attainment')
table = table.replace('接入/解析 50 ms、纯 prefill 150 ms、排队预算 600 ms', '端到端其他开销 50 ms、纯 prefill 150 ms、排队预算 600 ms')
table = table.replace('50 ms ingress/parsing, 150 ms pure prefill, 600 ms wait budget', '50 ms other end-to-end work, 150 ms pure prefill, 600 ms wait budget')
table = table.replace('若目标负载下单副本 goodput 测得 12 req/s，计划用 70%；占用均值假设 6 s', '若联合达标比例≥99%时最高接纳率测得12 req/s，计划用70%；GPU驻留均值假设6 s')
table = table.replace('If one replica benchmarks at 12 goodput req/s, plan at 70%; assume mean occupancy 6 s', 'If maximum admission at ≥99% joint attainment benchmarks at 12 req/s, plan at 70%; assume 6 s mean GPU residence')
table = table.replace('队列描述最多 100；预留输入与输出 token 配额；租户输入例为 4,096 token/s', '全局队列100、每租户25；活动每租户32/5,120页；输入配额例4,096 token/s')
table = table.replace('At most 100 queued descriptions; reserve input/output token quota; illustrative tenant input rate 4,096 token/s', 'Global queue 100, per tenant 25; tenant active cap 32/5,120 pages; input quota example 4,096 token/s')

def bi(zh, en):
    return '<div class="bilingual"><div class="lang-zh">' + ''.join('<p>'+p+'</p>' for p in zh) + '</div><div class="lang-en">' + ''.join('<p>'+p+'</p>' for p in en) + '</div></div>'
def heading(zh, en, level=2):
    return f'<h{level}><span class="lang-zh">{zh}</span><span class="lang-en">{en}</span></h{level}>'
def snippet(ref, language, kind='pseudocode'):
    return f'<pre data-language="{language}" data-kind="{kind}" data-source="{ref}"><code></code></pre>'
def section(zh,en,body,cls=''):
    return f'<section{(" class="+chr(34)+cls+chr(34)) if cls else ""}>'+heading(zh,en)+body+'</section>\n'
def detail(zh,en,body):
    return '<details><summary><span class="lang-zh">'+zh+'</span><span class="lang-en">'+en+'</span></summary>'+body+'</details>'
out = original[:original.index('<section class="goal">')]
out = out.replace('约 40 分钟', '约 35 分钟').replace('~40 min', '~35 min')
out += section('本章核心：先守承诺，再提高利用率','Core: honor commitments before improving utilization',bi([
    '<strong>准入分两关：</strong>等待描述有界、租户份额有界；上卡时一次承诺 prompt + 最大输出的页信用，逐轮再核计算预算。',
    '<strong>取消分两步：</strong>先停后续调度，相关 GPU 访问全退休后才释放引用和信用。旧 generation、旧 worker boot 的消息不能碰新池。',
    '<strong>容量分三账：</strong>显存能放多少、目标延迟下能服务多少、用户收到多少，分别计算和测量。'
],[
    '<strong>Two admission gates:</strong> bound waiting descriptions and tenant shares. Commit prompt-plus-output-cap page credits at GPU admission, then check compute budgets each iteration.',
    '<strong>Two cancellation steps:</strong> stop future scheduling, then release references and credits after every relevant GPU access retires. Old generations and worker boots cannot touch a new pool.',
    '<strong>Three capacity ledgers:</strong> memory fit, service at target latency, and client delivery require separate calculations and measurements.'
]),'goal')
out += section('设计范围与可替换的假设','Scope and replaceable assumptions',bi([
    '设计自托管、单地域、单模型的在线文本聊天服务。起点是同卡 prefill + decode；离线摘要另队列、另池。RAG只在前面准备 prompt。先问输入/输出长度分布、TTFT与输出停顿目标、模型版本以及是否允许显式续写。',
    '主路径 <strong>Client → API gateway → Scheduler → GPU worker</strong>，输出逐跳返回。分页管存放，continuous batching管每轮成员；内核优化不能替代租户公平或生命周期。',
    '示例接口 <code>POST /v1/chat/completions</code>、<code>stream=true</code>：浏览器用fetch发POST并解析SSE格式响应。原生EventSource不直接发该POST；事件id/Last-Event-ID也不会替服务器保存token日志或KV。<a href="#ref-9">[9]</a>'
],[
    'Self-host one model for online text chat in one region, initially colocating prefill and decode. Offline summaries have another queue and pool. RAG prepares the prompt upstream. Clarify length distributions, first-token and stall targets, model identity, and explicit continuation.',
    'The path is <strong>Client → API gateway → Scheduler → GPU worker</strong>, with every return hop. Paging manages placement; continuous batching selects each iteration’s members. Kernel optimization does not provide tenant fairness or lifecycle safety.',
    'The illustrative API is <code>POST /v1/chat/completions</code>, <code>stream=true</code>. Browsers use fetch for POST and parse an SSE-format response. Native EventSource does not directly issue this POST; event IDs and Last-Event-ID supply neither a server token log nor KV recovery. <a href="#ref-9">[9]</a>'
])+detail('教学假设 A1–A12：改数时在这里统一重算','Teaching assumptions A1–A12: change numbers in one place',table+bi([
    '均为教学假设，不对应具体显卡、模型或已执行的压测。40 GiB是权重、激活峰值、工作区、页表和图捕获预留之后的KV池；峰值随batch/chunk变化，不能简单用总显存减权重。租户配额、页/活动上限和服务器信任域由服务端决定。'
],[
    'These are teaching assumptions, not a GPU SKU, model specification, or executed benchmark. Forty GiB is the KV pool after weights, peak activations, workspaces, tables, and graph reserves. Batch/chunk shapes change peaks; advertised memory minus weights is insufficient. The server assigns quotas, page/active caps, and trust domains.'
])))
out += section('估算：128条信用不是128条的吞吐','Estimate: 128 reservations do not establish throughput',bi([
    '全注意力KV：<code>2 × 32层 × 8 KV head × 128维 × 2 B = 128 KiB/token</code>。16 token页是2 MiB；<code>ceil((2,048 + 512) ÷ 16) = 160页 = 320 MiB/请求</code>。40 GiB = 40,960 MiB，因此最多128条满额信用；第129条会超出320 MiB。这里使用KV head，且不含权重等运行时开销。',
    '<strong>Little定律必须圈同一个边界。</strong>令λ是稳定准入并退出GPU的尝试率（含取消），W是从GPU准入到引用/信用释放的平均驻留时间，排队不计入W。若λ=10/s且W=6s，平均活动60条，保守信用18.75 GiB；若持续30/s仍保持6s，条件需求是180条/56.25 GiB，超过单池。它说明需要拒绝、扩容或改预算，不能从128÷6反推单卡产能。',
    '算力容量另做负载基准：假设最大接纳率C=12 req/s时仍有≥99%请求同时达到TTFT≤800ms和<strong>该请求最大worker ITL≤50ms</strong>，规划用70%，即8.4 req/s。峰值30需<code>ceil(30÷8.4)=4</code>个副本；同预算N−1需5个，剩余33.6 req/s。12尚未实测；只给“goodput=12”也不能把它直接当总完成率或排队服务率。'
],[
    'Full-attention KV is <code>2 × 32 layers × 8 KV heads × 128 dimensions × 2 B = 128 KiB/token</code>. A sixteen-token block is 2 MiB. <code>ceil((2,048 + 512) ÷ 16) = 160 blocks = 320 MiB/request</code>. Forty GiB is 40,960 MiB and fits 128 full-cap reservations; number 129 exceeds it by 320 MiB. Count KV heads, excluding weights and other runtime overhead.',
    '<strong>Little’s law needs one boundary.</strong> Let λ be stable admitted/departing attempts per second, including cancellation, and W mean residence from GPU admission through reference/credit release, excluding queueing. At λ=10/s and W=6s, mean active count is sixty and conservative credits are 18.75 GiB. Sustained thirty/s with W still six requires 180 requests/56.25 GiB. This conditional demand exceeds one pool and requires rejection, expansion, or a changed budget. It does not infer compute capacity from 128÷6.',
    'Benchmark compute separately. Suppose maximum admission C=12 req/s still gives ≥99% of requests both TTFT≤800ms and <strong>maximum worker ITL within that request≤50ms</strong>. Plan at 70%, or 8.4 req/s. Peak thirty needs <code>ceil(30÷8.4)=4</code> replicas; five preserve the same N−1 budget, leaving 33.6 req/s. Twelve is unmeasured. A goodput of twelve alone is not total completion rate or a queue service rate.'
])+detail('完整需求、权重与长上下文复算','Demand, weights, and longer-context calculations',bi([
    '权重 <code>8×10⁹×2=16 GB≈14.9 GiB</code>。输入需求平均20,480、峰值61,440 token/s；输出平均2,560、峰值7,680 token/s，假定均接纳并按均值256输出。租户输入4,096 token/s约容许2条标准prompt/s，但长输出仍需输出预留与活动上限。',
    '若输入改8,192、输出上限仍512，需8,704×128 KiB=1,088 MiB，40,960÷1,088≈37.65，只容37条满额信用；prefill时间和新上下文工作区仍需重测。weight-only量化不改变KV字节/token，却可能腾大可用池。'
],[
    'Weights are <code>8×10⁹×2=16 GB≈14.9 GiB</code>. Input demand averages 20,480 and peaks at 61,440 tokens/s; output averages 2,560 and peaks at 7,680 tokens/s if all requests complete with mean output 256. A 4,096 input-token/s quota permits about two standard prompts/s, while long outputs still need output reservations and active caps.',
    'Changing input to 8,192 with output cap 512 needs 8,704×128 KiB=1,088 MiB; 40,960÷1,088≈37.65 fits thirty-seven reservations. Remeasure prefill and workspace peaks. Weight-only quantization keeps KV bytes/token unchanged but may enlarge the usable pool.'
])))
out += section('在线闭环：排队不占KV，上卡才作承诺','Online loop: queue without KV, commit at admission',decks[0]+bi([
    '网关固定model/template/tokenizer并按实际token校验长度。主体/key/规范正文哈希在共享Attempt Store绑定一次尝试，重复请求不重复扣输入/输出配额；换网关仍读同一记录。持久尝试与配额若跨库，必须用可恢复预留/撤销协议。下面从已持久受理且配额就绪的请求开始，不拿本地队列当持久去重。',
    'Scheduler对一个worker boot独占调度；等待只保存有界描述。租户轮转避免被一个租户的队头堵住，分别限制队列数、活动序列与页信用。<strong>期限和数量是两条限制：</strong>若总完成率假设12/s，100条相当于约8.33秒工作量，远超600ms；限制成7条也不是p99证明。'
],[
    'The gateway fixes model/template/tokenizer and validates actual token lengths. A shared Attempt Store binds principal/key/canonical-body hash to one attempt; input/output quota is reserved once across retries and gateway changes. Separate stores require recoverable reserve/revoke steps. The next listing starts with a durable claim and ready quota; a local queue is not durable deduplication.',
    'One scheduler exclusively controls a worker boot. Waiting stores bounded descriptions. Rotate tenants and separately bound queued count, active sequences, and page credits. <strong>Deadlines and counts are separate limits:</strong> at an assumed total completion rate of twelve/s, one hundred requests represent about 8.33 seconds of work, exceeding 600ms. Capping at seven still does not prove p99.'
])+snippet('admission.pseudo','Pseudocode · bounded tenant admission')+bi([
    '这是单Scheduler事件循环伪代码，输入是已验证请求；输出QUEUED、过期/超额或ready。25/32/5,120是教学政策。等待用本地单调时间，重启不沿用旧时钟值；持久ASSIGNED恢复后查询原worker或隔离并明确中断，不能悄悄重放内存队列。当前代码不实现跨库配额预留。',
    '健康容量缺失用503；租户超额/等待不可接受用429；上下文错误用400，均为本章接口约定。流头发出后改用终止事件，socket断了由客户端检测。权重加载、KV池和内核预热完成才ready；新worker只接新请求。离线另池；同池优先级不能中断一个已执行的长chunk。'
],[
    'This single-scheduler event-loop pseudocode maps validated requests to QUEUED, expiry/denial, or ready. The 25/32/5,120 caps are teaching policy. Waiting uses local monotonic time; restart does not reuse old clock values. Recover ASSIGNED by querying its worker or fencing and explicitly interrupting, without silently replaying a lost queue. Cross-store quota reservations are not implemented.',
    'Our API uses 503 for unavailable healthy capacity, 429 for tenant/excessive-wait denial, and 400 for context errors. After stream headers, send a terminal event; broken sockets are detected by Client. Become ready after weight loading, pool setup, and warmup. New workers take new requests. Offline uses another pool; a priority label cannot interrupt a running long chunk.'
]))
out += section('KV分页：信用、物理页和共享引用','Paged KV: credits, physical pages, and shared references',decks[1]+bi([
    '图的L0/L1/L2映射到P7/P2/P9，表示物理地址可分散；attention按block table读KV。演示页4个状态：7→8填P2，8→9才加P9；它不同于容量假设的16 token页。PagedAttention减少连续分配造成的碎片，不自动解决逻辑超订。<a href="#ref-2">[2]</a>',
    '保守策略为每个请求预留prompt+最大输出的完整信用，物理页随实际状态增长。即使物理页空着，也可能已承诺给活动请求未来输出；只有总承诺有余量才再准入。下面Java17可运行模型把信用补判扣与物理分配串行化在<strong>一个worker的CPU锁</strong>内；分布式尝试身份仍由共享记录负责。'
],[
    'L0/L1/L2 map to P7/P2/P9: physical blocks may be scattered while attention follows the block table. Toy pages hold four states; 7→8 fills P2 and 8→9 adds P9. Capacity assumptions use sixteen-token pages. PagedAttention reduces contiguous-allocation fragmentation without solving logical overcommit. <a href="#ref-2">[2]</a>',
    'Our conservative policy reserves prompt-plus-output-cap credits while allocating physical blocks on demand. Empty physical blocks may already be promised to active requests’ future output. Admission needs uncommitted credits. This runnable Java17 model serializes credit checks/debits and allocation under <strong>one worker’s CPU lock</strong>; shared records separately govern distributed attempt identity.'
])+snippet('KvLedger.java#admission','Java17 · runnable model excerpt','runnable')+bi([
    '输入owner=(attempt,generation,worker boot)、prompt与最大输出；输出信用是否受理、或一个带incarnation的页Handle。源码的generation保留页集合，页分别计活动引用refs和在途访问pins。只共享已完成的不可变完整块；未满尾页共享/COW不在此模型中。真实引擎若超订、COW或有隐藏workspace，必须另外补入同一预算。',
    '前缀命中比较token与计算身份，固定模型/LoRA、位置语义和信任域。vLLM v0.15.1按父哈希、块token与额外身份缓存完整块；cache salt隔离复用，本设计由服务器按信任域赋值。APC减少重复prefill，不减少待生成后缀步数；miss正常重算。模型升级换命名空间，输出额度不随命中减少。<a href="#ref-5">[5]</a> <a href="#ref-6">[6]</a>',
    '完整前缀可在refs=0时留作可驱逐缓存；有refs或pins就不能复用地址。本策略不把共享收益卖成更多信用，简化最坏输出承诺；活页超订则需明确抢占/重算以及被抢占请求的延迟代价。'
],[
    'Inputs are owner=(attempt,generation,worker boot), prompt, and output cap. Outputs are admission or an incarnation-stamped block Handle. The source tracks a generation’s page set, with separate active references and in-flight pins per page. It shares only complete immutable blocks; partial-tail sharing/COW is outside this model. Real overcommit, COW, and hidden workspaces need the same explicit budget.',
    'Reuse compares tokens and computation identity, fixing model/LoRA, positions, and trust domain. vLLM v0.15.1 caches complete blocks using parent hashes, block tokens, and extra identity. Cache salts isolate reuse; this design assigns them by server trust domain. APC saves repeated prefill, not suffix steps; misses compute normally. Model upgrades change namespaces and hits never bypass output quota. <a href="#ref-5">[5]</a> <a href="#ref-6">[6]</a>',
    'A full prefix with refs=0 may remain an evictable cache entry. References or pins prevent address reuse. We do not sell sharing savings as more credits, simplifying worst-output promises. Live-page overcommit instead needs explicit preemption/recomputation and its waiting cost.'
]))
out += section('逐轮batch：换成员，也要限制本轮工作','Iteration batching: change members and bound work',decks[2]+bi([
    't轮A/B/C，B结束并退休引用；t+1可考虑D prefill，t+2 D decode。Orca的iteration-level scheduling消除整请求batch屏障；D仍会因页、计算或公平等待多轮。CPU选成员和chunk，attention内核执行；FlashAttention优化IO，不替调度器实现公平。<a href="#ref-1">[1]</a> <a href="#ref-4">[4]</a>',
    '每租户保留deficit和请求游标，成本由context、phase与token数计；余额跨轮累积、上限至少容纳最大合法chunk。轮转起点防同一租户总先占剩余预算。准入还限租户活动数/页份额；单轮选出每条请求最多一个chunk或一个decode步。高权重是相对份额，不是硬实时保证。'
],[
    'Iteration t has A/B/C. B finishes and retires references; t+1 may admit D’s prefill and t+2 decodes D. Orca’s iteration scheduling removes the whole-request batch barrier, but pages, compute, and fairness may still delay D many rounds. CPU selects members/chunks and kernels execute. FlashAttention optimizes IO rather than scheduler fairness. <a href="#ref-1">[1]</a> <a href="#ref-4">[4]</a>',
    'Keep tenant deficits and request cursors. Charge by context, phase, and token count; carry balances across rounds with a cap large enough for the largest legal chunk. Rotate the first tenant so the same tenant does not always consume residual budget first. Admission also caps tenant active/page shares. Each request contributes at most one chunk or decode step per iteration. Weights are relative shares, not real-time guarantees.'
])+snippet('iteration.pseudo','Pseudocode · iteration planning')+bi([
    '输入ready队列和经过测量的profile/envelope，输出batch和GPU ticket。<code>budget.fits</code>同时检查本轮token/序列数、上下文对应工作区与预测执行时长；<code>ensure_blocks</code>只在既有信用中扩页。profile是适配依赖，不能用它宣称已经测过GPU。decode优先或prefill保底份额都要测TTFT/停顿；vLLM v0.15.1也把chunk token预算列为ITL/TTFT取舍。<a href="#ref-7">[7]</a>'
],[
    'Inputs are ready queues and a measured profile/envelope; outputs are a batch and GPU ticket. <code>budget.fits</code> checks tokens/sequences, context-dependent workspace, and predicted duration. <code>ensure_blocks</code> grows pages within existing credits. The profile is an adapter dependency, not evidence of a GPU experiment. Measure TTFT and stalls when choosing decode priority or prefill shares; vLLM v0.15.1 also documents the token-budget tradeoff. <a href="#ref-7">[7]</a>'
])+heading('延迟指标必须写清起止点','Latency metrics need explicit endpoints',3)+bi([
    '<strong>客户端TTFT</strong>从发送请求到收到首个内容，含排队、网络和flush；A6是单次条件预算50+等待+150≤800，分量p99不能相加。<strong>worker ITL</strong>统计相邻token-ready时间差；客户端SSE块可合并多个token，块到达间隔另报，不冒充GPU步时长。',
    '<strong>TPOT</strong>用同一worker时间轴的<code>(末token−首token)/(N−1)</code>，N=1无此平均值；它会掩盖单步停顿。256个输出有255个后续间隔，固定20ms例子是5.1s；另加假设200ms首段约5.3s。ITL p99=50ms不能当每步硬上限，也不能推整请求总时长。<strong>goodput</strong>计每秒联合达标的完成请求，分母/联合达标比例另报；TTFT和ITL各自p99不等于99%请求联合达标。'
],[
    '<strong>Client TTFT</strong> spans request send to first content, including queueing, network, and flush. A6’s 50+wait+150≤800 is a conditional per-request budget, not summed p99s. <strong>Worker ITL</strong> is the gap between adjacent token-ready times. SSE chunks may combine tokens, so separately report client chunk-arrival gaps rather than calling them GPU step times.',
    '<strong>TPOT</strong> is <code>(last token−first token)/(N−1)</code> on the same worker clock; it is undefined for N=1 and may hide a stall. 256 outputs have 255 later gaps: at fixed twenty ms, 5.1s, or approximately 5.3s with an assumed 200ms first-token path. A fifty-ms ITL p99 is no hard step or total-duration bound. <strong>Goodput</strong> counts jointly compliant completions/s; also report its denominator and joint attainment. Separate TTFT/ITL p99s do not establish 99% joint request attainment.'
]))
out += section('取消与完成：先退休访问，再释放页','Cancel and completion: retire accesses before releasing pages',decks[3]+bi([
    '对应图的RUNNING → CANCEL_PENDING → RETIRED → RELEASED。Java把等待退休记作RETIRING；<code>inFlight==0</code>是进入RETIRED并立即释放的条件，不多存一个瞬态字段。发GPU前，ticket固定owner/页快照并pin；取消只标停止，EOS与取消用同一锁竞争首个停止原因。'
],[
    'The diagram is RUNNING → CANCEL_PENDING → RETIRED → RELEASED. Java calls the waiting state RETIRING; <code>inFlight==0</code> allows RETIRED and immediate release without storing that transient phase. Before launch, a ticket snapshots owners/pages and pins them. Cancel marks stop; EOS and cancel contend for the first stop reason under the same lock.'
])+snippet('KvLedger.java#issue-stop','Java17 · runnable model excerpt','runnable')+bi([
    '真实适配器必须把所有读写KV、block table和相关copy的stream依赖纳入同一完成证据。CUDA event只证明其捕获工作/依赖完成；不能随手查一个不相关stream就还页。下面模型由测试手工调用<code>complete</code>模拟“证据已成立”，没有执行CUDA。<a href="#ref-10">[10]</a>'
],[
    'A real adapter must cover every stream dependency accessing KV, block tables, or related copies. A CUDA event proves completion only for the work/dependencies it captures; querying an unrelated stream cannot authorize release. Tests manually call <code>complete</code> to simulate established completion evidence. They do not execute CUDA. <a href="#ref-10">[10]</a>'
])+snippet('KvLedger.java#retire','Java17 · runnable model excerpt','runnable')+bi([
    '<strong>危险反例：</strong>A持2页信用、只实占1页，kernel仍读P7；cancel到达后若立刻归还信用，B就能获准并覆盖P7，A仍可能读到B的KV。示例直到ticket完成才释放，重复完成先从launch表删除一次，旧Handle的incarnation也不能指向B的新分配。共享前缀即使A退出，B的refs/pins仍保护它。正常EOS走相同释放门。',
    '慢读者按64 KiB待发送上限/2s无进展停止后续调度或取消，别条请求继续。128条流都顶格是8 MiB缓冲，只是该承载集合的教学上界。页不足是可控准入拒绝；激活峰值OOM能否局部回滚取决于引擎/context健康。illegal address等致命错误按整worker死亡，隔离旧池、新boot重建，不能把旧池“释放一个block”后继续用。<a href="#ref-8">[8]</a>'
],[
    '<strong>Dangerous trace:</strong> A reserves two blocks but occupies one while its kernel still reads P7. Returning credits on cancel could admit B and overwrite P7 while A reads it. This example waits for the ticket, removes each launch once, and stamps reused handles with a new incarnation. A shared prefix remains protected by B’s refs/pins after A leaves. Normal EOS uses the same release gate.',
    'Stop future scheduling or cancel a slow reader at 64 KiB pending sends or two seconds without progress, while others continue. At 128 capped streams this is 8 MiB for that serving set, not a global constant. Missing credits are controlled denial. Local recovery from activation OOM requires a healthy context and engine support. Fatal errors such as illegal addresses mean worker loss: quarantine the old pool and rebuild under a new boot, rather than freeing one block and continuing. <a href="#ref-8">[8]</a>'
]))
out += section('流中断：尝试幂等不等于token送达','Interrupted streams: attempt dedupe is not token delivery',decks[4]+bi([
    'worker死亡可能丢KV、采样状态和未保存输出；匹配owner的尝试记INTERRUPTED，连接尚通就逐跳返回终止事件。只有网关失联时worker未必死：先查询/取消旧owner，或隔离其输出与后续执行；不能仅凭没heartbeat就开第二份。同key不重新生成，即使记录“尚无write”。',
    '下面伪代码的唯一行与条件更新在一个权威数据库；适用于D1受理/D5恢复。真实实现需NOT NULL字段、主体/key唯一、可靠提交结果读取与鉴权；正文哈希含模型、模板、采样参数与输出上限。它没有持久token日志，也没有跨卡续写。<a href="#ref-11">[11]</a>'
],[
    'Worker loss may erase KV, sampling state, and unsaved output. Mark the matching owner INTERRUPTED and return a terminal event if the stream survives. A lost gateway does not prove a dead worker: query/cancel the old owner or fence its output and future execution. Missing heartbeats alone cannot authorize a duplicate. Same-key retries do not regenerate even if no writes were recorded.',
    'This pseudocode uses one authoritative row and conditional updates for D1 admission/D5 recovery. A real implementation requires NOT NULL fields, a principal/key unique constraint, reliable commit-result reads, and authorization. Hash model/template/sampling parameters/output cap with the body. It supplies neither a durable token log nor cross-worker continuation. <a href="#ref-11">[11]</a>'
])+snippet('attempt.pseudo','Pseudocode · durable attempt transitions')+bi([
    '正常：claim → 唯一bind → 同owner投递 → 匹配终态。同key异正文冲突；两Scheduler争bind只一个更新成功。bind成功却投递前崩溃，可查询旧owner，隔离后失败关闭为INTERRUPTED；不承诺每个受理都执行。终态回包未知就查原key，重复/旧终态不覆盖。24h保留覆盖客户端15min自动重试；活跃行不被TTL删除，终态到期后不提供无限去重保证。',
    '<strong>seq=37 write成功不证明客户端展示37。</strong>要重放需attempt/seq事件先持久再发送、客户端游标/去重与保留期，客户端ACK也不恢复死卡KV。基线同key只取状态/完成元数据，INTERRUPTED示例返回409；明确重新生成/续写用新key、新信用、新prefill，重新校验实际token长度。文本塞回assistant消息可能改模板，不保证等于旧token前缀。'
],[
    'Normal: claim → one binding → same-owner delivery → matching terminal. Different body conflicts; only one of two schedulers binds successfully. A crash after binding but before delivery may query the owner, then fence and fail closed as INTERRUPTED; admission does not promise execution. Unknown terminal commits are queried by the original key; duplicate/old terminals do not overwrite. Twenty-four-hour retention covers fifteen-minute client retries. Active rows are not TTL-deleted; expired terminal rows do not promise unbounded deduplication.',
    '<strong>A successful seq=37 write does not prove client display.</strong> Replay needs attempt/seq events persisted before sending, client cursors/deduplication, and retention. Client ACK does not restore dead KV. Baseline same-key retries return status/completion metadata; INTERRUPTED illustratively returns 409. Explicit regeneration/continuation uses a new key, credits, and prefill with renewed token-length checks. Text reinserted as an assistant message may alter templates rather than match the old token prefix.'
]))
out += section('阶段分离：先测干扰，再算搬运','Phase separation: measure interference and transfer cost',decks[5]+bi([
    '先以chunk、逐轮预算与并发上限调优同卡。长prefill常偏计算、decode常偏带宽，但瓶颈随模型/上下文/batch/硬件变化；两种延迟仍不能同时满足且资源规模足够，才考虑两池。DistServe按延迟目标与达标比例优化goodput，不把论文倍数当本站容量。图A/B是互斥方案。<a href="#ref-3">[3]</a>',
    '分离先保留Decode目标页信用，再prefill/传输。目标收到KV字节与首个采样token或初始logits/采样元数据，验证模型/LoRA、request、epoch、长度、manifest后接受。源端等匹配接受或已隔离撤销后退休引用；发起copy或收到metadata都不代表可以释放。Decode直接回Scheduler，输出不绕Prefill。',
    'prompt KV=<code>2,048×128 KiB=256 MiB=268,435,456 B</code>。假设有效10 GB/s，纯搬运26.84ms；30/s是7.5 GiB/s≈8.05 GB/s≈64.42 Gb/s，占80.53%。这不含排队、复制、握手、重传和两端暂存。目标不足时多加Prefill只会堆积KV。'
],[
    'First tune colocation with chunks, iteration budgets, and active caps. Long prefill is often compute-heavy and decode bandwidth-heavy, but bottlenecks vary by model/context/batch/hardware. Split only when both latency goals still conflict at sufficient scale. DistServe optimizes goodput under latency and attainment goals; paper speedups are not our capacity. A/B in the diagram are mutually exclusive. <a href="#ref-3">[3]</a>',
    'Reserve destination Decode credits before prefill/transfer. The target receives KV bytes plus the first sampled token or initial logits/sampling metadata; it validates model/LoRA, request, epoch, length, and manifest before accepting. Retire source references only after matching acceptance or a fenced abort. Starting a copy or receiving metadata is insufficient. Decode returns directly to Scheduler rather than through Prefill.',
    'Prompt KV is <code>2,048×128 KiB=256 MiB=268,435,456 B</code>. At assumed effective ten GB/s, ideal transfer is 26.84ms. Thirty/s is 7.5 GiB/s≈8.05 GB/s≈64.42 Gb/s, or 80.53%, excluding queues, copies, handshakes, retries, and duplicate staging. More Prefill without target capacity merely accumulates KV.'
])+detail('接受丢ACK、池死亡与扩缩容','Lost acceptance ACK, pool loss, and scaling',bi([
    '发送方超时可能只是接受ACK丢失；用transfer id/epoch查已有结果，重复接收不再占一份。撤销先隔离旧owner，再清两端引用。源prompt KV不包含后续decode/采样状态，目标死亡后仍按上一节明确中断或显式新prefill，不承诺无感恢复。',
    '扩容一起看Prefill等待、Decode活页/间隔和互连；缩容摘新准入，drain或明确取消旧请求。多卡tensor parallel另算各rank权重、KV、通信。这里没有真实GPU、网络搬运或故障实验，Java内存模型不验证生产吞吐、CUDA正确性或分布式恢复。'
],[
    'Sender timeout may follow accepted transfer with a lost ACK. Query by transfer ID/epoch and make repeated acceptance return the existing result. Abort fences the owner before cleaning both references. Source prompt KV omits subsequent decode/sampling state; target loss still means explicit interruption or new prefill, not seamless recovery.',
    'Scale against Prefill wait, Decode pages/gaps, and interconnect together. Scale-in stops admission and drains or explicitly cancels old requests. Tensor-parallel ranks need separate weight/KV/communication accounting. No real GPU, transfer, or device-failure experiment was performed. The Java memory model proves neither production throughput, CUDA correctness, nor distributed recovery.'
])))

# Keep the old concise correction table, update the metric wording and remove duplicate prose.
pitfalls = re.findall(r'<table>[\s\S]*?</table>', original)[1]
pitfalls = pitfalls.replace('goodput 和满并发轮次需基准测试','目标联合达标比例下的接纳率和轮次需基准测试').replace('benchmark goodput and full-concurrency iteration timing','benchmark admissible rate at the joint attainment target and iteration timing')
out += section('面试复盘：用一条请求讲清边界','Review: follow one request through its boundaries',pitfalls+bi([
    '复述顺序：持久尝试身份 → 有界租户队列 → 最大输出信用 → 本轮预算 → token逐跳返回 → 停止/退休/释放。先讲128条是显存承诺，再讲C=12是未测的容量假设；流中断不把同key偷偷变成新生成。',
    '监控分层：客户端TTFT/块停顿；worker ITL/请求TPOT与联合goodput；排队年龄/到期/租户拒绝；信用、refs/pins、缓存/可复用页；取消退休时长、旧epoch丢弃与worker致命错误。利用率高而联合达标比例低，可能只是算出更多迟到token。<a href="../examples/ch29/README.md">示例与验证边界</a>。'
],[
    'Retell: durable attempt identity → bounded tenant queues → output-cap credits → iteration budget → return hops → stop/retire/release. Explain that 128 is a memory commitment and C=12 is an unmeasured capacity assumption. Interrupted same-key requests never silently become a new generation.',
    'Observe client TTFT/chunk stalls; worker ITL/request TPOT and joint goodput; queue age/expiry/tenant denials; credits, refs/pins, cached/reusable pages; cancellation retirement, rejected old epochs, and fatal errors. High utilization with poor joint attainment may merely produce late tokens. <a href="../examples/ch29/README.md">Examples and validation limits</a>.'
]))
references = re.search(r'<ol class="references">[\s\S]*?</ol>', original).group()
references = references.replace('13.4 · checked 2026-10-07','13.4 · checked 2026-10-24').replace('Living Standard · checked 2026-10-07','Living Standard · checked 2026-10-24')
references = references.replace('</ol>', '<li id="ref-10">[10] NVIDIA, <a href="https://docs.nvidia.com/cuda/cuda-runtime-api/group__CUDART__EVENT.html">CUDA Runtime API 13.4 · Event Management</a> · checked 2026-10-24. <span class="lang-zh">event捕获的工作与依赖、查询和同步完成；Java模型不执行CUDA。</span><span class="lang-en">Captured work/dependencies, queries and synchronization; the Java model does not execute CUDA.</span></li><li id="ref-11">[11] PostgreSQL, <a href="https://www.postgresql.org/docs/18/sql-insert.html">PostgreSQL 18 · INSERT / ON CONFLICT</a> and <a href="https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS">row locks</a> · checked 2026-10-24. <span class="lang-zh">attempt唯一行与条件更新的数据库适配前提；本章没有运行PostgreSQL。</span><span class="lang-en">Database assumptions for unique attempt rows and conditional updates; PostgreSQL was not run.</span></li></ol>')
out += section('引用与延伸阅读','References and further reading',references+'<p class="cite"><a class="chip" href="ch03.html">Ch03</a> <a class="chip" href="ch04.html">Ch04</a> <a class="chip" href="ch30.html">Ch30</a> <a class="chip" href="ch32.html">Ch32</a> <a class="chip" href="ch35.html">Ch35</a> <a class="chip" href="ch40.html">Ch40</a></p>')
cards = re.search(r'<div class="cards-grid">[\s\S]*?</div>', original).group()
cards = cards.replace('整请求平均 TPOT 可掩盖单步停顿；ITL 统计相邻输出间隔。','TPOT是N−1间隔均值；worker ITL统计token-ready间隔，客户端块间隔另报。')
cards = cards.replace('Request-average TPOT can hide a stall; ITL measures individual adjacent-output gaps.','TPOT averages N−1 gaps; worker ITL measures token-ready gaps. Report client chunk gaps separately.')
cards = cards.replace('停止后续调度，等待 GPU fence，再单次退休请求引用。','停后续调度；全部相关GPU访问完成才单次释放引用/信用，共享页仍看refs/pins。')
cards = cards.replace('Stop later scheduling, wait for the GPU fence, then retire request references once.','Stop scheduling; retire all GPU accesses, then release refs/credits once. Shared pages still need zero refs/pins.')
cards = cards.replace('</div>', '<button type="button" class="flip"><span class="q"><span class="lang-zh">两个p99能证明99%请求联合达标吗？</span><span class="lang-en">Do two p99s prove 99% joint request attainment?</span></span><span class="a"><span class="lang-zh">不能；逐请求核TTFT和最大worker ITL，再报达标完成率与分母。</span><span class="lang-en">No. Check each request’s TTFT and maximum worker ITL, then report compliant completions and the denominator.</span></span></button></div>')
out += section('闪卡','Flashcards','<p class="cite"><span class="lang-zh">点按或用Enter/Space翻面，回答时说出账本与失败边界。</span><span class="lang-en">Click or press Enter/Space; name the ledger and failure boundary.</span></p>'+cards)
out += original[original.index('  <p><button type="button" class="read-toggle">'):]
target.write_text(out)
print('Rewrote prose; preserved six decks and all 31 frame IDs')
