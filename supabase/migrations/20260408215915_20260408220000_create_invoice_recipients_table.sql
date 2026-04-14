/*
  # Create invoice_recipients table

  ## Context
  - Table referenced by CreateFacturePage, EditFacturePage, ViewFacturePage
  - Migration 20260305164251 was never applied — table was missing, causing PGRST205
  - This restores exactly what the active frontend code reads and writes

  ## New Table: invoice_recipients
  - id            : UUID primary key
  - company_id    : FK to companies (scopes recipients per company)
  - name          : client name or company name (required)
  - type          : 'particulier' | 'entreprise'
  - address_line1 : first address line (optional)
  - address_line2 : second address line (optional)
  - postal_code   : postal code (optional)
  - city          : city (optional)
  - country       : country, defaults to 'France'
  - email         : contact email (optional)
  - siren         : SIREN number, entreprise only (optional)
  - vat_number    : VAT number, entreprise only (optional)
  - created_at    : creation timestamp

  ## Security
  - RLS enabled
  - Members of the owning company can SELECT, INSERT, UPDATE
*/

CREATE TABLE IF NOT EXISTS invoice_recipients (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  type        text NOT NULL DEFAULT 'particulier' CHECK (type IN ('particulier', 'entreprise')),
  address_line1 text,
  address_line2 text,
  postal_code text,
  city        text,
  country     text DEFAULT 'France',
  email       text,
  siren       text,
  vat_number  text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE invoice_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can select invoice_recipients of their company"
  ON invoice_recipients FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = invoice_recipients.company_id
        AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can insert invoice_recipients for their company"
  ON invoice_recipients FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = invoice_recipients.company_id
        AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can update invoice_recipients of their company"
  ON invoice_recipients FOR UPDATE
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
