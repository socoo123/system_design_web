"""Actual SQLite-file/process tests plus explicit teaching-number recomputation."""
import hashlib
import json
import multiprocessing as mp
from pathlib import Path
import sqlite3
import sys
import tempfile
import time
from fractions import Fraction
from cache import Cache, Evidence, Token

CHECKS = []
def check(ok, name):
    if not ok: raise AssertionError(name)
    CHECKS.append(name)

def contender(file, barrier, queue):
    c = Cache(file, lambda:100000)
    barrier.wait()
    kind, token = c.claim("race")
    queue.put((kind, None if token is None else token.ticket))
    c.close()

def invalidate_worker(file, ready, go):
    c=Cache(file,lambda:100000);ready.set();go.wait();c.invalidate("stale",2);c.close()

def lock_waiter(file, now, ready, go, sampled, queue):
    def clock(): sampled.set(); return now.value
    c=Cache(file,clock);ready.set();go.wait()
    kind, token=c.claim("lease")
    queue.put((kind, token.ticket if kind=="LEADER" else None));c.close()

def main():
    ctx=mp.get_context("spawn")
    with tempfile.TemporaryDirectory(prefix="ch38-") as tmp:
        file=str(Path(tmp)/"cache.db");now=[100000]
        c=Cache(file,lambda:now[0])
        kind,t=c.claim("sku|en")
        check(kind=="LEADER","cold claim leads")
        check(c.claim("sku|en")[0]=="WAIT","same key waits during live lease")
        check(c.claim("sku|zh")[0]=="LEADER","representation scope is independent")
        e=Evidence.primary(1,now[0],body="v1-en")
        check(c.fill("sku|en",t,e),"normal guarded fill accepted")
        check(not c.fill("sku|en",t,e),"duplicate fill consumes no second write")
        check(c.claim("sku|en")==('HIT',e),"hit recheck avoids another loader")
        check(c.value("sku|en")["hard"]==120000,"fill preserves original hard deadline")
        c.invalidate("sku|en",2);c.invalidate("sku|en",1);c.invalidate("sku|en",2)
        check(c.value("sku|en") is None,"invalidation evicts current value")
        check(c.db.execute("SELECT floor FROM metadata WHERE key='sku|en'").fetchone()[0]==2,"duplicate/reordered floor is monotonic")
        kind,t2=c.claim("sku|en")
        check(not c.fill("sku|en",t2,e),"fresh token cannot bypass version floor")
        check(c.fill("sku|en",t2,Evidence.primary(2,now[0],body="v2")),"retry with qualifying fresh primary evidence")
        _,old=c.claim("stale");old_e=Evidence.primary(1,now[0])
        ready=ctx.Event();go=ctx.Event();p=ctx.Process(target=invalidate_worker,args=(file,ready,go));p.start();check(ready.wait(5),"writer process starts")
        go.set();p.join(5);check(p.exitcode==0,"writer process commits invalidation")
        check(not c.fill("stale",old,old_e),"old reader cannot refill after other process invalidates")
        _,new=c.claim("stale")
        check(c.fill("stale",new,Evidence.primary(2,now[0])),"new reader can fill updated version")
        check(not c.fill("stale",old,old_e),"e7 cannot overwrite e8 value")
        check(c.value("stale")["version"]==2,"new value survives stale owner")
        _,expired=c.claim("expired");now[0]+=1000
        check(not c.fill("expired",expired,Evidence.primary(1,now[0])),"lease exact deadline rejects fill")
        _,replacement=c.claim("expired")
        check(replacement!=expired,"expired lease gets unique replacement")
        check(not c.fill("expired",expired,Evidence.primary(1,now[0])),"replaced owner is fenced")
        _,negative=c.claim("missing");absent=Evidence.primary(0,now[0],True)
        check(c.fill("missing",negative,absent),"confirmed negative stored")
        check(c.value("missing")["hard"]-c.value("missing")["observed"]==5000,"negative fixed five-second lifetime")
        c.invalidate("missing",1)
        check(c.value("missing") is None,"create invalidation deletes negative")
        check(not c.fill("missing",negative,absent),"old absence cannot revive after creation")
        _,negative2=c.claim("missing")
        check(not c.fill("missing",negative2,absent),"absence revision below create floor refused")
        check(c.fill("missing",negative2,Evidence.primary(1,now[0],False)),"created row replaces absence")
        _,bad=c.claim("bad")
        check(not c.fill("bad",bad,Evidence(0,now[0],now[0]+20000,True)),"negative cannot use positive twenty-second lifetime")
        check(not c.fill("bad",bad,Evidence(1,now[0],now[0]+5000,False)),"positive cannot claim mismatched five-second proof")
        check(not c.fill("bad",bad,Evidence.primary(1,now[0]+2001)),"future timestamp beyond clock margin rejected")
        check(not c.fill("bad",bad,Evidence.primary(1,now[0]-19000)),"late evidence already beyond safe age rejected")
        _,lost=c.claim("lost")
        c.db.execute("DELETE FROM metadata WHERE key='lost'")
        check(not c.fill("lost",lost,Evidence.primary(1,now[0])),"lost metadata rejects token")
        _,renew=c.claim("lost")
        check(not c.fill("lost",lost,Evidence.primary(1,now[0])),"recreated metadata cannot resurrect token")
        check(renew!=lost,"new metadata uses fresh unique ticket")
        _,pre_restart=c.claim("restart");c.restart()
        check(not c.fill("restart",pre_restart,Evidence.primary(1,now[0])),"restart epoch rejects old token")
        check(c.value("stale") is None,"restart clears old values")
        _,post_restart=c.claim("restart")
        check(post_restart.epoch!=pre_restart.epoch,"runtime epoch rotates")
        check(c.fill("restart",post_restart,Evidence.primary(2,now[0])),"new primary evidence fills after restart")
        check(c.db.execute("SELECT floor FROM metadata WHERE key='stale'").fetchone()[0]==2,"model retains known floors across restart")
        # A failed transaction rolls back all cache metadata/value changes.
        try:
            with c.atomic():
                c.db.execute("UPDATE metadata SET floor=99 WHERE key='stale'")
                c.db.execute("DELETE FROM cache_value")
                raise RuntimeError("injected precommit crash")
        except RuntimeError: pass
        check(c.db.execute("SELECT floor FROM metadata WHERE key='stale'").fetchone()[0]==2,"atomic failure rolls back floor")
        check(c.value("restart") is not None,"atomic failure rolls back eviction")
        barrier=ctx.Barrier(6);queue=ctx.Queue()
        processes=[ctx.Process(target=contender,args=(file,barrier,queue)) for _ in range(6)]
        for p in processes:p.start()
        results=[queue.get(timeout=15) for _ in processes]
        for p in processes:p.join(5);check(p.exitcode==0,"independent claim process completed")
        check(sum(r[0]=='LEADER' for r in results)==1,"six processes elect one live lease holder")
        check(sum(r[0]=='WAIT' for r in results)==5,"remaining five processes do not read origin as leaders")
        # Child constructs connection first, then blocks in BEGIN IMMEDIATE.
        shared_now=ctx.Value('q',100000);ready=ctx.Event();go=ctx.Event();sampled=ctx.Event();queue=ctx.Queue()
        clock_cache=Cache(file,lambda:shared_now.value);_,lease=clock_cache.claim("lease")
        p=ctx.Process(target=lock_waiter,args=(file,shared_now,ready,go,sampled,queue));p.start()
        check(ready.wait(5),"lock-wait process connected")
        c.db.execute("BEGIN IMMEDIATE");go.set();time.sleep(.15)
        check(not sampled.is_set(),"clock is not sampled before write lock")
        shared_now.value=101001;c.db.execute("COMMIT")
        kind,ticket=queue.get(timeout=5);p.join(5)
        check(p.exitcode==0,"lock-wait process completes")
        check(kind=='LEADER' and ticket!=lease.ticket,"lock waiter sees expired lease using post-lock time")
        check(not clock_cache.fill("lease",lease,Evidence.primary(1,100000)),"old owner rejected after real lock wait")
        clock_cache.close();c.close()
    numbers={
      'edge_miss':40000*Fraction(1,5),'shield_miss':8000*Fraction(1,2),
      'store_reads':4000*Fraction(1,2),'combined_miss':Fraction(1,5)*Fraction(1,2)*Fraction(1,2),
      'stress_store':40000*Fraction(1,10),'minimum_hit':1-Fraction(3000,40000),
      'L1_bytes':80000*2000*Fraction(3,2),'all_L1_bytes':80000*2000*Fraction(3,2)*30,
      'neg_checks':Fraction(100,5),'soft_min':16*Fraction(9,10),'soft_max':16*Fraction(11,10),
      'soft_window':Fraction(176,10)-Fraction(144,10),'collapsed_per_s':Fraction(1000,1)/Fraction(32,10),
      'uncollapsed_per_s':Fraction(20000,1)/Fraction(32,10),'l2_loss_shed':4000-3000,
      'all_cold_shed':40000-3000,'hot_per_process':Fraction(8000,30),
      'hot_L2_gets':Fraction(30,5),'four_replicas':Fraction(8000,4),'restarted_TTL':33+5+30,
      'conservative_age':20+2+1+1,'http_remaining':120-114-2-1,'swr_age':10+5,'sie_age':10+15}
    expected=[8000,4000,2000,Fraction(1,20),4000,Fraction(37,40),240000000,7200000000,20,
      Fraction(144,10),Fraction(176,10),Fraction(32,10),Fraction(625,2),6250,1000,37000,
      Fraction(800,3),6,2000,68,24,3,15,25]
    for (name,value),want in zip(numbers.items(),expected):check(value==want,'number: '+name)
    root=Path(__file__).resolve().parents[2]
    files=[root/'chapters/ch38.html',*sorted((root/'examples/ch38').glob('*'))]
    report={'checks':len(CHECKS),'passed':CHECKS,'numericRecomputations':{k:str(v) for k,v in numbers.items()},
      'sourcesSha256':{str(f.relative_to(root)):hashlib.sha256(f.read_bytes()).hexdigest() for f in files if f.is_file()}}
    if '--out' in sys.argv:Path(sys.argv[sys.argv.index('--out')+1]).write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'checks':len(CHECKS),'SQLite':sqlite3.sqlite_version,'numbers':len(numbers),'status':'passed'}))

if __name__=='__main__':main()
