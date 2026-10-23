from PIL import Image, ImageDraw
from pathlib import Path
import sys

stage = sys.argv[1] if len(sys.argv) > 1 else 'after'
directory = Path('docs/reviews/screenshots/ch13') / stage
for theme in ['parchment', 'dracula']:
    for deck in range(1, 7):
        sheet = Image.new('RGB', (1920, 1380), '#dddddd')
        for frame in range(1, 6):
            image = Image.open(directory / f'd{deck}s{frame}-{theme}.png').convert('RGB')
            image.thumbnail((960, 420))
            x = ((frame - 1) % 2) * 960
            y = ((frame - 1) // 2) * 460
            sheet.paste(image, (x, y + 28))
            ImageDraw.Draw(sheet).text((x + 10, y + 8), f'D{deck}F{frame} {theme}', fill='black')
        sheet.save(directory / f'deck{deck}-{theme}.jpg', quality=90)
