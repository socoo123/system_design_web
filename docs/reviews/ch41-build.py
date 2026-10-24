"""Rebuild this chapter from its authorized baseline and dedicated snippets."""
from pathlib import Path
import html
import re

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'docs/reviews/ch40-ch41-ch42-baseline/ch41.html'
s = BASE.read_text()


def pair(zh, en):
    return f'<span class="lang-zh">{zh}</span><span class="lang-en">{en}</span>'


def heading(zh, en):
    return '<h3>' + pair(zh, en) + '</h3>'


def prose(zh, en):
    return f'<div class="bilingual"><div class="lang-zh">{zh}</div><div class="lang-en">{en}</div></div>'


def code(file, language, kind):
    source = (ROOT / 'examples/ch41' / file).read_text().rstrip()
    return f'<pre data-language="{language}" data-kind="{kind}" data-source="{file}"><code>{html.escape(source)}</code></pre>'


def replace_prose(deck, text):
    global s
    decks = list(re.finditer(r'<figure class="deck">.*?</figure>', s, re.S))
    end = decks[deck - 1].end()
    section_end = s.index('</section>', end)
    s = s[:end] + text + s[section_end:]


# The original eight decks, forty frames, IDs and sequence remain intact.
core = '<section class="goal"><h2>' + pair('本章核心：副本、归属与提交', 'Core: copies, ownership and commit') + '</h2>' + prose(
    '<ul><li><strong>复制管副本：</strong>receive、flush、apply 和新快照可见分别发生；先说成功回执承诺哪一步。</li><li><strong>分片管归属：</strong>按查询与不变量选键；切流要先隔离旧写者，再证明新写者具备完整历史。</li><li><strong>事务管共同提交：</strong>条件更新守本地不变量；2PC 的共同决策、Outbox 的意图和 Saga 的业务恢复各有边界。</li></ul>',
    '<ul><li><strong>Replication owns copies:</strong> receipt, flush, apply and visibility in a new snapshot differ. Define the success acknowledgment first.</li><li><strong>Sharding owns placement:</strong> choose by queries and invariants. Fence the old writer before proving the new writer has the complete history.</li><li><strong>Transactions own atomic change:</strong> conditional updates guard local invariants. Separate the shared 2PC decision, Outbox intent and Saga recovery.</li></ul>') + '</section>'
s = re.sub(r'<section><h2><span class="lang-zh">这一章结束你能做什么.*?</section>', core, s, count=1, flags=re.S)

opening = '<section><h2>' + pair('30 秒开场：先问成功回执承诺什么', 'Opening: define the success contract') + '</h2>' + prose(
    '<p>先把三件事分开：复制保存同一数据的多份副本，分片给不同数据分配唯一写归属，事务让相关变更同成败。普通列表可允许副本旧读；提交确认要区分主库持久、远端持久和读可见。超过单机能力后，订单和订单项尽量同片；跨库再评估 2PC，跨服务长流程以 Outbox 和持久 Saga 恢复。</p><p><strong>先问：</strong>已确认写可丢多少、允许读旧多久、故障域是一台机还是整个地域？哪条查询带 tenant_id，哪些扣减和唯一性必须一起成立，外部服务能否按稳定操作键查回执？本章默认单地域、每个键范围一个写者；所有数字是教学假设。</p>',
    '<p>Replication keeps copies of the same data; sharding assigns different data to a unique writer; transactions make related changes succeed together. Lists may tolerate stale replicas, while confirmation distinguishes local durability, remote durability and visibility. After exceeding one node, co-locate Order and Items. Evaluate 2PC across controlled databases, and recover cross-service workflows with Outbox and persistent Sagas.</p><p><strong>Ask first:</strong> how much acknowledged data may be lost, how stale may reads be, and is the failure domain a machine or a region? Which queries carry tenant_id, which invariants must commit together, and can external services retrieve stable operation receipts? Assume one region and one writer per range. Every numeric example is a teaching assumption.</p>') + '</section>'
s = re.sub(r'<section><h2><span class="lang-zh">30 秒开场.*?</section>', opening, s, count=1, flags=re.S)

replace_prose(2,
    heading('把应用屏障和读快照绑在同一个目标上', 'Bind the apply barrier and snapshot to one destination') + prose(
        '<p><strong>图2的资格是“包含这次写”，不是“数值看起来够大”。</strong>服务签发并鉴权 token，绑定集群、日志历史和提交位点；T:1042 只是缩写。先在选定副本确认同一历史的连续应用前缀，再在同一服务器开新读快照并查询。连接池换库、切主或连接失效后重做资格检查。接收/落盘位点、乱序日志的最大序号，都不能代替这份可见前缀证明。</p><p>不要在旧 Repeatable Read 事务中等 replay 追平再 SELECT；旧事务仍保留旧快照。[7] 下列 Java17 只实现资格和路由判定。<code>FreshView</code>必须由可信引擎适配取得，绑定仍有效的读连接与该查询快照；<code>visiblePrefix</code>表示该快照实际包含的连续前缀，不能填当前 replay 仪表盘数字。这不是 PostgreSQL 原生 API，也不实现等待、网络或复制。</p>',
        '<p><strong>Deck 2 asks whether this write is included, rather than whether a number is large enough.</strong> The service authenticates a token bound to cluster, history and commit position; T:1042 is shorthand. Verify the continuous applied prefix on the chosen server, then open a fresh snapshot and query that same server. Recheck after pool reassignment, promotion or connection loss. Receive/flush positions and a maximum out-of-order sequence are insufficient.</p><p>Waiting for replay inside an existing Repeatable Read transaction does not refresh its snapshot.[7] This Java17 code only checks eligibility and routing. A trusted engine adapter supplies <code>FreshView</code>, bound to a still-valid connection and the query snapshot. Its <code>visiblePrefix</code> is what that snapshot actually includes, not a current replay metric. This is neither a native PostgreSQL API nor an implementation of waiting, networking or replication.</p>') +
    code('ReadGate.java', 'Java 17', 'runnable') + prose(
        '<p><strong>等待最多 20 ms（A3），之后仍需主库准入。</strong>WAIT 让适配在剩余预算内重新取得新视图；PRIMARY 只允许仍包含 token 的主库，UNAVAILABLE 不返回旧行。代码保守地仅接受相同 history；若要接受继承历史，适配必须先验证分叉点和所需前缀的包含关系，不能直接比较跨 timeline 的 LSN。<a href="../examples/ch41/README.md">同源示例</a>覆盖正常追平、旧快照、异历史大位点和回主被拒。</p><p>20 ms 是副本等待预算，不是整个 API SLO；还要服从请求 deadline。大批超时回主须限流。直接回主并开新快照是更简单的替代，但仍依赖合法写者与所需提交未丢失。read-your-writes 只保护本次会话已知的写，不自动提供全局线性一致，也不证明另一个服务的投影已经完成。</p>',
        '<p><strong>A3 waits at most 20 ms, then still requires primary admission.</strong> WAIT asks the adapter for a new view within the remaining budget. PRIMARY requires inclusion of the token; UNAVAILABLE must not serve stale success. The code conservatively accepts equal histories only. Accepting an inherited history requires validated fork points and prefix inclusion, never bare cross-timeline LSN comparison. The <a href="../examples/ch41/README.md">same-source example</a> checks catch-up, old snapshots, larger fork positions and denied fallback.</p><p>The 20 ms wait is not the API SLO and remains bounded by its deadline. Rate-limit fallback surges. A fresh primary read is simpler but still depends on legitimate ownership and preservation of the requested commit. Read-your-writes is not global linearizability or proof that another service has updated its projection.</p>'))

replace_prose(5,
    heading('快照 S 与增量日志必须覆盖同一条历史', 'Snapshot S and changes must cover the same history') + prose(
        '<p>图5先固定 Source 为 rev=7 的写权威，取得一致快照 S，并从开始保留 S 之后的变更。多次普通 SELECT 不能拼成一致快照。Target 回放更新、删除和事务边界；后到的旧快照行不能盖掉新版本，删除要保留防复活信息。版本合并或逐范围拷贝屏障由引擎实现。订单、幂等结果和 outbox 都在迁移范围内，只搬业务主行会让重试重新执行。</p><p>Vitess22 将复制追赶、SwitchTraffic 与 ReverseTraffic 分开；切写会停止源写、等待目标追到停止点，并可建立反向复制。[6] 本章伪代码提炼需要满足的合同，不代替 Vitess 实现。</p>',
        '<p>Deck 5 retains Source as the rev-7 authority, takes consistent snapshot S and retains changes after S from the start. Independent SELECTs are not a consistent snapshot. Replay updates, deletes and transaction boundaries; late snapshot rows must not overwrite newer versions, and tombstones prevent resurrection. The engine supplies version merging or range copy barriers. Migrate idempotency results and outbox alongside business rows, otherwise retries can execute again.</p><p>Vitess22 separates copy/catch-up, SwitchTraffic and ReverseTraffic. Write cutover stops source writes, waits for replay through that stopping point and can establish reverse replication.[6] This pseudocode expresses required contracts rather than implementing Vitess.</p>') +
    heading('写端 guard 与 fence 必须在同一串行仲裁域', 'The write guard and fence share one serialization domain') +
    code('migration.pseudo', 'Pseudocode', 'pseudocode') + prose(
        '<p><code>lockOwnershipRowSharedUntilCommit</code>是写权威数据库的共享行锁，保护该范围归属，锁一直持到业务提交；freeze 用同一行的排他锁等待在途写者，再持久提交 FROZEN。旧事务要么先提交并进入 H，要么在 FROZEN 之后被拒绝，没有“先在 App 查 rev，再隔很久提交”的空隙。未决 2PC 也必须解决后才能给 drain 证明。若引擎无法这样约束旧连接，要撤销写权限或硬隔离；进程 mutex、DNS 与 Router 缓存都不够。</p><p>Target proof 绑定 range、moveId、source history、H 与拷贝完成状态，H 是已应用连续前缀。目录用持久线性化 CAS 核旧 owner/rev 和这份证据，只产生一次新授权；Target 写端核准确 owner/rev 并持久激活。发布后、激活前可暂时拒绝请求。发布回执丢失就查同一 moveId；不得复活源写者。切后回退必须反向追平、fence Target 再给 Source 新代次，旧 rev=7 不能重新启用。</p>',
        '<p><code>lockOwnershipRowSharedUntilCommit</code> is a shared ownership-row lock in the write authority, held through business commit. Freeze exclusively locks that same row, drains writers and durably commits FROZEN. Each old transaction either commits before H or is rejected after FROZEN; an App precheck followed by a later commit leaves an unsafe gap. Resolve in-doubt 2PC before proving drain. Engines unable to constrain old connections need write-authority revocation or hard isolation; process mutexes, DNS and router caches are insufficient.</p><p>Bind target proof to range, moveId, source history, H and complete copy; H must be an applied continuous prefix. A durable linearizable directory CAS validates the old owner/revision and evidence, issuing one new grant. Target verifies the exact owner/revision and persists activation. Requests may temporarily reject between publication and activation. Recover lost replies using the same moveId without reviving Source. Rollback after new writes needs reverse replay, Target fencing and a new Source generation, never reactivation of rev 7.</p>') +
    heading('复算：回放速度减去持续生成速度', 'Recalculate net catch-up speed') + prose(
        '<p>A7：400 GB÷100 MB/s=4,000 s≈66.7 min，十进制单位、有效速度，不含额外重试。A8：60−20=40 MB/s 净追赶，120 GB÷40 MB/s=3,000 s=50 min。两段可重叠；只有知道 backlog 测量时刻才能算总迁移时长，不能机械相加。回放≤20 MB/s 时不收敛，需限源写、加回放能力或安排停写窗口。源端读负载、日志保留和 Target 空间也要留余量。</p>',
        '<p>A7: 400 GB/100 MB/s=4,000 s≈66.7 min, with decimal units and effective throughput before extra retries. A8: 60−20=40 MB/s net; 120 GB/40 MB/s=3,000 s=50 min. These phases can overlap; total duration requires the backlog measurement time. Replay at or below 20 MB/s cannot catch up: reduce writes, add replay capacity or schedule a write pause. Budget source reads, retained logs and target space too.</p>'))

replace_prose(6,
    heading('先把本地条件提交写实，再谈跨库', 'Make local conditional commit concrete first') + prose(
        '<p><strong>图6上方是一次同片提交，下面才是 2PC。</strong>本例已有单商品 DRAFT 订单；提交请求仅含 order_id 与 expectedVersion，可信 tenant/caller 已通过鉴权。订单、该库存、成功回执和 outbox 在一个权威库；草稿明细变化必须递增版本。条件更新决定谁能从 DRAFT 提交，库存不足则整个事务回滚。跨片库存不满足本例边界，不能原样复制这段代码。</p><p>下面伪代码由 <a href="../examples/ch41/README.md">Python标准库/SQLite3.35+适配</a>执行同一份 SQL。<code>BEGIN IMMEDIATE</code>先获得该库唯一写事务，再查幂等结果；这项 SQLite 特性让“查不到再插”在本适配内成立。[14] 行锁引擎须依赖真实唯一约束并处理竞争，不能把 SELECT 不存在当防重。</p>',
        '<p><strong>Deck 6 separates the upper local transaction from lower 2PC.</strong> A one-item DRAFT order already exists. Submission carries only order_id and expectedVersion; tenant/caller authorization is trusted. Order, its stock, successful receipt and outbox share one authoritative database. Editing draft lines increments its version. A conditional transition selects the submitter; insufficient stock rolls the entire transaction back. Cross-shard stock falls outside this example.</p><p>The <a href="../examples/ch41/README.md">Python standard-library/SQLite3.35+ adapter</a> executes the same SQL as this pseudocode. <code>BEGIN IMMEDIATE</code> acquires that database’s single writer before looking up the result, making the not-found/insert sequence safe in this adapter.[14] Row-locking engines still need an actual unique constraint and race handling; a SELECT miss alone provides no deduplication.</p>') +
    code('submit.pseudo', 'Pseudocode', 'pseudocode') +
    code('submit.sql', 'SQL', 'teaching') + prose(
        '<p><strong>SQL 按顺序、在上面同一事务内执行，并核受影响行数。</strong>订单 CAS 为 0 行是版本/状态冲突；扣库存为 0 行则回滚前面的 SUBMITTED。outbox 或结果插入失败也要回滚全部。成功键为 <code>(tenant,caller,key)</code>，绑定完整规范请求并存响应快照；同键换 order/version 拒绝。本例只持久保存成功结果，已知回滚没有业务效果；SOLD_OUT 后若补货，同一请求稍后仍可能成功。事件 ID 绑定订单与提交版本，重试不会产生第二个事件。</p><p>已知序列化失败/死锁可在有界退避后重做<strong>整个事务及其决策读取</strong>，例如 PostgreSQL40001/40P01；唯一冲突不是一律重试。[13] COMMIT 时连接断开是 UNKNOWN：查同一键，查询也失败时保留未知；不能换键再次下单。适配验证实际数据库事务与进程竞争，不证明副本持久性或跨库原子性。</p>',
        '<p><strong>Run these statements in order inside that transaction and check affected rows.</strong> Zero order-CAS rows means a state/version conflict. Zero stock rows rolls back SUBMITTED; event/result insertion errors also roll back everything. The unique <code>(tenant,caller,key)</code> binds the complete canonical request and saved response. Changed order/version conflicts. Only successful results are retained: a known rollback has no effect, and a SOLD_OUT request can succeed after later replenishment. Stable event IDs bind order and submit version.</p><p>Known serialization/deadlock aborts permit bounded retries of the <strong>entire transaction and its decision reads</strong>, such as PostgreSQL40001/40P01; unique violations need classification.[13] A lost connection during COMMIT is UNKNOWN. Resolve the same key, retaining uncertainty if lookup also fails, rather than creating a new order key. The adapter verifies real local database transactions and process competition, not replicated durability or cross-database atomicity.</p>') +
    heading('2PC 的 YES 不是共同提交结果', 'A 2PC YES is not the shared commit result') + prose(
        '<p>图6下方 Coordinator 分别向 DB A/B 发 prepare。每个 YES 表示参与者已持久保存可恢复的 prepared 状态并持锁；全部 YES 之后，协调者先持久 COMMIT 决策，再通知双方第二阶段。任何 NO 可决定 ABORT。通知 ACK 丢失应按原 transaction_id 重发原决定，不能新建一场事务。</p><p>参与者已 YES 却取不到可信决策时处于 in-doubt，不能超时自猜 ABORT：另一方可能已按持久 COMMIT 提交。恢复的协调者/决策日志必须能查询原 transaction_id。PostgreSQL17 prepared 状态脱离连接仍存盘、持续持锁，长留会妨碍 VACUUM。[8] 因而需持久决策、恢复扫描、告警和明确负责人；用户 timeout 不决定事务结论。</p>',
        '<p>Coordinator independently prepares DB A/B. Each YES means durable recoverable prepared state with locks retained. After all YES votes, persist the COMMIT decision before notifying participants. Any NO permits ABORT. Retry a lost second-phase acknowledgment with the original transaction_id and decision.</p><p>A prepared participant without a trustworthy decision is in-doubt, not free to abort on timeout: another participant may already have committed. Recover the original decision from the coordinator/log. PostgreSQL17 prepared state survives session termination, retains locks and can obstruct VACUUM.[8] Durable decisions, recovery scans, alerts and an owner are required; user timeouts do not decide transaction outcomes.</p>') +
    heading('共同提交不等于全局隔离或外部副作用', 'Atomic commit does not supply global isolation or external effects') + prose(
        '<p>2PC 解决共同决定，不单独提供串行隔离；跨片事务还要引擎的锁/时间戳/冲突控制。可评估受控数据库参与者，也可重新聚合让不变量留在同片。PSP、短信、发货通常不参加你的 prepare/commit；Outbox 持久化投递意图，Saga 恢复已提交步骤，均不把外部服务收进这次本地 COMMIT。</p>',
        '<p>2PC coordinates a decision; cross-shard serial isolation still needs the engine’s locks, timestamps or conflict control. Evaluate controlled participants or redesign locality. PSPs, messaging and shipping generally do not join your prepare/commit protocol. Outbox persists delivery intent; Saga recovers already committed steps. Neither brings external services inside the local COMMIT.</p>'))

# Correct only the state labels in the affected migration frames.
for frame in (4, 5):
    pattern = rf'(<svg[^>]*aria-labelledby="d5s{frame}t d5s{frame}d".*?</svg>)'
    match = re.search(pattern, s, re.S)
    assert match
    new = match[1].replace('authoritative rev 7', 'fenced at H')
    if frame == 5:
        new = new.replace('not routable yet', 'writer rev 8')
    s = s[:match.start()] + new + s[match.end():]
s = s.replace('UNKNOWN -&gt; query, not retry pay', 'UNKNOWN -&gt; resolve same operation')
s = s.replace('短暂停写后取得最终 H，等 Target 的 copy 完成且 replay≥H，再切写。假设追日志 60 MB/s、新增 20 MB/s，净速度 40 MB/s。',
    '切前持续写入阶段，假设回放 60 MB/s、新增 20 MB/s，净追赶 40 MB/s。切流时先停源写并取得 H（此范围新增为 0），再等 Target 完成 copy 且 replay≥H。')
s = s.replace('Fence source writes at H, then require copy completion and replay≥H. At 60 MB/s replay versus 20 MB/s generation, net catch-up is 40 MB/s.',
    'Before fencing, assume 60 MB/s replay minus 20 MB/s generation gives 40 MB/s catch-up. At cutover stop source writes, record H (zero new writes for this range), then require complete copy and replay≥H.')
s = s.replace('Primary 再把 WAL 分别流给 Replica A/B，副本不串成 A→B 的接力链。',
    'Primary 把 WAL 独立流给 Replica A/B，副本不串成 A→B 的接力链；本地工作和复制可重叠，确认策略决定何时允许结果返回。')
s = s.replace('异步回执不等副本；',
    '本章“异步”指不等远端副本，仍要求本地 WAL 持久，不是 PostgreSQL 的 synchronous_commit=off。[1] 异步复制回执不等副本；')
s = s.replace('Async success does not wait for replicas and can lose unshipped writes',
    'Here async means replication without a remote wait, with local durable WAL still required; it does not mean PostgreSQL synchronous_commit=off.[1] Async replication can lose unshipped writes')
s = s.replace('120 GB backlog÷40 MB/s=3,000 s=50 分钟，与全量阶段可重叠，不能机械相加。切后回退须先反向追平新写，不能只改回路由。',
    '终态 Source 仍被 fence，Target 已按 rev=8 激活。120 GB÷40 MB/s=50 分钟，可与全量重叠；回退须反向追平并重新隔离写者。')
s = s.replace('120 GB / 40 MB/s = 3,000 s = 50 minutes; phases may overlap. Rollback after new writes needs reverse catch-up, not a route flip.',
    'At the final state Source stays fenced and Target is active at rev 8. 120 GB/40 MB/s=50 minutes may overlap copy; rollback needs reverse catch-up and writer fencing.')
s = s.replace('120 GB backlog÷40 MB/s=3,000 s=50 min may overlap copy. Rollback requires reverse catch-up of new writes before rerouting.',
    'At the final state Source stays fenced and Target is active at rev 8. 120 GB/40 MB/s=50 min may overlap copy; rollback needs reverse catch-up and writer fencing.')
s = s.replace('Source writes are fenced at barrier H while Target finishes copying and replaying through H.',
              'Source is labeled fenced at H while Target is not routable and finishes copying and replaying through H.')
s = s.replace('Publish revision 8 only after target proof and source fencing; stale revision 7 writes are rejected.',
              'Source remains fenced at H; Target is labeled writer rev 8 after copy/replay proof. Stale revision 7 writes are rejected.')

# Duplicate IDs must represent the same payload, and a failed statement is not a duplicate.
s = s.replace('重复消息触发唯一冲突时返回已处理结果，不再做第二次效果。',
    'inbox 还绑定 payload 摘要；同 ID 同内容才是重复，同 ID 换内容要报冲突。唯一冲突后先回滚该尝试，再读取已提交 inbox 及原结果，不能吞掉任意约束错误便 ACK。')
s = s.replace('Duplicate unique conflicts reuse the processed result.',
    'Bind the inbox ID to a payload digest. Only identical content is a duplicate; changed content conflicts. Roll back a unique-conflict attempt, then load the committed inbox/result before acknowledging.')
# Exact English wording in the baseline is covered separately below.
s = s.replace('Duplicates reuse the processed result.',
    'Bind inbox IDs to payload digests; only identical content is duplicate. Roll back a conflicting attempt and load the committed result before ACK; changed content or other constraint errors are not duplicate success.')
s = s.replace('Duplicates return the recorded result without another effect.',
    'Bind inbox IDs to payload digests: changed content conflicts. For an identical duplicate, roll back the conflicting attempt and load the committed inbox/result before ACK; do not swallow unrelated constraint errors.')
s = s.replace('若 Shipping 确定没有发货且出现终态失败，编排器持久化 refund 与 release 意图。',
    '若 Shipping 在其权威存储中已进入不可再发货的终态失败，且拒绝迟到的 release，编排器才持久化 refund 与 release 意图。单次“未找到回执”或一次业务查询未发货，不是这个证明。')
s = s.replace('取消与发货用期望版本和状态条件仲裁；取消赢后阻止后续释放，发货赢后转售后路径。',
    '取消与发货必须在 Shipping 的权威状态行以版本/状态条件仲裁，拒绝旧步骤的迟到 release；只有持久 CANCELLED 才能安全启动退款。只在 Run DB 改成取消而未约束 Shipping，挡不住已发出的 RPC；发货赢后转售后路径。')
s = s.replace('Cancel/ship races use expected versions and states; cancellation blocks release, while shipment requires after-sales recovery.',
    'Cancel/ship must arbitrate through version/state conditions in Shipping’s authoritative row, rejecting delayed old-step releases. Only durable CANCELLED permits refund; changing Run DB alone cannot stop an issued RPC. Shipment winning requires after-sales recovery.')
s = s.replace('Confirmed terminal non-shipment creates persistent refund/release intents.',
    'Only terminal failure in Shipping’s authoritative storage that prevents delayed releases from shipping permits refund/release intents. A missing receipt or an ordinary not-shipped query is insufficient.')
s = s.replace('arbitrate cancellation versus shipment with expected version/state. Cancellation blocks later release; shipment moves cancellation to after-sales handling.',
    'arbitrate cancel/ship on Shipping’s authoritative row using expected version/state and reject delayed releases from old steps. Only durable CANCELLED permits refund; changing Run DB alone cannot stop an issued RPC. Shipment winning requires after-sales handling.')
s = s.replace('Inventory、Payment、Shipping 各用本地事务维护业务效果与操作幂等。',
    'Inventory、Payment、Shipping 各用本地事务维护业务效果与操作幂等。本例预占 deadline 只触发恢复扫描，不自行归还库存；出库消耗与释放在 Inventory 按 HELD 状态互斥。若采用自动到期回收，须另设计发货前确认与过期竞争，不能沿用旧 held 回执发货。')
s = s.replace('Each service locally preserves effect/idempotency.',
    'Each service locally preserves effect/idempotency. Here reservation deadlines trigger recovery scans, not automatic stock release; Inventory arbitrates fulfillment consumption versus release from HELD. Automatic expiry would additionally require pre-shipment confirmation competing with expiry; an old held receipt is insufficient.')
s = s.replace('预占期限与 release 条件写成合同。',
    '本例 deadline 触发恢复，不自动释放；出库与释放在库存权威按状态互斥。')
s = s.replace('Inventory reserves locally and repeated order:17 operations reuse the result.',
    'Inventory reserves locally; repeated order:17 operations reuse the result. Here deadlines trigger recovery rather than automatic release; stock consumption and release arbitrate by state.')
s = s.replace('Inventory locally reserves with a stable key; duplicate calls return the original result. Define hold expiry and release conditions.',
    'Inventory reserves under a stable key and reuses the original result. Here deadlines trigger recovery, not automatic release; Inventory arbitrates consumption versus release by state.')
s = s.replace('补偿只处理确定未发货；每步有版本与持久 intent',
    '补偿只处理确定未发货；预占不自动过期；每步有版本与持久 intent')
s = s.replace('compensate confirmed non-shipment only; versioned durable intents',
    'compensate terminal non-shipment only; no automatic hold expiry; versioned intents')

# Rechecked primary links and directly reachable citation anchors.
s = s.replace('https://docs.oracle.com/cd/E17952_01/mysql-8.4-en/replication-semisync.html',
              'https://dev.mysql.com/doc/refman/8.4/en/replication-semisync.html')
s = s.replace('https://vitess.io/docs/22.0/reference/vreplication/reshard/',
              'https://vitess.io/docs/archive/22.0/reference/vreplication/reshard/')
body, refs = s.split('<ol class="references">', 1)
body = re.sub(r'\[(\d+)\]', lambda m: f'<a href="#ref-{m[1]}">[{m[1]}]</a>', body)
refs = re.sub(r'<li>\[(\d+)\]', lambda m: f'<li id="ref-{m[1]}">[{m[1]}]', refs)
extra = ('<li id="ref-13">[13] PostgreSQL Global Development Group. <a href="https://www.postgresql.org/docs/17/mvcc-serialization-failure-handling.html" target="_blank" rel="noopener">PostgreSQL17: Serialization Failure Handling</a>. ' + pair('40001、40P01 与全事务重试；唯一冲突须分类。', '40001, 40P01 and complete-transaction retries; classify unique violations.') + '</li>'
         '<li id="ref-14">[14] SQLite. <a href="https://www.sqlite.org/lang_transaction.html" target="_blank" rel="noopener">Transaction</a>. ' + pair('单写事务、BEGIN IMMEDIATE 和 SQLITE_BUSY；本地适配不证明分布式保证。', 'Single-writer transactions, BEGIN IMMEDIATE and SQLITE_BUSY; local adaptation does not prove distributed guarantees.') + '</li>')
refs = refs.replace('</ol>', extra + '</ol>', 1)
s = body + '<ol class="references">' + refs

# Keep the assumptions discoverable while reducing the opening scroll.
start = s.index('<section><h2><span class="lang-zh">假设表')
end = s.index('</section>', start)
section = s[start:end]
section = section.replace('<table>', '<details><summary>' + pair('A1–A12：展开教学假设', 'A1–A12: expand teaching assumptions') + '</summary><table>', 1)
section += '</details>'
s = s[:start] + section + s[end:]
s = s.replace('重放体积假设加 10%', '传输重投量假设加 10%').replace('assume 10% replay volume', 'assume 10% retransmission overhead').replace('Assumed 10% replay volume', 'Assumed 10% retransmission overhead')
s = s.replace('适配验证实际数据库事务与进程竞争，不证明副本持久性或跨库原子性。',
    '尾部重试伪代码是调用方策略；SQLite 适配只执行单次事务，未实测 PostgreSQL 的 40001/40P01。它验证本地数据库事务与进程竞争，不证明副本持久性或跨库原子性。')
s = s.replace('The adapter verifies real local database transactions and process competition, not replicated durability or cross-database atomicity.',
    'The retry pseudocode is caller policy; the SQLite adapter performs one transaction attempt and does not experimentally validate PostgreSQL40001/40P01. It verifies local database transactions and process competition, not replicated durability or cross-database atomicity.')
s = s.replace('发布回执丢失就查同一 moveId；不得复活源写者。',
    'freeze、proof、publish、activate 都按同一 moveId 持久幂等恢复；重启先查阶段状态，发布回执丢失就查原目录，不得复活源写者。')
s = s.replace('Recover lost replies using the same moveId without reviving Source.',
    'Freeze, proof, publication and activation each persist idempotent stage state under the same moveId. Recover by querying that state and the original directory, without reviving Source.')

# Flashcards also carry the implementation boundaries.
new_cards = [
    ('条件提交 CAS 为 0 行后怎么办？', 'What happens after a zero-row submit CAS?',
     '整个事务回滚并返回状态/版本冲突；不能继续写事件。已知数据库冲突重试整个事务，COMMIT 断线先查原键。',
     'Roll back the transaction and return state/version conflict; do not emit the event. Retry known database aborts as a whole transaction; resolve an unknown commit by the same key.'),
    ('只在 Router 检查 rev 能 fence 吗？', 'Does a router revision check fence writes?',
     '不能。归属 guard 与 fence 在写权威的同一串行域；旧事务先完成进入 H，或被拒绝。',
     'No. Ownership guard and fence share the write authority’s serialization domain. Old transactions commit before H or reject.'),
]
cards = ''.join('<button type="button" class="flip"><span class="q">' + pair(zhq, enq) + '</span><span class="a">' + pair(zha, ena) + '</span></button>' for zhq,enq,zha,ena in new_cards)
s = s.replace('</div></section>  <p><button type="button" class="read-toggle">', cards + '</div></section>  <p><button type="button" class="read-toggle">')
s = s.replace('快照完成、含删除的 replay≥H、旧写者 fence、新目录持久发布。', '完整迁移含幂等/outbox、删除 replay≥H、写端 fence、目录 CAS 和新代次激活。')
s = s.replace('Complete copy, replay including deletes through H, fenced old writer, durable new directory.', 'Copy including idempotency/outbox, deletes replayed through H, writer fence, directory CAS and new-revision activation.')
s = s.replace('约 50 分钟', '约 55 分钟').replace('~50 min', '~55 min')
(ROOT / 'chapters/ch41.html').write_text(s)
print('Rebuilt Ch41 with 4 same-source snippets; animation inventory preserved.')
