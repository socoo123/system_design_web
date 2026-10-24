"""New-input probes against the actual SQLite teaching adapters, not PG/index/LLM tests."""
from pathlib import Path
from datetime import datetime, timezone
import copy
import hashlib
import importlib.util
import json
import sys
import tempfile

sys.dont_write_bytecode = True
root = Path(__file__).resolve().parents[2]
checks = []


def check(condition, label):
    checks.append(dict(name=label, passed=bool(condition)))
    assert condition, label


def denied(kind, action, label):
    try:
        action()
    except kind:
        check(True, label)
    else:
        check(False, label)


def module(ch):
    spec = importlib.util.spec_from_file_location('root_wave9_' + ch, root / f'examples/{ch}/model.py')
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


m28, m30 = module('ch28'), module('ch30')
result = dict(passed=False, checks=checks)
try:
    with tempfile.TemporaryDirectory(prefix='wave9-root-sql-') as tmp:
        db = Path(tmp) / 'config.sqlite'
        c = m28.Store(db, initialize=True)
        namespace = 'billing/prod/asia'
        c.seed(namespace, 123)
        def intent(g, **options):
            return dict(namespace=namespace, expected_generation=g, stable='R17', canary='R18',
                        percent=11, salt='release-2026', cluster='approved', reason='rollout', **options)
        first = intent(123)
        check(c.publish('operator-9', 'publish-101', first) == 124, 'config publishes a fresh independent generation range')
        next_intent = intent(124)
        next_intent['percent'] = 37
        check(c.publish('operator-9', 'publish-102', next_intent) == 125, 'config rules-only next publication advances')
        reordered = dict(reversed(list(first.items())))
        check(c.publish('operator-9', 'publish-101', reordered) == 124, 'old canonical receipt survives a later unrelated publish')
        check(c.snapshot(namespace)['generation'] == 125, 'historic replay never rewinds current')
        changed = copy.deepcopy(first); changed['salt'] = 'new-cohort'
        denied(m28.Conflict, lambda: c.publish('operator-9', 'publish-101', changed), 'same key cannot bind a different cohort salt')
        denied(PermissionError, lambda: c.publish('operator-9', 'publish-101', first, authorized=False), 'revoked publisher cannot recover historic receipt through this API')
        before = c.counts(), c.snapshot(namespace)
        failure = intent(125)
        failure.update(stable='new-content', new_content=dict(release='new-content', payload=dict(timeout_ms=750, allow=False)))
        denied(RuntimeError, lambda: c.publish('operator-9', 'publish-abort', failure, fail_at='current'), 'injected fault after current rolls back new release too')
        check((c.counts(), c.snapshot(namespace)) == before, 'no partial content or current escaped failed publish')
        c.compact(namespace, 124)
        check(c.changes_after(namespace, 123) == ('RESET', 125), 'old cursor cannot skip compacted history')
        check(c.changes_after(namespace, 124) == ('CHANGED', [125]), 'floor cursor resumes after last-applied event')
        snapshot = c.snapshot(namespace)
        c.publish('operator-9', 'publish-103', intent(125))
        check(c.changes_after(namespace, snapshot['generation']) == ('CHANGED', [126]), 'snapshot-to-watch gap retains next committed publication')
        c.close()

        rag_path = str(Path(tmp) / 'rag.sqlite')
        a = m30.Catalog(rag_path)
        a.membership('tenant', 'reader', ['staff'])
        def publish_doc(doc, rev=1, sequence=1, pool='g1'):
            job = a.accept('event-' + doc + '-' + str(sequence), 'tenant', doc, sequence, rev, 'HELLO! WORLD!', pools=(pool,))[0]
            epoch = a.claim(job, 'author')
            child = doc + '-child-' + str(rev)
            parent = doc + '-parent-' + str(rev)
            child_hash = a.put_chunk(child, 'tenant', doc, rev, pool, 0, 6, 'HELLO!')
            parent_hash = a.put_chunk(parent, 'tenant', doc, rev, pool, 0, 12, 'HELLO! WORLD!')
            children = {child: child_hash}
            text = {child: child_hash, parent: parent_hash}
            a.freeze_manifest(job, children, text)
            a.policy('tenant', doc, ['staff'], [(0, 12, ['staff'])], rev=rev)
            receipts = dict(text=text, bm25=children, dense=children, pool=pool, splitter='s1')
            a.publish(job, 'author', epoch, receipts)
            return job, epoch, child, parent, receipts
        _, _, child, parent, receipts = publish_doc('A')
        check(bool(a.pin('tenant', 'reader', 'g1', [child])), 'published indexed child can enter candidate selection')
        check(bool(a.pin('tenant', 'reader', 'g1', [parent], indexed=False)), 'published parent text can be separately authorized')
        denied(m30.Denied, lambda: a.pin('tenant', 'reader', 'g1', [parent]), 'parent text cannot impersonate an indexed child')
        a.put_chunk('staging-extra', 'tenant', 'A', 1, 'g1', 0, 6, 'BYE!!!')
        denied(m30.Denied, lambda: a.pin('tenant', 'reader', 'g1', ['staging-extra']), 'original manifest P1: same-version staging candidate rejected')
        denied(m30.Denied, lambda: a.pin('tenant', 'reader', 'g1', ['staging-extra'], indexed=False), 'same-version staging cannot enter pack as expanded parent either')
        old_hash = a.db.execute('SELECT digest FROM chunk WHERE id=?', (child,)).fetchone()[0]
        a.db.execute('UPDATE chunk SET digest=? WHERE id=?', ('changed-hash', child))
        denied(m30.Denied, lambda: a.pin('tenant', 'reader', 'g1', [child]), 'manifest hash mismatch is rejected even with matching ID/revision')
        a.db.execute('UPDATE chunk SET digest=? WHERE id=?', (old_hash, child))
        _, _, bchild, _, _ = publish_doc('B')
        pack = a.pin('tenant', 'reader', 'g1', [child, bchild])
        sent = []
        check(a.check_pack('tenant', 'reader', 'g1', pack), 'full prompt dependencies qualify before generation')
        b = m30.Catalog(rag_path)
        def slow_judge_revokes_uncited():
            b.policy('tenant', 'B', ['administrators'])
            return 'SUPPORTED'
        denied(m30.Denied, lambda: a.release('tenant', 'reader', 'g1', pack, [1], slow_judge_revokes_uncited, lambda: sent.append('bytes')), 'uncited prompt dependency revocation after judgment discards draft')
        check(sent == [], 'revoked uncited dependency sent no answer bytes')
        b.policy('tenant', 'B', ['staff'])
        pack = a.pin('tenant', 'reader', 'g1', [child, bchild])
        def epoch_change():
            b.membership('tenant', 'reader', ['staff', 'new-group'])
            return 'SUPPORTED'
        denied(m30.Denied, lambda: a.release('tenant', 'reader', 'g1', pack, [1], epoch_change, lambda: sent.append('bytes')), 'membership epoch change invalidates draft despite retained staff permission')
        check(sent == [], 'policy epoch invalidation emitted no bytes')
        pack = a.pin('tenant', 'reader', 'g1', [child])
        a.release('tenant', 'reader', 'g1', pack, [1], lambda: 'SUPPORTED', lambda: sent.append('normal'))
        check(sent == ['normal'], 'normal checked release still works after obtaining a new pack')
        denied(m30.Denied, lambda: a.check_pack('tenant', 'reader', 'g1', pack, authority_available=False), 'authority outage cannot turn cached pack into a proof')
        denied(m30.Denied, lambda: a.pin('other-tenant', 'reader', 'g1', [child]), 'candidate IDs cannot cross tenant authority')
        denied(m30.Denied, lambda: a.pin('tenant', 'reader', 'g2', [child]), 'pinned pool excludes other model/index generations')
        b.delete('tenant', 'A')
        denied(m30.Denied, lambda: a.check_pack('tenant', 'reader', 'g1', pack), 'tombstone denies previously pinned exact text')
        b.db.close(); a.db.close()
    result['passed'] = True
except BaseException as error:
    result['failure'] = repr(error)
finally:
    names = ['examples/ch28/model.py', 'examples/ch28/schema.sql', 'examples/ch30/model.py',
             'docs/reviews/ch28-ch29-ch30-root-sql.py']
    result['sourceHashes'] = {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in names}
    result['at'] = datetime.now(timezone.utc).isoformat()
    result['limitations'] = 'SQLite local adapter, trusted external manifest/visibility fixtures, fixture clock/judge; no real PG/ANN/LLM/replication or network test.'
    (root / 'docs/reviews/ch28-ch29-ch30-root-sql-results.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(dict(passed=result['passed'], checks=len(checks), failure=result.get('failure'))))
sys.exit(0 if result['passed'] else 1)
