-- Bound parameters are supplied by an authenticated registration service.
-- DeviceSession is pre-created per authorized device; its epoch never expires.
BEGIN;
SELECT epoch FROM device_session
  WHERE user_id = :user AND device_id = :device FOR UPDATE;
UPDATE device_session
  SET epoch = epoch + 1, connection_id = :connection, gateway_id = :gateway,
      lease_until = :server_now + INTERVAL '90 seconds'
  WHERE user_id = :user AND device_id = :device
    AND epoch < 9223372036854775807
  RETURNING epoch;
COMMIT; -- Install the returned epoch only after confirmed commit.
-- Zero rows: reject. Unknown commit: discard this attempt and register anew.

-- Heartbeat and disconnect are independent conditional atomic statements.
UPDATE device_session SET lease_until = :server_now + INTERVAL '90 seconds'
  WHERE user_id = :user AND device_id = :device AND epoch = :epoch
    AND connection_id = :connection AND lease_until > :server_now;
UPDATE device_session SET connection_id = NULL, gateway_id = NULL,
  lease_until = :server_now
  WHERE user_id = :user AND device_id = :device AND epoch = :epoch
    AND connection_id = :connection;
