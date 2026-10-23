"""Keep displayed teaching blocks byte-identical to their canonical files."""
import html
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[2]
page = root / 'chapters/ch16.html'
source = page.read_text()
count = 0
def replace(match):
    global count
    count += 1
    name = match.group(2)
    expected = (Path(__file__).parent / name).read_text().rstrip('\n')
    if '--check' in sys.argv:
        assert html.unescape(match.group(3)) == expected, f'drift: {name}'
        return match.group(0)
    return match.group(1) + html.escape(expected, quote=False) + '</code></pre>'

changed = re.sub(r'(<pre[^>]*data-source="([^"]+)"[^>]*><code>)([\s\S]*?)</code></pre>', replace, source)
assert count == 5, f'expected 5 source blocks, got {count}'
if '--check' not in sys.argv: page.write_text(changed)
print(f'{count} source/page blocks identical')
