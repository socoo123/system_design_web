from pathlib import Path
import re,html,json,hashlib
page=Path('chapters/ch36.html').read_text()
before=Path('docs/reviews/ch36-before.html').read_text()
checks=[]
for attrs,encoded in re.findall(r'<pre([^>]*)><code>(.*?)</code></pre>',page,re.S):
 source=re.search(r'data-source="([^"]+)"',attrs).group(1)
 file,*marker=source.split(':')
 text=(Path('examples/ch36')/file).read_text()
 if marker:
  text=text.split('# BEGIN '+marker[0]+'\n',1)[1].split('# END '+marker[0],1)[0]
 check=html.unescape(encoded)==text.strip('\n')
 assert check,source
 checks.append({'source':source,'verbatim':check,'lines':len(text.strip('\n').splitlines())})
ids=lambda s:re.findall(r'<(?:title|desc) id="([^"]+)"',s)
assert ids(page)==ids(before)
after_svgs=re.findall(r'<svg.*?</svg>',page,re.S);before_svgs=re.findall(r'<svg.*?</svg>',before,re.S)
changed=[re.search(r'<title id="([^"]+)"',a).group(1).removesuffix('t') for a,b in zip(after_svgs,before_svgs) if a!=b]
result={'passed':True,'snippets':checks,'decks':len(re.findall(r'<figure class="deck">',page)),'frames':len(after_svgs),'idsPreserved':len(ids(page)),'changedFrames':changed}
Path('docs/reviews/ch36-evidence-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
