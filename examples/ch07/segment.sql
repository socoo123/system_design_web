-- PostgreSQL 17 teaching transaction; :name and :step are driver parameters.
-- ledger(name TEXT PRIMARY KEY, high BIGINT NOT NULL CHECK (high >= 1))
-- high is the first ID not yet reserved; seed orders with high = 1000.
BEGIN;
UPDATE ledger
SET high = high + :step
WHERE name = :name AND :step > 0
  AND high <= 9223372036854775807 - :step
RETURNING high - :step AS lo, high AS hi;
-- Require exactly one returned row; retain [lo, hi) privately until COMMIT.
COMMIT;
-- Only after confirmed commit: install the range in one live allocator.
-- Timeout / lost commit reply: discard this result and reserve another range.
-- Never decrement high; after restart discard ALL old in-memory grants.
