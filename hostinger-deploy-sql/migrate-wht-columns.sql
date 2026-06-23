-- WHT (Withholding Tax) columns
-- Safe to run multiple times (IF NOT EXISTS)
-- Run on VPS: psql $DATABASE_URL -f migrate-wht-columns.sql

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS wht_total numeric(18,2) NOT NULL DEFAULT 0;

ALTER TABLE invoice_lines
  ADD COLUMN IF NOT EXISTS wht_tax_id  uuid REFERENCES taxes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wht_amount  numeric(18,2) NOT NULL DEFAULT 0;

ALTER TABLE taxes
  ADD COLUMN IF NOT EXISTS wht_debit_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;
