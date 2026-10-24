#!/usr/bin/env python3
from pathlib import Path
from decimal import Decimal
from datetime import datetime,timezone
import hashlib
import json
import os
import re
import subprocess
ROOT=Path(__file__).resolve().parents[2]
def hashes():
 files=[ROOT/'chapters/ch45.html']+[f for f in (ROOT/'examples/ch45').rglob('*') if f.is_file() and '__pycache__' not in f.parts]
 return {str(f.relative_to(ROOT)):hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(files)}
r={'startedAt':datetime.now(timezone.utc).isoformat(),'sourceHashes':hashes(),'commands':[]}
for cmd in [['node','examples/ch45/sync.mjs','--check'],['python3','examples/ch45/verify.py'],['node','tools/audit-chapter.mjs','ch45'],['node','tools/check.mjs'],['node','--check','docs/reviews/ch45-independent-browser.mjs'],['node','--check','docs/reviews/ch45-independent-frames.mjs'],['node','--check','docs/reviews/ch45-independent-mobile.mjs'],['git','diff','--check','--','chapters/ch45.html','examples/ch45']]:
 out=subprocess.run(cmd,cwd=ROOT,text=True,capture_output=True,env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'})
 r['commands'].append({'command':cmd,'exitCode':out.returncode,'stdout':out.stdout,'stderr':out.stderr});assert out.returncode==0,out.stderr or out.stdout
math={'initialMinor':2*2999+2002,'editedMinor':3*2999+2002,'conditionalBudgetMs':20+40+120,'remainingBudgetMs':300-20-40-120,'hotRowCeilingPerSecond':str(Decimal(1)/Decimal('0.010')),'hotRowDemandOccupancySecondsPerSecond':str(Decimal(300)*Decimal('0.010')),'netDrainPerSecond':600-300,'backlogDrainSeconds':36000/(600-300),'undersizedBacklogGrowthPerSecond':300-250,'payloadBytesPerDay':300*86400*2000,'payloadBytesSevenDaysThreeCopies':300*86400*2000*7*3,'payloadTB':str(Decimal(300*86400*2000*7*3)/Decimal(10**12))}
assert list(math.values())==[8000,10999,180,120,'1E+2','3.000',300,120,50,51840000000,1088640000000,'1.08864'],math
r['arithmetic']=math
old=(ROOT/'docs/reviews/ch43-ch44-ch45-baseline/ch45.html').read_text();new=(ROOT/'chapters/ch45.html').read_text()
svgs=lambda s:re.findall(r'<svg.*?</svg>',s,re.S)
assert svgs(old)==svgs(new) and len(svgs(new))==37
ids=lambda s:re.findall(r'<(?:title|desc) id="([^"]+)"',s)
assert ids(old)==ids(new) and len(ids(new))==74
r['animations']={'decks':7,'frames':37,'retainedTitleDescIds':74,'allSvgBytesUnchanged':True}
r['stableDuringRun']=r['sourceHashes']==hashes();assert r['stableDuringRun']
r['passed']=True
(ROOT/'docs/reviews/ch45-independent-check-results.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'passed':True,'commands':len(r['commands']),'arithmetic':len(math),'sourceHashes':len(r['sourceHashes'])}))
