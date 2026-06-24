import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";

/**
 * Runs idempotent ALTER TABLE statements for payroll v2/v3 columns.
 * Called once at server startup — safe to run on every boot.
 * Uses raw SQL so it works even when Drizzle schema is ahead of the DB.
 */
export async function ensurePayrollSchema(): Promise<void> {
  const steps: Array<{ name: string; ddl: string }> = [
    {
      name: "cost_centers table",
      ddl: `
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
        )`,
    },
    {
      name: "code_sequences table",
      ddl: `
        CREATE TABLE IF NOT EXISTS code_sequences (
          id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id  UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          entity      TEXT        NOT NULL,
          fiscal_key  TEXT        NOT NULL,
          last_no     INTEGER     NOT NULL DEFAULT 0,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (company_id, entity, fiscal_key)
        )`,
    },
    {
      name: "payroll_settings table",
      ddl: `
        CREATE TABLE IF NOT EXISTS payroll_settings (
          company_id                        UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
          salary_expense_account_id         UUID REFERENCES accounts(id) ON DELETE RESTRICT,
          net_payable_account_id            UUID REFERENCES accounts(id) ON DELETE RESTRICT,
          deductions_account_id             UUID REFERENCES accounts(id) ON DELETE RESTRICT,
          insurance_expense_account_id      UUID REFERENCES accounts(id) ON DELETE RESTRICT,
          insurance_liability_account_id    UUID REFERENCES accounts(id) ON DELETE RESTRICT,
          payroll_tax_liability_account_id  UUID REFERENCES accounts(id) ON DELETE RESTRICT,
          updated_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
    },
    {
      name: "employees.employee_type",
      ddl: `ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_type TEXT NOT NULL DEFAULT 'permanent'`,
    },
    {
      name: "employees.national_id",
      ddl: `ALTER TABLE employees ADD COLUMN IF NOT EXISTS national_id TEXT`,
    },
    {
      name: "employees.cost_center_id",
      ddl: `ALTER TABLE employees ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL`,
    },
    {
      name: "employees.insurance_salary",
      ddl: `ALTER TABLE employees ADD COLUMN IF NOT EXISTS insurance_salary NUMERIC(18,2)`,
    },
    {
      name: "employees.include_insurance",
      ddl: `ALTER TABLE employees ADD COLUMN IF NOT EXISTS include_insurance BOOLEAN NOT NULL DEFAULT TRUE`,
    },
    {
      name: "employee_pay_components.linked_account_id",
      ddl: `ALTER TABLE employee_pay_components ADD COLUMN IF NOT EXISTS linked_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL`,
    },
    {
      name: "payroll_runs.insurance columns",
      ddl: `
        ALTER TABLE payroll_runs
          ADD COLUMN IF NOT EXISTS insurance_expense_account_id    UUID REFERENCES accounts(id) ON DELETE RESTRICT,
          ADD COLUMN IF NOT EXISTS insurance_liability_account_id  UUID REFERENCES accounts(id) ON DELETE RESTRICT,
          ADD COLUMN IF NOT EXISTS company_insurance_total         NUMERIC(18,2) NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS employee_insurance_total        NUMERIC(18,2) NOT NULL DEFAULT 0`,
    },
    {
      name: "payroll_runs.payroll_tax columns",
      ddl: `
        ALTER TABLE payroll_runs
          ADD COLUMN IF NOT EXISTS total_payroll_tax                NUMERIC(18,2) NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS payroll_tax_liability_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT`,
    },
    {
      name: "payroll_run_lines.insurance columns",
      ddl: `
        ALTER TABLE payroll_run_lines
          ADD COLUMN IF NOT EXISTS insurance_salary   NUMERIC(18,2) NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS company_insurance  NUMERIC(18,2) NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS employee_insurance NUMERIC(18,2) NOT NULL DEFAULT 0`,
    },
    {
      name: "payroll_run_lines.payroll_tax + cost_center_id",
      ddl: `
        ALTER TABLE payroll_run_lines
          ADD COLUMN IF NOT EXISTS payroll_tax    NUMERIC(18,2) NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL`,
    },
  ];

  let ok = 0;
  let skipped = 0;

  for (const step of steps) {
    try {
      await db.execute(sql.raw(step.ddl));
      ok++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("already exists") ||
        msg.includes("does not exist") === false
      ) {
        skipped++;
      } else {
        logger.warn({ step: step.name, err: msg }, "ensurePayrollSchema: step skipped");
        skipped++;
      }
    }
  }

  logger.info({ ok, skipped }, "ensurePayrollSchema complete");
}
