from fractions import Fraction as F
from pathlib import Path
import hashlib,json
values=[
 ('planned_per_App',1000*F(60,100),600),
 ('normal_minimum',F(6000,600),10),
 ('twelve_normal_budget',12*600,7200),
 ('single_loss_apps',12-1,11),
 ('single_loss_budget',11*600,6600),
 ('single_loss_planned_utilization',F(6000,6600),F(10,11)),
 ('single_loss_headroom',6600-6000,600),
 ('rollout_and_loss_apps',12-1-1,10),
 ('rollout_and_loss_budget',10*600,6000),
 ('shared_machine_apps_lost',12//3,4),
 ('shared_machine_survivors',12-4,8),
 ('shared_machine_budget',8*600,4800),
 ('shared_machine_shortfall',6000-4800,1200),
 ('shared_machine_shed_fraction',F(1200,6000),F(1,5)),
 ('retry10pct_attempts',6000*F(110,100),6600),
 ('single_flow_utilization',F(1200,1000),F(6,5)),
 ('two_App_raw_total',2*1000,2000),
 ('Little_mean_inflight',6000*F(50,1000),300),
 ('request_payload_B_per_s',6000*2000,12000000),
 ('response_payload_B_per_s',6000*20000,120000000),
 ('response_payload_Mbit_per_s',F(120000000*8,1000000),960),
 ('response_proxy_IO_B_per_s',2*120000000,240000000),
 ('combined_rx_B_per_s',12000000+120000000,132000000),
 ('combined_tx_B_per_s',120000000+12000000,132000000),
 ('per_direction_Gbit_per_s',F(132000000*8,1000000000),F(132,125)),
 ('raw_session_copy_B',1000000*256,256000000),
 ('two_raw_session_copies_B',2*1000000*256,512000000),
 ('session_reads_per_s',6000*1,6000),
 ('probe_budget_s',2*2+F(3,10)+F(2,10),F(9,2)),
 ('equal_load_per_App',F(6000,12),500),
 ('uniform_exposed_attempts',500*F(9,2),2250),
 ('one_table_B',65537*4,262148),
 ('one_table_KiB',F(65537*4,1024),F(65537,256)),
 ('two_table_B',65537*4*2,524296),
 ('two_table_KiB',F(65537*4*2,1024),F(65537,128)),
 ('thousand_tables_decimal_MB',F(65537*4*1000,1000000),F(65537,250)),
]
for name,actual,expected in values:
 assert actual==expected,(name,actual,expected)
report={'sourceSha256':hashlib.sha256(Path('chapters/ch39.html').read_bytes()).hexdigest(),'checks':len(values),'numbers':[{'name':n,'exact':str(a),'approx':float(a)} for n,a,e in values], 'scope':['All are declared A1–A12 arithmetic, not measured capacities or tail guarantees.','Read arrival/attempt counts, mean/tail, per-direction bandwidth/full duplex, independent process/machine failure domains were checked separately.','Probe bound requires fixed start cadence, no jitter and bounded propagation; 2250 exposed attempts is a uniform estimate, not a random-routing worst bound.','2.112 Gbit/s aggregate IO does not imply a single-link requirement; each direction is 1.056 Gbit/s before overhead.']}
Path('docs/reviews/ch39-independent-numeric-results.json').write_text(json.dumps(report,indent=2)+'\n')
print(f'PASS {len(values)} independent arithmetic checks')
