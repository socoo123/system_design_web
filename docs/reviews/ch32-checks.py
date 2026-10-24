from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib,json,os,subprocess

root=Path(__file__).resolve().parents[2]
commands=[['python3','examples/ch32/check.py'],['python3','docs/reviews/ch32-numeric.py'],
          ['node','examples/ch32/sync.mjs','--check'],['node','tools/audit-chapter.mjs','ch32'],
          ['node','tools/check.mjs'],['git','diff','--check'],
          ['node','--check','examples/ch32/sync.mjs'],['node','--check','docs/reviews/ch32-browser.mjs']]
def run(command):
    p=subprocess.run(command,cwd=root,env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'},capture_output=True,text=True)
    return {'command':command,'exit_code':p.returncode,'stdout':p.stdout,'stderr':p.stderr,'passed':p.returncode==0}
with ThreadPoolExecutor(max_workers=4) as pool:
    results=list(pool.map(run,commands))
files=[root/'chapters/ch32.html',*sorted((root/'examples/ch32').glob('*'))]
hashes={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files if p.is_file()}
out={'passed':all(r['passed'] for r in results),'checks':results,'source_hashes':hashes}
(root/'docs/reviews/ch32-check-results.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'passed':out['passed'],'commands':len(results)}))
assert out['passed']
