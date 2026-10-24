from pathlib import Path
from PIL import Image, ImageDraw
for phase in ['before','after']:
 p=Path('docs/reviews/screenshots/ch24')/phase
 for theme in ['parchment','dracula']:
  for d in range(1,7):
   im=Image.new('RGB',(1920,1410),'#ffffff' if theme=='parchment' else '#282a36')
   draw=ImageDraw.Draw(im)
   for s in range(1,6):
    x=((s-1)%2)*960;y=((s-1)//2)*470
    im.paste(Image.open(p/f'd{d}s{s}-{theme}.png'),(x,y+30))
    draw.text((x+12,y+8),f'{phase} d{d}s{s} {theme}',fill='black' if theme=='parchment' else 'white')
   im.save(p/f'd{d}-{theme}-contact.png')
