"""Compile and execute the actual VerifiedRead class with independent inputs."""
from pathlib import Path
import hashlib
import json
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
java = Path('/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin')
sources = ['examples/ch22/VerifiedRead.java', 'docs/reviews/ch22-ch23-ch24-root-ReadProbe.java']
hashes = {name: hashlib.sha256((root/name).read_bytes()).hexdigest() for name in sources}
with tempfile.TemporaryDirectory(prefix='ch22-root-read-') as build:
    compile = subprocess.run([str(java/'javac'), '--release', '17', '-d', build, *[str(root/p) for p in sources]], capture_output=True, text=True)
    if compile.returncode:
        raise RuntimeError(compile.stdout+compile.stderr)
    run = subprocess.run([str(java/'java'), '-cp', build, 'ReadProbe'], capture_output=True, text=True, check=True)
result = json.loads(run.stdout)
result['sourceHashes'] = hashes
result['sourcesUnchangedDuringRun'] = all(hashlib.sha256((root/name).read_bytes()).hexdigest() == expected for name,expected in hashes.items())
result['passed'] = result['passed'] and result['sourcesUnchangedDuringRun']
result['javaVersion'] = subprocess.run([str(java/'java'), '-version'], capture_output=True, text=True).stderr
(root/'docs/reviews/ch22-ch23-ch24-root-read-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(result))
raise SystemExit(0 if result['passed'] else 1)
