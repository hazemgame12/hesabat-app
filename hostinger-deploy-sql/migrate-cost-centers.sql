-- Prerequisite migration — runs BEFORE migrate-payroll-v2.sql (alphabetical: c < p)
-- Uses DO blocks so a missing table never aborts the migration or the deploy.
-- Every statement is idempotent (IF NOT EXISTS / EXCEPTION handlers).

-- ── cost_centers ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cost_centers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name_ar     TEXT        NOT NULL,
  name_en     TEXT,
  type        TEXT        NOT NULL,
  budget      NUMERIC(16,2),
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── code_sequences ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS code_sequences (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity      TEXT        NOT NULL,
  fiscal_key  TEXT        NOT NULL,
  last_no     INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, entity, fiscal_key)
);

-- ── payroll_settings ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_settings (
  company_id                        UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  salary_expense_account_id         UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  net_payable_account_id            UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  deductions_account_id             UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  insurance_expense_account_id      UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  insurance_liability_account_id    UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  payroll_tax_liability_account_id  UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  updated_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── employees — v2 columns ────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS employee_type     TEXT     NOT NULL DEFAULT 'permanent',
    ADD COLUMN IF NOT EXISTS national_id       TEXT,
    ADD COLUMN IF NOT EXISTS cost_center_id    UUID     REFERENCES cost_centers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS insurance_salary  NUMERIC(18,2),
    ADD COLUMN IF NOT EXISTS include_insurance BOOLEAN  NOT NULL DEFAULT TRUE;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'employees table not found — skipping v2 columns';
END $$;

-- ── employee_pay_components — v2 column ──────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE employee_pay_components
    ADD COLUMN IF NOT EXISTS linked_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'employee_pay_components not found — skipping';
END $$;

-- ── payroll_runs — v2 + v3 columns ───────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE payroll_runs
    ADD COLUMN IF NOT EXISTS insurance_expense_account_id    UUID REFERENCES accounts(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS insurance_liability_account_id  UUID REFERENCES accounts(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS company_insurance_total         NUMERIC(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS employee_insurance_total        NUMERIC(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_payroll_tax               NUMERIC(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS payroll_tax_liability_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'payroll_runs not found — skipping';
END $$;

-- ── payroll_run_lines — v2 + v3 columns ──────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE payroll_run_lines
    ADD COLUMN IF NOT EXISTS insurance_salary   NUMERIC(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS company_insurance  NUMERIC(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS employee_insurance NUMERIC(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS payroll_tax        NUMERIC(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cost_center_id     UUID REFERENCES cost_centers(id) ON DELETE SET NULL;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'payroll_run_lines not found — skipping';
END $$;
