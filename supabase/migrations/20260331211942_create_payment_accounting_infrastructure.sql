/*
  # Infrastructure pour écritures de paiement (double écriture)

  1. Objectif
    - Créer le journal BQ (Banque) pour les écritures de paiement
    - Ajouter colonnes payment_entry_id dans revenue_documents et expense_documents
    - Permettre la génération automatique des écritures de règlement (512/411 et 401/512)

  2. Modifications
    - Création du journal BQ si absent
    - Ajout colonne payment_entry_id dans revenue_documents
    - Ajout colonne payment_entry_id dans expense_documents

  3. Sécurité
    - Éviter les doublons de journal
    - Colonnes nullables pour compatibilité avec données existantes
    - Pas de modification des écritures existantes

  4. Notes
    - Les triggers de génération des écritures de paiement seront créés dans une migration séparée
    - Cette migration ne modifie pas les triggers actuels (facturation/achat)
    - Zéro impact sur l'existant
*/

-- 1. Créer le journal BQ (Banque) pour toutes les entreprises existantes
DO $$
DECLARE
  v_company record;
  v_journal_exists boolean;
BEGIN
  FOR v_company IN SELECT id FROM companies LOOP
    -- Vérifier si le journal BQ existe déjà pour cette entreprise
    SELECT EXISTS(
      SELECT 1 FROM journals 
      WHERE company_id = v_company.id 
        AND code = 'BQ'
    ) INTO v_journal_exists;

    -- Créer uniquement si absent
    IF NOT v_journal_exists THEN
      INSERT INTO journals (company_id, code, name, is_active)
      VALUES (v_company.id, 'BQ', 'Banque', true);
    END IF;
  END LOOP;
END $$;

-- 2. Ajouter colonne payment_entry_id dans revenue_documents
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'revenue_documents' AND column_name = 'payment_entry_id'
  ) THEN
    ALTER TABLE revenue_documents 
    ADD COLUMN payment_entry_id uuid REFERENCES accounting_entries(id);
  END IF;
END $$;

-- 3. Ajouter colonne payment_entry_id dans expense_documents
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expense_documents' AND column_name = 'payment_entry_id'
  ) THEN
    ALTER TABLE expense_documents 
    ADD COLUMN payment_entry_id uuid REFERENCES accounting_entries(id);
  END IF;
END $$;

-- 4. Créer un index pour améliorer les performances de recherche
CREATE INDEX IF NOT EXISTS idx_revenue_documents_payment_entry_id 
  ON revenue_documents(payment_entry_id);

CREATE INDEX IF NOT EXISTS idx_expense_documents_payment_entry_id 
  ON expense_documents(payment_entry_id);

-- 5. Commentaires pour documentation
COMMENT ON COLUMN revenue_documents.payment_entry_id IS 'Lien vers l''écriture comptable de paiement (512/411)';
COMMENT ON COLUMN expense_documents.payment_entry_id IS 'Lien vers l''écriture comptable de paiement (401/512)';
