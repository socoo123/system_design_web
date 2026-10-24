from pathlib import Path
from PIL import Image,ImageDraw
p=Path('docs/reviews/screenshots/ch26-independent/frames')
for theme in ('parchment','dracula'):
 for d,n in ((1,5),(2,5),(3,6),(4,5),(5,5),(6,5)):
  im=Image.new('RGB',(1920,450*3),(242,246,240) if theme=='parchment' else (40,42,54));draw=ImageDraw.Draw(im)
  for i in range(1,n+1):
   shot=Image.open(p/f'd{d}s{i}-{theme}.png');x=((i-1)%2)*960;y=((i-1)//2)*450
   im.paste(shot,(x,y+24));draw.text((x+12,y+4),f'Ch26 independent D{d}F{i} {theme}',fill='black' if theme=='parchment' else 'white')
  im.save(p/f'contact-d{d}-{theme}.png')
p=Path('docs/reviews/screenshots/ch26-independent/browser')
for theme in ('parchment','dracula'):
 for d in (1,4,6):
  sample=Image.open(p/f'd{d}s1-{theme}-left.png');w=sample.width
  im=Image.new('RGB',(w*3,450*5),(242,246,240) if theme=='parchment' else (40,42,54));draw=ImageDraw.Draw(im)
  for i in range(1,6):
   for j,pos in enumerate(('left','middle','right')):
    shot=Image.open(p/f'd{d}s{i}-{theme}-{pos}.png')
    im.paste(shot.crop((0,0,w,420)),(j*w,(i-1)*450+25));draw.text((j*w+5,(i-1)*450+5),f'390 D{d}F{i} {pos}',fill='black' if theme=='parchment' else 'white')
  im.save(p/f'contact-d{d}-{theme}-390.png')
print('12 frame contact sheets and 6 actual-390 contact sheets')
