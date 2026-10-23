"""Independent cases against the author's unmodified SQLite adaptation.

AST-load only definitions, so author result files are never written. This is
not a second full backend or a PostgreSQL/consensus implementation.
"""
from pathlib import Path
from fractions import Fraction
import ast
import concurrent.futures
import hashlib
import html
import json
import math
import re
import sqlite3
import tempfile
import threading

ROOT = Path(__file__).resolve().parents[2]
results = []


def require(name, condition, detail=None):
    assert condition, name
    results.append({'name': name, 'passed': True, 'detail': detail})


tree = ast.parse((ROOT / 'examples/ch12/verify.py').read_text())
definitions = [n for n in tree.body if isinstance(n, (ast.Import, ast.ImportFrom, ast.FunctionDef))]
subject = {'ROOT': ROOT, '__file__': str(ROOT / 'examples/ch12/verify.py')}
exec(compile(ast.Module(definitions, type_ignores=[]), '<unmodified-author-definitions>', 'exec'), subject)
connect, setup, submit, receipt = [subject[n] for n in ('conn', 'setup', 'submit', 'receipt')]

page = (ROOT / 'chapters/ch12.html').read_text()
blocks = re.findall(r'<pre\b[^>]*data-source="([^"]+)"[^>]*><code>(.*?)</code></pre>', page, re.S)
require('five exact source/HTML blocks', len(blocks) == 5 and all(
    html.unescape(code) == (ROOT / 'examples/ch12' / filename).read_text().rstrip('\n')
    for filename, code in blocks))

with tempfile.TemporaryDirectory(prefix='ch12-independent-') as directory:
    file = Path(directory) / 'authority.sqlite'
    setup(file)
    require('normal commit returns seq106', submit(file, 'independent-normal', b'one') == ('SENT', 106))
    require('commit response loss is unknown', submit(file, 'independent-lost', b'two', lost_ack=True) == ('UNKNOWN', None))
    require('same key recovers lost commit as seq107', submit(file, 'independent-lost', b'two') == ('SENT', 107))
    require('changed body under existing key is rejected', submit(file, 'independent-lost', b'changed') == ('KEY_REUSED', None))
    require('partial write failure rolls back', submit(file, 'independent-abort', b'bad', fail=True) == ('ABORT', None))
    require('next normal submit has no aborted-sequence hole', submit(file, 'after-abort', b'three') == ('SENT', 108))

    # Unlike the author's same-key race, these are distinct requests / two senders.
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        written = list(pool.map(lambda i: submit(file, f'distinct-{i}', f'body-{i}'.encode(),
                                                user='a' if i % 2 else 'b'), range(20)))
    require('20 concurrent distinct sends cover exactly109..128',
            all(state == 'SENT' for state, _ in written)
            and sorted(seq for _, seq in written) == list(range(109, 129)))
    with connect(file) as db:
        sizes = tuple(db.execute('SELECT (SELECT COUNT(*) FROM message),'
                                 '(SELECT COUNT(*) FROM send_receipt),(SELECT COUNT(*) FROM outbox)').fetchone())
        require('counter/message/receipt/outbox stay aligned', sizes == (23, 23, 23)
                and db.execute('SELECT head FROM conversation').fetchone()[0] == 128, sizes)
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        disputed = list(pool.map(lambda i: submit(file, 'same-key-different-intents',
                                                 b'left' if i % 2 else b'right'), range(16)))
    require('same-key different-body race has one winner intent',
            set(state for state, _ in disputed) == {'SENT', 'KEY_REUSED'}
            and {seq for state, seq in disputed if state == 'SENT'} == {129})

    require('desktop normal delivered/read receipt', receipt(file, 'desktop', 1, 129, 129) == 'ACK')
    require('phone cannot borrow user Read to jump a local gap', receipt(file, 'phone', 1, 105, 129) == 'GAP')
    require('phone may persist its lower contiguous prefix', receipt(file, 'phone', 1, 105, 0) == 'ACK')
    require('late device receipt is safely accepted', receipt(file, 'desktop', 1, 107, 0) == 'ACK')
    with connect(file) as db:
        require('each column max and device state stay independent',
                db.execute("SELECT d FROM device_receipt WHERE device_id='desktop'").fetchone()[0] == 129
                and db.execute("SELECT d FROM device_receipt WHERE device_id='phone'").fetchone()[0] == 105
                and db.execute('SELECT r FROM private_read').fetchone()[0] == 129
                and db.execute('SELECT r FROM public_read').fetchone()[0] == 129)

    # A removal holds the same transaction authority before the queued new send.
    removed, attempted = threading.Event(), threading.Event()
    def remover():
        with connect(file) as db:
            db.execute('BEGIN IMMEDIATE')
            db.execute("UPDATE member SET active=FALSE WHERE user_id='a'")
            removed.set()
            assert attempted.wait(5)
            db.commit()
    def late_sender():
        assert removed.wait(5)
        attempted.set()
        return submit(file, 'new-after-serialized-removal', b'no')
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        change = pool.submit(remover); late = pool.submit(late_sender)
        change.result(); denied = late.result()
    require('new send queued behind serialized removal is forbidden', denied == ('FORBIDDEN', None))
    require('removed sender can recover only own minimal prior receipt',
            submit(file, 'independent-normal', b'one') == ('SENT', 106))

    with connect(file) as db:
        db.execute("UPDATE member SET view_epoch=2,first_seq=120 WHERE user_id='b'")
    require('stale view cannot write current receipts', receipt(file, 'desktop', 1, 129, 129) == 'FORBIDDEN')
    require('new view starts at an authorized119 baseline', receipt(file, 'fresh', 2, 119, 119, False) == 'ACK')
    with connect(file) as db:
        require('private-only new-view receipt does not leak public state',
                db.execute('SELECT r FROM private_read WHERE view=2').fetchone()[0] == 119
                and db.execute('SELECT COUNT(*) FROM public_read WHERE view=2').fetchone()[0] == 0)
    require('candidate above committed head is rejected', receipt(file, 'fresh', 2, 130, 130) == 'OUT_OF_RANGE')

    e1 = subject['register'](file, 'route-old', 100)
    e2 = subject['register'](file, 'route-new', 101)
    require('old close and heartbeat cannot delete or extend successor',
            (e1, e2) == (1, 2) and subject['close_route'](file, e1, 'route-old', 102) == 0
            and subject['renew'](file, e1, 'route-old', 102) == 0)
    require('current close makes later same-epoch heartbeat ineffective',
            subject['close_route'](file, e2, 'route-new', 102) == 1
            and subject['renew'](file, e2, 'route-new', 103) == 0)
    e3 = subject['register'](file, 'route-third', 104)
    require('fresh registration never reuses closed epoch', e3 == 3)

    # Real local transaction: entry writes are not a durable prefix until commit.
    local = sqlite3.connect(Path(directory) / 'local.sqlite', isolation_level=None)
    local.executescript('PRAGMA synchronous=FULL; CREATE TABLE entry(seq INTEGER PRIMARY KEY,body TEXT);'
                       'CREATE TABLE cursor(upto INTEGER); INSERT INTO cursor VALUES(105);')
    local.execute('BEGIN IMMEDIATE'); local.execute("INSERT INTO entry VALUES(108,'late')"); local.commit()
    local.execute('BEGIN IMMEDIATE')
    local.executemany('INSERT INTO entry VALUES(?,?)', [(106, 'one'), (107, 'two')])
    local.execute('UPDATE cursor SET upto=108'); local.rollback()
    require('rollback of local entries and cursor exposes no false Delivered108',
            local.execute('SELECT upto FROM cursor').fetchone()[0] == 105
            and [row[0] for row in local.execute('SELECT seq FROM entry')] == [108])
    local.execute('BEGIN IMMEDIATE')
    local.executemany('INSERT INTO entry VALUES(?,?)', [(106, 'one'), (107, 'certified omitted slot')])
    current = 105
    while local.execute('SELECT 1 FROM entry WHERE seq=?', (current + 1,)).fetchone():
        current += 1
    local.execute('UPDATE cursor SET upto=?', (current,)); local.commit()
    require('normal durable local gap closure reaches108', current == 108)
    local.close()

    # The sample intentionally avoids this unsafe GC. Show the actual failure.
    with connect(file) as db:
        db.execute("UPDATE member SET active=TRUE WHERE user_id='a'")
        db.execute("DELETE FROM send_receipt WHERE client_msg_id='independent-lost'")
    require('negative trace: receipt GC accepts delayed old intent again',
            submit(file, 'independent-lost', b'two') == ('SENT', 130))
    with connect(file) as db:
        require('unsafe GC created two message bodies for one intent',
                db.execute('SELECT COUNT(*) FROM message WHERE body=?', (b'two',)).fetchone()[0] == 2)

message_day = Fraction(10_000_000, 2) * 20
average = message_day / 86400
peak = average * 5
sockets = 10_000_000 * Fraction(15, 100) * Fraction(12, 10)
budget = 100_000 * Fraction(60, 100)
numbers = {
    'daily_messages': int(message_day), 'average_s': float(average), 'peak_s': float(peak),
    'sockets': int(sockets), 'normal_gateways': math.ceil(sockets / budget),
    'same_budget_N_minus_one': math.ceil(sockets / budget) + 1,
    '29_survivors_budget': int(29 * budget), '29_survivors_raw_utilization': float(sockets / (29 * 100_000)),
    'socket_memory_GB': float(sockets * 16_000 / 10**9),
    'raw_annual_TB': float(message_day * 1000 * 365 / 10**12),
    'three_copy_annual_TB': float(message_day * 1000 * 365 * 3 / 10**12),
    'all_online_push_frames_s': float(peak * Fraction(24, 10)),
    'payload_egress_Mbps': float(peak * Fraction(24, 10) * 1000 * 8 / 10**6),
    'heartbeats_s': int(sockets / 30), 'handshakes_s': 60_000 / 15,
    'recovery_history_rows_s': 60_000 / 15 * 100, 'all_full_buffers_TB': float(sockets * 10**6 / 10**12),
    'small_group_refs_s': 20 * 200, 'no_headroom_member_limit': 10_000 / 20,
    'large_group_targets_ratio': 50_000 / 500, 'healthy_presence_bound_s': 90 + 5,
}
require('independent exact gateway budget and N-1 arithmetic',
        numbers['normal_gateways'] == 30 and numbers['same_budget_N_minus_one'] == 31
        and numbers['29_survivors_budget'] == 1_740_000, numbers)
require('independent bytes and delivery fanout arithmetic',
        numbers['three_copy_annual_TB'] == 109.5 and numbers['socket_memory_GB'] == 28.8
        and numbers['all_full_buffers_TB'] == 1.8 and round(numbers['payload_egress_Mbps'], 3) == 111.111)

report = {'passed': True, 'checks': results, 'count': len(results), 'numbers': numbers,
          'pageSha256': hashlib.sha256((ROOT/'chapters/ch12.html').read_bytes()).hexdigest(),
          'subject': 'AST-loaded unmodified author SQLite functions plus independent inputs / SQL probes',
          'limits': ['SQLite writer serialization does not verify PostgreSQL row locks',
                     'No provider/network/consensus/failover or actual device power-loss test']}
(ROOT/'docs/reviews/ch12-independent-probe-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
print(f"PASS {len(results)} independent cases")
