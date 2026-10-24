-- publish: proof binds caller/upload_id/full object key and the exact version.
UPDATE upload
SET state = 'COMMITTED', object_version = :version
WHERE caller = :caller AND upload_id = :id AND state = 'PENDING'
  AND expires_at > unixepoch()
  AND object_key = :object_key
  AND expected_size = :size AND checksum = :checksum
RETURNING upload_id, state, object_version;

-- cleanup: a returned row plus confirmed COMMIT grants deletion ownership.
UPDATE upload SET state = 'ABORTED'
WHERE caller = :caller AND upload_id = :id AND state = 'PENDING'
  AND expires_at <= unixepoch()
RETURNING upload_id, state, object_version;
