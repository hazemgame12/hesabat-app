-- Super-admin + Subscription infrastructure migration
-- Run this once on the VPS production DB.
-- All statements are idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- 1. New columns on companies table
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS plan_id            UUID,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT
        CHECK (subscription_status IN ('trial','active','expired','cancelled','suspended'))
        DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS trial_ends_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS max_users           INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_transactions    INTEGER DEFAULT 1000;

-- 2. super_admins
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

-- 3. super_admin_sessions
CREATE TABLE IF NOT EXISTS super_admin_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  super_admin_id  UUID        NOT NULL REFERENCES super_admins(id) ON DELETE CASCADE,
  token_hash      TEXT        NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS super_admin_sessions_token_hash_idx ON super_admin_sessions (token_hash);

-- 4. subscription_plans
CREATE TABLE IF NOT EXISTS subscription_plans (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar             TEXT        NOT NULL,
  name_en             TEXT        NOT NULL,
  description_ar      TEXT        DEFAULT '',
  description_en      TEXT        DEFAULT '',
  country             TEXT        NOT NULL DEFAULT 'EG',
  max_users           INTEGER     NOT NULL DEFAULT 1,
  max_transactions    INTEGER     NOT NULL DEFAULT 1000,
  price               NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency            TEXT        NOT NULL DEFAULT 'EGP',
  billing_cycle       TEXT        NOT NULL DEFAULT 'monthly'
                                  CHECK (billing_cycle IN ('monthly','quarterly','yearly')),
  features            JSONB       NOT NULL DEFAULT '[]',
  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  show_on_landing     BOOLEAN     NOT NULL DEFAULT TRUE,
  "order"             INTEGER     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS subscription_plans_country_idx ON subscription_plans (country);
CREATE INDEX IF NOT EXISTS subscription_plans_active_idx  ON subscription_plans (is_active);
CREATE INDEX IF NOT EXISTS subscription_plans_show_idx    ON subscription_plans (show_on_landing);

-- 5. subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan_id                   UUID        NOT NULL,
  status                    TEXT        NOT NULL DEFAULT 'trial'
                                        CHECK (status IN ('trial','active','expired','cancelled','suspended')),
  started_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at                   TIMESTAMPTZ,
  payment_provider          TEXT,
  provider_subscription_id  TEXT,
  amount                    NUMERIC(12,2),
  currency                  TEXT,
  billing_cycle             TEXT        CHECK (billing_cycle IN ('monthly','quarterly','yearly')),
  trial_ends_at             TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS subscriptions_company_idx ON subscriptions (company_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx  ON subscriptions (status);

-- 6. support_tickets
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

-- 7. ticket_comments
CREATE TABLE IF NOT EXISTS ticket_comments (
  id          SERIAL      PRIMARY KEY,
  ticket_id   UUID        NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT        NOT NULL,
  is_internal BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ticket_comments_ticket_idx ON ticket_comments (ticket_id);

-- 8. feature_votes
CREATE TABLE IF NOT EXISTS feature_votes (
  id          SERIAL      PRIMARY KEY,
  ticket_id   UUID        NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS feature_votes_ticket_idx  ON feature_votes (ticket_id);
CREATE INDEX IF NOT EXISTS feature_votes_user_idx    ON feature_votes (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS feature_votes_unique_idx ON feature_votes (ticket_id, user_id);
