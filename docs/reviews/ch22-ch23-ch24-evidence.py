"""Final file/evidence agreement; independent reports are also read by the root."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import re
import sys

root = Path(__file__).resolve().parents[2]
prefix = 'ch22-ch23-ch24'
chapters = ['ch22', 'ch23', 'ch24']
checks = []
sha = lambda value: hashlib.sha256(value).hexdigest()
def read(name): return json.loads((root/'docs/reviews'/name).read_text())
def check(name, condition):
    checks.append(dict(name=name, passed=bool(condition)))
    if not condition: raise AssertionError(name)
def bound(label, files):
    check(label, bool(files) and all((root/name).is_file() and sha((root/name).read_bytes()) == expected
                                  for name, expected in files.items()))

try:
    freeze = read(prefix+'-freeze.json')
    actual = {str(p.relative_to(root)) for ch in chapters
              for p in [root/f'chapters/{ch}.html', *(root/'examples'/ch).rglob('*')] if p.is_file()}
    check('all 37 chapter/example source files are frozen', len(actual) == 37 and set(freeze['files']) == actual)
    check('no generated Python/Java cache is included', not any(name.endswith(('.pyc', '.class')) for name in actual))
    bound('frozen final source matches disk', freeze['files'])
    commands = read(prefix+'-checks.json')
    check('13 integration commands passed with stable source', commands['passed'] and len(commands['checks']) == 13
          and all(row['exitCode'] == 0 for row in commands['checks'])
          and all(row['sourceStable'] for row in commands['runs']))
    check('integration source set is complete', set(commands['files']) == actual)
    bound('integration commands bound to final source', commands['files'])
    for row in commands['checks']:
        if row.get('resultArtifacts'): bound(row['label']+' fresh root result artifact', row['resultArtifacts'])
    for filename in [prefix+'-root-read-results.json', prefix+'-root-contracts-results.json']:
        proof = read(filename)
        check(filename+' passed', proof['passed'])
        bound(filename+' exact tested sources', proof['sourceHashes'])
    check('root read probe used actual JDK17', '17.0.10' in read(prefix+'-root-read-results.json')['javaVersion'])
    numeric = read(prefix+'-numeric-review.json')
    check('47 arithmetic checks passed', numeric['passed'] and len(numeric['checks']) == 47)
    bound('arithmetic record bound to final pages', numeric['files'])
    browser = read(prefix+'-browser-results.json')
    check('browser passed without page/resource errors', browser['passed'] and not browser['errors'])
    bound('browser tested final pages', {f'chapters/{ch}.html': value for ch, value in browser['files'].items()})
    expected = {(ch, width, theme, locale) for ch in chapters for width in [320, 390, 768, 1440]
                for theme in ['parchment', 'dracula'] for locale in ['zh', 'en', 'both']}
    found = {(row['chapter'], row['width'], row['theme'], row['locale']) for row in browser['layouts']}
    check('72 unique real viewport/theme/language combinations', len(browser['layouts']) == 72 and found == expected)
    check('364 frame visits', sum(row['frameVisits'] for row in browser['layouts']) == 364)
    check('18 code copies and three interaction suites', len(browser['interactions']) == 3
          and sum(row['copied'] for row in browser['interactions']) == 18)
    check('all default and expanded layouts fit actual viewport', all(row['width'] == row['scrollWidth'] == row['expanded']['scrollWidth'] for row in browser['layouts']))
    check('46 cards use the shared grid', sum(next(row['flashcards']['count'] for row in browser['layouts'] if row['chapter'] == ch) for ch in chapters) == 46
          and all(row['flashcards']['inGrid'] for row in browser['layouts']))
    geometry = read(prefix+'-geometry-after.json')
    check('all 91 frames geometrically triaged', sum(len(row['frames']) for row in geometry['chapters'].values()) == 91)
    for ch, record in geometry['chapters'].items():
        bound(ch+' geometry is current', {f'chapters/{ch}.html': record['sha256']})
        check(ch+' no invalid numbers/clipping/node or boundary crossings',
              all(not frame[k] for frame in record['frames'] for k in ['invalidNumbers','clipped','nodeCrossings','boundaryCrossings']))
    contacts = read(prefix+'-contact-after.json')
    check('six current two-theme contact sheets', len(contacts['sheets']) == 6 and all((root/p).is_file() for p in contacts['sheets']))
    bound('contact sheets use current page sources', contacts['files'])
    scope = read(prefix+'-scope-results.json')
    check('previous work and out-of-scope files unchanged', scope['passed'] and not scope['unexpected'] and not scope['missing'])
    bound('scope inventory is current', {f'chapters/{ch}.html': record['sha256'] for ch,record in scope['inventory'].items()})
    check('91 frames with original title/description IDs retained', sum(row['frames'] for row in scope['inventory'].values()) == 91
          and all(row['idsPreserved'] and row['descIdsPreserved'] and row['framesPreserved'] for row in scope['inventory'].values()))
    baseline = read(prefix+'-baseline.json')
    for name in ['tools/validation.mjs','tools/validation.test.mjs']:
        bound(name+' unchanged since 17 precheck regressions', {name: baseline['files'][name]})
    for ch in chapters:
        independent = read(ch+'-independent-source-hashes.json')
        after = independent.get('after', {})
        target = {name for name in actual if name == f'chapters/{ch}.html' or name.startswith(f'examples/{ch}/')}
        check(ch+' independent final source set complete', set(after) == target)
        bound(ch+' independently reviewed final source', after)
        current = sha((root/f'chapters/{ch}.html').read_bytes())
        for filename in [ch+'.md', ch+'-independent-review.md']:
            check(filename+' documents final page hash', current in (root/'docs/reviews'/filename).read_text())
    passed = True
except Exception as error:
    passed = False
    failure = str(error)
result = dict(at=datetime.now(timezone.utc).isoformat(), passed=passed, checks=checks)
if not passed: result['failure'] = failure
(root/'docs/reviews'/f'{prefix}-evidence-consistency.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(dict(passed=passed, checks=len(checks), failure=result.get('failure'))))
sys.exit(0 if passed else 1)
