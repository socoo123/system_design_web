"""Check displayed blocks against maintained sources; no browser or behavior claim."""
import hashlib
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
page = (ROOT / "chapters/ch43.html").read_text()
checks = []
for attrs, shown in re.findall(r"<pre\s+([^>]*)><code>([\s\S]*?)</code></pre>", page):
    source = re.search(r'data-source="([^"]+)"', attrs).group(1)
    file, separator, region = source.partition(":")
    original = (ROOT / "examples/ch43" / file).read_text()
    if separator:
        original = re.search(r"    // BEGIN " + region + r"\n([\s\S]*?)    // END " + region,
                             original).group(1)
        original = "\n".join(line[4:] if line.startswith("    ") else line
                             for line in original.splitlines())
    assert html.unescape(shown).rstrip() == original.rstrip(), source
    checks.append(source)
assert len(checks) == 3
baseline = (ROOT / "docs/reviews/ch43-ch44-ch45-baseline/ch43.html").read_text()
ids = lambda text: re.findall(r'<(?:title|desc) id="([^"]+)"', text)
assert ids(page) == ids(baseline)
assert page.count('<figure class="deck">') == 7 and page.count('class="slide"') == 37
assert page.count("<h2>") == page.count("</h2>") == 14
files = [ROOT / "chapters/ch43.html", *sorted((ROOT / "examples/ch43").glob("*"))]
hashes = {str(file.relative_to(ROOT)): hashlib.sha256(file.read_bytes()).hexdigest()
          for file in files if file.is_file()}
print(json.dumps({"passed": True, "sourceBlocks": checks, "animationIds": len(ids(page)),
                  "decks": 7, "frames": 37, "sourceHashes": hashes}, indent=2))
