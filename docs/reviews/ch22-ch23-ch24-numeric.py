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

check('ch22', 'weighted mean bytes', '.8*10000 + .2*499960000', .8*10000 + .2*499960000, 100000000)
check('ch22', 'logical PB', '1e9*100e6/1e15', 1e9*100e6/1e15, 100)
check('ch22', 'small-object TB', '.8*1e9*10000/1e12', .8*1e9*10000/1e12, 8)
check('ch22', 'metadata logical TB', '1e9*1000/1e12', 1e9*1000/1e12, 1)
check('ch22', 'metadata GB per shard', '1e9*1000/64/1e9', 1e9*1000/64/1e9, 15.625)
check('ch22', 'replicated metadata TB', '1*3', 1*3, 3)
check('ch22', 'PUT Gb/s', '1000*2e6*8/1e9', 1000*2e6*8/1e9, 16)
check('ch22', 'GET Gb/s', '10000*1e6*8/1e9', 10000*1e6*8/1e9, 80)
check('ch22', 'API per-direction Gb/s', '16+80', 16+80, 96)
check('ch22', 'API fleet with one spare', 'ceil(96/(10*.5))+1', math.ceil(96/(10*.5))+1, 21)
check('ch22', 'API after one failure Gb/s', '(21-1)*5', (21-1)*5, 100)
check('ch22', 'packs excluding overhead', '1e6*10000/1e9', 1e6*10000/1e9, 10)
check('ch22', '10 percent garbage I/O per freed byte', '(1+.9)/.1', (1+.9)/.1, 19)
check('ch22', '80 percent garbage I/O per freed byte', '(1+.2)/.8', (1+.2)/.8, 1.5)
check('ch22', 'payload physical PB', '20*3+80*6/4', 20*3+80*6/4, 180)
check('ch22', 'single replica repair read-only seconds', '1e12/500e6', 1e12/500e6, 2000)
check('ch22', 'single missing RS fragment read-only seconds', '4e12/500e6', 4e12/500e6, 8000)
check('ch22', 'multipart parts', '5*1024/64', 5*1024/64, 80)
check('ch22', 'multipart ideal parallel rounds', '80/4', 80/4, 20)
check('ch22', 'multipart one-part fraction percent', '1/80*100', 1/80*100, 1.25)
check('ch22', '10000 orphan parts GiB', '10000*64/1024', 10000*64/1024, 625)
check('ch22', 'all 10KB objects count', '100e15/10000', 100e15/10000, 1e13)
check('ch22', 'all 10KB metadata PB', '1e13*1000/1e15', 1e13*1000/1e15, 10)
check('ch23', 'peak authoritative writes /s', '10e6*5/86400*5', 10e6*5/86400*5, 2893.5185185185187)
check('ch23', 'peak reads /s', '10e6*3/86400*5', 10e6*3/86400*5, 1736.111111111111)
check('ch23', 'two-view projection updates /s', '2*10e6*5/86400*5', 2*10e6*5/86400*5, 5787.037037037037)
check('ch23', 'top requests /s', '1736.111111111111*.8', 1736.111111111111*.8, 1388.888888888889)
check('ch23', 'personal requests /s', '1736.111111111111*.2', 1736.111111111111*.2, 347.22222222222223)
check('ch23', 'two views and two replicas GB', '10e6*160*2*2/1e9', 10e6*160*2*2/1e9, 6.4)
check('ch23', 'max composite score', '1000000*3000001+3000000', 1000000*3000001+3000000, 3000004000000)
check('ch23', 'exact integer score headroom', 'maxC < 2**53', int(3000004000000 < 2**53), 1)
check('ch23', 'thirty days seconds', '30*24*3600', 30*24*3600, 2592000)
check('ch23', 'rebuilt items steady net seconds', '20e6/(100000-5787)', 20e6/(100000-5787), 212.3, .05)
check('ch23', 'extreme hot-board bucket count', 'ceil((2893.5185185185187*10)/10000)', math.ceil((2893.5185185185187*10)/10000), 3)
check('ch24', 'peak create /s', '1e6/86400*10', 1e6/86400*10, 115.74074074074075)
check('ch24', 'peak success /s', '.7e6/86400*10', .7e6/86400*10, 81.01851851851852)
check('ch24', 'peak receipts /s', '1.4e6/86400*10', 1.4e6/86400*10, 162.03703703703704)
check('ch24', 'unknown attempts per day', '1e6*.001', 1e6*.001, 1000)
check('ch24', 'payments GB/year', '1e6*1000*365/1e9', 1e6*1000*365/1e9, 365)
check('ch24', 'journal GB/year', '.7e6*2*200*365/1e9', .7e6*2*200*365/1e9, 102.2)
check('ch24', 'receipt audit GB/year', '1.4e6*1000*365/1e9', 1.4e6*1000*365/1e9, 511)
check('ch24', 'raw GB/year', '365+102.2+511', 365+102.2+511, 978.2)
check('ch24', 'three copies TB/year', '978.2*3/1000', 978.2*3/1000, 2.9346)
check('ch24', 'ten-minute backlog at rounded budget', '162*600', 162*600, 97200)
check('ch24', 'drain seconds with ongoing arrivals', '97200/(500-162)', 97200/(500-162), 287.57396449704143)
check('ch24', 'remaining refund capacity', '10000-3000-2000', 10000-3000-2000, 5000)
check('ch24', 'gross fee net balance', '9700+300-10000', 9700+300-10000, 0)
files = {f'chapters/{ch}.html': hashlib.sha256((root/f'chapters/{ch}.html').read_bytes()).hexdigest()
         for ch in ['ch22', 'ch23', 'ch24']}
result = dict(at=datetime.now(timezone.utc).isoformat(), checks=checks,
              passed=all(row['passed'] for row in checks), files=files,
              limitation='Arithmetic only. Final source claims are separately read. Timing results are ideal rates under stated teaching assumptions, not latency/SLO guarantees.')
(root/'docs/reviews/ch22-ch23-ch24-numeric-review.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(dict(passed=result['passed'], checks=len(checks), failures=[r for r in checks if not r['passed']])))
raise SystemExit(0 if result['passed'] else 1)
