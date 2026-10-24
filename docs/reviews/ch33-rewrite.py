"""Preserve all baseline decks/IDs, rewrite nearby teaching prose and local labels."""
from pathlib import Path
import html
import re

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "docs/reviews/ch31-ch32-ch33-baseline/ch33.html"
source = BASE.read_text()
decks = re.findall(r'<figure class="deck">.*?</figure>', source, re.S)
assert len(decks) == 6
for index, deck in enumerate(decks):
    # Pull store text away from the bottom ellipse without moving any node/wire.
    deck = deck.replace('y="317.5" text-anchor="middle" class="label"', 'y="311.5" text-anchor="middle" class="label"')
    deck = deck.replace('y="335.5" text-anchor="middle" class="sub"', 'y="330.5" text-anchor="middle" class="sub"')
    deck = deck.replace('y="322.5" text-anchor="middle" class="label"', 'y="316.5" text-anchor="middle" class="label"')
    deck = deck.replace('y="340.5" text-anchor="middle" class="sub"', 'y="335.5" text-anchor="middle" class="sub"')
    if index == 3:
        deck = deck.replace('Grant binds: tenant / actor / intent / tool r7', 'Bind: tenant / actor / agent / intent / tool r7')
        deck = deck.replace('args digest / resource v4 / policy p9 / expiry', 'route v1 / args / resource v4 / policy p9 / expiry')
        deck = deck.replace('The snapshot fixes actor, tenant, tool revision, canonical argument digest and resource version.', 'The snapshot fixes tenant, actor, agent, intent, tool revision, route, canonical arguments, resource version, policy and expiry.')
        deck = deck.replace('租户、操作者、工具 r7、参数摘要、资源 v4 与策略 p9。', '租户、操作者、Agent、intent、工具 r7、目的端、有效参数、资源 v4、策略 p9 与期限。')
        deck = deck.replace('binding tenant, actor, tool r7, argument digest, resource v4 and policy p9.', 'binding tenant, actor, agent, intent, tool r7, route, effective arguments, resource v4, policy p9 and expiry.')
    if index == 4:
        deck = deck.replace('A lost Tool API reply is shown as a failure reaching Adapter, then Tool GW, then Runtime.', 'The red Tool API-to-Adapter lane marks lost evidence, not a business rejection sent by Tool API. Adapter observes a local timeout and reports uncertainty through Tool GW to Runtime.')
    if index == 5:
        deck = deck.replace('Cancellation travels upstream but is best effort', 'Cancellation propagates toward the backend without rollback')
        # Only cancellation frames repeat both labels under muted and red lanes.
        for slide in re.findall(r'<div class="slide">.*?</div>', deck, re.S):
            if re.search(r'id="d6s[345]t"', slide):
                fixed = slide
                for x, label in [('482.5', 'dispatch'), ('742.5', 'call')]:
                    token = f'<text x="{x}" y="163" text-anchor="middle" class="tiny">{label}</text>'
                    assert fixed.count(token) == 2
                    fixed = fixed.replace(token, '', 1).replace(token, token.replace(f'>{label}<', '>cancel<'), 1)
                deck = deck.replace(slide, fixed)
        deck = deck.replace('它尽力释放等待资源，不能证明写已撤销；', '它可结束本地等待，但远端在途额度要等终止证据；它不能证明写已撤销；')
        deck = deck.replace('Cancellation propagates upstream and releases waiting resources where possible. It proves no rollback;', 'Cancellation ends local waiting where possible; remote capacity needs termination evidence. It proves no rollback;')
    decks[index] = deck


def bi(zh, en):
    def paragraphs(value):
        return ''.join('<p>' + line + '</p>' for line in value.strip().split('\n'))
    return '<div class="bilingual"><div class="lang-zh">' + paragraphs(zh) + '</div><div class="lang-en">' + paragraphs(en) + '</div></div>'


def heading(zh, en, level=2):
    return f'<h{level}><span class="lang-zh">{zh}</span><span class="lang-en">{en}</span></h{level}>'


def section(zh, en, content, css=''):
    return f'<section{css}>{heading(zh,en)}\n{content}</section>\n'


def code(name):
    content = html.escape((ROOT / f'examples/ch33/{name}.pseudo').read_text().rstrip('\n'), quote=True)
    return f'<pre data-language="Pseudocode · {name}" data-kind="pseudocode" data-source="{name}.pseudo"><code>{content}</code></pre>'


parts = [source[:source.index('<section class="goal">')]]
parts.append(section('本章核心：批准一笔动作，查清一份结果', 'Core: approve one action, establish one outcome', bi(
'''<strong>模型只提议，执行面授予权限。</strong> schema 校验回答“参数形状对不对”；对象授权回答“这个主体能否操作这份资源”。目录可见、JSON 合法都不能替代授权。
<strong>批准绑定完整快照，发出前再验。</strong> 固定 tenant、actor、Agent、intent、工具与目的端版本、有效参数、资源版本、策略和期限。等待审批不占 RPC 槽位。
<strong>本网关事务不覆盖远端副作用。</strong> 业务端把 key、条件写与回执放在同一事务；两库之间丢回包就保留 UNKNOWN，取消、租约和 TTL 都不能把它变成“没写”。''',
'''<strong>The model proposes; the execution plane authorizes.</strong> Schema checks shape, while resource authorization checks whether this subject may act on this object. Catalog visibility and valid JSON grant no authority.
<strong>Approve the full snapshot and recheck before dispatch.</strong> Bind tenant, actor, agent, intent, tool/route revisions, effective arguments, resource version, policy and expiry. Approval waits consume no RPC slot.
<strong>A gateway transaction does not include the remote effect.</strong> The backend commits the key, conditional effect and receipt together. Lost evidence between the two databases remains UNKNOWN; cancellation, leases and TTL do not prove no effect.'''), ' class="goal"'))
parts.append(section('范围与需求：内部工单查询和关单', 'Scope: internal ticket reads and closure', bi(
'''可信 Runtime 携认证身份，把模型生成的 name、revision、arguments 交给 Tool GW；本章默认许可读自动执行、写逐笔人工审批。接入已注册 HTTP 与 MCP 工具，统一执行契约，逐个声明后端的授权、幂等、查证和取消能力。只有几个内部读函数时可先嵌入同一模块；多 Runtime 共享凭据与审计后再独立成网关。
先问调用主体、副作用、工具拥有者、审批资源条件、下游防重/查询能力、期限与敏感审计留存。<a class="chip" href="ch32.html">Ch32</a> 负责调模型，<a class="chip" href="ch34.html">Ch34</a> 负责多步循环/恢复，本章只执行一跳动作。客户端工具由应用处理 tool_use/tool_result；供应商也能托管服务端工具，不能把一种调用方式写成所有产品的事实。<a href="#ref-1">[1]</a>''',
'''Authenticated Runtime sends model-proposed name, revision and arguments to Tool GW. This lesson automatically executes allowed reads and requires per-action human approval for writes. MCP and registered HTTP share an execution contract while declaring backend-specific authorization, deduplication, lookup and cancellation. Embed a small module first; extract a gateway when multiple runtimes share credentials and audit.
Clarify subjects, effects, owners, approval conditions, backend evidence, deadlines and sensitive retention. <a class="chip" href="ch32.html">Ch32</a> calls models and <a class="chip" href="ch34.html">Ch34</a> owns multi-step recovery. Client tools use application-handled tool_use/tool_result; suppliers can also host server tools. <a href="#ref-1">[1]</a>''')))

assumptions = re.search(r'<h2><span class="lang-zh">把全部教学数字.*?</section>', source, re.S)[0]
assumptions = assumptions[assumptions.index('<table>'):]
assumptions = assumptions.replace('</section>', '')
assumptions = assumptions.replace('每逻辑调用的累计脱敏事件均值 2 KB', '每逻辑调用的基线脱敏事件均值 2 KB，不含额外重试')
assumptions = assumptions.replace('Mean total redacted events 2 decimal KB/logical call', 'Mean baseline events 2 decimal KB/call; extra retries excluded')
assumptions = assumptions.replace('20 轮/秒，每轮平均 3 次工具；审批提交/轮询流量另计', '20轮/秒，每轮3次最终执行的合法工具调用；拒绝/审批/轮询流量另计')
assumptions = assumptions.replace('20 turns/s, mean three tools; approval/poll traffic extra', '20 turns/s, mean three valid eventually executed calls; denied/approval/poll traffic extra')
assumptions = assumptions.replace('20% 调用需批；平均等 30 秒；提交与处理稳态平衡', '20%调用需批且最终通过；平均等30秒；审批吞吐稳态平衡')
assumptions = assumptions.replace('20% need approval, mean wait 30 s, steady stable service', '20% wait for eventual approval, mean 30 s; stable approval throughput')
parts.append(section('教学假设：容量、批准与保留', 'Teaching assumptions: capacity, grants and retention',
    '<details><summary><span class="lang-zh">展开 A1–A12；全部是自设约束，不是产品保证</span><span class="lang-en">Expand A1–A12: design choices, not product guarantees</span></summary>' + assumptions + '</details>'))

parts.append(section('1 · 总览：控制面定版，结果逐跳返回', '1 · Overview: pin the contract, return through every hop', decks[0] + bi(
'''<strong>Registry 固定契约，Execution DB 固定决策，Business DB 才拥有业务副作用。</strong> 受认证的 <code>POST /tools/invoke</code> 接受工具提议与稳定 intent；tenant/actor/Agent 取可信身份。网关依次做 revision、schema、对象权限、限额和审批。发出前持久记 intent 与事件，Adapter 只走绑定的一个目的端，结果经 Tool API → Adapter → Tool GW → Runtime 返回。
工具目录保存输入/输出 schema、目的端版本、拥有者、副作用、权限、期限、重试与审批策略；仅把受过滤的名称/说明/schema 投影给模型。执行时再验当前权限，不能信任模型自填 tenant、URL 或“readOnly”。缓存只是派生读取，多个网关实例共享同一权威执行库。<a href="#ref-8">[8]</a>
统一结果区分 PENDING、DENIED、SUCCEEDED、FAILED_KNOWN、UNKNOWN，带 intent、attempt、revision 与可查询句柄。本平台 202 只表示已持久接收；HTTP/JSON-RPC 成功不代表业务成功，MCP 的 <code>isError</code> 也只标记工具错误，<strong>不能单凭它证明没有副作用</strong>。只有业务契约/回执证明无效果才归 FAILED_KNOWN，否则 UNKNOWN。<a href="#ref-2">[2]</a>''',
'''<strong>Registry fixes contracts, Execution DB records decisions, and Business DB owns effects.</strong> Authenticated <code>POST /tools/invoke</code> accepts a proposal and stable intent; identity comes from trusted context. Recheck revisions, schema, resources, budgets and approval. Persist intent/events before sending to one pinned route. Results return Tool API → Adapter → Tool GW → Runtime.
Registry stores schemas, route revision, owner, effects, access, deadline, retry and approval policy; the model receives only a filtered projection. Reauthorize during execution. Model-provided tenant, URLs and safety labels confer no permission. Caches are derived; all gateways share one execution authority. <a href="#ref-8">[8]</a>
Return PENDING, DENIED, SUCCEEDED, FAILED_KNOWN or UNKNOWN with intent/attempt/revision and a status handle. Our 202 means durable acceptance. HTTP/JSON-RPC success is not business success, and MCP <code>isError</code> reports a tool error, <strong>not proof of no effect</strong>. Only authoritative no-effect evidence establishes FAILED_KNOWN. <a href="#ref-2">[2]</a>''')))

parts.append(section('2 · 协议：发现不是授权，会话不是 intent', '2 · Protocol: discovery is not authorization; sessions are not intents', decks[1] + bi(
'''<strong>模型侧 tool calling 与服务侧 MCP 是两层契约。</strong> Adapter 协商并初始化后，拉完分页 tools/list；候选经审查才成为 Registry r7。执行用 tools/call，schema/描述/目的端变化要新 revision；未审 r8 拒绝，不能在已批准 r7 后静默替换。来自不可信服务的 readOnlyHint/idempotentHint 只是提示，retry_safe 需要拥有者证明实际副作用、防重与保留期。<a href="#ref-2">[2]</a>
为已有服务固定 <strong>MCP 2025-11-25</strong>：stdio 与 Streamable HTTP；后者消息 POST，响应可为 JSON 或 SSE；服务可分配 MCP-Session-Id，后续请求须携带。断连接不等于取消，重连/重建协议 session 也不能重新造业务动作。<a href="#ref-3">[3]</a>
business session 关联对话，intent 标识一笔业务动作，JSON-RPC id 关联一份报文，transport session 关联服务上下文。四者分开持久关联。HTTP Adapter 只调用注册模板，不接受模型 URL；目的地址/重定向/网络出口受策略控制，凭据校验 audience/scope，不能原样透传不适用 token。<a href="#ref-6">[6]</a>''',
'''<strong>Model tool calling and server-side MCP are separate contracts.</strong> Adapter negotiates/initializes and consumes paginated tools/list, then submits candidates for Registry review. Use tools/call only against the reviewed mapping. Changed schema/descriptions/routes require a new revision; reject unreviewed r8. Untrusted safety annotations are hints; owners must establish actual effects, deduplication and retention. <a href="#ref-2">[2]</a>
Pin <strong>MCP 2025-11-25</strong>: stdio and Streamable HTTP; the latter posts messages and accepts JSON/SSE responses. Servers may assign session IDs that subsequent requests must carry. Disconnect is not cancellation; reconnecting or recreating a session does not recreate the business action. <a href="#ref-3">[3]</a>
Business sessions group conversations, intents identify actions, JSON-RPC IDs correlate messages, and transport sessions identify server context. Track each separately. HTTP routes are registered templates rather than model URLs; constrain resolved destinations/redirects/egress and validate credential audience/scope. <a href="#ref-6">[6]</a>''')))

parts.append(section('3 · 准入：schema 与对象授权分别生效', '3 · Admission: schema and resource access are separate', decks[2] + bi(
'''<strong>格式合法的 ticket_id 仍可指向别人的工单。</strong> 图中 RESOLVED → SCHEMA_OK 只校验参数，SCHEMA_OK → AUTHZ_OK 才验证资源 tenant 与用户∩Agent∩工具策略。服务凭据的 write 能力不能升级只读用户。Tool API 再做业务对象鉴权，网关多读一次不能消除后续竞争。
代码对应图3前3帧：先限 16 KiB/8 层，再解析并拒重复键，显式 required/额外字段/类型；JSON Schema 的 properties 本身不会必填或关闭额外字段。<a href="#ref-5">[5]</a> 此例固定平面 schema，4、4.0、true、字符串“4”不混用；默认值和规范化必须在审批显示前完成。编码是本例固定格式，不声称为通用 JSON 规范化标准。''',
'''<strong>A valid ticket_id can still identify another tenant’s ticket.</strong> RESOLVED → SCHEMA_OK validates shape; SCHEMA_OK → AUTHZ_OK checks ownership and user∩agent∩tool permissions. A service write credential never upgrades a read-only user. The backend reauthorizes; a gateway pre-read cannot eliminate later races.
This contract covers the first three admission frames: bound 16 KiB/eight levels, reject duplicate keys and explicitly validate required/extra fields/types. JSON Schema properties alone neither require fields nor close extras. <a href="#ref-5">[5]</a> This fixed flat schema distinguishes 4, 4.0, true and “4”; apply defaults/normalization before displaying approval. Its encoding is domain-specific, not universal JSON canonicalization.''') + code('admission') + bi(
'''输入错误拒绝且不消耗 grant。PENDING 等批没有 dispatch 边；未发出过期统一为 <code>DENIED(reason=expired)</code>，与已发出 UNKNOWN 分开。输出也要限 64 KiB、验声明的结构并按权限脱敏；超限分页/受保护句柄或明确 truncated，不把半份结果说成已检查全部。工具输出是带来源的不可信数据，不能提升为系统指令或下一次调用的权限。''',
'''Invalid input neither dispatches nor consumes a grant. PENDING has no execution edge. Undispatched expiry is <code>DENIED(reason=expired)</code>, distinct from postdispatch UNKNOWN. Bound outputs at 64 KiB, validate declared structure and redact by access; paginate or mark truncation. Treat tool text as untrusted sourced data, never as new system instructions or authority.''')))

parts.append(section('4 · 审批：完整绑定，批准和发出分两次事务', '4 · Approval: full binding, separate approval and dispatch transactions', decks[3] + bi(
'''<strong>批准的是可读的具体快照。</strong> Approval UI 从可信网关取实际动作、有效参数与影响；审批者身份及可批范围来自认证会话。grant 绑定 tenant、actor、Agent、intent、工具名/revision、目的端版本、规范参数、资源 ID/version、policy、expiry 与单次标识。只显示 hash 不算可审阅；换任何一项要新快照和批准。
图4第3帧是批准事务，第4帧是发出事务。两次点击只消费一个 grant；APPROVED 仍未执行。执行器在同一权威库锁内观察时间与当前权限/版本，更新状态与事件；提交确认后才发网络。若提交回执本身未知，先按原 key 查回记录，不能当成没提交。下面的 BEGIN 只覆盖指定本库，永远不包住 HTTP/MCP。''',
'''<strong>Approval covers a readable concrete snapshot.</strong> The gateway supplies effective arguments and impact; authenticated sessions supply approver identity/scope. Bind tenant, actor, agent, intent, tool name/revision, route revision, canonical arguments, resource ID/version, policy, expiry and grant identity. A hash alone is not a reviewable action; changed fields need new review.
Frame 3 commits approval, frame 4 commits dispatch intent. Duplicate clicks consume one grant; APPROVED is not executed. Under the execution database lock, sample time and recheck current permissions/revisions, then update state/events. Send only after confirming commit; ambiguous commit acknowledgements require a same-key readback. Each BEGIN covers one database, never HTTP/MCP.''') + code('approval') + bi(
'''批准“关 v4 工单”后若它变成 v5，业务端在修改事务中验 version/If-Match 前置条件，拒绝 stale_precondition 后重新审查，不能自动换 v5 重试。<a href="#ref-7">[7]</a> 无条件后端不能保证原快照仍成立，必须改造契约或明确批准的是不依赖该快照的动作。权限撤销的更强提交时保证也要业务端版本/屏障，本网关检查只是本地准入时点。
5 分钟 grant 到期阻止新发出，不回滚已发请求。撤销在 claim 前与它串行，能明确取消；claim 后只能记录 cancel_requested、尽力传播并查证。补偿是另一笔有权限/批准/幂等的业务动作，重新开单不自动等于原事务回滚。''',
'''If approved v4 becomes v5, the backend checks version/If-Match in the modification transaction and returns stale_precondition; do not silently retry v5. <a href="#ref-7">[7]</a> Unconditional backends cannot preserve snapshot assumptions. Stronger commit-time revocation likewise needs backend policy versions/barriers; gateway admission has a local authorization point.
The five-minute grant blocks new dispatch after expiry, without undoing an issued call. Cancellation serializes with claim: before claim it can prove no dispatch; afterward record cancel_requested, propagate best effort and query evidence. Compensation is another authorized/approved/idempotent action, not automatic rollback.''')))

parts.append(section('5 · 幂等与 UNKNOWN：同一动作，两次提交', '5 · Idempotency and UNKNOWN: one action, two commits', decks[4] + bi(
'''<strong>intent 由可信业务交互定义，模型不能重造。</strong> 重放同一动作保持原 key；用户想合法执行两次相同动作就要两个 intent。tool_call_id 或参数 hash 都不能推断人的意图。Execution DB 唯一 (tenant,intent) 只防本网关重复准入；快照不同返回冲突，不能复用旧批准，也不能换 Adapter/目的端补做未知写。<a href="#ref-8">[8]</a>
真正的副作用防重在 Business DB：先查已有同 key 回执，再对新操作验当前权限与资源条件，修改和回执同事务。<strong>已有成功回执必须先于新的 version/expiry 检查返回</strong>，否则重放会因本次成功已把 v4 改成 v5 而误报失败。epoch/CAS 只限制本库结果写入者，远端仍需同 key 与条件。''',
'''<strong>Trusted business interaction defines intent; the model does not regenerate it.</strong> Replays retain a key; two legitimate identical actions have two intents. Model call IDs and argument hashes cannot determine human intent. Unique (tenant,intent) prevents gateway admission duplicates only; changed snapshots conflict, and unknown writes never move to another Adapter/route. <a href="#ref-8">[8]</a>
Business DB protects effects: read an existing keyed receipt first; only new work checks current access/resource conditions, then commits modification and receipt together. <strong>Replay a stored success before applying a new version/expiry check</strong>, or the original v4→v5 success would incorrectly fail its own replay. Epoch/CAS fences local outcome writers; backend keys/conditions protect effects.''') + code('effect') + bi(
'''两库窗口①：dispatch intent 已提交、进程还没发就崩溃；本库无法区分“没发”和“发了没收到”。窗口②：业务已提交、回包或本地结果写入失败；都保持 UNKNOWN + intent，先查原目的端回执。<strong>查不到也不证明没有副作用</strong>，旧请求可能仍在路上。只有证据可修终态；无查询/原子幂等能力的后端停自动重发，接受降低完成率。
同 key 重放可能首次执行原本没送达的动作，因此仍需当前授权、原批准未过期/未取消和下游防重保留期；本例 5 分钟 grant 比 24 小时防重窗口更早关门，此后只查询。已发旧请求可能继续，TTL 或租约不能解除 UNKNOWN。响应正文到期可压缩，但 key+绑定+已知结果/未决标记保留为墓碑；若将整个唯一记录删掉，同 key 可能再执行。
第三方契约逐项适配。<strong>Stripe API v1</strong> 保存首次执行结果（包括 500），至少 24 小时后允许清理，已清理键再用成为新请求；参数变更会报错。该文档的 API v2 语义不同，不能推广为全部 Stripe 或全部工具的保证。<a href="#ref-9">[9]</a> 如果业务事务外还发邮件/支付，出现第三个边界，必须继续用下游防重/查证或 outbox；这里的事务只证明工单行和本库回执。''',
'''Window 1: dispatch intent commits, then the process crashes before sending; locally this is indistinguishable from a sent call without evidence. Window 2: Business DB commits, but reply/local result persistence fails. Keep UNKNOWN plus intent and query the original backend. <strong>No receipt is not proof of no effect</strong>: an old request may still arrive. Without lookup/atomic deduplication, stop automatic redispatch and accept incomplete work.
Same-key replay can execute an originally undelivered action. It still needs live authority, unexpired/uncancelled approval and verified backend retention. This example’s five-minute grant closes earlier than its 24-hour dedupe window; afterward only query. Issued requests may continue. Retain key/binding/outcome or unresolved tombstones when compacting bodies; deleting the whole unique record can reauthorize an old action.
Adapt each provider separately. <strong>Stripe API v1</strong> retains the initial executed result including 500, allows pruning after at least 24 hours, treats reused pruned keys as new requests and rejects changed parameters. The page distinguishes API v2; do not generalize v1 to all Stripe APIs/tools. <a href="#ref-9">[9]</a> Email/payment outside this database adds another boundary needing downstream evidence/deduplication or outbox. This transaction proves only the ticket row and its local receipt.''')))

parts.append(section('6 · 期限、取消与审计：限制工作，保留证据', '6 · Deadlines, cancellation and audit: bound work, preserve evidence', decks[5] + bi(
'''<strong>获批后一次执行预算共 8 秒（等批另计）、最多两次 attempt，所有 SDK 共用计数。</strong> 只有业务安全、错误可重试、剩余预算足够才补一次；schema、授权、拒批和前置条件失败不能换凭据/工具绕过。HTTP 方法不代替业务语义：MCP 读调用也是 POST。非幂等自动重试需要已知幂等或原请求未应用的证据。<a href="#ref-7">[7]</a>
MCP 2025-11-25 普通请求用 notifications/cancelled；接收方可因已完成/不可取消等忽略，task-augmented 请求必须走 tasks/cancel。<a href="#ref-4">[4]</a> 取消可结束本地等待和缓冲，<strong>不能立即归还仍可能活跃的远端工作额度</strong>。64 槽若只数客户端等待，反复超时会把远端并发放大；须保留未决远端占用直到可验证终止，或由后端硬准入/最大执行期限封顶。取消通知不是终止回执。
审计记录身份、intent/attempt、工具与策略版本、批准者、脱敏摘要和业务回执。不要记录原始凭据、私有全文或 grant token；普通低熵摘要可被猜测，不能把 hash 当保密或完整性保护。关联标识使用访问受控的随机ID，保留最少字段。状态与 outbox event 同本库事务，relay 写 archive 获确认再推进 checkpoint；崩溃可能重复，archive 按 event_id 去重。<a href="#ref-10">[10]</a> 积压将满先拒新准入，预留 UNKNOWN 查证和终态写入空间。''',
'''<strong>After approval, one execution has an eight-second budget (approval wait is separate) and at most two attempts shared by every SDK.</strong> Retry only with safe semantics, retryable errors and sufficient remaining time. Never bypass schema/access/approval/precondition denials with another credential/tool. MCP reads also use POST; non-idempotent retries need known idempotency or evidence that the original was not applied. <a href="#ref-7">[7]</a>
Pinned MCP uses notifications/cancelled for ordinary requests; receivers may ignore completed/uncancellable work. Task-augmented requests require tasks/cancel. <a href="#ref-4">[4]</a> Cancellation may release local waiting/buffers, <strong>not a remote work credit that may still be active</strong>. Counting only local waiters under 64 slots permits timeout-driven remote overload. Retain unresolved remote occupancy until verified termination, or enforce a backend cap/bounded execution contract. A cancellation notification is not a termination receipt.
Audit identities, intent/attempt, tool/policy revisions, approver, redacted summaries and receipts. Never log credentials/private text/grant tokens. Low-entropy hashes can be guessed; hashing alone provides neither confidentiality nor authenticity. Use access-controlled random correlation IDs and minimal fields. Commit state/outbox together; export to archive, await acknowledgment, then checkpoint. Replay can duplicate events, so deduplicate IDs. <a href="#ref-10">[10]</a> Reserve reconciliation/outcome storage before rejecting new admission on backlog pressure.''') + '<details><summary><span class="lang-zh">展开容量复算与实现验证边界</span><span class="lang-en">Expand capacity arithmetic and validation limits</span></summary>' + bi(
'''A1–A3：20×3=60 逻辑调用/s；稳定区间均值 60×0.3=18 在途，10% 各多一次安全重试后为 66/s、19.8 在途。最多两次只给一批 N 个逻辑动作的 ≤2N 总调用数；不能因此宣称任意 1 秒硬上界 120/s，重试和原请求可能跨秒聚集。64 槽是准入上限而非 p99 容量证明，按工具与幸存实例预算。
A4–A7：3.5+0.2+3.5+0.8=8 秒；60×20%×30=360 稳态待批，堆积时改看最老年龄/增长率。2,000×60×86,400=10,368,000,000 B=10.368 GB≈9.656 GiB，是全天峰值场景；7天两份145.152 GB、30天两份622.08 GB各自占空间，索引/WAL/额外重试另计。64×64 KiB=4 MiB 只算同时保留的结果载荷，连接/解析等内存另算。
<a href="../examples/ch33/README.md">示例与运行说明</a>提供三份同源伪代码和 Python3 标准库双 SQLite 适配。实际运行多连接并发、数据库触发器故障、提交间丢交付/丢回包、过期/取消/墓碑等轨迹。SQLite BEGIN IMMEDIATE 比生产行锁粗，身份/审批会话、时钟和认证 Adapter 为可信注入前提；没有实现签名/MCP客户端/真实远端工具、复制、取消终止证明或生产压测。<a href="#ref-11">[11]</a>''',
'''A1–A3: 20×3=60 logical calls/s; steady mean concurrency is 60×0.3=18. One safe retry on 10% gives 66/s and 19.8. Two attempts bound total calls for a cohort of N actions by 2N; they do not enforce a 120/s cap in every second because retries can cluster across boundaries. Validate per-tool and survivor capacity; 64 slots do not prove p99.
A4–A7: 3.5+0.2+3.5+0.8=8 seconds; 60×20%×30=360 steady pending, with age/growth used under accumulation. 2,000×60×86,400=10.368 decimal GB≈9.656 GiB for an all-day peak. Seven hot days/two copies need 145.152 GB and thirty archive days/two copies 622.08 GB separately, excluding indexes/WAL/extra retries. 64×64 KiB=4 MiB covers result payloads only.
<a href="../examples/ch33/README.md">Sources and run instructions</a> provide three synchronized pseudocode contracts and a standard-library Python two-file SQLite adapter. Actual multi-connection/SQL-trigger fault cases exercise commit gaps, lost replies, expiry, cancellation and tombstones. SQLite locks are coarser than production row locks. Identity/session/clock/authenticated Adapter are fixture premises; no signature issuer, MCP client, live tool, replication, remote-termination proof or production load test is implemented. <a href="#ref-11">[11]</a>''') + '</details>'))

parts.append(section('复盘：沿一条路径讲清两个窗口', 'Recap: one path, two uncertainty windows', bi(
'''从 Runtime → Tool GW → Adapter → Tool API 走完整回程，指出 Registry 定版、Execution DB 持久决定、Business DB 原子副作用。窗口一是批准 v4 后资源变 v5，靠业务事务前置条件拒绝；窗口二是业务提交后回包丢失，靠原 key 回执恢复 UNKNOWN。不能把“唯一键”“审批通过”“取消成功发出”说成远端只执行一次或确定没写。
工具说明、目录过滤、schema、授权、审批与幂等各解决不同问题。低风险自动化可用明确的机器预授权与额度；本章选逐笔写审批来讲边界。多步对话暂停/恢复在 Ch34 延续同一 intent，不能因 Agent 重启把未决动作重做。''',
'''Walk Runtime → Tool GW → Adapter → Tool API and every return. Registry pins contracts, Execution DB persists decisions, Business DB commits effects. Window one: approved v4 becomes v5, rejected by the backend transaction condition. Window two: effect commits but reply is lost, repaired from the original keyed receipt. A unique key, approval or sent cancel notification alone proves neither one remote execution nor no effect.
Descriptions, catalog filtering, schema, access, approval and idempotency solve separate problems. Explicit machine grants/limits can support low-risk automation; this lesson uses per-action write approval. Ch34 resumes multi-step work with the same intent, preserving unresolved actions across restarts.''')))

references = re.search(r'<ol class="references">.*?</ol>', source, re.S)[0]
references = references.replace('checked 2026-10-07', 'checked 2026-10-24')
references = references.replace('API reference; checked 2026-10-24.', 'API v1 reference; checked 2026-10-24.')
references = references.replace('<em>Tools</em></a>, specification 2025-11-25.', '<em>Tools</em></a> / <a href="https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle">Lifecycle</a>, specification 2025-11-25.')
references = references.replace('找到至少 24 小时、清理后新请求、参数比较与包括 500 的重放；不推广到所有工具。', '仅API v1：至少24小时、清理后新请求、参数比较和500重放；该页另列v2，不能混用。')
references = references.replace('Verified at least 24-hour retention, pruned-key reuse, parameter comparison and 500 replay; not universal.', 'API v1 only: retention, pruned-key reuse, parameter checks and 500 replay; API v2 differs.')
references = references.replace('</ol>', '<li id="ref-11">[11] SQLite, <a href="https://www.sqlite.org/lang_transaction.html">Transaction</a>, documentation, checked 2026-10-24. <span class="lang-zh">单库写事务与BEGIN IMMEDIATE；实际运行版本见代码报告，不把两文件当一个事务。</span><span class="lang-en">Single-database writes and BEGIN IMMEDIATE; runtime version is recorded, and two files remain separate transactions.</span></li></ol>')
parts.append(section('来源：固定协议修订，区分规范与本题策略', 'Sources: pin revisions, separate standards from policy', bi(
'''本轮于2026-10-24重新核验下列一手来源。MCP只使用2025-11-25固定修订；批准格式、5分钟/24小时、状态机、容量与墓碑策略是本题设计，不是协议内置保证。''',
'''Primary sources were rechecked on 2026-10-24. MCP facts use fixed revision 2025-11-25; grant format, five minutes/24 hours, states, capacity and tombstones are this design, not built-in protocol guarantees.''') + references))

cards = [
('schema通过为什么还要鉴权？','Why authorize after schema?', '合法ticket_id也能指向别的租户；检查用户∩Agent∩工具权限，业务端再验。','A valid ID can target another tenant; intersect user/agent/tool authority and recheck at the backend.'),
('grant绑定什么？','What does a grant bind?', 'tenant、actor、Agent、intent、工具名/版本、目的端、规范参数、资源ID/version、policy、期限和单次标识。','Tenant, actor, agent, intent, tool/revision, route, canonical arguments, resource ID/version, policy, expiry and grant identity.'),
('批准后能直接发网络吗？','Can approval directly send the request?', '先批准事务，再执行前复查与dispatch intent事务；网络不在任何本库原子边界内。','Approval commits first; recheck and commit dispatch intent separately. Network effects are outside both local transactions.'),
('v4批准后变v5怎么办？','Approved v4 became v5?', '业务端条件修改与回执同事务，拒绝后重新审查；多读一次不能消竞争。','Backend condition/effect/receipt commit together; reject and review anew. A pre-read cannot eliminate the race.'),
('JSON-RPC id能当intent吗？','Can JSON-RPC IDs serve as intents?', '不能；报文、协议会话、对话和业务动作分别标识。可信交互决定是不是同一动作。','No; message, transport session, conversation and business action have distinct identities.'),
('本库唯一键能保证远端只写一次？','Does local uniqueness protect the remote effect?', '不能；远端须把业务key、条件副作用和回执放进同一事务，另发邮件仍有新边界。','No. The backend commits key, conditional effect and receipt together; external email adds another boundary.'),
('同key重放先查什么？','What is checked first on keyed replay?', '先查原回执，再对新工作验资源version；成功把v4改v5不能让原重放误失败。','Read the existing receipt first; apply current version checks only to new effects.'),
('查不到业务回执就能重试吗？','Does a missing receipt permit retry?', '不能证明没写，旧请求可能仍在路上。仅授权/期限/保留契约允许时同key重放，否则UNKNOWN。','Absence cannot exclude delayed work. Replay only under live authority, approval and retention; otherwise keep UNKNOWN.'),
('isError或取消能证明没写吗？','Do isError or cancellation prove no effect?', '不证明。claim后记录取消请求并查证；可靠迟到成功仍要保留。','No. Postclaim cancellation requests require evidence; retain reliable late success.'),
('TTL到了怎么处理UNKNOWN？','How does TTL affect UNKNOWN?', '不放行、不清掉动作身份；压缩正文仍保留key/绑定/未决墓碑，过期批准只允许查证。','Never reopen its identity. Compact bodies while retaining key/binding/unresolved tombstones; expired approval allows lookup only.'),
('64个本地等待槽足以限制远端吗？','Do 64 local waiter slots cap backend work?', '超时后远端可能继续；未决工作保留占用或依赖后端硬准入/执行期限，取消通知不是终止证据。','Remote work may outlive waits. Retain unresolved occupancy or enforce backend limits; cancel is not termination proof.'),
('60调用/s意味着多少在途与审计？','What follows from 60 calls/s?', '0.3秒均值是18；10%各多一次是66/s和19.8。2KB×60×86400=10.368GB是全天峰值假设。','At 0.3 s: 18 active; 10% extra retries yield 66/s and 19.8. 10.368 GB assumes all-day peak baseline audit.'),
]
card_html = '<p class="cite"><span class="lang-zh">点一下翻面，先说明保证在哪个事务生效。</span><span class="lang-en">Flip a card and identify the transaction that establishes its guarantee.</span></p><div class="cards-grid">'
for qzh, qen, azh, aen in cards:
    card_html += f'<button type="button" class="flip"><span class="q"><span class="lang-zh">{qzh}</span><span class="lang-en">{qen}</span></span><span class="a"><span class="lang-zh">{azh}</span><span class="lang-en">{aen}</span></span></button>\n'
card_html += '</div>'
parts.append(section('闪卡', 'Flashcards', card_html))
parts.append(source[source.index('  <p><button type="button" class="read-toggle"'):])
result = '\n'.join(parts)
assert re.findall(r'<title id="([^"]+)"', source) == re.findall(r'<title id="([^"]+)"', result)
assert len(re.findall('<figure class="deck">', result)) == 6
assert len(re.findall('<div class="slide">', result)) == 32
(ROOT / 'chapters/ch33.html').write_text(result)
print('Ch33 rewritten: preserved 6 decks / 32 frames / all IDs; 3 synchronized pseudocode contracts')
