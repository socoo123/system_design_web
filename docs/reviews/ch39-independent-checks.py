from pathlib import Path
import hashlib,json,subprocess,tempfile,datetime
files=[Path('chapters/ch39.html'),*sorted(Path('examples/ch39').glob('*'))]
def hashes():return {str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in files if p.is_file()}
before=hashes();jdk='/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin/';classes=tempfile.mkdtemp(prefix='ch39-independent-')
commands=[['node','tools/check.mjs'],['node','tools/audit-chapter.mjs','ch39'],['node','examples/ch39/sync.mjs','--check'],
 ['python3','-B','docs/reviews/ch39-independent-numeric.py'],[jdk+'java','-version'],
 [jdk+'javac','--release','17','-d',classes,'examples/ch39/LoadBalancing.java','examples/ch39/LoadBalancingTest.java','docs/reviews/ch39-independent-GateProbe.java'],
 [jdk+'java','-cp',classes,'Ch39IndependentGateProbe'],[jdk+'java','-cp',classes,'LoadBalancingTest'],
 ['node','--check','docs/reviews/ch39-independent-browser.mjs'],['node','--check','docs/reviews/ch39-independent-render.mjs'],['node','--check','docs/reviews/ch39-independent-focus.mjs'],['git','diff','--check']]
results=[]
for cmd in commands:
 r=subprocess.run(cmd,text=True,capture_output=True);results.append({'command':cmd,'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr});print(('PASS' if r.returncode==0 else 'FAIL')+' '+' '.join(cmd))
 if r.returncode:break
after=hashes();Path('docs/reviews/ch39-independent-checks.json').write_text(json.dumps({'sourceBeforeCommands':before,'sourceAfterCommands':after,'unchangedDuringFinalCommands':before==after,'commands':results},indent=2)+'\n')
Path('docs/reviews/ch39-independent-checks.txt').write_text('\n'.join('$ '+' '.join(r['command'])+'\n'+r['stdout']+r['stderr'] for r in results))
Path('docs/reviews/ch39-independent-source-after.json').write_text(json.dumps({'capturedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'hashes':after},indent=2)+'\n')
assert all(r['exit']==0 for r in results) and before==after
