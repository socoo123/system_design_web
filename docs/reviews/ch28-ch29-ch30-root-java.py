"""Compile and run the independent probes against the actual five Java teaching classes."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import subprocess
import tempfile
import sys

root = Path(__file__).resolve().parents[2]
java = Path('/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin')
names = ['examples/ch28/ConfigClient.java', 'examples/ch28/Cohort.java', 'examples/ch28/WatchHub.java',
         'examples/ch29/KvLedger.java', 'examples/ch30/RagCore.java',
         'docs/reviews/ch28-ch29-ch30-RootProbe.java']
record = dict(at=datetime.now(timezone.utc).isoformat(), passed=False,
              sourceHashes={name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in names})
with tempfile.TemporaryDirectory(prefix='wave9-root-java-') as out:
    compiled = subprocess.run([str(java / 'javac'), '--release', '17', '-d', out, *names],
                              cwd=root, capture_output=True, text=True)
    record.update(compileExit=compiled.returncode, compileOutput=compiled.stdout + compiled.stderr)
    if compiled.returncode == 0:
        run = subprocess.run([str(java / 'java'), '-cp', out, 'RootProbe'], capture_output=True, text=True)
        record.update(runExit=run.returncode, runOutput=run.stdout + run.stderr)
        if run.returncode == 0:
            record['model'] = json.loads(run.stdout)
            record['passed'] = record['model']['passed']
record['limitations'] = 'Actual Java17 CPU models and threads only; no CUDA fence, distributed watch, real tokenizer or model inference.'
(root / 'docs/reviews/ch28-ch29-ch30-root-java-results.json').write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(dict(passed=record['passed'], model=record.get('model'), output=record.get('runOutput') if not record['passed'] else None)))
sys.exit(0 if record['passed'] else 1)
