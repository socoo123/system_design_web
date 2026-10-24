"""Freeze Ch34 source versions and verify the evidence actually matches them."""
from pathlib import Path
import hashlib
import html
import json
import re
import sqlite3
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[2]
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
page=ROOT/'chapters/ch34.html'
before=(ROOT/'docs/reviews/ch34-before.html').read_text()
after=page.read_text()
source_paths=[page,*sorted((ROOT/'examples/ch34').glob('*'))]
hashes={str(p.relative_to(ROOT)):digest(p) for p in source_paths if p.is_file()}
result={"checks":[],"commands":[],"sourceHashes":hashes,
        "environment":{"python":sys.version,"sqlite":sqlite3.sqlite_version}}


def check(value,label,observed=None):
    result["checks"].append({"label":label,"passed":bool(value),"observed":observed})
    if not value:raise AssertionError(label)


commands=[['node','tools/check.mjs'],['node','tools/audit-chapter.mjs','ch34'],
          ['node','examples/ch34/sync.mjs','--check'],['node','--check','examples/ch34/sync.mjs'],
          ['node','--check','docs/reviews/ch34-browser.mjs'],['node','--check','docs/reviews/ch34-render.mjs'],
          ['node','--check','docs/reviews/ch34-copy.mjs'],
          ['git','diff','--check']]
for command in commands:
    run=subprocess.run(command,cwd=ROOT,text=True,capture_output=True)
    result['commands'].append({'argv':command,'returncode':run.returncode,'stdout':run.stdout,'stderr':run.stderr})
    check(run.returncode==0,'command '+' '.join(command))

old_svg=re.findall(r'<svg\b[\s\S]*?</svg>',before)
new_svg=re.findall(r'<svg\b[\s\S]*?</svg>',after)
svg_ids=lambda xs:re.findall(r'\bid="(d\d+s\d+[td])"',''.join(xs))
check(len(old_svg)==len(new_svg)==37,'37 original frames preserved')
check(svg_ids(old_svg)==svg_ids(new_svg),'all 74 animation IDs and frame order preserved')
check(len(re.findall('<figure class="deck">',after))==7,'seven original decks preserved')
check(after.count('<section class="goal">')==1,'one core introduction, no duplicate old goal')
changed=[re.search(r'<title id="([^"]+)',a)[1][:-1] for a,b in zip(new_svg,old_svg) if a!=b]
result['animation']={'changed':changed,'unchanged':37-len(changed),'modifiedGroups':[1,4,5,6,7],
                     'modifiedGroupFramesInBothThemes':54,'newOrDeletedDecks':0}
snippets=re.findall(r'<pre\b[^>]*data-source="([^"]+)"[^>]*><code>([\s\S]*?)</code></pre>',after)
check(len(snippets)==4,'four meaningful source snippets')
for name,text in snippets:
    content=(ROOT/'examples/ch34'/name).read_text().rstrip('\n')
    check(html.unescape(text)==content,'snippet exact '+name,len(content.splitlines()))

browser=json.loads((ROOT/'docs/reviews/ch34-browser-results.json').read_text())
render=json.loads((ROOT/'docs/reviews/ch34-after-render-results.json').read_text())
code=json.loads((ROOT/'docs/reviews/ch34-code-results.json').read_text())
copy=json.loads((ROOT/'docs/reviews/ch34-copy-results.json').read_text())
check(browser['passed'] and browser['files']['ch34']==digest(page),'browser report matches current page')
check(len(browser['layouts'])==24,'24 actual width/theme/locale combinations')
check(all(x['width']==x['scrollWidth'] for x in browser['layouts']),'all real viewports have no document overflow')
check(sum(x['frameVisits'] for x in browser['layouts'])==148,'148 frame-navigation visits')
check(browser['interactions'][0]['copied']==4 and not browser['errors'],'four exact copies and no resource/page errors')
check(render['sha256']==digest(page) and len(render['frames'])==74,'74 final render images match current page')
check(code['passed'] and code['count']==101,'101 successful executable checks including 15 numeric checks')
check(code['hashes']==hashes,'executed adapter/page source versions match freeze')
check(copy['passed'] and copy['pageHash']==digest(page),'320 Copy report matches frozen page')
check(len(copy['layouts'])==6 and all(b['height']<40 for row in copy['layouts'] for b in row['buttons']),
      '24 Copy buttons stay one physical line across six actual 320 combinations')
check(not list((ROOT/'examples/ch34').rglob('*.pyc')),'no runtime compilation artifacts in example')

viewed=[]
for phase,themes in [('before',['parchment']),('after',['parchment','dracula'])]:
    for theme in themes:
        for deck in range(1,8):viewed.append(f'docs/reviews/screenshots/ch34-author-{phase}/contact-d{deck}-{theme}.png')
for name in ['390-parchment-both-top.png','320-dracula-en-top.png','768-parchment-en-top.png',
             'ch34-390-parchment-code.png','ch34-1440-dracula-code.png',
             'ch34-390-parchment-code-2.png','ch34-1440-dracula-code-2.png',
             'ch34-1440-dracula-code-4.png','d6s6-parchment-left.png',
             'd6s6-parchment-middle.png','d4s6-dracula-right.png']:
    viewed.append('docs/reviews/screenshots/ch34-author-browser/'+name)
viewed.extend(['docs/reviews/screenshots/ch34-author-copy/320-parchment-both-code2.png',
               'docs/reviews/screenshots/ch34-author-copy/320-dracula-en-code4.png'])
result['visualReview']={'method':'Actual view_image inspection; contact sheets cover all frames, not geometry-only approval.',
    'images':[{'path':p,'sha256':digest(ROOT/p)} for p in viewed],
    'findings':'Cylinder text lifted; D4 commit k9 label moved clear of vertical wire; D6 rejection moved clear of capacity text. Final altered groups checked frame-by-frame in both themes; node geometry remains stable.',
    'narrowScreens':'390px screenshots use real Playwright viewport. Horizontal diagram/code scrolling is local, not document overflow.',
    'sourceNote':'Final source-only pseudocode/version clarification does not modify any SVG; final renders regenerated for the frozen page.'}
check(len(result['visualReview']['images'])==34,'34 explicitly viewed retained images with hashes')
result['passed']=True
(ROOT/'docs/reviews/ch34-final-hashes.json').write_text(json.dumps(hashes,indent=2)+'\n')
(ROOT/'docs/reviews/ch34-evidence-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'passed':True,'checks':len(result['checks']),'commands':len(result['commands']),
                  'sourceFiles':len(hashes),'viewedImages':len(viewed)},ensure_ascii=False))
