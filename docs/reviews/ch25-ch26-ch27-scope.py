"""Check the authorized wave against the saved working tree, including prior uncommitted work."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import os
import re
import sys

root = Path(__file__).resolve().parents[2]
prefix = 'ch25-ch26-ch27'
chapters = ['ch25', 'ch26', 'ch27']
sha = lambda b: hashlib.sha256(b).hexdigest()
baseline = json.loads((root/'docs/reviews'/f'{prefix}-baseline.json').read_text())

def allowed(name):
    return (name == 'PLAN.md'
            or any(name == f'chapters/{ch}.html' or name.startswith((f'examples/{ch}/', f'diagrams/{ch}/', f'assets/diagrams/{ch}/', f'docs/reviews/{ch}', f'docs/reviews/screenshots/{ch}')) for ch in chapters))

current = {}
for base, dirs, names in os.walk(root):
    dirs[:] = sorted(d for d in dirs if d not in {'.git', 'node_modules', 'dist', '__pycache__', '.venv', '.cache'})
    for name in sorted(names):
        p = Path(base)/name
        if name == '.DS_Store' or p.suffix == '.pyc' or p.is_symlink():
            continue
        current[p.relative_to(root).as_posix()] = sha(p.read_bytes())
changed = [name for name, old in baseline['files'].items() if name in current and current[name] != old]
missing = [name for name in baseline['files'] if name not in current]
created = [name for name in current if name not in baseline['files']]
unexpected = [name for name in changed+created if not allowed(name)]
inventory = {}
for ch in chapters:
    html = (root/f'chapters/{ch}.html').read_text()
    old = (root/f'docs/reviews/{prefix}-baseline/{ch}.html').read_text()
    groups = re.findall(r'<figure\b[^>]*class="deck"[^>]*>[\s\S]*?</figure>', html)
    old_groups = re.findall(r'<figure\b[^>]*class="deck"[^>]*>[\s\S]*?</figure>', old)
    svgs = re.findall(r'<svg\b[^>]*class="board"[^>]*>[\s\S]*?</svg>', html)
    old_svgs = re.findall(r'<svg\b[^>]*class="board"[^>]*>[\s\S]*?</svg>', old)
    ids = lambda source, tag: re.findall(r'<'+tag+r'\b[^>]*id="([^"]+)"', source)
    geometry = lambda svg: re.sub(r'(<(?:text|title|desc)\b[^>]*>)[\s\S]*?(</(?:text|title|desc)>)', r'\1\2', svg)
    inventory[ch] = dict(
        sha256=sha(html.encode()), decks=len(groups), frames=len(svgs), codeBlocks=html.count('<pre'),
        idsPreserved=ids(html, 'title') == ids(old, 'title'),
        descIdsPreserved=ids(html, 'desc') == ids(old, 'desc'),
        framesPreserved=[len(re.findall(r'<svg\b', g)) for g in groups] == [len(re.findall(r'<svg\b', g)) for g in old_groups],
        unchangedSvgs=sum(a == b for a, b in zip(svgs, old_svgs)),
        changedSvgs=sum(a != b for a, b in zip(svgs, old_svgs)),
        changedGeometry=sum(geometry(a) != geometry(b) for a, b in zip(svgs, old_svgs)),
    )
passed = not unexpected and not missing and all(row['idsPreserved'] and row['descIdsPreserved'] and row['framesPreserved'] for row in inventory.values())
result = dict(at=datetime.now(timezone.utc).isoformat(), passed=passed, baselineFiles=len(baseline['files']),
              changed=changed, created=created, missing=missing, unexpected=unexpected, inventory=inventory,
              note='Scope/hash and inventory checks complement technical and visual review; they do not prove correctness.')
(root/'docs/reviews'/f'{prefix}-scope-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(dict(passed=passed, inventory=inventory, unexpected=unexpected, missing=missing), ensure_ascii=False))
sys.exit(0 if passed else 1)
