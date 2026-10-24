"""Independent controlled-time traffic probe for the Ch38 negative-cache estimate."""
from pathlib import Path
from fractions import Fraction
import hashlib
import importlib.util
import json
import sys
import tempfile

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[2]
source = ROOT / 'examples/ch38/cache.py'
before = hashlib.sha256(source.read_bytes()).hexdigest()
spec = importlib.util.spec_from_file_location('root_negative_cache', source)
mod = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = mod
spec.loader.exec_module(mod)
clock = [120000]
waves = {}
claims = 0
with tempfile.TemporaryDirectory() as directory:
    cache = mod.Cache(str(Path(directory) / 'cache.db'), lambda: clock[0])
    for elapsed in range(0, 12000, 250):
        clock[0] = 120000 + elapsed
        for key in range(7):
            status, value = cache.claim(f'negative-fixture-{key}')
            claims += 1
            if status == 'LEADER':
                waves[elapsed] = waves.get(elapsed, 0) + 1
                evidence = mod.Evidence.primary(0, clock[0], absent=True)
                if not cache.fill(f'negative-fixture-{key}', value, evidence):
                    raise AssertionError('instantaneous fresh negative fill rejected')
            elif status != 'HIT':
                raise AssertionError(f'unexpected status {status}')
    cache.close()
reads = sum(waves.values())
rate = Fraction(reads, 12)
checks = [
    {'label': '336 actual claims exercised', 'passed': claims == 336},
    {'label': 'seven readers refresh at 0/3/6/9 seconds', 'passed': waves == {0: 7, 3000: 7, 6000: 7, 9000: 7}},
    {'label': 'observed idealized adapter rate is N/3', 'passed': rate == Fraction(7, 3)},
    {'label': 'five-second unguarded ideal is lower than actual adapter rate', 'passed': Fraction(7, 5) < rate}
]
after = hashlib.sha256(source.read_bytes()).hexdigest()
result = {'sourceHashes': {'examples/ch38/cache.py': after}, 'sourcesUnchangedDuringRun': before == after,
          'inputs': {'keys': 7, 'durationMs': 12000, 'stepMs': 250, 'negativeHardMs': 5000, 'hitClockMarginMs': 2000,
                     'queryAndFillTimeMs': 0, 'evictions': 0, 'httpLayer': False},
          'actualClaimCalls': claims, 'leaderWaves': waves, 'authorityReads': reads,
          'observedRatePerSecond': float(rate), 'checks': checks,
          'passed': before == after and all(c['passed'] for c in checks),
          'limits': 'Actual SQLite claim/fill calls with controlled logical time, new keys and a different duration from the reviewer fixture. This is not a benchmark, an upper bound, an HTTP success rate or a claim that every 5s negative record remains usable for all 5s.'}
(ROOT / 'docs/reviews/ch37-ch38-ch39-root-negative-cache-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'passed': result['passed'], 'claims': claims, 'authorityReads': reads, 'rate': float(rate)}))
raise SystemExit(0 if result['passed'] else 1)
