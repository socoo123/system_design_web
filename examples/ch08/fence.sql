-- Existing row: sku PRIMARY KEY, qty >= 0, last_fence BIGINT NOT NULL DEFAULT 0.
-- Positive BIGINT f is bound to a successful acquisition; one mutation per f.
UPDATE inventory
SET qty = qty - :amount, last_fence = :f
WHERE sku = :sku
  AND :amount > 0 AND :f > 0
  AND last_fence < :f
  AND qty >= :amount;
