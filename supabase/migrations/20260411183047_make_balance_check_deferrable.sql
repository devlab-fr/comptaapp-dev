/*
  # Make accounting_lines balance check DEFERRABLE INITIALLY DEFERRED

  The check_entry_balance trigger fires after every single accounting_line INSERT,
  which makes it impossible to insert multiple lines in a batch (the first debit line
  leaves the entry unbalanced until the credit line is inserted).

  Fix: recreate the trigger as CONSTRAINT TRIGGER DEFERRABLE INITIALLY DEFERRED so
  the balance check runs at end-of-transaction, not after each row.
*/

DROP TRIGGER IF EXISTS validate_entry_balance_after_line_change ON accounting_lines;
DROP TRIGGER IF EXISTS check_entry_balance_trigger ON accounting_lines;

CREATE CONSTRAINT TRIGGER validate_entry_balance_after_line_change
  AFTER INSERT OR UPDATE OR DELETE ON accounting_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION check_entry_balance();
