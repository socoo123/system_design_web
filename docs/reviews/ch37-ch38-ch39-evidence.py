"""Check that final conclusions refer to the current files and retained evidence."""
from pathlib import Path
import datetime
import hashlib
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
PREFIX = 'ch37-ch38-ch39'
checks = []


def read(name):
    return json.loads((ROOT / 'docs/reviews' / name).read_text())


def sha(name):
    return hashlib.sha256((ROOT / name).read_bytes()).hexdigest()


def check(label, condition, detail=None):
    checks.append({'label': label, 'passed': bool(condition), 'detail': detail})


def signed_hashes(value):
    if 'sha256' in value and isinstance(value['sha256'], dict):
        return value['sha256']
    if 'hashes' in value:
        return value['hashes']
    return value


def verify_hashes(label, hashes):
    check(label + ' has source hashes', bool(hashes))
    for file, expected in hashes.items():
        check(label + ': ' + file, (ROOT / file).is_file() and sha(file) == expected)


baseline = read(f'{PREFIX}-baseline.json')
current_chapters = {f'ch{n}': sha(f'chapters/ch{n}.html') for n in (37, 38, 39)}
for ch in current_chapters:
    text = (ROOT / f'chapters/{ch}.html').read_text()
    inventory = baseline['chapters'][ch]
    check(f'{ch} title IDs and frame order preserved', re.findall(r'<title id="([^"]+)"', text) == inventory['slideIds'])
    check(f'{ch} desc IDs preserved', re.findall(r'<desc id="([^"]+)"', text) == [x for x in inventory['allIds'] if re.fullmatch(r'd\d+s\d+d', x)])
    check(f'{ch} deck count preserved', len(re.findall(r'<figure\b[^>]*class="deck"', text)) == len(inventory['decks']))
    check(f'{ch} meaningful code blocks present', len(re.findall(r'<pre\b', text)) == {'ch37': 3, 'ch38': 4, 'ch39': 3}[ch])

suite = read(f'{PREFIX}-checks.json')
check('integration suite passed on stable source set', suite['passed'] and suite['sourcesUnchangedDuringRun'])
check('36 final commands passed', len(suite['checks']) == 36 and all(r['exitCode'] == 0 for r in suite['checks']))
verify_hashes('integration', suite['sourceHashes'])

browser = read(f'{PREFIX}-browser-results.json')
check('root browser matrix passed', browser['passed'] and not browser['errors'])
verify_hashes('browser', {f'chapters/{ch}.html': value for ch, value in browser['files'].items()})
matrix = {(r['chapter'], r['width'], r['theme'], r['locale']) for r in browser['layouts']}
expected = {(ch, width, theme, locale) for ch in current_chapters for width in (320, 390, 768, 1440)
            for theme in ('parchment', 'dracula') for locale in ('zh', 'en', 'both')}
check('72 distinct real layouts', matrix == expected and len(browser['layouts']) == 72)
check('452 actual frame visits', sum(r['frameVisits'] for r in browser['layouts']) == 452)
check('ten exact code copies', sum(r['copied'] for r in browser['interactions']) == 10)

for label in ('storage', 'cache', 'negative-cache', 'cache-java', 'gate-java', 'sum-java'):
    result = read(f'{PREFIX}-root-{label}-results.json')
    check(label + ' independent new inputs passed', result['passed'])
    verify_hashes(label, result['sourceHashes'])
numeric = read(f'{PREFIX}-numeric-review.json')
check('65 independent arithmetic/guard calculations passed', numeric['passed'] and len(numeric['checks']) == 65)
verify_hashes('numeric', numeric['sourceHashes'])

author_files = {37: 'ch37-source-hashes.json', 38: 'ch38-source-hashes.json', 39: 'ch39-author-source-hashes.json'}
review_files = {37: 'ch37-independent-after-source-hashes.json',
                38: 'ch38-independent-source-after.json', 39: 'ch39-independent-source-after-label-fix.json'}
signatures = {}
for number in (37, 38, 39):
    required = {f'chapters/ch{number}.html'}
    required |= {str(p.relative_to(ROOT)) for p in (ROOT / f'examples/ch{number}').rglob('*')
                 if p.is_file() and '__pycache__' not in p.parts}
    signatures[str(number)] = {}
    for role, file in (('author', author_files[number]), ('independent', review_files[number])):
        hashes = signed_hashes(read(file))
        check(f'{number} {role} signature covers all chapter/example sources', required <= set(hashes))
        verify_hashes(f'{number} {role}', {p: h for p, h in hashes.items() if '__pycache__' not in p})
        signatures[str(number)][role] = file
    report = ROOT / f'docs/reviews/ch{number}-independent-review.md'
    check(f'{number} final independent report exists', report.is_file() and report.stat().st_size > 100)

for number in (37, 38, 39):
    result = read(f'ch{number}-independent-browser-results.json')
    layouts = result.get('layouts', result.get('combos', []))
    check(f'{number} independent browser layouts', len(layouts) == 24 and not result['errors'])
    digest = result.get('chapterSha256', result.get('sourceSha256'))
    if digest is None:
        digest = result['files'][f'ch{number}']
    check(f'{number} independent browser uses current chapter', digest == current_chapters[f'ch{number}'])

frames = read(f'{PREFIX}-frames.json')
verify_hashes('rendered frames', frames['files'])
visual = read(f'{PREFIX}-root-visual-review.json')
check('root visual acceptance closed', visual['passedForScopedChapterChanges'])
verify_hashes('root visually reviewed source', visual['sourceHashes'])
verify_hashes('root actually opened image', {x['path']: x['sha256'] for x in visual['viewedImages']})
for mode in ('before', 'after'):
    contacts = read(f'{PREFIX}-contact-{mode}.json')
    verify_hashes(mode + ' contact source', contacts['sources'])
    verify_hashes(mode + ' contact image', {x['image']: x['sha256'] for x in contacts['sheets']})

scope = read(f'{PREFIX}-scope-results.json')
check('existing work and other chapter scope preserved', scope['passed'] and not scope['outsideScope'])
header = read(f'{PREFIX}-header-results.json')
check('F04 header baseline unchanged', header['sameBeforeAfter'])
check('F04 after measurements use current source', all(row['sha256'] == current_chapters[row['chapter']]
      for row in header['layouts'] if row['mode'] == 'after'))
untracked = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard', '-z'], cwd=ROOT).decode().split('\0')
images = [p for p in untracked if p and Path(p).suffix.lower() in ('.png', '.jpg', '.jpeg', '.webp')]
check('no unignored new screenshot files', not images, images)

result = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'checks': checks,
          'passed': all(row['passed'] for row in checks), 'signatures': signatures,
          'limits': 'Checks evidence applicability and file provenance. Human review, contract prerequisites and the stated experiment limits still apply.'}
(ROOT / f'docs/reviews/{PREFIX}-evidence-consistency.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
if result['passed']:
    (ROOT / f'docs/reviews/{PREFIX}-final-source-hashes.json').write_text(json.dumps(
        {'at': result['at'], 'sourceHashes': suite['sourceHashes'], 'signatures': signatures}, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'passed': result['passed'], 'checks': len(checks),
                  'failures': [x for x in checks if not x['passed']]}, ensure_ascii=False))
raise SystemExit(0 if result['passed'] else 1)
