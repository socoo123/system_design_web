-- Executable SQLite subset; production write permissions protect these paths.
PRAGMA foreign_keys = ON;
CREATE TABLE release (
  namespace TEXT NOT NULL, release_id TEXT NOT NULL,
  payload TEXT NOT NULL, checksum TEXT NOT NULL,
  PRIMARY KEY (namespace, release_id)
);
CREATE TABLE current (
  namespace TEXT PRIMARY KEY NOT NULL, generation INTEGER NOT NULL CHECK (generation >= 0),
  stable TEXT NOT NULL, canary TEXT, percent INTEGER NOT NULL CHECK (percent BETWEEN 0 AND 100),
  salt TEXT NOT NULL, cluster TEXT NOT NULL, rule_revision INTEGER NOT NULL CHECK (rule_revision >= 0),
  CHECK (canary IS NOT NULL OR percent = 0),
  FOREIGN KEY (namespace, stable) REFERENCES release(namespace, release_id),
  FOREIGN KEY (namespace, canary) REFERENCES release(namespace, release_id)
);
CREATE TABLE publication (
  namespace TEXT NOT NULL, generation INTEGER NOT NULL, principal TEXT NOT NULL,
  request_key TEXT NOT NULL, reason TEXT NOT NULL, previous_generation INTEGER NOT NULL,
  previous_view TEXT NOT NULL, next_view TEXT NOT NULL,
  PRIMARY KEY (namespace, generation)
);
CREATE TABLE receipt (
  principal TEXT NOT NULL, namespace TEXT NOT NULL, request_key TEXT NOT NULL,
  request_hash TEXT NOT NULL, result_generation INTEGER NOT NULL,
  PRIMARY KEY (principal, namespace, request_key),
  FOREIGN KEY (namespace, result_generation) REFERENCES publication(namespace, generation)
);
CREATE TABLE change_log (
  namespace TEXT NOT NULL, generation INTEGER NOT NULL,
  PRIMARY KEY (namespace, generation),
  FOREIGN KEY (namespace, generation) REFERENCES publication(namespace, generation)
);
CREATE TABLE history_floor (
  namespace TEXT PRIMARY KEY NOT NULL, compacted_through INTEGER NOT NULL
);
