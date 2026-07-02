-- HG Audit — Phase 5: Subscriptions & Super Admin migration
-- Run ONCE on the Neon production database before deploying the new build.
-- Safe to re-run: all statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS guards.
-- This migration is NON-DESTRUCTIVE — no existing data is modified or deleted.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Companies table — subscription & billing fields
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS plan_id           uuid,
  ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS trial_ends_at     timestamptz,
  ADD COLUMN IF NOT EXISTS max_users         integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_transactions  integer DEFAULT 1000;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Super admins table
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS super_admins (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  name          text NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'super_admin',
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS super_admins_email_idx ON super_admins(email);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) Super admin sessions table
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS super_admin_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  super_admin_id   uuid NOT NULL REFERENCES super_admins(id) ON DELETE CASCADE,
  token_hash       text NOT NULL,
  expires_at       timestamptz NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS super_admin_sessions_token_hash_idx ON super_admin_sessions(token_hash);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) Sessions table — impersonation columns
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS is_impersonating                boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS impersonated_by_super_admin_id  uuid;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) Subscription plans table
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS subscription_plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar         text NOT NULL,
  name_en         text NOT NULL,
  description_ar  text DEFAULT '',
  description_en  text DEFAULT '',
  country_code    text DEFAULT 'EG',
  country_name    text,
  country         text NOT NULL DEFAULT 'EG',
  max_users       integer NOT NULL DEFAULT 1,
  max_transactions integer NOT NULL DEFAULT 1000,
  price           numeric(12,2) NOT NULL DEFAULT 0,
  currency        text NOT NULL DEFAULT 'EGP',
  billing_cycle   text NOT NULL DEFAULT 'monthly',
  features        jsonb NOT NULL DEFAULT '[]',
  is_active       boolean NOT NULL DEFAULT true,
  show_on_landing boolean NOT NULL DEFAULT true,
  "order"         integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- If the table was already created without some columns, add them safely.
ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS country_code              text DEFAULT 'EG',
  ADD COLUMN IF NOT EXISTS country_name              text,
  ADD COLUMN IF NOT EXISTS currency_code             text,
  ADD COLUMN IF NOT EXISTS monthly_price             numeric(12,2),
  ADD COLUMN IF NOT EXISTS yearly_price              numeric(12,2),
  ADD COLUMN IF NOT EXISTS trial_days                integer NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS max_companies_or_branches integer,
  ADD COLUMN IF NOT EXISTS storage_limit             integer,
  ADD COLUMN IF NOT EXISTS feature_limits            jsonb NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS subscription_plans_country_idx  ON subscription_plans(country);
CREATE INDEX IF NOT EXISTS subscription_plans_active_idx   ON subscription_plans(is_active);
CREATE INDEX IF NOT EXISTS subscription_plans_show_idx     ON subscription_plans(show_on_landing);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) Subscriptions table (per-company subscription history)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS subscriptions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id                  uuid NOT NULL,
  status                   text NOT NULL DEFAULT 'trial',
  started_at               timestamptz NOT NULL DEFAULT now(),
  ends_at                  timestamptz,
  payment_provider         text,
  provider_subscription_id text,
  amount                   numeric(12,2),
  currency                 text,
  billing_cycle            text,
  trial_ends_at            timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscriptions_company_idx ON subscriptions(company_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx  ON subscriptions(status);

-- ═══════════════════════════════════════════════════════════════════════════
-- 7) Manual payment requests table
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS manual_payment_requests (
  id                             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                     uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id                        uuid NOT NULL,
  amount                         numeric(12,2) NOT NULL,
  currency                       text NOT NULL,
  billing_cycle                  text NOT NULL,
  notes                          text,
  proof_url                      text,
  status                         text NOT NULL DEFAULT 'pending',
  reviewed_by_super_admin_id     uuid,
  reviewer_notes                 text,
  reviewed_at                    timestamptz,
  created_at                     timestamptz NOT NULL DEFAULT now(),
  updated_at                     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS manual_payment_requests_company_idx ON manual_payment_requests(company_id);
CREATE INDEX IF NOT EXISTS manual_payment_requests_status_idx  ON manual_payment_requests(status);

-- ═══════════════════════════════════════════════════════════════════════════
-- Done. All changes above are additive (no drops, no data loss).
-- ═══════════════════════════════════════════════════════════════════════════
SELECT 'Phase 5 migration complete' AS result;
