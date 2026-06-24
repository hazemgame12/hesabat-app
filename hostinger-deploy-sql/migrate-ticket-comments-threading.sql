-- Support ticket threading columns
-- Safe to run multiple times (IF NOT EXISTS / idempotent)
-- Run on VPS: psql $DATABASE_URL -f migrate-ticket-comments-threading.sql

ALTER TABLE ticket_comments
  ADD COLUMN IF NOT EXISTS is_admin_reply  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_read_by_user  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS is_read_by_admin BOOLEAN NOT NULL DEFAULT TRUE;
