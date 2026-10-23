-- PostgreSQL 18; the author shard owns Post, Outbox and PublishKey.
CREATE TABLE publish_key (
  author_id bigint NOT NULL, idem_key text NOT NULL,
  request_hash bytea NOT NULL, post_id bigint NOT NULL,
  response_json jsonb NOT NULL, retain_until timestamptz NOT NULL,
  PRIMARY KEY (author_id, idem_key)
);
-- Post has unique post_id; Outbox has unique event_id.
-- They are inserted with publish_key in ONE author-shard transaction.

-- A different store, partitioned by reader; not in that transaction.
CREATE TABLE timeline (
  user_id bigint NOT NULL, post_id bigint NOT NULL,
  author_id bigint NOT NULL, created_at_ms bigint NOT NULL,
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX timeline_seek
  ON timeline (user_id, created_at_ms DESC, post_id DESC);
-- Bound parameters; same exclusive tuple bound on every source:
SELECT * FROM timeline
 WHERE user_id = :viewer
   AND (created_at_ms, post_id) < (:before_ms, :before_id)
 ORDER BY created_at_ms DESC, post_id DESC LIMIT :batch;
