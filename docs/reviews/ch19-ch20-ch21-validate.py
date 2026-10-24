"""Reproducible integration checks; CHAPTERS reruns only changed chapters and shared gates."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import os
import subprocess
import sys

root=Path(__file__).resolve().parents[2]
java=Path('/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin')
env=dict(os.environ,PYTHONDONTWRITEBYTECODE='1',REDIS_SERVER='/tmp/redis-7.2.5/src/redis-server')
chapters=['ch19','ch20','ch21']
selected=set(os.environ.get('CHAPTERS',','.join(chapters)).split(','))
if not selected.issubset(chapters):raise ValueError('out-of-scope chapter')
result_file=root/'docs/reviews/ch19-ch20-ch21-checks.json'
results=json.loads(result_file.read_text()) if 'CHAPTERS' in os.environ and result_file.exists() else {'checks':[],'files':{}}
results.setdefault('runs',[]).append({'chapters':sorted(selected),'at':datetime.now(timezone.utc).isoformat()})
commands=[
 ('whole-site structural/resources preservation',['node','tools/check.mjs']),
 *[(ch+' chapter audit',['node','tools/audit-chapter.mjs',ch]) for ch in chapters],
 ('shared slideshow syntax',['node','--check','assets/js/slides.js']),
 ('whitespace integrity',['git','diff','--check']),
 ('Java17 runtime',[str(java/'java'),'-version']),
 ('ch19 page/source agreement',['python3','examples/ch19/sync.py','--check']),
 ('ch19 actual Java17 / SQLite / protocol checks',['python3','examples/ch19/verify.py']),
 ('ch20 source / actual Java17 / SQL / contracts',['python3','examples/ch20/check.py']),
 ('ch21 page/source agreement',['node','examples/ch21/sync.mjs','--check']),
 ('ch21 actual isolated Redis / SQLite / recovery',['python3','examples/ch21/check.py']),
]
if 'CHAPTERS' in os.environ:
 commands=[(label,cmd) for label,cmd in commands if label.startswith(('whole-site','whitespace')) or any(label.startswith(ch) for ch in selected)]
for label,cmd in commands:
 p=subprocess.run(cmd,cwd=root,env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
 entry={'label':label,'command':cmd,'exitCode':p.returncode,'output':p.stdout}
 old=next((i for i,r in enumerate(results['checks']) if r['label']==label),None)
 if old is None:results['checks'].append(entry)
 else:results['checks'][old]=entry
for ch in selected:
 for p in [root/f'chapters/{ch}.html',*(root/'examples'/ch).glob('*')]:
  if p.is_file():results['files'][str(p.relative_to(root))]=hashlib.sha256(p.read_bytes()).hexdigest()
results['passed']=all(c['exitCode']==0 for c in results['checks'])
result_file.write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
(root/'docs/reviews/ch19-ch20-ch21-checks.txt').write_text('\n\n'.join(f"{c['label']} (exit {c['exitCode']})\n{c['output']}" for c in results['checks'])+'\n')
print(json.dumps({'passed':results['passed'],'checks':len(results['checks']),'failed':[c['label'] for c in results['checks'] if c['exitCode']]}))
sys.exit(0 if results['passed'] else 1)
