from pathlib import Path
from PIL import Image,ImageDraw
p=Path(__file__).resolve().parents[2]/'docs/reviews/screenshots/ch24-independent'
for theme in ['parchment','dracula']:
    for deck in range(1,7):
        canvas=Image.new('RGB',(960,5*442),'white');draw=ImageDraw.Draw(canvas)
        for frame in range(1,6):
            canvas.paste(Image.open(p/f'd{deck}s{frame}-{theme}-frame.png').convert('RGB'),(0,(frame-1)*442))
            draw.text((8,(frame-1)*442+423),f'D{deck}F{frame}',fill='black')
        canvas.save(p/f'd{deck}-{theme}-contact.jpg')
    for deck in [2,4,5]:
        rows=[]
        for frame in range(1,6):
            images=[Image.open(p/f'd{deck}s{frame}-{theme}-{position}.png').convert('RGB') for position in ['left','middle','right']]
            row=Image.new('RGB',(1170,max(i.height for i in images)+22),'white');draw=ImageDraw.Draw(row)
            for n,im in enumerate(images):row.paste(im,(390*n,22))
            draw.text((8,3),f'D{deck}F{frame}: actual 390 viewport, left / middle / right',fill='black');rows.append(row)
        canvas=Image.new('RGB',(1170,sum(im.height for im in rows)),'white');y=0
        for im in rows:canvas.paste(im,(0,y));y+=im.height
        canvas.save(p/f'd{deck}-{theme}-mobile-contact.jpg')
