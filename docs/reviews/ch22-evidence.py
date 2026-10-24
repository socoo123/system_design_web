from pathlib import Path
import hashlib,json,re,subprocess
root=Path(__file__).resolve().parents[2]
checks=[]
def check(name,value):
    if not value:raise AssertionError(name)
    checks.append({'name':name,'passed':True})
def digest(path):return hashlib.sha256((root/path).read_bytes()).hexdigest()
h=(root/'chapters/ch22.html').read_text()
frozen=json.loads((root/'docs/reviews/ch22-final-hashes.json').read_text())
for name,sha in frozen['files'].items():check('frozen '+name,digest(name)==sha)
before=json.loads((root/'docs/reviews/ch22-animation-before.json').read_text())
decks=[]
for d,match in enumerate(re.finditer(r'<figure class="deck">([\s\S]*?)</figure>',h),1):
    slides=[]
    for f,svg in enumerate(re.findall(r'<svg\b[\s\S]*?</svg>',match[1]),1):
        slides.append({'frame':f,'title':re.search(r'<title[^>]*>([^<]+)',svg)[1],
            'ids':re.findall(r'\bid="([^"]+)"',svg),'sha256':hashlib.sha256(svg.encode()).hexdigest()})
    decks.append({'deck':d,'slides':slides})
check('6 groups / 30 original frames retained',[len(d['slides']) for d in decks]==[5]*6)
check('all original frame/title/desc IDs retained',[[s['ids'] for s in d['slides']] for d in decks]==[[s['ids'] for s in d['slides']] for d in before['decks']])
changes=[f'D{i+1}F{j+1}' for i,d in enumerate(decks) for j,s in enumerate(d['slides']) if s['sha256']!=before['decks'][i]['slides'][j]['sha256']]
(root/'docs/reviews/ch22-animation-after.json').write_text(json.dumps({'sha256':digest('chapters/ch22.html'),'decks':decks,'changes':changes,'inventoryRetained':True,'unchangedFrames':30-len(changes)},indent=2)+'\n')
browser=json.loads((root/'docs/reviews/ch22-browser-results.json').read_text())
check('final HTML bound to browser run',browser['files']['ch22']==digest('chapters/ch22.html'))
check('12 actual browser combinations',browser['passed'] and len(browser['layouts'])==12 and not browser['errors'])
check('120 frame visits',sum(r['frameVisits'] for r in browser['layouts'])==120)
check('real 390/1440 viewport and no page overflow',all(r['width']==r['scrollWidth'] and r['expanded']['scrollWidth']==r['width'] for r in browser['layouts']))
check('15 flashcards use live shared grid',all(r['flashcards']['count']==15 and r['flashcards']['inGrid'] for r in browser['layouts']))
check('copy all four source blocks',browser['interactions'][0]['copied']==4)
render=json.loads((root/'docs/reviews/ch22-after-render-results.json').read_text())
check('final HTML bound to 60 rendered frames',render['sha256']==digest('chapters/ch22.html') and len(render['frames'])==60)
code=json.loads((root/'docs/reviews/ch22-code-results.json').read_text())
check('62 SQLite checks executed',code['passed'] and code['count']==62 and all(c['passed'] for c in code['checks']))
for filename,sha in code['source_hashes'].items():
    path=Path(filename);path=path if path.is_absolute() else root/path
    check('code-result source '+path.name,hashlib.sha256(path.read_bytes()).hexdigest()==sha)
java=json.loads((root/'docs/reviews/ch22-java-results.json').read_text())
check('19 Java checks, release17/JDK21 recorded',java['checks']==19 and java['release']==17 and java['run_exit']==0 and '21.0.2' in java['runtime'])
for filename,sha in java['source_hashes'].items():check('Java source '+filename,digest('examples/ch22/'+filename)==sha)
check('no local compiled cache',not (root/'examples/ch22/__pycache__').exists())
commands=[['node','tools/audit-chapter.mjs','ch22'],['node','examples/ch22/sync.mjs','--check'],['node','--check','examples/ch22/sync.mjs'],['node','--check','docs/reviews/ch22-browser.mjs'],['node','--check','docs/reviews/ch22-render.mjs'],['git','diff','--check','--','chapters/ch22.html','examples/ch22']]
logs=[]
for command in commands:
    run=subprocess.run(command,cwd=root,capture_output=True,text=True)
    check('command '+' '.join(command),run.returncode==0)
    logs.append('$ '+' '.join(command)+'\n'+run.stdout+run.stderr)
(root/'docs/reviews/ch22-checks.txt').write_text('\n'.join(logs))
(root/'docs/reviews/ch22-evidence-results.json').write_text(json.dumps({'sha256':digest('chapters/ch22.html'),'passed':True,'checks':checks,'count':len(checks),'changedFrames':changes},indent=2)+'\n')
print(f'{len(checks)} final source/evidence checks passed')
