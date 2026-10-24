"""Check that executed evidence applies to the delivered sources and reviewed images."""
from pathlib import Path
import datetime
import hashlib
import itertools
import json
import re

ROOT = Path(__file__).resolve().parents[2]
PREFIX = 'ch34-ch35-ch36'
REVIEW = ROOT / 'docs/reviews'
chapters = ('ch34', 'ch35', 'ch36')
checks = []


def read(suffix):
    return json.loads((REVIEW / f'{PREFIX}-{suffix}.json').read_text())


def digest(name):
    return hashlib.sha256((ROOT / name).read_bytes()).hexdigest()


def check(name, condition):
    checks.append({'name': name, 'passed': bool(condition)})


baseline = read('baseline')
integration = read('checks')
check('all integration commands completed successfully', integration['passed'] and all(c['exitCode'] == 0 for c in integration['checks']))
check('integration ran against stable sources', integration['sourcesUnchangedDuringRun'])
for name, sha in integration['sourceHashes'].items():
    check('executed source is current: ' + name, digest(name) == sha)

browser = read('browser-results')
expected = set(itertools.product(chapters, (320, 390, 768, 1440), ('parchment', 'dracula'), ('zh', 'en', 'both')))
actual = [(r['chapter'], r['width'], r['theme'], r['locale']) for r in browser['layouts']]
check('all seventy-two distinct real viewport combinations', len(actual) == len(expected) and set(actual) == expected)
check('browser passed without page or resource errors', browser['passed'] and not browser['errors'])
check('both collapsed and expanded content fit real viewports', all(r['width'] == r['scrollWidth'] == r['expanded']['scrollWidth'] for r in browser['layouts']))
expected_visits = 4 * sum(d['frames'] for ch in chapters for d in baseline['chapters'][ch]['decks'])
check('every frame visited on desktop and mobile in both themes', sum(r['frameVisits'] for r in browser['layouts']) == expected_visits)
copies = sum(len(re.findall(r'<pre\b', (ROOT / f'chapters/{ch}.html').read_text())) for ch in chapters)
check('all code blocks copied verbatim', sum(r['copied'] for r in browser['interactions']) == copies)
check('complete interaction checks for all chapters', len(browser['interactions']) == 3 and all(all(r[k] for k in ('keyboard', 'playback', 'flashcards', 'progress', 'settings')) for r in browser['interactions']))
for ch, sha in browser['files'].items():
    check('browser source is current: ' + ch, digest(f'chapters/{ch}.html') == sha)

numeric = read('numeric-review')
check('independent arithmetic passed', numeric['passed'] and all(r['passed'] for r in numeric['checks']))
for ch, sha in numeric['chapterHashes'].items():
    check('numeric chapter is current: ' + ch, digest(f'chapters/{ch}.html') == sha)
for name in ('runtime', 'fleet', 'slo'):
    result = read('root-' + name + '-results')
    check('fresh root inputs passed: ' + name, result['passed'] and all(r['passed'] for r in result['checks']))
    for file, sha in result['files'].items():
        check('fresh-input source is current: ' + file, digest(file) == sha)

frames = read('frames')
visual = read('root-visual-review')
check('manual visual review signed', visual['passed'])
for name, sha in frames['files'].items():
    check('full-frame renderer source is current: ' + name, digest(name) == sha)
for name, sha in visual['chapterHashes'].items():
    check('visual chapter is current: ' + name, digest(name) == sha)
for name, sha in visual['reviewedImages'].items():
    check('reviewed image is byte-identical: ' + name, digest(name) == sha)
for name, sha in visual['reviewedPageImages'].items():
    check('reviewed real page image is byte-identical: ' + name, digest(name) == sha)
rendered_sheets = {p for decks in frames['chapters'].values() for d in decks for p in d['sheets']}
check('all changed-group frame sheets were actually reviewed', rendered_sheets <= set(visual['reviewedImages']))

independent = {}
for ch in chapters:
    html = (ROOT / f'chapters/{ch}.html').read_text()
    figures = re.findall(r'<figure\b[^>]*class="deck"[^>]*>[\s\S]*?</figure>', html)
    inventory = [len(re.findall(r'<div class="slide"', f)) for f in figures]
    check('preserved frame sequence: ' + ch, inventory == [d['frames'] for d in baseline['chapters'][ch]['decks']])
    check('preserved all animation IDs: ' + ch, re.findall(r'<title id="([^"]+)"', html) == baseline['chapters'][ch]['slideIds'] and not set(v for v in baseline['chapters'][ch]['allIds'] if re.fullmatch(r'd\d+s\d+[td]', v)) - set(re.findall(r'\bid="([^"]+)"', html)))
    expected_files = {f'chapters/{ch}.html'} | {str(p.relative_to(ROOT)) for p in (ROOT / f'examples/{ch}').rglob('*') if p.is_file() and '__pycache__' not in p.parts}
    signed = json.loads((REVIEW / f'{ch}-independent-source-hashes.json').read_text())
    check('independent review covers all chapter sources: ' + ch, set(signed['after']) == expected_files)
    check('independent review final sources are current: ' + ch, all(digest(name) == sha for name, sha in signed['after'].items()))
    report = f'docs/reviews/{ch}-independent-review.md'
    check('independent report exists: ' + ch, (ROOT / report).stat().st_size > 0)
    independent[ch] = {'report': report, 'sha256': digest(report), 'after': signed['after']}

scope = read('scope-results')
check('earlier work and authorization scope preserved', scope['passed'] and not any(not r['allowed'] for r in scope['changes']))
for ch, row in scope['chapters'].items():
    check('scope chapter current: ' + ch, digest(f'chapters/{ch}.html') == row['sha256'])

result = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'assertions': checks, 'passed': all(r['passed'] for r in checks),
          'independentReviews': independent,
          'handoffHashes': {name: digest(name) for name in ['PLAN.md', f'docs/reviews/{PREFIX}-review.md']},
          'limits': 'Source/evidence applicability checks supplement technical and manual visual review; they do not establish distributed or production reliability.'}
(REVIEW / f'{PREFIX}-evidence-consistency.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'passed': result['passed'], 'assertions': len(checks), 'failures': [r for r in checks if not r['passed']]}, ensure_ascii=False))
raise SystemExit(0 if result['passed'] else 1)
