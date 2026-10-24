"""Run final integration commands with exact source binding and separate evidence outputs."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import os
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
prefix = 'ch25-ch26-ch27'
chapters = ['ch25', 'ch26', 'ch27']
selected = set(os.environ.get('CHAPTERS', ','.join(chapters)).split(','))
if not selected.issubset(chapters):
    raise ValueError('Unexpected chapter')
java = '/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin'
env = dict(os.environ, PYTHONDONTWRITEBYTECODE='1',
           REDIS_SERVER='/tmp/redis-7.2.5/src/redis-server', PATH=java+os.pathsep+os.environ['PATH'])
commands = [
    ('whole-site structure/resources/animation preservation', ['node', 'tools/check.mjs']),
    *[(ch+' chapter audit', ['node', 'tools/audit-chapter.mjs', ch]) for ch in chapters],
    ('slideshow JavaScript syntax', ['node', '--check', 'assets/js/slides.js']),
    ('whitespace integrity', ['git', 'diff', '--check']),
]
for ch in chapters:
    scripts = [root/f'examples/{ch}/sync.py', root/f'examples/{ch}/sync.mjs']
    script = next((p for p in scripts if p.is_file()), None)
    if script is None:
        raise RuntimeError(ch+' source agreement script is not present')
    commands.append((ch+' page/source agreement', ['python3' if script.suffix == '.py' else 'node', str(script.relative_to(root)), '--check']))
    output = f'docs/reviews/{prefix}-actual-{ch}-code-results.json'
    run = ['python3', f'examples/{ch}/check.py']
    if ch == 'ch25':
        run.append(output)
    elif ch == 'ch27':
        run += ['--output', output]
    commands.append((ch+' actual transaction/Java/Redis paths', run))

target = root/'docs/reviews'/f'{prefix}-checks.json'
result = json.loads(target.read_text()) if 'CHAPTERS' in os.environ and target.exists() else dict(checks=[], files={}, runs=[])
if 'CHAPTERS' in os.environ:
    commands = [(label, cmd) for label, cmd in commands if label.startswith(('whole-site', 'whitespace', 'slideshow')) or any(label.startswith(ch) for ch in selected)]

def hashes():
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
            for ch in selected for p in [root/f'chapters/{ch}.html', *(root/'examples'/ch).rglob('*')]
            if p.is_file() and p.suffix not in {'.pyc', '.class'} and '__pycache__' not in p.parts}

before = hashes()
html_only = os.environ.get('HTML_ONLY') == '1'
if html_only:
    examples = {name: value for name, value in before.items() if name.startswith('examples/')}
    if not examples or any(result['files'].get(name) != value for name, value in examples.items()):
        raise RuntimeError('HTML_ONLY requires unchanged, previously verified example files')
    commands = [(label, cmd) for label, cmd in commands if label.startswith(('whole-site', 'whitespace')) or label.endswith(('chapter audit', 'page/source agreement'))]
for label, command in commands:
    fixed = root/'docs/reviews/ch26-code-results.json' if label.startswith('ch26 actual') else None
    original = fixed.read_bytes() if fixed and fixed.exists() else None
    process = subprocess.run(command, cwd=root, env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    row = dict(label=label, command=command, exitCode=process.returncode, output=process.stdout, resultArtifacts={})
    if fixed:
        if process.returncode == 0 and fixed.exists():
            fresh = fixed.read_bytes()
            separate = root/'docs/reviews'/f'{prefix}-actual-ch26-code-results.json'
            separate.write_bytes(fresh)
            row['resultArtifacts'][str(separate.relative_to(root))] = hashlib.sha256(fresh).hexdigest()
        if original is not None:
            fixed.write_bytes(original)
    elif ' actual ' in label:
        ch = label[:4]
        artifact = root/'docs/reviews'/f'{prefix}-actual-{ch}-code-results.json'
        if process.returncode == 0 and artifact.exists():
            row['resultArtifacts'][str(artifact.relative_to(root))] = hashlib.sha256(artifact.read_bytes()).hexdigest()
    old = next((i for i, item in enumerate(result['checks']) if item['label'] == label), None)
    if old is None:
        result['checks'].append(row)
    else:
        result['checks'][old] = row
after = hashes()
result['runs'].append(dict(at=datetime.now(timezone.utc).isoformat(), chapters=sorted(selected), sourceStable=before == after,
                          htmlOnly=html_only, commands=[label for label, _ in commands], reusedSuitesAfterExactExampleHashMatch=html_only))
result['files'].update(after)
result['passed'] = all(row['exitCode'] == 0 for row in result['checks']) and all(row['sourceStable'] for row in result['runs'])
target.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
(root/'docs/reviews'/f'{prefix}-checks.txt').write_text('\n\n'.join(f"{row['label']} (exit {row['exitCode']})\n{row['output']}" for row in result['checks'])+'\n')
print(json.dumps(dict(passed=result['passed'], checks=len(result['checks']), sourceStable=before == after,
                      failures=[row['label'] for row in result['checks'] if row['exitCode']])))
sys.exit(0 if result['passed'] else 1)
