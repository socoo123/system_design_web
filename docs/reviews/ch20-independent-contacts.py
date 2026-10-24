from pathlib import Path
from PIL import Image,ImageDraw
folder=Path(__file__).resolve().parent/'screenshots/ch20/independent'
for theme in ['parchment','dracula']:
 for d in [2,4]:
  pictures=[folder/f'd{d}s{i}-{theme}.png' for i in range(1,6)]
  images=[Image.open(p).convert('RGB') for p in pictures]
  w=max(im.width for im in images);h=max(im.height for im in images)+24
  out=Image.new('RGB',(w,h*5),'#dbe5df')
  for i,(p,im) in enumerate(zip(pictures,images)):
   out.paste(im,(0,i*h));ImageDraw.Draw(out).text((2,i*h+im.height+4),p.stem,fill='#172c22')
  out.save(folder/f'contact-d{d}-{theme}.jpg')
  pictures=[folder/f'd{d}s{i}-{theme}-{pos}.png' for i in range(1,6) for pos in ['left','middle','right']]
  images=[Image.open(p).convert('RGB') for p in pictures]
  images=[im.crop((0,0,im.width,min(im.height,500))) for im in images]
  w=max(im.width for im in images);h=max(im.height for im in images)+24
  out=Image.new('RGB',(w*3,h*5),'#dbe5df')
  for i,(p,im) in enumerate(zip(pictures,images)):
   x=i%3*w;y=i//3*h;out.paste(im,(x,y));ImageDraw.Draw(out).text((x+2,y+im.height+4),p.stem,fill='#172c22')
  out.save(folder/f'contact-narrow-d{d}-{theme}.jpg')
