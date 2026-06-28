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
      name: "employees.payroll_tax",
      ddl: `ALTER TABLE employees ADD COLUMN IF NOT EXISTS payroll_tax NUMERIC(18,2) NOT NULL DEFAULT 0`,
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
    {
      name: "ticket_comments.is_admin_reply",
      ddl: `ALTER TABLE ticket_comments ADD COLUMN IF NOT EXISTS is_admin_reply BOOLEAN NOT NULL DEFAULT FALSE`,
    },
    {
      name: "ticket_comments.is_read_by_user",
      ddl: `ALTER TABLE ticket_comments ADD COLUMN IF NOT EXISTS is_read_by_user BOOLEAN NOT NULL DEFAULT TRUE`,
    },
    {
      name: "ticket_comments.is_read_by_admin",
      ddl: `ALTER TABLE ticket_comments ADD COLUMN IF NOT EXISTS is_read_by_admin BOOLEAN NOT NULL DEFAULT TRUE`,
    },
    {
      name: "ticket_comments.user_id nullable",
      ddl: `ALTER TABLE ticket_comments ALTER COLUMN user_id DROP NOT NULL`,
    },
    {
      name: "ticket_comments.author_name",
      ddl: `ALTER TABLE ticket_comments ADD COLUMN IF NOT EXISTS author_name TEXT`,
    },
    {
      name: "documents.sender_name",
      ddl: `ALTER TABLE documents ADD COLUMN IF NOT EXISTS sender_name TEXT`,
    },
    {
      name: "documents.file_hash",
      ddl: `ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_hash TEXT`,
    },
    {
      name: "companies.inbox_token",
      ddl: `ALTER TABLE companies ADD COLUMN IF NOT EXISTS inbox_token TEXT`,
    },
  ];

  // ── Accounting Dimensions Engine (branches, projects, cost_centers.code) ──
  steps.push(
    {
      name: "branches table",
      ddl: `
        CREATE TABLE IF NOT EXISTS branches (
          id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id  UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          code        TEXT,
          name_ar     TEXT        NOT NULL,
          name_en     TEXT,
          budget      NUMERIC(16,2),
          is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
    },
    {
      name: "branches code unique index",
      ddl: `CREATE UNIQUE INDEX IF NOT EXISTS branches_company_id_code_idx ON branches (company_id, code) WHERE code IS NOT NULL`,
    },
    {
      name: "projects table",
      ddl: `
        CREATE TABLE IF NOT EXISTS projects (
          id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id  UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          code        TEXT,
          name_ar     TEXT        NOT NULL,
          name_en     TEXT,
          status      TEXT        NOT NULL DEFAULT 'active',
          budget      NUMERIC(16,2),
          is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
    },
    {
      name: "projects code unique index",
      ddl: `CREATE UNIQUE INDEX IF NOT EXISTS projects_company_id_code_idx ON projects (company_id, code) WHERE code IS NOT NULL`,
    },
    {
      name: "cost_centers.code",
      ddl: `ALTER TABLE cost_centers ADD COLUMN IF NOT EXISTS code TEXT`,
    },
    {
      name: "cost_centers code unique index",
      ddl: `CREATE UNIQUE INDEX IF NOT EXISTS cost_centers_company_id_code_idx ON cost_centers (company_id, code) WHERE code IS NOT NULL`,
    },
    { name: "journal_entry_lines.project_id",  ddl: `ALTER TABLE journal_entry_lines  ADD COLUMN IF NOT EXISTS project_id  UUID REFERENCES projects(id)  ON DELETE SET NULL` },
    { name: "journal_entry_lines.branch_id",   ddl: `ALTER TABLE journal_entry_lines  ADD COLUMN IF NOT EXISTS branch_id   UUID REFERENCES branches(id)  ON DELETE SET NULL` },
    { name: "invoice_lines.project_id",        ddl: `ALTER TABLE invoice_lines         ADD COLUMN IF NOT EXISTS project_id  UUID REFERENCES projects(id)  ON DELETE SET NULL` },
    { name: "invoice_lines.branch_id",         ddl: `ALTER TABLE invoice_lines         ADD COLUMN IF NOT EXISTS branch_id   UUID REFERENCES branches(id)  ON DELETE SET NULL` },
    { name: "bank_movements.project_id",       ddl: `ALTER TABLE bank_movements        ADD COLUMN IF NOT EXISTS project_id  UUID REFERENCES projects(id)  ON DELETE SET NULL` },
    { name: "bank_movements.branch_id",        ddl: `ALTER TABLE bank_movements        ADD COLUMN IF NOT EXISTS branch_id   UUID REFERENCES branches(id)  ON DELETE SET NULL` },
    { name: "inventory_movements.cost_center_id", ddl: `ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL` },
    { name: "inventory_movements.project_id",  ddl: `ALTER TABLE inventory_movements   ADD COLUMN IF NOT EXISTS project_id  UUID REFERENCES projects(id)  ON DELETE SET NULL` },
    { name: "inventory_movements.branch_id",   ddl: `ALTER TABLE inventory_movements   ADD COLUMN IF NOT EXISTS branch_id   UUID REFERENCES branches(id)  ON DELETE SET NULL` },
    { name: "fixed_assets.cost_center_id",     ddl: `ALTER TABLE fixed_assets          ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL` },
    { name: "fixed_assets.project_id",         ddl: `ALTER TABLE fixed_assets          ADD COLUMN IF NOT EXISTS project_id  UUID REFERENCES projects(id)  ON DELETE SET NULL` },
    { name: "fixed_assets.branch_id",          ddl: `ALTER TABLE fixed_assets          ADD COLUMN IF NOT EXISTS branch_id   UUID REFERENCES branches(id)  ON DELETE SET NULL` },
    { name: "asset_depreciation_entries.cost_center_id", ddl: `ALTER TABLE asset_depreciation_entries ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL` },
    { name: "asset_depreciation_entries.project_id",     ddl: `ALTER TABLE asset_depreciation_entries ADD COLUMN IF NOT EXISTS project_id  UUID REFERENCES projects(id)  ON DELETE SET NULL` },
    { name: "asset_depreciation_entries.branch_id",      ddl: `ALTER TABLE asset_depreciation_entries ADD COLUMN IF NOT EXISTS branch_id   UUID REFERENCES branches(id)  ON DELETE SET NULL` },
  );

  steps.push({
    name: "documents table",
    ddl: `
      CREATE TABLE IF NOT EXISTS documents (
        id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id        UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        display_name      TEXT        NOT NULL,
        original_name     TEXT        NOT NULL,
        file_path         TEXT        NOT NULL,
        mime_type         TEXT        NOT NULL,
        size_bytes        INTEGER     NOT NULL,
        source            TEXT        NOT NULL DEFAULT 'manual',
        sender_email      TEXT,
        email_subject     TEXT,
        uploaded_by       UUID        REFERENCES users(id) ON DELETE SET NULL,
        invoice_id        UUID,
        journal_entry_id  UUID,
        bank_movement_id  UUID,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
  });

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
