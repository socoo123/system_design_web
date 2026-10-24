from pathlib import Path
from tempfile import TemporaryDirectory
import hashlib,json,subprocess
root=Path(__file__).resolve().parents[2]
here=Path(__file__).parent
with TemporaryDirectory(prefix='ch22-java-') as out:
    compile_result=subprocess.run(['javac','--release','17','-d',out,str(here/'VerifiedRead.java'),str(here/'VerifiedReadTest.java')],capture_output=True,text=True)
    compile_result.check_returncode()
    run=subprocess.run(['java','-cp',out,'VerifiedReadTest'],capture_output=True,text=True)
    run.check_returncode()
    result={'compiler':subprocess.run(['javac','-version'],capture_output=True,text=True).stdout.strip(),
            'runtime':subprocess.run(['java','-version'],capture_output=True,text=True).stderr.strip(),
            'release':17,'compile_exit':compile_result.returncode,'run_exit':run.returncode,
            'output':run.stdout.splitlines(),'checks':sum(x.startswith('PASS ') for x in run.stdout.splitlines()),
            'source_hashes':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [here/'VerifiedRead.java',here/'VerifiedReadTest.java']}}
    (root/'docs/reviews/ch22-java-results.json').write_text(json.dumps(result,indent=2)+'\n')
    print(run.stdout)
