# Ch36 executable teaching examples

Run from the repository root (Python 3.10+, standard library only):

```sh
PYTHONDONTWRITEBYTECODE=1 python3 examples/ch36/run.py
```

- `partition.pseudo`: operation contract, not executable consensus. A complete external protocol must implement terms/elections/log safety, current-term commit and read barriers. `proposeAndApplyOnce` binds identity/payload, receipt and effect in one replicated state machine; a separate business database needs its own atomic boundary. UNKNOWN is not proof of noncommit.
- `tradeoffs.py`: deterministic histories for completed-write/stale-read CAP reasoning and a pending-write/new-old-read counterexample with N=3/W=2/R=2. This is local memory with scheduled events; it does not run, prove, or test a distributed implementation. Its nearest-rank percentile example shows why adding two dependency p99 values is insufficient.
- `slo.py`: immutable original start/eligibility across retries, logical-journey deduplication, deadline checks, integer-event allowance, exact rational burn, and a feature gate. The gate returns a decision string; it does not deploy anything.
- `run.py`: normal journeys and targeted failure/boundary cases, including incomplete write histories, lost/late replies, retry deadline reset, complete-cohort half-open windows, zero traffic, exhausted balance and paired burn thresholds.

Measurement contract: `Attempt.started_ms` is the original supported journey's first ingress time, saved before the outcome is known. Records use one measurement clock. Business ingress rejects reused identity with different parameters. At measurement `now_ms`, use `cutoff=now_ms-1000`; count first starts in `(cutoff-window_ms, cutoff]`, so every cohort gets its full one-second deadline. A timely, correct, durable APPROVED or DECLINED decision is good. Missing, late, incorrect, non-durable, UNKNOWN or PENDING outcomes are bad. A timely retry after UNKNOWN/PENDING or a retryable non-terminal failure can rescue the same journey within its original deadline; it never resets that deadline. `observed_ms` means actual delivery at the measured user boundary. Any APPROVED/DECLINED response delivered within that original one-second window with incorrect or non-durable flags vetoes good, even if a later retry succeeds. Business correctness errors beyond that fixed SLI window still require independent auditing. Eligibility cannot be changed by a retry.

The input must include a canonical ingress record for each eligible journey even when no reply arrives. The model cannot detect records absent from its input, infer real business correctness from status codes, authenticate clients, bind actual tenant scope, synchronize clocks, store production telemetry, or establish real durability. `telemetry_complete` is supplied by an external measurement-quality check. A zero denominator means no data. The complete-cohort measurement has one-second reporting lag; production ingestion lateness needs an explicit watermark/coverage policy too.

`BAD_PPM=1000` encodes SLO 99.9%. Whole bad events must satisfy `bad <= floor(eligible*1000/1_000_000)`. This example freezes feature expansion at integer remaining <=0 even when the SLO is still exactly met; that conservative release line is a policy. Monthly and all short windows must use the same SLI/service scope and cohort cutoff. Missing window names or malformed records raise an input error that the caller must handle as failed measurement. Low-traffic sample thresholds and reviewed urgent-repair exceptions need an additional team policy. No rollback safety or deployment adapter is implemented.

The page's four snippets are copied verbatim from `partition.pseudo` and marked regions in the Python files. Author evidence checks this equality. Teaching inputs are not production data, fault injection, a monitoring benchmark, or distributed-system proof.
