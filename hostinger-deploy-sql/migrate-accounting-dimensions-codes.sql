-- Phase 1B: Add code field to accounting dimension tables
-- Date: 2026-06-27
-- Purpose: Add nullable code column with partial unique index (per company) to
--          cost_centers, projects, and branches.
--          projects and branches already have code if phase1 migration was run
--          after this date; this script is safe to re-run (idempotent).

-- ============================================================================
-- cost_centers: add code column + partial unique index
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cost_centers' AND column_name = 'code'
  ) THEN
    ALTER TABLE cost_centers ADD COLUMN code TEXT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS cost_centers_company_id_code_idx
  ON cost_centers (company_id, code)
  WHERE code IS NOT NULL;

-- ============================================================================
-- projects: add code column + partial unique index (for databases where
-- phase1 was run before this script added code)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'code'
  ) THEN
    ALTER TABLE projects ADD COLUMN code TEXT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS projects_company_id_code_idx
  ON projects (company_id, code)
  WHERE code IS NOT NULL;

-- ============================================================================
-- branches: add code column + partial unique index (for databases where
-- phase1 was run before this script added code)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'branches' AND column_name = 'code'
  ) THEN
    ALTER TABLE branches ADD COLUMN code TEXT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS branches_company_id_code_idx
  ON branches (company_id, code)
  WHERE code IS NOT NULL;

-- ============================================================================
-- Verification
-- ============================================================================

SELECT table_name, column_name
FROM information_schema.columns
WHERE column_name = 'code'
  AND table_name IN ('cost_centers', 'projects', 'branches')
ORDER BY table_name;
