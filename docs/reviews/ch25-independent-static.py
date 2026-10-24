from pathlib import Path
import hashlib
import html
import json
import re
ROOT=Path(__file__).resolve().parents[2]
p=ROOT/'chapters/ch25.html';text=p.read_text()
old=(ROOT/'docs/reviews/ch25-ch26-ch27-baseline/ch25.html').read_text()
check=[]
def require(name,value):
 check.append(dict(name=name,passed=bool(value)))
 if not value:raise AssertionError(name)
decks=re.findall(r'<figure class="deck">[\s\S]*?</figure>',text)
ids=lambda s:re.findall(r'<title id="([^"]+)"',s)
descs=lambda s:re.findall(r'<desc id="([^"]+)"',s)
require('6 decks and original 31-frame grouping',[len(ids(d)) for d in decks]==[5,5,5,5,5,6])
require('all original title and desc IDs retained',ids(text)==ids(old) and descs(text)==descs(old))
require('14 flashcards in a shared cards-grid',text.count('class="flip"')==14 and 'class="cards-grid"' in text)
sources=re.findall(r'<pre\b[^>]*data-source="([^"]+)"[^>]*><code>([\s\S]*?)</code></pre>',text)
require('six snippets shared with assigned source files',len(sources)==6 and all(html.unescape(code)==(ROOT/'examples/ch25'/file).read_text().rstrip('\n') for file,code in sources))
svgs=lambda s:re.findall(r'<svg\b[\s\S]*?</svg>',s)
changed=[ids(a)[0] for b,a in zip(svgs(old),svgs(text)) if b!=a]
expected=['d2s5t']+[f'd4s{i}t' for i in range(2,6)]+[f'd5s{i}t' for i in range(1,6)]
require('only stated 10 SVG frames changed',changed==expected)
require('no invalid SVG numeric markers',not re.search(r'(?:x|y|d|points|width|height)="[^"]*(?:NaN|undefined|Infinity)',text))
result=dict(passed=all(c['passed'] for c in check),sha256=hashlib.sha256(p.read_bytes()).hexdigest(),checks=check,
            changed=changed,sources=[file for file,_ in sources],slideIds=ids(text))
(ROOT/'docs/reviews/ch25-independent-static-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(dict(passed=result['passed'],checks=len(check),changedFrames=len(changed),sha256=result['sha256'])))
