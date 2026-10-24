-- Executable SQLite contract schema. Production PG18 uses row locks shown in pseudocode.
PRAGMA foreign_keys=ON;
CREATE TABLE fences(scope TEXT PRIMARY KEY, epoch INTEGER NOT NULL, active INTEGER NOT NULL,
  gated INTEGER NOT NULL, recovery_id TEXT, snapshot_hash TEXT);
CREATE TABLE stock(scope TEXT NOT NULL REFERENCES fences(scope), resource TEXT NOT NULL,
  cap INTEGER NOT NULL CHECK(cap>0), free INTEGER NOT NULL CHECK(free>=0),
  reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved>=0),
  confirmed INTEGER NOT NULL DEFAULT 0 CHECK(confirmed>=0),
  CHECK(free+reserved+confirmed=cap), PRIMARY KEY(scope,resource));
CREATE TABLE requests(owner TEXT NOT NULL, op TEXT NOT NULL, request_key TEXT NOT NULL,
  scope TEXT NOT NULL REFERENCES fences(scope), digest TEXT NOT NULL, token TEXT NOT NULL,
  intent TEXT NOT NULL, outcome TEXT NOT NULL, hold_id TEXT, receipt TEXT,
  PRIMARY KEY(owner,op,request_key));
CREATE TABLE holds(hold_id TEXT PRIMARY KEY, owner TEXT NOT NULL, order_id TEXT NOT NULL,
  scope TEXT NOT NULL REFERENCES fences(scope), digest TEXT NOT NULL, token TEXT NOT NULL,
  expected_items TEXT NOT NULL, deadline INTEGER NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('HELD','CONFIRMED','RELEASED')), version INTEGER NOT NULL);
CREATE INDEX due_holds ON holds(state,deadline,hold_id);
CREATE TABLE hold_items(hold_id TEXT NOT NULL REFERENCES holds(hold_id), scope TEXT NOT NULL,
  resource TEXT NOT NULL, q INTEGER NOT NULL CHECK(q>0), PRIMARY KEY(hold_id,resource),
  FOREIGN KEY(scope,resource) REFERENCES stock(scope,resource));
CREATE TABLE outbox(event_id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('HOLD_STATE','REQUEST_TERMINAL')),
  scope TEXT NOT NULL, epoch INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE deliveries(event_id TEXT NOT NULL REFERENCES outbox(event_id), destination TEXT NOT NULL,
  sent INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(event_id,destination));
-- The following tables are instantiated in a separate downstream DB in production.
CREATE TABLE consumer_inbox(consumer TEXT NOT NULL,event_id TEXT NOT NULL,digest TEXT NOT NULL,
  PRIMARY KEY(consumer,event_id));
CREATE TABLE projections(hold_id TEXT PRIMARY KEY NOT NULL, version INTEGER NOT NULL,state TEXT NOT NULL);
