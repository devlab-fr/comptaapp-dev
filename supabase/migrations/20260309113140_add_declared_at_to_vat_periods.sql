/*
  # Add declared_at column to vat_periods

  1. Changes
    - Add `declared_at` column (date, nullable) to `vat_periods` table
  
  2. Purpose
    - Store the user-selected declaration date when marking a VAT period as declared
    - NULL when period status is 'open'
    - Set to chosen date when status is 'declared'
  
  3. Notes
    - Minimal change: only adding one column
    - No constraints modified
    - No existing data affected (all rows will have NULL by default)
*/

ALTER TABLE vat_periods 
ADD COLUMN IF NOT EXISTS declared_at date NULL;