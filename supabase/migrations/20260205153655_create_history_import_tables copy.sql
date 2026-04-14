/*
  # Create History Import Tables

  1. New Tables
    - `opening_entries`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `company_id` (uuid, references companies)
      - `year` (integer) - fiscal year
      - `date_reprise` (date) - date of opening entry
      - `tresorerie` (numeric) - cash balance
      - `creances_clients` (numeric) - customer receivables
      - `dettes_fournisseurs` (numeric) - supplier payables
      - `tva_solde` (numeric) - VAT balance amount (positive value)
      - `tva_sens` (text) - VAT direction: 'payer' (to pay) or 'credit' (credit)
      - `created_at` (timestamptz)

    - `catchup_totals`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `company_id` (uuid, references companies)
      - `year` (integer) - fiscal year
      - `period_from` (date) - start of catchup period
      - `period_to` (date) - end of catchup period
      - `category_id` (uuid, references expense_categories or revenue_categories)
      - `category_type` (text) - 'expense' or 'revenue'
      - `total_ht` (numeric) - total amount excluding VAT
      - `total_tva` (numeric) - total VAT amount
      - `total_ttc` (numeric) - total amount including VAT
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users to manage their own company's data
*/

-- Create opening_entries table
CREATE TABLE IF NOT EXISTS opening_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  year integer NOT NULL,
  date_reprise date NOT NULL,
  tresorerie numeric DEFAULT 0 NOT NULL,
  creances_clients numeric DEFAULT 0 NOT NULL,
  dettes_fournisseurs numeric DEFAULT 0 NOT NULL,
  tva_solde numeric DEFAULT 0 NOT NULL,
  tva_sens text DEFAULT 'payer' CHECK (tva_sens IN ('payer', 'credit')) NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Create catchup_totals table
CREATE TABLE IF NOT EXISTS catchup_totals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  year integer NOT NULL,
  period_from date NOT NULL,
  period_to date NOT NULL,
  category_id uuid NOT NULL,
  category_type text CHECK (category_type IN ('expense', 'revenue')) NOT NULL,
  total_ht numeric DEFAULT 0 NOT NULL,
  total_tva numeric DEFAULT 0 NOT NULL,
  total_ttc numeric DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE opening_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE catchup_totals ENABLE ROW LEVEL SECURITY;

-- Policies for opening_entries
CREATE POLICY "Users can view opening entries for their companies"
  ON opening_entries FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = opening_entries.company_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert opening entries for their companies"
  ON opening_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = opening_entries.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Users can update opening entries for their companies"
  ON opening_entries FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = opening_entries.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = opening_entries.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Users can delete opening entries for their companies"
  ON opening_entries FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = opening_entries.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
    )
  );

-- Policies for catchup_totals
CREATE POLICY "Users can view catchup totals for their companies"
  ON catchup_totals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = catchup_totals.company_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert catchup totals for their companies"
  ON catchup_totals FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = catchup_totals.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Users can update catchup totals for their companies"
  ON catchup_totals FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = catchup_totals.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = catchup_totals.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Users can delete catchup totals for their companies"
  ON catchup_totals FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = catchup_totals.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS opening_entries_company_year_idx ON opening_entries(company_id, year);
CREATE INDEX IF NOT EXISTS catchup_totals_company_year_idx ON catchup_totals(company_id, year);