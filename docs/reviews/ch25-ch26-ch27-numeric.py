"""Independent recalculation of the chapters' teaching assumptions, not load tests."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import math

root = Path(__file__).resolve().parents[2]
checks = []

def check(chapter, name, formula, actual, expected, tolerance=1e-8):
    checks.append(dict(chapter=chapter, name=name, formula=formula, actual=actual,
                       expected=expected, passed=math.isclose(actual, expected, abs_tol=tolerance, rel_tol=0)))

check('ch25', 'average occurrences/s', '10000/60', 10000/60, 166.66666666666666)
check('ch25', 'mean occupied slots', '(10000/60)*.2', (10000/60)*.2, 33.333333333333336)
check('ch25', '60 percent budget slots', 'ceil((10000/60)*.2/.6)', math.ceil((10000/60)*.2/.6), 56)
check('ch25', 'burst ideal full-utilization rate', '56/.2', 56/.2, 280)
check('ch25', 'burst fluid lower bound seconds', '10000/(56/.2)', 10000/(56/.2), 35.714285714285715)
check('ch25', 'burst discrete rounds', 'ceil(10000/56)', math.ceil(10000/56), 179)
check('ch25', 'burst discrete completion seconds', 'ceil(10000/56)*.2', math.ceil(10000/56)*.2, 35.8)
check('ch25', 'five-second ideal slots', 'ceil(10000*.2/5)', math.ceil(10000*.2/5), 400)
check('ch25', 'five-second 60 percent slots', 'ceil(10000*.2/5/.6)', math.ceil(10000*.2/5/.6), 667)
check('ch25', 'claim batches', 'ceil(10000/100)', math.ceil(10000/100), 100)
check('ch25', 'raw definitions MB', '10000*1000/1e6', 10000*1000/1e6, 10)
check('ch25', 'daily run count millions', '10000*1440/1e6', 10000*1440/1e6, 14.4)
check('ch25', 'seven-day raw run GB', '10000*1440*200*7/1e9', 10000*1440*200*7/1e9, 20.16)
check('ch25', 'seven-day three-copy GB', '20.16*3', 20.16*3, 60.48)
check('ch25', 'two-hour missed minute intervals/job', '2*60', 2*60, 120)
check('ch25', 'missed intervals ten jobs', '10*2*60', 10*2*60, 1200)
check('ch25', 'spare rate /s', '100-80', 100-80, 20)
check('ch25', 'recovery ideal lower bound seconds', '1200/(100-80)', 1200/(100-80), 60)
check('ch25', 'one wheel horizon seconds', '1*60', 1*60, 60)
check('ch25', 'thirty-minute revolutions', '(30*60)/60', (30*60)/60, 30)
check('ch26', 'confirmed claims/day', '1e6*10', 1e6*10, 1e7)
check('ch26', 'confirmed average /s', '1e7/86400', 1e7/86400, 115.74074074074075)
check('ch26', 'confirmed peak /s', '1e7/86400*10', 1e7/86400*10, 1157.4074074074074)
check('ch26', 'attempt peak /s', '1e7*5/86400*10', 1e7*5/86400*10, 5787.037037037037)
check('ch26', 'hot packet losing fraction percent', '(10000-100)/10000*100', (10000-100)/10000*100, 99)
check('ch26', 'serial theoretical service /s', '1/.002', 1/.002, 500)
check('ch26', '60 percent serial budget /s', '1/.002*.6', 1/.002*.6, 300)
check('ch26', '100 new candidates utilization percent', '100/(1/.002)*100', 100/(1/.002)*100, 20)
check('ch26', 'first draw upper cents', 'min(2000//4,1000-(4-1))', min(2000//4,1000-3), 500)
check('ch26', 'second draw upper cents', 'min(1400//3,700-(3-1))', min(1400//3,700-2), 466)
check('ch26', 'third draw upper cents', 'min(600//2,300-(2-1))', min(600//2,300-1), 299)
check('ch26', 'integer plan sum cents', '300+400+100+200', 300+400+100+200, 1000)
check('ch26', 'unequal equal-split sum cents', '3*251+250', 3*251+250, 1003)
check('ch26', 'post-close money conservation', '400+0+600+0', 400+0+600+0, 1000)
check('ch26', 'post-close share conservation', '1+0+3', 1+0+3, 4)
check('ch26', 'seven-day raw GB', '(1e6*1000+1e7*200)*7/1e9', (1e6*1000+1e7*200)*7/1e9, 21)
check('ch26', 'seven-day three-copy GB', '21*3', 21*3, 63)
check('ch26', 'daily plan amount-only MB', '1e6*10*8/1e6', 1e6*10*8/1e6, 80)
check('ch27', 'average orders /s', '500000/86400', 500000/86400, 5.787037037037037)
check('ch27', 'peak orders /s', '500000/86400*10', 500000/86400*10, 57.870370370370374)
check('ch27', 'peak recall visits /s', '(500000/86400*10)*20', (500000/86400*10)*20, 1157.4074074074074)
check('ch27', 'peak first-round matrix elements /s', '(500000/86400*10)*8', (500000/86400*10)*8, 462.962962962963)
check('ch27', 'nominal location updates /s', '10000/5', 10000/5, 2000)
check('ch27', 'burst location multiple', '10000/2000', 10000/2000, 5)
check('ch27', 'nominal location MB/s', '2000*200/1e6', 2000*200/1e6, .4)
check('ch27', 'nominal location Mb/s', '.4*8', .4*8, 3.2)
check('ch27', 'burst location MB/s', '10000*200/1e6', 10000*200/1e6, 2)
check('ch27', 'latest point raw MB', '10000*500/1e6', 10000*500/1e6, 5)
check('ch27', '24h location raw GB', '2000*86400*200/1e9', 2000*86400*200/1e9, 34.56)
check('ch27', 'thirty-day order raw GB', '500000*2000*30/1e9', 500000*2000*30/1e9, 30)
check('ch27', 'thirty-day three-copy order GB', '30*3', 30*3, 90)
check('ch27', 'viewer pushes /s', '3000/5', 3000/5, 600)
check('ch27', 'viewer raw KB/s', '(3000/5)*200/1000', (3000/5)*200/1000, 120)
check('ch27', 'total connections', '10000+3000', 10000+3000, 13000)
check('ch27', 'citywide naive deliveries /s', '2000*3000', 2000*3000, 6000000)
check('ch27', 'candidate A minute cost', '2+4*.5+2*1', 2+4*.5+2*1, 6)
check('ch27', 'candidate B minute cost', '4+4*.1+2*0', 4+4*.1+2*0, 4.4)
check('ch27', 'pickup-overlap ETA minutes', 'max(4,6)+8', max(4,6)+8, 14)
check('ch27', 'zone net backlog /s', '20-12', 20-12, 8)
check('ch27', 'queue exhaustion seconds', '600/(20-12)', 600/(20-12), 75)
check('ch27', 'borrowed supply /s', '12+2', 12+2, 14)
check('ch27', 'backlog with borrowing /s', '20-(12+2)', 20-(12+2), 6)
files = {f'chapters/{ch}.html': hashlib.sha256((root/f'chapters/{ch}.html').read_bytes()).hexdigest()
         for ch in ['ch25', 'ch26', 'ch27']}
result = dict(at=datetime.now(timezone.utc).isoformat(), checks=checks,
              passed=all(row['passed'] for row in checks), files=files,
              limitation='Arithmetic only. Final source claims are separately read. Timing results are ideal rates under stated teaching assumptions, not latency/SLO guarantees.')
(root/'docs/reviews/ch25-ch26-ch27-numeric-review.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(dict(passed=result['passed'], checks=len(checks), failures=[r for r in checks if not r['passed']])))
raise SystemExit(0 if result['passed'] else 1)
