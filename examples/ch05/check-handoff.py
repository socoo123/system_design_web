"""Executable teaching contract model, not a database or distributed fault test."""
from copy import deepcopy

class Rejected(Exception): pass
class Shard:
    def __init__(self, epoch, state='ACTIVE'):
        self.epoch, self.state = epoch, state
        self.data, self.receipts, self.log = {}, {}, []
        self.plan = None
    def serve(self, epoch, operation=None, key='k', value=None):
        # One serialized durable transition is ASSUMED by this model.
        if self.state != 'ACTIVE' or epoch != self.epoch: raise Rejected('RETRY_EPOCH')
        if operation is None: return self.data.get(key)
        if operation in self.receipts:
            payload, result = self.receipts[operation]
            if payload != (key, value): raise Rejected('intent conflict')
            return result
        if value is None: self.data.pop(key, None)
        else: self.data[key] = value
        self.receipts[operation] = ((key, value), 'OK')
        self.log.append((operation,key,value))
        return 'OK'
    def freeze(self, plan):
        if self.state == 'FROZEN' and self.plan == plan: return len(self.log)
        if self.state != 'ACTIVE': raise Rejected('wrong phase')
        self.state, self.plan = 'FROZEN', plan
        return len(self.log)

class Control:
    def __init__(self): self.state=('ACTIVE',7)
    def reserve(self, plan):
        if self.state != ('ACTIVE',7): raise Rejected('competing plan')
        self.state=('COPYING',plan)
    def commit(self, plan, barrier):
        if self.state != ('COPYING',plan): raise Rejected('wrong plan')
        self.state=('COMMITTED',8,plan,barrier)

checks=[]
def check(ok,name):
    assert ok,name
    checks.append(name)
def rejects(action,name):
    try: action()
    except Rejected: check(True,name)
    else: raise AssertionError(name)

plan=('range:(10,25]',7,8,'S1','S3','op-001')
control=Control();control.reserve(plan)
rejects(lambda:control.reserve(('competing',)), 'one durable plan wins range reservation')
source=Shard(7);source.serve(7,'create','k',1)
snapshot=deepcopy(source)
source.serve(7,'update','k',2) # committed after snapshot, before freeze
source.serve(7,'gone','deleted',10)
source.serve(7,'delete','deleted',None)
barrier=source.freeze(plan)
check(barrier==4,'freeze barrier includes all pre-freeze writes and deletion')
rejects(lambda:source.serve(7,'late','k',3),'prechecked epoch cannot commit after freeze')
rejects(lambda:source.serve(7), 'frozen old owner rejects reads too')
check(source.freeze(plan)==barrier,'same-plan freeze replay keeps barrier')
restored=deepcopy(source)
rejects(lambda:restored.serve(7,'restart','k',4),'restart restores fence in durable-state model')
candidate=Shard(8,'STAGING')
candidate.data=deepcopy(snapshot.data);candidate.receipts=deepcopy(snapshot.receipts)
for op,key,value in source.log[len(snapshot.log):barrier]:
    if value is None:candidate.data.pop(key,None)
    else:candidate.data[key]=value
    candidate.receipts[op]=deepcopy(source.receipts[op])
check(candidate.data==source.data and candidate.receipts==source.receipts,'catch-up transfers value, deletion and retry receipt')
rejects(lambda:candidate.serve(8), 'new owner rejects premature requests')
rejects(lambda:control.commit(('other plan',),barrier),'different plan cannot commit prepared candidate')
control.commit(plan,barrier)
check(control.state==('COMMITTED',8,plan,barrier),'control commit binds epoch, plan and final barrier')
# Crash here permits unavailability, not reactivation of the source.
rejects(lambda:source.serve(7), 'commit-to-activate crash window keeps old owner fenced')
candidate.state='ACTIVE'
check(candidate.serve(8)==2,'normal migrated read returns concurrent v2')
check(candidate.serve(8,'update','k',2)=='OK' and not candidate.log,'lost ACK retry uses transferred receipt, no second mutation')
rejects(lambda:candidate.serve(8,'update','k',999),'same operation with different payload rejected')
candidate.serve(8,'new','k',5)
rejects(lambda:source.serve(7),'old Router cannot read stale value after new write')
check(candidate.serve(8)==5,'refreshed Router reads new owner')
# Demonstrate what a precheck-only design would lose, without accepting it.
unsafe_old=deepcopy(source);unsafe_new=deepcopy(candidate)
unsafe_old.data['k']=99
check(unsafe_new.data['k']!=unsafe_old.data['k'],'unsafe post-freeze commit creates divergence: counterexample')
for x in checks:print('PASS',x)
print(f'PASS {len(checks)} contract traces; serialization/durability assumed, no network fault injection')
