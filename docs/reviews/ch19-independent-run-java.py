"""Reproduce the already-recorded independent Java17 probes in a temporary class directory."""
from pathlib import Path
import json,subprocess,tempfile
root=Path(__file__).resolve().parents[2]
jdk=Path('/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin')
with tempfile.TemporaryDirectory(prefix='ch19-independent-java-') as classes:
    commands=[[str(jdk/'javac'),'--release','17','-d',classes,str(root/'examples/ch19/Nearby.java'),
               str(root/'docs/reviews/ch19-independent-NearbyReview.java')],
              [str(jdk/'java'),'-ea','-cp',classes,'NearbyReview']]
    runs=[]
    for command in commands:
        r=subprocess.run(command,text=True,capture_output=True)
        runs.append({'command':command,'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr})
        if r.returncode:break
    result={'runs':runs,'passed':all(r['exit']==0 for r in runs)}
    (root/'docs/reviews/ch19-independent-java-results.json').write_text(json.dumps(result,indent=2)+'\n')
    print(r.stdout,r.stderr)
    assert result['passed']
