"""Execute final scoped checks and retain the exact source set they exercised."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import datetime
import hashlib
import json
import os
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
PREFIX = 'ch34-ch35-ch36'


def sources():
    files = [ROOT / f'chapters/ch{n}.html' for n in (34, 35, 36)]
    files += [p for n in (34, 35, 36) for p in (ROOT / f'examples/ch{n}').rglob('*') if p.is_file() and '__pycache__' not in p.parts]
    files += list((ROOT / 'assets/js').glob('*.js'))
    return {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(files)}


def execute(command):
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE='1')
    done = subprocess.run(command, cwd=ROOT, env=env, text=True, capture_output=True)
    return {'command': command, 'exitCode': done.returncode, 'stdout': done.stdout, 'stderr': done.stderr}


before = sources()
commands = [['node', 'tools/check.mjs'], ['node', '--test', 'tools/validation.test.mjs']]
commands += [['node', 'tools/audit-chapter.mjs', f'ch{n}'] for n in (34, 35, 36)]
commands += [['node', f'examples/ch{n}/sync.mjs', '--check'] for n in (34, 35)]
commands += [[sys.executable, 'examples/ch34/check.py'], [sys.executable, 'examples/ch35/check.py'], [sys.executable, 'examples/ch36/run.py']]
commands += [[sys.executable, 'docs/reviews/ch36-evidence.py']]
commands += [[sys.executable, f'docs/reviews/{PREFIX}-root-{name}.py'] for name in ('runtime', 'fleet', 'slo')]
commands += [[sys.executable, f'docs/reviews/{PREFIX}-numeric.py'], ['git', 'diff', '--check']]
with ThreadPoolExecutor(max_workers=3) as pool:
    results = list(pool.map(execute, commands))

jdk = Path('/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin')
with tempfile.TemporaryDirectory() as compiled:
    result = execute([str(jdk / 'javac'), '--release', '17', '-d', compiled, 'examples/ch35/Capacity.java'])
    result['command'][4] = '<temporary class directory>'
    results.append(result)
    if result['exitCode'] == 0:
        result = execute([str(jdk / 'java'), '-cp', compiled, 'Capacity'])
        result['command'][2] = '<temporary class directory>'
        results.append(result)

jsfiles = list((ROOT / 'assets/js').glob('*.js'))
jsfiles += [p for n in (34, 35, 36) for p in (ROOT / f'examples/ch{n}').glob('*.mjs')]
jsfiles += list((ROOT / 'docs/reviews').glob(f'{PREFIX}-*.mjs'))
for path in sorted(jsfiles):
    results.append(execute(['node', '--check', str(path.relative_to(ROOT))]))

after = sources()
result = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'sourceHashes': after,
          'sourcesUnchangedDuringRun': before == after, 'checks': results,
          'passed': before == after and all(r['exitCode'] == 0 for r in results),
          'limits': 'Executed educational Java17/SQLite/Python models. No actual GPU, serving engine, tool provider, consensus cluster, telemetry backend, production latency or fault experiment.'}
(ROOT / f'docs/reviews/{PREFIX}-checks.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
(ROOT / f'docs/reviews/{PREFIX}-checks.txt').write_text('\n\n'.join('COMMAND ' + ' '.join(r['command']) + f"\nEXIT {r['exitCode']}\n" + r['stdout'] + r['stderr'] for r in results))
print(json.dumps({'passed': result['passed'], 'commands': len(results), 'sourcesUnchanged': before == after,
                  'failures': [{'command': r['command'], 'exitCode': r['exitCode'], 'output': (r['stdout'] + r['stderr'])[-1200:]} for r in results if r['exitCode']]}, ensure_ascii=False))
raise SystemExit(0 if result['passed'] else 1)
