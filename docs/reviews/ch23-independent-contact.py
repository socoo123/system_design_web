from pathlib import Path
from PIL import Image,ImageDraw
for phase in ['before','after']:
 p=Path('docs/reviews/screenshots/ch23-independent')/phase
 for theme in ['parchment','dracula']:
  for d in [1,4,6]:
   frames=sorted(p.glob(f'd{d}s*-{theme}.png'))
   im=Image.new('RGB',(1920,1410),'white' if theme=='parchment' else '#282a36');draw=ImageDraw.Draw(im)
   for i,frame in enumerate(frames):
    x=(i%2)*960;y=(i//2)*470;im.paste(Image.open(frame),(x,y+30));draw.text((x+12,y+8),f'{phase} {frame.name}',fill='black' if theme=='parchment' else 'white')
   im.save(p/f'd{d}-{theme}-contact.png')
