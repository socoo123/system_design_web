from pathlib import Path
from PIL import Image,ImageDraw
p=Path('docs/reviews/screenshots/ch32-independent-browser')
for theme in ('parchment','dracula'):
 for d,count in ((1,5),(2,5),(3,6),(4,5),(6,6)):
  ims=[]
  for f in range(1,count+1):
   im=Image.open(p/f'd{d}f{f}-{theme}-desktop.png').convert('RGB');im.thumbnail((960,900));ims.append((f,im))
  w=980;h=max(i.height for _,i in ims)+40
  out=Image.new('RGB',(w*2,h*((count+1)//2)),'#eeeeee');draw=ImageDraw.Draw(out)
  for n,(f,im) in enumerate(ims):
   x=n%2*w;y=n//2*h;draw.text((x+12,y+10),f'Ch32 independent D{d} F{f} {theme}',fill='black');out.paste(im,(x+10,y+30))
  out.save(p/f'd{d}-{theme}-contact.png')
 for d,f in ((3,5),(3,6),(6,6)):
  ims=[Image.open(p/f'd{d}f{f}-{theme}-{position}.png').convert('RGB') for position in ('left','middle','right')]
  w=max(i.width for i in ims)+12;h=max(i.height for i in ims)+30
  out=Image.new('RGB',(w*3,h),'#eeeeee');draw=ImageDraw.Draw(out)
  for n,im in enumerate(ims):
   draw.text((n*w+6,5),('left','middle','right')[n],fill='black');out.paste(im,(n*w+6,25))
  out.save(p/f'd{d}f{f}-{theme}-mobile-contact.png')
print('10 modified-group contact sheets and 6 actual-390 panoramas')
