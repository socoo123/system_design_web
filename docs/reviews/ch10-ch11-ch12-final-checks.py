"""Record the final batch checks without modifying page/source content."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import shlex
import subprocess

ROOT = Path(__file__).resolve().parents[2]
commands = [
    ['node', 'tools/check.mjs'],
    *[['node', 'tools/audit-chapter.mjs', ch] for ch in ('ch10', 'ch11', 'ch12')],
    ['python3', 'examples/ch10/sync.py', '--check'],
    ['node', 'examples/ch11/sync.mjs', '--check'],
    ['node', 'examples/ch12/sync.mjs', '--check'],
    ['node', '--check', 'assets/js/slides.js'],
    ['node', '--check', 'docs/reviews/ch10-ch11-ch12-browser.mjs'],
    ['node', '--check', 'docs/reviews/ch10-ch11-ch12-scope.mjs'],
    ['git', 'diff', '--check'],
]
results, logs = [], []
for command in commands:
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
    results.append({'command': command, 'exit_code': result.returncode,
                    'stdout': result.stdout, 'stderr': result.stderr})
    logs.append('$ ' + shlex.join(command) + '\n' + result.stdout + result.stderr
                + f'EXIT {result.returncode}\n')
report = {
    'passed': all(r['exit_code'] == 0 for r in results),
    'checked_at': datetime.now(timezone.utc).isoformat(),
    'pages': {ch: hashlib.sha256((ROOT / f'chapters/{ch}.html').read_bytes()).hexdigest()
              for ch in ('ch10', 'ch11', 'ch12')},
    'checks': results,
}
(ROOT / 'docs/reviews/ch10-ch11-ch12-checks.txt').write_text('\n'.join(logs))
(ROOT / 'docs/reviews/ch10-ch11-ch12-checks.json').write_text(
    json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'passed': report['passed'], 'checks': len(results)}))
if not report['passed']:
    raise SystemExit(1)
