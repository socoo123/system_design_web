-- Bound parameters, authenticated owner; execute in one transaction.
BEGIN;
WITH changed AS (
  UPDATE Link SET status = 'revoked', version = version + 1
  WHERE code = :code AND owner_id = :owner AND version = :expected_version
  RETURNING code, version
)
INSERT INTO Outbox(event_id, code, version, kind)
  SELECT :event_id, code, version, 'invalidate' FROM changed
RETURNING code, version;
-- Zero rows: no change; report 404/412 after authorization-safe lookup.
COMMIT;
-- Confirmed commit: acknowledge. Unknown outcome: GET owner state on primary.
-- Relay publishes committed rows, then marks delivered_at; replay is possible.
