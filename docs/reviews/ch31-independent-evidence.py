from pathlib import Path
import hashlib
import json
import os
import subprocess

ROOT=Path(__file__).resolve().parents[2]
os.chdir(ROOT)
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
before=json.loads(Path('docs/reviews/ch31-independent-source-hashes.json.before').read_text())
paths=[Path('chapters/ch31.html'),*sorted(p for p in Path('examples/ch31').rglob('*') if p.is_file() and '__pycache__' not in p.parts)]
after={str(path):sha(path) for path in paths}
source=dict(before=before,after=after,unchanged=before==after)
Path('docs/reviews/ch31-independent-source-hashes.json').write_text(json.dumps(source,indent=2)+'\n')
commands=[]
for cmd in [['node','examples/ch31/sync.mjs','--check'],['node','tools/audit-chapter.mjs','ch31'],['git','diff','--check']]:
  r=subprocess.run(cmd,capture_output=True,text=True)
  commands.append(dict(command=cmd,exit_code=r.returncode,stdout=r.stdout,stderr=r.stderr))
sql=json.loads(Path('docs/reviews/ch31-independent-sql-results.json').read_text())
java=json.loads(Path('docs/reviews/ch31-independent-java-results.json').read_text())
numeric=json.loads(Path('docs/reviews/ch31-independent-numeric-results.json').read_text())
browser=json.loads(Path('docs/reviews/ch31-independent-browser-results.json').read_text())
viewed=[f'docs/reviews/screenshots/ch31-ch32-ch33-root/changed-frames/ch31-{theme}-d{deck}-all.png' for deck in [1,3,5,6] for theme in ['parchment','dracula']]
viewed += [f'docs/reviews/screenshots/ch31-independent-browser/ch31-{theme}-deck{deck}-last.png' for deck in [2,4] for theme in ['parchment','dracula']]
viewed += ['docs/reviews/screenshots/ch31-independent-browser/'+name for name in ['390-parchment-en-top.png','ch31-1440-dracula-code.png','d5s6-parchment-middle.png','d6s4-dracula-right.png']]
checks={
  'author_frozen_page':after['chapters/ch31.html']=='3a4cdd13730731b8a92009bd124f491124c4aaf6119bdd10c9e8851751c6d632',
  'final_sql_new_input_matches':sql['passed'] and sql['source_sha256']==after['examples/ch31/catalog.py'],
  'final_java_new_input_matches':java['passed'] and java['source_sha256']==after['examples/ch31/VectorCandidates.java'],
  'numeric_pass':numeric['passed'],
  'final_browser_matches':browser['passed'] and browser['files']['ch31']==after['chapters/ch31.html'],
  'eight_real_layouts':len(browser['layouts'])==8 and all(row['width']==row['scrollWidth']==row['expanded']['scrollWidth'] for row in browser['layouts']),
  'browser_errors_zero':not browser['errors'],
  'commands_pass':all(row['exit_code']==0 for row in commands),
  'all_viewed_images_exist':all(Path(path).is_file() for path in viewed),
}
report=dict(passed=all(checks.values()),checks=checks,commands=commands,
  independent_sql=sql['count'],independent_java=16,author_java_rerun=18,numeric=numeric['count'],
  source_before_after=source,changed_during_author_finalization=[path for path in after if after[path]!=before.get(path)],
  layouts=8,frame_visits=sum(row['frameVisits'] for row in browser['layouts']),interactions=browser['interactions'],
  actual_visual_review=[dict(path=path,sha256=sha(path)) for path in viewed],
  limitations=['Local CPU/SQLite new fixtures, not real vector algorithms/replication','Source changed while author finalized; final full dictionary and all code/browser evidence verified','No author file was edited by reviewer'])
Path('docs/reviews/ch31-independent-final-results.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(dict(passed=report['passed'],checks=checks,sql=sql['count'],java=16,numeric=numeric['count'],images=len(viewed))))
assert report['passed']
