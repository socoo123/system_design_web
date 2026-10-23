"""Make stale browser/code evidence visible before the wave is accepted."""
from pathlib import Path
import hashlib
import json

root = Path(__file__).resolve().parents[2]
read = lambda name: json.loads((root / 'docs/reviews' / name).read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
browser = read('ch13-ch14-ch15-browser-results.json')
checks = read('ch13-ch14-ch15-checks.json')
probes = read('ch13-ch14-ch15-root-probes.json')
geometry = read('ch13-ch14-ch15-geometry-after.json')
scope = read('ch13-ch14-ch15-scope-results.json')
result = {'chapters': {}, 'sourceMismatches': [], 'independentRecords': {}}
for ch in ('ch13','ch14','ch15'):
    name = f'chapters/{ch}.html'
    digest = sha(root / name)
    layouts = [r for r in browser['layouts'] if r['chapter'] == ch]
    keys = {(r['width'], r['theme'], r['locale']) for r in layouts}
    item = {'sha256': digest, 'browserMatches': browser['files'][ch] == digest,
            'codeMatches': checks['files'][name] == digest,
            'rootProbesMatch': probes['sourceSha256'][name] == digest,
            'geometryMatches': geometry['chapters'][ch]['sha256'] == digest,
            'uniqueLayouts': len(keys),
            'frames': scope['inventory'][ch]['frames'],
            'idsPreserved': scope['inventory'][ch]['idsPreserved']}
    result['chapters'][ch] = item
    record = root / 'docs/reviews' / f'{ch}-independent-review.md'
    result['independentRecords'][ch] = {
        'exists': record.exists(),
        'sha256': sha(record) if record.exists() else None,
        'containsFinalPageHash': record.exists() and digest in record.read_text(),
    }
for name, digest in checks['files'].items():
    if not (root / name).exists() or sha(root / name) != digest:
        result['sourceMismatches'].append(name)
result['passed'] = (browser['passed'] and checks['passed'] and probes['passed'] and scope['passed']
    and not result['sourceMismatches']
    and all(v['browserMatches'] and v['codeMatches'] and v['rootProbesMatch'] and v['geometryMatches']
            and v['uniqueLayouts'] == 24 and v['frames'] == 30 and v['idsPreserved'] for v in result['chapters'].values())
    and all(v['exists'] and v['containsFinalPageHash'] for v in result['independentRecords'].values()))
result['note'] = 'Record existence/hashes do not substitute for reading the independent findings and verifying closure.'
(root / 'docs/reviews/ch13-ch14-ch15-evidence-consistency.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
raise SystemExit(0 if result['passed'] else 1)
