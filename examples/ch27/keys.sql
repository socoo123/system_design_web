-- Executable SQLite subset of the teaching model; parent tables in schema.sql.
CREATE UNIQUE INDEX order_identity ON orders(scope, upstream_order);
CREATE UNIQUE INDEX attempt_generation ON attempts(order_id, generation);
CREATE TABLE active_slot (
  courier_id TEXT NOT NULL REFERENCES courier_capacity(courier_id),
  slot INTEGER NOT NULL CHECK(slot >= 0),
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(order_id),
  attempt_id TEXT NOT NULL UNIQUE REFERENCES attempts(attempt_id),
  PRIMARY KEY(courier_id, slot)
);
CREATE UNIQUE INDEX event_identity ON outbox(event_key);
-- One live slot per order; one order per courier slot. A courier has two slots.
-- A transaction also checks slot < capacity and changes occupied with the slot.
-- CHECK(0 <= occupied AND occupied <= capacity) is only a row-local guard.
-- All reserve/release writers lock order, then the same courier_capacity row.
