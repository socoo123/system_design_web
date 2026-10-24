from decimal import Decimal, getcontext
from pathlib import Path
import hashlib,json
getcontext().prec=36
checks=[]
def put(name,actual,expected):
    if actual!=expected:raise AssertionError((name,actual,expected))
    checks.append({'name':name,'actual':str(actual),'expected':str(expected),'passed':True})
put('daily confirmations',1_000_000*10,10_000_000)
put('confirmation average rounded 2dp',(Decimal(10_000_000)/86_400).quantize(Decimal('.01')),Decimal('115.74'))
put('10x confirm peak rounded to whole',(Decimal(10_000_000)/86_400*10).quantize(Decimal('1')),Decimal('1157'))
put('daily clicks',10_000_000*5,50_000_000)
put('click average rounded 2dp',(Decimal(50_000_000)/86_400).quantize(Decimal('.01')),Decimal('578.70'))
put('10x click peak rounded whole',(Decimal(50_000_000)/86_400*10).quantize(Decimal('1')),Decimal('5787'))
put('hot burst no share',10_000-100,9900)
put('hot burst losing fraction',Decimal(9900)/10_000,Decimal('.99'))
put('2ms serial theoretical per second',1/Decimal('.002'),Decimal('500'))
put('60 percent plan budget',500*Decimal('.60'),Decimal('300'))
put('100/s admission theoretical utilization',Decimal(100)/500,Decimal('.2'))
put('metadata bytes/day',1_000_000*1000,1_000_000_000)
put('claim bytes/day',10_000_000*200,2_000_000_000)
put('7-day raw bytes',(1_000_000_000+2_000_000_000)*7,21_000_000_000)
put('three copies bytes',21_000_000_000*3,63_000_000_000)
put('amount payload bytes/day',1_000_000*10*8,80_000_000)
for money,count,minimum,expected in ((1000,4,1,500),(700,3,1,466),(300,2,1,299),(63,5,12,15)):
    put(f'upper bound M{money} N{count} m{minimum}',min(2*money//count,money-minimum*(count-1)),expected)
put('share plan total',300+400+100+200,1000)
put('even plan remainder',251+251+251+250,1003)
put('original business deadline milliseconds',24*60*60*1000,86_400_000)
put('twice MAX_CENTS within signed long',2*10**12<2**63-1,True)
p=Path('chapters/ch26.html');out={'htmlSha256':hashlib.sha256(p.read_bytes()).hexdigest(),'checks':checks,'passed':len(checks),'failed':0,'note':'All throughput and retention numbers are teaching assumptions; rounded peaks are estimates, not hard limits.'}
Path('docs/reviews/ch26-independent-numeric-results.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'passed':len(checks),'failed':0}))
