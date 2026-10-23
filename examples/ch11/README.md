# Ch11 Feed examples

Teaching sources for `chapters/ch11.html`; these are not a production feed server.

- `schema.sql`: PostgreSQL 18 constraints and bound-parameter seek query. Post, PublishKey and Outbox share one author-shard transaction; reader inboxes do not.
- `publish.pseudo`: same-key recovery, atomic author-shard commit and replayable relay. A COMMIT timeout means unknown outcome.
- `fanout.pseudo`: stable retained audience snapshot, durable unique output, then CAS checkpoint. Replays keep the original post time.
- `cache.pseudo`: cache-server epoch/generation/install-deadline checks and transactional tombstone/outbox. This API must be implemented; standard Redis commands do not supply it automatically.
- `FeedPage.java`: executable Java 17-compatible merge/filter/scan-budget core, shared with the page. Sources must already have the same exclusive tuple bound, retention window and complete author set. HTTP adapters validate signed cursors, user/version, immutable snapshot expiry and current permissions. The example does not implement those distributed services or cryptography.

Run from the repository root:

```sh
node examples/ch11/sync.mjs --check
node examples/ch11/verify.mjs
node tools/audit-chapter.mjs ch11
```

`verify.mjs` compiles with `javac --release 17` and runs `FeedPageTest` using the local JDK (21.0.2 at validation time). Build files live in an isolated temporary directory and are removed. Results are retained in `docs/reviews/ch11-contract-results.json` and `docs/reviews/ch11-java-results.txt`.

The deterministic models demonstrate expected traces and counterexamples. They do not experimentally establish PostgreSQL unique-key isolation, broker durability, cross-shard atomicity, actual cache-server leases, hard deadline enforcement, permission-service consistency, throughput or p99 latency. No live database/cache/broker is started.

`sync.mjs` updates the five page blocks from source; `--check` detects drift. The Java block is the marked `PAGE SNIPPET` method; its supporting records/interfaces and executable cases remain in the Java files.
