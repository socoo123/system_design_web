# Ch24 payment teaching contracts

The page contains eight shared-source SQL/pseudocode blocks. They are teaching
contracts, not a compilable Java service or a live payment integration.

Run from the repository root:

```sh
node examples/ch24/sync.mjs --check
python3 examples/ch24/check.py
node tools/audit-chapter.mjs ch24
```

Python 3.9+ and its standard-library SQLite are sufficient. No credentials,
network call, third-party dependency, or production database is used.
`schema.sql` followed by `keys.sql` installs the executable SQLite model schema.
`model.py` executes corresponding local transactions; `check.py` tests actual
SQLite writes, two-connection competitions, and deliberate crash points.

## Contracts the pseudocode depends on

- The merchant and environment come from authentication. `verifyOrderAndPrice`
  returns immutable server facts including authorized business version/method.
  The shown call site explicitly compares body version/method, then derives
  identity/digest/frozen payload only from those quote facts. A client-incremented
  version is rejected before insertion. `Store.create_request` models this raw
  boundary using a `VerifiedQuote` supplied by a trusted adapter; the lower-level
  `Store.create(...version=...)` is explicitly an already-verified fixture entry,
  not a browser/API entry. The quote service and authentication are dependencies,
  not implemented by the dataclass. Raw amount fields do not override the quote.
- Every request identity and scope is non-null. Request-key conflicts compare
  the complete digest; a business-intent conflict resolves the original payment.
  Restart the transaction after an identified unique race. Never interpret an
  arbitrary database error as a harmless duplicate.
- `begin transaction` uses one authoritative relational database. In PostgreSQL,
  lock the payment/attempt rows consistently and use the non-null UNIQUE keys.
  SQLite `BEGIN IMMEDIATE` serializes writers for these examples; it does not
  prove PostgreSQL row-lock, replication or failover behavior. Production
  permissions must restrict raw journal INSERT to the controlled posting path.
- `verifiedEvidence` is produced by a trusted provider adapter, with environment,
  account, original attempt/refund, provider object, currency, amount and final
  outcome verified. The fixture `verified=True` models this dependency; it does
  **not** implement or test any provider's signature algorithm or SDK.
- A webhook uses the raw body and provider SDK with the server-selected secret
  and timestamp tolerance, then commits durable inbox before returning success.
  Worker claims have expiring leases; only a matching token may mark a claim
  complete. Expired workers still need the financial effect gate.
- A provider replay key is immutable for its account, operation and frozen
  payload. The Stripe examples explicitly refer to **API v1**, not v2. V1
  same-key retries stay within the first 24 hours of the original request; cached
  500 responses may remain indeterminate. Other operations/providers require
  their own contract.
- `safeReplayWindow` is conditional. Local pre-send checks or HTTP deadlines do
  not fence a paused process, a delayed in-flight request, or the PSP. Automatic
  replay requires verified provider retention and bounded scheduling/transport
  delay with clock margin. Otherwise query the already-bound provider object or
  retain Review. Do not claim exactly-once under arbitrary process suspension.
  A new attempt also requires the old object/command to be permanently unable
  to charge; neither missing lookup results nor elapsed time proves that.
- `insertPostingUnique` is an ordinary constrained INSERT in the same local
  transaction, not a magical duplicate suppressor. A conflict compares all
  bindings; one external refund cannot settle two local reservations. Complete
  debit/credit templates, amount/currency validation, state and notification
  intent commit together. A row CHECK cannot enforce cross-row balance.
- Refund reservations and results lock the same payment aggregate. Positive
  signed-64-bit integer values are required; Python bool is explicitly rejected.
  Unknown/pending results retain reservation. Irrevocable no-refund releases
  once; success converts reservation and journals once. Terminal contradictions
  retain evidence for Review rather than silently modifying history.
- The account example assumes an unsettled PSP receivable, no merchant payout,
  platform-borne fees, and no fee reimbursement. Fees, reversals, suspense
  handling, settlement, payout and dispute ledgers are separate operations;
  `schema.sql` deliberately covers only CAPTURE and REFUND.
- Reconciliation W denotes a retained consistent snapshot/dataset, not a raw
  maximum sequence ID. Report completeness and provenance must be established.
  Repairs route through the original effect gate; cases are closed only after
  a known commit. Unassociated/external-only refunds stay Review until the
  original operation has been safely bound.

## What the checks establish

Normal create/capture/refund paths; same-key and rotated-header retries;
concurrent creates; delayed timeout after confirmation; fixed replay windows;
invalid adapter-authentication boundary; repeated events and distinct events for
one effect; incorrect amount/account/currency; complete balanced entries;
transaction rollback after one entry; simultaneous refund reservations; UNKNOWN
capacity retention; duplicate success and stale failure; repair committed before
case closure; append-only history; explicit SQLite TEXT-PK NOT NULL rejection.

The provider is an in-memory **contract fixture** independent of the DB. Its
within-window deduplication is assumed, not a proof of a live provider.
No real PSP/SDK integration, network deadline/clock experiment, PostgreSQL
replication/failover test, load test or production availability claim is made.
