-- SQLite local-contract fixture. PostgreSQL 18 semantics are cited, not tested here.
PRAGMA foreign_keys = ON;
CREATE TABLE orders (
  tenant TEXT NOT NULL, id TEXT NOT NULL, version INTEGER NOT NULL CHECK(version>=0),
  state TEXT NOT NULL CHECK(state IN ('draft','pending_pay','paid','closed')),
  total INTEGER NOT NULL CHECK(total>=0), currency TEXT NOT NULL,
  attempt TEXT, accepted_payment TEXT, PRIMARY KEY(tenant,id)
);
CREATE TABLE order_lines (
  tenant TEXT NOT NULL, order_id TEXT NOT NULL, sku TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity>0), unit_price INTEGER NOT NULL CHECK(unit_price>=0),
  PRIMARY KEY(tenant,order_id,sku), FOREIGN KEY(tenant,order_id) REFERENCES orders(tenant,id)
);
CREATE TABLE command_result (
  tenant TEXT NOT NULL, order_id TEXT NOT NULL, key TEXT NOT NULL,
  hash TEXT NOT NULL, result TEXT, PRIMARY KEY(tenant,order_id,key)
);
CREATE TABLE inbox (
  consumer TEXT NOT NULL, source TEXT NOT NULL, event_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL, outcome TEXT, PRIMARY KEY(consumer,source,event_id)
);
CREATE TABLE capture_result (
  tenant TEXT NOT NULL, payment_id TEXT NOT NULL, fact_hash TEXT NOT NULL, outcome TEXT,
  PRIMARY KEY(tenant,payment_id)
);
CREATE TABLE refund_work (
  tenant TEXT NOT NULL, payment_id TEXT NOT NULL, refund_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount>0), currency TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','UNKNOWN','confirmed','manual')),
  PRIMARY KEY(tenant,payment_id), UNIQUE(tenant,refund_id)
);
CREATE TABLE outbox (
  event_id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','published'))
);
CREATE TABLE bindings (
  tenant TEXT NOT NULL, payment_id TEXT NOT NULL, order_id TEXT NOT NULL,
  attempt TEXT NOT NULL, amount INTEGER NOT NULL, currency TEXT NOT NULL,
  PRIMARY KEY(tenant,payment_id)
);
CREATE TABLE quarantine (
  source TEXT NOT NULL, event_id TEXT NOT NULL, payload_hash TEXT NOT NULL,
  reason TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(source,event_id,payload_hash)
);
