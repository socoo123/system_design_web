# Ch10 teaching implementations

The HTML shares five files from this directory: the conceptual data model,
acceptance pseudocode, PostgreSQL 18 claim SQL, send/result pseudocode, and
backoff/repair pseudocode. These are teaching fragments, not a runnable server.
No external dependencies or provider credentials are needed for the verifier.

```sh
python3 examples/ch10/sync.py --check
python3 examples/ch10/verify.py
```

After editing a shared fragment, run `python3 examples/ch10/sync.py`, then check
and verify again. The HTTP request/response example is data, not implementation.

Contracts omitted from the fragments are explicit:

- SQL parameters are bound; all state in a transaction uses one authoritative DB
  connection. A SELECT returning no row is different from a failed query.
  Confirm COMMIT before installing a claim or returning 202. A uniqueness loser
  rolls back before reading a new READ COMMITTED primary snapshot.
- `validate_new_request` checks server-authorized templates/priority and returns
  a fixed template version. Small recipient snapshots and encrypted payloads
  are stored in the accept transaction. External references must already be
  durable. `policy_for` supplies `max_sends` and `allow_unknown_retry` per channel.
  Ordinary SMS uses four reserved attempts, not a claim about another provider.
- `pre_send_gates` returns a tagged context: `decision`, provider adapter,
  fixed-template rendered message/address, attempted token version, and
  registration time. It checks durable accepted Attempt evidence before a send;
  then expiry, consent, quiet hours, atomic frequency reservation and quota.
  DEFERRED carries a future `allowed_at`. Dependency errors defer, never allow.
- ALLOW still requires a new-attempt reservation transaction. Under the Delivery
  row lock, check the current epoch, state, lease and business deadline, then
  `uncertain && !allow_unknown_retry` before reserving an Attempt or incrementing
  `send_count`. A match returns the local tagged decision UNKNOWN_STOP without a
  provider call. The result transaction records failed if its decision is before
  the business deadline, otherwise expired. Both retain uncertainty. Only a
  confirmed result commit permits ACK. `plan` also checks this policy
  before DEFERRED, so an early quiet-hour/quota/dependency deferral cannot keep
  unknown work scheduled. ACCEPTED, SUPPRESSED and already-expired work retain
  their existing precedence.
- Decisions are tagged records. Comparisons in pseudocode compare their tags;
  `message_id` defaults to NULL, including for local UNKNOWN_STOP, which has no
  provider result; its failed plan carries reason UNKNOWN_STOP. Ordinary SMS
  without extra bounds defaults
  `provider_not_before` to current DB time. FCM retryable failures always wait
  at least 10 seconds, including 500 without Retry-After. plan explicitly takes
  that floor from result-transaction time (later than observed failure), then
  any later 429 Retry-After/60-second or overall/topic 60-second floor.
  The adapter supplies provider, retryable_failure, http_status, retry_after,
  and quota_kind fields with safe empty defaults for other decisions.
  `plan` returns a record with status, nullable due time, and optional reason.
  The adapter catches network timeout/interruption as TIMEOUT_UNKNOWN. Retry
  bounds include Retry-After and provider minima; the 60-second cap is only for
  local ordinary-SMS backoff. FCM 429 without a header waits 60 seconds, and
  APNs 5xx waits 15 minutes. FCM's documented send-timeout recommendation is at
  least 10 seconds, so this chapter now uses 10 seconds instead of its old 5.
- APNs INVALID_TOKEN requires evidence that the attempted registration is not
  newer than the returned invalidation timestamp, including a known
  cross-system clock-error bound. Otherwise REGISTRATION_RECHECK stops this
  task without retiring the registration. This conservative policy is our
  teaching design, not an Apple promise of synchronized clocks. Every client
  re-registration increments version even if the token string is unchanged;
  the Device update also checks the attempted version.
- Lease budgets start before the claim request, use returned `claimed_at` to
  bound the earlier lease/business deadline, and subtract elapsed time and a
  safety margin. Maintaining clock-error bounds is a deployment prerequisite.
  These checks cannot prevent a pause after the final check or cancel an
  already-issued external request. `lease_epoch` rejects stale local writes;
  providers do not honor it as a fencing token.
- Any DB error or unknown preparation commit stops new calls and leaves the
  wake unacknowledged. Result persistence commits Attempt, active-epoch
  Delivery, and retry/DLQ outbox together. Stale epochs record their own Attempt
  evidence only. Queries expose scheduling state separately from Attempt and
  Receipt observations, including late acceptance after failed/expired.
- Outbox keys are namespaced by event kind. Relay claims publish epochs in a
  short transaction, calls the broker outside it, and marks only its own epoch
  after durable acknowledgment. It only publishes `ready_at <= now`. Repair
  initializes `last_woken_at` at acceptance, scans due/expired nonterminal work,
  and co-commits wake generation with a new outbox event without resetting the
  task state. Duplicates are expected and cannot bypass DB claim predicates.

`verify.py` uses real SQLite transactions/unique constraints for a deliberately
small serialized contract model. It tests normal flow, rollback, both callers
observing a miss, response/ACK loss, durable delayed work, first repair after an
owner crash, stale epochs, partial endpoint outcomes, and unknown external
acceptance. A provider stub is called only after a real model reservation; its
first accepted call can crash before result persistence. With unknown retries
disabled before that first call, reclaim and dispatch reserve no new Attempt,
increment no count and make no second provider call. The stop must commit before
ACK, and late accepted evidence remains visible. The same dispatch path also
demonstrates an allowed retry producing two injected external acceptances. It
checks early DEFERRED, accepted-evidence precedence, admission boundaries, source
equality and independently recomputes the chapter's numbers using rational arithmetic.

The model does not execute `claim.sql` against PostgreSQL, prove PostgreSQL
concurrency, implement provider/broker clients, test failover or clocks, or
benchmark production reliability. Those SQL semantics were checked in primary
documentation, listed in `docs/reviews/ch10-sources.md`.
