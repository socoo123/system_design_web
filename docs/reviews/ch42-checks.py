"""Reproduce author checks; all compiled/database artifacts live in /tmp."""
from pathlib import Path
from decimal import Decimal
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[2]
env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
results = []


def run(command):
    result = subprocess.run(command, cwd=root, env=env, text=True, capture_output=True)
    results.append(dict(command=command, exit=result.returncode, stdout=result.stdout, stderr=result.stderr))
    if result.returncode:
        raise RuntimeError(str(command) + "\n" + result.stdout + result.stderr)


paths = [root / "chapters/ch42.html", *sorted((root / "examples/ch42").glob("*"))]
paths = [p for p in paths if p.is_file()]
hashes = lambda: {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
before = hashes()
try:
    run([sys.executable, "examples/ch42/check_sources.py"])
    run([sys.executable, "examples/ch42/check_effect.py"])
    jdk = "/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin/"
    with tempfile.TemporaryDirectory(prefix="ch42-java-") as output:
        run([jdk + "javac", "-d", output, "examples/ch42/Resilience.java"])
        run([jdk + "java", "-cp", output, "Resilience"])
    run(["node", "tools/audit-chapter.mjs", "ch42"])
    run(["node", "tools/check.mjs"])
    run(["node", "--check", "docs/reviews/ch42-browser.mjs"])
    run(["node", "--check", "docs/reviews/ch42-frames.mjs"])
    run(["git", "diff", "--check", "--", "chapters/ch42.html", "examples/ch42", "docs/reviews/ch42*"])
    baseline = (root / "docs/reviews/ch40-ch41-ch42-baseline/ch42.html").read_text()
    current = (root / "chapters/ch42.html").read_text()
    ids = lambda s: re.findall(r'<(?:title|desc) id="([^"]+)"', s)
    assert ids(baseline) == ids(current)
    frame_match = r'<svg\b[^>]*class="board"[^>]*>[\s\S]*?</svg>'
    old_frames, new_frames = [re.findall(frame_match, s) for s in [baseline, current]]
    assert len(old_frames) == len(new_frames) == 40
    changes = [re.search(r'aria-labelledby="(\S+)t ', a)[1]
               for a, b in zip(old_frames, new_frames) if a != b]
    inventory = dict(decks=7, frames=40, title_desc_ids=len(ids(current)), changed_frames=changes,
                     unchanged_frames=40-len(changes), original_order_preserved=True)
    numerics = dict(
        incident_backlog=(1200-600)*9*60,
        drain_seconds=324000/(1200-600),
        raw_TB=str(Decimal(1200)*86400*1000*7*3/Decimal(10**12)),
        deadline_spent_ms=50+300+100+250+50,
        normal_mean_active=100*0.08,
        incident_mean_active=100*2,
        mean_capacity_when_slow=20/2,
        amplification=3**3,
        retry_tier_limit=100*Decimal("1.1"),
        probe_round_limit=8*3,
        ready_capacity=3*250,
        failure_capacity=2*250,
        one_failure_replicas=(600+250-1)//250+1,
    )
    assert numerics["incident_backlog"] == 324000 and numerics["drain_seconds"] == 540
    assert numerics["raw_TB"] == "2.17728" and numerics["deadline_spent_ms"] == 750
    assert numerics["normal_mean_active"] == 8 and numerics["incident_mean_active"] == 200
    assert numerics["mean_capacity_when_slow"] == 10 and numerics["amplification"] == 27
    assert numerics["retry_tier_limit"] == 110 and numerics["probe_round_limit"] == 24
    assert numerics["ready_capacity"] == 750 and numerics["failure_capacity"] == 500
    assert numerics["one_failure_replicas"] == 4
    assert hashes() == before, "sources changed during verification"
    report = dict(passed=True, commands=results, inventory=inventory, calculations=numerics, sourceHashes=before)
except BaseException as error:
    report = dict(passed=False, error=str(error), commands=results, sourceHashes=before)
    raise
finally:
    (root / "docs/reviews/ch42-check-results.json").write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str)+"\n")
print(json.dumps({"passed": report["passed"], "commands": len(results), "inventory": inventory}, ensure_ascii=False))
