-- HG Financial Consulting — Case Studies (دراسات الحالة)
-- شغّل هذا الملف مرة واحدة على قاعدة البيانات (Neon / PostgreSQL).
-- آمن لإعادة التشغيل (idempotent): لن يحذف أي بيانات موجودة.

CREATE TABLE IF NOT EXISTS case_studies (
  id            SERIAL PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  title_ar      TEXT NOT NULL,
  title_en      TEXT NOT NULL,
  client_name   TEXT NOT NULL DEFAULT '',
  industry_ar   TEXT NOT NULL DEFAULT '',
  industry_en   TEXT NOT NULL DEFAULT '',
  summary_ar    TEXT NOT NULL DEFAULT '',
  summary_en    TEXT NOT NULL DEFAULT '',
  challenge_ar  TEXT NOT NULL DEFAULT '',
  challenge_en  TEXT NOT NULL DEFAULT '',
  solution_ar   TEXT NOT NULL DEFAULT '',
  solution_en   TEXT NOT NULL DEFAULT '',
  results_ar    TEXT NOT NULL DEFAULT '',
  results_en    TEXT NOT NULL DEFAULT '',
  image         TEXT NOT NULL DEFAULT '',
  "order"       INTEGER NOT NULL DEFAULT 0,
  published     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMP NOT NULL DEFAULT now(),
  updated_at    TIMESTAMP NOT NULL DEFAULT now()
);
