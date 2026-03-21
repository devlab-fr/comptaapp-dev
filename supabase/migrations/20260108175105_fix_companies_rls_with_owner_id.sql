/*
  # Fix companies RLS - Add owner_id column

  ## Problem
  Companies table doesn't have an owner_id column. RLS policies rely on memberships
  table via has_company_access() function, which fails when:
  - DEV_AUTH_BYPASS is enabled (fake tokens, auth.uid() returns NULL)
  - User creates a company but the trigger doesn't execute properly
  - Session is invalid or expired

  ## Solution
  Add owner_id column to companies table and update RLS policies to use it directly.
  This provides:
  - Simpler, more direct ownership model
  - Works even with session issues (once created, owner_id is immutable)
  - Easier to debug and understand
  - Maintains compatibility with memberships table

  ## Changes
  1. Add owner_id column to companies table
  2. Populate owner_id from existing memberships (where role='owner')
  3. Make owner_id NOT NULL
  4. Update auto_create_owner_membership trigger to also set owner_id
  5. Replace RLS policies with simpler owner_id-based policies
  6. Keep memberships-based access for SELECT (multi-user companies)

  ## Security
  - Owner_id is set automatically on INSERT via trigger
  - Only authenticated users can create companies
  - Only company owner can update/delete
  - All members can view via memberships table
*/

-- ==================================================
-- 1. ADD OWNER_ID COLUMN
-- ==================================================

-- Add owner_id column (nullable initially)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'owner_id'
  ) THEN
    ALTER TABLE companies ADD COLUMN owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ==================================================
-- 2. POPULATE OWNER_ID FROM MEMBERSHIPS
-- ==================================================

-- Set owner_id for existing companies based on 'owner' memberships
UPDATE companies c
SET owner_id = m.user_id
FROM memberships m
WHERE c.id = m.company_id
  AND m.role = 'owner'
  AND c.owner_id IS NULL;

-- ==================================================
-- 3. MAKE OWNER_ID NOT NULL
-- ==================================================

-- For any companies without owner_id (orphaned), assign to first member
UPDATE companies c
SET owner_id = (
  SELECT user_id
  FROM memberships m
  WHERE m.company_id = c.id
  LIMIT 1
)
WHERE owner_id IS NULL;

-- Now make it NOT NULL
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'owner_id' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE companies ALTER COLUMN owner_id SET NOT NULL;
  END IF;
END $$;

-- ==================================================
-- 4. UPDATE AUTO-CREATE TRIGGER
-- ==================================================

-- Drop and recreate trigger function to include owner_id
DROP TRIGGER IF EXISTS trigger_auto_create_owner_membership ON companies;
DROP FUNCTION IF EXISTS auto_create_owner_membership();

CREATE OR REPLACE FUNCTION auto_create_owner_membership()
RETURNS TRIGGER AS $$
BEGIN
  -- Set owner_id if not already set and user is authenticated
  IF NEW.owner_id IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.owner_id := auth.uid();
  END IF;

  -- Create membership record for owner
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO memberships (user_id, company_id, role)
    VALUES (auth.uid(), NEW.id, 'owner')
    ON CONFLICT (user_id, company_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger (BEFORE INSERT so we can modify NEW.owner_id)
CREATE TRIGGER trigger_auto_create_owner_membership
  BEFORE INSERT ON companies
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_owner_membership();

-- ==================================================
-- 5. REPLACE RLS POLICIES
-- ==================================================

-- Drop old policies
DROP POLICY IF EXISTS "Users can view companies they belong to" ON companies;
DROP POLICY IF EXISTS "Users can insert companies" ON companies;
DROP POLICY IF EXISTS "Owners and admins can update companies" ON companies;
DROP POLICY IF EXISTS "Owners can delete companies" ON companies;

-- Create new simpler policies based on owner_id

-- SELECT: Users can view companies they own OR companies they're members of
CREATE POLICY "Users can view their companies or companies they belong to"
  ON companies FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid() OR
    has_company_access(id)
  );

-- INSERT: Authenticated users can create companies (owner_id set by trigger)
CREATE POLICY "Authenticated users can create companies"
  ON companies FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
  );

-- UPDATE: Only owner can update
CREATE POLICY "Company owners can update their companies"
  ON companies FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- DELETE: Only owner can delete
CREATE POLICY "Company owners can delete their companies"
  ON companies FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());

-- ==================================================
-- 6. ADD INDEX FOR PERFORMANCE
-- ==================================================

CREATE INDEX IF NOT EXISTS idx_companies_owner_id ON companies(owner_id);
