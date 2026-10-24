from pathlib import Path
import subprocess,tempfile,json,hashlib,os,sys
ROOT=Path(__file__).resolve().parents[2]
JDK=Path('/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin')
expected=json.loads((ROOT/'docs/reviews/ch38-independent-source-after.json').read_text())
def hashes():return {p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in expected}
result={'sourceHashesBefore':hashes(),'commands':[]}
assert result['sourceHashesBefore']==expected

def run(cmd):
 p=subprocess.run([str(c) for c in cmd],cwd=ROOT,env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'},capture_output=True,text=True,timeout=90)
 r={'command':[str(c) for c in cmd],'exitCode':p.returncode,'stdout':p.stdout,'stderr':p.stderr};result['commands'].append(r)
 if p.returncode:raise AssertionError(r)
 return p.stdout
try:
 run(['node','tools/check.mjs']);run(['node','tools/audit-chapter.mjs','ch38']);run(['node','examples/ch38/sync.mjs','--check'])
 run([sys.executable,'examples/ch38/run.py','--out','docs/reviews/ch38-independent-author-run.json'])
 run([sys.executable,'docs/reviews/ch38-independent-cache.py'])
 run([sys.executable,'docs/reviews/ch38-independent-negative-rate.py'])
 with tempfile.TemporaryDirectory(prefix='ch38-review-final-java-') as output:
  run([JDK/'javac','--release','17','-d',output,'examples/ch38/AgeBudget.java','examples/ch38/SingleFlight.java','docs/reviews/ch38-independent-Probe.java'])
  result['authorAge']=run([JDK/'java','-cp',output,'AgeBudget'])
  result['authorFlight']=run([JDK/'java','-cp',output,'SingleFlight'])
  result['independentJava']=json.loads(run([JDK/'java','-cp',output,'Ch38IndependentProbe']))
 run(['node','--check','docs/reviews/ch38-independent-browser.mjs']);run(['node','--check','docs/reviews/ch38-independent-render.mjs']);run(['git','diff','--check'])
 result['passed']=True
finally:
 result['sourceHashesAfter']=hashes();result['sourcesStable']=result['sourceHashesBefore']==result['sourceHashesAfter']
 (ROOT/'docs/reviews/ch38-independent-check-results.json').write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps({'passed':result.get('passed',False),'commands':len(result['commands']),'sourcesStable':result['sourcesStable']}))
