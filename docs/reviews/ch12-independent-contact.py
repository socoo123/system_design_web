from pathlib import Path
from PIL import Image,ImageDraw
p=Path('docs/reviews/screenshots/ch12-independent')
for theme in ['parchment','dracula']:
 for d in [1,4,6]:
  sheet=Image.new('RGB',(1920,1380),'#ddd')
  for f in range(1,6):
   im=Image.open(p/f'd{d}s{f}-{theme}-desktop.png');im.thumbnail((960,420));x=((f-1)%2)*960;y=((f-1)//2)*460
   sheet.paste(im,(x,y+28));ImageDraw.Draw(sheet).text((x+5,y+5),f'D{d}F{f} {theme}',fill='black')
  sheet.save(p/f'd{d}-{theme}-desktop.jpg',quality=86)
  for start in [1,3,5]:
   frames=list(range(start,min(start+2,6)));n=Image.new('RGB',(1170,1028*len(frames)),'#ddd')
   for row,f in enumerate(frames):
    for col,edge in enumerate(['left','middle','right']):
     n.paste(Image.open(p/f'd{d}s{f}-{theme}-{edge}.png'),(390*col,1028*row+28));ImageDraw.Draw(n).text((390*col+5,1028*row+5),f'D{d}F{f} {theme} {edge}',fill='black')
   n.save(p/f'd{d}-{theme}-narrow{start}.jpg',quality=86)
