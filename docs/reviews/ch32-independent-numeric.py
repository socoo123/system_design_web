from pathlib import Path
import json,math
checks=[]
def test(name,actual,want):
    if not math.isclose(actual,want,rel_tol=1e-10,abs_tol=1e-10):raise AssertionError((name,actual,want))
    checks.append(dict(name=name,actual=actual,expected=want,passed=True))
test('logical RPM',20*60,1200)
test('input TPM',1200*2000,2400000)
test('output TPM',1200*400,480000)
test('actual mean total TPM',1200*(2000+400),2880000)
test('hard hold per example attempt',2000+1000,3000)
test('cohort reserved token work',1200*3000,3600000)
test('two-attempt cohort count',1200*2,2400)
test('two-attempt cohort reservation',1200*2*3000,7200000)
test('same-window steady calls per second',2400/60,40)
test('context needed',8000+1000,9000)
test('small-context deficit',9000-4000,5000)
test('first-response design seconds',.2+.8+.2+.7,1.9)
test('first-response headroom seconds',2-(.2+.8+.2+.7),.1)
test('intervals after first visible token',400-1,399)
test('mean visible tail seconds',399/50,7.98)
test('mean stream seconds',.5+399/50,8.48)
test('mean live streams',20*(.5+399/50),169.6)
test('application buffer bytes',200*64*1024,13107200)
test('application buffer MiB',200*64*1024/2**20,12.5)
test('read/event/encoded payload four-way budget KiB',4*16,64)
test('net released from hold',3000-2400,600)
test('two actually executed attempts',2*(2000+400),4800)
test('FAQ reuse percent',40/500*100,8)
test('wrong hit conditional percent',1/40*100,2.5)
test('wrong answer overall percent',1/500*100,.2)
test('ideal avoided generation/s',20*40/500,1.6)
test('remaining generation/s',20*(1-40/500),18.4)
# New finite trace: 20 new logical requests/s, up to two calls each, 2s deadline.
# Retries from two older one-second cohorts align before their deadlines.
requests=[dict(id=f'{g}-{i}',arrival=t,primary=t,fallback=.1 if g<2 else None) for g,t in enumerate((-1.6,-.6,.4)) for i in range(20)]
assert all(r['fallback'] is None or r['fallback']-r['arrival']<2 for r in requests)
calls=[r['primary'] for r in requests]+[r['fallback'] for r in requests if r['fallback'] is not None]
test('new cross-window burst in [0,1) calls',sum(0<=t<1 for t in calls),60)
test('same trace total attempts stays below two per request',len(calls),100)
result=dict(passed=True,count=len(checks),checks=checks,cross_window_trace=requests,interpretation='Cohort <=2 calls is not an instantaneous 40/s bound. This is an arithmetic dispatch/deadline trace, not a provider/network experiment. Deployment rate admission must shape the trace; the 1.9s allocation is a proposed SLO, not guaranteed by the count bound.')
Path('docs/reviews/ch32-independent-numeric-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(dict(passed=True,count=len(checks))))
