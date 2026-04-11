/*
  # Ajout lien Banque → Comptabilité (Phase 1)

  1. Tables bancaires
    - Création si nécessaire (idempotent)

  2. Modification
    - Ajout colonne `linked_accounting_entry_id` dans `bank_statement_lines`
      - Permet de lier une transaction bancaire à une écriture comptable
      - ON DELETE SET NULL : si écriture supprimée, le lien est cassé mais la ligne bancaire reste

  3. Performance
    - Index sur `linked_accounting_entry_id` pour accélérer les JOINs

  4. Sécurité
    - Aucune nouvelle politique RLS nécessaire (héritage automatique)
    - La colonne est nullable : compatibilité avec données existantes
*/

-- Création tables bancaires si nécessaire
CREATE TABLE IF NOT EXISTS bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  opening_balance_cents bigint NOT NULL DEFAULT 0,
  opening_balance_date date,
  start_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_company_id ON bank_accounts(company_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bank_accounts' AND policyname = 'Members can view company bank accounts') THEN
    ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY "Members can view company bank accounts"
      ON bank_accounts FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM memberships WHERE memberships.company_id = bank_accounts.company_id AND memberships.user_id = auth.uid()));
    
    CREATE POLICY "Admins can insert company bank accounts"
      ON bank_accounts FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM memberships WHERE memberships.company_id = bank_accounts.company_id AND memberships.user_id = auth.uid() AND memberships.role IN ('admin', 'owner')));
    
    CREATE POLICY "Admins can update company bank accounts"
      ON bank_accounts FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM memberships WHERE memberships.company_id = bank_accounts.company_id AND memberships.user_id = auth.uid() AND memberships.role IN ('admin', 'owner')))
      WITH CHECK (EXISTS (SELECT 1 FROM memberships WHERE memberships.company_id = bank_accounts.company_id AND memberships.user_id = auth.uid() AND memberships.role IN ('admin', 'owner')));
    
    CREATE POLICY "Admins can delete company bank accounts"
      ON bank_accounts FOR DELETE TO authenticated
      USING (EXISTS (SELECT 1 FROM memberships WHERE memberships.company_id = bank_accounts.company_id AND memberships.user_id = auth.uid() AND memberships.role IN ('admin', 'owner')));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS bank_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bank_account_id uuid NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  period_start date,
  period_end date,
  source text NOT NULL CHECK (source IN ('csv', 'manual')),
  imported_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_statements_company_id ON bank_statements(company_id);
CREATE INDEX IF NOT EXISTS idx_bank_statements_account ON bank_statements(bank_account_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bank_statements' AND policyname = 'Members can view company bank statements') THEN
    ALTER TABLE bank_statements ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY "Members can view company bank statements"
      ON bank_statements FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM memberships WHERE memberships.company_id = bank_statements.company_id AND memberships.user_id = auth.uid()));
    
    CREATE POLICY "Admins can insert company bank statements"
      ON bank_statements FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM memberships WHERE memberships.company_id = bank_statements.company_id AND memberships.user_id = auth.uid() AND memberships.role IN ('admin', 'owner')));
    
    CREATE POLICY "Admins can update company bank statements"
      ON bank_statements FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM memberships WHERE memberships.company_id = bank_statements.company_id AND memberships.user_id = auth.uid() AND memberships.role IN ('admin', 'owner')))
      WITH CHECK (EXISTS (SELECT 1 FROM memberships WHERE memberships.company_id = bank_statements.company_id AND memberships.user_id = auth.uid() AND memberships.role IN ('admin', 'owner')));
    
    CREATE POLICY "Admins can delete company bank statements"
      ON bank_statements FOR DELETE TO authenticated
      USING (EXISTS (SELECT 1 FROM memberships WHERE memberships.company_id = bank_statements.company_id AND memberships.user_id = auth.uid() AND memberships.role IN ('admin', 'owner')));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS bank_statement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bank_statement_lines' AND policyname = 'Members can view company bank statement lines') THEN
    ALTER TABLE bank_statement_lines ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY "Members can view company bank statement lines"
      ON bank_statement_lines FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM memberships WHERE memberships.company_id = bank_statement_lines.company_id AND memberships.user_id = auth.uid()));
    
    CREATE POLICY "Admins can insert company bank statement lines"
      ON bank_statement_lines FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM memberships WHERE memberships.company_id = bank_statement_lines.company_id AND memberships.user_id = auth.uid() AND memberships.role IN ('admin', 'owner')));
    
    CREATE POLICY "Admins can update company bank statement lines"
      ON bank_statement_lines FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM memberships WHERE memberships.company_id = bank_statement_lines.company_id AND memberships.user_id = auth.uid() AND memberships.role IN ('admin', 'owner')))
      WITH CHECK (EXISTS (SELECT 1 FROM memberships WHERE memberships.company_id = bank_statement_lines.company_id AND memberships.user_id = auth.uid() AND memberships.role IN ('admin', 'owner')));
    
    CREATE POLICY "Admins can delete company bank statement lines"
      ON bank_statement_lines FOR DELETE TO authenticated
      USING (EXISTS (SELECT 1 FROM memberships WHERE memberships.company_id = bank_statement_lines.company_id AND memberships.user_id = auth.uid() AND memberships.role IN ('admin', 'owner')));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS bank_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bank_statement_line_id uuid NOT NULL UNIQUE REFERENCES bank_statement_lines(id) ON DELETE CASCADE,
  match_status text NOT NULL DEFAULT 'unmatched' CHECK (match_status IN ('matched', 'partial', 'unmatched')),
  note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_reconciliations_company_id ON bank_reconciliations(company_id);
CREATE INDEX IF NOT EXISTS idx_bank_reconciliations_line ON bank_reconciliations(bank_statement_line_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bank_reconciliations' AND policyname = 'Members can view company bank reconciliations') THEN
    ALTER TABLE bank_reconciliations ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY "Members can view company bank reconciliations"
      ON bank_reconciliations FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM memberships WHERE memberships.company_id = bank_reconciliations.company_id AND memberships.user_id = auth.uid()));
    
    CREATE POLICY "Admins can insert company bank reconciliations"
      ON bank_reconciliations FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM memberships WHERE memberships.company_id = bank_reconciliations.company_id AND memberships.user_id = auth.uid() AND memberships.role IN ('admin', 'owner')));
    
    CREATE POLICY "Admins can update company bank reconciliations"
      ON bank_reconciliations FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM memberships WHERE memberships.company_id = bank_reconciliations.company_id AND memberships.user_id = auth.uid() AND memberships.role IN ('admin', 'owner')))
      WITH CHECK (EXISTS (SELECT 1 FROM memberships WHERE memberships.company_id = bank_reconciliations.company_id AND memberships.user_id = auth.uid() AND memberships.role IN ('admin', 'owner')));
    
    CREATE POLICY "Admins can delete company bank reconciliations"
      ON bank_reconciliations FOR DELETE TO authenticated
      USING (EXISTS (SELECT 1 FROM memberships WHERE memberships.company_id = bank_reconciliations.company_id AND memberships.user_id = auth.uid() AND memberships.role IN ('admin', 'owner')));
  END IF;
END $$;

-- Ajout colonne de liaison comptable
ALTER TABLE bank_statement_lines
ADD COLUMN IF NOT EXISTS linked_accounting_entry_id uuid
REFERENCES accounting_entries(id) ON DELETE SET NULL;

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_bank_lines_linked_entry
ON bank_statement_lines(linked_accounting_entry_id);

-- Commentaire documentation
COMMENT ON COLUMN bank_statement_lines.linked_accounting_entry_id IS
'Référence vers l''écriture comptable associée (lien manuel créé par l''utilisateur)';
