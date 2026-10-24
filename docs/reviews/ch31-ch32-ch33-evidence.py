"""Verify that final source, independent reviews and executed evidence agree."""
from pathlib import Path
import datetime
import hashlib
import itertools
import json
import re

ROOT = Path(__file__).resolve().parents[2]
PREFIX = "ch31-ch32-ch33"
REVIEW = ROOT / "docs/reviews"
assertions = []


def read(suffix):
    return json.loads((REVIEW / f"{PREFIX}-{suffix}.json").read_text())


def digest(filename):
    return hashlib.sha256((ROOT / filename).read_bytes()).hexdigest()


def check(name, condition):
    assertions.append({"name": name, "passed": bool(condition)})


baseline = read("baseline")
checks = read("checks")
check("all integration commands passed", checks["passed"] and all(r["exitCode"] == 0 for r in checks["checks"]))
check("no source changed during integration", checks["sourcesUnchangedDuringRun"])
for name, expected in checks["sourceHashes"].items():
    check(f"executed source current: {name}", digest(name) == expected)

browser = read("browser-results")
expected_layouts = set(itertools.product(("ch31", "ch32", "ch33"), (320, 390, 768, 1440), ("parchment", "dracula"), ("zh", "en", "both")))
actual_layouts = [(r["chapter"], r["width"], r["theme"], r["locale"]) for r in browser["layouts"]]
check("exactly 72 distinct real viewport combinations", len(actual_layouts) == 72 and set(actual_layouts) == expected_layouts)
check("browser run succeeded with zero page/resource errors", browser["passed"] and not browser["errors"])
check("all collapsed and expanded documents fit viewport", all(r["width"] == r["scrollWidth"] == r["expanded"]["scrollWidth"] for r in browser["layouts"]))
check("388 frame visits recorded", sum(r["frameVisits"] for r in browser["layouts"]) == 388)
check("10 verbatim copies and three complete interaction sets", len(browser["interactions"]) == 3 and sum(r["copied"] for r in browser["interactions"]) == 10 and all(all(r[k] for k in ("keyboard", "playback", "flashcards", "progress", "settings")) for r in browser["interactions"]))
for ch, expected in browser["files"].items():
    check(f"browser source current: {ch}", digest(f"chapters/{ch}.html") == expected)

numeric = read("numeric-review")
check("50 independent arithmetic equations passed", numeric["passed"] and len(numeric["checks"]) == 50)
for ch, expected in numeric["chapterHashes"].items():
    check(f"arithmetic chapter current: {ch}", digest(f"chapters/{ch}.html") == expected)

for name in ("vector", "ledger", "tools"):
    result = read(f"root-{name}-results")
    check(f"independent root {name} inputs passed", result["passed"])
    for filename, expected in result["files"].items():
        check(f"root {name} exercised current source: {filename}", digest(filename) == expected)

frames = read("frames")
visual = read("root-visual-review")
check("13 changed groups reviewed across all 142 theme frames", visual["passed"] and visual["changedDeckGroups"] == 13 and visual["renderedFramesInChangedGroupsBothThemes"] == 142)
for filename, expected in frames["files"].items():
    check(f"full-frame renderer source current: {filename}", digest(filename) == expected)
for filename, expected in visual["chapterHashes"].items():
    check(f"visual review chapter current: {filename}", digest(filename) == expected)
check("all 32 visually reviewed sheets remain byte-identical to reviewed images", len(visual["reviewedImages"]) == 32 and all(digest(filename) == expected for filename, expected in visual["reviewedImages"].items()))
check("final narrow/desktop code screenshots still match actual visual review", len(visual["reviewedPageImages"]) == 3 and all(digest(filename) == expected for filename, expected in visual["reviewedPageImages"].items()))

review_sources = {}
for ch in ("ch31", "ch32", "ch33"):
    html = (ROOT / f"chapters/{ch}.html").read_text()
    figures = re.findall(r'<figure\b[^>]*class="deck"[^>]*>[\s\S]*?</figure>', html)
    frame_counts = [len(re.findall(r'<div class="slide"', x)) for x in figures]
    check(f"preserved animation sequence: {ch}", frame_counts == [d["frames"] for d in baseline["chapters"][ch]["decks"]] and re.findall(r'<title id="([^"]+)"', html) == baseline["chapters"][ch]["slideIds"])
    check(f"expected code count: {ch}", len(re.findall(r"<pre\b", html)) == {"ch31": 3, "ch32": 4, "ch33": 3}[ch])
    expected_sources = {f"chapters/{ch}.html"}
    expected_sources |= {str(p.relative_to(ROOT)) for p in (ROOT / f"examples/{ch}").rglob("*") if p.is_file() and "__pycache__" not in p.parts}
    hashes = json.loads((REVIEW / f"{ch}-independent-source-hashes.json").read_text())
    check(f"independent review covers complete source set: {ch}", set(hashes["after"]) == expected_sources)
    check(f"independent review after dictionary current: {ch}", all(digest(filename) == expected for filename, expected in hashes["after"].items()))
    report = REVIEW / f"{ch}-independent-review.md"
    check(f"independent final report exists: {ch}", report.is_file() and report.stat().st_size > 0)
    review_sources[ch] = {"report": str(report.relative_to(ROOT)), "reportHash": digest(str(report.relative_to(ROOT))), "after": hashes["after"], "initialAndFinalIdentical": hashes["unchanged"]}

scope = read("scope-results")
check("authorization scope and all earlier uncommitted work preserved", scope["passed"] and not any(not row["allowed"] for row in scope["changes"]))
for ch, row in scope["chapters"].items():
    check(f"scope inventory current: {ch}", digest(f"chapters/{ch}.html") == row["sha256"])

result = {
    "at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "sourceHashes": checks["sourceHashes"], "independentReviews": review_sources,
    "handoffHashes": {name: digest(name) for name in ("PLAN.md", f"docs/reviews/{PREFIX}-review.md")},
    "assertions": assertions, "passed": all(row["passed"] for row in assertions),
    "limits": "Evidence consistency and source/visual applicability checks do not replace human technical review or establish production reliability.",
}
(REVIEW / f"{PREFIX}-evidence-consistency.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"passed": result["passed"], "assertions": len(assertions), "failures": [row for row in assertions if not row["passed"]]}, ensure_ascii=False))
raise SystemExit(0 if result["passed"] else 1)
