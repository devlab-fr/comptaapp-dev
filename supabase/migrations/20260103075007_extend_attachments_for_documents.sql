/*
  # Extend attachments table for document model support

  1. Schema Changes
    - Add `expense_document_id` column to link attachments to expense documents
    - Add `revenue_document_id` column to link attachments to revenue documents
    - Add indexes for performance
    - Keep existing `expense_id` and `revenue_id` columns for backward compatibility

  2. Important Notes
    - No existing data is affected
    - Existing RLS policies remain active
    - Supports both old (expenses/revenues) and new (documents) models
    - CASCADE delete ensures attachments are removed when documents are deleted
*/

ALTER TABLE attachments 
ADD COLUMN IF NOT EXISTS expense_document_id uuid REFERENCES expense_documents(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS revenue_document_id uuid REFERENCES revenue_documents(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_attachments_expense_document_id 
ON attachments(expense_document_id) 
WHERE expense_document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attachments_revenue_document_id 
ON attachments(revenue_document_id) 
WHERE revenue_document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attachments_expense_id 
ON attachments(expense_id) 
WHERE expense_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attachments_revenue_id 
ON attachments(revenue_id) 
WHERE revenue_id IS NOT NULL;
