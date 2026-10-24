"""Reproducible local Java 17 + source/inventory + SQLite verification."""
from pathlib import Path
import json
import os
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
JDK = Path(os.environ.get('CH40_JAVA_HOME', '/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home'))
env = {**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'}
commands = []


def run(args):
    result = subprocess.run(args, cwd=ROOT, env=env, text=True, capture_output=True)
    commands.append({'command': args, 'exitCode': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr})
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout)
    return result.stdout


run(['node', 'examples/ch40/sync.mjs', '--check'])
with tempfile.TemporaryDirectory(prefix='ch40-java-') as build:
    run([str(JDK / 'bin/javac'), '--release', '17', '-d', build,
         'examples/ch40/ProtocolContracts.java', 'examples/ch40/ProtocolContractsTest.java'])
    java = json.loads(run([str(JDK / 'bin/java'), '-cp', build, 'ProtocolContractsTest']))
    (ROOT / 'docs/reviews/ch40-java-results.json').write_text(json.dumps(java, indent=2) + '\n')
run(['python3', 'examples/ch40/verify.py'])
(ROOT / 'docs/reviews/ch40-run-results.json').write_text(json.dumps({'passed': True, 'commands': commands}, indent=2) + '\n')
print(json.dumps({'passed': True, 'javaChecks': java['passed'], 'commands': len(commands)}))
