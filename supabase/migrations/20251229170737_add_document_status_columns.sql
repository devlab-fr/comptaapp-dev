/*
  # Add status columns to expense and revenue documents

  1. Changes to expense_documents
    - Add `accounting_status` column (TEXT, default 'draft')
      - Possible values: 'draft', 'validated'
      - Indicates if the expense has been validated for accounting purposes
    - Add `payment_status` column (TEXT, default 'unpaid')
      - Possible values: 'unpaid', 'paid'
      - Indicates if the expense has been paid
    - Add `paid_at` column (DATE, nullable)
      - Date when the expense was paid

  2. Changes to revenue_documents
    - Add `accounting_status` column (TEXT, default 'draft')
      - Possible values: 'draft', 'validated'
      - Indicates if the revenue has been validated for accounting purposes
    - Add `payment_status` column (TEXT, default 'unpaid')
      - Possible values: 'unpaid', 'paid'
      - Indicates if the revenue has been collected/received
    - Add `paid_at` column (DATE, nullable)
      - Date when the revenue was received

  3. Data Migration Strategy
    - All existing documents will remain with default values (draft, unpaid)
    - This is non-destructive and maintains backward compatibility
    - KPIs will only count documents marked as 'validated' and 'paid'

  4. Security
    - No RLS changes needed - existing policies apply to new columns
*/

-- Add status columns to expense_documents
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expense_documents' AND column_name = 'accounting_status'
  ) THEN
    ALTER TABLE expense_documents ADD COLUMN accounting_status TEXT DEFAULT 'draft';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expense_documents' AND column_name = 'payment_status'
  ) THEN
    ALTER TABLE expense_documents ADD COLUMN payment_status TEXT DEFAULT 'unpaid';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expense_documents' AND column_name = 'paid_at'
  ) THEN
    ALTER TABLE expense_documents ADD COLUMN paid_at DATE;
  END IF;
END $$;

-- Add status columns to revenue_documents
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'revenue_documents' AND column_name = 'accounting_status'
  ) THEN
    ALTER TABLE revenue_documents ADD COLUMN accounting_status TEXT DEFAULT 'draft';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'revenue_documents' AND column_name = 'payment_status'
  ) THEN
    ALTER TABLE revenue_documents ADD COLUMN payment_status TEXT DEFAULT 'unpaid';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'revenue_documents' AND column_name = 'paid_at'
  ) THEN
    ALTER TABLE revenue_documents ADD COLUMN paid_at DATE;
  END IF;
END $$;

-- Add check constraints to ensure valid status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'expense_documents' AND constraint_name = 'expense_documents_accounting_status_check'
  ) THEN
    ALTER TABLE expense_documents
      ADD CONSTRAINT expense_documents_accounting_status_check
      CHECK (accounting_status IN ('draft', 'validated'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'expense_documents' AND constraint_name = 'expense_documents_payment_status_check'
  ) THEN
    ALTER TABLE expense_documents
      ADD CONSTRAINT expense_documents_payment_status_check
      CHECK (payment_status IN ('unpaid', 'paid'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'revenue_documents' AND constraint_name = 'revenue_documents_accounting_status_check'
  ) THEN
    ALTER TABLE revenue_documents
      ADD CONSTRAINT revenue_documents_accounting_status_check
      CHECK (accounting_status IN ('draft', 'validated'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'revenue_documents' AND constraint_name = 'revenue_documents_payment_status_check'
  ) THEN
    ALTER TABLE revenue_documents
      ADD CONSTRAINT revenue_documents_payment_status_check
      CHECK (payment_status IN ('unpaid', 'paid'));
  END IF;
END $$;
