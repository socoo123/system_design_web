"""Independent direct calls of Ch27's actual SQLite adapter; no source mutation."""
import concurrent.futures, hashlib, json, math, sys, tempfile, threading, time
from pathlib import Path
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'examples/ch27'))
from model import Store, Conflict, VerifiedRelease, fresh, eta
checks=[]; scenarios=[]
def ok(name, condition, detail=None):
    assert condition,name
    checks.append({'name':name,'detail':detail})
def reject(name, fn, expected):
    try: fn()
    except Conflict as e: ok(name,str(e)==expected,str(e))
    else: raise AssertionError(name+' did not reject')
def race(*fns):
    barrier=threading.Barrier(len(fns))
    def run(fn):
        barrier.wait()
        try:return {'ok':True,'value':fn()}
        except Conflict as e:return {'ok':False,'error':str(e)}
    with concurrent.futures.ThreadPoolExecutor(len(fns)) as pool:return list(pool.map(run,fns))
class Clock:
    def __init__(self):self.now=100
    def __call__(self):return self.now

def sql(store, query, args=()):
    with store.connect() as db:return [dict(r) for r in db.execute(query,args)]
def invariant(name, s):ok(name,s.invariants())
report={'checks':checks,'scenarios':scenarios,'limitations':['SQLite coarse single-writer locks, not PostgreSQL row-lock proof','Injected seconds clock and trusted authentication/candidate/custody facts','No production routing or physical custody experiment']}
try:
 with tempfile.TemporaryDirectory(prefix='ch27-independent-') as tmp:
    counter=0
    def fixture(orders=1,capacity=2):
        global counter
        counter+=1; clock=Clock();s=Store(Path(tmp,f'case-{counter}.db'),clock);s.install()
        s.courier('c0',capacity);s.courier('c1',capacity)
        for i in range(orders):s.create(f'o{i}',f'paid-{i}',deadline=220)
        return s,clock
    def offered(s,aid='a0',oid='o0',cid='c0'):
        return s.reserve(oid,s.snapshot(oid)['generation'],cid,aid,candidate_valid_until=125)
    def accepted(s,aid='a0',oid='o0',cid='c0'):
        offered(s,aid,oid,cid);return s.decide('ACCEPT',oid,aid,7,cid)

    s,c=fixture();r=offered(s)
    ok('normal reserve commits order and one occupied slot',r['current']['state']=='offered' and sql(s,'SELECT occupied FROM courier_capacity WHERE courier_id=?',('c0',))[0]['occupied']==1)
    a=s.decide('ACCEPT','o0','a0',7,'c0')
    ok('business accept assigns without occupying twice',a['current']['state']=='assigned' and len(sql(s,'SELECT * FROM active_slot'))==1)
    reject('delivery cannot precede pickup',lambda:s.control('o0','a0',7,'DELIVER','c0','door-proof'),'CONTROLLED_HANDOFF_REQUIRED')
    p=s.control('o0','a0',7,'PICKUP','c0','shop-proof')
    d=s.control('o0','a0',7,'DELIVER','c0','door-proof')
    ok('normal pickup to delivery frees slot and advances generation',p['current']['state']=='picked_up' and d['current']['state']=='delivered' and d['current']['generation']==8 and not sql(s,'SELECT * FROM active_slot'))
    replay=s.decide('ACCEPT','o0','a0',7,'c0')
    ok('historic accept receipt retains current terminal state',replay['receipt']==a['receipt'] and replay['current']['state']=='delivered')
    c.now=999
    replay_offer=s.reserve('o0',7,'c0','a0',candidate_valid_until=0)
    ok('historic offer replay does not reactivate an expired or terminal assignment',replay_offer['receipt']==r['receipt'] and replay_offer['current']['state']=='delivered' and not sql(s,'SELECT * FROM active_slot'))
    reject('historical accept still validates authenticated courier',lambda:s.decide('ACCEPT','o0','a0',7,'c1'),'FORBIDDEN')
    reject('historical offer cannot change courier binding',lambda:s.reserve('o0',7,'c1','a0'),'ATTEMPT_BINDING')
    reject('duplicate proof cannot change evidence binding',lambda:s.control('o0','a0',7,'DELIVER','c0','other-proof'),'EVIDENCE_CONFLICT')
    invariant('normal path invariants',s)

    s,c=fixture(orders=3);offered(s,'occupied','o0')
    outcomes=race(lambda:s.reserve('o1',7,'c0','a1',candidate_valid_until=125),lambda:s.reserve('o2',7,'c0','a2',candidate_valid_until=125))
    ok('two orders compete for the last of two courier slots',sum(x['ok'] for x in outcomes)==1 and len(sql(s,'SELECT * FROM active_slot'))==2,outcomes)
    ok('capacity loser rematches rather than overbooking',[x['error'] for x in outcomes if not x['ok']]==['REMATCH'])
    invariant('last-slot race invariants',s)
    s,c=fixture();outcomes=race(lambda:s.reserve('o0',7,'c0','left',candidate_valid_until=125),lambda:s.reserve('o0',7,'c1','right',candidate_valid_until=125))
    ok('two couriers compete for one order',sum(x['ok'] for x in outcomes)==1 and len(sql(s,'SELECT * FROM active_slot'))==1,outcomes)
    invariant('same-order race invariants',s)

    for now in [119,120]:
        s,c=fixture();offered(s);c.now=now
        outcomes=race(lambda:s.decide('ACCEPT','o0','a0',7,'c0'),lambda:s.decide('EXPIRE','o0','a0',7))
        current=s.snapshot('o0');expected='assigned' if now==119 else 'pending_match'
        ok(f'accept/expiry share exact boundary at {now}',current['state']==expected and sum(x['ok'] for x in outcomes)==1,outcomes)
        ok(f'accept/expiry capacity agrees at {now}',len(sql(s,'SELECT * FROM active_slot'))==int(now==119))
        invariant(f'accept/expiry invariants at {now}',s)
    s,c=fixture();offered(s);c.now=119
    outcomes=race(lambda:s.decide('ACCEPT','o0','a0',7,'c0'),lambda:s.control('o0','a0',7,'CANCEL','customer-authorized','cancel-proof'))
    current=s.snapshot('o0')
    ok('accept versus cancel grants exactly one state transition',sum(x['ok'] for x in outcomes)==1 and current['state'] in ('assigned','cancelled'),outcomes)
    ok('accept/cancel capacity follows the winner',len(sql(s,'SELECT * FROM active_slot'))==int(current['state']=='assigned'))
    invariant('accept/cancel invariants',s)
    s,c=fixture();offered(s);c.now=120
    outcomes=race(lambda:s.decide('EXPIRE','o0','a0',7),lambda:s.control('o0','a0',7,'CANCEL','customer-authorized','cancel-proof'))
    ok('expire/cancel releases exactly once',sum(x['ok'] for x in outcomes)==1 and not sql(s,'SELECT * FROM active_slot'),outcomes)
    invariant('expire/cancel invariants',s)
    s,c=fixture();accepted(s)
    outcomes=race(lambda:s.control('o0','a0',7,'PICKUP','c0','pickup-proof'),lambda:s.control('o0','a0',7,'CANCEL','customer-authorized','cancel-proof'))
    ok('assigned cancellation cannot race ahead of custody verification',outcomes[0]['ok'] and not outcomes[1]['ok'] and s.snapshot('o0')['state']=='picked_up',outcomes)
    outcomes=race(lambda:s.control('o0','a0',7,'DELIVER','c0','door-proof'),lambda:s.control('o0','a0',7,'DELIVER','c0','door-proof'))
    ok('duplicate concurrent delivery returns one immutable receipt',all(x['ok'] for x in outcomes) and outcomes[0]['value']['receipt']==outcomes[1]['value']['receipt'] and len(sql(s,"SELECT * FROM outbox WHERE kind='DELIVER'"))==1)
    invariant('duplicate-delivery invariants',s)

    s,c=fixture();accepted(s);s.control('o0','a0',7,'PICKUP','c0','pickup-proof')
    reject('GPS or mere lease loss is not custody release',lambda:s.control('o0','a0',7,'REASSIGN','operations-authorized','gps-timeout'),'REVIEW')
    bad=VerifiedRelease('wrong-order','a0',7,True,'handoff')
    reject('release credential must bind current physical operation',lambda:s.control('o0','a0',7,'REASSIGN','operations-authorized','handoff',bad),'REVIEW')
    good=VerifiedRelease('o0','a0',7,True,'handoff')
    released=s.control('o0','a0',7,'REASSIGN','operations-authorized','handoff',good)
    ok('verified custody clear advances same order without resetting match budget',released['current']['generation']==8 and released['current']['attempt_count']==1 and released['current']['match_deadline']==220)
    s.reserve('o0',8,'c1','a-new',candidate_valid_until=125)
    old=s.decide('ACCEPT','o0','a0',7,'c0')
    ok('old accepted receipt reports new current attempt without restoring old rights',old['current']['current_attempt']=='a-new' and old['current']['generation']==8)
    reject('old delivery cannot alter the new attempt',lambda:s.control('o0','a0',7,'DELIVER','c0','old-door'),'STALE')
    old_pickup=s.control('o0','a0',7,'PICKUP','c0','pickup-proof')
    ok('old pickup replay remains history while new assignment stays offered',old_pickup['current']['current_attempt']=='a-new' and old_pickup['current']['state']=='offered')
    invariant('controlled reassignment invariants',s)

    s,c=fixture()
    try:s.reserve('o0',7,'c0','crash',crash='after_slot',candidate_valid_until=125)
    except RuntimeError:pass
    else:raise AssertionError('reserve crash missing')
    ok('reserve partial slot write rolls back state, occupancy, attempt and outbox',s.snapshot('o0')['state']=='pending_match' and not sql(s,'SELECT * FROM active_slot') and not sql(s,'SELECT * FROM attempts') and len(sql(s,'SELECT * FROM outbox'))==1)
    accepted(s);s.control('o0','a0',7,'PICKUP','c0','p')
    try:s.control('o0','a0',7,'DELIVER','c0','d',crash='after_release')
    except RuntimeError:pass
    else:raise AssertionError('release crash missing')
    ok('release partial mutation rolls back physical state and slot together',s.snapshot('o0')['state']=='picked_up' and len(sql(s,'SELECT * FROM active_slot'))==1 and not sql(s,"SELECT * FROM operation_receipt WHERE action='DELIVER'"))
    invariant('rollback invariants',s)

    s,c=fixture();c.now=126
    reject('Routing delay consumes original candidate validity',lambda:s.reserve('o0',7,'c0','stale-route',candidate_valid_until=125),'STALE_CANDIDATE')
    ok('Routing-expired candidate leaves no durable offer',not sql(s,'SELECT * FROM attempts') and s.snapshot('o0')['attempt_count']==0)
    s,c=fixture();holder=s.connect();holder.execute('BEGIN IMMEDIATE')
    entered=threading.Event()
    def blocked_reserve():
        entered.set();return s.reserve('o0',7,'c0','lock-wait',candidate_valid_until=125)
    with concurrent.futures.ThreadPoolExecutor(1) as pool:
        f=pool.submit(blocked_reserve);entered.wait(2);time.sleep(.04)
        ok('reservation really waits behind another SQLite writer',not f.done())
        c.now=126;holder.commit();holder.close()
        try:f.result()
        except Conflict as e:ok('post-lock time rejects candidate expired during lock wait',str(e)=='STALE_CANDIDATE')
        else:raise AssertionError('stale candidate crossed lock wait')
    invariant('candidate wait invariants',s)
    s,c=fixture();c.now=125
    ok('exact candidate upper boundary is inclusive',s.reserve('o0',7,'c0','boundary',candidate_valid_until=125)['current']['state']=='offered')
    s,c=fixture();offered(s);holder=s.connect();holder.execute('BEGIN IMMEDIATE')
    entered=threading.Event()
    def blocked_accept():
        entered.set();return s.decide('ACCEPT','o0','a0',7,'c0')
    with concurrent.futures.ThreadPoolExecutor(1) as pool:
        f=pool.submit(blocked_accept);entered.wait(2);time.sleep(.04);c.now=120;holder.commit();holder.close()
        try:f.result()
        except Conflict as e:ok('accept samples time after an actual lock wait across deadline',str(e)=='EXPIRED')
        else:raise AssertionError('expired accept survived lock wait')

    s,c=fixture()
    for attempt in range(3):
        gen=s.snapshot('o0')['generation'];s.reserve('o0',gen,'c0',f'a-{attempt}',candidate_valid_until=c.now+25)
        c.now+=20;s.decide('EXPIRE','o0',f'a-{attempt}',gen);c.now+=5
    ok('three unanswered attempts exhaust fixed match budget',s.snapshot('o0')['state']=='failed' and s.snapshot('o0')['attempt_count']==3 and s.snapshot('o0')['match_deadline']==220)
    ok('recovery cannot recreate failed work',s.recover()==[] and not sql(s,'SELECT * FROM active_slot'))
    invariant('attempt exhaustion invariants',s)
    s,c=fixture();ok('queue loss recovers durable pending generation',s.recover()==[('o0',7)])
    c.now=220;s.recover();s.recover()
    ok('deadline scanner records one durable failure event',s.snapshot('o0')['state']=='failed' and len(sql(s,"SELECT * FROM outbox WHERE kind='FAILURE'"))==1)
    s,c=fixture();offered(s)
    reject('unknown create cannot refund around an active offer',lambda:s.cancel_creation('paid-0'),'REVIEW_CURRENT_ASSIGNMENT')
    ok('refused compensation did not install a fence or intent',not sql(s,'SELECT * FROM creation_fence') and not sql(s,"SELECT * FROM outbox WHERE kind='COMPENSATE'"))
    counter+=1;c=Clock();s=Store(Path(tmp,f'empty-{counter}.db'),c);s.install();s.cancel_creation('unknown-paid')
    reject('absence compensation fences later creation identity',lambda:s.create('late','unknown-paid'),'CREATION_FENCED')
    s.cancel_creation('unknown-paid');ok('compensation fence retry retains one intent',len(sql(s,"SELECT * FROM outbox WHERE kind='COMPENSATE'"))==1)
    counter+=1;s=Store(Path(tmp,f'creation-race-{counter}.db'),c);s.install()
    outcomes=race(lambda:s.create('o-race','same-paid'),lambda:s.cancel_creation('same-paid'))
    rows=sql(s,'SELECT * FROM orders')
    ok('create/compensate race cannot leave dispatchable fulfillment behind fence',not rows or rows[0]['state']=='cancelled',outcomes)
    reject('creation remains fenced after either race order',lambda:s.create('late-again','same-paid'),'CREATION_FENCED')

    s,c=fixture();e1=s.start_session('c0');s.report('c0',e1,41,100)
    original=s.location('c0');c.now=110;s.report('c0',e1,41,100);s.report('c0',e1,40,110)
    ok('duplicate/reordered points never refresh capture, receipt or expiry',s.location('c0')==original)
    reject('higher sequence with stale capture is not fresh',lambda:s.report('c0',e1,42,50),'INVALID_POINT')
    c.now=125;ok('candidate accepts conservative age upper boundary',s.candidate('c0'))
    c.now=126;ok('candidate rejects stale capture while cleanup TTL remains',not s.candidate('c0') and s.location('c0')['expires']==160)
    c.now=161;e2=s.start_session('c0')
    ok('epoch survives point TTL and advances on reconnect',e2==e1+1 and s.location('c0')['captured'] is None and s.location('c0')['seq']==-1)
    ok('old disconnect cannot close newer epoch',s.disconnect('c0',e1)==0)
    reject('old epoch upload rejected after reconnect',lambda:s.report('c0',e1,99,161),'STALE_SESSION')
    s.report('c0',e2,0,161,cell='A');ok('new epoch can restart sequence at zero',s.candidate('c0'))
    ok('lost projection event leaves no false authoritative write',not sql(s,'SELECT * FROM cell_member'))
    ok('periodic repair builds current valid membership',s.reconcile_location()==1 and sql(s,'SELECT * FROM cell_member')[0]['cell']=='A')
    s.report('c0',e2,1,161,cell='B')
    ok('old projection event cannot remigrate current courier',not s.project('c0',e2,0) and sql(s,'SELECT * FROM cell_member')[0]['cell']=='A')
    ok('current projection migrates membership once',s.project('c0',e2,1) and [r['cell'] for r in sql(s,'SELECT * FROM cell_member')]==['B'])
    c.now=162;s.report('c0',e2,2,162,cell='C');s.reconcile_location()
    ok('dropped movement is repaired from latest detail', [r['cell'] for r in sql(s,'SELECT * FROM cell_member')]==['C'])
    s.disconnect('c0',e2);ok('current disconnect invalidates candidate',not s.candidate('c0'))
    e3=s.start_session('c0',bounded=False)
    reject('unbounded device time cannot make candidate point',lambda:s.report('c0',e3,0,162),'INVALID_POINT')
    for delta,expected in [(-6,False),(-5,True),(25,True),(26,False)]:
        ok(f'pure freshness boundary delta={delta}',fresh(100,100-delta,5)==expected)
    for kwargs in [{'accuracy':51},{'accuracy':math.nan},{'lat':91},{'lon':181},{'lat':math.inf}]:
        data={'accuracy':5,'lat':31,'lon':121};data.update(kwargs)
        ok('invalid point '+str(kwargs),not fresh(100,100,**data))

    context=('a-new',8,'before-pickup','origin-seq2','shop','home','traffic-v2')
    live=(4,8,130,context);cache=(7,10,140,context)
    ok('ETA overlaps preparation and travel',eta(True,False,6,live,None,100,context)=={'minutes':14,'confidence':'normal'})
    ok('picked-up ETA uses remaining dropoff',eta(True,True,6,live,None,100,context)['minutes']==8)
    ok('valid cache fallback is low-confidence',eta(True,False,6,None,cache,100,context)=={'minutes':17,'confidence':'low'})
    ok('expired live route cannot become zero-duration success',eta(True,False,6,live,None,130,context) is None)
    ok('wrong assignment/phase context rejected',eta(True,False,6,(4,8,130,('old',)),None,100,context) is None)
    ok('stale point disables both live and cache ETA',eta(False,False,6,live,cache,100,context) is None)
    ok('missing route element disables ETA',eta(True,False,6,None,None,100,context) is None)
    report['passed']=True
except BaseException as e:
 report.update(passed=False,failure=repr(e));raise
finally:
 report['count']=len(checks)
 report['files']={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (ROOT/'examples/ch27').glob('*') if p.is_file()}
 (ROOT/'docs/reviews/ch27-independent-model-results.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
 print(json.dumps({'passed':report.get('passed'),'count':len(checks)}))
