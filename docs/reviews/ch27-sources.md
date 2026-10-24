# Ch27 source checks

Checked against primary documentation during the 2026-10-23/24 implementation.
All order rates, timing thresholds, courier limits, weights, ETA and queue
numbers are chapter assumptions/calculations rather than vendor measurements.

| Page reference | Primary source | Supported statement and limit |
|---|---|---|
| [1] | [PostgreSQL 18 Explicit Locking](https://www.postgresql.org/docs/18/explicit-locking.html) | Row-lock conflicts serialize common writers; consistent lock ordering reduces deadlocks. Every state/capacity writer must use the same authority. No delivery throughput claim. |
| [2] | [PostgreSQL 18 Constraints](https://www.postgresql.org/docs/18/ddl-constraints.html) | UNIQUE/NOT NULL enforce identities; row CHECK does not establish cross-row/table occupancy equality. Active order/slot constraints are the chapter's schema design. |
| [3] | [Redis GEOSEARCH](https://redis.io/docs/latest/commands/geosearch/) | Radius/box geospatial recall with count options. The command has no courier load, liveness, route or business eligibility semantics. |
| [4] | [Redis EXPIRE](https://redis.io/docs/latest/commands/expire/) | Expiry applies to a key; detail expiry does not remove a member from another key. A real isolated Redis 7.2.5 probe corroborates this narrow statement. 60 s is our cleanup assumption. |
| [5] | [AWS transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html) | Store DB state/event intent in one transaction; relay can duplicate and consumers need idempotency. This is not an exactly-once courier acceptance guarantee. |
| [6] | [Google Routes route matrix](https://developers.google.com/maps/documentation/routes/compute_route_matrix) | Elements are origins×destinations; whole-request and individual-element errors; index fields bind a result. **Unordered streaming is explicitly the gRPC method; REST does not support streaming.** 8×1, 463 elements/s and ETA 14 min are chapter arithmetic. No live API called. |
| [7] | [WHATWG SSE](https://html.spec.whatwg.org/multipage/server-sent-events.html) | EventSource reconnect/Last-Event-ID behavior. Does not automatically retain application history or guarantee business exactly once. |
| [8] | [RFC 6455](https://www.rfc-editor.org/rfc/rfc6455.html) | WebSocket two-way channel. Sampling rate, business ACK/accept and durable control recovery are application contracts. |
| [9] | [RFC 6585 §4](https://www.rfc-editor.org/rfc/rfc6585.html#section-4) | 429 means Too Many Requests; Retry-After is optional. Supply shortage may instead be a product business status. Queue thresholds are not prescribed by RFC. |
| [10] | [PostgreSQL 18 Transaction Isolation](https://www.postgresql.org/docs/18/transaction-iso.html) | Read Committed statements see snapshots; a plain SELECT is not an order/capacity lock. No claim that SQLite tests prove PostgreSQL behavior. |
| [11] | [PostgreSQL 18 current time functions](https://www.postgresql.org/docs/18/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT) | now()/CURRENT_TIMESTAMP/transaction_timestamp() use transaction start. clock_timestamp() observes actual call time, including within one statement. It is wall time, not a monotonic/failover clock guarantee; authority/clock error is an explicit premise. |
| [12] | [SQLite isolation](https://www.sqlite.org/isolation.html), [SQLite transactions](https://www.sqlite.org/lang_transaction.html) | One writer at a time; BEGIN IMMEDIATE obtains a write transaction, subject to BUSY. Used for the local executable adapter, which has coarser locking than PostgreSQL. |

No source is used as evidence of a company's private dispatch algorithm. The
two-slot model, generation advances, durable session epochs, projection repair,
clock-error acceptance interval and custody handoff protocol are explicitly
chapter designs. The ±5 s relative time bound and evidence authenticity are
dependencies, not properties supplied by Java/SQLite/Redis or this test suite.
