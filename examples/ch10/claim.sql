-- PostgreSQL 18; :parameters are bound by the worker, one primary DB.
BEGIN;
SELECT delivery_id FROM Delivery
WHERE delivery_id = :delivery_id AND (
  (status IN ('queued', 'retry_wait') AND next_attempt_at <= clock_timestamp())
  OR (status = 'leased' AND lease_until <= clock_timestamp())
)
FOR UPDATE SKIP LOCKED;
-- The driver COMMITs and returns NO_CLAIM if SELECT returned no row.
-- Otherwise it continues on the same connection while holding that row lock:
UPDATE Attempt SET outcome = 'timeout_unknown'
WHERE delivery_id = :delivery_id AND outcome = 'started';
UPDATE Delivery SET
  uncertain = uncertain OR EXISTS (
    SELECT 1 FROM Attempt WHERE delivery_id = :delivery_id
      AND outcome = 'timeout_unknown'),
  status = 'leased', lease_epoch = lease_epoch + 1,
  lease_owner = :owner, lease_until = clock_timestamp() + INTERVAL '30 seconds'
WHERE delivery_id = :delivery_id
RETURNING *, clock_timestamp() AS claimed_at;
COMMIT;
-- Install the returned claim only after confirmed COMMIT; unknown => no send.
