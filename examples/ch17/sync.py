from pathlib import Path
import re, html, sys
root = Path(__file__).resolve().parents[2]
page = root / 'chapters/ch17.html'
text = page.read_text()
count = 0

def source_value(source):
    path, _, mark = source.partition('#')
    value = (root / 'examples/ch17' / path).read_text().rstrip('\n')
    if mark:
        value = value.split(f'    // BEGIN PAGE {mark}\n')[1].split(f'    // END PAGE {mark}')[0].rstrip('\n')
        value = '\n'.join(line[4:] if line.startswith('    ') else line for line in value.splitlines())
    return value

def replace(m):
    global count
    count += 1
    value = source_value(m.group(2))
    if '--check' in sys.argv:
        if html.unescape(m.group(3)) != value: raise SystemExit('DIFF ' + m.group(2))
        return m.group(0)
    return m.group(1) + html.escape(value, quote=False) + '</code></pre>'
text = re.sub(r'(<pre\b[^>]*data-source="([^"]+)"[^>]*><code>)(.*?)</code></pre>', replace, text, flags=re.S)
if count != 5: raise SystemExit(f'Unexpected block count {count}')
if '--check' not in sys.argv: page.write_text(text)
print(f'PASS {count} source/page snippets' if '--check' in sys.argv else f'Synced {count} snippets')
