"""Root integration: actual Java17 execution and non-mutating source checks."""
from pathlib import Path
import subprocess
import tempfile
import hashlib
import json

ROOT = Path(__file__).resolve().parents[2]
JAVA = Path('/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin')


def run(args):
    result = subprocess.run(list(map(str, args)), cwd=ROOT, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stdout + result.stderr)
    return result


report = {'runtime': run([JAVA / 'java', '-version']).stderr,
          'cases': [], 'source_sha256': {}}
for chapter, main in [('ch06', 'VersionedKv'), ('ch07', 'IdExample'),
                      ('ch08', 'LeaseBudgetTest')]:
    sources = sorted((ROOT / 'examples' / chapter).glob('*.java'))
    for source in sources:
        report['source_sha256'][str(source.relative_to(ROOT))] = hashlib.sha256(source.read_bytes()).hexdigest()
    with tempfile.TemporaryDirectory(prefix=chapter + '-root-java-') as output:
        run([JAVA / 'javac', '--release', '17', '-d', output, *sources])
        result = run([JAVA / 'java', '-cp', output, main])
        report['cases'].append({'chapter': chapter, 'main': main, 'passed': True,
                                'output': result.stdout, 'stderr': result.stderr})
for source in ['examples/ch06/check.py', 'examples/ch07/verify.py']:
    result = run(['python3', source])
    report['cases'].append({'check': source, 'passed': True, 'output': result.stdout})
    report['source_sha256'][source] = hashlib.sha256((ROOT / source).read_bytes()).hexdigest()
report['limits'] = ('Actual Java17 local examples and source/model checks. '
                    'No database cluster, failover, or production benchmark.')
(ROOT / 'docs/reviews/ch06-ch07-ch08-code-results.json').write_text(
    json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'runtime': report['runtime'], 'passed': len(report['cases'])}, ensure_ascii=False))
