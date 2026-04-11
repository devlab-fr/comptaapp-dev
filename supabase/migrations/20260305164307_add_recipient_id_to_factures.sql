/*
  # Add recipient_id to factures table

  1. Changes
    - Add `recipient_id` column to `factures` table
      - Links to `invoice_recipients` table
      - Nullable to preserve existing invoices
      - Foreign key with ON DELETE SET NULL for safety

  2. Important Notes
    - Column is nullable to maintain compatibility with existing invoices
    - Existing invoices will continue to work using the old `client_id` field
    - New invoices can use `recipient_id` for full professional data
    - No data migration needed - this is purely additive
*/

-- Add recipient_id column to factures table
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