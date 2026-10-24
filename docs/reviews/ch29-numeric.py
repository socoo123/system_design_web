from pathlib import Path
from math import ceil, floor, isclose
from fractions import Fraction
import json

rows = []
def expect(name, actual, expected, unit):
    assert isclose(float(actual), float(expected), rel_tol=1e-10), (name, actual, expected)
    rows.append({'name': name, 'value': float(actual), 'unit': unit})

kv = 2 * 32 * 8 * 128 * 2
expect('KV per token', kv, 131072, 'B')
expect('KV per token', kv / 1024, 128, 'KiB')
block = 16 * kv
expect('page', block / 1024**2, 2, 'MiB')
credits = ceil((2048+512)/16)
expect('full request credits', credits, 160, 'pages')
expect('request reserved', credits*block/1024**2, 320, 'MiB')
expect('pool', 40*1024**3/block, 20480, 'pages')
expect('full-cap request count', floor(40*1024**3/(credits*block)), 128, 'requests')
expect('129th excess', (129*credits*block-40*1024**3)/1024**2, 320, 'MiB')
expect('average active, GPU boundary', 10*6, 60, 'requests')
expect('average reserved', 10*6*credits*block/1024**3, 18.75, 'GiB')
expect('conditional peak active', 30*6, 180, 'requests')
expect('conditional peak credits', 30*6*credits*block/1024**3, 56.25, 'GiB')
expect('planned service rate', Fraction(12)*Fraction(70,100), Fraction(42,5), 'req/s')
expect('normal replicas', ceil(Fraction(30)/Fraction(42,5)), 4, 'replicas')
expect('N-1 replicas', ceil(Fraction(30)/Fraction(42,5))+1, 5, 'replicas')
expect('N-1 surviving planned rate', 4*Fraction(42,5), Fraction(168,5), 'req/s')
expect('input average', 10*2048, 20480, 'tokens/s')
expect('input peak', 30*2048, 61440, 'tokens/s')
expect('output average', 10*256, 2560, 'tokens/s')
expect('output peak', 30*256, 7680, 'tokens/s')
expect('tenant example', 4096/2048, 2, 'standard prompts/s')
expect('100 requests nominal work', Fraction(100,12), Fraction(25,3), 's')
expect('600ms nominal completions', Fraction(12)*Fraction(6,10), Fraction(36,5), 'requests')
expect('queue budget', 800-50-150, 600, 'ms')
expect('output intervals', 256-1, 255, 'intervals')
expect('fixed-gap decode', 255*20, 5100, 'ms')
expect('ideal total', 200+5100, 5300, 'ms')
expect('hypothetical fixed 50ms gaps', 255*50, 12750, 'ms, not p99 bound')
expect('gateway serving-set buffer', 128*64*1024/1024**2, 8, 'MiB')
prompt_kv = 2048*kv
expect('prompt KV', prompt_kv/1024**2, 256, 'MiB')
expect('pure transfer', prompt_kv/10**10*1000, 26.8435456, 'ms')
expect('peak transfer', 30*prompt_kv/1024**3, 7.5, 'GiB/s')
expect('peak transfer', 30*prompt_kv/10**9, 8.05306368, 'GB/s')
expect('peak transfer bits', 30*prompt_kv*8/10**9, 64.42450944, 'Gb/s')
expect('transfer fraction', 30*prompt_kv/10**10*100, 80.5306368, '%')
expect('long context request', (8192+512)*kv/1024**2, 1088, 'MiB')
expect('long context reservations', floor(40*1024**3/((8192+512)*kv)), 37, 'requests')
result = {'passed': True, 'count': len(rows), 'kind': 'Teaching-assumption arithmetic; no benchmark', 'calculations': rows}
Path('docs/reviews/ch29-numeric-results.json').write_text(json.dumps(result, indent=2)+'\n')
print(f'{len(rows)} numeric checks passed')
