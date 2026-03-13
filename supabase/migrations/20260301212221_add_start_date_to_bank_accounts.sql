/*
  # Add start_date to bank_accounts

  1. Changes
    - Add `start_date` column to `bank_accounts` table
      - Type: date (nullable)
      - Purpose: Define the starting date for theoretical balance calculations
      - If NULL: all validated+paid transactions are included
      - If set: only transactions with invoice_date >= start_date are included

  2. Security
    - No RLS changes needed - existing policies apply to new column

  3. Data Safety
    - Column is nullable - existing accounts remain functional
    - No data loss risk
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_accounts' AND column_name = 'start_date'
  ) THEN
    ALTER TABLE bank_accounts ADD COLUMN start_date date;
  END IF;
END $$;
