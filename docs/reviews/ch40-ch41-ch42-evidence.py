"""Bind final sources to executed checks, independent reviews and viewed images."""
from pathlib import Path
import hashlib
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
PREFIX = 'ch40-ch41-ch42'
checks = []


def read(name):
    return json.loads((ROOT / f'docs/reviews/{name}.json').read_text())


def sha(file):
    return hashlib.sha256((ROOT / file).read_bytes()).hexdigest()


def check(ok, label):
    checks.append(dict(label=label, passed=bool(ok)))


def hashes_match(hashes, label):
    check(bool(hashes), label + ': nonempty source signature')
    for file, digest in hashes.items():
        check((ROOT / file).is_file() and sha(file) == digest, label + ': ' + file)


source_files = [f'chapters/ch{n}.html' for n in (40, 41, 42)]
source_files += [str(p.relative_to(ROOT)) for n in (40, 41, 42)
                 for p in (ROOT / f'examples/ch{n}').rglob('*')
                 if p.is_file() and '__pycache__' not in p.parts]
final_sources = {file: sha(file) for file in sorted(source_files)}
baseline = read(PREFIX + '-baseline')
for n in (40, 41, 42):
    ch = f'ch{n}'
    before = (ROOT / f'docs/reviews/{PREFIX}-baseline/{ch}.html').read_text()
    now = (ROOT / f'chapters/{ch}.html').read_text()
    ids = lambda text: re.findall(r'<(?:title|desc) id="([^"]+)"', text)
    decks = lambda text: re.findall(r'<figure\b[^>]*class="deck"[^>]*>[\s\S]*?</figure>', text)
    check(ids(before) == ids(now), ch + ': original animation IDs and order retained')
    check(len(decks(before)) == len(decks(now)), ch + ': original deck count retained')
    signed = read(ch + '-independent-final')
    check(signed.get('passed') is True and not signed.get('openFindings'), ch + ': independent review passed with no open findings')
    hashes_match(signed['sourceHashes'], ch + ' independent signature')
    required = {p for p in final_sources if p == f'chapters/{ch}.html' or p.startswith(f'examples/{ch}/')}
    check(required <= set(signed['sourceHashes']), ch + ': independent signature covers complete chapter/example sources')
    check((ROOT / f'docs/reviews/{ch}-independent-review.md').is_file(), ch + ': independent report exists')

suite = read(PREFIX + '-checks')
check(suite['passed'] and suite['sourcesUnchangedDuringRun'], 'integration suite passed on stable sources')
hashes_match(suite['sourceHashes'], 'integration source signature')
browser = read(PREFIX + '-browser-results')
check(browser['passed'] and not browser['errors'], 'real-browser matrix passed without page/resource errors')
check(len(browser['layouts']) == 72, '72 distinct real viewport/theme/language layouts')
check(len({(r['chapter'], r['width'], r['theme'], r['locale']) for r in browser['layouts']}) == 72,
      'matrix has no duplicate layout identities')
hashes_match({f'chapters/{ch}.html': digest for ch, digest in browser['files'].items()}, 'browser source signature')
check(sum(x['copied'] for x in browser['interactions']) == 12, '12 actual exact clipboard copies')

visual = read(PREFIX + '-root-visual-review')
seen = {(o['image'], o['sha256']) for o in visual['observations']}
frames = read(PREFIX + '-frames')
hashes_match(frames['files'], 'changed-frame source signature')
for ch, groups in frames['chapters'].items():
    for group in groups:
        check(len(group['nativeFrames']) == group['frames'] * 2,
              f'{ch} D{group["deck"]}: every frame rendered in both themes')
        for sheet in group['sheets']:
            check((sheet, sha(sheet)) in seen, 'current contact sheet actually opened: ' + sheet)

geometry = read(PREFIX + '-geometry-after')
hashes_match({f'chapters/{ch}.html': value['sha256'] for ch, value in geometry['chapters'].items()}, 'geometry source signature')
check(all(not f['invalidNumbers'] and not f['clipped'] and not f['nodeCrossings']
          for value in geometry['chapters'].values() for f in value['frames']), 'geometric triage has no invalid/clipped/node-crossing candidates')
header = read(PREFIX + '-header-results')
check(header['sameBeforeAfter'], 'existing320px header metrics remain unchanged; F04 stays in Q')
hashes_match({r['source']: r['sha256'] for r in header['layouts']}, 'header source signature')
for suffix in ('numeric-review', 'root-storage-results'):
    value = read(PREFIX + '-' + suffix)
    check(value['passed'], suffix + ' passed')
    hashes_match(value['sourceHashes'], suffix + ' source signature')
java = read(PREFIX + '-root-java-results')
check(java['passed'], 'Java17 author cases and independent probes passed')
for label, group in java['groups'].items():
    hashes_match(group['sourceHashes'], label + ' Java source signature')
scope = read(PREFIX + '-scope-results')
check(scope['passed'] and not scope['outsideScope'], 'all preexisting files outside authorized scope retain their hashes')
current = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '-z'], cwd=ROOT).decode().split('\0')
check(not [p for p in current if p.endswith('.png') and p not in baseline['fileHashes']], 'no newly added PNG escapes ignored screenshot directories')

result = dict(passed=all(x['passed'] for x in checks), checks=checks, finalSourceHashes=final_sources,
              limits='Source/evidence consistency is not a substitute for semantic review or a distributed fault experiment.')
(ROOT / f'docs/reviews/{PREFIX}-evidence-consistency.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
(ROOT / f'docs/reviews/{PREFIX}-final-source-hashes.json').write_text(json.dumps(final_sources, indent=2) + '\n')
print(json.dumps(dict(passed=result['passed'], checks=len(checks), failures=[x['label'] for x in checks if not x['passed']]), ensure_ascii=False))
raise SystemExit(0 if result['passed'] else 1)
