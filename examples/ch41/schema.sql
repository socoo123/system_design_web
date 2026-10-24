PRAGMA foreign_keys = ON;
CREATE TABLE stock (
    tenant TEXT NOT NULL, sku TEXT NOT NULL,
    available INTEGER NOT NULL CHECK (available >= 0),
    PRIMARY KEY (tenant, sku)
);
CREATE TABLE orders (
    tenant TEXT NOT NULL, order_id TEXT NOT NULL,
    sku TEXT NOT NULL, qty INTEGER NOT NULL CHECK (qty > 0),
    state TEXT NOT NULL CHECK (state IN ('DRAFT', 'SUBMITTED', 'CANCELLED')),
    version INTEGER NOT NULL CHECK (version >= 0),
    PRIMARY KEY (tenant, order_id),
    FOREIGN KEY (tenant, sku) REFERENCES stock(tenant, sku)
);
CREATE TABLE outbox (
    event_id TEXT NOT NULL PRIMARY KEY, tenant TEXT NOT NULL, order_id TEXT NOT NULL,
    version INTEGER NOT NULL, payload TEXT NOT NULL,
    UNIQUE (tenant, order_id, version)
);
CREATE TABLE request_result (
    tenant TEXT NOT NULL, caller TEXT NOT NULL, request_key TEXT NOT NULL,
    request TEXT NOT NULL, response TEXT NOT NULL,
    PRIMARY KEY (tenant, caller, request_key)
);
-- A separate local fence demonstration; not a replicated ownership service.
CREATE TABLE range_owner (
    range_id TEXT PRIMARY KEY, revision INTEGER NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('ACTIVE', 'FROZEN'))
);
CREATE TABLE range_data (range_id TEXT PRIMARY KEY, value INTEGER NOT NULL);
