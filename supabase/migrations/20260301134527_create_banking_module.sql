/*
  # Create Banking Module (Trésorerie TTC + Banque CSV)

  1. New Tables
    - `bank_accounts`
      - `id` (uuid, primary key)
      - `company_id` (uuid, indexed, not null)
      - `name` (text, not null)
      - `currency` (text, default 'EUR', not null)
      - `opening_balance_cents` (bigint, default 0, not null)
      - `opening_balance_date` (date, nullable)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `bank_statements`
      - `id` (uuid, primary key)
      - `company_id` (uuid, indexed, not null)
      - `bank_account_id` (uuid, foreign key -> bank_accounts.id, not null)
      - `period_start` (date, nullable)
      - `period_end` (date, nullable)
      - `source` (text, 'csv'|'manual', not null)
      - `imported_at` (timestamptz, not null)
      - `created_at` (timestamptz)

    - `bank_statement_lines`
      - `id` (uuid, primary key)
      - `company_id` (uuid, indexed, not null)
      - `bank_account_id` (uuid, foreign key -> bank_accounts.id, not null)
      - `statement_id` (uuid, foreign key -> bank_statements.id, not null)
      - `date` (date, not null)
      - `label` (text, not null)
      - `amount_cents` (bigint, signed: credit + / debit -, not null)
      - `currency` (text, default 'EUR', not null)
      - `external_id_hash` (text, not null)
      - `created_at` (timestamptz)
      - CONSTRAINT: unique(company_id, external_id_hash)

    - `bank_reconciliations`
      - `id` (uuid, primary key)
      - `company_id` (uuid, indexed, not null)
      - `bank_statement_line_id` (uuid, unique, foreign key -> bank_statement_lines.id, not null)
      - `match_status` (text, 'matched'|'partial'|'unmatched', default 'unmatched', not null)
      - `note` (text, nullable)
      - `updated_at` (timestamptz, not null)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users filtered by company_id
    - Members can read their company's banking data
    - Only admin/owner can write banking data
*/

CREATE TABLE IF NOT EXISTS bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  opening_balance_cents bigint NOT NULL DEFAULT 0,
  opening_balance_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_company_id ON bank_accounts(company_id);

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view company bank accounts"
  ON bank_accounts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = bank_accounts.company_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert company bank accounts"
  ON bank_accounts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = bank_accounts.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "Admins can update company bank accounts"
  ON bank_accounts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = bank_accounts.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = bank_accounts.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "Admins can delete company bank accounts"
  ON bank_accounts FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = bank_accounts.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('admin', 'owner')
    )
  );

CREATE TABLE IF NOT EXISTS bank_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  bank_account_id uuid NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  period_start date,
  period_end date,
  source text NOT NULL CHECK (source IN ('csv', 'manual')),
  imported_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_statements_company_id ON bank_statements(company_id);
CREATE INDEX IF NOT EXISTS idx_bank_statements_account ON bank_statements(bank_account_id);

ALTER TABLE bank_statements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view company bank statements"
  ON bank_statements FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = bank_statements.company_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert company bank statements"
  ON bank_statements FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = bank_statements.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "Admins can update company bank statements"
  ON bank_statements FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = bank_statements.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = bank_statements.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "Admins can delete company bank statements"
  ON bank_statements FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = bank_statements.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('admin', 'owner')
    )
  );

CREATE TABLE IF NOT EXISTS bank_statement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  bank_account_id uuid NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  statement_id uuid NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
  date date NOT NULL,
  label text NOT NULL,
  amount_cents bigint NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  external_id_hash text NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT unique_company_external_hash UNIQUE (company_id, external_id_hash)
);

CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_company_id ON bank_statement_lines(company_id);
CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_account ON bank_statement_lines(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_statement ON bank_statement_lines(statement_id);
CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_date ON bank_statement_lines(date);

ALTER TABLE bank_statement_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view company bank statement lines"
  ON bank_statement_lines FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = bank_statement_lines.company_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert company bank statement lines"
  ON bank_statement_lines FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = bank_statement_lines.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "Admins can update company bank statement lines"
  ON bank_statement_lines FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = bank_statement_lines.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = bank_statement_lines.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "Admins can delete company bank statement lines"
  ON bank_statement_lines FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = bank_statement_lines.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('admin', 'owner')
    )
  );

CREATE TABLE IF NOT EXISTS bank_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  bank_statement_line_id uuid NOT NULL UNIQUE REFERENCES bank_statement_lines(id) ON DELETE CASCADE,
  match_status text NOT NULL DEFAULT 'unmatched' CHECK (match_status IN ('matched', 'partial', 'unmatched')),
  note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_reconciliations_company_id ON bank_reconciliations(company_id);
CREATE INDEX IF NOT EXISTS idx_bank_reconciliations_line ON bank_reconciliations(bank_statement_line_id);

ALTER TABLE bank_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view company bank reconciliations"
  ON bank_reconciliations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = bank_reconciliations.company_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert company bank reconciliations"
  ON bank_reconciliations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = bank_reconciliations.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "Admins can update company bank reconciliations"
  ON bank_reconciliations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = bank_reconciliations.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = bank_reconciliations.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "Admins can delete company bank reconciliations"
  ON bank_reconciliations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = bank_reconciliations.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('admin', 'owner')
    )
  );
