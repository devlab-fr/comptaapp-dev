/*
  # Create Revenues Table

  ## Overview
  This migration creates the revenues table to track company income with:
  - Revenue categorization (category and subcategory)
  - VAT calculation (independent from categories)
  - Company-based isolation via RLS
  - Same structure as expenses but for revenues

  ## New Table
  
  ### `revenues`
  - `id` (uuid, primary key) - Unique revenue identifier
  - `company_id` (uuid, not null) - Foreign key to companies
  - `category_id` (uuid, not null) - Foreign key to revenue_categories
  - `subcategory_id` (uuid, nullable) - Foreign key to revenue_subcategories
  - `description` (text, not null) - Revenue description
  - `invoice_date` (date, not null) - Invoice/revenue date
  - `amount_excl_vat` (numeric, not null) - Amount excluding VAT (HT)
  - `vat_rate` (numeric, not null) - VAT rate (e.g., 0.20 for 20%)
  - `vat_amount` (numeric, not null) - Calculated VAT amount
  - `amount_incl_vat` (numeric, not null) - Total amount including VAT (TTC)
  - `created_at` (timestamptz, not null) - Creation timestamp

  ## Security (RLS)
  - Users can only access revenues for companies they are members of
  - SELECT: Users can view revenues for their companies
  - INSERT: Users can add revenues to their companies
  - UPDATE: Users can update revenues for their companies
  - DELETE: Users can delete revenues for their companies

  ## Constraints
  - ON DELETE RESTRICT on category references to prevent data loss
  - Amount fields use numeric type for precision
*/

CREATE TABLE IF NOT EXISTS revenues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES revenue_categories(id) ON DELETE RESTRICT,
  subcategory_id uuid REFERENCES revenue_subcategories(id) ON DELETE RESTRICT,
  description text NOT NULL,
  invoice_date date NOT NULL,
  amount_excl_vat numeric NOT NULL,
  vat_rate numeric NOT NULL,
  vat_amount numeric NOT NULL,
  amount_incl_vat numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE revenues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view revenues for their companies"
  ON revenues
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = revenues.company_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert revenues for their companies"
  ON revenues
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = revenues.company_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update revenues for their companies"
  ON revenues
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = revenues.company_id
      AND memberships.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = revenues.company_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete revenues for their companies"
  ON revenues
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = revenues.company_id
      AND memberships.user_id = auth.uid()
    )
  );