"""Run final integration checks and detect source edits during the run."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import datetime
import hashlib
import json
import os
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
PREFIX = "ch31-ch32-ch33"


def sources():
    files = [ROOT / f"chapters/ch{n}.html" for n in (31, 32, 33)]
    files += [p for n in (31, 32, 33) for p in (ROOT / f"examples/ch{n}").rglob("*")
              if p.is_file() and "__pycache__" not in p.parts]
    files += [p for p in (ROOT / "assets/js").glob("*.js")]
    return {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(files)}


def execute(command):
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
    result = subprocess.run(command, cwd=ROOT, env=env, text=True, capture_output=True)
    return {"command": command, "exitCode": result.returncode, "stdout": result.stdout, "stderr": result.stderr}


before = sources()
commands = [["node", "tools/check.mjs"], ["node", "--test", "tools/validation.test.mjs"]]
commands += [["node", "tools/audit-chapter.mjs", f"ch{n}"] for n in (31, 32, 33)]
commands += [["node", f"examples/ch{n}/sync.mjs", "--check"] for n in (31, 32, 33)]
commands += [[sys.executable, f"examples/ch{n}/check.py"] for n in (31, 32, 33)]
commands += [[sys.executable, f"docs/reviews/{PREFIX}-root-{name}.py"] for name in ("vector", "ledger", "tools")]
commands += [[sys.executable, f"docs/reviews/{PREFIX}-numeric.py"], ["git", "diff", "--check"]]
with ThreadPoolExecutor(max_workers=3) as pool:
    results = list(pool.map(execute, commands))

jdk = Path("/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin")
with tempfile.TemporaryDirectory() as compiled:
    compile_command = [str(jdk / "javac"), "--release", "17", "-d", compiled, "examples/ch31/VectorCandidates.java"]
    compiled_result = execute(compile_command)
    compiled_result["command"][4] = "<temporary class directory>"
    results.append(compiled_result)
    if compiled_result["exitCode"] == 0:
        executed = execute([str(jdk / "java"), "-cp", compiled, "VectorCandidates"])
        executed["command"][2] = "<temporary class directory>"
        results.append(executed)

js_files = sorted((ROOT / "assets/js").glob("*.js")) + sorted((ROOT / "examples").glob("ch3[123]/*.mjs"))
js_files += sorted((ROOT / "docs/reviews").glob(f"{PREFIX}-*.mjs"))
for filename in js_files:
    results.append(execute(["node", "--check", str(filename.relative_to(ROOT))]))

after = sources()
result = {
    "at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "sourceHashes": after,
    "sourcesUnchangedDuringRun": before == after, "checks": results,
    "passed": before == after and all(r["exitCode"] == 0 for r in results),
    "limits": "Executed educational CPU/SQLite models and static checks. Provider calls, real vector indexes, PostgreSQL replication and network streaming were not exercised.",
}
(ROOT / f"docs/reviews/{PREFIX}-checks.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
(ROOT / f"docs/reviews/{PREFIX}-checks.txt").write_text("\n\n".join(
    "COMMAND " + " ".join(r["command"]) + f"\nEXIT {r['exitCode']}\n" + r["stdout"] + r["stderr"] for r in results))
print(json.dumps({"passed": result["passed"], "commands": len(results),
                  "sourcesUnchanged": before == after,
                  "failures": [{"command": r["command"], "exitCode": r["exitCode"], "output": (r["stdout"] + r["stderr"])[-1500:]} for r in results if r["exitCode"]]}, ensure_ascii=False))
raise SystemExit(0 if result["passed"] else 1)
