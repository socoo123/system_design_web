# Ch26 red packet teaching examples

Run from the repository root:

```sh
node examples/ch26/sync.mjs --check
python3 examples/ch26/check.py
node tools/audit-chapter.mjs ch26
```

`SplitPlan.java` is runnable Java 17 with no library dependencies. The page shows
its marked pure-function excerpt; `sync.mjs` checks that excerpt and the other
five complete displayed sources byte for byte. `claim.pseudo`, `ledger.pseudo`,
`expire.pseudo`, and `recover.pseudo` are teaching transaction contracts, not a
compilable Java service. `candidate.lua`, `install.lua`, and `activate.lua` execute
against Redis 7; every accessed Redis key is explicitly supplied in `KEYS`.

The check uses Python 3 standard libraries, an isolated Redis Unix socket with no
TCP listener, and temporary SQLite databases and Java class files. It cleans up
its own Redis process and temporary directory. It does not modify another Redis
service. Default Redis binary: `/tmp/redis-7.2.5/src/redis-server` (override with
`REDIS_SERVER`). Default JDK:
`/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home`
(override with `JAVA_HOME_CH26`). No `.class` or `.pyc` belongs in this directory.
Results: `docs/reviews/ch26-code-results.json`.

The executable `model.py`/`schema.sql` adapter uses real SQLite transactions and
multiple connections. `BEGIN IMMEDIATE` serializes all writers; the chapter's
PostgreSQL pseudocode instead acquires request and packet row locks in that
order under READ COMMITTED. SQLite is not proof of those PostgreSQL locking,
replication, clock or promotion properties. A confirmed receipt additionally
requires an authority that never promotes a replica missing acknowledged claims.

The server supplies identity/membership, packet ID, immutable share plan and UTC
deadline. `Store.create` is a fixture entry for these already validated inputs,
not a raw HTTP handler; its create digest includes the supplied plan. A real
handler first binds its sender-scoped request key to original business inputs
(total, count, mode, group, currency, deadline), then reuses the saved plan.
It must not generate a fresh random plan before replaying an existing intent.
Claims accept internal Lua candidates, never browser-selected share IDs or money.
HTTP keys are scoped by authenticated user and bind one packet; business claim
uniqueness additionally covers `(packet,user)` and `(packet,share)`.

The teaching policy fixes `expire_at` at intent creation +24 hours. The short
absolute times in tests are trusted policy fixtures for reproducing expiry.
Funding uncertainty retains PENDING_FUND. A late APPLIED funding result makes the
packet INITIALIZING; that state, OPEN and RECOVERING can all close at the original
deadline and refund unallocated funds. Recovery never extends the deadline.

The local Ledger fixture verifies each command against the source's committed,
immutable outbox grant before applying it; no arbitrary new key authorizes money.
Real service authentication, signature verification, source-grant distribution,
wallet security and restricted journal writes are dependencies, not implemented
by a Python dictionary. Ledger balances, balanced entry pair, business identity
and inbox result commit together in a second SQLite database. Its APPLIED result
fixture is not an untrusted browser callback. Source and receiver deduplication
must outlive every executable old command; archive/replay-cutoff mechanisms are
outside this example.

Recovery installs separate epoch namespaces with one shared packet hash tag.
Matching-token replays never reset an existing READY or ACTIVE list; old
installers cannot address new generation keys. Redis failure during installation
may leave partial keys: an orphan/type error triggers another fenced generation.
A runtime error does not promise rollback. A lost activation reply can be retried
for the same epoch/token. Even an erroneously active stale projection cannot
authorize a claim against a different DB epoch or a closed DB state.

Checks cover minimum-share and overflow boundaries, fixed plan identity, create
replay/conflict, same/different request key competitions, same-user business
uniqueness, last-share races, claim/outbox rollback, committed-but-lost replies,
funding deduplication, ledger rollback/unknown result, refund-before-credit,
late funding/initialization expiry, recovery/expiry order and stale epochs,
nonresetting Redis installation, wrong types, projection rollback, and a real Lua
error after a write. Randomized pure-function checks do not establish statistical
or lottery fairness. No real PostgreSQL, PSP, Redis Cluster/failover, machine crash,
signature SDK, load test or production availability guarantee is claimed.
