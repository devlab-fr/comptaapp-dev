/*
  # Add Bridge API columns to bank_accounts + secure view

  ## Summary
  This migration adds the Bridge API integration columns to bank_accounts,
  creates a unique constraint to ensure idempotent callbacks, and creates
  a security view that NEVER exposes token columns to the frontend.

  ## Changes

  ### Modified Tables
  - `bank_accounts`
    - `bridge_item_id` (text, nullable) — Bridge item identifier
    - `bridge_account_id` (text, nullable) — Bridge account identifier
    - `bridge_access_token` (text, nullable) — Bridge OAuth access token (NEVER exposed via API)
    - `bridge_refresh_token` (text, nullable) — Bridge OAuth refresh token (NEVER exposed via API)
    - `bridge_token_expires_at` (timestamptz, nullable) — Token expiry timestamp
    - `bridge_last_sync_at` (timestamptz, nullable) — Last successful sync cursor
    - UNIQUE constraint on (company_id, bridge_account_id) for idempotent upserts

  ### New Views
  - `bank_accounts_safe`
    - Exposes ONLY non-sensitive columns (no tokens)
    - Used by all frontend queries
    - Protected by SECURITY INVOKER — inherits caller's RLS context
    - RLS on underlying table still enforced

  ## Security
  - Token columns are never selected in this view
  - Only edge functions with service_role key can access token columns directly
  - Unique constraint on (company_id, bridge_account_id) prevents duplicate accounts
*/

-- Add Bridge columns to bank_accounts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_accounts' AND column_name = 'bridge_item_id'
  ) THEN
    ALTER TABLE bank_accounts ADD COLUMN bridge_item_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_accounts' AND column_name = 'bridge_account_id'
  ) THEN
    ALTER TABLE bank_accounts ADD COLUMN bridge_account_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_accounts' AND column_name = 'bridge_access_token'
  ) THEN
    ALTER TABLE bank_accounts ADD COLUMN bridge_access_token text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_accounts' AND column_name = 'bridge_refresh_token'
  ) THEN
    ALTER TABLE bank_accounts ADD COLUMN bridge_refresh_token text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_accounts' AND column_name = 'bridge_token_expires_at'
  ) THEN
    ALTER TABLE bank_accounts ADD COLUMN bridge_token_expires_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_accounts' AND column_name = 'bridge_last_sync_at'
  ) THEN
    ALTER TABLE bank_accounts ADD COLUMN bridge_last_sync_at timestamptz;
  END IF;
END $$;

-- Unique constraint to prevent duplicate bridge accounts (idempotent callback upserts)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'bank_accounts'
    AND constraint_name = 'uq_bank_accounts_company_bridge_account'
  ) THEN
    ALTER TABLE bank_accounts
      ADD CONSTRAINT uq_bank_accounts_company_bridge_account
      UNIQUE (company_id, bridge_account_id);
  END IF;
END $$;

-- Drop and recreate the safe view (idempotent)
DROP VIEW IF EXISTS bank_accounts_safe;

CREATE VIEW bank_accounts_safe
WITH (security_invoker = true)
AS
SELECT
  id,
  company_id,
  name,
  currency,
  opening_balance_cents,
  opening_balance_date,
  start_date,
  bridge_account_id,
  bridge_item_id,
  bridge_last_sync_at,
  created_at,
  updated_at
FROM bank_accounts;

-- Grant authenticated users access to the view
GRANT SELECT ON bank_accounts_safe TO authenticated;
