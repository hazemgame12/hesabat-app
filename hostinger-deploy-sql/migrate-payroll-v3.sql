-- Payroll module v3 migration
-- Adds: payroll income tax (per employee + run total),
--        cost_center_id snapshot per run line,
--        payroll_settings table (company-level account defaults).
-- Safe to run multiple times (IF NOT EXISTS / DO NOTHING patterns).

-- ── payroll_runs ──────────────────────────────────────────────────────────────
ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS total_payroll_tax              NUMERIC(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payroll_tax_liability_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT;

-- ── payroll_run_lines ─────────────────────────────────────────────────────────
ALTER TABLE payroll_run_lines
  ADD COLUMN IF NOT EXISTS payroll_tax  NUMERIC(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;

-- ── payroll_settings ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_settings (
  company_id                      UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  salary_expense_account_id       UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  net_payable_account_id          UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  deductions_account_id           UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  insurance_expense_account_id    UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  insurance_liability_account_id  UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  payroll_tax_liability_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
