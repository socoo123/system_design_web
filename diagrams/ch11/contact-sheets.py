"""Build local review sheets from ch11-render.mjs screenshots (Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[2] / 'docs/reviews/screenshots/ch11'
for stage in ('before', 'after'):
    for theme in ('parchment', 'dracula'):
        for deck in range(1, 7):
            files = sorted((root / stage).glob(f'd{deck}s*-{theme}.png'))
            if not files:
                continue
            sheet = Image.new('RGB', (1480, 365 * ((len(files) + 1) // 2)), '#ddd')
            for index, file in enumerate(files):
                image = Image.open(file).convert('RGB')
                image.thumbnail((720, 340))
                tile = Image.new('RGB', (740, 365), 'white')
                tile.paste(image, ((740 - image.width) // 2, 20))
                ImageDraw.Draw(tile).text((12, 3), file.name, fill='black')
                sheet.paste(tile, ((index % 2) * 740, (index // 2) * 365))
            sheet.save(root / stage / f'd{deck}-{theme}-contact.png')
