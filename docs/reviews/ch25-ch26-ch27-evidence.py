"""Final source/evidence agreement. Technical and visual conclusions are reviewed separately."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import sys

root = Path(__file__).resolve().parents[2]
prefix = 'ch25-ch26-ch27'
chapters = ['ch25', 'ch26', 'ch27']
checks = []
sha = lambda b: hashlib.sha256(b).hexdigest()

def read(name):
    return json.loads((root/'docs/reviews'/name).read_text())

def check(label, condition):
    checks.append(dict(name=label, passed=bool(condition)))
    if not condition:
        raise AssertionError(label)

def bound(label, files):
    check(label, bool(files) and all((root/name).is_file() and sha((root/name).read_bytes()) == expected
                                  for name, expected in files.items()))

try:
    actual = {str(p.relative_to(root)) for ch in chapters
              for p in [root/f'chapters/{ch}.html', *(root/'examples'/ch).rglob('*')] if p.is_file()}
    check('no generated Python/Java cache in the delivered examples',
          not any(name.endswith(('.pyc', '.class')) or '__pycache__' in name for name in actual))
    freeze = read(prefix+'-freeze.json')
    check('complete current chapter/example source set is frozen', set(freeze['files']) == actual)
    bound('frozen final sources match disk', freeze['files'])
    command = read(prefix+'-checks.json')
    expected = {'whole-site structure/resources/animation preservation', 'slideshow JavaScript syntax', 'whitespace integrity'}
    expected |= {ch+suffix for ch in chapters for suffix in [' chapter audit', ' page/source agreement', ' actual transaction/Java/Redis paths']}
    check('all intended integration commands passed on stable source', command['passed']
          and {row['label'] for row in command['checks']} == expected
          and all(row['exitCode'] == 0 for row in command['checks'])
          and all(row['sourceStable'] for row in command['runs']))
    check('integration commands cover every current source file', set(command['files']) == actual)
    bound('integration commands are bound to final source', command['files'])
    for row in command['checks']:
        if row.get('resultArtifacts'):
            bound(row['label']+' separate fresh execution result', row['resultArtifacts'])
    probes = read(prefix+'-root-contracts-results.json')
    check('root new-input contract probes passed', probes['passed'] and all(row['passed'] for row in probes['checks']))
    bound('root contract probes use final source', probes['sourceHashes'])
    numeric = read(prefix+'-numeric-review.json')
    check('all recorded arithmetic recalculations passed', numeric['passed'] and all(row['passed'] for row in numeric['checks']))
    bound('arithmetic records use final pages', numeric['files'])
    baseline = read(prefix+'-baseline.json')
    frame_count = sum(row['svgCount'] for row in baseline['animations'].values())
    copies = sum((root/f'chapters/{ch}.html').read_text().count('<pre') for ch in chapters)
    browser = read(prefix+'-browser-results.json')
    check('real browser passed without page/resource errors', browser['passed'] and not browser['errors'])
    bound('browser used final pages', {f'chapters/{ch}.html': value for ch, value in browser['files'].items()})
    layouts = {(row['chapter'], row['width'], row['theme'], row['locale']) for row in browser['layouts']}
    wanted = {(ch, width, theme, locale) for ch in chapters for width in [320, 390, 768, 1440]
              for theme in ['parchment', 'dracula'] for locale in ['zh', 'en', 'both']}
    check('72 distinct real viewport/theme/language layouts', len(browser['layouts']) == 72 and layouts == wanted)
    check('all original frames visited at two widths and two themes', sum(row['frameVisits'] for row in browser['layouts']) == frame_count*4)
    check('all page code copied and chapter interactions passed', len(browser['interactions']) == 3
          and sum(row['copied'] for row in browser['interactions']) == copies
          and all(all(row[k] for k in ['keyboard', 'playback', 'flashcards', 'progress', 'settings']) for row in browser['interactions']))
    check('default and expanded pages fit their actual viewports', all(row['width'] == row['scrollWidth'] == row['expanded']['scrollWidth'] for row in browser['layouts']))
    check('all flashcards use the shared grid', all(row['flashcards']['inGrid'] and row['flashcards']['count'] for row in browser['layouts']))
    geometry = read(prefix+'-geometry-after.json')
    check('every retained frame geometrically triaged', sum(len(row['frames']) for row in geometry['chapters'].values()) == frame_count)
    for ch, item in geometry['chapters'].items():
        bound(ch+' geometry uses final page', {f'chapters/{ch}.html': item['sha256']})
        check(ch+' no numeric, clipping, node or boundary crossing candidates',
              all(not frame[k] for frame in item['frames'] for k in ['invalidNumbers', 'clipped', 'nodeCrossings', 'boundaryCrossings']))
    contacts = read(prefix+'-contact-after.json')
    check('six two-theme contact sheets exist', len(contacts['sheets']) == 6 and all((root/p).is_file() for p in contacts['sheets']))
    bound('contact sheets use final pages', contacts['files'])
    frames = read(prefix+'-frames.json')
    bound('changed-deck all-frame sheets use final pages', frames['files'])
    check('all changed-deck two-theme images exist', all((root/p).is_file() for decks in frames['chapters'].values() for deck in decks for p in deck['sheets']))
    viewed = read(prefix+'-root-visual-review.json')
    bound('images actually viewed by root remain byte-identical after code-only repairs', viewed['files'])
    scope = read(prefix+'-scope-results.json')
    check('previous and out-of-scope work was preserved', scope['passed'] and not scope['unexpected'] and not scope['missing'])
    bound('scope inventory is current', {f'chapters/{ch}.html': row['sha256'] for ch, row in scope['inventory'].items()})
    check('all original frame and title/description IDs retained', sum(row['frames'] for row in scope['inventory'].values()) == frame_count
          and all(row['framesPreserved'] and row['idsPreserved'] and row['descIdsPreserved'] for row in scope['inventory'].values()))
    for name in ['tools/validation.mjs', 'tools/validation.test.mjs']:
        bound(name+' unchanged since the 17 precheck regressions', {name: baseline['files'][name]})
    for ch in chapters:
        expected_sources = {name for name in actual if name == f'chapters/{ch}.html' or name.startswith(f'examples/{ch}/')}
        author = read(ch+'-final-hashes.json')['files']
        check(ch+' author final source set is complete', set(author) == expected_sources)
        bound(ch+' author source hashes are final', author)
        combined = root/f'docs/reviews/{ch}-independent-source-hashes.json'
        reviewed = read(ch+'-independent-source-hashes.json')['after'] if combined.exists() else read(ch+'-independent-source-hashes.json.after')['files']
        check(ch+' independent final source set is complete', set(reviewed) == expected_sources)
        bound(ch+' independent reviewed source is current', reviewed)
        page_hash = sha((root/f'chapters/{ch}.html').read_bytes())
        report = (root/f'docs/reviews/{ch}-independent-review.md').read_text()
        check(ch+' independent report names the final page hash', page_hash in report)
    passed = True
except BaseException as error:
    passed = False
    failure = repr(error)

result = dict(at=datetime.now(timezone.utc).isoformat(), passed=passed, checks=checks)
if not passed:
    result['failure'] = failure
(root/'docs/reviews'/f'{prefix}-evidence-consistency.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(dict(passed=passed, checks=len(checks), failure=result.get('failure'))))
sys.exit(0 if passed else 1)
