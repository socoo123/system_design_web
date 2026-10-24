from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import hashlib
import json
import sys
phase = "before" if "--before" in sys.argv else "after"

ROOT = Path(__file__).resolve().parents[2]
folder = ROOT / f'docs/reviews/screenshots/ch35-independent-frames'
font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 18)
contacts = []
for theme in ['parchment', 'dracula']:
    for deck, count in enumerate([5, 5, 6, 6, 5, 6], 1):
        width, height = 1440, ((count + 1)//2) * 352
        canvas = Image.new('RGB', (width, height), '#f2f8f0' if theme == 'parchment' else '#0e1018')
        draw = ImageDraw.Draw(canvas)
        for frame in range(1, count+1):
            filename = folder / f'd{deck}s{frame}-{theme}.png'
            picture = Image.open(filename).convert('RGB').resize((720, 315), Image.Resampling.LANCZOS)
            x, y = (frame-1)%2*720, (frame-1)//2*352
            draw.text((x+12, y+6), f'Ch35 D{deck} F{frame} · {theme}', fill='#344d3c' if theme == 'parchment' else '#c7c7dd', font=font)
            canvas.paste(picture, (x, y+32))
        output = folder / f'contact-d{deck}-{theme}.png'
        canvas.save(output)
        contacts.append({'path':str(output.relative_to(ROOT)), 'sha256':hashlib.sha256(output.read_bytes()).hexdigest(), 'frames':count})
(ROOT / f'docs/reviews/ch35-independent-contact-results.json').write_text(json.dumps(contacts, indent=2)+'\n')
print(json.dumps({'contacts':len(contacts),'frames':sum(x['frames'] for x in contacts)}))
