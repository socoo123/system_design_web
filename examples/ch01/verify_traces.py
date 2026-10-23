"""Deterministic contract model, not a network/cache implementation.
Run: python3 examples/ch01/verify_traces.py
Checks the displayed pseudocode matches its source and exercises branch boundaries.
"""
from dataclasses import dataclass
from html import unescape
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
page = (ROOT / 'chapters/ch01.html').read_text()
shown = unescape(re.search(r'<pre[^>]*><code[^>]*>(.*?)</code></pre>', page, re.S)[1])
assert shown == Path(__file__).with_name('product-read.pseudo').read_text()

@dataclass
class Entry:
    row: str
    valid_until: float

@dataclass
class Case:
    now: float = 0.0
    cached: Entry | None = None
    grant: str = 'GRANTED'
    result: str = 'ROW'
    read_duration: float = .05
    clock_bound: bool = True
    final_send_delay: float = 0.0
    store_calls: int = 0
    admission_calls: int = 0
    fills: int = 0
    filled: Entry | None = None

    def usable(self, entry):
        return entry is not None and self.clock_bound and self.now < entry.valid_until

    def reply_before(self, entry):
        # Models Edge's last check; the reserved send completion bound is assumed.
        self.now += self.final_send_delay
        return 200 if self.usable(entry) else 'ABORT'

    def get(self):
        if self.usable(self.cached):
            return self.reply_before(self.cached)
        self.admission_calls += 1
        if self.grant != 'GRANTED':
            return 503
        observed_at = self.now
        self.store_calls += 1
        self.now += self.read_duration
        if self.result in ('ERROR', 'TIMEOUT'):
            return 503
        if self.result == 'NOT_FOUND':
            return 404
        entry = Entry(self.result, observed_at + 30 - .3)
        if not self.usable(entry):
            return 503
        self.fills += 1
        self.filled = entry
        return self.reply_before(entry)

cases = [
    ('usable hit', Case(cached=Entry('v1', 29.7)), 200, 0),
    ('normal miss', Case(), 200, 1),
    ('cache down, denied', Case(grant='DENIED'), 503, 0),
    ('gate unavailable/unknown', Case(grant='UNKNOWN'), 503, 0),
    ('normal miss also gated', Case(grant='DENIED'), 503, 0),
    ('store timeout is not not-found', Case(result='TIMEOUT'), 503, 1),
    ('explicit absent row', Case(result='NOT_FOUND'), 404, 1),
    ('stalled old result, no fill', Case(read_duration=30.04), 503, 1),
    ('expired cached copy, no extra origin allowance', Case(now=30.04, cached=Entry('v1',29.7), grant='DENIED'),503,0),
    ('clock bound unavailable', Case(clock_bound=False),503,1),
    ('expiry at final sender', Case(now=29.69,cached=Entry('v1',29.7),final_send_delay=.02),'ABORT',0),
]
for name, c, expected, calls in cases:
    assert c.get() == expected, name
    assert c.store_calls == calls, name
    if expected != 200: assert c.fills == 0, name
    print('PASS', name)
normal = cases[1][1]
assert normal.filled.valid_until == 29.7  # does not become fill_time + 30
assert not Case(now=30.04).usable(normal.filled)
assert all(c.admission_calls == 1 for _, c, _, calls in cases if calls == 1)
# Pure arithmetic: overhead/reserves and query-cost assumptions are in prose.
assert 8_640_000 * 10 / 86_400 == 1000
assert round(1 - 80 / 5000, 4) == .984
assert round(1 - 80 / 50000, 5) == .9984
assert 5000 - 80 == 4920
print('PASS immutable fill deadline, attempt accounting, page/source parity, capacity arithmetic')
print('LIMIT: no distributed gate, clock-bound, transport-abort, load or failover test')
