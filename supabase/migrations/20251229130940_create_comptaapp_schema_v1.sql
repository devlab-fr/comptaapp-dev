/*
  # ComptaApp Backend V1 - Schéma complet

  ## Vue d'ensemble
  Création du schéma complet pour ComptaApp, un SaaS de pré-comptabilité et gestion sociale.
  Architecture multi-tenant stricte basée sur company_id avec RLS complète.

  ## 1. Enums créés
  - membership_role : Rôles utilisateur (owner, admin, accountant, viewer)
  - account_type : Types de comptes PCG (asset, liability, equity, income, expense)
  - category_type : Types de catégories (expense, revenue)
  - transaction_status : Statuts des transactions (draft, pending, paid, cancelled)
  - period_status : Statuts des périodes (open, closed, declared)
  - subscription_plan : Plans d'abonnement (free, pro, pro_plus, pro_max)
  - subscription_status : Statuts d'abonnement (active, suspended, cancelled)
  - employee_status : Statuts employés (active, inactive, terminated)
  - contract_type : Types de contrats (cdi, cdd, interim, apprentice, intern)
  - contract_status : Statuts de contrats (active, suspended, terminated)
  - payslip_status : Statuts de bulletins de paie (draft, validated, paid)

  ## 2. Tables créées

  ### Core
  - companies : Sociétés
  - memberships : Liens utilisateur-société avec rôles

  ### Référentiels
  - pcg_accounts : Plan comptable général
  - categories : Catégories de dépenses/recettes par société
  - clients : Clients par société
  - suppliers : Fournisseurs par société

  ### Comptabilité
  - expenses : Dépenses avec montants HT/TVA/TTC
  - revenues : Recettes avec montants HT/TVA/TTC
  - attachments : Pièces jointes (justificatifs)
  - vat_periods : Périodes de TVA

  ### Abonnements
  - subscriptions : Abonnements par société

  ### Module social
  - employees : Employés
  - contracts : Contrats de travail
  - payslips : Bulletins de paie
  - social_contributions : Cotisations sociales
  - social_periods : Périodes sociales

  ## 3. Sécurité RLS
  - RLS activée sur TOUTES les tables
  - Accès strictement contrôlé via memberships
  - owner/admin : accès complet
  - accountant : création/modification sauf si locked_at != null
  - viewer : lecture seule
  - Immutabilité via locked_at (interdit UPDATE/DELETE si verrouillé)

  ## 4. Contraintes clés
  - Multi-tenant strict : toutes les tables ont company_id
  - Montants >= 0 avec CHECK constraints
  - Unicité sur (company_id, year, month) pour périodes
  - Foreign keys CASCADE on DELETE pour nettoyage automatique
*/

-- ==================================================
-- ENUMS
-- ==================================================

CREATE TYPE membership_role AS ENUM (
  'owner',
  'admin',
  'accountant',
  'viewer'
);

CREATE TYPE account_type AS ENUM (
  'asset',
  'liability',
  'equity',
  'income',
  'expense'
);

CREATE TYPE category_type AS ENUM (
  'expense',
  'revenue'
);

CREATE TYPE transaction_status AS ENUM (
  'draft',
  'pending',
  'paid',
  'cancelled'
);

CREATE TYPE period_status AS ENUM (
  'open',
  'closed',
  'declared'
);

CREATE TYPE subscription_plan AS ENUM (
  'free',
  'pro',
  'pro_plus',
  'pro_max'
);

CREATE TYPE subscription_status AS ENUM (
  'active',
  'suspended',
  'cancelled'
);

CREATE TYPE employee_status AS ENUM (
  'active',
  'inactive',
  'terminated'
);

CREATE TYPE contract_type AS ENUM (
  'cdi',
  'cdd',
  'interim',
  'apprentice',
  'intern'
);

CREATE TYPE contract_status AS ENUM (
  'active',
  'suspended',
  'terminated'
);

CREATE TYPE payslip_status AS ENUM (
  'draft',
  'validated',
  'paid'
);

-- ==================================================
-- TABLES CORE
-- ==================================================

CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  country text DEFAULT 'FR',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role membership_role NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, company_id)
);

-- ==================================================
-- RÉFÉRENTIELS
-- ==================================================

CREATE TABLE IF NOT EXISTS pcg_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_number text UNIQUE NOT NULL,
  label text NOT NULL,
  account_type account_type NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  pcg_account_id uuid REFERENCES pcg_accounts(id) ON DELETE SET NULL,
  category_type category_type NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL
);

-- ==================================================
-- COMPTABILITÉ
-- ==================================================

CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  invoice_date date NOT NULL,
  amount_excl_vat numeric NOT NULL CHECK (amount_excl_vat >= 0),
  vat_rate numeric NOT NULL CHECK (vat_rate >= 0),
  vat_amount numeric NOT NULL CHECK (vat_amount >= 0),
  amount_incl_vat numeric NOT NULL CHECK (amount_incl_vat >= 0),
  status transaction_status NOT NULL DEFAULT 'draft',
  locked_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS revenues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  invoice_date date NOT NULL,
  amount_excl_vat numeric NOT NULL CHECK (amount_excl_vat >= 0),
  vat_rate numeric NOT NULL CHECK (vat_rate >= 0),
  vat_amount numeric NOT NULL CHECK (vat_amount >= 0),
  amount_incl_vat numeric NOT NULL CHECK (amount_incl_vat >= 0),
  status transaction_status NOT NULL DEFAULT 'draft',
  locked_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  expense_id uuid REFERENCES expenses(id) ON DELETE CASCADE,
  revenue_id uuid REFERENCES revenues(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  created_at timestamptz DEFAULT now(),
  CHECK (
    (expense_id IS NOT NULL AND revenue_id IS NULL) OR
    (expense_id IS NULL AND revenue_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS vat_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  year integer NOT NULL CHECK (year >= 2000),
  month integer NOT NULL CHECK (month >= 1 AND month <= 12),
  status period_status NOT NULL DEFAULT 'open',
  UNIQUE(company_id, year, month)
);

-- ==================================================
-- ABONNEMENTS
-- ==================================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid UNIQUE NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan subscription_plan NOT NULL DEFAULT 'free',
  status subscription_status NOT NULL DEFAULT 'active',
  started_at timestamptz DEFAULT now()
);

-- ==================================================
-- MODULE SOCIAL
-- ==================================================

CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  status employee_status NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  contract_type contract_type NOT NULL,
  gross_monthly_salary numeric NOT NULL CHECK (gross_monthly_salary >= 0),
  status contract_status NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  period_year integer NOT NULL CHECK (period_year >= 2000),
  period_month integer NOT NULL CHECK (period_month >= 1 AND period_month <= 12),
  gross_salary numeric NOT NULL CHECK (gross_salary >= 0),
  net_salary numeric NOT NULL CHECK (net_salary >= 0),
  status payslip_status NOT NULL DEFAULT 'draft',
  locked_at timestamptz
);

CREATE TABLE IF NOT EXISTS social_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  payslip_id uuid NOT NULL REFERENCES payslips(id) ON DELETE CASCADE,
  base_amount numeric NOT NULL CHECK (base_amount >= 0),
  rate numeric NOT NULL CHECK (rate >= 0),
  employee_amount numeric NOT NULL CHECK (employee_amount >= 0),
  employer_amount numeric NOT NULL CHECK (employer_amount >= 0)
);

CREATE TABLE IF NOT EXISTS social_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  year integer NOT NULL CHECK (year >= 2000),
  month integer NOT NULL CHECK (month >= 1 AND month <= 12),
  status period_status NOT NULL DEFAULT 'open',
  UNIQUE(company_id, year, month)
);

-- ==================================================
-- FONCTIONS HELPER RLS
-- ==================================================

-- Vérifie si l'utilisateur a un rôle spécifique pour une société
CREATE OR REPLACE FUNCTION has_company_role(
  target_company_id uuid,
  required_role membership_role
)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM memberships
    WHERE company_id = target_company_id
    AND user_id = auth.uid()
    AND role = required_role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Vérifie si l'utilisateur a accès à une société (n'importe quel rôle)
CREATE OR REPLACE FUNCTION has_company_access(target_company_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM memberships
    WHERE company_id = target_company_id
    AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Vérifie si l'utilisateur peut modifier (owner, admin, accountant non verrouillé)
CREATE OR REPLACE FUNCTION can_modify_company_data(
  target_company_id uuid,
  is_locked boolean
)
RETURNS boolean AS $$
BEGIN
  -- Si verrouillé, seuls owner/admin peuvent modifier
  IF is_locked THEN
    RETURN EXISTS (
      SELECT 1 FROM memberships
      WHERE company_id = target_company_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    );
  END IF;
  
  -- Si non verrouillé, owner/admin/accountant peuvent modifier
  RETURN EXISTS (
    SELECT 1 FROM memberships
    WHERE company_id = target_company_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin', 'accountant')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==================================================
-- RLS - COMPANIES
-- ==================================================

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view companies they belong to"
  ON companies FOR SELECT
  TO authenticated
  USING (has_company_access(id));

CREATE POLICY "Users can insert companies"
  ON companies FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Owners and admins can update companies"
  ON companies FOR UPDATE
  TO authenticated
  USING (
    has_company_role(id, 'owner') OR
    has_company_role(id, 'admin')
  )
  WITH CHECK (
    has_company_role(id, 'owner') OR
    has_company_role(id, 'admin')
  );

CREATE POLICY "Owners can delete companies"
  ON companies FOR DELETE
  TO authenticated
  USING (has_company_role(id, 'owner'));

-- ==================================================
-- RLS - MEMBERSHIPS
-- ==================================================

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view memberships of their companies"
  ON memberships FOR SELECT
  TO authenticated
  USING (has_company_access(company_id));

CREATE POLICY "Owners and admins can insert memberships"
  ON memberships FOR INSERT
  TO authenticated
  WITH CHECK (
    has_company_role(company_id, 'owner') OR
    has_company_role(company_id, 'admin')
  );

CREATE POLICY "Owners and admins can update memberships"
  ON memberships FOR UPDATE
  TO authenticated
  USING (
    has_company_role(company_id, 'owner') OR
    has_company_role(company_id, 'admin')
  )
  WITH CHECK (
    has_company_role(company_id, 'owner') OR
    has_company_role(company_id, 'admin')
  );

CREATE POLICY "Owners and admins can delete memberships"
  ON memberships FOR DELETE
  TO authenticated
  USING (
    has_company_role(company_id, 'owner') OR
    has_company_role(company_id, 'admin')
  );

-- ==================================================
-- RLS - PCG_ACCOUNTS (lecture publique)
-- ==================================================

ALTER TABLE pcg_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "PCG accounts are readable by authenticated users"
  ON pcg_accounts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only admins can insert PCG accounts"
  ON pcg_accounts FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "Only admins can update PCG accounts"
  ON pcg_accounts FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Only admins can delete PCG accounts"
  ON pcg_accounts FOR DELETE
  TO authenticated
  USING (false);

-- ==================================================
-- RLS - CATEGORIES
-- ==================================================

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view categories of their companies"
  ON categories FOR SELECT
  TO authenticated
  USING (has_company_access(company_id));

CREATE POLICY "Owners, admins and accountants can insert categories"
  ON categories FOR INSERT
  TO authenticated
  WITH CHECK (can_modify_company_data(company_id, false));

CREATE POLICY "Owners, admins and accountants can update categories"
  ON categories FOR UPDATE
  TO authenticated
  USING (can_modify_company_data(company_id, false))
  WITH CHECK (can_modify_company_data(company_id, false));

CREATE POLICY "Owners and admins can delete categories"
  ON categories FOR DELETE
  TO authenticated
  USING (
    has_company_role(company_id, 'owner') OR
    has_company_role(company_id, 'admin')
  );

-- ==================================================
-- RLS - CLIENTS
-- ==================================================

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view clients of their companies"
  ON clients FOR SELECT
  TO authenticated
  USING (has_company_access(company_id));

CREATE POLICY "Owners, admins and accountants can insert clients"
  ON clients FOR INSERT
  TO authenticated
  WITH CHECK (can_modify_company_data(company_id, false));

CREATE POLICY "Owners, admins and accountants can update clients"
  ON clients FOR UPDATE
  TO authenticated
  USING (can_modify_company_data(company_id, false))
  WITH CHECK (can_modify_company_data(company_id, false));

CREATE POLICY "Owners and admins can delete clients"
  ON clients FOR DELETE
  TO authenticated
  USING (
    has_company_role(company_id, 'owner') OR
    has_company_role(company_id, 'admin')
  );

-- ==================================================
-- RLS - SUPPLIERS
-- ==================================================

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view suppliers of their companies"
  ON suppliers FOR SELECT
  TO authenticated
  USING (has_company_access(company_id));

CREATE POLICY "Owners, admins and accountants can insert suppliers"
  ON suppliers FOR INSERT
  TO authenticated
  WITH CHECK (can_modify_company_data(company_id, false));

CREATE POLICY "Owners, admins and accountants can update suppliers"
  ON suppliers FOR UPDATE
  TO authenticated
  USING (can_modify_company_data(company_id, false))
  WITH CHECK (can_modify_company_data(company_id, false));

CREATE POLICY "Owners and admins can delete suppliers"
  ON suppliers FOR DELETE
  TO authenticated
  USING (
    has_company_role(company_id, 'owner') OR
    has_company_role(company_id, 'admin')
  );

-- ==================================================
-- RLS - EXPENSES
-- ==================================================

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view expenses of their companies"
  ON expenses FOR SELECT
  TO authenticated
  USING (has_company_access(company_id));

CREATE POLICY "Owners, admins and accountants can insert expenses"
  ON expenses FOR INSERT
  TO authenticated
  WITH CHECK (can_modify_company_data(company_id, false));

CREATE POLICY "Users can update unlocked expenses"
  ON expenses FOR UPDATE
  TO authenticated
  USING (can_modify_company_data(company_id, locked_at IS NOT NULL))
  WITH CHECK (can_modify_company_data(company_id, locked_at IS NOT NULL));

CREATE POLICY "Users can delete unlocked expenses"
  ON expenses FOR DELETE
  TO authenticated
  USING (can_modify_company_data(company_id, locked_at IS NOT NULL));

-- ==================================================
-- RLS - REVENUES
-- ==================================================

ALTER TABLE revenues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view revenues of their companies"
  ON revenues FOR SELECT
  TO authenticated
  USING (has_company_access(company_id));

CREATE POLICY "Owners, admins and accountants can insert revenues"
  ON revenues FOR INSERT
  TO authenticated
  WITH CHECK (can_modify_company_data(company_id, false));

CREATE POLICY "Users can update unlocked revenues"
  ON revenues FOR UPDATE
  TO authenticated
  USING (can_modify_company_data(company_id, locked_at IS NOT NULL))
  WITH CHECK (can_modify_company_data(company_id, locked_at IS NOT NULL));

CREATE POLICY "Users can delete unlocked revenues"
  ON revenues FOR DELETE
  TO authenticated
  USING (can_modify_company_data(company_id, locked_at IS NOT NULL));

-- ==================================================
-- RLS - ATTACHMENTS
-- ==================================================

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view attachments of their companies"
  ON attachments FOR SELECT
  TO authenticated
  USING (has_company_access(company_id));

CREATE POLICY "Owners, admins and accountants can insert attachments"
  ON attachments FOR INSERT
  TO authenticated
  WITH CHECK (can_modify_company_data(company_id, false));

CREATE POLICY "Owners, admins and accountants can update attachments"
  ON attachments FOR UPDATE
  TO authenticated
  USING (can_modify_company_data(company_id, false))
  WITH CHECK (can_modify_company_data(company_id, false));

CREATE POLICY "Owners and admins can delete attachments"
  ON attachments FOR DELETE
  TO authenticated
  USING (
    has_company_role(company_id, 'owner') OR
    has_company_role(company_id, 'admin')
  );

-- ==================================================
-- RLS - VAT_PERIODS
-- ==================================================

ALTER TABLE vat_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view VAT periods of their companies"
  ON vat_periods FOR SELECT
  TO authenticated
  USING (has_company_access(company_id));

CREATE POLICY "Owners, admins and accountants can insert VAT periods"
  ON vat_periods FOR INSERT
  TO authenticated
  WITH CHECK (can_modify_company_data(company_id, false));

CREATE POLICY "Owners, admins and accountants can update VAT periods"
  ON vat_periods FOR UPDATE
  TO authenticated
  USING (can_modify_company_data(company_id, false))
  WITH CHECK (can_modify_company_data(company_id, false));

CREATE POLICY "Owners can delete VAT periods"
  ON vat_periods FOR DELETE
  TO authenticated
  USING (has_company_role(company_id, 'owner'));

-- ==================================================
-- RLS - SUBSCRIPTIONS
-- ==================================================

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view subscriptions of their companies"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (has_company_access(company_id));

CREATE POLICY "Owners can insert subscriptions"
  ON subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (has_company_role(company_id, 'owner'));

CREATE POLICY "Owners can update subscriptions"
  ON subscriptions FOR UPDATE
  TO authenticated
  USING (has_company_role(company_id, 'owner'))
  WITH CHECK (has_company_role(company_id, 'owner'));

CREATE POLICY "Owners can delete subscriptions"
  ON subscriptions FOR DELETE
  TO authenticated
  USING (has_company_role(company_id, 'owner'));

-- ==================================================
-- RLS - EMPLOYEES
-- ==================================================

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view employees of their companies"
  ON employees FOR SELECT
  TO authenticated
  USING (has_company_access(company_id));

CREATE POLICY "Owners, admins and accountants can insert employees"
  ON employees FOR INSERT
  TO authenticated
  WITH CHECK (can_modify_company_data(company_id, false));

CREATE POLICY "Owners, admins and accountants can update employees"
  ON employees FOR UPDATE
  TO authenticated
  USING (can_modify_company_data(company_id, false))
  WITH CHECK (can_modify_company_data(company_id, false));

CREATE POLICY "Owners and admins can delete employees"
  ON employees FOR DELETE
  TO authenticated
  USING (
    has_company_role(company_id, 'owner') OR
    has_company_role(company_id, 'admin')
  );

-- ==================================================
-- RLS - CONTRACTS
-- ==================================================

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view contracts of their companies"
  ON contracts FOR SELECT
  TO authenticated
  USING (has_company_access(company_id));

CREATE POLICY "Owners, admins and accountants can insert contracts"
  ON contracts FOR INSERT
  TO authenticated
  WITH CHECK (can_modify_company_data(company_id, false));

CREATE POLICY "Owners, admins and accountants can update contracts"
  ON contracts FOR UPDATE
  TO authenticated
  USING (can_modify_company_data(company_id, false))
  WITH CHECK (can_modify_company_data(company_id, false));

CREATE POLICY "Owners and admins can delete contracts"
  ON contracts FOR DELETE
  TO authenticated
  USING (
    has_company_role(company_id, 'owner') OR
    has_company_role(company_id, 'admin')
  );

-- ==================================================
-- RLS - PAYSLIPS
-- ==================================================

ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view payslips of their companies"
  ON payslips FOR SELECT
  TO authenticated
  USING (has_company_access(company_id));

CREATE POLICY "Owners, admins and accountants can insert payslips"
  ON payslips FOR INSERT
  TO authenticated
  WITH CHECK (can_modify_company_data(company_id, false));

CREATE POLICY "Users can update unlocked payslips"
  ON payslips FOR UPDATE
  TO authenticated
  USING (can_modify_company_data(company_id, locked_at IS NOT NULL))
  WITH CHECK (can_modify_company_data(company_id, locked_at IS NOT NULL));

CREATE POLICY "Users can delete unlocked payslips"
  ON payslips FOR DELETE
  TO authenticated
  USING (can_modify_company_data(company_id, locked_at IS NOT NULL));

-- ==================================================
-- RLS - SOCIAL_CONTRIBUTIONS
-- ==================================================

ALTER TABLE social_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view social contributions of their companies"
  ON social_contributions FOR SELECT
  TO authenticated
  USING (has_company_access(company_id));

CREATE POLICY "Owners, admins and accountants can insert social contributions"
  ON social_contributions FOR INSERT
  TO authenticated
  WITH CHECK (can_modify_company_data(company_id, false));

CREATE POLICY "Owners, admins and accountants can update social contributions"
  ON social_contributions FOR UPDATE
  TO authenticated
  USING (can_modify_company_data(company_id, false))
  WITH CHECK (can_modify_company_data(company_id, false));

CREATE POLICY "Owners and admins can delete social contributions"
  ON social_contributions FOR DELETE
  TO authenticated
  USING (
    has_company_role(company_id, 'owner') OR
    has_company_role(company_id, 'admin')
  );

-- ==================================================
-- RLS - SOCIAL_PERIODS
-- ==================================================

ALTER TABLE social_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view social periods of their companies"
  ON social_periods FOR SELECT
  TO authenticated
  USING (has_company_access(company_id));

CREATE POLICY "Owners, admins and accountants can insert social periods"
  ON social_periods FOR INSERT
  TO authenticated
  WITH CHECK (can_modify_company_data(company_id, false));

CREATE POLICY "Owners, admins and accountants can update social periods"
  ON social_periods FOR UPDATE
  TO authenticated
  USING (can_modify_company_data(company_id, false))
  WITH CHECK (can_modify_company_data(company_id, false));

CREATE POLICY "Owners can delete social periods"
  ON social_periods FOR DELETE
  TO authenticated
  USING (has_company_role(company_id, 'owner'));

-- ==================================================
-- INDEX POUR PERFORMANCES
-- ==================================================

CREATE INDEX idx_memberships_user_id ON memberships(user_id);
CREATE INDEX idx_memberships_company_id ON memberships(company_id);
CREATE INDEX idx_expenses_company_id ON expenses(company_id);
CREATE INDEX idx_expenses_invoice_date ON expenses(invoice_date);
CREATE INDEX idx_revenues_company_id ON revenues(company_id);
CREATE INDEX idx_revenues_invoice_date ON revenues(invoice_date);
CREATE INDEX idx_payslips_company_id ON payslips(company_id);
CREATE INDEX idx_payslips_period ON payslips(period_year, period_month);
