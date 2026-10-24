from pathlib import Path
from PIL import Image, ImageDraw
import sys
phase = sys.argv[1] if len(sys.argv)>1 else 'before'
base=Path('docs/reviews/screenshots/ch36-author')/phase
for deck in range(1,8):
 frames=sorted(base.glob(f'd{deck}s*-parchment.png'))
 sheet=Image.new('RGB',(1920,len(frames)*455),(240,244,240))
 draw=ImageDraw.Draw(sheet)
 for row,frame in enumerate(frames):
  for col,theme in enumerate(['parchment','dracula']):
   f=base/f'{frame.name.split("-parchment")[0]}-{theme}.png'
   draw.text((col*960+8,row*455+5),f'{phase} {f.stem}',fill='black')
   sheet.paste(Image.open(f).convert('RGB'),(col*960,row*455+30))
 sheet.save(base/f'contact-d{deck}.png')
print('contacts',phase,7)
