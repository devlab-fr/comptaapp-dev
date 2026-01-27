/*
  # Création du système comptable professionnel

  1. Nouvelles tables
    - `chart_of_accounts` (Plan comptable)
      - `id` (uuid, primary key)
      - `company_id` (uuid, not null) - Référence à la société
      - `code` (text, not null) - Code du compte (ex: "411000", "512000")
      - `name` (text, not null) - Libellé du compte
      - `type` (text, not null) - Type: actif/passif/charge/produit
      - `is_default` (boolean, default false) - Compte du plan standard
      - `is_active` (boolean, default true) - Compte actif/archivé
      - `created_at` (timestamptz, default now())
      - UNIQUE(company_id, code)

    - `journals` (Journaux)
      - `id` (uuid, primary key)
      - `company_id` (uuid, not null)
      - `code` (text, not null) - Code du journal (ACH/VT/BQ/OD)
      - `name` (text, not null) - Nom du journal
      - `is_active` (boolean, default true)
      - `created_at` (timestamptz, default now())
      - UNIQUE(company_id, code)

    - `third_parties` (Tiers - clients/fournisseurs)
      - `id` (uuid, primary key)
      - `company_id` (uuid, not null)
      - `type` (text, not null) - client/fournisseur
      - `name` (text, not null)
      - `vat_number` (text, nullable)
      - `address` (text, nullable)
      - `is_active` (boolean, default true)
      - `created_at` (timestamptz, default now())

    - `accounting_entries` (Écritures comptables)
      - `id` (uuid, primary key)
      - `company_id` (uuid, not null)
      - `fiscal_year` (int, not null)
      - `journal_id` (uuid, not null)
      - `entry_number` (text, not null) - Numéro auto par journal+exercice
      - `entry_date` (date, not null)
      - `description` (text, not null)
      - `attachment_id` (uuid, nullable) - Référence vers document justificatif
      - `locked` (boolean, default false) - Écriture verrouillée
      - `created_at` (timestamptz, default now())
      - `created_by` (uuid, nullable) - Utilisateur créateur
      - UNIQUE(company_id, journal_id, entry_number)

    - `accounting_lines` (Lignes d'écriture)
      - `id` (uuid, primary key)
      - `entry_id` (uuid, not null)
      - `account_id` (uuid, not null)
      - `label` (text, not null)
      - `debit` (decimal(15,2), default 0)
      - `credit` (decimal(15,2), default 0)
      - `vat_rate` (decimal(5,2), nullable) - Taux de TVA si applicable
      - `third_party_id` (uuid, nullable)
      - `due_date` (date, nullable)
      - `line_order` (int, default 0) - Ordre d'affichage

  2. Sécurité
    - Activer RLS sur toutes les tables
    - Politiques SELECT/INSERT/UPDATE : Membres de l'entreprise uniquement
    - Politique UPDATE sur accounting_entries : Interdite si locked=true

  3. Contraintes métier
    - Validation équilibre débit/crédit via trigger
    - Auto-numérotation des écritures par journal
    - Cascade DELETE pour cohérence référentielle

  4. Notes importantes
    - Les écritures verrouillées ne peuvent plus être modifiées
    - Le plan comptable peut être initialisé avec un plan standard
    - Les journaux standard (ACH/VT/BQ/OD) seront créés automatiquement
*/

-- Table: Plan comptable
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code ~ '^[0-9]+$'),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('actif', 'passif', 'charge', 'produit')),
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(company_id, code)
);

-- Table: Journaux
CREATE TABLE IF NOT EXISTS journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code ~ '^[A-Z]+$'),
  name text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(company_id, code)
);

-- Table: Tiers
CREATE TABLE IF NOT EXISTS third_parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('client', 'fournisseur')),
  name text NOT NULL,
  vat_number text,
  address text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Table: Écritures comptables
CREATE TABLE IF NOT EXISTS accounting_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  fiscal_year int NOT NULL CHECK (fiscal_year >= 2000),
  journal_id uuid NOT NULL REFERENCES journals(id) ON DELETE RESTRICT,
  entry_number text NOT NULL,
  entry_date date NOT NULL,
  description text NOT NULL,
  attachment_id uuid,
  locked boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE(company_id, journal_id, entry_number)
);

-- Table: Lignes d'écriture
CREATE TABLE IF NOT EXISTS accounting_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES accounting_entries(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  label text NOT NULL,
  debit decimal(15,2) DEFAULT 0 CHECK (debit >= 0),
  credit decimal(15,2) DEFAULT 0 CHECK (credit >= 0),
  vat_rate decimal(5,2) CHECK (vat_rate >= 0 AND vat_rate <= 100),
  third_party_id uuid REFERENCES third_parties(id) ON DELETE SET NULL,
  due_date date,
  line_order int DEFAULT 0,
  CHECK (NOT (debit > 0 AND credit > 0))
);

-- Index pour performances
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_company 
  ON chart_of_accounts(company_id, code);

CREATE INDEX IF NOT EXISTS idx_journals_company 
  ON journals(company_id);

CREATE INDEX IF NOT EXISTS idx_third_parties_company 
  ON third_parties(company_id, type);

CREATE INDEX IF NOT EXISTS idx_accounting_entries_company_year 
  ON accounting_entries(company_id, fiscal_year DESC, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_accounting_lines_entry 
  ON accounting_lines(entry_id, line_order);

CREATE INDEX IF NOT EXISTS idx_accounting_lines_account 
  ON accounting_lines(account_id);

-- Activer RLS sur toutes les tables
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE third_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_lines ENABLE ROW LEVEL SECURITY;

-- Politiques RLS pour chart_of_accounts
CREATE POLICY "Members can view company chart of accounts"
  ON chart_of_accounts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = chart_of_accounts.company_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can create company accounts"
  ON chart_of_accounts FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = chart_of_accounts.company_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can update company accounts"
  ON chart_of_accounts FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = chart_of_accounts.company_id
      AND memberships.user_id = auth.uid()
    )
  );

-- Politiques RLS pour journals
CREATE POLICY "Members can view company journals"
  ON journals FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = journals.company_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can create company journals"
  ON journals FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = journals.company_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can update company journals"
  ON journals FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = journals.company_id
      AND memberships.user_id = auth.uid()
    )
  );

-- Politiques RLS pour third_parties
CREATE POLICY "Members can view company third parties"
  ON third_parties FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = third_parties.company_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can create company third parties"
  ON third_parties FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = third_parties.company_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can update company third parties"
  ON third_parties FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = third_parties.company_id
      AND memberships.user_id = auth.uid()
    )
  );

-- Politiques RLS pour accounting_entries
CREATE POLICY "Members can view company entries"
  ON accounting_entries FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = accounting_entries.company_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can create company entries"
  ON accounting_entries FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = accounting_entries.company_id
      AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can update unlocked entries"
  ON accounting_entries FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.company_id = accounting_entries.company_id
      AND memberships.user_id = auth.uid()
    )
    AND locked = false
  );

CREATE POLICY "Members can delete unlocked entries"
  ON accounting_entries FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      JOIN accounting_entries ae ON ae.company_id = m.company_id
      WHERE ae.id = accounting_entries.id
      AND m.user_id = auth.uid()
    )
    AND locked = false
  );

-- Politiques RLS pour accounting_lines
CREATE POLICY "Members can view entry lines"
  ON accounting_lines FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM accounting_entries ae
      JOIN memberships m ON m.company_id = ae.company_id
      WHERE ae.id = accounting_lines.entry_id
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can create entry lines"
  ON accounting_lines FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM accounting_entries ae
      JOIN memberships m ON m.company_id = ae.company_id
      WHERE ae.id = accounting_lines.entry_id
      AND m.user_id = auth.uid()
      AND ae.locked = false
    )
  );

CREATE POLICY "Members can update unlocked entry lines"
  ON accounting_lines FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM accounting_entries ae
      JOIN memberships m ON m.company_id = ae.company_id
      WHERE ae.id = accounting_lines.entry_id
      AND m.user_id = auth.uid()
      AND ae.locked = false
    )
  );

CREATE POLICY "Members can delete unlocked entry lines"
  ON accounting_lines FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM accounting_entries ae
      JOIN memberships m ON m.company_id = ae.company_id
      WHERE ae.id = accounting_lines.entry_id
      AND m.user_id = auth.uid()
      AND ae.locked = false
    )
  );

-- Fonction pour valider l'équilibre d'une écriture
CREATE OR REPLACE FUNCTION check_entry_balance()
RETURNS TRIGGER AS $$
DECLARE
  total_debit decimal(15,2);
  total_credit decimal(15,2);
BEGIN
  SELECT 
    COALESCE(SUM(debit), 0),
    COALESCE(SUM(credit), 0)
  INTO total_debit, total_credit
  FROM accounting_lines
  WHERE entry_id = COALESCE(NEW.entry_id, OLD.entry_id);

  IF total_debit != total_credit THEN
    RAISE EXCEPTION 'Écriture déséquilibrée: débit=% crédit=%', total_debit, total_credit;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour valider l'équilibre après INSERT/UPDATE/DELETE de lignes
CREATE TRIGGER validate_entry_balance_after_line_change
  AFTER INSERT OR UPDATE OR DELETE ON accounting_lines
  FOR EACH ROW
  EXECUTE FUNCTION check_entry_balance();

-- Fonction pour générer le numéro d'écriture automatiquement
CREATE OR REPLACE FUNCTION generate_entry_number()
RETURNS TRIGGER AS $$
DECLARE
  journal_code text;
  next_num int;
BEGIN
  IF NEW.entry_number IS NOT NULL AND NEW.entry_number != '' THEN
    RETURN NEW;
  END IF;

  SELECT code INTO journal_code FROM journals WHERE id = NEW.journal_id;

  SELECT COALESCE(MAX(CAST(SUBSTRING(entry_number FROM '[0-9]+$') AS int)), 0) + 1
  INTO next_num
  FROM accounting_entries
  WHERE company_id = NEW.company_id
    AND journal_id = NEW.journal_id
    AND fiscal_year = NEW.fiscal_year;

  NEW.entry_number := journal_code || '-' || NEW.fiscal_year || '-' || LPAD(next_num::text, 5, '0');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour auto-numérotation
CREATE TRIGGER auto_generate_entry_number
  BEFORE INSERT ON accounting_entries
  FOR EACH ROW
  EXECUTE FUNCTION generate_entry_number();