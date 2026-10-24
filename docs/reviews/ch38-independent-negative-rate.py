"""A new period/key-count fixture for the A9 post-review regression."""
import sys
sys.dont_write_bytecode=True
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'examples/ch38'))
from cache import Cache,Evidence
from fractions import Fraction
import tempfile,json,hashlib

def run(keys,seconds,step):
 now=[6_000_000];counts={'HIT':0,'LEADER':0,'WAIT':0};waves=[]
 with tempfile.TemporaryDirectory(prefix='ch38-review-rate-') as directory:
  c=Cache(str(Path(directory)/'cache.db'),lambda:now[0])
  for offset in range(0,seconds*1000,step):
   now[0]=6_000_000+offset;leaders=0
   for k in range(keys):
    key=f'review/negative/{k}';kind,result=c.claim(key);counts[kind]+=1
    if kind=='LEADER':
     assert c.fill(key,result,Evidence.primary(23,now[0],True));leaders+=1
   if leaders:waves.append({'offsetMs':offset,'leaders':leaders})
  c.close()
 rate=Fraction(counts['LEADER'],seconds)
 assert rate==Fraction(keys,3),(rate,keys)
 return {'keys':keys,'durationSeconds':seconds,'requests':sum(counts.values()),'perKeyIntervalMs':step,'counts':counts,'originChecksPerSecondExact':str(rate),'expectedGuardedRate':str(Fraction(keys,3)),'idealIgnoringAllMargins':str(Fraction(keys,5)),'waves':waves}
result={'passed':True,'scope':'L2-only actual claim/fill with controlled time, zero query duration and no eviction; not a complete HTTP success loop','sourceSha256':hashlib.sha256(Path('examples/ch38/cache.py').read_bytes()).hexdigest(),'cases':[run(37,24,125),run(11,18,250)]}
Path('docs/reviews/ch38-independent-negative-rate-results.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
