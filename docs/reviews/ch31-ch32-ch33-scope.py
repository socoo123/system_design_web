"""Compare with this batch's authorization baseline, including earlier untracked work."""
from pathlib import Path
import datetime
import hashlib
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
PREFIX = "ch31-ch32-ch33"
BASE = json.loads((ROOT / f"docs/reviews/{PREFIX}-baseline.json").read_text())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def allowed(name):
    if name == "PLAN.md":
        return True
    if name.startswith(f"docs/reviews/{PREFIX}-"):
        return True
    for ch in ("ch31", "ch32", "ch33"):
        if name == f"chapters/{ch}.html" or name == f"docs/reviews/{ch}.md":
            return True
        if name.startswith((f"examples/{ch}/", f"diagrams/{ch}/", f"assets/diagrams/{ch}/", f"docs/reviews/{ch}-")):
            return True
    return False


current = set(subprocess.check_output(
    ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"], cwd=ROOT
).decode().split("\0")) - {""}
changes = []
for name, old_hash in BASE["fileHashes"].items():
    path = ROOT / name
    if not path.is_file():
        changes.append({"file": name, "change": "removed", "allowed": allowed(name)})
    elif digest(path) != old_hash:
        changes.append({"file": name, "change": "modified", "allowed": allowed(name)})
for name in sorted(current - BASE["fileHashes"].keys()):
    if (ROOT / name).is_file():
        changes.append({"file": name, "change": "added", "allowed": allowed(name)})

chapters = {}
for ch, baseline in BASE["chapters"].items():
    path = ROOT / f"chapters/{ch}.html"
    html = path.read_text()
    ids = re.findall(r'\bid="([^"]+)"', html)
    decks = re.findall(r'<figure\b[^>]*class="deck"[^>]*>[\s\S]*?</figure>', html)
    frames = [len(re.findall(r'<div class="slide"', figure)) for figure in decks]
    missing = sorted(set(baseline["allIds"]) - set(ids))
    required_ids = {value for value in baseline["allIds"] if value == ch or re.fullmatch(r"d\d+s\d+[td]", value)}
    chapters[ch] = {
        "sha256": digest(path), "deckFrames": frames,
        "deckFramesPreserved": frames == [d["frames"] for d in baseline["decks"]],
        "missingAnimationOrChapterIds": sorted(required_ids - set(ids)),
        "removedNonAnimationIds": sorted(set(missing) - required_ids),
        "codeBlocks": len(re.findall(r"<pre\b", html)),
    }

passed = not any(not row["allowed"] for row in changes) and all(
    row["deckFramesPreserved"] and not row["missingAnimationOrChapterIds"] for row in chapters.values()
)
result = {
    "at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "baselineFiles": len(BASE["fileHashes"]), "changes": changes,
    "chapters": chapters, "passed": passed,
    "limitation": "Ignored local screenshots are outside the git-file hash inventory; new screenshot evidence is recorded separately.",
}
(ROOT / f"docs/reviews/{PREFIX}-scope-results.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"passed": passed, "changes": len(changes), "outOfScope": [r for r in changes if not r["allowed"]], "chapters": chapters}, ensure_ascii=False))
raise SystemExit(0 if passed else 1)
