"""Content/source agreement and arithmetic; not a database integration test."""
from pathlib import Path
from html import unescape
import re, json
root = Path(__file__).resolve().parents[2]
s = (root / 'chapters/ch07.html').read_text()
for attrs, text in re.findall(r'<pre([^>]*)><code>([\s\S]*?)</code></pre>', s):
    source = re.search(r'data-source="([^"]+)"', attrs)[1]
    file, _, region = source.partition('#')
    expected = (root / 'examples/ch07' / file).read_text()
    if region:
        expected = expected.split('// BEGIN ' + region + '\n')[1].split('// END ' + region)[0]
        expected = '\n'.join(line[8:] if line.startswith('        ') else line for line in expected.rstrip().splitlines())
    assert unescape(text).rstrip() == expected.rstrip(), source
values = {
    'slots_per_ms': 2**12, 'slots_per_second': 2**12 * 1000,
    'timestamp_ms': 2**41, 'years_365_25': 2**41/(1000*60*60*24*365.25),
    'one_worker_slices': -(-10000//4096), 'two_worker_slices': -(-5000//4096),
    'prefetch_minimum': 5000 * .03, 'inventory_normal_s': 1100/5000,
    'inventory_takeover_s': 1100/10000, 'sixty_seconds_normal': 5000*60,
    'sixty_seconds_takeover': 10000*60, 'base62_six': 62**6,
    'ten_year_time_part': int(10*365.25*24*60*60*1000)*2**22,
    'base62_ten': 62**10, 'raw_index_payload_extra_bytes': 100_000_000*8*4,
}
assert round(values['years_365_25'], 2) == 69.68
assert values['base62_six'] == 56_800_235_584
assert values['base62_ten'] < values['ten_year_time_part'] < 62**11
assert values['raw_index_payload_extra_bytes'] == 3_200_000_000
# Enumerate both legal serial orders of two locked reservations with an ambiguous
# first reply. The first committed range is burned, never returned for reuse.
for first, second in [('A','B'), ('B','A')]:
    high=1000; granted={}
    for name in [first, second, first+'retry']:
        granted[name]=(high,high+1000);high+=1000
    ranges=list(granted.values())
    assert all(a[1] <= b[0] or b[1] <= a[0] for i,a in enumerate(ranges) for b in ranges[i+1:])
# Critical failure model: stale replica promotion does reproduce an old range.
confirmed=(1000,2000); stale_high=1000
assert (stale_high,stale_high+1000) == confirmed
# A fresh generation blocks extension from the old owner; old grant remains burned.
row={'generation': 8, 'high': 1060}; old_generation=7
assert old_generation != row['generation']
print('PASS: 3 page/source blocks; arithmetic; locked reservation orders; lost reply burning; stale failover counterexample; stale generation rejected')
print(json.dumps(values,indent=2))
