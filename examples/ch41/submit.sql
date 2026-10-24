-- name: submit_order
UPDATE orders SET state = 'SUBMITTED', version = version + 1
WHERE tenant = :tenant AND order_id = :order_id
  AND state = 'DRAFT' AND version = :expected_version
RETURNING sku, qty, version;

-- name: take_stock
UPDATE stock SET available = available - :qty
WHERE tenant = :tenant AND sku = :sku AND available >= :qty;

-- name: event
INSERT INTO outbox(event_id, tenant, order_id, version, payload)
VALUES (:event_id, :tenant, :order_id, :version, :payload);

-- name: result
INSERT INTO request_result(tenant, caller, request_key, request, response)
VALUES (:tenant, :caller, :key, :request, :response);
