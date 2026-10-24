"""Independent arithmetic on declared teaching assumptions, not measurements."""
from fractions import Fraction as F
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[2]
PREFIX = 'ch43-ch44-ch45'
checks = []


def check(ch, label, expression, actual, expected):
    actual, expected = F(actual), F(expected)
    checks.append(dict(chapter=ch, label=label, expression=expression,
                       exact=str(actual), value=float(actual), expected=str(expected),
                       passed=actual == expected))


check('ch43', 'Raw daily TB', '10^9 events * 1000 B / 10^12', F(10**9 * 1000, 10**12), 1)
check('ch43', 'Mean events per second', '10^9 / 86400', F(10**9, 86400), F(312500, 27))
check('ch43', 'Raw annual TB', '1 * 365', 365, 365)
check('ch43', 'All-hot illustrative monthly cost', '365 * 100', 365 * 100, 36500)
check('ch43', 'Tiered illustrative monthly cost', '1 * 100 + 364 * 10', 100 + 364 * 10, 3740)
check('ch43', 'Relative illustrative saving', '1 - 3740 / 36500', 1 - F(3740, 36500), F(1638, 1825))
check('ch43', 'Selected uncompressed columns GB', '1000 GB * 3 / 20', 1000 * F(3, 20), 150)
check('ch43', 'Selected compressed data GB', '1000 GB * 3 / 20 / 4', 1000 * F(3, 20) / 4, '37.5')
check('ch43', 'Full raw versus selected bytes ratio', '30000 / 37.5', F(30000) / F('37.5'), 800)
check('ch43', 'Tenant predicate adds one equal-width column GB', '1000 * 4 / 20 / 4', 1000 * F(4, 20) / 4, 50)
check('ch43', 'Eight-worker data bandwidth GB/s', '8 * 250 MB/s / 1000', F(8 * 250, 1000), 2)
check('ch43', 'Single-query scan lower bound seconds', '37.5 / 2', F('37.5') / 2, '18.75')
check('ch43', 'Two-query shared scan lower bound seconds', '37.5 / (2 / 2)', F('37.5'), '37.5')
check('ch43', 'Tenant-filtered single-query lower bound seconds', '50 / 2', F(50, 2), 25)
check('ch43', 'Uniform hourly raw GB', '1000 / 24', F(1000, 24), F(125, 3))
check('ch43', 'Files created per day', '100 * 1440', 100 * 1440, 144000)
check('ch43', 'Independent maintenance encoded GB per day', '144000 * 4 MB / 1000', F(144000 * 4, 1000), 576)
check('ch43', 'Compaction candidate MB', '128 * 4', 128 * 4, 512)
check('ch43', 'Serial input-open seconds', '128 * .010', 128 * F('.010'), '1.28')
check('ch43', 'Serial output-open seconds', '1 * .010', F('.010'), '.010')
check('ch43', 'Compaction read plus write MB', '512 + 512', 512 + 512, 1024)
check('ch43', 'Replay net MB per second', '100 - 20', 100 - 20, 80)
check('ch43', 'Replay catch-up seconds', '10^12 / (80 * 10^6)', F(10**12, 80 * 10**6), 12500)
check('ch43', 'Replay catch-up hours', '12500 / 3600', F(12500, 3600), F(125, 36))
check('ch43', 'Dremel cited experimental byte ratio only', '87 / .5', F(87) / F('.5'), 174)

check('ch44', 'Five three-attempt retry layers worst case', '3^5', 3**5, 243)
check('ch44', 'Raw outage payload MB', '36000 * 1000 / 10^6', F(36000 * 1000, 10**6), 36)
check('ch44', 'Daily result records at constant peak', '200 * 86400', 200 * 86400, 17280000)
check('ch44', 'Mean active acceptance by Little law', '200/s * .100 s', 200 * F('.100'), 20)
check('ch44', 'Outage backlog events', '200 * 180', 200 * 180, 36000)
check('ch44', 'Net event drain per second', '300 - 200', 300 - 200, 100)
check('ch44', 'Catch-up seconds with continuing input', '36000 / (300 - 200)', F(36000, 300 - 200), 360)
check('ch44', 'Nominal detection plus propagation seconds', '2 * 3 + 1', 2 * 3 + 1, 7)
check('ch44', 'Total declared deadline caps ms', '80 + 220 + 40 + 220 + 140', 80 + 220 + 40 + 220 + 140, 700)
check('ch44', 'Deadline reserve ms', '800 - 700', 800 - 700, 100)
check('ch44', 'Retry extra traffic per second', '200 * .1', 200 * F('.1'), 20)
check('ch44', 'Original plus retry traffic per second', '200 + 20', 200 + 20, 220)
check('ch44', 'Peak-for-seven-days result GB', '200 * 86400 * 7 * 1000 / 10^9', F(200 * 86400 * 7 * 1000, 10**9), '120.96')
check('ch44', 'One-draining remaining capacity per second', '(3 - 1) * 600', 2 * 600, 1200)
check('ch44', 'Ten-percent new canary traffic per second', '1000 * .1', 1000 * F('.1'), 100)
check('ch44', 'Five serial branch budgets ms', '5 * 80', 5 * 80, 400)
check('ch44', 'Five truly parallel identical branches ms', 'max(80,80,80,80,80)', max([80] * 5), 80)

check('ch45', 'Original amount in minor units', '2999 * 2 + 2002', 2999 * 2 + 2002, 8000)
check('ch45', 'Edited amount in minor units', '2999 * 3 + 2002', 2999 * 3 + 2002, 10999)
check('ch45', 'Conditional serial budget ms', '20 + 40 + 120', 20 + 40 + 120, 180)
check('ch45', 'Conditional target reserve ms', '300 - 180', 300 - 180, 120)
check('ch45', 'Exclusive hot-row optimistic ceiling per second', '1 / .010', 1 / F('.010'), 100)
check('ch45', 'Requested occupancy seconds per second', '300 * .010', 300 * F('.010'), 3)
check('ch45', 'Net drain per second', '600 - 300', 600 - 300, 300)
check('ch45', 'Recovery seconds with continuing input', '36000 / 300', F(36000, 300), 120)
check('ch45', 'Incorrect gross-capacity shortcut seconds', '36000 / 600', F(36000, 600), 60)
check('ch45', 'Underprovisioned backlog growth per second', '300 - 250', 300 - 250, 50)
check('ch45', 'Seven days three copies raw payload TB', '300 * 2000 * 86400 * 7 * 3 / 10^12', F(300 * 2000 * 86400 * 7 * 3, 10**12), '1.08864')

hashes = {f'chapters/ch{n}.html': hashlib.sha256((ROOT / f'chapters/ch{n}.html').read_bytes()).hexdigest()
          for n in (43, 44, 45)}
result = dict(sourceHashes=hashes, checks=checks, passed=all(c['passed'] for c in checks),
              limits='Recalculated teaching assumptions checked against chapter prose by the primary reviewer. No benchmark, percentile, crash-durability or distributed transaction guarantee is measured.')
(ROOT / f'docs/reviews/{PREFIX}-numeric-review.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(dict(passed=result['passed'], calculations=len(checks), failures=[c for c in checks if not c['passed']])))
raise SystemExit(0 if result['passed'] else 1)
