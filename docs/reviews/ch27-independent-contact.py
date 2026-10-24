from pathlib import Path
from PIL import Image,ImageDraw
import hashlib,json,re
ROOT=Path(__file__).resolve().parents[2]
h=(ROOT/'chapters/ch27.html').read_text();baseline=(ROOT/'docs/reviews/ch25-ch26-ch27-baseline/ch27.html').read_text()
figs=re.findall(r'<figure class="deck">[\s\S]*?</figure>',h)
svgs=lambda s:re.findall(r'<svg\b[\s\S]*?</svg>',s)
ids=lambda s:[re.search(r'<title id="([^"]+)"',x).group(1) for x in svgs(s)]
assert ids(h)==ids(baseline)
changed=[i for i,a,b in zip(ids(h),svgs(h),svgs(baseline)) if a!=b]
assert changed==['d4s5t','d5s5t']
(ROOT/'docs/reviews/ch27-independent-animation-results.json').write_text(json.dumps({'htmlSha256':hashlib.sha256(h.encode()).hexdigest(),'passed':True,'decks':len(figs),'frames':len(ids(h)),'ids':ids(h),'changedFromBaseline':changed,'allIdsRetained':True},indent=2)+'\n')
p=ROOT/'docs/reviews/screenshots/ch27-independent/frames/after'
for theme in ['parchment','dracula']:
 for d,fig in enumerate(figs,1):
  count=len(svgs(fig));out=Image.new('RGB',(1440,342*((count+1)//2)), '#f3f3f3');draw=ImageDraw.Draw(out)
  for i in range(1,count+1):
   im=Image.open(p/f'd{d}s{i}-{theme}.png').convert('RGB').resize((720,315));x=((i-1)%2)*720;y=((i-1)//2)*342
   out.paste(im,(x,y+20));draw.text((x+8,y+4),f'D{d} F{i} {theme}',fill='black')
  out.save(p/f'd{d}-{theme}-contact.png')
p=ROOT/'docs/reviews/screenshots/ch27-independent/browser'
for theme in ['parchment','dracula']:
 for d in [4,5]:
  for frames in [(1,2),(3,4),(5,)]:
   ims=[[Image.open(p/f'd{d}s{f}-{theme}-{pos}.png').convert('RGB') for pos in ['left','middle','right']] for f in frames]
   width=sum(im.width for im in ims[0]);heights=[max(im.height for im in row)+22 for row in ims]
   out=Image.new('RGB',(width,sum(heights)),'white');draw=ImageDraw.Draw(out);y=0
   for f,row,hei in zip(frames,ims,heights):
    x=0
    for pos,im in zip(['left','middle','right'],row):
     out.paste(im,(x,y+22));draw.text((x+4,y+4),f'D{d} F{f} {pos}',fill='black');x+=im.width
    y+=hei
   out.save(p/f'd{d}-f{frames[0]}-{frames[-1]}-{theme}-narrow.png')
print('Animation identity and contact sheets ready')
