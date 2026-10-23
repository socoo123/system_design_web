-- Teaching shape: PostgreSQL 18; all rows belong to one metadata authority.
-- Every metadata writer first locks its pre-created tenant_guard row.
CREATE TABLE tenant_guard (
  tenant_id TEXT PRIMARY KEY, change_head BIGINT NOT NULL CHECK (change_head >= 0),
  used_bytes BIGINT NOT NULL CHECK (used_bytes >= 0), quota_bytes BIGINT NOT NULL
);
-- The complete schema also contains File, ACL, Session and immutable Manifest.
CREATE TABLE block_generation (
  tenant_id TEXT NOT NULL, generation TEXT NOT NULL, digest TEXT NOT NULL,
  byte_length BIGINT NOT NULL CHECK (byte_length > 0),
  object_key TEXT NOT NULL UNIQUE, state TEXT NOT NULL,
  PRIMARY KEY (tenant_id, generation)
);
CREATE UNIQUE INDEX one_ready_generation
  ON block_generation (tenant_id, digest, byte_length) WHERE state = 'READY';
CREATE TABLE commit_receipt (
  tenant_id TEXT NOT NULL, owner_id TEXT NOT NULL, request_key TEXT NOT NULL,
  intent_digest TEXT NOT NULL, file_id TEXT NOT NULL, version BIGINT NOT NULL,
  change_seq BIGINT NOT NULL,
  PRIMARY KEY (tenant_id, owner_id, request_key)
);
-- SessionBlock PK=(tenant,session,ordinal), recording generation and proof.
-- Version PK=(tenant,file,version); VersionBlock PK=(tenant,file,version,ordinal).
-- Change and Outbox each have PK=(tenant,change_seq).
-- File has UNIQUE(tenant,parent,name); Session has at most one result.
-- No sequence allocates change_seq; the locked ordinary guard row does.
