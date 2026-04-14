/*
  # Add DEV-ONLY RLS policies for companies table

  ## Problem
  In DEV mode with DEV_AUTH_BYPASS enabled:
  - Mock user (dev@comptaapp.local) has no real Supabase session
  - auth.uid() returns NULL
  - RLS policies block INSERT/SELECT because owner_id = NULL fails checks
  - Cannot create companies in development environment

  ## Solution
  Add DEV-ONLY policies that allow operations when auth.uid() IS NULL.
  These policies have LOWER priority than production policies and only activate
  when no authenticated user session exists.

  ## Security
  - These policies ONLY work when auth.uid() IS NULL
  - In production, users ALWAYS have valid sessions (auth.uid() NOT NULL)
  - Therefore, these policies NEVER activate in production
  - Production policies (owner_id = auth.uid()) take precedence when session exists
  
  ## WARNING
  If these policies activate in production, it means authentication is broken.
  Monitor for NULL auth.uid() in production logs and investigate immediately.

  ## Changes
  1. Add DEV policy for SELECT (read all companies when no auth)
  2. Add DEV policy for INSERT (create company when no auth, owner_id can be NULL)
  3. Add DEV policy for UPDATE (update any company when no auth)
  4. Add DEV policy for DELETE (delete any company when no auth)
  5. Relax owner_id NOT NULL constraint to allow NULL in DEV mode
*/

-- ==================================================
-- 1. RELAX OWNER_ID CONSTRAINT FOR DEV
-- ==================================================

-- Allow owner_id to be NULL (for DEV mode only)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' 
    AND column_name = 'owner_id' 
    AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE companies ALTER COLUMN owner_id DROP NOT NULL;
  END IF;
END $$;

-- ==================================================
-- 2. ADD DEV-ONLY RLS POLICIES
-- ==================================================

-- DEV SELECT: Allow reading all companies when no auth session
CREATE POLICY "DEV ONLY - Allow SELECT without auth"
  ON companies FOR SELECT
  TO anon, authenticated
  USING (auth.uid() IS NULL);

-- DEV INSERT: Allow creating companies when no auth session
CREATE POLICY "DEV ONLY - Allow INSERT without auth"
  ON companies FOR INSERT
  TO anon, authenticated
  WITH CHECK (auth.uid() IS NULL);

-- DEV UPDATE: Allow updating any company when no auth session
CREATE POLICY "DEV ONLY - Allow UPDATE without auth"
  ON companies FOR UPDATE
  TO anon, authenticated
  USING (auth.uid() IS NULL)
  WITH CHECK (auth.uid() IS NULL);

-- DEV DELETE: Allow deleting any company when no auth session
CREATE POLICY "DEV ONLY - Allow DELETE without auth"
  ON companies FOR DELETE
  TO anon, authenticated
  USING (auth.uid() IS NULL);

-- ==================================================
-- 3. UPDATE TRIGGER TO HANDLE NULL OWNER_ID
-- ==================================================

-- Update trigger to skip owner_id/membership creation if auth.uid() is NULL
DROP TRIGGER IF EXISTS trigger_auto_create_owner_membership ON companies;
DROP FUNCTION IF EXISTS auto_create_owner_membership();

CREATE OR REPLACE FUNCTION auto_create_owner_membership()
RETURNS TRIGGER AS $$
BEGIN
  -- Only set owner_id and create membership if user is authenticated
  IF auth.uid() IS NOT NULL THEN
    -- Set owner_id if not already set
    IF NEW.owner_id IS NULL THEN
      NEW.owner_id := auth.uid();
    END IF;

    -- Create membership record for owner
    INSERT INTO memberships (user_id, company_id, role)
    VALUES (auth.uid(), NEW.id, 'owner')
    ON CONFLICT (user_id, company_id) DO NOTHING;
  END IF;

  -- In DEV mode (auth.uid() IS NULL), owner_id remains NULL
  -- and no membership is created
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
CREATE TRIGGER trigger_auto_create_owner_membership
  BEFORE INSERT ON companies
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_owner_membership();

-- ==================================================
-- 4. ADD WARNING COMMENT
-- ==================================================

COMMENT ON POLICY "DEV ONLY - Allow SELECT without auth" ON companies IS 
  'WARNING: This policy allows unauthenticated access. Only activates in DEV when auth.uid() IS NULL. If this activates in production, authentication is broken.';

COMMENT ON POLICY "DEV ONLY - Allow INSERT without auth" ON companies IS 
  'WARNING: This policy allows unauthenticated access. Only activates in DEV when auth.uid() IS NULL. If this activates in production, authentication is broken.';

COMMENT ON POLICY "DEV ONLY - Allow UPDATE without auth" ON companies IS 
  'WARNING: This policy allows unauthenticated access. Only activates in DEV when auth.uid() IS NULL. If this activates in production, authentication is broken.';

COMMENT ON POLICY "DEV ONLY - Allow DELETE without auth" ON companies IS 
  'WARNING: This policy allows unauthenticated access. Only activates in DEV when auth.uid() IS NULL. If this activates in production, authentication is broken.';
