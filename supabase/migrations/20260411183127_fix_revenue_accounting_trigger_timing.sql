
/*
  # Fix Revenue Accounting Trigger Timing

  ## Problem
  The trigger `trigger_auto_revenue_accounting_entry` fires AFTER INSERT on `revenue_documents`.
  At that moment, `revenue_lines` do not yet exist (they are inserted separately by the client).
  The accounting loop over revenue_lines returns 0 rows → only debit 411 is created → unbalanced entry.

  ## Fix
  1. Drop the trigger on `revenue_documents INSERT` that calls `auto_create_revenue_accounting_entry`.
  2. Create a new trigger on `revenue_lines AFTER INSERT` that calls the same implementation function.

  The existing anti-duplication guard in `auto_create_revenue_accounting_entry_impl`:
    IF v_existing_entry_id IS NOT NULL THEN RETURN;
  ensures only the first revenue_line insertion triggers the full accounting creation.
  All subsequent lines for the same document are ignored by this guard.

  ## Anti-duplication guarantee
  - The function checks for an existing unlocked entry tied to the document before creating anything.
  - If an entry already exists, the function returns immediately without creating duplicates.

  ## Important notes
  - No accounting logic is modified.
  - No accounts or amounts are modified.
  - The payment trigger (trigger_auto_revenue_payment_entry) is untouched.
  - The recompute RPC function is untouched.
  - The `app.skip_revenue_accounting_trigger` session variable check is preserved in the wrapper.
*/

-- Step 1: Drop the old trigger that fires too early (on revenue_documents INSERT)
DROP TRIGGER IF EXISTS trigger_auto_revenue_accounting_entry ON revenue_documents;

-- Step 2: Create the wrapper function for revenue_lines trigger
CREATE OR REPLACE FUNCTION auto_create_revenue_accounting_entry_from_line()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_revenue revenue_documents%ROWTYPE;
  skip_trigger text;
BEGIN
  skip_trigger := current_setting('app.skip_revenue_accounting_trigger', true);

  IF skip_trigger = 'true' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_revenue
  FROM revenue_documents
  WHERE id = NEW.document_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  PERFORM auto_create_revenue_accounting_entry_impl(v_revenue);

  RETURN NEW;
END;
$$;

-- Step 3: Create new trigger on revenue_lines AFTER INSERT
CREATE TRIGGER trigger_auto_revenue_accounting_entry_on_line
  AFTER INSERT ON revenue_lines
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_revenue_accounting_entry_from_line();
