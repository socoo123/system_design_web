#!/usr/bin/env python3
import sys
sys.dont_write_bytecode=True
import importlib.util,json,tempfile,itertools,hashlib,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('ch23_author_model',ROOT/'examples/ch23/model.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
checks=[]
def check(name,ok,details=None):
 assert ok,name
 checks.append({'name':name,'passed':True,'details':details})
def reject(name,call):
 try:call()
 except module.Conflict as e:check(name,True,str(e));return
 raise AssertionError(name)
def event(seq=11,score=812,second=71,match='match-A',kind='RESULT',revision=1,season='fall',player='000000000041'):
 return dict(game='g1',season=season,player=player,match=match,kind=kind,revision=revision,seq=seq,score=score,second=second,comparator='score-time-id-v1')
def rows(m,query):
 with m.connect() as c:return c.execute(query).fetchall()
with tempfile.TemporaryDirectory(prefix='ch23-independent-model-') as tmp:
 tmp=Path(tmp);m=module.Model(tmp/'normal.db');m.initialize();m.seed(season='fall',player='000000000041',region='r-west')
 original=m.settle(event())
 check('normal committed receipt and both destination intents',original=={'status':'COMMITTED','version':11,'score':812,'second':71} and len(rows(m,'SELECT * FROM outbox'))==2)
 check('retry resolves exact original receipt',m.settle(event())==original)
 reject('same settlement identity changed source sequence conflicts',lambda:m.settle(event(seq=12)))
 reject('same identity changed achieved time conflicts',lambda:m.settle(event(second=72)))
 reject('authenticated game mismatch rejected before replay',lambda:m.settle(event(),actor_game='g-other'))
 newer=event(seq=13,score=1333,second=99,match='match-B')
 try:m.settle(newer,lose_ack=True)
 except module.UnknownCommit:pass
 else:raise AssertionError('lost response not injected')
 check('lost COMMIT reply recovers same higher-version result',m.settle(newer)['version']==13 and len(rows(m,'SELECT * FROM outbox'))==4)
 check('old receipt immutable after current version advances',m.settle(event())==original)
 correction=event(seq=14,score=17,second=111,match='match-B',kind='CORRECTION',revision=2)
 check('higher revision may lower absolute score',m.settle(correction)['score']==17)
 stale=m.settle(event(seq=12,score=999,second=90,match='late-complete-prefix'))
 check('older full-prefix snapshot cannot undo correction',stale['status']=='REJECTED_STALE' and rows(m,'SELECT version,score,second FROM scores')==[(14,17,111)])
 before=rows(m,'SELECT * FROM outbox')
 reject('precommit injected failure is not accepted',lambda:m.settle(event(seq=15,score=40,second=120,match='rollback'),fail_before_commit=True))
 check('precommit failure preserves prior score and destination set',rows(m,'SELECT * FROM outbox')==before and rows(m,'SELECT version,score,second FROM scores')==[(14,17,111)])
 m.seed(season='winter',player='000000000041',region='r-west')
 check('season is part of identity even for same match/revision',m.settle(event(season='winter'))['status']=='COMMITTED')
 # Directly invoke fixed source for every ordering of one valid authoritative prefix.
 permutations=[]
 commands=[event(seq=31,score=812,second=71),event(seq=32,score=1234,second=99,match='match-B'),event(seq=33,score=812,second=121,match='match-B',kind='CORRECTION',revision=2)]
 for order in itertools.permutations(range(3)):
  db=module.Model(tmp/('permutation-'+''.join(map(str,order))+'.db'));db.initialize();db.seed(season='fall',player='000000000041')
  receipts=[db.settle(commands[i]) for i in order]
  final=rows(db,'SELECT version,score,second FROM scores')
  check('P1 new-input full snapshot convergence '+str(order),final==[(33,812,121)],{'final':final,'receipts':receipts})
  permutations.append({'order':order,'final':final})
 # Re-run the original reported P1 independently against the revised source.
 original_states=[]
 for order in [(0,1,2),(0,2,1)]:
  db=module.Model(tmp/('original-'+''.join(map(str,order))+'.db'));db.initialize();db.seed(season='fall',player='000000000041')
  original_commands=[event(seq=1,score=100,second=10),event(seq=2,score=200,second=20,match='B'),event(seq=3,score=100,second=30,match='B',kind='CORRECTION',revision=2)]
  for i in order:db.settle(original_commands[i])
  original_states.append(rows(db,'SELECT version,score,second FROM scores'))
 check('original P1 ordered/reordered both now v3 score100 time30',original_states==[[(3,100,30)],[(3,100,30)]],original_states)
 z=module.Model(tmp/'zero.db');z.initialize();z.seed(season='fall',player='000000000041')
 check('first valid zero uses authoritative real second',z.settle(event(score=0,second=321))['second']==321)
 same=z.settle(event(seq=12,score=0,second=321,match='zero-same'))
 check('source-preserved unchanged zero time is carried unchanged',same['second']==321)
 # The receiver must also replace a time supplied by the new authoritative snapshot;
 # local preservation would mask a source fact instead of implementing the stated contract.
 check('receiver does not infer time even when current numeric score matches',z.settle(event(seq=13,score=0,second=400,match='zero-authority-correction',kind='CORRECTION',revision=2))['second']==400)
 W=m.close_season(season='fall')
 check('closed season finite frontier includes both destination identities',len(W)==6)
 check('closed season can replay known original',m.settle(event())==original)
 closed=m.settle(event(seq=99,score=1,second=600,match='late-after-fence'))
 check('new identity after season fence cannot score',closed['status']=='REJECTED_CLOSED')
 with m.connect() as c:c.execute("UPDATE outbox SET delivered=1 WHERE board='g1:fall:global'")
 outstanding=rows(m,"SELECT board,version FROM outbox WHERE game='g1' AND season='fall' AND delivered=0 ORDER BY version")
 check('all global ACKs leave regional destinations pending',len(outstanding)==3 and all(r[0].endswith('r-west') for r in outstanding),outstanding)
 # High version delivered cannot hide an earlier real task gap.
 with m.connect() as c:c.execute("UPDATE outbox SET delivered=1 WHERE game='g1' AND season='fall' AND version=14")
 check('highest ACK version is insufficient for continuous delivered set',len(rows(m,"SELECT * FROM outbox WHERE game='g1' AND season='fall' AND delivered=0"))==2)

arithmetic={'writes':10_000_000*5/86400*5,'reads':10_000_000*3/86400*5,'projection':2*10_000_000*5/86400*5,'headReads':.8*10_000_000*3/86400*5,'memoryBytes':20_000_000*160*2,'rebuildUsingRoundedArrival':20_000_000/(100000-5787),'bucketsAt10x':math.ceil((10_000_000*5/86400*5*10)/10000),'maxC':1_000_000*3_000_001+3_000_000}
check('arithmetic and encoding independently recomputed',arithmetic['memoryBytes']==6_400_000_000 and arithmetic['bucketsAt10x']==3 and arithmetic['maxC']==3_000_004_000_000 and abs(arithmetic['rebuildUsingRoundedArrival']-212.2849)<.01,arithmetic)
result={'passed':True,'checks':checks,'permutations':permutations,'arithmetic':arithmetic,'modelSha256':hashlib.sha256((ROOT/'examples/ch23/model.py').read_bytes()).hexdigest(),'limits':['Actual author SQLite Model called; no PostgreSQL row-lock/standby/CDC controller experiment','Complete authoritative-prefix content and time correctness remain an explicit upstream dependency','Finite outbox identity/ACK queries check stated frontier obligations, not a production checkpoint implementation']}
(ROOT/'docs/reviews/ch23-independent-model-results.json').write_text(json.dumps(result,indent=2)+'\n')
print('independent model/arithmetic checks',len(checks))
