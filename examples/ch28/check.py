"""Execute the local SQLite adapter and Java17 SDK/watch/selector models."""
from concurrent.futures import ThreadPoolExecutor
import copy
import hashlib
import json
from pathlib import Path
import sqlite3
import struct
import subprocess
import sys
import tempfile
import threading

from model import Store, Conflict, Stale

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
output = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'docs/reviews/ch28-code-results.json'
checks = []


def check(condition, label):
    if not condition:
        raise AssertionError(label)
    checks.append(label)


def expect(kind, call, label):
    try:
        call()
    except kind:
        checks.append(label)
    else:
        raise AssertionError('expected failure: ' + label)


def draft(g, **overrides):
    value = dict(namespace='app/prod/main', expected_generation=g, stable='R17',
                 canary='R18', percent=5, salt='s1', cluster='approved', reason='reviewed rollout')
    value.update(overrides)
    return value


result = {'passed': False, 'scope': 'actual local SQLite plus pure Java17 models; no PostgreSQL/etcd/cluster integration',
          'checks': checks, 'files': {}}
try:
    with tempfile.TemporaryDirectory(prefix='ch28-check-') as tmp:
        db = Path(tmp) / 'authority.sqlite'; store = Store(db, initialize=True)
        store.seed(); store.seed('app/test/main')
        initial = store.counts()
        check(store.publish('admin', 'k1', draft(41)) == 42, 'normal publication advances generation')
        state = store.snapshot('app/prod/main')
        check(state['generation'] == 42 and state['stable'] == 'R17' and state['canary'] == 'R18', 'selected pointers and rule commit together')
        check(state['rule_revision'] == 42, 'rule revision advances with publication')
        check(store.counts()['publication'] == 1 and store.counts()['receipt'] == 1 and store.counts()['change_log'] == 1, 'audit receipt and durable change commit together')
        before = store.counts()
        check(store.publish('admin', 'k1', draft(41)) == 42, 'lost 201 replay returns original generation before expected-g check')
        check(store.counts() == before, 'identical replay adds no publication or hint')
        expect(Conflict, lambda: store.publish('admin', 'k1', draft(41, percent=20)), 'same key changed rollout conflicts')
        expect(Conflict, lambda: store.publish('admin', 'k1', draft(42)), 'expected generation belongs to canonical intent')
        expect(Conflict, lambda: store.publish('admin', 'k1', draft(41, reason='another reason')), 'reason belongs to canonical intent')
        expect(PermissionError, lambda: store.publish('admin', 'k1', draft(41), authorized=False), 'authorization precedes historic receipt replay')
        expect(Stale, lambda: store.publish('admin', 'new-key', draft(41)), 'new stale intent cannot overwrite Current')
        check(store.publish('admin', 'expand', draft(42, percent=20)) == 43, 'rule-only expansion advances g')
        check(store.counts()['release'] == initial['release'], 'rule-only expansion reuses immutable bytes')
        check(store.publish('admin', 'rollback', draft(43, canary=None, percent=0, reason='rollback R18')) == 44, 'rollback is a newer publication selecting older release')
        check(store.snapshot('app/prod/main')['canary'] is None, 'rollback clears canary atomically')
        audit = store.db.execute('SELECT * FROM publication WHERE generation=44').fetchone()
        check(json.loads(audit['previous_view'])['percent'] == 20 and json.loads(audit['next_view'])['canary'] is None, 'audit preserves old and new complete publication views')
        # Independent real connections race. SQLite serializes writers at DB scope.
        barrier = threading.Barrier(2)
        def race(key, intent):
            connection = Store(db)
            try:
                barrier.wait()
                try: return ('ok', connection.publish('admin', key, intent))
                except Stale: return ('stale', None)
            finally: connection.close()
        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(race, 'race-a', draft(44, percent=6)),
                       executor.submit(race, 'race-b', draft(44, percent=7))]
            raced = [f.result() for f in futures]
        check(sorted(x[0] for x in raced) == ['ok', 'stale'], 'two concurrent expected-g edits have one winner')
        check(store.snapshot('app/prod/main')['generation'] == 45, 'concurrent edit advances once')
        barrier = threading.Barrier(2)
        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(race, 'duplicate', draft(45)) for _ in range(2)]
            duplicated = [f.result() for f in futures]
        check(duplicated == [('ok', 46), ('ok', 46)], 'simultaneous identical keys recover same generation')
        check(store.db.execute('SELECT COUNT(*) FROM publication WHERE generation=46').fetchone()[0] == 1, 'duplicate race persists one audit record')
        for point in ('release', 'current', 'receipt', 'change'):
            before = store.counts(); snap = store.snapshot('app/prod/main')
            new = {'release': 'R19-' + point, 'payload': {'timeout_ms': 400, 'allow': True}}
            expect(RuntimeError, lambda p=point, n=new: store.publish('admin', 'abort-' + p,
                   draft(46, stable=n['release'], new_content=n), fail_at=p), 'rollback injected after ' + point)
            check(store.counts() == before and store.snapshot('app/prod/main') == snap, 'failure leaves no partial records after ' + point)
        changed_r17 = {'release': 'R17', 'payload': {'timeout_ms': 999, 'allow': True}}
        expect(Conflict, lambda: store.publish('admin', 'rewrite-r17', draft(46, new_content=changed_r17)), 'immutable release ID cannot change bytes')
        # A release existing in another namespace cannot be selected in this one.
        with store.transaction(write=True):
            store.db.execute("INSERT INTO release VALUES('app/test/main','private-release','{}','fixture')")
        before = store.counts()
        expect(sqlite3.IntegrityError, lambda: store.publish('admin', 'cross-ns', draft(46, stable='private-release')), 'composite FK binds release identity to namespace')
        check(store.counts() == before and store.snapshot('app/prod/main')['generation'] == 46, 'cross-scope pointer failure rolls back all publication state')
        check(store.publish('admin', 'k1', draft(41, namespace='app/test/main')) == 42, 'same request key is independently scoped by namespace')
        check(store.publish('other-admin', 'k1', draft(46)) == 47, 'same request key is independently scoped by principal')
        check(store.changes_after('app/prod/main', 41)[1] == list(range(42, 48)), 'committed log survives absent relay and replays ordered changes')
        store.compact('app/prod/main', 44)
        check(store.changes_after('app/prod/main', 43) == ('RESET', 47), 'compacted cursor resets rather than silently skips')
        check(store.changes_after('app/prod/main', 44) == ('CHANGED', [45, 46, 47]), 'exact floor resumes at subsequent generation')
        check(store.changes_after('app/prod/main', 48) == ('SYNC_REQUIRED', 47), 'ahead cursor is not idle')
        snapshot = store.snapshot('app/prod/main')
        check(snapshot['generation'] == 47 and set(snapshot['releases']) == {'R17', 'R18'}, 'RESET recovery gets complete consistent current pointers')
        check(store.publish('admin', 'after-snapshot', draft(47)) == 48, 'publication can occur between full fetch and subscribe')
        check(store.changes_after('app/prod/main', snapshot['generation']) == ('CHANGED', [48]), 'resubscribe after snapshot sees intervening publication')
        for invalid in (-1, 101, 5.0, True):
            expect(ValueError, lambda p=invalid: store.publish('admin', 'bad-percent', draft(48, percent=p)), 'invalid percent rejected: ' + str(invalid))
        expect(ValueError, lambda: store.publish('admin', 'bad-empty', draft(48, canary=None)), 'no positive percentage without canary')
        expect(ValueError, lambda: store.publish('admin', 'bad-schema', draft(48, new_content={'release':'Rbad','payload':{'timeout_ms':0}})), 'unsafe timeout rejected before transaction')
        expect(sqlite3.IntegrityError, lambda: store.db.execute('INSERT INTO receipt VALUES(NULL,?,?,?,?)', ('app/prod/main','bad','h',48)), 'NOT NULL receipt principal enforced by SQLite')
        check(store.counts()['receipt'] == store.counts()['publication'], 'one receipt for every committed publication')
        result['sqliteRaces'] = {'differentKeys': raced, 'sameKey': duplicated}
        store.close()

        java_dir = Path(tmp) / 'java'; java_dir.mkdir()
        java_home = Path('/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin')
        source_files = ['Cohort.java', 'ConfigClient.java', 'WatchHub.java', 'Chapter28Checks.java']
        compile_result = subprocess.run([str(java_home / 'javac'), '-d', str(java_dir),
                                        *[str(HERE / f) for f in source_files]], capture_output=True, text=True)
        check(compile_result.returncode == 0, 'Java17 compile: ' + compile_result.stderr)
        run = subprocess.run([str(java_home / 'java'), '-cp', str(java_dir), 'Chapter28Checks'], capture_output=True, text=True)
        check(run.returncode == 0, 'Java17 execution: ' + run.stderr)
        result['java'] = json.loads(run.stdout)
        digest = hashlib.sha256()
        for field in ('app/prod/main', 's1', 'instance-7'):
            data = field.encode(); digest.update(struct.pack('>I', len(data))); digest.update(data)
        check(int.from_bytes(digest.digest()[:8], 'big') % 100 == result['java']['bucketVector'], 'independent Python SHA256 length-prefix vector matches Java selector')
        result['numeric'] = {
            'businessReadsPerSecond': 10_000 * 1_000,
            'idleRenewalsPerSecond': 10_000 / 60,
            'plannedConnectionsNMinus1': 3 * 5_000 * .7,
            'coldPayloadBytes': 10_000 * 10 * 40_000,
            'coldBatchRequestsPerSecond': 10_000 / 30,
            'coldNamespacePayloadsPerSecond': 10_000 * 10 / 30,
            'coldBitsPerSecond': 10_000 * 10 * 40_000 * 8 / 30,
            'batchAdmissionPayloadBytesPerSecond': 500 * 10 * 40_000,
            'singleNamespaceFullPublishBytes': 10_000 * 40_000,
            'broadAdmissionRecipientsPerSecond': 500 / .25,
            'fiftyFullPublishesBitsPerSecond': 50 * 10_000 * 40_000 * 8,
            'contentCopiesBytes': 2_000 * 4_000 * 30 * 3,
            'authorityReadsPerSecond': 1_000 / 10,
        }
        check(result['numeric']['coldPayloadBytes'] == 4_000_000_000, 'cold payload total is 4GB')
        check(result['numeric']['batchAdmissionPayloadBytesPerSecond'] == 200_000_000, '500 batch/s with 10 namespaces is 200MB/s before overhead')
        check(result['numeric']['plannedConnectionsNMinus1'] == 10_500, 'three surviving nodes cover 10000 planned connections')
    result['passed'] = True
except BaseException as error:
    result['failure'] = repr(error)
    raise
finally:
    for file in [ROOT / 'chapters/ch28.html', *sorted(HERE.glob('*'))]:
        if file.is_file():
            result['files'][str(file.relative_to(ROOT))] = hashlib.sha256(file.read_bytes()).hexdigest()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'passed': result['passed'], 'checks': len(checks), 'javaAssertions': result.get('java', {}).get('assertions'), 'failure': result.get('failure')}))
