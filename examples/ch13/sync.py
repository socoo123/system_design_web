from pathlib import Path
import re
import html
import sys

root = Path(__file__).resolve().parents[2]
page = root / 'chapters/ch13.html'
document = page.read_text()
count = 0
def replace(match):
    global count
    count += 1
    name = match.group(2)
    source = (root / 'examples/ch13' / name).read_text().rstrip('\n')
    if name.endswith('.java'):
        source = source.split('  // BEGIN PAGE\n')[1].split('\n  // END PAGE')[0]
    if '--check' in sys.argv:
        if html.unescape(match.group(3)) != source:
            raise SystemExit('DIFF: ' + name)
        return match.group(0)
    return match.group(1) + html.escape(source, quote=False) + '</code></pre>'
document = re.sub(r'(<pre\b[^>]*data-source="([^"]+)"[^>]*><code>)(.*?)</code></pre>',
                  replace, document, flags=re.S)
if '--check' not in sys.argv:
    page.write_text(document)
print(f'PASS {count} source/page snippets' if '--check' in sys.argv else f'Synced {count} snippets')
