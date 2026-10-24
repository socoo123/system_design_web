# Ch28 initial inventory · 2026-10-24

Author: GPT-6.1-Sol (`gpt-6.1-sol`), Max. Read AGENTS.md, PLAN §0 and §4–8,
Ch03 proportions, Ch04/Ch09 and Ch25–27 implementation/review organization before editing.
Initial chapter SHA256: `3796e7a648d9258a3e2cfada34546e4ed712f2d7ed61bb75e42c88a4803f9de1`.
Baseline matches the batch snapshot. Existing unrelated uncommitted work is preserved.

## Retain

All six decks, 31 frames, title/desc IDs and frame order. Existing overall architecture,
publish/return paths, commit/fetch/apply separation, reconnect/compaction, ordinary
serve-last and critical action gate, generation versus immutable release, and main
capacity assumptions are useful. No new static diagram or D2 quota is justified.

## Condense and implement

Move the twelve-row assumption table and HTTP notation behind details; keep the
main capacity budget visible. Consolidate recovery/broadcast/retention paragraphs
into the mechanisms they constrain. Add same-source publish transaction and SQL
constraints, local watch registration/recheck, SDK installation plus proof, and
stable cohort selection. Provide real SQLite transaction/concurrency checks and
runnable Java17 local client/watch/selector checks, with explicit distributed limits.

## Findings before edits

- A10/D6 incorrectly call 333 batched requests/s “bundles/s”. Ten namespaces per
  process mean 3,333 namespace payloads/s. Define the ten-namespace batch endpoint,
  cap 500 batch responses/s (200 MB/s average-payload budget), and distinguish the
  2,000 single-namespace recipients/s broad-publish schedule.
- D6F5 SDK→Applied Telemetry arrow lies beside reconnect notes and can be mistaken
  for a reconnect path (also independently flagged by the main agent). Use a
  direct downward applied-report arrow and move GET recovery notes into clear space.
- D5F5 says rollback selects R17 in a footer, while the visible canary still says
  R18 at g42. Update that frame's selections to g43/R17 and mark former cohorts.
- Idempotency needs an in-transaction recheck under Current serialization, a complete
  semantic request hash, and exact rollback behavior. Authentication precedes replay.
- Identity/tag context changes may require a new selection at the same namespace g;
  delayed old-context responses must not be applied or confirm the new context.
- A proof must bind the exact applied view and one outstanding request; invalidated
  or replayed responses, view swaps, restarts and resume epochs cannot renew it.
  Java monotonic-clock properties alone do not prove suspension-aware elapsed time.

## Visual work actually done before edits

`ch28-render.mjs --before` loaded the baseline HTML at its real chapter URL by
Playwright route override, preserving normal CSS/JS/resource context; it generated
62 frame captures. The author opened all twelve two-theme contact sheets and
looked through all frames. Generation is evidence preparation, distinct from this
manual viewing. No obvious short-line overlap/oversized-node issue was found in
D1–D4; evolution-stage unused space is intentional and kept. D5/D6 findings above
need local repair and full-group two-theme reinspection.
