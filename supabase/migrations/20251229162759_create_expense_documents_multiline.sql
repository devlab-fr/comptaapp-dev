/*
  # Create Multi-Line Expense Document System

  ## Overview
  This migration creates a document-based expense system that supports multiple lines per document.
  Each document represents a receipt/invoice with one or more expense lines, each having its own
  category, VAT rate, and amount.

  ## New Tables
  
  ### `expense_documents`
  - `id` (uuid, primary key) - Unique document identifier
  - `company_id` (uuid, not null) - Foreign key to companies
  - `invoice_date` (date, not null) - Document date (single date for all lines)
  - `total_excl_vat` (numeric, not null) - Total amount excluding VAT (sum of all lines)
  - `total_vat` (numeric, not null) - Total VAT amount (sum of all lines)
  - `total_incl_vat` (numeric, not null) - Total amount including VAT (sum of all lines)
  - `created_at` (timestamptz, not null) - Creation timestamp

  ### `expense_lines`
  - `id` (uuid, primary key) - Unique line identifier
  - `document_id` (uuid, not null) - Foreign key to expense_documents
  - `description` (text, not null) - Line description/label
  - `category_id` (uuid, not null) - Foreign key to expense_categories
  - `subcategory_id` (uuid, nullable) - Foreign key to expense_subcategories
  - `amount_excl_vat` (numeric, not null) - Line amount excluding VAT
  - `vat_rate` (numeric, not null) - VAT rate (e.g., 0.20 for 20%)
  - `vat_amount` (numeric, not null) - Calculated VAT amount
  - `amount_incl_vat` (numeric, not null) - Line total including VAT
  - `line_order` (integer, not null) - Display order of lines in document
  - `created_at` (timestamptz, not null) - Creation timestamp

  ## Security (RLS)
  - Both tables: Users can only access documents/lines for companies they are members of
  - SELECT: Users can view documents/lines for their companies
  - INSERT: Users can add documents/lines to their companies
  - UPDATE: Users can update documents/lines for their companies
  - DELETE: Users can delete documents/lines for their companies

  ## Data Safety
  - ON DELETE CASCADE from document to lines (if document deleted, lines are deleted)
  - ON DELETE RESTRICT on category references to prevent data loss
  - Existing `expenses` table remains untouched
  - Data will be migrated in a separate migration
*/

CREATE TABLE IF NOT EXISTS expense_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_date date NOT NULL,
  total_excl_vat numeric NOT NULL DEFAULT 0,
  total_vat numeric NOT NULL DEFAULT 0,
  total_incl_vat numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expense_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES expense_documents(id) ON DELETE CASCADE,
  description text NOT NULL,
  category_id uuid NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
  subcategory_id uuid REFERENCES expense_subcategories(id) ON DELETE RESTRICT,
  amount_excl_vat numeric NOT NULL,
  vat_rate numeric NOT NULL,
  vat_amount numeric NOT NULL,
  amount_incl_vat numeric NOT NULL,
  line_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE expense_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view expense documents for their companies"
  ON expense_documents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = expense_documents.company_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert expense documents for their companies"
  ON expense_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = expense_documents.company_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update expense documents for their companies"
  ON expense_documents
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = expense_documents.company_id
      AND memberships.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = expense_documents.company_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete expense documents for their companies"
  ON expense_documents
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = expense_documents.company_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view expense lines for their companies"
  ON expense_lines
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM expense_documents
      JOIN memberships ON memberships.company_id = expense_documents.company_id
      WHERE expense_documents.id = expense_lines.document_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert expense lines for their companies"
  ON expense_lines
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM expense_documents
      JOIN memberships ON memberships.company_id = expense_documents.company_id
      WHERE expense_documents.id = expense_lines.document_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update expense lines for their companies"
  ON expense_lines
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM expense_documents
      JOIN memberships ON memberships.company_id = expense_documents.company_id
      WHERE expense_documents.id = expense_lines.document_id
      AND memberships.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM expense_documents
      JOIN memberships ON memberships.company_id = expense_documents.company_id
      WHERE expense_documents.id = expense_lines.document_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete expense lines for their companies"
  ON expense_lines
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM expense_documents
      JOIN memberships ON memberships.company_id = expense_documents.company_id
      WHERE expense_documents.id = expense_lines.document_id
      AND memberships.user_id = auth.uid()
    )
  );