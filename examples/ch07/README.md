# Ch07 executable material

Requires Java 17 and Python 3; no external dependencies.

```sh
javac -d /tmp/ch07-classes examples/ch07/IdExample.java
java -cp /tmp/ch07-classes IdExample
python3 examples/ch07/verify.py
```

`IdExample.java` implements the local generator for one fixed, already committed time window. `Clock.millis()` is relative to the single immutable epoch, `Clock.nanos()` measures monotonic elapsed time, and `pause()` yields before a fresh read. The executable uses deterministic fake clocks; it does not implement Registry, background extension, SQL, production adapters or business idempotency. `synchronized` protects one object, not cross-process worker ownership. A grant cannot be restored into a fresh state machine. A test intentionally demonstrates that doing so duplicates an ID.

`window.pseudo` specifies the database row-lock transaction for new windows and same-instance extensions. `segment.sql` specifies PostgreSQL 17 reservation semantics; named parameters are driver placeholders. Neither was executed against a database. The proof requires all permitted failovers to retain confirmed high-water marks and each grant to have a single live consumer. Lost replies are burned; restarts obtain new grants.

`verify.py` checks three page/source blocks, independently recalculates major numbers, enumerates two locked reservation orders, and demonstrates a stale-replica collision. These models do not substitute for actual database or fault-injection tests.
