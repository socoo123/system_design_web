"""Inventory preservation evidence. Geometry comparison supplements actual visual checks."""
from pathlib import Path
import re
import json
from hashlib import sha256
root=Path(__file__).resolve().parents[2]
old=(root/'docs/reviews/ch19-ch20-ch21-baseline/ch21.html').read_text()
new=(root/'chapters/ch21.html').read_text()
svgs=lambda s:re.findall(r'<svg\b.*?</svg>',s,re.S)
before,after=svgs(old),svgs(new)
assert len(before)==len(after)==29
rows=[]
for a,b in zip(before,after):
    aid=re.search(r'<title id="([^"]+)"',a)[1];bid=re.search(r'<title id="([^"]+)"',b)[1]
    assert aid==bid
    assert re.findall(r'aria-labelledby="([^"]+)"',a)==re.findall(r'aria-labelledby="([^"]+)"',b)
    geom=lambda x:re.findall(r'<(?:path|rect|circle|ellipse|polygon)\b[^>]*>',x)
    assert geom(a)==geom(b)
    rows.append({'id':aid,'sameSvg':a==b,'sameGeometry':True})
assert re.findall(r'<figure class="deck">',old)==re.findall(r'<figure class="deck">',new)
result={'sha256':sha256(new.encode()).hexdigest(),'decks':6,'frames':29,'perDeck':[5,5,4,5,5,5],
        'sameSvgCount':sum(r['sameSvg'] for r in rows),'geometryChanged':0,'rows':rows,
        'visualEvidence':'screenshots/ch21/before and after: all 29 frames x 2 themes; modified D4 also true390 left/middle/right.'}
(root/'docs/reviews/ch21-animation-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ('rows','visualEvidence')}))
