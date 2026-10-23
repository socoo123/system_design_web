-- PostgreSQL 18 teaching query; authenticated public post, signed cursor.
CREATE INDEX root_page ON comment (post_id, created_at DESC, id DESC)
  WHERE parent_id IS NULL AND ever_public;
CREATE INDEX reply_page ON comment (post_id, root_id, created_at DESC, id DESC)
  WHERE parent_id IS NOT NULL AND status = 'visible';

WITH roots AS (
  SELECT id, created_at,
         CASE WHEN status = 'visible' THEN 'visible' ELSE 'unavailable' END AS public_state,
         CASE WHEN status = 'visible' THEN body END AS body,
         CASE WHEN status = 'visible' THEN author_id END AS author_id
  FROM comment
  WHERE post_id = :post AND parent_id IS NULL AND ever_public
    AND (created_at, id) < (:before_time, :before_id)
  ORDER BY created_at DESC, id DESC LIMIT 20
)
SELECT r.*, c.id AS reply_id, c.created_at AS reply_time,
       c.parent_id, c.body AS reply_body, c.author_id AS reply_author
FROM roots r
LEFT JOIN LATERAL (
  SELECT id, created_at, parent_id, body, author_id
  FROM comment
  WHERE post_id = :post AND root_id = r.id
    AND parent_id IS NOT NULL AND status = 'visible'
  ORDER BY created_at DESC, id DESC LIMIT 3
) c ON true
ORDER BY r.created_at DESC, r.id DESC, c.created_at DESC, c.id DESC;
-- First page omits the before predicate; never use a made-up max timestamp.
-- Group by r.id into <=20 containers and <=60 distinct preview bodies.
-- Never load quote/body/profile fields from a hidden reply target.
-- Each thread's continuation starts after its LAST PREVIEW, not its root.
SELECT id, parent_id, created_at, body, author_id FROM comment
WHERE post_id = :post AND root_id = :root AND parent_id IS NOT NULL
  AND status = 'visible' AND (created_at, id) < (:before_time, :before_id)
ORDER BY created_at DESC, id DESC LIMIT 20;
