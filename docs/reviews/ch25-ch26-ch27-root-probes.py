"""Root's new inputs against the actual SQLite adapters, not reimplemented state machines."""
from pathlib import Path
from datetime import datetime, timezone
from contextlib import closing
import hashlib
import importlib.util
import json
import sys
import tempfile
import time

sys.dont_write_bytecode = True
root = Path(__file__).resolve().parents[2]
prefix = 'ch25-ch26-ch27'
chapters = ['ch25', 'ch26', 'ch27']
checks = []

def source_hashes():
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
            for ch in chapters for p in [root/f'chapters/{ch}.html', *(root/'examples'/ch).rglob('*')]
            if p.is_file() and p.suffix not in {'.pyc', '.class'} and '__pycache__' not in p.parts}

def module(ch):
    spec = importlib.util.spec_from_file_location('root_probe_'+ch, root/f'examples/{ch}/model.py')
    result = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = result
    spec.loader.exec_module(result)
    return result

def check(name, condition):
    checks.append(dict(name=name, passed=bool(condition)))
    if not condition:
        raise AssertionError(name)

def rejects(name, exception, fn):
    try:
        fn()
    except exception:
        check(name, True)
    else:
        check(name, False)

before = source_hashes()
try:
    m25, m26, m27 = [module(ch) for ch in chapters]
    with tempfile.TemporaryDirectory(prefix=prefix+'-root-') as temporary:
        tmp = Path(temporary)
        # A non-zero phase distinguishes real schedule instants from wall-clock buckets.
        for policy in ['coalesce', 'skip', 'catch_up']:
            scheduler = m25.Scheduler(str(tmp/f'phase-{policy}.db'))
            scheduler.initialize()
            scheduler.add(fire=30_000, interval=60_000, policy=policy, lateness_ms=0)
            scheduler.set_time(180_000)
            scheduler.recover('j7')
            fires = [r['fire'] for r in scheduler.runs()]
            wanted = {'coalesce': [150_000], 'skip': [], 'catch_up': [30_000, 90_000, 150_000]}[policy]
            check('ch25 '+policy+' preserves the original 30-second phase', fires == wanted)
            check('ch25 '+policy+' advances to its own next calendar instant',
                  scheduler.db.execute('SELECT next_at FROM job').fetchone()[0] == 210_000)
            scheduler.close()

        for policy in ['coalesce', 'skip', 'catch_up']:
            scheduler = m25.Scheduler(str(tmp/f'tolerance-{policy}.db'))
            scheduler.initialize()
            scheduler.add(policy=policy, lateness_ms=60_000)
            scheduler.set_time(90_000)
            scheduler.recover('j7')
            check('ch25 '+policy+' leaves the only-30-seconds-late occurrence live',
                  scheduler.db.execute('SELECT next_at FROM job').fetchone()[0] == 60_000)
            scheduler.materialize()
            check('ch25 '+policy+' actually materializes that live occurrence',
                  60_000 in [r['fire'] for r in scheduler.runs()])
            scheduler.close()
        scheduler = m25.Scheduler(str(tmp/'tolerance-equality.db'))
        scheduler.initialize(); scheduler.add(policy='skip', lateness_ms=60_000)
        scheduler.set_time(60_000)
        check('ch25 equality at the tolerance threshold is not a misfire', scheduler.recover('j7') == []
              and scheduler.db.execute('SELECT next_at FROM job').fetchone()[0] == 0)
        scheduler.materialize()
        check('ch25 equality remains materializable through the normal path', scheduler.runs()[0]['fire'] == 0)
        scheduler.close()

        scheduler = m25.Scheduler(str(tmp/'lease.db'))
        scheduler.initialize()
        scheduler.add(interval=None)
        run_id = scheduler.materialize()[0]
        frozen = scheduler.run(run_id)['payload']
        with scheduler.tx():
            scheduler.db.execute('UPDATE job SET version=2,payload=?', ('{"order_id":"changed"}',))
        first = scheduler.claim(run_id, 'boot-A/claim-A')
        check('ch25 materialized input survives definition edits', first['payload'] == frozen)
        scheduler.set_time(first['lease_until'])
        check('ch25 finish at exact lease expiry is stale',
              scheduler.transition(run_id, 'complete', first['owner'], first['generation'], 'CLOSED') == 'STALE')
        second = scheduler.claim(run_id, 'boot-B/claim-B')
        check('ch25 takeover increments generation without changing effect identity',
              second['generation'] == first['generation']+1 and second['effect_key'] == first['effect_key'])
        check('ch25 old heartbeat cannot resurrect ownership',
              scheduler.transition(run_id, 'heartbeat', first['owner'], first['generation']) == 'STALE')
        scheduler.transition(run_id, 'cancel')
        check('ch25 running cancellation keeps the current owner and uncertainty',
              scheduler.run(run_id)['state'] == 'running' and scheduler.run(run_id)['effect_unknown'] == 1)
        scheduler.transition(run_id, 'complete', second['owner'], second['generation'], 'CLOSED')
        check('ch25 confirmed effect can close a cancellation race truthfully',
              scheduler.run(run_id)['state'] == 'succeeded' and scheduler.run(run_id)['cancel_requested'] == 1
              and scheduler.run(run_id)['effect_unknown'] == 0)
        check('ch25 terminal work cannot be claimed again', scheduler.claim(run_id, 'C') is None)
        scheduler.close()

        business = m25.OrderStore(str(tmp/'orders.db')); business.initialize(); business.add(deadline=50)
        check('ch25 early close is retryable', business.close_order('t1', 'close:o7') == 'RETRY_AT')
        check('ch25 early no-op is not cached', business.db.execute('SELECT count(*) FROM inbox').fetchone()[0] == 0)
        business.set_time(50)
        business.close_order('t1', 'close:o7')  # Simulate losing the returned response.
        check('ch25 same operation returns the committed original result', business.close_order('t1', 'close:o7') == 'CLOSED')
        sink = m25.Sink(str(tmp/'sink.db')); sink.initialize()
        rejects('ch25 relay lost ACK leaves recoverable work', RuntimeError, lambda: business.relay(sink, lose_ack=True))
        business.relay(sink)
        check('ch25 recovered redelivery does not duplicate the sink effect', sink.db.execute('SELECT count(*) FROM effect').fetchone()[0] == 1)
        rejects('ch25 changed event payload cannot reuse the same identity', ValueError,
                lambda: sink.receive('t1', 'closed:o7', 'changed'))
        business.close(); sink.close()

        # Late funding is still a real obligation even if no Redis generation ever opened.
        packet = m26.Store(tmp/'packet.db'); ledger = m26.Ledger(tmp/'ledger.db', packet)
        ledger.seed('sender', 2_000)
        packet.create('late', 'sender', 'create-late', [('s1', 1_000)], int(time.time()*1000)-5_000)
        rejects('ch26 funding unknown cannot be treated as an opened packet', m26.Rejected, lambda: packet.close('late'))
        funded = ledger.apply(packet.command('fund:late')); packet.record_applied(funded)
        check('ch26 late funding can close from INITIALIZING', packet.close('late') == 1_000)
        refund = ledger.apply(packet.command('refund:late')); packet.record_applied(refund)
        check('ch26 late initialization refunds exactly once', packet.packet('late')['refund_applied'] == 1_000
              and packet.packet('late')['state'] == 'EXPIRED')
        ledger.apply(packet.command('refund:late'))
        with closing(ledger.connect()) as db:
            check('ch26 late refund restores the sender balance', db.execute('SELECT cents FROM wallets WHERE account=?', ('sender',)).fetchone()[0] == 2_000)

        packet.create('p', 'sender', 'create-p', [('s1', 300), ('s2', 400), ('s3', 100), ('s4', 200)], int(time.time()*1000)+3_600_000)
        packet.record_applied(ledger.apply(packet.command('fund:p')))
        snap = packet.begin_rebuild('p')
        packet.publish(snap, snap['token'])  # Explicit verified-READY fixture; Redis is tested separately.
        claim = packet.claim('p', 'recipient', 'request-A', snap['epoch'], 's2')
        check('ch26 different request keys retain one user receipt',
              packet.claim('p', 'recipient', 'request-B', snap['epoch'], 's1')['claim_id'] == claim['claim_id'])
        with packet.transaction() as db:
            db.execute('UPDATE packets SET expire_at=? WHERE packet_id=?', (int(time.time()*1000)-1_000, 'p'))
        check('ch26 close excludes confirmed but not yet credited shares', packet.close('p') == 600)
        packet.record_applied(ledger.apply(packet.command('refund:p')))
        credit_command = packet.command('credit:'+claim['claim_id'])
        packet.record_applied(ledger.apply(credit_command))
        ledger.apply(credit_command)
        check('ch26 receipt remains queryable after close with a stale candidate epoch',
              packet.claim('p', 'recipient', 'request-C', snap['epoch']-1, 's1')['claim_id'] == claim['claim_id'])
        with closing(ledger.connect()) as db:
            check('ch26 refund and delayed credit exhaust only their own escrow',
                  db.execute('SELECT available FROM escrows WHERE packet=?', ('p',)).fetchone()[0] == 0)
            check('ch26 recipient receives exactly the frozen amount',
                  db.execute('SELECT cents FROM wallets WHERE account=?', ('recipient',)).fetchone()[0] == 400)
            check('ch26 every actual journal operation remains balanced',
                  not db.execute('SELECT operation_id FROM entries GROUP BY operation_id HAVING sum(delta)<>0 OR count(*)<>2').fetchall())
        tampered = {**credit_command, 'cents': 401}
        rejects('ch26 changed amount cannot reuse a committed grant', m26.Rejected, lambda: ledger.apply(tampered))

        clock = [100]
        delivery = m27.Store(tmp/'delivery.db', clock=lambda: clock[0]); delivery.install()
        delivery.courier('B', capacity=1); delivery.courier('C', capacity=1)
        compensate = delivery.cancel_creation('unknown-creation')
        check('ch27 unknown creation compensation retains the same identity',
              delivery.cancel_creation('unknown-creation') == compensate)
        rejects('ch27 a creation arriving after its compensation fence cannot dispatch', m27.Conflict,
                lambda: delivery.create('too-late', 'unknown-creation'))
        delivery.create('stale-candidate-order', 'paid-but-point-expired')
        rejects('ch27 expired candidate validity cannot occupy a courier slot', m27.Conflict,
                lambda: delivery.reserve('stale-candidate-order', 7, 'B', 'stale-offer', candidate_valid_until=99))
        check('ch27 rejected stale candidates retain recoverable pending work',
              delivery.snapshot('stale-candidate-order')['state'] == 'pending_match'
              and delivery.snapshot('stale-candidate-order')['attempt_count'] == 0 and delivery.invariants())
        delivery.create('o', 'paid-order')
        delivery.reserve('o', 7, 'B', 'a1')
        rejects('ch27 another courier cannot accept the offer', m27.Conflict,
                lambda: delivery.decide('ACCEPT', 'o', 'a1', 7, 'C'))
        original = delivery.decide('ACCEPT', 'o', 'a1', 7, 'B')
        delivery.control('o', 'a1', 7, 'PICKUP', 'B', 'proof-pickup')
        rejects('ch27 ordinary cancellation cannot release physical custody', m27.Conflict,
                lambda: delivery.control('o', 'a1', 7, 'CANCEL', 'customer-authorized', 'cancel'))
        clear = m27.VerifiedRelease('o', 'a1', 7, True, 'verified-handoff')
        delivery.control('o', 'a1', 7, 'REASSIGN', 'operations-authorized', 'verified-handoff', release=clear)
        delivery.reserve('o', 8, 'C', 'a2')
        replay = delivery.decide('ACCEPT', 'o', 'a1', 7, 'B')
        check('ch27 replay returns a historical accept without restoring ownership',
              replay['receipt'] == original['receipt'] and replay['current']['current_attempt'] == 'a2'
              and replay['current']['generation'] == 8)
        rejects('ch27 the old courier cannot deliver a reassigned order', m27.Conflict,
                lambda: delivery.control('o', 'a1', 7, 'DELIVER', 'B', 'old-delivery'))
        check('ch27 all bilateral slot bindings still hold after late work', delivery.invariants())
        epoch1 = delivery.start_session('B'); delivery.report('B', epoch1, 0, 100)
        clock[0] = 125; check('ch27 conservative 30-second true-age boundary remains eligible', delivery.candidate('B'))
        clock[0] = 126; check('ch27 location becomes ineligible before its 60-second cleanup TTL', not delivery.candidate('B'))
        epoch2 = delivery.start_session('B'); delivery.report('B', epoch2, 0, 126)
        check('ch27 an old disconnect cannot close a new session', delivery.disconnect('B', epoch1) == 0)
        old_point = delivery.location('B'); clock[0] = 127
        delivery.report('B', epoch2, 0, 126)
        check('ch27 duplicate point cannot extend received time or cleanup TTL', delivery.location('B') == old_point)
        rejects('ch27 a higher sequence from an old epoch has no authority', m27.Conflict,
                lambda: delivery.report('B', epoch1, 999, 127))
        check('ch27 old projection work cannot move the current session', not delivery.project('B', epoch1, 0))
        check('ch27 current projection can be rebuilt', delivery.project('B', epoch2, 0))
        route = (4, 8, 200, 'current-assignment')
        check('ch27 ETA overlaps preparation and travel', m27.eta(True, False, 6, route, None, 127, 'current-assignment')['minutes'] == 14)
        check('ch27 cached ETA cannot cross assignment context', m27.eta(True, False, 6, None, route, 127, 'new-assignment') is None)
        check('ch27 stale location cannot be repaired by a cached route', m27.eta(False, False, 6, route, route, 127, 'current-assignment') is None)
    check('tested sources stayed unchanged during these probes', source_hashes() == before)
    passed = True
except BaseException as error:
    passed = False
    failure = repr(error)

result = dict(at=datetime.now(timezone.utc).isoformat(), passed=passed, checks=checks, sourceHashes=before,
              limitation='Actual local SQLite adapters with explicit teaching inputs, verified grants/READY/clock/custody fixtures. No production PostgreSQL, failover, Redis Cluster, remote payment, physical custody or clock-synchronization proof.')
if not passed:
    result['failure'] = failure
(root/'docs/reviews'/f'{prefix}-root-contracts-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(dict(passed=passed, checks=len(checks), failure=result.get('failure'))))
sys.exit(0 if passed else 1)
