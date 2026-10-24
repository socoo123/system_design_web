-- SQLite 3.38+ adapter: acquire BEGIN IMMEDIATE before this statement.
-- READY starts forward work; expired active owners may only reconcile first.
WITH clock(now) AS (SELECT unixepoch('now'))
UPDATE runs
SET owner = :worker, epoch = epoch + 1, version = version + 1,
    lease_until = (SELECT now FROM clock) + 15,
    status = CASE WHEN status = 'READY' THEN 'RUNNING' ELSE status END
WHERE run_id = :run_id AND version = :version
  AND ((status = 'READY' AND cancelled = 0
        AND deadline > (SELECT now FROM clock))
    OR (status IN ('RUNNING', 'CANCEL_REQUESTED', 'COMPENSATING')
        AND lease_until <= (SELECT now FROM clock)))
RETURNING *;
-- Zero rows: lost the race / not runnable. Do not invoke anything.
-- COMMIT acknowledgment must be known before dispatch; otherwise read back.
