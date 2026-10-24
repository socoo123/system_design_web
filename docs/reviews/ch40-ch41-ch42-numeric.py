"""Recalculate the chapter's declared assumptions; these are not measurements."""
from fractions import Fraction as F
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[2]
PREFIX = 'ch40-ch41-ch42'
checks = []


def check(ch, label, expression, actual, expected):
    actual, expected = F(actual), F(expected)
    checks.append(dict(chapter=ch, label=label, expression=expression,
                       exact=str(actual), value=float(actual),
                       expected=str(expected), passed=actual == expected))


check('ch40', 'Public origin arrivals /s', '2000 * (1 - .80)', 2000 * F(1, 5), 400)
check('ch40', 'Downstream remaining budget ms', '300 - 40 - 20', 300 - 40 - 20, 240)
check('ch40', 'WebSocket payload buffer bytes', '20000 * 64 * 1024', 20000 * 64 * 1024, 1310720000)
check('ch40', 'WebSocket payload buffer GiB', 'bytes / 2^30', F(20000 * 64 * 1024, 2**30), F(625, 512))
check('ch40', 'Retained subscription records', '100 * 300', 100 * 300, 30000)
check('ch40', 'Retained subscription payload MB', '100 * 300 * 200 / 10^6', F(100 * 300 * 200, 10**6), 6)
check('ch40', 'First visible event conditional budget ms', '40 + 20 + 500 + 40', 40 + 20 + 500 + 40, 600)
check('ch40', 'Intervals after first token s', '(400 - 1) / 50', F(399, 50), '7.98')
check('ch40', 'Whole-body buffering first-visible exercise s', '.60 + 7.98', F('0.60') + F('7.98'), '8.58')
check('ch40', 'Generation payload buffer MiB', '200 * 64 KiB / MiB', F(200 * 64 * 1024, 2**20), '12.5')
check('ch40', 'Possible resumed handshake saving s', '40 / 1000', F(40, 1000), '.04')

check('ch41', 'Local plus selected replica serial budget ms', '4 + 6 + 2', 4 + 6 + 2, 12)
check('ch41', 'Remote serial budget ms', '4 + 80 + 2', 4 + 80 + 2, 86)
check('ch41', 'Declared recoverable-prefix exposure writes', '1000 * 2', 1000 * 2, 2000)
check('ch41', 'Uniform shard arrivals /s', '8000 / 8', F(8000, 8), 1000)
check('ch41', 'Uniform aggregate budget /s', '8 * 1200', 8 * 1200, 9600)
check('ch41', 'Hot tenant /s', '8000 * .40', 8000 * F(2, 5), 3200)
check('ch41', 'Hot tenant relative to one shard budget', '3200 / 1200', F(3200, 1200), F(8, 3))
check('ch41', 'Copy lower bound s', '400 GB / 100 MB/s', F(400 * 10**9, 100 * 10**6), 4000)
check('ch41', 'Copy lower bound minutes', '4000 / 60', F(4000, 60), F(200, 3))
check('ch41', 'Net replay MB/s', '60 - 20', 60 - 20, 40)
check('ch41', 'Replay catchup seconds', '120 GB / 40 MB/s', F(120 * 10**9, 40 * 10**6), 3000)
check('ch41', 'Replay catchup minutes', '3000 / 60', F(3000, 60), 50)
check('ch41', 'Outbox one-hour raw GB', '1000 * 1000 * 3600 / 10^9', F(1000 * 1000 * 3600, 10**9), '3.6')
check('ch41', 'Relay load with ten percent replay MB/s', '1000 * 1000 * 1.1 / 10^6', F(1000 * 1000, 10**6) * F(11, 10), '1.1')

check('ch42', 'Three owner budget /s', '3 * 200', 3 * 200, 600)
check('ch42', 'Six owner budget /s', '6 * 200', 6 * 200, 1200)
check('ch42', 'Incident duration s', '9 * 60', 9 * 60, 540)
check('ch42', 'Accumulated backlog records', '(1200 - 600) * 540', (1200 - 600) * 540, 324000)
check('ch42', 'Net recovery /s', '1200 - 600', 1200 - 600, 600)
check('ch42', 'Recovery seconds with ongoing arrivals', '324000 / 600', F(324000, 600), 540)
check('ch42', 'Incorrect zero-arrival shortcut s', '324000 / 1200', F(324000, 1200), 270)
check('ch42', 'Seven days, three raw log copies TB', '1200 * 1000 * 86400 * 7 * 3 / 10^12', F(1200 * 1000 * 86400 * 7 * 3, 10**12), '2.17728')
check('ch42', 'End-to-end call budget spent ms', '50 + 300 + 100 + 250 + 50', 50 + 300 + 100 + 250 + 50, 750)
check('ch42', 'Remaining budget ms', '800 - 750', 800 - 750, 50)
check('ch42', 'Healthy mean in-flight by Little law', '100/s * .080 s', 100 * F(8, 100), 8)
check('ch42', 'Incident unbounded mean in-flight', '100/s * 2 s', 100 * 2, 200)
check('ch42', 'Three retry layers, three total attempts each', '3^3', 3**3, 27)
check('ch42', 'Single extra-traffic retry budget /s', '100 * 1.1', 100 * F(11, 10), 110)
check('ch42', 'Maximum cross-instance half-open probes', '8 * 3', 8 * 3, 24)
check('ch42', 'Ready capacity /s', '3 * 250', 3 * 250, 750)
check('ch42', 'One replica unavailable /s', '2 * 250', 2 * 250, 500)
check('ch42', 'Required rejection without spare capacity /s', '600 - 500', 600 - 500, 100)

hashes = {f'chapters/ch{n}.html': hashlib.sha256((ROOT / f'chapters/ch{n}.html').read_bytes()).hexdigest()
          for n in (40, 41, 42)}
result = dict(sourceHashes=hashes, checks=checks,
              passed=all(x['passed'] for x in checks),
              limits='Arithmetic on stated teaching assumptions. Read with the final chapter; no throughput, percentile, remote durability or timing bound is measured.')
(ROOT / f'docs/reviews/{PREFIX}-numeric-review.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(dict(passed=result['passed'], calculations=len(checks))))
raise SystemExit(0 if result['passed'] else 1)
