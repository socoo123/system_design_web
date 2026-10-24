"""Run final structure, code-source agreement, and executable teaching checks."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import os
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
prefix = 'ch28-ch29-ch30'
chapters = ['ch28', 'ch29', 'ch30']
selected = set(os.environ.get('CHAPTERS', ','.join(chapters)).split(','))
assert selected.issubset(chapters)
env = dict(os.environ, PYTHONDONTWRITEBYTECODE='1')
commands = [
    ('whole-site structure/resources/animation preservation', ['node', 'tools/check.mjs']),
    *[(ch + ' chapter audit', ['node', 'tools/audit-chapter.mjs', ch]) for ch in chapters],
    ('slideshow JavaScript syntax', ['node', '--check', 'assets/js/slides.js']),
    ('whitespace integrity', ['git', 'diff', '--check']),
]
for ch in chapters:
    commands.extend([
        (ch + ' page/source agreement', ['node', f'examples/{ch}/sync.mjs', '--check']),
        (ch + ' actual teaching checks', ['python3', f'examples/{ch}/check.py',
                                        f'docs/reviews/{prefix}-actual-{ch}-code-results.json']),
    ])
commands.extend([
    ('root new-input Java contracts', ['python3', f'docs/reviews/{prefix}-root-java.py']),
    ('root new-input SQLite contracts', ['python3', f'docs/reviews/{prefix}-root-sql.py']),
    ('root independent arithmetic', ['python3', f'docs/reviews/{prefix}-numeric.py']),
])
if 'CHAPTERS' in os.environ:
    commands = [(label, cmd) for label, cmd in commands
                if label.startswith(('whole-site', 'slideshow', 'whitespace', 'root'))
                or any(label.startswith(ch) for ch in selected)]
target = root / 'docs/reviews' / f'{prefix}-checks.json'
record = json.loads(target.read_text()) if 'CHAPTERS' in os.environ and target.exists() else dict(checks=[], files={}, runs=[])


def hashes():
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
            for ch in selected for p in [root / f'chapters/{ch}.html', *(root / 'examples' / ch).rglob('*')]
            if p.is_file() and p.suffix not in {'.pyc', '.class'} and '__pycache__' not in p.parts}


before = hashes()
html_only = os.environ.get('HTML_ONLY') == '1'
if html_only:
    example_files = {name: value for name, value in before.items() if name.startswith('examples/')}
    if not example_files or any(record['files'].get(name) != value for name, value in example_files.items()):
        raise RuntimeError('HTML_ONLY requires exact agreement with already executed example sources')
    commands = [(label, cmd) for label, cmd in commands
                if label.startswith(('whole-site', 'whitespace'))
                or label.endswith((' chapter audit', ' page/source agreement'))
                or label == 'root independent arithmetic']
for label, command in commands:
    process = subprocess.run(command, cwd=root, env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    row = dict(label=label, command=command, exitCode=process.returncode, output=process.stdout)
    if label.endswith(' actual teaching checks'):
        artifact = root / command[-1]
        if artifact.exists():
            row['resultArtifacts'] = {str(artifact.relative_to(root)): hashlib.sha256(artifact.read_bytes()).hexdigest()}
    old = next((i for i, item in enumerate(record['checks']) if item['label'] == label), None)
    if old is None:
        record['checks'].append(row)
    else:
        record['checks'][old] = row
after = hashes()
record['files'].update(after)
record['runs'].append(dict(at=datetime.now(timezone.utc).isoformat(), chapters=sorted(selected),
                          sourceStable=before == after, commands=[label for label, _ in commands],
                          htmlOnly=html_only, reusedExecutableChecksAfterExactExampleHashMatch=html_only))
record['passed'] = before == after and all(row['exitCode'] == 0 for row in record['checks'])
target.write_text(json.dumps(record, indent=2) + '\n')
(root / 'docs/reviews' / f'{prefix}-checks.txt').write_text('\n\n'.join(
    f"{row['label']} (exit {row['exitCode']})\n{row['output']}" for row in record['checks']) + '\n')
print(json.dumps(dict(passed=record['passed'], checks=len(record['checks']), sourceStable=before == after,
                      failures=[r['label'] for r in record['checks'] if r['exitCode']])))
sys.exit(0 if record['passed'] else 1)
