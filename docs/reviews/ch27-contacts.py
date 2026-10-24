from pathlib import Path
from PIL import Image,ImageOps,ImageDraw
import sys
phase=sys.argv[1] if len(sys.argv)>1 else 'before'
p=Path(f'docs/reviews/screenshots/ch27-{phase}')
for theme in ('parchment','dracula'):
 for d,n in ((1,5),(2,5),(3,6),(4,5),(5,5),(6,5)):
  im=Image.new('RGB',(1920,450*3),(242,246,240) if theme=='parchment' else (40,42,54))
  draw=ImageDraw.Draw(im)
  for i in range(1,n+1):
   shot=Image.open(p/f'd{d}s{i}-{theme}.png')
   x=((i-1)%2)*960;y=((i-1)//2)*450
   im.paste(shot,(x,y+24));draw.text((x+12,y+4),f'{phase} D{d}F{i} {theme}',fill='black' if theme=='parchment' else 'white')
  im.save(p/f'contact-d{d}-{theme}.png')
print(phase,'12 contact sheets')
