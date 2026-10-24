#!/usr/bin/env python3
"""Run the actual Java, SQLite and isolated Redis implementations."""
import sys
sys.dont_write_bytecode = True
import contextlib
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import tempfile
import threading
import time
from model import Store, Ledger, Rejected, LostReply

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
checks = []


def check(name, value):
    checks.append(dict(name=name, passed=bool(value)))
    if not value: raise AssertionError(name)


def rejects(name, fn, error=Rejected):
    try: fn()
    except error: check(name, True)
    else: check(name, False)


def scalar(owner, sql, args=()):
    with contextlib.closing(owner.connect()) as db:
        return db.execute(sql,args).fetchone()[0]


class RedisError(Exception): pass


class Redis:
    def __init__(self, sock): self.sock = sock

    def call(self, *args):
        parts = [str(a).encode() for a in args]
        with socket.socket(socket.AF_UNIX) as s:
            s.connect(self.sock)
            s.sendall(b'*'+str(len(parts)).encode()+b'\r\n'+b''.join(
                b'$'+str(len(a)).encode()+b'\r\n'+a+b'\r\n' for a in parts))
            with s.makefile('rb') as f:
                def read():
                    line=f.readline(); tag,body=line[:1],line[1:-2]
                    if tag == b'-': raise RedisError(body.decode())
                    if tag == b'+': return body.decode()
                    if tag == b':': return int(body)
                    if tag == b'$':
                        n=int(body)
                        if n == -1: return None
                        data=f.read(n); f.read(2); return data.decode()
                    if tag == b'*': return [read() for _ in range(int(body))]
                    raise RuntimeError(line)
                return read()

    def script(self, name, keys, args):
        return self.call('EVAL',(HERE/name).read_text(),len(keys),*keys,*args)


def run():
    result = dict(testedAt=datetime.now(timezone.utc).isoformat(), checks=checks,
                  sqliteVersion=sqlite3.sqlite_version,
                  sourceHashes={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()
                                for p in sorted(HERE.iterdir()) if p.is_file()},
                  limits=['SQLite uses a real coarse writer lock, not PostgreSQL row locking or failover.',
                          'Redis is an isolated standalone process, not Cluster, replication or a load test.',
                          'Membership, authenticated service grants and result verification are fixtures.',
                          'No real PSP, wallet compliance, signature SDK or multi-currency ledger is implemented.'])
    with tempfile.TemporaryDirectory(prefix='ch26-') as folder:
        tmp = Path(folder)
        s = Store(tmp/'packet.db'); ledger = Ledger(tmp/'ledger.db',s)
        ledger.seed('sender',10000)
        deadline = int(time.time()*1000)+60000
        plan = [('s2',400),('s4',200),('s1',300),('s3',100)]
        def make(packet, shares=plan, expires=deadline):
            s.create(packet,'sender','create:'+packet,shares,expires)
            s.record_applied(ledger.apply(s.command('fund:'+packet)))
            snap=s.begin_rebuild(packet); s.publish(snap,snap['token']); return snap
        a=make('p9')
        check('funding reserves 1000 cents once',scalar(ledger,'SELECT cents FROM wallets WHERE account="sender"')==9000)
        ledger.apply(s.command('fund:p9'))
        check('fund replay leaves sender unchanged',scalar(ledger,'SELECT cents FROM wallets WHERE account="sender"')==9000)
        check('create retry returns original generated packet',s.create('ignored','sender','create:p9',plan,deadline)=='p9')
        rejects('same creation key changed plan',lambda:s.create('new','sender','create:p9',[('x',1000)],deadline))
        rejects('invalid bool amount',lambda:s.create('bad','sender','bad',[('x',True)],deadline))
        rejects('minimum is enforced',lambda:s.create('bad','sender','bad',[('x',1)],deadline,minimum=2))
        c=s.claim('p9','u42','k1',a['epoch'],'s2')
        check('claim amount and count debit with one outbox',s.packet('p9')['remaining_cents']==600 and s.packet('p9')['remaining_n']==3
              and s.command('credit:'+c['claim_id'])['cents']==400)
        check('same user rotated request key returns one receipt',s.claim('p9','u42','k2',a['epoch'],'s4')==c)
        rejects('same share different user cannot confirm',lambda:s.claim('p9','u43','k3',a['epoch'],'s2'),sqlite3.IntegrityError)
        check('conflicting claim rolls back request and count',scalar(s,'SELECT count(*) FROM requests')==2 and s.packet('p9')['remaining_n']==3)
        rejects('crash after inventory before outbox rolls back',lambda:s.claim('p9','u44','crash',a['epoch'],'s4',fail='before_outbox'))
        check('rollback leaves share available and no receipt',s.receipt('p9','u44') is None and s.packet('p9')['remaining_cents']==600)
        rejects('lost commit reply is explicit unknown',lambda:s.claim('p9','u44','lost',a['epoch'],'s4',fail='lost_reply'),LostReply)
        saved=s.receipt('p9','u44')
        check('unknown commit retry resolves original receipt',s.claim('p9','u44','lost',a['epoch'],'s1')==saved and s.packet('p9')['remaining_cents']==400)
        b=make('other',[('a',50)])
        rejects('same user key cannot drift to another packet',lambda:s.claim('other','u42','k1',b['epoch'],'a'))
        check('another user may use same header in own scope',s.claim('other','different-user','k1',b['epoch'],'a')['amount']==50)

        cmd=s.command('credit:'+c['claim_id'])
        rejects('changed grant amount rejected before funds move',lambda:ledger.apply(dict(cmd,cents=401)))
        rejects('new operation ID cannot duplicate business grant',lambda:ledger.apply(dict(cmd,operation_id='credit:new')))
        rejects('crash after one ledger entry rolls everything back',lambda:ledger.apply(cmd,fail='after_one_entry'))
        check('rollback leaves escrow and recipient unchanged',scalar(ledger,'SELECT available FROM escrows WHERE packet="p9"')==1000
              and scalar(ledger,'SELECT count(*) FROM entries WHERE operation_id=?',(cmd['operation_id'],))==0)
        rejects('ledger response loss is unknown',lambda:ledger.apply(cmd,fail='lost_reply'),LostReply)
        applied=ledger.apply(cmd); s.record_applied(applied); s.record_applied(applied)
        check('ledger replay posts one complete balanced pair',scalar(ledger,'SELECT cents FROM wallets WHERE account="u42"')==400
              and scalar(ledger,'SELECT sum(delta) FROM entries WHERE operation_id=?',(cmd['operation_id'],))==0
              and scalar(ledger,'SELECT count(*) FROM entries WHERE operation_id=?',(cmd['operation_id'],))==2)

        # True multi-connection competitions, all call the actual Store.
        p=make('compete',[('last',9)])
        barrier=threading.Barrier(12)
        def compete(i):
            barrier.wait()
            try: return s.claim('compete','u'+str(i),'req',p['epoch'],'last')
            except sqlite3.IntegrityError: return None
        with ThreadPoolExecutor(max_workers=12) as pool: won=list(pool.map(compete,range(12)))
        check('12 SQLite writers contest last share: exactly one claim',sum(x is not None for x in won)==1 and s.packet('compete')['remaining_cents']==0)
        p=make('same-user',[('a',2),('b',3)])
        barrier=threading.Barrier(8)
        def same_user(i):
            barrier.wait(); return s.claim('same-user','one','key'+str(i),p['epoch'],'a' if i%2 else 'b')
        with ThreadPoolExecutor(max_workers=8) as pool: copies=list(pool.map(same_user,range(8)))
        check('different HTTP keys same user converge to one claim',all(x==copies[0] for x in copies) and s.packet('same-user')['remaining_n']==1)
        p=make('same-key',[('a',2),('b',3)])
        barrier=threading.Barrier(8)
        def same_key(i):
            barrier.wait(); return s.claim('same-key','one','same',p['epoch'],'a' if i%2 else 'b')
        with ThreadPoolExecutor(max_workers=8) as pool: copies=list(pool.map(same_key,range(8)))
        check('same user/key competition preserves one original receipt',all(x==copies[0] for x in copies) and s.packet('same-key')['remaining_n']==1)

        # Rebuild fences an outstanding candidate and can itself be superseded.
        old=s.packet('p9')['epoch']; newer=s.begin_rebuild('p9')
        check('snapshot excludes both committed shares',newer['shares']==[('s1',300),('s3',100)])
        rejects('old epoch uncommitted candidate cannot confirm',lambda:s.claim('p9','late','late',old,'s1'))
        newest=s.begin_rebuild('p9')
        rejects('older rebuild cannot publish over newer one',lambda:s.publish(newer,newer['token']))
        s.publish(newest,newest['token'])
        check('previous durable receipt remains queryable across epochs',s.claim('p9','u42','lookup',old,'s1')==c)

        # Clock is read after taking SQLite's actual writer lock.
        p=make('close-first',[('last',11)],int(time.time()*1000)+350)
        entered=threading.Event(); release=threading.Event()
        def hold_close():
            def locked(): entered.set(); release.wait(3)
            return s.close('close-first',locked=locked)
        with ThreadPoolExecutor(max_workers=2) as pool:
            closing=pool.submit(hold_close); entered.wait(2)
            late=pool.submit(s.claim,'close-first','late','before-deadline',p['epoch'],'last')
            time.sleep(.4); release.set()
            check('close winning lock snapshots last 11',closing.result()==11)
            rejects('predeadline caller acquiring lock after close loses',late.result)
        check('close is idempotent and one refund grant remains',s.close('close-first')==11)
        check('unknown refund retains full pending capacity',s.packet('close-first')['state']=='EXPIRING' and s.packet('close-first')['refund_pending']==11)
        refund=s.command('refund:close-first')
        rejects('refund response loss keeps sender progress pending',lambda:ledger.apply(refund,fail='lost_reply'),LostReply)
        s.record_applied(ledger.apply(refund))
        check('refund replay applies snapshot once',s.packet('close-first')['refund_applied']==11 and s.packet('close-first')['refund_pending']==0)
        p=make('claim-first',[('last',13)],int(time.time()*1000)+200)
        s.claim('claim-first','fast','fast',p['epoch'],'last'); time.sleep(.22)
        check('claim-first leaves no zero-value refund command',s.close('claim-first')==0 and scalar(s,"SELECT count(*) FROM outbox WHERE operation_id='refund:claim-first'")==0)
        p=make('recover-expire',[('a',17)],int(time.time()*1000)+200)
        pending=s.begin_rebuild('recover-expire'); time.sleep(.22)
        rejects('recovery crossing expiry cannot reopen',lambda:s.publish(pending,pending['token']))
        check('close accepts recovering and refunds durable remainder',s.close('recover-expire')==17)
        p=make('crash-close',[('a',19)],int(time.time()*1000)+150); time.sleep(.17)
        rejects('close crash cannot lose refund snapshot',lambda:s.close('crash-close',fail='before_outbox'))
        check('close rollback restores availability and no intent',s.packet('crash-close')['remaining_cents']==19 and s.packet('crash-close')['state']=='OPEN')
        check('close retry preserves 19',s.close('crash-close')==19)
        p=make('queued-expiry',[('a',29)],int(time.time()*1000)+200)
        blocker=s.connect();blocker.execute('BEGIN IMMEDIATE')
        try:
            with ThreadPoolExecutor(max_workers=1) as pool:
                queued=pool.submit(s.claim,'queued-expiry','queued','queued',p['epoch'],'a')
                time.sleep(.22)
                blocker.execute('COMMIT')
                rejects('open packet claim queued across deadline reads actual post-lock time',queued.result)
        finally: blocker.close()
        check('queued expiry does not debit durable inventory',s.packet('queued-expiry')['remaining_cents']==29)
        s.create('late-fund','sender','late-fund',[('a',23)],int(time.time()*1000)-1)
        rejects('funding unknown never opens or presumes refund',lambda:s.close('late-fund'))
        s.record_applied(ledger.apply(s.command('fund:late-fund')))
        rejects('late funded initializer cannot open past deadline',lambda:s.begin_rebuild('late-fund'))
        check('funded INITIALIZING can close and refund full 23',s.close('late-fund')==23)
        p=make('refund-first',[('s2',400),('rest',600)],int(time.time()*1000)+200)
        owed=s.claim('refund-first','recipient','claim',p['epoch'],'s2');time.sleep(.22)
        check('refund snapshots unclaimed 600 while credit pending',s.close('refund-first')==600)
        s.record_applied(ledger.apply(s.command('refund:refund-first')))
        check('refund leaves 400 reserved for committed recipient',scalar(ledger,'SELECT available FROM escrows WHERE packet="refund-first"')==400)
        s.record_applied(ledger.apply(s.command('credit:'+owed['claim_id'])))
        check('late recipient credit completes independently after EXPIRED',s.packet('refund-first')['state']=='EXPIRED'
              and scalar(ledger,'SELECT available FROM escrows WHERE packet="refund-first"')==0
              and scalar(ledger,'SELECT cents FROM wallets WHERE account="recipient"')==400)
        with s.connect() as db:
            for p in db.execute('SELECT * FROM packets'):
                csum=db.execute('SELECT coalesce(sum(amount),0),count(*) FROM claims WHERE packet_id=?',(p['packet_id'],)).fetchone()
                check('durable conservation '+p['packet_id'],p['total_cents']==csum[0]+p['remaining_cents']+p['refund_pending']+p['refund_applied']
                      and p['total_n']==csum[1]+p['remaining_n']+p['closed_unclaimed_n'])
        rejects('immutable plan cannot be updated',lambda:s.connect().execute("UPDATE shares SET amount=999 WHERE packet_id='p9'"),sqlite3.IntegrityError)

        server=os.environ.get('REDIS_SERVER','/tmp/redis-7.2.5/src/redis-server')
        sock=str(tmp/'redis.sock')
        proc=subprocess.Popen([server,'--port','0','--unixsocket',sock,'--save','','--appendonly','no','--dir',str(tmp)],stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
        try:
            for _ in range(100):
                if Path(sock).exists(): break
                time.sleep(.02)
            r=Redis(sock); result['redisVersion']=r.call('INFO','server').split('\r\n')[1]
            def keys(packet,epoch): return [f'pkt:{{{packet}}}:e:{epoch}:'+k for k in ['meta','list','amounts','users']]
            def install(snapshot):
                return r.script('install.lua',keys(snapshot['packet'],snapshot['epoch']),
                    [snapshot['epoch'],snapshot['token'],snapshot['deadline']]+[v for row in snapshot['shares'] for v in row])
            k=keys('p9',newest['epoch'])
            check('actual Redis installs immutable remaining snapshot',install(newest)[0]=='READY')
            check('READY gate does not reserve',r.script('candidate.lua',k,[newest['epoch'],'u99'])[0]=='RETRY')
            r.script('activate.lua',k[:1],[newest['epoch'],newest['token']])
            got=r.script('candidate.lua',k,[newest['epoch'],'u99'])
            check('actual Redis candidate is original unclaimed s1',got[:3]==['CANDIDATE','s1','300'])
            check('same user candidate replay does not consume another share',r.script('candidate.lua',k,[newest['epoch'],'u99'])==got and r.call('LLEN',k[1])==1)
            check('same epoch installer cannot refill consumed list',install(newest)==['EXISTS','ACTIVE'] and r.call('LLEN',k[1])==1)
            check('stale expected epoch rejected by Redis',r.script('candidate.lua',k,[newest['epoch']-1,'u100'])[0]=='RETRY')
            check('token mismatch cannot replace active projection',r.script('install.lua',k,[newest['epoch'],'wrong',deadline,'x',100])[0]=='CONFLICT')
            install(newer)
            check('late old installer touches only old namespace',r.call('LLEN',k[1])==1)
            # Same candidate supplied to DB cannot take an already-confirmed share.
            s.claim('p9','u99','newest',newest['epoch'],got[1])
            r.call('HDEL',k[3],'u99'); r.call('LPUSH',k[1],got[1]); r.call('HINCRBY',k[0],'n',1); r.call('HINCRBY',k[0],'cents',300)
            rolled=r.script('candidate.lua',k,[newest['epoch'],'rollback-user'])
            rejects('Redis rollback reoffer is fenced by durable share UNIQUE',lambda:s.claim('p9','rollback-user','rolled',newest['epoch'],rolled[1]),sqlite3.IntegrityError)
            last=dict(packet='redis-race',epoch=1,token='race',deadline=deadline,shares=[('last',1)])
            install(last); kr=keys('redis-race',1);r.script('activate.lua',kr[:1],[1,'race'])
            barrier=threading.Barrier(20)
            def reserve(i): barrier.wait(); return r.script('candidate.lua',kr,[1,'r'+str(i)])
            with ThreadPoolExecutor(max_workers=20) as pool: got=list(pool.map(reserve,range(20)))
            check('20 actual Redis clients contest one share',sum(x[0]=='CANDIDATE' for x in got)==1 and sum(x[0]=='EMPTY' for x in got)==19)
            bad=dict(packet='bad',epoch=1,token='bad',deadline=deadline,shares=[('a',1)])
            kb=keys('bad',1);install(bad);r.script('activate.lua',kb[:1],[1,'bad'])
            r.call('DEL',kb[3]);r.call('SET',kb[3],'wrong-type')
            check('wrong key type rejected before pop',r.script('candidate.lua',kb,[1,'u'])[0]=='RECOVER' and r.call('LLEN',kb[1])==1)
            r.call('DEL',kb[3]);r.call('HSET',kb[2],'a',0)
            check('zero share rejected before mutation',r.script('candidate.lua',kb,[1,'u'])[0]=='RECOVER' and r.call('HGET',kb[0],'cents')=='1')
            early=dict(packet='expired',epoch=1,token='expired',deadline=int(time.time()*1000)-1,shares=[('a',1)])
            install(early);ke=keys('expired',1);r.script('activate.lua',ke[:1],[1,'expired'])
            check('Redis time check refuses an expired new candidate',r.script('candidate.lua',ke,[1,'u'])[0]=='EXPIRED' and r.call('LLEN',ke[1])==1)
            rejects('actual Lua runtime error after write',lambda:r.call('EVAL',"redis.call('SET',KEYS[1],'written');error('after write')",1,'rollback-probe'),RedisError)
            check('Lua runtime error retains earlier write',r.call('GET','rollback-probe')=='written')
        finally:
            proc.terminate();proc.wait(timeout=5)
        jdk=Path(os.environ.get('JAVA_HOME_CH26','/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home'))
        subprocess.run([str(jdk/'bin/javac'),'--release','17','-d',str(tmp),str(HERE/'SplitPlan.java')],check=True,capture_output=True,text=True)
        java=subprocess.run([str(jdk/'bin/java'),'-cp',str(tmp),'SplitPlan'],check=True,capture_output=True,text=True)
        result['java']=json.loads(java.stdout)
        check('Java 17 split cases passed',result['java']['passed'] and result['java']['checks']>=600)
    result['passed']=all(c['passed'] for c in checks)
    (ROOT/'docs/reviews/ch26-code-results.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(dict(passed=result['passed'],checks=len(checks),java=result['java'],redis=result['redisVersion'])))


if __name__=='__main__': run()
