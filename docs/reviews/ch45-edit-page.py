"""One-time authoring transformation. Refuses a page changed since the saved baseline."""
from pathlib import Path
import re

path = Path("chapters/ch45.html")
html = path.read_text()
assert html == Path("docs/reviews/ch43-ch44-ch45-baseline/ch45.html").read_text()
sections = re.findall(r"<section>.*?</section>", html, re.S)


def bi(zh, en):
    return '<div class="bilingual"><div class="lang-zh">' + zh + '</div><div class="lang-en">' + en + '</div></div>'


def p(zh, en):
    return bi('<p>' + zh + '</p>', '<p>' + en + '</p>')


def code(source, language, kind):
    return f'<pre data-language="{language}" data-kind="{kind}" data-source="{source}"><code></code></pre>'


def rewrite(index, body, lead=''):
    old = sections[index]
    heading = re.search(r'<h2>.*?</h2>', old, re.S).group(0)
    figure = re.search(r'<figure class="deck">.*?</figure>', old, re.S)
    sections[index] = '<section>' + heading + lead + (figure.group(0) if figure else '') + body + '</section>'


rewrite(0, p('本章抓住三个决定：<strong>上下文定词义与事实主人，聚合定提交时的不变量，集成合同定跨边界的身份与恢复责任。</strong>沿 o42 的改行、结账、收款和关单，把三者落实到根方法、版本条件与持久事件。',
             'Make three decisions: <strong>contexts own meaning and facts, aggregates protect commit-time invariants, and integration contracts define identity and recovery across boundaries.</strong> Follow o42 through editing, checkout, capture and expiry into methods, version predicates and durable events.'))
rewrite(1, p('“已支付”在哪成立？Pay 证明已捕获的资金，Order 决定是否接纳这笔钱进入履约。根方法先产生合法候选，再由数据库条件提交；收款事实经 Outbox、适配层和 inbox 交给订单。关单先赢就保持 closed 并持久留下退款义务；退款超时记 UNKNOWN，用原身份恢复。',
             'Where does paid hold? Pay proves capture; Order decides whether to accept that money for fulfillment. A root method produces a valid candidate, then a database predicate commits it. Outbox, adapter and inbox carry the fact across contexts. Expiry keeps the order closed and creates durable refund work; timeout leaves UNKNOWN under the original identity.'))

# Keep all numeric assumptions available while the main path remains readable.
old = sections[2]
heading = re.search(r'<h2>.*?</h2>', old, re.S).group(0)
body = old.split('</h2>', 1)[1].rsplit('</section>', 1)[0]
sections[2] = '<section>' + heading + p('主例：USD 整数分，订单总额 8000→10999；编辑 v7→v8，结账冻结为 pending_pay v9。Order/Stock 暂同库，Pay 独立提交。每个 payment_id 只建模一次全额收款；部分或多次捕获必须另加 capture_id 与金额策略。所有吞吐、延迟和留存数字都是教学假设。',
             'Main example: USD minor units, total 8000→10999; edit v7→v8 and freeze checkout as pending_pay v9. Order/Stock initially share a database; Pay commits separately. Each payment_id represents one full capture; partial or multiple captures need capture_id and an amount policy. Throughput, latency and retention values are teaching assumptions.') + '<details><summary><span class="lang-zh">完整假设与容量推导 A1–A12</span><span class="lang-en">Full assumptions and sizing A1–A12</span></summary>' + body + '</details></section>'

rewrite(3, p('Order 的 <code>paid</code> 是接纳履约的决定，Pay 的 <code>captured</code> 是资金事实；<code>reconciled</code> 是后续核账结果。词义、生命周期和决定权共同提示限界上下文，最终由业务专家确认；订单关闭不能销毁支付审计证据。<a href="#ref-1">[1]</a><a href="#ref-4">[4]</a>',
             'Order paid means accepted for fulfillment; Pay captured is a money fact, and reconciled is a later comparison. Language, lifecycle and decision ownership suggest contexts for experts to confirm. Closing an order must preserve payment audit evidence. <a href="#ref-1">[1]</a><a href="#ref-4">[4]</a>') +
    p('D1 中两个 Store 各由所属模块写入，跨线只传 ID、金额和币种。入口还要验证租户与操作权限：<code>order_id</code> 能关联对象，不能授予写权限。托管 URL 只是支付入口；创建超时要查询原尝试，删除订单不能撤销外部动作。',
      'In D1 each module writes its own Store; IDs, amount and currency cross the boundary. Authenticate tenant and operation authority: order_id correlates an object but grants no access. A hosted URL starts payment; setup timeout requires querying the original attempt. Deleting an order cannot undo remote work.') +
    p('上下文可先实现为同一部署内的模块。只读组合和受控 JOIN 不授予跨模块写权限；按每个类拆服务会把不变量撕过网络。A5 的 20+40+120=180 ms 只是条件阶段预算，余 120 ms，不是 p99 相加的保证。Pay 尾延迟不可控时，可先返回持久订单与可查询的 setup 状态，连同用户合同一起调整。',
      'Contexts can begin as modules in one deployment. Read composition and controlled joins grant no cross-module write authority; per-class services can split an invariant across the network. A5 gives conditional stage budgets of 20+40+120=180 ms, leaving 120 ms, not a summed p99 guarantee. Unbounded Pay setup latency may require a durable order and queryable setup state with a revised user contract.'))

rewrite(4, p('D2 的 Order Root 和 Lines 共同保证<strong>总额等于冻结单价×数量之和，且只有 draft 可编辑</strong>。聚合可以存多张表；所有写者必须经过完整规则。Vernon 用持久版本拒绝旧对象覆盖，外部聚合按身份引用。<a href="#ref-1">[1]</a><a href="#ref-2">[2]</a><a href="#ref-3">[3]</a>',
             'D2 puts Order Root and Lines behind two rules: <strong>total equals the sum of snapshot price×quantity, and only draft is editable.</strong> Several tables may represent the aggregate, but every writer must enforce its rules. Vernon uses persisted versions to reject stale objects and identities for external aggregates. <a href="#ref-1">[1]</a><a href="#ref-2">[2]</a><a href="#ref-3">[3]</a>') +
    '<h3><span class="lang-zh">根方法：先算完整候选，再提交</span><span class="lang-en">Root method: build a valid candidate before commit</span></h3>' +
    p('下面是可运行 Java17 示例的摘录。<code>Money</code> 不可变，绑定币种，用 <code>Math.addExact/multiplyExact</code>；根复制行集合，构造器复核总额与 SKU 唯一性。输入 sku1/3 得到 v8、10999；数量≤0、未知 SKU、冻结状态或溢出都拒绝，原对象不变。完整文件只依赖标准库。',
      'This excerpt comes from a runnable Java17 example using only the standard library. Immutable Money binds currency and uses Math.addExact/multiplyExact; the root copies its lines, and construction checks total and unique SKUs. sku1/3 yields v8 and 10999. Nonpositive quantity, unknown SKU, frozen state or overflow rejects without changing the original.') +
    code('DomainModel.java#edit', 'Java 17', 'teaching') +
    p('候选不是成功回执。A、B 同读 v7，只有一个数据库 <code>WHERE version=7</code> 能胜出；0 行要报告冲突，不能先把候选写到缓存。版本拒绝旧写；k42/hash/result 则恢复“已提交但响应丢失”的同一命令。后续订单已到 v9，重试 k42 仍返回原 v8 回执。<a href="#ref-8">[8]</a>',
      'A candidate is not a successful receipt. If A and B read v7, only one database WHERE version=7 can win. Zero rows means conflict; do not publish a candidate into cache. Version prevents stale writes; k42/hash/result recovers a committed command after a lost response. Even when a later edit reached v9, replaying k42 returns the original v8 receipt. <a href="#ref-8">[8]</a>') +
    code('edit.pseudo', 'Pseudocode', 'pseudocode') +
    p('这里的 BEGIN/COMMIT 是单权威数据库事务，覆盖根、行和命令回执；唯一键是 <code>(tenant,order_id,key)</code>。hash 用带类型、固定字段顺序的规范编码，含命令类型、预期版本与全部业务参数。NULL 是事务内占位，绝不单独提交；同键并发靠数据库唯一约束等待/冲突后读已提交结果。业务失败整笔回滚，提交回执未知时按原键查询。<a href="#ref-8">[8]</a>',
      'BEGIN/COMMIT is one authoritative database transaction over root, lines and command receipt. The unique key is (tenant,order_id,key). Hash a typed canonical encoding containing command type, expected version and all business parameters. NULL is an uncommitted placeholder, never a separate committed state. Concurrent same-key commands rely on the database constraint and read the committed result after conflict. Domain failure rolls back; uncertain commit requires an original-key lookup. <a href="#ref-8">[8]</a>') +
    p('默认按一个聚合解释一笔事务。D3 的同库 Order/Stock 事务是本例有意放宽该原则的工程选择，承担争用与部署耦合；不能归成 DDD 的通用保证。若每条命令都改多个聚合，应先复查边界。Repository 也不能提供绕过根的任意明细写接口。',
      'Explain a transaction through one aggregate by default. D3 deliberately relaxes this principle for a local Order/Stock transaction and accepts contention and deployment coupling; this is an engineering choice, not a universal DDD guarantee. Revisit boundaries when every command touches several aggregates. Repositories must not expose arbitrary line writes that bypass the root.'))

rewrite(5, p('D3 把 v8 冻结成 pending_pay v9，以 k9 取得唯一预占。A6 下 Order/Stock 在同一物理库：根状态、<code>available≥q</code> 的条件扣减、预占和请求结果一起提交。任一 SKU 不足、版本冲突或事务中断就整笔回滚；绿色回程表示提交结果。事务内不调用 PSP，固定多行锁序，已中止事务才可按原身份有界重试。<a href="#ref-7">[7]</a><a href="#ref-8">[8]</a>',
             'D3 freezes v8 as pending_pay v9 and reserves under k9. Under A6 one physical database commits root state, available≥q decrement, reservation and request receipt together. Any shortage, version conflict or interruption rolls back the whole operation; green replies mean committed results. Keep PSP calls outside the transaction, use a stable row lock order, and retry known aborted transactions within a bound under the same identity. <a href="#ref-7">[7]</a><a href="#ref-8">[8]</a>') +
    p('热点仍由数据决定：10 ms 排他占用给出乐观上限 <code>1/0.010=100/s</code>；300/s 需要 <code>3 秒占用/秒</code>，没有稳定排队解。更多 App 不能并行占有同一行。可缩短事务、限额或预划库存份额；划份额必须保持总和不超过真实库存。',
      'The data still defines the hotspot: 10 ms exclusive occupancy gives an optimistic ceiling of 1/0.010=100/s; 300/s demands three occupancy seconds per second, so the queue cannot stabilize. More App instances cannot concurrently own that row. Shorten transactions, limit admission or preallocate stock shares while preserving total stock.') +
    p('拆成两库就失去此原子合同。远程预占需要持久身份、可查询结果与取消栅栏，TTL 本身挡不住迟到申请。关单释放也按 reservation_id 幂等：同库可同事务，跨库先保存释放义务再恢复执行；旧 release 不能释放新预占。详细路径见 Ch18/Ch21/Ch41。',
      'Two databases lose that atomic contract. Remote reservation needs durable identity, queryable outcomes and a cancellation fence; TTL alone cannot stop a late request. Release is idempotent by reservation_id: commit locally when possible or persist remote release work before execution. An old release cannot free a newer reservation. See Ch18/Ch21/Ch41 for the full workflow.'))

rewrite(6, p('D4 先由 Pay 验证 PSP 原始报文与支付尝试，再同库提交 capture 身份、配平分录和 Outbox e17，之后才确认回调。领域事件表示模型承认的事实；对外集成事件是单独维护的合同。当前状态加 Outbox 不等于以事件历史重建状态的 Event Sourcing。<a href="#ref-1">[1]</a><a href="#ref-11">[11]</a>',
             'D4 has Pay verify the raw PSP message and payment attempt, then commit capture identity, balanced journals and outbox e17 before acknowledging the callback. A domain event is a fact acknowledged by the model; an integration event is a separately maintained contract. Current state plus outbox differs from Event Sourcing that reconstructs state from authoritative event history. <a href="#ref-1">[1]</a><a href="#ref-11">[11]</a>') +
    p('改库后直接 publish 会在两步间崩溃丢消息；先 publish 又可能广播未提交事实。Outbox 把发布义务纳入本地提交，Relay 持久扫描，在符合合同的 broker ACK 后标记。发送成功但 ACK 丢失，或 ACK 后标记前崩溃，都会重发同一个 e17，因此消费端仍需幂等。<a href="#ref-5">[5]</a>',
      'Publishing after a database commit can lose the message in between; publishing first can announce an uncommitted fact. Outbox places the obligation in the local commit. A durable Relay scans and marks after the contracted broker acknowledgement. Lost ACK or a crash before marking can resend e17, so consumers still need idempotency. <a href="#ref-5">[5]</a>') +
    p('Order Adapter 把 inbox、状态决定和结果放进一次本地事务，提交后才 ACK；D6 会给出完整分支。先提交 inbox 会在崩溃后抑制尚未发生的修改，先 ACK 则丢掉重投入口。PSP ACK、broker ACK、消费 ACK 各证明自己的一步，都不能证明订单已履约。<a href="#ref-6">[6]</a>',
      'Order Adapter commits inbox, state decision and result in one local transaction before ACK; D6 gives the branches. Committing inbox first can suppress an unapplied change after a crash; acknowledging first removes redelivery. PSP, broker and consumer acknowledgements each prove one step, never completed fulfillment. <a href="#ref-6">[6]</a>'))

rewrite(7, p('D5 的 Published Language 传事实，适配层翻译成订单命令，不复制 Pay 内部对象。e17 携带来源、合同 v1、租户、p9/o42、尝试 a9、10999/USD 和支付版本 3。可信边界验证来源及 Pay 的持久绑定，根再验证本地尝试、金额、币种和状态。payload 自称 tenant_id 不构成授权。<a href="#ref-1">[1]</a>',
             'D5 uses Published Language for facts and an adapter for translation into Order commands, without copying Pay objects. e17 carries source, contract v1, tenant, p9/o42, attempt a9, 10999/USD and Pay version 3. A trusted boundary verifies source and Pay’s durable binding; the root checks local attempt, amount, currency and state. A payload tenant_id grants no authority. <a href="#ref-1">[1]</a>') +
    p('三种身份分别负责：<strong>(source,event_id)</strong> 标识一次投递事实；<strong>(tenant,payment_id)</strong> 在本例标识一次全额 capture；<strong>Order.version</strong> 防旧状态覆盖。同一 capture 的 e17/e18 都应返回同一业务结论；同一身份换金额必须隔离。支付版本 3 与订单 v9 不可比较，时间戳也不构成全序。Stripe 明确可能重复、不同事件对象也可能描述同一业务对象，且不保证生成顺序。<a href="#ref-10">[10]</a>',
      'Three identities serve different purposes: <strong>(source,event_id)</strong> identifies the delivery fact; <strong>(tenant,payment_id)</strong> identifies one full capture in this example; <strong>Order.version</strong> prevents stale state writes. e17/e18 for that capture return the same business outcome; changed amounts under one identity are quarantined. Pay version 3 cannot be compared with Order v9, and timestamps provide no total order. Stripe documents duplicates, separate event objects for the same business object, and no generated-order delivery guarantee. <a href="#ref-10">[10]</a>') +
    p('未知版本、金额/关联错误进持久 Quarantine，保存原消息、原因与处理身份，接管成功后才 ACK；依赖暂时不可用则保留重试入口。隔离有告警、负责人和受控重放。新增可忽略字段与改金额含义是两种兼容性问题。<code>PaymentCaptured</code> 是事实，<code>RefundRequested</code> 是待 Pay 决定执行的意图，不能提前命名成 Refunded。',
      'Unknown schema or invalid amount/binding goes to durable Quarantine with original input, reason and identity, then ACK. A temporarily unavailable dependency retains a retry path. Quarantine needs an owner, alerts and controlled replay. Adding ignorable fields differs from changing amount semantics. PaymentCaptured is a fact; RefundRequested is an intention for Pay to validate, never a premature Refunded fact.'))

rewrite(8, p('D6 是状态图。合法 capture 与到期同时争 <code>pending_pay v9</code>，最多一个提交成功。收款先赢得到 paid v10；到期先赢得到 closed v10，迟到收款不能复活订单。两条箭头是互斥结果，不是两次无条件写。',
             'D6 is a state diagram. Valid capture and expiry race on pending_pay v9; at most one transition commits. Capture first gives paid v10; expiry first gives closed v10, and late capture cannot revive it. The arrows are alternative results, not unconditional writes.') +
    '<h3><span class="lang-zh">返回决定与事件，不在根里发网络请求</span><span class="lang-en">Return decisions and events without network I/O in the root</span></h3>' +
    p('Java17 摘录输入经过认证和绑定校验的 Capture。pending_pay 接纳；paid/p9 重复返回原结论；closed/p9 或 paid/p10 产生退款候选而不改原订单。Money、不可变 Order、Decision 和事件类型定义在完整源码中。这里只产生候选；数据库事务失败后必须丢弃所有候选事件。',
      'This Java17 excerpt takes an authenticated, binding-validated Capture. pending_pay accepts; paid/p9 returns the prior decision; closed/p9 or paid/p10 produces a refund candidate while preserving the order. The full source defines Money, immutable Order, Decision and events. These are candidates: discard every event when persistence fails.') +
    code('DomainModel.java#capture', 'Java 17', 'teaching') +
    p('根不知道 e17 是否重投，也不负责保证退款只发一次。下面由持久事务分别处理投递身份和业务身份，将新决定的领域事件翻译到 Outbox。拒收 p9 的退款工作以 <code>(tenant,payment_id)</code> 唯一，首次分配 r17；后来的 e18 复用原结论，不能再建 r18。<a href="#ref-6">[6]</a>',
      'The root neither knows whether e17 was redelivered nor guarantees a single refund publication. The durable transaction below separates delivery and business identity and translates newly decided domain events into outbox rows. Refund work is unique on (tenant,payment_id), assigning r17 once. Later e18 returns the original decision without creating r18. <a href="#ref-6">[6]</a>') +
    code('consume.pseudo', 'Pseudocode', 'pseudocode') +
    p('inbox 主键为 <code>(consumer,source,event_id)</code>，capture_result 主键为 <code>(tenant,payment_id)</code>，两者都保存摘要与不可变结论；fact_hash 不含投递 event_id。关联读取必须成功且来自可信持久映射；查不到与读取失败分开处理。写根 CAS=0 时整笔回滚再重载，有界耗尽不 ACK。closed/paid 在本例是接纳/到期决定的终态，无订单修改的退款分支仍和结果、Outbox 同事务提交。',
      'Inbox uses (consumer,source,event_id); capture_result uses (tenant,payment_id). Both retain hashes and immutable outcomes, with delivery event_id excluded from fact_hash. Binding reads must succeed against a trusted durable mapping; distinguish a missing binding from a failed read. CAS=0 rolls back everything before bounded reload, with no ACK on exhaustion. closed/paid are terminal for this acceptance/expiry model; refund branches without an order change still commit work, results and outbox together.') +
    p('关键反例：先写 inbox 再发内存退款，崩溃后会“已处理却无人退”。本例在同一事务里保留 inbox、拒收结论、r17 与 RefundRequested Outbox；只有提交后才能确认消费。订单守住不复活，Pay 另守退款不超额，两者不能靠一个补偿函数自动回滚。',
      'The key counterexample commits inbox, then sends an in-memory refund: a crash leaves processed input and no refund owner. This model commits inbox, rejection, r17 and RefundRequested outbox together before acknowledging. Order prevents resurrection; Pay separately prevents excess refunds. One compensation function cannot automatically roll back both.'))

rewrite(9, p('D7 中 Pay Adapter 先把 inbox、唯一 r17 与退款执行意图提交到 Pay Store，再 ACK Bus；扫描器负责接续工作。以同一 r17 调 PSP，确定成功后提交结果与退款分录，再经 Pay Relay→Bus→Order Adapter 发布事实。消费 ACK 只表示接管工作，不能提前显示 refunded。',
             'In D7 Pay Adapter commits inbox, unique r17 and execution intent before acknowledging Bus; a scanner resumes the work. Call PSP under r17, then commit a definite result and refund journals before publishing through Pay Relay→Bus→Order Adapter. Consumer ACK proves custody of work, never a completed refund.') +
    p('超时是 UNKNOWN：PSP 可能已经成功。保留原金额、币种、身份与额度占用，查询原动作或按已核实合同安全重试；没有稳定查询就人工核账。执行租约只防旧执行者覆盖本地状态，拦不住已到 PSP 的请求。Stripe <strong>API v1</strong> 保存开始执行后的首次结果，同键换参拒绝，至少 24 小时后可清理；清理后重用可能创建新请求。此规则不能泛化到 API v2 或其他渠道，更不能让 UNKNOWN 自动过期。<a href="#ref-9">[9]</a>',
      'Timeout means UNKNOWN: PSP may have succeeded. Preserve original identity, parameters and reserved refund capacity; query or safely retry under a verified contract, otherwise reconcile manually. A worker lease only prevents stale local overwrites, not an already issued PSP request. Stripe <strong>API v1</strong> retains the first result after execution begins, rejects changed parameters, and permits pruning after at least 24 hours; reuse after pruning can create a new request. Do not generalize this to API v2 or other providers, or expire UNKNOWN automatically. <a href="#ref-9">[9]</a>') +
    p('A10 净排空能力为 <code>600−300=300/s</code>，36000 条需 <code>120 s</code>；若能力降为 250/s，积压每秒增长 50 条。A11 的七天三份裸载荷为 <code>300×86400×2000×7×3=1.08864 TB</code>，资金凭证和索引另计。幂等记录覆盖重试/回放合同，未终结退款工作活到确定结果或可靠人工接管。监控各阶段数量与最老年龄，120 秒吞吐估算不等于每笔资金的 SLA。',
      'A10 drains at 600−300=300/s, so 36000 entries require 120 s; at 250/s capacity backlog grows by 50/s. A11’s seven-day three-copy payload is 300×86400×2000×7×3=1.08864 TB, excluding journals and indexes. Idempotency records cover the retry/replay contract; unfinished refunds persist until a definite result or reliable manual custody. Monitor counts and oldest age per stage: the 120-second estimate is no per-payment SLA.'))

for index in [10, 11]:
    heading = re.search(r'<h2>(.*?)</h2>', sections[index], re.S)
    content = sections[index].split('</h2>', 1)[1].rsplit('</section>', 1)[0]
    sections[index] = '<section><details><summary>' + heading.group(1) + '</summary>' + content + '</details></section>'
# Keep a visible recap heading for navigation; fold only the long table/extended questions.
sections[10] = sections[10].replace('<section><details><summary>', '<section><h2><span class="lang-zh">复盘与误区</span><span class="lang-en">Review and pitfalls</span></h2><details><summary>', 1)
sections[11] = sections[11].replace('<section><details><summary>', '<section><h2><span class="lang-zh">延伸追问</span><span class="lang-en">Follow-up questions</span></h2><details><summary>', 1)
rewrite(12, p('本章收官 M6：能沿一笔迟到付款指出<strong>谁证明事实、谁决定接纳、哪几行一起提交、失败后按什么身份恢复</strong>。回到 <a href="ch18.html">Ch18 订单</a>、<a href="ch24.html">Ch24 支付</a>、<a href="ch41.html">Ch41 事务</a> 与 <a href="ch44.html">Ch44 部署</a>，按新的边界重新核对承诺。',
              'This closes M6. Follow one late capture and identify <strong>who proves the fact, who accepts it, which rows commit together, and which identity recovers failure</strong>. Revisit <a href="ch18.html">Ch18 orders</a>, <a href="ch24.html">Ch24 payments</a>, <a href="ch41.html">Ch41 transactions</a> and <a href="ch44.html">Ch44 deployment</a> when boundaries change.'))
sections[13] = sections[13].replace('accessed 2026-10-08', 'accessed 2026-10-24')
sections[13] = sections[13].replace('同键参数检查、首次结果和至少 24 小时后可清理；仅用于解释合同边界。', 'API v1 的同键参数检查、首次结果与至少 24 小时后可清理；不泛化 API v2。')
sections[13] = sections[13].replace('Same-key parameter checks, initial result and pruning after at least 24 hours; provider-specific contract.', 'API v1 parameter checks, first result and pruning after at least 24 hours; not a general API v2 rule.')
sections[14] = sections[14].replace('根、明细与总额同一次修改。', '根先产合法候选，根、明细与总额同事务提交。').replace('root, lines and total form one change.', 'the root builds a valid candidate; root, lines and total commit together.')
sections[14] = sections[14].replace('inbox/状态/结果同事务。', 'inbox/状态/结果/新事件Outbox同事务。').replace('commit inbox/state/result atomically.', 'commit inbox/state/result/new-event outbox atomically.')
it = iter(sections)
html = re.sub(r'<section>.*?</section>', lambda _: next(it), html, flags=re.S)
path.write_text(html)
