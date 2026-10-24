-- PostgreSQL 18 teaching schema; recovered inbox and ledger must stay together.
CREATE TABLE inbox (
  handler text NOT NULL,
  event_id text NOT NULL,
  account_id text NOT NULL,
  delta_cents bigint NOT NULL,
  result_balance bigint,
  PRIMARY KEY (handler, event_id)
);
CREATE TABLE ledger (
  account_id text PRIMARY KEY,
  balance_cents bigint NOT NULL
);
