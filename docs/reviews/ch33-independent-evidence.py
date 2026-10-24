from pathlib import Path
import hashlib,json,os,re,subprocess

root=Path(__file__).resolve().parents[2]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
path=root/'docs/reviews/ch33-independent-source-hashes.json'
state=json.loads(path.read_text())
state['after']={name:sha(root/name) for name in state['before']}
state['unchanged']=state['before']==state['after']
path.write_text(json.dumps(state,indent=2)+'\n')
assert state['unchanged']
html=root/'chapters/ch33.html';source=html.read_text()
baseline=(root/'docs/reviews/ch31-ch32-ch33-baseline/ch33.html').read_text()
ids=lambda s:re.findall(r'id="(d\d+s\d+[td])"',s)
assert ids(source)==ids(baseline)
commands=[['node','examples/ch33/sync.mjs','--check'],['node','tools/audit-chapter.mjs','ch33'],
          ['node','tools/check.mjs'],['git','diff','--check'],['node','--check','docs/reviews/ch33-independent-browser.mjs']]
results=[]
for command in commands:
    r=subprocess.run(command,cwd=root,capture_output=True,text=True,env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'})
    results.append({'command':command,'exit_code':r.returncode,'stdout':r.stdout,'stderr':r.stderr})
    assert r.returncode==0,(command,r.stdout,r.stderr)
probe=json.loads((root/'docs/reviews/ch33-independent-probe-results.json').read_text())
browser=json.loads((root/'docs/reviews/ch33-independent-browser-results.json').read_text())
author=json.loads((root/'docs/reviews/ch33-independent-author-rerun.json').read_text())
assert probe['passed'] and author['passed'] and browser['passed']
assert probe['source_sha256']==sha(root/'examples/ch33/model.py')
assert browser['files']['ch33']==sha(html)
base=root/'docs/reviews/screenshots'
images=[base/'ch33-independent-frames/changed-frames'/f'ch33-{theme}-d{d}-all.png' for d in range(1,7) for theme in ['parchment','dracula']]
images += [base/'ch33-independent-browser/390-en-both-contact.png']
images += [base/'ch33-independent-browser'/f'1440-{theme}-{locale}-top.png' for theme in ['parchment','dracula'] for locale in ['en','both']]
images += [base/'ch33-independent-browser'/f'ch33-390-{theme}-code.png' for theme in ['parchment','dracula']]
images += [base/'ch33-independent-browser'/f'd{d}s{s}-{theme}-{pos}.png' for d,s,theme,pos in [(4,6,'parchment','right'),(4,6,'dracula','right'),(5,4,'parchment','middle'),(5,4,'dracula','right')]]
out={'passed':True,'html_sha256':sha(html),'source_hashes_unchanged':state['unchanged'],
     'commands':results,'independent_checks':probe['count'],
     'independent_arithmetic_checks':sum(x['name'].startswith('independent arithmetic') for x in probe['checks']),
     'author_rerun_checks':author['count'],'layouts':len(browser['layouts']),
     'frame_visits':sum(x['frameVisits'] for x in browser['layouts']),
     'copied':browser['interactions'][0]['copied'],'all_animation_ids_preserved':True,
     'actually_viewed_images':{str(p.relative_to(root)):sha(p) for p in images}}
(root/'docs/reviews/ch33-independent-evidence-results.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({k:v for k,v in out.items() if k not in ['commands','actually_viewed_images']}))
