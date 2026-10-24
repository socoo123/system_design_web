from pathlib import Path
import hashlib,json,re
R=Path(__file__).resolve().parents[2];sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
p=R/'docs/reviews/ch29-independent-source-hashes.json';d=json.loads(p.read_text())
after={str(x.relative_to(R)):sha(x) for x in [R/'chapters/ch29.html',*(R/'examples/ch29').rglob('*')] if x.is_file()}
d['after']=after;d['added']=sorted(set(after)-set(d['before']));d['changed']=sorted(k for k in d['before'] if after.get(k)!=d['before'][k]);p.write_text(json.dumps(d,indent=2)+'\n')
checks=[]
def check(label,b):
 if not b:raise AssertionError(label)
 checks.append(label)
current=(R/'chapters/ch29.html').read_text();old=(R/'docs/reviews/ch29-independent-pre-label.html').read_text()
htmlhash=after['chapters/ch29.html']
check('final hash explicitly frozen',htmlhash=='3c9b62a786f7f89a9836b1c77d21df75d8b50696ba32cd86489eec839fc3f499')
check('before dictionary includes initial whole page and all8 examples',len(d['before'])==9 and d['before']['chapters/ch29.html']=='8c822c41ac361dc2fc88de47fc28cc5c8f0f8a7429397e3254fcbaccb4939916')
check('after dictionary covers page and all11 example files',len(after)==12)
check('only final change is one code language header',old.replace('data-language="Pseudocode · terminal rejection and quota settlement"','data-language="Pseudocode · durable rejection"',1)==current)
check('pre-label archived page matches tested browser',sha(R/'docs/reviews/ch29-independent-pre-label.html')=='91eb053b7f9ef0d49a9928636bbfa0baca5d151739feea70484d36a717bd319e')
probe=json.loads((R/'docs/reviews/ch29-independent-probe-results.json').read_text())
check('83 independentJava actual assertions',probe['passed'] and probe['independentJava']['independentJavaAssertions']==83)
check('unchanged testedJava/attempt source reused across quota/title fixes',all(after[k]==probe['sourceHashes'][k] for k in ('examples/ch29/KvLedger.java','examples/ch29/KvLedgerCheck.java','examples/ch29/attempt.pseudo')))
q=json.loads((R/'docs/reviews/ch29-independent-quota-results.json').read_text())
check('40 independent authored quota checks passed',q['passed'] and q['count']==40)
check('all executable sources match final quota run',all(h==after[k] for k,h in q['sourceHashes'].items() if k!='chapters/ch29.html'))
author=json.loads((R/'docs/reviews/ch29-independent-author-quota-results.json').read_text())
check('author53 rerun independently retained',author['passed'] and author['count']==53 and all(sha(R/'examples/ch29'/k)==v for k,v in author['source_sha256'].items()))
b=json.loads((R/'docs/reviews/ch29-independent-browser-results.json').read_text())
check('12 real tested layouts bind pre-label version',b['passed'] and len(b['layouts'])==12 and b['files']['ch29']==sha(R/'docs/reviews/ch29-independent-pre-label.html'))
check('real viewport and details have no page overflow',all(x['width']==x['scrollWidth']==x['expanded']['scrollWidth'] for x in b['layouts']))
check('124 frame visits seven exact copies',sum(x['frameVisits'] for x in b['layouts'])==124 and b['interactions'][0]['copied']==7 and not b['errors'])
u=json.loads((R/'docs/reviews/ch29-independent-final-ui-results.json').read_text())
check('final label four affected layouts bound finalhash',u['passed'] and u['htmlSHA256']==htmlhash and len(u['views'])==4)
check('Copy stays one line and page width correct',all(x['width']==x['pageWidth'] and x['copyButton']['height']<=x['copyButton']['lineHeight']+20 for x in u['views']))
svg=lambda s:re.findall(r'<svg\b[\s\S]*?</svg>',s)
initial=(R/'docs/reviews/ch29-quota-before/ch29.html').read_text()
check('initial frozen page archive matches beforehash',sha(R/'docs/reviews/ch29-quota-before/ch29.html')==d['before']['chapters/ch29.html'])
check('all31 SVGs unchanged across quota/title repairs',len(svg(current))==31 and svg(current)==svg(initial))
check('seven sharedsource pre bodies unchanged by label fix',re.findall(r'<pre\b[^>]*><code>([\s\S]*?)</code></pre>',old)==re.findall(r'<pre\b[^>]*><code>([\s\S]*?)</code></pre>',current))
viewed=[R/f'docs/reviews/screenshots/ch29-independent-browser/contact-{kind}-d{deck}-{theme}.png' for theme in ('parchment','dracula') for deck in (1,3) for kind in ('page','phone')]
viewed += [R/f'docs/reviews/screenshots/ch29-independent-browser/reject-{w}-{t}.png' for w in (390,1440) for t in ('parchment','dracula')]
viewed += [R/'docs/reviews/screenshots/ch29-independent-browser/pre-label-reject-390-dracula.png']
check('13 actually viewed diagrams/code images retained',len(viewed)==13 and all(x.exists() for x in viewed))
out={'passed':len(checks),'failed':0,'finalHTMLSHA256':htmlhash,'checks':checks,'viewedImageHashes':{str(x.relative_to(R)):sha(x) for x in viewed},'reuseNote':'12 layouts/124 frame visits passed on91eb; final HTML differs only in one short code title. Final4 affected code layouts checked after3c9. All Java and model source reuse is hash verified.'}
(R/'docs/reviews/ch29-independent-evidence-results.json').write_text(json.dumps(out,indent=2)+'\n')
f=json.loads((R/'docs/reviews/ch29-independent-findings-final.json').read_text());f['finalHTMLSHA256']=htmlhash;f['P2']=[{'status':'closed','location':'admission.pseudo totals','resolution':'queued_total and active_total explicitly derive from queue/tenant sums'},{'status':'closed','location':'reject code title at390pxEN','initialEvidence':'screenshots/ch29-independent-browser/pre-label-reject-390-dracula.png','resolution':'author shortened data-language only; final4 affected layouts and exact one-attribute diff passed'}]
(R/'docs/reviews/ch29-independent-findings-final.json').write_text(json.dumps(f,indent=2)+'\n')
print(json.dumps({'passed':len(checks),'failed':0,'finalHTMLSHA256':htmlhash}))
