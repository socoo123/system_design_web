"""Independent new-input probes. Read actual Ch26 code; write only independent evidence."""
import sys
sys.dont_write_bytecode=True
from pathlib import Path
import contextlib
import hashlib
import importlib.util
import json
import socket
import sqlite3
import subprocess
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor

ROOT=Path(__file__).resolve().parents[2]
HERE=ROOT/'examples/ch26'
sys.path.insert(0,str(HERE))
from model import Store,Ledger,Rejected,LostReply
checks=[]
def check(name,p,details=None):
    if not p:raise AssertionError(name)
    checks.append(dict(name=name,passed=True,**({'details':details} if details is not None else {})))
def reject(name,fn,typ=(Rejected,sqlite3.IntegrityError)):
    try:fn()
    except typ as error:check(name,True,str(error))
    else:raise AssertionError(name)
def value(owner,sql,args=()):
    with contextlib.closing(owner.connect()) as db:return db.execute(sql,args).fetchone()[0]
def race(*fns):
    barrier=threading.Barrier(len(fns))
    def run(fn):
        barrier.wait(timeout=4)
        try:return {'ok':True,'value':fn()}
        except (Rejected,sqlite3.IntegrityError) as e:return {'ok':False,'error':str(e)}
    with ThreadPoolExecutor(max_workers=len(fns)) as pool:return list(pool.map(run,fns))
class RedisError(Exception):pass
class Redis:
    def __init__(self,path):self.path=str(path)
    def call(self,*args):
        words=[str(a).encode() for a in args]
        with socket.socket(socket.AF_UNIX) as s:
            s.connect(self.path)
            s.sendall(b'*'+str(len(words)).encode()+b'\r\n'+b''.join(b'$'+str(len(a)).encode()+b'\r\n'+a+b'\r\n' for a in words))
            with s.makefile('rb') as f:
                def read():
                    line=f.readline();tag=line[:1];data=line[1:-2]
                    if tag==b'-':raise RedisError(data.decode())
                    if tag==b':':return int(data)
                    if tag==b'+':return data.decode()
                    if tag==b'$':
                        n=int(data)
                        if n<0:return None
                        out=f.read(n);f.read(2);return out.decode()
                    if tag==b'*':return [read() for _ in range(int(data))]
                    raise RuntimeError(line)
                return read()
    def script(self,name,keys,args):return self.call('EVAL',(HERE/name).read_text(),len(keys),*keys,*args)
def keys(pid,e):return [f'pkt:{{{pid}}}:e:{e}:{s}' for s in ('meta','list','amounts','users')]
result={'checks':checks,'sourceFiles':json.loads((ROOT/'docs/reviews/ch26-independent-source-hashes.json.before').read_text())['files'],
        'sqliteVersion':sqlite3.sqlite_version,'limits':['Real local SQLite writer locking, not PostgreSQL row locking/failover.',
        'Authentication, membership, immutable grants and APPLIED-result authenticity are explicit fixtures.',
        'Independent standalone Redis, not Cluster/replication; no live PSP or load experiment.']}
with tempfile.TemporaryDirectory(prefix='ch26-independent-') as folder:
    tmp=Path(folder);counter=[0]
    def fixture(plan=None,deadline=None,cls=Store):
        counter[0]+=1;pid=f'ind-{counter[0]}'
        s=cls(tmp/f'{pid}-packet.sqlite');l=Ledger(tmp/f'{pid}-ledger.sqlite',s);l.seed('author',50_000)
        plan=plan or [('sA',257),('sB',13),('sC',31),('sD',499)]
        deadline=deadline if deadline is not None else int(time.time()*1000)+30_000
        s.create(pid,'author','create-'+pid,plan,deadline,minimum=min(a for _,a in plan))
        return s,l,pid,deadline
    def fund_open(s,l,pid):
        s.record_applied(l.apply(s.command('fund:'+pid)));snap=s.begin_rebuild(pid);s.publish(snap,snap['token']);return snap
    def conservation(s,l,pid):
        p=s.packet(pid);claimed=value(s,'SELECT coalesce(sum(amount),0) FROM claims WHERE packet_id=?',(pid,))
        count=value(s,'SELECT count(*) FROM claims WHERE packet_id=?',(pid,))
        check('amount conservation '+pid,p['total_cents']==claimed+p['remaining_cents']+p['refund_pending']+p['refund_applied'])
        check('count conservation '+pid,p['total_n']==count+p['remaining_n']+p['closed_unclaimed_n'])
        check('every journal pair balanced '+pid,value(l,'SELECT count(*) FROM (SELECT operation_id FROM entries GROUP BY operation_id HAVING sum(delta)<>0 OR count(*)<>2)')==0)
        check('wallet plus escrow conservation '+pid,value(l,'SELECT coalesce(sum(cents),0) FROM wallets')+value(l,'SELECT coalesce(sum(available),0) FROM escrows')==50_000)

    sock=tmp/'redis.sock'
    proc=subprocess.Popen(['/tmp/redis-7.2.5/src/redis-server','--port','0','--unixsocket',str(sock),'--save','','--appendonly','no','--dir',folder],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        for _ in range(100):
            if sock.exists():break
            time.sleep(.01)
        r=Redis(sock);check('isolated Redis starts',r.call('PING')=='PONG')
        result['redisVersion']=r.call('INFO','server').split('redis_version:')[1].splitlines()[0]
        def install(snap):return r.script('install.lua',keys(snap['packet'],snap['epoch']),[snap['epoch'],snap['token'],snap['deadline']]+[v for pair in snap['shares'] for v in pair])
        def activate(snap):return r.script('activate.lua',keys(snap['packet'],snap['epoch'])[:1],[snap['epoch'],snap['token']])
        s,l,pid,deadline=fixture()
        reject('unfunded claim cannot use synthetic candidate',lambda:s.claim(pid,'zen','before',7,'sA'))
        reject('unfunded expiry never assumes funds were applied',lambda:s.close(pid))
        fund=s.command('fund:'+pid);a=l.apply(fund);s.record_applied(a)
        check('fund creates bound escrow and debits sender',s.packet(pid)['state']=='INITIALIZING' and value(l,'SELECT available FROM escrows')==800 and value(l,'SELECT cents FROM wallets WHERE account=?',('author',))==49_200)
        check('repeated funding replays one result',l.apply(fund)==a and value(l,'SELECT count(*) FROM entries')==2)
        snap=s.begin_rebuild(pid);k=keys(pid,snap['epoch'])
        check('install READY preserves fixed shares',install(snap)[0]=='READY' and r.call('LRANGE',k[1],0,-1)==['sA','sB','sC','sD'])
        check('READY is not candidate authority',r.script('candidate.lua',k,[snap['epoch'],'zen'])[0]=='RETRY')
        s.publish(snap,snap['token']);check('DB open before Redis activation still pauses candidates',r.script('candidate.lua',k,[snap['epoch'],'zen'])[0]=='RETRY')
        check('matching activation opens projection',activate(snap)==['ACTIVE'])
        candidate=r.script('candidate.lua',k,[snap['epoch'],'zen']);check('real Lua candidate retains original identity and cents',candidate[:3]==['CANDIDATE','sA','257'])
        c=s.claim(pid,'zen','claim-z',int(candidate[3]),candidate[1]);cmd=s.command('credit:'+c['claim_id'])
        posted=l.apply(cmd);s.record_applied(posted)
        check('full fund-open-Lua-claim-credit path',c['amount']==257 and value(l,'SELECT cents FROM wallets WHERE account=?',('zen',))==257 and s.packet(pid)['remaining_cents']==543 and s.packet(pid)['remaining_n']==3)
        check('rotated request key cannot win another share',s.claim(pid,'zen','claim-z-2',snap['epoch'],'sB')==c and s.packet(pid)['remaining_n']==3)
        check('same key changed internal candidate replays original business claim',s.claim(pid,'zen','claim-z',snap['epoch'],'sD')==c)
        check('sender create key replays original packet and plan',s.create('unused','author','create-'+pid,[('sA',257),('sB',13),('sC',31),('sD',499)],deadline,minimum=13)==pid)
        reject('create same key changed deadline conflicts',lambda:s.create('new','author','create-'+pid,[('sA',257),('sB',13),('sC',31),('sD',499)],deadline+1,minimum=13))
        reject('create same key changed plan conflicts',lambda:s.create('new','author','create-'+pid,[('new',800)],deadline,minimum=13))
        reject('null request key rejected',lambda:s.claim(pid,'zen',None,snap['epoch'],'sA'))
        reject('bool cents rejected at fixture entry',lambda:s.create('bad','author','b',[('x',True)],deadline))
        reject('double allocated share rejected even with different user',lambda:s.claim(pid,'other','other',snap['epoch'],'sA'))
        for field,new in [('cents',258),('recipient','intruder'),('currency','USD'),('packet','another')]:
            reject('immutable grant rejects changed '+field,lambda field=field,new=new:l.apply(dict(cmd,**{field:new})))
        reject('fresh arbitrary effect ID cannot create credit',lambda:l.apply(dict(cmd,operation_id='credit:invented',effect='invented')))
        check('credit replay posts once',l.apply(cmd)==posted and value(l,'SELECT count(*) FROM entries WHERE operation_id=?',(cmd['operation_id'],))==2)
        before=r.call('LRANGE',k[1],0,-1)
        check('same token retry cannot refill ACTIVE list',install(snap)==['EXISTS','ACTIVE'] and r.call('LRANGE',k[1],0,-1)==before)
        old=snap;new=s.begin_rebuild(pid)
        check('recovery snapshot excludes durable share',new['shares']==[('sB',13),('sC',31),('sD',499)])
        install(new);s.publish(new,new['token']);activate(new)
        before=r.call('LRANGE',keys(pid,new['epoch'])[1],0,-1)
        install(old);activate(old)
        stale=r.script('candidate.lua',keys(pid,old['epoch']),[old['epoch'],'old-worker'])
        reject('stale ACTIVE epoch cannot commit against DB',lambda:s.claim(pid,'old-worker','old-worker',int(stale[3]),stale[1]))
        check('late old installer cannot mutate current epoch namespace',r.call('LRANGE',keys(pid,new['epoch'])[1],0,-1)==before)
        reject('superseded publisher cannot reopen old generation',lambda:s.publish(old,old['token']))
        check('durable receipt survives stale epoch lookup',s.claim(pid,'zen','lookup-old',old['epoch'],'sD')==c)
        conservation(s,l,pid)

        # Another packet proves request scope binds packet, rather than trusting header uniqueness alone.
        other='other-packet';s.create(other,'author','other-create',[('one',21)],deadline);s.record_applied(l.apply(s.command('fund:'+other)));o=s.begin_rebuild(other);s.publish(o,o['token'])
        reject('same user key cannot move to another packet',lambda:s.claim(other,'zen','claim-z',o['epoch'],'one'))
        check('same header from another user has independent scope',s.claim(other,'novel','claim-z',o['epoch'],'one')['amount']==21)

        s,l,pid,_=fixture([('last',73)]);snap=fund_open(s,l,pid)
        win=race(*[lambda i=i:s.claim(pid,f'last-{i}','same-header',snap['epoch'],'last') for i in range(9)])
        check('nine SQLite writers one last share one receipt',sum(x['ok'] for x in win)==1 and s.packet(pid)['remaining_n']==0,win)
        conservation(s,l,pid)
        s,l,pid,_=fixture([('a',17),('b',19),('c',23)]);snap=fund_open(s,l,pid)
        wins=race(*[lambda i=i:s.claim(pid,'one-user',f'key-{i}',snap['epoch'],['a','b','c'][i%3]) for i in range(7)])
        check('same user seven keys converge to one business receipt',all(x['ok'] and x['value']==wins[0]['value'] for x in wins) and s.packet(pid)['remaining_n']==2)
        free=next(sid for sid in ('a','b','c') if sid!=wins[0]['value']['share_id'])
        reject('claim partial failure rolls back every row',lambda:s.claim(pid,'crash','crash',snap['epoch'],free,fail='before_outbox'))
        check('failed claim has no request or receipt',s.receipt(pid,'crash') is None and value(s,'SELECT count(*) FROM requests WHERE user_id=?',('crash',))==0)
        conservation(s,l,pid)

        # Refund is deliberately applied before a still-pending recipient credit.
        deadline=int(time.time()*1000)+180
        s,l,pid,_=fixture([('first',113),('rest',887)],deadline);snap=fund_open(s,l,pid)
        c=s.claim(pid,'recipient','first',snap['epoch'],'first');time.sleep(max(0,(deadline-int(time.time()*1000))/1000)+.015)
        check('close freezes only unconfirmed cents',s.close(pid)==887 and s.packet(pid)['closed_unclaimed_n']==1)
        refund=s.command('refund:'+pid)
        reject('refund lost reply leaves source unresolved',lambda:l.apply(refund,fail='lost_reply'),LostReply)
        check('pending refund source survives committed receiver response loss',s.packet(pid)['state']=='EXPIRING' and s.packet(pid)['refund_pending']==887)
        s.record_applied(l.apply(refund));check('refund first leaves confirmed credit in escrow',s.packet(pid)['state']=='EXPIRED' and value(l,'SELECT available FROM escrows')==113)
        credit=s.command('credit:'+c['claim_id']);reject('receiver partial journal failure rolls back',lambda:l.apply(credit,fail='after_one_entry'))
        check('partial credit failure keeps escrow and no receiver rows',value(l,'SELECT available FROM escrows')==113 and value(l,'SELECT count(*) FROM entries WHERE operation_id=?',(credit['operation_id'],))==0)
        s.record_applied(l.apply(credit));check('late credit still completes after EXPIRED',value(l,'SELECT cents FROM wallets WHERE account=?',('recipient',))==113 and value(l,'SELECT available FROM escrows')==0)
        check('repeated close and credit preserve original amounts',s.close(pid)==887 and l.apply(credit)['status']=='APPLIED')
        conservation(s,l,pid)

        # Funding confirmed after the original deadline must have a complete refund exit.
        s,l,pid,_=fixture([('one',37)],int(time.time()*1000)-1)
        reject('late PENDING_FUND cannot close without result',lambda:s.close(pid))
        reject('late funding commit with lost reply remains unknown at source',lambda:l.apply(s.command('fund:'+pid),fail='lost_reply'),LostReply)
        check('lost fund reply does not guess INITIALIZING',s.packet(pid)['state']=='PENDING_FUND')
        s.record_applied(l.apply(s.command('fund:'+pid)))
        reject('late INITIALIZING cannot rebuild/open',lambda:s.begin_rebuild(pid))
        check('late INITIALIZING can close and refund full amount',s.close(pid)==37)
        s.record_applied(l.apply(s.command('refund:'+pid)));conservation(s,l,pid)

        # Real SQLite lock wait crosses expiry before the actual Store.now call.
        deadline=int(time.time()*1000)+200;s,l,pid,_=fixture([('last',43)],deadline);snap=fund_open(s,l,pid)
        holder=s.connect();holder.execute('BEGIN IMMEDIATE')
        with ThreadPoolExecutor(max_workers=1) as pool:
            waiting=pool.submit(s.claim,pid,'queued','queued',snap['epoch'],'last')
            time.sleep(max(0,(deadline-int(time.time()*1000))/1000)+.02)
            holder.execute('COMMIT');holder.close();reject('queued claim reads deadline after acquiring SQLite lock',waiting.result)
        check('close after queued expiry refunds untouched last share',s.close(pid)==43);conservation(s,l,pid)

        deadline=int(time.time()*1000)+150;s,l,pid,_=fixture([('last',67)],deadline);snap=fund_open(s,l,pid)
        s.claim(pid,'first-winner','first-winner',snap['epoch'],'last')
        time.sleep(max(0,(deadline-int(time.time()*1000))/1000)+.015)
        check('last claim before close excludes full amount and emits no zero refund',s.close(pid)==0 and value(s,'SELECT count(*) FROM outbox WHERE operation_id=?',('refund:'+pid,))==0)
        conservation(s,l,pid)

        deadline=int(time.time()*1000)+150;s,l,pid,_=fixture([('last',47)],deadline);snap=fund_open(s,l,pid)
        entered=threading.Event();release=threading.Event()
        def closing():
            def locked():entered.set();release.wait(3)
            return s.close(pid,locked=locked)
        with ThreadPoolExecutor(max_workers=2) as pool:
            first=pool.submit(closing);entered.wait(1);second=pool.submit(s.claim,pid,'late','late',snap['epoch'],'last')
            time.sleep(max(0,(deadline-int(time.time()*1000))/1000)+.02);release.set()
            check('close-first captures original last share',first.result()==47)
            reject('last claim cannot cross committed close',second.result)
        conservation(s,l,pid)

        deadline=int(time.time()*1000)+120;s,l,pid,_=fixture([('one',53)],deadline);old=fund_open(s,l,pid);new=s.begin_rebuild(pid);install(new)
        time.sleep(max(0,(deadline-int(time.time()*1000))/1000)+.02)
        check('recovering also closes at original deadline',s.close(pid)==53)
        reject('late READY install cannot reopen a closed packet',lambda:s.publish(new,new['token']))
        activate(new);reject('stale activated projection cannot confirm after close',lambda:s.claim(pid,'late','late',new['epoch'],'one'))
        conservation(s,l,pid)

        empty=dict(packet='empty',epoch=1,token='empty-token',deadline=int(time.time()*1000)+10_000,shares=[])
        check('zero-remaining rebuild installs READY with valid marker',install(empty)[0]=='READY');activate(empty)
        check('fully claimed projection returns EMPTY',r.script('candidate.lua',keys('empty',1),[1,'user'])==['EMPTY'])
        last=dict(packet='lua-last',epoch=1,token='last-token',deadline=int(time.time()*1000)+10_000,shares=[('last',59)])
        install(last);activate(last)
        lua=race(*[lambda i=i:r.script('candidate.lua',keys('lua-last',1),[1,f'rider-{i}']) for i in range(13)])
        check('13 actual Redis clients admit one last candidate',sum(x['value'][0]=='CANDIDATE' for x in lua)==1 and sum(x['value'][0]=='EMPTY' for x in lua)==12)
        kb=keys('orphan',1);r.call('SET',kb[3],'orphan')
        check('orphan install returns RECOVER without partial overwrite',r.script('install.lua',kb,[1,'t',int(time.time()*1000)+1000,'x',1])[0]=='RECOVER' and r.call('EXISTS',kb[0])==0)
        invalid=keys('invalid',1)
        check('duplicate share install fails before writes',r.script('install.lua',invalid,[1,'t',int(time.time()*1000)+1000,'x',1,'x',2])==['INVALID'] and r.call('EXISTS',invalid[1])==0)
        check('zero amount install rejected',r.script('install.lua',invalid,[1,'t',int(time.time()*1000)+1000,'x',0])==['INVALID'])
        bad=dict(packet='wrong-type',epoch=1,token='bad-token',deadline=int(time.time()*1000)+10000,shares=[('one',61)])
        install(bad);activate(bad);kb=keys('wrong-type',1);r.call('SET',kb[3],'wrong')
        check('candidate wrong type checked before pop',r.script('candidate.lua',kb,[1,'u'])[0]=='RECOVER' and r.call('LLEN',kb[1])==1)
        reject('actual Lua error surfaces',lambda:r.call('EVAL',"redis.call('SET',KEYS[1],'kept');error('after write')",1,'independent-probe'),RedisError)
        check('Lua runtime error does not rollback an earlier write',r.call('GET','independent-probe')=='kept')
        check('WAIT without replicas returns zero rather than a quorum proof',r.call('WAIT',1,2)==0)
    finally:
        proc.terminate();proc.wait(timeout=5)

    jdk=Path('/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin')
    run=subprocess.run([str(jdk/'javac'),'--release','17','-d',folder,str(HERE/'SplitPlan.java'),str(ROOT/'docs/reviews/ch26-independent-SplitProbe.java')],capture_output=True,text=True)
    check('actual Java17 compiles original SplitPlan with independent probe',run.returncode==0,run.stderr)
    run=subprocess.run([str(jdk/'java'),'-cp',folder,'SplitProbe'],capture_output=True,text=True)
    check('new Java lower/upper/extreme/even/invalid split inputs pass',run.returncode==0,run.stderr)
    result['java']=json.loads(run.stdout)
result['passed']=True;result['checkCount']=len(checks)
(ROOT/'docs/reviews/ch26-independent-probes-results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'passed':True,'checks':len(checks),'java':result['java'],'redisVersion':result['redisVersion']}))
