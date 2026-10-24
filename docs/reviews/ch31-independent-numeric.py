from pathlib import Path
from fractions import Fraction as F
import json
ROOT=Path(__file__).resolve().parents[2]
rows=[]
def check(name,actual,expected):
  ok=abs(float(actual)-float(expected))<1e-8
  rows.append(dict(name=name,actual=float(actual),expected=float(expected),passed=ok));assert ok,name
raw=100_000_000*768*4
check('raw bytes',raw,307_200_000_000)
check('raw decimal GB',F(raw,10**9),307.2)
check('raw GiB',F(raw,2**30),286.102294921875)
check('per shard raw GiB',F(raw,4*2**30),71.52557373046875)
check('70pct RAM GiB',F(128*7,10),89.6)
check('remaining hot state GiB',F(128*7,10)-F(raw,4*2**30),18.07442626953125)
check('two raw copies GB',F(raw*2,10**9),614.4)
check('HNSW base slots bytes per point',2*16*4,128)
check('HNSW base adjacency GB',F(100_000_000*128,10**9),12.8)
check('PQ code bytes',F(96*8,8),96)
check('PQ plus ID GB',F(100_000_000*(96+8),10**9),10.4)
check('raw vector to code ratio only',F(768*4,96),32)
check('list records per shard',F(25_000_000,4096),6103.515625)
scanned=F(25_000_000*16,4096)
check('nprobe scanned records',scanned,97656.25)
check('PQ bytes scanned per shard',scanned*104,10_156_250)
check('PQ aggregate GB per second',scanned*104*4*200/10**9,8.125)
check('rescore bytes across four shards',100*768*4*4,1_228_800)
check('rescore decimal MB per second',F(1_228_800*200,10**6),245.76)
check('small allowed set bytes',5000*768*4,15_360_000)
check('uniform 0.1pct postfilter expected matches',F(100,1000),.1)
check('uniform expected candidates to k=10',F(10*1000),10_000)
check('query rate per shard',200,200)
check('four-shard aggregate search rate',200*4,800)
check('two replicas each load',F(200,2),100)
check('normal load fraction of illustrative budget',F(100,120),F(5,6))
check('N-1 two-copy deficit per shard',200-120,80)
check('three copies N-1 illustrative capacity',(3-1)*120,240)
check('four independent shard threshold probability',F(95,100)**4,.81450625)
check('logical log bytes per second',100*4096,409600)
check('per shard logical log bytes per second',F(100*4096,4),102400)
check('two log copies decimal MB per second',F(100*4096*2,10**6),.8192)
check('one copy all-day peak GB',F(100*4096*86400,10**9),35.38944)
check('Recall nine of ten',F(9,10),.9)
report=dict(passed=True,count=len(rows),checks=rows,limits='Independent arithmetic under chapter assumptions, not a benchmark or ANN recall experiment')
(ROOT/'docs/reviews/ch31-independent-numeric-results.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(dict(passed=True,checks=len(rows))))
