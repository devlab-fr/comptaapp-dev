/*
  # Patch Sécurité Backend — Module Facturation
  
  ## Vue d'ensemble
  Correction de la vulnérabilité critique identifiée lors de l'audit de sécurité.
  Les politiques RLS du module Factures ne vérifiaient que l'appartenance à l'entreprise,
  permettant aux utilisateurs FREE de contourner le frontend et d'utiliser le module gratuitement.
  
  ## Changements appliqués
  Ajout de la vérification du plan d'abonnement dans toutes les politiques d'écriture (INSERT/UPDATE/DELETE)
  pour les tables du module Factures.
  
  ## 1. Tables concernées
    - `factures` — 3 policies modifiées (INSERT, UPDATE, DELETE)
    - `lignes_factures` — 3 policies modifiées (INSERT, UPDATE, DELETE)
    - `invoice_recipients` — 3 policies modifiées (INSERT, UPDATE, DELETE)
    - `clients` — 3 policies modifiées (INSERT, UPDATE, DELETE)
  
  ## 2. Règle produit appliquée
  Les opérations d'écriture sont autorisées uniquement si :
    - L'utilisateur est authentifié
    - L'utilisateur est membre de l'entreprise
    - Le rôle correspond aux règles existantes (owner/admin selon l'opération)
    - **ET le plan de l'entreprise est payant (PRO, PRO_PLUS, PRO_PLUS_PLUS)**
  
  ## 3. Policies SELECT non modifiées
  Les policies de lecture restent inchangées pour permettre aux comptables
  en lecture seule de consulter les factures.
  
  ## 4. Impact sécurité
    - Un utilisateur FREE ne peut plus créer/modifier/supprimer de factures via l'API
    - Un utilisateur PRO/PRO_PLUS/PRO_PLUS_PLUS peut utiliser le module normalement
    - Protection native au niveau base de données, impossible à contourner côté client
    - Aucun changement frontend nécessaire
  
  ## 5. Détails techniques
  Chaque policy d'écriture intègre maintenant une jointure avec `company_subscriptions`
  et vérifie que `plan_tier IN ('PRO', 'PRO_PLUS', 'PRO_PLUS_PLUS')`.
*/

-- ============================================================================
-- TABLE: factures
-- ============================================================================

-- DROP existing write policies
DROP POLICY IF EXISTS "Owners and admins can insert factures" ON factures;
DROP POLICY IF EXISTS "Owners and admins can update factures" ON factures;
DROP POLICY IF EXISTS "Owners can delete factures" ON factures;

-- INSERT: Owners and admins with paid plan
CREATE POLICY "Owners and admins can insert factures"
  ON factures FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      JOIN company_subscriptions ON company_subscriptions.company_id = memberships.company_id
      WHERE memberships.company_id = factures.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
      AND company_subscriptions.plan_tier IN ('PRO', 'PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  );

-- UPDATE: Owners and admins with paid plan
CREATE POLICY "Owners and admins can update factures"
  ON factures FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      JOIN company_subscriptions ON company_subscriptions.company_id = memberships.company_id
      WHERE memberships.company_id = factures.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
      AND company_subscriptions.plan_tier IN ('PRO', 'PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      JOIN company_subscriptions ON company_subscriptions.company_id = memberships.company_id
      WHERE memberships.company_id = factures.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
      AND company_subscriptions.plan_tier IN ('PRO', 'PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  );

-- DELETE: Owners with paid plan
CREATE POLICY "Owners can delete factures"
  ON factures FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      JOIN company_subscriptions ON company_subscriptions.company_id = memberships.company_id
      WHERE memberships.company_id = factures.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role = 'owner'
      AND company_subscriptions.plan_tier IN ('PRO', 'PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  );

-- ============================================================================
-- TABLE: lignes_factures
-- ============================================================================

-- DROP existing write policies
DROP POLICY IF EXISTS "Owners and admins can insert lignes_factures" ON lignes_factures;
DROP POLICY IF EXISTS "Owners and admins can update lignes_factures" ON lignes_factures;
DROP POLICY IF EXISTS "Owners and admins can delete lignes_factures" ON lignes_factures;

-- INSERT: Owners and admins with paid plan
CREATE POLICY "Owners and admins can insert lignes_factures"
  ON lignes_factures FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM factures
      JOIN memberships ON memberships.company_id = factures.company_id
      JOIN company_subscriptions ON company_subscriptions.company_id = memberships.company_id
      WHERE factures.id = lignes_factures.facture_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
      AND company_subscriptions.plan_tier IN ('PRO', 'PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  );

-- UPDATE: Owners and admins with paid plan
CREATE POLICY "Owners and admins can update lignes_factures"
  ON lignes_factures FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM factures
      JOIN memberships ON memberships.company_id = factures.company_id
      JOIN company_subscriptions ON company_subscriptions.company_id = memberships.company_id
      WHERE factures.id = lignes_factures.facture_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
      AND company_subscriptions.plan_tier IN ('PRO', 'PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM factures
      JOIN memberships ON memberships.company_id = factures.company_id
      JOIN company_subscriptions ON company_subscriptions.company_id = memberships.company_id
      WHERE factures.id = lignes_factures.facture_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
      AND company_subscriptions.plan_tier IN ('PRO', 'PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  );

-- DELETE: Owners and admins with paid plan
CREATE POLICY "Owners and admins can delete lignes_factures"
  ON lignes_factures FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM factures
      JOIN memberships ON memberships.company_id = factures.company_id
      JOIN company_subscriptions ON company_subscriptions.company_id = memberships.company_id
      WHERE factures.id = lignes_factures.facture_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
      AND company_subscriptions.plan_tier IN ('PRO', 'PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  );

-- ============================================================================
-- TABLE: invoice_recipients
-- ============================================================================

-- DROP existing write policies
DROP POLICY IF EXISTS "Company members can insert invoice recipients" ON invoice_recipients;
DROP POLICY IF EXISTS "Company members can update invoice recipients" ON invoice_recipients;
DROP POLICY IF EXISTS "Company members can delete invoice recipients" ON invoice_recipients;

-- INSERT: Members with paid plan
CREATE POLICY "Company members can insert invoice recipients"
  ON invoice_recipients FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      JOIN company_subscriptions ON company_subscriptions.company_id = memberships.company_id
      WHERE memberships.company_id = invoice_recipients.company_id
      AND memberships.user_id = auth.uid()
      AND company_subscriptions.plan_tier IN ('PRO', 'PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  );

-- UPDATE: Members with paid plan
CREATE POLICY "Company members can update invoice recipients"
  ON invoice_recipients FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      JOIN company_subscriptions ON company_subscriptions.company_id = memberships.company_id
      WHERE memberships.company_id = invoice_recipients.company_id
      AND memberships.user_id = auth.uid()
      AND company_subscriptions.plan_tier IN ('PRO', 'PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      JOIN company_subscriptions ON company_subscriptions.company_id = memberships.company_id
      WHERE memberships.company_id = invoice_recipients.company_id
      AND memberships.user_id = auth.uid()
      AND company_subscriptions.plan_tier IN ('PRO', 'PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  );

-- DELETE: Members with paid plan
CREATE POLICY "Company members can delete invoice recipients"
  ON invoice_recipients FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      JOIN company_subscriptions ON company_subscriptions.company_id = memberships.company_id
      WHERE memberships.company_id = invoice_recipients.company_id
      AND memberships.user_id = auth.uid()
      AND company_subscriptions.plan_tier IN ('PRO', 'PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  );

-- ============================================================================
-- TABLE: clients
-- ============================================================================

-- DROP existing write policies
DROP POLICY IF EXISTS "Owners and admins can insert clients" ON clients;
DROP POLICY IF EXISTS "Owners and admins can update clients" ON clients;
DROP POLICY IF EXISTS "Owners can delete clients" ON clients;

-- INSERT: Owners and admins with paid plan
CREATE POLICY "Owners and admins can insert clients"
  ON clients FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      JOIN company_subscriptions ON company_subscriptions.company_id = memberships.company_id
      WHERE memberships.company_id = clients.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
      AND company_subscriptions.plan_tier IN ('PRO', 'PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  );

-- UPDATE: Owners and admins with paid plan
CREATE POLICY "Owners and admins can update clients"
  ON clients FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      JOIN company_subscriptions ON company_subscriptions.company_id = memberships.company_id
      WHERE memberships.company_id = clients.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
      AND company_subscriptions.plan_tier IN ('PRO', 'PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      JOIN company_subscriptions ON company_subscriptions.company_id = memberships.company_id
      WHERE memberships.company_id = clients.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
      AND company_subscriptions.plan_tier IN ('PRO', 'PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  );

-- DELETE: Owners with paid plan
CREATE POLICY "Owners can delete clients"
  ON clients FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      JOIN company_subscriptions ON company_subscriptions.company_id = memberships.company_id
      WHERE memberships.company_id = clients.company_id
      AND memberships.user_id = auth.uid()
      AND memberships.role = 'owner'
      AND company_subscriptions.plan_tier IN ('PRO', 'PRO_PLUS', 'PRO_PLUS_PLUS')
    )
  );
