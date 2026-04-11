/*
  # Add discount fields to factures table

  1. New Columns
    - `remise_type` (text) - Type of discount: 'aucune', 'pct', or 'fixe'
    - `remise_value` (numeric) - Value of the discount (percentage or fixed amount)
    - `montant_remise` (numeric) - Calculated discount amount in euros

  2. Purpose
    - Enable global discount at invoice level
    - Support both percentage and fixed amount discounts
    - Maintain backward compatibility with existing invoices

  3. Security
    - No RLS changes needed (inherits from factures table policies)
*/

-- Add discount columns to factures table
ALTER TABLE factures
ADD COLUMN IF NOT EXISTS remise_type text DEFAULT 'aucune'
CHECK (remise_type IN ('aucune', 'pct', 'fixe'));

ALTER TABLE factures
ADD COLUMN IF NOT EXISTS remise_value numeric(10,2) DEFAULT 0;

ALTER TABLE factures
ADD COLUMN IF NOT EXISTS montant_remise numeric(12,2) DEFAULT 0;

-- Create index for queries filtering by discount type
CREATE INDEX IF NOT EXISTS idx_factures_remise_type
ON factures(remise_type) WHERE remise_type != 'aucune';
