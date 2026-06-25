-- Allow super-admin to post comments (not in users table)
-- Safe to run multiple times
ALTER TABLE ticket_comments ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE ticket_comments ADD COLUMN IF NOT EXISTS author_name TEXT;
