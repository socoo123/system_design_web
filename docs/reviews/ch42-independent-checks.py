"""Independent new inputs against the author's exact Java/SQLite implementations."""
from pathlib import Path
import ast
import concurrent.futures
import hashlib
import importlib.util
import json
import multiprocessing as mp
import os
import sqlite3
import subprocess
import tempfile
import threading

ROOT = Path(__file__).resolve().parents[2]
EXAMPLES = ROOT / 'examples/ch42'
spec = importlib.util.spec_from_file_location('effect_under_review', EXAMPLES/'check_effect.py')
effect = importlib.util.module_from_spec(spec)
spec.loader.exec_module(effect)


def hashes():
    files = [ROOT/'chapters/ch42.html', *sorted(EXAMPLES.rglob('*'))]
    return {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in files if p.is_file() and '__pycache__' not in str(p)}


def must_raise(action, error_type, message=None):
    try:
        action()
    except error_type as error:
        if message is not None:
            assert str(error) == message, str(error)
    else:
        raise AssertionError(f'Expected {error_type.__name__}: {message}')


def snapshot(file):
    db = effect.connect(file)
    try:
        return dict(accounts=db.execute('SELECT account_id,balance FROM account ORDER BY account_id').fetchall(),
                    inbox=db.execute('SELECT scope,event_id,digest,result FROM inbox ORDER BY scope,event_id').fetchall(),
                    ledger=db.execute('SELECT scope,event_id,account_id,delta FROM ledger ORDER BY scope,event_id').fetchall())
    finally:
        db.close()


def lost_reply(file):
    effect.apply(file, 'tenant-σ:credit-v1', 'capture-0092', 'eastern', 53, 'after_commit')
    raise AssertionError('The implementation should exit before the receipt')


def run():
    result = dict(sourceHashes=hashes(), passed=False, openFindings=[], cases=[], numeric={})
    # Reuse the EXACT author's DDL rather than constructing a stronger reviewer schema.
    tree = ast.parse((EXAMPLES/'check_effect.py').read_text())
    schemas = [call.args[0].value for call in ast.walk(tree)
               if isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute)
               and call.func.attr == 'executescript' and isinstance(call.args[0], ast.Constant)]
    assert len(schemas) == 1
    with tempfile.TemporaryDirectory(prefix='ch42-independent-') as temp:
        temp = Path(temp)
        file = str(temp/'effects.sqlite')
        db = effect.connect(file)
        db.executescript(schemas[0])
        db.execute("INSERT INTO account VALUES ('eastern',731),('western',19)")
        db.close()

        assert effect.apply(file,'tenant-σ:credit-v1','invoice-0091','eastern',31) == 'APPLIED'
        normal = snapshot(file)
        assert dict(normal['accounts'])['eastern'] == 762
        assert effect.apply(file,'tenant-σ:credit-v1','invoice-0091','eastern',31) == 'APPLIED'
        assert snapshot(file) == normal
        must_raise(lambda: effect.apply(file,'tenant-σ:credit-v1','invoice-0091','western',31),
                   ValueError,'IDENTITY_CONFLICT')
        must_raise(lambda: effect.apply(file,'tenant-σ:credit-v1','invoice-0091','eastern',32),
                   ValueError,'IDENTITY_CONFLICT')
        assert snapshot(file) == normal
        # Same event under another trusted effect scope is a separate obligation.
        assert effect.apply(file,'tenant-σ:bonus-v1','invoice-0091','western',17) == 'APPLIED'
        result['cases'].append('Independent Unicode scope/event/account fixture: one effect on replay, account/delta digest conflicts reject, effect scopes remain independent')

        before = snapshot(file)
        valid = ['tenant-σ:credit-v1','malformed-identity','eastern']
        for index in range(3):
            for bad in [None,'','   ',' noncanonical ',7]:
                args = valid.copy(); args[index] = bad
                must_raise(lambda args=args: effect.apply(file,*args,9),ValueError,'PERMANENT_SCHEMA_ERROR')
        assert snapshot(file) == before
        db = effect.connect(file)
        for table, other in [('inbox',('digest','APPLIED')),('ledger',('eastern',9))]:
            fields = {row[1]: row for row in db.execute(f'PRAGMA table_info({table})')}
            assert fields['scope'][3] == 1 and fields['event_id'][3] == 1
            for scope,event in [(None,'null-event-9'),('valid-scope',None),('','empty-event-9'),('   ','space-event-9')]:
                must_raise(lambda table=table,scope=scope,event=event,other=other:
                           db.execute(f'INSERT INTO {table} VALUES (?,?,?,?)',(scope,event,*other)),
                           sqlite3.IntegrityError)
        db.close()
        assert snapshot(file) == before
        result['cases'].append('New NULL/empty/noncanonical fixtures reject scope, event AND account before mutation; exact author DDL independently rejects NULL composite identities in both tables')

        # A fault after the ledger insert must not leave inbox, ledger or balance.
        db = effect.connect(file)
        db.execute("""CREATE TRIGGER fail_balance BEFORE UPDATE ON account
            WHEN NEW.account_id='eastern'
            BEGIN SELECT RAISE(ABORT,'independent balance failure'); END""")
        db.close()
        must_raise(lambda: effect.apply(file,'tenant-σ:credit-v1','rollback-0093','eastern',73),sqlite3.IntegrityError)
        assert snapshot(file) == before
        db = effect.connect(file); db.execute('DROP TRIGGER fail_balance'); db.close()
        must_raise(lambda: effect.apply(file,'tenant-σ:credit-v1','missing-0094','account-absent',73),ValueError,'MISSING_ACCOUNT')
        assert snapshot(file) == before
        result['cases'].append('Injected balance-trigger error after ledger write and missing-target branch each roll back inbox+ledger+balance')

        barrier = threading.Barrier(2)
        def competing():
            barrier.wait()
            return effect.apply(file,'tenant-σ:credit-v1','parallel-0095','western',64)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            answers = [future.result() for future in [pool.submit(competing),pool.submit(competing)]]
        assert answers == ['APPLIED','APPLIED']
        raced = snapshot(file)
        assert dict(raced['accounts'])['western'] == 19+17+64
        assert len([r for r in raced['ledger'] if r[1]=='parallel-0095']) == 1
        result['cases'].append('New two-connection barrier race applies 64 once and returns the stored result to both callers')

        child = mp.get_context('spawn').Process(target=lost_reply,args=(file,))
        child.start(); child.join(10)
        assert child.exitcode == 42, child.exitcode
        after_commit = snapshot(file)
        assert dict(after_commit['accounts'])['eastern'] == 731+31+53
        assert effect.apply(file,'tenant-σ:credit-v1','capture-0092','eastern',53) == 'APPLIED'
        assert snapshot(file) == after_commit
        result['cases'].append('Actual process exit after COMMIT before reply: original capture-0092 replay changes no balance, inbox or ledger')
        result['sqliteFinal'] = after_commit

        java = Path('/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin')
        classes=temp/'classes';classes.mkdir()
        compiled=subprocess.run([str(java/'javac'),'--release','17','-d',str(classes),
                                 str(EXAMPLES/'Resilience.java'),str(ROOT/'docs/reviews/ch42-independent-Probe.java')],
                                text=True,capture_output=True)
        assert compiled.returncode == 0,compiled.stderr
        probe=subprocess.run([str(java/'java'),'-cp',str(classes),'Ch42IndependentProbe'],
                             text=True,capture_output=True,timeout=15)
        assert probe.returncode == 0,probe.stderr
        result['java']=probe.stdout.strip()
        result['cases'].append(result['java'])

    result['numeric'] = dict(incidentBacklog=(1200-600)*9*60,
                             recoverySeconds=324000/(1200-600),
                             noSpareAtOriginalArrival=1200-1200,
                             rawPayloadTB=1200*86400*1000*7*3/1e12,
                             sequentialBudgetMs=50+300+100+250+50,
                             initialMeanIo=100*0.08,failedMeanIo=100*2,
                             permitMeanCeiling=20/2,
                             amplification=3**3,retryTierCeiling=100*1.1,
                             localProbeTotal=8*3,
                             normalReadyCapacity=3*250,oneLostCapacity=2*250,
                             failureDeficit=600-2*250,
                             requiredNMinusOne=__import__('math').ceil(600/250)+1)
    assert result['numeric']['rawPayloadTB']==2.17728
    assert result['numeric']['requiredNMinusOne']==4
    result['sourceHashesAfter']=hashes()
    assert result['sourceHashesAfter']==result['sourceHashes'], 'Source changed during independent execution'
    result['passed']=True
    (ROOT/'docs/reviews/ch42-independent-check-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(dict(passed=True,cases=result['cases'],numeric=result['numeric']),ensure_ascii=False))


if __name__ == '__main__':
    run()
