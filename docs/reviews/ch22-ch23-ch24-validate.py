"""Run the wave's final integration commands and bind them to exact page/example sources."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import os
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
prefix = 'ch22-ch23-ch24'
chapters = ['ch22', 'ch23', 'ch24']
selected = set(os.environ.get('CHAPTERS', ','.join(chapters)).split(','))
if not selected.issubset(chapters): raise ValueError('Unexpected chapter')
java = '/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin'
env = dict(os.environ, PYTHONDONTWRITEBYTECODE='1',
           REDIS_SERVER='/tmp/redis-7.2.5/src/redis-server', PATH=java+os.pathsep+os.environ['PATH'])
commands = [
    ('whole-site structure/resources/animation preservation', ['node', 'tools/check.mjs']),
    *[(ch+' chapter audit', ['node', 'tools/audit-chapter.mjs', ch]) for ch in chapters],
    ('slideshow JavaScript syntax', ['node', '--check', 'assets/js/slides.js']),
    ('whitespace integrity', ['git', 'diff', '--check']),
    ('ch22 page/source agreement', ['node', 'examples/ch22/sync.mjs', '--check']),
    ('ch22 SQLite / Data contract paths', ['python3', 'examples/ch22/verify.py']),
    ('ch22 Java17 read validation', ['python3', 'examples/ch22/run_java.py']),
    ('ch23 page/source agreement', ['python3', 'examples/ch23/sync.py', '--check']),
    ('ch23 actual SQLite / Redis / Java17', ['python3', 'examples/ch23/check.py']),
    ('ch24 page/source agreement', ['node', 'examples/ch24/sync.mjs', '--check']),
    ('ch24 actual SQLite / payment contracts', ['python3', 'examples/ch24/check.py']),
]
target = root/'docs/reviews'/f'{prefix}-checks.json'
result = json.loads(target.read_text()) if 'CHAPTERS' in os.environ and target.exists() else {'checks': [], 'files': {}, 'runs': []}
if 'CHAPTERS' in os.environ:
    commands = [(label, command) for label, command in commands if label.startswith(('whole-site', 'whitespace', 'slideshow')) or any(label.startswith(ch) for ch in selected)]
def hashes():
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
            for ch in selected for p in [root/f'chapters/{ch}.html', *(root/'examples'/ch).rglob('*')]
            if p.is_file()}
before = hashes()
html_only = os.environ.get('HTML_ONLY') == '1'
if html_only:
    examples = {name: value for name, value in before.items() if name.startswith('examples/')}
    if not examples or any(result['files'].get(name) != value for name, value in examples.items()):
        raise RuntimeError('HTML_ONLY requires unchanged, previously verified example files')
    commands = [(label, command) for label, command in commands
                if label.startswith(('whole-site', 'whitespace'))
                or label.endswith(('chapter audit', 'page/source agreement'))]
for label, command in commands:
    artifact_names = {
        'ch22 SQLite / Data contract paths': ['ch22-code-results.json'],
        'ch22 Java17 read validation': ['ch22-java-results.json'],
        'ch23 actual SQLite / Redis / Java17': ['ch23-code-results.json'],
        'ch24 actual SQLite / payment contracts': ['ch24-code-results.json'],
    }.get(label, [])
    original_artifacts = {name: (root/'docs/reviews'/name).read_bytes() for name in artifact_names}
    process = subprocess.run(command, cwd=root, env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    row = dict(label=label, command=command, exitCode=process.returncode, output=process.stdout)
    # The original suites have fixed output paths. Preserve the author's exact
    # evidence and retain our fresh execution under this wave's own namespace.
    row['resultArtifacts'] = {}
    for name, original in original_artifacts.items():
        report = root/'docs/reviews'/name
        if process.returncode == 0:
            fresh = report.read_bytes()
            copy = root/'docs/reviews'/f'{prefix}-actual-{name}'
            copy.write_bytes(fresh)
            row['resultArtifacts'][str(copy.relative_to(root))] = hashlib.sha256(fresh).hexdigest()
        report.write_bytes(original)
    old = next((i for i, item in enumerate(result['checks']) if item['label'] == label), None)
    if old is None: result['checks'].append(row)
    else: result['checks'][old] = row
after = hashes()
result['runs'].append(dict(at=datetime.now(timezone.utc).isoformat(), chapters=sorted(selected),
                          sourceStable=before == after, htmlOnly=html_only,
                          commands=[label for label, _ in commands],
                          reusedSuitesAfterExactExampleHashMatch=html_only))
result['files'].update(after)
result['passed'] = all(row['exitCode'] == 0 for row in result['checks']) and all(run['sourceStable'] for run in result['runs'])
target.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
(root/'docs/reviews'/f'{prefix}-checks.txt').write_text('\n\n'.join(f"{row['label']} (exit {row['exitCode']})\n{row['output']}" for row in result['checks'])+'\n')
print(json.dumps(dict(passed=result['passed'], checks=len(result['checks']), sourceStable=before == after,
                      failures=[row['label'] for row in result['checks'] if row['exitCode']])))
sys.exit(0 if result['passed'] else 1)
