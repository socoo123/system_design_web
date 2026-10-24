from pathlib import Path
import subprocess, json, hashlib

root = Path(__file__).resolve().parents[2]
commands = [
    ['node', 'tools/check.mjs'],
    ['node', 'tools/audit-chapter.mjs', 'ch29'],
    ['node', 'examples/ch29/sync.mjs', '--check'],
    ['node', '--check', 'examples/ch29/sync.mjs'],
    ['node', '--check', 'docs/reviews/ch29-browser.mjs'],
    ['node', '--check', 'docs/reviews/ch29-render.mjs'],
    ['python3', 'examples/ch29/check.py'],
    ['python3', 'examples/ch29/quota_check.py'],
    ['python3', 'docs/reviews/ch29-numeric.py'],
    ['git', 'diff', '--check'],
]
results = []
for cmd in commands:
    p = subprocess.run(cmd, cwd=root, capture_output=True, text=True)
    results.append({'command': cmd, 'exit_code': p.returncode, 'stdout': p.stdout, 'stderr': p.stderr})
    print(f'{p.returncode}: {" ".join(cmd)}')
record = {'passed': all(x['exit_code'] == 0 for x in results),
    'chapter_sha256': hashlib.sha256((root/'chapters/ch29.html').read_bytes()).hexdigest(), 'commands': results}
(root/'docs/reviews/ch29-check-results.json').write_text(json.dumps(record, indent=2)+'\n')
assert record['passed']
