-- Add country and base_currency columns to existing companies table.
-- Idempotent: IF NOT EXISTS is safe to run multiple times.
-- Existing NULL rows are back-filled to EG / EGP defaults.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS country       TEXT NOT NULL DEFAULT 'EG',
  ADD COLUMN IF NOT EXISTS base_currency TEXT NOT NULL DEFAULT 'EGP';
