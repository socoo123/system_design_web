# Ch43 teaching examples

Java 17, no external dependencies:

```sh
mkdir -p /tmp/ch43-java
/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin/javac --release 17 -d /tmp/ch43-java examples/ch43/ExternalAggregate.java
/Library/Java/JavaVirtualMachines/jdk-17.0.10.jdk/Contents/Home/bin/java -cp /tmp/ch43-java ExternalAggregate
python3 examples/ch43/catalog_contract.py
python3 examples/ch43/check_source.py
```

`ExternalAggregate.java` receives already authorized, snapshot-bound, filtered rows with applicable deletes applied. It performs a local external GROUP BY/SUM using bounded chunks and bounded merge fan-in. Every key is bounded ASCII and every intermediate signed-64-bit sum must fit; overflow fails the attempt. Input iteration itself must stream. Its directory belongs to one attempt, and its result is a private complete candidate checked readable at handoff, including the single-run case that needs no merge. This momentary check does not prevent future deletion: the caller/publication layer still owns retention, immutable identity and publication/GC fencing. The implementation does not publish a table, read Parquet, recover a crashed process or deduplicate scheduler attempts.

Chunk memory is O(maxRows), merge readers/heads are O(fanIn), with fixed-size record keys. Each wave constructs at most fanIn expected run paths from its recorded count; it does not infer completeness from a directory listing or retain all paths in RAM. Scratch capacity and disk I/O remain a separate budget. The row-budget unit is a teaching simplification; an engine needs a byte allocator, bounded codec buffers and cancellation.

`publish.pseudo` describes a custom transactional catalog, not an Apache Iceberg API. `catalog_contract.py` executes its core SQL transaction on SQLite to check pointer/identity atomicity, stale-base rejection, digest binding and rollback. The lost-ACK case discards an already committed return in the caller; no actual network failure is injected. SQLite exercises do not establish a distributed catalog's isolation, network outcome resolution or object durability. The page states those as required contracts.

`check_source.py` checks the page's three displayed code blocks against their original sources. Review evidence and actual command results are recorded in `docs/reviews/ch43.md`.
