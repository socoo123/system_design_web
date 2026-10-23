# Ch08 executable teaching checks

The page's seven `data-source` blocks are checked against these files. Java 17 has no dependencies; Python 3 uses only its standard library. Supply an existing Redis binary. `verify.py` starts a disposable instance on a fresh Unix socket with TCP disabled, persistence disabled, and cleans it up; it does not connect to an existing Redis service.

```sh
python3 examples/ch08/verify.py /absolute/path/to/redis-server
javac -d /tmp/ch08-java examples/ch08/LeaseBudget.java examples/ch08/LeaseBudgetTest.java
java -cp /tmp/ch08-java LeaseBudgetTest
```

- `release.lua` and `renew.lua`: actual Redis single-instance owner checks. Return 1 only for a matching owner; renewal also validates a bounded positive integer TTL. Wrong owner/expiry returns 0; errors/timeouts fail closed at the client.
- `LeaseBudget.java`: a single-event-loop local helper, using one monotonic nanosecond clock and a fixed 10 s TTL / 200 ms margin. Only one renewal may be in flight. A lost local lease never revives, including when a delayed renewal succeeded remotely. Source tests use injected timestamps, not network or Redis. Production callers must serialize callbacks and enforce business deadlines separately.
- `acquire.txt`, `transaction.txt`: explicitly pseudocode; no production Redis client or PostgreSQL application is supplied.
- `fence.sql`, `version.sql`: bound-parameter teaching statements; the test runs the exact predicates in SQLite to check normal/invalid/stale behavior. This does not test PostgreSQL concurrency semantics. All rows and guarded fields must survive failover with the business data; all writers must obey the same predicates.

`verify.py` records results in `docs/reviews/ch08-code-results.json`. No replication/failover, operating-system clock change, PostgreSQL concurrent transaction, downstream side-effect, or throughput experiment was performed. A local helper/SQLite trace cannot prove distributed mutual exclusion. The chapter's fencing issuer and durable resource remain explicit deployment contracts.
