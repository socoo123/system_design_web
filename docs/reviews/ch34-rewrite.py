"""Ch34-only editorial source; preserves the authorized original animation inventory."""
from pathlib import Path
import re
import html

ROOT = Path(__file__).resolve().parents[2]
before = (ROOT/'docs/reviews/ch34-before.html').read_text()
figures = re.findall(r'<figure class="deck">[\s\S]*?</figure>', before)
assert len(figures) == 7


def bi(zh, en):
    return f'<div class="bilingual"><div class="lang-zh">{zh}</div><div class="lang-en">{en}</div></div>'


def title(zh, en, level=2):
    return f'<h{level}><span class="lang-zh">{zh}</span><span class="lang-en">{en}</span></h{level}>'


def section(zh, en, body, cls=''):
    return f'<section{f" class={chr(34)}{cls}{chr(34)}" if cls else ""}>{title(zh,en)}{body}</section>\n'


def code(name, language, kind):
    value = html.escape((ROOT/f'examples/ch34/{name}').read_text().rstrip('\n'), quote=True)
    return f'<pre data-language="{language}" data-kind="{kind}" data-source="{name}"><code>{value}</code></pre>'


def fix_figure(figure, number):
    # Keep node geometry; lift cylinder text away from the bottom curve.
    def lift(m):
        return m[1]+str(float(m[2])-6)+m[3]+str(float(m[4])-6)+m[5]
    figure = re.sub(r'(<ellipse[^>]*class="store"/><text[^>]* y=")([\d.]+)("[^>]*>[\s\S]*?</text><text[^>]* y=")([\d.]+)("[^>]*>[\s\S]*?</text>)', lift, figure)
    if number == 4:
        figure = figure.replace('<text x="806" y="212" class="tiny">commit k9</text>', '<text x="825" y="205" text-anchor="end" class="tiny">commit k9</text>')
        figure = figure.replace('Alternative failure lanes return Tool API to Tool GW to Runtime A after a backend commit but lost result.', 'The red lanes mark a lost result/local timeout after backend commit, not an authenticated failure response proving rollback.')
    if number == 5:
        figure = figure.replace('12 步预算和批准记录不重新生成。', '12 步预算不重置；批准历史保留作审计，A 的 grant 不自动授权 B。')
        figure = figure.replace('The twelve-step budget and approvals are retained.', "The global budget and approval history persist; A's grant does not authorize B.")
    if number == 6:
        figure = figure.replace('<text x="570" y="368" text-anchor="middle" class="tiny">reject stale pause / revision</text>', '<text x="570" y="274" text-anchor="middle" class="tiny">reject stale pause / revision</text>')
        figure = figure.replace('批准绑定 tenant、actor、intent、参数摘要与资源/策略版本', '批准绑定 tenant、actor、Agent、intent、工具/route、参数与资源/策略版本')
        figure = figure.replace('Bind approval to tenant/actor/intent, argument digest and resource/policy revisions', 'Bind tenant/actor/Agent/intent, tool/route, arguments and resource/policy revisions')
        figure = figure.replace('Approval UI reads and approves the exact intent through Tool GW,', 'Approval UI reads the complete tenant/actor/Agent/intent/tool/route/arguments/resource/policy binding through Tool GW,')
    if number == 7:
        figure = figure.replace('Alternative failure lanes return a lost compensation result Tool API to Tool GW to Runtime.', 'Red lanes mark a lost compensation result and local timeout, not proof that Tool API rolled back. Green replies are the alternative successful observation path.')
    return figure


figures = [fix_figure(x, i) for i,x in enumerate(figures,1)]
assumptions = re.search(r'<table>[\s\S]*?</table>',before).group()
assumptions = assumptions.replace('Ch33 原子防重与回执契约覆盖 24 h 重放', 'Ch33 防重/回执保留覆盖 24 h 恢复；UNKNOWN 身份不因到期删除')
assumptions = assumptions.replace('Ch33 atomic dedupe/receipts cover 24-h replay', 'Ch33 dedupe/receipts cover 24-h recovery; retain UNKNOWN identities after expiry')

body = section('本章核心：只从已提交状态推进', 'Core: advance only from committed state', bi(
    '<p class="say">Runtime 负责保存并推进 run，模型只提出候选。三个决定：<strong>接单先持久化、外部输入与动作固定身份、每次推进都验 owner 与版本。</strong> 这样才能在 worker 重启、人工批准和工具超时后知道该继续哪一步。</p><ul><li>先读 Ch32 的模型预算与 Ch33 的工具、批准和副作用契约。</li><li>本章用客服诊断和退款贯穿：未知路径走有界 loop，退款业务边由 workflow 固定。</li><li>取消停止新工作；已发动作先核账，已确认效果才按业务规则补偿。</li></ul>',
    '<p class="say">Runtime persists and advances a run; the model proposes candidates. Three decisions: <strong>persist acceptance, pin external inputs/action identities, and check ownership/version at every transition.</strong> Recovery can then find the correct continuation after crashes, approval waits or tool timeouts.</p><ul><li>Ch32 owns model admission; Ch33 owns tools, approval and effect contracts.</li><li>Support diagnosis uses a bounded loop; refund policy uses fixed workflow edges.</li><li>Cancellation stops new work. Reconcile sent actions before compensating confirmed effects.</li></ul>'), 'goal')

body += section('边界与规模：单地域、串行推进', 'Scope and load: one region, serial progression', bi(
    '<p>用户以 <code>request_key</code> 提交任务，拿到持久 <code>run_id</code> 后轮询状态；连接不承载执行寿命。假设一个权威关系库、每 run 一个有效 owner、工具串行。先问路径是否固定、哪些工具会写、批准覆盖什么、是否需隔夜恢复、下游能否查回执，以及取消后必须停到哪里。</p><p>工作流与 Agent 的区别在于谁选路径；一次字段抽取不必上图引擎。<a href="#ref-1">[1]</a> 20 run/s、每 run 平均 5 次模型和 3 次工具是教学假设，得到 100 逻辑 model/s、60 tool/s；平均约 221 活跃和 1,800 待批，分池管理。</p>',
    '<p>A user submits a request_key and polls a durable run_id; connection lifetime is independent of execution. Assume one authoritative relational database, one valid owner per run and serial tools. Clarify path control, writing tools, approval scope, overnight recovery, receipt lookup and the required cancellation boundary.</p><p>Workflows and agents differ in who selects the path; extraction may need only one call. <a href="#ref-1">[1]</a> Teaching assumptions of 20 runs/s, five model calls and three tools/run give 100 logical model/s and 60 tool/s. About 221 active and 1,800 parked runs belong in separate pools.</p>') + '<details><summary><span class="lang-zh">展开 A1–A12：预算、租约、留存与等待假设</span><span class="lang-en">A1–A12: budgets, leases, retention and waiting assumptions</span></summary>'+assumptions+'</details>')

body += section('持久接单与领取：202 承诺什么', 'Durable admission and claim: what 202 promises', figures[0]+bi(
    '<p><strong>图1的权威是 Run Store。</strong> Run API 在一个事务里写 <code>(tenant,request_key)→run_id</code>、可信 actor、请求摘要、READY 和 outbox；同键换主体或内容要冲突。提交确认后才回 202；回包丢失就查原 run。wake 只是提醒，READY 每 5 秒分页扫描补丢，条件领取消化重复提醒。<a href="#ref-6">[6]</a><a href="#ref-8">[8]</a></p><p>下面 SQL 在可执行 SQLite 适配中逐字运行：先拿写事务锁，再由数据库采样时间。只有拿到返回行并确认 COMMIT 才能出发；0 行表示未获权。<a href="#ref-12">[12]</a> 旧 owner 超时后接管仍保留动作/预算，过期或取消 run 只许核账，不许发新业务。</p>',
    '<p><strong>Run Store is the authority in deck 1.</strong> One transaction writes tenant/request-key mapping, trusted actor, request digest, READY and outbox; changed identity/content conflicts. A confirmed commit precedes 202; lost replies read the original run. Wakeups are hints; five-second paged scans repair loss and conditional claims absorb duplicates. <a href="#ref-6">[6]</a><a href="#ref-8">[8]</a></p><p>The executable SQLite adapter runs this SQL verbatim after acquiring its writer transaction; time comes from the database. Only a returned row plus confirmed COMMIT permits work. Zero rows means no ownership. <a href="#ref-12">[12]</a> Takeover preserves actions/budgets; expired or cancelled runs may reconcile but cannot start new business.</p>')+code('claim.sql','SQL · SQLite adapter','teaching')+bi(
    '<p>这是一库条件更新，不能把 SELECT 后的无条件 UPDATE 当 CAS；生产行锁同样要检查影响行数。<a href="#ref-7">[7]</a> 后续每次结果提交复查 epoch、version、role_revision、租约与状态。Run Store 写不可用就停止新调用；异步副本只可显示标明陈旧的进度，不能批准、领取或决定 DONE。</p>',
    '<p>This is a single-database conditional update. A SELECT followed by an unconditional UPDATE is not CAS; inspect affected rows with production row locks too. <a href="#ref-7">[7]</a> Outcome commits recheck epoch, version, role revision, lease and status. Stop new calls if authority cannot be written. A stale replica may display labelled progress, never decide claim, approval or DONE.</p>'))

body += section('有界 step：固定输入，提交输出后才继续', 'Bounded steps: pin input, commit output, then continue', figures[1]+bi(
    '<p><strong>模型 step 是逻辑调用，attempt 是物理请求。</strong> 前置事务占一次 step 并固定模型/工具/workflow revision、授权后的消息投影、检索结果、记录的时间与随机值；再次恢复读取相同输入。已提交输出直接复用，不能为“回放”再问一次模型；尚未保存的输出可以重求且可能改变，但要另记费用，只让一个有效 CAS 结果固定动作。</p><p>代码对应图2预算门和 Commit。输出 schema、合法 workflow 边与 tool_call 数先验；稳定 business intent 来自可信业务交互，不由模型 call_id 或参数 hash 重新定义。外部请求在两个本库事务之间，不能套一个 transaction 把网络原子化。</p>',
    '<p><strong>A model step is logical; an attempt is physical.</strong> Admission reserves one step and pins model/tool/workflow revisions, authorized messages, retrieved evidence and recorded time/random values. Recovery reads the same input. Reuse committed output; missing output may be regenerated and differ, but charge the attempt and let only a valid CAS winner pin actions.</p><p>This contract covers deck 2’s budget gate and Commit. Validate output schema, legal workflow edges and call count. Trusted business interaction defines intent; model call IDs or argument hashes do not. External requests sit between two local transactions; no transaction makes the network atomic.</p>')+code('step.pseudo','Pseudocode · step','pseudocode')+bi(
    '<p>12 次模型不能限制一拍多个工具；另设 8 个前向动作、120 秒活跃时间和 60,000 token/费用预算。每个物理 attempt 持久预留已知输入+最大输出，可信 usage 结算；缺 usage 保留占用，暂停/handoff 不清零。Ch32 负责供应商重试，Runtime 不再外套无界重试。ReAct 的行动/观察交织和 AI SDK 的 stopWhen/prepareStep 只是机制参考，不替代持久状态与硬预算，也不要求存私有思考。<a href="#ref-2">[2]</a><a href="#ref-5">[5]</a></p><p>同工具、规范参数及业务 revision 连续 3 次且无进展，只是 stuck 启发式；有版本进展的轮询应继续。STOPPED 留原因和未清义务。下面的已存输出复用是<strong>本设计契约</strong>：LangGraph 从旧 checkpoint 显式 replay 会重跑之后的 LLM/API/interrupt；sync/async/exit 的落盘时机也不同，不能把所有“checkpoint”视作本章同样保证。<a href="#ref-11">[11]</a></p>',
    '<p>Twelve model steps cannot cap a multi-tool response; separately bound eight forward actions, 120 active seconds and 60,000 tokens/cost. Persist reservations per physical attempt and settle trusted usage; missing usage retains the hold. Pause/handoff never resets budgets. Ch32 owns supplier retries. ReAct and AI SDK stopWhen/prepareStep illustrate control, not durability or hard admission, and do not require private reasoning storage. <a href="#ref-2">[2]</a><a href="#ref-5">[5]</a></p><p>Three repeated tool/argument/business-revision fingerprints without progress are only a stuck heuristic; versioned polling may progress. STOPPED retains reasons/obligations. Stored-output reuse is <strong>this design’s contract</strong>: explicit LangGraph replay from an older checkpoint re-executes later LLM/API/interrupt calls, and sync/async/exit persist at different times. <a href="#ref-11">[11]</a></p>'))

body += section('已知 workflow：代码决定业务边', 'Known workflows: code owns business edges', figures[2]+bi(
    '<p><strong>退款资格→具体动作审批→退款回执→通知，不能由模型跳边。</strong> 模型只在 Eligibility 内抽字段；代码验证证据、当前节点、workflow_revision 和 owner 后持久转换。Refund UNKNOWN 留在核账，不能发“退款成功”；退款已成功而邮件失败只进通知 REPAIR，不机械撤销退款。</p><p>新 run 固定新流程 revision，旧 run 保留旧版本或显式迁移。迁移先暂停、验证历史证据和批准是否仍适用，再提交新状态；只改 prompt 不能越过资格/审批。路径未定的诊断才交有界 loop，固定审查的路径用 workflow，代价是维护版本和合法边。<a href="#ref-1">[1]</a></p>',
    '<p><strong>Eligibility → exact-action approval → refund receipt → notification are code-owned edges.</strong> The model extracts fields within Eligibility. Code validates evidence, node, workflow revision and owner before persisting a transition. UNKNOWN refund stays in reconciliation; failed email after successful refund repairs notification only.</p><p>New runs pin new revisions; old runs retain their revision or migrate explicitly after parking and validating prior evidence/approval. Prompt edits cannot bypass policy. Open diagnosis suits a bounded loop; mandatory review suits workflow at the cost of revision/edge maintenance. <a href="#ref-1">[1]</a></p>'))

body += section('恢复：checkpoint 与远端效果是两份账', 'Recovery: checkpoint and remote effects are separate records', figures[3]+bi(
    '<p><strong>图4最关键的窗口：Business DB 已提交 k9，Run Store 仍 pending。</strong> 接管者先读原动作的 key、完整 binding 和参数，再向 Ch33 查权威回执；确认成功才补一次 observation。查不到回执也可能是旧请求仍在途，不能据此认定没执行。只有防重契约仍有效时，才允许有界同 key 重放；否则 UNKNOWN→NEEDS_REVIEW，不能换 key、route 或让模型重造动作。</p><p>Run 保存状态、节点/角色版本、owner/epoch/lease/version 和全局预算；Step 保存固定输入与输出；Action 保存 intent、工具/目的端、参数/资源/policy revision、状态及回执。结果、消息索引、checkpoint 末序号和后续事件同库事务；唯一 observation 防本地重复推进。大文本用已确认可读的不可变对象引用，恢复以快照+连续增量重建，缺序号就停。checkpoint 与跨线程 store 是不同存储职责。<a href="#ref-3">[3]</a></p>',
    '<p><strong>Deck 4’s critical gap: Business DB committed k9 while Run Store remains pending.</strong> A new owner reads the original key, full binding and arguments, then queries Ch33 receipts. Confirm success before inserting one observation. Absence may mean an old request is still in flight. Bounded same-key replay requires a still-valid dedupe contract; otherwise retain UNKNOWN/NEEDS_REVIEW, never change key/route or regenerate the action.</p><p>Run holds state, node/role revisions, ownership and budgets; Step pins input/output; Action holds intent, tool/route/arguments/resource/policy revisions, status and receipt. Commit outcome, message index, checkpoint sequence and next event in one database transaction. Unique observations prevent duplicate progression. Large content uses acknowledged immutable objects; snapshot-plus-deltas recovery stops at gaps. Thread checkpoints and cross-thread stores have different roles. <a href="#ref-3">[3]</a></p>')+code('recover.pseudo','Pseudocode · recovery','pseudocode')+bi(
    '<p>图中 epoch 7 的 A 不能在 epoch 8 后推进本库，B 仍使用 k9，步数不重置。<strong>本库 fence 挡不住已发的远端包。</strong> 远端必须原子检查原 key/完整 binding、业务条件并保存效果+回执；若采用 epoch fence，也要在受保护资源内验证。<a href="#ref-10">[10]</a> 尚未发出的 intent 可到期拒绝；UNKNOWN 到期仍保留身份和核查义务，禁止因 TTL 删除而重新写。</p>',
    '<p>Epoch 7 cannot advance local state after epoch 8; B keeps k9 and budgets. <strong>Local fencing cannot stop an already-sent packet.</strong> The backend must atomically check key/binding and business conditions and store effect plus receipt; any epoch fence must be enforced by the protected resource. <a href="#ref-10">[10]</a> Expired undispatched intents may be denied. Expired UNKNOWN retains identity and reconciliation obligations; TTL deletion never authorizes a new write.</p>'))

body += section('Handoff：更换角色，保留 run 与义务', 'Handoff: change role, retain run and obligations', figures[4]+bi(
    '<p><strong>先提交控制权，再启动 B。</strong> 在 owner 事务里检查允许的角色转换，解决或显式继承未清动作，同事务更新 current_agent、role_revision 和下一节点。run_id、总预算与副作用账本保留；旧 A 的迟到输出因 epoch/role_revision 不符而拒绝。批准记录可保留作审计，但绑定 A 的 grant 不自动授权 B；写动作换 Agent 必须经 Ch33 重新校验或重新审批。</p><p>B 获得先按权限过滤、再摘要的历史投影；tool_call/result 成对保留。摘要带覆盖序号与来源，不能当权限或成功回执。专科作为工具只返回有界只读结果，当前负责人仍答用户；稳定 subtask_id、deadline 与费用归父 run。只有真实指令/权限分叉才多角色，避免增加无意义调用。</p>',
    '<p><strong>Commit control transfer before starting B.</strong> Under the owner transaction, validate the role edge, resolve or explicitly inherit pending actions, and update current_agent, role revision and next node together. Retain run ID, budgets and effect ledger; reject late A outputs by epoch/role revision. Keep approval records for audit, but an A-bound grant does not authorize B; Ch33 must revalidate or obtain new approval.</p><p>Filter history by authorization before summarizing; keep tool call/result pairs. A summary has covered sequence/source references, never authority or receipt status. A specialist-as-tool returns bounded read-only results while the current role answers; subtask identity/deadline/cost remain with the parent run. Add roles only for real instruction or permission differences.</p>'))

body += section('暂停与批准：决定可早到，恢复只赢一次', 'Pause and approval: decisions may arrive early, resume wins once', figures[5]+bi(
    '<p><strong>PENDING 不是成功，批准也不是已执行。</strong> 先提交 pause_id、approval_id、精确 action binding、checkpoint、WAIT_APPROVAL 与 owner 释放，确认后才归还活跃槽。批准可能先于暂停，所以提交暂停后立即重读 Ch33 决定，并扫描等待行；webhook 只加速，不能是唯一唤醒证据。通知重复由唯一 decision_id 和同一状态/version 的 CAS 消化。</p><p>审批绑定 tenant、actor、Agent、intent、工具/revision、route、规范参数、资源 ID/version、policy 与期限；UI 显示可读动作。金额/资源/主体变化必须新 revision。Resume API 读取权威决定，拒绝客户端自报 approved=true；READY 后 worker 仍需领取，Ch33 执行门复查当前权限、资源和 grant。grant 从批准时起 5 分钟，排队过期就重审。</p>',
    '<p><strong>PENDING is not success; approval is not execution.</strong> Commit pause/approval IDs, exact binding, checkpoint, WAIT_APPROVAL and released ownership before returning the active slot. Approval can beat parking: reread Ch33 after parking and scan waiting rows. Webhooks accelerate recovery. Unique decision IDs and state/version CAS absorb duplicate notifications.</p><p>Bind tenant, actor, agent, intent, tool/revision, route, canonical arguments, resource ID/version, policy and expiry; show readable actions. Changes require a new revision. Resume API reads authoritative decisions rather than caller-supplied approved=true. READY still requires claim and Ch33’s execution-time recheck. Five-minute grants begin at approval; expiry while queued requires review.</p>')+code('resume.pseudo','Pseudocode · resume','pseudocode')+bi(
    '<p>取消和恢复争同一状态/version：取消先赢，迟到批准只留审计；恢复先赢但尚未 dispatch，取消仍能挡下一道门。已持久 dispatch 后取消是尽力终止，不能宣称远端无效果。LangGraph interrupt 的节点恢复会从头执行，interrupt 之前的代码可能重跑，因此暂停不是进程栈停在某行的保证。<a href="#ref-4">[4]</a></p><p>6 次暂停/s×300 秒=1,800 个平均待批 run，占持久记录和查询能力，不占 320 活跃槽。审批跟不上时平均值失效，应限制租户待批数并观察最老年龄与到达减处理率。</p>',
    '<p>Cancel/resume contend on the same state/version. A winning cancel makes late approval audit-only; cancellation after resume but before dispatch can still win the next gate. After durable dispatch, termination is best effort and remote effects remain possible. LangGraph resumes interrupt nodes from the beginning, so earlier code may rerun; a pause is not a suspended process stack. <a href="#ref-4">[4]</a></p><p>Six pauses/s × 300 seconds gives 1,800 mean parked runs using storage/query capacity rather than 320 active slots. If review falls behind, bound tenant backlog and monitor oldest age and arrival-minus-completion rate.</p>'))

body += section('取消与补偿：先查发生了什么，再决定怎么修', 'Cancel and compensate: establish effects before repairing', figures[6]+bi(
    '<p><strong>取消只禁止新的前向动作，迟到成功仍须入账。</strong> 未发出的拒绝可结束；已经发出的未知动作先查原回执。不能猜测“可能扣款”就退款，也不能猜测“可能没扣”就再扣。确认效果进入 ledger，保存原交易、undo 工具、当前条件、依赖和进度。图7例子的依赖是 refund c2→release c1；邮件失败只修通知，顺序取决于业务，不是通用逆序栈。<a href="#ref-9">[9]</a></p><p>补偿是新的业务动作：不同于 forward key，但稳定关联原效果，经同样 Ch33 权限/审批/回执契约。每个补偿最多 2 次已分类安全 attempt；UNKNOWN c2 阻塞 c1，只查原 key。预算耗尽或 run 到期不删除义务，转独立恢复任务；8 项已确认效果各最多 2 次是最多 16 次总调用的教学界限，不能当每秒速率上限。</p><p>撤销要按当前状态和可退额度做条件动作，不能用旧快照覆盖他人的修改。补偿也会失败；不安全重放或无法确认就持久 NEEDS_REVIEW、case_key 与 outbox。人工系统按原 case_key 防重，拿到持久回执才推进 relay 游标，期间义务仍在。全部撤销为 COMPENSATED，原用户目标仍未成功，不能记 DONE。</p>',
    '<p><strong>Cancellation blocks new forward work; record late success.</strong> Undispatched denial may finish, but sent uncertain actions first query original receipts. Never refund speculation or charge again on guessed failure. Confirmed effects enter a ledger with original transaction, undo tool, conditions, dependencies and progress. Deck 7 requires refund c2 before release c1; failed email repairs notification. Order is business-specific. <a href="#ref-9">[9]</a></p><p>Compensation is a new business action with a distinct stable key linked to the original effect, subject to Ch33 authorization/approval/receipts. Each has at most two classified safe attempts; UNKNOWN c2 blocks c1. Exhausted forward budgets or expiry transfer obligations to durable recovery. Eight effects times two attempts bounds sixteen total calls, not calls/second.</p><p>Use current state/refundable balance; never overwrite concurrent changes from an old snapshot. Unsafe replay or unknown results retain NEEDS_REVIEW, stable case key and outbox. Deduplicated case receipt precedes relay cursor acknowledgment. Fully undone work is COMPENSATED, not successful DONE.</p>'))

capacity = re.search(r'<h2><span class="lang-zh">容量：[\s\S]*?</section>',before).group()
capacity = re.sub(r'^<h2>[\s\S]*?</h2>','',capacity).removesuffix('</section>')
capacity = capacity.replace('直接复用。[5]', '直接复用。').replace('traffic budgets [5]', 'traffic budgets')
capacity = capacity.replace('旧文只算 10 秒与 200 个，漏了工具和 checkpoint；','').replace('The old ten-second/200-run estimate omitted tools/checkpoints. ','')
body += section('容量与实现验证', 'Capacity and implementation validation', bi(
    '<p><strong>正常热路径 11.06 秒，平均活跃 221.2；模型多一次 attempt 的成本要另算。</strong> 同一稳定边界用到达率×平均驻留时间；320 槽是保护上限，不能用均值证明 p99。</p>',
    '<p><strong>Normal service time is 11.06 seconds and mean active concurrency 221.2; extra model attempts add work.</strong> Use arrival rate × mean residence time at the same stable boundary. A 320-slot protection limit is not a p99 proof.</p>')+'<details><summary><span class="lang-zh">展开流量、并发与增量存储复算</span><span class="lang-en">Traffic, concurrency and incremental-storage calculations</span></summary>'+capacity+'</details>'+bi(
    '<p>本页 4 段代码从 <a href="../examples/ch34/README.md">examples/ch34</a> 逐字同步；伪代码不是 Java。可执行适配用 Python 标准库和两个 SQLite 文件，实际运行多连接领取、旧 epoch 拒绝、输入固定/输出复用、审批早到与取消竞争、两库失包、补偿未知和事务回滚。它检验教学契约，不证明分布式复制、真实供应商或生产负载可靠。</p>',
    '<p>The four snippets match <a href="../examples/ch34/README.md">examples/ch34</a> exactly; pseudocode is not Java. A Python-standard-library adapter uses two SQLite databases to exercise concurrent claims, stale owners, pinned input/output reuse, early approval/cancellation races, lost outcomes, unknown compensation and rollback. These are contract checks, not proof of distributed replication, live suppliers or production reliability.</p>'))

body += section('面试复盘：沿一条链，指出一个崩溃点', 'Interview recap: one path and one crash point', bi(
    '<p>“先持久接单，领取 owner，预算门放行固定输入的模型 step，输出与精确动作提交后再调工具；回执写 observation 和 checkpoint。等待批准释放槽，按权威决定与 CAS 恢复。扣款后丢回包则保留 k9，接管者查回执而不是重跑对话；旧 owner 不推进，取消后照样核账，补偿或人工义务不丢。”</p>',
    '<p>“Persist admission, claim ownership and reserve a pinned-input model step. Commit output/exact actions before tools, then receipt/observation/checkpoint. Park approval without a slot and resume via authoritative decision plus CAS. If a charge reply is lost, keep k9 and query receipts instead of replaying conversation. Reject stale progression, reconcile after cancellation and preserve recovery obligations.”</p>'))

references = re.search(r'<ol class="references">[\s\S]*?</ol>',before).group()
references = references.replace('2026-10-07','2026-10-24').replace('https://www.anthropic.com/engineering/building-effective-agents','https://www.anthropic.com/research/building-effective-agents')
references = references.replace('checkpoint 与跨线程 store 的边界，内存 saver 重启丢失', '线程 checkpoint 与跨线程 store 的边界').replace('Checkpoint/store distinction and volatile savers','Thread checkpoint/store distinction')
references = references.replace('</ol>','<li id="ref-11">[11] LangChain, <a href="https://docs.langchain.com/oss/python/langgraph/checkpointers"><em>LangGraph — Checkpointers: Replay / Durability modes</em></a>, accessed 2026-10-24. <span class="lang-zh">旧 checkpoint 后节点重跑；sync/async/exit 落盘差异。</span><span class="lang-en">Replay after a prior checkpoint and sync/async/exit persistence boundaries.</span></li></ol>')
references = references.replace('</ol>', '<li id="ref-12">[12] SQLite, <a href="https://www.sqlite.org/lang_transaction.html">Transactions</a>, <a href="https://www.sqlite.org/lang_returning.html">RETURNING</a>, <a href="https://www.sqlite.org/releaselog/3_38_0.html">3.38.0 release</a>, accessed 2026-10-24. <span class="lang-zh">单写事务、返回行不等于提交；示例最低3.38。</span><span class="lang-en">Single writer, returned rows versus commit; adapter needs 3.38+.</span></li></ol>')
body += section('一手来源与延伸', 'Primary sources and follow-ups', bi(
    '<p>按 2026-10-24 重新访问官方文档/论文；A1–A12 均为教学假设。LangGraph/AI SDK 仅引用机制，不把当前默认值当通用 SLA。未做真实云服务调用、故障注入或负载压测。</p>',
    '<p>Official documents/papers were rechecked on 2026-10-24. A1–A12 are teaching assumptions; LangGraph/AI SDK illustrate mechanisms, not universal defaults or SLAs. No live cloud calls, infrastructure fault injection or load benchmark.</p>')+references+'<p class="cite"><a href="ch25.html">Ch25</a> · <a href="ch32.html">Ch32</a> · <a href="ch33.html">Ch33</a> · <a href="ch35.html">Ch35</a></p>')

cards = re.search(r'<div class="cards-grid">[\s\S]*?</div></section>',before).group().removesuffix('</section>')
cards = cards.replace('不清；同 run、同预算、同账本，角色 revision 原子推进并过滤历史。', '不清；同run/预算/账本，角色revision防旧输出；A的grant不自动给B。').replace('No; retain run/budgets/ledger, atomically change role revision and project context.', 'No; retain run/budgets/ledger and fence old roles. An A-bound grant does not authorize B.')
newcard = '<button type="button" class="flip"><span class="q"><span class="lang-zh">恢复要重新调用所有模型吗？</span><span class="lang-en">Does recovery rerun every model call?</span></span><span class="a"><span class="lang-zh">本设计复用已提交输出；未保存输出可有界重求，固定输入并另计费用，不能替换已存动作。</span><span class="lang-en">Reuse committed output here. Missing output may retry with pinned input and extra cost, never replace stored actions.</span></span></button>'
cards = cards.replace('</div>',newcard+'</div>')
body += section('闪卡', 'Flashcards', cards)

prefix = before[:before.index('<section')]
suffix = before[before.index('  <p><button type="button" class="read-toggle">'):]
(ROOT/'chapters/ch34.html').write_text(prefix+body+'\n'+suffix)
print('Ch34 rewritten; preserved 7 decks / 37 frames')
