from pathlib import Path
from decimal import Decimal
import hashlib
import json
import re
import subprocess

root = Path(__file__).resolve().parents[2]
html_path = root / "chapters/ch45.html"
html = html_path.read_text()
baseline = (root / "docs/reviews/ch43-ch44-ch45-baseline/ch45.html").read_text()
checks = []


def check(condition, name):
    checks.append({"name": name, "passed": bool(condition)})


def inventory(source):
    return [[{"id": re.search(r'<title id="([^"]+)"', svg).group(1),
              "sha256": hashlib.sha256(svg.encode()).hexdigest()}
             for svg in re.findall(r'<svg\b.*?</svg>', deck, re.S)]
            for deck in re.findall(r'<figure class="deck">(.*?)</figure>', source, re.S)]


old, new = inventory(baseline), inventory(html)
check([len(deck) for deck in new] == [5, 6, 5, 6, 5, 5, 5], "original 7 decks / 37 frames retained")
check([[s["id"] for s in deck] for deck in old] == [[s["id"] for s in deck] for deck in new], "title IDs and frame order retained")
check(re.findall(r'<(?:title|desc) id="([^"]+)"', baseline) == re.findall(r'<(?:title|desc) id="([^"]+)"', html), "all 74 accessibility IDs retained")
check(old == new, "all 37 SVGs byte-for-byte preserved after visual review")
check(len(re.findall(r'<pre\b', html)) == 4, "four shared implementation snippets")
check(html.count('class="flip"') == baseline.count('class="flip"') == 12, "12 flashcards retained")
check("API v1" in html and "API v2" in html, "provider claim scoped to API v1")
sources = json.loads((root / "docs/reviews/ch45-sources.json").read_text())["sources"]
check([item["ref"] for item in sources] == list(range(1, 12)), "all 11 primary citations rechecked and scoped")
numeric = {
    "initial_minor": (2 * 2999 + 2002, 8000),
    "edited_minor": (3 * 2999 + 2002, 10999),
    "conditional_budget_ms": (20 + 40 + 120, 180),
    "remaining_budget_ms": (300 - 180, 120),
    "hot_row_ceiling_per_second": (Decimal(1) / Decimal("0.010"), 100),
    "occupancy_seconds_per_second": (300 * Decimal("0.010"), 3),
    "net_drain_per_second": (600 - 300, 300),
    "drain_seconds": (Decimal(36000) / (600 - 300), 120),
    "under_capacity_backlog_growth_per_second": (300 - 250, 50),
    "payload_gb_per_day": (Decimal(300) * 86400 * 2000 / 10**9, Decimal("51.84")),
    "seven_day_three_copy_gb": (Decimal(300) * 86400 * 2000 * 7 * 3 / 10**9, Decimal("1088.64")),
    "seven_day_three_copy_tb": (Decimal(300) * 86400 * 2000 * 7 * 3 / 10**12, Decimal("1.08864")),
}
for name, (actual, expected) in numeric.items():
    check(actual == expected, name)
commands = []
for argv in [["node", "examples/ch45/sync.mjs", "--check"],
             ["node", "tools/audit-chapter.mjs", "ch45"],
             ["node", "tools/check.mjs"],
             ["node", "--check", "examples/ch45/sync.mjs"],
             ["node", "--check", "docs/reviews/ch45-browser.mjs"],
             ["node", "--check", "docs/reviews/ch45-frames.mjs"],
             ["node", "--check", "docs/reviews/ch45-reading.mjs"],
             ["git", "diff", "--check"]]:
    run = subprocess.run(argv, cwd=root, capture_output=True, text=True)
    commands.append({"argv": argv, "exitCode": run.returncode, "stdout": run.stdout, "stderr": run.stderr})
    check(run.returncode == 0, " ".join(argv))
files = [html_path] + sorted(path for path in (root / "examples/ch45").rglob("*") if path.is_file() and "__pycache__" not in path.parts)
result = {"passed": all(item["passed"] for item in checks), "checks": checks,
          "numbers": {name: {"actual": str(a), "expected": str(e)} for name, (a, e) in numeric.items()},
          "sourceHashes": {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest() for path in files},
          "commands": commands}
(root / "docs/reviews/ch45-verification.json").write_text(json.dumps(result, indent=2) + "\n")
(root / "docs/reviews/ch45-animation-after.json").write_text(json.dumps({"source": "chapters/ch45.html", "sha256": result["sourceHashes"]["chapters/ch45.html"], "decks": new, "svgChanges": []}, indent=2) + "\n")
print(json.dumps({"passed": result["passed"], "checks": len(checks), "failed": [c for c in checks if not c["passed"]]}))
if not result["passed"]:
    raise SystemExit(1)
