/*
  # Fix attachments constraint to support document model

  1. Problem
    - The existing `attachments_check` constraint only validates old model (expense_id/revenue_id)
    - New model (expense_document_id/revenue_document_id) fails this constraint
    - Constraint definition: CHECK ((expense_id IS NOT NULL AND revenue_id IS NULL) OR (expense_id IS NULL AND revenue_id IS NOT NULL))

  2. Solution
    - Drop the old constraint
    - Create new constraint that supports BOTH old and new models
    - Ensures exactly ONE foreign key is set (expense_id OR revenue_id OR expense_document_id OR revenue_document_id)

  3. Security
    - Maintains data integrity
    - Prevents orphaned attachments
    - Prevents ambiguous attachments (linked to multiple records)
*/

-- Drop the old constraint
ALTER TABLE attachments 
DROP CONSTRAINT IF EXISTS attachments_check;

-- Add new constraint supporting both old and new models
ALTER TABLE attachments 
ADD CONSTRAINT attachments_single_parent_check CHECK (
  (
    (expense_id IS NOT NULL)::int + 
    (revenue_id IS NOT NULL)::int + 
    (expense_document_id IS NOT NULL)::int + 
    (revenue_document_id IS NOT NULL)::int
  ) = 1
);
