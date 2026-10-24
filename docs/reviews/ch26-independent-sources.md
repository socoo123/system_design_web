# Ch26 independent primary-source check

Checked independently on 2026-10-24. These support mechanisms, not chapter rates,
financial grant authenticity or production availability.

- [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests):
  API v1 retains the first execution result including 500; compares parameters;
  keys may be pruned after at least 24 h and reuse after pruning creates a new
  request. Validation/concurrent-execution conflicts before endpoint execution
  are not saved. The same page distinguishes v2: failed/partial work can continue
  and yield an updated response. Ch26 explicitly treats this as an external
  example, without adopting the finite window for internal money deduplication.
- [Redis scripting](https://redis.io/docs/latest/develop/programmability/eval-intro/):
  script execution is isolated and blocks other activity. This is not a cross-DB
  transaction. The page's validation-first Lua and DB confirmation boundary agree.
- [Redis transactions](https://redis.io/docs/latest/develop/using-commands/transactions/):
  execution-time command errors do not provide transaction rollback. The official
  [Redis rollback explanation](https://redis.io/blog/you-dont-need-transaction-rollbacks-in-redis/)
  further distinguishes scripts and rollback. A new actual Redis 7.2.5 experiment
  confirms SET followed by a Lua error leaves SET present; the probe does not
  pretend malformed-input validation can guarantee absence of every runtime error.
- [Redis WAIT](https://redis.io/docs/latest/commands/wait/), “Consistency and WAIT”:
  replica acknowledgments improve safety but do not make Redis strongly
  consistent; even synchronously replicated writes may be lost on failover.
  The local no-replica WAIT probe only checks the returned count, without claiming
  to reproduce replica promotion or prove the full failover statement.
- [PostgreSQL 18 row locking](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS):
  FOR UPDATE conflicts with concurrent writers/lockers to that row; locks last
  through transaction end. Ch26 uses the same packet lock for claim/close/rebuild
  and a consistent request-then-packet order. Actual SQLite tests use a coarser
  writer lock and do not establish PostgreSQL row-lock scheduling.
- [PostgreSQL 18 current time](https://www.postgresql.org/docs/18/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT):
  now()/CURRENT_TIMESTAMP use transaction start; clock_timestamp() observes call
  time. The chapter checks after locks, while explicitly defining eligibility at
  that check rather than requiring a commit strictly before deadline. Wall-clock
  accuracy/failover is still a deployment dependency, not provided by this function.

The page's total/count/minimum ranges, fixed creation+24 h business deadline,
2 ms/60% plan budget, rates, storage sizes and payout examples are self-defined.
Independent Decimal/Java/SQLite checks validate their arithmetic and local
invariants. No source supplies the tested wallet authorization fixtures or an
exactly-once promise across arbitrary message replay, DB rollback or key GC.
