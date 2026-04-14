/*
  # Fix company creation - Auto-create owner membership
  
  ## Problem
  When a user creates a company, the INSERT succeeds but the .select() that follows fails
  because the SELECT policy requires has_company_access(id), which checks for a membership
  that doesn't exist yet (chicken-and-egg problem).
  
  ## Solution
  Create a PostgreSQL trigger that automatically creates an owner membership for the
  authenticated user (auth.uid()) when they create a company.
  
  ## Changes
  1. Create function: auto_create_owner_membership()
     - Triggered AFTER INSERT on companies
     - Creates a membership record with role='owner' for auth.uid()
     - Uses SECURITY DEFINER to bypass RLS during trigger execution
  
  2. Create trigger: trigger_auto_create_owner_membership
     - Executes after each INSERT on companies
     - Calls the function above
  
  ## Security
  - Function is SECURITY DEFINER but only creates membership for auth.uid()
  - No risk of privilege escalation
  - Maintains multi-tenant security model
*/

-- Function to auto-create owner membership
CREATE OR REPLACE FUNCTION auto_create_owner_membership()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create membership if user is authenticated
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO memberships (user_id, company_id, role)
    VALUES (auth.uid(), NEW.id, 'owner');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger that fires after company creation
CREATE TRIGGER trigger_auto_create_owner_membership
  AFTER INSERT ON companies
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_owner_membership();
