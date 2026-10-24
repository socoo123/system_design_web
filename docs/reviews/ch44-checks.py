#!/usr/bin/env python3
"""Reproduce the chapter's local checks and preserve exact output/hashes."""
from pathlib import Path
import hashlib
import json
import subprocess
import tempfile
from datetime import datetime, timezone
ROOT=Path(__file__).resolve().parents[2]
JAVA=Path('/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin')
result={'startedAt':datetime.now(timezone.utc).isoformat(),'commands':[],'arithmetic':{}}
def run(cmd):
    r=subprocess.run([str(a) for a in cmd],cwd=ROOT,text=True,capture_output=True)
    result['commands'].append(dict(command=[str(a) for a in cmd],exitCode=r.returncode,stdout=r.stdout,stderr=r.stderr))
    if r.returncode: raise AssertionError(r.stderr or r.stdout)
with tempfile.TemporaryDirectory(prefix='ch44-java-check-') as build:
    run([JAVA/'java','-version'])
    run([JAVA/'javac','--release','17','-d',build,'examples/ch44/ServiceGovernance.java'])
    run([JAVA/'java','-cp',build,'ServiceGovernance'])
    run(['python3','examples/ch44/check_transactions.py'])
    run(['python3','examples/ch44/check_sources.py'])
    run(['node','tools/audit-chapter.mjs','ch44'])
    run(['node','tools/check.mjs'])
    for file in ['docs/reviews/ch44-browser.mjs','docs/reviews/ch44-frames.mjs','docs/reviews/ch44-mobile.mjs']:
        run(['node','--check',file])
    run(['git','diff','--check','--','chapters/ch44.html','examples/ch44','docs/reviews/ch44.md'])
actual={'meanInflight':200*0.1,'eventBytesPerSecond':200*1000,'backlogEvents':200*180,
        'backlogBytes':200*180*1000,'netDrainPerSecond':300-200,'catchupSeconds':200*180/(300-200),
        'detectionPlusPropagationSeconds':3*2+1,'plannedCapsMs':80+220+40+220+140,
        'slackMs':800-(80+220+40+220+140),'lateRetryUsefulMs':250-140-40,
        'nestedAttempts':3**5,'retryAdmissions':200+200*0.1,'retryEveryOriginal':200*2,
        'recordsPerDay':200*86400,'resultBytesPerDay':200*86400*1000,
        'sevenDaysBytes':200*86400*1000*7,'drainSurvivorsPerSecond':(3-1)*600,
        'insufficientTwoInstanceSurvivor':(2-1)*600,'canaryPerSecond':1000*0.1,
        'serialMs':5*80,'parallelIdealMs':80}
expected=[20,200000,36000,36000000,100,360,7,700,100,70,243,220,400,17280000,17280000000,120960000000,1200,600,100,400,80]
assert list(actual.values())==expected, actual
result['arithmetic']=actual
result['handTraces']=[
 {'kind':'pseudocode reasoning, not network execution','input':'80ms local +220ms terminal transient failure +40ms target backoff +220ms second attempt +140ms finish','expected':'700ms planned, 100ms slack'},
 {'kind':'pseudocode reasoning','input':'worker delayed 121ms in 220ms stage','expected':'99ms useful <100ms, no I/O'},
 {'kind':'pseudocode reasoning','input':'250ms left then40ms backoff with140ms return reserve','expected':'70ms useful, no retry'},
 {'kind':'pseudocode reasoning','input':'Future timeout while local I/O remains alive','expected':'stop retries; hold local slot until adapter finally'},
 {'kind':'pseudocode reasoning','input':'OPEN, slot unavailable, shared retry authority denial, executor rejection or local error','expected':'no retry dispatch; finish acquired ticket and release only unstarted/terminated local slot'},
 {'kind':'boundary reasoning','input':'timed-out effectful request or remote work survives local cancellation','expected':'no rollback inference; resolve same authoritative K, with remote admission/dedupe contract'}]
result['sourceHashes']={str(f.relative_to(ROOT)):hashlib.sha256(f.read_bytes()).hexdigest() for f in
   [ROOT/'chapters/ch44.html',*sorted((ROOT/'examples/ch44').glob('*'))] if f.is_file()}
result['passed']=True
(ROOT/'docs/reviews/ch44-check-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'passed':True,'commands':len(result['commands']),'arithmetic':len(actual),'sourceHashes':len(result['sourceHashes'])}))
