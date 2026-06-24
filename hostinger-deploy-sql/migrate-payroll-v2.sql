-- Payroll module v2 migration
-- Adds: employee nationalId/type/costCenter/insurance fields,
--        component linkedAccountId,
--        payroll_runs insurance accounts + totals,
--        payroll_run_lines insurance snapshot columns.
-- Safe to run multiple times (IF NOT EXISTS / DO NOTHING patterns).

-- ── employees ────────────────────────────────────────────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS employee_type   TEXT        NOT NULL DEFAULT 'permanent',
  ADD COLUMN IF NOT EXISTS national_id     TEXT,
  ADD COLUMN IF NOT EXISTS cost_center_id  UUID        REFERENCES cost_centers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS insurance_salary NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS include_insurance BOOLEAN   NOT NULL DEFAULT TRUE;

-- ── employee_pay_components ───────────────────────────────────────────────────
ALTER TABLE employee_pay_components
  ADD COLUMN IF NOT EXISTS linked_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

-- ── payroll_runs ──────────────────────────────────────────────────────────────
ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS insurance_expense_account_id   UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS insurance_liability_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS company_insurance_total        NUMERIC(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS employee_insurance_total       NUMERIC(18,2) NOT NULL DEFAULT 0;

-- ── payroll_run_lines ─────────────────────────────────────────────────────────
ALTER TABLE payroll_run_lines
  ADD COLUMN IF NOT EXISTS insurance_salary    NUMERIC(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS company_insurance   NUMERIC(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS employee_insurance  NUMERIC(18,2) NOT NULL DEFAULT 0;
