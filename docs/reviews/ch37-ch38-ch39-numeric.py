"""Independent arithmetic review of declared teaching inputs, not capacity measurements."""
from pathlib import Path
from fractions import Fraction as F
import hashlib
import json

ROOT = Path(__file__).resolve().parents[2]
PREFIX = 'ch37-ch38-ch39'
checks = []


def check(chapter, label, expression, actual, expected):
    actual, expected = F(actual), F(expected)
    checks.append({'chapter': chapter, 'label': label, 'expression': expression,
                   'exact': str(actual), 'value': float(actual),
                   'expected': str(expected), 'passed': actual == expected})


daily = 40 * 86400
annual = daily * 365
snapshot = annual * 1500
indexes = annual * 2 * 40
copy = snapshot + indexes
check('ch37', 'peak checkout rate /s', '40 * 8', 40 * 8, 320)
check('ch37', 'daily orders', '40 * 86400', daily, 3456000)
check('ch37', 'annual orders', '40 * 86400 * 365', annual, 1261440000)
check('ch37', 'snapshot bytes', 'annual * 1500', snapshot, 1892160000000)
check('ch37', 'two indexes bytes', 'annual * 2 * 40', indexes, 100915200000)
check('ch37', 'one copy decimal TB', '(snapshot + indexes) / 10^12', F(copy, 10**12), '1.9930752')
check('ch37', 'three live and one compact copy TB', 'copy * 4 / 10^12', F(copy * 4, 10**12), '7.9723008')
check('ch37', 'old versions only on three live copies TB', 'copy * (3 * 1.5 + 1) / 10^12', F(copy, 10**12) * F(11, 2), '10.9619136')
check('ch37', 'logical snapshot peak bytes/s', '320 * 1500', 320 * 1500, 480000)
check('ch37', 'three dirty pages bytes/s', '320 * 3 * 8192', 320 * 3 * 8192, 7864320)
check('ch37', 'simplified page to payload ratio', '3 * 8192 / 1500', F(3 * 8192, 1500), '16.384')
check('ch37', 'average read QPS', '40 * 20', 40 * 20, 800)
check('ch37', 'peak read QPS', '320 * 20', 320 * 20, 6400)
check('ch37', 'hot SKU updates/s', '320 * 0.30', 320 * F(3, 10), 96)
check('ch37', 'serial lock utilization', '96 * 0.010', 96 * F(1, 100), '0.96')
check('ch37', 'recent 50 chat bytes', '50 * 400', 50 * 400, 20000)
check('ch37', 'chat daily decimal GB', '2000 * 400 * 86400 / 10^9', F(2000 * 400 * 86400, 10**9), '69.12')
check('ch37', 'postings bytes/document', '80 * 20', 80 * 20, 1600)
check('ch37', 'amount stripe decimal GB', 'annual * 8 / 10^9', F(annual * 8, 10**9), '10.09152')
check('ch37', 'amount and status decimal GB', 'annual * 9 / 10^9', F(annual * 9, 10**9), '11.35296')
check('ch37', 'raw byte ratio is not latency', '1500 / 8', F(1500, 8), '187.5')
check('ch37', 'WA6 write load MB/s', '10 * 6', 10 * 6, 60)
check('ch37', 'WA12 write load MB/s', '10 * 12', 10 * 12, 120)

edge = 40000 * F(1, 5)
shield = edge * F(1, 2)
store = shield * F(1, 2)
check('ch38', 'edge misses /s', '40000 * 0.2', edge, 8000)
check('ch38', 'App arrivals /s', '8000 * 0.5', shield, 4000)
check('ch38', 'Store reads /s', '4000 * 0.5', store, 2000)
check('ch38', 'aggregate hit rate', '1 - 0.2 * 0.5 * 0.5', 1 - store / 40000, '0.95')
check('ch38', '90% hit stress reads /s', '40000 * 0.10', 40000 * F(1, 10), 4000)
check('ch38', 'minimum hit for isolated 3000/s budget', '1 - 3000 / 40000', 1 - F(3000, 40000), '0.925')
check('ch38', 'local cache decimal MB', '80000 * 2000 * 1.5 / 10^6', F(80000 * 2000 * 3, 2 * 10**6), 240)
check('ch38', '30 local copies decimal GB', '240 MB * 30 / 1000', F(240 * 30, 1000), '7.2')
check('ch38', 'unguarded ideal absence expectation /s, ignoring all safety margins', '100 / 5', F(100, 5), 20)
check('ch38', 'adapter negative hit window after clock margin s', '5 - 2', 5 - 2, 3)
check('ch38', 'adapter instantaneous-fill ideal reads /s, not an upper bound', '100 / (5 - 2)', F(100, 3), '100/3')
check('ch38', 'negative direct-send eligibility window has strict endpoint s', '5 - 2 - 1', 5 - 2 - 1, 2)
check('ch38', 'soft jitter earliest s', '16 * 0.9', 16 * F(9, 10), '14.4')
check('ch38', 'soft jitter latest s', '16 * 1.1', 16 * F(11, 10), '17.6')
check('ch38', 'jitter span s', '17.6 - 14.4', F('17.6') - F('14.4'), '3.2')
check('ch38', 'merged mean fills /s', '1000 / 3.2', F(1000) / F('3.2'), '312.5')
check('ch38', 'unmerged mean fills /s', '1000 * 20 / 3.2', F(20000) / F('3.2'), 6250)
check('ch38', 'all-cold arrivals rejected before Store /s', '40000 - 3000', 40000 - 3000, 37000)
check('ch38', 'local copies to shared gets /s', '30 / 5', F(30, 5), 6)
check('ch38', 'hot reads per four copies /s', '8000 / 4', F(8000, 4), 2000)
check('ch38', 'bad independent TTL accumulation s', '33 + 5 + 30', 33 + 5 + 30, 68)
check('ch38', 'stated conservative age budget s', '20 + 2 + 1 + 1', 20 + 2 + 1 + 1, 24)

check('ch39', 'planned per App /s', '1000 * 0.6', 1000 * F(3, 5), 600)
check('ch39', 'minimum at exact planned capacity', '6000 / 600', F(6000, 600), 10)
check('ch39', 'one excluded from 12 /s', '(12 - 1) * 600', 11 * 600, 6600)
check('ch39', 'one deploy and one fault /s', '(12 - 2) * 600', 10 * 600, 6000)
check('ch39', 'four co-located lost /s', '(12 - 4) * 600', 8 * 600, 4800)
check('ch39', 'co-location capacity deficit /s', '6000 - 4800', 6000 - 4800, 1200)
check('ch39', 'co-location rejected fraction', '1200 / 6000', F(1200, 6000), '0.2')
check('ch39', 'average active by Little law', '6000 * 0.050', 6000 * F(1, 20), 300)
check('ch39', '10% one-extra-attempt work /s', '6000 * 1.1', 6000 * F(11, 10), 6600)
check('ch39', 'busy HTTP2 channel relative to 1000/s', '1200 / 1000', F(1200, 1000), '1.2')
check('ch39', 'response decimal MB/s', '6000 * 20000 / 10^6', F(6000 * 20000, 10**6), 120)
check('ch39', 'response decimal Mb/s', '120 * 8', 120 * 8, 960)
check('ch39', 'one raw session copy MB', '1000000 * 256 / 10^6', F(1000000 * 256, 10**6), 256)
check('ch39', 'two raw session copies MB', '256 * 2', 256 * 2, 512)
check('ch39', 'worst probe budget s under fixed schedule', '2 * 2 + 0.3 + 0.2', 4 + F(3, 10) + F(2, 10), '4.5')
check('ch39', 'failed backend nominal attempts /s', '6000 / 12', F(6000, 12), 500)
check('ch39', 'initial attempts exposed under uniform load', '500 * 4.5', 500 * F(9, 2), 2250)
check('ch39', 'single Maglev toy allocation bytes', '65537 * 4', 65537 * 4, 262148)
check('ch39', 'double buffered allocation bytes', '65537 * 4 * 2', 65537 * 4 * 2, 524296)
check('ch39', '1000 table copies MB', '65537 * 4 * 1000 / 10^6', F(65537 * 4 * 1000, 10**6), '262.148')

source_hashes = {f'chapters/ch{n}.html': hashlib.sha256((ROOT / f'chapters/ch{n}.html').read_bytes()).hexdigest()
                 for n in (37, 38, 39)}
result = {'sourceHashes': source_hashes, 'checks': checks,
          'passed': all(c['passed'] for c in checks),
          'limits': 'Independent arithmetic on stated assumptions. Values must also be read against the chapter; these are not observed throughput, latency or fault bounds.'}
(ROOT / f'docs/reviews/{PREFIX}-numeric-review.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'passed': result['passed'], 'calculations': len(checks)}))
raise SystemExit(0 if result['passed'] else 1)
