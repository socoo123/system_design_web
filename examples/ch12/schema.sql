-- Teaching schema: PostgreSQL 18 syntax; replication is an extra A5 contract.
CREATE TABLE conversation (
  conv_id TEXT PRIMARY KEY, head BIGINT NOT NULL CHECK (head >= 0),
  membership_version BIGINT NOT NULL CHECK (membership_version > 0),
  policy_version BIGINT NOT NULL CHECK (policy_version > 0)
);
CREATE TABLE member (
  conv_id TEXT NOT NULL REFERENCES conversation, user_id TEXT NOT NULL,
  view_epoch BIGINT NOT NULL CHECK (view_epoch > 0),
  first_seq BIGINT NOT NULL CHECK (first_seq > 0), active BOOLEAN NOT NULL,
  PRIMARY KEY (conv_id, user_id)
);
CREATE TABLE message (
  conv_id TEXT NOT NULL REFERENCES conversation, seq BIGINT CHECK (seq > 0),
  sender_id TEXT NOT NULL, body BYTEA NOT NULL,
  PRIMARY KEY (conv_id, seq)
);
CREATE TABLE send_receipt (
  conv_id TEXT NOT NULL, sender_id TEXT NOT NULL, client_msg_id TEXT NOT NULL,
  request_hash BYTEA NOT NULL, seq BIGINT NOT NULL CHECK (seq > 0),
  PRIMARY KEY (conv_id, sender_id, client_msg_id)
);
CREATE TABLE outbox (
  conv_id TEXT NOT NULL, seq BIGINT NOT NULL CHECK (seq > 0),
  policy_version BIGINT NOT NULL, envelope BYTEA NOT NULL,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (conv_id, seq)
);
