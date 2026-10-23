"""Sync shared teaching source blocks; --check verifies without writing."""
from pathlib import Path
import html
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
page = ROOT / 'chapters/ch10.html'
text = page.read_text()
count = 0


def replace(match):
    global count
    count += 1
    filename = match['name']
    expected = (Path(__file__).parent / filename).read_text().rstrip('\n')
    actual = html.unescape(match['code'])
    if '--check' in sys.argv:
        assert expected == actual, f'source mismatch: {filename}'
        return match[0]
    return match['open'] + html.escape(expected, quote=False) + '</code></pre>'


new = re.sub(
    r'(?P<open><pre[^>]*data-source="(?P<name>[^"]+)"[^>]*><code>)'
    r'(?P<code>.*?)</code></pre>', replace, text, flags=re.S)
assert count == 5, count
if '--check' not in sys.argv:
    page.write_text(new)
print(f'{count} shared source blocks match' if '--check' in sys.argv else f'synced {count} blocks')
