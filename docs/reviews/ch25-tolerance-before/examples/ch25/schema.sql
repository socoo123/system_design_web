-- PostgreSQL 18 teaching schema; one authoritative scheduler database.
CREATE TABLE job (
  id text PRIMARY KEY, version bigint NOT NULL CHECK (version > 0),
  shard smallint NOT NULL CHECK (shard BETWEEN 0 AND 15),
  enabled boolean NOT NULL, next_run_at timestamptz,
  policy text NOT NULL CHECK (policy IN ('skip','coalesce','catch_up')),
  spec jsonb NOT NULL, recovery_cutoff timestamptz
);
CREATE INDEX job_due ON job(shard, next_run_at, id) WHERE enabled;
CREATE TABLE run (
  id uuid PRIMARY KEY, job_id text NOT NULL REFERENCES job(id),
  schedule_version bigint NOT NULL, scheduled_at timestamptz NOT NULL,
  payload jsonb NOT NULL, effect_key text NOT NULL,
  state text NOT NULL CHECK (state IN
    ('ready','running','retry_wait','succeeded','cancelled','review')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  generation bigint NOT NULL DEFAULT 0 CHECK (generation >= 0),
  owner text, lease_until timestamptz, retry_at timestamptz,
  cancel_requested boolean NOT NULL DEFAULT false,
  effect_unknown boolean NOT NULL DEFAULT false, result jsonb,
  CONSTRAINT occurrence UNIQUE(job_id, schedule_version, scheduled_at),
  CHECK ((state = 'running' AND owner IS NOT NULL AND lease_until IS NOT NULL)
      OR (state <> 'running' AND owner IS NULL AND lease_until IS NULL))
);
CREATE INDEX run_ready ON run(state, retry_at, scheduled_at);
CREATE INDEX run_expired ON run(lease_until) WHERE state = 'running';
-- spec includes the pinned calendar/timezone rules and handler input.
-- A separate audit table stores skip/coalesce ranges in the same T1.
