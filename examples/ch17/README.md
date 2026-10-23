# Ch17 API gateway — executable core and adapter contracts

The page has five source-synchronized snippets: two pseudocode adapters and three
Java 17 teaching excerpts. `GatewayPolicy.java` includes imports, surrounding
classes, records and all method bodies; `GatewayPolicyTest.java` executes that
actual local core without third-party Java dependencies. This is not an HTTP
server or a distributed implementation.

From the repository root:

```sh
python3 examples/ch17/sync.py --check
python3 examples/ch17/verify.py
CH17_BUILD=$(mktemp -d /tmp/ch17-java.XXXXXX)
/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin/javac -d "$CH17_BUILD" examples/ch17/GatewayPolicy.java examples/ch17/GatewayPolicyTest.java
/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin/java -cp "$CH17_BUILD" GatewayPolicyTest
```

`sync.py` copies `.pseudo` sources and the Java `BEGIN PAGE name`/`END PAGE name`
regions into `data-source` code blocks. `--check` compares decoded text exactly.

## Entry: pinned policy, authenticated context, proxy provenance

Input is an external business HTTP request and trusted transport metadata. Output
is a routed response or explicit 401/403/404/429/503/504. The immutable snapshot
includes route normalization/matching, audience/scopes, issuer policy, rollout salt,
quota and deadline settings. Its publisher fully validates it before publishing
one reference via, for example, Java `AtomicReference.set`. Each request performs
one `get`, retaining the object until it ends; rollback changes subsequent reads.
This is process-local atomic publication, not coordinated whole-region activation.
Security policies have explicit expiry; expiry and JWT validation use UTC with a
monitored conservative clock-error allowance, not Java monotonic elapsed time.

The parser rejects malformed hosts, ambiguous/duplicate credentials, encoded
separators, dot-segment ambiguity and parser-disagreement cases. Route policy,
authorization, forwarding and backend decoding must identify the same resource;
normalization is a configuration/HTTP-adapter contract, not an implemented parser.
Host/method/path priority is explicit, including denied defaults and inaccessible
internal hosts. Unknown route is 404; parsing errors use an appropriate 4xx.

`verify_access` is an unimplemented cryptographic adapter: known issuer allowlist,
fixed trusted JWKS endpoint, constrained algorithms, signature, access-token type,
exact issuer, audience, exp/nbf with bounded skew, required claims and an issuer-
authorized tenant mapping. Unverified iss/kid only select constrained lookup;
they never become permission. Under RFC 9068 typ accepts at+jwt or
application/at+jwt. Invalid credentials produce 401 with a Bearer challenge;
insufficient scope gives 403; unavailable validation infrastructure gives 503.
Bound/coalesce key refresh and negative caching. Unknown key after a successful
trusted refresh is invalid; inability to obtain any usable verification key is
unavailability. No raw bearer credential enters logs.

At the external boundary remove reserved internal identity headers, Forwarded,
X-Forwarded-* and untrusted canary markers. Context is a new object from validation,
then serialized through a controlled internal protocol. Services accept this only
from authenticated, authorized gateway/BFF mTLS identities over restricted ingress;
BFF authority is limited to preserving authorized context, not arbitrary escalation.
Services still enforce object ownership. End-to-end token validation or signed
context is an alternative trust model, not included in the example.

The L4 LB passes TLS through to Gateway. Original client address, if needed for
public coarse limiting, comes only from a protected listener with authenticated/
restricted LB provenance, such as PROXY protocol restricted to registered LBs.
If reliable metadata is unavailable, client IP is unavailable; the LB's address
cannot pretend to be a fair per-client identity. Arbitrary public header prefixes
are never trusted. HTTP Via handling, hop-by-hop header removal, framing, TLS,
streaming, request-smuggling protection and complete HTTP conformance belong to
the real HTTP adapter and are not implemented here.

## Admission: three outcomes and bounded emergency owners

The limiter adapter issues at most one logical token-bucket decision per original
request. It uses one short Redis script over a single encoded tenant/subject/route
key: refill, clamp, conditional debit and idle TTL together. Its clock, TTL and
sharding assumptions follow Ch04; this chapter does not reimplement that script.
A definite ALLOW forwards; DENY returns 429 plus a wait hint. Timeout or transport
failure is UNKNOWN even if Redis already debited. No automatic retry/refund occurs,
and late completion cannot change the request's chosen response or forward again.
The 5 ms local wait cap fits inside the fixed request deadline. Quota-client active
operations are bounded; timeout cancels locally best-effort without claiming Redis
rollback. A final deadline check precedes forwarding, even after ALLOW.

UNKNOWN gives risky routes 503. Only explicitly approved public safe reads can
use a process-local emergency aggregate bucket. Four non-overlapping owner slots
have capacity 100 and rate 100/s each. Every new/restarted bucket starts empty.
Buckets never reset when entering/leaving fallback. A controller must prevent
old/new overlap, verify old admission stopped before reassignment, freeze scale-out,
and disable fallback if that ownership policy cannot be guaranteed. There is no
per-process code that can independently establish this deployment guarantee.
Within an interval Δ, at most 400Δ+400 admissions hold under that fixed-owner
contract and elapsed-clock assumptions. Clock progress is local monotonic and
within the controller's elapsed-time tolerance. Excess fallback work returns 503.
The core model does not exercise real deployment fencing or clock drift.
This loses per-user fairness and does not replace strict billing or inventory.

## Deadline/replay: one local expiry, no automatic non-idempotent proxy retry

Times in the core are milliseconds from one monotonic clock domain, sampled by
production code from `System.nanoTime` elapsed time, not wall-clock timestamps.
At receipt pin end=received+300. After policy compute upstreamEnd once as
min(now+240,end-40); keep it across every attempt and sleep. Absolute monotonic
values never cross machines. Protected remaining duration needs a known conservative
transmission/queue bound deducted downstream; alternatively use authenticated UTC
expiry with a monitored clock-error bound. Without those bounds the guarantee is
Gateway's own deadline only. Remote effects can outlive timeout/cancellation.

Replay eligibility is intentionally narrower than HTTP idempotence: GET/HEAD only,
a bounded fully buffered/reopenable body, no response sent, one prior attempt,
configured transport failure/timeout, and at least 20 ms after backoff. Per try is
min(80,remaining); jittered backoff is capped at 20 ms. Time/cancellation is checked
again on wake and immediately before actual dispatch. If response bytes started,
terminate/reset rather than attempting a new status response. Ordinary HTTP errors
including 429/503 are not automatically retried by this core. RFC 9110's proxy
MUST NOT retry non-idempotent requests is not relaxed by an Idempotency-Key header.
POST business recovery requires a separate durable backend contract in Ch18.

## Credits, active streams and breaker integration

Each admitted original earns one twentieth of a retry, with integer remainder,
empty initial credit and maximum 125 stored credits per process. Each credit funds
at most one extra attempt and is never refunded. Retried attempts earn no credit.
For each process lifetime R_i<=floor(O_i/20), so summing processes and lifetimes
still gives cumulative R<=O/20. Lost credits on crash/restart only reduce retries.
This is not a sliding per-second ratio: stored credits can burst later. Four fixed
instances store at most 500 credits; steady 10K original QPS can earn about 500/s,
not a hard arbitrary-one-second 10,500-attempt rate limit. More instances change
burst storage, so the stated burst applies to the fixed pool; a strict attempt
rate limiter is separate. Configure one retry owner across Gateway/BFF/clients.

The stream semaphore caps this instance's local active upstream transport streams
at 800, with no hidden queue. It does not count remote transactions after transport
termination. A logical timer/caller error does not release a permit; actual local
termination/close does. Atomic terminal completion releases at most once.
The adapter retains the permit while aborting a stream and must not silently drop
unresolved operations from accounting. Stream setup failures and dispatch abandoned
before starting also release their unused permit. HTTP/2 streams are not connections.
After one gateway loss, 3x800=2400 local slots matches the illustrative slow path;
it does not prove throughput or bound remote business execution.

Integration order for a retry:

1. Ensure the prior local stream terminated; never hedge automatically.
2. Bounded jittered backoff, then recheck deadline and client cancellation.
3. Consume a retry credit, then acquire a stream slot without queueing.
4. Obtain a breaker ticket, then recheck deadline/cancellation immediately before dispatch.
5. If a later gate rejects, release the unused slot; consumed credits stay spent.
   An admitted probe abandoned before dispatch completes as a failed probe.
6. On actual terminal callback release the stream slot and complete its ticket
   exactly once. Classify the outcome using explicit health policy.

Initial requests count one admitted original and go through slots/breaker without
consuming retry credit. Neither 429/503 local rejection nor business 4xx counts as
upstream health failure. Timeout, connection failure and transport reset do under
this policy. Health samples are terminal callbacks observed under the Breaker monitor within a local ten-second window,
at least 100 calls, failure ratio>=50%. Open waits five seconds, then Half-open
admits exactly one local probe. Probes use stream capacity and the fixed deadline,
never retry, and remain occupied until local transport ends. Success immediately
closes; failure waits another five seconds. `Breaker(LongSupplier monotonicMs)` injects a nondecreasing elapsed-millisecond
clock. The default constructor uses System.nanoTime elapsed from a private origin.
Both `enter()` and `complete(ticket, ok)` sample this clock only after acquiring
the same monitor. No external event-time/nowMs argument is accepted. The ten-second
observation window and five-second cooldown share this domain; lock waiting counts
toward elapsed cooldown and a blocked terminal callback starts a new cooldown only
when actually observed. Delayed callbacks count at observation time, not original
network completion time. Thus 99 old physical failures observed together at 10001ms
can legitimately trigger OPEN in that observation window. Scheduling delay postpones
health information and is not silently treated as original completion timing.
State epochs and per-ticket done flags reject stale/duplicate completions. A newly
CLOSED state remains bounded by external rate/stream admission. The exact per-sample
queue and scan are educational and allocate/work proportional to window traffic;
production should bound storage/statistics while preserving the stated semantics.

This optional health breaker is independent of Envoy's documented connection,
pending, active-request and active-retry resource limits. No global one-probe
claim is made. Four fixed instances can have four active probes.

## Verification limits

Java tests run the actual policy core, including simultaneous credit consumption,
slot release and probe admission. Python checks independently exercise the stated
entry and fallback adapter contracts and counterexamples. Neither validates JWT
cryptography, an HTTP parser/transport, Redis replication/durability, mTLS, real
configuration rollout, cross-host clocks, deployment fencing or production load.
Those adapters and their infrastructure must be implemented and tested separately.
