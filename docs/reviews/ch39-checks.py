"""Capture author checks against one stable chapter/example source snapshot."""
from pathlib import Path
import hashlib, json, re, subprocess, time

root = Path(__file__).resolve().parents[2]
sources = [root / 'chapters/ch39.html', *sorted((root / 'examples/ch39').glob('*'))]
sources = [p for p in sources if p.is_file()]
def hashes():
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
before = hashes()
java = '/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin/'
Path('/tmp/ch39-classes').mkdir(exist_ok=True)
commands = [
    ['node', 'tools/check.mjs'],
    ['node', 'tools/audit-chapter.mjs', 'ch39'],
    ['node', 'examples/ch39/sync.mjs', '--check'],
    [java + 'javac', '-version'],
    [java + 'javac', '-d', '/tmp/ch39-classes', 'examples/ch39/LoadBalancing.java', 'examples/ch39/LoadBalancingTest.java'],
    [java + 'java', '-cp', '/tmp/ch39-classes', 'LoadBalancingTest'],
    ['python3', 'docs/reviews/ch39-numeric-review.py'],
    ['node', '--check', 'examples/ch39/sync.mjs'],
    ['node', '--check', 'docs/reviews/ch39-browser.mjs'],
    ['node', '--check', 'docs/reviews/ch39-render.mjs'],
    ['git', 'diff', '--check', '--', 'chapters/ch39.html', 'examples/ch39', 'docs/reviews/ch39.md'],
]
results = []
for command in commands:
    r = subprocess.run(command, cwd=root, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    results.append({'command': command, 'exitCode': r.returncode, 'output': r.stdout})
    print(('PASS' if r.returncode == 0 else 'FAIL') + ' ' + ' '.join(command))

old = (root / 'docs/reviews/ch37-ch38-ch39-baseline/ch39.html').read_text()
new = (root / 'chapters/ch39.html').read_text()
figures = lambda s: re.findall(r'<figure class="deck">[\s\S]*?</figure>', s)
frames = lambda s: re.findall(r'<svg\b[\s\S]*?</svg>', s)
old_figs, new_figs = figures(old), figures(new)
old_ids = re.findall(r'<(?:title|desc) id="([^"]+)"', old)
new_ids = re.findall(r'<(?:title|desc) id="([^"]+)"', new)
assert old_ids == new_ids and len(old_ids) == 74
assert [len(frames(f)) for f in old_figs] == [len(frames(f)) for f in new_figs] == [5,5,6,5,6,5,5]
changed = []
for d, (a, b) in enumerate(zip(old_figs, new_figs), 1):
    changes = [i for i, (sa, sb) in enumerate(zip(frames(a), frames(b)), 1) if sa != sb]
    if changes: changed.append({'deck': d, 'changedFrames': changes, 'allFrames': len(frames(b))})
after = hashes()
assert before == after, 'Sources changed during verification'
out = {
    'at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    'passed': all(r['exitCode'] == 0 for r in results),
    'sourcesBefore': before, 'sourcesAfter': after, 'commands': results,
    'animation': {'decks': 7, 'frames': 37, 'ids': 74, 'inventoryPreserved': True, 'changed': changed},
}
(root / 'docs/reviews/ch39-checks.json').write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n')
(root / 'docs/reviews/ch39-checks.txt').write_text('\n\n'.join(' '.join(r['command']) + '\n' + r['output'] for r in results))
(root / 'docs/reviews/ch39-author-source-hashes.json').write_text(json.dumps(after, indent=2) + '\n')
print(json.dumps({'passed': out['passed'], 'commands': len(results), 'animation': out['animation']}))
if not out['passed']: raise SystemExit(1)
