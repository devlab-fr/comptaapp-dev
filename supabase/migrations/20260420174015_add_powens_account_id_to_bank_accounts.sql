/*
  # Add powens_account_id to bank_accounts

  1. Changes
    - Add new column `powens_account_id` (BIGINT) to `bank_accounts`
    - Backfill `powens_account_id` from existing `powens_connection_id` values

  2. Notes
    - No UNIQUE constraint added at this step
    - No data deletion
    - No other tables affected
*/

ALTER TABLE public.bank_accounts
ADD COLUMN IF NOT EXISTS powens_account_id BIGINT;

UPDATE public.bank_accounts
SET powens_account_id = powens_connection_id
WHERE powens_account_id IS NULL
  AND powens_connection_id IS NOT NULL;
