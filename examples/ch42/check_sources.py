"""Check/sync the five HTML excerpts against their canonical teaching sources."""
from html import escape, unescape
from pathlib import Path
import re
import sys
import textwrap

base = Path(__file__).resolve().parent
page = base.parent.parent / "chapters/ch42.html"
html = page.read_text()
sources = {}
for name in ["effect.pseudo", "retry.pseudo", "drain.pseudo"]:
    sources[name] = (base / name).read_text().rstrip()
java = (base / "Resilience.java").read_text()
for marker in ["prefix", "io"]:
    region = re.search(rf"// BEGIN {marker}\n(.*?)\n\s*// END {marker}", java, re.S).group(1)
    sources[f"Resilience.java#{marker}"] = textwrap.dedent(region).rstrip()
seen = []
def replace(match):
    start, source, code, end = match.groups()
    assert source in sources, f"unknown source: {source}"
    seen.append(source)
    expected = sources[source]
    if "--write" in sys.argv:
        return start + escape(expected) + end
    assert unescape(code) == expected, f"page excerpt differs: {source}"
    return match.group()
updated = re.sub(r'(<pre\b[^>]*data-source="([^"]+)"[^>]*><code>)(.*?)(</code></pre>)', replace, html, flags=re.S)
assert sorted(seen) == sorted(sources), (seen, sources.keys())
if "--write" in sys.argv:
    page.write_text(updated)
print("PASS: five HTML excerpts match canonical files/Java regions")
