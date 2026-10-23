-- Executable SQLite contract schema, NOT a production PostgreSQL deployment.
PRAGMA foreign_keys=ON;
CREATE TABLE stock(sku_id TEXT PRIMARY KEY,available INTEGER NOT NULL CHECK(available>=0),
  reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved>=0),sold INTEGER NOT NULL DEFAULT 0 CHECK(sold>=0));
CREATE TABLE quotes(quote_id TEXT PRIMARY KEY,owner TEXT NOT NULL,currency TEXT NOT NULL,
  address_version TEXT NOT NULL,items TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE orders(order_id TEXT PRIMARY KEY,owner TEXT NOT NULL,total INTEGER NOT NULL CHECK(total>0),
  currency TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending_pay','paid','shipped','closed','cancelled')),
  expire_at INTEGER NOT NULL,version INTEGER NOT NULL DEFAULT 1,accepted_capture TEXT UNIQUE);
CREATE INDEX due_orders ON orders(status,expire_at,order_id);
CREATE TABLE requests(owner TEXT NOT NULL,request_key TEXT NOT NULL,digest TEXT NOT NULL,receipt TEXT,
  PRIMARY KEY(owner,request_key));
CREATE TABLE items(order_id TEXT NOT NULL REFERENCES orders(order_id),sku_id TEXT NOT NULL REFERENCES stock(sku_id),
  qty INTEGER NOT NULL CHECK(qty>0),unit_price INTEGER NOT NULL CHECK(unit_price>0),PRIMARY KEY(order_id,sku_id));
CREATE TABLE reservations(order_id TEXT NOT NULL,sku_id TEXT NOT NULL,qty INTEGER NOT NULL CHECK(qty>0),
  state TEXT NOT NULL CHECK(state IN ('HELD','COMMITTED','RELEASED')),PRIMARY KEY(order_id,sku_id),
  FOREIGN KEY(order_id,sku_id) REFERENCES items(order_id,sku_id));
CREATE TABLE attempts(attempt_id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(order_id),
  number INTEGER NOT NULL,provider TEXT NOT NULL,account TEXT NOT NULL,environment TEXT NOT NULL,
  psp_key TEXT NOT NULL,amount INTEGER NOT NULL,currency TEXT NOT NULL,state TEXT NOT NULL,
  provider_binding TEXT,UNIQUE(order_id,number),UNIQUE(provider,account,psp_key));
CREATE TABLE captures(provider TEXT NOT NULL,account TEXT NOT NULL,capture_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,immutable_fields TEXT NOT NULL,outcome TEXT NOT NULL,
  PRIMARY KEY(provider,account,capture_id));
CREATE TABLE refund_due(provider TEXT NOT NULL,account TEXT NOT NULL,capture_id TEXT NOT NULL,
  amount INTEGER NOT NULL,currency TEXT NOT NULL,state TEXT NOT NULL,
  PRIMARY KEY(provider,account,capture_id),FOREIGN KEY(provider,account,capture_id) REFERENCES captures);
CREATE TABLE review_tasks(provider TEXT NOT NULL,account TEXT NOT NULL,capture_id TEXT NOT NULL,
  evidence TEXT NOT NULL,state TEXT NOT NULL,PRIMARY KEY(provider,account,capture_id));
CREATE TABLE outbox(event_id TEXT PRIMARY KEY,kind TEXT NOT NULL,action_key TEXT NOT NULL,
  payload TEXT NOT NULL,sent INTEGER NOT NULL DEFAULT 0,UNIQUE(kind,action_key));
CREATE TABLE payment_inbox(provider TEXT NOT NULL,account TEXT NOT NULL,environment TEXT NOT NULL,
  event_id TEXT NOT NULL,body TEXT NOT NULL,state TEXT NOT NULL,
  PRIMARY KEY(provider,account,environment,event_id));
-- Separate downstream DB uses the following two tables only.
CREATE TABLE consumer_inbox(consumer TEXT NOT NULL,event_id TEXT NOT NULL,digest TEXT NOT NULL,
  PRIMARY KEY(consumer,event_id));
CREATE TABLE fulfillment_jobs(order_id TEXT PRIMARY KEY,shipment_id TEXT NOT NULL UNIQUE,state TEXT NOT NULL);
