/*
  # Ajouter vérification abonnement aux policies RLS du module Banque

  1. Objectif
    - Restreindre l'accès au module Banque aux plans PRO_PLUS et PRO_PLUS_PLUS uniquement
    - Appliquer la restriction sur toutes les opérations (SELECT, INSERT, UPDATE, DELETE)

  2. Tables modifiées
    - `bank_accounts`
    - `bank_statements`
    - `bank_statement_lines`
    - `bank_reconciliations`

  3. Changements
    - Suppression des anciennes policies qui ne vérifiaient que membership + role
    - Création de nouvelles policies avec vérification du plan d'abonnement
    - Condition ajoutée : plan_tier IN ('PRO_PLUS', 'PRO_PLUS_PLUS')

  4. Impact
    - Les utilisateurs FREE et PRO ne pourront plus accéder au module Banque
    - Les utilisateurs PRO_PLUS et PRO_PLUS_PLUS conservent l'accès complet
*/

-- ============================================================
-- BANK_ACCOUNTS
-- ============================================================

DROP POLICY IF EXISTS "Members can view company bank accounts" ON bank_accounts;
DROP POLICY IF EXISTS "Admins can insert company bank accounts" ON bank_accounts;
DROP POLICY IF EXISTS "Admins can update company bank accounts" ON bank_accounts;
DROP POLICY IF EXISTS "Admins can delete company bank accounts" ON bank_accounts;

CREATE POLICY "PRO_PLUS+ can view company bank accounts"
  ON bank_accounts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      JOIN company_subscriptions cs ON cs.company_id = m.company_id
      WHERE m.company_id = bank_accounts.company_id
      AND m.user_id = auth.uid()
      AND cs.plan_tier IN ('PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  );

CREATE POLICY "PRO_PLUS+ admins can insert company bank accounts"
  ON bank_accounts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships m
      JOIN company_subscriptions cs ON cs.company_id = m.company_id
      WHERE m.company_id = bank_accounts.company_id
      AND m.user_id = auth.uid()
      AND m.role IN ('admin', 'owner')
      AND cs.plan_tier IN ('PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  );

CREATE POLICY "PRO_PLUS+ admins can update company bank accounts"
  ON bank_accounts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      JOIN company_subscriptions cs ON cs.company_id = m.company_id
      WHERE m.company_id = bank_accounts.company_id
      AND m.user_id = auth.uid()
      AND m.role IN ('admin', 'owner')
      AND cs.plan_tier IN ('PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships m
      JOIN company_subscriptions cs ON cs.company_id = m.company_id
      WHERE m.company_id = bank_accounts.company_id
      AND m.user_id = auth.uid()
      AND m.role IN ('admin', 'owner')
      AND cs.plan_tier IN ('PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  );

CREATE POLICY "PRO_PLUS+ admins can delete company bank accounts"
  ON bank_accounts FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      JOIN company_subscriptions cs ON cs.company_id = m.company_id
      WHERE m.company_id = bank_accounts.company_id
      AND m.user_id = auth.uid()
      AND m.role IN ('admin', 'owner')
      AND cs.plan_tier IN ('PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  );

-- ============================================================
-- BANK_STATEMENTS
-- ============================================================

DROP POLICY IF EXISTS "Members can view company bank statements" ON bank_statements;
DROP POLICY IF EXISTS "Admins can insert company bank statements" ON bank_statements;
DROP POLICY IF EXISTS "Admins can update company bank statements" ON bank_statements;
DROP POLICY IF EXISTS "Admins can delete company bank statements" ON bank_statements;

CREATE POLICY "PRO_PLUS+ can view company bank statements"
  ON bank_statements FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      JOIN company_subscriptions cs ON cs.company_id = m.company_id
      WHERE m.company_id = bank_statements.company_id
      AND m.user_id = auth.uid()
      AND cs.plan_tier IN ('PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  );

CREATE POLICY "PRO_PLUS+ admins can insert company bank statements"
  ON bank_statements FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships m
      JOIN company_subscriptions cs ON cs.company_id = m.company_id
      WHERE m.company_id = bank_statements.company_id
      AND m.user_id = auth.uid()
      AND m.role IN ('admin', 'owner')
      AND cs.plan_tier IN ('PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  );

CREATE POLICY "PRO_PLUS+ admins can update company bank statements"
  ON bank_statements FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      JOIN company_subscriptions cs ON cs.company_id = m.company_id
      WHERE m.company_id = bank_statements.company_id
      AND m.user_id = auth.uid()
      AND m.role IN ('admin', 'owner')
      AND cs.plan_tier IN ('PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships m
      JOIN company_subscriptions cs ON cs.company_id = m.company_id
      WHERE m.company_id = bank_statements.company_id
      AND m.user_id = auth.uid()
      AND m.role IN ('admin', 'owner')
      AND cs.plan_tier IN ('PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  );

CREATE POLICY "PRO_PLUS+ admins can delete company bank statements"
  ON bank_statements FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      JOIN company_subscriptions cs ON cs.company_id = m.company_id
      WHERE m.company_id = bank_statements.company_id
      AND m.user_id = auth.uid()
      AND m.role IN ('admin', 'owner')
      AND cs.plan_tier IN ('PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  );

-- ============================================================
-- BANK_STATEMENT_LINES
-- ============================================================

DROP POLICY IF EXISTS "Members can view company bank statement lines" ON bank_statement_lines;
DROP POLICY IF EXISTS "Admins can insert company bank statement lines" ON bank_statement_lines;
DROP POLICY IF EXISTS "Admins can update company bank statement lines" ON bank_statement_lines;
DROP POLICY IF EXISTS "Admins can delete company bank statement lines" ON bank_statement_lines;

CREATE POLICY "PRO_PLUS+ can view company bank statement lines"
  ON bank_statement_lines FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      JOIN company_subscriptions cs ON cs.company_id = m.company_id
      WHERE m.company_id = bank_statement_lines.company_id
      AND m.user_id = auth.uid()
      AND cs.plan_tier IN ('PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  );

CREATE POLICY "PRO_PLUS+ admins can insert company bank statement lines"
  ON bank_statement_lines FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships m
      JOIN company_subscriptions cs ON cs.company_id = m.company_id
      WHERE m.company_id = bank_statement_lines.company_id
      AND m.user_id = auth.uid()
      AND m.role IN ('admin', 'owner')
      AND cs.plan_tier IN ('PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  );

CREATE POLICY "PRO_PLUS+ admins can update company bank statement lines"
  ON bank_statement_lines FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      JOIN company_subscriptions cs ON cs.company_id = m.company_id
      WHERE m.company_id = bank_statement_lines.company_id
      AND m.user_id = auth.uid()
      AND m.role IN ('admin', 'owner')
      AND cs.plan_tier IN ('PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships m
      JOIN company_subscriptions cs ON cs.company_id = m.company_id
      WHERE m.company_id = bank_statement_lines.company_id
      AND m.user_id = auth.uid()
      AND m.role IN ('admin', 'owner')
      AND cs.plan_tier IN ('PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  );

CREATE POLICY "PRO_PLUS+ admins can delete company bank statement lines"
  ON bank_statement_lines FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      JOIN company_subscriptions cs ON cs.company_id = m.company_id
      WHERE m.company_id = bank_statement_lines.company_id
      AND m.user_id = auth.uid()
      AND m.role IN ('admin', 'owner')
      AND cs.plan_tier IN ('PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  );

-- ============================================================
-- BANK_RECONCILIATIONS
-- ============================================================

DROP POLICY IF EXISTS "Members can view company bank reconciliations" ON bank_reconciliations;
DROP POLICY IF EXISTS "Admins can insert company bank reconciliations" ON bank_reconciliations;
DROP POLICY IF EXISTS "Admins can update company bank reconciliations" ON bank_reconciliations;
DROP POLICY IF EXISTS "Admins can delete company bank reconciliations" ON bank_reconciliations;

CREATE POLICY "PRO_PLUS+ can view company bank reconciliations"
  ON bank_reconciliations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      JOIN company_subscriptions cs ON cs.company_id = m.company_id
      WHERE m.company_id = bank_reconciliations.company_id
      AND m.user_id = auth.uid()
      AND cs.plan_tier IN ('PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  );

CREATE POLICY "PRO_PLUS+ admins can insert company bank reconciliations"
  ON bank_reconciliations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships m
      JOIN company_subscriptions cs ON cs.company_id = m.company_id
      WHERE m.company_id = bank_reconciliations.company_id
      AND m.user_id = auth.uid()
      AND m.role IN ('admin', 'owner')
      AND cs.plan_tier IN ('PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  );

CREATE POLICY "PRO_PLUS+ admins can update company bank reconciliations"
  ON bank_reconciliations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      JOIN company_subscriptions cs ON cs.company_id = m.company_id
      WHERE m.company_id = bank_reconciliations.company_id
      AND m.user_id = auth.uid()
      AND m.role IN ('admin', 'owner')
      AND cs.plan_tier IN ('PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships m
      JOIN company_subscriptions cs ON cs.company_id = m.company_id
      WHERE m.company_id = bank_reconciliations.company_id
      AND m.user_id = auth.uid()
      AND m.role IN ('admin', 'owner')
      AND cs.plan_tier IN ('PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  );

CREATE POLICY "PRO_PLUS+ admins can delete company bank reconciliations"
  ON bank_reconciliations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      JOIN company_subscriptions cs ON cs.company_id = m.company_id
      WHERE m.company_id = bank_reconciliations.company_id
      AND m.user_id = auth.uid()
      AND m.role IN ('admin', 'owner')
      AND cs.plan_tier IN ('PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  );
