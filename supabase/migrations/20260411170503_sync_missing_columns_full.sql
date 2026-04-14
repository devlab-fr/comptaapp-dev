/*
  # Sync Missing Columns — Full DB/Code Alignment

  This migration adds all columns that are referenced in the frontend code
  but were absent from the database, causing 400 errors from Supabase.

  ## Changes by table

  ### 1. accounting_entries
  - Add `linked_accounting_entry_id` (uuid, nullable) — FK to self, used to link payment entries
  - Add `payment_entry_id` (uuid, nullable) — used to track payment journal entries
  - Add `bank_statement_line_id` (uuid, nullable) — links entry to a bank statement line
  - Add `is_locked` (boolean, default false) — alias used by code alongside existing `locked` col

  ### 2. vat_periods
  - Add `period_year` (integer, nullable) — used in TVA page queries
  - Add `period_month` (integer, nullable) — used in TVA page queries
  - Add `period_start` (date, nullable) — used in TVA page queries

  ### 3. expense_documents
  - Add `payment_entry_id` (uuid, nullable) — links document to its payment accounting entry

  ### 4. revenue_documents
  - Add `payment_entry_id` (uuid, nullable) — links document to its payment accounting entry

  ### 5. bank_statement_lines
  - Add `match_status` (text, default 'unmatched') — reconciliation status per line
  - Add `note` (text, nullable) — manual note on the line
  - Add `linked_accounting_entry_id` (uuid, nullable) — direct link to accounting entry

  ### 6. fiscal_year_status
  - Add `locked` (boolean, default false) — lock flag used by cabinetMode.ts
  - Add `is_locked` (boolean, default false) — alias used in closureControls.ts

  ### 7. companies
  - Add `activity_type` (text, nullable) — type of business activity

  ## Security
  - No RLS changes (all tables already have RLS configured)

  ## Notes
  - All columns are nullable or have safe defaults to avoid breaking existing rows
  - No existing data is modified
*/

-- 1. accounting_entries — add missing columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accounting_entries' AND column_name = 'linked_accounting_entry_id'
  ) THEN
    ALTER TABLE accounting_entries ADD COLUMN linked_accounting_entry_id uuid REFERENCES accounting_entries(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accounting_entries' AND column_name = 'payment_entry_id'
  ) THEN
    ALTER TABLE accounting_entries ADD COLUMN payment_entry_id uuid REFERENCES accounting_entries(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accounting_entries' AND column_name = 'bank_statement_line_id'
  ) THEN
    ALTER TABLE accounting_entries ADD COLUMN bank_statement_line_id uuid REFERENCES bank_statement_lines(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accounting_entries' AND column_name = 'is_locked'
  ) THEN
    ALTER TABLE accounting_entries ADD COLUMN is_locked boolean DEFAULT false;
  END IF;
END $$;

-- 2. vat_periods — add period_year, period_month, period_start
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vat_periods' AND column_name = 'period_year'
  ) THEN
    ALTER TABLE vat_periods ADD COLUMN period_year integer GENERATED ALWAYS AS (year) STORED;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vat_periods' AND column_name = 'period_month'
  ) THEN
    ALTER TABLE vat_periods ADD COLUMN period_month integer GENERATED ALWAYS AS (month) STORED;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vat_periods' AND column_name = 'period_start'
  ) THEN
    ALTER TABLE vat_periods ADD COLUMN period_start date GENERATED ALWAYS AS (
      make_date(year, month, 1)
    ) STORED;
  END IF;
END $$;

-- 3. expense_documents — add payment_entry_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expense_documents' AND column_name = 'payment_entry_id'
  ) THEN
    ALTER TABLE expense_documents ADD COLUMN payment_entry_id uuid REFERENCES accounting_entries(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. revenue_documents — add payment_entry_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'revenue_documents' AND column_name = 'payment_entry_id'
  ) THEN
    ALTER TABLE revenue_documents ADD COLUMN payment_entry_id uuid REFERENCES accounting_entries(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5. bank_statement_lines — add match_status, note, linked_accounting_entry_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_statement_lines' AND column_name = 'match_status'
  ) THEN
    ALTER TABLE bank_statement_lines ADD COLUMN match_status text DEFAULT 'unmatched';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_statement_lines' AND column_name = 'note'
  ) THEN
    ALTER TABLE bank_statement_lines ADD COLUMN note text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_statement_lines' AND column_name = 'linked_accounting_entry_id'
  ) THEN
    ALTER TABLE bank_statement_lines ADD COLUMN linked_accounting_entry_id uuid REFERENCES accounting_entries(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 6. fiscal_year_status — add locked and is_locked
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fiscal_year_status' AND column_name = 'locked'
  ) THEN
    ALTER TABLE fiscal_year_status ADD COLUMN locked boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fiscal_year_status' AND column_name = 'is_locked'
  ) THEN
    ALTER TABLE fiscal_year_status ADD COLUMN is_locked boolean DEFAULT false;
  END IF;
END $$;

-- 7. companies — add activity_type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'activity_type'
  ) THEN
    ALTER TABLE companies ADD COLUMN activity_type text;
  END IF;
END $$;
