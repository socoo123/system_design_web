from pathlib import Path
import sys
from PIL import Image, ImageDraw
root=Path(__file__).resolve().parent/'screenshots/ch19'
for phase in (sys.argv[1:] or ['before','after']):
    folder=root/phase
    for theme in ['parchment','dracula']:
        for deck in range(1,7):
            pics=sorted(folder.glob(f'd{deck}s*-{theme}.png'))
            if not pics:continue
            images=[Image.open(p).convert('RGB') for p in pics]
            width=max(im.width for im in images); height=max(im.height for im in images)+24
            sheet=Image.new('RGB',(width,height*len(images)),'#dbe5df')
            for i,(p,im) in enumerate(zip(pics,images)):
                sheet.paste(im,(0,i*height));ImageDraw.Draw(sheet).text((4,i*height+im.height+4),p.stem,fill='#172c22')
            sheet.save(folder/f'contact-d{deck}-{theme}.jpg')
# Contact sheets derive from actual 390px viewport figures, never from desktop CLI crops.
folder=root/'browser'
for theme in ['parchment','dracula']:
    for deck in [3,4,5]:
        pics=[folder/f'd{deck}s{frame}-{theme}-{position}.png' for frame in range(1,6) for position in ['left','middle','right']]
        if not all(p.exists() for p in pics):continue
        images=[Image.open(p).convert('RGB') for p in pics]
        # Keep a representative SVG/control strip at native size; full originals are retained.
        images=[im.crop((0,0,im.width,min(im.height,500))) for im in images]
        w=max(im.width for im in images);h=max(im.height for im in images)+24
        sheet=Image.new('RGB',(w*3,h*5),'#dbe5df')
        for i,(p,im) in enumerate(zip(pics,images)):
            x=(i%3)*w;y=(i//3)*h
            sheet.paste(im,(x,y));ImageDraw.Draw(sheet).text((x+2,y+im.height+4),p.stem,fill='#172c22')
        sheet.save(folder/f'contact-d{deck}-{theme}.jpg')
