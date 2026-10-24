"""Compile Java17 sources and run author cases plus independent probe inputs."""
from pathlib import Path
import hashlib
import json
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
PREFIX = 'ch40-ch41-ch42'
JDK = Path('/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin')
groups = {
    'protocol': dict(sources=['examples/ch40/ProtocolContracts.java', 'examples/ch40/ProtocolContractsTest.java',
                             f'docs/reviews/{PREFIX}-root-ProtocolProbe.java'],
                     mains=['ProtocolContractsTest', 'ProtocolProbe']),
    'read': dict(sources=['examples/ch41/ReadGate.java', 'examples/ch41/ReadGateProbe.java',
                         f'docs/reviews/{PREFIX}-root-ReadProbe.java'], mains=['ReadGateProbe', 'RootReadProbe']),
    'resilience': dict(sources=['examples/ch42/Resilience.java', f'docs/reviews/{PREFIX}-DelayedIoProbe.java'],
                       mains=['Resilience', 'DelayedIoProbe']),
}
result = dict(groups={}, limits='Java17 local policy classes and controlled scheduling. No real transport, replica, broker, Kubernetes, remote cancellation or load experiment.')
for label, group in groups.items():
    original = {p: (ROOT / p).read_bytes() for p in group['sources']}
    hashes = {p: hashlib.sha256(value).hexdigest() for p, value in original.items()}
    with tempfile.TemporaryDirectory(prefix=PREFIX + '-java-') as directory:
        directory = Path(directory)
        sources = []
        for path, data in original.items():
            target = directory / Path(path).name
            target.write_bytes(data)
            sources.append(str(target))
        compile_run = subprocess.run([str(JDK / 'javac'), '--release', '17', '-d', str(directory), *sources],
                                     capture_output=True, text=True)
        entry = dict(sourceHashes=hashes, compile=dict(exitCode=compile_run.returncode,
                     output=(compile_run.stdout + compile_run.stderr).replace(str(directory), '<temporary directory>')), runs=[])
        if compile_run.returncode == 0:
            for main in group['mains']:
                run = subprocess.run([str(JDK / 'java'), '-cp', str(directory), main],
                                     capture_output=True, text=True, timeout=15)
                entry['runs'].append(dict(main=main, exitCode=run.returncode,
                                          output=(run.stdout + run.stderr).replace(str(directory), '<temporary directory>')))
        entry['sourcesUnchangedDuringRun'] = all((ROOT / p).read_bytes() == data for p, data in original.items())
        entry['passed'] = (compile_run.returncode == 0 and len(entry['runs']) == len(group['mains'])
                           and all(r['exitCode'] == 0 for r in entry['runs']) and entry['sourcesUnchangedDuringRun'])
        result['groups'][label] = entry
result['passed'] = all(x['passed'] for x in result['groups'].values())
(ROOT / f'docs/reviews/{PREFIX}-root-java-results.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
raise SystemExit(0 if result['passed'] else 1)
