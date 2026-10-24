-- All scope/key columns in schema.sql are NOT NULL.
CREATE UNIQUE INDEX intent_identity
  ON payment(environment, merchant_id, order_ref, business_version);
CREATE UNIQUE INDEX request_identity
  ON request_key(environment, merchant_id, operation, request_key);
CREATE UNIQUE INDEX channel_command_identity
  ON attempt(environment, channel, account_id, channel_key);
CREATE UNIQUE INDEX receipt_identity
  ON inbox(environment, channel, account_id, event_id);
CREATE UNIQUE INDEX financial_effect_identity
  ON posting(environment, channel, account_id, object_id, kind);
-- One outbox event_id is reused on every delivery.
-- Cross-row journal balance is checked by the posting transaction,
-- not by a row CHECK, and these indexes do not dedupe PSP effects.
