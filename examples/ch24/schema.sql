PRAGMA foreign_keys = ON;
CREATE TABLE payment (
 pay_no TEXT PRIMARY KEY NOT NULL, environment TEXT NOT NULL, merchant_id TEXT NOT NULL,
 order_ref TEXT NOT NULL, business_version INTEGER NOT NULL,
 digest TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount > 0),
 currency TEXT NOT NULL, channel TEXT NOT NULL, account_id TEXT NOT NULL,
 captured INTEGER NOT NULL DEFAULT 0, refunded INTEGER NOT NULL DEFAULT 0,
 reserved INTEGER NOT NULL DEFAULT 0,
 CHECK(captured >= 0 AND captured <= amount),
 CHECK(refunded >= 0 AND reserved >= 0 AND refunded + reserved <= captured)
);
CREATE TABLE request_key (
 environment TEXT NOT NULL, merchant_id TEXT NOT NULL, operation TEXT NOT NULL,
 request_key TEXT NOT NULL, digest TEXT NOT NULL, result_ref TEXT NOT NULL
);
CREATE TABLE attempt (
 attempt_id TEXT PRIMARY KEY NOT NULL, pay_no TEXT NOT NULL REFERENCES payment(pay_no),
 environment TEXT NOT NULL, channel TEXT NOT NULL, account_id TEXT NOT NULL,
 channel_key TEXT NOT NULL, payload_hash TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('CREATED','SENT','UNKNOWN','CONFIRMED','DECLINED')),
 first_send_at INTEGER, retry_before INTEGER, channel_object TEXT,
 CHECK((first_send_at IS NULL) = (retry_before IS NULL))
);
CREATE TABLE inbox (
 environment TEXT NOT NULL, channel TEXT NOT NULL, account_id TEXT NOT NULL,
 event_id TEXT NOT NULL, payload_hash TEXT NOT NULL, raw_body TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'READY'
);
CREATE TABLE posting (
 posting_id TEXT PRIMARY KEY NOT NULL, pay_no TEXT NOT NULL REFERENCES payment(pay_no),
 environment TEXT NOT NULL, channel TEXT NOT NULL, account_id TEXT NOT NULL,
 object_id TEXT NOT NULL, operation_ref TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('CAPTURE','REFUND')),
 amount INTEGER NOT NULL CHECK(amount > 0), currency TEXT NOT NULL
);
CREATE TABLE entry (
 posting_id TEXT NOT NULL REFERENCES posting(posting_id), seq INTEGER NOT NULL,
 account TEXT NOT NULL, side TEXT NOT NULL CHECK(side IN ('DR','CR')),
 amount INTEGER NOT NULL CHECK(amount > 0), currency TEXT NOT NULL,
 PRIMARY KEY(posting_id, seq)
);
CREATE TABLE refund (
 refund_id TEXT PRIMARY KEY NOT NULL, pay_no TEXT NOT NULL REFERENCES payment(pay_no),
 amount INTEGER NOT NULL CHECK(amount > 0), currency TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('RESERVED','UNKNOWN','SUCCEEDED','FAILED')),
 channel_object TEXT
);
CREATE TABLE outbox (
 event_id TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL, result_ref TEXT NOT NULL,
 payload TEXT NOT NULL
);
CREATE TABLE review (
 case_key TEXT PRIMARY KEY NOT NULL, evidence TEXT NOT NULL
);
-- In production, only the controlled posting role/procedure may INSERT
-- posting/entry; do not grant raw journal DML to other application roles.
CREATE TRIGGER entry_no_update BEFORE UPDATE ON entry
 BEGIN SELECT RAISE(ABORT, 'append-only journal'); END;
CREATE TRIGGER entry_no_delete BEFORE DELETE ON entry
 BEGIN SELECT RAISE(ABORT, 'append-only journal'); END;
CREATE TRIGGER posting_no_update BEFORE UPDATE ON posting
 BEGIN SELECT RAISE(ABORT, 'append-only journal'); END;
CREATE TRIGGER posting_no_delete BEFORE DELETE ON posting
 BEGIN SELECT RAISE(ABORT, 'append-only journal'); END;
