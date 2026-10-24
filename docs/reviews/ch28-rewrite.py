from pathlib import Path
import html
import re

ROOT = Path(__file__).resolve().parents[2]
target = ROOT / 'chapters/ch28.html'
original = (ROOT / 'docs/reviews/ch28-ch29-ch30-baseline/ch28.html').read_text()
assert target.read_text() == original, 'Do not overwrite an intervening chapter edit'
decks = re.findall(r'<figure class="deck">[\s\S]*?</figure>', original)
assert [len(re.findall(r'class="slide"', d)) for d in decks] == [5, 6, 5, 5, 5, 5]


def pair(zh, en):
    return f'<span class="lang-zh">{zh}</span><span class="lang-en">{en}</span>'


def b(zh, en):
    def paragraphs(items):
        return ''.join(f'<p>{p}</p>' for p in items)
    return f'<div class="bilingual"><div class="lang-zh">{paragraphs(zh)}</div><div class="lang-en">{paragraphs(en)}</div></div>'


def section(zh, en, content, extra=''):
    return f'<section{extra}><h2>{pair(zh, en)}</h2>\n{content}</section>\n'


def detail(zh, en, content):
    return f'<details><summary>{pair(zh,en)}</summary>{content}</details>'


def code(file, language, kind, snippet=None):
    source = (ROOT / 'examples/ch28' / file).read_text().rstrip()
    attrs = f' data-snippet="{snippet}"' if snippet else ''
    if snippet:
        source = source.split(f'    // BEGIN page:{snippet}\n')[1].split(f'    // END page:{snippet}')[0].rstrip()
        source = '\n'.join(line[4:] if line.startswith('    ') else line for line in source.splitlines())
    return f'<pre data-language="{language}" data-kind="{kind}" data-source="{file}"{attrs}><code>{html.escape(source)}</code></pre>'


# Local changes retain all original animation identifiers and frame ordering.
decks[0] = decks[0].replace('10 个 namespace 合成完整快照，业务线程一次只取一个已验证的版本。', '每个 namespace 整包应用；业务线程捕获一个已验证视图，不承诺跨包同时切换。').replace(
    'Ten namespaces form a complete local snapshot; a business read uses one validated version.',
    'Apply each namespace as one bundle and capture one validated view; different namespaces do not switch atomically.')
last = re.findall(r'<div class="slide">[\s\S]*?</figcaption>\s*</div>', decks[4])[-1]
updated = last.replace('CANARY</text>', 'FORMER CANARY</text>').replace('bucket &lt; 5</text>', 'g=43 / R17</text>').replace(
    'bucket &gt;= 5</text>', 'g=43 / R17</text>').replace('R18 at g=42</text>', 'selected release R17</text>').replace(
    'g=42: steady R17 / canary R18', 'g=43: stable R17 / canary cleared').replace(
    'bucket = H(ns, salt, instance) % 100', 'rollback: both cohorts now select R17').replace(
    'expected, not exact, 5%', 'higher generation, older content').replace(
    'same salt across 5% -&gt; 20%', 'same identity context, fresh view').replace(
    'An abort publishes generation 43 selecting the immutable R17 again, while R18 stays in history. SDK orders responses by generation, not by the content ID.',
    'The final frame publishes generation 43 with canary cleared. Both former cohorts now select R17; clients order by generation rather than content release ID.')
decks[4] = decks[4].replace(last, updated)
decks[5] = decks[5].replace('10,000 / 30s = 333 bundles/s', '10,000 / 30s = 333 batch requests/s')
last = re.findall(r'<div class="slide">[\s\S]*?</figcaption>\s*</div>', decks[5])[-1]
updated = last.replace(
    '<text x="62" y="236" class="tiny">reconnect: full jitter + retry budget</text><text x="62" y="258" class="tiny">10,000 / 30s = 333 batch requests/s</text><text x="62" y="280" class="tiny">10 namespaces: 400 KB/process</text>',
    '<text x="320" y="244" class="tiny">GET recovery: full jitter + budget</text><text x="320" y="267" class="tiny">333 batch requests/s; 10 namespaces each</text><text x="320" y="290" class="tiny">400 KB/batch; cap 500 batch responses/s</text>')
updated = updated.replace(
    '<path d="M135 180 L135 213 Q135 221 127 221 L48 221 Q40 221 40 229 L40 324 Q40 329 45 329 L50 329" class="wire async"/><polygon points="60,329 50,334 50,324" class="head async"/>',
    '<path d="M135 180 L135 295" class="wire async"/><polygon points="135,305 130,295 140,295" class="head async"/><text x="151" y="247" class="tiny">applied</text><text x="151" y="267" class="tiny">report</text>')
updated = updated.replace('batches: 500 every 0.25s; 20 batches', 'broad publish: 500 recipients / 0.25s').replace(
    'SDK asynchronously reports applied generation, release, and business health to Applied Telemetry. The reconnect and cache paths remain; expansion stops on application errors.',
    'The downward SDK to Applied Telemetry arrow reports application, not reconnects. Cold GET recovery still uses Config Service with a separate batch response and byte budget. Broad publish admission is 500 recipients every 0.25 seconds.')
updated = updated.replace(
    '终图加应用遥测。500 个一批、每 0.25 秒一批，20 批的准入安排约 5 秒；预留其余时间给 GET 与应用，10 秒目标仍须测量。',
    '向下虚线是 applied 遥测，重连 GET 仍走 Config Service。右侧恢复预算按 10 个 namespace 的批响应计；上方 500 人/0.25 秒则是单包大范围发布的接收者准入，两笔不能混用。').replace(
    'Finish with applied telemetry. Twenty batches of 500 at 0.25-second intervals allocate about five seconds for admission, leaving time for GET and apply. The 10-second target still needs measurement.',
    'The downward dashed arrow reports applied state; reconnect GETs still use Config Service. Recovery counts ten-namespace batch responses, while 500 recipients/0.25s above sizes one broad publication. They are different budgets.')
decks[5] = decks[5].replace(last, updated)

assumptions = re.search(r'<table>[\s\S]*?</table>', original)[0]
assumptions = assumptions.replace('冷拉抖动 30 秒，聚合准入 500 包/秒', '冷拉抖动 30 秒；每批最多 10 包，聚合准入 500 批响应/秒').replace(
    '30-second cold-fetch jitter, 500 bundles/s aggregate admission',
    '30-second cold-fetch jitter; at most 10 bundles/batch, 500 batch responses/s aggregate admission').replace(
    '333/s 是平均数，准入封住尖峰', '333 批/s 是平均数；平均正文下 500 批/s 对应 200 MB/s，另设字节/回源上限').replace(
    '333/s is an average; admission bounds spikes', '333 batches/s is an average; 500/s means 200 MB/s at assumed payload sizes, plus byte/origin caps')

parts = [original.split('<section class="goal">')[0]]
parts.append(section('本章主线：提交、通知、应用各自闭环', 'Core: close commit, notification and application separately', b([
    '<strong>发布成功不等于业务已生效。</strong>事务留存内容、规则、审计、幂等回执和变更；SDK 校验、准备资源并整包替换后才上报 applied。',
    '<strong>generation 排发布顺序，release 标内容身份。</strong>灰度扩围和回退也推进 g；更大的 g 可以选择旧内容。',
    '<strong>普通值保留好快照，危险动作需要有效证明。</strong>watch 负责提醒，安全确认绑定当前身份与已应用视图。'
], [
    '<strong>Publication is different from application.</strong> Commit content, rules, audit, an idempotent receipt and changes. An SDK reports applied only after validation, resource preparation and a whole-bundle swap.',
    '<strong>Generation orders publications; release identifies bytes.</strong> Expansion and rollback advance g, and a higher g may select older content.',
    '<strong>Ordinary values keep the last good snapshot; dangerous actions require proof.</strong> Watches provide hints. Confirmation binds the current identity and exact applied view.'
]), ' class="goal"'))

parts.append(section('30 秒开场：业务只读本地，控制面负责刷新', 'Opening: local business reads, control-plane refresh', b([
    '设计运行时超时、限流阈值、feature flag 和少量安全开关。业务请求只读进程内不可变快照；后台 SDK 启动拉取，复用一条 long-poll 接收提醒，再 GET 正文。201 确认权威事务；applied_generation 说明进程实际切换。',
    '先问进程数、订阅数、允许旧值多久、哪些动作必须停止、是否需要灰度。namespace 是应用/环境/集群下的配置包：相关键一次发布、一次应用；跨 namespace 不承诺原子切换，必要时先合成同一 bundle。密钥分发、服务发现与二进制部署保留各自生命周期。',
    '<strong>本章全部容量、时间和百分比均为教学假设。</strong>统一十进制 KB/MB/GB。主账是 1,000 万本地读/s、1 万 watch 连接、发布峰值 50/s；不能直接相加成数据库 QPS。'
], [
    'Design runtime timeouts, limits, feature flags and a few critical switches. Business requests read immutable in-process snapshots. A background SDK fetches at startup, multiplexes long-poll hints and GETs payloads separately. A 201 confirms authority commit; applied_generation describes the actual process transition.',
    'Ask about process and subscription counts, tolerated staleness, actions that must stop and rollout needs. A namespace is a bundle under application/environment/cluster. Publish and apply related keys together. Different namespaces do not switch atomically; combine them into one bundle when required. Secret distribution, discovery and binary deployment retain separate lifecycles.',
    '<strong>All capacity, timing and percentage figures are teaching assumptions.</strong> Use decimal KB/MB/GB. Ten million local reads/s, ten thousand watch connections and fifty publishes/s are separate accounts, not additive database QPS.'
]) + detail('假设表 A1–A12 与连接、存储复算', 'A1–A12 assumptions, connection and storage arithmetic', assumptions + b([
    '连接预算 10,000 × 64 KB = 640 MB，另加 TLS/运行时开销。每台计划 5,000 × 70% = 3,500 条；ceil(10,000/3,500)+1 = 4 台。少一台仍有 10,500 条计划容量。用异步连接表挂起请求，不分配 1 万线程。',
    '2,000 键 × 4 KB × 30 份 = 240 MB 原始内容，3 份拷贝为 720 MB；索引、审计、回执与事件另算。Current 选择读、缓存 miss、relay 和安全确认也消耗存储资源，不能从这些字节推出“整库 1 GB 足够”。'
], [
    'The connection budget is 10,000 × 64 KB = 640 MB before TLS/runtime costs. Planned capacity is 5,000 × 70% = 3,500 per node; ceil(10,000/3,500)+1 = four nodes. One loss leaves 10,500 planned connections. Use asynchronous parked requests, not ten thousand threads.',
    '2,000 keys × 4 KB × 30 versions = 240 MB of raw content, or 720 MB for three total copies. Indexes, audit, receipts and events are additional. Current selection, cache misses, relays and confirmation also consume store capacity; the payload arithmetic does not justify a one-GB total database.'
]))))

parts.append(section('架构：本地读、发布、异步提醒是三条路径', 'Architecture: local reads, publish and hints use distinct paths', decks[0] + b([
    'Business Code → Local Snapshot 是热路径。SDK 在后台向 Config Service 请求，服务读 Config Store，正文原路返回；库不会直接改业务内存。SDK 核对身份、摘要、schema 和跨键约束，预建连接池/规则对象后再切换。',
    'Console 管草稿审批；Config Service 管鉴权、选择与 watch；Store 管权威状态；Notify Relay 尾读已提交 ChangeLog，广播给<strong>每个持有连接的节点</strong>。节点共用一个竞争消费组会漏掉其他节点的等待者。小规模角色可同部署，接口与恢复边界仍保留。',
    'Apollo 设计文档采用 long-poll 提醒、另拉正文、本地文件与定时拉取；其空闲通知用 304，本章自定义 watch 用 204。<a href="#ref-7">[7]</a> Git 可管草稿审核，运行中的 SDK 仍需取值/订阅/应用协议。每业务读查中心会把 1,000 万/s 拉回控制面；即使 99% 命中，余下 100,000/s 仍是发布峰值的 2,000 倍。'
], [
    'Business Code → Local Snapshot is the hot path. The background SDK requests Config Service, which reads Config Store and returns bytes along the same path. The store never edits business memory directly. Verify identity, digest, schema and cross-key constraints; prepare pools or rule objects before swapping.',
    'Console owns drafts/approval, Config Service authentication/selection/watch, and Store authority. Notify Relay tails committed ChangeLog and broadcasts to <strong>every connection-owning node</strong>. A competing consumer group shared by nodes misses other nodes’ waiters. Small deployments may combine roles while preserving interfaces and recovery boundaries.',
    'Apollo documents long-poll hints, separate payload pulls, local files and periodic refresh. Its idle notification uses 304; our custom watch uses 204. <a href="#ref-7">[7]</a> Git can store reviewed drafts but running SDKs still need selection/subscription/application. Centralizing every business read creates ten million reads/s; even 99% cache hits leave 100,000/s, two thousand times peak publishes.'
])))

parts.append(section('数据模型：发布代次、内容身份与调用者视图', 'Model: generation, content identity and caller view', b([
    '<strong>Current 一行是并发边界。</strong>它把 g、稳定/金丝雀 release、比例、salt 与规则修订放在一起。ContentRelease 不可变；g=42 选 R18，g=43 选回 R17 合法。增加内容、只改规则、全量和回退都推进 g。',
    '下面是可执行 SQLite 约束子集，供本地事务验证。复合外键防止跨 namespace 选内容；回执主键是认证主体/namespace/请求键；审计、回执、变更按同一个发布 g 关联。生产还要撤掉绕过受控事务的裸写权限。'
], [
    '<strong>One Current row defines the concurrency boundary.</strong> It holds g, stable/canary releases, percentage, salt and rule revision. ContentRelease is immutable: g42 may select R18 and g43 may select R17. Content edits, rule-only edits, promotion and rollback all advance g.',
    'This executable SQLite constraint subset supports local transaction checks. Composite foreign keys scope releases to namespaces. Receipt identity is authenticated principal/namespace/request key, while audit, receipt and change refer to the same publication g. Production must prevent raw writes bypassing the controlled transaction.'
]) + code('schema.sql', 'SQL · executable SQLite subset', 'runnable') + b([
    '选择视图还含<strong>控制面签发的身份上下文</strong>：namespace、实例、标签/凭据修订。不能信任请求自己填的 tag=canary；GET、watch、确认和缓存键都带作用域并先鉴权。摘要只检测损坏，不代替 TLS 与读权限。单键 256 KB、整包 1 MB 是本章上限，超界 413。',
    'ETag 含 g、规则、身份选择上下文、release 和摘要。If-None-Match/304 比较所选表示，不提供权威新鲜证明。<a href="#ref-6">[6]</a> 批接口最多 10 个 namespace，每包内部一致，跨包不保证同一提交点；大对象外置仍要核摘要与授权。'
], [
    'A selected view also binds a <strong>control-plane-issued identity context</strong>: namespace, instance and label/credential revision. Do not trust self-asserted tag=canary. GET, watch, confirmation and cache keys require scoped authentication first. Digests detect corruption without replacing TLS or read permissions. Our caps are 256 KB/key and 1 MB/bundle, returning 413 above them.',
    'ETags include g, rule, identity-selection context, release and digest. If-None-Match/304 compare the selected representation; they provide no authority freshness proof. <a href="#ref-6">[6]</a> The batch endpoint accepts at most ten namespaces, each internally consistent without a cross-namespace commit point. External large objects still need digest and authorization checks.'
]) + detail('展开 HTTP 契约；这些路径不是实现代码', 'HTTP contracts; endpoint notation is not the implementation', code('api.txt', 'HTTP · teaching interface notation', 'pseudocode'))))

parts.append(section('发布：一次事务留下全部恢复依据', 'Publish: one transaction leaves every recovery record', decks[1] + b([
    '鉴权、审批与范围校验通过后，锁住该 namespace 的 Current，<strong>在锁内复查回执，先回放再检查 expected_generation</strong>。哈希覆盖全部语义意图，包括 expected g、内容、规则和 reason。同键换规则也冲突；同键重试不会因为原 g 已过时而变成第二次发布。',
    'Release、Current、Publication、Receipt、ChangeLog 必须同库同事务，任一步失败全部撤销。PostgreSQL 的事务全做或全不做；FOR UPDATE 将同一行的写者串行，等锁后必须用锁到的新状态判断。<a href="#ref-3">[3]</a> 下段是 PostgreSQL 形状的教学伪代码；可运行适配用真实 SQLite BEGIN IMMEDIATE，写锁更粗，未实测 PostgreSQL 行锁。'
], [
    'After authentication, approval and range validation, lock Current for the namespace. <strong>Recheck the receipt inside the lock and replay it before checking expected_generation.</strong> Hash the full semantic intent: expected g, content, rule and reason. Changed rules under one key conflict. An identical retry recovers the original publication despite its now-stale expected g.',
    'Release, Current, Publication, Receipt and ChangeLog share one database transaction; any failure rolls everything back. PostgreSQL transactions are all or nothing, and FOR UPDATE serializes writers of a row. After waiting, decide from the locked current state. <a href="#ref-3">[3]</a> This is PostgreSQL-shaped teaching pseudocode. The executable adapter uses actual SQLite BEGIN IMMEDIATE with coarser write locking; it does not test PostgreSQL row locks.'
]) + code('publish.pseudo', 'Pseudocode · authority transaction', 'pseudocode') + b([
    '201 只在提交确认后返回。COMMIT 回复丢失是结果未知，用原键查回执；提交后进程死掉，relay 从 ChangeLog 继续；投递后进度未落盘会重复提醒，SDK 按 g 幂等。24 小时回执保留覆盖 15 分钟重试；过窗先核对现状，不能换键自动重发旧意图。',
    '“同事务”不自动等于“多数派持久”。本章 Store 另要求共识事务或明确复制提交策略。三成员 Raft 的当前任期条目可经 2 个持久副本提交；旧任期条目不能仅数副本。<a href="#ref-2">[2]</a> 失去多数派停止发布；SDK 按本地合同运行。'
], [
    'Return 201 only after confirmed commit. A lost COMMIT response is unknown; query the original receipt key. A post-commit crash leaves ChangeLog for the relay. Delivery before progress persistence may repeat hints; SDKs deduplicate by g. Twenty-four-hour receipt retention covers fifteen-minute retries. After that window, review the current state rather than automatically resubmitting old intent under a new key.',
    'A local transaction does not imply majority durability. Our Store separately requires consensus transactions or an explicit replicated commit policy. A current-term entry in three-member Raft may commit with two durable copies; old-term entries cannot commit merely by replica counting. <a href="#ref-2">[2]</a> Quorum loss stops publications; SDKs retain their local contracts.'
])))

parts.append(section('watch：先登记再复查，历史缺口必须重拉', 'Watch: register then recheck; reset across history gaps', decks[2] + b([
    '先拿完整选择视图和 g，再 watch(g)。服务在<strong>同一同步规则</strong>内登记等待者与复查代次；relay 更新索引/唤醒也遵循该规则，覆盖“刚检查完就发布”的窗口。下面 Java 只保护<strong>一个服务节点、一个 namespace 的本地等待表</strong>，不冒充跨机器事务。',
    '节点开放 watch 前先读一致快照及存储 revision R，恢复索引，再从 R 之后追变更；如果真实 etcd watch 的 start_revision 是包含起点的，就用 R+1。etcd 裁剪后返回 compact_revision 并取消该 watch，不能一直重试旧 revision。<a href="#ref-5">[5]</a> namespace g 与全局存储 R 是不同编号，适配层负责映射。'
], [
    'Fetch a complete selected view and g, then watch(g). <strong>Register and recheck under one synchronization rule</strong>; relay index updates and wakeups use the same rule. This covers publication immediately after a check. The Java code protects <strong>one node’s local waiter table for one namespace</strong>, without claiming a cross-machine transaction.',
    'Before serving watches, load a consistent snapshot and store revision R, rebuild the index and resume changes after R. etcd start_revision is inclusive, so use R+1. A compacted start revision yields compact_revision and cancels the watch; repeatedly retrying that old revision is invalid. <a href="#ref-5">[5]</a> Namespace g and global store R are separate numbers mapped by the adapter.'
]) + code('WatchHub.java', 'Java 17 · local watch excerpt', 'teaching', 'watch') + b([
    '本章 compacted_through=f 表示 ≤f 的日志已清理。已应用游标 g&lt;f 返回 RESET，g=f 可从 f+1 继续；RESET 必须重新取完整 Current/正文，应用后再 watch(g)。服务索引落后于调用者返回 SYNC_REQUIRED/503，不能说“没变化”。HTTP 超时/取消必须移除等待者，队列有上限；无新鲜追赶进度的节点停止接新 watch。',
    '提醒可重复或合并，只保留最新待应用目标，不要求业务逐一应用中间代次。先校验、预建资源、换引用，再推进 applied；失败保留旧值并限速退避，否则旧 applied 游标反复立即唤醒会热循环。需要快速重挂可另存 received_cursor，但不能丢待应用目标。',
    'ZooKeeper standard watch 一次触发后重设；3.6.0 起有 persistent watch，不能把所有 watch 都叫一次性。<a href="#ref-1">[1]</a> etcd 默认 KV 线性化，serializable 读可能旧，watch 本身不保证线性化或有界到达。<a href="#ref-4">[4]</a> 99%/10 秒是正常 commit→applied 目标；300 秒普通对账兜底不保证漏提醒后 10 秒恢复。'
], [
    'Here compacted_through=f means log entries ≤f are removed. An applied g&lt;f requires RESET; g=f can resume at f+1. RESET fetches complete Current/payload, applies it and watches after g. An index behind the caller returns SYNC_REQUIRED/503 rather than unchanged. HTTP timeout/cancellation removes the waiter, queues are bounded, and a node without fresh replay progress stops accepting new watches.',
    'Hints may repeat or coalesce; retain the latest pending application target without applying every intermediate generation. Validate, prepare resources and swap before advancing applied. Failure retains old data and uses bounded backoff; otherwise the old applied cursor can cause an immediate-wakeup hot loop. A separate received_cursor may rearm faster but must not lose pending work.',
    'ZooKeeper standard watches trigger once and must be reset; persistent watches exist since 3.6.0. <a href="#ref-1">[1]</a> etcd defaults to linearizable KV reads, serializable reads can be stale, and watch is neither linearizable nor bounded in arrival time. <a href="#ref-4">[4]</a> The 99%/ten-second commit→applied target concerns normal propagation. Three-hundred-second ordinary reconciliation cannot promise ten-second missed-hint recovery.'
])))

parts.append(section('本地快照：整包应用，证明绑定已应用视图', 'Local snapshot: whole-bundle apply, proof bound to the applied view', decks[3] + b([
    '<strong>先准备后切换，不能拉到 JSON 就算生效。</strong>构造不可变 staging，核摘要/schema/范围，预建资源成功才进入下面本地切换。预建失败保留旧 applied，requires_restart 单独上报。业务每次捕获一份引用；旧请求可以用完旧视图，新请求读取新视图。',
    '相同身份下慢回来的小 g 丢弃，同 g 不同内容视为分叉；原样重试不刷新证明。身份/标签修订变化时清选择和证明，即使 g 没变也重新选包；否则旧身份的慢响应可能把非灰度实例带进金丝雀。View 包含 scope、g、规则、release、摘要和验证后的值；下列节选的完整可运行 Java 类在示例目录。'
], [
    '<strong>Prepare before swapping; fetched JSON is not applied behavior.</strong> Build immutable staging, verify digest/schema/ranges and prepare resources before the local transition below. Preparation failure retains old applied; requires_restart is reported separately. Each operation captures one reference. Existing requests may finish on the old view; new requests read the new view.',
    'For the same identity, discard delayed smaller g and reject same-g content forks. An identical retry does not refresh proof. Identity/label revision changes clear selection and proof, requiring reselection even at the same g. Otherwise an old-context response could move an ineligible instance into canary. View contains scope, g, rule, release, digest and validated values. The full runnable Java class is in the examples directory.'
]) + code('ConfigClient.java', 'Java 17 · local install excerpt', 'teaching', 'install') + b([
    'serve_last 使用最后应用成功的好快照。冷启动可读身份/schema/摘要匹配的磁盘正文，但<strong>不恢复安全证明</strong>；无安全默认的必需键让功能不就绪，关键 allow 缺失默认拒绝。磁盘写临时文件、刷新文件、原子改名并按文件系统要求刷新目录；失败保留好内存并报告，本轮不把磁盘断电恢复当作已实测保证。',
    '<strong>安全确认是专用无缓存权威选择读。</strong>发出时记录请求起点与运行时代次，响应必须绑定原 nonce、当前身份、精确已应用视图，且经过时间&lt;2 秒。证明从请求起点算，年龄&lt;30 秒才允许；新视图、认证失效、重启/恢复均清证明。收到未应用的 g43 不能给旧 g42 续资格。',
    'Clock 是注入的可信经过时间适配：必须计入休眠/长暂停，或在任何恢复后动作前更换 era 并清证明。Java nanoTime 只承诺同 JVM 的经过时间用途，不提供跨重启资格或本章休眠适配保证。<a href="#ref-10">[10]</a> 这里的 Java 验证使用受控时钟，不是 OS 暂停实验。'
], [
    'serve_last keeps the last successfully applied good snapshot. A cold start may restore disk bytes matching identity/schema/digest, <strong>never a critical proof</strong>. Mandatory keys without safe defaults leave the function unready; a missing critical allow denies. Write a temporary file, flush, atomically rename and flush the directory as the filesystem requires. Failure retains good memory and reports an error. Power-failure recovery is not experimentally verified here.',
    '<strong>Confirmation is a dedicated uncached authoritative selection read.</strong> Record request-start elapsed time and runtime era. Bind the response to the original nonce, current identity and exact applied view, with elapsed time &lt;2 seconds. Proof ages from request start and allows only while age &lt;30 seconds. New views, auth invalidation, restart and resume clear proof. Unapplied g43 cannot qualify applied g42.',
    'Clock is an injected trusted elapsed-time adapter: it must count suspension/pauses, or change era and clear proof before any resumed action. Java nanoTime supports elapsed-time measurement within one JVM; it provides neither cross-restart qualification nor our suspension adapter guarantee. <a href="#ref-10">[10]</a> Java checks here use a controlled clock rather than an OS suspension experiment.'
]) + code('ConfigClient.java', 'Java 17 · local critical gate excerpt', 'teaching', 'proof') + b([
    '上段 synchronized 只保证一个进程的视图/证明一起变更；authoritative 是<strong>可信传输与线性化读适配的结果</strong>，不是客户端可自行宣称的布尔值。heartbeat、缓存命中、普通 304 不续资格；超时保留原有但仍会到期的证明，迟到响应不补发 30 秒。最长证明期和 deny 下限由应用固定，配置不能改成 fail_open 绕过。',
    '这是动作<strong>入口</strong>资格，不能保证几分钟工作在随后撤权时自动停止；长任务在可取消检查点重验，或另用操作授权/撤销协议。1,000 进程每 10 秒确认需 100 权威读/s，全体则 1,000/s。30 秒只限制旧允许窗口；要求“201 后每次操作立即新”就把权威检查放进操作路径，或等待旧授权失效。'
], [
    'synchronized only changes one process’s view and proof together. authoritative is the <strong>output of trusted transport and linearizable-read adapters</strong>, never a caller-asserted boolean. Heartbeats, cache hits and ordinary 304s do not renew qualification. Timeouts retain prior proof until its original expiry; late replies grant no extra thirty seconds. The application fixes maximum proof life and deny-policy minimum so config cannot bypass it with fail_open.',
    'This is action <strong>admission</strong>, not automatic cancellation of minutes of work after later revocation. Long tasks recheck at cancellable checkpoints or use an operation authorization/revocation protocol. One thousand processes checked every ten seconds require 100 authority reads/s; all ten thousand require 1,000/s. Thirty seconds only bounds stale permission. Immediate freshness after 201 needs operation-time authority checks or waiting for old qualifications to expire.'
])))

parts.append(section('灰度与回退：选择整包，发布顺序只前进', 'Rollout and rollback: select whole bundles, advance publication order', decks[4] + b([
    'g42 包含 stable=R17、canary=R18 和 5% 规则。服务对认证实例按 namespace/salt/instance_id 稳定分桶，<strong>批准集群 AND bucket&lt;5</strong> 才选 R18。不能含糊地把 tag 与比例说成 OR。下面选包函数用长度前缀避免拼接歧义；返回值把 g/规则/身份上下文与 release 绑定。',
    '5% 扩到 20% 保留 salt，旧桶仍被包含；均匀哈希下 1 万实例预期 500，不保证正好 500，也不等于 5% 流量。新实例 ID 会重新分桶。稳定 cohort 是常见渐进启用方式；运维开关和发布开关的生命周期不同。<a href="#ref-9">[9]</a>'
], [
    'g42 holds stable=R17, canary=R18 and a five-percent rule. Bucket authenticated instances by namespace/salt/instance_id. Only <strong>approved cluster AND bucket&lt;5</strong> selects R18; avoid ambiguous OR semantics. The selector uses length prefixes to avoid concatenation ambiguity and returns g/rule/identity context bound to one release.',
    'Retain salt when expanding five to twenty percent so existing buckets remain included. Under uniform hashing ten thousand instances give an expected five hundred, not an exact count or five percent of traffic. New instance IDs rebucket. Stable cohorts support gradual enablement, while operational and release toggles have different lifecycles. <a href="#ref-9">[9]</a>'
]) + code('Cohort.java', 'Java 17 · pure cohort selector excerpt', 'teaching', 'select') + b([
    'R18 有错就发布更大 g，清 canary、选 R17，仍走同一 expected_generation 事务并记录 reason。D5 终帧的两个旧 cohort 均已变成 g43/R17。不复制旧字节伪造 R19，也不删除坏发布历史。原来就在 R17 的进程可以复用字节，但必须更新选择视图和清旧证明。',
    'ETag 绑定新 g 和规则就不会把回退吞掉；只比较 release 会漏规则变化。稳定/金丝雀引用的内容不可 GC，回退历史、审计、幂等回执与 ChangeLog 各按用途保留。坏配置导致不兼容写入时，缩百分比不能撤销写入，先做兼容演进；临时 flag 需要 owner 和清理期限。'
], [
    'If R18 is bad, publish a higher g clearing canary and selecting R17 through the same expected_generation transaction, recording the reason. Both former cohorts in D5’s final frame now show g43/R17. Reuse old bytes without fabricating R19 or deleting bad history. Processes already on R17 may reuse bytes but must update the selected view and clear old proof.',
    'ETags including new g and rule detect rollback; release-only comparison misses rule changes. Do not GC content referenced by stable/canary. Rollback history, audit, receipts and ChangeLog each have purpose-specific retention. Smaller percentages cannot undo incompatible data writes: evolve compatibility first. Temporary flags need owners and cleanup deadlines.'
])))

parts.append(section('故障与容量：请求预算和字节预算一起算', 'Failure and capacity: budget both requests and bytes', decks[5] + b([
    '<strong>30 秒冷拉：333 批请求/s，不是 333 个正文包/s。</strong>每进程 10 × 40 KB = 400 KB，全体 4 GB。分 30 秒平均 133.3 MB/s ≈ 1.07 Gb/s；每批含 10 个 namespace，即 3,333 个包/s。若逐包 GET，约 3,333 请求/s，字节不变。500 批响应/s 在平均包大小下是 200 MB/s；1 MB 上限包更大，所以另设全局字节/回源预算。',
    '启动抖动后用有上限指数退避与 Full Jitter；AWS 原文显示无抖动的退避仍会形成重试簇。<a href="#ref-8">[8]</a> 随机 30 秒只是均值，准入/Retry-After 才封尖峰。普通客户端持好快照排队；关键证明照常到期。不可为了恢复流量而停安全时钟。',
    'Bundle Cache 按 namespace/release/摘要缓存不可变正文，缓存命中不证明 Current 最新。single-flight 只合并单节点 miss，多节点还需共享缓存或全局 origin 准入。权威 Current 与正文读分开：D6 Store 路径除缓存 miss 外还承载权威选择，不能只标成“miss 才读库”。'
], [
    '<strong>Thirty-second cold recovery averages 333 batch requests/s, not 333 payload bundles/s.</strong> Each process needs ten × 40 KB = 400 KB; the fleet needs 4 GB. Over thirty seconds that is 133.3 MB/s ≈1.07 Gb/s. Ten namespaces/batch means 3,333 bundles/s. Separate GETs require about 3,333 requests/s with unchanged bytes. Five hundred batch responses/s means 200 MB/s at average sizes; one-MB capped bundles can be much larger, requiring independent global byte/origin admission.',
    'After startup jitter, use capped exponential backoff with Full Jitter. AWS shows unjittered backoff still clusters retries. <a href="#ref-8">[8]</a> A random thirty-second window only sets an average; admission and Retry-After bound spikes. Ordinary clients queue with good snapshots while critical proofs expire normally. Recovery cannot pause the safety clock.',
    'Bundle Cache keys immutable bytes by namespace/release/digest, without proving fresh Current. Single-flight only merges per-node misses; multiple nodes need shared caching or global origin admission. Separate authoritative Current reads from payload reads. D6’s Store path also carries authority selection, so it cannot say the database is used only on cache misses.'
]) + detail('单包大范围发布、传播目标与观测', 'Broad publication, propagation target and observability', b([
    '一个 40 KB 包全量到 1 万进程是 400 MB。10 秒应用目标仅正文平均需 40 MB/s = 320 Mb/s。每 0.25 秒准入 500 人是 2,000 接收者/s，20 批保守预算约 5 秒，余下给 GET/校验/应用；这与冷启动 500 个十包批响应/s 是不同准入单位。50/s 发布若都全量，正文为 20 GB/s = 160 Gb/s，必须合并待发代次、排队和限制大范围发布。',
    'watch 空闲 10,000/60≈167 续约/s，按 namespace 每 5 秒轮询则 20,000/s，约 120 倍；变更会提前解开 watch，167 不是上限。普通 300 秒对账约 33.3 批请求/s，是否权威选包及批大小必须算入库预算。',
    '按 namespace/g/release/cohort 汇总 fetched、applied、失败、确认年龄和 commit→applied 分布。缺遥测是 unknown；坏配置虽 schema 合法仍可能伤业务。错误升高先停扩围，用更大 g 回退并限速修复。慢消费者有界队列溢出后断开，再以游标/RESET 恢复。'
], [
    'One 40-KB bundle to ten thousand processes is 400 MB. A ten-second apply target requires 40 MB/s =320 Mb/s average payload egress alone. Five hundred recipients every 0.25s means 2,000 recipients/s: budget roughly five seconds for twenty batches, leaving GET/validation/application time. This differs from cold-start admission of five hundred ten-bundle responses/s. Fifty full publishes/s would require 20 GB/s =160 Gb/s, forcing generation coalescing, queues and broad-publication limits.',
    'Idle watches renew about 10,000/60≈167 times/s. Polling every namespace every five seconds produces 20,000/s, roughly 120×. Changes wake watches early, so 167 is not a ceiling. Three-hundred-second reconciliation averages 33.3 batch requests/s; account separately for authority selection and batch size.',
    'Aggregate fetched, applied, failures, confirmation age and commit→applied distributions by namespace/g/release/cohort. Missing telemetry is unknown. Schema-valid config can still harm business. Stop expansion on rising errors and publish a higher-g rollback through limited recovery. Bound slow-consumer queues; disconnect overflow and recover through cursors/RESET.'
]))))

# A semantic correction in the original capacity diagram: authority reads also use Store.
parts[-1] = parts[-1].replace('>miss only</text>', '>authority / miss</text>')

rows = [
    ('提交后进程崩溃', 'Crash after commit', '回执和 ChangeLog 在事务中；原键查结果、relay 重放。', 'Receipt and ChangeLog survive; query the original key and replay.'),
    ('先换快照，旧确认才到', 'Old confirmation after a swap', '切换时清 pending/proof；精确视图不匹配不续资格。', 'Clear pending/proof at swap; an exact-view mismatch never qualifies.'),
    ('断线超过历史窗口', 'Disconnect beyond history', 'RESET 后整包重拉，应用再续订；不跳过缺口。', 'RESET, full refetch, apply, then resubscribe without skipping the gap.'),
    ('关键 allow 旧且无证明', 'Old critical allow without proof', '入口拒绝；普通值继续；长动作另查检查点。', 'Deny admission, retain ordinary values, recheck long work at checkpoints.'),
    ('要求全球立即撤权', 'Immediate global revocation', '改变合同：操作同步权威，或等旧授权到期。', 'Change the contract: synchronous operation authority or wait out old qualification.'),
]
table = '<table><thead><tr><th>' + pair('反例', 'Counterexample') + '</th><th>' + pair('必须留下的恢复行为', 'Required recovery behavior') + '</th></tr></thead><tbody>'
for zh, en, za, ea in rows:
    table += '<tr><td>' + pair(zh, en) + '</td><td>' + pair(za, ea) + '</td></tr>'
table += '</tbody></table>'
parts.append(section('验证与口述：把失败窗口说完整', 'Validate and explain the failure windows', table + b([
    '本地示例实际验证 SQLite 事务/唯一约束、双连接发布竞争、丢回复重试和提交后日志恢复；Java17 验证本地 watch 竞争、整包切换、同 g 身份重选、延迟/重放确认与证明边界。<a href="../examples/ch28/README.md">运行说明与适配限制</a>、<a href="../docs/reviews/ch28.md">作者记录</a>均保留源码哈希。它们没有运行 PostgreSQL/etcd 集群、OS 暂停、复制切主、网络分区或生产压测。',
    '<strong>一分钟口述：</strong>热路径读本地；控制面事务推进 g 并留下回执/ChangeLog；watch 登记后复查，缺历史就重拉；SDK 准备完再整包应用，按认证身份选择；灰度回退推进 g，关键证明从请求起点计时并绑定已应用视图。连接、正文出口和权威读分开预算。'
], [
    'Local examples execute actual SQLite transactions/constraints, two-connection publish races, lost-reply retry and durable log recovery. Java17 checks local watch races, whole-view installation, same-g identity reselection, late/replayed confirmation and proof boundaries. <a href="../examples/ch28/README.md">Run instructions and adapter limits</a> and the <a href="../docs/reviews/ch28.md">author record</a> bind results to source hashes. They do not run PostgreSQL/etcd clusters, OS suspension, replicated failover, network partitions or production load tests.',
    '<strong>One-minute explanation:</strong> read local on the hot path. A control-plane transaction advances g and persists receipts/ChangeLog. Register watches then recheck; refetch across history gaps. Prepare before whole-bundle apply and select by authenticated identity. Rollback advances g. Critical proof ages from request start and binds the exact applied view. Budget connections, payload egress and authority reads separately.'
])))

refs = re.search(r'<ol\b[^>]*>[\s\S]*?</ol>', original)
references = refs.group(0)
references = references.replace('支持事务全做或全不做；五类发布记录是本章设计。', '事务原子性；<a href="https://www.postgresql.org/docs/18/explicit-locking.html">§13.3 FOR UPDATE</a> 串行同一行写者；发布记录是本章设计。').replace(
    'All-or-nothing transactions; the five publication records are our design.', 'Transaction atomicity; <a href="https://www.postgresql.org/docs/18/explicit-locking.html">§13.3 FOR UPDATE</a> serializes same-row writers. Publication records are our design.').replace(
    'watch 无线性化与有界延迟。', 'watch 不保证线性化或有界到达。').replace(
    'watch without linearizability or bounded delay.', 'watch without linearizability or bounded arrival time.').replace(
    'checked 2026-10-07', 'checked 2026-10-24').replace('30 秒、500 包/秒为本章假设。', '30 秒、500 批响应/秒为本章假设。').replace(
    'thirty seconds and five hundred bundles/s are our assumptions.', 'thirty seconds and five hundred batch responses/s are our assumptions.')
references = references.replace('</ol>', '<li id="ref-10">[10] Oracle, <a href="https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/System.html#nanoTime()"><em>System.nanoTime</em></a>, Java SE 17. ' + pair('同 JVM 经过时间用途；不替代本章休眠/恢复时钟适配。', 'Elapsed-time measurement within one JVM; not our suspension/resume clock adapter.') + '</li></ol>')
parts.append(section('引用：一手机制与教学假设分开', 'References: primary mechanisms versus teaching assumptions', '<p class="cite">' + pair('以下来源于 2026-10-24 重新核对。', 'Sources rechecked on 2026-10-24.') + '</p>' + references))

cards = [
    ('201 确认什么？','What does 201 confirm?', '权威事务提交与可恢复结果，不保证全体已应用。','Authority commit and a recoverable result, not fleet application.'),
    ('同一次发布重试先查什么？','Check what first on retry?', '先鉴权；锁住 Current 后查原回执并核完整意图哈希，再检查新事务 expected g。','Authenticate, lock Current, check the original receipt and full intent hash, then test expected g for new work.'),
    ('R18 回 R17 合法吗？','Is R18 to R17 valid?', 'g43 选旧 R17 合法；推进发布代次，不伪造新内容。','g43 may select old R17: advance publication order without fabricating new content.'),
    ('只改灰度规则呢？','What about rule-only edits?', '推进 g、审计、回执和 ChangeLog；ETag 含规则与身份上下文。','Advance g, audit, receipt and ChangeLog; ETag includes rule and identity context.'),
    ('丢唤醒怎么关？','Close a lost wakeup?', '登记后复查；本地登记和 relay 更新使用同一同步规则，底层缺历史另走 RESET。','Register then recheck under the same local rule as relay updates; use RESET for history gaps.'),
    ('cursor 被裁剪了？','Cursor compacted?', 'g 小于 compacted_through 就 RESET，完整重拉并应用后再订阅。','If g is below compacted_through, RESET, refetch fully, apply and resubscribe.'),
    ('同 g 可以换 release 吗？','Can the same g select another release?', '同身份不允许分叉；签发身份上下文变了，清旧选择/证明后重新取同 g 视图。','Reject same-identity forks. An issued identity-context change clears selection/proof and reselects even at the same g.'),
    ('安全证明从何时算？','When does proof age start?', '匹配已应用视图的权威请求起点，响应须小于2秒，资格年龄小于30秒。','The authority request start for the exact applied view; response under two seconds and proof age under thirty.'),
    ('休眠后允许继续吗？','Continue after suspension?', '时钟计入暂停，或恢复前更换 era/清证明；重启只恢复正文。','Count suspension, or change era and clear proof before resumed actions. Restart restores bytes only.'),
    ('每10秒确认成本？','Cost of ten-second checks?', '1,000 / 10 = 100 权威读/s；1万进程则1,000/s。','1,000/10 =100 authority reads/s; ten thousand processes require 1,000/s.'),
    ('冷拉是333包/s吗？','Is cold recovery 333 bundles/s?', '333批请求/s，每批10包，即3,333包/s；全体4GB，30秒约1.07Gb/s。','333 batch requests/s × ten bundles =3,333 bundles/s; 4GB total, about 1.07Gb/s over thirty seconds.'),
    ('5%正好500人吗？','Exactly five hundred at five percent?', '均匀哈希下只是预期500；固定salt保留扩围子集，精确人数用名单。','Five hundred is an expectation. Fixed salt retains the expansion subset; exact counts need a list.'),
    ('300秒保证10秒吗？','Does 300 seconds guarantee ten?', '不保证。正常传播目标与普通漏提醒对账是不同合同。','No. Normal propagation and ordinary missed-hint reconciliation are different contracts.'),
]
card_html = '<p class="cite">' + pair('先口述，再翻面核对。','Explain first, then flip to check.') + '</p><div class="cards-grid">'
for qz, qe, az, ae in cards:
    card_html += '<button type="button" class="flip"><span class="q">' + pair(qz, qe) + '</span><span class="a">' + pair(az, ae) + '</span></button>\n'
parts.append(section('闪卡', 'Flashcards', card_html + '</div>'))
parts.append(original[original.index('  <p><button type="button" class="read-toggle"'):])
target.write_text('\n'.join(parts))
print('Rewrote Ch28; all six original decks and 31 frames retained')
