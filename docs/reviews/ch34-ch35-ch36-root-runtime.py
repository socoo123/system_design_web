"""Independent normal/failure inputs against Ch34's real SQLite adapter."""
from pathlib import Path
import datetime
import hashlib
import importlib.util
import json
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
sys.dont_write_bytecode = True
path = ROOT / 'examples/ch34/model.py'
spec = importlib.util.spec_from_file_location('root_runtime', path)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
checks = []


def check(name, condition):
    checks.append({'name': name, 'passed': bool(condition)})
    assert condition, name


def rejected(name, fn):
    try:
        fn()
    except m.Rejected:
        check(name, True)
    else:
        check(name, False)


def binding(amount=17, tool='charge', **args):
    return {'tenant': 'root-tenant', 'actor': 'root-reviewer', 'agent': 'support',
            'tool': tool, 'route': 'root-authority', 'resource': 'account-1',
            'policy': 'policy-4', 'args': {'amount': amount, **args}}


def act(identity, b=None):
    return {'id': identity, 'key': 'effect:' + identity, 'binding': b or binding()}


with tempfile.TemporaryDirectory() as tmp:
    r = m.Runtime(Path(tmp) / 'runtime.db')
    g = m.Gateway(Path(tmp) / 'business.db')
    rid = r.admit('root-tenant', 'root-reviewer', 'input-8', {'task': 'root-fresh'})
    check('same admitted request reuses the durable run', r.admit('root-tenant', 'root-reviewer', 'input-8', {'task': 'root-fresh'}) == rid)
    rejected('same key cannot switch actor', lambda: r.admit('root-tenant', 'another-actor', 'input-8', {'task': 'root-fresh'}))
    other = r.admit('another-tenant', 'root-reviewer', 'input-8', {'task': 'root-fresh'})
    check('same request key in another tenant has another run', other != rid)
    claimed = r.claim(rid, 'root-owner', r.row(rid)['version'])
    first = r.start_step(claimed, {'random': 41, 'clock': 300, 'evidence': 'snapshot-a'}, 400)
    rejected('stale version cannot commit model output', lambda: r.commit_output(claimed, first['n'], {'proposal': 'late'}))
    second = r.start_step(r.row(rid), {'random': 99, 'clock': 999, 'evidence': 'snapshot-b'}, 500)
    check('retry reuses the original non-deterministic inputs', second['input'] == first['input'])
    check('unreported attempts retain both token holds', r.row(rid)['token_hold'] == 900)
    r.usage(first['attempt'], 125)
    before_usage = r.row(rid)
    r.usage(first['attempt'], 125)
    check('usage duplicate is stable while another attempt stays held', r.row(rid)['token_used'] == 125 and r.row(rid)['token_hold'] == 500)
    rejected('conflicting usage cannot overwrite accounting', lambda: r.usage(first['attempt'], 124))
    a1, a2 = act('root-a1'), act('root-a2')
    r.commit_output(r.row(rid), first['n'], {'calls': ['a1', 'a2']}, [a1, a2])
    r.dispatch(r.row(rid), a1['id'])
    rejected('second action cannot dispatch before the first is resolved', lambda: r.dispatch(r.row(rid), a2['id']))
    r.unknown(r.row(rid), a1['id'])
    rejected('UNKNOWN still blocks the second action', lambda: r.dispatch(r.row(rid), a2['id']))
    r.observe(r.row(rid), a1['id'], {'key': a1['key'], 'binding': a1['binding'], 'outcome': 'FAILED_KNOWN'})
    dispatch = r.dispatch(r.row(rid), a2['id'])
    prior_owner = r.row(rid)
    r.cancel(rid)
    receipt = g.execute(dispatch['key'], dispatch['binding'])
    check('remote replay returns one receipt and one effect', g.execute(dispatch['key'], dispatch['binding']) == receipt)
    rejected('cancel fences the former observation writer', lambda: r.observe(prior_owner, a2['id'], receipt))
    check('cancelled in-flight work remains recoverable', r.row(rid)['status'] == 'CANCEL_REQUESTED')
    r.claim(rid, 'root-reconciler', r.row(rid)['version'])
    r.observe(r.row(rid), a2['id'], receipt)
    check('late success is recorded without clearing cancellation', r.row(rid)['cancelled'] == 1 and r.row(rid)['status'] == 'COMPENSATING')
    with m.connect(r.path) as db:
        last = db.execute("SELECT payload FROM events WHERE run_id=? AND kind='OBSERVED' ORDER BY seq DESC LIMIT 1", (rid,)).fetchone()[0]
        check('late SUCCESS event retains action outcome instead of run state', json.loads(last)['outcome'] == 'SUCCESS')
    rejected('cancellation cannot schedule another model step', lambda: r.next_step(r.row(rid)))
    undo = binding(tool='refund', original_key=a2['key'])
    r.compensate(r.row(rid), a2['id'], 'root-undo', undo)
    dispatched_undo = r.dispatch(r.row(rid), 'root-undo')
    undo_receipt = g.execute(dispatched_undo['key'], dispatched_undo['binding'])
    r.observe(r.row(rid), 'root-undo', undo_receipt)
    r.finish_compensation(r.row(rid))
    check('complete compensation stays a business failure outcome', r.row(rid)['status'] == 'COMPENSATED' and r.row(rid)['cancelled'] == 1)
    with m.connect(g.path) as db:
        check('actual remote DB was charged and refunded once', db.execute('SELECT balance FROM account WHERE id=1').fetchone()[0] == 1000 and db.execute('SELECT count(*) FROM receipts').fetchone()[0] == 2)

    # Legacy persisted data can contain more than one outstanding action.
    # Construct it explicitly to test recovery, independent of the new dispatch guard.
    legacy = r.admit('root-tenant', 'root-reviewer', 'legacy-two', {})
    r.claim(legacy, 'old-version', r.row(legacy)['version'])
    step = r.start_step(r.row(legacy), {'legacy': True})
    l1, l2 = act('legacy-a'), act('legacy-b')
    r.commit_output(r.row(legacy), step['n'], {'calls': 2}, [l1, l2])
    with m.transaction(r.path) as db:
        db.execute("UPDATE actions SET status='DISPATCHING',attempts=1 WHERE run_id=?", (legacy,))
        db.execute('UPDATE runs SET tool_count=2 WHERE run_id=?', (legacy,))
    r.cancel(legacy)
    r.claim(legacy, 'legacy-reconciler', r.row(legacy)['version'])
    r.observe(r.row(legacy), l1['id'], {'key': l1['key'], 'binding': l1['binding'], 'outcome': 'FAILED_KNOWN'})
    check('legacy cancellation cannot terminate over a second pending effect', r.row(legacy)['status'] == 'CANCEL_REQUESTED')
    with m.connect(r.path) as db:
        last = db.execute("SELECT payload FROM events WHERE run_id=? AND kind='OBSERVED' ORDER BY seq DESC LIMIT 1", (legacy,)).fetchone()[0]
        check('late known-failure event is not replaced with CANCEL_REQUESTED', json.loads(last)['outcome'] == 'FAILED_KNOWN')
    l2_receipt = g.execute(l2['key'], l2['binding'])
    r.observe(r.row(legacy), l2['id'], l2_receipt)
    check('remaining legacy success can still be reconciled', r.action(l2['id'])['status'] == 'SUCCESS' and r.row(legacy)['status'] == 'COMPENSATING')

    approval_run = r.admit('root-tenant', 'root-reviewer', 'approval-cancel', {})
    r.claim(approval_run, 'approval-owner', r.row(approval_run)['version'])
    step = r.start_step(r.row(approval_run), {'approval': 17})
    aa = act('approval-action')
    r.commit_output(r.row(approval_run), step['n'], {'write': True}, [aa])
    pause = r.park(r.row(approval_run), aa['id'], 'approval-root')
    decision = g.approve('approval-root', aa['binding'])
    pause_version = r.row(approval_run)['version']
    wrong = {**decision, 'binding': {**decision['binding'], 'agent': 'billing'}}
    rejected('decision cannot cross Agent binding', lambda: r.resume(approval_run, pause, pause_version, wrong))
    r.cancel(approval_run)
    rejected('late approval cannot resurrect a cancelled pause', lambda: r.resume(approval_run, pause, pause_version, decision))
    check('cancelled unissued approval stays terminal', r.row(approval_run)['status'] == 'CANCELLED')

    confirmed = r.admit('root-tenant', 'root-reviewer', 'cancel-after-observed', {})
    r.claim(confirmed, 'normal-owner', r.row(confirmed)['version'])
    step = r.start_step(r.row(confirmed), {'known-effect': 1})
    ca = act('confirmed-before-cancel')
    r.commit_output(r.row(confirmed), step['n'], {'write': True}, [ca])
    sent = r.dispatch(r.row(confirmed), ca['id'])
    known = g.execute(sent['key'], sent['binding'])
    r.observe(r.row(confirmed), ca['id'], known)
    r.cancel(confirmed)
    check('cancel after an already-observed effect schedules compensation', r.row(confirmed)['status'] == 'COMPENSATING')
    r.claim(confirmed, 'known-effect-recovery', r.row(confirmed)['version'])
    r.observe(r.row(confirmed), ca['id'], known)
    check('duplicate known receipt cannot strand compensation', r.row(confirmed)['status'] == 'COMPENSATING')
    r.compensate(r.row(confirmed), ca['id'], 'confirmed-undo', binding(tool='refund', original_key=ca['key']))
    check('confirmed effect has a dispatchable compensation action', r.action('confirmed-undo')['status'] == 'PREPARED')

files = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in [path, ROOT / 'examples/ch34/claim.sql']}
result = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'files': files,
          'checks': checks, 'passed': all(c['passed'] for c in checks),
          'limits': 'Actual local SQLite transactions and a separate fixture business DB. No model, real tool provider, signing, remote cancellation or production workflow engine.'}
(ROOT / 'docs/reviews/ch34-ch35-ch36-root-runtime-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'passed': result['passed'], 'checks': len(checks)}))
