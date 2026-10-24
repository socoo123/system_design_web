-- publish: run only after a trusted HEAD verifies this immutable object version.
UPDATE upload
SET state = 'COMMITTED', object_version = :version
WHERE caller = :caller AND upload_id = :id AND state = 'PENDING'
  AND expires_at > unixepoch()
  AND expected_size = :size AND checksum = :checksum
RETURNING upload_id, state, object_version;

-- cleanup: a returned row plus confirmed COMMIT grants deletion ownership.
UPDATE upload SET state = 'ABORTED'
WHERE caller = :caller AND upload_id = :id AND state = 'PENDING'
  AND expires_at <= unixepoch()
RETURNING upload_id, state, object_version;
