from pathlib import Path
from PIL import Image,ImageDraw
p=Path('docs/reviews/screenshots/ch29-independent-browser')
for theme in ('parchment','dracula'):
 for d,n in ((1,6),(3,5)):
  shots=[Image.open(p/f'd{d}s{i}-{theme}-desktop.png') for i in range(1,n+1)]
  w=max(x.width for x in shots);h=max(x.height for x in shots)+24
  out=Image.new('RGB',(w*2,h*3),(241,247,240) if theme=='parchment' else (40,42,54));draw=ImageDraw.Draw(out)
  for idx,img in enumerate(shots):
   x=idx%2*w;y=idx//2*h;out.paste(img,(x,y+24));draw.text((x+10,y+3),f'Actual page D{d}F{idx+1} {theme}',fill='black' if theme=='parchment' else 'white')
  out.save(p/f'contact-page-d{d}-{theme}.png')
 # Join actual 390px left/middle/right scroll positions for final modified frames.
 for d,n in ((1,6),(3,5)):
  shots=[Image.open(p/f'd{d}s{n}-{theme}-{pos}.png') for pos in ('left','middle','right')]
  w=max(x.width for x in shots);h=max(x.height for x in shots)
  out=Image.new('RGB',(w*3,h+24),(241,247,240) if theme=='parchment' else (40,42,54));draw=ImageDraw.Draw(out)
  for idx,img in enumerate(shots):
   out.paste(img,(idx*w,24));draw.text((idx*w+5,3),f'390px {("left","middle","right")[idx]}',fill='black' if theme=='parchment' else 'white')
  out.save(p/f'contact-phone-d{d}-{theme}.png')
print('4 desktop full-group and4 actual390 scroll contact sheets')
