"""Re-run chapter checks after authors freeze, retaining actual outputs and hashes."""
from pathlib import Path
import hashlib
import json
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
java = Path('/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin')
results = {'checks': [], 'files': {}}

def run(label, command):
    p = subprocess.run(command, cwd=root, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    results['checks'].append({'label': label, 'command': command, 'exitCode': p.returncode, 'output': p.stdout})
    return p.returncode == 0

with tempfile.TemporaryDirectory(prefix='sd-ch13-root-java-') as build:
    commands = [
        ('whole-site static check', ['node', 'tools/check.mjs']),
        *[(f'{ch} audit', ['node', 'tools/audit-chapter.mjs', ch]) for ch in ('ch13','ch14','ch15')],
        ('shared player syntax', ['node', '--check', 'assets/js/slides.js']),
        ('whitespace check', ['git', 'diff', '--check']),
        ('ch13 shared source', ['python3', 'examples/ch13/sync.py', '--check']),
        ('ch14 shared source', ['python3', 'examples/ch14/sync.py', '--check']),
        ('ch15 shared source', ['node', 'examples/ch15/sync.mjs', '--check']),
        ('Java runtime', [str(java / 'java'), '-version']),
        ('Java17 compilation', [str(java / 'javac'), '--release', '17', '-d', build,
                                'examples/ch13/SearchMerge.java', 'examples/ch13/SearchMergeTest.java']),
        ('Java17 merge cases', [str(java / 'java'), '-cp', build, 'SearchMergeTest']),
        ('ch13 protocol probes', ['python3', 'examples/ch13/verify.py']),
        ('ch14 protocol probes', ['python3', 'examples/ch14/verify.py']),
        ('ch15 protocol probes', ['python3', 'examples/ch15/check.py']),
        ('ch15 tenant isolation SQL probes', ['python3', 'examples/ch15/check-tenants.py']),
        ('root independent boundary probes', ['python3', 'docs/reviews/ch13-ch14-ch15-code-probes.py']),
    ]
    for label, command in commands:
        run(label, command)
for ch in ('ch13','ch14','ch15'):
    for p in [root / f'chapters/{ch}.html', *(root / 'examples' / ch).glob('*')]:
        if p.is_file():
            results['files'][str(p.relative_to(root))] = hashlib.sha256(p.read_bytes()).hexdigest()
results['passed'] = all(c['exitCode'] == 0 for c in results['checks'])
(root / 'docs/reviews/ch13-ch14-ch15-checks.json').write_text(json.dumps(results, indent=2) + '\n')
(root / 'docs/reviews/ch13-ch14-ch15-checks.txt').write_text('\n\n'.join(
    f"{c['label']} (exit {c['exitCode']})\n{c['output']}" for c in results['checks']) + '\n')
print(json.dumps({'passed': results['passed'], 'checks': len(results['checks']),
                  'failed': [c['label'] for c in results['checks'] if c['exitCode']]}))
raise SystemExit(0 if results['passed'] else 1)
