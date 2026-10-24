"""Independent new inputs against the author modules; does not edit them."""
from pathlib import Path
import sys,json,hashlib,itertools,random,subprocess
from fractions import Fraction as F
from decimal import Decimal as D
from math import ceil
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'examples/ch36'))
from slo import Attempt,counts,budget,feature_gate
from tradeoffs import cap_trace,quorum_without_writeback,percentile_example
checks=[];numbers=[]
def check(name,got,want):
    if got!=want:raise AssertionError((name,got,want))
    checks.append({'name':name,'actual':str(got),'expected':str(want)})
def number(name,got,want):
    if got!=want:raise AssertionError((name,got,want))
    numbers.append({'name':name,'actual':str(got),'expected':str(want)})
def error(name,fn,kind=ValueError):
    try:fn()
    except kind:check(name,True,True)
    else:check(name,False,True)
def a(key,start,observed=None,outcome='UNKNOWN',correct=False,durable=False,eligible=True):
    return Attempt(key,start,observed,outcome,correct,durable,eligible)

# Complete-cohort boundary is (500,2500] at now3500/W2000.
records=[a('lower',500),a('left+1',501,1501,'DECLINED',True,True),
 a('upper',2500,3500,'APPROVED',True,True),a('immature',2501),
 a('missing',1800),a('notdurable',1700,2699,'APPROVED',True,False),
 a('late',1600,2601,'APPROVED',True,True),a('pre-start',900,899,'APPROVED',True,True),
 a('wrong',1300,1500,'DECLINED',False,True),a('pending',1000,1200,'PENDING',True,True),
 a('unsupported',1200,eligible=False),a('retry',1100,1200),
 a('retry',1100,2099,'APPROVED',True,True)]
check('complete cohorts retain unknown ingress and deadline equality',counts(records,3500,2000),(9,6))
shuffled=list(records);random.Random(36035).shuffle(shuffled)
check('record order cannot change canonical logical result',counts(shuffled,3500,2000),(9,6))
check('duplicate all telemetry records does not add journeys',counts(records+records,3500,2000),(9,6))
check('advancing cohort expires good and admits mature missing result',counts(records,3501,2000),(9,7))
error('zero window rejects',lambda:counts(records,3500,0))
error('retry cannot alter eligibility',lambda:counts([a('r',10),a('r',10,eligible=False)],3500,5000))
error('retry cannot restart original deadline',lambda:counts([a('r',10),a('r',900,1000,'APPROVED',True,True)],3500,5000))
check('pending then retry inside original deadline rescues',counts([a('r',37,57,'PENDING'),a('r',37,1037,'DECLINED',True,True)],2500,5000),(1,0))
check('retry one millisecond past original deadline stays bad',counts([a('r',37),a('r',37,1038,'DECLINED',True,True)],2500,5000),(1,1))
# Independent P1 closure inputs differ from the initial 100/900 fixture.
for outcome in ['APPROVED','DECLINED']:
 for correct,durable in [(False,True),(True,False),(False,False)]:
  for first,last in [(77,888),(888,77)]:
   rows=[a('p1',0,first,outcome,correct,durable),a('p1',0,last,'APPROVED',True,True)]
   check(f'bad exposed terminal cannot wash good {outcome}/{correct}/{durable}/{first}',counts(rows,2100,6000),(1,1))
check('nonterminal UNKNOWN then good still rescues',counts([a('u',0,20),a('u',0,999,'APPROVED',True,True)],2100,6000),(1,0))
check('bad exposed terminal at exact deadline poisons',counts([a('p1',0,1000,'APPROVED',False,True),a('p1',0,10,'APPROVED',True,True)],2100,6000),(1,1))

for eligible,bad,allowed,remaining in [(7231,6,7,1),(7231,7,7,0),(7231,8,7,-1),(1999,1,1,0),(2001,2,2,0),(1,1,0,-1)]:
 got=budget(eligible,bad)
 check(f'whole event allowance {eligible}/{bad}',(got['allowed'],got['remaining']),(allowed,remaining))
 check(f'exact burn {eligible}/{bad}',got['burn'],F(bad*1000,eligible))
check('zero denominator unmeasured',budget(0,0),None)
for pair in [(-2,0),(5,6),(5,-2)]:error(f'invalid counts {pair}',lambda pair=pair:budget(*pair))

names=['1h','5m','6h','30m'];month=(250000,100)
healthy={n:(25000,0) for n in names}
def gate(w=None,m=month,complete=True,canary=True,review=True):
 return feature_gate(m,healthy if w is None else w,complete,canary,review)
# At E25000, 360 bad is exactly14.4;361 gives14.44. 150==6,151==6.04.
for flags in itertools.product([0,1],repeat=4):
 w={n:(25000,(361 if i<2 else 151) if flags[i] else 0) for i,n in enumerate(names)}
 expected='HOLD_BURN' if (flags[0] and flags[1]) or (flags[2] and flags[3]) else 'ALLOW_NEXT_CANARY_STEP'
 check('pair truth table '+''.join(map(str,flags)),gate(w),expected)
for left,right in [(360,361),(361,360),(360,360),(361,361)]:
 w=healthy|{'1h':(25000,left),'5m':(25000,right)}
 check(f'fast strict threshold {left}/{right}',gate(w),'HOLD_BURN' if min(left,right)>360 else 'ALLOW_NEXT_CANARY_STEP')
for left,right in [(150,151),(151,150),(150,150),(151,151)]:
 w=healthy|{'6h':(25000,left),'30m':(25000,right)}
 check(f'slow strict threshold {left}/{right}',gate(w),'HOLD_BURN' if min(left,right)>150 else 'ALLOW_NEXT_CANARY_STEP')
for name in names:
 check('no-data '+name,gate(healthy|{name:(0,0)}),'HOLD_NO_DATA')
check('no-data monthly',gate(m=(0,0)),'HOLD_NO_DATA')
check('measurement quality prevents release',gate(complete=False),'HOLD_NO_DATA')
for remaining_pair in [(7777,7),(7777,8)]:check('freeze at/beyond integer balance '+str(remaining_pair),gate(m=remaining_pair),'FREEZE_FEATURES')
for canary,review in [(False,True),(True,False),(False,False)]:check(f'review gates {canary}/{review}',gate(canary=canary,review=review),'HOLD_REVIEW')
check('healthy reviewed only next canary',gate(),'ALLOW_NEXT_CANARY_STEP')
error('missing named window is a failed measurement input',lambda:gate({n:healthy[n] for n in names[:-1]}),KeyError)
error('invalid short-window count is failed measurement',lambda:gate(healthy|{'5m':(5,6)}))

check('CAP function preserves concrete stale read',cap_trace()['later_read'],0)
check('quorum function exposes new-old inversion',quorum_without_writeback(),{'R1':'x=1','R2_after_R1':'x=0','linearizable':False})
check('path percentile function',percentile_example(),{'sum_of_p99_ms':2,'p99_of_path_ms':101})
for item in checks[-3:]: item['kind']='author_history_call'
# Independent changed read sets A/C then B/C still intersect C but regress.
versions={'A':1,'B':0,'C':0}
check('independent pending-write history sets intersect',len({'A','C'}&{'B','C'}),1)
check('independent pending-write read values',(max(versions[n] for n in ['A','C']),max(versions[n] for n in ['B','C'])),(1,0))
# Try pending write at all 3 insertion positions in the serial read history.
allowed=[(1,1),(0,1),(0,0)]
check('no linearization position allows newer then older',(1,0) in allowed,False)
for item in checks[-3:]: item['kind']='manual_history'

# Own arithmetic, not importing the author's numeric script.
for rtt,p,s in [(4,7,8),(80,83,84)]:
 number(f'parallel latency {rtt}',2+max(1,rtt+1),p);number(f'serial latency {rtt}',2+1+rtt+1,s)
number('early ACK ms',2+1,3);number('20ms remaining local',20-7,13);number('20ms overshoot remote',83-20,63)
for target,seconds in [(F(999,1000),F(2592)),(F(9999,10000),F(1296,5)),(F(99999,100000),F(648,25))]:
 number('30d time allowance seconds '+str(target),30*86400*(1-target),seconds)
number('30d time minutes',30*24*60,43200)
for eligible,bad,allowance,remaining in [(10000000,6000,10000,4000),(250000,100,250,150)]:
 number('event allowance '+str(eligible),eligible//1000,allowance);number('event remaining '+str(eligible),eligible//1000-bad,remaining)
number('40 percent balance',F(4000,10000),F(2,5));number('achieved99.94 percent',100*(1-F(6000,10000000)),F(4997,50))
E=1000*30*86400;fullbad=1000*1200;allow=E//1000
number('steady eligible',E,2592000000);number('steady allowed',allow,2592000)
number('10percent incident bad',fullbad//10,120000);number('10percent spend rounded',round(D(120000)*100/D(allow),2),D('4.63'))
number('all failed spend rounded',round(D(fullbad)*100/D(allow),2),D('46.30'))
peak_E=E-1000*1200+10000*1200
number('tenfold incident complete denominator',peak_E,2602800000);number('tenfold complete allowance',peak_E//1000,2602800)
number('tenfold all-failed bad',10000*1200,12000000);number('tenfold all-failed spend',round(D(12000000)*100/D(peak_E//1000),2),D('461.04'))
number('tenfold 10percent alternate bad',10000*1200//10,1200000)
number('series independent percent',100*F(999,1000)**2,F(998001,10000));number('parallel independent percent',100*(1-F(1,1000)**2),F(999999,10000))
number('series bad budget multiple',(1-F(999,1000)**2)/F(1,1000),F(1999,1000))
number('burn at1percent',F(1,100)/F(1,1000),10);number('full days atburn10',F(30,10),3);number('40percent days',F(30,10)*F(2,5),F(6,5))
number('fast threshold bad rate',F(72,5)*F(1,1000),F(9,625));number('slow threshold bad rate',6*F(1,1000),F(3,500))
number('fast whole-budget fraction',F(72,5)*F(1,720),F(1,50));number('slow whole-budget fraction',6*F(6,720),F(1,20))
number('A9 actual burn',F(6000*1000,10000000),F(3,5));number('author example14.41',F(1441*1000,100000),F(1441,100))
files=[ROOT/'chapters/ch36.html']+sorted(p for p in (ROOT/'examples/ch36').rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix not in ['.class','.pyc'])
result={'passed':True,'new_input_assertions':sum(c.get('kind','new_input')=='new_input' for c in checks),'author_history_calls':3,'manual_history_assertions':3,'checks':checks,'numeric_count':len(numbers),'numeric':numbers,'source_sha256':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files},'scope':'local input calls and arithmetic; no live consensus, telemetry, DB or network test'}
(ROOT/'docs/reviews/ch36-independent-probe-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(f"{result['new_input_assertions']} independent new-input assertions + 3 author history calls + 3 manual history assertions; {len(numbers)} own numeric checks")
