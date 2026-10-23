"""Independent finite scenarios and arithmetic; no DB/network guarantee."""
from itertools import combinations
from pathlib import Path
import json
owners=set('ABC'); quorums=list(map(set,combinations('ABC',2)))
assert all(w&r for w in quorums for r in quorums)
assert not set('AD') & set('BC')
# Version ordering is explicit; a failed W=2 write at A can regress across reads.
replicas={'A':(200,'new'),'B':(100,'old'),'C':(100,'old')}
assert max(replicas[n] for n in 'AB') > max(replicas[n] for n in 'BC')
# Normal completed write on B,C is observed by every strict two-owner read.
replicas={'A':(100,'old'),'B':(200,'new'),'C':(200,'new')}
assert all(max(replicas[n] for n in read)==(200,'new') for read in quorums)
# ACK identity is a tuple; count each fixed physical owner at most once.
def counts(events):
 return len({node for node,epoch,key,mid,durable in events
             if node in owners and (epoch,key,mid)==(7,'k','immutable-m') and durable})
base=('A',7,'k','immutable-m',True)
assert counts([base,base])==1
for bad in [('B',8,'k','immutable-m',True),('B',7,'other','immutable-m',True),('B',7,'k','other',True),('D',7,'k','immutable-m',True),('B',7,'k','immutable-m',False)]:
 assert counts([base,bad])==1
assert counts([base,('B',7,'k','immutable-m',True)])==2
# Tombstone expiry alone does not establish convergence.
assert max((300,'DEL'),(200,'old'))==(300,'DEL')
assert max((0,'ABSENT'),(200,'old'))==(200,'old')
assert max((300,'DEL'),(400,'retimestamped-old'))==(400,'retimestamped-old')
calculations={
 'value_bytes':10**8*10**3, 'replicated_bytes':10**8*10**3*3,
 'planned_capacity_bytes':10**8*10**3*3*2/.8,
 'write_destinations_bytes_per_s':10**4*10**3*3,
 'read_replica_bytes_per_s':5*10**4*10**3*2,
 'fixed_hot_replica_reads_per_s':(50000-50000*.2)*2/10+50000*.2,
 'balanced_hot_replica_reads_per_s':(50000-50000*.2)*2/10+50000*.2*2/3,
 'sst_output_bytes_per_s':10**4*10**3*3*10,
 'extra_bloom_probes':10*.01,'any_false_positive':1-(1-.01)**10,
 'bloom_bytes_three_replicas':10**8*10/8*3,
 'tombstone_days':864000/(24*3600),'retention_margin':7-(2+1)}
assert calculations['planned_capacity_bytes']==750*10**9
assert calculations['fixed_hot_replica_reads_per_s']==18000
assert round(calculations['any_false_positive']*100,2)==9.56
assert calculations['bloom_bytes_three_replicas']==375*10**6
print(json.dumps(calculations,indent=2))
print('PASS: strict/sloppy overlap; normal/failed-write reads; ACK identity and deduplication; tombstone resurrection; independent arithmetic')
