-- =============================================================
-- Hesabat Core Schema — Full table creation (idempotent)
-- Creates ALL Hesabat tables with IF NOT EXISTS so it is safe
-- to run against a DB that already has some or all tables.
-- Order respects FK dependencies.
-- =============================================================

-- ── 1. companies ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        TEXT        NOT NULL,
  legal_name                  TEXT,
  trade_name                  TEXT,
  tax_registration_number     TEXT,
  activity_description        TEXT,
  logo_url                    TEXT,
  country                     TEXT        NOT NULL DEFAULT 'EG',
  base_currency               TEXT        NOT NULL DEFAULT 'EGP',
  address                     TEXT,
  phone                       TEXT,
  commercial_registration_number TEXT,
  branch_code                 TEXT,
  e_invoice_enabled           BOOLEAN     NOT NULL DEFAULT FALSE,
  plan_id                     UUID,
  subscription_status         TEXT        DEFAULT 'trial'
                              CHECK (subscription_status IN ('trial','pending_payment','active','expired','cancelled','suspended')),
  trial_ends_at               TIMESTAMPTZ,
  is_active                   BOOLEAN     NOT NULL DEFAULT TRUE,
  locked_through              DATE,
  max_users                   INTEGER     DEFAULT 1,
  max_transactions            INTEGER     DEFAULT 1000,
  inbox_token                 TEXT        UNIQUE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. users ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email         TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'owner',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (email);

-- ── 3. sessions ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id                              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash                      TEXT        NOT NULL,
  expires_at                      TIMESTAMPTZ NOT NULL,
  is_impersonating                BOOLEAN     NOT NULL DEFAULT FALSE,
  impersonated_by_super_admin_id  UUID,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions (token_hash);

-- ── 4. invitations ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invitations (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email             TEXT        NOT NULL,
  role              TEXT        NOT NULL,
  token_hash        TEXT        NOT NULL,
  invited_by_user_id UUID       REFERENCES users(id) ON DELETE SET NULL,
  status            TEXT        NOT NULL DEFAULT 'pending',
  expires_at        TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at       TIMESTAMPTZ
);

-- ── 5. password_reset_tokens ──────────────────────────────────
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          SERIAL      PRIMARY KEY,
  user_id     UUID        NOT NULL,
  token_hash  TEXT        NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 6. accounts (chart of accounts) ──────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID    NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code          TEXT    NOT NULL,
  name_ar       TEXT    NOT NULL,
  name_en       TEXT,
  type          TEXT    NOT NULL,
  currency_type TEXT    NOT NULL DEFAULT 'base',
  currency      TEXT,
  parent_id     UUID    REFERENCES accounts(id) ON DELETE SET NULL,
  is_group      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_company_code_unique ON accounts (company_id, code);

-- ── 7. currencies ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS currencies (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code            TEXT        NOT NULL,
  name_ar         TEXT        NOT NULL,
  name_en         TEXT,
  exchange_rate   NUMERIC(18,6) NOT NULL,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  rate_updated_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS currencies_company_code_unique ON currencies (company_id, code);

-- ── 8. taxes ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS taxes (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name_ar             TEXT        NOT NULL,
  name_en             TEXT,
  kind                TEXT        NOT NULL,
  rate                NUMERIC(6,3) NOT NULL,
  service_nature      TEXT,
  linked_account_id   UUID        REFERENCES accounts(id) ON DELETE SET NULL,
  wht_debit_account_id UUID       REFERENCES accounts(id) ON DELETE SET NULL,
  tax_type            TEXT,
  tax_category        TEXT,
  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 9. branches ───────────────────────────────────────────────
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
);
CREATE UNIQUE INDEX IF NOT EXISTS branches_company_id_code_idx
  ON branches (company_id, code)
  WHERE code IS NOT NULL;

-- ── 10. projects ──────────────────────────────────────────────
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
);
CREATE UNIQUE INDEX IF NOT EXISTS projects_company_id_code_idx
  ON projects (company_id, code)
  WHERE code IS NOT NULL;

-- ── 11. cost_centers ──────────────────────────────────────────
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

-- ── 12. code_sequences ────────────────────────────────────────
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

-- ── 13. journal_entries ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS journal_entries (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entry_no            INTEGER     NOT NULL,
  date                DATE        NOT NULL,
  reference           TEXT,
  notes               TEXT,
  status              TEXT        NOT NULL DEFAULT 'draft',
  entry_type          TEXT        NOT NULL DEFAULT 'normal',
  reversed_entry_id   UUID        REFERENCES journal_entries(id) ON DELETE SET NULL,
  is_opening_balance  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_by          UUID        REFERENCES users(id) ON DELETE SET NULL,
  submitted_by        UUID        REFERENCES users(id) ON DELETE SET NULL,
  submitted_at        TIMESTAMPTZ,
  approved_by         UUID        REFERENCES users(id) ON DELETE SET NULL,
  approved_at         TIMESTAMPTZ,
  posted_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_one_opening_per_company
  ON journal_entries (company_id)
  WHERE is_opening_balance = true;
CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_one_reversal_per_source
  ON journal_entries (company_id, reversed_entry_id)
  WHERE entry_type = 'reversal';

-- ── 14. fiscal_years ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fiscal_years (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name              TEXT        NOT NULL,
  start_date        DATE        NOT NULL,
  end_date          DATE        NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'open',
  closing_entry_id  UUID        REFERENCES journal_entries(id) ON DELETE SET NULL,
  closed_at         TIMESTAMPTZ,
  closed_by         UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fiscal_years_company_idx ON fiscal_years (company_id);

-- ── 15. journal_entry_lines ───────────────────────────────────
CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id        UUID        NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  company_id      UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  line_no         INTEGER     NOT NULL,
  account_id      UUID        NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  description     TEXT,
  currency        TEXT        NOT NULL,
  exchange_rate   NUMERIC(18,6) NOT NULL DEFAULT 1,
  debit           NUMERIC(18,2) NOT NULL DEFAULT 0,
  credit          NUMERIC(18,2) NOT NULL DEFAULT 0,
  debit_base      NUMERIC(18,2) NOT NULL DEFAULT 0,
  credit_base     NUMERIC(18,2) NOT NULL DEFAULT 0,
  tax_id          UUID        REFERENCES taxes(id) ON DELETE SET NULL,
  cost_center_id  UUID        REFERENCES cost_centers(id) ON DELETE SET NULL,
  project_id      UUID        REFERENCES projects(id) ON DELETE SET NULL,
  branch_id       UUID        REFERENCES branches(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 16. journal_entry_attachments ────────────────────────────
CREATE TABLE IF NOT EXISTS journal_entry_attachments (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id      UUID        NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  company_id    UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  file_name     TEXT        NOT NULL,
  object_key    TEXT        NOT NULL,
  content_type  TEXT,
  size          INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 17. customers ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code                        TEXT        NOT NULL,
  name_ar                     TEXT        NOT NULL,
  name_en                     TEXT,
  type                        TEXT        NOT NULL DEFAULT 'company',
  tax_number                  TEXT,
  commercial_registration      TEXT,
  phone                       TEXT,
  email                       TEXT,
  address                     TEXT,
  currency                    TEXT,
  governorate                 TEXT,
  city                        TEXT,
  postal_code                 TEXT,
  street_address              TEXT,
  e_invoice_enabled           BOOLEAN     NOT NULL DEFAULT FALSE,
  gln                         TEXT,
  external_erp_code           TEXT,
  credit_limit                NUMERIC(18,2),
  credit_period_days          INTEGER,
  control_account_id          UUID        NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  account_id                  UUID        NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  is_active                   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS customers_company_code_unique ON customers (company_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS customers_account_id_unique ON customers (account_id);

-- ── 18. suppliers ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code                        TEXT        NOT NULL,
  name_ar                     TEXT        NOT NULL,
  name_en                     TEXT,
  type                        TEXT        NOT NULL DEFAULT 'company',
  tax_number                  TEXT,
  commercial_registration      TEXT,
  phone                       TEXT,
  email                       TEXT,
  address                     TEXT,
  currency                    TEXT,
  governorate                 TEXT,
  city                        TEXT,
  postal_code                 TEXT,
  street_address              TEXT,
  e_invoice_enabled           BOOLEAN     NOT NULL DEFAULT FALSE,
  gln                         TEXT,
  external_erp_code           TEXT,
  credit_period_days          INTEGER,
  control_account_id          UUID        NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  account_id                  UUID        NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  is_active                   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_company_code_unique ON suppliers (company_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_account_id_unique ON suppliers (account_id);

-- ── 19. inventory_items ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_items (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code                  TEXT        NOT NULL,
  name_ar               TEXT        NOT NULL,
  name_en               TEXT,
  unit                  TEXT        NOT NULL,
  category              TEXT,
  is_active             BOOLEAN     NOT NULL DEFAULT TRUE,
  quantity_on_hand      NUMERIC(18,4) NOT NULL DEFAULT 0,
  average_cost          NUMERIC(18,4) NOT NULL DEFAULT 0,
  inventory_account_id  UUID        NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  item_code_type        TEXT,
  gs1_code              TEXT,
  egs_code              TEXT,
  unit_code             TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_company_code_unique ON inventory_items (company_id, code);

-- ── 20. inventory_movements ───────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_movements (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_id               UUID        NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  date                  DATE        NOT NULL,
  type                  TEXT        NOT NULL,
  quantity              NUMERIC(18,4) NOT NULL,
  unit_cost             NUMERIC(18,4) NOT NULL,
  total_value           NUMERIC(18,2) NOT NULL,
  inventory_account_id  UUID        NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  cost_center_id        UUID        REFERENCES cost_centers(id) ON DELETE SET NULL,
  project_id            UUID        REFERENCES projects(id) ON DELETE SET NULL,
  branch_id             UUID        REFERENCES branches(id) ON DELETE SET NULL,
  journal_entry_id      UUID        REFERENCES journal_entries(id) ON DELETE SET NULL,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 21. fixed_assets ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fixed_assets (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code                    TEXT,
  name_ar                 TEXT        NOT NULL,
  name_en                 TEXT,
  category                TEXT,
  acquisition_date        DATE        NOT NULL,
  cost                    NUMERIC(18,2) NOT NULL,
  salvage_value           NUMERIC(18,2) NOT NULL DEFAULT 0,
  useful_life_months      INTEGER     NOT NULL,
  method                  TEXT        NOT NULL DEFAULT 'straight_line',
  status                  TEXT        NOT NULL DEFAULT 'active',
  asset_account_id        UUID        NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  accumulated_account_id  UUID        NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  expense_account_id      UUID        NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  cost_center_id          UUID        REFERENCES cost_centers(id) ON DELETE SET NULL,
  project_id              UUID        REFERENCES projects(id) ON DELETE SET NULL,
  branch_id               UUID        REFERENCES branches(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS fixed_assets_company_id_code_unique
  ON fixed_assets (company_id, code)
  WHERE code IS NOT NULL;

-- ── 22. asset_depreciation_entries ───────────────────────────
CREATE TABLE IF NOT EXISTS asset_depreciation_entries (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_id          UUID        NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  period            TEXT        NOT NULL,
  amount            NUMERIC(18,2) NOT NULL,
  journal_entry_id  UUID        REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS asset_depreciation_entries_asset_period_unique
  ON asset_depreciation_entries (asset_id, period);

-- ── 23. employees ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code                TEXT        NOT NULL,
  name_ar             TEXT        NOT NULL,
  name_en             TEXT,
  job_title           TEXT,
  hire_date           DATE        NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'active',
  employee_type       TEXT        NOT NULL DEFAULT 'permanent',
  national_id         TEXT,
  cost_center_id      UUID        REFERENCES cost_centers(id) ON DELETE SET NULL,
  base_salary         NUMERIC(18,2) NOT NULL DEFAULT 0,
  insurance_salary    NUMERIC(18,2),
  include_insurance   BOOLEAN     NOT NULL DEFAULT TRUE,
  payroll_tax         NUMERIC(18,2) DEFAULT 0,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS employees_company_code_unique ON employees (company_id, code);

-- ── 24. employee_pay_components ───────────────────────────────
CREATE TABLE IF NOT EXISTS employee_pay_components (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id         UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  kind                TEXT        NOT NULL,
  name_ar             TEXT        NOT NULL,
  amount              NUMERIC(18,2) NOT NULL DEFAULT 0,
  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  linked_account_id   UUID        REFERENCES accounts(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 25. payroll_runs ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_runs (
  id                              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                      UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period                          TEXT        NOT NULL,
  status                          TEXT        NOT NULL DEFAULT 'posted',
  salary_expense_account_id       UUID        NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  net_payable_account_id          UUID        NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  deductions_account_id           UUID        REFERENCES accounts(id) ON DELETE RESTRICT,
  insurance_expense_account_id    UUID        REFERENCES accounts(id) ON DELETE RESTRICT,
  insurance_liability_account_id  UUID        REFERENCES accounts(id) ON DELETE RESTRICT,
  total_gross                     NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_deductions                NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_net                       NUMERIC(18,2) NOT NULL DEFAULT 0,
  company_insurance_total         NUMERIC(18,2) NOT NULL DEFAULT 0,
  employee_insurance_total        NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_payroll_tax               NUMERIC(18,2) NOT NULL DEFAULT 0,
  payroll_tax_liability_account_id UUID       REFERENCES accounts(id) ON DELETE RESTRICT,
  employee_count                  INTEGER     NOT NULL DEFAULT 0,
  notes                           TEXT,
  journal_entry_id                UUID        REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_by                      UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS payroll_runs_company_period_unique ON payroll_runs (company_id, period);

-- ── 26. payroll_run_lines ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_run_lines (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  run_id                UUID        NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id           UUID        NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  employee_name         TEXT        NOT NULL,
  base_salary           NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_allowances      NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_deductions      NUMERIC(18,2) NOT NULL DEFAULT 0,
  insurance_salary      NUMERIC(18,2) NOT NULL DEFAULT 0,
  company_insurance     NUMERIC(18,2) NOT NULL DEFAULT 0,
  employee_insurance    NUMERIC(18,2) NOT NULL DEFAULT 0,
  payroll_tax           NUMERIC(18,2) NOT NULL DEFAULT 0,
  cost_center_id        UUID        REFERENCES cost_centers(id) ON DELETE SET NULL,
  net_pay               NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 27. payroll_settings ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_settings (
  company_id                        UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  salary_expense_account_id         UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  net_payable_account_id            UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  deductions_account_id             UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  insurance_expense_account_id      UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  insurance_liability_account_id    UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  payroll_tax_liability_account_id  UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  created_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 28. advances ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS advances (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id           UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date                  DATE        NOT NULL,
  amount                NUMERIC(18,2) NOT NULL DEFAULT 0,
  repayment_months      INTEGER     NOT NULL DEFAULT 1,
  monthly_installment   NUMERIC(18,2) NOT NULL DEFAULT 0,
  start_date            DATE        NOT NULL,
  end_date              DATE,
  status                TEXT        NOT NULL DEFAULT 'active',
  advances_account_id   UUID        NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  total_repaid          NUMERIC(18,2) NOT NULL DEFAULT 0,
  notes                 TEXT,
  created_by            UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 29. advance_installments ──────────────────────────────────
CREATE TABLE IF NOT EXISTS advance_installments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  advance_id      UUID        NOT NULL REFERENCES advances(id) ON DELETE CASCADE,
  payroll_run_id  UUID        REFERENCES payroll_runs(id) ON DELETE SET NULL,
  period          TEXT        NOT NULL,
  amount          NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS advance_installments_advance_period_unique
  ON advance_installments (advance_id, period);

-- ── 30. custodies ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS custodies (
  id                            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                    UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id                   UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type                          TEXT        NOT NULL DEFAULT 'cash',
  amount                        NUMERIC(18,2) NOT NULL DEFAULT 0,
  receipt_date                  DATE        NOT NULL,
  description                   TEXT,
  status                        TEXT        NOT NULL DEFAULT 'open',
  settlement_journal_entry_id   UUID        REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_by                    UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 31. custody_attachments ───────────────────────────────────
CREATE TABLE IF NOT EXISTS custody_attachments (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  custody_id    UUID        NOT NULL REFERENCES custodies(id) ON DELETE CASCADE,
  file_name     TEXT        NOT NULL,
  object_key    TEXT        NOT NULL,
  content_type  TEXT,
  size          INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 32. bank_accounts ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_accounts (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name_ar               TEXT        NOT NULL,
  name_en               TEXT,
  type                  TEXT        NOT NULL DEFAULT 'bank',
  bank_name             TEXT,
  account_number        TEXT,
  currency              TEXT        NOT NULL,
  opening_balance       NUMERIC(18,2) NOT NULL DEFAULT 0,
  opening_balance_date  DATE,
  account_id            UUID        NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  is_active             BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 33. bank_reconciliations ──────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_reconciliations (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bank_account_id     UUID        NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  period_start        DATE        NOT NULL,
  period_end          DATE        NOT NULL,
  statement_balance   NUMERIC(18,2) NOT NULL DEFAULT 0,
  book_balance        NUMERIC(18,2) NOT NULL DEFAULT 0,
  difference          NUMERIC(18,2) NOT NULL DEFAULT 0,
  status              TEXT        NOT NULL DEFAULT 'draft',
  notes               TEXT,
  adjusting_entry_id  UUID        REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_by          UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ
);

-- ── 34. bank_movements ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_movements (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bank_account_id         UUID        NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  date                    DATE        NOT NULL,
  type                    TEXT        NOT NULL,
  direction               TEXT        NOT NULL,
  amount                  NUMERIC(18,2) NOT NULL,
  currency                TEXT        NOT NULL,
  exchange_rate           NUMERIC(18,6) NOT NULL DEFAULT 1,
  counterpart_account_id  UUID        REFERENCES accounts(id) ON DELETE RESTRICT,
  cost_center_id          UUID        REFERENCES cost_centers(id) ON DELETE SET NULL,
  project_id              UUID        REFERENCES projects(id) ON DELETE SET NULL,
  branch_id               UUID        REFERENCES branches(id) ON DELETE SET NULL,
  transfer_account_id     UUID        REFERENCES bank_accounts(id) ON DELETE RESTRICT,
  transfer_group_id       UUID,
  destination_amount      NUMERIC(18,2),
  bank_fees               NUMERIC(18,2),
  realized_gain_loss      NUMERIC(18,2),
  description             TEXT,
  notes                   TEXT,
  reference               TEXT,
  journal_entry_id        UUID        REFERENCES journal_entries(id) ON DELETE SET NULL,
  reconciliation_id       UUID        REFERENCES bank_reconciliations(id) ON DELETE SET NULL,
  is_cleared              BOOLEAN     NOT NULL DEFAULT FALSE,
  is_adjustment           BOOLEAN     NOT NULL DEFAULT FALSE,
  created_by              UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 35. bank_statement_lines ──────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_statement_lines (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  reconciliation_id     UUID        NOT NULL REFERENCES bank_reconciliations(id) ON DELETE CASCADE,
  date                  DATE,
  description           TEXT,
  amount                NUMERIC(18,2) NOT NULL,
  direction             TEXT        NOT NULL,
  matched_movement_id   UUID        REFERENCES bank_movements(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 36. invoices ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind                      TEXT        NOT NULL,
  invoice_no                INTEGER     NOT NULL,
  code                      TEXT,
  related_invoice_id        UUID        REFERENCES invoices(id) ON DELETE SET NULL,
  source_document_id        UUID        REFERENCES invoices(id) ON DELETE SET NULL,
  date                      DATE        NOT NULL,
  due_date                  DATE,
  customer_id               UUID        REFERENCES customers(id) ON DELETE RESTRICT,
  supplier_id               UUID        REFERENCES suppliers(id) ON DELETE RESTRICT,
  cost_center_id            UUID        REFERENCES cost_centers(id) ON DELETE SET NULL,
  project_id                UUID        REFERENCES projects(id) ON DELETE SET NULL,
  branch_id                 UUID        REFERENCES branches(id) ON DELETE SET NULL,
  currency                  TEXT,
  exchange_rate             NUMERIC(18,6) NOT NULL DEFAULT 1,
  status                    TEXT        NOT NULL DEFAULT 'draft',
  notes                     TEXT,
  subtotal                  NUMERIC(18,2) NOT NULL DEFAULT 0,
  discount_total            NUMERIC(18,2) NOT NULL DEFAULT 0,
  tax_total                 NUMERIC(18,2) NOT NULL DEFAULT 0,
  wht_total                 NUMERIC(18,2) NOT NULL DEFAULT 0,
  total                     NUMERIC(18,2) NOT NULL DEFAULT 0,
  amount_paid               NUMERIC(18,2) NOT NULL DEFAULT 0,
  journal_entry_id          UUID        REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_by                UUID        REFERENCES users(id) ON DELETE SET NULL,
  approved_at               TIMESTAMPTZ,
  e_invoice_required        BOOLEAN     NOT NULL DEFAULT FALSE,
  e_invoice_status          TEXT,
  e_invoice_uuid            TEXT,
  e_invoice_submission_date TIMESTAMPTZ,
  e_invoice_error           TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_company_kind_no_unique ON invoices (company_id, kind, invoice_no);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_company_id_code_unique
  ON invoices (company_id, code)
  WHERE code IS NOT NULL;

-- ── 37. invoice_lines ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_lines (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id                  UUID        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  company_id                  UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  line_no                     INTEGER     NOT NULL,
  line_type                   TEXT        NOT NULL,
  description                 TEXT,
  account_id                  UUID        NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  item_id                     UUID        REFERENCES inventory_items(id) ON DELETE RESTRICT,
  warehouse                   TEXT,
  cogs_account_id             UUID        REFERENCES accounts(id) ON DELETE RESTRICT,
  quantity                    NUMERIC(18,4) NOT NULL DEFAULT 1,
  unit_price                  NUMERIC(18,2) NOT NULL DEFAULT 0,
  discount                    NUMERIC(18,2) NOT NULL DEFAULT 0,
  tax_id                      UUID        REFERENCES taxes(id) ON DELETE SET NULL,
  tax_amount                  NUMERIC(18,2) NOT NULL DEFAULT 0,
  wht_tax_id                  UUID        REFERENCES taxes(id) ON DELETE SET NULL,
  wht_amount                  NUMERIC(18,2) NOT NULL DEFAULT 0,
  line_total                  NUMERIC(18,2) NOT NULL DEFAULT 0,
  cost_center_id              UUID        REFERENCES cost_centers(id) ON DELETE SET NULL,
  project_id                  UUID        REFERENCES projects(id) ON DELETE SET NULL,
  branch_id                   UUID        REFERENCES branches(id) ON DELETE SET NULL,
  asset_name_ar               TEXT,
  asset_name_en               TEXT,
  asset_useful_life_months    INTEGER,
  asset_salvage_value         NUMERIC(18,2),
  asset_accumulated_account_id UUID       REFERENCES accounts(id) ON DELETE RESTRICT,
  asset_expense_account_id    UUID        REFERENCES accounts(id) ON DELETE RESTRICT,
  fixed_asset_id              UUID        REFERENCES fixed_assets(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 38. payments ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind              TEXT        NOT NULL,
  payment_no        INTEGER     NOT NULL,
  date              DATE        NOT NULL,
  customer_id       UUID        REFERENCES customers(id) ON DELETE RESTRICT,
  supplier_id       UUID        REFERENCES suppliers(id) ON DELETE RESTRICT,
  method            TEXT        NOT NULL,
  cash_account_id   UUID        NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  amount            NUMERIC(18,2) NOT NULL,
  currency          TEXT,
  exchange_rate     NUMERIC(18,6) NOT NULL DEFAULT 1,
  notes             TEXT,
  bank_movement_id  UUID        REFERENCES bank_movements(id) ON DELETE SET NULL,
  journal_entry_id  UUID        REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_by        UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS payments_company_kind_no_unique ON payments (company_id, kind, payment_no);

-- ── 39. payment_allocations ───────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_allocations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id  UUID        NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  company_id  UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id  UUID        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount      NUMERIC(18,2) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 40. super_admins ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS super_admins (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'super_admin'
                            CHECK (role IN ('super_admin','billing','support')),
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS super_admins_email_idx ON super_admins (email);

-- ── 41. super_admin_sessions ──────────────────────────────────
CREATE TABLE IF NOT EXISTS super_admin_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  super_admin_id  UUID        NOT NULL REFERENCES super_admins(id) ON DELETE CASCADE,
  token_hash      TEXT        NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS super_admin_sessions_token_hash_idx ON super_admin_sessions (token_hash);

-- ── 42. subscription_plans ────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_plans (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar                   TEXT        NOT NULL,
  name_en                   TEXT        NOT NULL,
  description_ar            TEXT        DEFAULT '',
  description_en            TEXT        DEFAULT '',
  country_code              TEXT        DEFAULT 'EG',
  country_name              TEXT,
  currency_code             TEXT,
  monthly_price             NUMERIC(12,2),
  yearly_price              NUMERIC(12,2),
  trial_days                INTEGER     NOT NULL DEFAULT 14,
  max_companies_or_branches INTEGER,
  storage_limit             INTEGER,
  feature_limits            JSONB       DEFAULT '{}',
  country                   TEXT        NOT NULL DEFAULT 'EG',
  max_users                 INTEGER     NOT NULL DEFAULT 1,
  max_transactions          INTEGER     NOT NULL DEFAULT 1000,
  price                     NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency                  TEXT        NOT NULL DEFAULT 'EGP',
  billing_cycle             TEXT        NOT NULL DEFAULT 'monthly'
                            CHECK (billing_cycle IN ('monthly','quarterly','yearly')),
  features                  JSONB       NOT NULL DEFAULT '[]',
  is_active                 BOOLEAN     NOT NULL DEFAULT TRUE,
  show_on_landing           BOOLEAN     NOT NULL DEFAULT TRUE,
  "order"                   INTEGER     NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS subscription_plans_country_idx ON subscription_plans (country);
CREATE INDEX IF NOT EXISTS subscription_plans_active_idx ON subscription_plans (is_active);
CREATE INDEX IF NOT EXISTS subscription_plans_show_idx ON subscription_plans (show_on_landing);

-- ── 43. subscriptions ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id                     UUID        NOT NULL,
  status                      TEXT        NOT NULL DEFAULT 'trial'
                              CHECK (status IN ('trial','pending_payment','active','expired','cancelled','suspended')),
  started_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at                     TIMESTAMPTZ,
  payment_provider            TEXT,
  provider_subscription_id    TEXT,
  amount                      NUMERIC(12,2),
  currency                    TEXT,
  billing_cycle               TEXT        CHECK (billing_cycle IN ('monthly','quarterly','yearly')),
  trial_ends_at               TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS subscriptions_company_idx ON subscriptions (company_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON subscriptions (status);

-- ── 44. manual_payment_requests ──────────────────────────────
CREATE TABLE IF NOT EXISTS manual_payment_requests (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id                     UUID        NOT NULL,
  amount                      NUMERIC(12,2) NOT NULL,
  currency                    TEXT        NOT NULL DEFAULT 'EGP',
  billing_cycle               TEXT        NOT NULL DEFAULT 'monthly'
                              CHECK (billing_cycle IN ('monthly','quarterly','yearly')),
  notes                       TEXT,
  proof_url                   TEXT,
  status                      TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','approved','rejected')),
  reviewed_by_super_admin_id  UUID,
  reviewer_notes              TEXT,
  reviewed_at                 TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS manual_payment_requests_company_idx ON manual_payment_requests (company_id);
CREATE INDEX IF NOT EXISTS manual_payment_requests_status_idx ON manual_payment_requests (status);

-- ── 45. country_payment_methods ──────────────────────────────
CREATE TABLE IF NOT EXISTS country_payment_methods (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code      TEXT        NOT NULL,
  currency          TEXT        NOT NULL,
  method_name       TEXT        NOT NULL,
  type              TEXT        NOT NULL DEFAULT 'manual'
                    CHECK (type IN ('manual','bank_transfer','cash','payment_gateway')),
  enabled           BOOLEAN     NOT NULL DEFAULT TRUE,
  instructions_ar   TEXT,
  instructions_en   TEXT,
  account_details   JSONB       DEFAULT 'null',
  gateway_provider  TEXT,
  is_public         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS country_payment_methods_country_idx ON country_payment_methods (country_code);
CREATE INDEX IF NOT EXISTS country_payment_methods_enabled_idx ON country_payment_methods (enabled);

-- ── 46. support_tickets ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_tickets (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL CHECK (type IN ('issue','feature_request')),
  subject     TEXT        NOT NULL,
  body        TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'open'
              CHECK (status IN ('open','in_progress','resolved','closed')),
  priority    TEXT        NOT NULL DEFAULT 'medium'
              CHECK (priority IN ('low','medium','high','critical')),
  assigned_to UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS support_tickets_company_idx ON support_tickets (company_id);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx  ON support_tickets (status);
CREATE INDEX IF NOT EXISTS support_tickets_user_idx    ON support_tickets (user_id);

-- ── 47. ticket_comments ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_comments (
  id              SERIAL      PRIMARY KEY,
  ticket_id       UUID        NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id         UUID        REFERENCES users(id) ON DELETE SET NULL,
  author_name     TEXT,
  body            TEXT        NOT NULL,
  is_internal     BOOLEAN     NOT NULL DEFAULT FALSE,
  is_admin_reply  BOOLEAN     NOT NULL DEFAULT FALSE,
  is_read_by_user BOOLEAN     NOT NULL DEFAULT FALSE,
  is_read_by_admin BOOLEAN    NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ticket_comments_ticket_idx ON ticket_comments (ticket_id);

-- ── 48. feature_votes ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feature_votes (
  id          SERIAL      PRIMARY KEY,
  ticket_id   UUID        NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS feature_votes_ticket_idx ON feature_votes (ticket_id);
CREATE INDEX IF NOT EXISTS feature_votes_user_idx   ON feature_votes (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS feature_votes_unique_idx ON feature_votes (ticket_id, user_id);

-- ── 49. audit_log ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        REFERENCES companies(id) ON DELETE CASCADE,
  user_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT        NOT NULL,
  entity      TEXT,
  entity_id   TEXT,
  changes     JSONB,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_log_company_idx ON audit_log (company_id);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log (created_at);

-- ── 50. exchange_rates (historical) ───────────────────────────
CREATE TABLE IF NOT EXISTS exchange_rates (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  currency    TEXT        NOT NULL,
  rate        NUMERIC(18,6) NOT NULL,
  date        DATE        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 51. documents (document inbox) ───────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  file_name     TEXT        NOT NULL,
  object_key    TEXT        NOT NULL,
  content_type  TEXT,
  size          INTEGER,
  source        TEXT        DEFAULT 'upload',
  status        TEXT        DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 52. revaluations ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS revaluations (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  date              DATE        NOT NULL,
  journal_entry_id  UUID        REFERENCES journal_entries(id) ON DELETE SET NULL,
  notes             TEXT,
  created_by        UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
