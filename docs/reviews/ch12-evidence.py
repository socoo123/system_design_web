from pathlib import Path
from PIL import Image, ImageDraw
import hashlib, json, re, sys
ROOT=Path(__file__).resolve().parents[2]
stage=sys.argv[1] if len(sys.argv)>1 else 'after'
p=ROOT/f'docs/reviews/screenshots/ch12/{stage}'
for theme in ('parchment','dracula'):
 for d in range(1,7):
  files=[p/f'd{d}s{s}-{theme}.png' for s in range(1,6)]
  out=Image.new('RGB',(960,2200),(240,245,240) if theme=='parchment' else (40,42,54))
  for i,f in enumerate(files):
   im=Image.open(f).convert('RGB');im.thumbnail((960,420));out.paste(im,((960-im.width)//2,i*440+20))
   ImageDraw.Draw(out).text((8,i*440+4),f'D{d} F{i+1}',fill='black' if theme=='parchment' else 'white')
  out.save(p/f'd{d}-{theme}-sheet.jpg',quality=92)
old=(ROOT/'docs/reviews/ch10-ch11-ch12-baseline/ch12.html').read_text()
new=(ROOT/'chapters/ch12.html').read_text()
oldsvg=re.findall(r'<svg\b.*?</svg>',old,re.S);newsvg=re.findall(r'<svg\b.*?</svg>',new,re.S)
assert len(oldsvg)==len(newsvg)==30
frames=[]
for i,(a,b) in enumerate(zip(oldsvg,newsvg)):
 aid=re.search(r'<title id="([^"]+)"',a).group(1);bid=re.search(r'<title id="([^"]+)"',b).group(1)
 assert aid==bid
 frames.append({'deck':i//5+1,'slide':i%5+1,'title_id':aid,'unchanged':a==b,'before_sha256':hashlib.sha256(a.encode()).hexdigest(),'after_sha256':hashlib.sha256(b.encode()).hexdigest()})
(ROOT/'docs/reviews/ch12-animation-results.json').write_text(json.dumps({'decks':6,'frames':30,'changed_frames':[f['title_id'] for f in frames if not f['unchanged']],'frames_detail':frames},indent=2)+'\n')
print(json.dumps({'decks':6,'frames':30,'changed':[f['title_id'] for f in frames if not f['unchanged']]},indent=2))
