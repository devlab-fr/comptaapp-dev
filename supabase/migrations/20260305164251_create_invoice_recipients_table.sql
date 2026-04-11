/*
  # Create invoice_recipients table for professional invoicing

  1. New Tables
    - `invoice_recipients`
      - `id` (uuid, primary key) - Unique identifier
      - `company_id` (uuid) - Links to companies table
      - `name` (text) - Client name or company name
      - `type` (text) - 'particulier' or 'entreprise'
      - `address_line1` (text, nullable) - Street address line 1
      - `address_line2` (text, nullable) - Street address line 2
      - `postal_code` (text, nullable) - Postal code
      - `city` (text, nullable) - City
      - `country` (text, nullable) - Country
      - `email` (text, nullable) - Email address
      - `siren` (text, nullable) - SIREN number (French business ID)
      - `vat_number` (text, nullable) - VAT intra-community number
      - `created_at` (timestamptz) - Creation timestamp

  2. Security
    - Enable RLS on `invoice_recipients` table
    - Add policy for company members to read invoice recipients
    - Add policy for company members to insert invoice recipients
    - Add policy for company members to update invoice recipients
    - Add policy for company members to delete invoice recipients

  3. Important Notes
    - This table is separate from the existing `clients` table to avoid any regression
    - The `type` field allows differentiation between individuals and businesses
    - All address and business fields are nullable for flexibility
    - Foreign key ensures data integrity with companies
*/

-- Create invoice_recipients table
CREATE TABLE IF NOT EXISTS invoice_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  name text NOT NULL,
  
  type text NOT NULL DEFAULT 'particulier'
    CHECK (type IN ('particulier', 'entreprise')),
  
  address_line1 text,
  address_line2 text,
  postal_code text,
  city text,
  country text,
  
  email text,
  
  siren text,
  vat_number text,
  
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE invoice_recipients ENABLE ROW LEVEL SECURITY;

-- Policy: Company members can read invoice recipients
CREATE POLICY "Company members can read invoice recipients"
  ON invoice_recipients
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = invoice_recipients.company_id
      AND memberships.user_id = auth.uid()
    )
  );

-- Policy: Company members can insert invoice recipients
CREATE POLICY "Company members can insert invoice recipients"
  ON invoice_recipients
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = invoice_recipients.company_id
      AND memberships.user_id = auth.uid()
    )
  );

-- Policy: Company members can update invoice recipients
CREATE POLICY "Company members can update invoice recipients"
  ON invoice_recipients
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = invoice_recipients.company_id
      AND memberships.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = invoice_recipients.company_id
      AND memberships.user_id = auth.uid()
    )
  );

-- Policy: Company members can delete invoice recipients
CREATE POLICY "Company members can delete invoice recipients"
  ON invoice_recipients
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = invoice_recipients.company_id
      AND memberships.user_id = auth.uid()
    )
  );