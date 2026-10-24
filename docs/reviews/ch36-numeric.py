"""Independent page arithmetic: Fraction/Decimal, no imports from example code."""
from fractions import Fraction as F
import json
values={}
def record(name, actual, expected):
    assert actual == expected, (name, actual, expected)
    values[name]=str(actual)
record('majority_N3',3//2+1,2)
record('quorum_overlap',2+2-3,1)
record('early_ms',2+1,3)
record('parallel_rtt4_ms',2+max(1,4+1),7)
record('parallel_rtt80_ms',2+max(1,80+1),83)
record('serial_rtt4_ms',2+1+4+1,8)
record('serial_rtt80_ms',2+1+80+1,84)
record('budget_room_ms',20-7,13)
record('budget_excess_ms',83-20,63)
E=10_000_000;B=6_000;q=F(1,1000)
record('snapshot_allowed',E*q,10000)
record('snapshot_remaining',E*q-B,4000)
record('snapshot_remaining_fraction',(E*q-B)/(E*q),F(2,5))
record('snapshot_SLI_percent',F(E-B,E)*100,F(4997,50))
minutes=30*24*60;seconds=minutes*60
record('window_minutes',minutes,43200)
record('three_nines_minutes',minutes*F(1,1000),F(216,5))
record('four_nines_minutes',minutes*F(1,10000),F(108,25))
record('five_nines_seconds',seconds*F(1,100000),F(648,25))
for badq,allowed in [(F(1,1000),10000),(F(1,10000),1000),(F(1,100000),100)]:record('events_'+str(badq),E*badq,allowed)
steady=seconds*1000;allowed=steady*q
record('steady_E',steady,2592000000)
record('steady_allowed',allowed,2592000)
record('incident_10pct',1000*1200*F(1,10),120000)
record('incident_full',1000*1200,1200000)
record('tenfold_incident_E',steady+9000*1200,2602800000)
record('tenfold_incident_allowed',(steady+9000*1200)*q,2602800)
record('tenfold_bad',10000*1200,12000000)
for name,actual,expected in [('steady_10pct_spend',F(120000,2592000)*100,'4.63'),('steady_full_spend',F(1200000,2592000)*100,'46.30'),('tenfold_spend',F(12000000,2602800)*100,'461.04')]:
    formatted=f'{float(actual):.2f}';assert formatted==expected;values[name]=formatted+'%'
record('series_percent',F(999,1000)**2*100,F(998001,10000))
record('series_burn',(1-F(999,1000)**2)/q,F(1999,1000))
record('parallel_percent',(1-F(1,1000)**2)*100,F(999999,10000))
record('burn1pct',F(1,100)/q,10)
record('full_budget_days',F(30,10),3)
record('40pct_days',30*F(2,5)/10,F(6,5))
record('fast_full_budget_spend',F(72,5)/720,F(1,50))
record('slow_full_budget_spend',F(6*6,720),F(1,20))
record('fast_bad_percent',F(72,5)*q*100,F(36,25))
record('slow_bad_percent',6*q*100,F(3,5))
record('actual_gate_burn',F(1441,100000)/q,F(1441,100))
print(json.dumps({'passed':True,'checks':len(values),'values':values},indent=2))
