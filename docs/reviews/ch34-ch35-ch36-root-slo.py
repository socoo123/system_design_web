"""Fresh inputs against Ch36's actual model, separate from the author's runner."""
from pathlib import Path
from fractions import Fraction
import datetime
import hashlib
import importlib.util
import json
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.dont_write_bytecode = True
path = ROOT / 'examples/ch36/slo.py'
spec = importlib.util.spec_from_file_location('root_slo', path)
m = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = m
spec.loader.exec_module(m)
checks = []


def check(name, condition):
    checks.append({'name': name, 'passed': bool(condition)})
    assert condition, name


def refused(name, fn):
    try:
        fn()
    except ValueError:
        check(name, True)
    else:
        check(name, False)


now, window = 5_000_000, 2_000
cutoff = now - 1_000
lower = cutoff - window
A = m.Attempt
rows = [
    A('expired', lower, lower + 100, 'APPROVED', True, True),
    A('edge-good', lower + 1, lower + 101, 'DECLINED', True, True),
    A('upper-unknown', cutoff, None, 'UNKNOWN'),
    A('deadline-good', cutoff - 1_000, cutoff, 'APPROVED', True, True),
    A('late', cutoff - 999, cutoff + 2, 'APPROVED', True, True),
    A('incorrect', cutoff - 900, cutoff - 800, 'DECLINED', False, True),
    A('time-before-start', cutoff - 800, cutoff - 801, 'APPROVED', True, True),
    A('immature', cutoff + 1, None, 'UNKNOWN'),
    A('excluded-at-ingress', cutoff - 700, None, 'UNKNOWN', eligible=False),
]
check('mixed fresh cohort has six eligible and four bad', m.counts(rows, now, window) == (6, 4))
check('order and repeated export cannot multiply journeys', m.counts(list(reversed(rows)) + [rows[1]], now, window) == (6, 4))
check('correct retry cannot erase a wrong terminal decision', m.counts([
    A('wrong-then-correct', cutoff - 500, cutoff - 400, 'DECLINED', False, True),
    A('wrong-then-correct', cutoff - 500, cutoff - 100, 'APPROVED', True, True)
], now, window) == (1, 1))
check('correct retry cannot erase a non-durable terminal decision', m.counts([
    A('not-durable-then-correct', cutoff - 500, cutoff - 400, 'APPROVED', True, False),
    A('not-durable-then-correct', cutoff - 500, cutoff - 100, 'APPROVED', True, True)
], now, window) == (1, 1))
check('UNKNOWN may still recover within its original journey deadline', m.counts([
    A('unknown-then-correct', cutoff - 500, cutoff - 400, 'UNKNOWN'),
    A('unknown-then-correct', cutoff - 500, cutoff - 100, 'DECLINED', True, True)
], now, window) == (1, 0))
check('immature journey is not prematurely good or bad', m.counts([rows[7]], now, window) == (0, 0))
refused('reject eligibility changed by retry', lambda: m.counts([rows[1], A('edge-good', lower + 1, None, 'UNKNOWN', eligible=False)], now, window))
refused('reject retry that refreshes the deadline', lambda: m.counts([rows[1], A('edge-good', lower + 2, None, 'UNKNOWN')], now, window))
refused('reject zero measurement window', lambda: m.counts(rows, now, 0))
check('large exact count preserves integer allowance', m.budget(2_345_678, 2_300) == {'allowed': 2_345, 'remaining': 45, 'burn': Fraction(2_300_000, 2_345_678)})
check('removing good cohort can cross the target', m.budget(2000, 2)['remaining'] == 0 and m.budget(1999, 2)['remaining'] == -1)
check('an empty window is no data', m.budget(0, 0) is None)
refused('invalid bad count cannot create surplus', lambda: m.budget(3, 4))

month = (2_345_678, 2_300)
healthy = {k: (25_000, 0) for k in ('1h', '5m', '6h', '30m')}


def gate(windows, complete=True, canary=True, reviewed=True):
    return m.feature_gate(month, windows, complete, canary, reviewed)


check('healthy positive balance advances one step', gate(healthy) == 'ALLOW_NEXT_CANARY_STEP')
check('fast pair above strict threshold holds', gate(healthy | {'1h': (25_000, 361), '5m': (25_000, 361)}) == 'HOLD_BURN')
check('exact fast threshold is excluded', gate(healthy | {'1h': (25_000, 360), '5m': (25_000, 360)}) == 'ALLOW_NEXT_CANARY_STEP')
check('one hot fast window is insufficient', gate(healthy | {'1h': (25_000, 361)}) == 'ALLOW_NEXT_CANARY_STEP')
check('slow pair independently holds through OR', gate(healthy | {'6h': (25_000, 151), '30m': (25_000, 151)}) == 'HOLD_BURN')
check('exact slow threshold is excluded', gate(healthy | {'6h': (25_000, 150), '30m': (25_000, 150)}) == 'ALLOW_NEXT_CANARY_STEP')
check('missing short-window cohort stops a release', gate(healthy | {'5m': (0, 0)}) == 'HOLD_NO_DATA')
check('incomplete telemetry stops despite healthy ratios', gate(healthy, complete=False) == 'HOLD_NO_DATA')
check('canary failure requires review', gate(healthy, canary=False) == 'HOLD_REVIEW')
check('review is a separate release condition', gate(healthy, reviewed=False) == 'HOLD_REVIEW')

files = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in [path, ROOT / 'examples/ch36/tradeoffs.py']}
result = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'files': files,
          'checks': checks, 'passed': all(c['passed'] for c in checks),
          'limits': 'Fresh deterministic cohort/budget inputs in Python. No live telemetry, distributed clocks, real checkout or production release.'}
(ROOT / 'docs/reviews/ch34-ch35-ch36-root-slo-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'passed': result['passed'], 'checks': len(checks)}))
