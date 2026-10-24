"""Verify final source/evidence agreement; technical and visual judgments remain explicit."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import sys

root = Path(__file__).resolve().parents[2]
prefix = 'ch28-ch29-ch30'
chapters = ['ch28', 'ch29', 'ch30']
checks = []
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def read(suffix):
    return json.loads((root / 'docs/reviews' / suffix).read_text())


def check(label, condition):
    checks.append(dict(name=label, passed=bool(condition)))
    assert condition, label


def bound(label, files):
    check(label, bool(files) and all((root / name).is_file() and sha(root / name) == value for name, value in files.items()))


try:
    actual = {str(p.relative_to(root)) for ch in chapters
              for p in [root / f'chapters/{ch}.html', *(root / 'examples' / ch).rglob('*')] if p.is_file()}
    check('no Python/Java build cache delivered in examples', not any(
        name.endswith(('.class', '.pyc')) or '__pycache__' in name for name in actual))
    frozen = read(prefix + '-freeze.json')
    check('freeze covers the complete current page/example set', set(frozen['files']) == actual)
    bound('frozen final source hashes match disk', frozen['files'])
    commands = read(prefix + '-checks.json')
    expected = {'whole-site structure/resources/animation preservation', 'slideshow JavaScript syntax', 'whitespace integrity',
                'root new-input Java contracts', 'root new-input SQLite contracts', 'root independent arithmetic'}
    expected |= {ch + suffix for ch in chapters for suffix in [' chapter audit', ' page/source agreement', ' actual teaching checks']}
    check('all fifteen final integration commands passed on stable source', commands['passed']
          and {r['label'] for r in commands['checks']} == expected
          and all(r['exitCode'] == 0 for r in commands['checks'])
          and commands['runs'][-1]['sourceStable'])
    check('integration source set is complete', set(commands['files']) == actual)
    bound('integration commands use final source', commands['files'])
    for row in commands['checks']:
        if row.get('resultArtifacts'):
            bound(row['label'] + ' fresh execution result remains unchanged', row['resultArtifacts'])
    java = read(prefix + '-root-java-results.json')
    check('new-input Java probes passed', java['passed'] and java['model']['passed'])
    bound('Java probes use current teaching classes', java['sourceHashes'])
    sql = read(prefix + '-root-sql-results.json')
    check('new-input SQLite probes including original manifest counterexample passed', sql['passed'] and all(r['passed'] for r in sql['checks']))
    bound('SQLite probes use current adapters', sql['sourceHashes'])
    numbers = read(prefix + '-numeric-review.json')
    check('independent dimensional recalculations passed', numbers['passed'] and all(r['passed'] for r in numbers['checks']))
    bound('recalculation record is bound to current pages', numbers['sourceFiles'])
    baseline = read(prefix + '-baseline.json')
    frame_count = sum(row['frames'] for row in baseline['chapters'].values())
    copies = sum((root / f'chapters/{ch}.html').read_text().count('<pre') for ch in chapters)
    browser = read(prefix + '-browser-results.json')
    check('real browser passed with no resource/page errors', browser['passed'] and not browser['errors'])
    bound('browser uses final pages', {f'chapters/{ch}.html': value for ch, value in browser['files'].items()})
    wanted = {(ch, width, theme, locale) for ch in chapters for width in [320, 390, 768, 1440]
              for theme in ['parchment', 'dracula'] for locale in ['zh', 'en', 'both']}
    seen = {(r['chapter'], r['width'], r['theme'], r['locale']) for r in browser['layouts']}
    check('72 distinct actual viewport/theme/language combinations', len(browser['layouts']) == 72 and seen == wanted)
    check('all original frames visited at two widths and two themes', sum(r['frameVisits'] for r in browser['layouts']) == frame_count * 4)
    check('every code block copied and chapter interactions passed', len(browser['interactions']) == 3
          and sum(r['copied'] for r in browser['interactions']) == copies
          and all(all(r[k] for k in ['keyboard', 'playback', 'flashcards', 'progress', 'settings']) for r in browser['interactions']))
    check('actual viewport fits default and expanded page', all(r['width'] == r['scrollWidth'] == r['expanded']['scrollWidth'] for r in browser['layouts']))
    check('flashcards use the shared grid', all(r['flashcards']['inGrid'] and r['flashcards']['count'] for r in browser['layouts']))
    geometry = read(prefix + '-geometry-after.json')
    check('all retained frames geometrically triaged', sum(len(r['frames']) for r in geometry['chapters'].values()) == frame_count)
    for ch, item in geometry['chapters'].items():
        bound(ch + ' geometry uses final source', {f'chapters/{ch}.html': item['sha256']})
        check(ch + ' no clipping, numeric, node-crossing or boundary-crossing candidates', all(
            not frame[k] for frame in item['frames'] for k in ['invalidNumbers', 'clipped', 'nodeCrossings', 'boundaryCrossings']))
    contacts = read(prefix + '-contact-after.json')
    bound('final contacts use current pages', contacts['files'])
    check('six final two-theme contact sheets exist', len(contacts['sheets']) == 6 and all((root / p).is_file() for p in contacts['sheets']))
    frames = read(prefix + '-frames.json')
    bound('changed-deck full-frame contact sheets use final pages', frames['files'])
    check('every changed deck has both theme images', all(len(d['sheets']) == 2 and all((root / p).is_file() for p in d['sheets']) for ds in frames['chapters'].values() for d in ds))
    viewed = read(prefix + '-root-visual-review.json')
    bound('images actually viewed remain byte-identical', viewed['files'])
    scope = read(prefix + '-scope-results.json')
    check('prior work and out-of-scope files were preserved', scope['passed'] and not scope['unexpected'] and not scope['missing'])
    bound('scope inventory uses current pages', {f'chapters/{ch}.html': r['sha256'] for ch, r in scope['inventory'].items()})
    check('all original frame/description/title IDs preserved', sum(r['frames'] for r in scope['inventory'].values()) == frame_count
          and all(r['framesPreserved'] and r['idsPreserved'] and r['descIdsPreserved'] for r in scope['inventory'].values()))
    for name in ['tools/validation.mjs', 'tools/validation.test.mjs']:
        bound(name + ' unchanged since 17 precheck regressions', {name: baseline['files'][name]})
    for ch in chapters:
        chapter_files = {name for name in actual if name == f'chapters/{ch}.html' or name.startswith(f'examples/{ch}/')}
        author = read(ch + '-final-hashes.json')
        author = author.get('files', author)
        check(ch + ' author final source set is complete', set(author) == chapter_files)
        bound(ch + ' author final source hashes are current', author)
        reviewed = read(ch + '-independent-source-hashes.json')['after']
        reviewed = reviewed.get('files', reviewed)
        check(ch + ' independent reviewed source set is complete', set(reviewed) == chapter_files)
        bound(ch + ' independent reviewed source is current', reviewed)
        report = (root / f'docs/reviews/{ch}-independent-review.md').read_text()
        check(ch + ' independent report names final HTML hash', sha(root / f'chapters/{ch}.html') in report)
    passed = True
except BaseException as error:
    passed, failure = False, repr(error)
record = dict(at=datetime.now(timezone.utc).isoformat(), passed=passed, checks=checks)
if not passed:
    record['failure'] = failure
(root / f'docs/reviews/{prefix}-evidence-consistency.json').write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(dict(passed=passed, checks=len(checks), failure=record.get('failure'))))
sys.exit(0 if passed else 1)
