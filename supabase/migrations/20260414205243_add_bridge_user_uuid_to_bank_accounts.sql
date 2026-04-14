/*
  # Add bridge_user_uuid to bank_accounts

  ## Summary
  Adds a nullable TEXT column `bridge_user_uuid` to the `bank_accounts` table.

  ## Changes
  - `bank_accounts`: new column `bridge_user_uuid TEXT` (nullable)

  ## Purpose
  Required for Bridge Connect migration. Stores the Bridge user UUID returned
  by the Connect callback, replacing the OAuth refresh_token pattern.
  Used by bridge-sync to re-authenticate without a stored refresh_token.

  ## Notes
  - Non-destructive: nullable column, no existing data affected
  - No default value: NULL for all existing rows
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_accounts' AND column_name = 'bridge_user_uuid'
  ) THEN
    ALTER TABLE bank_accounts ADD COLUMN bridge_user_uuid TEXT;
  END IF;
END $$;
