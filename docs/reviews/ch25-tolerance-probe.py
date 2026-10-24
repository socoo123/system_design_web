"""Focused author repair evidence for the independently reported P1."""
import hashlib,json,sys,tempfile
from pathlib import Path
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'examples/ch25'))
from model import Scheduler
rows=[]
with tempfile.TemporaryDirectory(prefix='ch25-tolerance-probe-') as tmp:
 for policy in ['skip','coalesce','catch_up']:
  s=Scheduler(str(Path(tmp,policy+'.db')));s.initialize();s.add(policy=policy,lateness_ms=60000)
  s.set_time(90000);s.recover('j7')
  row={'policy':policy,'nowMs':90000,'toleranceMs':60000,'missedFires':[r['fire'] for r in s.runs()],
       'cursorAfterRecovery':s.db.execute('SELECT next_at FROM job').fetchone()[0]}
  ids=s.materialize();row['normalFires']=[s.run(i)['fire'] for i in ids]
  assert row['cursorAfterRecovery']==60000 and row['normalFires']==[60000]
  assert row['missedFires']==([] if policy=='skip' else [0])
  rows.append(row);s.close()
result={'passed':True,'beforeEvidence':'ch25-tolerance-before-results.json',
        'modelSha256':hashlib.sha256((ROOT/'examples/ch25/model.py').read_bytes()).hexdigest(),
        'htmlSha256':hashlib.sha256((ROOT/'chapters/ch25.html').read_bytes()).hexdigest(),'after':rows}
(ROOT/'docs/reviews/ch25-tolerance-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
