from pathlib import Path
import html, re, sys
root = Path(__file__).resolve().parents[2]
page = root / 'chapters/ch19.html'
s = page.read_text()
count = 0

def source(ref):
    path, _, mark = ref.partition('#')
    value = (root / 'examples/ch19' / path).read_text().rstrip('\n')
    if mark:
        value = value.split(f'    // BEGIN PAGE {mark}\n')[1].split(f'    // END PAGE {mark}')[0].rstrip('\n')
        value = '\n'.join(line[4:] if line.startswith('    ') else line for line in value.splitlines())
    return value

def replace(m):
    global count
    count += 1
    value = source(m.group(2))
    if '--check' in sys.argv:
        if html.unescape(m.group(3)) != value: raise SystemExit('DIFF ' + m.group(2))
        return m.group(0)
    return m.group(1) + html.escape(value, quote=False) + '</code></pre>'
s = re.sub(r'(<pre\b[^>]*data-source="([^"]+)"[^>]*><code>)(.*?)</code></pre>', replace, s, flags=re.S)
if count != 5: raise SystemExit(f'Expected 5 snippets, got {count}')
if '--check' not in sys.argv: page.write_text(s)
print(f'PASS {count} source/page snippets' if '--check' in sys.argv else f'Synced {count} snippets')
