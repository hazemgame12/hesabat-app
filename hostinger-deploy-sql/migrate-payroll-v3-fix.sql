-- Payroll v3 fix migration
-- Ensures cost_centers table exists before adding the FK,
-- then creates payroll_settings and adds missing columns.
-- Safe to run multiple times (IF NOT EXISTS patterns throughout).

-- ── cost_centers (create if missing on this VPS) ─────────────────────────────
CREATE TABLE IF NOT EXISTS cost_centers (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID          NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name_ar     TEXT          NOT NULL,
  name_en     TEXT,
  type        TEXT          NOT NULL,
  budget      NUMERIC(16,2),
  is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── payroll_runs ──────────────────────────────────────────────────────────────
ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS total_payroll_tax              NUMERIC(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payroll_tax_liability_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT;

-- ── payroll_run_lines ─────────────────────────────────────────────────────────
ALTER TABLE payroll_run_lines
  ADD COLUMN IF NOT EXISTS payroll_tax     NUMERIC(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_center_id  UUID REFERENCES cost_centers(id) ON DELETE SET NULL;

-- ── payroll_settings ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_settings (
  company_id                       UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  salary_expense_account_id        UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  net_payable_account_id           UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  deductions_account_id            UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  insurance_expense_account_id     UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  insurance_liability_account_id   UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  payroll_tax_liability_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  updated_at                       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
