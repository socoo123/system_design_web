import sys
sys.dont_write_bytecode = True
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
import tempfile,json,hashlib
from quota_model import Model

checks=[]
def check(ok,label):
    if not ok: raise AssertionError(label)
    checks.append(label)
root=Path(__file__).resolve().parents[2]
result={'passed':False,'scope':'Actual two local SQLite databases; no GPU, network or distributed quota authority'}
try:
    with tempfile.TemporaryDirectory(prefix='ch29-quota-') as d:
        m=Model(d);m.seed('full-response-lost',units=333)
        check(m.enqueue('full-response-lost',True)==(429,'OVERLOADED'),'full queue returns terminal 429')
        check(m.snapshot('full-response-lost')[0][0]=='TERMINAL','terminal decision is durable before HTTP reply')
        check(m.enqueue('full-response-lost',False)==(429,'OVERLOADED'),'lost reply same-key retry cannot enqueue when capacity returns')
        check(not m.grant('full-response-lost'),'terminal denial cannot gain GPU run grant')
        check(m.deliver('full-response-lost',lose_ack=True),'quota release commits before simulated lost ACK')
        check(m.snapshot('full-response-lost')[2]==(333,'RELEASED',1),'one unused refund applied')
        check(m.deliver('full-response-lost'),'retry unacked event recovers progress')
        check(m.snapshot('full-response-lost')[2][2]==1,'lost ACK redelivery cannot double refund')
        check(not m.deliver('full-response-lost'),'acked event is idempotent')
        m.seed('duplicate-refusal');barrier=Barrier(8)
        def reject_duplicate():
            barrier.wait();return m.enqueue('duplicate-refusal',True)
        with ThreadPoolExecutor(max_workers=8) as pool:
            calls=[pool.submit(reject_duplicate) for _ in range(8)]
            check(all(f.result()==(429,'OVERLOADED') for f in calls),'eight duplicate full-queue inputs recover one terminal result')
        barrier=Barrier(8)
        def replay_release():
            barrier.wait();return m.deliver('duplicate-refusal',lose_ack=True)
        with ThreadPoolExecutor(max_workers=8) as pool:
            calls=[pool.submit(replay_release) for _ in range(8)];[f.result() for f in calls]
        check(m.snapshot('duplicate-refusal')[2][2]==1,'eight duplicate relay calls refund once')
        m.deliver('duplicate-refusal')
        m.seed('abort-before-outbox');before=m.snapshot('abort-before-outbox')
        try:m.reject('abort-before-outbox',fail=True)
        except RuntimeError:pass
        check(m.snapshot('abort-before-outbox')==before,'failed terminal/outbox transaction preserves both old states')
        check(m.reject('abort-before-outbox')==(429,'OVERLOADED'),'same original attempt can finish failed rejection')
        m.seed('started');check(m.grant('started'),'first run grant normal path')
        check(m.reject('started')==(202,'PENDING'),'started attempt cannot be unspent-refunded on duplicate overload')
        check(m.snapshot('started')[1] is None and m.snapshot('started')[2][1]=='RESERVED','no refund event for started attempt')
        for i in range(30):
            key=f'grant-reject-{i}';m.seed(key);barrier=Barrier(2)
            def grant():barrier.wait();return m.grant(key)
            def reject():barrier.wait();return m.reject(key)
            with ThreadPoolExecutor(max_workers=2) as pool:
                f1=pool.submit(grant);f2=pool.submit(reject);g,r=f1.result(),f2.result()
            a,event,q=m.snapshot(key)
            check((g and r==(202,'PENDING') and a[0]=='RUN_GRANTED' and event is None)
                  or (not g and r==(429,'OVERLOADED') and a[0]=='TERMINAL' and event==(0,)),
                  f'run grant/reject serialization {i}')
        result['passed']=True
finally:
    result['checks']=checks;result['count']=len(checks)
    result['source_sha256']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(Path(__file__).parent.glob('quota*.py'))}
    out=Path(sys.argv[1]) if len(sys.argv)>1 else root/'docs/reviews/ch29-quota-results.json'
    out.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'passed':result['passed'],'count':len(checks)}))
