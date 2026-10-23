"""Final integration commands, exact outputs and source hashes for this wave."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import tempfile
from datetime import datetime, timezone

root = Path(__file__).resolve().parents[2]
java = Path('/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin')
environment = dict(os.environ, PYTHONDONTWRITEBYTECODE='1', REDIS_SERVER='/tmp/redis-7.2.5/src/redis-server')
selected = set(os.environ.get('CHAPTERS', 'ch16,ch17,ch18').split(','))
result_path = root / 'docs/reviews/ch16-ch17-ch18-checks.json'
results = json.loads(result_path.read_text()) if 'CHAPTERS' in os.environ and result_path.exists() else {'checks': [], 'files': {}}
results['runs'] = [*results.get('runs', []), {'chapters': sorted(selected), 'startedAt': datetime.now(timezone.utc).isoformat()}]


def run(label, command):
    p = subprocess.run(command, cwd=root, env=environment, text=True,
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    record = {'label': label, 'command': command, 'exitCode': p.returncode, 'output': p.stdout}
    index = next((i for i, value in enumerate(results['checks']) if value['label'] == label), None)
    if index is None:
        results['checks'].append(record)
    else:
        results['checks'][index] = record


with tempfile.TemporaryDirectory(prefix='sd-c5-root-java-') as build:
    commands = [
        ('whole-site static check', ['node', 'tools/check.mjs']),
        *[(f'{ch} audit', ['node', 'tools/audit-chapter.mjs', ch]) for ch in ('ch16', 'ch17', 'ch18')],
        ('shared player syntax', ['node', '--check', 'assets/js/slides.js']),
        ('whitespace check', ['git', 'diff', '--check']),
        ('ch16 page/source agreement', ['python3', 'examples/ch16/sync.py', '--check']),
        ('ch17 page/source agreement', ['python3', 'examples/ch17/sync.py', '--check']),
        ('ch18 page/source agreement', ['node', 'examples/ch18/sync.mjs', '--check']),
        ('Java17 runtime', [str(java / 'java'), '-version']),
        ('actual Java17 policy and probes compile', [str(java / 'javac'), '--release', '17', '-d', build,
            'examples/ch17/GatewayPolicy.java', 'examples/ch17/GatewayPolicyTest.java',
            'docs/reviews/ch16-ch17-ch18-root-gateway.java']),
        ('author Java policy cases', [str(java / 'java'), '-cp', build, 'GatewayPolicyTest']),
        ('root Java policy boundary cases', [str(java / 'java'), '-cp', build, 'RootGatewayProbe']),
        ('ch16 actual isolated Redis and SQL/contracts', ['python3', 'examples/ch16/verify.py']),
        ('ch17 adapter contracts and arithmetic', ['python3', 'examples/ch17/verify.py']),
        ('ch18 actual SQLite model contracts', ['python3', 'examples/ch18/check.py']),
        ('root new inputs against actual order model', ['python3', 'docs/reviews/ch16-ch17-ch18-root-order-probes.py']),
    ]
    if 'CHAPTERS' in os.environ:
        always = {'whole-site static check', 'whitespace check'}
        java_labels = {'Java17 runtime', 'actual Java17 policy and probes compile',
                       'author Java policy cases', 'root Java policy boundary cases'}
        commands = [(label, command) for label, command in commands
                    if label in always or any(label.startswith(ch) for ch in selected)
                    or ('ch17' in selected and label in java_labels)
                    or ('ch18' in selected and label == 'root new inputs against actual order model')]
    for label, command in commands:
        run(label, command)

if 'ch17' in selected:
    gateway_checks = [c for c in results['checks'] if c['label'] in {
        'actual Java17 policy and probes compile', 'root Java policy boundary cases'}]
    gateway_sources = ['examples/ch17/GatewayPolicy.java', 'docs/reviews/ch16-ch17-ch18-root-gateway.java']
    gateway_result = {'sourceHashes': {name: hashlib.sha256((root / name).read_bytes()).hexdigest()
                                      for name in gateway_sources},
                      'checks': gateway_checks, 'passed': all(c['exitCode'] == 0 for c in gateway_checks)}
    (root / 'docs/reviews/ch16-ch17-ch18-root-gateway-results.json').write_text(json.dumps(gateway_result, indent=2) + '\n')

for chapter in selected:
    paths = [root / f'chapters/{chapter}.html', *(root / 'examples' / chapter).glob('*')]
    for p in paths:
        if p.is_file():
            results['files'][str(p.relative_to(root))] = hashlib.sha256(p.read_bytes()).hexdigest()
results['passed'] = all(c['exitCode'] == 0 for c in results['checks'])
(root / 'docs/reviews/ch16-ch17-ch18-checks.json').write_text(json.dumps(results, indent=2) + '\n')
(root / 'docs/reviews/ch16-ch17-ch18-checks.txt').write_text('\n\n'.join(
    f"{c['label']} (exit {c['exitCode']})\n{c['output']}" for c in results['checks']) + '\n')
print(json.dumps({'passed': results['passed'], 'checks': len(results['checks']),
                  'failed': [c['label'] for c in results['checks'] if c['exitCode']]}))
raise SystemExit(0 if results['passed'] else 1)
