"""Record implementation and repair versions without replacing prior evidence."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import sys

root = Path(__file__).resolve().parents[2]
prefix = 'ch28-ch29-ch30'
chapters = ['ch28', 'ch29', 'ch30']
selected = sys.argv[2:] or chapters
assert set(selected).issubset(chapters)
target = root/'docs/reviews'/f'{prefix}-freeze.json'
record = json.loads(target.read_text()) if target.exists() else dict(files={}, versions=[])
files = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
         for ch in selected for p in [root/f'chapters/{ch}.html', *(root/'examples'/ch).rglob('*')]
         if p.is_file() and p.suffix not in {'.pyc', '.class'} and '__pycache__' not in p.parts}
record['files'].update(files)
record['versions'].append(dict(at=datetime.now(timezone.utc).isoformat(), stage=sys.argv[1], chapters=selected, files=files))
target.write_text(json.dumps(record, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(dict(stage=sys.argv[1], sourceFiles=len(files))))
