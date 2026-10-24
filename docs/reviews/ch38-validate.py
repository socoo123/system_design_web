from pathlib import Path
import hashlib,json,subprocess,sys,tempfile
root=Path.cwd()
files=[Path('chapters/ch38.html'),*sorted(Path('examples/ch38').glob('*'))]
def hashes():return {str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in files if p.is_file()}
before=hashes();jdk='/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin/'
classes=tempfile.mkdtemp(prefix='ch38-java-final-')
commands=[['node','tools/check.mjs'],['node','tools/audit-chapter.mjs','ch38'],['node','examples/ch38/sync.mjs','--check'],
 ['node','--check','examples/ch38/sync.mjs'],['node','--check','docs/reviews/ch38-browser.mjs'],['node','--check','docs/reviews/ch38-render.mjs'],
 [sys.executable,'-B','examples/ch38/run.py','--out','docs/reviews/ch38-example-results.json'],
 [jdk+'java','-version'],[jdk+'javac','--release','17','-d',classes,'examples/ch38/AgeBudget.java','examples/ch38/SingleFlight.java'],
 [jdk+'java','-cp',classes,'AgeBudget'],[jdk+'java','-cp',classes,'SingleFlight'],['git','diff','--check']]
results=[];logs=[]
for cmd in commands:
 r=subprocess.run(cmd,text=True,capture_output=True)
 results.append({'command':cmd,'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr})
 logs.append('$ '+' '.join(cmd)+'\n'+r.stdout+r.stderr)
 print('PASS' if r.returncode==0 else 'FAIL', ' '.join(cmd))
 if r.returncode:break
after=hashes()
report={'commands':results,'sourceBefore':before,'sourceAfter':after,'unchangedDuringChecks':before==after}
Path('docs/reviews/ch38-checks.json').write_text(json.dumps(report,indent=2)+'\n')
Path('docs/reviews/ch38-check-output.txt').write_text('\n'.join(logs))
Path('docs/reviews/ch38-source-hashes.json').write_text(json.dumps(after,indent=2)+'\n')
assert all(r['exit']==0 for r in results) and before==after
