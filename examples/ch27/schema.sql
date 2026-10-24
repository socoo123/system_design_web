PRAGMA foreign_keys = ON;
CREATE TABLE courier_capacity (
  courier_id TEXT PRIMARY KEY NOT NULL,
  capacity INTEGER NOT NULL CHECK(capacity BETWEEN 1 AND 2),
  occupied INTEGER NOT NULL DEFAULT 0 CHECK(occupied >= 0 AND occupied <= capacity),
  paused INTEGER NOT NULL DEFAULT 0 CHECK(paused IN (0,1))
);
CREATE TABLE orders (
  order_id TEXT PRIMARY KEY NOT NULL,
  scope TEXT NOT NULL,
  upstream_order TEXT NOT NULL,
  digest TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending_match','offered','assigned','picked_up','delivered','cancelled','failed')),
  generation INTEGER NOT NULL CHECK(generation > 0),
  current_attempt TEXT UNIQUE,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 3),
  match_deadline INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE attempts (
  attempt_id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(order_id),
  generation INTEGER NOT NULL,
  courier_id TEXT NOT NULL REFERENCES courier_capacity(courier_id),
  deadline INTEGER NOT NULL,
  config_version TEXT NOT NULL DEFAULT 'weights-v1',
  result TEXT NOT NULL CHECK(result IN ('offered','assigned','picked_up','delivered','rejected','expired','cancelled','released')),
  offer_receipt TEXT NOT NULL,
  accept_receipt TEXT,
  cooldown_until INTEGER
);
CREATE TABLE outbox (
  event_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  delivered INTEGER NOT NULL DEFAULT 0 CHECK(delivered IN (0,1))
);
CREATE TABLE operation_receipt (
  attempt_id TEXT NOT NULL REFERENCES attempts(attempt_id),
  action TEXT NOT NULL,
  evidence TEXT NOT NULL,
  receipt TEXT NOT NULL,
  PRIMARY KEY(attempt_id, action)
);
CREATE TABLE creation_fence (
  scope TEXT NOT NULL,
  upstream_order TEXT NOT NULL,
  PRIMARY KEY(scope, upstream_order)
);
CREATE TABLE location_session (
  courier_id TEXT PRIMARY KEY NOT NULL,
  epoch INTEGER NOT NULL,
  connected INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  clock_bounded INTEGER NOT NULL,
  captured INTEGER,
  received INTEGER,
  expires INTEGER,
  accuracy REAL,
  lat REAL,
  lon REAL,
  cell TEXT
);
CREATE TABLE cell_member (
  courier_id TEXT NOT NULL,
  cell TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  PRIMARY KEY(courier_id, cell)
);
