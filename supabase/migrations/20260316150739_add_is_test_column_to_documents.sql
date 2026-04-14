/*
  # Add is_test marker for test data

  ## Changes
  - Add `is_test` boolean column (default false) to:
    - revenue_documents
    - expense_documents
    - revenue_lines
    - expense_lines
  
  ## Purpose
  - Mark demo/test data with is_test=true
  - All calculations (Bilan, TVA, Compte de résultat) will filter out is_test=true
  - Ensures production data integrity
*/

-- Add is_test column to revenue_documents
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'revenue_documents' AND column_name = 'is_test'
  ) THEN
    ALTER TABLE revenue_documents 
    ADD COLUMN is_test boolean DEFAULT false NOT NULL;
  END IF;
END $$;

-- Add is_test column to expense_documents
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'expense_documents' AND column_name = 'is_test'
  ) THEN
    ALTER TABLE expense_documents 
    ADD COLUMN is_test boolean DEFAULT false NOT NULL;
  END IF;
END $$;

-- Add is_test column to revenue_lines
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'revenue_lines' AND column_name = 'is_test'
  ) THEN
    ALTER TABLE revenue_lines 
    ADD COLUMN is_test boolean DEFAULT false NOT NULL;
  END IF;
END $$;

-- Add is_test column to expense_lines
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'expense_lines' AND column_name = 'is_test'
  ) THEN
    ALTER TABLE expense_lines 
    ADD COLUMN is_test boolean DEFAULT false NOT NULL;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_revenue_documents_is_test 
  ON revenue_documents(company_id, is_test) 
  WHERE is_test = false;

CREATE INDEX IF NOT EXISTS idx_expense_documents_is_test 
  ON expense_documents(company_id, is_test) 
  WHERE is_test = false;