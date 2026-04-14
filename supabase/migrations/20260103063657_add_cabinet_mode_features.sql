/*
  # Add Cabinet Mode Features

  1. New Tables
    - `fiscal_year_status`
      - `id` (uuid, primary key)
      - `company_id` (uuid, references companies)
      - `fiscal_year` (integer)
      - `status` (text: 'en_cours', 'a_corriger', 'pret_cabinet', 'cloture')
      - `updated_at` (timestamptz)
      - `updated_by` (uuid, references auth.users)
      
    - `accounting_entry_comments`
      - `id` (uuid, primary key)
      - `entry_id` (uuid, references accounting_entries)
      - `user_id` (uuid, references auth.users)
      - `comment` (text)
      - `created_at` (timestamptz)
      
    - `accounting_entry_history`
      - `id` (uuid, primary key)
      - `entry_id` (uuid, references accounting_entries)
      - `user_id` (uuid, references auth.users)
      - `action` (text)
      - `created_at` (timestamptz)
      
    - `account_mapping`
      - `id` (uuid, primary key)
      - `company_id` (uuid, references companies)
      - `source_account` (text)
      - `target_account` (text)
      - `description` (text)
      - `is_active` (boolean)
      - `created_at` (timestamptz)
    
  2. Security
    - Enable RLS on all new tables
    - Add policies for accountant role (cabinet) with appropriate read/write permissions
    
  Note: Using existing 'accountant' role from membership_role enum as cabinet role
*/

CREATE TABLE IF NOT EXISTS fiscal_year_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  fiscal_year integer NOT NULL,
  status text NOT NULL DEFAULT 'en_cours',
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  CONSTRAINT fiscal_year_status_unique UNIQUE (company_id, fiscal_year),
  CONSTRAINT fiscal_year_status_status_check CHECK (status IN ('en_cours', 'a_corriger', 'pret_cabinet', 'cloture'))
);

ALTER TABLE fiscal_year_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view fiscal year status"
  ON fiscal_year_status FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = fiscal_year_status.company_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Cabinet members can update fiscal year status"
  ON fiscal_year_status FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = fiscal_year_status.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'accountant')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = fiscal_year_status.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'accountant')
    )
  );

CREATE POLICY "Company members can insert fiscal year status"
  ON fiscal_year_status FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = fiscal_year_status.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'accountant')
    )
  );

CREATE TABLE IF NOT EXISTS accounting_entry_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES accounting_entries(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  comment text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE accounting_entry_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view entry comments"
  ON accounting_entry_comments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM accounting_entries ae
      JOIN memberships m ON m.company_id = ae.company_id
      WHERE ae.id = accounting_entry_comments.entry_id
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can insert entry comments"
  ON accounting_entry_comments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM accounting_entries ae
      JOIN memberships m ON m.company_id = ae.company_id
      WHERE ae.id = accounting_entry_comments.entry_id
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own entry comments"
  ON accounting_entry_comments FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS accounting_entry_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES accounting_entries(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE accounting_entry_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view entry history"
  ON accounting_entry_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM accounting_entries ae
      JOIN memberships m ON m.company_id = ae.company_id
      WHERE ae.id = accounting_entry_history.entry_id
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can insert entry history"
  ON accounting_entry_history FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM accounting_entries ae
      JOIN memberships m ON m.company_id = ae.company_id
      WHERE ae.id = accounting_entry_history.entry_id
      AND m.user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS account_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_account text NOT NULL,
  target_account text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE account_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view account mapping"
  ON account_mapping FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = account_mapping.company_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Cabinet members can manage account mapping"
  ON account_mapping FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = account_mapping.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'accountant')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = account_mapping.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'accountant')
    )
  );

CREATE OR REPLACE FUNCTION log_accounting_entry_action()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO accounting_entry_history (entry_id, user_id, action)
    VALUES (NEW.id, auth.uid(), 'created');
  ELSIF TG_OP = 'UPDATE' AND OLD.locked = false AND NEW.locked = true THEN
    INSERT INTO accounting_entry_history (entry_id, user_id, action)
    VALUES (NEW.id, auth.uid(), 'locked');
  ELSIF TG_OP = 'UPDATE' AND OLD.locked = true AND NEW.locked = false THEN
    INSERT INTO accounting_entry_history (entry_id, user_id, action)
    VALUES (NEW.id, auth.uid(), 'unlocked');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'accounting_entry_history_trigger'
  ) THEN
    CREATE TRIGGER accounting_entry_history_trigger
      AFTER INSERT OR UPDATE ON accounting_entries
      FOR EACH ROW
      EXECUTE FUNCTION log_accounting_entry_action();
  END IF;
END $$;
