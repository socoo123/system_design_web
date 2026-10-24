#!/usr/bin/env python3
from pathlib import Path
from contextlib import closing
from concurrent.futures import ThreadPoolExecutor
import importlib.util
import hashlib
import json
import tempfile
import threading
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('independent_author',ROOT/'examples/ch45/verify.py');v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
checks=[];traces=[]
def ok(c,name):
 if not c:raise AssertionError(name)
 checks.append(name)
def expect(kind,f):
 try:f()
 except kind:return
 raise AssertionError('expected '+str(kind))
def race(fs):
 gate=threading.Barrier(len(fs))
 def run(f):gate.wait(timeout=5);return f()
 with ThreadPoolExecutor(max_workers=len(fs)) as p:return list(p.map(run,fs))
with tempfile.TemporaryDirectory(prefix='ch45-independent-store-') as temp:
 def db(name,pending=False):
  file=Path(temp)/(name+'.db');v.fixture(file,pending);return file
 p=db('receipts');receipt=v.edit(p,'new-k61',7,5)
 ok(receipt=={'version':8,'total':16997,'currency':'USD'},'independent quantity5 =>16997/v8')
 v.edit(p,'new-k62',8,8)
 ok(v.edit(p,'new-k61',7,5)==receipt and v.snapshot(p)['orders'][0]['total']==25994,'old receipt stays v8 after later v9/25994')
 snap=v.snapshot(p);expect(ValueError,lambda:v.edit(p,'new-k61',7,8));ok(v.snapshot(p)==snap,'same key changed payload rolls back entire command')
 expect(OverflowError,lambda:v.edit(p,'new-huge',9,2**63-1));ok(v.snapshot(p)==snap,'new amount overflow rolls back root lines receipt')
 p=db('two-facts',True)
 outcomes=race([lambda:v.consume(p,v.event('new-e41',payment_id='p9')),lambda:v.consume(p,v.event('new-e42',payment_id='p10'))])
 data=v.snapshot(p);ok(sorted(outcomes)==['ACCEPTED','REFUND_REQUIRED'],'two payment facts racing yield one fulfillment and one refund')
 ok(len(data['capture_result'])==len(data['inbox'])==len(data['outbox'])==2 and len(data['refund_work'])==1,'two fact decisions/outbox, exactly one rejected-payment work')
 accepted=data['orders'][0]['accepted_payment'];rejected=data['refund_work'][0]['payment_id']
 ok(accepted!=rejected,'refund refers to rejected payment, never the fulfillment winner')
 refund_before=data['refund_work'];outbox_before=data['outbox']
 with closing(v.connect(p)) as c:c.execute("UPDATE refund_work SET state='UNKNOWN'")
 for n,pay in enumerate(['p9','p10','p9','p10'],51):v.consume(p,v.event('new-e'+str(n),payment_id=pay,pay_version=8+n))
 data=v.snapshot(p);ok(len(data['inbox'])==6 and len(data['outbox'])==2 and len(data['capture_result'])==2,'new delivery IDs/revisions do not repeat same capture business effect')
 ok(data['refund_work'][0]['refund_id']==refund_before[0]['refund_id'] and data['refund_work'][0]['state']=='UNKNOWN','unknown refund keeps original identity across new deliveries')
 p=db('same-fact-race',True)
 outcomes=race([lambda:v.consume(p,v.event('new-e61')),lambda:v.consume(p,v.event('new-e62'))])
 data=v.snapshot(p);ok(outcomes==['ACCEPTED','ACCEPTED'] and len(data['inbox'])==2 and len(data['outbox'])==1,'concurrent two event IDs one capture commit one publication')
 ok(data['orders'][0]['version']==10,'two deliveries do not advance aggregate twice')
 p=db('closed-refund',True)
 with closing(v.connect(p)) as c:c.execute("UPDATE orders SET state='closed',version=10")
 before=v.snapshot(p);expect(RuntimeError,lambda:v.consume(p,v.event('new-late'),True));ok(v.snapshot(p)==before,'closed late capture injected rollback includes refund work/outbox/results')
 ok(v.consume(p,v.event('new-late'))=='REFUND_REQUIRED','closed late capture produces recovery work')
 data=v.snapshot(p);w=data['refund_work'][0];public=json.loads(data['outbox'][0]['payload'])
 ok(w['refund_id']==public['refund_id'] and w['amount']==public['amount']==10999,'refund public contract uses same committed work identity/amount')
 ok(data['orders'][0]['state']=='closed' and data['orders'][0]['version']==10,'refund does not resurrect or fabricate aggregate update')
 traces.append({'twoFactsAccepted':accepted,'twoFactsRejected':rejected,'unknownIdentity':refund_before[0]['refund_id'],'localEngineOnly':True})
files=[ROOT/'chapters/ch45.html',*sorted((ROOT/'examples/ch45').glob('*'))]
result={'passed':True,'newChecks':len(checks),'checks':checks,'traces':traces,'sourceHashes':{str(f.relative_to(ROOT)):hashlib.sha256(f.read_bytes()).hexdigest() for f in files if f.is_file()},'limitations':['SQLite BEGIN IMMEDIATE serializes writers; not PostgreSQL concurrency','No actual PSP, network ACK loss, broker or power failure','Injected fail=True is local exception rollback only']}
(ROOT/'docs/reviews/ch45-independent-storage-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'passed':True,'newChecks':len(checks),'traces':traces}))
