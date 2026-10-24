from pathlib import Path
import subprocess,os,json,hashlib
commands=[['node','tools/check.mjs'],['node','tools/audit-chapter.mjs','ch36'],['git','diff','--check'],['python3','examples/ch36/run.py'],['python3','docs/reviews/ch36-numeric.py'],['python3','docs/reviews/ch36-evidence.py']]
results=[]
for cmd in commands:
 r=subprocess.run(cmd,capture_output=True,text=True,env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'})
 results.append({'command':cmd,'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr})
 assert r.returncode==0,(cmd,r.stderr)
expected=json.loads(Path('docs/reviews/ch36-final-hashes.json').read_text())
assert all(hashlib.sha256(Path(p).read_bytes()).hexdigest()==h for p,h in expected.items())
assert not Path('examples/ch36/__pycache__').exists()
out={'passed':True,'results':results,'sourceHashes':expected,'noBytecodeCache':True}
Path('docs/reviews/ch36-check-results.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'passed':True,'commands':len(results),'sourceFiles':len(expected),'noBytecodeCache':True}))
