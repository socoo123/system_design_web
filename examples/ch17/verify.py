"""Independent contract models for pseudocode adapters, not their production implementations."""
from dataclasses import dataclass
from pathlib import Path
import hashlib, json, subprocess
from types import MappingProxyType
root = Path(__file__).resolve().parents[2]
checks = []
def check(ok, label):
    if not ok: raise AssertionError(label)
    checks.append(label)

@dataclass(frozen=True)
class Snapshot:
    version: int
    target: str
    required_scope: str
    security_live: bool = True
@dataclass(frozen=True)
class Auth:
    tenant: str
    subject: str
    scopes: frozenset

def entry(headers, verify, snap, hook=lambda: None):
    # Contract model only: verifier and route/parser adapters are injected.
    if not snap.security_live: return (503, None, None)
    clean = {k.lower(): v for k, v in headers.items()
             if not (k.lower().startswith(('x-internal-', 'x-forwarded-'))
                     or k.lower() in ('forwarded', 'x-canary', 'x-user-id', 'x-tenant-id'))}
    hook()
    status, auth = verify()
    if status != 200: return (status, None, None)
    if snap.required_scope not in auth.scopes: return (403, None, None)
    return (200, (auth.tenant, auth.subject, snap.version, snap.target), clean)

s42 = Snapshot(42, 'orders-v2', 'read')
s43 = Snapshot(43, 'orders-v1', 'write')
auth = Auth('t1', 'alice', frozenset({'read'}))
active = [s42]
def update(): active[0] = s43
headers = {'Authorization': 'opaque', 'X-User-Id': 'admin',
           'X-INTERNAL-TENANT': 'other', 'Forwarded': 'for=127.0.0.1',
           'X-Forwarded-For': '127.0.0.1', 'x-canary': 'true', 'Accept': 'application/json'}
r = entry(headers, lambda: (200, auth), active[0], update)
check(r[1] == ('t1', 'alice', 42, 'orders-v2'), 'request pins old route and permission through publication')
check(set(r[2]) == {'authorization', 'accept'}, 'case-insensitive reserved header strip')
check(headers['X-User-Id'] == 'admin', 'cleaning does not mutate request input')
check(entry(headers, lambda: (200, auth), active[0])[0] == 403, 'new request gets new snapshot and scope')
check(entry(headers, lambda: (401, None), s42)[0:2] == (401, None), 'invalid credential cannot create context')
check(entry(headers, lambda: (503, None), s42)[0:2] == (503, None), 'verification unavailable fails closed')
check(entry(headers, lambda: (200, auth), Snapshot(42, 'v2', 'read', False))[0] == 503, 'expired security policy rejects')
check(headers['X-User-Id'] != auth.subject, 'counterexample: public identity header would impersonate admin')
check(('t1','a:b','c') != ('t1:a','b','c') and ':'.join(('t1','a:b','c')) == ':'.join(('t1:a','b','c')), 'counterexample: raw delimiter concatenation collides')

class Bucket:
    def __init__(self, now=0): self.tokens = 0.0; self.last = now
    def take(self, now):
        self.tokens = min(100, self.tokens + max(0, now-self.last)*0.1)
        self.last = max(self.last, now)
        if self.tokens < 1: return False
        self.tokens -= 1
        return True
class Request:
    def __init__(self): self.chosen = None; self.forwards = 0
    def resolve(self, verdict, safe, owner, bucket, now):
        if self.chosen is not None: return self.chosen
        if verdict == 'ALLOW': self.chosen = 'ALLOW'
        elif verdict == 'DENY': self.chosen = 429
        elif safe and owner and bucket.take(now): self.chosen = 'DEGRADED'
        else: self.chosen = 503
        if self.chosen in ('ALLOW', 'DEGRADED'): self.forwards += 1
        return self.chosen

bucket = Bucket()
check(not bucket.take(0), 'new fallback bucket starts empty')
check(bucket.take(10), '100/s earns one token in 10ms')
check(not bucket.take(10), 'one token can be consumed once')
check(not bucket.take(5), 'backward sample grants no refill')
check(not bucket.take(10), 'backward sample does not move last backward')
check(sum(bucket.take(1010) for _ in range(200)) == 100, 'fallback capacity clamps to 100')
req = Request(); b = Bucket()
check(req.resolve('ALLOW', False, True, b, 0) == 'ALLOW' and req.forwards == 1, 'normal allow forwards once')
check(req.resolve('ALLOW', False, True, b, 0) == 'ALLOW' and req.forwards == 1, 'late duplicate allow does not forward twice')
req = Request(); check(req.resolve('DENY', True, True, b, 5000) == 429 and b.tokens == 0, 'known deny never falls back')
req = Request(); check(req.resolve('UNKNOWN', False, True, b, 5000) == 503, 'risky unknown rejects')
req = Request(); check(req.resolve('UNKNOWN', True, False, b, 5000) == 503, 'unconfirmed owner disables fallback')
req = Request(); check(req.resolve('UNKNOWN', True, True, b, 0) == 503, 'safe read with empty bucket rejects')
req = Request(); check(req.resolve('UNKNOWN', True, True, b, 1000) == 'DEGRADED', 'approved safe read consumes bounded emergency token')
check(req.resolve('ALLOW', True, True, b, 1001) == 'DEGRADED' and req.forwards == 1, 'late Redis allow cannot change chosen path')
check(req.resolve('DENY', True, True, b, 1002) == 'DEGRADED' and req.forwards == 1, 'late Redis deny cannot revoke chosen path')
# A timeout can occur after the authority actually debited. UNKNOWN must not refund.
authority_tokens = 2; authority_tokens -= 1
req = Request(); check(req.resolve('UNKNOWN', False, True, Bucket(), 1000) == 503 and authority_tokens == 1, 'lost debit response stays charged without automatic refund')
check(req.resolve('ALLOW', False, True, Bucket(), 1001) == 503 and req.forwards == 0, 'late allow after 503 cannot dispatch')
# Four fixed owners reach their bound, without resetting on every dependency outage.
pool = [Bucket() for _ in range(4)]
first = sum(owner.take(1000) for owner in pool for _ in range(100))
second = sum(owner.take(2000) for owner in pool for _ in range(100))
check(first == 400 and second == 400, 'fixed four owners admit 400 burst then 400 after one second')
check(sum(owner.take(2000) for owner in pool) == 0, 'dependency recovery/failure does not refill')
check(first + second <= 400*1 + 400, 'one-second interval follows 400Δ+400 bound')
restart = Bucket(999000); check(not restart.take(999000), 'restart is empty at the actual monotonic origin, not another burst grant')
# Explicit unsafe alternatives demonstrate where the same claim fails.
check(8*100 > 400, 'counterexample: eight owners double the stored burst')
check(3*400 > 400*0.01 + 400, 'counterexample: three full resets within 10ms violate bound')
# Recomputed teaching numbers, no performance experiment.
check((10000 + 3999)//4000 + 1 == 4 and 3*4000 == 12000, 'four gateways survive one instance loss')
check(10000*(2000+4000)*8 == 480000000, 'both-side body bytes need 480Mb/s per direction')
check(10000*0.0002 == 2, 'validation CPU is two aggregate cores')
check(1000000*100*2 == 200000000, 'two nominal bucket copies total 200MB before overhead')
check(max(80,40,120)+20 == 140 and 80+40+120+20 == 260, 'BFF parallel and serial examples')
check(10000*0.24 == 2400 and 3*800 == 2400, 'slow-path slots after one loss')
check(2*80+20+20 == 200 and 2**3 == 8, 'one retry budget and multilayer amplification')
check(10000*0.05 == 500 and 4*125 == 500, 'retry steady earning and stored burst are different quantities')
check(10000*300*3600 == 10800000000, 'peak one-hour log volume is 10.8GB')
subprocess.run(['python3', str(root/'examples/ch17/sync.py'), '--check'], check=True)
result = {'passed': True, 'checks': len(checks), 'names': checks,
          'kind': 'independent adapter contract models and arithmetic; not real HTTP/JWT/Redis/deployment tests',
          'htmlSha256': hashlib.sha256((root/'chapters/ch17.html').read_bytes()).hexdigest()}
(root/'docs/reviews/ch17-code-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(f'PASS {len(checks)} contract/arithmetic checks; independent models only')
