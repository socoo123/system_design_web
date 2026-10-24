from pathlib import Path
from fractions import Fraction as F
import json

checks=[]
def equal(name,actual,expected):
    assert actual==expected,(name,actual,expected)
    checks.append({'claim':name,'actual':str(actual),'expected':str(expected),'passed':True})

equal('20 requests/s ×60 seconds =1200 logical requests',20*60,1200)
equal('input token volume/minute',2000*1200,2400000)
equal('output token volume/minute',400*1200,480000)
equal('actual total token volume/minute',2400*1200,2880000)
equal('per-attempt hold',2000+1000,3000)
equal('one-minute cohort reserved work',3000*1200,3600000)
equal('context requirement',8000+1000,9000)
equal('10000 context satisfies 9000 requirement',9000<=10000,True)
equal('4000 context rejects 9000 requirement',9000<=4000,False)
equal('two-attempt cohort count',1200*2,2400)
equal('two-attempt cohort reserved work',1200*2*3000,7200000)
equal('same-window steady calls/s, conditional only',F(2400,60),40)
equal('first-response allocated seconds',F(2,10)+F(8,10)+F(2,10)+F(7,10),F(19,10))
equal('first-response headroom seconds',2-F(19,10),F(1,10))
equal('remaining visible-token intervals',400-1,399)
equal('subsequent visible-output seconds',F(399,50),F(798,100))
equal('steady stream duration seconds',F(1,2)+F(399,50),F(848,100))
equal('same-boundary admitted mean concurrency',20*F(848,100),F(1696,10))
equal('200 ×64KiB payload buffer bytes',200*64*1024,13107200)
equal('payload buffer MiB',F(13107200,1024**2),F(125,10))
equal('released net quota after final usage',3000-2400,600)
equal('two charged attempts total usage',2400+2400,4800)
equal('FAQ reuse rate',F(40,500),F(8,100))
equal('conditional wrong-hit rate',F(1,40),F(25,1000))
equal('overall wrong rate uses another denominator',F(1,500),F(2,1000))
equal('hypothetical generations saved/s',20*F(40,500),F(16,10))
equal('hypothetical remaining generations/s',20-F(16,10),F(184,10))
# Counterexample: all 1200 old-cohort retries can dispatch after a window edge.
# The cohort still respects <=2 attempts, while the next-second count exceeds40.
equal('cross-window retry cohort total respects cap',1200+1200,1200*2)
equal('cross-window 1200 retry burst exceeds steady40',1200>40,True)

root=Path(__file__).resolve().parents[2]
result={'passed':True,'count':len(checks),'checks':checks,
        'scope':'Exact arithmetic and a scheduling counterexample; not a measured rate or load test'}
(root/'docs/reviews/ch32-numeric-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'passed':True,'count':len(checks)}))
