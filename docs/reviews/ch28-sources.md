# Ch28 primary-source recheck · 2026-10-24

The author browsed these sources during this implementation. Mechanism claims,
version boundaries and the chapter's own contracts are kept separate. The SDK,
release/generation naming, HTTP RESET/204, proof lifetime, budgets and sample
numbers are our design, not product guarantees.

| Source | Rechecked support | Explicit limit in the page |
|---|---|---|
| [ZooKeeper 3.9.4 Programmer's Guide](https://zookeeper.apache.org/doc/r3.9.4/zookeeperProgrammers.html), Watches / Persistent Recursive Watches | Standard watches trigger once; 3.6.0 added non-removing persistent variants. Reconnection still requires state reasoning. | Does not call all watches one-shot or claim delivery of every intermediate config. |
| [Raft extended paper](https://raft.github.io/raft.pdf), §5.3 / §5.4.2 and Figure 8 | Current-term majority commit; previous-term entries cannot be committed merely by counting replicas. | Two of three is arithmetic. Local SQLite is not a quorum test. |
| [PostgreSQL 18 transactions](https://www.postgresql.org/docs/18/tutorial-transactions.html) and [§13.3 row locks](https://www.postgresql.org/docs/18/explicit-locking.html) | Atomic transaction scope; FOR UPDATE blocks competing row writers/lockers until transaction end and, after a wait under the relevant isolation, locks the updated row. | Pseudocode has PostgreSQL shape; executable adapter is SQLite and uses a coarser writer lock. No blanket equivalence of all isolation levels. |
| [etcd v3.6 API guarantees](https://etcd.io/docs/v3.6/learning/api_guarantees/), KV APIs / Watch APIs | Default linearizable KV versus possibly stale serializable; watch itself lacks linearizability and bounded arrival; retained history bounds resumption. | Watch is a hint, not a proof. App namespace g is separate from store revision. |
| [etcd v3.6 API reference](https://etcd.io/docs/v3.6/dev-guide/api_reference_v3/), WatchCreateRequest / WatchResponse | start_revision is inclusive; a compacted start cancels the watcher and reports compact_revision, so retrying the same expired start is invalid. | Bootstrap reads snapshot at R then resumes R+1; custom API uses RESET and a namespace compaction floor. |
| [RFC 9110 §13.1.2](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.2) | If-None-Match compares the selected representation and may return 304 for GET/HEAD. | Does not treat generic 304 as uncached current-authority confirmation. |
| [Apollo official design](https://github.com/apolloconfig/apollo/blob/master/docs/en/design/apollo-design.md), [raw file read](https://raw.githubusercontent.com/apolloconfig/apollo/master/docs/en/design/apollo-design.md), §1.4–1.5 | Deferred 60s long-poll; payload fetched separately; default five-minute polling and local-file recovery. Apollo idle notifications use 304. | Our idle watch uses 204; no claim that our transactional receipt or proof protocol is Apollo's protocol. Master document checked on this date, not described as an immutable version. |
| [AWS / Marc Brooker: Exponential Backoff And Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/) | Full Jitter spreads retry clusters that deterministic exponential backoff retains. | Does not turn a 30s random window into a hard throughput bound; separate admission controls spikes. |
| [Pete Hodgson: Feature Toggles](https://martinfowler.com/articles/feature-toggles.html), Canary releasing / Categories | Stable cohorts support gradual enablement; operational and release flags have different purposes/lifetimes. | Our authenticated instance selector is a chosen policy, not exact population or traffic control. |
| [Java SE17 System.nanoTime](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/System.html#nanoTime()) | Elapsed-time measurement within a JVM, arbitrary origin, meaningful differences rather than wall time. | Official contract does not supply the suspension-aware clock/resume adapter required by our safety proof. No cross-restart persisted qualification. |

No source is used as evidence of measured chapter capacity. Important derivations
are rerun in `examples/ch28/check.py`, and the parent maintains an independent
batch-wide numeric check. This record stores supported statements in our own words;
it is not a dump of externally authored documentation.
