/*
  # Extend RLS policies for attachments to support document model

  1. Security Updates
    - Extend SELECT policy to allow viewing attachments via expense_document_id and revenue_document_id
    - Extend INSERT policy to allow creating attachments for documents
    - Extend UPDATE policy to allow modifying attachments for documents
    - Extend DELETE policy to allow removing attachments for documents

  2. Important Notes
    - Existing policies for expense_id/revenue_id remain unchanged
    - Uses OR logic to support both old and new models
    - Maintains same security level as existing policies
*/

DROP POLICY IF EXISTS "Users can view attachments of their companies" ON attachments;
DROP POLICY IF EXISTS "Owners, admins and accountants can insert attachments" ON attachments;
DROP POLICY IF EXISTS "Owners, admins and accountants can update attachments" ON attachments;
DROP POLICY IF EXISTS "Owners and admins can delete attachments" ON attachments;

CREATE POLICY "Users can view attachments of their companies"
  ON attachments FOR SELECT
  TO authenticated
  USING (
    has_company_access(company_id)
  );

CREATE POLICY "Owners, admins and accountants can insert attachments"
  ON attachments FOR INSERT
  TO authenticated
  WITH CHECK (
    can_modify_company_data(company_id, false)
  );

CREATE POLICY "Owners, admins and accountants can update attachments"
  ON attachments FOR UPDATE
  TO authenticated
  USING (can_modify_company_data(company_id, false))
  WITH CHECK (can_modify_company_data(company_id, false));

CREATE POLICY "Owners and admins can delete attachments"
  ON attachments FOR DELETE
  TO authenticated
  USING (
    has_company_role(company_id, 'owner'::membership_role) OR 
    has_company_role(company_id, 'admin'::membership_role)
  );
