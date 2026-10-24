# Ch33 · action-bound tool execution

The page has three pseudocode blocks, synchronized verbatim from `admission.pseudo`,
`approval.pseudo`, and `effect.pseudo`. They are teaching contracts, not executable
Java. The separately executable `model.py` uses Python 3 standard-library SQLite;
each operation opens a fresh connection and executes one local database transaction.

```sh
node examples/ch33/sync.mjs --check
PYTHONDONTWRITEBYTECODE=1 python3 examples/ch33/check.py
node tools/audit-chapter.mjs ch33
```

`check.py` writes its observations and source hashes to
`docs/reviews/ch33-code-results.json`. It exercises two separate SQLite files,
multiple concurrent connections, real SQL triggers that abort transactions,
and injected delivery/response loss between commits. No packages or credentials
are required. A start barrier only coordinates concurrent test arrival; no local
mutex implements the database guarantee. SQLite `BEGIN IMMEDIATE` serializes all
writers of one file, more coarsely than a production database's row locks.

The bounded parser supports only the closed, flat `ticket.close r7` schema. It
rejects duplicate keys, excessive byte/depth limits, extra/missing fields, floats,
booleans and strings in integer fields. It sorts exact validated JSON fields;
it is not RFC 8785, a general JSON Schema validator, or universal Unicode/numeric
canonicalization. Gateway-generated grant ID/expiry/retention are created only for
a new intent; retries compare the immutable proposal and retain the original
snapshot. Changing a caller, tool, route or parameters never creates a second
effect under an old approval.

Identity, approver sessions/scopes, trusted monotone fixture time and the
authenticated gateway-to-backend envelope are injected premises. Production must
implement audience-bound credentials/delegation and protect the database write
paths. No signature/token issuer is implemented. Gateway `Resource` is an admission
view, not an atomic read of BusinessDB; backend tenant/version/permissions are
authoritative at the effect transaction. Revocation before local claim blocks it;
revocation between claim and remote commit needs backend checks. Gateway/Backend
permission stores do not claim instantaneous distributed synchronization.

Approval consumes a single grant in the same ExecutionDB transaction as APPROVED
and its audit event. Dispatch performs a second transaction, rechecks current
identity/tool/route/policy/expiry, stores DISPATCH_INTENT/epoch/event, then sends.
After an ambiguous dispatch commit, an actual network layer must first read back
the same record; it cannot infer noncommit. The local adapter does not simulate
ambiguous SQLite commit acknowledgements or operate a network sender.

BusinessDB checks an existing same-key receipt before rechecking a new resource
version. New effects, conditions and receipt insert share one transaction. An
existing receipt survives changed versions/approval expiry, and body compaction
retains key/binding/outcome forever in this model. It does not execute email,
payment or any external effect inside the SQLite transaction. Such a third boundary
needs its own deduplication/status/outbox contract.

UNKNOWN is preserved when the backend has no receipt: an old delayed request may
still arrive. `replay_unknown` can execute an operation whose first send never
arrived, so it requires live authorization, unexpired approval, no cancel request,
the same route/key, and verified backend retention. Five minutes is stricter than
the assumed 24-hour dedupe window in this lesson; after expiry only status lookup
can repair the outcome. Lookup may continue after expiry because it creates no
effect, but public result disclosure still needs caller authorization. These
internal fixture lookup methods are not public HTTP endpoints.

Cancellation before claim serializes to known DENIED. After claim it records a
request and UNKNOWN; an already issued call may still commit, and reliable late
evidence may establish SUCCEEDED. Epoch changes reject old local result writers,
not remote effects. Backend tombstones prevent repeated effects even after body
compaction. The example does not reclaim UNKNOWN records or implement distributed
RPC quotas, remote quiescence/cancellation acknowledgements, MCP sessions, audit
archive delivery, physical deletion, replication, real tooling or production load.
