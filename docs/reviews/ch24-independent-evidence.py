from pathlib import Path
import hashlib,json,re,subprocess
root=Path(__file__).resolve().parents[2]
checks=[]
def check(name,value):
    if not value:raise AssertionError(name)
    checks.append({'name':name,'passed':True})
hashes=json.loads((root/'docs/reviews/ch24-independent-source-hashes.json').read_text())
freeze=json.loads((root/'docs/reviews/ch22-ch23-ch24-freeze.json').read_text())['files']
after=hashes['after'];page_sha=after['chapters/ch24.html']
check('initial and final complete fourteen-file mappings',len(hashes['before'])==len(after)==14)
for filename,sha in after.items():
    check('source stable '+filename,hashlib.sha256((root/filename).read_bytes()).hexdigest()==sha)
    check('batch freeze agrees '+filename,freeze[filename]==sha)
check('two authorized original-author revisions retained',len(hashes['author_authorized_revisions'])==2 and hashes['reviewer_modified_target_sources'] is False)
model=json.loads((root/'docs/reviews/ch24-independent-model-results.json').read_text())
check('67 independent probes passed',model['passed'] and model['count']==67 and all(c['passed'] for c in model['checks']))
check('model uses exact final fourteen sources',model['source_hashes_before']==after==model['source_hashes_after'] and model['unchanged_during_run'])
browser=json.loads((root/'docs/reviews/ch24-independent-browser-results.json').read_text())
check('final browser source exact',browser['startedSha256']==browser['endedSha256']==page_sha and all(l['servedSha256']==page_sha for l in browser['layouts']))
check('12 layouts / 120 frame visits / no browser errors',browser['passed'] and len(browser['layouts'])==12 and sum(l['visited'] for l in browser['layouts'])==120 and not browser['errors'])
check('actual widths and expanded content stay within viewport',all(l['width']==l['scrollWidth']==l['expandedScrollWidth'] for l in browser['layouts']))
check('8 code copies and interactions',browser['interactions']['copied']==8 and all(browser['interactions'].values()))
check('60 rendered frames bind final page',len(browser['frames'])==60 and all(f['sourceSha256']==page_sha for f in browser['frames']))
animation=json.loads((root/'docs/reviews/ch24-independent-animation-results.json').read_text())
check('original thirty frames and IDs preserved',animation['sha256']==page_sha and animation['all_ids_and_order_retained'] and animation['final_frames']==animation['original_frames']==30)
check('only intended timeout geometry changed',animation['geometry_changed']==['d5s4t','d5s5t'] and animation['local_timer_ends_on_worker'] and animation['old_psp_timeout_route_absent'])
for theme in ['parchment','dracula']:
    for deck in [2,4,5]:
        for frame in range(1,6):
            for position in ['left','middle','right']:
                check(f'actual390 screenshot D{deck}F{frame} {theme} {position}',(root/f'docs/reviews/screenshots/ch24-independent/d{deck}s{frame}-{theme}-{position}.png').exists())
findings=json.loads((root/'docs/reviews/ch24-independent-initial-findings.json').read_text())
check('all two P1 and two P2 independently closed',len(findings['findings'])==4 and all(f['status']=='closed' for f in findings['findings']))
commands=[['node','examples/ch24/sync.mjs','--check'],['node','tools/audit-chapter.mjs','ch24'],['node','--check','docs/reviews/ch24-independent-browser.mjs'],['git','diff','--check','--','chapters/ch24.html','examples/ch24']]
logs=[]
for command in commands:
    result=subprocess.run(command,cwd=root,capture_output=True,text=True)
    check('command '+' '.join(command),result.returncode==0)
    logs.append('$ '+' '.join(command)+'\n'+result.stdout+result.stderr)
(root/'docs/reviews/ch24-independent-checks.txt').write_text('\n'.join(logs))
(root/'docs/reviews/ch24-independent-results.json').write_text(json.dumps({'passed':True,'page_sha256':page_sha,'checks':checks,'count':len(checks)},indent=2)+'\n')
print(f'{len(checks)} final independent source/evidence checks passed')
