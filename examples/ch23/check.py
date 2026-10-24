#!/usr/bin/env python3
"""Actual SQLite transactions, Redis 7 Lua and Java 17 tests. No third-party deps."""
import sys
sys.dont_write_bytecode=True
from concurrent.futures import ThreadPoolExecutor
import json
import hashlib
from datetime import datetime, timezone
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import threading
import time
from itertools import permutations
from model import Model,Conflict,UnknownCommit

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
checks=[]
def check(name,ok):
    checks.append({'name':name,'passed':bool(ok)})
    if not ok: raise AssertionError(name)
def rejects(name,fn,kind=Conflict):
    try: fn()
    except kind: check(name,True)
    else: check(name,False)
def event(**changes):
    return dict({'game':'g1','season':'s17','player':'000000000007','match':'m1','kind':'RESULT',
                 'revision':1,'seq':1,'score':1000,'second':100,'comparator':'score-time-id-v1'},**changes)
def scalar(m,sql):
    with m.connect() as c:return c.execute(sql).fetchone()[0]

class RedisError(Exception): pass
class Redis:
    def __init__(self,sock):self.sock=sock
    def call(self,*args):
        encoded=[a if isinstance(a,bytes) else str(a).encode() for a in args]
        with socket.socket(socket.AF_UNIX) as s:
            s.connect(self.sock)
            s.sendall(b'*'+str(len(encoded)).encode()+b'\r\n'+b''.join(b'$'+str(len(a)).encode()+b'\r\n'+a+b'\r\n' for a in encoded))
            with s.makefile('rb') as f:
                def read():
                    line=f.readline();tag,body=line[:1],line[1:-2]
                    if tag==b'-':raise RedisError(body.decode())
                    if tag==b'+':return body.decode()
                    if tag==b':':return int(body)
                    if tag==b'$':
                        n=int(body)
                        if n==-1:return None
                        value=f.read(n);f.read(2);return value.decode()
                    if tag==b'*':return [read() for _ in range(int(body))]
                    raise RuntimeError(line)
                return read()
    def script(self,file,keys,args):return self.call('EVAL',(HERE/file).read_text(),len(keys),*keys,*args)

def run():
    result={'testedAt':datetime.now(timezone.utc).isoformat(),'sourceHashes':{
        str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted(HERE.iterdir()) if p.is_file()
    },'checks':checks,'limits':[
        'SQLite BEGIN IMMEDIATE serializes writers; no PostgreSQL replication/failover was run.',
        'Redis is one temporary 7.2.5 server, not Cluster or an injected OOM/failover experiment.',
        'Java proves pure ordering/merge/page behavior under supplied immutable-manifest contracts.',
        'No real upstream authority, CDC adapter, controller, cursor signer or load test was run.'
    ]}
    with tempfile.TemporaryDirectory(prefix='ch23-') as tmp:
        tmp=Path(tmp);m=Model(tmp/'scores.db');m.initialize();m.seed()
        original=m.settle(event())
        check('one durable settlement creates two destination outbox rows',original['status']=='COMMITTED' and scalar(m,'SELECT count(*) FROM outbox')==2)
        check('replay returns exact original receipt',m.settle(event())==original)
        rejects('same identity different score conflicts',lambda:m.settle(event(score=1001)))
        rejects('same identity different source sequence conflicts',lambda:m.settle(event(seq=2)))
        rejects('unauthorized game cannot replay receipt',lambda:m.settle(event(),actor_game='g2'))
        rejects('unknown season membership',lambda:m.settle(event(season='s99')))
        try:m.settle(event(match='m2',seq=2,score=1100,second=200),lose_ack=True)
        except UnknownCommit:pass
        else:check('unknown commit injection',False)
        recovered=m.settle(event(match='m2',seq=2,score=1100,second=200))
        check('lost COMMIT acknowledgement same identity resolves once',recovered['version']==2 and scalar(m,'SELECT count(*) FROM outbox')==4)
        check('earlier original receipt is not rewritten',m.settle(event())==original)
        correction=m.settle(event(kind='CORRECTION',revision=2,seq=3,score=800,second=201))
        check('new correction revision may lower score',correction['score']==800 and correction['version']==3)
        same=m.settle(event(match='m3',seq=4,score=800,second=201))
        check('source same-score snapshot carries preserved achievement second',same['second']==201)
        m.settle(event(match='complete-prefix-9',seq=9,score=1400,second=400))
        stale=m.settle(event(match='old-prefix-8',seq=8,score=1300,second=390))
        check('older full-prefix snapshot rejected not applied',stale['status']=='REJECTED_STALE' and scalar(m,'SELECT version FROM scores')==9)
        before=(scalar(m,'SELECT count(*) FROM receipts'),scalar(m,'SELECT count(*) FROM outbox'))
        rejects('transaction failure rolls back identity score and outbox',lambda:m.settle(event(match='abort',seq=10,score=1500),fail_before_commit=True))
        check('rollback leaves no claimed receipt or extra projection',before==(scalar(m,'SELECT count(*) FROM receipts'),scalar(m,'SELECT count(*) FROM outbox')) and scalar(m,'SELECT version FROM scores')==9)
        for name,change in [('negative score',{'score':-1}),('fraction score',{'score':1.5}),('boolean sequence',{'seq':True}),('time overflow',{'second':2_592_001}),('revision zero',{'revision':0})]:
            rejects('invalid '+name,lambda change=change:m.settle(event(match='bad',**change)))
        m.seed(season='s18')
        check('same match player and kind in new season is distinct',m.settle(event(season='s18'))['status']=='COMMITTED')
        z=Model(tmp/'zero.db');z.initialize();z.seed()
        first_zero=z.settle(event(score=0,second=123))
        next_zero=z.settle(event(score=0,second=123,seq=2,revision=2))
        check('first legitimate zero score uses authoritative achieved second',first_zero['second']==123)
        check('next zero snapshot uses source-preserved achieved second',next_zero['version']==2 and next_zero['second']==123)
        versions=[event(match='a',seq=1,score=100,second=10),
                  event(match='b',seq=2,score=200,second=20),
                  event(match='b',kind='CORRECTION',revision=2,seq=3,score=100,second=30)]
        result['arrivalOrders']=[]
        for index,order in enumerate(permutations(versions)):
            probe=Model(tmp/f'order-{index}.db');probe.initialize();probe.seed()
            for cmd in order:probe.settle(cmd)
            with probe.connect() as db:
                final=db.execute('SELECT version,score,second FROM scores').fetchone()
            result['arrivalOrders'].append({'sequence':[c['seq'] for c in order],'final':final})
            check('authoritative correction returns to same score, arrival order '+str([c['seq'] for c in order]),final==(3,100,30))
        n=Model(tmp/'duplicate.db');n.initialize();n.seed();barrier=threading.Barrier(12)
        def duplicate(_):barrier.wait();return n.settle(event())
        with ThreadPoolExecutor(max_workers=12) as pool:copies=list(pool.map(duplicate,range(12)))
        check('12 actual SQLite writers one receipt and two projections',all(r==copies[0] for r in copies) and scalar(n,'SELECT count(*) FROM receipts')==1 and scalar(n,'SELECT count(*) FROM outbox')==2)
        W=n.close_season()
        check('closing captures accepted destination identity set',len(W)==2)
        check('closed season still replays known original',n.settle(event())==copies[0])
        check('new late identity cannot score closed season',n.settle(event(match='late',seq=2))['status']=='REJECTED_CLOSED' and scalar(n,'SELECT count(*) FROM outbox')==2)
        with n.connect() as c:c.execute("UPDATE outbox SET delivered=1 WHERE board='g1:s17:global'")
        check('global ACK does not mark region delivery',scalar(n,'SELECT count(*) FROM outbox WHERE delivered=0')==1)

        server=os.environ.get('REDIS_SERVER','/tmp/redis-7.2.5/src/redis-server')
        sock=str(tmp/'redis.sock')
        proc=subprocess.Popen([server,'--port','0','--unixsocket',sock,'--save','','--appendonly','no','--dir',str(tmp)],stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
        try:
            for _ in range(100):
                if Path(sock).exists():break
                time.sleep(.02)
            r=Redis(sock);result['redis']=r.call('INFO','server').split('\r\n')[1]
            keys=['lb:{g1:s17:global:b0:E7}:scores','lb:{g1:s17:global:b0:E7}:state']
            scope='g1:s17:global:b0'
            r.call('HSET',keys[1],'__scope',scope,'__epoch','E7','__mode','SERVING')
            def project(v,c,member='000000000007',epoch='E7'):
                return r.script('project.lua',keys,[scope,epoch,member,v,c])
            def around(member='000000000007',minimum=0,epoch='E7'):
                return r.script('around.lua',keys,[scope,epoch,member,minimum])
            check('unranked differs from pending new commit',around()[0]=='UNRANKED' and around(minimum=1)[0]=='PENDING')
            c1=1000*3_000_001+3_000_000-100
            check('actual Redis absolute apply',project(1,c1)=='APPLIED')
            check('actual Redis repeat has no increment',project(1,c1)=='REPLAY' and int(r.call('ZSCORE',keys[0],'000000000007'))==c1)
            rejects('same projection version changed payload conflicts',lambda:project(1,c1+1),RedisError)
            check('conflicting version does not mutate score',int(r.call('ZSCORE',keys[0],'000000000007'))==c1)
            low=800*3_000_001+3_000_000-201
            check('newer Redis correction lowers score',project(3,low)=='APPLIED' and int(r.call('ZSCORE',keys[0],'000000000007'))==low)
            check('old Redis event never overwrites correction',project(2,c1)=='STALE')
            check('read after newer commit returns pending',around(minimum=4)[0]=='PENDING')
            for i in range(1,21):
                if i!=7:project(1,low,f'{i:012d}')
            selected=around()
            check('atomic around-me includes own ordinal and at most 11',selected[0]=='OK' and selected[3]==14 and selected[4][10]=='000000000007' and len(selected[4])==22)
            check('reverse equal-composite ID ordering in actual Redis',r.call('ZRANGE',keys[0],0,0,'REV')==['000000000020'])
            check('head offset clamps instead of negative tail semantics',len(around('000000000020')[4])==12)
            check('tail returns fewer neighbors',len(around('000000000001')[4])==12)
            rejects('old epoch cannot write',lambda:project(4,c1,epoch='E6'),RedisError)
            rejects('old epoch cannot read',lambda:around(epoch='E6'),RedisError)
            rejects('noncanonical composite rejected',lambda:project(4,'1.5'),RedisError)
            rejects('unformatted member rejected',lambda:project(4,c1,'7'),RedisError)
            r.call('HSET',keys[1],'__mode','LOADING')
            rejects('loading epoch cannot serve partial ranks',around,RedisError)
            check('loading epoch accepts replayed absolute rows',project(4,c1)=='APPLIED')
            r.call('HSET',keys[1],'__mode','FROZEN')
            rejects('frozen epoch refuses later updates',lambda:project(5,low),RedisError)
            check('frozen complete epoch remains readable',around()[0]=='OK')
            final_c=100*3_000_001+3_000_000-30
            for index,order in enumerate(permutations(versions)):
                order_keys=[f'lb:{{order{index}:E7}}:scores',f'lb:{{order{index}:E7}}:state']
                r.call('HSET',order_keys[1],'__scope',scope,'__epoch','E7','__mode','SERVING')
                for cmd in order:
                    composite=cmd['score']*3_000_001+3_000_000-cmd['second']
                    r.script('project.lua',order_keys,[scope,'E7',cmd['player'],cmd['seq'],composite])
                check('actual Redis reordered correction converges '+str([c['seq'] for c in order]),
                      int(r.call('ZSCORE',order_keys[0],'000000000007'))==final_c
                      and r.call('HGET',order_keys[1],'p:000000000007')=='3:'+str(final_c))
            r.call('HSET',keys[1],'__mode','SERVING')
            r.call('ZREM',keys[0],'000000000007')
            rejects('lost member with retained version cannot ACK replay',lambda:project(4,c1),RedisError)
            rejects('partial projection cannot become unranked',around,RedisError)
            r.call('DEL',keys[0]);r.call('SET',keys[0],'wrong-type')
            before=r.call('HGETALL',keys[1])
            rejects('wrong destination type rejected before writes',lambda:project(5,c1),RedisError)
            check('bad type leaves version state unchanged',r.call('HGETALL',keys[1])==before)
            r.call('SET','bad-state','string');r.call('DEL','untouched')
            rejects('wrong state type rejects without creating score',lambda:r.script('project.lua',['untouched','bad-state'],[scope,'E7','000000000001',1,c1]),RedisError)
            check('prevalidation destination remains absent',r.call('EXISTS','untouched')==0)
            # Counterexample from Redis itself: execution isolation does not imply rollback.
            rejects('injected Lua runtime error',lambda:r.call('EVAL',"redis.call('SET',KEYS[1],'written');error('after write')",1,'rollback-probe'),RedisError)
            check('actual Lua error retains earlier write',r.call('GET','rollback-probe')=='written')
        finally:
            proc.terminate();proc.wait(timeout=5)

        jdk=Path(os.environ.get('JAVA_HOME_CH23','/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home'))
        subprocess.run([str(jdk/'bin/javac'),'--release','17','-d',str(tmp),str(HERE/'Leaderboard.java'),str(HERE/'LeaderboardTest.java')],check=True,capture_output=True,text=True)
        java=subprocess.run([str(jdk/'bin/java'),'-cp',str(tmp),'LeaderboardTest'],check=True,capture_output=True,text=True)
        result['java']={'version':subprocess.run([str(jdk/'bin/java'),'-version'],capture_output=True,text=True).stderr.splitlines()[0],'output':java.stdout,'checks':java.stdout.count('PASS ')}
        check('Java 17 compile and behavioral cases',result['java']['checks']>=20)
    result['passed']=all(c['passed'] for c in checks)
    (ROOT/'docs/reviews/ch23-code-results.json').write_text(json.dumps(result,indent=2)+'\n')
    print(f"{len(checks)} SQLite/Redis checks + {result['java']['checks']} Java checks passed")

if __name__=='__main__':run()
