import sys
sys.dont_write_bytecode=True
from pathlib import Path
import hashlib,importlib.util,json,sqlite3,tempfile,threading
R=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('ch29_quota_model',R/'examples/ch29/quota_model.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
checks=[]
def ok(name,b):
 if not b:raise AssertionError(name)
 checks.append(name)
with tempfile.TemporaryDirectory(prefix='ch29-review-quota-') as td:
 m=mod.Model(td)
 m.seed('wrong-owner',owner='workerB/gen9',units=17)
 ok('wrong owner reject remains pending',m.reject('wrong-owner','workerA/gen9')==(202,'PENDING'))
 ok('wrong owner cannot gain run grant',not m.grant('wrong-owner','workerA/gen9'))
 ok('wrong owner creates no settlement',m.snapshot('wrong-owner')[1] is None)
 m.seed('lost-http',units=1025);m.reject('lost-http') # discard HTTP response
 a,event,q=m.snapshot('lost-http')
 ok('429 durable before response',a==('TERMINAL',429,'OVERLOADED') and event==(0,) and q==(1025,'RESERVED',0))
 ok('capacity restored same key stays429',m.enqueue('lost-http',False)==(429,'OVERLOADED'))
 ok('429 cannot obtain first-launch grant',not m.grant('lost-http'))
 m.deliver('lost-http',lose_ack=True)
 ok('release committed but outbox pending after lostACK',m.snapshot('lost-http')[1]==(0,) and m.snapshot('lost-http')[2]==(1025,'RELEASED',1))
 for _ in range(3):m.deliver('lost-http',lose_ack=True)
 ok('multiple release retransmits refund once',m.snapshot('lost-http')[2][2]==1)
 m.deliver('lost-http');ok('relay finally acknowledges original event',m.snapshot('lost-http')[1]==(1,))
 m.seed('rollback',units=19)
 try:m.reject('rollback',fail=True);raise AssertionError('injected failure absent')
 except RuntimeError:pass
 ok('failed intent tx keepsAssigned andReserved',m.snapshot('rollback')==(('ASSIGNED',None,None),None,(19,'RESERVED',0)))
 ok('retry same rejection can commit',m.reject('rollback')==(429,'OVERLOADED'))
 m.seed('grant-first',units=23);ok('first grant normal',m.grant('grant-first'))
 ok('same committed grant replay is sameowner',m.grant('grant-first'))
 ok('grant wins against later unspent rejection',m.reject('grant-first')==(202,'PENDING'))
 ok('launched quota remainsReserved with no unspent event',m.snapshot('grant-first')[1] is None and m.snapshot('grant-first')[2]==(23,'RESERVED',0))
 ok('relay cannot invent event for granted attempt',not m.deliver('grant-first'))
 # Hold the separate quota authority writer: terminal intent stays durable while delivery blocks.
 m.seed('quota-paused',units=29);m.reject('quota-paused')
 lock=sqlite3.connect(m.quota,isolation_level=None);lock.execute('BEGIN IMMEDIATE')
 started=threading.Event();done=threading.Event();fail=[]
 def relay():
  try:started.set();m.deliver('quota-paused')
  except BaseException as e:fail.append(str(e))
  finally:done.set()
 t=threading.Thread(target=relay);t.start();started.wait(1)
 ok('quota pause does not falsely report refund',not done.wait(0.05))
 with sqlite3.connect(m.authority) as a:
  ok('intent remains pending independently of quotaDB',a.execute('SELECT acked FROM settlement WHERE id="quota-paused"').fetchone()==(0,))
 lock.commit();lock.close();t.join(3)
 ok('healthy quota recovery drains same event',done.is_set() and not fail and m.snapshot('quota-paused')[2]==(29,'RELEASED',1))
 # Revised on_release order: two independent charges survive durable failures/unknowns.
 m.seed('release-A',units=41);m.track_unstarted_local('release-A')
 m.seed('release-B',units=43);m.track_unstarted_local('release-B')
 ok('two pending releases retain two local charges',m.local_active==2 and m.charged=={'release-A','release-B'})
 try:m.release_unstarted_notice('release-A',fail=True);raise AssertionError('failure not injected')
 except RuntimeError:pass
 ok('failed persistence does not remove charge or decrement tenant',m.local_active==2 and 'release-A' in m.charged)
 ok('failed tx leaves no settlement event',m.snapshot('release-A')[1] is None)
 try:m.release_unstarted_notice('release-B',lose_commit_reply=True);raise AssertionError('unknown not injected')
 except TimeoutError:pass
 ok('unknown committed result retains both local charges',m.local_active==2 and 'release-B' in m.charged)
 ok('unknown commit preserved durable outbox',m.snapshot('release-B')[0][0]=='TERMINAL' and m.snapshot('release-B')[1]==(0,))
 ok('same attempt confirms original commit then removes once',m.release_unstarted_notice('release-B') and m.local_active==1)
 ok('other pending charge survives independent completion',m.charged=={'release-A'})
 ok('duplicate releaseB cannot decrement another pending owner',not m.release_unstarted_notice('release-B') and m.local_active==1)
 ok('retry after rolledback persistence completes releaseA',m.release_unstarted_notice('release-A') and m.local_active==0)
 ok('duplicate releaseA cannot decrement below zero',not m.release_unstarted_notice('release-A') and m.local_active==0)
 for key in ('release-A','release-B'):
  m.deliver(key,lose_ack=True);m.deliver(key);m.deliver(key)
  ok('recovered local release refunds quota once '+key,m.snapshot(key)[2][2]==1)
 source=(R/'examples/ch29/admission.pseudo').read_text().split('on_release(owner):')[1]
 ok('page source orders durable confirmation before charged removal',source.index('charged.get') < source.index('persist_terminal_and_quota_settlement') < source.index('charged.remove'))
 # Two deterministic serial orders and fresh concurrent races against actual authored methods.
 for i in range(8):
  k='new-race-'+str(i);m.seed(k,units=31+i);gate=threading.Barrier(2);out=[]
  def grant():gate.wait();out.append(('grant',m.grant(k)))
  def reject():gate.wait();out.append(('reject',m.reject(k)))
  a=threading.Thread(target=grant);b=threading.Thread(target=reject);a.start();b.start();a.join();b.join()
  result=dict(out);state,event,q=m.snapshot(k)
  ok('grant/refund exclusion '+str(i),(result['grant'] and result['reject']==(202,'PENDING') and state[0]=='RUN_GRANTED' and event is None)
     or (not result['grant'] and result['reject']==(429,'OVERLOADED') and state[0]=='TERMINAL' and event==(0,)))
files=[R/'chapters/ch29.html',*(R/'examples/ch29').glob('*')]
out={'passed':True,'count':len(checks),'checks':checks,'sourceHashes':{str(p.relative_to(R)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files if p.is_file()},'limit':'Actual authored two-local-SQLite adapter. No GPU/PG/network failure; quota pause uses a held SQLite writer lock.'}
(R/'docs/reviews/ch29-independent-quota-results.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'passed':True,'count':len(checks)}))
