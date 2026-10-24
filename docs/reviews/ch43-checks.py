"""Repeatable author command evidence. Does not write shared files or site content."""
import datetime
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
JAVA = "/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin/"
commands = []
with tempfile.TemporaryDirectory(prefix="ch43-java-") as out:
    for args in [
        [JAVA + "javac", "--release", "17", "-d", out, "examples/ch43/ExternalAggregate.java"],
        [JAVA + "java", "-cp", out, "ExternalAggregate"],
        ["python3", "examples/ch43/catalog_contract.py"],
        ["python3", "examples/ch43/check_source.py"],
        ["node", "tools/audit-chapter.mjs", "ch43"],
        ["git", "diff", "--check", "--", "chapters/ch43.html", "examples/ch43", "docs/reviews/ch43.md"],
    ]:
        result = subprocess.run(args, cwd=ROOT, text=True, capture_output=True)
        commands.append({"command": args, "exitCode": result.returncode,
                         "stdout": result.stdout, "stderr": result.stderr})

files = [ROOT / "chapters/ch43.html", *sorted((ROOT / "examples/ch43").glob("*"))]
evidence = {
    "recordedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "passed": all(command["exitCode"] == 0 for command in commands),
    "commands": commands,
    "sourceHashes": {str(file.relative_to(ROOT)): hashlib.sha256(file.read_bytes()).hexdigest()
                     for file in files if file.is_file()},
    "scope": "Author local example/SQLite/structure checks, not distributed storage validation",
}
(ROOT / "docs/reviews/ch43-check-results.json").write_text(json.dumps(evidence, indent=2) + "\n")
print(json.dumps({"passed": evidence["passed"], "commands": len(commands),
                  "failures": [command for command in commands if command["exitCode"]]}))
raise SystemExit(0 if evidence["passed"] else 1)
