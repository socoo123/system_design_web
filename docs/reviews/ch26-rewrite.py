"""Chapter-specific rewrite preserving all six baseline animation decks."""
from pathlib import Path
import hashlib
import html
import re

ROOT = Path(__file__).resolve().parents[2]
source = ROOT/'docs/reviews/ch25-ch26-ch27-baseline/ch26.html'
original = source.read_text()
figs = re.findall(r'<figure class="deck">[\s\S]*?</figure>', original)
assert len(figs) == 6

def b(zh, en):
    return f'<div class="bilingual"><div class="lang-zh"><p>{zh}</p></div><div class="lang-en"><p>{en}</p></div></div>\n'

def h(level, zh, en):
    return f'<h{level}><span class="lang-zh">{zh}</span><span class="lang-en">{en}</span></h{level}>\n'

def section(zh, en, body, cls=''):
    return f'<section{(" class="+chr(34)+cls+chr(34)) if cls else ""}>\n'+h(2,zh,en)+body+'</section>\n'

def code(file, language, kind, snippet=None):
    content=(ROOT/'examples/ch26'/file).read_text()
    extra=''
    if snippet:
        content=content.split(f'// BEGIN page:{snippet}\n')[1].split(f'    // END page:{snippet}')[0]
        lines=content.rstrip().splitlines()
        content='\n'.join(line[4:] if line.startswith('    ') else line for line in lines)
        extra=f' data-snippet="{snippet}"'
    return f'<pre data-language="{language}" data-kind="{kind}" data-source="{file}"{extra}><code>{html.escape(content.rstrip())}</code></pre>\n'

# Keep IDs/frame order; repair only the identified local labels and timer path.
for i in (0,5):
    figs[i]=re.sub(r'<rect x="96" y="18" width="(\d+)"',
                   lambda m:f'<rect x="72" y="18" width="{int(m[1])+24}"',figs[i])
figs[5]=figs[5].replace('<text x="280" y="232" class="tiny">projection missing / rolled back</text>',
                      '<text x="280" y="214" class="tiny">projection lost / rolled back</text>')
figs[5]=figs[5].replace('<text x="280" y="253" class="tiny">pause new claims; query durable receipts</text>',
                      '<text x="280" y="235" class="tiny">pause claims; query receipts</text>')
figs[3]=figs[3].replace('Payment API times out toward Relay while the ledger may already have committed.',
                      'A local Relay timer fires without a Payment API reply; the ledger may already have committed.')
figs[3]=figs[3].replace('M600 215 L600 252 Q600 260 592 260 L383 260 Q375 260 375 252 L375 225',
                      'M410 215 L410 252 Q410 260 402 260 L338 260 Q330 260 330 252 L330 225')
figs[3]=figs[3].replace('points="375,215 380,225 370,225"','points="330,215 335,225 325,225"')
figs[3]=figs[3].replace('timeout -&gt; retry the same c7','Relay timer; no Payment reply')
figs[3]=figs[3].replace('红线停在 Relay：超时不证明 400 分没入账。','红色回环是 Relay 本地 timer，没有收到 Payment API 回复；它不证明 400 分没入账。')
figs[3]=figs[3].replace('The failure stops at Relay: timeout does not prove no credit.',
                      'The red loop is Relay’s local timer with no Payment API reply; it does not prove no credit.')

body=''
body+=section('本章核心：钱守恒、承诺持久、旧工作失效','Core: conserve money, persist receipts, fence old work',
 b('三个问题贯穿同一笔 1,000 分：四份怎样恰好加回总额？一个人换请求键能否领第二份？最后一抢、退款和 Redis 重建怎样共享同一个持久裁决点？保留六组演进图，代码跟在相应机制旁。',
   'Follow the same 1,000 cents through three questions: how do four shares conserve the total, can a user win again with another request key, and how do the last claim, refund and Redis recovery share one durable authority? Six existing decks remain, with code beside each mechanism.')+
 b('<strong>候选 ≠ 领取凭据 ≠ 已入账。</strong>Lua 只选份额；Packet DB 同事务保存领取、两维库存和 Outbox 后才回 200；Payment Ledger 再完成资金效果。接下来每一个故障分支都要说清停在哪一层。',
   '<strong>Candidate ≠ durable receipt ≠ credited funds.</strong> Lua selects a share; Packet DB commits the claim, both inventory dimensions and outbox before 200; Payment Ledger later posts the effect. Every failure branch must identify which layer has committed.'),'goal')

rows=[
('场景与成功','Scenario and success','单地域、单币种 CNY 群包；登录和群资格由服务端验证；200 表示持久领取，余额可仍在途。','Single region, CNY group packets; server-verified identity/membership. 200 is a durable claim; credit may remain pending.'),
('规模假设','Scale assumptions','100 万包/天、平均确认 10 份、每成功份额 5 次点击、日常峰值十倍；每包 1–100 份。','1M packets/day, ten confirmed shares/packet, five attempts/success, 10× ordinary peak, 1–100 shares/packet.'),
('独立热点与预算','Separate burst and budget','10,000 人在 1 秒抢 100 份；同包放行 100 新候选/s。假设串行确认 2 ms，计划利用率 60%。','10,000 users chase 100 shares in one second; admit 100 new candidates/s/packet. Assume 2 ms serial confirmation and 60% planning utilization.'),
('贯穿计划','Running plan','p9：1,000 分四份，s1=300、s2=400、s3=100、s4=200；打乱后仍保留身份。c7 领 s2=400。','p9: 1,000 cents, s1=300, s2=400, s3=100, s4=200. Shuffle preserves identity; c7 claims s2=400.'),
('金额与截止点','Amounts and deadline','整数分，最低每份 m≥1，总额≥N×m，上限 10¹² 分。创建意图时固定 UTC deadline=创建时刻+24 h，资金/安装/恢复延迟不顺延。','Integer cents, minimum m≥1, total≥N×m, cap 10¹² cents. Fix UTC deadline at intent creation +24 h; funding, installation and recovery delays never extend it.'),
('权威与保留','Authority and retention','DB 切主不得回退已确认领取，不能证明时停写。展示七天；资金幂等记录须覆盖旧命令仍可执行的完整期间。','DB failover must preserve acknowledged claims; stop writes without that authority. Display seven days; payment deduplication outlives every executable old command.'),
('字节假设','Byte assumptions','元信息 1 KB/包、领取行 200 B、金额本体 8 B/份、三份拷贝；均为十进制单位，计划/索引/WAL 另计。','1 KB metadata/packet, 200 B/claim, 8 B/amount, three copies, decimal units. Plans, indexes and WAL require additional space.')]
table='<table><thead><tr><th><span class="lang-zh">边界</span><span class="lang-en">Boundary</span></th><th><span class="lang-zh">本章教学假设</span><span class="lang-en">Teaching assumption</span></th></tr></thead><tbody>'
for zh,en,vz,ve in rows: table+=f'<tr><td><span class="lang-zh">{zh}</span><span class="lang-en">{en}</span></td><td><span class="lang-zh">{vz}</span><span class="lang-en">{ve}</span></td></tr>'
table+='</tbody></table>\n'
body+=section('先约定成功、金额范围与截止点','Define success, numeric range and deadline',
 b('我先做有限份额的社交群红包：资金确认后开放，金额预生成；Redis 接纳候选，DB 裁决领取，Outbox 驱动资金入账。到期按 DB 剩余退款，Redis 丢失则先推进代次再重建。普通包可以从 DB-only 起步，测量后再加投影。',
   'Start with a finite social-group packet: open after verified funding and pre-generate amounts. Redis admits candidates, DB confirms claims, and outbox drives credit. Refund durable remaining at expiry; fence generations before rebuilding Redis. Ordinary packets may start database-only and add the projection after measurement.')+table+
 b('以上是可修改的教学条件，2 ms 不是 PostgreSQL 压测结果，三份拷贝也不证明确认不丢。业务窗口从创建意图开始：资金结果未知就保持 pending_fund；若资金晚于 deadline 才确认，进入初始化后直接关闭退回全部未分配资金，不能开放或永久卡在 initializing。',
   'These are adjustable assumptions: 2 ms is not a PostgreSQL benchmark, and three copies do not prove receipt durability. The window starts at intent creation. Unknown funding stays pending_fund; funding confirmed after the deadline enters initialization and then closes/refunds the unallocated total, rather than opening or remaining stuck.'))

body+=section('容量：确认、点击与单包冲突分别计算','Capacity: separate confirmations, attempts and contention',
 b('每日确认 1,000,000×10=10,000,000，平均 ÷86,400≈115.74/s，十倍峰值约 1,157/s。每日点击 50,000,000，平均约 578.70/s，峰值约 5,787/s。后一组包含抢完、重复和无资格点击，不能全部变成确认锁队列。',
   '10,000,000 confirmations/day gives 115.74/s average and about 1,157/s at 10× peak. 50,000,000 attempts/day gives 578.70/s average and about 5,787/s peak. Sold-out, repeated and ineligible attempts should not all become confirmation lock waits.')+
 b('热点是另一个场景，不加到全国峰值：10,000−100=9,900 人至少无份可领，占 99%。2 ms 串行服务时间对应理论 500/s，60% 计划预算 300/s；100/s 接纳门限占理论能力 20%。仍须封顶排队、连接与锁等待，存储抖动时降门限；Lua 快不代表持久确认无限快。',
   'The separate hot burst leaves at least 9,900 users, or 99%, without a share. A 2 ms serial service assumption implies 500/s theoretical, 300/s at 60% planning, with 100/s admission using 20% of theoretical service. Bound queues, connections and lock waits; lower admission during stalls. Fast Lua does not remove durable serialization.')+
 '<details><summary><span class="lang-zh">存储复算与省略项</span><span class="lang-en">Storage arithmetic and exclusions</span></summary>'+b(
 '元信息 1M×1 KB=1 GB/天；领取行 10M×200 B=2 GB/天。七天原始行 (1+2)×7=21 GB，三份为 63 GB。金额数组最低 1M×10×8 B=80 MB/天；还没有 share_id、Redis 结构、Outbox/inbox、索引、WAL、备份及未结束资金记录。容量乘数不能代替本章的耐久承诺。',
 'Metadata is 1 GB/day; claims are 2 GB/day. Seven days gives 21 GB raw and 63 GB for three copies. Amount payload alone is 80 MB/day. Share IDs, Redis structures, outbox/inbox, indexes, WAL, backups and unresolved financial records are extra. Capacity copies cannot establish durable acknowledgment.')+'</details>')

body+=section('先把资金预留给本包，再开放','Reserve funding for the packet before opening',figs[0]+
 b('创建请求键按发送方作用域绑定总额、币种、份数、群、模式和 deadline：同键同载荷返回原 packet_id，改载荷冲突；并发插入由非空唯一约束收口。先保存不可变计划、pending_fund 和 fund:p9 Outbox，再回 202。重试读取既有计划，不能再次随机生成或再次扣款。',
   'Bind a sender-scoped create key to amount, currency, count, group, mode and deadline. Identical replay returns the original packet_id; changed payload conflicts; non-null uniqueness settles concurrent inserts. Commit the immutable plan, pending_fund and fund:p9 outbox before 202. Retry loads the existing plan instead of drawing or debiting again.')+
 b('资金侧将发送方可用余额转入本包 escrow，并把业务去重与平衡分录同事务提交；这是真正的资金预留。红包侧验证资金单身份、币种、金额与 APPLIED，才记 funded/initializing。初始化完成后开放；安装重试不得覆盖已消费的 List。资金确认与投影就绪有两个本地提交，期间宁可不可领。',
   'The ledger moves sender availability into packet escrow, committing deduplication and balanced entries together. That is the funding reservation. Verify operation identity, currency, amount and APPLIED before funded/initializing. Open after installation without resetting a consumed list on replay. Funding and projection readiness involve separate local commits and an availability window.')+
 b('HTTP 超时只说明结果未知：继续查询或重投 fund:p9，不换支付键、不猜成功开放。Outbox 与业务状态同库提交填住发送进程退出的洞 <a href="#ref3">[3]</a>；WAL 解释日志先于数据页的持久基础 <a href="#ref11">[11]</a>，不能独自保证异步切主不丢确认。',
   'HTTP timeout leaves an unknown result: query or replay fund:p9 without a new debit or speculative opening. Committing outbox with state closes the sender-crash gap <a href="#ref3">[3]</a>. WAL explains logging before data pages <a href="#ref11">[11]</a>, not lossless asynchronous promotion.'))

body+=section('整数拆分：每一步给剩余份额留最低金额','Integer splitting: preserve the minimum for every later share',figs[1]+
 b('设剩余金额 M、份数 N、最低每份 m，保持 M≥N×m。N>1 时取 U=min(⌊2M/N⌋, M−m×(N−1))，抽整数 a∈[m,U]；更新后 M−a≥m×(N−1)。N=1 直接取尽。因此每份≥m，总和恰为原总额。这是本章算法的归纳证明，图中 m=1。',
   'For remaining amount M, count N and minimum m, preserve M≥N×m. For N>1 draw integer a∈[m,U], where U=min(floor(2M/N),M−m×(N−1)). The next remainder still covers every later minimum. Exhaust the last share, proving per-share minimum and conservation by induction. The diagram uses m=1.')+
 code('SplitPlan.java','Java 17 · runnable pure function','runnable','split')+
 b('完整 <a href="../examples/ch26/SplitPlan.java">SplitPlan.java</a> 用 Java 17、无第三方依赖运行；上限 10¹² 使 2×money 和 minimum×(left−1) 都不溢出 long，先用 total/count 验最低额避免校验自身乘法溢出。测试注入固定种子方便复现；真实随机源及可审计抽签是另一个契约。<code>nextLong(origin,bound)</code> 的上界不含 bound <a href="#ref14">[14]</a>。',
   'The complete <a href="../examples/ch26/SplitPlan.java">SplitPlan.java</a> runs on Java 17 without dependencies. The 10¹² cap keeps intermediate products within long; checking minimum against total/count avoids validation overflow. Tests inject fixed seeds for reproducibility; real randomness and auditable lotteries require a separate contract. nextLong(origin,bound) excludes bound <a href="#ref14">[14]</a>.')+
 b('图中上界依次 500、466、299，取 300、400、100，最后 200，合计 1,000。均分 1,003 分四份是 251、251、251、250。固定 share_id 后打乱位置，不改变金额身份；重建只能加载原计划。均匀置换让固定计划各位置期望为 total/N，不代表所有合法拆分等概率，也不消除网络时延与接纳偏差。',
   'The bounds are 500, 466 and 299; draws 300, 400 and 100 leave final 200, totaling 1,000. Even splitting 1,003 yields 251,251,251,250. Shuffle fixed share IDs without changing amounts and recover only from that plan. Uniform permutation equalizes positional expectation within the plan, not all legal partitions or network/admission opportunity.'))

body+=section('Lua 选候选，持久事务才发领取凭据','Lua selects candidates; a durable transaction issues receipts',figs[2]+
 h(3,'候选原子范围：同一 Redis 执行窗口','Candidate atomic scope: one Redis execution window')+
 b('入口先鉴权、限流并查本用户持久领取，已有结果优先返回。下列是可在 Redis 7 执行的教学脚本：KEYS 显式传 meta/list/amounts/users，带同一 {p9} hash tag <a href="#ref1">[1]</a><a href="#ref5">[5]</a>；ARGV 的用户与 epoch 由服务端提供。候选按用户复用，缺键、坏类型和坏库存触发恢复。Redis 时间只作预过滤，最终截止由 DB 判定。',
   'Authenticate, gate, then prefer the user’s durable receipt. This Redis 7 teaching script explicitly receives meta/list/amounts/users keys sharing {p9} <a href="#ref1">[1]</a><a href="#ref5">[5]</a>. The server supplies user and epoch. Reuse a user candidate; missing keys, bad types or inventory trigger recovery. Redis time is an advisory filter; DB decides final eligibility.')+
 code('candidate.lua','Lua · Redis 7 teaching example','teaching')+
 b('Lua 不可交错不等于错误回滚，也不包含 DB 提交 <a href="#ref10">[10]</a>。脚本异常可能留下占位；不要超时就 LPush，因为另一 API 仍可能确认它。临时少领通过推进 epoch 后重建回收，DB 剩余仍能正确退款。Redis 剩余是“未预扣”，DB 剩余是“未确认”，在途候选使二者暂时不同。',
   'Noninterleaving Lua is neither rollback nor DB atomicity <a href="#ref10">[10]</a>. An error may strand a reservation. Never push it back merely after timeout while another API might confirm it. Fence and rebuild to recover availability; durable remaining still supports refunds. Redis tracks unreserved shares; DB tracks unconfirmed shares, with candidates explaining the difference.')+
 h(3,'T_claim：请求键与业务唯一性分别收口','T_claim: request identity and business uniqueness')+
 code('claim.pseudo','Pseudocode · Packet DB transaction','pseudocode')+
 b('这段伪代码明确展示 PostgreSQL READ COMMITTED 的锁顺序：先请求键行，再红包行，锁保持到事务结束 <a href="#ref4">[4]</a>。request 的非空 (user,key) 唯一且绑定 packet；claims 另设 (packet,user) 与 (packet,share) 唯一 <a href="#ref8">[8]</a>。所以同人同键竞争只有一个结果，换键也不能多领；同一用户把旧键换绑另一包会冲突。份额来自内部候选，金额从不可变计划读取，浏览器不能指定中奖金额。',
   'The pseudocode makes the PostgreSQL READ COMMITTED order explicit: request row, then packet row, held through transaction end <a href="#ref4">[4]</a>. Non-null (user,key) uniqueness binds the request to a packet; separate (packet,user) and (packet,share) uniqueness protects the business <a href="#ref8">[8]</a>. Same-key races converge, rotated keys cannot win again, and rebinding a user’s key to another packet conflicts. Candidates are internal; amounts come from the immutable plan.')+
 b('400 分扣减、claim、request 绑定、credit Outbox 有任何一步失败就全回滚。提交回复丢失时显示“结果查询中”，以同一用户/键查权威库；只处理已识别的唯一冲突，不把任意 DB 错误当成功。锁内不调资金 RPC、不等投递。已有领取在过期/重建后仍可查询；新候选必须通过当前状态、epoch 和锁内实际时间。',
   'Any failure rolls back the 400-cent debit, claim, request binding and outbox together. A lost commit reply stays query-pending and resolves by the same user/key at authority. Handle identified unique conflicts without interpreting arbitrary DB failures as success. No payment RPC or delivery wait belongs under the lock. Existing receipts survive expiry/recovery; new ones must pass state, epoch and actual locked-time checks.'))

body+=section('同一笔钱：预留、入账与退款共享资金池','One pool funds reservation, credit and refund',figs[3]+
 b('下面是账本教学事务契约，资金命令来自已提交且不可改的 Outbox，并由服务身份校验。不是任意客户端报一个新键就有动钱权限；credit:c7 绑定本包、u42、CNY、400 分，refund:p9 绑定关闭快照和发送方。资金侧还保持效果身份唯一与余额下界。',
   'This teaching ledger transaction consumes authenticated, immutable committed outbox commands. A caller cannot authorize money movement merely by inventing a key. credit:c7 binds packet, u42, CNY and 400 cents; refund:p9 binds the close snapshot and sender. The receiver also enforces effect uniqueness and the escrow lower bound.')+
 code('ledger.pseudo','Pseudocode · Payment Ledger transaction','pseudocode')+
 b('T_claim 与 T_pay 是两个本地事务；Outbox 可能在账本提交后、Relay 记进度前重复投递 <a href="#ref3">[3]</a>。账本内去重、余额变化、完整两条分录与 APPLIED 同提交；失败整体回滚。同键不同金额/收款人冲突。Relay 只拿匹配权威结果更新进度，投递标记不能冒充入账事实。真实身份校验、渠道和账本权限是依赖，不由伪代码中的参数名实现。',
   'T_claim and T_pay are separate local transactions; outbox can redeliver between ledger commit and Relay checkpoint <a href="#ref3">[3]</a>. Deduplication, balances, the complete entry pair and APPLIED commit together or roll back together. Changed amount/recipient conflicts. Relay updates progress only from a matching authoritative outcome. Authentication, channels and restricted ledger permissions are dependencies, not implemented by a parameter name.')+
 b('若先退未领取的 600 分，escrow 仍保留已确认 c7 的 400；即使红包 expired，它仍要继续入账。超时保持原责任并查/重投原键。业务明确拒绝与自动重试耗尽进入审查，不能把已属于领取人的钱自动退给发送方。监控未决金额和最老年龄。',
   'Refunding the unclaimed 600 first leaves 400 in escrow for confirmed c7. Credit must continue even after packet expiry. Timeout retains the obligation and original identity. Definite business rejection or exhausted automatic retries requires review, never an automatic sender refund of a recipient’s confirmed share. Monitor unresolved amount and oldest age.')+
 b('Stripe <strong>API v1</strong> 是有限期限的外部例子：端点开始执行后保存首个状态码/响应体（包括 500），同键核对参数，至少 24 h 后可清理；清理后复用会是新请求 <a href="#ref9">[9]</a>。API v2 可继续失败或部分失败的工作并更新响应。本章内部资金业务去重必须覆盖旧命令仍能执行的期间，不能照抄 v1 最短窗口，也不能跟七天展示记录一起删除。',
   'Stripe <strong>API v1</strong> is a finite-retention example: after execution starts it saves the first status/body, including 500, compares parameters and permits pruning after at least 24 h; reuse after pruning starts a new request <a href="#ref9">[9]</a>. API v2 may continue failed/partial work and update the response. Our internal financial deduplication must outlive executable old commands, rather than copy the v1 minimum or seven-day display retention.'))

body+=section('最后一抢与到期：快照、关包、退款同一条主线','Last claim versus expiry: snapshot, close, then refund',figs[4]+
 b('Scheduler 是唤醒，索引扫描补漏。T_expire 与 T_claim 锁同一 packets 行：持锁且时间未到的领取先确认，就从稍后的退款快照扣除；关闭先提交，旧 Lua 候选也不能再确认。判定点是持锁校验时刻，提交可稍晚；截止前发请求但截止后才拿锁不算赢。PostgreSQL 用锁后的 clock_timestamp()，不用事务开始时固定的 now() <a href="#ref12">[12]</a>。',
   'Scheduler wakes work and a due-index scan covers missed wakeups. T_expire locks the same packet as T_claim. A predeadline locked claim is excluded from the later refund snapshot; a committed close rejects earlier Lua candidates. Eligibility is decided at the locked check, even if commit finishes later. A predeadline request acquiring the lock after expiry loses. Use post-lock clock_timestamp(), not transaction-start now() <a href="#ref12">[12]</a>.')+
 code('expire.pseudo','Pseudocode · close and refund snapshot','pseudocode')+
 b('c7 已确认 400，快照保存 600 分与三份未领数，再将 available 置零：1,000=400 已确认+0 可领+600 待退。同事务留固定 refund:p9（图中 r9 的业务身份）；重试永远读这份快照。全领完不发零金额资金命令。initializing/recovering 到期也走同一关闭门，资金未知的 pending_fund 则先查清原资金操作。',
   'After c7 confirms 400, snapshot 600 cents and three unclaimed shares before zeroing availability: 1,000=400 confirmed+0 available+600 refund pending. Persist refund:p9, the business identity abbreviated r9 in the diagram, in the same transaction. Retries read that snapshot. Fully claimed packets create no zero-value command. Expired initializing/recovering packets close through the same gate; pending_fund first resolves its original funding operation.')+
 b('退款结果未知保持 expiring；只有匹配 APPLIED 才把 pending 转 applied、置 expired。expired 不保证所有领取款已到账，完整 settled 是独立标记。Redis EXPIRE 只是删键机制 <a href="#ref7">[7]</a>；不承担业务关闭或退款，开放库存禁淘汰、关闭与对账后才清理。',
   'Unknown refund remains expiring; a matching APPLIED converts pending to applied and marks expired. This does not prove every recipient was credited; settled is separate. Redis EXPIRE only deletes keys <a href="#ref7">[7]</a>, never closes the business or refunds money. Protect open inventory from eviction and clean up after closure/reconciliation.'))

body+=section('Redis 重建：先封旧代，再安装不可变快照','Redis recovery: fence the old generation, install the snapshot',figs[5]+
 b('Redis 缺键或回退时先暂停新候选，持久领取仍可查询。恢复器与领取共用 DB 行锁，先把 e=7 推到 8、置 recovering，再取“计划减去已确认 share_id”。已提交 s2=400 被排除；旧 API 的未提交候选在最终 DB 检查被 fence。',
   'Pause new candidates on Redis loss or rollback while durable receipt lookup continues. Recovery shares the DB row lock, advances e=7 to 8 and enters recovering before reading plan minus committed share IDs. Committed s2=400 is excluded; an old API’s uncommitted candidate is fenced at final DB confirmation.')+
 code('recover.pseudo','Pseudocode · fenced projection rebuild','pseudocode')+
 b('每代使用不同键名但同一个 hash tag，如 pkt:{p9}:e:8:meta。token 绑定代次、计划、未领有序快照与原 deadline；安装脚本同 token 重投只回现状，绝不重新填满已消费 List。迟到的 e=7 安装只能碰 e=7 命名空间，不能覆盖 e=8。DB 重新开放前再核代次、token、ready 和实际时间；跨过截止就关闭退款。<a href="../examples/ch26/install.lua">安装 Lua</a> 与 <a href="../examples/ch26/activate.lua">激活 Lua</a> 保留在示例中。',
   'Each generation has separate key names with one hash tag, such as pkt:{p9}:e:8:meta. The token binds epoch, plan, ordered unclaimed snapshot and original deadline. Same-token installation only returns existing status and never refills a consumed list. A late e=7 installer touches only its own namespace. Recheck epoch, token, readiness and actual time before reopening DB; close/refund if expired. The <a href="../examples/ch26/install.lua">install</a> and <a href="../examples/ch26/activate.lua">activation Lua</a> remain in the examples.')+
 b('Redis 默认异步复制 <a href="#ref2">[2]</a>；WAIT 也不会把它变成强一致、切主仍可丢确认 <a href="#ref6">[6]</a>。即使投影把 s2 再次发给另一人，DB 的份额唯一会挡住它。这个证明依赖权威 DB 不回退已确认行；无法证明时停写。恢复中崩溃会暂时不可领，须追踪状态年龄和重试进度。',
   'Redis defaults to asynchronous replication <a href="#ref2">[2]</a>; WAIT does not make it strongly consistent or eliminate failover loss <a href="#ref6">[6]</a>. DB share uniqueness blocks a rolled-back projection from reconfirming s2. That proof requires an authority that preserves acknowledged claims; stop writes otherwise. Recovery crashes may reduce availability, so monitor state age and progress.')+
 '<details><summary><span class="lang-zh">两份对账公式</span><span class="lang-en">Two reconciliation equations</span></summary>'+b(
 '业务金额：total=confirmed_claims+available+refund_pending+refund_applied。p9 依次是 1,000=400+600+0+0、400+0+600+0、400+0+0+600。份数单独核：4=1 已领+0 可领+3 关包未领。资金对账按同一截止快照关联 operation_id，分为已入账/领取在途/仍可领/退款在途/已退，每笔只分一类；ACK 丢失不能把已入账 400 又算成 pending 400。',
 'Allocation: total=confirmed claims+available+refund pending+refund applied. p9 moves through 400+600+0+0, 400+0+600+0 and 400+0+0+600. Reconcile count separately: 4=1 claimed+0 available+3 closed unclaimed. Financial reconciliation joins operation IDs at one consistent cutoff, classifying each amount once as credited, pending claim, available, pending refund or refunded. Lost ACK must not double-count posted 400 as another pending 400.')+'</details>')

body+=section('取舍与一分钟复盘','Trade-offs and a one-minute recap',
 b('普通群包先 DB-only，省去投影双写和恢复；跨包按 packet_id 分区，把包、份额、claims、Outbox 放同片。一个热包不能靠随机分片增加钱，优先限接纳与有界队列；若拆子库存，必须先分配固定份额/资金上限并设计统一关闭快照。',
   'Start ordinary packets database-only to avoid projection installation/recovery. Partition different packets by packet_id, colocating plan, claims and outbox. Random sharding cannot add money to one hot packet; prefer admission and bounded queues. Subinventory needs predetermined shares, funding caps and coordinated close snapshots.')+
 b('一分钟口述：1,000 分先预留进本包 escrow；整数计划固定金额与身份。Lua 预扣 s2=400，T_claim 提交后给 c7；资金效果按原键履约。关包只退未确认 600，c7 仍要到账。Redis 丢失先推进 epoch 再从原计划排除已领份额；旧候选和旧安装都不能越过当前权威。',
   'One minute: reserve 1,000 cents in packet escrow and persist integer share identities. Lua reserves s2=400; T_claim yields c7, whose money operation keeps its original key. Close refunds only unconfirmed 600 while c7 remains owed. On Redis loss, advance epoch and rebuild the original plan minus claims. Stale candidates and installers cannot overrule current authority.')+
 b('实际验证材料与运行方式见 <a href="../examples/ch26/README.md">本章示例</a>：Java 17 纯函数、真实 SQLite 事务及多连接竞争、隔离 Redis Lua。SQLite 写者锁比 PostgreSQL 行锁更粗 <a href="#ref13">[13]</a>；没有把它称为 PostgreSQL 切主、真实资金渠道或生产压测的证明。',
   'See <a href="../examples/ch26/README.md">chapter examples</a> for Java 17 pure-function checks, real SQLite transactions/multiple connections, and isolated Redis Lua. SQLite uses a coarser writer lock <a href="#ref13">[13]</a>; these checks do not establish PostgreSQL failover, real payment-channel behavior or production throughput.'))

# Reuse the primary reference list, refreshing the precise supported claims.
refs=re.search(r'<ol class="references">[\s\S]*?</ol>',original)[0].replace('2026-10-06','2026-10-23')
refs=refs.replace('保存同键结果、校验参数；至少 24 h 后可移除键的外部例子。','API v1 的首结果/含500、参数比较与至少24 h可清理；API v2的失败续做语义不同。')
refs=refs.replace('Stored same-key results, parameter comparison, and removal after at least 24 h.','API v1 stored first result including 500, parameter comparison and pruning after at least 24 h; v2 can continue failed work.')
refs=refs.replace('</ol>', '<li id="ref13">[13] SQLite, <a href="https://www.sqlite.org/lang_transaction.html">Transaction</a>. <span class="lang-zh">单写者与 BEGIN IMMEDIATE，核验于 2026-10-23。</span><span class="lang-en">One writer and BEGIN IMMEDIATE, checked 2026-10-23.</span></li>\n<li id="ref14">[14] Oracle, <a href="https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/random/RandomGenerator.html">Java 17 · RandomGenerator</a>. <span class="lang-zh">带上下界整数抽样接口，核验于 2026-10-23。</span><span class="lang-en">Bounded integer generation, checked 2026-10-23.</span></li></ol>')
body+=section('引用与核验范围','References and verification scope',
 b('一手来源核验于 2026-10-23。流量、份数、2 ms、门限、24 h 业务窗口、七天展示与容量都是本章教学假设或推导；Stripe API v1 的至少24 h是外部接口例子，不能推出本章资金去重期限。',
   'Primary sources checked 2026-10-23. Traffic, shares, 2 ms, admission, 24 h business window, seven-day display and capacity are teaching assumptions/derivations. Stripe API v1’s at-least-24-hour example does not define our financial deduplication retention.')+refs+
 '<p class="chips"><a href="ch21.html">Ch21</a> <a href="ch24.html">Ch24</a> <a href="ch25.html">Ch25</a> <a href="ch38.html">Ch38</a> <a href="ch41.html">Ch41</a></p>')
cards=[
('Lua 回了金额，可以回 200 吗？','Can a Lua amount become 200?','不可以；claim、两维库存、请求绑定与Outbox先在T_claim提交。','No: first commit claim, both inventory dimensions, request binding and outbox.'),
('最低每份 m，怎样保住后来者？','How do we preserve minimum m?','U=min(⌊2M/N⌋,M−m×(N−1))，抽[m,U]；最后取尽。','U=min(floor(2M/N),M−m×(N−1)); draw [m,U], then exhaust the last share.'),
('同一用户换 HTTP 键呢？','What if one user rotates HTTP keys?','(packet,user)业务唯一仍只给一份；(user,key)绑定packet防请求漂移。','Unique (packet,user) still yields one share; (user,key) binds the packet.'),
('为什么用户唯一还不够？','Why is user uniqueness insufficient?','Redis回退可能把同一份给另一人，还需(packet,share)唯一。','A rolled-back projection can reoffer a share; also enforce unique (packet,share).'),
('提交后回复丢失怎么办？','What if the commit reply is lost?','结果未知，查询原用户/键或资金操作；不换身份、不立即回收候选。','Query the original user/key or money operation; do not create a new identity or reclaim immediately.'),
('最后一抢与关闭谁裁决？','Who arbitrates last claim versus close?','同一DB行锁与锁内实际时间；截止前发出但截止后拿锁仍输。','Same DB row lock and actual time read under it; a queued predeadline request can still lose.'),
('已领400、未领600，退款先到呢？','400 claimed, 600 unclaimed: refund first?','只退600，资金池保留400给已确认领取；expired不等于settled。','Refund only 600 and retain 400 for the recipient; expired does not mean settled.'),
('重建为什么不能重新随机？','Why not rerandomize on recovery?','原share_id金额不可变，排除持久已领；旧代未确认候选失效。','Keep immutable share amounts, exclude durable claims and fence stale candidates.'),
('旧恢复器会覆盖新 List 吗？','Can an old rebuilder overwrite the new list?','每epoch独立键空间；同token安装只返回现状，DB发布核当前epoch。','Separate epoch namespaces, nonresetting same-token install, and current-epoch DB publication.'),
('初始化时已到期，但钱刚确认？','Funding confirmed after initialization deadline?','不开放；initializing也可按原deadline关闭，退款全部未分配资金。','Do not open; initializing can close at the original deadline and refund unallocated funds.'),
('WAIT 能证明领取确认不丢吗？','Does WAIT prove receipts survive failover?','不能；Redis仍可能丢确认。成功依赖不回退已确认行的DB权威。','No; Redis can lose acknowledged writes. Success depends on an authority preserving receipts.'),
('千万确认/天，峰值与热点失败呢？','10M confirms/day: peak and hot failures?','日均115.74/s，十倍峰值约1,157/s；10,000抢100至少9,900失败。','115.74/s average, about 1,157/s at 10× peak; at least 9,900/10,000 lose 100 shares.')]
flashes='<div class="cards-grid">\n'
for qz,qe,az,ae in cards:
    flashes+=f'<button type="button" class="flip"><span class="q"><span class="lang-zh">{qz}</span><span class="lang-en">{qe}</span></span><span class="a"><span class="lang-zh">{az}</span><span class="lang-en">{ae}</span></span></button>\n'
flashes+='</div>\n'
body+=section('闪卡','Flashcards',flashes)
head=original[:original.index('<section')]
tail=original[original.index('  <p><button type="button" class="read-toggle"'):]
page=head+body+tail
assert re.findall(r'<title id="([^"]+)"',page)==re.findall(r'<title id="([^"]+)"',original)
target=ROOT/'chapters/ch26.html'
if target.read_bytes()==source.read_bytes():
    print('Confirmed untouched chapter baseline before first write:',hashlib.sha256(target.read_bytes()).hexdigest())
target.write_text(page)
print('Wrote chapter with 6 decks / 31 frames and 6 shared-source snippets')
