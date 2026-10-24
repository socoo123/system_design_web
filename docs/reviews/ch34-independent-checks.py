from pathlib import Path
import subprocess,json,runpy,sys,contextlib,io,hashlib,os
outputs=[]
for cmd in [['node','tools/audit-chapter.mjs','ch34'],['node','examples/ch34/sync.mjs','--check'],['git','diff','--check']]:
 r=subprocess.run(cmd,capture_output=True,text=True,env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'});outputs.append({'command':cmd,'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr});assert r.returncode==0
# Keep all authored checks intact; redirect only their output file in memory.
p=Path('examples/ch34/check.py').resolve();source=p.read_text();old="ROOT/'docs/reviews/ch34-code-results.json'";assert source.count(old)==1
source=source.replace(old,"ROOT/'docs/reviews/ch34-independent-author-rerun.json'")
sys.path.insert(0,str(p.parent));capture=io.StringIO()
with contextlib.redirect_stdout(capture):exec(compile(source,str(p),'exec'),{'__file__':str(p),'__name__':'__main__'})
outputs.append({'command':'author check.py; only result path redirected in memory','exit':0,'stdout':capture.getvalue()})
Path('docs/reviews/ch34-independent-check-results.json').write_text(json.dumps({'passed':True,'results':outputs},indent=2)+'\n')
print('independent checks',len(outputs),'passed')
