PRAGMA foreign_keys=ON;
CREATE TABLE packets (
  packet_id TEXT PRIMARY KEY NOT NULL, sender TEXT NOT NULL, currency TEXT NOT NULL,
  total_cents INTEGER NOT NULL CHECK(total_cents BETWEEN 1 AND 1000000000000),
  total_n INTEGER NOT NULL CHECK(total_n BETWEEN 1 AND 100),
  minimum INTEGER NOT NULL CHECK(minimum>0), plan_version INTEGER NOT NULL,
  remaining_cents INTEGER NOT NULL CHECK(remaining_cents>=0),
  remaining_n INTEGER NOT NULL CHECK(remaining_n>=0),
  state TEXT NOT NULL, ready INTEGER NOT NULL DEFAULT 0,
  epoch INTEGER NOT NULL, expire_at INTEGER NOT NULL, token TEXT,
  closed_unclaimed_n INTEGER NOT NULL DEFAULT 0,
  refund_pending INTEGER NOT NULL DEFAULT 0 CHECK(refund_pending>=0),
  refund_applied INTEGER NOT NULL DEFAULT 0 CHECK(refund_applied>=0)
);
CREATE TABLE shares (
  packet_id TEXT NOT NULL REFERENCES packets, share_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount>0), ordinal INTEGER NOT NULL,
  PRIMARY KEY(packet_id,share_id), UNIQUE(packet_id,share_id,amount)
);
CREATE TRIGGER immutable_share_update BEFORE UPDATE ON shares
BEGIN SELECT RAISE(ABORT,'immutable share'); END;
CREATE TRIGGER immutable_share_delete BEFORE DELETE ON shares
BEGIN SELECT RAISE(ABORT,'immutable share'); END;
CREATE TABLE claims (
  claim_id TEXT PRIMARY KEY NOT NULL, packet_id TEXT NOT NULL, user_id TEXT NOT NULL,
  share_id TEXT NOT NULL, amount INTEGER NOT NULL,
  UNIQUE(packet_id,user_id), UNIQUE(packet_id,share_id),
  FOREIGN KEY(packet_id,share_id,amount) REFERENCES shares(packet_id,share_id,amount)
);
CREATE TABLE requests (
  user_id TEXT NOT NULL, request_key TEXT NOT NULL, packet_id TEXT NOT NULL,
  claim_id TEXT REFERENCES claims, PRIMARY KEY(user_id,request_key)
);
CREATE TABLE creates (
  sender TEXT NOT NULL, request_key TEXT NOT NULL, digest TEXT NOT NULL,
  packet_id TEXT NOT NULL REFERENCES packets, PRIMARY KEY(sender,request_key)
);
CREATE TABLE outbox (
  operation_id TEXT PRIMARY KEY NOT NULL, packet_id TEXT NOT NULL REFERENCES packets,
  payload TEXT NOT NULL, applied INTEGER NOT NULL DEFAULT 0
);
