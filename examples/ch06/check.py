from pathlib import Path
import re,html,json,math
root=Path(__file__).resolve().parents[2]
s=(root/'chapters/ch06.html').read_text()
count=0
for source,block in re.findall(r'<pre[^>]*data-source="([^"]+)"[^>]*><code>(.*?)</code></pre>',s,re.S):
 parts=source.split(':');content=(root/'examples/ch06'/parts[0]).read_text()
 if len(parts)>1:
  content=re.search(r'    // BEGIN '+parts[1]+r'\n(.*?)    // END '+parts[1],content,re.S).group(1)
  content='\n'.join(line[4:] if line.startswith('    ') else line for line in content.splitlines())
 assert html.unescape(block).strip()==content.strip(),source
 count+=1
assert count==4
numbers={
 'raw_GB':100_000_000*1000/1e9,'replicated_GB':100*3,'SST_GB':100*3*2,'capacity_GB':600/.8,
 'write_MBps':10000*1000/1e6,'replica_MBps':10000*1000*3/1e6,'replica_Mbps':30*8,
 'client_read_MBps':50000*1000/1e6,'replica_read_MBps':50000*2*1000/1e6,
 'uniform_replica_reads':50000*2/10,'hot_fixed_reads':40000*2/10+10000,
 'hot_balanced_reads':40000*2/10+10000*2/3,'hot_over_budget':18000/12000-1,
 'SST_write_MBps':10*3*10,'WAL_plus_SST_MBps':10*3*11,
 'bloom_extra_files':10*.01,'bloom_any_false_positive':1-.99**10,
 'bloom_MB':100_000_000*10/8/1e6,'three_bloom_MB':100_000_000*10/8/1e6*3,
 'grace_days':864000/86400,'repair_margin_days':7-(2+1),'quorum_overlap':2+2-3}
# Enumerate actual sets, not just the overlap formula.
owners={'A','B','C'}
from itertools import combinations
pairs=[set(x) for x in combinations(owners,2)]
assert min(len(w&r) for w in pairs for r in pairs)==1
assert not ({'A','D'} & {'B','C'})
assert numbers['hot_fixed_reads']==18000 and numbers['capacity_GB']==750
print(json.dumps({'source_parity_blocks':count,'numbers':numbers,'strict_pairs_checked':9,'sloppy_overlap':0},indent=2))
# Deterministic event traces for the pseudocode contract, not a network simulator.
def outcome(events):
 acked=set()
 for node,epoch,mid,durable in events:
  if node in owners and epoch==7 and mid=='m' and durable: acked.add(node)
  if len(acked)>=2:return 'ACKNOWLEDGED'
 return 'UNKNOWN'
assert outcome([('A',7,'m',True),('B',7,'m',True)])=='ACKNOWLEDGED'
assert outcome([('A',7,'m',True),('A',7,'m',True)])=='UNKNOWN'
assert outcome([('A',7,'m',True),('D',7,'m',True)])=='UNKNOWN'
assert outcome([('A',7,'m',True),('B',8,'m',True)])=='UNKNOWN'
assert outcome([('A',7,'m',True),('B',7,'other',True)])=='UNKNOWN'
assert outcome([('A',7,'m',True),('B',7,'m',False)])=='UNKNOWN'
# B may have persisted but no event arrives: outcome remains unknown.
assert outcome([('A',7,'m',True)])=='UNKNOWN'
print('PASS 7 coordinator event traces: duplicate, fallback, epoch, identity, durability, ACK loss')
