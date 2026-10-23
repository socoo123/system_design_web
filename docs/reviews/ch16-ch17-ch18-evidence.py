"""Check that final evidence refers to the actual accepted source bytes.

Human review of reports and screenshots remains a separate requirement.
"""
from pathlib import Path
import hashlib
import json

root = Path(__file__).resolve().parents[2]
prefix = root / 'docs/reviews/ch16-ch17-ch18'
checks = json.loads(Path(str(prefix) + '-checks.json').read_text())
browser = json.loads(Path(str(prefix) + '-browser-results.json').read_text())
geometry = json.loads(Path(str(prefix) + '-geometry-after.json').read_text())
scope = json.loads(Path(str(prefix) + '-scope-results.json').read_text())
preview = json.loads(Path(str(prefix) + '-breaker-preview.json').read_text())
result = {'files': {}, 'chapters': {}}
for name, digest in checks['files'].items():
    p = root / name
    result['files'][name] = p.exists() and hashlib.sha256(p.read_bytes()).hexdigest() == digest
for suffix in ('root-gateway-results', 'root-order-results'):
    evidence = json.loads(Path(str(prefix) + f'-{suffix}.json').read_text())
    for name, digest in evidence['sourceHashes'].items():
        p = root / name
        result['files'][name] = p.exists() and hashlib.sha256(p.read_bytes()).hexdigest() == digest
for chapter in ('ch16', 'ch17', 'ch18'):
    digest = hashlib.sha256((root / f'chapters/{chapter}.html').read_bytes()).hexdigest()
    author = root / f'docs/reviews/{chapter}.md'
    independent = root / f'docs/reviews/{chapter}-independent-review.md'
    result['chapters'][chapter] = {
        'sha256': digest,
        'browser': browser['files'][chapter] == digest,
        'layouts': len([r for r in browser['layouts'] if r['chapter'] == chapter]) == 24,
        'geometry': geometry['chapters'][chapter]['sha256'] == digest,
        'scope': scope['inventory'][chapter]['sha256'] == digest,
        'author': author.exists() and digest in author.read_text(),
        'independent': independent.exists() and digest in independent.read_text(),
    }
result['passed'] = (checks['passed'] and browser['passed'] and scope['passed']
                    and preview['passed'] and preview['htmlSha256'] == result['chapters']['ch17']['sha256']
                    and all(result['files'].values())
                    and all(all(v for k, v in c.items() if k != 'sha256')
                            for c in result['chapters'].values()))
Path(str(prefix) + '-evidence-consistency.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'passed': result['passed'], 'chapters': result['chapters'],
                  'staleFiles': [k for k, v in result['files'].items() if not v]}))
raise SystemExit(0 if result['passed'] else 1)
