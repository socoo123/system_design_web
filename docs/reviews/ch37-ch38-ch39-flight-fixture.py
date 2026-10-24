"""Repeat the repaired author fixture in fresh JVMs after an observed scheduling race."""
from pathlib import Path
import hashlib
import json
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
SOURCE = 'examples/ch38/SingleFlight.java'
before = hashlib.sha256((ROOT / SOURCE).read_bytes()).hexdigest()
jdk = Path('/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin')
with tempfile.TemporaryDirectory() as directory:
    compiled = subprocess.run([str(jdk / 'javac'), '--release', '17', '-d', directory, str(ROOT / SOURCE)],
                              capture_output=True, text=True)
    runs = []
    if compiled.returncode == 0:
        for number in range(20):
            completed = subprocess.run([str(jdk / 'java'), '-cp', directory, 'SingleFlight'],
                                       capture_output=True, text=True)
            runs.append({'run': number + 1, 'exitCode': completed.returncode,
                         'stdout': completed.stdout, 'stderr': completed.stderr})
after = hashlib.sha256((ROOT / SOURCE).read_bytes()).hexdigest()
result = {'sourceHashes': {SOURCE: after}, 'sourcesUnchangedDuringRun': before == after,
          'compileExit': compiled.returncode, 'compileStderr': compiled.stderr, 'runs': runs,
          'passed': before == after and compiled.returncode == 0 and len(runs) == 20
                    and all(run['exitCode'] == 0 for run in runs),
          'limits': 'Twenty repetitions of one corrected fixture in fresh Java17 processes. This is a regression stability check after an observed test race, not twenty independent feature scenarios or a production scheduling guarantee.'}
(ROOT / 'docs/reviews/ch37-ch38-ch39-flight-fixture-results.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'passed': result['passed'], 'runs': len(runs), 'failures': [run for run in runs if run['exitCode']]}))
raise SystemExit(0 if result['passed'] else 1)
