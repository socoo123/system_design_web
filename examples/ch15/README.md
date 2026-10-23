# Ch15 teaching contracts

The page contains five shared source blocks: `schema.sql`, `pin.pseudo`, `complete.pseudo`, `changes.pseudo`, `gc.pseudo`. SQL is a PostgreSQL 18 constraint shape, not a complete database schema. The other blocks are pseudocode, not executable Java or a full server.

Run from the repository root:

```sh
node examples/ch15/sync.mjs --check
python3 examples/ch15/check.py
python3 examples/ch15/check-tenants.py
node tools/audit-chapter.mjs ch15
node docs/reviews/ch15-browser.mjs
```

`sync.mjs` without `--check` refreshes the five HTML snippets from these files. It does not regenerate prose or diagrams.

`check.py` uses Python 3 standard-library SQLite and SHA-256. It executes the unchanged portable SQL shape, then a more complete metadata contract model. `BEGIN IMMEDIATE` serializes all writers, substituting a coarser lock for the PostgreSQL per-tenant guard. Objects reside in a separate SQLite file: metadata rollback cannot undo an object PUT. Object keys/versions are a local contract model; no S3 requests are made. Tests use actual 4 MiB blocks, with compressed deterministic clock units for lease/grace ordering.

The normal path freezes a manifest, verifies exact uploaded bytes, pins immutable generations and atomically publishes version/references/head/quota/change/outbox/receipt. Adverse paths cover missing/wrong blocks, manifest changes, unknown PUT/COMMIT/DELETE outcomes, 16 simultaneous same-key completes, competing parents, quota/expiry, source and target permission changes, GC/pin ordering, read protection and a delayed DELETE. A deliberately reused-key negative control loses its new bytes, showing why a new physical generation is necessary. Numbers are recomputed independently.

Every lookup/helper and logical row key binds the authenticated tenant. A guard
lock does not filter a later SQL statement: all displayed UPDATE/DELETE/scan
statements carry tenant predicates, and inserts include tenant in composite keys.
GC workers read durable jobs by `(tenant,generation)`; final object keys come from
that scoped generation, never client-supplied IDs. `check-tenants.py` extracts the
actual SQL shapes and executes colliding file/session/generation/receipt IDs for
two tenants. It also runs the old missing-predicate forms as negative witnesses.
The original 65 single-tenant checks remain; the extra probe checks tenant scope,
without claiming a full multitenant service or PostgreSQL deployment.

Quota charges all retained versions’ logical sizes, including history/trash; pruning must atomically remove a retained version’s references and charge. Receipts and terminal session/generation fences are retained in this teaching design. Reuse requires a currently readable committed reference or verified actual uploaded bytes. Minimal owner receipts do not return content or download grants after revocation.

Limits: no production benchmark, PostgreSQL deployment/row-lock race, consensus or failover, object-store durability, IAM/token signing, full create/move/conflict-copy endpoint, local filesystem fsync/rename, snapshot service, download lease drain or end-to-end encryption is implemented. The model applies the declared storage/authorization inputs; its success does not prove those distributed dependencies.

Browser scripts use the existing local service at `http://127.0.0.1:8765`, the existing Playwright installation and Chrome path. They set real viewport sizes and save measured widths, screenshots and interactions. Browser count checks complement manual image inspection.
