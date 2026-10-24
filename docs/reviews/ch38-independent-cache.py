"""Independent new-input contract checks; never writes the author's source tree."""
import sys
sys.dont_write_bytecode = True
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'examples/ch38'))
from cache import Cache, Evidence, Token
import hashlib
import json
import multiprocessing as mp
import sqlite3
import tempfile
import time

BASE=9_000_000
checks=[]
def check(name,ok,actual=None):
 checks.append({'name':name,'passed':bool(ok),'actual':actual})
 if not ok:raise AssertionError(name)
def actor(file,key,token,evidence,barrier,queue,action):
 c=Cache(file,lambda:BASE);barrier.wait(timeout=10)
 if action=='fill':queue.put(('fill',c.fill(key,token,evidence)))
 elif action=='invalidate':c.invalidate(key,43);queue.put(('invalidate',True))
 elif action=='hit':
  kind,value=c.claim(key);queue.put((kind,value.version if isinstance(value,Evidence) else None))
 c.close()
def waiter(file,key,token,now,ready,go,sampled,queue,action):
 def clock():sampled.set();return now.value
 c=Cache(file,clock);ready.set();go.wait(timeout=10)
 if action=='fill':queue.put(c.fill(key,token,Evidence.primary(8,BASE)))
 else:
  kind,new=c.claim(key);queue.put((kind,new.ticket if isinstance(new,Token) else None))
 c.close()
def main():
 ctx=mp.get_context('spawn')
 with tempfile.TemporaryDirectory(prefix='ch38-review-') as tmp:
  file=str(Path(tmp)/'cache.db');clock=[BASE];a=Cache(file,lambda:clock[0]);b=Cache(file,lambda:clock[0])
  kind,t=a.claim('tenant-42|sku-9|ja|gzip');check('cold representation leads',kind=='LEADER')
  e=Evidence.primary(42,BASE,body='public-ja-gzip-v42')
  check('fresh source fill',a.fill('tenant-42|sku-9|ja|gzip',t,e))
  hit=b.claim('tenant-42|sku-9|ja|gzip');check('other connection sees complete evidence',hit==('HIT',e))
  check('copy preserves fixed observed and hard',hit[1].observed==BASE and hit[1].hard==BASE+20_000)
  clock[0]=BASE+17_999;check('cache hit one ms inside two-second margin',a.claim('tenant-42|sku-9|ja|gzip')[0]=='HIT')
  clock[0]=BASE+18_000;kind,replacement=b.claim('tenant-42|sku-9|ja|gzip');check('hard margin exact boundary cannot hit',kind=='LEADER')
  check('old consumed token cannot refill at boundary',not a.fill('tenant-42|sku-9|ja|gzip',t,e))
  clock[0]=BASE
  _,scope=a.claim('tenant-42|sku-9|ja|br');check('encoding changes scope',scope is not None)
  _,other=a.claim('tenant-99|sku-9|ja|gzip')
  check('cannot transplant other key token',not b.fill('tenant-99|sku-9|ja|gzip',scope,e))
  check('correct scoped token fills',b.fill('tenant-99|sku-9|ja|gzip',other,e))
  _,old=a.claim('floor-sequence')
  for revision in [9,3,11,0,7,11]:b.invalidate('floor-sequence',revision)
  check('reordered revisions retain maximum floor',a.db.execute("SELECT floor FROM metadata WHERE key='floor-sequence'").fetchone()[0]==11)
  check('revoked owner rejected even with huge version',not a.fill('floor-sequence',old,Evidence.primary(999,BASE)))
  _,new=a.claim('floor-sequence')
  check('new ticket cannot bypass version floor',not a.fill('floor-sequence',new,Evidence.primary(10,BASE)))
  check('fresh floor revision succeeds',a.fill('floor-sequence',new,Evidence.primary(11,BASE)))
  check('success consumes ticket exactly once',not a.fill('floor-sequence',new,Evidence.primary(11,BASE)))
  b.invalidate('absence',12);_,nt=a.claim('absence')
  check('negative revision cannot reset to zero',not a.fill('absence',nt,Evidence.primary(0,BASE,True)))
  absent=Evidence.primary(12,BASE,True)
  check('authoritative tombstone revision supports absence',a.fill('absence',nt,absent))
  check('negative evidence hard life remains five seconds',b.claim('absence')==('HIT',absent) and absent.hard==BASE+5000)
  b.invalidate('absence',13)
  check('creation evicts negative',b.value('absence') is None)
  check('old absence ticket cannot revive after create',not a.fill('absence',nt,absent))
  _,created=a.claim('absence');check('new row revision replaces absence',b.fill('absence',created,Evidence.primary(13,BASE,False,'created')))
  for label,evidence in [('negative life20',Evidence(1,BASE,BASE+20000,True)),('positive life5',Evidence(1,BASE,BASE+5000,False)),('future too far',Evidence.primary(1,BASE+2001)),('already too old',Evidence.primary(1,BASE-18000))]:
   key='invalid/'+label;_,ticket=a.claim(key);check(label+' rejected',not b.fill(key,ticket,evidence))
  _,edge=a.claim('future-boundary');check('future timestamp within declared skew accepted',a.fill('future-boundary',edge,Evidence.primary(1,BASE+2000)))
  _,lost=a.claim('metadata-loss');a.db.execute("DELETE FROM metadata WHERE key='metadata-loss'")
  check('lost metadata rejects old owner',not b.fill('metadata-loss',lost,Evidence.primary(1,BASE)))
  _,recreated=b.claim('metadata-loss');check('recreated metadata does not resurrect old token',not a.fill('metadata-loss',lost,Evidence.primary(1,BASE)) and recreated!=lost)
  check('recreated key requires new source evidence',b.fill('metadata-loss',recreated,Evidence.primary(2,BASE)))
  _,before=a.claim('epoch');b.restart()
  check('other connection restart revokes old epoch',not a.fill('epoch',before,Evidence.primary(100,BASE)))
  check('restart clears cached values',a.value('floor-sequence') is None)
  check('restart retains known floor',a.db.execute("SELECT floor FROM metadata WHERE key='floor-sequence'").fetchone()[0]==11)
  _,after=a.claim('epoch');check('epoch rotates and fresh source can fill',after.epoch!=before.epoch and a.fill('epoch',after,Evidence.primary(101,BASE)))
  try:
   with b.atomic():
    b.db.execute("UPDATE metadata SET floor=888 WHERE key='floor-sequence'");b.db.execute('DELETE FROM cache_value');raise RuntimeError('injected rollback')
  except RuntimeError:pass
  check('rollback restores both floor and cache value',a.value('epoch') is not None and a.db.execute("SELECT floor FROM metadata WHERE key='floor-sequence'").fetchone()[0]==11)
  # The trusted-loader premise is explicit, not silently treated as attestation.
  _,forged=a.claim('trust-boundary');check('cache cannot attest a structurally valid fabricated version',a.fill('trust-boundary',forged,Evidence.primary(987654,BASE,body='not-a-real-primary-read')))
  for attempt in range(3):
   key=f'race/{attempt}';_,token=a.claim(key);barrier=ctx.Barrier(2);queue=ctx.Queue()
   ps=[ctx.Process(target=actor,args=(file,key,token,Evidence.primary(42,BASE),barrier,queue,action)) for action in ['fill','invalidate']]
   for p in ps:p.start()
   answers=[queue.get(timeout=15) for _ in ps]
   for p in ps:p.join(5)
   check(f'race {attempt} both processes finish',all(p.exitcode==0 for p in ps),answers)
   check(f'race {attempt} final state never retains old value',a.value(key) is None and a.db.execute('SELECT floor FROM metadata WHERE key=?',(key,)).fetchone()[0]==43)
  _,fresh=a.claim('hot-hit');check('prepare shared hit',a.fill('hot-hit',fresh,Evidence.primary(55,BASE,body='one proof')))
  barrier=ctx.Barrier(4);queue=ctx.Queue();ps=[ctx.Process(target=actor,args=(file,'hot-hit',None,None,barrier,queue,'hit')) for _ in range(4)]
  for p in ps:p.start()
  answers=[queue.get(timeout=15) for _ in ps]
  for p in ps:p.join(5)
  check('four independent processes reuse same fixed evidence',answers==[('HIT',55)]*4 and all(p.exitcode==0 for p in ps),answers)
  for action in ['fill','claim']:
   key='post-lock/'+action;shared_now=ctx.Value('q',BASE);owner=Cache(file,lambda:shared_now.value);_,token=owner.claim(key)
   ready=ctx.Event();go=ctx.Event();sampled=ctx.Event();queue=ctx.Queue();p=ctx.Process(target=waiter,args=(file,key,token,shared_now,ready,go,sampled,queue,action));p.start()
   check(action+' waiter constructed before lock',ready.wait(5))
   a.db.execute('BEGIN IMMEDIATE');go.set();time.sleep(.1)
   check(action+' clock not sampled while writer blocked',not sampled.is_set())
   shared_now.value=BASE+1000;a.db.execute('COMMIT');answer=queue.get(timeout=10);p.join(5)
   check(action+' real lock waiter finishes',p.exitcode==0)
   check(action+' samples clock after lease deadline',answer is False if action=='fill' else answer[0]=='LEADER' and answer[1]!=token.ticket,answer)
   owner.close()
  a.close();b.close()
 result={'passed':True,'checks':checks,'sqliteVersion':sqlite3.sqlite_version,'scope':'actual SQLite connections/processes and controlled post-lock clock; no replicated cache, HTTP stack, live Store or real clock-fault test'}
 Path('docs/reviews/ch38-independent-cache-results.json').write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps({'passed':True,'checks':len(checks)}))
if __name__=='__main__':main()
