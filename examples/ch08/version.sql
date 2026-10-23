-- Existing row; amount is a positive integer; version is NOT NULL.
UPDATE inventory
SET qty = qty - :amount, version = version + 1
WHERE sku = :sku
  AND :amount > 0
  AND version = :expected_version
  AND qty >= :amount;
