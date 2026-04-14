/*
  # Add remise columns to factures

  ## Context
  - CreateFacturePage inserts: remise_type, remise_value, montant_remise
  - ViewFacturePage reads: remise_type, remise_value, montant_remise
  - EditFacturePage reads and updates the same columns
  - All three columns were missing from factures table

  ## Changes
  - factures.remise_type    : text NULL — values used by code: 'aucune', 'pct', 'fixe'
                              No CHECK constraint per spec; NULL-safe for existing rows
  - factures.remise_value   : numeric NULL DEFAULT 0 — percentage or fixed amount
  - factures.montant_remise : numeric NOT NULL DEFAULT 0 — computed discount amount;
                              never NULL per business rule (code always provides a value)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'factures' AND column_name = 'remise_type'
  ) THEN
    ALTER TABLE factures ADD COLUMN remise_type text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'factures' AND column_name = 'remise_value'
  ) THEN
    ALTER TABLE factures ADD COLUMN remise_value numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'factures' AND column_name = 'montant_remise'
  ) THEN
    ALTER TABLE factures ADD COLUMN montant_remise numeric NOT NULL DEFAULT 0;
  END IF;
END $$;
