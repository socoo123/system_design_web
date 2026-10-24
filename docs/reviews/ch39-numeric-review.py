"""Recompute teaching assumptions independently of Java admission implementation."""
from fractions import Fraction
from pathlib import Path
import json

checks = []
def verify(label, actual, expected):
    assert actual == expected, (label, actual, expected)
    checks.append({'label': label, 'value': str(actual), 'expected': str(expected)})

verify('per-App planned rate', 1000 * Fraction(60, 100), 600)
verify('normal minimum without spare', Fraction(6000, 600), 10)
verify('12 deployed planned rate', 12 * 600, 7200)
verify('one independent machine loss', 11 * 600, 6600)
verify('peak / N-1 planned capacity', Fraction(6000, 6600), Fraction(10, 11))
verify('one rollout plus one loss', 10 * 600, 6000)
verify('three machines four Apps each: survivor', (12 - 4) * 600, 4800)
verify('co-located deficit', 6000 - 4800, 1200)
verify('co-located rejection share', Fraction(1200, 6000), Fraction(1, 5))
verify('flow hotspot / App assumption', Fraction(1200, 1000), Fraction(6, 5))
verify('Little mean active work', 6000 * Fraction(50, 1000), 300)
verify('10% once-retry attempts/s', 6000 * Fraction(110, 100), 6600)
verify('extra retry work/s', 6000 * Fraction(10, 100), 600)
verify('request B/s', 6000 * 2000, 12_000_000)
verify('response B/s', 6000 * 20_000, 120_000_000)
verify('response bit/s', 120_000_000 * 8, 960_000_000)
verify('response receive+transmit work B/s', 120_000_000 * 2, 240_000_000)
verify('proxy each direction B/s', 12_000_000 + 120_000_000, 132_000_000)
verify('proxy each direction bit/s', 132_000_000 * 8, 1_056_000_000)
verify('session one raw copy B', 1_000_000 * 256, 256_000_000)
verify('session two raw copies B', 2 * 1_000_000 * 256, 512_000_000)
verify('session lookups/s', 6000 * 1, 6000)
verify('second failed probe completion s', 2 * 2 + Fraction(3, 10), Fraction(43, 10))
verify('detection+propagation s', 2 * 2 + Fraction(3, 10) + Fraction(2, 10), Fraction(9, 2))
verify('per-App offered attempts/s', Fraction(6000, 12), 500)
verify('initial attempts exposed', 500 * Fraction(9, 2), 2250)
verify('Maglev one table B', 65537 * 4, 262148)
verify('Maglev one table KiB', Fraction(262148, 1024), Fraction(65537, 256))
verify('double buffer B', 2 * 262148, 524296)
verify('double buffer KiB', Fraction(524296, 1024), Fraction(65537, 128))
verify('1000 tables MB/copy', Fraction(262148 * 1000, 1_000_000), Fraction(65537, 250))

out = Path(__file__).with_name('ch39-numeric-results.json')
out.write_text(json.dumps({'passed': True, 'checks': checks}, ensure_ascii=False, indent=2) + '\n')
print(f'PASS {len(checks)} arithmetic checks; these are assumptions, not benchmarks')
