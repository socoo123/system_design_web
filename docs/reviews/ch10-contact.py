from PIL import Image, ImageDraw
from pathlib import Path
import sys
stage = sys.argv[1] if len(sys.argv)>1 else 'after'
p = Path('docs/reviews/screenshots/ch10') / stage
for theme in ['parchment', 'dracula']:
    for d, count in enumerate([5,6,5,5,5,5], 1):
        sheet = Image.new('RGB', (1920,460*((count+1)//2)), '#dddddd')
        for i in range(1,count+1):
            frame = Image.open(p/f'd{d}s{i}-{theme}.png').convert('RGB')
            frame.thumbnail((960,420))
            x=((i-1)%2)*960; y=((i-1)//2)*460
            sheet.paste(frame,(x,y+28))
            ImageDraw.Draw(sheet).text((x+10,y+8),f'D{d}F{i} {theme}',fill='black')
        sheet.save(p/f'deck{d}-{theme}.jpg',quality=86)
