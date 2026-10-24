"""Independent inputs, no author evidence writers are executed/imported."""
from pathlib import Path
from decimal import Decimal
import ast
import hashlib
import json
import os
import sqlite3
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
source_files = [root/'chapters/ch40.html', *sorted((root/'examples/ch40').glob('*'))]
source_files = [p for p in source_files if p.is_file()]
hashes = lambda: {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in source_files}
before = hashes()
report = dict(sourceHashes=before, commands=[], sqlite=[])
env = dict(os.environ, PYTHONDONTWRITEBYTECODE='1')
try:
    with tempfile.TemporaryDirectory(prefix='ch40-independent-') as directory:
        out = Path(directory)
        # The filename is an evidence prefix; compile a temp correctly named copy.
        (out/'Ch40IndependentProbe.java').write_text((root/'docs/reviews/ch40-independent-Probe.java').read_text())
        jdk = '/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin/'
        for command in [[jdk+'javac','--release','17','-d',str(out),str(root/'examples/ch40/ProtocolContracts.java'),str(out/'Ch40IndependentProbe.java')],
                        [jdk+'java','-cp',str(out),'Ch40IndependentProbe']]:
            run = subprocess.run(command,cwd=root,env=env,text=True,capture_output=True)
            report['commands'].append(dict(command=command,exit=run.returncode,stdout=run.stdout,stderr=run.stderr))
            assert run.returncode == 0, run.stdout+run.stderr
        # Extract exactly the author's actual apply function, not a mirror implementation.
        tree = ast.parse((root/'examples/ch40/verify.py').read_text())
        fn = next(node for node in ast.walk(tree) if isinstance(node, ast.FunctionDef) and node.name == 'apply')
        db = sqlite3.connect(out/'projection.db', isolation_level=None)
        db.executescript("""
          CREATE TABLE projection(scope TEXT PRIMARY KEY,value INTEGER NOT NULL);
          CREATE TABLE cursor(scope TEXT PRIMARY KEY,epoch TEXT NOT NULL,seq INTEGER NOT NULL,generation INTEGER NOT NULL);
          INSERT INTO projection VALUES('inventory:t9',17);
          INSERT INTO cursor VALUES('inventory:t9','E9',710,9);
        """)
        namespace = {'db':db}
        exec(compile(ast.Module(body=[fn],type_ignores=[]),'author-apply','exec'),namespace)
        apply = namespace['apply']
        state = lambda: db.execute('SELECT value,epoch,seq,generation FROM projection JOIN cursor USING(scope)').fetchone()
        assert apply(711,9) == 'applied' and state()==(24,'E9',711,9)
        report['sqlite'].append(dict(case='new normal event',state=state()))
        try:
            apply(712,9,crash=True)
            raise AssertionError('fault failed to interrupt')
        except OSError:
            pass
        assert state()==(24,'E9',711,9)
        report['sqlite'].append(dict(case='failure after projection update rolls back projection and cursor',state=state()))
        db.execute('UPDATE cursor SET generation=10')
        assert apply(712,9) == 'old-handler' and state()==(24,'E9',711,10)
        assert apply(713,10) == 'gap' and state()[2]==711
        assert apply(712,10) == 'applied' and state()==(31,'E9',712,10)
        assert apply(712,10) == 'duplicate' and state()==(31,'E9',712,10)
        report['sqlite'].append(dict(case='replacement generation, gap refusal, replay and duplicate',state=state()))
        db.close()
        # Real two-connection WAL read snapshot demonstrates the state/cursor cut.
        a = sqlite3.connect(out/'snapshot.db',isolation_level=None)
        b = sqlite3.connect(out/'snapshot.db',isolation_level=None)
        a.executescript("PRAGMA journal_mode=WAL; CREATE TABLE state(value INTEGER,seq INTEGER); INSERT INTO state VALUES(10,80);")
        a.execute('BEGIN')
        old_value = a.execute('SELECT value FROM state').fetchone()[0]
        b.execute('UPDATE state SET value=11,seq=81')
        old_seq = a.execute('SELECT seq FROM state').fetchone()[0]
        assert (old_value,old_seq)==(10,80)
        a.execute('COMMIT')
        new_seq = a.execute('SELECT seq FROM state').fetchone()[0]
        assert new_seq==81 and old_value==10
        report['sqlite'].append(dict(case='one read snapshot is coherent; separately sampled latest cursor skips intervening event',coherent=[old_value,old_seq],splitRead=[old_value,new_seq]))
        a.close();b.close()
    report['arithmetic'] = {
      'origin':str(Decimal(2000)*(1-Decimal('.8'))),
      'rpc_remaining_ms':str(Decimal(300)-40-20),
      'ws_payload_B':str(Decimal(20000)*65536),
      'ws_payload_GiB':str(Decimal(20000)*65536/(2**30)),
      'scope_events':str(Decimal(100)*300),
      'scope_payload_B':str(Decimal(100)*300*200),
      'first_event_ms':str(Decimal(40)+20+500+40),
      'remaining_intervals_s':str(Decimal(399)/50),
      'last_event_s':str(Decimal('.6')+Decimal(399)/50),
      'generation_payload_MiB':str(Decimal(200)*65536/(2**20))}
    assert list(report['arithmetic'].values())==['400.0','240','1310720000','1.220703125','30000','6000000','600','7.98','8.58','12.5']
    assert hashes()==before, 'author files changed during independent execution'
    report['passed']=True
except BaseException as error:
    report['passed']=False;report['error']=str(error)
    raise
finally:
    (root/'docs/reviews/ch40-independent-check-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(dict(passed=True,newJavaClaims=len(json.loads(report['commands'][-1]['stdout'])['claims']),sqliteTraces=len(report['sqlite']),arithmetic=len(report['arithmetic']))))
