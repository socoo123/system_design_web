from fractions import Fraction as F
from pathlib import Path
import json
values={}
def ck(name,value,expected):
 assert value==expected,(name,value,expected)
 values[name]=str(value)
ck('logical_model_per_second',20*5,100)
ck('logical_model_per_minute',20*5*60,6000)
ck('tool_per_second',20*3,60)
ck('physical_model_per_second',100*F(11,10),110)
ck('tokens_per_minute',110*60*4000,26400000)
ck('no_retry_TPM',100*60*4000,24000000)
ck('normal_active_seconds',5*2+3*F(3,10)+8*F(2,100),F(553,50))
ck('normal_mean_active',20*F(553,50),F(1106,5))
ck('extra_attempts_per_run',5*F(1,10),F(1,2))
ck('retry_active_seconds',F(553,50)+F(1,2)*2,F(603,50))
ck('retry_mean_active',20*F(603,50),F(1206,5))
ck('parked_runs',20*F(3,10)*300,1800)
ck('max_steps_seconds',12*2+8*F(3,10)+20*F(2,100),F(134,5))
ck('max_steps_mean_active',20*F(134,5),536)
ck('max_steps_excess_over_320',536-320,216)
ck('delta_writes_per_second',20*8,160)
ck('delta_MB_per_second',F(160*2000,10**6),F(8,25))
ck('delta_GB_per_day',F(160*2000*86400,10**9),F(3456,125))
ck('seven_days_two_copies_GB',F(160*2000*86400*7*2,10**9),F(48384,125))
ck('max_total_compensation_calls',8*2,16)
Path('docs/reviews/ch34-independent-numeric-results.json').write_text(json.dumps({'passed':True,'checks':len(values),'values':values},indent=2)+'\n')
print('independent numeric',len(values),'passed')
