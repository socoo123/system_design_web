from pathlib import Path
import hashlib
import json
import re
ROOT=Path(__file__).resolve().parents[2]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
read=lambda name:json.loads((ROOT/'docs/reviews'/name).read_text())
record=read('ch25-independent-source-hashes.json')
manifest=read('ch25-final-hashes.json')['files']
after={p:sha(ROOT/p) for p in manifest}
assert after==manifest
archive=ROOT/'docs/reviews/ch25-tolerance-before'
assert all(sha(archive/p)==h for p,h in record['before'].items())
html=(ROOT/'chapters/ch25.html').read_text()
old=(archive/'chapters/ch25.html').read_text()
svg=lambda s:re.findall(r'<svg\b[\s\S]*?</svg>',s)
assert svg(html)==svg(old)
record['after']=after
record['authorRepair']={'reason':'independent P1: normal/recovery misfire tolerance mismatch',
 'changedFiles':[p for p in after if record['before'][p]!=after[p]],
 'initialFailure':'ch25-independent-initial-probe-results.json',
 'finalRecheck':'ch25-independent-final-probe-results.json',
 'reviewerWroteTargetSources':False}
(ROOT/'docs/reviews/ch25-independent-source-hashes.json').write_text(json.dumps(record,indent=2)+'\n')
check=[]
def expect(name,value):
 check.append(dict(name=name,passed=bool(value)))
 if not value:raise AssertionError(name)
final=after['chapters/ch25.html']
probe=read('ch25-independent-final-probe-results.json')
expect('66 independent inputs on final model',probe['passed'] and len(probe['checks'])==66 and probe['source']==after['examples/ch25/model.py'])
browser=read('ch25-independent-browser-final-results.json')
expect('final browser source binding',browser['passed'] and browser['files']['ch25']==final and len(browser['layouts'])==12 and browser['interactions'][0]['copied']==6)
expect('124 actual frame visits',sum(x['frameVisits'] for x in browser['layouts'])==124)
frames=read('ch25-independent-after-render-results.json')
expect('62 final renders',frames['sha256']==final and len(frames['frames'])==62)
geometry=read('ch25-independent-geometry-results.json')
expect('geometry source binding and measured gaps',geometry['passed'] and geometry['sha256']==final and all(x['leftGap']>14 and x['rightGap']>14 for x in geometry['d5CommitGaps']))
static=read('ch25-independent-static-results.json')
expect('static inventory and six snippet source binding',static['passed'] and static['sha256']==final)
author=read('ch25-independent-author-final-results.json')
expect('108 author checks rerun separately on same source',author['passed'] and author['count']==108 and author['files']=={p:h for p,h in after.items() if p.startswith('examples/ch25/')})
expect('31 SVGs unchanged by P1 repair',len(svg(html))==31 and svg(html)==svg(old))
expect('complete before/after 11 source dictionaries',len(record['before'])==len(record['after'])==11)
output=dict(passed=all(c['passed'] for c in check),sha256=final,checks=check,sourceAfter=after,
 findings=[dict(id='P1-misfire-tolerance',status='closed',initial='ch25-independent-initial-probe-results.json',final='ch25-independent-final-probe-results.json')],
 scope='Reviewer wrote only ch25-independent* evidence and screenshot files; author repaired target sources.')
(ROOT/'docs/reviews/ch25-independent-final-results.json').write_text(json.dumps(output,indent=2)+'\n')
print(json.dumps(dict(passed=output['passed'],checks=len(check),changedFiles=record['authorRepair']['changedFiles'],sha256=final)))
