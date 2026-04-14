/*
  # Add is_test marker for test data

  1. Changes
    - Add `is_test` boolean column (default false) to:
      - revenue_documents
      - expense_documents
      - revenue_lines
      - expense_lines
    
  2. Purpose
    - Mark demo/test data with is_test=true
    - All calculations (Bilan, TVA, Compte de résultat) will filter out is_test=true
    - Ensures production data integrity

  3. Important Notes
    - Default is false to ensure existing data is not marked as test
    - All future test data must be inserted with is_test=true
*/

-- Add is_test column to revenue_documents
ALTER TABLE revenue_documents 
ADD COLUMN IF NOT EXISTS is_test boolean DEFAULT false NOT NULL;

-- Add is_test column to expense_documents
ALTER TABLE expense_documents 
ADD COLUMN IF NOT EXISTS is_test boolean DEFAULT false NOT NULL;

-- Add is_test column to revenue_lines
ALTER TABLE revenue_lines 
ADD COLUMN IF NOT EXISTS is_test boolean DEFAULT false NOT NULL;

-- Add is_test column to expense_lines
ALTER TABLE expense_lines 
ADD COLUMN IF NOT EXISTS is_test boolean DEFAULT false NOT NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_revenue_documents_is_test 
  ON revenue_documents(company_id, is_test) 
  WHERE is_test = false;

CREATE INDEX IF NOT EXISTS idx_expense_documents_is_test 
  ON expense_documents(company_id, is_test) 
  WHERE is_test = false;
