/*
  # Create VAT periods tracking table

  1. New Tables
    - `vat_periods`
      - `id` (uuid, primary key) - Unique identifier
      - `company_id` (uuid, foreign key) - References companies table
      - `period_year` (integer) - Year of the period (e.g., 2024)
      - `period_month` (integer) - Month of the period (1-12, null for annual)
      - `period_type` (text) - Type of period: 'monthly', 'quarterly', 'annual'
      - `status` (text) - Status: 'open' or 'declared'
      - `declared_at` (timestamptz, nullable) - When the period was declared
      - `declared_by` (uuid, nullable) - User who declared the period
      - `created_at` (timestamptz) - Record creation timestamp
      - `updated_at` (timestamptz) - Record update timestamp

  2. Security
    - Enable RLS on `vat_periods` table
    - Add policies for authenticated users based on company membership
    
  3. Indexes
    - Unique constraint on company_id + period_year + period_month + period_type
    - Index on company_id for faster queries

  4. Important Notes
    - This table tracks which VAT periods have been declared
    - Declared periods should be read-only in the UI
    - No automatic VAT filing - this is informational only
*/

-- Create vat_periods table
CREATE TABLE IF NOT EXISTS vat_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_year integer NOT NULL,
  period_month integer,
  period_type text NOT NULL DEFAULT 'monthly',
  status text NOT NULL DEFAULT 'open',
  declared_at timestamptz,
  declared_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT vat_periods_period_type_check CHECK (period_type IN ('monthly', 'quarterly', 'annual')),
  CONSTRAINT vat_periods_status_check CHECK (status IN ('open', 'declared')),
  CONSTRAINT vat_periods_month_check CHECK (period_month IS NULL OR (period_month >= 1 AND period_month <= 12)),
  CONSTRAINT vat_periods_unique_period UNIQUE (company_id, period_year, period_month, period_type)
);

-- Create index on company_id for faster queries
CREATE INDEX IF NOT EXISTS vat_periods_company_id_idx ON vat_periods(company_id);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS vat_periods_status_idx ON vat_periods(status);

-- Enable RLS
ALTER TABLE vat_periods ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view VAT periods for companies they are members of
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'vat_periods' 
    AND policyname = 'Users can view VAT periods for their companies'
  ) THEN
    CREATE POLICY "Users can view VAT periods for their companies"
      ON vat_periods FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM memberships
          WHERE memberships.company_id = vat_periods.company_id
          AND memberships.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Policy: Users can insert VAT periods for companies they are members of
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'vat_periods' 
    AND policyname = 'Users can create VAT periods for their companies'
  ) THEN
    CREATE POLICY "Users can create VAT periods for their companies"
      ON vat_periods FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM memberships
          WHERE memberships.company_id = vat_periods.company_id
          AND memberships.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Policy: Users can update VAT periods for companies they are members of
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'vat_periods' 
    AND policyname = 'Users can update VAT periods for their companies'
  ) THEN
    CREATE POLICY "Users can update VAT periods for their companies"
      ON vat_periods FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM memberships
          WHERE memberships.company_id = vat_periods.company_id
          AND memberships.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM memberships
          WHERE memberships.company_id = vat_periods.company_id
          AND memberships.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Policy: Users can delete VAT periods for companies they are members of
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'vat_periods' 
    AND policyname = 'Users can delete VAT periods for their companies'
  ) THEN
    CREATE POLICY "Users can delete VAT periods for their companies"
      ON vat_periods FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM memberships
          WHERE memberships.company_id = vat_periods.company_id
          AND memberships.user_id = auth.uid()
        )
      );
  END IF;
END $$;
