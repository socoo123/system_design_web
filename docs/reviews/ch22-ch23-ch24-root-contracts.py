"""Fresh inputs against the actual chapter models; no production adapters mocked as proof."""
import sys
sys.dont_write_bytecode = True
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import importlib.util
import itertools
import json
import sqlite3
import tempfile

root = Path(__file__).resolve().parents[2]
checks = []
sources = ['examples/ch22/model.py', 'examples/ch22/schema.sql',
           'examples/ch23/model.py', 'examples/ch23/schema.sql',
           'examples/ch24/model.py', 'examples/ch24/schema.sql', 'examples/ch24/keys.sql',
           'docs/reviews/ch22-ch23-ch24-root-contracts.py']
hashes = {name: hashlib.sha256((root/name).read_bytes()).hexdigest() for name in sources}

def load(ch):
    spec = importlib.util.spec_from_file_location('root_' + ch, root/f'examples/{ch}/model.py')
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module

def check(name, condition):
    checks.append(dict(name=name, passed=bool(condition)))
    if not condition: raise AssertionError(name)

def reject(name, exception, action):
    try: action()
    except exception: check(name, True)
    else: check(name, False)

try:
    with tempfile.TemporaryDirectory(prefix='ch22-ch24-root-contracts-') as temp:
        temp = Path(temp)
        m22, m23, m24 = load('ch22'), load('ch23'), load('ch24')
        data = m22.Data(); authority = m22.Authority(temp/'objects.db', data)
        scope = ('root-tenant', 'root-bucket', 'report/2026/October')
        authority.grant('writer', *scope[:2])
        def staged(request, payload, expected=None):
            u = authority.begin('writer', scope, request, len(payload), hashlib.sha256(payload).hexdigest(), expected=expected)
            receipt = data.stage(u['id'], u['fence'], 1, payload)
            p = authority.register('writer', u['id'], u['fence'], receipt)
            return u, authority.freeze('writer', u['id'], u['fence'], [p]), receipt
        def publish(u, parts, **kw):
            return authority.publish('writer', u['id'], u['fence'], parts, **kw)
        old, oldparts, oldreceipt = staged('root-lost-reply', b'persisted first content')
        reject('Ch22 actual successful commit can have lost response', m22.Unknown,
               lambda: publish(old, oldparts, lost_ack=True))
        original = authority.query('writer', old['id'])[1]
        new, newparts, _ = staged('root-replacement', b'a different current version')
        publish(new, newparts)
        authority.release_retention(old['version_id'])
        authority.claim_version(old['version_id'])
        check('Ch22 lawful old-version physical deletion', authority.sweep_version(old['version_id'], now=1000)
              and oldreceipt.blob not in data.blobs)
        check('Ch22 saved completion survives lawful payload GC', publish(old, oldparts) == original)
        check('Ch22 replay never restores old current', authority.resolve('writer', scope, now=1000)[0]['id'] == new['version_id'])
        reject('Ch22 changed frozen manifest cannot replay success', m22.Conflict,
               lambda: publish(old, list(reversed(oldparts)) + oldparts))
        denied, deniedparts, deniedreceipt = staged('root-fixed-conflict', b'conditional loser', expected=0)
        check('Ch22 precondition conflict is persisted', publish(denied, deniedparts) == ['CONFLICT', None])
        fence = authority.claim_upload(denied['id'], now=1000)
        check('Ch22 rejected candidate is physically reclaimed', authority.sweep_upload(denied['id'], fence)
              and deniedreceipt.blob not in data.blobs)
        check('Ch22 rejected fixed receipt survives reclaiming state and data removal', publish(denied, deniedparts) == ['CONFLICT', None])
        authority.grant('writer', *scope[:2], write=False)
        reject('Ch22 current authorization still gates terminal replay', m22.Denied, lambda: publish(old, oldparts))

        board = m23.Model(temp/'board.db'); board.initialize(); board.seed()
        base = dict(game='g1', season='s17', player='000000000007', match='root-first-zero', kind='RESULT',
                    revision=1, seq=1, score=0, second=517, comparator='score-time-id-v1')
        first = board.settle(base)
        check('Ch23 first zero gets actual achievement time', first['second'] == 517)
        later = board.settle(dict(base, match='root-still-zero', seq=6, second=517))
        check('Ch23 higher full-prefix uses authority-preserved same-zero time', later['second'] == 517 and later['version'] == 6)
        stale = board.settle(dict(base, match='root-late-prefix', seq=4, score=500, second=800))
        check('Ch23 stale full-prefix snapshot cannot rewrite current', stale['status'] == 'REJECTED_STALE')
        check('Ch23 original receipt remains original version', board.settle(base) == first)
        reject('Ch23 conflicting intent is not silently deduplicated', m23.Conflict, lambda: board.settle(dict(base, second=518)))
        board.close_season()
        check('Ch23 closing still replays known successful identity', board.settle(base) == first)
        check('Ch23 new post-close revision cannot reopen season', board.settle(dict(base, revision=2, seq=10))['status'] == 'REJECTED_CLOSED')
        for order in itertools.permutations([1, 2, 3]):
            reordered = m23.Model(temp/('prefix-' + ''.join(map(str, order)) + '.db'))
            reordered.initialize(); reordered.seed()
            snapshots = {1: (100, 10), 2: (200, 20), 3: (100, 30)}
            for version in order:
                score, second = snapshots[version]
                reordered.settle(dict(base, match=f'root-prefix-{version}', seq=version,
                                      revision=version, score=score, second=second,
                                      kind='CORRECTION' if version == 3 else 'RESULT'))
            with reordered.connect() as c:
                final = c.execute('SELECT version,score,second FROM scores').fetchone()
            check(f'Ch23 corrected score-and-time snapshot converges for order {order}', final == (3, 100, 30))

        pay = m24.Store(temp/'payment.db'); pay.install()
        try:
            for table, column in [('payment','pay_no'), ('attempt','attempt_id'), ('posting','posting_id'),
                                  ('refund','refund_id'), ('outbox','event_id'), ('review','case_key')]:
                meta = pay.db.execute(f'PRAGMA table_info({table})').fetchall()
                check(f'Ch24 {table} text PK explicitly rejects NULL', next(r['notnull'] for r in meta if r['name'] == column) == 1)
            reject('Ch24 actual NULL outbox key rejected', sqlite3.IntegrityError,
                   lambda: pay.db.execute("INSERT INTO outbox VALUES(NULL,'TEST','r','{}')"))
            reject('Ch24 actual NULL review key rejected', sqlite3.IntegrityError,
                   lambda: pay.db.execute("INSERT INTO review VALUES(NULL,'{}')"))
            reject('Ch24 boolean create amount rejected', m24.Conflict, lambda: pay.create('root-bool', amount=True))
            quote = m24.VerifiedQuote('live', 'm1', 'root-raw-quote', 1, 4321, 'CNY', 'hosted')
            body = dict(order='root-raw-quote', businessVersion=1, method='hosted', amount=1, currency='JPY')
            original_count = pay.count('payment')
            raw_pay = pay.create_request('root-raw', body, quote)
            check('Ch24 raw amount and currency cannot replace authoritative quote',
                  tuple(pay.one('SELECT amount,currency,business_version FROM payment WHERE pay_no=?',(raw_pay,))) == (4321, 'CNY', 1))
            check('Ch24 raw rotated header retains authorized intent', pay.create_request('root-raw-rotated', body, quote) == raw_pay)
            reject('Ch24 raw version manipulation cannot create second intent', m24.Conflict,
                   lambda: pay.create_request('root-raw-higher', dict(body, businessVersion=2), quote))
            reject('Ch24 raw method manipulation rejects', m24.Conflict,
                   lambda: pay.create_request('root-raw-method', dict(body, method='unapproved'), quote))
            reject('Ch24 boolean version cannot equal integer one', m24.Conflict,
                   lambda: pay.create_request('root-raw-bool', dict(body, businessVersion=True), quote))
            reject('Ch24 quote is bound to authenticated merchant', m24.Conflict,
                   lambda: pay.create_request('root-raw-foreign', body, quote, merchant='m2'))
            reject('Ch24 quote is bound to authenticated environment', m24.Conflict,
                   lambda: pay.create_request('root-raw-test', body, quote, env='test'))
            check('Ch24 rejected raw modifications leave one intent and one attempt',
                  pay.count('payment') == original_count + 1 and pay.count('attempt') == original_count + 1)
            p = pay.create('root-create', order='root-invoice', amount=9876)
            check('Ch24 rotated request key resolves same business intent', pay.create('root-other-header', order='root-invoice', amount=9876) == p)
            attempt = p + ':a7'
            command = pay.prepare_send(attempt, now=30, window=100)
            check('Ch24 original replay window is fixed', pay.prepare_send(attempt, now=80, window=9999)['retry_before'] == 130)
            check('Ch24 deadline equality stops automatic send', pay.prepare_send(attempt, now=130) is None)
            evidence = pay.evidence(p, object_id='root-capture')
            journal = pay.post_capture(evidence)
            check('Ch24 repeated capture effect returns same journal', pay.post_capture(evidence) == journal and pay.count('entry') == 2)
            pay.apply_non_success(attempt)
            check('Ch24 late timeout cannot regress confirmed attempt', pay.one('SELECT state FROM attempt WHERE attempt_id=?',(attempt,))['state'] == 'CONFIRMED')
            reject('Ch24 boolean refund rejected', m24.Conflict, lambda: pay.reserve_refund('root-bool-refund', p, True))
            r1 = pay.reserve_refund('root-refund-one', p, 4000)
            r2 = pay.reserve_refund('root-refund-two', p, 3000)
            pay.refund_result(r1, 'root-refund-object', 'UNKNOWN')
            check('Ch24 unknown retains aggregate reservation', pay.one('SELECT reserved FROM payment WHERE pay_no=?',(p,))['reserved'] == 7000)
            pay.refund_result(r1, 'root-refund-object', 'SUCCEEDED')
            pay.refund_result(r1, 'root-refund-object', 'SUCCEEDED')
            check('Ch24 repeated refund success posts once', pay.count('entry') == 4 and pay.one('SELECT refunded FROM payment WHERE pay_no=?',(p,))['refunded'] == 4000)
            reject('Ch24 same external effect cannot settle another reservation', sqlite3.IntegrityError,
                   lambda: pay.refund_result(r2, 'root-refund-object', 'SUCCEEDED'))
            check('Ch24 rejected effect reuse leaves second reservation intact', pay.one('SELECT reserved FROM payment WHERE pay_no=?',(p,))['reserved'] == 3000)
        finally: pay.close()
    check('Source remained unchanged during probes', all(hashlib.sha256((root/name).read_bytes()).hexdigest() == expected for name,expected in hashes.items()))
    passed = True
except Exception as error:
    passed = False
    failure = str(error)
result = dict(at=datetime.now(timezone.utc).isoformat(), passed=passed, checks=checks, sourceHashes=hashes,
              limitation='SQLite transactions and explicit local Data/provider dependencies only; no live distributed durability, PSP, PostgreSQL, or network timing proof.',
              revision='After independent review: same-score time is authority data, six correction-delivery permutations were added, and the raw payment request is tested against a server VerifiedQuote.')
if not passed: result['failure'] = failure
(root/'docs/reviews/ch22-ch23-ch24-root-contracts-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(dict(passed=passed, checks=len(checks), failure=result.get('failure'))))
raise SystemExit(0 if passed else 1)
