from pathlib import Path
from PIL import Image, ImageDraw
import sys

phase = sys.argv[1] if len(sys.argv) > 1 else 'after'
root = Path('docs/reviews/screenshots/ch29-author') / phase
for theme in ['parchment', 'dracula']:
    for deck, count in enumerate([6, 5, 5, 5, 5, 5], 1):
        sheet = Image.new('RGB', (1920, ((count + 1) // 2) * 452), '#edf4eb' if theme == 'parchment' else '#24252e')
        draw = ImageDraw.Draw(sheet)
        for frame in range(1, count + 1):
            x = ((frame - 1) % 2) * 960
            y = ((frame - 1) // 2) * 452
            draw.text((x + 8, y + 7), f'D{deck} F{frame} / {theme} / {phase}', fill='#23362b' if theme == 'parchment' else '#f8f8f2')
            shot = Image.open(root / f'd{deck}s{frame}-{theme}.png').convert('RGB')
            shot.thumbnail((960, 420))
            sheet.paste(shot, (x, y + 30))
        sheet.save(root / f'd{deck}-{theme}-contact.png')
print(f'{phase}: 12 contact sheets')
