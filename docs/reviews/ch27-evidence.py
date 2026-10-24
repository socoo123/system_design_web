from pathlib import Path
import hashlib
import html
import json
import re

ROOT=Path(__file__).resolve().parents[2]
page=ROOT/'chapters/ch27.html';s=page.read_text();before=(ROOT/'docs/reviews/ch25-ch26-ch27-baseline/ch27.html').read_text()
checks=[]
def check(name,condition):
    if not condition:raise AssertionError(name)
    checks.append({'name':name,'passed':True})
sha=hashlib.sha256(page.read_bytes()).hexdigest()
def inv(text):
    return [re.findall(r'<title id="([^"]+)"',d) for d in re.findall(r'<figure class="deck">([\s\S]*?)</figure>',text)]
check('six original decks and all 31 title IDs in original order',inv(s)==inv(before) and len(inv(s))==6 and sum(map(len,inv(s)))==31)
check('all original SVG accessibility IDs retained',re.findall(r'<(?:title|desc) id="([^"]+)"',s)==re.findall(r'<(?:title|desc) id="([^"]+)"',before))
oldsvgs=re.findall(r'<svg\b[\s\S]*?</svg>',before);newsvgs=re.findall(r'<svg\b[\s\S]*?</svg>',s)
changed=[re.search(r'<title id="([^"]+)"',b).group(1) for a,b in zip(oldsvgs,newsvgs) if a!=b]
check('only two original SVG frames changed locally',changed==['d4s5t','d5s5t'])
blocks=re.findall(r'<pre\b([^>]*)><code>([\s\S]*?)</code></pre>',s)
check('seven labelled shared-source blocks',len(blocks)==7)
for attrs,code in blocks:
    source=re.search(r'data-source="([^"]+)"',attrs).group(1)
    check(f'same source: {source}',html.unescape(code)==(ROOT/'examples/ch27'/source).read_text().rstrip('\n'))
    check(f'label and English comments: {source}','data-kind=' in attrs and 'data-language=' in attrs and not re.search(r'[\u3400-\u9fff]',html.unescape(code)))
check('balanced bilingual block inventory',len(re.findall('class="lang-zh"',s))==len(re.findall('class="lang-en"',s)))
check('fifteen flashcards use grid',len(re.findall('class="flip"',s))==15 and '<div class="cards-grid">' in s)
check('no build cache or class files retained',not list((ROOT/'examples/ch27').rglob('*.pyc')) and not list((ROOT/'examples/ch27').rglob('*.class')))
code=json.loads((ROOT/'docs/reviews/ch27-code-results.json').read_text())
check('70 executed code checks',code['passed']==70 and code['failed']==0)
for file,recorded in code['files'].items():
    check(f'code evidence bound to source: {file}',hashlib.sha256((ROOT/file).read_bytes()).hexdigest()==recorded)
browser=json.loads((ROOT/'docs/reviews/ch27-browser-results.json').read_text())
check('browser bound to final HTML',browser['files']['ch27']==sha)
check('12 actual viewport/theme/locale combinations',len(browser['layouts'])==12 and all(x['width']==x['scrollWidth'] and x['width'] in (390,1440) for x in browser['layouts']))
check('124 frame visits and seven clipboard copies',sum(x['frameVisits'] for x in browser['layouts'])==124 and browser['interactions'][0]['copied']==7)
check('browser interactions pass without errors',browser['passed'] and not browser['errors'] and all(browser['interactions'][0][x] for x in ('keyboard','playback','flashcards','progress','settings')))
render=json.loads((ROOT/'docs/reviews/ch27-after-render-results.json').read_text())
check('62 final SVG renders bound to HTML',render['sha256']==sha and len(render['frames'])==62)
geometry=json.loads((ROOT/'docs/reviews/ch27-geometry-after.json').read_text())['chapters']['ch27']
check('geometry bound to final HTML',geometry['sha256']==sha)
check('no invalid number clipping boundary or node crossings',all(not x[k] for x in geometry['frames'] for k in ('invalidNumbers','clipped','boundaryCrossings','nodeCrossings')))
scroll=json.loads((ROOT/'docs/reviews/ch27-scroll-results.json').read_text())
check('60 actual 390 scroll positions bound to final HTML',scroll['sha256']==sha and scroll['passed'] and len(scroll['scrolls'])==60)
plain=lambda x:re.sub(r'<[^>]+>','',re.sub(r'<(?:svg|pre)\b[\s\S]*?</(?:svg|pre)>','',x))
stats={'beforeChineseProseChars':len(re.findall(r'[\u3400-\u9fff]',plain(before))),
       'afterChineseProseChars':len(re.findall(r'[\u3400-\u9fff]',plain(s))),
       'codeBlocks':len(blocks),'codeLines':sum(len(html.unescape(c).splitlines()) for _,c in blocks),
       'decks':6,'frames':31,'changedSvgFrames':changed,'unchangedSvgFrames':29,'flashcards':15}
out={'sha256':sha,'checks':checks,'passed':len(checks),'failed':0,'stats':stats,
     'geometryNote':'Fifteen existing store label/subtitle line-box pairs remain; actual separated glyphs were visually checked. Geometry is triage, not visual proof.'}
(ROOT/'docs/reviews/ch27-evidence-results.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'passed':len(checks),'failed':0,'stats':stats},ensure_ascii=False))
