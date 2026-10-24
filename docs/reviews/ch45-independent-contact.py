from pathlib import Path
from PIL import Image,ImageDraw
P=Path(__file__).resolve().parent/'screenshots/ch45-independent'
def sheet(files,out,cols=2):
 ims=[Image.open(f).convert('RGB') for f in files]
 w=max(im.width for im in ims);h=max(im.height for im in ims)
 dst=Image.new('RGB',(w*cols,(h+28)*((len(ims)+cols-1)//cols)),'#ddd');d=ImageDraw.Draw(dst)
 for n,(f,im) in enumerate(zip(files,ims)):
  x=n%cols*w;y=n//cols*(h+28);dst.paste(im,(x,y+28));d.text((x+8,y+5),f.name,fill='black')
 dst.save(out)
for theme in ['parchment','dracula']:
 sheet([P/'before'/f'{theme}-d{d}-s{n}.png' for d,n in enumerate([5,6,5,6,5,5,5],1)],P/f'contact-original-last-{theme}.png')
 sheet([P/'after'/f'{theme}-d{d}-s{n}.png' for d,n in [(2,5),(2,6),(4,6),(5,4),(5,5),(6,4),(6,5),(7,5)]],P/f'contact-dense-failure-{theme}.png')
 if (P/'mobile'/f'{theme}-390-d6-left.png').exists():
  sheet([P/'mobile'/f'{theme}-390-d{d}-{pos}.png' for d in [6,7] for pos in ['left','middle','right']],P/f'contact-mobile-diagrams-{theme}.png',3)
  sheet([P/'mobile'/f'{theme}-390-{name}.png' for name in ['edit-tx','capture','consume-tx']],P/f'contact-mobile-code-{theme}.png',3)
