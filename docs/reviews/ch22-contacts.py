from pathlib import Path
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parents[2]/'docs/reviews/screenshots/ch22'
for phase in ['before','after']:
    directory=root/phase
    for theme in ['parchment','dracula']:
        for deck in range(1,7):
            canvas=Image.new('RGB',(960,5*442),'white');draw=ImageDraw.Draw(canvas)
            for frame in range(1,6):
                im=Image.open(directory/f'd{deck}s{frame}-{theme}.png').convert('RGB')
                canvas.paste(im,(0,(frame-1)*442));draw.text((10,(frame-1)*442+423),f'D{deck}F{frame}',fill='black')
            canvas.save(directory/f'd{deck}-{theme}-sheet.jpg')
directory=root/'browser'
for theme in ['parchment','dracula']:
    for deck in [1,2,3,4,6]:
        rows=[]
        for frame in range(1,6):
            images=[Image.open(directory/f'd{deck}s{frame}-{theme}-{position}.png').convert('RGB') for position in ['left','middle','right']]
            row=Image.new('RGB',(1170,max(i.height for i in images)+24),'white');draw=ImageDraw.Draw(row)
            for n,im in enumerate(images):row.paste(im,(390*n,24))
            draw.text((10,5),f'D{deck}F{frame}   actual 390 viewport: left / middle / right scroll positions',fill='black')
            rows.append(row)
        canvas=Image.new('RGB',(1170,sum(i.height for i in rows)),'white');y=0
        for row in rows:canvas.paste(row,(0,y));y+=row.height
        canvas.save(directory/f'd{deck}-{theme}-mobile-sheet.jpg')
