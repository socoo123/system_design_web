"""Independent arithmetic for the chapter assumptions; no performance experiment."""
from decimal import Decimal as D
from pathlib import Path
import datetime
import hashlib
import json
import math

ROOT = Path(__file__).resolve().parents[2]
rows = []


def eq(chapter, name, formula, actual, expected, unit):
    actual, expected = D(str(actual)), D(str(expected))
    rows.append(dict(chapter=chapter, name=name, formula=formula,
                     actual=str(actual), expected=str(expected), unit=unit,
                     passed=actual == expected))


eq(34, 'logical model rate', '20 * 5', 20 * 5, 100, 'calls/s')
eq(34, 'logical tool rate', '20 * 3', 20 * 3, 60, 'calls/s')
eq(34, 'logical calls per minute', '100 * 60', 100 * 60, 6000, 'calls/min')
eq(34, 'physical model attempts', '100 * 1.1', D(100) * D('1.1'), 110, 'attempts/s')
eq(34, 'base token rate', '100 * 60 * 4000', 100 * 60 * 4000, 24000000, 'tokens/min')
eq(34, 'retry token rate', '110 * 60 * 4000', 110 * 60 * 4000, 26400000, 'tokens/min')
eq(34, 'normal hot duration', '5 * 2 + 3 * .3 + 8 * .02', 10 + 3 * D('.3') + 8 * D('.02'), '11.06', 's')
eq(34, 'normal hot occupancy', '20 * 11.06', 20 * D('11.06'), '221.20', 'mean runs')
eq(34, 'retry duration addition', '5 * .1 * 2', 5 * D('.1') * 2, 1, 's/run')
eq(34, 'retry occupancy', '20 * (11.06 + 1)', 20 * (D('11.06') + 1), '241.20', 'mean runs')
eq(34, 'full-bound duration with stage means', '12 * 2 + 8 * .3 + 20 * .02', 24 + 8 * D('.3') + 20 * D('.02'), '26.8', 's; no retries or approval')
eq(34, 'full-bound occupancy', '20 * 26.8', 20 * D('26.8'), 536, 'mean runs under this mix')
eq(34, 'parked arrival rate', '20 * .3', 20 * D('.3'), 6, 'pauses/s')
eq(34, 'parked occupancy', '6 * 300', 6 * 300, 1800, 'mean runs')
eq(34, 'result checkpoint writes', '20 * 8', 20 * 8, 160, 'writes/s; excludes admission and events')
eq(34, 'result checkpoint bytes', '160 * 2000', 160 * 2000, 320000, 'B/s')
eq(34, 'result checkpoint daily', '320000 * 86400 / 1e9', D(320000) * 86400 / 10**9, '27.648', 'GB/day at constant load')
eq(34, 'seven days two copies', '27.648 * 7 * 2', D('27.648') * 7 * 2, '387.072', 'GB')

eq(35, 'mean residency', '20 * 8', 20 * 8, 160, 'sequences')
eq(35, 'slot lower bound', 'ceil(160 / 32)', math.ceil(160 / 32), 5, 'replicas; no tail guarantee')
eq(35, 'planned rate per replica', '4 * .8', 4 * D('.8'), '3.2', 'requests/s')
eq(35, 'normal replicas', 'ceil(20 / 3.2)', math.ceil(D(20) / D('3.2')), 7, 'replicas')
eq(35, 'seven after largest host loss', '7 - 3', 7 - 3, 4, 'replicas')
eq(35, 'seven loss goodput', '4 * 4', 4 * 4, 16, 'requests/s benchmark assumption')
eq(35, 'nine slots', '9 * 32', 9 * 32, 288, 'slots')
eq(35, 'nine nominal goodput', '9 * 4', 9 * 4, 36, 'requests/s')
eq(35, 'nine surviving slots', '(9 - 3) * 32', (9 - 3) * 32, 192, 'slots')
eq(35, 'nine surviving goodput', '6 * 4', 6 * 4, 24, 'requests/s')
eq(35, 'nine surviving planned capacity', '6 * 4 * .8', 6 * 4 * D('.8'), '19.2', 'requests/s at the normal 80% budget')
eq(35, 'ten surviving planned capacity', '(10 - ceil(10 / 3)) * 3.2', (10 - math.ceil(10 / 3)) * D('3.2'), '19.2', 'requests/s at the normal 80% budget')
eq(35, 'eleven surviving planned capacity', '(11 - ceil(11 / 3)) * 3.2', (11 - math.ceil(11 / 3)) * D('3.2'), '22.4', 'requests/s at the normal 80% budget')
eq(35, 'normal rounded utilization', 'round(20 / 36 * 100, 1)', round(D(20) / 36 * 100, 1), '55.6', '%')
eq(35, 'failure rounded utilization', 'round(20 / 24 * 100, 1)', round(D(20) / 24 * 100, 1), '83.3', '%')
eq(35, 'start devices', '9 + 1 + 2', 9 + 1 + 2, 12, 'GPU under one-GPU replica assumption')
eq(35, 'overlap devices', '9 + 9 + 2', 9 + 9 + 2, 20, 'GPU')
eq(35, 'single load time', '40 / 2 + 100', D(40) / 2 + 100, 120, 's with stated effective bandwidth')
eq(35, 'nine artifact reads', '9 * 40', 9 * 40, 360, 'GB')
eq(35, 'mean queue', '20 * .2', 20 * D('.2'), 4, 'requests')
eq(35, 'canary arrivals', '20 * .1', 20 * D('.1'), 2, 'requests/s')
eq(35, 'canary minimum samples', '2 * 300', 2 * 300, 600, 'requests in five minutes')
eq(35, 'aggregate hidden error', '.1 * .05 * 100', D('.1') * D('.05') * 100, '.5', '%')

eq(36, 'three-node majority', 'floor(3 / 2) + 1', 3 // 2 + 1, 2, 'nodes')
eq(36, 'fixed quorum intersection lower bound', '2 + 2 - 3', 2 + 2 - 3, 1, 'member; not a linearizability proof')
eq(36, 'local acknowledge path', '2 + 1', 2 + 1, 3, 'ms')
eq(36, 'remote acknowledge nearby', '2 + max(1, 4 + 1)', 2 + max(1, 4 + 1), 7, 'ms')
eq(36, 'remote acknowledge distant', '2 + max(1, 80 + 1)', 2 + max(1, 80 + 1), 83, 'ms')
eq(36, 'fixed budget', '10000000 * (1 - .999)', 10_000_000 * (1 - D('.999')), 10000, 'bad events')
eq(36, 'fixed balance', '10000 - 6000', 10000 - 6000, 4000, 'bad events remaining')
eq(36, 'fixed remaining fraction', '4000 / 10000 * 100', D(4000) / 10000 * 100, 40, '%')
eq(36, 'steady thirty-day events', '1000 * 30 * 86400', 1000 * 30 * 86400, 2592000000, 'eligible events')
eq(36, 'steady thirty-day allowance', '2592000000 * .001', D(2592000000) * D('.001'), 2592000, 'bad events')
eq(36, 'partial outage spend', '1000 * .1 * 1200', 1000 * D('.1') * 1200, 120000, 'bad events')
eq(36, 'rounded partial budget spend', 'round(120000 / 2592000 * 100, 2)', round(D(120000) / 2592000 * 100, 2), '4.63', '% of full budget')
eq(36, 'time budget three nines', '30 * 24 * 60 * .001', 30 * 24 * 60 * D('.001'), '43.2', 'minutes for time SLI only')
eq(36, 'time budget four nines', '30 * 24 * 60 * .0001', 30 * 24 * 60 * D('.0001'), '4.32', 'minutes')
eq(36, 'time budget five nines', '30 * 86400 * .00001', 30 * 86400 * D('.00001'), '25.92', 'seconds')
eq(36, 'one percent burn', '.01 / .001', D('.01') / D('.001'), 10, 'x')
eq(36, 'full budget exhaustion forecast', '30 / 10', D(30) / 10, 3, 'days at stable traffic and error mix')
eq(36, 'fast alert full budget fraction', '14.4 * 1 / 720', D('14.4') / 720, '.02', 'fraction')
eq(36, 'slow alert full budget fraction', '6 * 6 / 720', D(6) * 6 / 720, '.05', 'fraction')
eq(36, 'independent series availability', '.999 * .999', D('.999') * D('.999'), '.998001', 'probability')
eq(36, 'independent parallel availability', '1 - .001 * .001', 1 - D('.001') * D('.001'), '.999999', 'probability; assumes timely failover')

result = dict(at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
              chapterHashes={f'ch{n}': hashlib.sha256((ROOT / f'chapters/ch{n}.html').read_bytes()).hexdigest() for n in (34, 35, 36)},
              method='Decimal recomputation of stated teaching assumptions; no throughput, real replication, distributed workflow or SLO measurement experiment.',
              checks=rows, passed=all(row['passed'] for row in rows))
(ROOT / 'docs/reviews/ch34-ch35-ch36-numeric-review.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(dict(passed=result['passed'], equations=len(rows), failures=[r for r in rows if not r['passed']])))
raise SystemExit(0 if result['passed'] else 1)
