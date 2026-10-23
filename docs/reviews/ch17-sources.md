# Ch17 source verification — 2026-10-23

All protocol/product facts below were reopened online during this batch. Envoy
links are fixed to **v1.36.0**, not the moving `latest` development documentation.
Numbers (4K usable capacity, CPU cost, token life, 20/s, fallback caps, deadlines,
retry credits and health thresholds) are teaching assumptions/derived models.
Sources do not provide these workload measurements or this custom gateway policy.

| Page ref | Primary source and section | Specific supported claim | Design choice / boundary |
|---|---|---|---|
| [1] | [RFC 8725 §§3.1,3.8–3.12](https://www.rfc-editor.org/rfc/rfc8725.html) | Check algorithms/issuer/audience; separate token purposes; arbitrary jku/x5u can introduce SSRF. | Fixed JWKS allowlist, tenant mapping, refresh/negative-cache caps are our adapter policy. No actual signature verifier runs here. |
| [2] | [RFC 9068 §4](https://www.rfc-editor.org/rfc/rfc9068.html#section-4) | Resource server validates type, issuer, audience, signature and expiry; typ accepts at+jwt or application/at+jwt. | ID-token substitution is rejected under this access-token profile. |
| [3] | [RFC 6750 §§2,3,3.1](https://www.rfc-editor.org/rfc/rfc6750.html) | Protect bearer credentials; invalid token ordinarily 401 with challenge, insufficient scope 403; malformed/repeated credential requests are distinct invalid_request/400. | Auth infrastructure unavailable is our 503 policy, not proof of an invalid token. |
| [4] | [Redis scripting introduction](https://redis.io/docs/latest/develop/programmability/eval-intro/) | Redis executes scripts atomically and blocks other activities during execution. | Atomic execution is not persistence or failover safety. Ch04 owns detailed limiter Lua/time/TTL teaching. |
| [5] | [RFC 6585 §4](https://www.rfc-editor.org/rfc/rfc6585.html#section-4) | 429 indicates rate limiting; Retry-After may be included; identity and counting algorithms are unspecified. | We attach a wait hint for definite DENY. UNKNOWN and emergency capacity failures use 503. |
| [6] | [RFC 9110 §§9.2.2,15.6.4,15.6.5](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2) | Idempotence concerns intended effects. Proxy **MUST NOT** automatically retry non-idempotent requests. 503 is unavailable service; 504 is gateway timeout awaiting upstream. | Our proxy allows only GET/HEAD automatic retry and no retry for HTTP statuses. POST business-key recovery is a separate application/backend contract. Fully replayable body, no started response and one prior local terminated stream are additional gates. |
| [7] | [Envoy v1.36 xDS ACK/NACK summary](https://www.envoyproxy.io/docs/envoy/v1.36.0/api-docs/xds_protocol#ack-and-nack-semantics-summary) | ACK is isolated validity/intent and does not establish successful application; NACK need not mean no resources accepted. | Full validated immutable local snapshot publication is our additional contract, not a whole-region xDS transaction. |
| [8] | [Envoy v1.36 circuit breaking](https://www.envoyproxy.io/docs/envoy/v1.36.0/intro/arch_overview/upstream/circuit_breaking) | Connection, pending request, active request, active retry and pool resource limits are distinct. | Our ten-second/100-call/50% breaker counts terminal callbacks observed under its own monitor, not original network completion timestamps. This and one probe per instance are not Envoy defaults. Envoy's connection-limit exception is not modeled as an exact local semaphore guarantee. |
| [9] | [Envoy v1.36 HTTP routing](https://www.envoyproxy.io/docs/envoy/v1.36.0/intro/arch_overview/http/http_routing) | HTTP router selects upstream clusters and supports virtual hosts, path/header policies and traffic splitting. | Specific-before-default matching and identity-cohort 90/10 split are explicit configuration choices; no exact request-share guarantee. |
| [10] | [RFC 7239 §8.1](https://www.rfc-editor.org/rfc/rfc7239.html#section-8.1) | Clients and intermediaries can modify Forwarded; header content alone is unreliable without controlled trust/protected communication. | Public chain prefixes ignored; original IP only from protected LB transport provenance. PROXY-protocol deployment/parser is not implemented. |
| [11] | [Redis replication](https://redis.io/docs/latest/operate/oss_and_stack/management/replication/) | Default replication is asynchronous; even WAIT does not make a strongly consistent CP system and acknowledged writes may be lost on failover. | No claim that admission state is a billing ledger; no real Redis failover experiment. |
| [12] | [Java SE 17 System.nanoTime](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/System.html#nanoTime()) | Elapsed time only; arbitrary origin and values meaningful only in the same JVM time source. | Core receives test-controlled monotonic ms. Cross-host remaining durations require transport/skew bounds for downstream absolute-expiry guarantees; otherwise only Gateway's own waiting is bounded. |

No external source claims that retries are hard-capped at 10,500 in every second.
The implemented earned-credit invariant is cumulative R≤O/20; four instances may
spend up to 500 previously accumulated credits. At steady 10,000 originals/s,
500 extra attempts/s is an estimate of earning rate, not an instantaneous ceiling.
Similarly the fallback 400Δ+400 bound relies on fixed non-overlapping owners,
empty startup, no state reset and controlled elapsed-clock behavior. Local code
cannot establish those deployment prerequisites by itself.
