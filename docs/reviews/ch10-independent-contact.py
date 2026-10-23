from pathlib import Path
from PIL import Image,ImageDraw
p=Path(__file__).resolve().parents[1]/'reviews/screenshots/ch10-independent'
for theme in ['parchment','dracula']:
 for d in range(1,7):
  files=sorted((p/'frames').glob(f'd{d}s*-{theme}.png'))
  if not files:continue
  sheet=Image.new('RGB',(1480,365*((len(files)+1)//2)),'white')
  for i,f in enumerate(files):
   im=Image.open(f).convert('RGB');im.thumbnail((720,340));sheet.paste(im,((i%2)*740+10,(i//2)*365+20));ImageDraw.Draw(sheet).text(((i%2)*740+10,(i//2)*365+3),f.name,fill='black')
  sheet.save(p/f'd{d}-{theme}-frames.png')
 for d in range(1,4):
  rows=[]
  for f in sorted((p/'narrow').glob(f'd{d}s*-{theme}-left.png')):
   base=f.name.removesuffix('-left.png');ims=[Image.open(p/'narrow'/f'{base}-{pos}.png').convert('RGB') for pos in ['left','middle','right']]
   height=max(im.height for im in ims)+25;row=Image.new('RGB',(1170,height),'white')
   for i,im in enumerate(ims):row.paste(im,(i*390,25));ImageDraw.Draw(row).text((i*390+8,4),base+' '+['left','middle','right'][i],fill='black')
   rows.append(row)
  if rows:
   sheet=Image.new('RGB',(1170,sum(r.height for r in rows)),'white');y=0
   for r in rows:sheet.paste(r,(0,y));y+=r.height
   sheet.save(p/f'd{d}-{theme}-390.png')
