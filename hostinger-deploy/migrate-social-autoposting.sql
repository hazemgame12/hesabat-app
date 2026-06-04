-- HG Audit — Social Auto-Posting (Phase 2) migration
-- Run ONCE on the production database before deploying the new build.
-- Safe to re-run: uses IF NOT EXISTS guards.

-- Per-post external publish tracking (Facebook / Instagram / LinkedIn)
ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS publish_result   text;

ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS publish_error    text NOT NULL DEFAULT '';

ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS platform_post_id text NOT NULL DEFAULT '';

ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS published_at     timestamp;

ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS publish_attempts integer NOT NULL DEFAULT 0;

-- Encrypted-at-rest platform credentials entered from the dashboard.
-- `data` holds an AES-256-GCM blob (never plaintext); the key is derived from
-- the server secret CREDENTIALS_SECRET / SESSION_SECRET (env only).
CREATE TABLE IF NOT EXISTS social_credentials (
  platform   text PRIMARY KEY,
  data       text NOT NULL DEFAULT '',
  updated_at timestamp NOT NULL DEFAULT now()
);
