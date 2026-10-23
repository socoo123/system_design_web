"""Share teaching snippets with HTML; --check does not write."""
from pathlib import Path
import html
import re
import sys

root = Path(__file__).resolve().parents[2]
page = root / 'chapters/ch14.html'
source = page.read_text()
names = []


def replace(match):
    name = match['name']
    names.append(name)
    expected = (Path(__file__).parent / name).read_text().rstrip('\n')
    if '--check' in sys.argv:
        assert html.unescape(match['body']) == expected, f'source mismatch: {name}'
        return match[0]
    return match['open'] + html.escape(expected, quote=False) + '</code></pre>'


updated = re.sub(r'(?P<open><pre[^>]*data-source="(?P<name>[^"]+)"[^>]*><code>)'
                 r'(?P<body>.*?)</code></pre>', replace, source, flags=re.S)
assert sorted(names) == ['build.pseudo', 'claim.pseudo', 'complete.pseudo', 'grant.pseudo', 'publish.pseudo'], names
if '--check' not in sys.argv:
    page.write_text(updated)
print(f'{len(names)} shared source blocks match' if '--check' in sys.argv else f'synced {len(names)} blocks')
