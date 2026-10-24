# Ch32 · Gateway admission and accounting

`ledger.py` is a Python 3.11+ teaching example using the standard-library SQLite adapter.
The recorded run uses Python 3.11.8 and SQLite 3.51.0. Run from the repository root:

```sh
python3 examples/ch32/check.py
node examples/ch32/sync.mjs --check
```

`check.py` creates disposable **file databases**, uses separate connections for
concurrent budget/identity/settlement operations, exits actual subprocesses inside
and after transactions, then reopens the database. It writes retained results to
`docs/reviews/ch32-ledger-results.json`; temporary test databases are removed.
There is no Python mutex protecting ledger correctness.

`reserve_first` atomically creates the unique request and first attempt plus hold.
Only its original `created=True` result permits one dispatch; a replay or lost
commit acknowledgment must not dispatch again. `reserve_fallback` checks the same
request row as `claim_commit`, leaves unresolved a1 holds intact, and creates at
most a2. `close_if_selected` prevents old a1 from closing a2. Owner tokens identify
the one worker permitted to deliver an attempt; there is no lease takeover or
live-stream migration in this model.

Before settlement, trusted `bind_upstream(db, tenant, rid, n, owner, upstream_id,
served_model)` binds the network response/report identity to that exact attempt.
The immutable expected model is recorded at reservation; `model=` supplies it,
or the default uses the pool string as a teaching shorthand. A real deployment
keeps provider, quota group, deployment and model revision as distinct fields.
`settle(..., upstream_id=..., served_model=...)` checks the binding and accepts only
final evidence. Same-attempt duplicates do not debit again; changed final evidence
raises `Conflict` for review. A provider request identity cannot be assigned to two
attempts in one pool. The evidence string is a stable digest/identifier supplied
by a trusted adapter, **not a client-controlled authorization proof**. The adapter
must verify that the response/report belongs to the actual invocation; strings
inside this example cannot prove that a remote request was executed.

Budget units are cumulative total tokens under a stated safe bound, not currency,
supplier RPM/TPM or an invoice. Attempts retain price revision for a separate
category-specific billing calculation. Late usage stays in the original period;
calendar resets are not implemented. An exceeded usage bound records debt and
blocks new admission, exposing the broken hard-bound premise. Provisional estimates
do not become final debits in this model.

`route.pseudo` and `stream.pseudo` are **protocol pseudocode**, not executable HTTP
or provider clients. Current authorization, canonicalization, immutable route
configuration, safe token bounds, final-evidence authentication, shared rate and
remote-concurrency permits are explicit adapter contracts. The cache-hit service
record uses the same unique `(tenant,rid)`/digest namespace, but its storage and
response replay are not implemented by the miss-side SQLite model. All public
bytes, including empty success/heartbeats, require the same selected-owner barrier.
Failure class and cost uncertainty are independent: disconnect/blocked write,
parser/size/schema error, access denial and safety refusal cannot trigger fallback.

The streaming design caps read/event/encoded-event payloads at 16 KiB and awaits
each write before another read, under a 64-KiB application-payload budget. This is
not a bound on TLS, socket, object, Unicode-string or full-answer cache memory.
No real parser, provider stream, HTTP prefetch, cancellation completion or remote
slot-release behavior was executed. Manual traces are retained separately.

The example does **not** verify PostgreSQL locks/failover, a distributed DB,
real upstream idempotency/reporting, SDK retry configuration, a production
tokenizer, API pricing, network SSE, authorization infrastructure or throughput.
PostgreSQL ports must select a consistent row-lock order, handle uniqueness and
deadlock retries, and recover unknown commit outcomes without redispatch.

The chapter’s four displayed blocks are copied from these exact files/regions;
`sync.mjs --check` compares decoded source bytes after the common HTML escaping.
