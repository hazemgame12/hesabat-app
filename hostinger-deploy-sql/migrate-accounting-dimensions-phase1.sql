-- Phase 1: Accounting Dimensions Engine - Database Migration
-- Date: 2026-06-27
-- Purpose: Add accounting dimensions (Cost Center, Project, Branch) support
-- Safety: All operations use IF NOT EXISTS / IF NOT already present checks

-- ============================================================================
-- 0. SETUP EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. CREATE NEW TABLES
-- ============================================================================

-- Create branches table
CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  location TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_branches_company_id ON branches(company_id);

-- Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  description TEXT,
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'active',
  budget NUMERIC(18,2),
  customer_id UUID REFERENCES customers_suppliers(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_projects_company_id ON projects(company_id);
CREATE INDEX IF NOT EXISTS idx_projects_customer_id ON projects(customer_id);

-- ============================================================================
-- 2. ALTER EXISTING TABLES - ADD COLUMNS WITH FOREIGN KEYS
-- ============================================================================

-- journal_entry_lines: Add project_id and branch_id
DO $$
BEGIN
  -- Add project_id column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journal_entry_lines' AND column_name = 'project_id'
  ) THEN
    ALTER TABLE journal_entry_lines
    ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
  END IF;
  
  -- Add branch_id column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journal_entry_lines' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE journal_entry_lines
    ADD COLUMN branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add foreign key constraints if columns exist but constraints don't
DO $$
BEGIN
  -- Add FK for project_id if it exists but FK doesn't
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journal_entry_lines' AND column_name = 'project_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'journal_entry_lines'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%project_id%'
  ) THEN
    ALTER TABLE journal_entry_lines
    ADD CONSTRAINT fk_journal_entry_lines_project_id
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
  END IF;

  -- Add FK for branch_id if it exists but FK doesn't
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journal_entry_lines' AND column_name = 'branch_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'journal_entry_lines'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%branch_id%'
  ) THEN
    ALTER TABLE journal_entry_lines
    ADD CONSTRAINT fk_journal_entry_lines_branch_id
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_project_id ON journal_entry_lines(project_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_branch_id ON journal_entry_lines(branch_id);

-- invoice_lines: Add project_id and branch_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_lines' AND column_name = 'project_id'
  ) THEN
    ALTER TABLE invoice_lines
    ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_lines' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE invoice_lines
    ADD COLUMN branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_lines' AND column_name = 'project_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'invoice_lines'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%project_id%'
  ) THEN
    ALTER TABLE invoice_lines
    ADD CONSTRAINT fk_invoice_lines_project_id
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_lines' AND column_name = 'branch_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'invoice_lines'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%branch_id%'
  ) THEN
    ALTER TABLE invoice_lines
    ADD CONSTRAINT fk_invoice_lines_branch_id
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoice_lines_project_id ON invoice_lines(project_id);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_branch_id ON invoice_lines(branch_id);

-- bank_movements: Add project_id and branch_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_movements' AND column_name = 'project_id'
  ) THEN
    ALTER TABLE bank_movements
    ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_movements' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE bank_movements
    ADD COLUMN branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_movements' AND column_name = 'project_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'bank_movements'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%project_id%'
  ) THEN
    ALTER TABLE bank_movements
    ADD CONSTRAINT fk_bank_movements_project_id
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_movements' AND column_name = 'branch_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'bank_movements'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%branch_id%'
  ) THEN
    ALTER TABLE bank_movements
    ADD CONSTRAINT fk_bank_movements_branch_id
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bank_movements_project_id ON bank_movements(project_id);
CREATE INDEX IF NOT EXISTS idx_bank_movements_branch_id ON bank_movements(branch_id);

-- inventory_movements: Add cost_center_id, project_id, branch_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_movements' AND column_name = 'cost_center_id'
  ) THEN
    ALTER TABLE inventory_movements
    ADD COLUMN cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_movements' AND column_name = 'project_id'
  ) THEN
    ALTER TABLE inventory_movements
    ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_movements' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE inventory_movements
    ADD COLUMN branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_movements' AND column_name = 'cost_center_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'inventory_movements'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%cost_center_id%'
  ) THEN
    ALTER TABLE inventory_movements
    ADD CONSTRAINT fk_inventory_movements_cost_center_id
    FOREIGN KEY (cost_center_id) REFERENCES cost_centers(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_movements' AND column_name = 'project_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'inventory_movements'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%project_id%'
  ) THEN
    ALTER TABLE inventory_movements
    ADD CONSTRAINT fk_inventory_movements_project_id
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_movements' AND column_name = 'branch_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'inventory_movements'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%branch_id%'
  ) THEN
    ALTER TABLE inventory_movements
    ADD CONSTRAINT fk_inventory_movements_branch_id
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_cost_center_id ON inventory_movements(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_project_id ON inventory_movements(project_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_branch_id ON inventory_movements(branch_id);

-- fixed_assets: Add cost_center_id, project_id, branch_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fixed_assets' AND column_name = 'cost_center_id'
  ) THEN
    ALTER TABLE fixed_assets
    ADD COLUMN cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fixed_assets' AND column_name = 'project_id'
  ) THEN
    ALTER TABLE fixed_assets
    ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fixed_assets' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE fixed_assets
    ADD COLUMN branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fixed_assets' AND column_name = 'cost_center_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'fixed_assets'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%cost_center_id%'
  ) THEN
    ALTER TABLE fixed_assets
    ADD CONSTRAINT fk_fixed_assets_cost_center_id
    FOREIGN KEY (cost_center_id) REFERENCES cost_centers(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fixed_assets' AND column_name = 'project_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'fixed_assets'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%project_id%'
  ) THEN
    ALTER TABLE fixed_assets
    ADD CONSTRAINT fk_fixed_assets_project_id
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fixed_assets' AND column_name = 'branch_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'fixed_assets'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%branch_id%'
  ) THEN
    ALTER TABLE fixed_assets
    ADD CONSTRAINT fk_fixed_assets_branch_id
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fixed_assets_cost_center_id ON fixed_assets(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_project_id ON fixed_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_branch_id ON fixed_assets(branch_id);

-- asset_depreciation_entries: Add cost_center_id, project_id, branch_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'asset_depreciation_entries' AND column_name = 'cost_center_id'
  ) THEN
    ALTER TABLE asset_depreciation_entries
    ADD COLUMN cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'asset_depreciation_entries' AND column_name = 'project_id'
  ) THEN
    ALTER TABLE asset_depreciation_entries
    ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'asset_depreciation_entries' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE asset_depreciation_entries
    ADD COLUMN branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'asset_depreciation_entries' AND column_name = 'cost_center_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'asset_depreciation_entries'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%cost_center_id%'
  ) THEN
    ALTER TABLE asset_depreciation_entries
    ADD CONSTRAINT fk_asset_depreciation_entries_cost_center_id
    FOREIGN KEY (cost_center_id) REFERENCES cost_centers(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'asset_depreciation_entries' AND column_name = 'project_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'asset_depreciation_entries'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%project_id%'
  ) THEN
    ALTER TABLE asset_depreciation_entries
    ADD CONSTRAINT fk_asset_depreciation_entries_project_id
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'asset_depreciation_entries' AND column_name = 'branch_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'asset_depreciation_entries'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%branch_id%'
  ) THEN
    ALTER TABLE asset_depreciation_entries
    ADD CONSTRAINT fk_asset_depreciation_entries_branch_id
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_asset_depreciation_entries_cost_center_id ON asset_depreciation_entries(cost_center_id);
CREATE INDEX IF NOT EXISTS idx_asset_depreciation_entries_project_id ON asset_depreciation_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_asset_depreciation_entries_branch_id ON asset_depreciation_entries(branch_id);

-- ============================================================================
-- 3. VERIFICATION
-- ============================================================================

-- Verify new tables exist
SELECT 'branches table created' AS status FROM information_schema.tables
WHERE table_name = 'branches' UNION ALL
SELECT 'projects table created' AS status FROM information_schema.tables
WHERE table_name = 'projects';

-- Verify columns added
SELECT table_name, column_name FROM information_schema.columns
WHERE column_name IN ('project_id', 'branch_id', 'cost_center_id')
AND table_name IN (
  'journal_entry_lines', 'invoice_lines', 'bank_movements',
  'inventory_movements', 'fixed_assets', 'asset_depreciation_entries'
)
ORDER BY table_name, column_name;

-- Verify Foreign Key constraints
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN (
    'journal_entry_lines', 'invoice_lines', 'bank_movements',
    'inventory_movements', 'fixed_assets', 'asset_depreciation_entries'
  )
  AND kcu.column_name IN ('project_id', 'branch_id', 'cost_center_id')
ORDER BY tc.table_name, kcu.column_name;
