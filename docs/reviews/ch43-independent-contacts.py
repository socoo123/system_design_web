from pathlib import Path
from PIL import Image, ImageDraw
import sys

stage = sys.argv[1] if len(sys.argv) > 1 else 'after'
root = Path(__file__).resolve().parents[2]
source = root / f'docs/reviews/screenshots/ch43-independent/{stage}'
for theme in ['parchment', 'dracula']:
    for deck in range(1, 8):
        frames = sorted(source.glob(f'{theme}-d{deck}-s*.png'))
        sheet = Image.new('RGB', (1440, ((len(frames) + 1) // 2) * 340), '#ffffff')
        draw = ImageDraw.Draw(sheet)
        for i, frame in enumerate(frames):
            image = Image.open(frame).convert('RGB')
            image.thumbnail((720, 315))
            x, y = (i % 2) * 720, (i // 2) * 340
            draw.text((x + 8, y + 4), f'{stage} / {theme} / D{deck} / S{i + 1}', fill='black')
            sheet.paste(image, (x, y + 22))
        sheet.save(source / f'contact-{theme}-d{deck}.png')
print(f'{stage}: 14 contact sheets')
