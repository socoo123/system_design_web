#!/usr/bin/env python3
"""Independent actual Redis probes; no author outputs, Cluster, AOF, or real payments."""
from pathlib import Path
import hashlib
import json
import socket
import subprocess
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'examples/ch21'
checks = []
def check(ok, name):
    if not ok: raise AssertionError(name)
    checks.append(name)
def canonical(value): return json.dumps(value, sort_keys=True, separators=(',', ':'))
def digest(value): return hashlib.sha256(canonical(value).encode()).hexdigest()
def snapshot(epoch, cap, free=None, tokens=None):
    value = dict(epoch=epoch, cap=cap, free=cap if free is None else free, tokens=tokens or {})
    return dict(value, snapshot=digest(value))
class RedisError(Exception): pass
class Redis:
    def __init__(self, name):
        self.socket = socket.socket(socket.AF_UNIX)
        self.socket.connect(name)
        self.stream = self.socket.makefile('rb')
    def close(self): self.stream.close(); self.socket.close()
    def call(self, *args):
        args = [str(a).encode() for a in args]
        self.socket.sendall(b'*'+str(len(args)).encode()+b'\r\n'+b''.join(b'$'+str(len(a)).encode()+b'\r\n'+a+b'\r\n' for a in args))
        def read():
            line = self.stream.readline(); tag, body = line[:1], line[1:-2]
            if tag == b'-': raise RedisError(body.decode())
            if tag == b'+': return body.decode()
            if tag == b':': return int(body)
            if tag == b'$':
                n = int(body)
                if n == -1: return None
                value=self.stream.read(n); self.stream.read(2); return value.decode()
            if tag == b'*': return [read() for _ in range(int(body))]
            raise RuntimeError(line)
        return read()
    def now(self):
        sec, usec = self.call('TIME'); return int(sec)+int(usec)/1_000_000
    def mapping(self, key):
        raw=self.call('HGETALL',key); return dict(zip(raw[::2],raw[1::2]))

with tempfile.TemporaryDirectory(prefix='ch21-independent-redis-') as temp:
    sock=str(Path(temp)/'redis.sock')
    proc=subprocess.Popen(['/tmp/redis-7.2.5/src/redis-server','--port','0','--unixsocket',sock,'--save','','--appendonly','no','--dir',temp],stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
    try:
        for _ in range(100):
            if Path(sock).exists(): break
            time.sleep(.02)
        r=Redis(sock)
        scripts={name:r.call('SCRIPT','LOAD',(SRC/name).read_text()) for name in ['admit.lua','receipt.lua','install.lua']}
        def run(name,key,*args): return r.call('EVALSHA',scripts[name],1,key,*args)
        def args(label,q=1,owner='independent-owner'):
            return [digest(['identity',label]),owner,digest(['full-intent',label,q]),q]
        def rejected_without_write(name,key,*argv):
            before=r.mapping(key)
            try: run(name,key,*argv)
            except RedisError: check(r.mapping(key)==before,name+' rejection is mutation-free')
            else: raise AssertionError('expected rejection')
        key='gate:{review-unit}:23'; base=snapshot(23,17)
        check(run('install.lua',key,canonical(base))==['INSTALLED','0'],'install fresh independent epoch23 cap17')
        a=args('three',3)
        check(run('admit.lua',key,23,*a)[0]=='ADMITTED' and r.call('HGET',key,'free')=='14','normal quantity3 debit')
        check(run('admit.lua',key,23,*a)==['REPLAY','ADMITTED'] and r.call('HGET',key,'free')=='14','same identity no second debit')
        rejected_without_write('admit.lua',key,23,a[0],a[1],a[2],4)
        rejected_without_write('receipt.lua',key,23,a[0],'different-owner',a[2],3,2,'RELEASED')
        rejected_without_write('receipt.lua',key,23,a[0],a[1],digest('wrong'),3,2,'RELEASED')
        check(run('receipt.lua',key,23,*a,2,'RELEASED')==['APPLIED','RELEASED'],'terminal release can precede HELD')
        check(r.call('HGET',key,'free')=='17','terminal release restores owned3 once')
        check(run('receipt.lua',key,23,*a,1,'HELD')==['STALE'],'old HELD cannot regress terminal')
        check(run('receipt.lua',key,23,*a,2,'RELEASED')==['REPLAY'] and r.call('HGET',key,'free')=='17','lost receipt ACK repeats zero times')
        rejected_without_write('receipt.lua',key,23,*a,2,'CONFIRMED')
        check(run('receipt.lua',key,23,*args('never-admitted'),1,'CANCELLED')==['NO_OWNERSHIP'],'absent token cannot mint free')
        b=args('paid',4); run('admit.lua',key,23,*b)
        check(run('receipt.lua',key,23,*b,2,'CONFIRMED')==['APPLIED','CONFIRMED'] and r.call('HGET',key,'free')=='13','confirm never restores4')
        rejected_without_write('receipt.lua',key,23,*b,2,'RELEASED')
        check(run('install.lua',key,canonical(base))==['REPLAY'] and r.call('HGET',key,'free')=='13','install ACK loss replay cannot reset a live counter')
        check(run('receipt.lua',key,22,*a,2,'RELEASED')==['STALE_OR_CLOSED'],'old epoch cannot affect current hash')
        check(r.call('TTL',key)==-1,'unresolved ledger has no TTL')

        # Actual concurrent clients compete for two units, with no shared socket.
        race='gate:{review-race}:23';run('install.lua',race,canonical(snapshot(23,2)))
        def compete(i):
            client=Redis(sock)
            try: return client.call('EVALSHA',scripts['admit.lua'],1,race,23,*args('race-'+str(i),owner='p'+str(i)))
            finally: client.close()
        with ThreadPoolExecutor(max_workers=17) as pool: results=list(pool.map(compete,range(17)))
        check(sum(x[0]=='ADMITTED' for x in results)==2 and r.call('HGET',race,'free')=='0','17 actual Redis clients: precisely two admissions')

        tokens={digest(['retained',i]):dict(principal='r',digest=digest(['intent',i]),q=1,state='RELEASED',v=2) for i in range(1307)}
        large=snapshot(31,19,tokens=tokens); partial='gate:{review-partial}:31'
        r.call('HSET',partial,'epoch',31,'snapshot',large['snapshot'],'ready',0)
        for token, value in list(tokens.items())[:13]:r.call('HSET',partial,'t:'+token,canonical(value))
        check(run('admit.lua',partial,31,*args('closed'))==['CLOSED'],'ready0 partial baseline rejects admission')
        check(run('install.lua',partial,canonical(large))==['INSTALLED','1307'] and r.call('HLEN',partial)==1314,'resume same partial snapshot installs 1307 identities across chunks')
        run('admit.lua',partial,31,*args('post-open',2))
        check(run('install.lua',partial,canonical(large))==['REPLAY'] and r.call('HGET',partial,'free')=='17','ready1 snapshot retry does not reinitialize changed free')
        broken='gate:{review-corrupt-partial}:31'
        r.call('HSET',broken,'epoch',31,'snapshot',large['snapshot'],'ready',0,'unexpected','retained')
        try:run('install.lua',broken,canonical(large))
        except RedisError as error:check('PARTIAL_BASELINE' in str(error),'post-write baseline count mismatch is detected')
        else:raise AssertionError('expected partial baseline mismatch')
        check(r.call('HGET',broken,'ready')=='0' and run('admit.lua',broken,31,*args('closed-again'))==['CLOSED'],'post-write install failure remains ready0/closed')
        check(run('install.lua','gate:{review-new-epoch}:32',canonical(snapshot(32,19,tokens=tokens)))==['INSTALLED','1307'],'corrupt baseline recovers only on separate new epoch key')

        # Reproduce the capacity P1 using UNMODIFIED actual Lua and real Redis TIME.
        # No mocked clock, no manual quota resets, and no released/reopened stock.
        boundary='gate:{review-boundary}:41';run('install.lua',boundary,canonical(snapshot(41,10000)))
        all_args=[args('boundary-'+str(i)) for i in range(10000)]
        current=r.now(); first_second=int(current)+(1 if current%1>.50 else 0)
        target=first_second+.65
        buckets=[]; admitted=0
        for batch in range(20):
            due=target if batch==0 else first_second+batch+.002
            while True:
                now=r.now()
                if now>=due:break
                time.sleep(min(.04,due-now))
            start=r.now()
            for a in all_args[batch*500:(batch+1)*500]:
                answer=run('admit.lua',boundary,41,*a)
                if answer[0]!='ADMITTED':raise AssertionError((batch,answer))
                admitted+=1
            end=r.now()
            check(int(start)==int(end) and r.call('HGET',boundary,'used')=='500','real fixed-second bucket '+str(batch)+' contains exactly500')
            buckets.append(dict(bucket=int(start),startRedisTime=start,endRedisTime=end,count=500))
        elapsed=buckets[-1]['endRedisTime']-buckets[0]['startRedisTime']
        check(admitted==10000 and r.call('HGET',boundary,'free')=='0','actual 10000 one-unit tokens, no restock')
        check(elapsed<20,'counterexample: actual 10000 token wall-clock span is below20s')
        print(json.dumps({'boundaryAdmitted':admitted,'elapsedRedisSeconds':elapsed,'fixedSecondBuckets':len(buckets)}),flush=True)
        r.close()
        result={'passed':True,'checks':checks,'checkCount':len(checks),'sourceHashes':{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in [SRC/'admit.lua',SRC/'receipt.lua',SRC/'install.lua']},'boundary':{'admitted':admitted,'elapsedRedisSeconds':elapsed,'buckets':buckets,'clock':'actual Redis TIME; unmodified Lua; q1; no restock'},'limits':['Standalone Redis7.2.5, no Cluster/AOF/failover tests.','Boundary duration is a counterexample to a hard lower bound, not a throughput/SLO benchmark.']}
        (ROOT/'docs/reviews/ch21-independent-redis-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps({'passed':True,'checkCount':len(checks)}))
    finally:
        proc.terminate();proc.wait(timeout=5)
