import json,subprocess,hashlib
from pathlib import Path
from tempfile import TemporaryDirectory
ROOT=Path(__file__).resolve().parents[2]
jdk=Path('/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home')
sources=[ROOT/'examples/ch22/VerifiedRead.java',ROOT/'docs/reviews/ch22-independent-VerifiedRead.java']
with TemporaryDirectory(prefix='ch22-independent-java-') as out:
    compiled=subprocess.run([str(jdk/'bin/javac'),'--release','17','-d',out,*map(str,sources)],capture_output=True,text=True)
    compiled.check_returncode()
    run=subprocess.run([str(jdk/'bin/java'),'-cp',out,'Ch22IndependentRead'],capture_output=True,text=True);run.check_returncode()
    result={'passed':True,'runtime':subprocess.run([str(jdk/'bin/java'),'-version'],capture_output=True,text=True).stderr.splitlines()[0],
            'checks':run.stdout.count('PASS '),'output':run.stdout,'sourceHashes':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}}
    (ROOT/'docs/reviews/ch22-independent-java-results.json').write_text(json.dumps(result,indent=2)+'\n');print(run.stdout)
