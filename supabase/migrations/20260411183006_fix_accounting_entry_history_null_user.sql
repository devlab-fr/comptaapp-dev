/*
  # Fix log_accounting_entry_action for NULL auth.uid() in trigger context

  When accounting entries are created by SECURITY DEFINER functions (triggered from
  a DB trigger chain), auth.uid() returns NULL. This causes a NOT NULL violation on
  accounting_entry_history.user_id.

  Fix: fall back to NEW.created_by when auth.uid() is NULL.
  If both are NULL, skip the history insert silently.
*/

CREATE OR REPLACE FUNCTION log_accounting_entry_action()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    v_user_id := NEW.created_by;
  END IF;

  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO accounting_entry_history (entry_id, user_id, action)
    VALUES (NEW.id, v_user_id, 'created');
  ELSIF TG_OP = 'UPDATE' AND OLD.locked = false AND NEW.locked = true THEN
    INSERT INTO accounting_entry_history (entry_id, user_id, action)
    VALUES (NEW.id, v_user_id, 'locked');
  ELSIF TG_OP = 'UPDATE' AND OLD.locked = true AND NEW.locked = false THEN
    INSERT INTO accounting_entry_history (entry_id, user_id, action)
    VALUES (NEW.id, v_user_id, 'unlocked');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
