"""Run real local SQLite competitions, Java 17 gate, and isolated Redis TTL probe."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import argparse
import hashlib
import json
import os
import socket
import subprocess
import tempfile
import threading
import time
from model import Store, Conflict, VerifiedRelease, fresh, eta

ROOT = Path(__file__).resolve().parents[2]
results = {'checks': [], 'limitations': [
    'SQLite BEGIN IMMEDIATE serializes writers; PostgreSQL row locks/replication are not exercised.',
    'Clock, authenticated actors, confirmed payment and custody evidence are trusted local fixtures.',
    'No live courier, routing API, SSE/WebSocket, cross-machine clock, Redis Cluster/failover or load test.'
]}


def check(name, condition, details=None):
    if not condition:
        raise AssertionError(name)
    results['checks'].append({'name': name, 'passed': True, **({'details': details} if details is not None else {})})


def rejects(name, fn, expected=None):
    try:
        fn()
    except Conflict as e:
        check(name, expected is None or str(e) == expected, str(e))
    else:
        raise AssertionError(f'{name}: did not reject')


def concurrent(*functions):
    gate = threading.Barrier(len(functions))
    def run(fn):
        gate.wait(timeout=4)
        try:
            return ('ok', fn())
        except Conflict as e:
            return ('conflict', str(e))
    with ThreadPoolExecutor(max_workers=len(functions)) as pool:
        return list(pool.map(run, functions))


with tempfile.TemporaryDirectory(prefix='ch27-contract-') as directory:
    number = [0]
    def fixture(capacity=2, count=1, deadline=220):
        number[0] += 1
        now = [100]
        s = Store(Path(directory) / f'case-{number[0]}.sqlite', lambda: now[0])
        s.install(); s.courier('B', capacity); s.courier('C', capacity)
        for i in range(count):
            s.create(f'o{i}', f'up{i}', deadline=deadline)
        return s, now

    s, now = fixture()
    original = s.create('different-local-id', 'up0')
    check('upstream identity replays original local order', original['order_id'] == 'o0')
    rejects('same upstream with changed digest', lambda: s.create('new', 'up0', digest='different'))
    r = s.reserve('o0', 7, 'B', 'a1')
    check('offer durable before delivery', r['current']['state'] == 'offered' and s.invariants())
    check('duplicate reserve occupies once', s.reserve('o0', 7, 'B', 'a1')['receipt'] == r['receipt'] and s.invariants())
    rejects('attempt cannot be rebound to another courier', lambda: s.reserve('o0', 7, 'C', 'a1'))
    accepted = s.decide('ACCEPT', 'o0', 'a1', 7, 'B')
    now[0] = 140
    check('lost acceptance reply replays after deadline', s.decide('ACCEPT', 'o0', 'a1', 7, 'B')['receipt'] == accepted['receipt'])
    rejects('different courier cannot replay acceptance', lambda: s.decide('ACCEPT', 'o0', 'a1', 7, 'C'), 'FORBIDDEN')
    rejects('expiry does not release assigned', lambda: s.decide('EXPIRE', 'o0', 'a1', 7), 'STALE')
    s.control('o0', 'a1', 7, 'PICKUP', 'B', 'pickup-proof')
    rejects('GPS/offline is not custody evidence', lambda: s.control('o0', 'a1', 7, 'REASSIGN', 'operations-authorized', 'gps-stale'), 'REVIEW')
    rejects('customer cancel cannot release picked custody', lambda: s.control('o0', 'a1', 7, 'CANCEL', 'customer-authorized', 'cancel'), 'CONTROLLED_HANDOFF_REQUIRED')
    try:
        s.control('o0', 'a1', 7, 'DELIVER', 'B', 'delivery-proof', crash='after_release')
    except RuntimeError:
        pass
    check('crash after slot deletion rolls back state and slot', s.snapshot('o0')['state'] == 'picked_up' and s.invariants())
    delivered = concurrent(lambda: s.control('o0', 'a1', 7, 'DELIVER', 'B', 'delivery-proof'),
                           lambda: s.control('o0', 'a1', 7, 'DELIVER', 'B', 'delivery-proof'))
    check('simultaneous duplicate completion releases once', all(x[0] == 'ok' for x in delivered) and delivered[0][1]['receipt'] == delivered[1][1]['receipt'] and s.invariants())
    old = s.decide('ACCEPT', 'o0', 'a1', 7, 'B')
    check('historical accept cannot reactivate delivered order', old['receipt'] == accepted['receipt'] and old['current']['state'] == 'delivered' and old['current']['generation'] == 8)
    rejects('same completion with different evidence conflicts', lambda: s.control('o0', 'a1', 7, 'DELIVER', 'B', 'different'))

    s, now = fixture(capacity=1, count=2)
    race = concurrent(lambda: s.reserve('o0', 7, 'B', 'a1'), lambda: s.reserve('o1', 7, 'B', 'a2'))
    check('two orders race for last courier slot', sum(x[0] == 'ok' for x in race) == 1 and s.invariants(), race)
    s, now = fixture(capacity=1)
    race = concurrent(lambda: s.reserve('o0', 7, 'B', 'a1'), lambda: s.reserve('o0', 7, 'C', 'a2'))
    check('two couriers race for one order', sum(x[0] == 'ok' for x in race) == 1 and s.invariants(), race)
    s, now = fixture(capacity=2, count=3)
    s.reserve('o0', 7, 'B', 'a1'); s.reserve('o1', 7, 'B', 'a2')
    rejects('third order cannot exceed two slots', lambda: s.reserve('o2', 7, 'B', 'a3'), 'REMATCH')
    check('capacity count equals live slot count', s.invariants())

    s, now = fixture()
    rejects('routing exhausted candidate validity before reservation',
            lambda: s.reserve('o0', 7, 'B', 'stale-point', candidate_valid_until=99), 'STALE_CANDIDATE')
    def advance_past_validity():
        now[0] = 101
    rejects('candidate validity rechecked after lock acquisition',
            lambda: s.reserve('o0', 7, 'B', 'waited-point', after_lock=advance_past_validity, candidate_valid_until=100), 'STALE_CANDIDATE')

    s, now = fixture()
    try:
        s.reserve('o0', 7, 'B', 'a1', crash='after_slot')
    except RuntimeError:
        pass
    with s.connect() as db:
        check('reservation rollback covers attempt capacity order outbox',
              s.snapshot('o0')['state'] == 'pending_match' and db.execute('SELECT count(*) FROM attempts').fetchone()[0] == 0
              and db.execute('SELECT count(*) FROM outbox WHERE kind=?', ('OFFER',)).fetchone()[0] == 0 and s.invariants())

    for at, expected in ((119, 'assigned'), (120, 'pending_match')):
        s, now = fixture(); s.reserve('o0', 7, 'B', 'a1'); now[0] = at
        race = concurrent(lambda: s.decide('ACCEPT', 'o0', 'a1', 7, 'B'), lambda: s.decide('EXPIRE', 'o0', 'a1', 7))
        check(f'accept-expire competition at {at}', s.snapshot('o0')['state'] == expected and s.invariants(), race)
        if at == 120:
            check('expiry bumps fence once', s.snapshot('o0')['generation'] == 8)
            rejects('late accept after expiry is fenced', lambda: s.decide('ACCEPT', 'o0', 'a1', 7, 'B'), 'STALE')
            rejects('duplicate expiry cannot double-release', lambda: s.decide('EXPIRE', 'o0', 'a1', 7), 'STALE')
            rejects('old matching worker cannot create another attempt', lambda: s.reserve('o0', 7, 'C', 'old-worker'), 'STALE')
            rejects('cooldown survives rematch', lambda: s.reserve('o0', 8, 'B', 'a2'), 'COOLDOWN')
            s.reserve('o0', 8, 'C', 'a2')
            rejects('old pickup cannot change a new assignment', lambda: s.control('o0', 'a1', 7, 'PICKUP', 'B', 'late'), 'STALE')

    s, now = fixture(); s.reserve('o0', 7, 'B', 'a1'); now[0] = 119
    holder = s.connect(); holder.execute('BEGIN IMMEDIATE')
    started = threading.Event()
    def waiting_accept():
        started.set()
        try:
            return s.decide('ACCEPT', 'o0', 'a1', 7, 'B')
        except Conflict as error:
            return str(error)
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(waiting_accept); started.wait(1)
        now[0] = 120
        holder.commit(); holder.close()
        check('clock read after lock wait rejects deadline crossing', future.result(timeout=4) == 'EXPIRED')

    s, now = fixture(); s.reserve('o0', 7, 'B', 'a1')
    race = concurrent(lambda: s.decide('ACCEPT', 'o0', 'a1', 7, 'B'),
                      lambda: s.control('o0', 'a1', 7, 'CANCEL', 'customer-authorized', 'cancel'))
    check('accept-cancel serialize without duplicate ownership', sum(x[0] == 'ok' for x in race) == 1 and s.invariants(), race)
    s, now = fixture(); s.reserve('o0', 7, 'B', 'a1'); receipt = s.decide('ACCEPT', 'o0', 'a1', 7, 'B')['receipt']
    proof = VerifiedRelease('o0', 'a1', 7, True, 'ops-proof')
    s.control('o0', 'a1', 7, 'REASSIGN', 'operations-authorized', 'ops-proof', release=proof)
    s.reserve('o0', 8, 'C', 'a2')
    replay = s.decide('ACCEPT', 'o0', 'a1', 7, 'B')
    check('verified release fences old acceptance and preserves receipt', replay['receipt'] == receipt and replay['current']['current_attempt'] == 'a2' and s.invariants())
    rejects('old deliver after controlled reassign', lambda: s.control('o0', 'a1', 7, 'DELIVER', 'B', 'old-proof'), 'STALE')

    s, now = fixture()
    for i in range(3):
        s.reserve('o0', 7+i, 'B' if i%2 == 0 else 'C', f'a{i}')
        now[0] += 20
        s.decide('EXPIRE', 'o0', f'a{i}', 7+i)
    check('third unanswered attempt durably fails instead of infinite retry', s.snapshot('o0')['state'] == 'failed' and s.snapshot('o0')['attempt_count'] == 3 and s.invariants())
    s, now = fixture(count=2, deadline=130)
    check('lost queue delivery recovered from durable pending rows', sorted(s.recover()) == [('o0',7),('o1',7)])
    s.reserve('o0', 7, 'B', 'a1'); now[0] = 130
    s.recover(); s.recover()
    check('repeated scans expire offers and fail exhausted pending once', all(s.snapshot(f'o{i}')['state'] == 'failed' for i in (0,1)) and s.invariants())
    s, now = fixture(count=0)
    key = s.cancel_creation('unknown')
    check('unknown creation is fenced before compensation intent', s.cancel_creation('unknown') == key)
    rejects('late delayed create cannot race a refund after tombstone', lambda: s.create('late', 'unknown'), 'CREATION_FENCED')
    s.create('new', 'up-new'); s.cancel_creation('up-new')
    rejects('stale worker cannot reserve compensated pending work', lambda: s.reserve('new', 7, 'B', 'new-a'), 'STALE')

    s, now = fixture(count=0)
    epoch = s.start_session('B')
    rejects('session starts without a fresh point', lambda: s.report('B', epoch, 1, 74), 'INVALID_POINT')
    check('fresh boundary accepted', s.report('B', epoch, 41, 75) == 41 and s.candidate('B'))
    before = s.location('B'); now[0] = 101
    check('duplicate and old seq return current seq', s.report('B', epoch, 41, 101) == 41 and s.report('B', epoch, 40, 101) == 41)
    check('duplicate does not refresh capture receipt or TTL', s.location('B') == before)
    check('freshness reevaluated on read despite unexpired TTL', not s.candidate('B'))
    rejects('higher sequence buffered old capture is rejected', lambda: s.report('B', epoch, 42, 70), 'INVALID_POINT')
    rejects('future beyond trusted skew is rejected', lambda: s.report('B', epoch, 42, 107), 'INVALID_POINT')
    check('future within trusted skew accepted conservatively', s.report('B', epoch, 42, 106) == 42)
    rejects('NaN accuracy rejected', lambda: s.report('B', epoch, 43, 101, accuracy=float('nan')), 'INVALID_POINT')
    rejects('invalid coordinates rejected', lambda: s.report('B', epoch, 43, 101, lon=181), 'INVALID_POINT')
    next_epoch = s.start_session('B')
    check('reconnect advances epoch and invalidates old point', next_epoch == epoch+1 and not s.candidate('B'))
    check('old disconnect does not close newer connection', s.disconnect('B', epoch) == 0 and s.location('B')['connected'] == 1)
    rejects('old connection cannot upload high sequence', lambda: s.report('B', epoch, 999, 101), 'STALE_SESSION')
    s.report('B', next_epoch, 0, 101, cell='A'); s.project('B', next_epoch, 0)
    s.report('B', next_epoch, 1, 101, cell='B')
    check('dropped index event repaired from latest detail', s.reconcile_location() == 1)
    check('old migration cannot move courier back', not s.project('B', next_epoch, 0))
    with s.connect() as db:
        check('projection current cell only', [x[0] for x in db.execute('SELECT cell FROM cell_member WHERE courier_id=?', ('B',))] == ['B'])
    s.disconnect('B', next_epoch)
    check('disconnect immediately invalidates point', not s.candidate('B'))
    bad_epoch = s.start_session('B', bounded=False)
    rejects('uncertain clock cannot become dispatch candidate', lambda: s.report('B', bad_epoch, 0, 101), 'INVALID_POINT')
    check('pure freshness exact edges', fresh(100,75,50) and fresh(100,105,0) and not fresh(100,74,1) and not fresh(100,106,1))

    check('ETA concurrent preparation and travel', eta(True,False,6,(4,8,120,'g7'),None,100,'g7') == {'minutes':14,'confidence':'normal'})
    check('ETA after pickup does not add preparation again', eta(True,True,6,(4,8,120,'g7'),None,100,'g7')['minutes'] == 8)
    check('route timeout uses bounded matching cache with low confidence', eta(True,False,6,None,(4,8,120,'g7'),100,'g7') == {'minutes':14,'confidence':'low'})
    check('missing failed element is unavailable rather than zero', eta(True,False,6,None,None,100,'g7') is None)
    check('expired or wrong-context route cannot be reused', eta(True,False,6,None,(4,8,100,'g7'),100,'g7') is None and eta(True,False,6,None,(4,8,120,'g6'),100,'g7') is None)
    check('stale point cannot be promoted by ETA degradation', eta(False,False,6,None,(4,8,120,'g7'),100,'g7') is None)
    check('normalized capacity calculations', abs(500_000/86_400*10 - 57.87037037037) < 1e-9 and 10_000/5 == 2_000 and 2_000*200 == 400_000)
    check('queue arithmetic under constant teaching rates', 600/(20-12) == 75 and 600/(20-12-2) == 100 and (20-14) == 6)
    check('payload storage and subscriber arithmetic', 2_000*86_400*200 == 34_560_000_000 and 500_000*2_000*30*3 == 90_000_000_000 and 3_000/5*200 == 120_000)

    java = Path('/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin')
    compiled = subprocess.run([str(java/'javac'), '-d', directory, str(Path(__file__).parent/'LocationGate.java')], capture_output=True, text=True)
    check('actual Java 17 compilation', compiled.returncode == 0, compiled.stderr)
    executed = subprocess.run([str(java/'java'), '-cp', directory, 'LocationGate'], capture_output=True, text=True)
    check('actual Java 17 boundary execution', executed.returncode == 0, executed.stdout.strip())
    results['javaVersion'] = subprocess.run([str(java/'java'), '-version'],capture_output=True,text=True).stderr.splitlines()[0]

    # Isolated Redis process; use the already installed binary, never an existing server.
    server = Path(os.environ.get('CH27_REDIS_SERVER', '/tmp/redis-7.2.5/src/redis-server'))
    cli = server.with_name('redis-cli')
    if server.exists() and cli.exists():
        with socket.socket() as sock:
            sock.bind(('127.0.0.1',0)); port = sock.getsockname()[1]
        process = subprocess.Popen([str(server),'--bind','127.0.0.1','--port',str(port),'--save','','--appendonly','no','--dir',directory], stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        def redis(*args):
            run = subprocess.run([str(cli),'-h','127.0.0.1','-p',str(port),'--raw',*map(str,args)],capture_output=True,text=True,timeout=2)
            if run.returncode:
                raise RuntimeError(run.stderr)
            return run.stdout.strip()
        try:
            end = time.monotonic()+3
            while True:
                try:
                    if redis('PING') == 'PONG': break
                except RuntimeError:
                    pass
                if time.monotonic() >= end: raise RuntimeError('Redis failed to start')
                time.sleep(.02)
            redis('GEOADD','geo:zone',121,31,'B'); redis('SET','rider:B','detail','PX',30)
            end = time.monotonic()+2
            while redis('EXISTS','rider:B') != '0':
                if time.monotonic()>end: raise RuntimeError('TTL did not expire')
                time.sleep(.01)
            check('real Redis detail expiry does not delete GEO member', redis('GEOSEARCH','geo:zone','FROMLONLAT',121,31,'BYRADIUS',1,'km') == 'B')
            results['redisVersion'] = redis('INFO','server').split('redis_version:')[1].splitlines()[0]
        finally:
            process.terminate(); process.wait(timeout=3)
    else:
        results['redisSkipped'] = 'Existing redis-server/redis-cli binaries were unavailable.'

parser=argparse.ArgumentParser(); parser.add_argument('--output',default='docs/reviews/ch27-code-results.json'); args=parser.parse_args()
results['files']={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(Path(__file__).parent.glob('*')) if p.is_file()}
results['passed']=len(results['checks']); results['failed']=0
output=ROOT/args.output; output.parent.mkdir(parents=True,exist_ok=True); output.write_text(json.dumps(results,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({'passed':results['passed'],'failed':0,'output':str(output),'redisVersion':results.get('redisVersion'),'javaVersion':results.get('javaVersion')},ensure_ascii=False))
