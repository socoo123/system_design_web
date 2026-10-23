-- PostgreSQL 18 teaching fragment: frozen batch from a trusted flusher.
-- Ledger PK=(comment_id,batch_id); payload stores immutable delta.
BEGIN;
WITH first_apply AS (
  INSERT INTO applied_like_batch(comment_id, batch_id, delta)
  VALUES (:comment, :batch, :delta)
  ON CONFLICT (comment_id, batch_id) DO NOTHING
  RETURNING delta
)
UPDATE like_count SET total = total + first_apply.delta
FROM first_apply WHERE like_count.comment_id = :comment;
-- Require a pre-existing count row; on missing row ROLLBACK, never ACK.
-- Read the ledger in a NEW statement (READ COMMITTED conflict may wait).
SELECT delta FROM applied_like_batch
WHERE comment_id = :comment AND batch_id = :batch;
-- Require stored delta = :delta; changed payload is an error, ROLLBACK.
COMMIT;
-- ACK only after commit. An unknown outcome retries this SAME id + delta.
-- Frozen bytes and ids survive flusher restart; ids never repeat.
