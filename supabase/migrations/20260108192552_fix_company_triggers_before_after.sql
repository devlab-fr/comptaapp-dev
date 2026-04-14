/*
  # Fix company creation triggers - Split BEFORE/AFTER

  1. Problem
    - Current BEFORE INSERT trigger tries to insert into memberships
    - FK violation because companies.id doesn't exist yet

  2. Solution
    - BEFORE INSERT: Only set owner_id = auth.uid()
    - AFTER INSERT: Create owner membership after company exists
    - Add unique constraint on memberships(user_id, company_id) for ON CONFLICT

  3. Changes
    - Drop old trigger/function
    - Create set_company_owner_id() + trg_set_company_owner_id (BEFORE)
    - Create create_owner_membership_after_company_insert() + trg_create_owner_membership (AFTER)
    - Add unique constraint if not exists
*/

-- 1) Drop old trigger/function
DROP TRIGGER IF EXISTS trigger_auto_create_owner_membership ON public.companies;
DROP FUNCTION IF EXISTS public.auto_create_owner_membership();

-- 2) BEFORE INSERT: set owner_id only
CREATE OR REPLACE FUNCTION public.set_company_owner_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.owner_id IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.owner_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_set_company_owner_id ON public.companies;
CREATE TRIGGER trg_set_company_owner_id
BEFORE INSERT ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.set_company_owner_id();

-- 3) AFTER INSERT: create owner membership after company exists
CREATE OR REPLACE FUNCTION public.create_owner_membership_after_company_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO public.memberships (user_id, company_id, role)
    VALUES (auth.uid(), NEW.id, 'owner')
    ON CONFLICT (user_id, company_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_create_owner_membership ON public.companies;
CREATE TRIGGER trg_create_owner_membership
AFTER INSERT ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.create_owner_membership_after_company_insert();

-- 4) Ensure unique constraint for ON CONFLICT (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'memberships_user_company_unique'
  ) THEN
    ALTER TABLE public.memberships
    ADD CONSTRAINT memberships_user_company_unique UNIQUE (user_id, company_id);
  END IF;
END $$;