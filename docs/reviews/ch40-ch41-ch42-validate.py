"""Integration checks for the authorized batch, with exact source hashes."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import datetime
import hashlib
import json
import os
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
PREFIX = 'ch40-ch41-ch42'


def sources():
    files = [ROOT / f'chapters/ch{n}.html' for n in (40, 41, 42)]
    for n in (40, 41, 42):
        for area in ('examples', 'diagrams', 'assets/diagrams'):
            files += [p for p in (ROOT / f'{area}/ch{n}').rglob('*')
                      if p.is_file() and '__pycache__' not in p.parts]
    files += list((ROOT / 'assets/js').glob('*.js'))
    files += [ROOT / 'assets/css/style.css', ROOT / 'index.html']
    files += [p for p in (ROOT / 'docs/reviews').glob(f'{PREFIX}-*')
              if p.is_file() and p.suffix in ('.py', '.mjs', '.java', '.pseudo')]
    return {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(files)}


def run(command):
    done = subprocess.run(command, cwd=ROOT, env=dict(os.environ, PYTHONDONTWRITEBYTECODE='1'),
                          capture_output=True, text=True)
    return dict(command=command, exitCode=done.returncode, stdout=done.stdout, stderr=done.stderr)


before = sources()
commands = [
    ['node', 'tools/check.mjs'], ['node', '--test', 'tools/validation.test.mjs'],
    ['node', 'tools/audit-chapter.mjs', 'ch40', 'ch41', 'ch42'],
    ['node', 'examples/ch40/sync.mjs', '--check'],
    [sys.executable, 'examples/ch40/verify.py'],
    [sys.executable, 'examples/ch41/verify.py'],
    [sys.executable, 'examples/ch42/check_sources.py'],
    [sys.executable, 'examples/ch42/check_effect.py'],
    [sys.executable, f'docs/reviews/{PREFIX}-root-storage.py'],
    [sys.executable, f'docs/reviews/{PREFIX}-root-java.py'],
    [sys.executable, f'docs/reviews/{PREFIX}-numeric.py'],
    [sys.executable, f'docs/reviews/{PREFIX}-scope.py'], ['git', 'diff', '--check'],
]
js_files = list((ROOT / 'assets/js').glob('*.js'))
js_files += [p for n in (40, 41, 42) for p in (ROOT / f'examples/ch{n}').glob('*.mjs')]
js_files += list((ROOT / 'docs/reviews').glob(f'{PREFIX}-*.mjs'))
commands += [['node', '--check', str(p.relative_to(ROOT))] for p in sorted(js_files)]
with ThreadPoolExecutor(max_workers=3) as pool:
    checks = list(pool.map(run, commands))
after = sources()
result = dict(at=datetime.datetime.now(datetime.timezone.utc).isoformat(), sourceHashes=after,
              sourcesUnchangedDuringRun=before == after, checks=checks,
              passed=before == after and all(x['exitCode'] == 0 for x in checks),
              limits='Local Java17 and SQLite contracts. Browser and visual evidence are separate. No live protocol, replicated storage, Kafka, Kubernetes, remote cancellation, power-loss or load experiment.')
(ROOT / f'docs/reviews/{PREFIX}-checks.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
(ROOT / f'docs/reviews/{PREFIX}-checks.txt').write_text('\n\n'.join(
    'COMMAND ' + ' '.join(x['command']) + f"\nEXIT {x['exitCode']}\n" + x['stdout'] + x['stderr'] for x in checks))
print(json.dumps(dict(passed=result['passed'], commands=len(checks), sourcesUnchanged=before == after,
                     failures=[dict(command=x['command'], output=(x['stdout'] + x['stderr'])[-2500:])
                               for x in checks if x['exitCode']]), ensure_ascii=False))
raise SystemExit(0 if result['passed'] else 1)
