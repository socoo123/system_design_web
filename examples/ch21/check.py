#!/usr/bin/env python3
"""Run SQLite concurrency/fault contracts and the actual Redis Lua, with no dependencies."""
import sys
sys.dont_write_bytecode = True
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import tempfile
import threading
import time
from model import Model, Rejected, UnknownCommit, canonical, digest

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
checks = []


def check(name, condition):
    checks.append({'name':name,'passed':bool(condition)})
    if not condition:
        raise AssertionError(name)


def rejects(name, fn, reason=None):
    try:
        fn()
    except Rejected as e:
        check(name, reason is None or str(e) == reason)
    else:
        check(name,False)


def intent(scope='hotel', q=1, resources=('D1','D2','D3'), order='order-A'):
    return {'scope':scope,'items':[[r,q] for r in resources],'order_id':order,'policy_version':'p1'}


def scalar(m, sql, values=()):
    with m.connect() as c:
        return c.execute(sql,values).fetchone()[0]


class Clock:
    value = 100
    def __call__(self): return self.value


class RedisError(Exception): pass


class Redis:
    def __init__(self, unixsocket): self.unixsocket = unixsocket
    def call(self, *args):
        encoded = [str(a).encode() if not isinstance(a,bytes) else a for a in args]
        with socket.socket(socket.AF_UNIX) as s:
            s.connect(self.unixsocket)
            s.sendall(b'*'+str(len(encoded)).encode()+b'\r\n'+b''.join(
                b'$'+str(len(a)).encode()+b'\r\n'+a+b'\r\n' for a in encoded))
            with s.makefile('rb') as f:
                def read():
                    line = f.readline()
                    tag, body = line[:1], line[1:-2]
                    if tag == b'-': raise RedisError(body.decode())
                    if tag == b'+': return body.decode()
                    if tag == b':': return int(body)
                    if tag == b'$':
                        n = int(body)
                        if n == -1: return None
                        value = f.read(n); f.read(2); return value.decode()
                    if tag == b'*': return [read() for _ in range(int(body))]
                    raise RuntimeError(line)
                return read()
    def eval(self, file, key, *args):
        return self.call('EVAL',(HERE/file).read_text(),1,key,*args)


def redis_rejects(name, r, key, file, *args):
    raw = r.call('HGETALL',key)
    before = dict(zip(raw[::2],raw[1::2]))
    try:
        r.eval(file,key,*args)
    except RedisError:
        raw = r.call('HGETALL',key)
        check(name,dict(zip(raw[::2],raw[1::2])) == before)
    else:
        check(name,False)


def baseline(epoch, cap=10, free=None, tokens=None):
    s = {'epoch':epoch,'cap':cap,'free':cap if free is None else free,'tokens':tokens or {}}
    return dict(s,snapshot=digest(s))


def lua_args(owner='alice', key='one', q=1, scope='sale'):
    i = intent(scope,q,('sku',))
    return [digest([owner,'CREATE_HOLD',key]), owner, digest([owner,'CREATE_HOLD',i]), q]


def run():
    with tempfile.TemporaryDirectory(prefix='ch21-contract-') as tmp:
        tmp = Path(tmp)
        clock = Clock()
        m = Model(tmp/'hotel.db',clock); m.initialize(); m.seed('hotel',{'D1':2,'D2':1,'D3':2})
        original = m.create('alice','stay',intent())
        check('normal three nights all allocate',m.counts('hotel') == [('D1',1,1,0),('D2',0,1,0),('D3',1,1,0)])
        check('three owned items and one event',scalar(m,'SELECT count(*) FROM hold_items') == 3 and scalar(m,'SELECT count(*) FROM outbox') == 1)
        check('normal replay is original receipt',m.create('alice','stay',intent()) == original)
        rejects('changed quantity same key conflicts',lambda:m.create('alice','stay',intent(q=2)),'identity_conflict')
        rejects('changed dates same key conflicts',lambda:m.create('alice','stay',intent(resources=('D1','D2'))),'identity_conflict')
        rejects('changed order same key conflicts',lambda:m.create('alice','stay',intent(order='order-B')),'identity_conflict')
        rejects('changed policy same key conflicts',lambda:m.create('alice','stay',dict(intent(),policy_version='p2')),'identity_conflict')
        check('confirmation moves R to C only',m.finish(original['hold_id'],'CONFIRM','alice','order-A') == 'CONFIRMED'
              and m.counts('hotel') == [('D1',1,0,1),('D2',0,0,1),('D3',1,0,1)])
        check('replay does not rewrite old HELD receipt',m.create('alice','stay',intent()) == original
              and m.query('alice','stay')['current']['state'] == 'CONFIRMED')
        clock.value = 2000
        check('confirmed hold never expires back to free',m.finish(original['hold_id'],'EXPIRE','alice','order-A') == 'CONFIRMED')
        check('other owner cannot read original identity',m.query('bob','stay') is None)
        for name, bad in [('zero',intent(q=0)),('negative',intent(q=-1)),('bool',intent(q=True)),
                          ('duplicate',intent(resources=('D1','D1'))),('empty',intent(resources=()))]:
            rejects('invalid input '+name,lambda bad=bad:m.create('eve',name,bad))
        n = Model(tmp/'insufficient.db',clock); n.initialize(); n.seed('hotel',{'D1':2,'D2':1,'D3':2})
        no = n.create('alice','q2',intent(q=2))
        check('middle-night insufficiency rolls back earlier night',no['result']=='REJECTED'
              and n.counts('hotel') == [('D1',2,0,0),('D2',1,0,0),('D3',2,0,0)])
        check('rejection identity durable but no hold/items',scalar(n,'SELECT count(*) FROM requests')==1
              and scalar(n,'SELECT count(*) FROM holds')==0 and scalar(n,'SELECT count(*) FROM hold_items')==0)
        check('rejected identity replays same receipt',n.create('alice','q2',intent(q=2))==no)
        missing = n.create('bob','missing',intent(resources=('D1','D4')))
        check('missing night rejects entire stay',missing['result']=='REJECTED' and n.counts('hotel')[0][1]==2)
        rejects('unexpected partial failure aborts complete transaction',lambda:n.create('carol','crash',intent(),fail_after=1),'injected_abort')
        check('aborted identity absent and all counters unchanged',n.query('carol','crash') is None
              and n.counts('hotel') == [('D1',2,0,0),('D2',1,0,0),('D3',2,0,0)])
        check('same identity retry after known rollback succeeds',n.create('carol','crash',intent())['http']==201)
        last = Model(tmp/'last.db',clock); last.initialize(); last.seed('hotel',{'D1':1})
        barrier = threading.Barrier(16)
        def compete(i):
            barrier.wait(); return last.create('user'+str(i),'last',intent(resources=('D1',),order='o'+str(i)))
        with ThreadPoolExecutor(max_workers=16) as pool: receipts = list(pool.map(compete,range(16)))
        check('16 real SQLite writers compete for last unit: exactly one',sum(r['http']==201 for r in receipts)==1)
        check('last-unit counter is nonnegative and conserved',last.counts('hotel')==[('D1',0,1,0)])
        same = Model(tmp/'same.db',clock); same.initialize(); same.seed('hotel',{'D1':2})
        with ThreadPoolExecutor(max_workers=12) as pool:
            copies = list(pool.map(lambda _:same.create('alice','same',intent(resources=('D1',))),range(12)))
        check('12 duplicate requests one original receipt',all(r==copies[0] for r in copies) and scalar(same,'SELECT count(*) FROM holds')==1)
        try:
            same.create('bob','lost',intent(resources=('D1',),order='bob-order'),ack_lost=True)
        except UnknownCommit:
            pass
        else:
            check('unknown commit injected',False)
        lost = same.resolve_or_cancel('bob','lost',intent(resources=('D1',),order='bob-order'))
        check('lost COMMIT ACK resolves existing HELD, never cancels',lost['current']['state']=='HELD'
              and same.counts('hotel')==[('D1',0,2,0)])
        check('lost ACK replay returns committed identity',same.create('bob','lost',intent(resources=('D1',),order='bob-order'))==lost['original_receipt'])
        cancel = Model(tmp/'cancel.db',clock); cancel.initialize(); cancel.seed('hotel',{'D1':2})
        ci = intent(resources=('D1',))
        check('cancel-before-create commits tombstone',cancel.resolve_or_cancel('alice','late',ci)['current']=='CANCELLED')
        check('late CREATE cannot bypass same-identity tombstone',cancel.create('alice','late',ci)['result']=='CANCELLED'
              and cancel.counts('hotel')==[('D1',2,0,0)])
        entered, allow_commit, cancel_started = threading.Event(), threading.Event(), threading.Event()
        def hold_claim(): entered.set(); check('claim wait bounded',allow_commit.wait(5))
        def old_create(): return cancel.create('bob','race',ci,after_claim=hold_claim)
        def racing_cancel(): cancel_started.set(); return cancel.resolve_or_cancel('bob','race',ci)
        with ThreadPoolExecutor(max_workers=2) as pool:
            old = pool.submit(old_create); check('old CREATE claimed identity',entered.wait(5))
            resolving = pool.submit(racing_cancel); check('canceller started',cancel_started.wait(5))
            time.sleep(.05); check('canceller cannot read around in-flight writer',not resolving.done())
            allow_commit.set(); oc, rc = old.result(),resolving.result()
        check('CREATE-then-cancel serializes to existing hold',oc==rc['original_receipt'] and rc['current']['state']=='HELD')
        rejects('same identity cannot cancel different intent',lambda:cancel.resolve_or_cancel('bob','race',intent(q=2,resources=('D1',))),'identity_conflict')
        check('other owner same key owns separate cancellation',cancel.resolve_or_cancel('mallory','race',ci)['current']=='CANCELLED'
              and cancel.query('bob','race')['current']['state']=='HELD')
        # Ownership survives release/reallocation: aggregate reserved alone is not enough.
        clock.value=100
        own = Model(tmp/'ownership.db',clock); own.initialize(); own.seed('hotel',{'D1':1,'D2':1,'D3':1})
        a = own.create('alice','A',intent()); clock.value=1000
        check('at deadline confirmation is refused',own.finish(a['hold_id'],'CONFIRM','alice','order-A')=='EXPIRED_NOT_CONFIRMED')
        check('expiry at deadline releases all nights',own.finish(a['hold_id'],'EXPIRE','alice','order-A')=='RELEASED')
        b = own.create('bob','B',intent(order='order-B'))
        before = own.counts('hotel')
        check('duplicate release cannot consume another hold reserved',own.finish(a['hold_id'],'EXPIRE','alice','order-A')=='RELEASED'
              and own.counts('hotel')==before)
        check('late payment cannot revive released inventory',own.finish(a['hold_id'],'CONFIRM','alice','order-A')=='RELEASED'
              and own.query('bob','B')['current']['state']=='HELD')
        rejects('confirm owner binding enforced',lambda:own.finish(b['hold_id'],'CONFIRM','alice','order-B'),'command_binding')
        rejects('confirm order binding enforced',lambda:own.finish(b['hold_id'],'CONFIRM','bob','wrong'),'command_binding')
        rejects('unknown command does not become expiry',lambda:own.finish(b['hold_id'],'DELETE','bob','order-B'),'command')
        check('early expiry does not transition',own.finish(b['hold_id'],'EXPIRE','bob','order-B')=='NOT_DUE')
        clock.value=1900
        rejects('failure after first released night rolls back',lambda:own.finish(b['hold_id'],'EXPIRE','bob','order-B',fail_after=1),'injected_abort')
        check('failed finish preserves HELD/counts/event count',own.counts('hotel')==before and own.query('bob','B')['current']['state']=='HELD'
              and scalar(own,'SELECT count(*) FROM outbox')==3)
        with own.transaction() as c: c.execute('DELETE FROM hold_items WHERE hold_id=? AND resource=?',(b['hold_id'],'D2'))
        rejects('incomplete ownership rejects all restoration',lambda:own.finish(b['hold_id'],'EXPIRE','bob','order-B'),'ownership_mismatch')
        check('ownership mismatch leaves state unchanged',own.query('bob','B')['current']['state']=='HELD')
        with own.transaction() as c: c.execute('INSERT INTO hold_items VALUES(?,?,?,?)',(b['hold_id'],'hotel','D2',1))
        check('repaired full ownership releases exactly once',own.finish(b['hold_id'],'EXPIRE','bob','order-B')=='RELEASED'
              and all(row[1:] == (1,0,0) for row in own.counts('hotel')))
        # Downstream local transaction and version handling.
        consumer = Model(tmp/'consumer.db',clock); consumer.initialize()
        e2 = {'kind':'HOLD_STATE','id':'hold:2','hold_id':'h','v':2,'state':'RELEASED'}
        rejects('consumer crash rolls back inbox plus projection',lambda:consumer.consume(e2,fail=True),'consumer_abort')
        check('consumer rollback leaves no false dedup claim',scalar(consumer,'SELECT count(*) FROM consumer_inbox')==0
              and scalar(consumer,'SELECT count(*) FROM projections')==0)
        check('consumer retries committed full-state event',consumer.consume(e2)=='APPLIED')
        check('ACK loss repeats original event without repeat local effect',consumer.consume(e2)=='REPLAY')
        check('out-of-order old event cannot overwrite terminal projection',consumer.consume({'kind':'HOLD_STATE','id':'hold:1','hold_id':'h','v':1,'state':'HELD'})=='APPLIED'
              and scalar(consumer,"SELECT state FROM projections WHERE hold_id='h'")=='RELEASED')
        rejects('same event ID different body is conflict',lambda:consumer.consume(dict(e2,state='CONFIRMED')),'event_identity_conflict')
        # Actual Redis 7+ process; isolated Unix socket, no machine service/config modified.
        server = os.environ.get('REDIS_SERVER','/tmp/redis-7.2.5/src/redis-server')
        sock = str(tmp/'redis.sock')
        proc = subprocess.Popen([server,'--port','0','--unixsocket',sock,'--save','','--appendonly','no','--dir',str(tmp)],
                                stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
        try:
            for _ in range(100):
                if Path(sock).exists(): break
                time.sleep(.02)
            r = Redis(sock)
            check('actual Redis reachable',r.call('PING')=='PONG')
            key='gate:{sale}:7'
            check('atomic snapshot installs baseline',r.eval('install.lua',key,canonical(baseline(7)))==['INSTALLED','0'])
            args=lua_args(q=3)
            check('Lua admission debits hint plus token',r.eval('admit.lua',key,7,*args)[0]=='ADMITTED' and r.call('HGET',key,'free')=='7')
            check('Lua same identity replays without debit',r.eval('admit.lua',key,7,*args)==['REPLAY','ADMITTED'] and r.call('HGET',key,'free')=='7')
            redis_rejects('Lua changed quantity same key has no mutation',r,key,'admit.lua',7,*args[:-1],2)
            redis_rejects('Lua noninteger quantity has no mutation',r,key,'admit.lua',7,*args[:-1],1.5)
            check('Lua old epoch cannot admit',r.eval('admit.lua',key,6,*lua_args(key='epoch'))==['CLOSED'])
            check('no TTL discards unresolved admission ledger',r.call('TTL',key)==-1)
            check('HELD receipt records ownership without restoration',r.eval('receipt.lua',key,7,*args,1,'HELD')==['APPLIED','HELD'] and r.call('HGET',key,'free')=='7')
            redis_rejects('receipt wrong owner cannot restore quota',r,key,'receipt.lua',7,args[0],'mallory',args[2],3,2,'RELEASED')
            check('release receipt restores once',r.eval('receipt.lua',key,7,*args,2,'RELEASED')==['APPLIED','RELEASED'] and r.call('HGET',key,'free')=='10')
            check('lost receipt ACK replay adds zero',r.eval('receipt.lua',key,7,*args,2,'RELEASED')==['REPLAY'] and r.call('HGET',key,'free')=='10')
            check('older HELD receipt cannot revert released token',r.eval('receipt.lua',key,7,*args,1,'HELD')==['STALE'])
            redis_rejects('conflicting terminal receipt rejected',r,key,'receipt.lua',7,*args,2,'CONFIRMED')
            check('receipt without token creates no quota',r.eval('receipt.lua',key,7,*lua_args(key='none'),1,'CANCELLED')==['NO_OWNERSHIP'])
            check('retry cancelled identity never gets a second admission',r.eval('admit.lua',key,7,*args)==['REPLAY','RELEASED'])
            held=lua_args(key='confirmed',q=2);r.eval('admit.lua',key,7,*held)
            check('terminal before HELD is handled',r.eval('receipt.lua',key,7,*held,2,'CONFIRMED')==['APPLIED','CONFIRMED'])
            check('confirmed quota never returns',r.call('HGET',key,'free')=='8' and r.eval('receipt.lua',key,7,*held,1,'HELD')==['STALE'])
            check('snapshot ACK retry never resets live free',r.eval('install.lua',key,canonical(baseline(7)))==['REPLAY'] and r.call('HGET',key,'free')=='8')
            redis_rejects('different snapshot cannot overwrite live key',r,key,'install.lua',canonical(baseline(7,free=1)))
            many = {digest(['token',i]):{'principal':'u','digest':digest(['intent',i]),'q':1,'state':'RELEASED','v':2} for i in range(5000)}
            check('snapshot chunks handle 5000 retained identities without unpack overflow',
                  r.eval('install.lua','gate:{large}:7',canonical(baseline(7,tokens=many))) == ['INSTALLED','5000']
                  and r.call('HLEN','gate:{large}:7') == 5007)
            partial='gate:{partial}:7'; partial_snapshot=baseline(7)
            r.call('HSET',partial,'epoch',7,'snapshot',partial_snapshot['snapshot'],'ready',0)
            check('same immutable partial baseline stays closed then safely completes',
                  r.eval('admit.lua',partial,7,*lua_args()) == ['CLOSED']
                  and r.eval('install.lua',partial,canonical(partial_snapshot)) == ['INSTALLED','0']
                  and r.call('HGET',partial,'ready')=='1')
            sec=int(r.call('TIME')[0])+60
            r.call('HSET',key,'sec',sec,'used',499)
            check('fixed-second quota permits final slot',r.eval('admit.lua',key,7,*lua_args(key='quota500'))[0]=='ADMITTED')
            check('clock rollback does not reset full quota',r.eval('admit.lua',key,7,*lua_args(key='quota501'))==['RATE_LIMITED'])
            one='gate:{last}:7';r.eval('install.lua',one,canonical(baseline(7,cap=1)))
            def redis_compete(i): return r.eval('admit.lua',one,7,*lua_args(owner='u'+str(i),key='r',scope='last'))
            with ThreadPoolExecutor(max_workers=24) as pool: rr=list(pool.map(redis_compete,range(24)))
            check('24 actual Redis clients only one last-unit admission',sum(x[0]=='ADMITTED' for x in rr)==1 and r.call('HGET',one,'free')=='0')
            corrupt='gate:{corrupt}:7';r.eval('install.lua',corrupt,canonical(baseline(7)))
            r.call('HSET',corrupt,'free','bad')
            redis_rejects('corrupt gate fails before any write',r,corrupt,'admit.lua',7,*lua_args())
            try: r.call('EVAL',"redis.call('HSET',KEYS[1],'partial','yes'); return redis.error_reply('FAIL')",1,corrupt)
            except RedisError: pass
            check('actual Redis script error does not roll back prior writes',r.call('HGET',corrupt,'partial')=='yes')
            # End-to-end paused recovery, including expired-but-unreleased ownership.
            clock.value=100
            sale=Model(tmp/'sale.db',clock);sale.initialize();sale.seed('sale',{'sku':10},gated=True)
            active=sale.create('alice','active',intent('sale',3,('sku',)),epoch=7)
            paid=sale.create('bob','paid',intent('sale',2,('sku',),order='o-paid'),epoch=7)
            sale.finish(paid['hold_id'],'CONFIRM','bob','o-paid')
            old=sale.create('carol','old',intent('sale',1,('sku',),order='o-old'),epoch=7)
            clock.value=1000;sale.finish(old['hold_id'],'EXPIRE','carol','o-old')
            sale.resolve_or_cancel('dave','orphan',intent('sale',1,('sku',),order='o-orphan'),epoch=7)
            sale.create('eve','reject',intent('sale',10,('sku',),order='o-reject'),epoch=7)
            sale.create('frank','reject-2',intent('sale',9,('sku',),order='o-reject-2'),epoch=7)
            for owner,request_key in [('eve','reject'),('frank','reject-2')]:
                request_event_id=digest([owner,'CREATE_HOLD',request_key])+':rejected'
                check('holdless rejection '+owner+' routes only to Redis',
                      scalar(sale,'SELECT count(*) FROM deliveries WHERE event_id=?',(request_event_id,))==1
                      and scalar(sale,'SELECT destination FROM deliveries WHERE event_id=?',(request_event_id,))=='redis_gate')
                rejects('holdless rejection '+owner+' has no orders delivery',
                        lambda request_event_id=request_event_id:sale.relay(request_event_id,'orders',lambda _:True),'missing_delivery')
                check('holdless rejection '+owner+' remains scoped and queryable',
                      sale.query(owner,request_key)['current']=='REJECTED')
            for malformed in [dict(e2,id='missing-hold',hold_id=None),dict(e2,id='blank-hold',hold_id='  '),
                              dict(e2,id='request-in-hold-handler',kind='REQUEST_TERMINAL',state='REJECTED')]:
                rejects('hold consumer refuses malformed identity/type '+malformed['id'],
                        lambda malformed=malformed:consumer.consume(malformed),'invalid_hold_event')
            check('invalid hold events create neither inbox ACK nor null projection',
                  scalar(consumer,'SELECT count(*) FROM consumer_inbox')==2
                  and scalar(consumer,'SELECT count(*) FROM projections')==1)
            with consumer.connect() as conn:
                try:conn.execute('INSERT INTO projections VALUES(NULL,1,?)',('HELD',))
                except sqlite3.IntegrityError:check('SQLite projection PK explicitly refuses NULL',True)
                else:check('SQLite projection PK explicitly refuses NULL',False)
            eid=paid['hold_id']+':2'
            destination_consumer=Model(tmp/'delivery-consumer.db',clock);destination_consumer.initialize()
            seen=[]
            def order_ack(payload):
                seen.append(payload['id']);destination_consumer.consume(payload);return True
            rejects('relay crash after durable receive keeps task retryable',
                    lambda:sale.relay(eid,'orders',order_ack,crash_before_mark=True),'relay_abort')
            check('unmarked delivery and independent Redis destination both pending',
                  scalar(sale,'SELECT SUM(sent) FROM deliveries WHERE event_id=?',(eid,))==0)
            check('relay retries same event and marks only its destination',sale.relay(eid,'orders',order_ack)=='SENT'
                  and seen==[eid,eid] and scalar(destination_consumer,'SELECT count(*) FROM projections')==1
                  and scalar(sale,'SELECT sent FROM deliveries WHERE event_id=? AND destination=?',(eid,'redis_gate'))==0)
            check('already ACKed destination does not repeat send',sale.relay(eid,'orders',order_ack)=='ALREADY_SENT' and len(seen)==2)
            check('missing Redis ACK keeps separate delivery pending',sale.relay(eid,'redis_gate',lambda _:False)=='PENDING'
                  and scalar(sale,'SELECT sent FROM deliveries WHERE event_id=? AND destination=?',(eid,'redis_gate'))==0)
            epoch,rid=sale.pause('sale')
            rejects('paused fence stops create',lambda:sale.create('x','paused',intent('sale',1,('sku',)),epoch=7),'paused')
            rejects('paused fence stops confirmation',lambda:sale.finish(active['hold_id'],'CONFIRM','alice','order-A'),'paused')
            rejects('paused fence stops expiry',lambda:sale.finish(active['hold_id'],'EXPIRE','alice','order-A'),'paused')
            snapshot=sale.snapshot('sale',epoch,rid)
            check('paused snapshot counts expired HELD and confirmed',snapshot['free']==5
                  and sorted(t['state'] for t in snapshot['tokens'].values())==['CANCELLED','CONFIRMED','HELD','REJECTED','REJECTED','RELEASED'])
            rejects('resume requires verified installed manifest',lambda:sale.resume('sale',epoch,rid,[str(epoch),'bad','1']),'install_not_verified')
            newkey='gate:{sale}:8'
            check('new epoch installs all retained ownership',r.eval('install.lua',newkey,canonical(snapshot))==['INSTALLED','6'])
            sale.resume('sale',epoch,rid,r.call('HMGET',newkey,'epoch','snapshot','ready'))
            rejects('late old epoch CREATE rejected after resume',lambda:sale.create('late','old',intent('sale',1,('sku',)),epoch=7),'epoch')
            check('old create identity still queryable after fencing',sale.query('alice','active')['original_receipt']==active)
            tok=snapshot['tokens'][digest(['alice','CREATE_HOLD','active'])]
            active_args=[digest(['alice','CREATE_HOLD','active']),tok['principal'],tok['digest'],tok['q']]
            check('current gate rejects old epoch effects',r.eval('receipt.lua',newkey,7,*active_args,2,'RELEASED')==['STALE_OR_CLOSED'])
            check('old live hold emits current epoch on expiry',sale.finish(active['hold_id'],'EXPIRE','alice','order-A')=='RELEASED'
                  and scalar(sale,'SELECT epoch FROM outbox WHERE event_id=?',(active['hold_id']+':2',))==8)
            check('imported current-epoch ownership restores once',r.eval('receipt.lua',newkey,8,*active_args,2,'RELEASED')==['APPLIED','RELEASED']
                  and r.call('HGET',newkey,'free')=='8')
            check('current epoch receipt duplicate adds zero',r.eval('receipt.lua',newkey,8,*active_args,2,'RELEASED')==['REPLAY']
                  and r.call('HGET',newkey,'free')=='8')
            check('late install ACK replay cannot reset restored free',r.eval('install.lua',newkey,canonical(snapshot))==['REPLAY']
                  and r.call('HGET',newkey,'free')=='8')
            check('old epoch key cannot alter current epoch key',r.call('HSET',key,'free',1)==0 and r.call('HGET',newkey,'free')=='8')
            rejects('old recovery owner cannot resume a newer pause',lambda:sale.resume('sale',epoch,rid,[str(epoch),snapshot['snapshot'],'1']),'recovery_owner')
            epoch2,rid2=sale.pause('sale')
            rejects('stale controller rejected against next epoch',lambda:sale.snapshot('sale',epoch,rid),'recovery_owner')
            check('next recovery uses monotonic new epoch',epoch2==9 and rid2!=rid)
        finally:
            proc.terminate()
            proc.wait(timeout=5)
        # Independent arithmetic using chapter's teaching assumptions.
        check('hotel average: occupancy divided by stay then day',abs(5000*200*.7/3/86400-2.700617283950617)<1e-12)
        check('row count and nominal steady-rate equivalent',5000*10*365==18250000 and 10000/500==20)
        check('DB mix budget and mean concurrency',500+200+50==750<800 and 500*.020==10)
        check('retry amplification',100*(1+2)==300)


result={'checks':checks,'limits':['SQLite BEGIN IMMEDIATE serializes all writers; not a PostgreSQL row-lock experiment.',
    'Actual Redis 7.2.5 single-process Lua; no AOF, replication, Cluster or restart fault test.',
    'model_now is injected SQL test time, not a production synchronized database clock.',
    'No real payment/auth, load test, global rate limiter, broker, or online rebuild.']}
try:
    run();result['passed']=True
except BaseException as error:
    result['passed']=False;result['failure']=repr(error)
    raise
finally:
    result['count']=len(checks)
    from hashlib import sha256
    files=[ROOT/'chapters/ch21.html',*sorted(p for p in HERE.iterdir() if p.is_file())]
    result['files']={str(p.relative_to(ROOT)):sha256(p.read_bytes()).hexdigest() for p in files}
    (ROOT/'docs/reviews/ch21-code-results.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'passed':result.get('passed'),'checks':len(checks),'failure':result.get('failure')}))
