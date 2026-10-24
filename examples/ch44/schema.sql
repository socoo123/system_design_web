-- Teaching subset accepted by PostgreSQL 18 and SQLite 3; IDs are bound text.
CREATE TABLE orders (
  tenant TEXT NOT NULL CHECK(length(trim(tenant)) > 0),
  order_id TEXT NOT NULL, state TEXT NOT NULL CHECK(state = 'ACCEPTED'),
  PRIMARY KEY (tenant, order_id)
);
CREATE TABLE intents (
  tenant TEXT NOT NULL CHECK(length(trim(tenant)) > 0),
  operation TEXT NOT NULL CHECK(length(trim(operation)) > 0),
  k TEXT NOT NULL CHECK(length(trim(k)) > 0),
  digest TEXT NOT NULL, order_id TEXT NOT NULL, result TEXT,
  PRIMARY KEY (tenant, operation, k),
  FOREIGN KEY (tenant, order_id) REFERENCES orders(tenant, order_id)
    DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE outbox (
  event_id TEXT NOT NULL PRIMARY KEY, tenant TEXT NOT NULL,
  order_id TEXT NOT NULL, published INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (tenant, order_id) REFERENCES orders(tenant, order_id)
);
CREATE TABLE accounts (
  tenant TEXT NOT NULL, account_id TEXT NOT NULL, points INTEGER NOT NULL,
  PRIMARY KEY (tenant, account_id)
);
CREATE TABLE inbox (
  tenant TEXT NOT NULL CHECK(length(trim(tenant)) > 0),
  consumer TEXT NOT NULL CHECK(length(trim(consumer)) > 0),
  event_id TEXT NOT NULL CHECK(length(trim(event_id)) > 0),
  digest TEXT NOT NULL, result INTEGER NOT NULL,
  PRIMARY KEY (tenant, consumer, event_id)
);
