/*
  # Add company settings fields

  1. Changes to companies table
    - Add legal_form (forme juridique)
    - Add siren
    - Add siret
    - Add address
    - Add vat_regime (régime de TVA)
    - Add fiscal_year_start (date de début d'exercice)
    - Add fiscal_year_end (date de clôture d'exercice)
    - Add is_locked (verrouillage si écritures validées)

  2. New Tables
    - `company_directors` (dirigeants)
      - `id` (uuid, primary key)
      - `company_id` (uuid, foreign key)
      - `first_name` (text)
      - `last_name` (text)
      - `role` (text)
      - `start_date` (date)
      - `is_active` (boolean)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `company_shareholders` (associés)
      - `id` (uuid, primary key)
      - `company_id` (uuid, foreign key)
      - `name` (text)
      - `type` (text: 'person' or 'entity')
      - `ownership_percentage` (numeric)
      - `capital_amount` (numeric)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  3. Security
    - Enable RLS on new tables
    - Add policies for company members
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'legal_form'
  ) THEN
    ALTER TABLE companies ADD COLUMN legal_form text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'siren'
  ) THEN
    ALTER TABLE companies ADD COLUMN siren text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'siret'
  ) THEN
    ALTER TABLE companies ADD COLUMN siret text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'address'
  ) THEN
    ALTER TABLE companies ADD COLUMN address text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'vat_regime'
  ) THEN
    ALTER TABLE companies ADD COLUMN vat_regime text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'fiscal_year_start'
  ) THEN
    ALTER TABLE companies ADD COLUMN fiscal_year_start date;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'fiscal_year_end'
  ) THEN
    ALTER TABLE companies ADD COLUMN fiscal_year_end date;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'is_locked'
  ) THEN
    ALTER TABLE companies ADD COLUMN is_locked boolean DEFAULT false;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS company_directors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT '',
  start_date date DEFAULT CURRENT_DATE,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE company_directors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view directors"
  ON company_directors
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = company_directors.company_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can insert directors"
  ON company_directors
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = company_directors.company_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can update directors"
  ON company_directors
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = company_directors.company_id
      AND memberships.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = company_directors.company_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can delete directors"
  ON company_directors
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = company_directors.company_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS company_shareholders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'person',
  ownership_percentage numeric(5, 2) DEFAULT 0,
  capital_amount numeric(12, 2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE company_shareholders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view shareholders"
  ON company_shareholders
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = company_shareholders.company_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can insert shareholders"
  ON company_shareholders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = company_shareholders.company_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can update shareholders"
  ON company_shareholders
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = company_shareholders.company_id
      AND memberships.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = company_shareholders.company_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can delete shareholders"
  ON company_shareholders
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = company_shareholders.company_id
      AND memberships.user_id = auth.uid()
    )
  );
