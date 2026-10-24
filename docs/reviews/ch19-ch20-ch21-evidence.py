"""Final source/evidence consistency, after independent reports have been read by the root."""
from pathlib import Path
import hashlib,json,re,sys
from datetime import datetime,timezone
root=Path(__file__).resolve().parents[2]
sha=lambda data:hashlib.sha256(data).hexdigest()
read=lambda name:json.loads((root/'docs/reviews'/name).read_text())
checks=[]
def check(name,ok):
 checks.append({'name':name,'passed':bool(ok)})
 if not ok:raise AssertionError(name)
def bound(label,files):
 check(label,all((root/name).is_file() and sha((root/name).read_bytes())==expected for name,expected in files.items()))
try:
 freeze=read('ch19-ch20-ch21-freeze.json')
 bound('current frozen chapter/examples',freeze['files'])
 actual={str(p.relative_to(root)) for ch in ['ch19','ch20','ch21'] for p in [root/f'chapters/{ch}.html',*(root/'examples'/ch).rglob('*')] if p.is_file()}
 check('all current chapter/example files included',actual==set(freeze['files']))
 result=read('ch19-ch20-ch21-checks.json')
 check('all integration commands passed',result['passed'] and len(result['checks'])==12 and all(c['exitCode']==0 for c in result['checks']))
 bound('integration commands bound to current source',result['files'])
 for ch in ['ch19','ch20']:
  code=read(ch+'-code-results.json');check(ch+' author suite passed',code['passed']);bound(ch+' suite source agreement',code['files'])
 check('ch21 actual Redis/SQLite suite passed',read('ch21-code-results.json')['passed'])
 for name in ['ch19-ch20-ch21-root-java-results.json','ch19-ch20-ch21-root-inventory-results.json']:
  proof=read(name);check(name+' passed',proof['passed']);bound(name+' source agreement',proof['sourceHashes'])
 browser=read('ch19-ch20-ch21-browser-results.json')
 check('browser passed without page/resource errors',browser['passed'] and not browser['errors'])
 bound('browser pages current',{f'chapters/{ch}.html':value for ch,value in browser['files'].items()})
 combos={(r['chapter'],r['width'],r['theme'],r['locale']) for r in browser['layouts']}
 expected={(ch,w,t,l) for ch in ['ch19','ch20','ch21'] for w in [320,390,768,1440] for t in ['parchment','dracula'] for l in ['zh','en','both']}
 check('72 unique final browser combinations',len(browser['layouts'])==72 and combos==expected)
 check('352 final frame visits',sum(r['frameVisits'] for r in browser['layouts'])==352)
 check('18 code copies and three interaction suites',len(browser['interactions'])==3 and sum(r['copied'] for r in browser['interactions'])==18)
 geometry=read('ch19-ch20-ch21-geometry-after.json')
 for ch,record in geometry['chapters'].items():
  current=(root/f'chapters/{ch}.html').read_bytes();check(ch+' diagram binding',sha(current)==record['sha256'])
  check(ch+' no invalid geometry/clipping/node crossings',all(not f[k] for f in record['frames'] for k in ['invalidNumbers','boundaryCrossings','clipped','nodeCrossings']))
  if record.get('reusedAfterExactFigureComparison'):
   rendered=(root/record['renderedSource']).read_bytes()
   check(ch+' exact rendered source present',sha(rendered)==record['renderedHtmlSha256'])
   figures=lambda s:re.findall(r'<figure\b[^>]*class="deck"[^>]*>[\s\S]*?</figure>',s.decode())
   check(ch+' all reused figures and captions exact',figures(rendered)==figures(current) and [sha(s.encode()) for s in figures(current)]==record['figureHashes'])
 scope=read('ch19-ch20-ch21-scope-results.json')
 check('baseline scope retained',scope['passed'] and not scope['unexpected'] and not scope['missing'])
 bound('scope inventory current',{f'chapters/{ch}.html':r['sha256'] for ch,r in scope['inventory'].items()})
 check('all 88 frames and IDs retained',sum(r['frames'] for r in scope['inventory'].values())==88 and all(r['idsPreserved'] and r['descIdsPreserved'] and r['framesPreserved'] for r in scope['inventory'].values()))
 for ch in ['ch19','ch20','ch21']:
  review=read(ch+'-independent-source-hashes.json');bound(ch+' independent final source',review['after'])
  check(ch+' independent target set complete',set(review['after'])=={p for p in actual if p==f'chapters/{ch}.html' or p.startswith(f'examples/{ch}/')})
  html_sha=sha((root/f'chapters/{ch}.html').read_bytes())
  for name in [ch+'.md',ch+'-independent-review.md']:
   check(name+' current version documented',html_sha in (root/'docs/reviews'/name).read_text())
 passed=True
except Exception as error:
 passed=False;failure=str(error)
output={'at':datetime.now(timezone.utc).isoformat(),'passed':passed,'checks':checks}
if not passed:output['failure']=failure
(root/'docs/reviews/ch19-ch20-ch21-evidence-consistency.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'passed':passed,'checks':len(checks),'failure':output.get('failure')},ensure_ascii=False))
sys.exit(0 if passed else 1)
