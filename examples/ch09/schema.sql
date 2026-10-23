-- PostgreSQL 18 teaching schema; one authoritative database.
CREATE TABLE Link (
  code text COLLATE "C" PRIMARY KEY,
  owner_id bigint NOT NULL,
  target_url text NOT NULL,
  status text NOT NULL CHECK (status IN ('active','revoked','blocked','pending')),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  version bigint NOT NULL CHECK (version > 0)
);
CREATE TABLE Idempotency (
  owner_id bigint NOT NULL,
  key text COLLATE "C" NOT NULL,
  request_hash bytea NOT NULL,
  code text NOT NULL REFERENCES Link(code),
  response_status integer NOT NULL,
  response_body jsonb NOT NULL,
  retain_until timestamptz NOT NULL,
  PRIMARY KEY (owner_id, key)
);
CREATE TABLE Outbox (
  event_id uuid PRIMARY KEY,
  code text NOT NULL REFERENCES Link(code),
  version bigint NOT NULL,
  kind text NOT NULL,
  delivered_at timestamptz,
  UNIQUE(code, version)
);
