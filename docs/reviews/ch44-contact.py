from pathlib import Path
from PIL import Image, ImageDraw
P=Path(__file__).resolve().parent/'screenshots/ch44-author'
def sheet(files, out, width, height, cols):
    dst=Image.new('RGB',(width*cols,(height+28)*((len(files)+cols-1)//cols)),'#dddddd')
    draw=ImageDraw.Draw(dst)
    for n,f in enumerate(files):
        x=n%cols*width;y=n//cols*(height+28)
        im=Image.open(f).convert('RGB').resize((width,height))
        dst.paste(im,(x,y+28));draw.text((x+8,y+5),f.name,fill='black')
    dst.save(out)
for theme in ['parchment','dracula']:
    sheet([P/'after'/f'{theme}-d5-s{n}.png' for n in range(1,6)],P/'after'/f'contact-{theme}-d5.png',960,420,2)
    sheet([P/'mobile'/f'{theme}-390-d{d}-{pos}.png' for d in [4,5] for pos in ['left','middle','right']],P/'mobile'/f'contact-{theme}-diagrams.png',390,1000,3)
    sheet([P/'mobile'/f'{theme}-390-{name}.png' for name in ['retry','breaker','accept']],P/'mobile'/f'contact-{theme}-code.png',390,1000,3)
sheet([P/'mobile'/f'{theme}-320-retry-right.png' for theme in ['parchment','dracula']],P/'mobile'/'contact-320-code-right.png',320,1000,2)
