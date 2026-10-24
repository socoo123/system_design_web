"""Compare the batch against the pre-authorization working tree, including untracked files."""
from pathlib import Path
import hashlib
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
PREFIX = 'ch37-ch38-ch39'
baseline = json.loads((ROOT / f'docs/reviews/{PREFIX}-baseline.json').read_text())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def allowed(path):
    return path == 'PLAN.md' or bool(re.match(
        r'^(?:chapters/ch(?:37|38|39)\.html$|'
        r'(?:examples|diagrams|assets/diagrams)/ch(?:37|38|39)/|'
        r'docs/reviews/ch(?:37|38|39)(?:[-./]))', path))


current = subprocess.check_output(
    ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT
).decode().split('\0')
current = {p for p in current if p and (ROOT / p).is_file()
           and not p.startswith('docs/reviews/screenshots/')}
changed = [p for p, sha in baseline['fileHashes'].items()
           if not (ROOT / p).is_file() or digest(ROOT / p) != sha]
added = sorted(current - set(baseline['fileHashes']))
violations = [p for p in changed + added if not allowed(p)]
snapshots = {ch: digest(ROOT / f'docs/reviews/{PREFIX}-baseline/{ch}.html') == x['sha256']
             for ch, x in baseline['chapters'].items()}
result = {
    'baselineFiles': len(baseline['fileHashes']), 'changedExistingFiles': changed,
    'newFiles': added, 'outsideScope': violations, 'baselineSnapshotsMatch': snapshots,
    'passed': not violations and all(snapshots.values()),
    'limits': 'Ignored local screenshots are deliberately outside git scope. No claim about production reliability.'
}
(ROOT / f'docs/reviews/{PREFIX}-scope-results.json').write_text(
    json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({k: v for k, v in result.items() if k not in ('newFiles', 'changedExistingFiles')}, ensure_ascii=False))
raise SystemExit(0 if result['passed'] else 1)
