from pathlib import Path
import hashlib
import json
import os
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
os.chdir(ROOT)
digest = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()
commands = [
    ['node','examples/ch33/sync.mjs','--check'],
    ['node','tools/audit-chapter.mjs','ch33'],
    ['node','tools/check.mjs'],
    ['node','--check','examples/ch33/sync.mjs'],
    ['git','diff','--check'],
]
results = []
for command in commands:
    run = subprocess.run(command, text=True, capture_output=True)
    results.append({'command':command,'exit_code':run.returncode,'stdout':run.stdout,'stderr':run.stderr})

page = Path('chapters/ch33.html').read_text()
before = Path('docs/reviews/ch31-ch32-ch33-baseline/ch33.html').read_text()
svgs = re.findall(r'<svg\b.*?</svg>', page, re.S)
old_svgs = re.findall(r'<svg\b.*?</svg>', before, re.S)
ids = lambda text: re.findall(r'<(?:title|desc) id="([^"]+)"', text)
modified = [re.search(r'<title id="([^"]+)"', new)[1][:-1] for new, old in zip(svgs, old_svgs) if new != old]
source_files = [Path('chapters/ch33.html'), *sorted(Path('examples/ch33').iterdir())]
hashes = {str(path):digest(path) for path in source_files if path.is_file()}
code = json.loads(Path('docs/reviews/ch33-code-results.json').read_text())
browser = json.loads(Path('docs/reviews/ch33-browser-results.json').read_text())
render = json.loads(Path('docs/reviews/ch33-after-render-results.json').read_text())

viewed = [f'docs/reviews/screenshots/ch33-after/contact-d{deck}-{theme}.png'
          for deck in range(1,7) for theme in ['parchment','dracula']]
viewed += ['docs/reviews/screenshots/ch31-ch32-ch33-root/before/ch33-parchment-contact.png',
           'docs/reviews/screenshots/ch31-ch32-ch33-root/before/ch33-dracula-contact.png']
viewed += ['docs/reviews/screenshots/ch33-browser/'+name for name in [
    '390-parchment-en-top.png','390-dracula-both-top.png','ch33-390-parchment-code.png',
    'ch33-1440-dracula-code.png','d4s6-parchment-left.png','d4s6-parchment-right.png',
    'd5s6-dracula-right.png','d6s5-dracula-right.png']]

checks = {
    'commands_pass':all(result['exit_code'] == 0 for result in results),
    'all_ids_and_order_preserved':ids(page) == ids(before),
    '32_frames_preserved':len(svgs) == len(old_svgs) == 32,
    'six_decks_preserved':page.count('<figure class="deck">') == 6,
    'three_code_contracts':page.count('<pre ') == 3,
    'code_cases_pass':code['passed'] and all(item['passed'] for item in code['checks']),
    'code_report_hashes_match':all(digest(path) == sha for path,sha in code['hashes'].items()),
    'final_browser_hash':browser['files']['ch33'] == hashes['chapters/ch33.html'],
    'browser_pass':browser['passed'] and len(browser['layouts']) == 24 and not browser['errors'],
    'real_320_and_390':all(row['width'] == row['scrollWidth'] and row['expanded']['scrollWidth'] == row['width'] for row in browser['layouts']),
    'final_render_hash':render['sha256'] == hashes['chapters/ch33.html'],
    'all_frames_both_themes_rendered':len(render['frames']) == 64,
    'viewed_images_exist':all(Path(path).is_file() for path in viewed),
}
report = {'passed':all(checks.values()),'checks':checks,'commands':results,'source_hashes':hashes,
          'animation':{'decks':6,'frames':32,'unchanged_svg':32-len(modified),'modified_svg':modified,'deleted':[]},
          'code_checks':code['count'],'numeric_checks':sum(item.get('name','').startswith('numeric ') for item in code['checks']),
          'browser':{'layouts':len(browser['layouts']),'frame_visits':sum(row['frameVisits'] for row in browser['layouts']),'interactions':browser['interactions']},
          'actual_visual_review':[{'path':path,'sha256':digest(path)} for path in viewed],
          'limitations':['Local SQLite fixtures only; no MCP/real remote tooling','No production load/replication/remote cancellation termination experiment','Author self-check; independent review and root acceptance separate']}
Path('docs/reviews/ch33-evidence-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
Path('docs/reviews/ch33-final-hashes.json').write_text(json.dumps(hashes, indent=2)+'\n')
print(json.dumps({'passed':report['passed'],'checks':checks,'code':code['count'],'layouts':len(browser['layouts']),'modified_svg':len(modified)}))
assert report['passed']
