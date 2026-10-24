from pathlib import Path
import html
import re

ROOT = Path(__file__).resolve().parents[2]
target = ROOT / 'chapters/ch32.html'
original = (ROOT / 'docs/reviews/ch31-ch32-ch33-baseline/ch32.html').read_text()
sections = re.findall(r'<section\b.*?</section>', original, re.S)
decks = [re.search(r'<figure class="deck">.*?</figure>', s, re.S)[0] for s in sections if '<figure class="deck">' in s]


def pair(zh, en):
    return f'<div class="bilingual"><div class="lang-zh">{zh}</div><div class="lang-en">{en}</div></div>'


def h2(zh, en):
    return f'<h2><span class="lang-zh">{zh}</span><span class="lang-en">{en}</span></h2>'


def h3(zh, en):
    return f'<h3><span class="lang-zh">{zh}</span><span class="lang-en">{en}</span></h3>'


def code(ref, label, kind):
    name, _, region = ref.partition('#')
    source = (ROOT / 'examples/ch32' / name).read_text()
    if region:
        source = source.split(f'# BEGIN {region}\n')[1].split(f'# END {region}')[0]
    return f'<pre data-language="{label}" data-kind="{kind}" data-source="{ref}"><code>{html.escape(source.rstrip())}</code></pre>'


def section(zh, en, body, cls=''):
    return f'<section{(" class="+chr(34)+cls+chr(34)) if cls else ""}>{h2(zh,en)}{body}</section>'


new = []
new.append(section('本章核心：先获准，再生成；提交后不换流', 'Core: authorize, reserve, then generate; never splice a committed stream', pair(
    '<ul><li><strong>路由是准入：</strong>权限、地域、能力与上下文先过滤，成本排序靠后。</li><li><strong>预算按 attempt：</strong>持久预占先于网络；UNKNOWN 保留预算，第二次调用另预占。</li><li><strong>交付有屏障：</strong>公共头、角色、心跳之前记录 COMMITTED，绑定选中的 attempt/owner；后续失败终止原流。</li></ul>',
    '<ul><li><strong>Routing is admission:</strong> filter access, residency, capabilities and context before ranking cost.</li><li><strong>Budget per attempt:</strong> durable holds precede I/O; UNKNOWN retains its hold and a second attempt needs another.</li><li><strong>Delivery has a barrier:</strong> bind COMMITTED to the selected attempt/owner before public headers, roles or heartbeats. Later failure ends that stream.</li></ul>'), 'goal'))

new.append(section('30 秒开场与职责', 'The opening and service boundary', pair(
    '<p class="say">我设计给聊天后端与内部 Agent 使用的统一 LLM 入口。Edge 做身份和入口速率；LLM GW 固定模型契约、校验缓存、持久预占预算；Adapter 转换供应商请求与事件。每个物理调用单独记 usage。只允许一次经授权、重新准入的备用调用；公共响应提交后不再更换模型。</p><p>先确认模型/地域/工具与结构化输出要求、是否允许额外调用成本、哪些任务可复用旧答案。本题接口假设为 <code>POST /v1/chat/completions</code> + SSE；不是所有供应商都只有这一接口。网关不执行工具动作；<a class="chip" href="ch29.html">Ch29</a> 管推理资源，<a class="chip" href="ch30.html">Ch30</a>/<a class="chip" href="ch31.html">Ch31</a> 管检索，工具授权见 <a class="chip" href="ch33.html">Ch33</a>。</p>',
    '<p class="say">This gateway serves chat backends and internal agents. Edge authenticates and limits entry rate; LLM GW pins a model contract, validates cached answers and reserves durable budget; Adapter translates provider requests and events. Record usage separately for every physical attempt. Permit one authorized, readmitted fallback; no model replacement after public response commitment.</p><p>Clarify model, residency, tool/schema requirements, extra-attempt cost permission and reusable tasks. Our teaching interface is POST /v1/chat/completions + SSE, not every provider’s only interface. The gateway does not execute tool actions. <a class="chip" href="ch29.html">Ch29</a> handles inference, <a class="chip" href="ch30.html">Ch30</a>/<a class="chip" href="ch31.html">Ch31</a> retrieval and <a class="chip" href="ch33.html">Ch33</a> tool authorization.</p>')))

assumptions = re.search(r'<table>.*?</table>', sections[2], re.S)[0]
assumptions = assumptions.replace('最坏物理调用40/s；未知执行保留账','同窗稳态估40次调用/s；不是瞬时速率上界').replace('Worst dispatch 40/s; preserve unknown attempts','Same-window steady estimate: 40 calls/s, not a peak-rate bound')
assumptions = assumptions.replace('TTFT均值0.5s、输出均速50 token/s；用于容量近似','被接纳完成率20/s；TTFT均值0.5s、可见输出均速50 token/s').replace('Mean TTFT 0.5s, mean output rate 50 tokens/s; capacity approximation','20 admitted completions/s; mean TTFT 0.5s and visible output rate 50 tokens/s')
new.append(section('先分清三种容量', 'Separate three capacity measures', pair(
    '<p><strong>教学全 miss、无重试：</strong>20×60=1,200 RPM，实际均值 (2,000+400)×1,200=<strong>2.88M TPM</strong>；按 1,000 输出上限预留 <strong>3.6M token/分钟</strong>。token 量、未决预算和活跃连接不能共用一个计数器。</p>',
    '<p><strong>Teaching all-miss, no-retry load:</strong> 20×60=1,200 RPM, mean actual usage (2,000+400)×1,200=<strong>2.88M TPM</strong>, versus <strong>3.6M reserved tokens/minute</strong> with a 1,000-output cap. Token volume, outstanding budget and live connections need separate counters.</p>')+
    '<details><summary><span class="lang-zh">展开 A1–A12 假设与推导前提</span><span class="lang-en">Expand A1–A12 assumptions and derivation conditions</span></summary>'+assumptions+pair(
    '<p>所有数字都是教学假设，未做 API 压测。输入按最终 messages、模板、工具定义和目标 tokenizer 上界计数，输出上限包括该后端所有计量类别。A8 专用于可见输出速率与计量口径一致的稳态路由；不把隐藏推理 token 除以可见输出速率。硬预算做不到安全上界就声明软预算，不能靠事后补记恢复过去的硬保证。</p>',
    '<p>All numbers are teaching assumptions, not API benchmarks. Bound final messages, templates and tools with the target tokenizer; cap every metered output category. A8 applies only to steady routes whose visible-output rate matches the count. Do not divide hidden reasoning by a visible-output rate. Without a safe usage bound, declare a soft budget; later correction cannot restore a past hard guarantee.</p>')+'</details>'))

new.append(section('全局路径：Ledger 是权威，答案缓存走旁路', 'Global path: authoritative Ledger, side answer cache', pair(
    '<p><strong>用末帧作总图：</strong>Client → Edge → LLM GW → Adapter → Backend；回复逐跳返回。Answer cache 只供查询，Ledger 保存请求、attempt 和预算。先验证身份与同 rid 状态，命中也重新授权；miss 获得预算及 deployment 速率/并发许可后才 dispatch。</p>',
    '<p><strong>Use the final frame as the overview:</strong> Client → Edge → LLM GW → Adapter → Backend; replies return hop by hop. Answer cache supplies candidates; Ledger owns requests, attempts and budget. Check identity and existing rid state first; hits reauthorize, and misses require budget plus deployment rate/concurrency permits before dispatch.</p>')+decks[0]+pair(
    '<p>tenant 来自可信身份，不来自客户端自报 header；别名映射到受控计划，不接受任意 base URL。多份无状态网关共享同一预算权威，Ledger 故障时拒绝受硬预算约束的新 miss。入口 RPM、供应商速率、租户累计 quota 分开：缓存 hit 仍耗入口额度；返还本地 hold 不代表供应商窗口返还。速率服务与 Ledger 跨库时允许保守浪费许可，不承诺跨库原子扣款。</p>',
    '<p>Derive tenant from verified identity and resolve aliases through controlled plans, never arbitrary base URLs. Gateway replicas share one budget authority; reject hard-budget misses when Ledger is unavailable. Entry RPM, provider rate and cumulative quota differ: hits still consume entry admission, and releasing a hold does not refund a provider window. Separate rate/Ledger stores may conservatively waste permits; do not promise an atomic cross-store debit.</p>')))

new.append(section('路由：硬条件先过滤，备用调用重新准入', 'Routing: filter hard constraints and readmit fallback', pair(
    '<p><strong>便宜不能补偿不合格。</strong>固定 plan p12 后，先过滤权限、地域、tools/schema、质量与上下文，再排健康/延迟/成本。8,000 输入+1,000 输出需要 9,000 窗口，不能放到 4,000 的小模型；摘要压缩与质量降级都要显式授权。</p>',
    '<p><strong>Low cost cannot make an ineligible backend valid.</strong> Pin plan p12; filter access, residency, tools/schema, quality and context before health/latency/cost. An 8,000-input plus 1,000-output budget needs 9,000 context, not 4,000. Summarization and quality downgrades require explicit permission.</p>')+decks[1]+code('route.pseudo','Pseudocode · routing','pseudocode')+pair(
    '<p>这是策略伪代码：候选能力来自可信配置；<code>deliver_cache_only_if_unique_record_created</code> 的语义是同一 Ledger 中以 (tenant,rid) 唯一、正文摘要一致的服务记录，竞争者只取已有状态。后面的 SQLite 展示 miss 如何真正建唯一请求与 attempt。缓存返回也必须先取得唯一交付资格并遵守提交屏障；缓存不能重放另一用户的结果。</p><p>坏参数、无权限、安全拒绝不进入备用分支。发出请求后超时可能已经生成收费：不允许额外费用就返回 UNKNOWN；允许的只读任务才能保留 a1 未决 hold，再为 a2 预占。所有 SDK/代理隐藏重试关闭或并入合计 ≤2 次。每次 dispatch 都重过所属共享限流组；换 key 不一定换配额。</p><p>≤2 只约束同一请求集合：1,200 条最多 2,400 次调用、预留工作量最多 7.2M token。只有 attempt 也落在同一分钟/稳态条件下，才写成约 40/s、7.2M/min；跨窗积压不能推出瞬时上界。首响应预算 0.2+0.8+0.2+0.7=1.9s，只余0.1s，备用不重置总 deadline。429 的有效 Retry-After 容不进剩余时间就停止；quota_exhausted 和提交前无容量 503 使用稳定分类。<a href="#ref-2">[2]</a><a href="#ref-7">[7]</a></p>',
    '<p>This is policy pseudocode using trusted capability configuration. The cache-record operation means one service record in the same Ledger under unique (tenant,rid) and a matching body digest; competitors read existing state. SQLite below shows actual miss-side request/attempt creation. Cache delivery also needs unique ownership and the commitment barrier; it cannot replay another user’s result.</p><p>Bad parameters, access failures and safety refusals do not authorize fallback. A post-dispatch timeout may have generated billable output: strict one-attempt policy returns UNKNOWN; cost-tolerant read-only work can retain a1’s hold and reserve a2 separately. Disable hidden SDK/proxy retries or count them in the total of at most two. Readmit every dispatch against its shared limit group; another key may share the same quota.</p><p>The cap bounds one request cohort: 1,200 logical requests permit at most 2,400 calls and 7.2M reserved token-work. About 40/s and 7.2M/min require matching dispatch windows or steady conditions; cross-window backlog has no such peak bound. The first-response budget 0.2+0.8+0.2+0.7=1.9s leaves 0.1s; fallback never resets the total deadline. Stop when a valid Retry-After exceeds the remaining budget. Use stable quota_exhausted and precommit no-capacity 503 classifications. <a href="#ref-2">[2]</a><a href="#ref-7">[7]</a></p>')))

new.append(section('预算：一条请求，多笔 attempt，分别保留证据', 'Budget: one request, separate attempt holds and evidence', pair(
    '<p><strong>先把责任落盘，再接触网络。</strong>(tenant,rid) 绑定原正文摘要与路由计划；重放读取原状态，改正文冲突。每个 attempt 有独立 bound、pool、价格版本和 owner。UNKNOWN 不是免费，也不因租约或 TTL 到期退款。</p>',
    '<p><strong>Persist responsibility before network I/O.</strong> Bind (tenant,rid) to the original body digest and route plan. Replays read that state; changed bodies conflict. Each attempt owns a bound, pool, price revision and owner. UNKNOWN is neither free nor automatically refunded by a lease or TTL.</p>')+decks[2]+h3('预占与 intent 同事务', 'Hold and intent share one transaction')+pair(
    '<p>下面是可运行 Python/SQLite 文件库示例摘录。<code>write_tx</code> 实际执行 BEGIN IMMEDIATE，再 COMMIT/ROLLBACK；条件更新预算、唯一请求、attempt intent 在同一事务。只有 <code>created=True</code> 的原调用者允许发一次网络请求；丢 ACK 后不能凭查询到 intent 再发。SQLite 的写锁跨连接/进程，由数据库实现，粒度比 PG 行锁粗。<a href="#ref-8">[8]</a><a href="#ref-9">[9]</a></p>',
    '<p>This runnable Python/SQLite file-database excerpt uses actual BEGIN IMMEDIATE and COMMIT/ROLLBACK in write_tx. Conditional budget mutation, unique request creation and attempt intent share a transaction. Only the original created=True caller may send once; finding an intent after a lost ACK does not authorize redispatch. SQLite serializes writers across connections/processes at coarser granularity than PG row locks. <a href="#ref-8">[8]</a><a href="#ref-9">[9]</a></p>')+code('ledger.py#reserve','Python · SQLite','runnable')+pair(
    '<p>并发只剩一份额度时，一个事务赢、另一个连同请求插入一起回滚。a2 的 <code>reserve_fallback</code> 在同一请求行上检查：允许额外费用、a1 已失败、尚未 committed/closed、owner 匹配、selected=1；再独立加 hold、插入 a2、切 selected=2。旧 a1 仍可结算 usage，但不能再交付或关闭 a2。生产移植到 PG 要为请求/attempt/预算选一致的锁顺序，处理唯一冲突、死锁与提交未知；本章未执行 PG。</p>',
    '<p>With one hold left, one transaction wins and the loser rolls back request creation too. reserve_fallback checks extra-cost permission, failed a1, no commitment/closure, matching owner and selected=1 in the same transaction. It adds another hold, inserts a2 and changes selected to 2. Late a1 may settle usage but cannot deliver or close a2. A PG port needs consistent request/attempt/budget lock order plus unique-conflict, deadlock and unknown-commit handling; PG was not executed here.</p>')+h3('结算按 attempt 唯一，不按任意事件编号', 'Settle once per attempt, not once per arbitrary event ID')+code('ledger.py#settle','Python · SQLite','runnable')+pair(
    '<p>结算以 (tenant,rid,attempt) 为唯一身份；相同最终证据只返回原结果，冲突 usage 转人工核账，不能换 event id 再扣一次。预留3,000、实际2,400：held 减3,000、settled 加2,400，净可用多600。两次均发生则分别结算，总成本可能4,800。所有晚到记录仍属于原预算周期；不能把月末未决 hold 自动清零。</p><p>本例只接受可信 Adapter/Reconciler 验证的最终 input/output 证据；先将 upstream request id 与 expected served model 绑定到原 attempt，结算再核对，不能把 a1 的 usage 给 a2。价格版本和来源保存在 attempt，费用按类别另算。输入/输出上界若被违反，仍记录真实债务并阻止新工作，不以回滚证据掩盖超额；这暴露前提失效，不能声称硬预算仍成立。provisional 只作未决估算、不冒充最终 settled；需要估算入账的产品要另建可幂等修正的审计链。</p><p>OpenAI Chat Completions 的 include_usage 尾包可能因中断/取消缺失；Claude message_delta 的 usage 是累计值，必须取最终累计值，不能逐条相加。两家速率规则也不同，Claude 分 RPM/ITPM/OTPM。缺 usage 保留 UNKNOWN hold，报告能力存在才按原 attempt 核账；本库 intent 与外部生成无法原子提交，恢复者不盲目重生成。<a href="#ref-1">[1]</a><a href="#ref-3">[3]</a><a href="#ref-4">[4]</a><a href="#ref-7">[7]</a></p>',
    '<p>The unique accounting identity is (tenant,rid,attempt). Identical final evidence returns the prior result; conflicting usage requires review, not another debit under a new event ID. Holding 3,000 then consuming 2,400 subtracts the entire 3,000 hold and adds 2,400 settled, releasing 600 net. Two executed attempts can cost 4,800. Late evidence stays in its original budget period; month boundaries cannot erase pending holds.</p><p>The model accepts only final input/output evidence authenticated by the trusted Adapter/Reconciler. Bind the upstream request ID and expected served model to the original attempt and check them at settlement; a1 usage cannot settle a2. Attempts retain source and price revision; compute currency charges by category separately. If a supposed upper bound is violated, record actual debt and block new work rather than roll back evidence. That invalidates the hard-bound premise. Provisional values remain estimates, not final settled charges; provisional debits need their own idempotent adjustment audit chain.</p><p>Interrupted/cancelled OpenAI Chat Completions may lose the include_usage tail; Claude message_delta usage is cumulative, so take the final cumulative value rather than sum events. Claude separately limits RPM/ITPM/OTPM. Missing usage retains UNKNOWN holds; use supported reports to reconcile the original attempt. Local intent and external generation cannot commit atomically, so recovery never blindly regenerates. <a href="#ref-1">[1]</a><a href="#ref-3">[3]</a><a href="#ref-4">[4]</a><a href="#ref-7">[7]</a></p>')))

new.append(section('exact 缓存：键相同，当前授权仍要成立', 'Exact cache: matching keys still require current authorization', pair(
    '<p><strong>缓存是旧答案的复用许可，不是权限凭证。</strong>键覆盖完整请求、tenant/权限指纹、路由/模型/数据 revision；命中后再验当前访问权、条目完成状态、原过期时间和 served model 资格。若只是别名重指向新版本，旧答案不能混进新契约。</p>',
    '<p><strong>A cache entry is permission to reuse an old answer, not an access credential.</strong> Key the full request, tenant/access scope and route/model/data revisions. Recheck current access, complete state, original expiry and served-model eligibility. Repointing an alias must not mix old answers into a new contract.</p>')+decks[3]+pair(
    '<p>canonical request 保留消息角色/顺序/有意义的空白，含系统提示、历史、tools/tool_choice、schema、采样参数与输出上限。个性化请求按用户隔离，批准的共享组才可共用；权限不可验证就拒绝该候选。60秒 TTL 是陈旧界限的一部分，不保证知识一分钟内不变。撤销与发送有竞争，已发字节无法收回，活跃流按产品策略终止。</p><p>只发布完整终止且通过格式/任务验证的结果，取消、错误 EOF、半段 tool JSON 不标 COMPLETE。stream hit 使用新的交付 id、公开 cache_hit、按契约返回事件；原始生成 usage 与本次 upstream_usage=0 分开，服务收费也另列。缓存服务故障降为 miss，仍受预算/上游准入；实时余额、动态工具动作优先 bypass。供应商 prompt caching 复用输入前缀计算，仍生成新输出，不等于整份答案缓存。<a href="#ref-10">[10]</a></p>',
    '<p>Canonicalization preserves roles, order and meaningful whitespace, including system/history, tools/tool_choice, schema, sampling and caps. Isolate personalized users; share only approved scopes. Unverifiable access rejects a candidate. A 60-second TTL bounds only part of staleness, not knowledge updates. Revocation races sending: already-delivered bytes cannot be recalled, and active streams follow product termination policy.</p><p>Publish only complete, format/task-validated output; cancellation, error EOF and partial tool JSON never become COMPLETE. Hits use a new delivery ID, explicit cache_hit and declared events. Preserve original generation usage separately from this replay’s zero upstream usage and service price. Cache failure becomes a miss under normal budget/provider admission. Bypass live balances and dynamic tool actions. Provider prompt caching reuses input-prefix computation while generating new output; it is a different layer. <a href="#ref-10">[10]</a></p>')))

new.append(section('语义缓存：相似只召回候选', 'Semantic cache: similarity recalls candidates', pair(
    '<p><strong>默认关闭，只对验收过的 FAQ opt-in。</strong>权限、系统提示/历史、参数、模型/数据/embedding revision 固定为精确 namespace，只对最后一句近似检索。Embedding 本身也要出域授权、配额、费用和 deadline；失败走正常生成。</p>',
    '<p><strong>Default off; opt in only validated FAQ routes.</strong> Freeze access, system/history, parameters and model/data/embedding revisions in an exact namespace. Approximate only final-user text. Embedding also needs residency authorization, quota, cost and deadlines; failure takes normal generation.</p>')+decks[4]+pair(
    '<p>cosine=0.96 是玩具分数，不是正确率。“允许取消”与“不允许取消”、100与1,000、今天与下月都可能接近。候选仍验权限、新鲜度、实体/日期/金额/否定，无法验证等价的自由文本保持关闭；固定 FAQ 可绑定同一批准问题 id 与答案 revision。不同 embedding、metric 和 score 方向不共用魔法阈值。</p><p>固定验证集500条、40次复用、1次错答：复用8%，命中内错答1/40=2.5%，总体1/500=0.2%不能替代前者。20/s全做 embedding 时，理想仅省1.6次生成/s，仍有18.4次生成/s；净收益=1.6×生成成本−20×embedding成本−查询与修错成本。授权泄漏独立计数；调参与验证分离，影子生成也预算，开关退回 exact/all miss。</p>',
    '<p>Toy cosine 0.96 is not correctness. Opposing cancellation intent, 100 versus 1,000 and today versus next month may be close. Recheck authorization, freshness, entities, dates, amounts and negation. Keep unvalidated free-text equivalence off; fixed FAQs can bind an approved question ID and answer revision. Different embeddings, metrics and score directions share no magic threshold.</p><p>In 500 frozen validation queries with 40 reuses and one error, reuse is 8% and conditional wrong-hit rate is 1/40=2.5%; overall 1/500=0.2% cannot replace it. At 20/s with embeddings for all, ideal savings are only 1.6 generations/s while 18.4/s still generate. Net value subtracts twenty embeddings/s, lookup and remediation cost. Track access leaks separately; separate tuning from validation, budget shadow generation and retain an exact/all-miss switch.</p>')))

new.append(section('SSE：提交屏障、有界转发与终止', 'SSE: commitment barrier, bounded forwarding and termination', pair(
    '<p><strong>首文字 token 不是边界，公共响应提交才是。</strong>Ledger 中的 selected attempt/owner 与 COMMITTED 必须一起判断；fallback 用同一行事务切 selected。先持久提交、后发头，崩溃会保守拒绝本来还没发出的重试；反过来先发头再记账，会让恢复者误以为还能重生成。</p>',
    '<p><strong>First text is not the boundary; public response commitment is.</strong> Check selected attempt/owner with COMMITTED in Ledger; fallback changes selected through the same row transaction. Persist before headers: a crash may conservatively reject an unsent retry. Headers-before-record can falsely authorize regeneration after partial delivery.</p>')+decks[5]+pair(
    '<p>可运行示例的 <code>claim_commit</code> 实际条件更新为：selected=n、owner匹配、未提交/关闭、attempt未失败。它与 fallback 竞争最多一方获准，晚到 a1 只能补 usage。查询到 COMMITTED 或提交 ACK 未知不等于允许重新 flush；示例没有流迁移、owner接管或持久 token 日志。Edge 必须在屏障前禁止提前200/心跳。</p>',
    '<p>The runnable model’s claim_commit condition requires selected=n, matching owner, no commitment/closure and a nonfailed attempt. It competes with fallback so at most one path wins. Late a1 can only report usage. Observing COMMITTED or an unknown commit ACK does not authorize another flush. There is no stream migration, owner takeover or durable token log in the model. Edge must suppress early 200/heartbeats until the barrier.</p>')+code('stream.pseudo','Pseudocode · SSE','pseudocode')+pair(
    '<p>这是协议伪代码，未运行网络流。每次写完才读下一事件，16 KiB 的读块/单事件/编码输出限制与无预取合起来约束 ≤64 KiB 的应用载荷缓冲；超大事件拒绝，不能先分配整段再检查。TLS/socket、对象和整份缓存答案另计，真实 HTTP 库必须验证不会偷偷攒流。UTF-8 与 SSE 事件可跨网络 read，不能把 chunk 当 token。POST 用 fetch/SDK，原生 EventSource 不承载该正文；Claude 命名/流内 error 与 OpenAI 形状分别适配。<a href="#ref-1">[1]</a><a href="#ref-3">[3]</a><a href="#ref-6">[6]</a></p><p>公共头、role、heartbeat 或成功终止事件都先过同一屏障。提交后失败只能错误事件/异常 EOF，不改503、不补成功 DONE、不缓存半答。可否备用由可信 Adapter 的错误分类决定，与成本 UNKNOWN 分开；仅暂时限流/服务器故障/发送后超时入白名单，取消、写堵塞、解析/超大事件、schema、权限与安全拒绝都不换池。读空闲、首响应、总时长和写堵塞分别设 deadline；写堵塞10s或客户端断开向上游尽力取消。取消不证明远端停止，也不退 UNKNOWN hold；本地连接资源关闭后可释放，本地复制的远端并发额度要等终态证据或保守隔离，不能立即当空槽复用。</p><p>A8 在同一稳态边界取被接纳完成率20/s：首token0.5s，后399个间隔/50=7.98s，总8.48s，L=20×8.48=169.6≈170条平均流。200×64KiB=13,107,200B=12.5MiB只是缓冲上限，不证明尾延迟或故障幸存容量。输出 usage 可包括不可见 token，不能用客户端字数结算。<a href="#ref-5">[5]</a></p>',
    '<p>This protocol pseudocode did not run a network stream. Await each write before reading the next event. A 16-KiB read/event/encoded-output cap plus no prefetch bounds application payload buffers to at most 64 KiB. Reject oversized events before allocation. TLS/socket buffers, objects and complete cached answers are extra; verify the actual HTTP library does not accumulate output. Incrementally decode UTF-8 and SSE across reads; chunks are not tokens. Use fetch/SDK for POST; native EventSource cannot carry that body. Adapt Claude named/in-stream error events separately from OpenAI shapes. <a href="#ref-1">[1]</a><a href="#ref-3">[3]</a><a href="#ref-6">[6]</a></p><p>Headers, roles, heartbeats and successful terminal events all pass the same barrier. Postcommit failure uses error/EOF, never 503, false success DONE or partial cache publication. Trusted Adapter failure classification is separate from cost uncertainty: only transient limits/server errors or dispatch timeout permit fallback. Disconnects, blocked writes, parsing/oversize/schema failures, access denials and safety refusals do not. Separate idle-read, first-response, total and blocked-write deadlines. Ten-second blocked writes or disconnection trigger best-effort cancellation. Cancellation proves neither remote completion nor a quota refund. Closed local connections release local resources; remote concurrency credit waits for terminal evidence or conservative quarantine.</p><p>A8 uses twenty admitted completions/s at the same steady boundary: first token at 0.5s plus 399/50=7.98s gives 8.48s; L=20×8.48=169.6≈170 mean streams. 200×64KiB=13,107,200B=12.5MiB bounds buffering, not tails or survivor capacity. Output usage may include invisible tokens, so visible character counts cannot settle it. <a href="#ref-5">[5]</a></p>')))

new.append(section('复盘：用反例检验承诺', 'Review: test claims with counterexamples', pair(
    '<ul><li><strong>并发最后一份预算：</strong>只能一个 hold 成功；重复 rid 不重复 dispatch。</li><li><strong>intent 后崩溃：</strong>不能区分未发/已执行，保留 UNKNOWN；a2 需要额外预算与授权。</li><li><strong>fallback 与首事件竞争：</strong>同一请求行选定 attempt；旧 owner 不能再写流。</li><li><strong>重复或冲突 usage：</strong>同 attempt 只结一次，冲突转核账，不按新 event id 重扣。</li><li><strong>撤销与慢客户端：</strong>cache hit 仍授权，写堵塞中止，取消不当退款。</li></ul><p>可复现命令与完整源码见 <a href="../examples/ch32/README.md">examples/ch32</a>。实际验证范围是 SQLite 本地事务/多连接/进程退出与协议手推；未执行 PG、真实 provider、网络 SSE、生产 tokenizer 或压测。指标分入口与 attempt，记录请求别名/served model/route revision、cache类型、首事件/结束时延和 UNKNOWN 年龄；默认不记录完整 prompt/凭证。</p>',
    '<ul><li><strong>Last-budget contention:</strong> exactly one hold succeeds; duplicate rid never dispatches again.</li><li><strong>Post-intent crash:</strong> unsent versus executed is ambiguous; retain UNKNOWN, and require separate budget/permission for a2.</li><li><strong>Fallback versus first event:</strong> one request row selects the attempt; the old owner cannot write another stream.</li><li><strong>Repeated/conflicting usage:</strong> settle an attempt once; conflicting evidence requires review, not a new-event debit.</li><li><strong>Revocation and slow clients:</strong> authorize cache hits, abort stalled writes and never equate cancellation with refund.</li></ul><p>See <a href="../examples/ch32/README.md">examples/ch32</a> for reproducible commands and full source. Execution covers local SQLite transactions, multiple connections, process exit and manual protocol traces, not PG, real providers, network SSE, production tokenizers or load testing. Separate entry/attempt metrics, record requested alias/served model/route revision, cache type, first/last-event latency and UNKNOWN age. Do not log full prompts or credentials by default.</p>')))

refs = [
('OpenAI · Chat Completions streaming events','https://developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events','include_usage 与中断尾包；不推导 chunk=token。','include_usage and missing interrupted tails; chunks are not token counts.'),
('OpenAI · Rate limits','https://developers.openai.com/api/docs/guides/rate-limits','RPM/TPM、失败请求和 SDK 重试；不使用账户额度。','RPM/TPM, failed requests and SDK retry configuration; no account limits used.'),
('Anthropic · Streaming messages','https://platform.claude.com/docs/en/build-with-claude/streaming','命名事件、流内 error、message_delta 累计 usage。','Named events, in-stream errors and cumulative message_delta usage.'),
('Anthropic · Rate limits','https://platform.claude.com/docs/en/api/rate-limits','Messages API 的 RPM/ITPM/OTPM 与共享组；无具体配额值。','Messages API RPM/ITPM/OTPM and shared groups; no numerical account quota.'),
('OpenAI · Counting tokens','https://developers.openai.com/api/docs/guides/token-counting','max_completion_tokens / max_output_tokens 限制不可见输出类别。','Output limits and reported usage include nonvisible generated tokens.'),
('WHATWG · HTML §9.2 Server-sent events','https://html.spec.whatwg.org/multipage/server-sent-events.html','Living Standard；UTF-8、事件解析与 EventSource 接口。','Living Standard; UTF-8, event parsing and EventSource interface.'),
('IETF · RFC 9110 §§9.2.2 / 10.2.3','https://www.rfc-editor.org/rfc/rfc9110.html','2022；非幂等重试与 Retry-After；rid 是本题协议。','2022; non-idempotent retries and Retry-After; rid is our protocol.'),
('PostgreSQL 18 · Explicit Locking','https://www.postgresql.org/docs/18/explicit-locking.html','行锁事务语义；代码未在 PG 执行。','Row-lock transaction semantics; the code was not run in PG.'),
('SQLite · Transaction','https://www.sqlite.org/lang_transaction.html','BEGIN IMMEDIATE 与单写事务；本例实际运行版本另见结果。','BEGIN IMMEDIATE and serialized writers; actual runtime version is recorded in results.'),
('OpenAI · Prompt caching','https://developers.openai.com/api/docs/guides/prompt-caching','输入前缀状态复用仍生成新响应；区别于整份答案缓存。','Prefix-state reuse still generates new output, distinct from complete-answer reuse.')]
refbody = pair('<p>一手文档核对于2026-10-24；可变 API 页以核对日内容为准，不代表所有供应商/模型都同样支持。所有容量、TTL和时限来自本章 A1–A12 假设；没有引用当前定价或厂商性能。OpenAI 事实按 OpenAI Docs 技能检索官方页。</p>', '<p>Primary documentation checked on 2026-10-24. Mutable API pages describe the checked surface, not universal support across models/providers. Capacity, TTLs and deadlines come from A1–A12, not current prices or vendor performance. OpenAI facts were checked through official OpenAI documentation.</p>')
refbody += '<ol class="references">'+''.join(f'<li id="ref-{i}">[{i}] <a href="{url}">{title}</a> — <span class="lang-zh">{zh}</span><span class="lang-en">{en}</span></li>' for i,(title,url,zh,en) in enumerate(refs,1))+'</ol>'
new.append(section('引用与适用范围','References and applicability',refbody))

flash = sections[11]
flash = flash.replace('原调用+一个允许备用，所有SDK重试合计≤2。','原调用+一个允许备用，SDK合计≤2；只约束同请求集合总调用数，不封瞬时峰率。').replace('Original plus one allowed fallback; SDK retries included, ≤2.','Original plus one allowed fallback, SDK retries included, ≤2; a cohort total, not a peak-rate bound.')
flash = flash.replace('同事务释放600、记settled2400和唯一结算；重复只返回原结果。','同事务held减3000、settled加2400，净释放600；attempt唯一结算，冲突核账。').replace('Atomically release 600, debit 2,400 and persist unique settlement.','Subtract the 3,000 hold, add 2,400 settled and free 600 net; settle once per attempt, review conflicts.')
flash = flash.replace('公共响应头、角色、心跳也算COMMITTED；未知执行可能收费。','头/角色/心跳都算提交；持久屏障绑定selected attempt/owner，旧a1不能拼流。').replace('Headers, role and heartbeat also commit; unknown execution may cost.','Headers, role and heartbeat commit; the barrier binds selected attempt/owner and rejects stale a1.')
flash = flash.replace('不能假定零；保留UNKNOWN hold，按证据核账。','不能假定零；保留UNKNOWN hold与远端槽位，证据核账；备用另预占。').replace('Do not assume zero; retain UNKNOWN hold and reconcile evidence.','Retain UNKNOWN hold/remote slot; reconcile evidence and reserve fallback separately.')
new.append(flash)

result = original
for old, replacement in zip(sections,new):
    result = result.replace(old,replacement,1)

# Local diagram repairs. Preserve groups, frame order, coordinates of core nodes and IDs.
result = result.replace('x="400" y="315" text-anchor="middle" class="label">Ledger', 'x="400" y="309" text-anchor="middle" class="label">Ledger')
result = result.replace('x="400" y="333" text-anchor="middle" class="sub">', 'x="400" y="334" text-anchor="middle" class="sub">')
result = result.replace('x="640" y="117.5" text-anchor="middle" class="label">Ledger','x="640" y="113" text-anchor="middle" class="label">Ledger')
result = result.replace('x="640" y="135.5" text-anchor="middle" class="sub">holds','x="640" y="138" text-anchor="middle" class="sub">holds')
result = result.replace('x="730" y="76" class="tiny">primary','x="865" y="64" text-anchor="middle" class="tiny">primary')
result = result.replace('x="445" y="229" class="tiny">usage / status','x="445" y="224" class="tiny">usage')
result = result.replace('x="136" y="368" class="tiny">HIT preserves an earlier answer; temperature=0 is not byte determinism','x="136" y="377" class="tiny">HIT reuses an old answer; temperature=0 does not prove identical regeneration')
result = result.replace('GET / SET share the side path; no partial answer becomes a HIT','GET / SET use the side path; incomplete answers are not reusable')
result = result.replace('unique settle key','unique attempt key')
result = result.replace('committed flag</text>','selected + commit</text>')
result = result.replace('COMMITTED → no model replacement','selected owner + COMMITTED → no replacement')
result = result.replace('x="550" y="252" class="tiny">Cancel → abort upstream; unresolved holds remain','x="550" y="252" class="tiny">Cancel → best-effort abort; UNKNOWN stays held')
for ident in ('d6s5','d6s6'):
    start = result.index('<svg ',result.index(f'<title id="{ident}t">')-150)
    end = result.index('</svg>',start)+len('</svg>')
    svg=result[start:end]
    # Red overlays need arrows, not a second copy of the identical lane label.
    seen=set()
    def dedupe(m):
        text=m[0]
        if any(f'>{x}</text>' in text for x in ('POST','model alias','one attempt','invoke')):
            if text in seen: return ''
            seen.add(text)
        return text
    svg=re.sub(r'<text\b[^>]*>.*?</text>',dedupe,svg,flags=re.S)
    result=result[:start]+svg+result[end:]

for ident in ('d3s5','d3s6'):
    title=result.index(f'<title id="{ident}t">')
    start=result.rfind('<svg ',0,title)
    end=result.index('</svg>',title)+len('</svg>')
    svg=result[start:end]
    for element in (
        '<path d="M780 312 L485 312" class="wire reply"/>',
        '<polygon points="475,312 485,307 485,317" class="head reply"/>',
        '<path d="M435 270 L435 175" class="wire reply"/>',
        '<polygon points="435,165 440,175 430,175" class="head reply"/>'):
        assert element in svg
        svg=svg.replace(element,element.replace('reply"','muted"'))
    svg=svg.replace('>authoritative usage</text>','>final usage missing</text>')
    svg=svg.replace('x="445" y="224" class="tiny">usage','x="445" y="224" class="tiny">pending')
    svg=svg.replace('3,000 → 2,400; release 600','held 3,000; pending evidence')
    if ident=='d3s6':
        svg=svg.replace('<text x="902" y="203" class="tiny">usage</text>',
            '<text x="898" y="190" class="tiny">if</text><text x="898" y="209" class="tiny">verified</text>')
    result=result[:start]+svg+result[end:]
result=result.replace('它查未决记录，用可获得的上游报告补齐同一 attempt，再幂等结算；',
    '它查未决记录，图上 hold 仍为3,000；仅当上游支持报告且证据验证通过，才补齐同一 attempt 并幂等结算；')
result=result.replace('Reconciler uses available upstream evidence to settle the same attempt idempotently.',
    'The hold remains 3,000. Only supported, verified upstream evidence permits idempotent settlement of the same attempt.')

result=result.replace("reuse check → quota hold → upstream admission", "reuse check → upstream admission → quota hold")

# Clarify the diagram's same-request commitment condition without adding a new frame.
result=result.replace('LLM GW CASes the committed flag in Ledger before sending public headers or events, and receives the Ledger acknowledgment.', 'LLM GW conditionally commits the selected attempt and owner in Ledger before public headers or events, and receives the Ledger acknowledgment; fallback changes the same request row.')
result=result.replace('发公共响应头之前先持久标记 COMMITTED。记录和网络不能原子提交，先记可产生', '发公共响应头之前按 selected attempt/owner 条件持久标记 COMMITTED，与 fallback 的同一请求行事务互斥。记录和网络不能原子提交，先记可产生')
result=result.replace('Persist COMMITTED before public headers. The flag and network send are not atomic:', 'Persist COMMITTED for the selected attempt/owner before public headers, mutually exclusive with fallback on the same request row. The flag and network send are not atomic:')
assert len(re.findall(r'<figure class="deck">',result))==6
assert len(re.findall(r'<svg\b',result))==32
target.write_text(result)
print('Ch32 prose rewritten; 6 decks / 32 frames retained; 4 code blocks')
