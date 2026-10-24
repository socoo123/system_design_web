from pathlib import Path
from PIL import Image,ImageDraw
root=Path('docs/reviews/screenshots/ch28-independent')
for theme in ['parchment','dracula']:
 for deck in [5,6]:
  paths=[root/'frames'/f'd{deck}s{i}-{theme}.png' for i in range(1,6)]
  images=[Image.open(p).convert('RGB') for p in paths]
  w=max(i.width for i in images);h=max(i.height for i in images)
  sheet=Image.new('RGB',(w*2,(h+24)*3),'#edf4eb' if theme=='parchment' else '#24252e');draw=ImageDraw.Draw(sheet)
  for i,im in enumerate(images):
   x=(i%2)*w;y=(i//2)*(h+24);draw.text((x+3,y+5),paths[i].stem,fill='#23362b' if theme=='parchment' else '#f8f8f2');sheet.paste(im,(x,y+24))
  sheet.save(root/f'd{deck}-{theme}-desktop-contact.png')
  paths=[root/'browser'/f'd{deck}s{i}-{theme}-{pos}.png' for i in [4,5] for pos in ['left','middle','right']]
  images=[Image.open(p).convert('RGB') for p in paths];w=max(i.width for i in images);h=max(i.height for i in images)
  sheet=Image.new('RGB',(w*3,(h+24)*2),'#edf4eb' if theme=='parchment' else '#24252e');draw=ImageDraw.Draw(sheet)
  for i,im in enumerate(images):
   x=(i%3)*w;y=(i//3)*(h+24);draw.text((x+3,y+5),paths[i].stem,fill='#23362b' if theme=='parchment' else '#f8f8f2');sheet.paste(im,(x,y+24))
  sheet.save(root/f'd{deck}-{theme}-narrow-contact.png')
print('8 actual-page contact sheets')
