"""Rebuild Ch27 prose around all six original animation decks, with two local fixes."""
from pathlib import Path
import hashlib
import html
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
page = ROOT/'chapters/ch27.html'
base = (ROOT/'docs/reviews/ch25-ch26-ch27-baseline/ch27.html').read_text()
expected = '674cb8e85be4a97d41d118a570ded20544557d299b606ddcfae88043d5645cd8'
assert hashlib.sha256(base.encode()).hexdigest() == expected
check_mode = '--check' in sys.argv
if not check_mode:
    assert hashlib.sha256(page.read_bytes()).hexdigest() == expected, 'Target changed since baseline; do not overwrite'
decks = re.findall(r'<figure class="deck">[\s\S]*?</figure>',base)
assert len(decks) == 6
decks[3] = decks[3].replace(
    '<text x="112" y="363" class="tiny">Match rechecks details: current session, capture age &lt;= 30 s, accuracy, and online state.</text>',
    '<text x="112" y="329" class="tiny">Match rechecks the active session;</text><text x="112" y="350" class="tiny">capture age &lt;= 30 s, accuracy, online.</text>')
decks[3] = decks[3].replace('新建上传路径，先验证服务端发的 session epoch，再接受 seq41。手机重连可以继续序号；新会话要换 epoch。','先验证服务端发的 epoch，图中 seq41 是该会话示例。每次重连换发新 epoch、清旧点并重新采样；seq 只在同一 epoch 内比较。').replace('Start with server-issued session epoch and sequence 41. Reconnect preserves sequence; a new session gets a new epoch.','Verify the server-issued epoch; sequence 41 is a session example. Every reconnect gets a new epoch, clears the old point and resamples. Compare sequences only within the same epoch.')
decks[4] = decks[4].replace(
    'Routing timeout follows the red route to Tracking API, which returns low-confidence ETA to Client over its existing reply.',
    'The red loop is the Tracking API local timer: no Routing reply arrived before its wait budget. Tracking API returns uncertain or unavailable ETA over its existing reply.')
decks[4] = decks[4].replace(
    '<path d="M735 158 L688 158 Q680 158 680 166 L680 207 Q680 215 672 215 L318 215 Q310 215 310 207 L310 176" class="wire fail"/><polygon points="310,166 315,176 305,176" class="head fail"/><text x="805" y="236" text-anchor="middle" class="tiny">timeout -&gt; uncertain</text>',
    '<path d="M205 166 L205 202 Q205 210 197 210 L170 210 Q162 210 162 202 L162 162 Q162 154 170 154 L180 154" class="wire fail"/><polygon points="190,154 180,159 180,149" class="head fail"/><text x="112" y="231" class="tiny">local timer</text><text x="425" y="215" class="tiny">No routing reply; ETA uncertain</text>')
decks[4] = decks[4].replace(
    'Routing 超时红线止于 API，用户看低可信区间或 ETA 暂不可用。',
    '红色回环是 API 本地等待超时，表示尚未收到 Routing 回复；用户看低可信区间或 ETA 暂不可用。')
decks[4] = decks[4].replace(
    'Routing failure stops at the API; show an uncertain interval or unavailable ETA.',
    'The red loop is the API local timer, with no Routing reply received; show uncertain or unavailable ETA.')

def bi(zh,en):
    return f'<div class="bilingual"><div class="lang-zh">{zh}</div><div class="lang-en">{en}</div></div>\n'
def title(zh,en,level=2):
    return f'<h{level}><span class="lang-zh">{zh}</span><span class="lang-en">{en}</span></h{level}>\n'
def block(file,language,kind='pseudocode'):
    code=(ROOT/'examples/ch27'/file).read_text().rstrip('\n')
    return f'<pre data-language="{language}" data-kind="{kind}" data-source="{file}"><code>{html.escape(code,quote=True)}</code></pre>\n'
def section(zh,en,body,cls=''):
    return f'<section{f" class={chr(34)}{cls}{chr(34)}" if cls else ""}>\n{title(zh,en)}{body}</section>\n'

parts=[]
parts.append(section('本章主线：先守住双方占位，再优化匹配','Core: preserve bilateral occupancy before optimizing matching',bi(
    '<ul><li><strong>一个订单只有一个当前执行者。</strong>每个骑手槽位只绑一单；本章每人最多两个槽位，offered 也占位。</li><li><strong>派单事实放进一个事务。</strong>预占、accept、到期、取消都经过同一订单与容量权威；旧代次不能恢复执行权。</li><li><strong>位置是投影，履约是事实。</strong>新鲜点用于召回，掉线与 GPS 过期不能自动撤回已经取走的餐。</li></ul>',
    '<ul><li><strong>One current assignee per order.</strong> Each courier slot binds one order; this example allows two slots, including unanswered offers.</li><li><strong>One transaction authority.</strong> Reservation, accept, expiry and cancellation use the same order/capacity authority. Old generations cannot regain execution rights.</li><li><strong>Location is a projection; fulfillment is fact.</strong> Fresh points support recall. Disconnection or stale GPS cannot revoke physical custody.</li></ul>'), 'goal'))

assumptions=re.search(r'<table><thead>[\s\S]*?</table>',base).group()
parts.append(section('30 秒开场与必要假设','A 30-second opening and assumptions',bi(
    '<p class="say">我设计一城外卖履约：支付确认后，先持久保存 pending_match；召回附近候选，过滤新鲜度、资质和容量，再比较到店路耗与迟到风险。选人后原子预占订单和骑手槽位，提交 offer 与 Outbox，骑手 accept 成功才 assigned。服务端到期扫描释放未接 offer 并推进 generation；旧消息重试只能查询原结果。高峰按区域控制新承诺，保住存量履约。</p><p>先澄清配送类型、平台接受订单的时刻、多单上限、准时目标与取餐后交接权限。本章选外卖、准时优先、每个 offer 只发给一个骑手；同一骑手可占两个不同槽位。广播抢单也要经过相同的事务约束。</p>',
    '<p class="say">Design one-city food fulfillment. After confirmed payment, persist pending_match, recall nearby couriers, filter freshness/eligibility/capacity, then compare pickup travel and lateness. Atomically reserve order and courier slot with offer/outbox; assigned requires committed business acceptance. Server expiry releases unanswered offers and advances generation. Retried old messages query original results. Gate new zone commitments while protecting existing work.</p><p>Clarify delivery type, platform acceptance, multi-order limit, punctuality and post-pickup handoff authority. This example prioritizes punctuality and sends each offer to one courier; a courier may occupy two distinct slots. Broadcast grabbing still needs the same transactional constraints.</p>')+
    '<details><summary><span class="lang-zh">展开 A1–A12：容量、时间与故障前提</span><span class="lang-en">A1–A12: capacity, timing and failure premises</span></summary>'+assumptions+'</details>\n'+bi(
    '<p>全部数字都是<strong>教学假设</strong>。A8 是单独的热区压力变体；三份拷贝只用于存储估算，不证明已确认派单不丢。A11 额外要求确认提交在切换后仍存在；无法确认权威就暂停新派。20 秒 offer、三次尝试和 120 秒匹配期限都是产品选择。</p>',
    '<p>All numbers are <strong>teaching assumptions</strong>. A8 is a separate stress variant. Three copies size storage without proving durable dispatch; A11 separately requires confirmed commits to survive failover. Pause new assignments without authority. The 20 s offer, three-attempt cap and 120 s match deadline are product choices.</p>')))

parts.append(section('先分别估订单、位置与用户出口','Size orders, location and viewer egress separately',bi(
    '<p>订单平均 <code>500,000÷86,400≈5.79/s</code>，10 倍峰值约 <strong>57.87/s</strong>。首轮每单召回 20 人是约 1,157 人次/s，过滤后 8 人去一个取货点是约 463 个路耗元素/s；元素不是 HTTP 调用数，重试另算。</p><p>10,000 名在线骑手每 5 秒上报一次是 <strong>2,000 点/s</strong>；200 B/点给出 0.4 MB/s = 3.2 Mb/s 原始负载。若到每人 1 Hz，变成 10,000/s 和 2 MB/s，均为五倍；是否承受得住要压测写放大和连接开销，位置和业务控制分别留配额。</p><p>3,000 名观看者每 5 秒最多推一票是 <strong>600 推送/s、120 KB/s</strong>。骑手与观看连接合计 13,000 条，连接预算不能用消息速率代替。按订单订阅，避免全城 2,000×3,000 = 600 万次点投递/s。</p>',
    '<p>Orders average 500,000/86,400≈5.79/s, about <strong>57.87/s</strong> at 10× peak. Twenty recalled couriers give 1,157 candidate visits/s; eight retained origins to one pickup give about 463 route elements/s. Elements are not HTTP calls; retries add load.</p><p>10,000 couriers reporting every 5 s produce <strong>2,000 points/s</strong>. At 200 B, payload is 0.4 MB/s = 3.2 Mb/s. One Hz produces 10,000/s and 2 MB/s, both 5×. Measure index amplification and connection costs; isolate location and control quotas.</p><p>3,000 viewers limited to one point per 5 s require <strong>600 pushes/s and 120 KB/s</strong>. The 13,000 courier/viewer connections need a separate budget. Order-scoped subscriptions avoid 2,000×3,000 = six million citywide point deliveries/s.</p>')+
    '<details><summary><span class="lang-zh">最新点与历史留存：展开存储算式</span><span class="lang-en">Latest points versus history: storage arithmetic</span></summary>'+bi(
    '<p>最新详情负载 10,000×500 B = 5 MB，不含索引、对象开销和复制。若在线数全天不变并全量留点，2,000×86,400×200 B = 34.56 GB/天；真实在线数应按时间积分。履约行 500,000×2 KB = 1 GB/天，30 天三份为 90 GB；attempt、Outbox、日志、备份另算。均用十进制 KB/GB。</p>',
    '<p>Latest details are 10,000×500 B = 5 MB before indexes, object overhead and replication. Constant all-day online count with complete retention gives 34.56 GB/day; integrate real online counts over time. Fulfillment rows are 1 GB/day, or 90 GB for 30 days and three copies. Attempts, outbox, logs and backups are extra. Units are decimal.</p>')+'</details>'))

parts.append(section('履约入口：持久事实先于通知','Fulfillment: durable facts precede delivery',decks[0]+bi(
    '<p>用已认证上游的 <code>(scope, upstream_order)</code> 创建履约，绑定规范化订单摘要；同身份同内容回原单，改内容则冲突。支付确认来自服务端持久事实。一个事务写 pending_match、generation=7、匹配期限与待匹配 Outbox，提交后 202 只表示工作可恢复。提交响应丢失是未知，重试固定身份，不能新建第二笔。</p><p>Match 读新鲜位置只是旁支；Fulfillment DB 才保存当前 attempt 和槽位。Gateway 合并画出 Outbox relay 与设备通道，只发已提交 offer，重复投递仍需消费者去重。设备重连先拉当前快照；传输 ACK 不等于业务接单。<a href="#ref5">[5]</a></p>',
    '<p>Create with authenticated upstream (scope, upstream_order), bound to a canonical order digest. Identical retries return the original order; changed content conflicts. Payment confirmation comes from durable server facts. One transaction stores pending_match, generation 7, deadline and match outbox. A committed 202 means recoverable work. A lost commit reply is unknown: retry the fixed identity.</p><p>Fresh location is an advisory branch; Fulfillment DB owns current attempts and slots. Gateway combines the outbox relay/device channel, sends committed offers and tolerates duplicates with consumer deduplication. Reconnect fetches the current snapshot. Transport ACK is not acceptance. <a href="#ref5">[5]</a></p>')+
    title('双边唯一落在哪个键上','Where bilateral uniqueness lives',3)+bi(
    '<p>订单保留 state、generation、current_attempt、attempt_count 和 match_deadline；attempt 保留骑手、截止点、原回执与配置版本。<code>active_slot</code> 把槽位绑定到当前单：同一订单只能有一个活动占位，同一骑手的同一槽位只能有一单。骑手可有两个槽位，所以不能直接给 courier_id 加唯一约束。occupied 与槽位计数必须同事务维护；行内 CHECK 不能证明跨表一致。<a href="#ref2">[2]</a></p>',
    '<p>Orders retain state, generation, current attempt, attempt count and match deadline; attempts retain courier, deadline, original receipts and configuration version. active_slot uniquely binds both order and courier slot. A courier has two slots, so courier_id alone is not unique. Maintain occupied with slot rows in one transaction; a row CHECK cannot prove cross-table consistency. <a href="#ref2">[2]</a></p>')+
    block('keys.sql','SQL · executable SQLite constraints','runnable')+bi(
    '<p>代码是教学约束；完整父表和可执行适配见 <a href="../examples/ch27/README.md">examples/ch27</a>。生产需限制所有写者走相同路径，批量操作按固定顺序锁全部订单再锁骑手行，死锁/序列化中止整笔重试。位置详情是另一份可重建投影，不能替代这些键。</p>',
    '<p>These teaching constraints have complete parent tables and an executable adapter in <a href="../examples/ch27/README.md">examples/ch27</a>. All production writers must follow the same path. Batch operations lock orders then courier rows consistently and retry whole aborted transactions. Location details remain a separate rebuildable projection.</p>')))

parts.append(section('候选与打分：分数之后仍要预占','Recall and scoring still end in a reservation',decks[1]+bi(
    '<p>按取货点附近格子或 GEO 限量召回、去重、批读详情，排除旧会话、过期点、资质不符、暂停与满载者。Redis GEOSEARCH 提供半径/方框召回，没有配送运力语义；地理最近也可能在河对岸。<a href="#ref3">[3]</a> 朝向一般是软特征，过期位置则是硬门限。</p><p>先过滤到 8 人再计算 8×1 个路耗元素；Google Routes 支持整请求或单元素错误。gRPC 流式结果明确不保证顺序，REST 不支持该流式方式；按返回的起终点索引归位，缺失/失败元素不能当零。<a href="#ref6">[6]</a> 成本 <code>J=到店分钟+4×迟到风险+2×负载</code>：A 为 2+2+2=6，B 为 4+0.4+0=4.4，选 B；系数是分钟等价惩罚的教学取值。</p><p><strong>评分不是锁。</strong>路耗返回时 B 的名额可能已被别的区占走。下面重新锁订单和同一骑手容量行，检查当前代次、预算与槽位，然后提交双方占位、offer 与事件。候选详情在预占前重读，其服务端新鲜度截止点带进事务，等锁后已过期就重选。位置是读时快照，断线仍可能发生在检查之后；它不与履约跨库原子提交。发生冲突重新选人；不要拿着数据库锁调用 Routing。<a href="#ref1">[1]</a></p>',
    '<p>Bound recall around pickup through cells/GEO, deduplicate and batch-load details. Reject wrong sessions, stale, ineligible, paused or full couriers. GEOSEARCH supplies radius/box recall without delivery capacity semantics; nearby can mean across a river. <a href="#ref3">[3]</a> Heading is usually soft; stale location is a hard gate.</p><p>Filter to eight before calculating eight route elements. Google Routes can fail a whole request or individual elements. gRPC streaming explicitly permits unordered results; REST does not support that streaming mode. Map origin/destination indexes and never treat missing/error elements as zero. <a href="#ref6">[6]</a> J=pickup minutes+4×late risk+2×load gives A=6 and B=4.4. The minute-equivalent weights are teaching choices.</p><p><strong>Scoring is not locking.</strong> Another zone can occupy B while Routing runs. Lock order and the same capacity row, recheck generation/budget/slots and commit reservation, offer and event together. Re-read candidate details before reservation and carry server-derived validUntil into the transaction; reject if lock waits exhaust it. This is a read-time location snapshot: disconnection can still follow the check, without a cross-store atomic promise. Rematch on conflict; never hold DB locks across Routing calls. <a href="#ref1">[1]</a></p>')+
    block('reserve.pseudo','Pseudocode · PostgreSQL-shaped reservation')+bi(
    '<p>所有区域借来的 B 都回同一容量权威。offer 已占位，accept 不再加一；完成或合法释放才减一。固定 attempt 重投回原回执和当前快照，已经过期的 offer 不会复活。公平可在满足硬门限后按等待年龄打破同分；一秒批量窗口可改善贪心匹配，但等待也要计入 120 秒期限。</p>',
    '<p>Borrowed B always uses the same capacity authority. Offer consumes a slot; accept does not add another. Completion or valid release decrements once. Same-attempt retries return the original receipt and current snapshot without reviving an expired offer. Fairness can tie-break by age; a one-second batch can improve greedy matching but consumes the 120 s budget.</p>')))

parts.append(section('accept 与到期：同一事务决定谁赢','Acceptance and expiry serialize in one authority',decks[2]+bi(
    '<p>图中的 v7 就是订单 generation。accept、拒绝和到期都先锁同一订单，再锁相同容量行；数据库提交才决定状态。<strong>先校验 attempt 绑定与骑手身份，再回放原成功。</strong>历史 accept 回执附带当前快照：后来取消、完成或改派时，它只证明曾接受，不能让旧设备继续取送。</p><p>锁后读取实际数据库时间。PostgreSQL 的 <code>now()/CURRENT_TIMESTAMP</code> 固定在事务开始，等锁后可能已过期；<code>clock_timestamp()</code> 才取调用时刻。<a href="#ref11">[11]</a> 普通 Read Committed SELECT 也不是互斥锁。<a href="#ref10">[10]</a> 权威墙钟需监控与误差约束，时间异常时暂停相关转换；generation 的单调性独立于墙钟。截止点约定 <code>accept: now&lt;deadline</code>，<code>expire: now≥deadline</code>，没有双方都能成功的间隙。</p>',
    '<p>Diagram v7 is the order generation. Accept, reject and expiry lock the same order then capacity row; DB commit decides state. <strong>Validate attempt bindings and courier identity before replaying success.</strong> A historical acceptance includes the current snapshot. After cancellation/completion/reassignment, it proves prior acceptance without renewing execution rights.</p><p>Read actual DB time after locking. PostgreSQL now()/CURRENT_TIMESTAMP retain transaction-start time, possibly before a lock wait crosses the deadline; clock_timestamp() observes call time. <a href="#ref11">[11]</a> A plain Read Committed SELECT is not mutual exclusion. <a href="#ref10">[10]</a> Monitor and bound authoritative wall-clock error; pause time-sensitive transitions when uncertain. Generation monotonicity is independent of wall time. Accept uses now&lt;deadline and expiry now≥deadline.</p>')+
    block('decide.pseudo','Pseudocode · accept / reject / expire')+bi(
    '<p>accept 先赢：offered→assigned，占用仍为 1，后续到期扫描无效。到期先赢：a1=expired，订单 pending_match、v7→v8，释放一次并写重匹配事件；旧 a1/v7 接单返回冲突。每次新派用新 attempt；三次 20 秒仅是 60 秒等待，召回、路耗、队列还消耗剩余匹配预算。</p>',
    '<p>Acceptance first changes offered→assigned, keeps one occupied slot and makes expiry a no-op. Expiry first marks a1 expired, releases once, advances 7→8 and persists rematching; old a1/v7 conflicts. New dispatch gets a new attempt. Three 20 s waits consume 60 s before recall, routing and queue time.</p>')+
    title('取消和改派必须先确认实物归属','Cancellation and reassignment require custody control',3)+bi(
    '<p>未接 offered 可直接取消；pending_match 取消只需锁订单、写终态和事件。assigned 之后的取消不能只看数据库“还没报 pickup”：骑手可能已拿餐而回报延迟。先由有权限的运营流程核实撤销/交接、取得绑定本单/attempt/代次的可信凭据，再释放槽位。已取餐更要完成实物交接。GPS 断线和工作租约到期都不是这种凭据。</p>',
    '<p>An unanswered offer can be cancelled; pending cancellation only locks the order and commits terminal state/event. After acceptance, absence of a pickup upload does not prove food remains at the restaurant. Authorized operations must verify cancellation/handoff with evidence bound to order/attempt/generation before releasing capacity. GPS loss and worker lease expiry are not custody evidence.</p>')+
    block('release.pseudo','Pseudocode · custody transitions and release')+bi(
    '<p>本地事务把凭据去重、状态、槽位释放和持久事件绑在一起，不能替外部世界保证交接。例子的可信凭据由显式适配契约提供。attempt、原回执和 generation 不随短 TTL 清除；归档也须让未知旧身份只能查询/拒绝，防止备份恢复或晚到命令被当成新工作。</p>',
    '<p>The transaction binds evidence deduplication, state, release and durable event; it cannot itself prove a physical handoff. Trusted evidence is an explicit adapter dependency. Do not expire attempt identities, original receipts or generations with short TTLs. Archived unknown old identities must query/reject rather than become new work after delayed commands or backup restoration.</p>')))

parts.append(section('位置：会话、排序与新鲜度分别验证','Location: validate session, order and freshness separately',decks[3]+bi(
    '<p>epoch 由服务端单调分配并保留在点 TTL 之外；每次重连都换新 epoch、清旧点并重新采样。断线事件必须带 epoch 做条件更新，旧连接的延迟断线不能关闭新会话。序号只在当前会话内比较；客户端不能自选更大 epoch。业务在线、连接存活与 GPS 新鲜是三个字段。</p><p>下列伪代码描述单个骑手会话记录的存储事务/CAS。重复或迟到 seq 返回当前序号，<strong>不改 captured_at、received_at 或 TTL</strong>；较高 seq 的旧采样也要先拒绝。节流在此之前按骑手和区域执行，控制动作有独立配额。静止心跳维持 liveness，不能把旧 GPS 洗成新点。</p>',
    '<p>The server durably advances epoch beyond point TTL. Every reconnect gets a new epoch, clears the old point and requires a new sample. Disconnect updates match epoch, so an old delayed disconnect cannot close the new session. Sequence ordering applies within the current session; clients cannot select epochs. Business availability, connection liveness and GPS freshness are separate fields.</p><p>This pseudocode uses a per-courier storage transaction/CAS. Duplicate or older sequences return the current sequence <strong>without changing capture/receipt time or TTL</strong>. A higher sequence with stale capture also fails. Apply courier/zone throttling before this step and isolate control quotas. Stationary heartbeats maintain liveness without refreshing old GPS.</p>')+
    block('location.pseudo','Pseudocode · location session transaction')+
    title('把 ±5 秒误差写进代码','Include the ±5 s clock uncertainty',3)+bi(
    '<p>A6 假设采集时钟相对服务端误差可证明不超过 ±5 秒。保守年龄上界为 <code>now−captured+5s</code>，要求 ≤30 秒；同时拒绝 <code>captured&gt;now+5s</code> 的明显未来点，因此可接受区间是 <code>−5s≤now−captured≤25s</code>。误差界不可信就排除；这不是防伪造 GPS 的物理证明。</p><p>下面是完整可运行 Java 17 纯校验类，包含边界自检；不提供时钟同步或分布式 CAS。读候选时再次按当前时间计算，不能用 60 秒回收 TTL 当 30 秒业务新鲜度。</p>',
    '<p>A6 assumes a defensible relative clock-error bound of ±5 s. Conservative age is now−captured+5 s≤30 s, while captured&gt;now+5 s is rejected. Thus −5 s≤now−captured≤25 s. Exclude unbounded clocks; this is not physical proof against spoofed GPS.</p><p>This complete runnable Java 17 pure validator includes boundary checks, without clock synchronization or distributed CAS. Recompute freshness at candidate read time; the 60 s cleanup TTL does not replace the 30 s business age bound.</p>')+
    block('LocationGate.java','Java 17 · runnable class','runnable')+bi(
    '<p>Redis EXPIRE 是键级到期：详情键过期不会删除另一 GEO 键里的成员，给整个 GEO 键设 TTL 又会删掉所有成员。<a href="#ref4">[4]</a> 投影事件携 epoch/seq，处理前比当前详情，旧迁移/清理不能覆盖新成员；跨格先补新成员再条件删旧成员，短暂重复去重。漏事件由周期扫描当前有效详情修复；灾后不回放五分钟前旧点。索引只提供 IDs，最终仍核对详情、真实格子与权威容量。</p>',
    '<p>EXPIRE operates on a key: expiring details does not remove a member in another GEO key, while expiring the whole GEO key removes everyone. <a href="#ref4">[4]</a> Fence projection events/cleanup by epoch/sequence against current details. Add the new cell before conditionally deleting old membership and deduplicate temporary copies. Periodic reconciliation repairs dropped events from currently valid details rather than replaying old points. Index IDs still require detail/cell and authoritative capacity checks.</p>')))

parts.append(section('轨迹与 ETA：位置可丢，履约状态可恢复','Tracking and ETA: lossy points, recoverable fulfillment',decks[4]+bi(
    '<p>订阅 o7 先验归属与当前 attempt，结束或改派时撤销/重绑授权；推送携 generation、attempt、epoch、seq。重连先拉授权后的当前快照，客户端拒绝旧代次。严格隐私要求还要在服务端发送门处核验权限/短期授权：已发进网络的数据不能因数据库换版本被收回。</p><p>骑手双向通道可用 WebSocket；用户单向观看可用 SSE，EventSource 支持重连与 Last-Event-ID，但不自动保存完整历史。<a href="#ref8">[8]</a><a href="#ref7">[7]</a> 每连接只有一个“最新位置”槽位，慢端覆盖旧点；delivered、cancelled、reassigned 走持久控制状态/事件，不能被位置覆盖，也不能由一条轨迹推断送达。</p>',
    '<p>Authorize order ownership/current attempt before subscribing; revoke/rebind after completion or reassignment. Pushes carry generation, attempt, epoch and sequence. Reconnect fetches an authorized current snapshot, and the client rejects old generations. Strict privacy also checks authorization at the server send gate or bounds grants; a DB version change cannot retract bytes already in flight.</p><p>WebSocket can carry courier bidirectional traffic; SSE suits one-way viewers. EventSource supports reconnection/Last-Event-ID without automatic complete history. <a href="#ref8">[8]</a><a href="#ref7">[7]</a> A slow viewer keeps only the latest point. Delivered/cancelled/reassigned use durable control state/events, never the overwriteable location slot or inferred movement.</p>')+
    title('到店与出餐并行，降级不能制造新事实','Parallel preparation and travel; honest degradation',3)+bi(
    '<p>未取餐：到店 4 分钟、出餐剩 6 分钟、到户 8 分钟，则 <code>ETA=max(4,6)+8=14 分钟</code>；相加为 18 重复算了并行等待。取餐后只算剩余送达路径，多单要包含已有停靠并保护先前承诺。</p><p>本地 Routing 等待预算耗尽不代表它回复失败。优先用仍有效且绑定当前 attempt、阶段、起终点和交通上下文的缓存，标低可信；单元素失败、缓存过期/错上下文则 ETA 暂不可用，不能把缺失路耗填零。直线距离÷假设速度只是粗参考。位置过期显示最后更新时间，并停止把它用于新派单。</p>',
    '<p>Before pickup, 4 min travel, 6 min remaining preparation and 8 min delivery give ETA=max(4,6)+8=14 min. Adding 18 double-counts concurrent waiting. After pickup use remaining travel; multiple orders include existing stops and protect prior promises.</p><p>Exhausting the local Routing wait budget is not a failure reply. Prefer valid cached durations bound to current attempt, phase, endpoints and traffic context, labelled low-confidence. Missing elements or expired/wrong-context cache mean unavailable ETA, never zero duration. Distance/speed is only a rough fallback. Display stale point age and exclude stale points from new matching.</p>')))

parts.append(section('饭点运力：有界积压与持久恢复','Peak supply: bounded backlog and durable recovery',decks[5]+bi(
    '<p>在 A8 的<strong>恒定教学速率</strong>下，20/s 到达、12/s 可行派单，净增 8/s；初始 600 个队列空位约 75 秒耗尽。邻区从同一容量权威最多借 2/s 后，净增仍 6/s；若从相同初始空位重算，是 600÷6=100 秒，不是永久稳定。到达降到 ≤14/s 才不继续增长，清掉存量则需严格低于服务率。服务率指可行派单，不是 worker 消费速率。</p><p>队列只索引 DB 的 pending_match。按区域限制并发、优先老单/承诺期限；丢队列消息、worker 崩溃仍从权威行扫描，重复任务必须带 generation。下面将扫描候选与锁内重验分开，不能让旧扫描结果越过已接受/已取消状态。</p>',
    '<p>At A8’s <strong>constant teaching rates</strong>, 20/s arrivals and 12/s feasible assignments grow backlog by 8/s, filling 600 initial free slots in about 75 s. Borrowing 2/s through the same capacity authority still grows 6/s; the same initial 600 slots then last 100 s, without stability. Arrival≤14/s stops growth; draining requires less. Service means feasible assignments, not worker dequeue speed.</p><p>The queue indexes durable pending rows. Bound per-zone concurrency and prioritize age/promise deadlines. Recover lost queue deliveries or workers by scanning authoritative rows; duplicate work carries generation. Scan candidates and revalidate under locks so stale scans cannot override acceptance/cancellation.</p>')+
    block('recovery.pseudo','Pseudocode · bounded recovery scan')+bi(
    '<p>新单在支付前取短期运力报价；超限可显示运力不足，真正的请求速率限制可用 429 与可选 Retry-After。<a href="#ref9">[9]</a> 报价不是骑手槽位，提交仍会竞争。已承诺订单不能用 429 丢掉，三次/120 秒耗尽要写失败与通知/补偿意图。</p><p>支付已确认、履约创建响应未知时，按固定上游身份查询/重试。决定撤销则先由履约权威写“不可再创建或派单”的取消栅栏：尚未建单也留该身份 tombstone，再发固定补偿键；只查到暂时不存在不足以退款。若已接受/取餐，先转受控处置，不能用退款抢跑实物流程。</p><p>故障先降低非必要点流、限制 Routing 并发、收紧新准入；位置权威失效暂停新候选，履约权威失效停止新预占/accept。恢复重试带抖动与区域配额，已有实物仍由当前骑手保管。</p>',
    '<p>Quote short-lived supply before payment. Show supply failure when overloaded; actual request-rate limits may use 429 with optional Retry-After. <a href="#ref9">[9]</a> A quote is not a courier slot. Never discard committed work with 429; exhausted attempts/deadlines persist failure and notification/compensation intent.</p><p>After confirmed payment with unknown fulfillment creation, query/retry the fixed upstream identity. Before compensation, the fulfillment authority fences future creation/dispatch with a cancellation tombstone, including when no row exists, then emits a fixed compensation key. Temporary absence alone is insufficient. Accepted/picked custody requires controlled handling before funds race ahead.</p><p>Reduce optional point traffic, bound Routing concurrency and tighten new admission. Location authority failure pauses new candidates; fulfillment authority failure stops reservation/acceptance. Recover with jitter and zone quotas while current couriers retain custody.</p>')+
    '<details><summary><span class="lang-zh">示例运行与验证范围</span><span class="lang-en">Running the examples and validation scope</span></summary>'+bi(
    '<p><code>node examples/ch27/sync.mjs --check</code> 校验页面七段代码同源；<code>PYTHONDONTWRITEBYTECODE=1 python3 examples/ch27/check.py</code> 真实执行 SQLite 双连接竞争/回滚、Java 17 校验和隔离 Redis 键 TTL 实验。SQLite 用 BEGIN IMMEDIATE 串行化写者，锁粒度比 PostgreSQL 粗；<a href="#ref12">[12]</a> 未验证生产行锁、复制切换、实际骑手/地图接口或压测，可信时钟与实物凭据仍是适配前提。</p>',
    '<p>Run node examples/ch27/sync.mjs --check for seven shared-source snippets, then PYTHONDONTWRITEBYTECODE=1 python3 examples/ch27/check.py for actual SQLite competitions/rollback, Java 17 validation and isolated Redis key TTL. SQLite BEGIN IMMEDIATE serializes writers more coarsely than PostgreSQL. <a href="#ref12">[12]</a> Production row locks, replication/failover, live couriers/routing and load are untested; clock/custody evidence remain adapter premises.</p>')+'</details>'))

traps=re.search(r'<h2><span class="lang-zh">八个翻车点与追问[\s\S]*?(<table>[\s\S]*?</table>)',base).group(1)
parts.append(section('复盘：讲清一笔超时竞争','Review: walk one expiry race',traps+bi(
    '<p>收尾沿 o7/a1/v7 口述：持久建单→新鲜召回→双方预占→accept 与到期锁内竞争→v8 拒绝旧动作→当前骑手取送。再复算 20−12=8/s、600÷8=75 秒，指出 CPU 扩容不能创造骑手供给。空间索引回 <a href="ch19.html">Ch19</a>，消息回 <a href="ch20.html">Ch20</a>，资金补偿回 <a href="ch24.html">Ch24</a>，工作租约回 <a href="ch25.html">Ch25</a>；配置版本见 <a href="ch28.html">Ch28</a>。</p>',
    '<p>Walk o7/a1/v7: durable create→fresh recall→bilateral reservation→locked accept/expiry race→v8 fences old actions→current courier pickup/delivery. Recalculate 20−12=8/s and 600/8=75 s, explaining why CPU cannot create courier supply. Revisit <a href="ch19.html">Ch19</a> spatial recall, <a href="ch20.html">Ch20</a> messaging, <a href="ch24.html">Ch24</a> compensation, <a href="ch25.html">Ch25</a> worker leases and <a href="ch28.html">Ch28</a> configuration versions.</p>')))

refs=re.search(r'<ol class="references">[\s\S]*?</ol>',base).group()
refs=refs.replace('</ol>',
    '<li id="ref11">[11] PostgreSQL, <a href="https://www.postgresql.org/docs/18/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT" target="_blank" rel="noopener noreferrer">Date/Time functions · PostgreSQL 18</a>. <span class="lang-zh">now 是事务开始时刻；clock_timestamp 是调用时刻。</span><span class="lang-en">Transaction-start now versus actual clock_timestamp.</span></li>\n'
    '<li id="ref12">[12] SQLite, <a href="https://www.sqlite.org/isolation.html" target="_blank" rel="noopener noreferrer">Isolation in SQLite</a>; <a href="https://www.sqlite.org/lang_transaction.html" target="_blank" rel="noopener noreferrer">Transactions</a>. <span class="lang-zh">单写者与 BEGIN IMMEDIATE；不证明 PostgreSQL 行锁。</span><span class="lang-en">Single writer and BEGIN IMMEDIATE; not PostgreSQL row-lock proof.</span></li>\n</ol>')
parts.append(section('引用与适用边界','References and scope',refs+bi(
    '<p>以上标准和官方文档支持协议、数据库与 API 机制。58/s、463 元素/s、14 分钟和 75/100 秒均由本章假设推导；没有当成厂商生产成绩。原文核对与运行限制见 <a href="../docs/reviews/ch27-sources.md">来源记录</a>。</p>',
    '<p>Official documentation supports protocol, database and API semantics. 58/s, 463 elements/s, 14 min and 75/100 s are chapter calculations rather than vendor production results. See the <a href="../docs/reviews/ch27-sources.md">source record</a> for checked claims and limits.</p>')))

cards=re.search(r'<div class="cards-grid">[\s\S]*?</div></section>',base).group().replace('</div></section>','')
cards=cards.replace('同 attempt 查原成功，即使重试晚于 offer 截止点；不重新加容量。','先验骑手与 attempt 绑定，再回原成功和当前快照；后来改派不能恢复旧执行权，也不再加容量。')
cards=cards.replace('Replay stored success for the same attempt even after deadline; do not occupy twice.','Validate actor/binding; replay original success plus current snapshot. Reassignment never revives old rights or occupies twice.')
cards=cards.replace('排序验 epoch/seq，新鲜度验采集年龄与时钟误差。','排序验 epoch/seq；±5 秒误差下要求 −5≤now−captured≤25 秒，且在线/精度通过。')
cards=cards.replace('Validate ordering and capture-age bounds separately.','Validate epoch/seq and −5≤now−captured≤25 s under ±5 s skew, plus online/accuracy gates.')
extra=[('为什么不对 courier_id 直接加唯一约束？','Why not make courier_id unique?','本章每人两槽位；(courier,slot) 与 order_id 分别唯一，双方占位同事务。','A courier has two slots. Unique (courier,slot) and order_id bind both sides in one transaction.'),('旧断线消息会关闭新连接吗？','Can an old disconnect close a new session?','重连换服务端 epoch；断线按 epoch 条件更新，旧消息不影响新会话。','Reconnect advances server epoch. Conditional disconnect cannot affect the newer session.'),('借 2/s 后 600 空位能撑多久？','How long do 600 slots last after borrowing 2/s?','同初始空位、恒定速率下 600÷(20−14)=100 秒；净增仍 6/s，不稳定。','At the same initial free capacity and constant rates: 600/(20−14)=100 s; growth remains 6/s.')]
for qz,qe,az,ae in extra:
    cards+=f'<button class="flip" type="button"><span class="q"><span class="lang-zh">{qz}</span><span class="lang-en">{qe}</span></span><span class="a"><span class="lang-zh">{az}</span><span class="lang-en">{ae}</span></span></button>\n'
parts.append(section('闪卡：把失败窗口与算式说出来','Flashcards: state the race and arithmetic',
    '<p><span class="lang-zh">点击翻面，先说权威与原子边界，再说恢复。</span><span class="lang-en">Click to flip. Name authority and atomic scope, then recovery.</span></p>'+cards+'</div>'))

prefix=base[:base.index('<section class="goal">')]
suffix=base[base.index('<button class="read-toggle"'):]
output=prefix+'\n'.join(parts)+suffix
assert len(re.findall(r'<svg\b',output))==31
assert len(re.findall(r'<pre\b',output))==7
if check_mode:
    assert output == page.read_text(), 'Final rewrite and page differ'
else:
    page.write_text(output)
print('Ch27: retained 6 decks / 31 frames; 7 shared-source code blocks')
