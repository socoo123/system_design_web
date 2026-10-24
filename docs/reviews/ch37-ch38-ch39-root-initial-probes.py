"""Archive and exercise two implementation-stage identity-binding candidates."""
from pathlib import Path
import hashlib
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import time

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs/reviews/ch37-ch38-ch39-root-initial'
OUT.mkdir(exist_ok=True)
files = ['examples/ch37/storage.py', 'examples/ch37/schema.sql', 'examples/ch37/publication.sql',
         'examples/ch39/LoadBalancing.java']
hashes = {}
for name in files:
    target = OUT / Path(name).name
    if not target.exists():
        shutil.copyfile(ROOT / name, target)
    hashes[name] = hashlib.sha256(target.read_bytes()).hexdigest()
spec = importlib.util.spec_from_file_location('root_initial_storage', OUT / 'storage.py')
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
with tempfile.TemporaryDirectory() as directory:
    file = str(Path(directory) / 'orders.db')
    module.initialize(file, {})
    db = module.connect(file)
    for upload in ('upload-a', 'upload-b'):
        db.execute("INSERT INTO upload VALUES (?,?, 'PENDING',10,'same-content',?,NULL)",
                   ('caller', upload, int(time.time()) + 1000))
    db.close()
    wrong_session_proof = {'version': 'upload-b/version-1', 'size': 10, 'checksum': 'same-content'}
    applied = module.publication(file, 'caller', 'upload-a', wrong_session_proof)

    java = '''class InitialProbe {
 public static void main(String[] args) {
  var fresh = new LoadBalancing.Gate(2, 1, () -> 100L);
  fresh.ready(2);
  fresh.beginDrain(7, 1000); // delayed revision-7 command intended for incarnation 1
  System.out.println("newIncarnationRejectsCurrentWork=" + (fresh.tryAdmit(2, 500) == null));
 }
}'''
    source = Path(directory) / 'InitialProbe.java'
    source.write_text(java)
    (OUT / 'InitialProbe.java').write_text(java)
    jdk = Path('/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin')
    compiled = subprocess.run([str(jdk / 'javac'), '--release', '17', '-d', directory,
                               str(OUT / 'LoadBalancing.java'), str(source)], capture_output=True, text=True)
    run = subprocess.run([str(jdk / 'java'), '-cp', directory, 'InitialProbe'], capture_output=True, text=True) if compiled.returncode == 0 else None

result = {'stage': 'implementation in progress; candidate findings sent to authors before delivery',
          'archivedSourceHashes': hashes,
          'publicationCandidate': {'input': wrong_session_proof, 'target': 'upload-a', 'result': applied,
                                   'boundary': 'The adapter receives trusted proof; the missing session binding must be checked explicitly or specified as a narrow verifier precondition. This run is not an exploit of a real object service.'},
          'staleDrainCandidate': {'compileExit': compiled.returncode,
                                 'runExit': None if run is None else run.returncode,
                                 'stdout': '' if run is None else run.stdout,
                                 'stderr': compiled.stderr + ('' if run is None else run.stderr),
                                 'boundary': 'A delayed coordinator command addressed by reused endpoint can close the fresh gate unless its incarnation is checked before beginDrain.'}}
(ROOT / 'docs/reviews/ch37-ch38-ch39-root-initial-findings.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(result, ensure_ascii=False))
