"""Independent adversarial inputs against the author's actual SQLite model."""
from pathlib import Path
import sys, json, hashlib, tempfile, importlib.util, threading, math, re
from concurrent.futures import ThreadPoolExecutor
sys.dont_write_bytecode = True
root = Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('ch18_actual_model',root/'examples/ch18/model.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
Model,Rejected=m.Model,m.Rejected
checks=[]
def ok(c,label):
 if not c: raise AssertionError(label)
 checks.append(label)
def reject(fn,label):
 try: fn()
 except Rejected: checks.append(label);return
 raise AssertionError('unexpected success '+label)
def values(db,sku='C'):
 s=next(r for r in db.rows('stock') if r['sku_id']==sku)
 return s['available'],s['reserved'],s['sold']
def count(db,table,**fields):return sum(all(r[k]==v for k,v in fields.items()) for r in db.rows(table))
with tempfile.TemporaryDirectory(prefix='ch18-independent-') as temp:
 seq=0
 def setup(stock=None):
  global seq;seq+=1
  db=Model(Path(temp)/f'{seq}.db');db.initialize()
  db.seed(stock or {'C':7,'D':2},[{'id':'quote-17','owner':'user-17','currency':'JPY','address':'addr-v9','items':{'C':3101,'D':4600},'expires':700}])
  return db,{'quote_id':'quote-17','currency':'JPY','address_version':'addr-v9','items':[('D',1),('C',2)]}
 def evidence(db,oid,cap):
  a=db.start_attempt(oid,'user-17',now=110)
  return a,db.evidence(a,cap,owner='user-17')
 # A fresh request races from absence, rather than only replaying an existing row.
 db,intent=setup();barrier=threading.Barrier(12)
 def submit(_):barrier.wait();return db.checkout('user-17','fresh-race',intent,now=100)
 with ThreadPoolExecutor(12) as pool: receipts=list(pool.map(submit,range(12)))
 r=receipts[0];oid=r['order_id']
 ok(all(x==r for x in receipts) and count(db,'orders')==1,'12 fresh concurrent equal keys create one order')
 ok(r['total']==10802 and values(db)==(5,2,0) and values(db,'D')==(1,1,0),'JPY exact integer basket and both owned holds')
 reject(lambda:db.checkout('user-17','fresh-race',dict(intent,items=[('C',1),('D',1)])),'same key different quantity refuses old receipt')
 reject(lambda:db.checkout('user-17','fresh-race',dict(intent,address_version='addr-v10')),'same key different address refuses old receipt')
 a,e=evidence(db,oid,'capture-normal')
 ok(db.apply_capture(e)=='ACCEPTED' and values(db)==(5,0,2),'normal payment consumes owned basket')
 ok(db.checkout('user-17','fresh-race',intent,now=99999)==r,'expired quote and paid order still replay immutable create receipt')
 broker=[];db.publish(broker,lose_ack=True);db.publish(broker)
 f=[x for x in broker if x['kind']=='fulfill']
 ok(len(f)==2 and f[0]['event_id']==f[1]['event_id'],'normal outbox recovers unknown broker ACK with same event')
 sink=Model(Path(temp)/'sink.db');sink.initialize()
 reject(lambda:sink.consume(f[0],crash_before_commit=True),'fulfillment crash before commit rolls back both writes')
 ok(not sink.rows('consumer_inbox') and not sink.rows('fulfillment_jobs'),'no consumed identity can exist without job after rollback')
 sink.consume(f[0]);sink.consume(f[1]);sink.consume(dict(f[0],event_id='another-valid-event'))
 ok(count(sink,'fulfillment_jobs')==1 and count(sink,'consumer_inbox')==2,'duplicate and distinct events for one order retain exactly one durable job')
 reject(lambda:sink.consume(dict(f[0],payload='{"order_id":"other"}')),'same event changed payload rejects without new work')
 # Concurrent unequal intents choose exactly one complete winner.
 db,intent=setup();barrier=threading.Barrier(2)
 def unequal(qty):
  barrier.wait()
  try:return ('OK',db.checkout('user-17','unequal',dict(intent,items=[('C',qty),('D',1)])))
  except Rejected:return ('CONFLICT',None)
 with ThreadPoolExecutor(2) as pool: result=list(pool.map(unequal,[1,3]))
 good=[x[1] for x in result if x[0]=='OK']
 ok(len(good)==1 and len([x for x in result if x[0]=='CONFLICT'])==1,'fresh same-key different-intent race has one winner and one conflict')
 qty=(good[0]['total']-4600)//3101
 ok(values(db)==(7-qty,qty,0) and count(db,'orders')==1,'losing different intent cannot leave a second hold')
 # All tables roll back even after successfully touching earlier SKU.
 db,intent=setup({'C':7,'D':0})
 reject(lambda:db.checkout('user-17','basket-fail',intent),'later SKU shortage aborts complete basket')
 ok(values(db)==(7,0,0) and all(not db.rows(t) for t in ['requests','orders','items','reservations','outbox']),'shortage leaves no identity or partial order/hold/event')
 db,intent=setup();reject(lambda:db.checkout('user-17','crash',intent,fail_after=1),'injected crash after earlier SKU')
 ok(values(db)==(7,0,0) and not db.rows('requests'),'exception rolls back earlier stock and request claim')
 # Own reservation must not be substituted by another order's aggregate counter.
 db,intent=setup({'C':10,'D':10});one=db.checkout('user-17','one',intent)['order_id'];two=db.checkout('user-17','two',intent)['order_id']
 db.close(one,reason='user_cancel',owner='user-17')
 before=(values(db),values(db,'D'))
 ok(db.close(one)=='no_change' and before==(values(db),values(db,'D')),'repeat cancelled order cannot release another live order')
 ok(all(h['state']=='HELD' for h in db.rows('reservations') if h['order_id']==two),'other order still owns every held item')
 # A corruption guard must abort the entire outer payment transaction, then retained input retries.
 a,e=evidence(db,two,'capture-corrupt');key=db.receive_webhook(e,'evt-corrupt')
 with db.transaction() as c:c.execute('UPDATE reservations SET qty=qty+1 WHERE order_id=? AND sku_id=?',(two,'D'))
 reject(lambda:db.process_webhook(key),'mismatched owned hold refuses payment finalization')
 ok(not db.rows('captures') and next(o for o in db.rows('orders') if o['order_id']==two)['status']=='pending_pay','failed invariant rolls back capture and paid state')
 ok(db.rows('payment_inbox')[0]['state']=='READY' and before==(values(db),values(db,'D')),'complete inbox survives invariant failure without inventory mutation')
 with db.transaction() as c:c.execute('UPDATE reservations SET qty=1 WHERE order_id=? AND sku_id=?',(two,'D'))
 ok(db.process_webhook(key)=='ACCEPTED','repaired invariant replays original retained input successfully')
 # New object binding and UNKNOWN never authorize a new charge.
 db,intent=setup();oid=db.checkout('user-17','unknown',intent)['order_id'];a,e=evidence(db,oid,'capture-u')
 db.mark_unknown(a['attempt_id'])
 ok(db.start_attempt(oid,'user-17')['attempt_id']==a['attempt_id'],'unknown attempt blocks another attempt')
 reject(lambda:db.terminal_no_capture(a['attempt_id'],False),'elapsed local time is not no-capture evidence')
 wrong=dict(e,amount=e['amount']+1,capture_id='capture-wrong-first')
 ok(db.apply_capture(wrong)=='REVIEW' and db.rows('attempts')[0]['provider_binding'] is None,'wrong first amount cannot bind an unknown provider object')
 ok(db.start_attempt(oid,'user-17')['attempt_id']==a['attempt_id'],'reviewed money still blocks another attempt')
 ok(db.apply_capture(e)=='ACCEPTED' and db.rows('attempts')[0]['provider_binding']==e['provider_binding'],'valid queried evidence binds initially unknown object once')
 ok(db.mark_unknown(a['attempt_id'])==0,'late timeout never overwrites captured state')
 ok(db.apply_capture(dict(e,capture_id='capture-wrong-object',provider_binding='unrelated-object'))=='REVIEW','different object cannot replace the bound object')
 ok(db.rows('attempts')[0]['state']=='CAPTURED','later review never downgrades already captured attempt')
 # Every extra capture retains its own obligation, while event duplication does not add one.
 for i in range(3):
  extra=dict(e,capture_id=f'extra-{i}')
  for j in range(2):db.process_webhook(db.receive_webhook(extra,f'evt-extra-{i}-{j}'))
 ok(count(db,'refund_due')==3 and count(db,'outbox',kind='refund')==3,'three real extra captures yield three independent refund obligations')
 ok(count(db,'outbox',kind='fulfill')==1 and count(db,'captures')==6,'extra-event dedup preserves one fulfillment and all accepted/review money facts')
 conflicting=db.receive_webhook(dict(e,currency='USD'),'immutable-conflict')
 reject(lambda:db.process_webhook(conflicting),'same capture changed currency is not treated as a duplicate success')
 ok(next(x for x in db.rows('payment_inbox') if x['event_id']=='immutable-conflict')['state']=='READY','conflicting full input cannot be marked DONE')
 # Both deterministic winners, including stock reused by another customer/order.
 db,intent=setup({'C':2,'D':1});oid=db.checkout('user-17','close-first',intent)['order_id'];a,e=evidence(db,oid,'late-money')
 db.close(oid)
 later=db.checkout('user-17','later-buyer',intent,now=100)['order_id']
 ok(db.apply_capture(e)=='REFUND_DUE' and values(db)==(0,2,0),'late payment cannot consume stock reallocated to another order')
 ok(next(x for x in db.rows('orders') if x['order_id']==oid)['status']=='closed' and all(h['state']=='HELD' for h in db.rows('reservations') if h['order_id']==later),'close-first leaves later owner and original closed state intact')
 db,intent=setup();oid=db.checkout('user-17','pay-first',intent)['order_id'];a,e=evidence(db,oid,'pay-before-close')
 db.apply_capture(e);before=(values(db),values(db,'D'))
 ok(db.close(oid)=='no_change' and before==(values(db),values(db,'D')),'payment-first prevents any release')
 # Inbox durable ingress, apply commit and DONE gap are separate tested windows.
 db,intent=setup();oid=db.checkout('user-17','crash-gap',intent)['order_id'];a,e=evidence(db,oid,'money-gap')
 key=db.receive_webhook(e,'event-gap');ok(db.rows('payment_inbox')[0]['body']==m.canonical(e) and not db.rows('captures'),'durable inbox contains complete evidence before processing')
 reject(lambda:db.process_webhook(key,crash_after_apply=True),'crash after capture transaction before inbox DONE')
 ok(db.rows('payment_inbox')[0]['state']=='READY' and count(db,'outbox',kind='fulfill')==1,'capture commit and unfinished complete inbox remain recoverable')
 ok(db.process_webhook(key)=='ACCEPTED' and count(db,'outbox',kind='fulfill')==1,'replay closes DONE gap without second task')
 # Page 2 must be visited and failures on either side of a page boundary found next round.
 db,intent=setup({'C':2000,'D':2000});ids=[]
 for i in range(507):ids.append(db.checkout('user-17',f'scan-{i}',intent,now=100+i%3)['order_id'])
 ordered=sorted(db.rows('orders'),key=lambda o:(o['expire_at'],o['order_id']))
 failures={ordered[0]['order_id'],ordered[499]['order_id'],ordered[500]['order_id'],ordered[-1]['order_id']}
 seen=db.scan(1002,fail_ids=failures)
 ok(len(seen)==507 and sum(o['status']=='closed' for o in db.rows('orders'))==503,'full scan visits second page despite failures before/at/after boundary')
 recovered=db.scan(1002)
 ok(set(recovered)==failures and all(o['status']=='closed' for o in db.rows('orders')),'next round restarts oldest and recovers all four skipped failures')
 # Integer and net-rate calculations use new independent arithmetic expressions.
 ok(math.isclose(1_000_000/86_400*10,115.74074074074075),'mean and peak order rates independently recomputed')
 ok(4_000*1_000_000*365*3==4_380_000_000_000,'annual order storage and three total copies')
 ok(116*900==104400 and 116*900*3==313200,'peak hold and unit occupancy')
 ok(math.ceil(116*10*120/(2000-116*10))==166,'backlog recovery subtracts ongoing arrivals')
 ok(35*600/(70-35)==600 and math.ceil(35*60/500)==5,'expiry recovery and page count independently recomputed')
 ok(10_000_000*1000*7*3==210_000_000_000 and 2*116>1/.005,'outbox retention and hot SKU saturation independently recomputed')
# Re-run author's actual assertions with reporting redirected only, leaving its files read-only.
source=root/'examples/ch18/check.py';text=source.read_text();needle="'docs/reviews/ch18-code-results.json'"
assert text.count(needle)==1
text=text.replace(needle,"'docs/reviews/ch18-independent-author-suite-results.json'")
sys.path.insert(0,str(root/'examples/ch18'))
exec(compile(text,str(source),'exec'),{'__file__':str(source),'__name__':'__main__'})
sha=hashlib.sha256((root/'chapters/ch18.html').read_bytes()).hexdigest()
out={'passed':True,'independentChecks':len(checks),'checks':checks,'htmlSha256':sha,'limits':'Actual author SQLite transaction model; no real PG/Stripe/JWT/broker/warehouse validation.'}
(root/'docs/reviews/ch18-independent-code-results.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print('PASS',len(checks),'independent assertions against actual model')
