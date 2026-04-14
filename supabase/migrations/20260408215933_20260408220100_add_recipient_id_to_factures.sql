/*
  # Add recipient_id to factures

  ## Context
  - CreateFacturePage inserts factures.recipient_id
  - EditFacturePage reads factures.recipient_id to load the associated invoice_recipient
  - ViewFacturePage selects recipient_id from factures
  - Column was missing from factures table — added here

  ## Changes
  - factures.recipient_id : nullable UUID FK → invoice_recipients(id) ON DELETE SET NULL
    Nullable so existing invoices (without recipient) continue to work unchanged.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'factures' AND column_name = 'recipient_id'
  ) THEN
    ALTER TABLE factures
      ADD COLUMN recipient_id uuid REFERENCES invoice_recipients(id) ON DELETE SET NULL;
  END IF;
END $$;
