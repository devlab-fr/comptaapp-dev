/*
  # Add receipt columns to expense_documents table

  1. Schema Changes
    - Add `receipt_url` (text) to expense_documents table
    - Add `receipt_storage_path` (text) to expense_documents table
    - Add `receipt_filename` (text) to expense_documents table

  2. Purpose
    - Allow storing receipt file information directly on expense documents
    - Enable AI scan to automatically attach receipts when creating expenses
*/

-- Add receipt columns to expense_documents table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expense_documents' AND column_name = 'receipt_url'
  ) THEN
    ALTER TABLE expense_documents ADD COLUMN receipt_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expense_documents' AND column_name = 'receipt_storage_path'
  ) THEN
    ALTER TABLE expense_documents ADD COLUMN receipt_storage_path text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expense_documents' AND column_name = 'receipt_filename'
  ) THEN
    ALTER TABLE expense_documents ADD COLUMN receipt_filename text;
  END IF;
END $$;
