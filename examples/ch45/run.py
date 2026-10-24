from pathlib import Path
import hashlib
import json
import os
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
example = root / "examples/ch45"
jdk = Path(os.environ.get("CH45_JAVA_HOME", "/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home"))
commands = []


def run(argv):
    result = subprocess.run([str(item) for item in argv], cwd=root, capture_output=True, text=True)
    commands.append({"argv": [str(item) for item in argv], "exitCode": result.returncode,
                     "stdout": result.stdout, "stderr": result.stderr})
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout)
    return result.stdout


report = {"passed": False, "commands": commands}
try:
    with tempfile.TemporaryDirectory(prefix="ch45-java-") as compiled:
        run([jdk / "bin/java", "-version"])
        report["javaVersion"] = commands[-1]["stderr"].strip()
        run([jdk / "bin/javac", "--release", "17", "-d", compiled, example / "DomainModel.java"])
        report["java"] = json.loads(run([jdk / "bin/java", "-cp", compiled, "DomainModel"]))
    report["sql"] = json.loads(run(["python3", example / "verify.py"]))
    report["sync"] = json.loads(run(["node", example / "sync.mjs", "--check"]))
    report["passed"] = True
except Exception as error:
    report["failure"] = str(error)
finally:
    files = [root / "chapters/ch45.html"] + sorted(path for path in example.rglob("*") if path.is_file() and "__pycache__" not in path.parts)
    report["sourceHashes"] = {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest() for path in files}
    (root / "docs/reviews/ch45-code-results.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({key: report.get(key) for key in ["passed", "failure", "java", "sql", "sync"]}))
if not report["passed"]:
    raise SystemExit(1)
