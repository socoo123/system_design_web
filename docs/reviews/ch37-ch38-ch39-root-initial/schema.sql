CREATE TABLE inventory (
  sku TEXT PRIMARY KEY,
  on_hand INTEGER NOT NULL CHECK (on_hand >= 0)
);
CREATE TABLE orders (
  order_id TEXT PRIMARY KEY,
  caller TEXT NOT NULL,
  delivery_ref TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX orders_by_caller ON orders(caller, created_at, order_id);
CREATE TABLE order_line (
  order_id TEXT NOT NULL REFERENCES orders(order_id),
  sku TEXT NOT NULL REFERENCES inventory(sku),
  qty INTEGER NOT NULL CHECK (qty > 0),
  PRIMARY KEY (order_id, sku)
);
CREATE TABLE idempotency (
  caller TEXT NOT NULL,
  key TEXT NOT NULL,
  binding TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('PENDING','CREATED','OUT_OF_STOCK')),
  order_id TEXT REFERENCES orders(order_id),
  PRIMARY KEY (caller, key),
  CHECK ((outcome = 'CREATED' AND order_id IS NOT NULL)
     OR (outcome != 'CREATED' AND order_id IS NULL))
);
CREATE TABLE upload (
  caller TEXT NOT NULL,
  upload_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('PENDING','COMMITTED','ABORTED')),
  expected_size INTEGER NOT NULL CHECK (expected_size > 0),
  checksum TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  object_version TEXT,
  PRIMARY KEY (caller, upload_id),
  CHECK ((state = 'COMMITTED' AND object_version IS NOT NULL)
     OR (state != 'COMMITTED' AND object_version IS NULL))
);
