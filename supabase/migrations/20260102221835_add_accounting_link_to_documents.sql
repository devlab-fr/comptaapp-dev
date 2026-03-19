/*
  # Ajout du lien comptable aux documents

  1. Modifications
    - Ajouter `linked_accounting_entry_id` à `expense_documents`
      - Permet de lier une dépense à une écriture comptable
    - Ajouter `linked_accounting_entry_id` à `revenue_documents`
      - Permet de lier un revenu à une écriture comptable
    - Contrainte de foreign key vers `accounting_entries`
    - Index pour performances

  2. Notes importantes
    - Le lien est optionnel (nullable)
    - Une dépense/revenu peut exister sans écriture comptable
    - Une fois lié, l'utilisateur peut voir le statut "Comptabilisé"
    - Pas de cascade DELETE pour préserver la traçabilité
*/

-- Ajouter linked_accounting_entry_id à expense_documents
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expense_documents' AND column_name = 'linked_accounting_entry_id'
  ) THEN
    ALTER TABLE expense_documents 
    ADD COLUMN linked_accounting_entry_id uuid REFERENCES accounting_entries(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Ajouter linked_accounting_entry_id à revenue_documents
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'revenue_documents' AND column_name = 'linked_accounting_entry_id'
  ) THEN
    ALTER TABLE revenue_documents 
    ADD COLUMN linked_accounting_entry_id uuid REFERENCES accounting_entries(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Index pour performances
CREATE INDEX IF NOT EXISTS idx_expense_documents_accounting_entry 
  ON expense_documents(linked_accounting_entry_id) 
  WHERE linked_accounting_entry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_revenue_documents_accounting_entry 
  ON revenue_documents(linked_accounting_entry_id) 
  WHERE linked_accounting_entry_id IS NOT NULL;