-- HG Audit — AI Content Studio (Phase 1) migration
-- Run ONCE on the Neon production database before deploying the new build.
-- Safe to re-run: uses IF NOT EXISTS / IF EXISTS guards.

-- 1) Articles: add scheduling columns
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published';

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS scheduled_at timestamp;

-- Keep status in sync with the existing published flag for legacy rows
UPDATE articles SET status = 'published' WHERE published = true;
UPDATE articles SET status = 'draft' WHERE published = false;

-- 2) Social posts table (Updates feed + scheduler)
CREATE TABLE IF NOT EXISTS social_posts (
  id           serial PRIMARY KEY,
  platform     text NOT NULL,
  caption_ar   text NOT NULL DEFAULT '',
  caption_en   text NOT NULL DEFAULT '',
  image        text NOT NULL DEFAULT '',
  link         text NOT NULL DEFAULT '',
  status       text NOT NULL DEFAULT 'draft',
  scheduled_at timestamp,
  released_at  timestamp,
  article_id   integer,
  created_at   timestamp NOT NULL DEFAULT NOW(),
  updated_at   timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS social_posts_status_idx ON social_posts (status);
CREATE INDEX IF NOT EXISTS social_posts_scheduled_idx ON social_posts (scheduled_at);
